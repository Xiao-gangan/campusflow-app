import type { OnboardingLifecycleResult } from "../contracts/onboarding.ts";

export interface OnboardingLifecycleRepository {
  revokeOnboardingInvite(input: {
    inviteId: string;
    at: string;
  }): Promise<OnboardingLifecycleResult>;
  rotateOnboardingInviteToken(input: {
    inviteId: string;
    newTokenHash: string;
    at: string;
  }): Promise<OnboardingLifecycleResult>;
}
