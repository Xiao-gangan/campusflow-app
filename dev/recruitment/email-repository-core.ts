import type { SqlDatabase } from "../../shared/data/sql-database.ts";
import type {
  EmailAccount,
  EmailAccountInput,
  EmailBatch,
  EmailDelivery,
  EmailTemplate,
  EmailTemplateInput,
} from "../../shared/contracts/email.ts";
import type { EmailRepository } from "../../shared/data/email-repository.ts";
import type { RoundDelivery } from "../../shared/contracts/recruitment-console.ts";
import type { DesignDocument } from "../../shared/contracts/design.ts";
import { FIRST_ROUND_ID } from "../../shared/contracts/interview-rounds.ts";
import type { EmailDeliveryLink } from "./types.ts";

const bool = (value: unknown) => value === 1 || value === true;
const int = (value: unknown) => Number(value ?? 0);

export type LocalEmailRepository = EmailRepository & {
  saveDesignDocument(templateId: string, document: DesignDocument): void;
  getDesignDocument(templateId: string): DesignDocument | null;
  latestDeliveryForCandidate(candidateId: string, roundId: string): EmailDelivery | null;
  deliveryByRound(candidateId: string): Record<string, RoundDelivery>;
  setDeliveryLink(link: EmailDeliveryLink): void;
  getDeliveryLink(deliveryId: string): EmailDeliveryLink | null;
  listDeliveryLinks(batchId: string): EmailDeliveryLink[];
  claimMailRequest(idempotencyKey: string): boolean;
  completeMailRequest(idempotencyKey: string, batchId: string): void;
  releaseMailRequest(idempotencyKey: string): void;
  hasMailRequest(idempotencyKey: string): boolean;
  close(): void;
};

