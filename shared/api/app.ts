import { ApiError, success } from "./errors.ts";
import { requireMember } from "./actor.ts";
import type { ActorResolver } from "./actor.ts";
import {
  parsePagination,
  readJsonBody,
  requireString,
  requireUuid,
} from "./validation.ts";
import type { CampusRepository } from "../data/repository.ts";
import { bootstrapAdmin } from "../auth/admin-bootstrap.ts";
import { getSessionToken } from "../auth/actor-resolver.ts";
import { recordAuditSafely } from "../auth/audit.ts";
import { requireSameOriginForCookieAuth } from "../auth/csrf.ts";
import { requirePermission } from "../auth/permissions.ts";
import {
  createMemoryRateLimiter,
  requestRateLimitKey,
  type RateLimiter,
} from "../security/rate-limit.ts";
import { hashToken } from "../security/tokens.ts";
import { toManagerAvailability } from "../domain/availability.ts";
import {
  isTerminalStatus,
  toOnboardingView,
} from "../domain/onboarding.ts";
import { ApiRouter } from "./router.ts";

export type CreateApiAppOptions = {
  repository: CampusRepository;
  resolveActor: ActorResolver;
  now?: () => Date;
  allowedOrigins?: string[];
  rateLimiter?: RateLimiter;
  bootstrap?: {
    token: string;
    sessionTtlMinutes?: number;
  };
};

export type ApiApp = {
  router: ApiRouter;
  handle(request: Request): Promise<Response>;
};

