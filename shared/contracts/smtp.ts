import type { EmailAccountStatus } from "./email.ts";

export const SMTP_PROVIDER_IDS = ["qq", "163", "126", "exmail"] as const;
export type SmtpProvider = (typeof SMTP_PROVIDER_IDS)[number];

export type SmtpAccount = {
  id: string;
  provider: SmtpProvider;
  label: string;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  encryption: "ssl" | "starttls" | "none";
  status: EmailAccountStatus;
  hasSecret: boolean;
  isDefault: boolean;
  verificationMethod: "synthetic" | "real" | null;
  lastTestedAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SmtpAccountInput = {
  provider: SmtpProvider;
  label: string;
  fromName: string;
  fromEmail: string;
  credential?: string;
  isDefault?: boolean;
};

export type SmtpTestRequest = {
  to: string;
  templateId?: string;
  organizationName?: string;
};

export type SmtpTestInboxItem = {
  id: string;
  accountId: string;
  recipient: string;
  subject: string;
  bodyText: string;
  code: string;
  createdAt: string;
};

export type SmtpTestMode = "disabled" | "synthetic" | "real";

export type SmtpTestResult = {
  ok: boolean;
  code:
    | "accepted"
    | "auth_failed"
    | "connection_failed"
    | "missing_credential"
    | "real_test_disabled"
    | "invalid_recipient"
    | "recipient_not_allowed"
    | "test_recipient_not_configured"
    | "account_disabled"
    | "stale_test";
  mode: SmtpTestMode;
  message: string;
  account: SmtpAccount;
  inboxItem: SmtpTestInboxItem | null;
};

export type SmtpConnectionResult = {
  ok: boolean;
  code:
    | "connected"
    | "auth_failed"
    | "connection_failed"
    | "missing_credential"
    | "real_test_disabled"
    | "account_disabled"
    | "stale_test";
  mode: SmtpTestMode;
  message: string;
  account: SmtpAccount;
};