import type { InterviewRsvpStatus } from "./interview.ts";
import type { PersonalityAnswerValue, PersonalityDimension, PersonalityQuestion } from "../recruitment/personality-questions.ts";

export const FIRST_ROUND_ID = "round-1";
export const OFFER_ROUND_ID = "round-offer";
export const OFFER_EMAIL_TEMPLATE_ID = "a063d2ef-d846-4f50-b9dd-2da285aa4b60";
export const OFFER_INVITE_TEMPLATE_ID = "ee9762bf-c625-4d23-8f5d-ba991796ed42";
export type InterviewRoundKind = "interview" | "offer";
export type RoundSchedule = { interviewDate: string; startTime: string; endTime: string; location: string };
export type PromotionSchedule = { mode: "keep" } | { mode: "clear" } | ({ mode: "replace" } & RoundSchedule);
export const REVIEW_DECISIONS = ["pass", "hold", "reject"] as const;
export type ReviewDecision = typeof REVIEW_DECISIONS[number];
export type RoundReviewInput = { rating: number; decision: ReviewDecision; notes: string; reviewerName?: string };
export type RoundReview = RoundReviewInput & { reviewerName: string; updatedAt: string };
export const QUESTION_TYPES = ["text", "textarea", "single_choice", "multi_choice", "select", "url", "rating"] as const;
export type QuestionType = typeof QUESTION_TYPES[number];
export type FormQuestion = {
  id: string;
  type: QuestionType;
  title: string;
  description: string;
  placeholder: string;
  required: boolean;
  options: string[];
};
export type FormConfig = { enabled: boolean; questions: FormQuestion[] };
export type MbtiQuestion = PersonalityQuestion & { enabled: boolean };
export type MbtiConfig = { enabled: boolean; questions: MbtiQuestion[] };
export const CUSTOM_ACTIVITY_LIMIT = 8;
export const CUSTOM_ACTIVITY_HTML_LIMIT = 128 * 1024;
export const CUSTOM_ACTIVITY_TOTAL_HTML_LIMIT = 384 * 1024;
export const CUSTOM_ACTIVITY_PAYLOAD_LIMIT = 16 * 1024;
export const CUSTOM_ACTIVITY_DEFAULT_HEIGHT = 360;
export const CUSTOM_ACTIVITY_MIN_HEIGHT = 240;
export const CUSTOM_ACTIVITY_MAX_HEIGHT = 720;
export const CUSTOM_ACTIVITY_RESIZE_MAX = 760;
export const CUSTOM_ACTIVITY_CALLBACK = "/api/open/v1/activities/callback";
export const CUSTOM_ACTIVITY_SESSION = "/api/open/v1/activities/session";
export const CUSTOM_ACTIVITY_SUBMIT_MESSAGE = "campusflow:activity:submit";
export const CUSTOM_ACTIVITY_PROGRESS_MESSAGE = "campusflow:activity:progress";
export const CUSTOM_ACTIVITY_READY_MESSAGE = "campusflow:activity:ready";
export const CUSTOM_ACTIVITY_RESTORE_MESSAGE = "campusflow:activity:restore";
export const CUSTOM_ACTIVITY_RESIZE_MESSAGE = "campusflow:activity:resize";