export function createLocalEmailRepository(db: SqlDatabase): LocalEmailRepository {
  db.exec(`PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS demo_email_account (
      id TEXT PRIMARY KEY, provider_type TEXT NOT NULL, label TEXT NOT NULL,
      from_name TEXT NOT NULL, from_email TEXT NOT NULL, smtp_host TEXT, smtp_port INTEGER,
      encryption TEXT, status TEXT NOT NULL, has_secret INTEGER NOT NULL,
      is_default INTEGER NOT NULL, last_tested_at TEXT, last_error_code TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS demo_email_template (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, category TEXT,
      subject_template TEXT NOT NULL, preheader_text TEXT, is_preset INTEGER NOT NULL,
      status TEXT NOT NULL, editor_document TEXT NOT NULL, design_document TEXT,
      schema_version INTEGER NOT NULL, rendered_html TEXT, rendered_text TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS demo_email_batch (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, template_id TEXT NOT NULL, account_id TEXT NOT NULL,
      mode TEXT NOT NULL, status TEXT NOT NULL, source_module TEXT NOT NULL,
      total_count INTEGER NOT NULL, pending_count INTEGER NOT NULL, sending_count INTEGER NOT NULL,
      simulated_count INTEGER NOT NULL, sent_count INTEGER NOT NULL, failed_count INTEGER NOT NULL,
      retryable_failed_count INTEGER NOT NULL, cancelled_count INTEGER NOT NULL, skipped_count INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS demo_email_delivery (
      id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, template_id TEXT NOT NULL, account_id TEXT NOT NULL,
      source_module TEXT NOT NULL, source_id TEXT NOT NULL, source_version INTEGER NOT NULL,
      to_email TEXT NOT NULL, subject TEXT NOT NULL, body_html TEXT NOT NULL, body_text TEXT NOT NULL,
      status TEXT NOT NULL, provider TEXT NOT NULL, provider_message_id TEXT,
      attempt_count INTEGER NOT NULL, retryable INTEGER NOT NULL, error_code TEXT, error_message TEXT,
      created_at TEXT NOT NULL, last_attempt_at TEXT, sent_at TEXT, cancelled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS demo_email_delivery_candidate
      ON demo_email_delivery(source_id, created_at);
    CREATE TABLE IF NOT EXISTS demo_email_delivery_link (
      delivery_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, candidate_id TEXT NOT NULL,
      candidate_name TEXT NOT NULL, invite_id TEXT NOT NULL, rsvp_url TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS demo_email_link_batch ON demo_email_delivery_link(batch_id);
    CREATE TABLE IF NOT EXISTS demo_mail_request (
      idempotency_key TEXT PRIMARY KEY, batch_id TEXT, created_at TEXT NOT NULL
    );
  `);

  function accountFrom(row: Record<string, unknown>): EmailAccount {
    return {
      id: String(row.id),
      providerType: row.provider_type as EmailAccount["providerType"],
      label: String(row.label),
      fromName: String(row.from_name),
      fromEmail: String(row.from_email),
      smtpHost: row.smtp_host ? String(row.smtp_host) : null,
      smtpPort: row.smtp_port === null ? null : int(row.smtp_port),
      encryption: (row.encryption as EmailAccount["encryption"]) ?? null,
      status: row.status as EmailAccount["status"],
      hasSecret: bool(row.has_secret),
      isDefault: bool(row.is_default),
      lastTestedAt: row.last_tested_at ? String(row.last_tested_at) : null,
      lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
  function writeAccount(account: EmailAccount) {
    db.prepare(
      `INSERT OR REPLACE INTO demo_email_account
       (id,provider_type,label,from_name,from_email,smtp_host,smtp_port,encryption,status,has_secret,
        is_default,last_tested_at,last_error_code,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      account.id, account.providerType, account.label, account.fromName, account.fromEmail,
      account.smtpHost, account.smtpPort, account.encryption, account.status,
      account.hasSecret ? 1 : 0, account.isDefault ? 1 : 0, account.lastTestedAt,
      account.lastErrorCode, account.createdAt, account.updatedAt,
    );
  }
  function templateFrom(row: Record<string, unknown>): EmailTemplate {
    return {
      id: String(row.id), name: String(row.name),
      description: row.description ? String(row.description) : null,
      category: row.category ? String(row.category) : null,
      subjectTemplate: String(row.subject_template),
      preheaderText: row.preheader_text ? String(row.preheader_text) : null,
      isPreset: bool(row.is_preset), status: row.status as EmailTemplate["status"],
      editorDocument: JSON.parse(String(row.editor_document)),
      schemaVersion: int(row.schema_version), renderedHtml: row.rendered_html ? String(row.rendered_html) : null,
      renderedText: row.rendered_text ? String(row.rendered_text) : null,
      updatedAt: String(row.updated_at),
    };
  }
  function writeTemplate(template: EmailTemplate) {
    db.prepare(
      `INSERT OR REPLACE INTO demo_email_template
       (id,name,description,category,subject_template,preheader_text,is_preset,status,editor_document,
        design_document,schema_version,rendered_html,rendered_text,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,COALESCE((SELECT design_document FROM demo_email_template WHERE id=?),NULL),?,?,?,?)`,
    ).run(
      template.id, template.name, template.description, template.category,
      template.subjectTemplate, template.preheaderText, template.isPreset ? 1 : 0,
      template.status, JSON.stringify(template.editorDocument), template.id,
      template.schemaVersion, template.renderedHtml, template.renderedText, template.updatedAt,
    );
  }
  function deliveryFrom(row: Record<string, unknown>): EmailDelivery {
    return {
      id: String(row.id), batchId: String(row.batch_id), templateId: String(row.template_id),
      accountId: String(row.account_id), sourceModule: String(row.source_module),
      sourceId: String(row.source_id), sourceVersion: int(row.source_version),
      toEmail: String(row.to_email), subject: String(row.subject), bodyHtml: String(row.body_html),
      bodyText: String(row.body_text), status: row.status as EmailDelivery["status"],
      provider: String(row.provider), providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null,
      attemptCount: int(row.attempt_count), retryable: bool(row.retryable),
      errorCode: row.error_code ? String(row.error_code) : null,
      errorMessage: row.error_message ? String(row.error_message) : null,
      createdAt: String(row.created_at),
      lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
      sentAt: row.sent_at ? String(row.sent_at) : null,
      cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    };
  }
  function writeDelivery(delivery: EmailDelivery) {
    db.prepare(
      `INSERT OR REPLACE INTO demo_email_delivery
       (id,batch_id,template_id,account_id,source_module,source_id,source_version,to_email,subject,
        body_html,body_text,status,provider,provider_message_id,attempt_count,retryable,error_code,
        error_message,created_at,last_attempt_at,sent_at,cancelled_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      delivery.id, delivery.batchId, delivery.templateId, delivery.accountId, delivery.sourceModule,
      delivery.sourceId, delivery.sourceVersion, delivery.toEmail, delivery.subject, delivery.bodyHtml,
      delivery.bodyText, delivery.status, delivery.provider, delivery.providerMessageId,
      delivery.attemptCount, delivery.retryable ? 1 : 0, delivery.errorCode, delivery.errorMessage,
      delivery.createdAt, delivery.lastAttemptAt, delivery.sentAt, delivery.cancelledAt,
    );
  }
  function batchFrom(row: Record<string, unknown>): EmailBatch {
    return {
      id: String(row.id), name: String(row.name), templateId: String(row.template_id),
      accountId: String(row.account_id), mode: row.mode as EmailBatch["mode"],
      status: row.status as EmailBatch["status"], sourceModule: String(row.source_module),
      totalCount: int(row.total_count), pendingCount: int(row.pending_count),
      sendingCount: int(row.sending_count), simulatedCount: int(row.simulated_count),
      sentCount: int(row.sent_count), failedCount: int(row.failed_count),
      retryableFailedCount: int(row.retryable_failed_count),
      cancelledCount: int(row.cancelled_count), skippedCount: int(row.skipped_count),
      idempotencyKey: String(row.idempotency_key), createdAt: String(row.created_at),
      startedAt: row.started_at ? String(row.started_at) : null,
      completedAt: row.completed_at ? String(row.completed_at) : null,
    };
  }
  function writeBatch(batch: EmailBatch) {
    db.prepare(
      `INSERT OR REPLACE INTO demo_email_batch
       (id,name,template_id,account_id,mode,status,source_module,total_count,pending_count,
        sending_count,simulated_count,sent_count,failed_count,retryable_failed_count,cancelled_count,
        skipped_count,idempotency_key,created_at,started_at,completed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      batch.id, batch.name, batch.templateId, batch.accountId, batch.mode, batch.status,
      batch.sourceModule, batch.totalCount, batch.pendingCount, batch.sendingCount,
      batch.simulatedCount, batch.sentCount, batch.failedCount, batch.retryableFailedCount,
      batch.cancelledCount, batch.skippedCount, batch.idempotencyKey, batch.createdAt,
      batch.startedAt, batch.completedAt,
    );
  }
  function getAccountRow(id: string) {
    return db.prepare("SELECT * FROM demo_email_account WHERE id=?").get(id) as Record<string, unknown> | undefined;
  }
  function getTemplateRow(id: string) {
    return db.prepare("SELECT * FROM demo_email_template WHERE id=?").get(id) as Record<string, unknown> | undefined;
  }
  function getBatchRow(id: string) {
    return db.prepare("SELECT * FROM demo_email_batch WHERE id=?").get(id) as Record<string, unknown> | undefined;
  }
  function getDeliveryRow(id: string) {
    return db.prepare("SELECT * FROM demo_email_delivery WHERE id=?").get(id) as Record<string, unknown> | undefined;
  }

  return {
    async listAccounts() {
      return (db.prepare("SELECT * FROM demo_email_account ORDER BY is_default DESC, created_at").all() as Record<string, unknown>[]).map(accountFrom);
    },
    async getAccount(id) {
      const row = getAccountRow(id);
      return row ? accountFrom(row) : null;
    },
    async createAccount(input) {
      if (input.isDefault) {
        db.prepare("UPDATE demo_email_account SET is_default=0").run();
      }
      const existing = db.prepare("SELECT COUNT(*) AS count FROM demo_email_account").get();
      const account: EmailAccount = {
        id: crypto.randomUUID(), providerType: input.providerType, label: input.label,
        fromName: input.fromName, fromEmail: input.fromEmail,
        smtpHost: input.smtpHost ?? null, smtpPort: input.smtpPort ?? null,
        encryption: input.encryption ?? null, status: "unverified",
        hasSecret: input.hasSecret ?? false,
        isDefault: input.isDefault ?? int(existing?.count) === 0,
        lastTestedAt: null, lastErrorCode: null, createdAt: input.now, updatedAt: input.now,
      };
      writeAccount(account);
      return account;
    },
    async updateAccount(id, patch) {
      const row = getAccountRow(id);
      if (!row) return null;
      if (patch.isDefault) db.prepare("UPDATE demo_email_account SET is_default=0").run();
      const updated = { ...accountFrom(row), ...patch, updatedAt: new Date().toISOString() };
      writeAccount(updated);
      return updated;
    },
    async disableAccount(id, at) {
      return this.updateAccount(id, { status: "disabled", updatedAt: at });
    },
    async listTemplates() {
      return (db.prepare("SELECT * FROM demo_email_template ORDER BY updated_at DESC").all() as Record<string, unknown>[]).map(templateFrom);
    },
    async getTemplate(id) {
      const row = getTemplateRow(id);
      return row ? templateFrom(row) : null;
    },
    async createTemplate(input) {
      const template: EmailTemplate = {
        id: crypto.randomUUID(), name: input.name, description: input.description ?? null,
        category: input.category ?? null, subjectTemplate: input.subjectTemplate,
        preheaderText: input.preheaderText ?? null, isPreset: input.isPreset ?? false,
        status: input.status ?? "draft", editorDocument: structuredClone(input.editorDocument),
        schemaVersion: 1, renderedHtml: null, renderedText: null, updatedAt: input.now,
      };
      writeTemplate(template);
      return structuredClone(template);
    },
    async updateTemplate(id, patch) {
      const row = getTemplateRow(id);
      if (!row) return null;
      const updated = { ...templateFrom(row), ...structuredClone(patch), updatedAt: new Date().toISOString() };
      writeTemplate(updated);
      return structuredClone(updated);
    },
    async duplicateTemplate(id, now) {
      const row = getTemplateRow(id);
      if (!row) return null;
      const copy: EmailTemplate = {
        ...templateFrom(row), id: crypto.randomUUID(), name: `${String(row.name)} 副本`,
        isPreset: false, status: "draft", renderedHtml: null, renderedText: null, updatedAt: now,
      };
      writeTemplate(copy);
      return structuredClone(copy);
    },
    async listBatches() {
      return (db.prepare("SELECT * FROM demo_email_batch ORDER BY created_at DESC").all() as Record<string, unknown>[]).map(batchFrom);
    },
    async findBatchByIdempotencyKey(key) {
      const row = db.prepare("SELECT * FROM demo_email_batch WHERE idempotency_key=?").get(key) as Record<string, unknown> | undefined;
      return row ? batchFrom(row) : null;
    },
    async getBatch(id) {
      const row = getBatchRow(id);
      return row ? batchFrom(row) : null;
    },
    async createBatch(batch) {
      writeBatch(batch);
      return batch;
    },
    async updateBatch(id, patch) {
      const row = getBatchRow(id);
      if (!row) return null;
      const updated = { ...batchFrom(row), ...patch };
      writeBatch(updated);
      return updated;
    },
    async listDeliveries(batchId) {
      return (db.prepare("SELECT * FROM demo_email_delivery WHERE batch_id=? ORDER BY created_at, source_id").all(batchId) as Record<string, unknown>[]).map(deliveryFrom);
    },
    async createDeliveries(rows) {
      for (const row of rows) writeDelivery(row);
      return rows;
    },
    async updateDelivery(id, patch) {
      const row = getDeliveryRow(id);
      if (!row) return null;
      const updated = { ...deliveryFrom(row), ...patch };
      writeDelivery(updated);
      return updated;
    },
    saveDesignDocument(templateId, document) {
      db.prepare("UPDATE demo_email_template SET design_document=? WHERE id=?").run(JSON.stringify(document), templateId);
    },
    getDesignDocument(templateId) {
      const row = getTemplateRow(templateId);
      if (!row?.design_document) return null;
      try { return JSON.parse(String(row.design_document)) as DesignDocument; } catch { return null; }
    },
    latestDeliveryForCandidate(candidateId, roundId) {
      const row = db.prepare(`SELECT delivery.* FROM demo_email_delivery delivery
        LEFT JOIN demo_email_delivery_link link ON link.delivery_id=delivery.id
        LEFT JOIN demo_interview invite ON invite.id=link.invite_id
        WHERE delivery.source_id=? AND COALESCE(invite.round_id,?)=?
        ORDER BY delivery.created_at DESC, delivery.rowid DESC LIMIT 1`).get(candidateId, FIRST_ROUND_ID, roundId) as Record<string, unknown> | undefined;
      return row ? deliveryFrom(row) : null;
    },
    deliveryByRound(candidateId) {
      const rows = db.prepare(`WITH recent_deliveries AS (
          SELECT invite.round_id, delivery.status,
            MAX(CASE WHEN delivery.status IN ('sent','simulated') THEN delivery.sent_at END)
              OVER (PARTITION BY invite.round_id) AS sent_at,
            ROW_NUMBER() OVER (PARTITION BY invite.round_id
              ORDER BY COALESCE(delivery.last_attempt_at,delivery.created_at) DESC, delivery.rowid DESC) AS position
          FROM demo_email_delivery delivery
          JOIN demo_email_delivery_link link ON link.delivery_id=delivery.id
          JOIN demo_interview invite ON invite.id=link.invite_id
          WHERE delivery.source_id=? AND delivery.status IN ('sent','simulated','failed')
        ) SELECT round_id,status,sent_at FROM recent_deliveries WHERE position=1`).all(candidateId);
      return Object.fromEntries(rows.map((row) => [String(row.round_id), {
        status: row.status === "failed" ? "failed" : "sent",
        sentAt: typeof row.sent_at === "string" ? row.sent_at : null,
      }]));
    },
    setDeliveryLink(link) {
      db.prepare(
        `INSERT OR REPLACE INTO demo_email_delivery_link
         (delivery_id,batch_id,candidate_id,candidate_name,invite_id,rsvp_url)
         VALUES (?,?,?,?,?,?)`,
      ).run(link.deliveryId, link.batchId, link.candidateId, link.candidateName, link.inviteId, link.rsvpUrl);
    },
    getDeliveryLink(deliveryId) {
      const row = db.prepare("SELECT * FROM demo_email_delivery_link WHERE delivery_id=?").get(deliveryId) as Record<string, unknown> | undefined;
      return row ? {
        deliveryId: String(row.delivery_id), batchId: String(row.batch_id),
        candidateId: String(row.candidate_id), candidateName: String(row.candidate_name),
        inviteId: String(row.invite_id), rsvpUrl: String(row.rsvp_url),
      } : null;
    },
    claimMailRequest(idempotencyKey) {
      try {
        db.prepare("INSERT INTO demo_mail_request(idempotency_key,batch_id,created_at) VALUES (?,NULL,?)").run(idempotencyKey, new Date().toISOString());
        return true;
      } catch {
        return false;
      }
    },
    completeMailRequest(idempotencyKey, batchId) {
      db.prepare("UPDATE demo_mail_request SET batch_id=? WHERE idempotency_key=?").run(batchId, idempotencyKey);
    },
    releaseMailRequest(idempotencyKey) {
      db.prepare("DELETE FROM demo_mail_request WHERE idempotency_key=? AND batch_id IS NULL").run(idempotencyKey);
    },
    hasMailRequest(idempotencyKey) {
      return !!db.prepare("SELECT 1 FROM demo_mail_request WHERE idempotency_key=?").get(idempotencyKey);
    },
    listDeliveryLinks(batchId) {
      return (db.prepare("SELECT * FROM demo_email_delivery_link WHERE batch_id=?").all(batchId) as Record<string, unknown>[]).map((row) => ({
        deliveryId: String(row.delivery_id),
        batchId: String(row.batch_id),
        candidateId: String(row.candidate_id),
        candidateName: String(row.candidate_name),
        inviteId: String(row.invite_id),
        rsvpUrl: String(row.rsvp_url),
      }));
    },
    close() { db.close(); },
  } as LocalEmailRepository & { close(): void };
}
