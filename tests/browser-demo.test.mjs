import assert from "node:assert/strict";
import test from "node:test";
import initSqlJs from "sql.js";
import { createBrowserDemoRuntime } from "../src/modules/browser-demo/runtime.ts";
import { BROWSER_DEMO_STORAGE } from "../src/modules/browser-demo/mode.ts";
import { candidateCsvTemplate } from "../shared/recruitment/candidate-csv.ts";

const engine = initSqlJs();
const origin = "https://review.example.test/";
const recruit = "/api/local-demo/recruitment";
const mail = "/api/local-demo/mail";

function workspace(initial = new Map()) {
  let queue = Promise.resolve();
  const storage = { getItem: (key) => initial.get(key) ?? null, setItem: (key, value) => initial.set(key, value) };
  function lock(op) {
    const result = queue.then(op);
    queue = result.catch(() => {});
    return result;
  }
  const clock = () => new Date("2026-11-24T12:00:00Z");
  const open = () => createBrowserDemoRuntime(engine, storage, origin, lock, clock);
  const runtime = open();
  async function request(path, method = "GET", payload, status = 200, tab = runtime) {
    const response = await tab.request(path, { method, body: JSON.stringify(payload) });
    const result = await response.json();
    assert.equal(response.status, status, result.message);
    return result.data;
  }
  return { request, runtime, open, state: initial };
}

test("browser demo seeds templates, rounds and structured sample results, then resets only the demo workspace", async () => {
  const state = new Map([["other-application", "keep"]]);
  const { request, runtime } = workspace(state);
  const [templates, rounds, people, batches] = await Promise.all([
    request("/api/local-demo/templates"), request(recruit + "/rounds"),
    request(recruit + "/candidates"), request(mail + "/batches"),
  ]);
  assert.deepEqual([templates.length, rounds.length, people.length, batches.length], [8, 3, 7, 4]);
  assert.equal(rounds[0].formConfig.questions.length, 18);
  assert.equal(rounds[0].mbtiConfig.questions.length, 88);
  assert.ok(rounds[0].customActivities[0].html.includes("校园协作情景快答"));
  const { id } = people.find((person) => person.name === "林知夏");
  const [history] = await request(recruit + "/candidates/" + id + "/submissions");
  assert.equal(Object.keys(history.invitations[0].form.answers).length, 18);
  assert.ok(history.invitations[0].mbti.result);
  assert.equal(history.invitations[0].customActivities[0].score, 100);
  assert.equal(history.review.rating, 5);
  await runtime.reset();
  assert.equal((await request(recruit + "/candidates")).length, 7);
  assert.equal(state.get("other-application"), "keep");
  assert.ok(state.get(BROWSER_DEMO_STORAGE));
  await request(recruit + "/candidates/" + id + "/submissions", "GET", undefined, 404);
});

