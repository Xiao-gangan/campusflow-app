import test from "node:test";
import assert from "node:assert/strict";
import { createActorResolver } from "../shared/auth/actor-resolver.ts";
import { issueMemberSession } from "../shared/auth/member-sessions.ts";
import { createMemoryRepository } from "../shared/data/memory-repository.ts";

const NOW = () => new Date("2026-11-10T00:00:00.000Z");
const ACTIVE_ID = "11111111-1111-4111-8111-111111111111";
const PENDING_ID = "22222222-2222-4222-8222-222222222222";

function member(id, status) {
  return {
    id,
    userId: null,
    name: id,
    email: `${id}@example.test`,
    role: "member",
    departmentId: null,
    status,
    activatedAt: status === "active" ? "2026-11-01T00:00:00.000Z" : null,
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

test("app member sessions can be issued without an external platform account", async () => {
  const repository = createMemoryRepository({
    members: [
      member(ACTIVE_ID, "active"),
      member(PENDING_ID, "pending_onboarding"),
    ],
  });
  const resolve = createActorResolver({ repository, now: NOW });

  const active = await issueMemberSession({
    repository,
    memberId: ACTIVE_ID,
    now: NOW(),
    ttlMinutes: 60,
  });
  const pending = await issueMemberSession({
    repository,
    memberId: PENDING_ID,
    now: NOW(),
    ttlMinutes: 60,
  });
  const secondActive = await issueMemberSession({
    repository,
    memberId: ACTIVE_ID,
    now: NOW(),
    ttlMinutes: 60,
  });

  assert.notEqual(active.sessionToken, secondActive.sessionToken);
  assert.notEqual(active.session.id, secondActive.session.id);

  assert.equal(
    await repository.findMemberSessionByTokenHash(active.sessionToken),
    null,
  );
  assert.notEqual(
    await repository.findMemberSessionByTokenHash(
      active.session.tokenHash,
    ),
    null,
  );

  assert.equal(active.session.expiresAt, "2026-11-10T01:00:00.000Z");
  assert.deepEqual(
    await resolve(
      new Request("http://localhost/api/v1/me", {
        headers: { authorization: `Bearer ${active.sessionToken}` },
      }),
    ),
    {
      kind: "member",
      memberId: ACTIVE_ID,
      role: "member",
      memberStatus: "active",
    },
  );
  assert.deepEqual(
    await resolve(
      new Request("http://localhost/api/v1/me", {
        headers: { authorization: `Bearer ${pending.sessionToken}` },
      }),
    ),
    {
      kind: "member",
      memberId: PENDING_ID,
      role: "member",
      memberStatus: "pending_onboarding",
    },
  );
});
