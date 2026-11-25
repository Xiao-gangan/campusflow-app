import test from "node:test";
import assert from "node:assert/strict";
import { createApiApp } from "../shared/api/app.ts";
import { normalizeApiPath } from "../shared/api/router.ts";
import { createMemoryRepository } from "../shared/data/memory-repository.ts";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const PENDING_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const DEPT_ID = "44444444-4444-4444-8444-444444444444";
const TERM_ID = "55555555-5555-4555-8555-555555555555";
const INVITE_ID = "66666666-6666-4666-8666-666666666666";
const APPLICANT_ID = "77777777-7777-4777-8777-777777777777";
const OTHER_INVITE_ID = "88888888-8888-4888-8888-888888888888";
const EXPIRED_INVITE_ID = "99999999-9999-4999-8999-999999999999";
const REVOKED_INVITE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const members = [
  {
    id: ADMIN_ID,
    userId: "user-admin",
    name: "管理员",
    email: "admin@example.test",
    role: "admin",
    departmentId: DEPT_ID,
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
    departmentId: DEPT_ID,
    status: "pending_onboarding",
    activatedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
  },
  {
    id: MEMBER_ID,
    userId: "user-member",
    name: "林知夏",
    email: "lin@example.test",
    role: "member",
    departmentId: DEPT_ID,
    status: "active",
    activatedAt: "2026-11-01T00:00:00.000Z",
    createdAt: "2026-10-01T00:00:00.000Z",
  },
];

const onboardingInvite = {
  id: INVITE_ID,
  applicantId: APPLICANT_ID,
  memberId: PENDING_ID,
  tokenHash: "top-secret-onboarding-token-hash",
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
};

const expiredInvite = {
  ...onboardingInvite,
  id: EXPIRED_INVITE_ID,
  tokenHash: "expired-token-hash",
  expiresAt: "2026-11-01T00:00:00.000Z",
};

const revokedInvite = {
  ...onboardingInvite,
  id: REVOKED_INVITE_ID,
  tokenHash: "revoked-token-hash",
  status: "revoked",
  version: 2,
  revokedAt: "2026-11-02T00:00:00.000Z",
};

const repository = createMemoryRepository({
  members,
  departments: [{ id: DEPT_ID, name: "技术部", createdAt: "2026-10-01T00:00:00.000Z" }],
  terms: [
    {
      id: TERM_ID,
      name: "2026 秋季学期",
      startDate: "2026-09-01",
      endDate: "2027-01-15",
      weekCount: 18,
      active: true,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
  ],
  onboardingInvites: [onboardingInvite, expiredInvite, revokedInvite],
  courses: [
    {
      id: "course-1",
      memberId: MEMBER_ID,
      termId: TERM_ID,
      name: "高等数学",
      teacher: "张老师",
      room: "A101",
      weekday: 1,
      startMinute: 480,
      endMinute: 580,
      weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    },
  ],
  timetableConfirmations: [
    {
      id: "confirmation-1",
      memberId: MEMBER_ID,
      termId: TERM_ID,
      source: "manual",
      confirmedAt: "2026-11-02T00:00:00.000Z",
    },
  ],
});

function resolveActor(request) {
  const actor = request.headers.get("x-test-actor");
  if (actor === "admin") {
    return { kind: "member", memberId: ADMIN_ID, role: "admin", memberStatus: "active" };
  }
  if (actor === "pending") {
    return {
      kind: "member",
      memberId: PENDING_ID,
      role: "member",
      memberStatus: "pending_onboarding",
    };
  }
  if (actor === "member") {
    return { kind: "member", memberId: MEMBER_ID, role: "member", memberStatus: "active" };
  }
  if (actor === "candidate") {
    return {
      kind: "candidate",
      applicantId: APPLICANT_ID,
      onboardingInviteId: INVITE_ID,
    };
  }
  if (actor === "other-candidate") {
    return {
      kind: "candidate",
      applicantId: APPLICANT_ID,
      onboardingInviteId: OTHER_INVITE_ID,
    };
  }
  if (actor === "candidate-mismatch") {
    return {
      kind: "candidate",
      applicantId: OTHER_INVITE_ID,
      onboardingInviteId: INVITE_ID,
    };
  }
  if (actor === "candidate-expired") {
    return {
      kind: "candidate",
      applicantId: APPLICANT_ID,
      onboardingInviteId: EXPIRED_INVITE_ID,
    };
  }
  if (actor === "candidate-revoked") {
    return {
      kind: "candidate",
      applicantId: APPLICANT_ID,
      onboardingInviteId: REVOKED_INVITE_ID,
    };
  }
  return { kind: "anonymous" };
}

const app = createApiApp({ repository, resolveActor });

async function call(path, actor, init = {}) {
  const headers = new Headers(init.headers);
  if (actor) headers.set("x-test-actor", actor);
  if (init.body !== undefined) headers.set("content-type", "application/json");

  const response = await app.handle(
    new Request(`http://localhost${path}`, { ...init, headers }),
  );
  const body = await response.json();
  return { response, body };
}

test("API paths accept platform prefixes and reject non-v1 paths", () => {
  assert.equal(
    normalizeApiPath("/functions/v1/app/api/v1/health"),
    "/api/v1/health",
  );
  assert.equal(
    normalizeApiPath(
      "/functions/v1/app-daaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/api/v1/members",
    ),
    "/api/v1/members",
  );
  assert.equal(normalizeApiPath("/api/v1/health/"), "/api/v1/health");
  assert.equal(normalizeApiPath("/api/v2/health"), null);
  assert.equal(normalizeApiPath("/health"), null);
});

test("public health route works without an actor", async () => {
  const { response, body } = await call("/api/v1/health");
  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    data: { ok: true, service: "campusflow", apiVersion: "v1" },
  });

  const prefixed = await call("/functions/v1/app/api/v1/health");
  assert.equal(prefixed.response.status, 200);
});

