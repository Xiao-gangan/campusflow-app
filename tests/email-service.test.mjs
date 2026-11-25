import test from "node:test";
import assert from "node:assert/strict";
import {
  EmailProviderError,
  createEmailService,
} from "../shared/email/service.ts";
import { MockEmailTransport } from "../shared/email/mock-provider.ts";
import { createMemoryEmailRepository } from "../shared/data/memory-email-repository.ts";

const NOW = () => new Date("2026-11-10T00:00:00.000Z");

function editorDocument(text = "你好 {{candidate_name}}") {
  return {
    schemaVersion: 1,
    settings: {
      width: 600,
      background: "#f4f1ea",
      fontFamily: "Arial",
      textColor: "#182420",
    },
    blocks: [{ id: "text", type: "text", props: { text } }],
  };
}

async function setup(transport = new MockEmailTransport()) {
  const repository = createMemoryEmailRepository();
  const service = createEmailService({
    repository,
    transport,
    now: NOW,
  });
  const account = await service.createAccount({
    providerType: "qq",
    label: "QQ 测试账号",
    fromName: "CampusFlow",
    fromEmail: "club@example.test",
    hasSecret: true,
  });
  const verified = await service.testAccount(account.id);
  const template = await service.createTemplate({
    name: "面试邀请",
    subjectTemplate: "【CampusFlow】{{candidate_name}} 面试邀请",
    editorDocument: editorDocument(
      "你好 {{candidate_name}}，面试时间：{{interview_time}}",
    ),
    status: "active",
  });
  return { repository, service, account: verified, template };
}

const recipients = [
  {
    sourceId: "applicant-1",
    sourceVersion: 1,
    email: "one@example.test",
    name: "一",
    context: { interview_time: "周六 14:00" },
  },
  {
    sourceId: "applicant-2",
    sourceVersion: 1,
    email: "two@example.test",
    name: "二",
    context: { interview_time: "周六 15:00" },
  },
];

test("accounts and templates support CRUD, verification and duplication", async () => {
  const { repository, service, account, template } = await setup();

  assert.equal(account.status, "verified");
  assert.equal(account.hasSecret, true);
  assert.equal("secret" in account, false);
  assert.equal((await service.listAccounts()).length, 1);
  assert.equal((await repository.getAccount(account.id)).status, "verified");

  const duplicate = await service.duplicateTemplate(template.id);
  assert.notEqual(duplicate.id, template.id);
  assert.equal(duplicate.name, "面试邀请 副本");
  assert.equal(duplicate.status, "draft");
  assert.equal((await service.listTemplates()).length, 2);

  const preview = await service.previewTemplate(template.id, {
    candidate_name: "张三",
    interview_time: "周六 14:00",
  });
  assert.match(preview.subject, /张三/);
  assert.match(preview.text, /周六 14:00/);

  const disabled = await service.disableAccount(account.id);
  assert.equal(disabled.status, "disabled");
});

test("preflight excludes ineligible recipients and batch creation is idempotent", async () => {
  const { service, template, account } = await setup();
  const mixed = [
    ...recipients,
    {
      sourceId: "applicant-3",
      sourceVersion: 1,
      email: "three@example.test",
      name: "三",
      context: {},
      eligible: false,
      issues: ["邀请已撤销。"],
    },
  ];

  const preflight = await service.preflight({
    templateId: template.id,
    recipients: mixed,
  });
  assert.equal(preflight.total, 3);
  assert.equal(preflight.eligible, 2);
  assert.equal(preflight.excluded, 1);

  const input = {
    name: "第一批",
    templateId: template.id,
    accountId: account.id,
    mode: "send",
    sourceModule: "recruitment",
    recipients: mixed,
    idempotencyKey: "batch-key-1",
  };
  const first = await service.createBatch(input);
  const second = await service.createBatch(input);

  assert.equal(first.id, second.id);
  assert.equal(first.totalCount, 3);
  assert.equal(first.pendingCount, 2);
  assert.equal(first.skippedCount, 1);
  assert.equal((await service.listDeliveries(first.id)).length, 2);
});

