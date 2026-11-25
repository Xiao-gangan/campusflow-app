import test from "node:test";
import assert from "node:assert/strict";
import { createApiApp } from "../shared/api/app.ts";
import { createActorResolver } from "../shared/auth/actor-resolver.ts";
import { issueMemberSession } from "../shared/auth/member-sessions.ts";
import { createMemoryRepository } from "../shared/data/memory-repository.ts";
import { AUDIT_ACTIONS } from "../shared/contracts/audit.ts";
import { redactAuditMetadata } from "../shared/security/audit.ts";

const NOW = () => new Date("2026-11-10T00:00:00.000Z");
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";

function member(id, role) {
  return {
    id,
    userId: null,
    name: id,
    email: `${id}@example.test`,
    role,
    departmentId: null,
    status: "active",
    activatedAt: "2026-11-01T00:00:00.000Z",
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

async function call(app, path, token) {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await app.handle(
    new Request(`http://localhost${path}`, { headers }),
  );
  return { response, body: await response.json() };
}

test("audit action contract covers the required security operations", () => {
  for (const action of [
    "admin.bootstrap",
    "auth.login",
    "auth.logout",
    "member.role_changed",
    "member.activated",
    "member.deactivated",
    "invitation.created",
    "invitation.revoked",
    "invitation.regenerated",
    "onboarding.transitioned",
    "security.access_denied",
  ]) {
    assert.equal(AUDIT_ACTIONS.includes(action), true);
  }
});

test("audit metadata redaction removes credentials and contact fields", () => {
  const redacted = redactAuditMetadata({
    token: "x",
    password: "x",
    email: "person@example.test",
    reason: "role_changed",
    nested: { cookie: "x", safe: "ok" },
  });

  assert.deepEqual(redacted, {
    reason: "role_changed",
    nested: { safe: "ok" },
  });
});

test("admin can paginate audit events and sensitive fields never appear", async () => {
  const repository = createMemoryRepository({
    members: [member(ADMIN_ID, "admin"), member(MEMBER_ID, "member")],
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

  await repository.recordAuditEvent({
    actorKind: "member",
    actorId: ADMIN_ID,
    action: "member.role_changed",
    targetType: "member",
    targetId: MEMBER_ID,
    result: "success",
    metadata: {
      token: "x",
      password: "x",
      email: "person@example.test",
      reason: "promotion",
    },
  });
  await repository.recordAuditEvent({
    actorKind: "anonymous",
    actorId: null,
    action: "security.access_denied",
    targetType: "api",
    targetId: "/api/v1/members",
    result: "denied",
    metadata: { reason: "forbidden", cookie: "x" },
  });

  const { items: allItems } = await repository.listAuditEvents({
    limit: 20,
    offset: 0,
  });
  const roleEvent = allItems.find(
    (item) => item.action === "member.role_changed",
  );
  const deniedEvent = allItems.find(
    (item) => item.action === "security.access_denied",
  );
  assert.deepEqual(roleEvent.metadata, { reason: "promotion" });
  assert.deepEqual(deniedEvent.metadata, { reason: "forbidden" });

  const app = createApiApp({
    repository,
    resolveActor: createActorResolver({ repository, now: NOW }),
    now: NOW,
  });

  const first = await call(app, "/api/v1/audit-events?limit=1&offset=0", admin.sessionToken);
  assert.equal(first.response.status, 200);
  assert.equal(first.body.data.items.length, 1);
  assert.equal(first.body.data.total, 2);
  assert.equal(first.body.data.nextOffset, 1);

  const serialized = JSON.stringify(first.body.data);
  assert.equal(serialized.includes("person@example.test"), false);
  assert.equal(serialized.includes(admin.sessionToken), false);
  assert.equal(serialized.includes('"token"'), false);
  assert.equal(serialized.includes('"password"'), false);

  const second = await call(app, "/api/v1/audit-events?limit=1&offset=1", admin.sessionToken);
  assert.equal(second.response.status, 200);
  assert.equal(second.body.data.nextOffset, null);

  const forbidden = await call(app, "/api/v1/audit-events", memberSession.sessionToken);
  assert.equal(forbidden.response.status, 403);
});