export function createApiApp(options: CreateApiAppOptions): ApiApp {
  const router = new ApiRouter();
  const deps = {
    repository: options.repository,
    resolveActor: options.resolveActor,
    now: options.now ?? (() => new Date()),
  };
  const bootstrapLimiter =
    options.rateLimiter ??
    createMemoryRateLimiter({ windowMs: 15 * 60_000, maxAttempts: 10 });

  router.get(
    "/api/v1/health",
    () =>
      success({
        ok: true,
        service: "campusflow",
        apiVersion: "v1",
      }),
    { public: true },
  );

  router.post(
    "/api/v1/bootstrap/admin",
    async ({ request, deps: context }) => {
      if (!options.bootstrap?.token) {
        await recordAuditSafely(context.repository, {
          actorKind: "anonymous",
          actorId: null,
          action: "admin.bootstrap",
          targetType: "admin_bootstrap",
          targetId: null,
          result: "failure",
          metadata: { reason: "bootstrap_not_configured" },
        });
        throw new ApiError("bootstrap_not_configured");
      }

      const limit = bootstrapLimiter.check(
        requestRateLimitKey(request),
        context.now().getTime(),
      );
      if (!limit.allowed) {
        await recordAuditSafely(context.repository, {
          actorKind: "anonymous",
          actorId: null,
          action: "admin.bootstrap",
          targetType: "admin_bootstrap",
          targetId: null,
          result: "denied",
          metadata: { reason: "rate_limited" },
        });
        throw new ApiError("rate_limited", 429, {
          retryAfterSeconds: limit.retryAfterSeconds,
        });
      }

      const body = await readJsonBody(request);
      const providedToken = requireString(body.token, "token", {
        minLength: 16,
        maxLength: 200,
      });
      const name = requireString(body.name, "name", { maxLength: 80 });
      const email = requireString(body.email, "email", { maxLength: 200 });
      if (!email.includes("@")) {
        throw new ApiError("invalid_request", 400, {
          field: "email",
          reason: "email_required",
        });
      }

      const result = await bootstrapAdmin({
        repository: context.repository,
        expectedToken: options.bootstrap.token,
        providedToken,
        name,
        email,
        now: context.now(),
        sessionTtlMinutes: options.bootstrap.sessionTtlMinutes ?? 60 * 24 * 7,
      });

      if (!result.ok) {
        await recordAuditSafely(context.repository, {
          actorKind: "anonymous",
          actorId: null,
          action: "admin.bootstrap",
          targetType: "admin_bootstrap",
          targetId: null,
          result:
            result.error === "invalid_bootstrap_token" ? "denied" : "failure",
          metadata: { reason: result.error },
        });
        throw new ApiError(
          result.error === "invalid_bootstrap_token"
            ? "invalid_bootstrap_token"
            : "admin_already_initialized",
        );
      }

      await recordAuditSafely(context.repository, {
        actorKind: "system",
        actorId: null,
        action: "admin.bootstrap",
        targetType: "member",
        targetId: result.member.id,
        result: "success",
        metadata: { sessionIssued: true },
      });
      await recordAuditSafely(context.repository, {
        actorKind: "member",
        actorId: result.member.id,
        action: "auth.login",
        targetType: "member",
        targetId: result.member.id,
        result: "success",
        metadata: { method: "bootstrap" },
      });

      return success(
        {
          member: result.member,
          sessionToken: result.sessionToken,
          expiresAt: result.expiresAt,
        },
        201,
      );
    },
    { public: true },
  );

  router.post(
    "/api/v1/auth/logout",
    async ({ request, actor, deps: context }) => {
      const memberActor = requireMember(actor);
      requireSameOriginForCookieAuth(request, options.allowedOrigins ?? []);

      const sessionToken = getSessionToken(request);
      if (!sessionToken) {
        throw new ApiError("invalid_request", 400, {
          reason: "session_required",
        });
      }

      const revoked = await context.repository.revokeMemberSessionByTokenHash(
        await hashToken(sessionToken),
        context.now().toISOString(),
      );

      await recordAuditSafely(context.repository, {
        actorKind: "member",
        actorId: memberActor.memberId,
        action: "auth.logout",
        targetType: "member",
        targetId: memberActor.memberId,
        result: "success",
        metadata: { revoked },
      });

      return success({ revoked });
    },
  );

  router.post(
    "/api/v1/members/:id/sessions/revoke",
    async ({ actor, params, deps: context }) => {
      const admin = requirePermission(actor, "members.manage");
      const memberId = requireUuid(params.id, "memberId");
      const member = await context.repository.findMemberById(memberId);
      if (!member) throw new ApiError("not_found");

      const revokedSessions =
        await context.repository.revokeMemberSessionsForMember(
          memberId,
          context.now().toISOString(),
        );

      await recordAuditSafely(context.repository, {
        actorKind: "member",
        actorId: admin.memberId,
        action: "auth.session_revoked",
        targetType: "member",
        targetId: memberId,
        result: "success",
        metadata: { revokedSessions },
      });

      return success({ revokedSessions });
    },
  );

  router.get("/api/v1/me", async ({ actor, deps: context }) => {
    const memberActor = requireMember(actor);
    const member = await context.repository.findMemberById(
      memberActor.memberId,
    );
    if (!member) throw new ApiError("unauthorized");
    return success(member);
  });

  router.get("/api/v1/members", async ({ actor, deps: context }) => {
    requirePermission(actor, "members.read");
    return success(await context.repository.listMembers());
  });

  router.get("/api/v1/audit-events", async ({ actor, url, deps: context }) => {
    requirePermission(actor, "audit.read");
    const { limit, offset } = parsePagination(url);
    const { items, total } = await context.repository.listAuditEvents({
      limit,
      offset,
    });
    const nextOffset =
      offset + items.length < total ? offset + items.length : null;
    return success({ items, total, nextOffset });
  });

  router.get("/api/v1/departments", async ({ actor, deps: context }) => {
    requirePermission(actor, "directory.read");
    return success(await context.repository.listDepartments());
  });

  router.get("/api/v1/terms", async ({ actor, deps: context }) => {
    requirePermission(actor, "directory.read");
    return success(await context.repository.listTerms());
  });

  router.get(
    "/api/v1/onboarding/invites/:id",
    async ({ actor, params, deps: context }) => {
      const inviteId = requireUuid(params.id, "inviteId");
      const invite =
        await context.repository.findOnboardingInviteById(inviteId);
      if (!invite) throw new ApiError("onboarding_not_found");

      if (actor.kind === "candidate") {
        if (invite.revokedAt) {
          throw new ApiError("onboarding_revoked");
        }
        if (Date.parse(invite.expiresAt) <= context.now().getTime()) {
          throw new ApiError("onboarding_expired");
        }
        if (isTerminalStatus(invite.status)) {
          throw new ApiError("onboarding_not_found");
        }
        if (
          actor.onboardingInviteId !== invite.id ||
          actor.applicantId !== invite.applicantId
        ) {
          throw new ApiError("forbidden");
        }
      } else if (actor.kind === "member") {
        requirePermission(actor, "onboarding.read");
      } else {
        throw new ApiError("forbidden");
      }

      return success(toOnboardingView(invite));
    },
  );

  router.get(
    "/api/v1/members/:id/availability",
    async ({ actor, params, url, deps: context }) => {
      requirePermission(actor, "members.availability.read");
      const memberId = requireUuid(params.id, "memberId");
      const termId = requireUuid(
        url.searchParams.get("termId") ?? undefined,
        "termId",
      );

      const member = await context.repository.findMemberById(memberId);
      if (!member) throw new ApiError("not_found");

      const [courses, confirmation] = await Promise.all([
        context.repository.listCoursesForMember(memberId, termId),
        context.repository.findTimetableConfirmation(memberId, termId),
      ]);

      return success(
        toManagerAvailability(member, termId, courses, confirmation),
      );
    },
  );

  return {
    router,
    handle: (request: Request) => router.handle(request, deps),
  };
}
