import {
  anonymousActor,
  type Actor,
  type ActorResolver,
} from "../api/actor.ts";
import type { CampusRepository } from "../data/repository.ts";
import { isTerminalStatus } from "../domain/onboarding.ts";
import { hashToken } from "../security/tokens.ts";

export type ActorResolverRepository = Pick<
  CampusRepository,
  | "findMemberSessionByTokenHash"
  | "findMemberById"
  | "findOnboardingInviteByTokenHash"
>;

export type CreateActorResolverOptions = {
  repository: ActorResolverRepository;
  now?: () => Date;
  sessionCookieName?: string;
  onboardingCookieName?: string;
};

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const matched = header?.match(/^Bearer\s+(.+)$/i);
  return matched?.[1]?.trim() || null;
}

function headerToken(request: Request, name: string): string | null {
  return request.headers.get(name)?.trim() || null;
}

function cookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName !== name) continue;
    const rawValue = rest.join("=");
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

export function getSessionToken(request: Request): string | null {
  return (
    headerToken(request, "x-session-token") ??
    bearerToken(request) ??
    cookieValue(request, "campusflow_session")
  );
}

// Local app sessions keep members independent from external identity accounts. Candidate
// onboarding links use a separate token and never grant member permissions.
export function createActorResolver(
  options: CreateActorResolverOptions,
): ActorResolver {
  const sessionCookieName = options.sessionCookieName ?? "campusflow_session";
  const onboardingCookieName =
    options.onboardingCookieName ?? "campusflow_onboarding";
  const now = options.now ?? (() => new Date());

  return async (request: Request): Promise<Actor> => {
    const nowMs = now().getTime();
    const sessionToken =
      getSessionToken(request) ?? cookieValue(request, sessionCookieName);

    if (sessionToken) {
      const session = await options.repository.findMemberSessionByTokenHash(
        await hashToken(sessionToken),
      );
      if (
        session &&
        !session.revokedAt &&
        Date.parse(session.expiresAt) > nowMs
      ) {
        const member = await options.repository.findMemberById(
          session.memberId,
        );
        if (member) {
          return {
            kind: "member",
            memberId: member.id,
            role: member.role,
            memberStatus: member.status,
          };
        }
      }
    }

    const onboardingToken =
      headerToken(request, "x-onboarding-token") ??
      cookieValue(request, onboardingCookieName) ??
      bearerToken(request);

    if (onboardingToken) {
      const invite =
        await options.repository.findOnboardingInviteByTokenHash(
          await hashToken(onboardingToken),
        );
      if (
        invite &&
        !invite.revokedAt &&
        Date.parse(invite.expiresAt) > nowMs &&
        !isTerminalStatus(invite.status)
      ) {
        return {
          kind: "candidate",
          applicantId: invite.applicantId,
          onboardingInviteId: invite.id,
        };
      }
    }

    return anonymousActor;
  };
}
