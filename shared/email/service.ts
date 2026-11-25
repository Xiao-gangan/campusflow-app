import type {
  EmailAccount,
  EmailAccountInput,
  EmailBatch,
  EmailBatchMode,
  EmailDelivery,
  EmailPreflightItem,
  EmailPreflightResult,
  EmailRecipient,
  EmailSendInput,
  EmailTemplate,
  EmailTemplateInput,
  EmailTransport,
} from "../contracts/email.ts";
import type { EmailRepository } from "../data/email-repository.ts";
import {
  renderEmailTemplate,
  type EmailRenderResult,
  type EmailTemplateContext,
} from "./template-renderer.ts";

export class EmailServiceError extends Error {
  code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = "EmailServiceError";
    this.code = code;
  }
}

export class EmailProviderError extends Error {
  code: string;
  retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "EmailProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type EmailEligibilityGuard = (input: {
  sourceId: string;
  sourceVersion: number;
}) =>
  | Promise<{ eligible: boolean; issues: string[] }>
  | { eligible: boolean; issues: string[] };

export type EmailServiceOptions = {
  repository: EmailRepository;
  transport: EmailTransport;
  transportForAccount?: (accountId: string) => EmailTransport;
  now?: () => Date;
  checkEligibility?: EmailEligibilityGuard;
  /** Optional renderer for design-library snapshots, including free HTML. */
  renderTemplate?: (
    template: EmailTemplate,
    context: EmailTemplateContext,
  ) => Promise<EmailRenderResult>;
  /** Recheck the linked invitation immediately before any retry/send attempt. */
  checkDeliveryEligibility?: (
    delivery: EmailDelivery,
  ) =>
    | Promise<{ eligible: boolean; issues: string[] }>
    | { eligible: boolean; issues: string[] };
};

export type CreateEmailBatchInput = {
  name: string;
  templateId: string;
  accountId: string;
  mode: EmailBatchMode;
  sourceModule: string;
  recipients: EmailRecipient[];
  idempotencyKey: string;
};

export type EmailService = {
  listAccounts(): Promise<EmailAccount[]>;
  createAccount(input: EmailAccountInput): Promise<EmailAccount>;
  updateAccount(
    id: string,
    patch: Partial<EmailAccount>,
  ): Promise<EmailAccount | null>;
  disableAccount(id: string): Promise<EmailAccount | null>;
  testAccount(id: string): Promise<EmailAccount>;

  listTemplates(): Promise<EmailTemplate[]>;
  getTemplate(id: string): Promise<EmailTemplate | null>;
  createTemplate(input: EmailTemplateInput): Promise<EmailTemplate>;
  updateTemplate(
    id: string,
    patch: Partial<EmailTemplate>,
  ): Promise<EmailTemplate | null>;
  duplicateTemplate(id: string): Promise<EmailTemplate | null>;
  previewTemplate(
    id: string,
    context: EmailTemplateContext,
  ): Promise<EmailRenderResult>;

  preflight(input: {
    templateId: string;
    recipients: EmailRecipient[];
  }): Promise<EmailPreflightResult>;
  createBatch(input: CreateEmailBatchInput): Promise<EmailBatch>;
  sendBatch(batchId: string): Promise<EmailBatch>;
  retryBatch(batchId: string): Promise<EmailBatch>;
  cancelBatch(batchId: string): Promise<EmailBatch>;
  getBatch(batchId: string): Promise<EmailBatch | null>;
  listDeliveries(batchId: string): Promise<EmailDelivery[]>;

  testSendTemplate(input: {
    templateId: string;
    accountId: string;
    to: string;
    context: EmailTemplateContext;
  }): Promise<{ ok: boolean; code: string }>;
};

function renderContext(recipient: EmailRecipient): EmailTemplateContext {
  return {
    candidate_name: recipient.name,
    candidate_email: recipient.email,
    ...recipient.context,
  };
}

function batchCounts(deliveries: EmailDelivery[]) {
  return {
    pendingCount: deliveries.filter((item) => item.status === "pending").length,
    sendingCount: deliveries.filter((item) => item.status === "sending").length,
    simulatedCount: deliveries.filter((item) => item.status === "simulated").length,
    sentCount: deliveries.filter((item) => item.status === "sent").length,
    failedCount: deliveries.filter((item) => item.status === "failed").length,
    retryableFailedCount: deliveries.filter(
      (item) => item.status === "failed" && item.retryable,
    ).length,
    cancelledCount: deliveries.filter((item) => item.status === "cancelled").length,
    skippedCount: deliveries.filter((item) => item.status === "skipped").length,
  };
}