test("browser demo runs mock batch sending and same-browser RSVP, form and scores across tabs, and invalidates rotated links", async () => {
  const { request, open } = workspace();
  const rounds = await request(recruit + "/rounds");
  const templates = await request("/api/local-demo/templates");
  const people = await request(recruit + "/candidates");
  const [round] = rounds;
  const [account] = await request(mail + "/accounts");
  const person = people.find(({ name }) => name === "顾知遥");
  const body = {
    candidateIds: [person.id], roundId: round.id, accountId: account.id,
    emailDocument: templates.find(({ id }) => id === round.defaultEmailTemplateId).document,
    inviteDocument: templates.find(({ id }) => id === round.defaultInviteTemplateId).document,
    expiresAt: "2026-12-01T00:00:00.000Z", batchName: "评委验收", idempotencyKey: "demo-test-1",
  };
  assert.equal((await request(mail + "/preview", "POST", body)).eligible, 1);
  const sent = await request(mail + "/batches", "POST", body);
  const delivery = sent.deliveries[0];
  const inviteUrl = new URL(delivery.rsvpUrl);
  assert.equal(inviteUrl.origin, new URL(origin).origin);
  assert.match(inviteUrl.hash, /^#\/invite\/[0-9a-f]{64}$/);
  const token = inviteUrl.hash.split("/").at(-1);
  const endpoint = "/api/v1/rsvp/" + token;
  const otherTab = open();
  const invite = await request(endpoint, "GET", undefined, 200, otherTab);
  await request(endpoint, "POST", { response: "attending", version: invite.version }, 200, otherTab);
  const answers = Object.fromEntries(invite.activities.form.questions.map((question) => [question.id, question.options[0] ?? "演示填写"]));
  await request(endpoint + "/form", "POST", { mode: "submit", revision: 0, answers }, 200, otherTab);
  const activity = invite.activities.customActivities[0];
  const activityPath = endpoint + "/activities/" + activity.id;
  await request(activityPath, "POST", { status: "completed", summary: "完成任务", score: 100, demoGeneration: 1 }, 200, otherTab);
  assert.equal((await request(recruit + "/candidates")).find(({ id }) => id === person.id).latestInvite.rsvpStatus, "confirmed");
  const [history] = await request(recruit + "/candidates/" + person.id + "/submissions");
  assert.deepEqual(history.invitations[0].form.answers, answers);
  assert.equal(history.invitations[0].customActivities[0].score, 100);
  const id = history.invitations[0].inviteId;
  const manage = recruit + "/candidates/" + person.id + "/invites/" + id + "/activities/" + activity.id;
  await request(manage + "/revoke", "POST", {});
  await request(activityPath, "POST", { status: "completed", summary: "旧成绩", demoGeneration: 1 }, 401, otherTab);
  await request(manage + "/reissue", "POST", {});
  await request(activityPath, "POST", { status: "completed", summary: "旧成绩", demoGeneration: 1 }, 401, otherTab);
  await request(activityPath, "POST", { status: "completed", summary: "重签成绩", demoGeneration: 2 }, 200, otherTab);
  await request("/api/local-demo/interview-invites/" + id + "/rotate", "POST", {});
  await request(endpoint, "GET", undefined, 404, otherTab);
  assert.equal((await request(mail + "/batches/" + sent.batch.id)).deliveries[0].invite.status, "rotated");
  await workspace().request(endpoint, "GET", undefined, 404);
});

test("browser SMTP stays synthetic and key secrets are demo-only, with real CSV deduplication", async () => {
  const { request } = workspace();
  assert.equal((await request(mail + "/smtp-test-mode")).mode, "synthetic");
  const [account] = await request(mail + "/smtp-accounts");
  assert.equal((await request(mail + "/smtp-accounts/" + account.id + "/test-connection", "POST", {})).ok, true);
  const templates = await request("/api/local-demo/templates");
  const [emailTemplate] = templates.filter((item) => item.target === "email");
  assert.equal((await request(mail + "/smtp-accounts/" + account.id + "/test", "POST", { to: "review@example.test", templateId: emailTemplate.id })).ok, true);
  assert.equal((await request(mail + "/smtp-test-inbox")).length, 1);
  const keyRoute = "/api/local-demo/open-api/keys";
  const key = await request(keyRoute, "POST", { name: "演示密钥", scopes: ["templates:read"] });
  assert.match(key.secret, /^cf_demo_[0-9a-f]{64}$/);
  assert.equal((await request(keyRoute))[0].secret, undefined);
  assert.ok((await request(keyRoute + "/" + key.id, "DELETE")).revokedAt);
  await request("/api/open/v1/templates", "GET", undefined, 403);
  const csv = candidateCsvTemplate;
  await request(recruit + "/candidates/import", "POST", { csv, commit: true });
  assert.equal((await request(recruit + "/candidates")).length, 9);
  await request(recruit + "/candidates/import", "POST", { csv, commit: true });
  assert.equal((await request(recruit + "/candidates")).length, 9);
});
