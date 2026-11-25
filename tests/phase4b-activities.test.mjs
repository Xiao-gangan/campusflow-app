import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openAgentStore } from "../dev/open-api/store.ts";
import { savedTemplatePresets } from "../dev/open-api/template-presets.ts";
import { rsvpMiddleware } from "../dev/rsvp/plugin.ts";
import { openRsvpStore } from "../dev/rsvp/store.ts";
import { CUSTOM_ACTIVITY_CALLBACK, CUSTOM_ACTIVITY_SESSION, CUSTOM_ACTIVITY_HTML_LIMIT } from "../shared/contracts/interview-rounds.ts";
import { parseCustomActivities, parseCustomActivityResult } from "../shared/recruitment/custom-activities.ts";
import { blankRound } from "../shared/recruitment/round-config.ts";

const initialTime = Date.parse("2030-01-02T03:00Z");
const externalOrigin = "https://games.example.test";
const widget = { id: "widget", kind: "sandbox_widget", title: "协作快答", required: true, enabled: true, html: "<button>答题</button>", height: 360 };
const external = { id: "external", kind: "external_app", title: "外部小游戏", required: false, enabled: true, url: externalOrigin + "/play?mode=practice" };
const disabled = { ...widget, id: "disabled", enabled: false };
const input = { ...blankRound(), name: "一面", customActivities: [widget, external, disabled] };
const candidateResult = { score: 0, summary: " 已提交互动 ", payload: { choices: [1, true, null, { label: "结果" }] } };
const doc = savedTemplatePresets()[3].document;
const endpoint = (token, suffix = "") => `/api/v1/rsvp/${token}${suffix}`;

