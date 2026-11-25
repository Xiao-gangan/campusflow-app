import test from "node:test";
import assert from "node:assert/strict";
import { createApiApp } from "../shared/api/app.ts";
import { createActorResolver } from "../shared/auth/actor-resolver.ts";
import { issueMemberSession } from "../shared/auth/member-sessions.ts";
import { createMemoryRepository } from "../shared/data/memory-repository.ts";

const NOW = () => new Date("2026-11-10T00:00:00.000Z");
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const INACTIVE_ID = "33333333-3333-4333-8333-333333333333";

function member(id, role, status = "active") {
  return {
    id,
    userId: null,
    name: id,
    email: `${id}@example.test`,
    role,
    departmentId: null,
    status,
    activatedAt: status === "active" ? "2026-11-01T00:00:00.000Z" : null,
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

async function setup() {
  const repository = createMemoryRepository({
    members: [
      member(ADMIN_ID, "admin"),
      member(MEMBER_ID, "member"),
      member(INACTIVE_ID, "member", "inactive"),
    ],
  });
  const app = createApiApp({
    repository,
    resolveActor: createActorResolver({ repository, now: NOW }),
    now: NOW,
  });
  const admin = await issueMemberSession({
    repository,
    memberId: ADMIN_ID,
    now: NOW(),
    ttlMinutes: 60,
  });
  const memberSession = await issueMemberSession({
    repository,
    memberId: MEMBER_ID,
    now: NOW(),
    ttlMinutes: 60,
  });
  const inactiveSession = await issueMemberSession({
    repository,
    memberId: INACTIVE_ID,
    now: NOW(),
    ttlMinutes: 60,
  });

  return { repository, app, admin, memberSession, inactiveSession };
}

async function call(app, path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  if (options.cookie) headers.set("cookie", `campusflow_session=${options.cookie}`);
  if (options.origin) headers.set("origin", options.origin);
  if (options.host) headers.set("host", options.host);
  if (options.body !== undefined) headers.set("content-type", "application/json");

  const host = options.host ?? "localhost";
  const response = await app.handle(
    new Request(`http://${host}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
  return { response, body: await response.json() };
}

test("logout revokes the current session and records a redacted audit event", async () => {
  const { repository, app, memberSession } = await setup();

  const before = await call(app, "/api/v1/me", { token: memberSession.sessionToken });
  assert.equal(before.response.status, 200);

  const logout = await call(app, "/api/v1/auth/logout", {
    method: "POST",
    token: memberSession.sessionToken,
  });
  assert.equal(logout.response.status, 200);
  assert.equal(logout.body.data.revoked, true);

  const after = await call(app, "/api/v1/me", { token: memberSession.sessionToken });
  assert.equal(after.response.status, 401);

  const { items } = await repository.listAuditEvents({ limit: 20, offset: 0 });
  assert.ok(items.some((item) => item.action === "auth.logout" && item.result === "success"));
  assert.ok(items.some((item) => item.action === "security.access_denied"));
  assert.equal(JSON.stringify(items).includes(memberSession.sessionToken), false);
});

test("admin can revoke member sessions and non-admins cannot", async () => {
  const { app, admin, memberSession } = await setup();

  const forbidden = await call(
    app,
    `/api/v1/members/${MEMBER_ID}/sessions/revoke`,
    { method: "POST", token: memberSession.sessionToken },
  );
  assert.equal(forbidden.response.status, 403);

  const revoked = await call(
    app,
    `/api/v1/members/${MEMBER_ID}/sessions/revoke`,
    { method: "POST", token: admin.sessionToken },
  );
  assert.equal(revoked.response.status, 200);
  assert.equal(revoked.body.data.revokedSessions, 1);

  const after = await call(app, "/api/v1/me", { token: memberSession.sessionToken });
  assert.equal(after.response.status, 401);
});

test("cookie-authenticated writes require a same-origin request", async () => {
  const { app, memberSession } = await setup();

  const noOrigin = await call(app, "/api/v1/auth/logout", {
    method: "POST",
    cookie: memberSession.sessionToken,
    host: "app.example.test",
  });
  assert.equal(noOrigin.response.status, 403);
  assert.equal(noOrigin.body.error, "forbidden");

  const crossOrigin = await call(app, "/api/v1/auth/logout", {
    method: "POST",
    cookie: memberSession.sessionToken,
    host: "app.example.test",
    origin: "https://evil.example",
  });
  assert.equal(crossOrigin.response.status, 403);

  const sameOrigin = await call(app, "/api/v1/auth/logout", {
    method: "POST",
    cookie: memberSession.sessionToken,
    host: "app.example.test",
    origin: "https://app.example.test",
  });
  assert.equal(sameOrigin.response.status, 200);
});

test("inactive members keep identity but lose protected permissions", async () => {
  const { app, inactiveSession } = await setup();

  const me = await call(app, "/api/v1/me", { token: inactiveSession.sessionToken });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.data.status, "inactive");

  const members = await call(app, "/api/v1/members", {
    token: inactiveSession.sessionToken,
  });
  assert.equal(members.response.status, 403);
  assert.equal(members.body.error, "member_not_active");
});

test("forged role and member headers cannot elevate a session", async () => {
  const { app, memberSession } = await setup();

  const anonymous = await call(app, "/api/v1/members", {
    headers: { "x-role": "admin", "x-member-id": ADMIN_ID },
  });
  assert.equal(anonymous.response.status, 401);

  const forged = await call(app, "/api/v1/members", {
    token: memberSession.sessionToken,
    headers: { "x-role": "admin", "x-member-id": ADMIN_ID },
  });
  assert.equal(forged.response.status, 403);
  assert.equal(forged.body.error, "forbidden");
});
