export const EMAIL_PROVIDER_TYPES = [
  "qq",
  "163",
  "custom",
  "http_api",
] as const;
export type EmailProviderType = (typeof EMAIL_PROVIDER_TYPES)[number];

export const EMAIL_ACCOUNT_STATUSES = [
  "unverified",
  "verified",
  "failed",
  "disabled",
] as const;
export type EmailAccountStatus = (typeof EMAIL_ACCOUNT_STATUSES)[number];

export const EMAIL_TEMPLATE_STATUSES = [
  "draft",
  "active",
  "archived",
] as const;
export type EmailTemplateStatus = (typeof EMAIL_TEMPLATE_STATUSES)[number];

export const EMAIL_VARIABLE_KEYS = [
  "candidate_name",
  "candidate_email",
  "department",
  "interview_time",
  "interview_location",
  "rsvp_link",
  "onboarding_link",
  "organization_name",
  "personal_note",
] as const;
export type EmailVariableKey = (typeof EMAIL_VARIABLE_KEYS)[number];

export const EMAIL_BLOCK_TYPES = [
  "heading",
  "text",
  "image",
  "logo",
  "button",
  "divider",
  "info_card",
  "footer",
  "spacer",
] as const;
export type EmailBlockType = (typeof EMAIL_BLOCK_TYPES)[number];

export type EmailBlock = {
  id: string;
  type: EmailBlockType;
  props: Record<string, unknown>;
};

export type EmailEditorDocument = {
  schemaVersion: 1;
  settings: {
    width: number;
    background: string;
    fontFamily: string;
    textColor: string;
    primaryColor?: string;
    accentColor?: string;
    surfaceColor?: string;
    mutedTextColor?: string;
    borderColor?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    radius?: number;
    spacing?: number;
  };
  blocks: EmailBlock[];
};

export type EmailTemplate = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  subjectTemplate: string;
  preheaderText: string | null;
  isPreset: boolean;
  status: EmailTemplateStatus;
  editorDocument: EmailEditorDocument;
  schemaVersion: number;
  renderedHtml: string | null;
  renderedText: string | null;
  updatedAt: string;
};

export type EmailTemplateInput = {
  name: string;
  description?: string | null;
  category?: string | null;
  subjectTemplate: string;
  preheaderText?: string | null;
  editorDocument: EmailEditorDocument;
  isPreset?: boolean;
  status?: EmailTemplateStatus;
};

export type EmailAccount = {
  id: string;
  providerType: EmailProviderType;
  label: string;
  fromName: string;
  fromEmail: string;
  smtpHost: string | null;
  smtpPort: number | null;
  encryption: "ssl" | "starttls" | "none" | null;
  status: EmailAccountStatus;
  hasSecret: boolean;
  isDefault: boolean;
  lastTestedAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmailAccountSummary = EmailAccount;

export type EmailAccountInput = {
  providerType: EmailProviderType;
  label: string;
  fromName: string;
  fromEmail: string;
  smtpHost?: string | null;
  smtpPort?: number | null;
  encryption?: "ssl" | "starttls" | "none" | null;
  username?: string | null;
  hasSecret?: boolean;
  isDefault?: boolean;
};

export type EmailRecipient = {
  sourceId: string;
  sourceVersion: number;
  email: string;
  name: string;
  context: Partial<Record<EmailVariableKey, string>>;
  eligible?: boolean;
  issues?: string[];
};

export type EmailPreflightItem = {
  sourceId: string;
  sourceVersion: number;
  recipient: string;
  eligible: boolean;
  issues: string[];
};

export type EmailPreflightResult = {
  templateId: string;
  total: number;
  eligible: number;
  excluded: number;
  items: EmailPreflightItem[];
};

export type EmailBatchMode = "dry_run" | "send";

export const EMAIL_BATCH_STATUSES = [
  "draft",
  "preflight",
  "queued",
  "sending",
  "sent",
  "partial_failed",
  "failed",
  "cancelled",
] as const;
export type EmailBatchStatus = (typeof EMAIL_BATCH_STATUSES)[number];

export type EmailBatch = {
  id: string;
  name: string;
  templateId: string;
  accountId: string;
  mode: EmailBatchMode;
  status: EmailBatchStatus;
  sourceModule: string;
  totalCount: number;
  pendingCount: number;
  sendingCount: number;
  simulatedCount: number;
  sentCount: number;
  failedCount: number;
  retryableFailedCount: number;
  cancelledCount: number;
  skippedCount: number;
  idempotencyKey: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export const EMAIL_DELIVERY_STATUSES = [
  "pending",
  "sending",
  "simulated",
  "sent",
  "failed",
  "cancelled",
  "skipped",
] as const;
export type EmailDeliveryStatus =
  (typeof EMAIL_DELIVERY_STATUSES)[number];

export type EmailDelivery = {
  id: string;
  batchId: string;
  templateId: string;
  accountId: string;
  sourceModule: string;
  sourceId: string;
  sourceVersion: number;
  toEmail: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  status: EmailDeliveryStatus;
  provider: string;
  providerMessageId: string | null;
  attemptCount: number;
  retryable: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
};

export type TestInboxTicket = {
  invitationId: string;
  sourceVersion: number;
  purpose: "test-inbox";
  expiresAt: string;
  readOnly: true;
};

export type EmailTransportName = "mock" | "smtp_gateway" | "http_api";

export type EmailSendInput = {
  accountId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export type EmailSendResult = {
  providerMessageId: string;
  status: "sent" | "simulated";
};

export interface EmailTransport {
  readonly name: EmailTransportName;

  send(input: EmailSendInput): Promise<EmailSendResult>;

  testAccount(input: { accountId: string }): Promise<{
    ok: boolean;
    code: string;
  }>;

  sendTest(input: {
    accountId: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{
    ok: boolean;
    code: string;
  }>;
}
