import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openAgentStore } from "../dev/open-api/store.ts";
import { templateInput } from "../dev/open-api/templates.ts";
import { getBatchDetail, sendMail } from "../dev/recruitment/api.ts";
import { openLocalEmailRepository } from "../dev/recruitment/email-repository.ts";
import { createLocalMailService, ensureDemoAccounts } from "../dev/recruitment/mail.ts";
import { openSmtpSecretVault } from "../dev/recruitment/smtp-secrets.ts";
import { openSmtpAccountStore, testSmtpAccount } from "../dev/recruitment/smtp-store.ts";
import { renderSmtpTestTemplate } from "../dev/recruitment/smtp-template.ts";
import { buildSmtpTestMessage } from "../dev/recruitment/smtp-transport.ts";
import { rsvpMiddleware } from "../dev/rsvp/plugin.ts";
import { openRsvpStore } from "../dev/rsvp/store.ts";
import { createDefaultDocument } from "../shared/domain/design.ts";
import { forwardingExport, forwardingMessage } from "../shared/recruitment/invite-forwarding.ts";

const file = () => join(mkdtempSync(join(tmpdir(), "campusflow-mail-forwarding-")), "workspace.sqlite");
const sender = {
  provider: "qq", label: "验收发件人", fromName: "社团招新组",
  fromEmail: "sender@example.test", credential: "local-fixture-auth",
};
const recipient = "test-recipient@example.test";
const templates = () => {
  const blocks = createDefaultDocument("email");
  blocks.meta.subjectTemplate = "{{organization_name}} · {{candidate_name}}\r\nBcc: 任意";
  const html = {
    ...blocks, mode: "html", blocks: [],
    customHtml: { html: '<h1>{{organization_name}}</h1><p>{{candidate_name}}</p><a href="{{rsvp_link}}" onclick="alert(1)">答复</a><script>window.exposed()</script>', source: "import" },
  };
  return { blocks, html };
};

function saveTemplate(agent, document) {
  return agent.writeTemplate(crypto.randomUUID(), templateInput({ name: "用于测试发送", document }, true), "create");
}

test("saved block and free HTML templates build correctly encoded multipart/alternative MIME", () => {
  const db = file();
  const agent = openAgentStore(db);
  const smtp = openSmtpAccountStore(db, openSmtpSecretVault(db, {}));
  try {
    const account = smtp.create(sender);
    const organizationName = "校园招新协作团队".repeat(14);
    for (const mode of ["blocks", "html"]) {
      const saved = saveTemplate(agent, templates()[mode]);
      const message = renderSmtpTestTemplate(agent, { id: saved.id, organizationName });
      const mime = buildSmtpTestMessage(account, recipient, message);
      assert.match(mime, /\r\nContent-Type: multipart\/alternative; boundary="[^"]+"/u);
      const boundary = /boundary="([^"]+)"/u.exec(mime)[1];
      const [headers, plain, html, trailer] = mime.split("--" + boundary);
      assert.ok(!/^Bcc:/imu.test(headers));
      const decodedSubject = [...headers.matchAll(/^Subject: (.*(?:\r\n [^\r\n]+)*)/gmu)][0][1]
        .matchAll(/=\?UTF-8\?B\?([^?]+)\?=/gu);
      assert.equal([...decodedSubject].map(([encoded, value]) => {
        assert.ok(encoded.length <= 75);
        return Buffer.from(value, "base64").toString("utf8");
      }).join(""), message.subject);
      assert.ok(message.subject.includes(organizationName));
      function decode(part, type) {
        assert.ok(part.includes(`Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n`));
        const body = part.split("\r\n\r\n")[1].trim();
        assert.ok(body.split("\r\n").every((line) => line.length <= 76));
        return Buffer.from(body, "base64").toString("utf8");
      }
      assert.equal(decode(plain, "text/plain"), message.bodyText);
      const htmlBody = decode(html, "text/html");
      assert.equal(htmlBody, message.bodyHtml);
      assert.ok(htmlBody.includes("https://example.test/invite/sample"));
      assert.doesNotMatch(htmlBody, /<script|onclick=/iu);
      assert.equal(trailer, "--");
    }
    assert.throws(() => buildSmtpTestMessage(account, recipient, { subject: "测试\r\nBcc: leak@example.test", bodyText: "纯文本" }), /邮件头/u);
    const fallback = buildSmtpTestMessage(account, recipient, { subject: "固定测试", bodyText: "纯文本" });
    assert.match(fallback, /Content-Type: text\/plain; charset=UTF-8/u);
    assert.doesNotMatch(fallback, /multipart|text\/html/u);
  } finally { smtp.close(); agent.close(); }
});

