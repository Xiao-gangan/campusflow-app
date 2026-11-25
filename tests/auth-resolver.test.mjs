import test from "node:test";
import assert from "node:assert/strict";
import { createActorResolver } from "../shared/auth/actor-resolver.ts";
import { hashToken } from "../shared/security/tokens.ts";
import { createMemoryRepository } from "../shared/data/memory-repository.ts";

const NOW = () => new Date("2026-11-10T00:00:00.000Z");
const ACTIVE_ID = "11111111-1111-4111-8111-111111111111";
const PENDING_ID = "22222222-2222-4222-8222-222222222222";
const INVITE_ID = "66666666-6666-4666-8666-666666666666";
const APPLICANT_ID = "77777777-7777-4777-8777-777777777777";

const memberToken = "test-member-session-token-123456";
const pendingToken = "test-pending-session-token-123456";
const expiredToken = "test-expired-session-token-123456";
const revokedToken = "test-revoked-session-token-123456";
const onboardingToken = "test-onboarding-token-123456";
const completedOnboardingToken = "test-completed-onboarding-token-123456";

const repository = createMemoryRepository({
  members: [
    {
      id: ACTIVE_ID,
      userId: null,
      name: "正式成员",
      email: "active@example.test",
      role: "member",
      departmentId: null,
      status: "active",
      activatedAt: "2026-11-01T00:00:00.000Z",
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    {
      id: PENDING_ID,
      userId: null,
      name: "待入组同学",
      email: "pending@example.test",
      role: "member",
      departmentId: null,
      status: "pending_onboarding",
      activatedAt: null,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
  ],
  memberSessions: [
    {
      id: "session-active",
      memberId: ACTIVE_ID,
      tokenHash: await hashToken(memberToken),
      expiresAt: "2026-12-01T00:00:00.000Z",
      revokedAt: null,
      createdAt: "2026-11-01T00:00:00.000Z",
    },
    {
      id: "session-pending",
      memberId: PENDING_ID,
      tokenHash: await hashToken(pendingToken),
      expiresAt: "2026-12-01T00:00:00.000Z",
      revokedAt: null,
      createdAt: "2026-11-01T00:00:00.000Z",
    },
    {
      id: "session-expired",
      memberId: ACTIVE_ID,
      tokenHash: await hashToken(expiredToken),
      expiresAt: "2026-11-01T00:00:00.000Z",
      revokedAt: null,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    {
      id: "session-revoked",
      memberId: ACTIVE_ID,
      tokenHash: await hashToken(revokedToken),
      expiresAt: "2026-12-01T00:00:00.000Z",
      revokedAt: "2026-11-05T00:00:00.000Z",
      createdAt: "2026-10-01T00:00:00.000Z",
    },
  ],
  onboardingInvites: [
    {
      id: INVITE_ID,
      applicantId: APPLICANT_ID,
      memberId: PENDING_ID,
      tokenHash: await hashToken(onboardingToken),
      status: "invited",
      version: 1,
      expiresAt: "2026-12-31T00:00:00.000Z",
      revokedAt: null,
      acceptedAt: null,
      profileCompletedAt: null,
      timetableConfirmedAt: null,
      accountActivatedAt: null,
      completedAt: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    },
    {
      id: "99999999-9999-4999-8999-999999999999",
      applicantId: APPLICANT_ID,
      memberId: PENDING_ID,
      tokenHash: await hashToken(completedOnboardingToken),
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
    },
  ],
});

const resolve = createActorResolver({ repository, now: NOW });

function request(headers) {
  return new Request("http://localhost/api/v1/me", { headers });
}

test("member session tokens resolve active and pending members without external platform accounts", async () => {
  assert.deepEqual(
    await resolve(request({ authorization: `Bearer ${memberToken}` })),
    {
      kind: "member",
      memberId: ACTIVE_ID,
      role: "member",
      memberStatus: "active",
    },
  );

  assert.deepEqual(
    await resolve(request({ "x-session-token": pendingToken })),
    {
      kind: "member",
      memberId: PENDING_ID,
      role: "member",
      memberStatus: "pending_onboarding",
    },
  );

  assert.deepEqual(
    await resolve(
      request({ cookie: `campusflow_session=${memberToken}` }),
    ),
    {
      kind: "member",
      memberId: ACTIVE_ID,
      role: "member",
      memberStatus: "active",
    },
  );
});

test("expired and revoked sessions are anonymous", async () => {
  assert.deepEqual(
    await resolve(request({ authorization: `Bearer ${expiredToken}` })),
    { kind: "anonymous" },
  );
  assert.deepEqual(
    await resolve(request({ authorization: `Bearer ${revokedToken}` })),
    { kind: "anonymous" },
  );
});

test("onboarding tokens resolve to a scoped candidate actor", async () => {
  const expected = {
    kind: "candidate",
    applicantId: APPLICANT_ID,
    onboardingInviteId: INVITE_ID,
  };

  assert.deepEqual(
    await resolve(request({ "x-onboarding-token": onboardingToken })),
    expected,
  );
  assert.deepEqual(
    await resolve(request({ authorization: `Bearer ${onboardingToken}` })),
    expected,
  );
  assert.deepEqual(
    await resolve(
      request({ cookie: `campusflow_onboarding=${onboardingToken}` }),
    ),
    expected,
  );
});

test("completed onboarding links and missing tokens do not authenticate", async () => {
  assert.deepEqual(
    await resolve(
      request({ authorization: `Bearer ${completedOnboardingToken}` }),
    ),
    { kind: "anonymous" },
  );
  assert.deepEqual(await resolve(request({})), { kind: "anonymous" });
});