type ActivityFields = { id: string; title: string; description?: string; required: boolean; enabled: boolean };
export type CustomActivity = ActivityFields & (
  | { kind: "sandbox_widget"; html: string; height?: number }
  | { kind: "external_app"; url: string }
);
export type JsonValue = string | number | boolean | null | JsonValue[] | ActivityPayload;
export type ActivityPayload = { [key: string]: JsonValue };
export const ACTIVITY_RESULT_STATUSES = ["in_progress", "completed", "needs_review"] as const;
export const ACTIVITY_BADGE_TONES = ["neutral", "info", "success", "warning", "danger"] as const;
export type ActivityStatus = typeof ACTIVITY_RESULT_STATUSES[number];
export type ActivityBadge = { label: string; tone?: typeof ACTIVITY_BADGE_TONES[number] };
export type CustomActivityResult = {
  status: ActivityStatus; summary: string; progress?: number; progressText?: string; badge?: ActivityBadge;
  score?: number; maxScore?: number; scoreLabel?: string; scoreUnit?: string;
  metrics?: { label: string; value: number; max?: number; unit?: string }[];
  qa?: { question: string; answer: string; tag?: string }[];
  tags?: string[]; payload?: ActivityPayload;
};
export const isActivityTerminal = (result?: { status: ActivityStatus } | null) => !!result && result.status !== "in_progress";
export type CustomActivitySubmission = CustomActivityResult & { submittedAt: string | null; revision: number };
export type InviteCustomActivity = CustomActivity & { submission: CustomActivitySubmission | null; revoked?: boolean; generation: number };
export type RecordedCustomActivity = Pick<CustomActivity, "title" | "kind" | "required"> & CustomActivitySubmission & { activityId: string; generation: number };
export type ActivityCredential = {
  activityId: string; activityTitle: string; generation: number; status: "unissued" | "active" | "locked" | "revoked" | "expired";
  issuedAt: string | null; expiresAt: string | null; lastUsedAt: string | null; lockedAt: string | null; revokedAt: string | null;
};
export type ActivitySession = {
  candidateName: string; roundName: string; activityId: string; activityTitle: string;
  status: ActivityStatus | "pending"; expiresAt: string; submission: CustomActivitySubmission | null;
};

export type InterviewRoundInput = {
  kind?: InterviewRoundKind;
  name: string;
  description: string;
  defaultEmailTemplateId: string | null;
  defaultInviteTemplateId: string | null;
  formConfig: FormConfig;
  mbtiConfig: MbtiConfig;
  customActivities?: CustomActivity[];
};
export type InterviewRound = InterviewRoundInput & {
  id: string; kind: InterviewRoundKind; sortOrder: number; archivedAt: string | null; createdAt: string; updatedAt: string;
  customActivities: CustomActivity[];
};
export type FormAnswer = string | string[] | number;
export type FormAnswers = Record<string, FormAnswer>;
export type MbtiAnswers = Record<string, PersonalityAnswerValue>;
export type MbtiResult = {
  type: string;
  dimensions: { dimension: PersonalityDimension; firstPercent: number; score: number; count: number; close: boolean }[];
  stability: number | null;
  answeredCount: number;
};
export type ActivityProgress<A> = { answers: A; submittedAt: string | null; revision: number };
export type InviteActivities = {
  roundName: string;
  roundKind?: InterviewRoundKind;
  form: (ActivityProgress<FormAnswers> & { questions: FormQuestion[] }) | null;
  mbti: (ActivityProgress<MbtiAnswers> & { questions: MbtiQuestion[]; result: MbtiResult | null }) | null;
  customActivities: InviteCustomActivity[];
};
export type InviteSubmission = {
  inviteId: string;
  issuedAt: string;
  rsvpStatus: InterviewRsvpStatus;
  respondedAt: string | null;
  form: { submittedAt: string; questions: FormQuestion[]; answers: FormAnswers } | null;
  mbti: { submittedAt: string; result: MbtiResult } | null;
  customActivities: RecordedCustomActivity[];
  activityCredentials?: ActivityCredential[];
};
export type RoundSubmission = {
  roundId: string;
  roundName: string;
  roundKind: InterviewRoundKind;
  review: RoundReview | null;
  enteredAt: string;
  invitations: InviteSubmission[];
};
export type RoundProgress = {
  form: "off" | "pending" | "draft" | "submitted";
  mbti: "off" | "pending" | "draft" | "submitted";
  mbtiType: string | null;
  customActivities: { completed: number; total: number;
    statuses?: { id: string; title: string; status: ActivityStatus; progress?: number; badge?: ActivityBadge }[] };
};
