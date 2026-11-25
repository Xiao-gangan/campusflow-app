import type {
  EmailAccount,
  EmailAccountInput,
  EmailBatch,
  EmailDelivery,
  EmailTemplate,
  EmailTemplateInput,
} from "../contracts/email.ts";

export interface EmailRepository {
  listAccounts(): Promise<EmailAccount[]>;
  getAccount(id: string): Promise<EmailAccount | null>;
  createAccount(
    input: EmailAccountInput & { now: string },
  ): Promise<EmailAccount>;
  updateAccount(
    id: string,
    patch: Partial<EmailAccount>,
  ): Promise<EmailAccount | null>;
  disableAccount(id: string, at: string): Promise<EmailAccount | null>;

  listTemplates(): Promise<EmailTemplate[]>;
  getTemplate(id: string): Promise<EmailTemplate | null>;
  createTemplate(
    input: EmailTemplateInput & { now: string },
  ): Promise<EmailTemplate>;
  updateTemplate(
    id: string,
    patch: Partial<EmailTemplate>,
  ): Promise<EmailTemplate | null>;
  duplicateTemplate(id: string, now: string): Promise<EmailTemplate | null>;

  listBatches(): Promise<EmailBatch[]>;
  findBatchByIdempotencyKey(key: string): Promise<EmailBatch | null>;
  getBatch(id: string): Promise<EmailBatch | null>;
  createBatch(batch: EmailBatch): Promise<EmailBatch>;
  updateBatch(
    id: string,
    patch: Partial<EmailBatch>,
  ): Promise<EmailBatch | null>;
  listDeliveries(batchId: string): Promise<EmailDelivery[]>;
  createDeliveries(rows: EmailDelivery[]): Promise<EmailDelivery[]>;
  updateDelivery(
    id: string,
    patch: Partial<EmailDelivery>,
  ): Promise<EmailDelivery | null>;
}
