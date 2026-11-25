import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { openRsvpStore } from "../dev/rsvp/store.ts";
import { rsvpMiddleware } from "../dev/rsvp/plugin.ts";
import { openLocalEmailRepository } from "../dev/recruitment/email-repository.ts";
import { createLocalMailService, ensureDemoAccounts } from "../dev/recruitment/mail.ts";
import { openSmtpAccountStore } from "../dev/recruitment/smtp-store.ts";
import { openSmtpSecretVault } from "../dev/recruitment/smtp-secrets.ts";
import { buildSmtpTestMessage } from "../dev/recruitment/smtp-transport.ts";
import {
  importCandidates,
  listRoster,
  previewMail,
  sendMail,
  retryBatch,
} from "../dev/recruitment/api.ts";
import { createDefaultDocument, updateBlockProps } from "../shared/domain/design.ts";
import { createInvitePresetDocument } from "../shared/invite/presets.ts";
import { createSecretToken, hashToken } from "../shared/security/tokens.ts";

async function tempDb(name) {
  const dir = await mkdtemp(join(tmpdir(), "campusflow-recruitment-"));
  return join(dir, name);
}

const future = () => new Date(Date.now() + 86400000).toISOString();

async function openDemo(filename, smtp) {
  const store = openRsvpStore(filename);
  const repository = openLocalEmailRepository(filename);
  const service = createLocalMailService(repository, async (delivery) => {
    const link = repository.getDeliveryLink(delivery.id);
    if (!link) return { eligible: false, issues: ["缺少邀请关联。"] };
    const invite = store.getInvite(link.inviteId);
    if (!invite) return { eligible: false, issues: ["邀请不存在。"] };
    if (invite.revokedAt || invite.status === "revoked" || Date.parse(invite.expiresAt) <= Date.now())
      return { eligible: false, issues: ["邀请已撤销或过期。"] };
    if (invite.version !== delivery.sourceVersion)
      return { eligible: false, issues: ["邀请版本已变化。"] };
    return { eligible: true, issues: [] };
  }, smtp);
  const accounts = await ensureDemoAccounts(service);
  return { store, repository, service, account: accounts[0] };
}

