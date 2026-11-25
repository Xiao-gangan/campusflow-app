import type { MemberStatus, Role } from "../contracts/domain.ts";
import { ApiError } from "./errors.ts";

export type MemberActor = {
  kind: "member";
  memberId: string;
  role: Role;
  memberStatus: MemberStatus;
};

export type CandidateActor = {
  kind: "candidate";
  applicantId: string;
  onboardingInviteId: string;
};

export type DemoActor = {
  kind: "demo";
  demoSessionId: string;
};

export type AnonymousActor = {
  kind: "anonymous";
};

export type Actor =
  | MemberActor
  | CandidateActor
  | DemoActor
  | AnonymousActor;

// Authentication is injected so real members, onboarding candidates and
// Judge demo sessions can coexist without requiring external accounts.
export type ActorResolver = (request: Request) => Promise<Actor> | Actor;

export const anonymousActor: Actor = { kind: "anonymous" };

export function requireMember(actor: Actor): MemberActor {
  if (actor.kind !== "member") {
    throw new ApiError("unauthorized");
  }
  return actor;
}

export function requireActiveMember(actor: Actor): MemberActor {
  const member = requireMember(actor);
  if (member.memberStatus !== "active") {
    throw new ApiError("member_not_active");
  }
  return member;
}

export function requireRole(
  actor: Actor,
  allowedRoles: readonly Role[],
): MemberActor {
  const member = requireActiveMember(actor);
  if (!allowedRoles.includes(member.role)) {
    throw new ApiError("forbidden", 403, { allowedRoles });
  }
  return member;
}

export function requireCandidate(actor: Actor): CandidateActor {
  if (actor.kind !== "candidate") {
    throw new ApiError("forbidden");
  }
  return actor;
}

export function requireDemo(actor: Actor): DemoActor {
  if (actor.kind !== "demo") {
    throw new ApiError("forbidden");
  }
  return actor;
}
