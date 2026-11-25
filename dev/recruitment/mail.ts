import type { DesignDocument } from "../../shared/contracts/design.ts";
import type {
  EmailSendInput,
  EmailSendResult,
  EmailTransport,
} from "../../shared/contracts/email.ts";
import type { DemoCandidate } from "../../shared/contracts/recruitment-console.ts";
import { interviewScheduleVariables } from "../../shared/design/variables.ts";
import { createEmailService } from "../../shared/email/service.ts";
import { EmailProviderError } from "../../shared/email/service.ts";
import { renderDesignEmail } from "../../shared/email/design-renderer.ts";
import { MockEmailTransport } from "../../shared/email/mock-provider.ts";
import type { LocalEmailRepository } from "./email-repository.ts";
import type { LocalSmtpStore } from "./smtp-store-core.ts";
import type { SmtpTestMode } from "../../shared/contracts/smtp.ts";
import { smtpAddress, SMTP_PRESETS } from "../../shared/email/smtp-presets.ts";
import type { SmtpDelivery } from "./smtp-transport.ts";

const DEFAULT_ORGANIZATION = "CampusFlow";

export class LocalDemoTransport implements EmailTransport {
  readonly name = "mock" as const;
  private readonly attempts = new Map<string, number>();
  private readonly mock = new MockEmailTransport();

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const attempt = (this.attempts.get(input.idempotencyKey) ?? 0) + 1;
    this.attempts.set(input.idempotencyKey, attempt);
    if (input.to.includes("fail") && attempt === 1) {
      throw new EmailProviderError(
        "DEMO_TEMPORARY_FAILURE",
        "本机演示：首次投递临时失败，可重试。",
        true,
      );
    }
    return this.mock.send(input);
  }

  testAccount() {
    return this.mock.testAccount();
  }

  sendTest() {
    return this.mock.sendTest();
  }
}

export function candidateContext(
  candidate: DemoCandidate,
  rsvpLink: string,
  organizationName?: string,
) {
  return {
    candidate_name: candidate.name,
    candidate_email: candidate.email,
    department: candidate.department,
    ...interviewScheduleVariables(candidate.interviewDate, candidate.startTime, candidate.endTime, candidate.location),
    personal_note: candidate.note,
    organization_name: organizationName?.trim() || DEFAULT_ORGANIZATION,
    rsvp_link: rsvpLink,
  };
}

export function localAssetIssues(document: DesignDocument): string[] {
  const issues: string[] = [];
  for (const block of document.blocks) {
    if (typeof block.props.assetId === "string" && block.props.assetId) {
      issues.push("模板仍引用本机素材，收件人无法读取；请改用可访问的图片 URL。");
    }
    for (const key of ["src", "backgroundImage"]) {
      const value = block.props[key];
      if (typeof value === "string" && /^(?:blob|data):/iu.test(value)) {
        issues.push("模板包含本机图片地址，收件人无法读取；请改用可访问的图片 URL。");
      }
    }
  }
  if (document.mode === "html" && /data:image\//iu.test(document.customHtml?.html ?? "")) {
    issues.push("自由 HTML 包含内嵌本机图片，收件人无法读取；请改用可访问的图片 URL。");
  }
  return [...new Set(issues)];
}

export function createLocalMailService(
  repository: LocalEmailRepository,
  checkDeliveryEligibility?: Parameters<typeof createEmailService>[0]["checkDeliveryEligibility"],
  smtp?: { store: () => LocalSmtpStore; mode: () => SmtpTestMode; send: (delivery: SmtpDelivery) => Promise<string> },
) {
  const mock = new LocalDemoTransport();
  const accountFor = (id: string) => {
    if (smtp?.mode() !== "real") return null;
    const account = smtp.store().get(id);
    return account?.status === "verified" && account.verificationMethod === "real" && account.hasSecret
      ? account : null;
  };
  const summary = (account: NonNullable<ReturnType<typeof accountFor>>) => ({
    ...account,
    providerType: account.provider === "qq" || account.provider === "163" ? account.provider : "custom" as const,
    label: `真实 SMTP · ${SMTP_PRESETS[account.provider].label} · ${account.label}`,
    isDefault: false,
  });
  const smtpTransport: EmailTransport = {
    name: "smtp_gateway",
    testAccount: () => Promise.resolve({ ok: false, code: "use_smtp_settings" }),
    sendTest: () => Promise.resolve({ ok: false, code: "use_smtp_settings" }),
    async send(input) {
      const account = accountFor(input.accountId);
      const credential = account && smtp?.store().readSecret(account.id);
      if (!account || !credential || !smtp)
        throw new EmailProviderError("SMTP_NOT_READY", "真实 SMTP 发件邮箱已停用或需要重新验证。", false);
      if (!smtpAddress(input.to))
        throw new EmailProviderError("SMTP_INVALID_RECIPIENT", "收件邮箱格式不受 SMTP 投递支持。", false);
      try {
        const providerMessageId = await smtp.send({
          account, credential, recipient: input.to,
          message: { subject: input.subject, bodyText: input.text, bodyHtml: input.html },
        });
        return { status: "sent", providerMessageId };
      } catch {
        throw new EmailProviderError("SMTP_DELIVERY_FAILED", "未收到 SMTP 接收确认，请核对邮箱服务商记录后决定是否补发。", false);
      }
    },
  };
  const senderRepository = smtp ? {
    ...repository,
    async listAccounts() {
      const mockAccounts = await repository.listAccounts();
      const real = smtp.mode() === "real" ? smtp.store().list().flatMap(({ id }) => {
        const ready = accountFor(id);
        return ready ? [summary(ready)] : [];
      }) : [];
      return [...mockAccounts, ...real];
    },
    async getAccount(id: string) {
      const ready = accountFor(id);
      return ready ? summary(ready) : repository.getAccount(id);
    },
  } : repository;
  return createEmailService({
    repository: senderRepository,
    transport: mock,
    transportForAccount: (id) => smtp?.store().get(id) ? smtpTransport : mock,
    renderTemplate: async (template, context) => {
      const document = repository.getDesignDocument(template.id);
      if (!document) throw new Error("邮件模板快照缺失。");
      return renderDesignEmail(document, context);
    },
    ...(checkDeliveryEligibility ? { checkDeliveryEligibility } : {}),
  });
}

export async function ensureDemoAccounts(service: ReturnType<typeof createLocalMailService>) {
  const existing = await service.listAccounts();
  if (existing.some((account) => !account.smtpHost)) return existing;
  for (const input of [
    {
      providerType: "custom" as const,
      label: "招新组 · 本机模拟",
      fromName: "CampusFlow 招新组",
      fromEmail: "recruit-demo@campusflow.test",
      isDefault: true,
    },
    {
      providerType: "custom" as const,
      label: "面试组 · 本机模拟",
      fromName: "技术部面试组",
      fromEmail: "interview-demo@campusflow.test",
    },
  ]) {
    const account = await service.createAccount(input);
    await service.testAccount(account.id);
  }
  return service.listAccounts();
}