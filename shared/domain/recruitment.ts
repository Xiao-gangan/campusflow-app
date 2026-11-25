import type { Applicant, ApplicantStatus } from "../contracts/domain.ts";
import type { RsvpToken } from "../contracts/recruitment.ts";

export function isRsvpOpen(token: RsvpToken, at: string): boolean {
  if (token.revokedAt) return false;

  const expiresAt = Date.parse(token.expiresAt);
  const now = Date.parse(at);
  if (Number.isNaN(expiresAt) || Number.isNaN(now)) return false;

  return now < expiresAt;
}

export function canCreateOnboardingInvite(applicant: Applicant): boolean {
  return applicant.status === "accepted";
}

// RSVP only describes interview attendance. It must never mutate the
// applicant's recruitment status.
export function applicantStatusAfterRsvp(
  applicant: Applicant,
): ApplicantStatus {
  return applicant.status;
}
