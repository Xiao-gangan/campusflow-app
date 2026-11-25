export const ONBOARDING_STEPS = [
  "accepted",
  "profile_completed",
  "timetable_confirmed",
  "account_activated",
  "completed",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STATUSES = [
  "invited",
  ...ONBOARDING_STEPS,
  "expired",
  "revoked",
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const ONBOARDING_TERMINAL_STATUSES = [
  "completed",
  "expired",
  "revoked",
] as const;
export type OnboardingTerminalStatus =
  (typeof ONBOARDING_TERMINAL_STATUSES)[number];

export type OnboardingActorKind = "candidate" | "admin" | "system";

export type OnboardingInvite = {
  id: string;
  applicantId: string;
  memberId: string | null;
  tokenHash: string;
  status: OnboardingStatus;
  version: number;
  expiresAt: string;
  revokedAt: string | null;
  acceptedAt: string | null;
  profileCompletedAt: string | null;
  timetableConfirmedAt: string | null;
  accountActivatedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OnboardingView = Omit<OnboardingInvite, "tokenHash">;

export type OnboardingEvent = {
  id: string;
  inviteId: string;
  step: OnboardingStatus;
  actorKind: OnboardingActorKind;
  note: string | null;
  createdAt: string;
};

export type OnboardingLifecycleError =
  | "invite_not_found"
  | "invalid_timestamp"
  | "terminal_status"
  | "invite_expired";

export type OnboardingLifecycleResult =
  | { ok: true; invite: OnboardingInvite }
  | { ok: false; error: OnboardingLifecycleError };

export type OnboardingProgress = {
  status: OnboardingStatus;
  completedSteps: number;
  totalSteps: number;
  percent: number;
  nextStep: OnboardingStatus | null;
  canActivateMember: boolean;
};
