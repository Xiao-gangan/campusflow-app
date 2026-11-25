import {
  ONBOARDING_TERMINAL_STATUSES,
  type OnboardingInvite,
  type OnboardingProgress,
  type OnboardingStatus,
  type OnboardingTerminalStatus,
  type OnboardingView,
} from "../contracts/onboarding.ts";

export const ONBOARDING_TRANSITIONS: Record<
  OnboardingStatus,
  readonly OnboardingStatus[]
> = {
  invited: ["accepted", "expired", "revoked"],
  accepted: ["profile_completed", "expired", "revoked"],
  profile_completed: ["timetable_confirmed", "expired", "revoked"],
  timetable_confirmed: ["account_activated", "expired", "revoked"],
  account_activated: ["completed", "expired", "revoked"],
  completed: [],
  expired: [],
  revoked: [],
};

export type OnboardingRuleError =
  | "invalid_timestamp"
  | "terminal_status"
  | "invite_expired"
  | "invalid_transition"
  | "profile_incomplete"
  | "timetable_unconfirmed"
  | "account_not_activated"
  | "completion_requirements_unmet";

export type OnboardingTransitionResult =
  | { ok: true; invite: OnboardingInvite }
  | { ok: false; error: OnboardingRuleError };

const NEXT_STEP: Record<OnboardingStatus, OnboardingStatus | null> = {
  invited: "accepted",
  accepted: "profile_completed",
  profile_completed: "timetable_confirmed",
  timetable_confirmed: "account_activated",
  account_activated: "completed",
  completed: null,
  expired: null,
  revoked: null,
};

export function isTerminalStatus(
  status: OnboardingStatus,
): status is OnboardingTerminalStatus {
  return (ONBOARDING_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function canTransition(
  from: OnboardingStatus,
  to: OnboardingStatus,
): boolean {
  return ONBOARDING_TRANSITIONS[from].includes(to);
}

export function transitionOnboarding(
  invite: OnboardingInvite,
  next: OnboardingStatus,
  at: string,
): OnboardingTransitionResult {
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) {
    return { ok: false, error: "invalid_timestamp" };
  }

  if (isTerminalStatus(invite.status)) {
    return { ok: false, error: "terminal_status" };
  }

  if (next !== "expired" && Date.parse(invite.expiresAt) <= atMs) {
    return { ok: false, error: "invite_expired" };
  }

  if (!canTransition(invite.status, next)) {
    return { ok: false, error: "invalid_transition" };
  }

  if (next === "timetable_confirmed" && !invite.profileCompletedAt) {
    return { ok: false, error: "profile_incomplete" };
  }

  if (next === "account_activated" && !invite.timetableConfirmedAt) {
    return { ok: false, error: "timetable_unconfirmed" };
  }

  if (next === "completed") {
    if (!invite.accountActivatedAt) {
      return { ok: false, error: "account_not_activated" };
    }
    if (
      !invite.acceptedAt ||
      !invite.profileCompletedAt ||
      !invite.timetableConfirmedAt
    ) {
      return { ok: false, error: "completion_requirements_unmet" };
    }
  }

  const patch: Partial<OnboardingInvite> = {
    status: next,
    version: (invite.version ?? 0) + 1,
    updatedAt: at,
  };

  if (next === "accepted") patch.acceptedAt = at;
  if (next === "profile_completed") patch.profileCompletedAt = at;
  if (next === "timetable_confirmed") patch.timetableConfirmedAt = at;
  if (next === "account_activated") patch.accountActivatedAt = at;
  if (next === "completed") patch.completedAt = at;
  if (next === "revoked") patch.revokedAt = at;

  return { ok: true, invite: { ...invite, ...patch } };
}

export function canActivateMember(invite: OnboardingInvite): boolean {
  return (
    invite.status === "completed" &&
    Boolean(invite.acceptedAt) &&
    Boolean(invite.profileCompletedAt) &&
    Boolean(invite.timetableConfirmedAt) &&
    Boolean(invite.accountActivatedAt) &&
    Boolean(invite.completedAt)
  );
}

export function memberActivationPatch(
  invite: OnboardingInvite,
  at: string,
): { status: "active"; activatedAt: string } | null {
  if (!canActivateMember(invite)) return null;
  return { status: "active", activatedAt: at };
}

export function onboardingProgress(
  invite: OnboardingInvite,
): OnboardingProgress {
  const completedSteps = [
    invite.acceptedAt,
    invite.profileCompletedAt,
    invite.timetableConfirmedAt,
    invite.accountActivatedAt,
    invite.completedAt,
  ].filter(Boolean).length;
  const totalSteps = 5;
  const nextStep = NEXT_STEP[invite.status];

  return {
    status: invite.status,
    completedSteps,
    totalSteps,
    percent: Math.round((completedSteps / totalSteps) * 100),
    nextStep,
    canActivateMember: canActivateMember(invite),
  };
}

export function toOnboardingView(invite: OnboardingInvite): OnboardingView {
  const { tokenHash: _tokenHash, ...view } = invite;
  return view;
}

export type OnboardingTokenRotationError =
  | "invalid_timestamp"
  | "terminal_status"
  | "invite_expired";

export type OnboardingTokenRotationResult =
  | { ok: true; invite: OnboardingInvite }
  | { ok: false; error: OnboardingTokenRotationError };

export function rotateOnboardingToken(
  invite: OnboardingInvite,
  newTokenHash: string,
  at: string,
): OnboardingTokenRotationResult {
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) {
    return { ok: false, error: "invalid_timestamp" };
  }
  if (isTerminalStatus(invite.status)) {
    return { ok: false, error: "terminal_status" };
  }
  if (Date.parse(invite.expiresAt) <= atMs) {
    return { ok: false, error: "invite_expired" };
  }

  return {
    ok: true,
    invite: {
      ...invite,
      tokenHash: newTokenHash,
      version: (invite.version ?? 0) + 1,
      updatedAt: at,
    },
  };
}

export function revokeOnboardingInvite(
  invite: OnboardingInvite,
  at: string,
): OnboardingTransitionResult {
  return transitionOnboarding(invite, "revoked", at);
}

export type AsyncInviteResultCheck = {
  version: number;
  status: OnboardingStatus;
};

export function canApplyAsyncInviteResult(
  invite: OnboardingInvite,
  expected: AsyncInviteResultCheck,
  at: string,
): boolean {
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) return false;
  if (isTerminalStatus(invite.status)) return false;
  if (invite.revokedAt) return false;
  if (Date.parse(invite.expiresAt) <= atMs) return false;
  return invite.version === expected.version && invite.status === expected.status;
}
