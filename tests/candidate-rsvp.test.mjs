import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { openRsvpStore } from "../dev/rsvp/store.ts";
import { rsvpMiddleware } from "../dev/rsvp/plugin.ts";
import { createInvitePresetDocument } from "../shared/invite/presets.ts";
import { parseHash } from "../src/app/navigation.ts";
import { inviteRequest, InviteRequestError } from "../src/modules/invite/rsvp-client.ts";

const date = new Date("2026-11-22T06:00:00Z");
const deadline = "2026-11-23T06:00:00Z";
async function serve(t, store) {
  const handler = rsvpMiddleware(() => store);
  const server = http.createServer((req, res) =>
    handler(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const manage = (suffix, body, headers = {}) =>
    fetch(origin + "/api/local-demo/interview-invites" + suffix, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin,
        "X-CampusFlow-Demo": "1",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  const get = (token) => fetch(origin + "/api/v1/rsvp/" + token);
  const post = (token, response, version) =>
    fetch(origin + "/api/v1/rsvp/" + token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response, version }),
    });
  const issue = async () => {
    const doc = createInvitePresetDocument("playful");
    doc.blocks.find((b) => b.type === "hero").props.title =
      "你好，{{candidate_name}}：技术部邀请";
    const res = await manage("", { document: doc, expiresAt: deadline });
    assert.equal(res.status, 200);
    return (await res.json()).data;
  };
  return { manage, get, post, issue };
}

test("candidate links and admin preview resolve to distinct routes", () => {
  assert.equal(parseHash("#/invite/rsvp?token=sample"), "/invite/rsvp");
  assert.equal(parseHash("#/invite/preview"), "/invite/preview");
});

test("the RSVP client preserves conflict and closed-link statuses even without a usable JSON error body", async (t) => {
  const errors = [
    new Response(null, { status: 409 }),
    new Response("not found", { status: 404 }),
    new Response("{", { status: 410, headers: { "Content-Type": "application/json" } }),
    Response.json({ message: "这份邀请已撤销。" }, { status: 410 }),
  ];
  const fetch = t.mock.method(globalThis, "fetch");
  for (const response of errors) {
    fetch.mock.mockImplementationOnce(async () => response);
    await assert.rejects(
      inviteRequest("/api/v1/rsvp/sample"),
      (error) => error instanceof InviteRequestError && error.status === response.status,
    );
  }
});

test("saved template snapshot, public GET/POST, refresh, change, duplicate and conflict", async (t) => {
  const store = openRsvpStore(":memory:", () => date);
  t.after(() => store.close());
  const { issue, get, post } = await serve(t, store);
  const { token } = await issue();
  const res = await get(token);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const { data: first } = await res.json();
  assert.equal(first.context.candidate_name, "林知夏");
  assert.equal(
    first.document.blocks.find((b) => b.type === "hero").props.title,
    "你好，{{candidate_name}}：技术部邀请",
  );
  assert.equal(first.rsvpStatus, "pending");
  assert.equal(first.respondedAt, null);
  assert.doesNotMatch(JSON.stringify(first), /tokenHash|applicantId|revokedAt/);
  const confirmed = (
    await (await post(token, "attending", first.version)).json()
  ).data;
  assert.equal(confirmed.rsvpStatus, "confirmed");
  assert.equal(confirmed.version, first.version + 1);
  assert.deepEqual((await (await get(token)).json()).data, confirmed);
  assert.deepEqual(
    (await (await post(token, "attending", first.version)).json()).data,
    confirmed,
  );
  assert.equal((await post(token, "not_attending", first.version)).status, 409);
  const decline = (
    await (await post(token, "not_attending", confirmed.version)).json()
  ).data;
  assert.equal(decline.rsvpStatus, "cancelled");
  assert.deepEqual((await (await get(token)).json()).data, decline);
  assert.equal(
    (await post(token, "reschedule_requested", decline.version)).status,
    400,
  );
  const separate = await issue();
  assert.equal(
    (await (await get(separate.token)).json()).data.rsvpStatus,
    "pending",
  );
});

test("deadline includes the exact cutoff; an already-open page cannot write or read protected details", async (t) => {
  let time = date;
  const store = openRsvpStore(":memory:", () => time);
  t.after(() => store.close());
  const { issue, get, post } = await serve(t, store);
  const { token } = await issue();
  const original = (await (await get(token)).json()).data;
  time = new Date(Date.parse(deadline) - 1);
  assert.equal((await post(token, "attending", original.version)).status, 200);
  for (const offset of [0, 1]) {
    time = new Date(Date.parse(deadline) + offset);
    for (const res of [
      await get(token),
      await post(token, "not_attending", original.version + 1),
    ]) {
      assert.equal(res.status, 410);
      assert.deepEqual(Object.keys(await res.json()), ["message"]);
    }
  }
});

