import type {
  EmailAccount,
  EmailAccountInput,
  EmailBatch,
  EmailDelivery,
  EmailTemplate,
  EmailTemplateInput,
} from "../contracts/email.ts";
import type { EmailRepository } from "./email-repository.ts";

export type MemoryEmailSeed = {
  accounts?: EmailAccount[];
  templates?: EmailTemplate[];
  batches?: EmailBatch[];
  deliveries?: EmailDelivery[];
};

export function createMemoryEmailRepository(
  seed: MemoryEmailSeed = {},
): EmailRepository {
  const accounts = [...(seed.accounts ?? [])];
  const templates = [...(seed.templates ?? [])];
  const batches = [...(seed.batches ?? [])];
  const deliveries = [...(seed.deliveries ?? [])];

  return {
    async listAccounts() {
      return accounts.map((account) => ({ ...account }));
    },

    async getAccount(id) {
      const account = accounts.find((item) => item.id === id);
      return account ? { ...account } : null;
    },

    async createAccount(input) {
      if (input.isDefault) {
        for (const account of accounts) account.isDefault = false;
      }
      const account: EmailAccount = {
        id: crypto.randomUUID(),
        providerType: input.providerType,
        label: input.label,
        fromName: input.fromName,
        fromEmail: input.fromEmail,
        smtpHost: input.smtpHost ?? null,
        smtpPort: input.smtpPort ?? null,
        encryption: input.encryption ?? null,
        status: "unverified",
        hasSecret: input.hasSecret ?? false,
        isDefault: input.isDefault ?? accounts.length === 0,
        lastTestedAt: null,
        lastErrorCode: null,
        createdAt: input.now,
        updatedAt: input.now,
      };
      accounts.push(account);
      return { ...account };
    },

    async updateAccount(id, patch) {
      const index = accounts.findIndex((item) => item.id === id);
      if (index < 0) return null;
      if (patch.isDefault) {
        for (const account of accounts) account.isDefault = false;
      }
      const updated = { ...accounts[index], ...patch, updatedAt: new Date().toISOString() };
      accounts[index] = updated;
      return { ...updated };
    },

    async disableAccount(id, at) {
      const index = accounts.findIndex((item) => item.id === id);
      if (index < 0) return null;
      accounts[index] = { ...accounts[index], status: "disabled", updatedAt: at };
      return { ...accounts[index] };
    },

    async listTemplates() {
      return templates.map((template) => structuredClone(template));
    },

    async getTemplate(id) {
      const template = templates.find((item) => item.id === id);
      return template ? structuredClone(template) : null;
    },

    async createTemplate(input) {
      const template: EmailTemplate = {
        id: crypto.randomUUID(),
        name: input.name,
        description: input.description ?? null,
        category: input.category ?? null,
        subjectTemplate: input.subjectTemplate,
        preheaderText: input.preheaderText ?? null,
        isPreset: input.isPreset ?? false,
        status: input.status ?? "draft",
        editorDocument: structuredClone(input.editorDocument),
        schemaVersion: 1,
        renderedHtml: null,
        renderedText: null,
        updatedAt: input.now,
      };
      templates.push(template);
      return structuredClone(template);
    },

    async updateTemplate(id, patch) {
      const index = templates.findIndex((item) => item.id === id);
      if (index < 0) return null;
      const updated = structuredClone({ ...templates[index], ...patch, updatedAt: new Date().toISOString() });
      templates[index] = updated;
      return structuredClone(updated);
    },

    async duplicateTemplate(id, now) {
      const source = templates.find((item) => item.id === id);
      if (!source) return null;
      const copy: EmailTemplate = {
        ...structuredClone(source),
        id: crypto.randomUUID(),
        name: `${source.name} 副本`,
        isPreset: false,
        status: "draft",
        renderedHtml: null,
        renderedText: null,
        updatedAt: now,
      };
      templates.push(copy);
      return structuredClone(copy);
    },

    async listBatches() {
      return batches.map((batch) => ({ ...batch }));
    },

    async findBatchByIdempotencyKey(key) {
      const batch = batches.find((item) => item.idempotencyKey === key);
      return batch ? { ...batch } : null;
    },

    async getBatch(id) {
      const batch = batches.find((item) => item.id === id);
      return batch ? { ...batch } : null;
    },

    async createBatch(batch) {
      batches.push({ ...batch });
      return { ...batch };
    },

    async updateBatch(id, patch) {
      const index = batches.findIndex((item) => item.id === id);
      if (index < 0) return null;
      const updated = { ...batches[index], ...patch };
      batches[index] = updated;
      return { ...updated };
    },

    async listDeliveries(batchId) {
      return deliveries
        .filter((item) => item.batchId === batchId)
        .map((item) => ({ ...item }));
    },

    async createDeliveries(rows) {
      deliveries.push(...rows.map((row) => ({ ...row })));
      return rows.map((row) => ({ ...row }));
    },

    async updateDelivery(id, patch) {
      const index = deliveries.findIndex((item) => item.id === id);
      if (index < 0) return null;
      const updated = { ...deliveries[index], ...patch };
      deliveries[index] = updated;
      return { ...updated };
    },
  };
}