test("HTTP test send validates saved email templates and saves synthetic subject and text", async (t) => {
  const db = file();
  const agent = openAgentStore(db);
  const smtp = openSmtpAccountStore(db, openSmtpSecretVault(db, {}));
  const account = smtp.create(sender);
  const saved = saveTemplate(agent, templates().html);
  const invite = saveTemplate(agent, createDefaultDocument("invite_page"));
  const settings = { CAMPUSFLOW_REAL_MAIL_TEST: "1", CAMPUSFLOW_REAL_SMTP_TEST: "0", CAMPUSFLOW_TEST_RECIPIENT: recipient };
  const before = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  const server = createServer(rsvpMiddleware(() => { throw new Error("RSVP store is unused"); }, undefined, () => smtp, () => agent));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    smtp.close();
    agent.close();
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const origin = "http://127.0.0.1:" + server.address().port;
  const request = (input) => fetch(origin + "/api/local-demo/mail/smtp-accounts/" + account.id + "/test", {
    method: "POST",
    headers: { Origin: origin, "X-CampusFlow-Demo": "1", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  assert.equal((await request({ to: recipient, templateId: {} })).status, 400);
  assert.equal((await request({ to: recipient, templateId: "bad-id" })).status, 400);
  assert.equal((await request({ to: recipient, templateId: crypto.randomUUID() })).status, 404);
  assert.equal((await request({ to: recipient, templateId: invite.id })).status, 400);
  const denied = await (await request({ to: "other@example.test", templateId: saved.id })).json();
  assert.equal(denied.data.code, "recipient_not_allowed");
  assert.equal(smtp.listInbox().length, 0);
  const result = await (await request({
    to: recipient, templateId: saved.id, organizationName: "树影社",
    bodyHtml: "<h1>不得采用客户端 HTML</h1>",
  })).json();
  assert.equal(result.data.mode, "synthetic");
  assert.equal(result.data.ok, true);
  assert.ok(result.data.inboxItem.subject.includes("树影社"));
  assert.ok(result.data.inboxItem.bodyText.includes("林知夏"));
  assert.doesNotMatch(result.data.inboxItem.bodyText, /不得采用客户端|window.exposed/u);
  const simple = await (await request({ to: recipient })).json();
  assert.equal(simple.data.inboxItem.subject, "CampusFlow 本机合成发件测试");

  let sends = 0;
  const transport = {
    async sendTest(options) {
      sends += 1;
      assert.equal(options.recipient, recipient);
      assert.ok(options.message.bodyHtml);
      return { ok: true, code: "accepted", method: "real", ...options.message };
    },
  };
  const config = { mode: "real", recipient };
  const render = () => renderSmtpTestTemplate(agent, { id: saved.id });
  assert.equal((await testSmtpAccount(smtp, config, account.id, "blocked@example.test", transport, render)).code, "recipient_not_allowed");
  assert.equal(sends, 0);
  assert.equal((await testSmtpAccount(smtp, config, account.id, recipient, transport, render)).ok, true);
  assert.equal(sends, 1);
});

test("forwarding formats include interview details, UTF-8 BOM, CSV escaping and skip invalid links", () => {
  const invite = { status: "valid", roundName: "+二面", expiresAt: "2027-01-02T09:00:00.000Z",
    interviewDate: "2027-01-01", startTime: "14:00", endTime: "14:30", location: '@A, "一楼"' };
  const valid = { candidateName: "=候选人", toEmail: "-team@example.test", rsvpUrl: "https://example.test/new", invite };
  const rotated = { ...valid, rsvpUrl: "https://example.test/old", invite: { ...invite, status: "rotated" } };
  const txt = forwardingExport([valid, rotated], "txt");
  assert.equal(txt, forwardingMessage(valid));
  assert.match(txt, /2027-01-01 14:00–14:30/u);
  assert.match(txt, /面试地点：@A, "一楼"/u);
  assert.match(txt, /2027\/01\/02 17:00（北京时间）/u);
  assert.doesNotMatch(txt, /\/old/u);
  const csv = forwardingExport([valid, rotated], "csv");
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(Buffer.from(csv).subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])));
  for (const escaped of ["'=候选人", "'+二面", "'-team@example.test", '\'@A, ""一楼""'])
    assert.ok(csv.includes(escaped), escaped);
  assert.doesNotMatch(csv, /\/old/u);
  assert.equal(csv.split("\r\n").length, 2);
});

test("batch detail validates the sent token independent of RSVP version and marks rotation, revocation and expiry", async (t) => {
  const db = file();
  let now = new Date();
  const store = openRsvpStore(db, () => now);
  const repository = openLocalEmailRepository(db);
  t.after(() => { repository.close(); store.close(); });
  const service = createLocalMailService(repository, () => ({ eligible: true, issues: [] }));
  const [account] = await ensureDemoAccounts(service);
  const candidates = store.listCandidates().filter(({ email }) => !email.includes("fail"));
  const expiry = new Date(now.getTime() + 86_400_000);
  const send = () => sendMail(store, repository, service, {
    candidateIds: candidates.map(({ id }) => id), expiresAt: expiry.toISOString(), accountId: account.id,
    batchName: "链接验收", roundId: "round-2", idempotencyKey: crypto.randomUUID(),
    emailDocument: createDefaultDocument("email"), inviteDocument: createDefaultDocument("invite_page"),
  }, "http://127.0.0.1:5350");
  const initial = await send();
  const [first, second] = initial.deliveries;
  assert.ok(initial.deliveries.every(({ invite }) => invite.roundName === "二面" && invite.status === "valid"));
  const token = new URLSearchParams(new URL(first.rsvpUrl).hash.split("?")[1]).get("token");
  const original = await store.view(token);
  await store.respond(token, "attending", original.version);
  const afterRsvp = await getBatchDetail(store, repository, service, initial.batch.id);
  assert.equal(afterRsvp.deliveries.find(({ id }) => id === first.id).rsvpUrl, first.rsvpUrl);
  await store.rotate(first.inviteId);
  store.revoke(second.inviteId);
  const stale = await getBatchDetail(store, repository, service, initial.batch.id);
  assert.equal(stale.deliveries.find(({ id }) => id === first.id).invite.status, "rotated");
  assert.equal(stale.deliveries.find(({ id }) => id === second.id).invite.status, "revoked");
  assert.ok(stale.deliveries.every((delivery) => delivery.rsvpUrl === ""));
  assert.equal(forwardingExport(stale.deliveries, "txt"), "");

  const fresh = await send();
  now = new Date(expiry.getTime() + 1);
  const expired = await getBatchDetail(store, repository, service, fresh.batch.id);
  assert.ok(expired.deliveries.every(({ invite, rsvpUrl }) => invite.status === "expired" && rsvpUrl === ""));
});
