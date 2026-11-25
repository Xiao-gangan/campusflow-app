import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { openRsvpStore } from "../dev/rsvp/store.ts";
import { rsvpMiddleware } from "../dev/rsvp/plugin.ts";
import { openAgentStore } from "../dev/open-api/store.ts";
import { offerRoundTemplates, savedOfferPresets, presetRoundTemplates, savedTemplatePresets } from "../dev/open-api/template-presets.ts";
import { openLocalEmailRepository } from "../dev/recruitment/email-repository.ts";
import { createLocalMailService, ensureDemoAccounts } from "../dev/recruitment/mail.ts";
import { listRoster, previewMail, sendMail } from "../dev/recruitment/api.ts";
import { blankRound } from "../shared/recruitment/round-config.ts";
import { responseLabels } from "../shared/recruitment/round-presentation.ts";
import { OFFER_ROUND_ID } from "../shared/contracts/interview-rounds.ts";

const file = () => join(mkdtempSync(join(tmpdir(), "campusflow-phase4a-")), "workspace.sqlite");
const future = () => new Date(Date.now() + 86_400_000).toISOString();

async function httpFixture(t, filename = file()) {
  const store = openRsvpStore(filename);
  const agent = openAgentStore(filename);
  const server = createServer(rsvpMiddleware(() => store, undefined, undefined, () => agent));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); agent.close(); });
  const origin = "http://127.0.0.1:" + server.address().port;
  const call = (path, method = "GET", body, authorization) => fetch(origin + path, {
    method, headers: { Origin: origin, "X-CampusFlow-Demo": "1",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(authorization ? { Authorization: "Bearer " + authorization } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { store, agent, call };
}

test("a pre-kind SQLite database gains one Offer round without changing old rounds or candidates", () => {
  const filename = file();
  const old = new DatabaseSync(filename);
  old.exec(`
    CREATE TABLE interview_rounds (id TEXT PRIMARY KEY,name TEXT NOT NULL,sort_order INTEGER NOT NULL,description TEXT NOT NULL,
      default_email_template_id TEXT,default_invite_template_id TEXT,form_config_json TEXT NOT NULL,mbti_config_json TEXT NOT NULL,
      archived_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE demo_candidate (id TEXT PRIMARY KEY,cycle TEXT,name TEXT,email TEXT,department TEXT,stage TEXT,note TEXT,
      interview_date TEXT,start_time TEXT,end_time TEXT,location TEXT,created_at TEXT,updated_at TEXT,round_id TEXT);
    INSERT INTO demo_candidate VALUES ('legacy','秋招','旧候选人','old@example.test','技术部','interview','','2026-10-02','09:00','09:30','老校区','t','t','round-2');
  `);
  const config = blankRound();
  old.prepare("INSERT INTO interview_rounds VALUES ('round-2','旧二面',3,'说明','old-template',NULL,?,?,NULL,'t','t')")
    .run(JSON.stringify(config.formConfig), JSON.stringify(config.mbtiConfig));
  old.close();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const store = openRsvpStore(filename);
    try {
      assert.equal(store.rounds.requireRound("round-2").kind, "interview");
      assert.equal(store.rounds.requireRound("round-2").defaultEmailTemplateId, "old-template");
      assert.equal(store.getCandidate("legacy").roundId, "round-2");
      assert.equal(store.getCandidate("legacy").location, "老校区");
      assert.equal(store.rounds.list().filter((round) => round.kind === "offer").length, 1);
      assert.equal(store.rounds.list().at(-1).id, OFFER_ROUND_ID);
    } finally { store.close(); }
  }
});

test("Offer templates bind once alongside the existing six templates and keep user modifications", () => {
  const filename = file();
  const store = openRsvpStore(filename);
  const templates = openAgentStore(filename);
  const install = () => templates.initializeTemplatePresets(savedOfferPresets, offerRoundTemplates, {
    initialization: "saved-template-offer-v1", onlyIfEmpty: false,
  });
  try {
    assert.deepEqual(store.rounds.list().map(({ name, kind }) => [name, kind]), [
      ["一面", "interview"], ["二面", "interview"], ["录取通知", "offer"],
    ]);
    templates.initializeTemplatePresets(savedTemplatePresets, presetRoundTemplates);
    install();
    const [email, invite] = savedOfferPresets();
    assert.equal(templates.listTemplates().length, 8);
    assert.equal(store.rounds.requireRound(OFFER_ROUND_ID).defaultEmailTemplateId, email.id);
    assert.equal(store.rounds.requireRound(OFFER_ROUND_ID).defaultInviteTemplateId, invite.id);
    assert.match(email.document.customHtml.html, /\{\{rsvp_link\}\}/u);
    assert.deepEqual(email.warnings, []);
    assert.deepEqual(invite.warnings, []);
    templates.writeTemplate(email.id, { ...email, name: "自订录取邮件" }, "replace");
    templates.deleteTemplate(invite.id, true);
    install();
    assert.equal(templates.requireTemplate(email.id).name, "自订录取邮件");
    assert.equal(templates.templateExists(invite.id), false);
  } finally { templates.close(); store.close(); }
});

test("Offer invitations expose Offer labels while responses retain the RSVP state machine", async () => {
  const store = openRsvpStore(":memory:");
  try {
    const candidate = store.listCandidates()[0];
    const document = savedOfferPresets()[1].document;
    const { token } = await store.issue(document, future(), candidate, OFFER_ROUND_ID);
    const initial = await store.view(token);
    assert.equal(initial.roundKind, "offer");
    const labels = responseLabels(initial.roundKind);
    assert.equal(labels.title, "录取确认与答复");
    assert.equal(labels.confirm, "确认接受录取");
    assert.equal(labels.decline, "放弃本次录取");
    const accepted = await store.respond(token, "attending", initial.version);
    assert.equal(labels.status[accepted.rsvpStatus], "已接受录取");
    const declined = await store.respond(token, "not_attending", accepted.version);
    assert.equal(labels.status[declined.rsvpStatus], "已放弃录取");
    assert.equal(responseLabels().confirm, "确认参加");
  } finally { store.close(); }
});

test("promotion updates or clears the new round schedule and preserves the original schedule and link", async (t) => {
  const { store, call } = await httpFixture(t);
  const [candidate] = store.listCandidates();
  const inviteDoc = savedTemplatePresets()[3].document;
  const prior = await store.issue(inviteDoc, future(), candidate, "round-1");
  const promote = (roundId, schedule) => call("/api/local-demo/recruitment/promote", "POST", { candidateIds: [candidate.id], roundId, schedule });
  const replacement = { mode: "replace", interviewDate: "2027-03-05", startTime: "10:00", endTime: "11:00", location: "新会场" };
  assert.equal((await promote("round-2", { ...replacement, interviewDate: "2027-02-30" })).status, 400);
  assert.equal((await promote("round-2", { ...replacement, endTime: "09:00" })).status, 400);
  assert.equal((await promote("round-2", replacement)).status, 200);
  assert.equal(store.getCandidate(candidate.id).location, "新会场");
  assert.equal(store.getCandidate(candidate.id, "round-1").location, candidate.location);
  assert.equal((await store.view(prior.token)).context.interview_location, candidate.location);
  const updated = await store.issue(inviteDoc, future(), candidate, "round-2");
  assert.equal((await store.view(updated.token)).context.interview_time, "2027-03-05 10:00–11:00");
  assert.equal((await promote(OFFER_ROUND_ID, { mode: "clear" })).status, 200);
  assert.equal(store.getCandidate(candidate.id).interviewDate, "");
  assert.equal(store.getCandidate(candidate.id).location, "");
  assert.equal(store.getCandidate(candidate.id, "round-2").location, "新会场");
  const cleared = await store.issue(inviteDoc, future(), candidate, OFFER_ROUND_ID);
  assert.equal((await store.view(cleared.token)).context.interview_time, "时间待定");
  assert.equal(store.listCandidates().filter(({ id }) => id === candidate.id).length, 1);
});

test("real simulated sends distinguish successes and failures per explicitly selected round", async (t) => {
  const filename = file();
  const store = openRsvpStore(filename);
  const repository = openLocalEmailRepository(filename);
  t.after(() => { repository.close(); store.close(); });
  const service = createLocalMailService(repository, () => ({ eligible: true, issues: [] }));
  const [account] = await ensureDemoAccounts(service);
  const lin = store.listCandidates().find(({ email }) => email === "lin@example.test");
  const zhou = store.listCandidates().find(({ email }) => email.includes(".fail@"));
  const presets = savedTemplatePresets();
  const mail = { expiresAt: future(), emailDocument: presets[0].document, inviteDocument: presets[3].document,
    accountId: account.id, batchName: "验收", candidateIds: [lin.id, zhou.id] };
  const origin = "http://127.0.0.1:5000";
  await sendMail(store, repository, service, { ...mail, roundId: "round-1", idempotencyKey: crypto.randomUUID() }, origin);
  store.rounds.promote([lin.id], "round-2", { mode: "replace", interviewDate: "2027-04-01",
    startTime: "08:30", endTime: "09:30", location: "二面新教室" });
  const fromRoster = (id) => listRoster(store, repository).find((row) => row.id === id);
  assert.equal(fromRoster(lin.id).deliveryByRound["round-1"].status, "sent");
  assert.ok(fromRoster(lin.id).deliveryByRound["round-1"].sentAt);
  assert.equal(fromRoster(lin.id).deliveryByRound["round-2"], undefined);
  assert.equal(fromRoster(zhou.id).deliveryByRound["round-1"].status, "failed");
  assert.ok(previewMail(store, { ...mail, candidateIds: [lin.id], roundId: "round-1" }, origin).items[0].text.includes(lin.location));
  await sendMail(store, repository, service, { ...mail, candidateIds: [lin.id], roundId: "round-2", idempotencyKey: crypto.randomUUID() }, origin);
  assert.equal(fromRoster(lin.id).deliveryByRound["round-2"].status, "sent");
  const sentAt = fromRoster(lin.id).deliveryByRound["round-2"].sentAt;
  store.updateCandidate(lin.id, { ...store.getCandidate(lin.id), email: "lin.fail@example.test" });
  await sendMail(store, repository, service, { ...mail, candidateIds: [lin.id], roundId: "round-2", idempotencyKey: crypto.randomUUID() }, origin);
  assert.deepEqual(fromRoster(lin.id).deliveryByRound["round-2"], { status: "failed", sentAt });
  assert.equal(fromRoster(lin.id).deliveryByRound["round-1"].status, "sent");
});

test("local round reviews can be read, saved, updated and deleted, with scoped Open API readback", async (t) => {
  const { store, agent, call } = await httpFixture(t);
  const candidate = store.listCandidates()[0];
  const base = "/api/local-demo/recruitment/candidates/" + candidate.id + "/rounds/";
  const reviewPath = base + "round-1/review";
  const endpoint = "/api/open/v1/candidates/" + candidate.id + "/submissions";
  const value = { rating: 4, decision: "pass", notes: "说明具体" };
  assert.equal((await call(base + "round-2/review", "PUT", value)).status, 404);
  assert.equal((await call(reviewPath, "PUT", { ...value, rating: 6 })).status, 400);
  assert.equal((await (await call(reviewPath)).json()).data, null);
  const saved = (await (await call(reviewPath, "PUT", value)).json()).data;
  assert.equal(saved.reviewerName, "面试官");
  assert.equal((await (await call(reviewPath)).json()).data.notes, value.notes);
  await call(reviewPath, "PUT", { ...value, reviewerName: "李老师", decision: "hold" });
  assert.equal((await call(endpoint)).status, 401);
  const wrong = agent.createKey({ name: "其他权限", scopes: ["rounds:read"] });
  assert.equal((await call(endpoint, "GET", undefined, wrong.secret)).status, 403);
  const reader = agent.createKey({ name: "招新读取", scopes: ["recruitment:read"] });
  const received = (await (await call(endpoint, "GET", undefined, reader.secret)).json()).data;
  assert.equal(received[0].review.decision, "hold");
  assert.equal(received[0].review.reviewerName, "李老师");
  const invite = await store.issue(savedTemplatePresets()[3].document, future(), candidate, "round-1");
  assert.doesNotMatch(JSON.stringify(await store.view(invite.token)), /李老师|review/u);
  assert.equal((await (await call(reviewPath, "DELETE")).json()).data.deleted, true);
  assert.equal((await (await call(reviewPath)).json()).data, null);
});