test("member routes enforce authentication and active membership", async () => {
  const anonymous = await call("/api/v1/members");
  assert.equal(anonymous.response.status, 401);
  assert.equal(anonymous.body.error, "unauthorized");

  const pending = await call("/api/v1/members", "pending");
  assert.equal(pending.response.status, 403);
  assert.equal(pending.body.error, "member_not_active");

  const regularMember = await call("/api/v1/members", "member");
  assert.equal(regularMember.response.status, 403);
  assert.equal(regularMember.body.error, "forbidden");

  const admin = await call("/api/v1/members", "admin");
  assert.equal(admin.response.status, 200);
  assert.equal(admin.body.data.length, 3);
});

test("me, departments and terms use the unified success envelope", async () => {
  const me = await call("/api/v1/me", "admin");
  assert.equal(me.response.status, 200);
  assert.equal(me.body.data.id, ADMIN_ID);

  const pendingMe = await call("/api/v1/me", "pending");
  assert.equal(pendingMe.response.status, 200);
  assert.equal(pendingMe.body.data.status, "pending_onboarding");

  const departments = await call("/api/v1/departments", "member");
  assert.equal(departments.response.status, 200);
  assert.equal(departments.body.data[0].name, "技术部");

  const terms = await call("/api/v1/terms", "member");
  assert.equal(terms.response.status, 200);
  assert.equal(terms.body.data[0].id, TERM_ID);
});

test("onboarding invite access is scoped and never returns the token hash", async () => {
  const candidate = await call(
    `/api/v1/onboarding/invites/${INVITE_ID}`,
    "candidate",
  );
  assert.equal(candidate.response.status, 200);
  assert.equal(candidate.body.data.id, INVITE_ID);
  assert.equal("tokenHash" in candidate.body.data, false);

  const otherCandidate = await call(
    `/api/v1/onboarding/invites/${INVITE_ID}`,
    "other-candidate",
  );
  assert.equal(otherCandidate.response.status, 403);

  const admin = await call(
    `/api/v1/onboarding/invites/${INVITE_ID}`,
    "admin",
  );
  assert.equal(admin.response.status, 200);
  assert.equal("tokenHash" in admin.body.data, false);
});

test("candidate tokens cannot cross invite boundaries or access member APIs", async () => {
  const mismatch = await call(
    `/api/v1/onboarding/invites/${INVITE_ID}`,
    "candidate-mismatch",
  );
  assert.equal(mismatch.response.status, 403);
  assert.equal(mismatch.body.error, "forbidden");

  const memberApi = await call("/api/v1/members", "candidate");
  assert.equal(memberApi.response.status, 401);
  assert.equal(memberApi.body.error, "unauthorized");

  const memberRole = await call(
    `/api/v1/onboarding/invites/${INVITE_ID}`,
    "member",
  );
  assert.equal(memberRole.response.status, 403);
  assert.equal(memberRole.body.error, "forbidden");

  const expired = await call(
    `/api/v1/onboarding/invites/${EXPIRED_INVITE_ID}`,
    "candidate-expired",
  );
  assert.equal(expired.response.status, 410);
  assert.equal(expired.body.error, "onboarding_expired");

  const revoked = await call(
    `/api/v1/onboarding/invites/${REVOKED_INVITE_ID}`,
    "candidate-revoked",
  );
  assert.equal(revoked.response.status, 410);
  assert.equal(revoked.body.error, "onboarding_revoked");
});

test("manager availability is redacted and requires a valid term", async () => {
  const { response, body } = await call(
    `/api/v1/members/${MEMBER_ID}/availability?termId=${TERM_ID}`,
    "admin",
  );
  assert.equal(response.status, 200);
  assert.equal(body.data.confirmed, true);

  const serialized = JSON.stringify(body.data);
  assert.equal(serialized.includes("高等数学"), false);
  assert.equal(serialized.includes("张老师"), false);
  assert.equal(serialized.includes("A101"), false);
  assert.ok(body.data.slots.some((slot) => slot.state === "BUSY"));

  const missingTerm = await call(
    `/api/v1/members/${MEMBER_ID}/availability`,
    "admin",
  );
  assert.equal(missingTerm.response.status, 400);
  assert.equal(missingTerm.body.error, "invalid_request");

  const badMember = await call(
    `/api/v1/members/not-a-uuid/availability?termId=${TERM_ID}`,
    "admin",
  );
  assert.equal(badMember.response.status, 400);
});

test("unknown routes and methods return stable errors", async () => {
  const missing = await call("/api/v1/does-not-exist");
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.error, "not_found");

  const wrongMethod = await call("/api/v1/health", null, { method: "POST" });
  assert.equal(wrongMethod.response.status, 405);
  assert.equal(wrongMethod.body.error, "method_not_allowed");
  assert.equal(wrongMethod.response.headers.get("allow"), "GET");
});
