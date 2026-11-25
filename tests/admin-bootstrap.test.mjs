import test from "node:test";
import assert from "node:assert/strict";
import { createApiApp } from "../shared/api/app.ts";
import { createActorResolver } from "../shared/auth/actor-resolver.ts";
import { createMemoryRepository } from "../shared/data/memory-repository.ts";
import { createMemoryRateLimiter } from "../shared/security/rate-limit.ts";
import { hashToken } from "../shared/security/tokens.ts";

const BOOTSTRAP_TOKEN = "test-bootstrap-token-1234567890";
const NOW = () => new Date("2026-11-10T00:00:00.000Z");

async function call(app, path, init = {}) {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const response = await app.handle(
    new Request(`http://localhost${path}`, { ...init, headers }),
  );
  return { response, body: await response.json() };
}

test("bootstrap is disabled when no token is configured", async () => {
  const repository = createMemoryRepository();
  const app = createApiApp({
    repository,
    resolveActor: createActorResolver({ repository, now: NOW }),
    now: NOW,
  });

  const { response, body } = await call(app, "/api/v1/bootstrap/admin", {
    method: "POST",
    body: JSON.stringify({
      token: BOOTSTRAP_TOKEN,
      name: "管理员",
      email: "admin@example.test",
    }),
  });

  assert.equal(response.status, 503);
  assert.equal(body.error, "bootstrap_not_configured");
  assert.equal(await repository.hasAdmin(), false);
});

test("invalid bootstrap tokens never create an admin", async () => {
  const repository = createMemoryRepository();
  const app = createApiApp({
    repository,
    resolveActor: createActorResolver({ repository, now: NOW }),
    bootstrap: { token: BOOTSTRAP_TOKEN },
    now: NOW,
  });

  const { response, body } = await call(app, "/api/v1/bootstrap/admin", {
    method: "POST",
    body: JSON.stringify({
      token: "wrong-bootstrap-token-123456",
      name: "管理员",
      email: "admin@example.test",
    }),
  });

  assert.equal(response.status, 403);
  assert.equal(body.error, "invalid_bootstrap_token");
  assert.equal(await repository.hasAdmin(), false);

  const { items } = await repository.listAuditEvents({ limit: 20, offset: 0 });
  assert.ok(
    items.some(
      (item) => item.action === "admin.bootstrap" && item.result === "denied",
    ),
  );
  assert.equal(JSON.stringify(items).includes("wrong-bootstrap-token-123456"), false);
});

test("concurrent bootstrap attempts only create one admin in the test repository", async () => {
  const repository = createMemoryRepository();
  const app = createApiApp({
    repository,
    resolveActor: createActorResolver({ repository, now: NOW }),
    bootstrap: { token: BOOTSTRAP_TOKEN },
    now: NOW,
  });

  const body = JSON.stringify({
    token: BOOTSTRAP_TOKEN,
    name: "管理员",
    email: "admin@example.test",
  });
  const [first, second] = await Promise.all([
    call(app, "/api/v1/bootstrap/admin", { method: "POST", body }),
    call(app, "/api/v1/bootstrap/admin", { method: "POST", body }),
  ]);

  const statuses = [first.response.status, second.response.status].sort();
  assert.deepEqual(statuses, [201, 409]);
  assert.equal((await repository.listMembers()).length, 1);
  assert.equal((await repository.listMembers())[0].role, "admin");
});

test("bootstrap attempts are rate limited per client key", async () => {
  const repository = createMemoryRepository();
  const app = createApiApp({
    repository,
    resolveActor: createActorResolver({ repository, now: NOW }),
    bootstrap: { token: BOOTSTRAP_TOKEN },
    rateLimiter: createMemoryRateLimiter({ windowMs: 60_000, maxAttempts: 1 }),
    now: NOW,
  });

  const first = await call(app, "/api/v1/bootstrap/admin", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify({
      token: "wrong-bootstrap-token-123456",
      name: "管理员",
      email: "admin@example.test",
    }),
  });
  assert.equal(first.response.status, 403);

  const second = await call(app, "/api/v1/bootstrap/admin", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify({
      token: "wrong-bootstrap-token-123456",
      name: "管理员",
      email: "admin@example.test",
    }),
  });
  assert.equal(second.response.status, 429);
  assert.equal(second.body.error, "rate_limited");
  assert.equal(await repository.hasAdmin(), false);

  const otherClient = await call(app, "/api/v1/bootstrap/admin", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.11" },
    body: JSON.stringify({
      token: "wrong-bootstrap-token-123456",
      name: "管理员",
      email: "admin@example.test",
    }),
  });
  assert.equal(otherClient.response.status, 403);
});

test("valid bootstrap creates exactly one admin and one usable session", async () => {
  const repository = createMemoryRepository();
  const app = createApiApp({
    repository,
    resolveActor: createActorResolver({ repository, now: NOW }),
    bootstrap: { token: BOOTSTRAP_TOKEN, sessionTtlMinutes: 60 },
    now: NOW,
  });

  const first = await call(app, "/api/v1/bootstrap/admin", {
    method: "POST",
    body: JSON.stringify({
      token: BOOTSTRAP_TOKEN,
      name: "管理员",
      email: "admin@example.test",
    }),
  });

  assert.equal(first.response.status, 201);
  assert.equal(first.body.data.member.role, "admin");
  assert.equal(first.body.data.member.status, "active");
  assert.equal(first.body.data.expiresAt, "2026-11-10T01:00:00.000Z");
  assert.equal(typeof first.body.data.sessionToken, "string");
  assert.equal(await repository.hasAdmin(), true);

  const sessionToken = first.body.data.sessionToken;
  const { items: auditItems } = await repository.listAuditEvents({
    limit: 20,
    offset: 0,
  });
  assert.ok(
    auditItems.some(
      (item) => item.action === "admin.bootstrap" && item.result === "success",
    ),
  );
  assert.ok(
    auditItems.some(
      (item) => item.action === "auth.login" && item.result === "success",
    ),
  );
  assert.equal(JSON.stringify(auditItems).includes(sessionToken), false);

  assert.equal(
    await repository.findMemberSessionByTokenHash(sessionToken),
    null,
  );
  assert.notEqual(
    await repository.findMemberSessionByTokenHash(
      await hashToken(sessionToken),
    ),
    null,
  );

  const members = await call(app, "/api/v1/members", {
    headers: { authorization: `Bearer ${sessionToken}` },
  });
  assert.equal(members.response.status, 200);
  assert.equal(members.body.data.length, 1);

  const second = await call(app, "/api/v1/bootstrap/admin", {
    method: "POST",
    body: JSON.stringify({
      token: BOOTSTRAP_TOKEN,
      name: "另一个管理员",
      email: "other-admin@example.test",
    }),
  });
  assert.equal(second.response.status, 409);
  assert.equal(second.body.error, "admin_already_initialized");

  const allMembers = await repository.listMembers();
  assert.equal(
    allMembers.filter((member) => member.role === "admin").length,
    1,
  );
});
