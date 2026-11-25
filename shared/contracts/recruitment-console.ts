import type { RoundProgress, RoundReview } from "./interview-rounds.ts";
import type { ApplicantStatus } from "./domain.ts";
import type { DesignDocument } from "./design.ts";
import type {
  EmailBatch,
  EmailDelivery,
  EmailDeliveryStatus,
} from "./email.ts";
import type {
  InterviewInvitationStatus,
  InterviewRsvpStatus,
} from "./interview.ts";

export type DemoCandidate = {
  id: string;
  cycle: string;
  roundId: string;
  name: string;
  email: string;
  department: string;
  stage: ApplicantStatus;
  note: string;
  interviewDate: string;
  startTime: string;
  endTime: string;
  location: string;
  createdAt: string;
  updatedAt: string;
};

export type CandidateInviteSummary = {
  id: string;
  status: InterviewInvitationStatus;
  rsvpStatus: InterviewRsvpStatus;
  expiresAt: string;
  respondedAt: string | null;
  version: number;
  valid: boolean;
  revokedAt: string | null;
};

export type CandidateDeliverySummary = {
  batchId: string;
  status: EmailDeliveryStatus;
  subject: string;
  sentAt: string | null;
  retryable: boolean;
  errorMessage: string | null;
  rsvpUrl: string | null;
};

export type RoundDelivery = { status: "sent" | "failed"; sentAt: string | null };

export type RosterCandidate = DemoCandidate & {
  progress: RoundProgress;
  completedByRound: Record<string, { form: boolean; mbti: boolean }>;
  deliveryByRound: Record<string, RoundDelivery>;
  review: Pick<RoundReview, "rating" | "decision"> | null;
  latestInvite: CandidateInviteSummary | null;
  latestDelivery: CandidateDeliverySummary | null;
};

export type CandidateInput = {
  name: string;
  email: string;
  department: string;
  stage: ApplicantStatus;
  note?: string;
  interviewDate?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
};

export type CandidateImportRow = {
  row: number;
  name: string;
  email: string;
  department: string;
  stage: string;
  valid: boolean;
  duplicate: boolean;
  issues: string[];
  input: CandidateInput | null;
};

export type CandidateImportPreview = {
  cycle: string;
  rows: CandidateImportRow[];
  validCount: number;
  errorCount: number;
  duplicateCount: number;
};

export type CandidateImportResult = CandidateImportPreview & {
  created: DemoCandidate[];
  skipped: { row: number; email: string; reason: string }[];
};

export type MailPreviewItem = {
  candidateId: string;
  name: string;
  email: string;
  eligible: boolean;
  issues: string[];
  subject: string;
  html: string;
  text: string;
  missingVariables: string[];
  warnings: string[];
};

export type MailPreviewResult = {
  items: MailPreviewItem[];
  eligible: number;
  excluded: number;
};

export type MailInviteLinkStatus = "valid" | "rotated" | "revoked" | "expired" | "missing";
export type MailInviteLink = {
  status: MailInviteLinkStatus;
  roundName: string;
  expiresAt: string;
  interviewDate: string;
  startTime: string;
  endTime: string;
  location: string;
};

export type MailDeliveryView = EmailDelivery & {
  candidateId: string;
  candidateName: string;
  inviteId: string;
  invite: MailInviteLink | null;
  rsvpUrl: string;
};

export type MailBatchDetail = {
  batch: EmailBatch;
  deliveries: MailDeliveryView[];
};

export type MailPreviewRequest = {
  candidateIds: string[];
  emailDocument: DesignDocument;
  inviteDocument: DesignDocument;
  expiresAt: string;
  organizationName?: string;
  roundId?: string;
};

export type MailSendRequest = MailPreviewRequest & {
  batchName: string;
  accountId: string;
  confirmSmtp?: boolean;
  idempotencyKey: string;
};

export type CandidateInviteIssue = {
  id: string;
  token: string;
};