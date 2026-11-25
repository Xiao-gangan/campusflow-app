import test from "node:test";
import assert from "node:assert/strict";
import { createActorResolver } from "../shared/auth/actor-resolver.ts";
import { createMemoryRepository } from "../shared/data/memory-repository.ts";
import {
  canApplyAsyncInviteResult,
  rotateOnboardingToken,
} from "../shared/domain/onboarding.ts";
import { hashToken } from "../shared/security/tokens.ts";

const NOW = () => new Date("2026-11-10T00:00:00.000Z");
const INVITE_ID = "66666666-6666-4666-8666-666666666666";
const APPLICANT_ID = "77777777-7777-4777-8777-777777777777";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";

const oldToken = "test-old-onboarding-token-123456";
const newToken = "test-new-onboarding-token-123456";

function invite(tokenHash, overrides = {}) {
  return {
    id: INVITE_ID,
    applicantId: APPLICANT_ID,
    memberId: MEMBER_ID,
    tokenHash,
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
    ...overrides,
  };
}

function request(token) {
  return new Request("http://localhost/api/v1/onboarding/invites/x", {
    headers: { "x-onboarding-token": token },
  });
}

test("opening an invite does not consume or rotate its token", async () => {
  const oldHash = await hashToken(oldToken);
  const repository = createMemoryRepository({
    onboardingInvites: [invite(oldHash)],
  });
  const resolve = createActorResolver({ repository, now: NOW });

  const actor = await resolve(request(oldToken));
  assert.equal(actor.kind, "candidate");

  const stored = await repository.findOnboardingInviteById(INVITE_ID);
  assert.equal(stored.status, "invited");
  assert.equal(stored.version, 1);
  assert.equal(stored.tokenHash, oldHash);

  const again = await resolve(request(oldToken));
  assert.equal(again.kind, "candidate");
});

test("rotating a token invalidates the old credential immediately", async () => {
  const oldHash = await hashToken(oldToken);
  const newHash = await hashToken(newToken);
  const repository = createMemoryRepository({
    onboardingInvites: [invite(oldHash)],
  });
  const resolve = createActorResolver({ repository, now: NOW });

  assert.equal((await resolve(request(oldToken))).kind, "candidate");

  const rotated = await repository.rotateOnboardingInviteToken({
    inviteId: INVITE_ID,
    newTokenHash: newHash,
    at: "2026-11-10T00:00:00.000Z",
  });
  assert.equal(rotated.ok, true);
  assert.equal(rotated.invite.version, 2);
  assert.equal(rotated.invite.tokenHash, newHash);

  assert.deepEqual(await resolve(request(oldToken)), { kind: "anonymous" });
  assert.equal((await resolve(request(newToken))).kind, "candidate");

  assert.equal(
    canApplyAsyncInviteResult(
      rotated.invite,
      { version: 1, status: "invited" },
      "2026-11-10T00:00:00.000Z",
    ),
    false,
  );
  assert.equal(
    canApplyAsyncInviteResult(
      rotated.invite,
      { version: 2, status: "invited" },
      "2026-11-10T00:00:00.000Z",
    ),
    true,
  );
});

test("revoked invites cannot be rotated or reactivated by async results", async () => {
  const oldHash = await hashToken(oldToken);
  const repository = createMemoryRepository({
    onboardingInvites: [invite(oldHash)],
  });
  const resolve = createActorResolver({ repository, now: NOW });

  const revoked = await repository.revokeOnboardingInvite({
    inviteId: INVITE_ID,
    at: "2026-11-10T00:00:00.000Z",
  });
  assert.equal(revoked.ok, true);
  assert.equal(revoked.invite.status, "revoked");
  assert.equal(revoked.invite.version, 2);
  assert.equal(revoked.invite.revokedAt, "2026-11-10T00:00:00.000Z");

  assert.deepEqual(await resolve(request(oldToken)), { kind: "anonymous" });
  assert.equal(
    canApplyAsyncInviteResult(
      revoked.invite,
      { version: 2, status: "revoked" },
      "2026-11-10T00:00:00.000Z",
    ),
    false,
  );

  const rotated = await repository.rotateOnboardingInviteToken({
    inviteId: INVITE_ID,
    newTokenHash: await hashToken(newToken),
    at: "2026-11-10T00:00:00.000Z",
  });
  assert.equal(rotated.ok, false);
  assert.equal(rotated.error, "terminal_status");
});

test("expired and completed invites cannot rotate a token", async () => {
  const expired = invite(await hashToken(oldToken), {
    expiresAt: "2026-11-01T00:00:00.000Z",
  });
  const expiredResult = rotateOnboardingToken(
    expired,
    await hashToken(newToken),
    "2026-11-10T00:00:00.000Z",
  );
  assert.equal(expiredResult.ok, false);
  assert.equal(expiredResult.error, "invite_expired");

  const completed = invite(await hashToken(oldToken), {
    status: "completed",
    version: 6,
    completedAt: "2026-11-06T00:00:00.000Z",
  });
  const completedResult = rotateOnboardingToken(
    completed,
    await hashToken(newToken),
    "2026-11-10T00:00:00.000Z",
  );
  assert.equal(completedResult.ok, false);
  assert.equal(completedResult.error, "terminal_status");
});
