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
import { openLocalEmailRepository } from "../dev/recruitment/email-repository.ts";
import { createLocalMailService, ensureDemoAccounts } from "../dev/recruitment/mail.ts";
import { sendMail } from "../dev/recruitment/api.ts";
import { createDefaultDocument, updateBlockProps } from "../shared/domain/design.ts";
import { FIRST_ROUND_ID, QUESTION_TYPES } from "../shared/contracts/interview-rounds.ts";
import { DIMENSIONS, blankQuestion, blankRound, csvCell, mbtiPreset, parseRoundInput, scoreMbti, validateForm } from "../shared/recruitment/round-config.ts";
import { PERSONALITY_TYPE_PROFILES } from "../shared/recruitment/personality-types.ts";

const future = () => new Date(Date.now() + 86400000).toISOString();
const dbFile = () => join(mkdtempSync(join(tmpdir(), "campusflow-rounds-")), "workspace.sqlite");
const sample = () => ({ ...blankRound(), name: "作品面谈" });
const formFields = () => QUESTION_TYPES.map((type) => ({
  ...blankQuestion(type, type), type, required: true,
  options: ["single_choice", "multi_choice", "select"].includes(type) ? ["A", "B"] : [],
}));

test("round creation, renaming, reordering, promotion and archive preserve candidate history atomically", (t) => {
  const store = openRsvpStore(dbFile());
  t.after(() => store.close());
  assert.deepEqual(store.rounds.list().map((round) => round.name), ["一面", "二面", "录取通知"]);
  const [first, second] = store.listCandidates();
  assert.equal(first.roundId, FIRST_ROUND_ID);
  const round = store.rounds.create(sample());
  assert.equal(store.rounds.update(round.id, { ...sample(), name: "终面" }).name, "终面");
  assert.throws(() => store.rounds.promote([first.id, "missing"], round.id), { status: 404 });
  assert.equal(store.getCandidate(first.id).roundId, FIRST_ROUND_ID);
  const ids = store.rounds.list().map(({ id }) => id);
  assert.throws(() => store.rounds.reorder([ids[0], ids[0], ids[2], ids[3]]), { status: 400 });
  assert.equal(store.rounds.reorder([round.id, ...ids.filter((id) => id !== round.id)])[0].id, round.id);
  assert.equal(store.rounds.promote([first.id, second.id, first.id], round.id).moved, 2);
  assert.deepEqual(new Set(store.rounds.submissions(first.id).map(({ roundId }) => roundId)), new Set([FIRST_ROUND_ID, round.id]));
  assert.ok(store.rounds.archive(round.id).archivedAt);
  assert.equal(store.getCandidate(first.id).roundId, round.id);
  assert.throws(() => store.rounds.promote([first.id], round.id), { status: 409 });
  assert.equal(store.rounds.promote([first.id], FIRST_ROUND_ID).moved, 1);
});

test("all seven questionnaire types validate, partial drafts remain valid, and CSV escapes formulas", () => {
  const questions = formFields();
  const answers = { text: "简历", textarea: "甲\n乙", single_choice: "A", multi_choice: ["A", "B"], select: "B", url: "https://example.test/", rating: 5 };
  assert.deepEqual(validateForm(questions, answers, true), answers);
  assert.deepEqual(validateForm(questions, { url: "https://" }, false), { url: "https://" });
  assert.throws(() => validateForm(questions, {}, true), /请填写/u);
  for (const [key, value] of Object.entries({ text: 1, textarea: ["A"], single_choice: "C", multi_choice: ["A", "A"], select: "C", url: "javascript:alert(1)", rating: 6 }))
    assert.throws(() => validateForm(questions, { ...answers, [key]: value }, true), /填写格式/u);
  assert.throws(() => parseRoundInput({ ...sample(), formConfig: { enabled: true, questions: [questions[0], questions[0]] } }), /重复/u);
  assert.equal(csvCell(' =SUM(1,2)"'), '"\' =SUM(1,2)"""');
  for (const value of ["+foo", "-2", "@x", "\tfoo", "\nfoo"]) assert.ok(csvCell(value).startsWith('"\''));
});