async function httpFixture(t, configure = true) {
  const file = join(mkdtempSync(join(tmpdir(), "campusflow-phase4b-")), "demo.sqlite");
  let now = initialTime;
  const clock = () => new Date(now);
  let store = openRsvpStore(file, clock);
  const agent = openAgentStore(file, clock);
  const server = createServer(rsvpMiddleware(() => store, undefined, undefined, () => agent));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); agent.close(); });
  const origin = "http://127.0.0.1:" + server.address().port;
  const call = (path, { method = "GET", body, headers = {} } = {}) => fetch(origin + path, {
    method, redirect: "manual", headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (configure) store.rounds.update("round-1", input);
  const candidate = store.listCandidates()[0];
  const issue = (ttl = 30 * 60_000) => store.issue(doc, new Date(now + ttl).toISOString(), candidate, "round-1");
  const launch = async (token, activityId = "external") => {
    const response = await call(endpoint(token, `/activities/${activityId}/launch`));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const location = response.headers.get("location");
    assert.ok(!location.includes(token));
    const url = new URL(location);
    const fragment = new URLSearchParams(url.hash.slice(1));
    assert.equal(fragment.get("cf_callback_url"), origin + CUSTOM_ACTIVITY_CALLBACK);
    assert.equal(fragment.get("cf_session_url"), origin + CUSTOM_ACTIVITY_SESSION);
    assert.equal(url.searchParams.get("mode"), "practice");
    assert.ok(!url.searchParams.has("cf_activity_token"));
    return fragment.get("cf_activity_token");
  };
  const callback = (cf_activity_token, result = candidateResult, origin = externalOrigin) => call(CUSTOM_ACTIVITY_CALLBACK,
    { method: "POST", headers: { Origin: origin }, body: { cf_activity_token, ...result } });
  const session = (secret) => call(CUSTOM_ACTIVITY_SESSION, { headers: { Authorization: "Bearer " + secret, Origin: externalOrigin } });
  return { origin, file, session, clock, setTime: (value) => { now = value; }, issue, launch, call, callback, candidate,
    get store() { return store; }, restart() { store.close(); store = openRsvpStore(file, clock); }, agent };
}

test("custom activity schemas enforce kinds, authorized URL protocols, UTF-8 limits and JSON-only results", () => {
  assert.deepEqual(parseCustomActivities([widget, external]), [widget, external]);
  for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///tmp/example", "//example.test", "http://user:pass@example.test"])
    assert.throws(() => parseCustomActivities([{ ...external, url }]), /HTTP/u);
  assert.throws(() => parseCustomActivities([{ ...widget, html: "界".repeat(CUSTOM_ACTIVITY_HTML_LIMIT / 2) }]), /HTML/u);
  assert.throws(() => parseCustomActivities([{ ...widget, url: external.url }]), /配置/u);
  assert.throws(() => parseCustomActivities([{ ...widget, height: 721 }]), /高度/u);
  assert.throws(() => parseCustomActivities([widget, widget]), /配置/u);
  assert.equal(parseCustomActivityResult(candidateResult).score, 0);
  for (const score of [-1, 10001, Infinity, NaN, "1"])
    assert.throws(() => parseCustomActivityResult({ ...candidateResult, score }), /得分/u);
  for (const payload of [["not an object"], null, new Date(), { when: new Date() }, { large: "校".repeat(8000) }, JSON.parse('{"constructor":{"x":1}}')])
    assert.throws(() => parseCustomActivityResult({ ...candidateResult, payload }), /JSON/u);
  assert.throws(() => parseCustomActivityResult({ summary: " " }), /摘要/u);
});

test("signed invitations freeze enabled settings and keep immutable sandbox submissions across restarts", async (t) => {
  const fixture = await httpFixture(t);
  const { issue, call, candidate } = fixture;
  const first = await issue();
  fixture.store.rounds.update("round-1", { ...input, customActivities: [{ ...widget, title: "已改名", html: "<p>新版本</p>" }] });
  const before = await fixture.store.view(first.token);
  assert.deepEqual(before.activities.customActivities.map(({ id, title, submission }) => ({ id, title, submission })), [
    { id: "widget", title: widget.title, submission: null }, { id: "external", title: external.title, submission: null },
  ]);
  assert.equal(before.activities.customActivities[0].html, widget.html);
  assert.ok(!JSON.stringify(before).includes("cf_activity_token"));
  const post = (id, body) => call(endpoint(first.token, `/activities/${id}`), { method: "POST", body });
  assert.equal((await post("external", candidateResult)).status, 404);
  assert.equal((await post("disabled", candidateResult)).status, 404);
  assert.equal((await post("widget", { score: 10001, summary: "非法" })).status, 400);
  assert.equal((await post("widget", { summary: "非法", payload: "invalid" })).status, 400);
  const original = (await (await post("widget", candidateResult)).json()).data;
  assert.deepEqual(original, { ...candidateResult, status: "completed", summary: "已提交互动", submittedAt: fixture.clock().toISOString(), revision: 1 });
  assert.deepEqual((await (await post("widget", { score: 99, summary: "重复" })).json()).data, original);
  fixture.restart();
  assert.deepEqual((await fixture.store.view(first.token)).activities.customActivities[0].submission, original);
  const { completed, total } = fixture.store.rounds.progress(candidate.id, fixture.store.rounds.requireRound("round-1")).customActivities;
  assert.deepEqual({ completed, total }, { completed: 1, total: 2 });
  const second = await issue();
  assert.equal((await fixture.store.view(second.token)).activities.customActivities[0].title, "已改名");
  assert.equal((await fixture.store.view(second.token)).activities.customActivities[0].submission, null);
  fixture.store.revoke(first.id);
  assert.equal((await post("widget", candidateResult)).status, 410);
  const timed = await issue(2000);
  fixture.setTime(initialTime + 2000);
  assert.equal((await call(endpoint(timed.token, "/activities/widget"), { method: "POST", body: candidateResult })).status, 410);
});

test("external callbacks use a persisted HMAC, isolated browser CORS and first-write semantics", async (t) => {
  const fixture = await httpFixture(t);
  const { issue, call, launch, callback } = fixture;
  const invite = await issue();
  const credentials = await launch(invite.token);
  assert.equal((await call(endpoint(invite.token, "/activities/widget/launch"))).status, 404);
  assert.equal((await callback(undefined)).status, 401);
  assert.equal((await callback(invite.token)).status, 401);
  assert.equal((await callback(credentials.slice(0, -1) + (credentials.endsWith("a") ? "b" : "a"))).status, 401);
  assert.equal((await callback(credentials.replace(/^v2\./u, "v1."))).status, 401);
  assert.equal((await callback(credentials, candidateResult, "https://unrelated.example.test")).status, 403);
  assert.equal((await callback(credentials, candidateResult, "null")).status, 403);
  const preflight = await call(CUSTOM_ACTIVITY_CALLBACK, { method: "OPTIONS", headers: { Origin: externalOrigin,
    "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), externalOrigin);
  assert.equal(preflight.headers.get("access-control-allow-credentials"), null);
  assert.equal((await callback(credentials, { summary: "非法", score: -1 })).status, 400);
  fixture.restart();
  const accepted = await callback(credentials);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get("access-control-allow-origin"), externalOrigin);
  const result = (await accepted.json()).data;
  assert.equal(result.summary, "已提交互动");
  assert.deepEqual((await (await callback(credentials, { summary: "重复" })).json()).data, result);
  assert.deepEqual((await fixture.store.view(invite.token)).activities.customActivities[1].submission, result);
});

test("external credentials expire and stop authorizing after invitation revocation or link rotation", async (t) => {
  const fixture = await httpFixture(t);
  const { issue, launch, callback, setTime } = fixture;
  const original = await issue(3 * 60 * 60_000);
  const shortInvite = await issue(30_000);
  const secret = await launch(original.token);
  const shortSecret = await launch(shortInvite.token);
  setTime(initialTime + 30_000);
  assert.equal((await callback(shortSecret)).status, 401);
  setTime(initialTime + 2 * 60 * 60_000 - 1);
  assert.equal((await fixture.session(secret)).status, 200);
  setTime(initialTime + 2 * 60 * 60_000);
  assert.equal((await callback(secret)).status, 401);
  const rotated = await issue();
  const revoked = await issue();
  const rotateSecret = await launch(rotated.token);
  const revokeSecret = await launch(revoked.token);
  const newLink = await fixture.store.rotate(rotated.id);
  fixture.store.revoke(revoked.id);
  assert.equal((await callback(rotateSecret)).status, 401);
  assert.equal((await callback(revokeSecret)).status, 401);
  assert.equal((await callback(await launch(newLink.token))).status, 200);
});

test("Open API round writes and scoped submissions expose results and protect paths, credentials and historical settings", async (t) => {
  const fixture = await httpFixture(t, false);
  const { call, agent, issue, candidate } = fixture;
  const token = agent.createKey({ name: "活动编辑与招新读取", scopes: ["rounds:read", "rounds:write", "recruitment:read"] }).secret;
  const readOnly = agent.createKey({ name: "轮次读取", scopes: ["rounds:read"] }).secret;
  const auth = (secret) => ({ Authorization: "Bearer " + secret });
  const base = "/api/open/v1/rounds";
  const candidatePath = "/api/open/v1/candidates/" + candidate.id + "/submissions";
  const put = (body, headers = auth(token)) => call(base + "/round-1", { method: "PUT", headers, body });
  assert.equal((await put(input, {})).status, 401);
  assert.equal((await put(input, auth(readOnly))).status, 403);
  assert.equal((await put({ ...input, customActivities: [{ ...external, url: "javascript:x" }] })).status, 400);
  assert.equal((await put({ ...input, customActivities: [{ ...widget, html: "a".repeat(CUSTOM_ACTIVITY_HTML_LIMIT + 1) }] })).status, 400);
  assert.equal((await call(base, { method: "POST", headers: auth(token), body: { ...input, name: "新增测试轮次" } })).status, 201);
  assert.deepEqual((await (await put(input)).json()).data.customActivities, input.customActivities);
  const { customActivities: _, ...legacyInput } = input;
  assert.deepEqual((await (await put(legacyInput)).json()).data.customActivities, input.customActivities);
  const invite = await issue();
  await call(endpoint(invite.token, "/activities/widget"), { method: "POST", body: candidateResult });
  assert.deepEqual((await (await put({ ...input, customActivities: [] })).json()).data.customActivities, []);
  assert.equal((await call(candidatePath)).status, 401);
  assert.equal((await call(candidatePath, { headers: auth(readOnly) })).status, 403);
  const history = (await (await call(candidatePath, { headers: auth(token) })).json()).data[0].invitations[0].customActivities;
  assert.deepEqual(history, [{ activityId: "widget", title: widget.title, kind: "sandbox_widget", required: true, generation: 1,
    ...candidateResult, summary: "已提交互动", submittedAt: fixture.clock().toISOString(), revision: 1, status: "completed" }]);
  assert.deepEqual((await (await call(base, { headers: auth(readOnly) })).json()).data[0].customActivities, []);
  const spec = await (await call("/api/open/v1/openapi.json")).json();
  assert.deepEqual(spec.paths["/activities/callback"].post.security, [{ activityToken: [] }, {}]);
  assert.equal(spec.components.schemas.CustomActivity.oneOf.length, 2);
});

test("session limits each credential to one candidate and activity, audits hashes and preserves attempts through manual reissue", async (t) => {
  const fixture = await httpFixture(t);
  const { issue, launch, callback, session, call, candidate, origin, clock } = fixture;
  const secondExternal = { ...external, id: "design", title: "设计思考" };
  fixture.store.rounds.update("round-1", { ...input, customActivities: [external, secondExternal] });
  const one = await issue();
  const otherCandidate = fixture.store.listCandidates()[1];
  const two = await fixture.store.issue(doc, new Date(clock().getTime() + 60 * 60_000).toISOString(), otherCandidate, "round-1");
  const [firstToken, designToken, otherToken] = await Promise.all([launch(one.token), launch(one.token, "design"), launch(two.token)]);
  assert.equal(new Set([firstToken, designToken, otherToken]).size, 3);
  const view = (await (await session(firstToken)).json()).data;
  assert.deepEqual(Object.keys(view).sort(), ["activityId", "activityTitle", "candidateName", "expiresAt", "roundName", "status", "submission"]);
  assert.equal(view.candidateName, candidate.name);
  assert.equal(view.activityId, "external");
  assert.equal(view.status, "pending");
  assert.equal((await (await session(otherToken)).json()).data.candidateName, otherCandidate.name);
  assert.equal((await (await session(designToken)).json()).data.activityId, "design");
  assert.equal((await call(CUSTOM_ACTIVITY_SESSION, { method: "POST", body: { cf_activity_token: firstToken } })).status, 200);
  assert.equal((await call(CUSTOM_ACTIVITY_SESSION, { method: "POST", body: { cf_activity_token: firstToken, candidateId: otherCandidate.id } })).status, 400);
  assert.equal((await callback(firstToken, { summary: "different", activityId: "design" })).status, 400);
  assert.equal((await callback(firstToken, { summary: "different", candidateId: otherCandidate.id })).status, 400);

  const post = (body, token = firstToken) => call(CUSTOM_ACTIVITY_CALLBACK, { method: "POST", body, headers: {
    Origin: externalOrigin, Authorization: "Bearer " + token,
  } });
  assert.equal((await post({ cf_activity_token: otherToken, summary: "冲突" })).status, 401);
  const first = (await (await post({ status: "in_progress", progress: 20, payload: { steps: 1 } })).json()).data;
  assert.equal(first.revision, 1);
  const second = (await (await post({ status: "in_progress", progress: 60, progressText: "第 3/5 题" })).json()).data;
  assert.equal(second.revision, 2);
  assert.deepEqual(second.payload, { steps: 1 });
  assert.equal(second.submittedAt, null);
  assert.equal((await (await session(firstToken)).json()).data.submission.progress, 60);
  const choice = { status: "needs_review", summary: "完成设计题", score: 92, maxScore: 100, scoreLabel: "综合得分", scoreUnit: "分",
    badge: { label: "S 级 · 92 分", tone: "success" }, metrics: [{ label: "表达", value: 8, max: 10 }],
    qa: [{ question: "先做什么？", answer: "明确需求。", tag: "策略" }], tags: ["设计"] };
  const terminal = (await (await post(choice)).json()).data;
  assert.equal(terminal.revision, 3);
  assert.ok(terminal.submittedAt);
  assert.equal(terminal.badge.label, choice.badge.label);
  assert.deepEqual((await (await post({ status: "completed", summary: "重复", score: 1 })).json()).data, terminal);
  assert.deepEqual((await (await session(firstToken)).json()).data.submission, terminal);
  assert.equal((await (await session(designToken)).json()).data.submission, null);
  assert.equal((await (await session(otherToken)).json()).data.submission, null);
  const audit = new DatabaseSync(fixture.file);
  try {
    const record = audit.prepare("SELECT * FROM activity_tokens WHERE activity_id='external' AND candidate_id=?").get(candidate.id);
    assert.equal(record.token_hash, createHash("sha256").update(firstToken).digest("hex"));
    assert.equal(record.status, "locked");
    assert.equal(record.candidate_id, candidate.id);
    assert.equal(record.invite_id, one.id);
    assert.equal(record.round_id, "round-1");
    assert.ok(record.token_id && record.issued_at && record.last_used_at && record.locked_at);
    assert.ok(!JSON.stringify(record).includes(firstToken));
  } finally { audit.close(); }

  const managementPath = (id, action) => "/api/local-demo/recruitment/candidates/" + id + "/invites/" + one.id + "/activities/external/" + action;
  const manage = (id, action, headers = { Origin: origin, "X-CampusFlow-Demo": "1" }) => call(managementPath(id, action), { method: "POST", headers });
  assert.equal((await manage(candidate.id, "revoke", {})).status, 403);
  assert.equal((await manage(otherCandidate.id, "revoke")).status, 404);
  assert.equal((await manage(candidate.id, "revoke")).status, 200);
  assert.equal((await session(firstToken)).status, 401);
  assert.equal((await session(designToken)).status, 200);
  assert.equal((await call(endpoint(one.token, "/activities/external/launch"))).status, 401);
  const reissued = (await (await manage(candidate.id, "reissue")).json()).data;
  assert.equal(reissued.generation, 2);
  assert.equal(reissued.status, "unissued");
  const newToken = await launch(one.token);
  assert.equal((await (await session(newToken)).json()).data.status, "pending");
  assert.equal((await post({ summary: "重测", score: 80 }, newToken)).status, 200);
  const history = fixture.store.rounds.submissions(candidate.id)[0].invitations[0].customActivities;
  assert.deepEqual(history.map(({ generation, score }) => [generation, score]), [[2, 80], [1, 92]]);
  const newInvite = await fixture.store.rotate(one.id);
  assert.equal((await session(newToken)).status, 401);
  assert.equal((await session(designToken)).status, 401);
  assert.equal((await session(otherToken)).status, 200);
  assert.equal((await session(await launch(newInvite.token))).status, 200);
  fixture.store.revoke(one.id);
  assert.equal((await session(newToken)).status, 401);
});

test("declarative result schema bounds native display fields and preserves hostile-looking text as text", () => {
  const values = { status: "completed", summary: "<strong>文本</strong>", score: 218, scoreUnit: "ms",
    badge: { label: "已记录", tone: "neutral" }, metrics: [{ label: "耗时", value: 218, max: 500, unit: "ms" }],
    qa: [{ question: "设计取舍？", answer: "先保持关键功能" }], tags: ["设计"] };
  assert.equal(parseCustomActivityResult(values).summary, values.summary);
  assert.equal(parseCustomActivityResult({ status: "in_progress", progress: 60 }).progress, 60);
  assert.equal(parseCustomActivityResult({ summary: "旧格式" }).status, "completed");
  for (const patch of [
    { progress: 101 }, { status: "failed" }, { badge: { label: "很".repeat(25), tone: "info" } }, { badge: { label: "a", tone: "flash" } },
    { maxScore: 50 }, { metrics: Array(9).fill({ label: "a", value: 1 }) }, { metrics: [{ label: "a", value: 5, max: 1 }] },
    { qa: Array(41).fill({ question: "a", answer: "b" }) }, { qa: [{ question: "a", answer: "答".repeat(2001) }] },
    { tags: Array(11).fill("a") }, { badge: { label: "a", html: "<i>" } },
  ]) assert.throws(() => parseCustomActivityResult({ ...values, ...patch }));
});
