import type { Member } from "./domain.ts";
import type { OnboardingInvite } from "./onboarding.ts";

export type MemberSession = {
  id: string;
  memberId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

export type AdminBootstrapInput = {
  name: string;
  email: string;
  sessionTokenHash: string;
  sessionExpiresAt: string;
  createdAt: string;
};

export type AdminBootstrapRepositoryResult =
  | { ok: true; member: Member }
  | { ok: false; error: "admin_exists" };

export type MemberActivationInput = {
  inviteId: string;
  memberId: string;
  at: string;
};

export type MemberActivationError =
  | "invite_not_found"
  | "member_not_found"
  | "invite_member_mismatch"
  | "invite_not_completed"
  | "member_not_pending";

export type MemberActivationRepositoryResult =
  | { ok: true; invite: OnboardingInvite; member: Member }
  | { ok: false; error: MemberActivationError };