test("MBTI presets score all 16 profiles and use enabled custom directions and consistency groups", () => {
  const full = mbtiPreset("full");
  const quick = mbtiPreset("quick");
  assert.equal(full.length, 88);
  assert.equal(quick.length, 24);
  assert.deepEqual(DIMENSIONS.map((dimension) => quick.filter((q) => q.dimension === dimension).length), [6, 6, 6, 6]);
  for (const dimension of DIMENSIONS) {
    assert.equal(quick.filter((q) => q.dimension === dimension).reduce((sum, q) => sum + q.direction, 0), 0);
  }
  assert.equal(scoreMbti(quick, Object.fromEntries(quick.map((q) => [q.id, q.direction * 2]))).stability, 100);
  for (const type of Object.keys(PERSONALITY_TYPE_PROFILES)) {
    const answers = Object.fromEntries(full.map((q) => [q.id, q.direction * (type.includes(q.dimension[0]) ? 2 : -2)]));
    const result = scoreMbti(full, answers);
    assert.equal(result.type, type);
    assert.equal(result.stability, 100);
  }
  const enabled = [...quick.map((q, index) => ({ ...q, enabled: index !== 0 })),
    { id: "custom", enabled: true, dimension: "EI", direction: -1, text: "我的新题" }];
  const result = scoreMbti(enabled, Object.fromEntries(enabled.filter((q) => q.enabled).map((q) => [q.id, q.id === "custom" ? 2 : 0])));
  assert.equal(result.dimensions[0].count, 6);
  assert.equal(result.dimensions[0].score, -2);
  assert.equal(result.dimensions[0].close, true);
  assert.equal(result.type[0], "I");
  assert.throws(() => scoreMbti(quick, {}), /完成全部/u);
});

test("issued configuration, drafts, version conflicts, submissions and encrypted link survive SQLite reopen", async () => {
  const file = dbFile();
  const store = openRsvpStore(file);
  const candidate = store.listCandidates()[0];
  const questions = [formFields()[0]];
  const round = store.rounds.create({ ...sample(), formConfig: { enabled: true, questions }, mbtiConfig: { enabled: true, questions: mbtiPreset("quick") } });
  store.rounds.promote([candidate.id], round.id);
  const issued = await store.issue(createDefaultDocument("invite_page"), future(), candidate);
  const draft = await store.saveActivity(issued.token, "form", { mode: "draft", answers: { text: "=危险" }, revision: 0 });
  assert.equal(draft.form.revision, 1);
  await assert.rejects(store.saveActivity(issued.token, "form", { mode: "draft", answers: {}, revision: 0 }), { status: 409 });
  assert.equal(store.rounds.submissions(candidate.id).find((item) => item.roundId === round.id).invitations[0].form, null);
  store.rounds.update(round.id, { ...sample(), name: "新配置" });
  store.close();

  const reopened = openRsvpStore(file);
  try {
    const latest = await reopened.view(issued.token);
    assert.equal(latest.activities.form.questions[0].id, "text");
    assert.equal(latest.activities.form.answers.text, "=危险");
    assert.equal(reopened.reopenLink(issued.id), issued.token);
    const sqlite = new DatabaseSync(file);
    assert.ok(!Object.values(sqlite.prepare("SELECT * FROM demo_interview WHERE id=?").get(issued.id)).some((value) => String(value).includes(issued.token)));
    sqlite.close();
    await assert.rejects(reopened.saveActivity(issued.token, "form", { mode: "submit", answers: {}, revision: 1 }), { status: 400 });
    await reopened.saveActivity(issued.token, "form", { mode: "submit", answers: draft.form.answers, revision: 1 });
    const answers = Object.fromEntries(latest.activities.mbti.questions.map((q) => [q.id, q.direction * 2]));
    await reopened.saveActivity(issued.token, "mbti", { mode: "submit", answers, revision: 0 });
    await reopened.respond(issued.token, "attending", latest.version);
    const submissions = reopened.rounds.submissions(candidate.id).find((item) => item.roundId === round.id).invitations[0];
    assert.equal(submissions.rsvpStatus, "confirmed");
    assert.equal(submissions.form.answers.text, "=危险");
    assert.equal(submissions.mbti.result.type, "ESTJ");
    assert.ok(reopened.rounds.exportCsv(round.id).includes('"\'=危险"'));
    const rotated = await reopened.rotate(issued.id);
    assert.equal(reopened.reopenLink(issued.id), rotated.token);
    await assert.rejects(reopened.saveActivity(issued.token, "form", { mode: "draft", answers: {}, revision: 0 }), { status: 404 });
    assert.equal((await reopened.view(rotated.token)).activities.form.answers.text, "=危险");
    reopened.revoke(issued.id);
    await assert.rejects(reopened.saveActivity(rotated.token, "mbti", { mode: "submit", answers, revision: 1 }), { status: 410 });
  } finally { reopened.close(); }
});