function batchStatus(
  current: EmailBatch,
  deliveries: EmailDelivery[],
): EmailBatch["status"] {
  if (current.status === "cancelled") return "cancelled";
  const counts = batchCounts(deliveries);
  if (counts.pendingCount > 0 || counts.sendingCount > 0) {
    return current.startedAt ? "sending" : "queued";
  }
  if (counts.failedCount > 0) {
    return counts.sentCount + counts.simulatedCount > 0
      ? "partial_failed"
      : "failed";
  }
  return "sent";
}

function providerFailure(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof EmailProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }
  return {
    code: "EMAIL_PROVIDER_ERROR",
    message: "邮件投递失败。",
    retryable: false,
  };
}

export function createEmailService(options: EmailServiceOptions): EmailService {
  const { repository, transport } = options;
  const transportFor = options.transportForAccount ?? (() => transport);
  const now = options.now ?? (() => new Date());
  const nowIso = () => now().toISOString();

  async function checkEligibility(
    recipient: EmailRecipient,
  ): Promise<{ eligible: boolean; issues: string[] }> {
    if (recipient.eligible === false) {
      return {
        eligible: false,
        issues: recipient.issues?.length ? recipient.issues : ["候选人当前不可发送。"],
      };
    }
    if (!options.checkEligibility) {
      return { eligible: true, issues: [] };
    }
    try {
      return await options.checkEligibility({
        sourceId: recipient.sourceId,
        sourceVersion: recipient.sourceVersion,
      });
    } catch {
      return { eligible: false, issues: ["发送前资格检查失败。"] };
    }
  }

  async function preflight(input: {
    templateId: string;
    recipients: EmailRecipient[];
  }): Promise<EmailPreflightResult> {
    if (!(await repository.getTemplate(input.templateId))) {
      throw new EmailServiceError("template_not_found");
    }

    const items: EmailPreflightItem[] = [];
    for (const recipient of input.recipients) {
      const checked = await checkEligibility(recipient);
      items.push({
        sourceId: recipient.sourceId,
        sourceVersion: recipient.sourceVersion,
        recipient: recipient.email,
        eligible: checked.eligible,
        issues: checked.issues,
      });
    }

    const eligible = items.filter((item) => item.eligible).length;
    return {
      templateId: input.templateId,
      total: items.length,
      eligible,
      excluded: items.length - eligible,
      items,
    };
  }

  async function renderFor(
    template: EmailTemplate,
    recipient: EmailRecipient,
  ): Promise<EmailRenderResult> {
    const context = renderContext(recipient);
    return options.renderTemplate
      ? options.renderTemplate(template, context)
      : renderEmailTemplate(template, context);
  }
  async function renderContextTemplate(
    template: EmailTemplate,
    context: EmailTemplateContext,
  ): Promise<EmailRenderResult> {
    return options.renderTemplate
      ? options.renderTemplate(template, context)
      : renderEmailTemplate(template, context);
  }

  async function applyBatchCounts(batch: EmailBatch): Promise<EmailBatch> {
    const deliveries = await repository.listDeliveries(batch.id);
    const counts = batchCounts(deliveries);
    const status = batchStatus(batch, deliveries);
    const completedAt =
      counts.pendingCount === 0 && counts.sendingCount === 0 && status !== "cancelled"
        ? batch.completedAt ?? nowIso()
        : batch.completedAt;
    return (
      (await repository.updateBatch(batch.id, {
        ...counts,
        status,
        completedAt,
      })) ?? batch
    );
  }

  async function processDelivery(
    batch: EmailBatch,
    delivery: EmailDelivery,
  ): Promise<void> {
    if (options.checkDeliveryEligibility) {
      const deliveryCheck = await options.checkDeliveryEligibility(delivery);
      if (!deliveryCheck.eligible) {
        await repository.updateDelivery(delivery.id, {
          status: "skipped",
          retryable: false,
          errorCode: "SKIPPED_STALE_INVITE",
          errorMessage: deliveryCheck.issues.join(" ").slice(0, 500) || null,
          lastAttemptAt: nowIso(),
        });
        return;
      }
    }
    const checked = await checkEligibility({
      sourceId: delivery.sourceId,
      sourceVersion: delivery.sourceVersion,
      email: delivery.toEmail,
      name: "",
      context: {},
    });
    if (!checked.eligible) {
      await repository.updateDelivery(delivery.id, {
        status: "skipped",
        retryable: false,
        errorCode: "SKIPPED_NOT_ELIGIBLE",
        errorMessage: checked.issues.join(" ").slice(0, 500) || null,
        lastAttemptAt: nowIso(),
      });
      return;
    }

    const attemptCount = delivery.attemptCount + 1;
    const attemptAt = nowIso();
    const sendInput: EmailSendInput = {
      accountId: delivery.accountId,
      to: delivery.toEmail,
      subject: delivery.subject,
      html: delivery.bodyHtml,
      text: delivery.bodyText,
      idempotencyKey: `${batch.id}:${delivery.id}`,
    };

    const deliveryTransport = transportFor(delivery.accountId);
    try {
      const result = await deliveryTransport.send(sendInput);
      await repository.updateDelivery(delivery.id, {
        status: result.status,
        provider: deliveryTransport.name,
        providerMessageId: result.providerMessageId,
        attemptCount,
        retryable: false,
        errorCode: null,
        errorMessage: null,
        lastAttemptAt: attemptAt,
        sentAt: attemptAt,
      });
    } catch (error) {
      const failure = providerFailure(error);
      await repository.updateDelivery(delivery.id, {
        status: "failed",
        provider: deliveryTransport.name,
        attemptCount,
        retryable: failure.retryable,
        errorCode: failure.code,
        errorMessage: failure.message,
        lastAttemptAt: attemptAt,
      });
    }
  }

  return {
    async listAccounts() {
      return repository.listAccounts();
    },

    async createAccount(input) {
      return repository.createAccount({ ...input, now: nowIso() });
    },

    async updateAccount(id, patch) {
      return repository.updateAccount(id, patch);
    },

    async disableAccount(id) {
      return repository.disableAccount(id, nowIso());
    },

    async testAccount(id) {
      const account = await repository.getAccount(id);
      if (!account) throw new EmailServiceError("account_not_found");
      const result = await transport.testAccount({ accountId: id });
      const updated = await repository.updateAccount(id, {
        status: result.ok ? "verified" : "failed",
        lastTestedAt: nowIso(),
        lastErrorCode: result.ok ? null : result.code,
      });
      return updated ?? account;
    },

    async listTemplates() {
      return repository.listTemplates();
    },

    async getTemplate(id) {
      return repository.getTemplate(id);
    },

    async createTemplate(input) {
      return repository.createTemplate({ ...input, now: nowIso() });
    },

    async updateTemplate(id, patch) {
      return repository.updateTemplate(id, patch);
    },

    async duplicateTemplate(id) {
      return repository.duplicateTemplate(id, nowIso());
    },

    async previewTemplate(id, context) {
      const template = await repository.getTemplate(id);
      if (!template) throw new EmailServiceError("template_not_found");
      return renderContextTemplate(template, context);
    },

    preflight,

    async createBatch(input) {
      if (!input.idempotencyKey.trim()) {
        throw new EmailServiceError("idempotency_key_required");
      }
      const existing = await repository.findBatchByIdempotencyKey(
        input.idempotencyKey,
      );
      if (existing) return existing;

      const template = await repository.getTemplate(input.templateId);
      if (!template) throw new EmailServiceError("template_not_found");
      const account = await repository.getAccount(input.accountId);
      if (!account) throw new EmailServiceError("account_not_found");
      if (input.mode === "send" && account.status !== "verified") {
        throw new EmailServiceError("account_not_verified");
      }
      if (input.mode === "send" && template.status !== "active") {
        throw new EmailServiceError("template_not_active");
      }

      const preflightResult = await preflight({
        templateId: input.templateId,
        recipients: input.recipients,
      });
      const eligibleItems = preflightResult.items.filter((item) => item.eligible);
      if (eligibleItems.length === 0) {
        throw new EmailServiceError("no_eligible_recipients");
      }

      const batchId = crypto.randomUUID();
      const createdAt = nowIso();
      const bySource = new Map(
        input.recipients.map((recipient) => [recipient.sourceId, recipient]),
      );
      const deliveries: EmailDelivery[] = [];

      for (const item of eligibleItems) {
        const recipient = bySource.get(item.sourceId);
        if (!recipient) continue;
        const rendered = await renderFor(template, recipient);
        deliveries.push({
          id: crypto.randomUUID(),
          batchId,
          templateId: template.id,
          accountId: account.id,
          sourceModule: input.sourceModule,
          sourceId: recipient.sourceId,
          sourceVersion: recipient.sourceVersion,
          toEmail: recipient.email,
          subject: rendered.subject,
          bodyHtml: rendered.html,
          bodyText: rendered.text,
          status: "pending",
          provider: transportFor(account.id).name,
          providerMessageId: null,
          attemptCount: 0,
          retryable: false,
          errorCode: null,
          errorMessage: null,
          createdAt,
          lastAttemptAt: null,
          sentAt: null,
          cancelledAt: null,
        });
      }

      const batch: EmailBatch = {
        id: batchId,
        name: input.name,
        templateId: template.id,
        accountId: account.id,
        mode: input.mode,
        status: input.mode === "dry_run" ? "preflight" : "queued",
        sourceModule: input.sourceModule,
        totalCount: input.recipients.length,
        pendingCount: deliveries.length,
        sendingCount: 0,
        simulatedCount: 0,
        sentCount: 0,
        failedCount: 0,
        retryableFailedCount: 0,
        cancelledCount: 0,
        skippedCount: preflightResult.excluded,
        idempotencyKey: input.idempotencyKey,
        createdAt,
        startedAt: null,
        completedAt: null,
      };

      await repository.createDeliveries(deliveries);
      return repository.createBatch(batch);
    },

    async sendBatch(batchId) {
      let batch = await repository.getBatch(batchId);
      if (!batch) throw new EmailServiceError("batch_not_found");
      if (batch.mode === "dry_run") return batch;
      if (batch.status === "cancelled" || batch.status === "sent") return batch;
      const account = await repository.getAccount(batch.accountId);
      if (!account || account.status !== "verified") {
        throw new EmailServiceError("account_not_verified");
      }
      if (!batch.startedAt) {
        batch =
          (await repository.updateBatch(batch.id, {
            status: "sending",
            startedAt: nowIso(),
          })) ?? batch;
      }
      const deliveries = await repository.listDeliveries(batch.id);
      for (const delivery of deliveries) {
        if (delivery.status !== "pending") continue;
        await processDelivery(batch, delivery);
      }
      return applyBatchCounts(batch);
    },

    async retryBatch(batchId) {
      let batch = await repository.getBatch(batchId);
      if (!batch) throw new EmailServiceError("batch_not_found");
      if (batch.mode === "dry_run") return batch;
      if (batch.status === "cancelled") return batch;
      const account = await repository.getAccount(batch.accountId);
      if (!account || account.status !== "verified") {
        throw new EmailServiceError("account_not_verified");
      }
      const deliveries = await repository.listDeliveries(batch.id);
      const retryable = deliveries.filter(
        (item) => item.status === "failed" && item.retryable,
      );
      if (retryable.length === 0) return batch;
      if (!batch.startedAt) {
        batch =
          (await repository.updateBatch(batch.id, {
            status: "sending",
            startedAt: nowIso(),
          })) ?? batch;
      }
      for (const delivery of retryable) {
        await processDelivery(batch, delivery);
      }
      return applyBatchCounts(batch);
    },

    async cancelBatch(batchId) {
      const batch = await repository.getBatch(batchId);
      if (!batch) throw new EmailServiceError("batch_not_found");
      if (batch.status === "cancelled") return batch;
      const deliveries = await repository.listDeliveries(batch.id);
      const pending = deliveries.filter((item) => item.status === "pending");
      if (pending.length === 0) return batch;
      for (const delivery of pending) {
        await repository.updateDelivery(delivery.id, {
          status: "cancelled",
          retryable: false,
          cancelledAt: nowIso(),
        });
      }
      return applyBatchCounts(
        (await repository.updateBatch(batch.id, { status: "cancelled" })) ??
          batch,
      );
    },

    async getBatch(batchId) {
      return repository.getBatch(batchId);
    },

    async listDeliveries(batchId) {
      return repository.listDeliveries(batchId);
    },

    async testSendTemplate(input) {
      const template = await repository.getTemplate(input.templateId);
      if (!template) throw new EmailServiceError("template_not_found");
      const account = await repository.getAccount(input.accountId);
      if (!account) throw new EmailServiceError("account_not_found");
      const rendered = await renderContextTemplate(template, input.context);
      return transport.sendTest({
        accountId: account.id,
        to: input.to,
        subject: `[TEST] ${rendered.subject}`,
        html: rendered.html,
        text: rendered.text,
      });
    },
  };
}
