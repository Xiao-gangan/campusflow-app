export const INTERVIEW_INVITATION_STATUSES = [
  "draft",
  "ready",
  "sent",
  "revoked",
  "expired",
] as const;
export type InterviewInvitationStatus =
  (typeof INTERVIEW_INVITATION_STATUSES)[number];

export const INTERVIEW_RSVP_STATUSES = [
  "pending",
  "confirmed",
  "reschedule_requested",
  "cancelled",
] as const;
export type InterviewRsvpStatus =
  (typeof INTERVIEW_RSVP_STATUSES)[number];

// Interview invitations and onboarding invitations are deliberately separate
// records. An interview RSVP never creates or activates a member.
export type InterviewInvitation = {
  id: string;
  applicantId: string;
  tokenHash: string;
  status: InterviewInvitationStatus;
  rsvpStatus: InterviewRsvpStatus;
  version: number;
  expiresAt: string;
  revokedAt: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  interviewDate: string;
  startTime: string;
  endTime: string | null;
  location: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InterviewInvitationView = Omit<InterviewInvitation, "tokenHash">;

export type InterviewRsvpResult = {
  rsvpStatus: InterviewRsvpStatus;
  respondedAt: string;
};
