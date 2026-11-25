import type { InterviewRoundKind, InviteActivities } from "./interview-rounds.ts";
import type { DesignDocument } from "./design.ts";
import type { InterviewRsvpStatus } from "./interview.ts";

export type CandidateInvite = {
  document: DesignDocument;
  context: Record<string, string>;
  expiresAt: string;
  respondedAt: string | null;
  rsvpStatus: InterviewRsvpStatus;
  version: number;
  roundKind?: InterviewRoundKind;
  activities?: InviteActivities;
};