test("mock sending records simulated deliveries and never retries sent mail", async () => {
  const { service, template, account } = await setup();
  const batch = await service.createBatch({
    name: "Mock 发送",
    templateId: template.id,
    accountId: account.id,
    mode: "send",
    sourceModule: "recruitment",
    recipients,
    idempotencyKey: "batch-key-send",
  });

  const sent = await service.sendBatch(batch.id);
  assert.equal(sent.status, "sent");
  assert.equal(sent.simulatedCount, 2);

  const deliveries = await service.listDeliveries(batch.id);
  assert.equal(deliveries.every((item) => item.status === "simulated"), true);
  assert.equal(deliveries.every((item) => item.attemptCount === 1), true);
  assert.equal(deliveries.every((item) => item.providerMessageId), true);

  const retry = await service.retryBatch(batch.id);
  assert.equal(retry.status, "sent");
  const afterRetry = await service.listDeliveries(batch.id);
  assert.equal(afterRetry.every((item) => item.attemptCount === 1), true);
});

test("retryable failures can retry; non-retryable failures cannot", async () => {
  let flakyAttempts = 0;
  const flaky = {
    name: "mock",
    async send() {
      flakyAttempts += 1;
      if (flakyAttempts === 1) {
        throw new EmailProviderError("TEMP", "临时失败", true);
      }
      return { providerMessageId: "mock-retry", status: "simulated" };
    },
    async testAccount() {
      return { ok: true, code: "mock_verified" };
    },
    async sendTest() {
      return { ok: true, code: "mock_test_sent" };
    },
  };
  const flakySetup = await setup(flaky);
  const flakyBatch = await flakySetup.service.createBatch({
    name: "可重试",
    templateId: flakySetup.template.id,
    accountId: flakySetup.account.id,
    mode: "send",
    sourceModule: "recruitment",
    recipients: [recipients[0]],
    idempotencyKey: "batch-key-retry",
  });
  const failed = await flakySetup.service.sendBatch(flakyBatch.id);
  assert.equal(failed.status, "failed");
  assert.equal((await flakySetup.service.listDeliveries(flakyBatch.id))[0].retryable, true);

  const retried = await flakySetup.service.retryBatch(flakyBatch.id);
  assert.equal(retried.status, "sent");
  assert.equal(flakyAttempts, 2);
  const retriedDelivery = (await flakySetup.service.listDeliveries(flakyBatch.id))[0];
  assert.equal(retriedDelivery.status, "simulated");
  assert.equal(retriedDelivery.attemptCount, 2);

  let nonRetryableAttempts = 0;
  const nonRetryable = {
    name: "mock",
    async send() {
      nonRetryableAttempts += 1;
      throw new EmailProviderError("AUTH", "认证失败", false);
    },
    async testAccount() {
      return { ok: true, code: "mock_verified" };
    },
    async sendTest() {
      return { ok: true, code: "mock_test_sent" };
    },
  };
  const nonRetryableSetup = await setup(nonRetryable);
  const nonRetryableBatch = await nonRetryableSetup.service.createBatch({
    name: "不可重试",
    templateId: nonRetryableSetup.template.id,
    accountId: nonRetryableSetup.account.id,
    mode: "send",
    sourceModule: "recruitment",
    recipients: [recipients[0]],
    idempotencyKey: "batch-key-non-retry",
  });
  await nonRetryableSetup.service.sendBatch(nonRetryableBatch.id);
  await nonRetryableSetup.service.retryBatch(nonRetryableBatch.id);
  assert.equal(nonRetryableAttempts, 1);
  assert.equal(
    (await nonRetryableSetup.service.listDeliveries(nonRetryableBatch.id))[0].retryable,
    false,
  );
});

