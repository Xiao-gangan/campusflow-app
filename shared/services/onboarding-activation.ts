import type { CampusRepository } from "../data/repository.ts";
import type { MemberActivationError } from "../contracts/auth.ts";
import type { OnboardingInvite } from "../contracts/onboarding.ts";
import type { Member } from "../contracts/domain.ts";
import { recordAuditSafely } from "../auth/audit.ts";
import { canActivateMember } from "../domain/onboarding.ts";

export type OnboardingActivationServiceInput = {
  repository: Pick<
    CampusRepository,
    | "findOnboardingInviteById"
    | "findMemberById"
    | "commitOnboardingActivation"
    | "recordAuditEvent"
  >;
  inviteId: string;
  at: string;
};

export type OnboardingActivationServiceResult =
  | { ok: true; invite: OnboardingInvite; member: Member }
  | { ok: false; error: MemberActivationError };

// The repository method is the single commit point. The in-memory adapter
// validates before mutating; a production adapter must use a DB transaction
// or one conditional update that changes both invite and member atomically.
export async function activateMemberFromOnboarding(
  input: OnboardingActivationServiceInput,
): Promise<OnboardingActivationServiceResult> {
  const invite = await input.repository.findOnboardingInviteById(input.inviteId);
  if (!invite) {
    await recordAuditSafely(input.repository, {
      actorKind: "system",
      actorId: null,
      action: "member.activated",
      targetType: "onboarding_invite",
      targetId: input.inviteId,
      result: "failure",
      metadata: { reason: "invite_not_found" },
    });
    return { ok: false, error: "invite_not_found" };
  }
  if (!canActivateMember(invite)) {
    await recordAuditSafely(input.repository, {
      actorKind: "system",
      actorId: null,
      action: "member.activated",
      targetType: "onboarding_invite",
      targetId: invite.id,
      result: "failure",
      metadata: { reason: "invite_not_completed" },
    });
    return { ok: false, error: "invite_not_completed" };
  }

  if (!invite.memberId) {
    await recordAuditSafely(input.repository, {
      actorKind: "system",
      actorId: null,
      action: "member.activated",
      targetType: "onboarding_invite",
      targetId: invite.id,
      result: "failure",
      metadata: { reason: "member_not_found" },
    });
    return { ok: false, error: "member_not_found" };
  }

  const member = await input.repository.findMemberById(invite.memberId);
  if (!member) return { ok: false, error: "member_not_found" };
  if (member.id !== invite.memberId) {
    return { ok: false, error: "invite_member_mismatch" };
  }
  if (member.status === "active") {
    return { ok: true, invite, member };
  }
  if (member.status !== "pending_onboarding") {
    return { ok: false, error: "member_not_pending" };
  }

  const result = await input.repository.commitOnboardingActivation({
    inviteId: invite.id,
    memberId: member.id,
    at: input.at,
  });

  if (result.ok) {
    await recordAuditSafely(input.repository, {
      actorKind: "system",
      actorId: null,
      action: "member.activated",
      targetType: "member",
      targetId: result.member.id,
      result: "success",
      metadata: { inviteId: result.invite.id },
    });
  } else {
    await recordAuditSafely(input.repository, {
      actorKind: "system",
      actorId: null,
      action: "member.activated",
      targetType: "onboarding_invite",
      targetId: invite.id,
      result: "failure",
      metadata: { reason: result.error },
    });
  }

  return result;
}