test("sending email can explicitly assign the invitation to a different round", async (t) => {
  const file = dbFile();
  const store = openRsvpStore(file);
  const repository = openLocalEmailRepository(file);
  t.after(() => { repository.close(); store.close(); });
  const service = createLocalMailService(repository, () => ({ eligible: true, issues: [] }));
  const [account] = await ensureDemoAccounts(service);
  const [candidate] = store.listCandidates();
  let emailDocument = createDefaultDocument("email");
  const button = emailDocument.blocks.find((item) => item.type === "button");
  emailDocument = updateBlockProps(emailDocument, button.id, { url: "{{rsvp_link}}" });
  const round = store.rounds.create(sample());
  const detail = await sendMail(store, repository, service, {
    accountId: account.id, idempotencyKey: crypto.randomUUID(), batchName: "演示",
    expiresAt: future(), roundId: round.id, candidateIds: [candidate.id],
    emailDocument, inviteDocument: createDefaultDocument("invite_page"),
  }, "http://127.0.0.1:5173/");
  assert.equal(store.getCandidate(candidate.id).roundId, FIRST_ROUND_ID);
  assert.equal(store.latestInvite(candidate.id, FIRST_ROUND_ID), null);
  assert.equal(store.latestInvite(candidate.id, round.id).id, detail.deliveries[0].inviteId);
});

test("Open API requires separate round scopes and excludes link secrets and drafts from candidate submissions", async (t) => {
  const file = dbFile();
  const store = openRsvpStore(file);
  const agent = openAgentStore(file);
  const read = agent.createKey({ name: "轮次读取", scopes: ["rounds:read"] }).secret;
  const write = agent.createKey({ name: "轮次写入", scopes: ["rounds:write"] }).secret;
  const roster = agent.createKey({ name: "名单读取", scopes: ["recruitment:read"] }).secret;
  const server = createServer(rsvpMiddleware(() => store, undefined, undefined, () => agent));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); agent.close(); });
  const origin = "http://127.0.0.1:" + server.address().port;
  const call = (path, { secret, method = "GET", data } = {}) => fetch(origin + path, {
    method, headers: { ...(secret ? { Authorization: "Bearer " + secret } : {}), ...(data ? { "Content-Type": "application/json" } : {}) },
    body: data ? JSON.stringify(data) : undefined,
  });
  const rounds = "/api/open/v1/rounds";
  assert.equal((await call(rounds)).status, 401);
  assert.equal((await call(rounds, { secret: write })).status, 403);
  assert.equal((await call(rounds, { secret: read, method: "POST", data: sample() })).status, 403);
  assert.equal((await call(rounds, { secret: write, method: "POST", data: { ...sample(), mbtiConfig: { enabled: true, questions: [] } } })).status, 400);
  const createdResponse = await call(rounds, { secret: write, method: "POST", data: sample() });
  assert.equal(createdResponse.status, 201);
  const { data: created } = await createdResponse.json();
  assert.equal((await call(rounds + "/" + created.id, { secret: write, method: "PUT", data: { ...sample(), name: "更名" } })).status, 200);
  assert.equal((await (await call(rounds, { secret: read })).json()).data.find(({ id }) => id === created.id).name, "更名");
  const candidate = store.listCandidates()[0];
  const path = "/api/open/v1/candidates/" + candidate.id + "/submissions";
  const invite = await store.issue(createDefaultDocument("invite_page"), future(), candidate, created.id);
  assert.equal((await call(path)).status, 401);
  assert.equal((await call(path, { secret: read })).status, 403);
  const details = await (await call(path, { secret: roster })).json();
  assert.equal(details.data.find(({ roundId }) => roundId === created.id).invitations[0].rsvpStatus, "pending");
  assert.doesNotMatch(JSON.stringify(details), new RegExp(invite.token + "|token|rsvpUrl|credential", "iu"));
  const spec = await (await call("/api/open/v1/openapi.json")).json();
  assert.deepEqual(spec.paths["/rounds/{id}"].put["x-required-scopes"], ["rounds:write"]);
  assert.deepEqual(spec.components.schemas.FormQuestion.properties.type.enum, QUESTION_TYPES);
});