test("rotate invalidates old reads and stale-page submits, preserves last RSVP, revoke blocks both current routes", async (t) => {
  const store = openRsvpStore(":memory:", () => date);
  t.after(() => store.close());
  const { issue, get, post, manage } = await serve(t, store);
  const { id, token } = await issue();
  const answered = (await (await post(token, "not_attending", 1)).json()).data;
  const replacement = (await (await manage("/" + id + "/rotate", {})).json())
    .data;
  assert.notEqual(replacement.token, token);
  for (const res of [
    await get(token),
    await post(token, "attending", answered.version),
  ]) {
    assert.equal(res.status, 404);
    assert.deepEqual(Object.keys(await res.json()), ["message"]);
  }
  const kept = (await (await get(replacement.token)).json()).data;
  assert.equal(kept.rsvpStatus, "cancelled");
  assert.equal(kept.respondedAt, answered.respondedAt);
  assert.equal(
    (await post(replacement.token, "attending", kept.version)).status,
    200,
  );
  assert.equal((await manage("/" + id + "/revoke", {})).status, 200);
  assert.equal((await get(replacement.token)).status, 410);
  assert.equal(
    (await post(replacement.token, "not_attending", kept.version + 1)).status,
    410,
  );
  assert.equal((await manage("/" + id + "/rotate", {})).status, 410);
});

test("local management rejects foreign origins; malformed and unknown links expose no invitation", async (t) => {
  const store = openRsvpStore(":memory:", () => date);
  t.after(() => store.close());
  const { get, manage } = await serve(t, store);
  assert.equal(
    (await manage("", {}, { origin: "https://example.invalid" })).status,
    403,
  );
  assert.equal((await manage("", {}, { "X-CampusFlow-Demo": "" })).status, 403);
  assert.equal(
    (await manage("", { document: { target: "email" }, expiresAt: deadline }))
      .status,
    400,
  );
  for (const token of ["invalid", "f".repeat(64)]) {
    const res = await get(token);
    assert.equal(res.status, 404);
    assert.deepEqual(Object.keys(await res.json()), ["message"]);
  }
});

test("server restart restores stored response; storage contains only a hash and RSVP never changes invitation identity or lifecycle", async () => {
  const dir = await mkdtemp(join(tmpdir(), "campusflow-rsvp-test-"));
  const filename = join(dir, "demo.sqlite");
  const doc = createInvitePresetDocument("formal");
  let store = openRsvpStore(filename, () => date);
  let key;
  let result;
  try {
    key = await store.issue(doc, deadline);
    result = await store.respond(key.token, "not_attending", 1);
  } finally {
    store.close();
  }
  store = openRsvpStore(filename, () => date);
  try {
    assert.deepEqual(await store.view(key.token), result);
  } finally {
    store.close();
  }
  const db = new DatabaseSync(filename);
  try {
    const row = db.prepare("SELECT * FROM demo_interview").get();
    assert.equal(JSON.stringify(row).includes(key.token), false);
    const invite = JSON.parse(row.state);
    assert.equal(invite.status, "ready");
    assert.equal(invite.applicantId, "demo-applicant-lin");
  } finally {
    db.close();
  }
});

test("denied stale-page submissions leave the stored row intact after rotation, expiry and revocation", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "campusflow-rsvp-test-"));
  const filename = join(dir, "demo.sqlite");
  let time = date;
  const store = openRsvpStore(filename, () => time);
  t.after(() => store.close());
  const audit = new DatabaseSync(filename, { readOnly: true });
  t.after(() => audit.close());
  const row = (id) => audit.prepare("SELECT * FROM demo_interview WHERE id=?").get(id);
  const { issue, post, manage } = await serve(t, store);
  const first = await issue();
  await post(first.token, "attending", 1);
  const rotated = (await (await manage("/" + first.id + "/rotate", {})).json()).data;
  const before = row(first.id);
  assert.equal(JSON.parse(before.state).rsvpStatus, "confirmed");
  assert.equal((await post(first.token, "not_attending", 2)).status, 404);
  assert.deepEqual(row(first.id), before);
  time = new Date(deadline);
  assert.equal((await post(rotated.token, "not_attending", 3)).status, 410);
  assert.deepEqual(row(first.id), before);
  time = date;
  const second = await issue();
  assert.equal((await post(second.token, "not_attending", 1)).status, 200);
  assert.equal((await manage("/" + second.id + "/revoke", {})).status, 200);
  const revoked = row(second.id);
  assert.equal(JSON.parse(revoked.state).rsvpStatus, "cancelled");
  assert.equal((await post(second.token, "attending", 2)).status, 410);
  assert.deepEqual(row(second.id), revoked);
});

test("demo interview follows the reply deadline's calendar day in Shanghai", async (t) => {
  const store = openRsvpStore(":memory:", () => date);
  t.after(() => store.close());
  const { token } = await store.issue(createInvitePresetDocument("formal"), "2026-11-23T17:30:00Z");
  const invite = await store.view(token);
  assert.equal(invite.context.interview_time, "2026-11-25 14:00–14:30");
  assert.equal(invite.document.blocks.find((b) => b.type === "event_info").props.date, "2026-11-25");
});
