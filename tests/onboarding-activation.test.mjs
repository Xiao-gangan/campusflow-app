import test from "node:test";
import assert from "node:assert/strict";
import { createApiApp } from "../shared/api/app.ts";
import { createActorResolver } from "../shared/auth/actor-resolver.ts";
import { createMemoryRepository } from "../shared/data/memory-repository.ts";
import { isSchedulingEligible } from "../shared/domain/membership.ts";
import { activateMemberFromOnboarding } from "../shared/services/onboarding-activation.ts";
import { hashToken } from "../shared/security/tokens.ts";

const NOW = () => new Date("2026-11-10T00:00:00.000Z");
const PENDING_SCHEDULER_ID = "22222222-2222-4222-8222-222222222222";
const PENDING_OTHER_ID = "33333333-3333-4333-8333-333333333333";
const COMPLETED_INVITE_ID = "66666666-6666-4666-8666-666666666666";
const INCOMPLETE_INVITE_ID = "77777777-7777-4777-8777-777777777777";
const SESSION_TOKEN = "test-pending-scheduler-session-123456";

const nowIso = "2026-11-10T00:00:00.000Z";

function member(id, name, status = "pending_onboarding") {
  return {
    id,
    userId: null,
    name,
    email: `${id}@example.test`,
    role: "scheduler",
    departmentId: null,
    status,
    activatedAt: status === "active" ? "2026-11-01T00:00:00.000Z" : null,
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

function completedInvite(id, memberId) {
  return {
    id,
    applicantId: "88888888-8888-4888-8888-888888888888",
    memberId,
    tokenHash: `hash-${id}`,
    status: "completed",
    version: 6,
    expiresAt: "2026-12-31T00:00:00.000Z",
    revokedAt: null,
    acceptedAt: "2026-11-02T00:00:00.000Z",
    profileCompletedAt: "2026-11-03T00:00:00.000Z",
    timetableConfirmedAt: "2026-11-04T00:00:00.000Z",
    accountActivatedAt: "2026-11-05T00:00:00.000Z",
    completedAt: "2026-11-06T00:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-06T00:00:00.000Z",
  };
}

function incompleteInvite(id, memberId) {
  return {
    ...completedInvite(id, memberId),
    status: "account_activated",
    completedAt: null,
  };
}

async function call(app, path, init = {}) {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const response = await app.handle(
    new Request(`http://localhost${path}`, { ...init, headers }),
  );
  return { response, body: await response.json() };
}

test("a completed invite still grants no formal permissions while the member is pending", async () => {
  const repository = createMemoryRepository({
    members: [member(PENDING_SCHEDULER_ID, "待激活排班负责人")],
    memberSessions: [
      {
        id: "pending-session",
        memberId: PENDING_SCHEDULER_ID,
        tokenHash: await hashToken(SESSION_TOKEN),
        expiresAt: "2026-12-01T00:00:00.000Z",
        revokedAt: null,
        createdAt: "2026-11-01T00:00:00.000Z",
      },
    ],
    onboardingInvites: [
      completedInvite(COMPLETED_INVITE_ID, PENDING_SCHEDULER_ID),
    ],
  });

  const app = createApiApp({
    repository,
    resolveActor: createActorResolver({ repository, now: NOW }),
    now: NOW,
  });

  const before = await call(app, "/api/v1/members", {
    headers: { authorization: `Bearer ${SESSION_TOKEN}` },
  });
  assert.equal(before.response.status, 403);
  assert.equal(before.body.error, "member_not_active");

  const activation = await activateMemberFromOnboarding({
    repository,
    inviteId: COMPLETED_INVITE_ID,
    at: nowIso,
  });
  assert.equal(activation.ok, true);
  assert.equal(activation.member.status, "active");
  assert.equal(isSchedulingEligible(activation.member), true);

  const { items: auditItems } = await repository.listAuditEvents({
    limit: 20,
    offset: 0,
  });
  assert.ok(
    auditItems.some(
      (item) =>
        item.action === "member.activated" &&
        item.result === "success" &&
        item.targetId === PENDING_SCHEDULER_ID,
    ),
  );

  const after = await call(app, "/api/v1/members", {
    headers: { authorization: `Bearer ${SESSION_TOKEN}` },
  });
  assert.equal(after.response.status, 200);
});

test("account_activated cannot be activated and produces no partial mutation", async () => {
  const repository = createMemoryRepository({
    members: [member(PENDING_OTHER_ID, "待完成同学")],
    onboardingInvites: [
      incompleteInvite(INCOMPLETE_INVITE_ID, PENDING_OTHER_ID),
    ],
  });

  const result = await activateMemberFromOnboarding({
    repository,
    inviteId: INCOMPLETE_INVITE_ID,
    at: nowIso,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "invite_not_completed");

  const memberAfter = await repository.findMemberById(PENDING_OTHER_ID);
  const inviteAfter =
    await repository.findOnboardingInviteById(INCOMPLETE_INVITE_ID);
  assert.equal(memberAfter.status, "pending_onboarding");
  assert.equal(inviteAfter.status, "account_activated");
});

test("activation is idempotent and repository rejects member mismatch", async () => {
  const repository = createMemoryRepository({
    members: [member(PENDING_SCHEDULER_ID, "待激活排班负责人")],
    onboardingInvites: [
      completedInvite(COMPLETED_INVITE_ID, PENDING_SCHEDULER_ID),
    ],
  });

  const mismatch = await repository.commitOnboardingActivation({
    inviteId: COMPLETED_INVITE_ID,
    memberId: PENDING_OTHER_ID,
    at: nowIso,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, "invite_member_mismatch");

  const first = await activateMemberFromOnboarding({
    repository,
    inviteId: COMPLETED_INVITE_ID,
    at: nowIso,
  });
  const second = await activateMemberFromOnboarding({
    repository,
    inviteId: COMPLETED_INVITE_ID,
    at: nowIso,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.member.status, "active");
  assert.equal((await repository.listMembers()).length, 1);
});

test("activation rejects a completed invite with no linked member", async () => {
  const repository = createMemoryRepository({
    members: [member(PENDING_SCHEDULER_ID, "待激活排班负责人")],
    onboardingInvites: [
      {
        ...completedInvite(COMPLETED_INVITE_ID, PENDING_SCHEDULER_ID),
        memberId: null,
      },
    ],
  });

  const result = await activateMemberFromOnboarding({
    repository,
    inviteId: COMPLETED_INVITE_ID,
    at: nowIso,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "member_not_found");
});