test("sending rechecks eligibility and version before provider call", async () => {
  let currentVersion = 1;
  const repository = createMemoryEmailRepository();
  const service = createEmailService({
    repository,
    transport: new MockEmailTransport(),
    now: NOW,
    checkEligibility: ({ sourceVersion }) => ({
      eligible: sourceVersion === currentVersion,
      issues: sourceVersion === currentVersion ? [] : ["邀请版本已变化。"],
    }),
  });
  const account = await service.testAccount(
    (
      await service.createAccount({
        providerType: "qq",
        label: "QQ",
        fromName: "CampusFlow",
        fromEmail: "club@example.test",
      })
    ).id,
  );
  const template = await service.createTemplate({
    name: "版本校验",
    subjectTemplate: "测试",
    editorDocument: editorDocument(),
    status: "active",
  });
  const batch = await service.createBatch({
    name: "版本校验",
    templateId: template.id,
    accountId: account.id,
    mode: "send",
    sourceModule: "recruitment",
    recipients: [recipients[0]],
    idempotencyKey: "batch-key-version",
  });

  currentVersion = 2;
  const sent = await service.sendBatch(batch.id);
  assert.equal(sent.skippedCount, 1);
  assert.equal((await service.listDeliveries(batch.id))[0].status, "skipped");
});

test("cancel only cancels pending deliveries and test inbox creates no formal batch", async () => {
  let sends = 0;
  const spy = {
    name: "mock",
    async send() {
      sends += 1;
      return { providerMessageId: "mock", status: "simulated" };
    },
    async testAccount() {
      return { ok: true, code: "mock_verified" };
    },
    async sendTest() {
      return { ok: true, code: "mock_test_sent" };
    },
  };
  const { repository, service, account, template } = await setup(spy);
  const batch = await service.createBatch({
    name: "待取消",
    templateId: template.id,
    accountId: account.id,
    mode: "send",
    sourceModule: "recruitment",
    recipients,
    idempotencyKey: "batch-key-cancel",
  });
  const cancelled = await service.cancelBatch(batch.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancelledCount, 2);
  await service.sendBatch(batch.id);
  assert.equal(sends, 0);

  const before = (await repository.listBatches()).length;
  const testSend = await service.testSendTemplate({
    templateId: template.id,
    accountId: account.id,
    to: "tester@example.test",
    context: { candidate_name: "测试", interview_time: "周六" },
  });
  assert.equal(testSend.ok, true);
  assert.equal((await repository.listBatches()).length, before);
  assert.equal(sends, 0);
});

test("send mode requires a verified account and active template; dry run is allowed", async () => {
  const repository = createMemoryEmailRepository();
  const service = createEmailService({
    repository,
    transport: new MockEmailTransport(),
    now: NOW,
  });
  const account = await service.createAccount({
    providerType: "qq",
    label: "未验证",
    fromName: "CampusFlow",
    fromEmail: "club@example.test",
  });
  const draft = await service.createTemplate({
    name: "草稿",
    subjectTemplate: "测试",
    editorDocument: editorDocument(),
    status: "draft",
  });

  await assert.rejects(
    () =>
      service.createBatch({
        name: "不可发送",
        templateId: draft.id,
        accountId: account.id,
        mode: "send",
        sourceModule: "recruitment",
        recipients: [recipients[0]],
        idempotencyKey: "batch-key-unverified",
      }),
    (error) => error.code === "account_not_verified",
  );

  await service.testAccount(account.id);
  await assert.rejects(
    () =>
      service.createBatch({
        name: "草稿模板",
        templateId: draft.id,
        accountId: account.id,
        mode: "send",
        sourceModule: "recruitment",
        recipients: [recipients[0]],
        idempotencyKey: "batch-key-draft",
      }),
    (error) => error.code === "template_not_active",
  );

  const dryRun = await service.createBatch({
    name: "Dry Run",
    templateId: draft.id,
    accountId: account.id,
    mode: "dry_run",
    sourceModule: "recruitment",
    recipients: [recipients[0]],
    idempotencyKey: "batch-key-dry",
  });
  assert.equal(dryRun.status, "preflight");
  assert.equal((await service.sendBatch(dryRun.id)).status, "preflight");
});
