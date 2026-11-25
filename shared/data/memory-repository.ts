import type { AuditEvent } from "../contracts/audit.ts";
import type { MemberSession } from "../contracts/auth.ts";
import type { Department, Member, Term } from "../contracts/domain.ts";
import type { OnboardingInvite } from "../contracts/onboarding.ts";
import type { Course, TimetableConfirmation } from "../contracts/scheduling.ts";
import {
  revokeOnboardingInvite as revokeInviteDomain,
  rotateOnboardingToken,
} from "../domain/onboarding.ts";
import { redactAuditMetadata } from "../security/audit.ts";
import type { CampusRepository } from "./repository.ts";

export type MemoryRepositorySeed = {
  members?: Member[];
  departments?: Department[];
  terms?: Term[];
  onboardingInvites?: OnboardingInvite[];
  courses?: Course[];
  timetableConfirmations?: TimetableConfirmation[];
  memberSessions?: MemberSession[];
  auditEvents?: AuditEvent[];
};

export function createMemoryRepository(
  seed: MemoryRepositorySeed = {},
): CampusRepository {
  const members = [...(seed.members ?? [])];
  const departments = [...(seed.departments ?? [])];
  const terms = [...(seed.terms ?? [])];
  const onboardingInvites = [...(seed.onboardingInvites ?? [])];
  const courses = [...(seed.courses ?? [])];
  const timetableConfirmations = [...(seed.timetableConfirmations ?? [])];
  const memberSessions = [...(seed.memberSessions ?? [])];
  const auditEvents = [...(seed.auditEvents ?? [])];

  return {
    async listMembers() {
      return members.map((member) => ({ ...member }));
    },

    async findMemberById(id) {
      const member = members.find((item) => item.id === id);
      return member ? { ...member } : null;
    },

    async listDepartments() {
      return departments.map((department) => ({ ...department }));
    },

    async listTerms() {
      return terms.map((term) => ({ ...term }));
    },

    async findOnboardingInviteById(id) {
      const invite = onboardingInvites.find((item) => item.id === id);
      return invite ? { ...invite } : null;
    },

    async findOnboardingInviteByTokenHash(tokenHash) {
      const invite = onboardingInvites.find(
        (item) => item.tokenHash === tokenHash,
      );
      return invite ? { ...invite } : null;
    },

    async listCoursesForMember(memberId, termId) {
      return courses
        .filter(
          (course) =>
            course.memberId === memberId && course.termId === termId,
        )
        .map((course) => ({ ...course }));
    },

    async findTimetableConfirmation(memberId, termId) {
      const confirmation = timetableConfirmations.find(
        (item) => item.memberId === memberId && item.termId === termId,
      );
      return confirmation ? { ...confirmation } : null;
    },

    async hasAdmin() {
      return members.some((member) => member.role === "admin");
    },

    async createInitialAdmin(input) {
      if (members.some((member) => member.role === "admin")) {
        return { ok: false, error: "admin_exists" };
      }

      const member: Member = {
        id: crypto.randomUUID(),
        userId: null,
        name: input.name,
        email: input.email,
        role: "admin",
        departmentId: null,
        status: "active",
        activatedAt: input.createdAt,
        createdAt: input.createdAt,
      };
      members.push(member);

      memberSessions.push({
        id: crypto.randomUUID(),
        memberId: member.id,
        tokenHash: input.sessionTokenHash,
        expiresAt: input.sessionExpiresAt,
        revokedAt: null,
        createdAt: input.createdAt,
      });

      return { ok: true, member: { ...member } };
    },

    async findMemberSessionByTokenHash(tokenHash) {
      const session = memberSessions.find(
        (item) => item.tokenHash === tokenHash,
      );
      return session ? { ...session } : null;
    },

    async createMemberSession(input) {
      const session: MemberSession = {
        id: crypto.randomUUID(),
        memberId: input.memberId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
        createdAt: input.createdAt,
      };
      memberSessions.push(session);
      return { ...session };
    },

    async revokeMemberSessionByTokenHash(tokenHash, at) {
      const session = memberSessions.find(
        (item) => item.tokenHash === tokenHash,
      );
      if (!session || session.revokedAt) return false;
      session.revokedAt = at;
      return true;
    },

    async revokeMemberSessionsForMember(memberId, at) {
      let revoked = 0;
      for (const session of memberSessions) {
        if (session.memberId === memberId && !session.revokedAt) {
          session.revokedAt = at;
          revoked += 1;
        }
      }
      return revoked;
    },

    async commitOnboardingActivation(input) {
      // In-memory validation happens before any mutation. The production
      // adapter must replace this with a DB transaction or conditional update.
      const invite = onboardingInvites.find((item) => item.id === input.inviteId);
      if (!invite) return { ok: false, error: "invite_not_found" };
      if (invite.memberId !== input.memberId) {
        return { ok: false, error: "invite_member_mismatch" };
      }
      if (invite.status !== "completed") {
        return { ok: false, error: "invite_not_completed" };
      }

      const member = members.find((item) => item.id === input.memberId);
      if (!member) return { ok: false, error: "member_not_found" };
      if (member.status === "active") {
        return { ok: true, invite: { ...invite }, member: { ...member } };
      }
      if (member.status !== "pending_onboarding") {
        return { ok: false, error: "member_not_pending" };
      }

      member.status = "active";
      member.activatedAt = input.at;
      invite.updatedAt = input.at;

      return { ok: true, invite: { ...invite }, member: { ...member } };
    },

    async revokeOnboardingInvite({ inviteId, at }) {
      const index = onboardingInvites.findIndex((item) => item.id === inviteId);
      if (index < 0) return { ok: false, error: "invite_not_found" };

      const result = revokeInviteDomain(onboardingInvites[index], at);
      if (!result.ok) {
        const error =
          result.error === "invalid_timestamp" ||
          result.error === "terminal_status" ||
          result.error === "invite_expired"
            ? result.error
            : "terminal_status";
        return { ok: false, error };
      }

      onboardingInvites[index] = result.invite;
      return { ok: true, invite: { ...result.invite } };
    },

    async rotateOnboardingInviteToken({ inviteId, newTokenHash, at }) {
      const index = onboardingInvites.findIndex((item) => item.id === inviteId);
      if (index < 0) return { ok: false, error: "invite_not_found" };

      const result = rotateOnboardingToken(
        onboardingInvites[index],
        newTokenHash,
        at,
      );
      if (!result.ok) return result;

      onboardingInvites[index] = result.invite;
      return { ok: true, invite: { ...result.invite } };
    },

    async recordAuditEvent(input) {
      const event: AuditEvent = {
        ...input,
        id: crypto.randomUUID(),
        metadata: redactAuditMetadata(input.metadata),
        createdAt: input.createdAt ?? new Date().toISOString(),
      };
      auditEvents.push(event);
      return { ...event, metadata: { ...event.metadata } };
    },

    async listAuditEvents({ limit, offset }) {
      const sorted = [...auditEvents].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
      return {
        items: sorted
          .slice(offset, offset + limit)
          .map((event) => ({ ...event, metadata: { ...event.metadata } })),
        total: sorted.length,
      };
    },
  };
}