async function serveDemo(t, opened) {
  const handler = rsvpMiddleware(
    () => opened.store,
    async () => ({ repository: opened.repository, service: opened.service }),
  );
  const server = http.createServer((req, res) =>
    handler(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("same-origin browser GET works without Origin but no-proof and cross-site requests stay blocked", async (t) => {
  const opened = await openDemo(await tempDb("origin-proof.sqlite"));
  t.after(() => {
    opened.store.close();
    opened.repository.close();
  });
  const base = await serveDemo(t, opened);
  const demo = { "X-CampusFlow-Demo": "1" };
  const get = (path, headers) => fetch(base + path, { headers });
  const candidates = "/api/local-demo/recruitment/candidates";

  assert.equal((await get(candidates, demo)).status, 403);
  assert.equal(
    (await get(candidates, { ...demo, "Sec-Fetch-Site": "cross-site" })).status,
    403,
  );
  assert.equal(
    (await get(candidates, {
      ...demo,
      Origin: "https://example.invalid",
      "Sec-Fetch-Site": "same-origin",
    })).status,
    403,
  );
  const allowed = await get(candidates, { ...demo, "Sec-Fetch-Site": "same-origin" });
  assert.equal(allowed.status, 200);
  assert.ok((await allowed.json()).data.length >= 2);
  assert.equal(
    (await get("/api/local-demo/mail/accounts", { ...demo, "Sec-Fetch-Site": "same-origin" })).status,
    200,
  );
  assert.equal(
    (await get("/api/local-demo/mail/batches", { ...demo, "Sec-Fetch-Site": "same-origin" })).status,
    200,
  );
});

test("opening the mail repository creates a missing parent directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "campusflow-mail-parent-"));
  const filename = join(dir, "nested", "deeper", "mail.sqlite");
  const repository = openLocalEmailRepository(filename);
  try {
    assert.equal(existsSync(filename), true);
  } finally {
    repository.close();
  }
});

test("legacy demo_interview without candidate_id upgrades before adding the index and keeps answered links", async () => {
  const filename = await tempDb("legacy.sqlite");
  const token = createSecretToken();
  const tokenHash = await hashToken(token);
  const now = new Date().toISOString();
  const invite = {
    id: crypto.randomUUID(),
    applicantId: "legacy-applicant",
    tokenHash,
    status: "sent",
    rsvpStatus: "confirmed",
    version: 2,
    expiresAt: future(),
    revokedAt: null,
    sentAt: now,
    respondedAt: now,
    interviewDate: "2026-11-25",
    startTime: "14:00",
    endTime: "14:30",
    location: "信息楼 A302",
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
  const legacy = new DatabaseSync(filename);
  legacy.exec(`CREATE TABLE demo_interview (
    id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, state TEXT NOT NULL,
    document TEXT NOT NULL, context TEXT NOT NULL
  )`);
  legacy.prepare("INSERT INTO demo_interview VALUES (?,?,?,?,?)").run(
    invite.id,
    tokenHash,
    JSON.stringify(invite),
    JSON.stringify(createInvitePresetDocument("formal")),
    JSON.stringify({ candidate_name: "旧版候选人", organization_name: "旧组织" }),
  );
  legacy.close();

  const store = openRsvpStore(filename);
  try {
    const viewed = await store.view(token);
    assert.equal(viewed.rsvpStatus, "confirmed");
    assert.equal(viewed.context.candidate_name, "旧版候选人");
    assert.equal(store.listCandidates().length >= 2, true);
    const candidate = store.listCandidates()[0];
    const issued = await store.issue(createInvitePresetDocument("formal"), future(), candidate);
    assert.ok(issued.token);
    assert.equal(store.countInvites(candidate.id), 1);
    const upgraded = new DatabaseSync(filename, { readOnly: true });
    try {
      const columns = upgraded.prepare("PRAGMA table_info(demo_interview)").all().map((row) => row.name);
      assert.ok(columns.includes("candidate_id"));
      assert.ok(upgraded.prepare("PRAGMA index_list(demo_interview)").all().some((row) => row.name === "demo_interview_candidate"));
    } finally {
      upgraded.close();
    }
  } finally {
    store.close();
  }
});

test("same idempotency key claims before issuing so concurrent requests do not create duplicate invitations", async () => {
  const { store, repository, service, account } = await openDemo(await tempDb("idempotent.sqlite"));
  try {
    const candidates = store.listCandidates().filter((row) => !row.email.includes("fail")).slice(0, 2);
    const request = {
      candidateIds: candidates.map((candidate) => candidate.id),
      emailDocument: createDefaultDocument("email"),
      inviteDocument: createInvitePresetDocument("formal"),
      expiresAt: future(),
      batchName: "并发幂等测试",
      accountId: account.id,
      idempotencyKey: "same-concurrent-key",
    };
    const results = await Promise.all([
      sendMail(store, repository, service, request, "http://127.0.0.1:5191"),
      sendMail(store, repository, service, request, "http://127.0.0.1:5191"),
    ]);
    assert.equal(new Set(results.map((result) => result.batch.id)).size, 1);
    for (const candidate of candidates) assert.equal(store.countInvites(candidate.id), 1);
    assert.equal((await repository.listBatches()).length, 1);
    assert.equal(results[0].deliveries.length, candidates.length);
    for (const candidate of candidates) {
      const deliveries = results[0].deliveries.filter((delivery) => delivery.candidateId === candidate.id);
      assert.equal(deliveries.length, 1);
      assert.equal(deliveries[0].status, "simulated");
    }
  } finally {
    store.close();
    repository.close();
  }
});

test("a failed account check releases the idempotency key; corrected retry and replay keep one batch", async (t) => {
  const opened = await openDemo(await tempDb("account-recovery.sqlite"));
  t.after(() => {
    opened.store.close();
    opened.repository.close();
  });
  const base = await serveDemo(t, opened);
  const candidate = opened.store.listCandidates().find((row) => !row.email.includes("fail"));
  const request = {
    candidateIds: [candidate.id],
    emailDocument: createDefaultDocument("email"),
    inviteDocument: createInvitePresetDocument("formal"),
    expiresAt: future(),
    batchName: "账号纠正测试",
    accountId: opened.account.id,
    idempotencyKey: "account-recovery-key",
  };
  const post = (body) =>
    fetch(base + "/api/local-demo/mail/batches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        "X-CampusFlow-Demo": "1",
      },
      body: JSON.stringify(body),
    });

  const invalid = await post({ ...request, accountId: "missing-account" });
  assert.equal(invalid.status, 400);
  assert.equal((await opened.repository.listBatches()).length, 0);
  assert.equal(opened.store.countInvites(candidate.id), 0);

  const corrected = await post(request);
  assert.equal(corrected.status, 200);
  const first = (await corrected.json()).data;
  assert.equal((await opened.repository.listBatches()).length, 1);
  assert.equal(opened.store.countInvites(candidate.id), 1);
  assert.equal(first.deliveries.length, 1);
  assert.equal(first.deliveries[0].status, "simulated");

  const replay = await post(request);
  assert.equal(replay.status, 200);
  const second = (await replay.json()).data;
  assert.equal(second.batch.id, first.batch.id);
  assert.equal((await opened.repository.listBatches()).length, 1);
  assert.equal(opened.store.countInvites(candidate.id), 1);
  assert.equal(second.deliveries.length, 1);
});

test("preview blocks an interview email without a usable candidate link", async () => {
  const { store, repository } = await openDemo(await tempDb("link.sqlite"));
  try {
    const candidate = store.listCandidates()[0];
    const document = createDefaultDocument("email");
    const button = document.blocks.find((block) => block.type === "button");
    const noLink = updateBlockProps(document, button.id, { url: "https://example.test/no-invite-link" });
    const preview = previewMail(store, {
      candidateIds: [candidate.id],
      emailDocument: noLink,
      inviteDocument: createInvitePresetDocument("formal"),
      expiresAt: future(),
    }, "http://127.0.0.1:5191");
    assert.equal(preview.eligible, 0);
    assert.equal(preview.excluded, 1);
    assert.match(preview.items[0].issues.join(" "), /出席确认入口/u);
  } finally {
    store.close();
    repository.close();
  }
});

test("retry rechecks the linked invitation; a revoked invite is skipped instead of resending the old link", async () => {
  const { store, repository, service, account } = await openDemo(await tempDb("retry.sqlite"));
  try {
    const candidate = store.listCandidates().find((row) => row.email.includes("fail"));
    assert.ok(candidate);
    const sent = await sendMail(store, repository, service, {
      candidateIds: [candidate.id],
      emailDocument: createDefaultDocument("email"),
      inviteDocument: createInvitePresetDocument("formal"),
      expiresAt: future(),
      batchName: "失败重试测试",
      accountId: account.id,
      idempotencyKey: "retry-revoked-key",
    }, "http://127.0.0.1:5191");
    assert.equal(sent.deliveries[0].status, "failed");
    const firstLink = sent.deliveries[0].rsvpUrl;
    assert.ok(firstLink);
    store.revoke(sent.deliveries[0].inviteId);
    const retried = await retryBatch(store, repository, service, sent.batch.id);
    assert.equal(retried?.deliveries[0].status, "skipped");
    assert.equal(retried?.deliveries[0].attemptCount, 1);
    assert.match(retried?.deliveries[0].errorMessage ?? "", /撤销|过期|版本/u);
  } finally {
    store.close();
    repository.close();
  }
});

test("CTA check canonicalizes the actual href and never treats bare text variables as a link", async () => {
  const { store, repository } = await openDemo(await tempDb("cta.sqlite"));
  try {
    const candidate = store.listCandidates().find((row) => !row.email.includes("fail"));
    const base = "http://127.0.0.1:5191";
    const request = {
      candidateIds: [candidate.id],
      emailDocument: createDefaultDocument("email"),
      inviteDocument: createInvitePresetDocument("formal"),
      expiresAt: future(),
    };
    const linked = previewMail(store, request, base);
    assert.equal(linked.eligible, 1);
    assert.equal(linked.items[0].issues.length, 0);
    assert.match(linked.items[0].html, /href="http:\/\/127\.0\.0\.1:5191\/#\/invite\/rsvp\?token=preview-/u);

    const document = request.emailDocument;
    const button = document.blocks.find((block) => block.type === "button");
    const text = document.blocks.find((block) => block.type === "text");
    const bare = updateBlockProps(
      { ...document, blocks: document.blocks.filter((block) => block.id !== button.id) },
      text.id,
      { text: "{{rsvp_link}}" },
    );
    const blocked = previewMail(store, { ...request, emailDocument: bare }, base);
    assert.equal(blocked.eligible, 0);
    assert.match(blocked.items[0].issues.join(" "), /出席确认入口/u);
  } finally {
    store.close();
    repository.close();
  }
});

test("CSV import previews row errors and deduplicates both existing and in-file emails before commit", async () => {
  const { store, repository } = await openDemo(await tempDb("csv.sqlite"));
  try {
    const csv = [
      "姓名,邮箱,部门,阶段,备注",
      '苏晓,su.xiao@example.test,技术部,新申请,"CSV, 含逗号"',
      "林知夏,lin@example.test,技术部,面试,",
      "重复行,SU.XIAO@example.test,技术部,筛选,",
      "坏邮箱,not-an-email,运营部,新申请,",
      "错阶段,bad.stage@example.test,运营部,未知,",
    ].join("\n");
    const preview = importCandidates(store, { csv });
    assert.equal(preview.validCount, 1);
    assert.equal(preview.errorCount, 4);
    assert.equal(preview.duplicateCount, 2);
    assert.ok(preview.rows.some((row) => row.issues.includes("当前招新周期已存在该邮箱。")));
    assert.ok(preview.rows.some((row) => row.issues.includes("CSV 内邮箱重复。")));
    assert.equal(store.listCandidates().filter((row) => row.email === "su.xiao@example.test").length, 0);
    const committed = importCandidates(store, { csv, commit: true });
    assert.equal(committed.created.length, 1);
    assert.equal(committed.skipped.length, 0);
    const created = store.listCandidates().find((row) => row.email === "su.xiao@example.test");
    assert.equal(created?.name, "苏晓");
    assert.equal(created?.note, "CSV, 含逗号");
    assert.equal(created?.stage, "new");
  } finally {
    store.close();
    repository.close();
  }
});

test("two candidates receive isolated links and RSVP writes back to the matching roster row", async () => {
  const { store, repository, service, account } = await openDemo(await tempDb("isolation.sqlite"));
  try {
    const pair = store.listCandidates().filter((row) => !row.email.includes("fail")).slice(0, 2);
    assert.equal(pair.length, 2);
    const detail = await sendMail(store, repository, service, {
      candidateIds: pair.map((candidate) => candidate.id),
      emailDocument: createDefaultDocument("email"),
      inviteDocument: createInvitePresetDocument("formal"),
      expiresAt: future(),
      batchName: "双候选人隔离测试",
      accountId: account.id,
      idempotencyKey: "isolation-key",
    }, "http://127.0.0.1:5191");
    const deliveryFor = (candidate) =>
      detail.deliveries.find((delivery) => delivery.candidateId === candidate.id);
    const firstDelivery = deliveryFor(pair[0]);
    const secondDelivery = deliveryFor(pair[1]);
    assert.ok(firstDelivery?.rsvpUrl && secondDelivery?.rsvpUrl);
    const tokenOf = (delivery) => new URL(delivery.rsvpUrl).hash.split("token=")[1];
    const tokens = [tokenOf(firstDelivery), tokenOf(secondDelivery)];
    assert.equal(new Set(tokens).size, 2);
    const first = await store.view(tokens[0]);
    const second = await store.view(tokens[1]);
    assert.equal(first.context.candidate_name, pair[0].name);
    assert.equal(second.context.candidate_name, pair[1].name);
    await store.respond(tokens[0], "attending", first.version);
    assert.equal((await store.view(tokens[0])).rsvpStatus, "confirmed");
    assert.equal((await store.view(tokens[1])).rsvpStatus, "pending");
    const roster = listRoster(store, repository);
    const firstRow = roster.find((row) => row.id === pair[0].id);
    const secondRow = roster.find((row) => row.id === pair[1].id);
    assert.equal(firstRow.latestInvite.rsvpStatus, "confirmed");
    assert.equal(secondRow.latestInvite.rsvpStatus, "pending");
    assert.equal(firstRow.stage, pair[0].stage);
  } finally {
    store.close();
    repository.close();
  }
});
test("verified SMTP delivery requires explicit confirmation, uses multipart, and records outcomes without fallback", async () => {
  const file = await tempDb("real-mail-offline.sqlite");
  const smtp = openSmtpAccountStore(file, openSmtpSecretVault(file));
  const calls = [];
  let mode = "real";
  const { store, repository, service } = await openDemo(file, {
    store: () => smtp,
    mode: () => mode,
    async send({ account, credential, recipient, message }) {
      assert.equal(credential, "offline-test-credential");
      calls.push({ recipient, mime: buildSmtpTestMessage(account, recipient, message) });
      if (recipient.includes("fail")) throw new Error("offline SMTP rejection");
      return "offline-message-id";
    },
  });
  try {
    const account = smtp.create({
      provider: "qq", label: "离线脚本", fromName: "招新组",
      fromEmail: "sender@example.test", credential: "offline-test-credential",
    });
    smtp.setTestResult(account.id, true, "accepted", "synthetic");
    assert.equal((await service.listAccounts()).some(({ id }) => id === account.id), false);
    smtp.setTestResult(account.id, true, "accepted", "real");
    const listed = await service.listAccounts();
    assert.equal(listed.find(({ isDefault }) => isDefault).smtpHost, null);
    assert.match(listed.find(({ id }) => id === account.id).label, /真实 SMTP/u);
    const args = {
      candidateIds: store.listCandidates().slice(0, 2).map(({ id }) => id),
      emailDocument: createDefaultDocument("email"),
      inviteDocument: createInvitePresetDocument("formal"),
      expiresAt: future(),
      batchName: "离线批次测试",
      accountId: account.id,
      idempotencyKey: "offline-real-batch",
    };
    const base = "https://recruiting.example.test";
    await assert.rejects(sendMail(store, repository, service, args, base), /确认/u);
    assert.deepEqual(calls, []);
    const send = () => sendMail(store, repository, service, { ...args, confirmSmtp: true }, base);
    const sent = await send();
    await send();
    assert.equal(calls.length, 2);
    assert.deepEqual(sent.deliveries.map(({ status }) => status).sort(), ["failed", "sent"]);
    assert.ok(sent.deliveries.every(({ retryable }) => !retryable));
    assert.ok(sent.deliveries.every(({ rsvpUrl }) => rsvpUrl.startsWith(base + "#/invite/")));
    assert.match(calls[0].mime, /multipart\/alternative/);
    assert.match(calls[0].mime, /text\/plain/);
    assert.match(calls[0].mime, /text\/html/);
    mode = "synthetic";
    assert.equal((await service.listAccounts()).some(({ id }) => id === account.id), false);
    await assert.rejects(
      sendMail(store, repository, service, { ...args, confirmSmtp: true, idempotencyKey: "blocked-real-batch" }, base),
      /发件身份/u,
    );
  } finally {
    smtp.close();
    store.close();
    repository.close();
  }
});
