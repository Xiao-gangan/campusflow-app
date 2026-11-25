import test from "node:test";
import assert from "node:assert/strict";
import {
  canActivateMember,
  canTransition,
  isTerminalStatus,
  memberActivationPatch,
  onboardingProgress,
  toOnboardingView,
  transitionOnboarding,
} from "../shared/domain/onboarding.ts";

const baseInvite = {
  id: "invite-1",
  applicantId: "applicant-1",
  memberId: "member-1",
  tokenHash: "top-secret-token-hash",
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

function advance(invite, next, at) {
  const result = transitionOnboarding(invite, next, at);
  assert.equal(result.ok, true, `expected transition to ${next}`);
  return result.invite;
}

function rejected(invite, next, at, error) {
  const result = transitionOnboarding(invite, next, at);
  assert.equal(result.ok, false);
  assert.equal(result.error, error);
}

test("onboarding follows the full ordered path before activation", () => {
  let invite = advance(baseInvite, "accepted", "2026-11-05T10:00:00.000Z");
  invite = advance(invite, "profile_completed", "2026-11-05T10:05:00.000Z");
  invite = advance(invite, "timetable_confirmed", "2026-11-05T10:10:00.000Z");
  invite = advance(invite, "account_activated", "2026-11-05T10:15:00.000Z");

  assert.equal(canActivateMember(invite), false);
  assert.equal(memberActivationPatch(invite, "2026-11-05T10:20:00.000Z"), null);

  invite = advance(invite, "completed", "2026-11-05T10:20:00.000Z");

  assert.equal(invite.status, "completed");
  assert.equal(invite.acceptedAt, "2026-11-05T10:00:00.000Z");
  assert.equal(invite.profileCompletedAt, "2026-11-05T10:05:00.000Z");
  assert.equal(invite.timetableConfirmedAt, "2026-11-05T10:10:00.000Z");
  assert.equal(invite.accountActivatedAt, "2026-11-05T10:15:00.000Z");
  assert.equal(invite.completedAt, "2026-11-05T10:20:00.000Z");
  assert.equal(invite.version, 6);
  assert.equal(canActivateMember(invite), true);
  assert.deepEqual(memberActivationPatch(invite, "2026-11-05T10:21:00.000Z"), {
    status: "active",
    activatedAt: "2026-11-05T10:21:00.000Z",
  });
});

test("onboarding cannot skip the profile, timetable or account steps", () => {
  rejected(baseInvite, "profile_completed", "2026-11-05T10:00:00.000Z", "invalid_transition");

  const accepted = advance(baseInvite, "accepted", "2026-11-05T10:00:00.000Z");
  rejected(accepted, "account_activated", "2026-11-05T10:01:00.000Z", "invalid_transition");

  const profile = advance(accepted, "profile_completed", "2026-11-05T10:02:00.000Z");
  rejected(profile, "account_activated", "2026-11-05T10:03:00.000Z", "invalid_transition");
});

test("completion requires timetable confirmation and an activated account", () => {
  const almost = {
    ...baseInvite,
    status: "account_activated",
    acceptedAt: "2026-11-05T10:00:00.000Z",
    profileCompletedAt: "2026-11-05T10:01:00.000Z",
    timetableConfirmedAt: null,
    accountActivatedAt: "2026-11-05T10:02:00.000Z",
  };
  rejected(almost, "completed", "2026-11-05T10:03:00.000Z", "completion_requirements_unmet");
  assert.equal(canActivateMember(almost), false);
});

test("missing timestamps block the dependent onboarding steps", () => {
  const noProfileTimestamp = {
    ...baseInvite,
    status: "profile_completed",
    acceptedAt: "2026-11-05T10:00:00.000Z",
    profileCompletedAt: null,
  };
  rejected(
    noProfileTimestamp,
    "timetable_confirmed",
    "2026-11-05T10:01:00.000Z",
    "profile_incomplete",
  );

  const noTimetableTimestamp = {
    ...baseInvite,
    status: "timetable_confirmed",
    acceptedAt: "2026-11-05T10:00:00.000Z",
    profileCompletedAt: "2026-11-05T10:01:00.000Z",
    timetableConfirmedAt: null,
  };
  rejected(
    noTimetableTimestamp,
    "account_activated",
    "2026-11-05T10:02:00.000Z",
    "timetable_unconfirmed",
  );

  const noAccountTimestamp = {
    ...noTimetableTimestamp,
    status: "account_activated",
    timetableConfirmedAt: "2026-11-05T10:02:00.000Z",
    accountActivatedAt: null,
  };
  rejected(
    noAccountTimestamp,
    "completed",
    "2026-11-05T10:03:00.000Z",
    "account_not_activated",
  );
});

test("expired and revoked invites are terminal", () => {
  const expiredByTime = {
    ...baseInvite,
    expiresAt: "2026-11-04T00:00:00.000Z",
  };
  rejected(expiredByTime, "accepted", "2026-11-05T10:00:00.000Z", "invite_expired");

  const expired = advance(expiredByTime, "expired", "2026-11-05T10:00:00.000Z");
  assert.equal(isTerminalStatus(expired.status), true);
  rejected(expired, "accepted", "2026-11-05T10:01:00.000Z", "terminal_status");

  const accepted = advance(baseInvite, "accepted", "2026-11-05T10:00:00.000Z");
  const revoked = advance(accepted, "revoked", "2026-11-05T10:01:00.000Z");
  assert.equal(revoked.revokedAt, "2026-11-05T10:01:00.000Z");
  rejected(revoked, "profile_completed", "2026-11-05T10:02:00.000Z", "terminal_status");
});

test("progress and public views reflect onboarding state without leaking token hash", () => {
  const accepted = advance(baseInvite, "accepted", "2026-11-05T10:00:00.000Z");
  const progress = onboardingProgress(accepted);

  assert.equal(progress.completedSteps, 1);
  assert.equal(progress.totalSteps, 5);
  assert.equal(progress.percent, 20);
  assert.equal(progress.nextStep, "profile_completed");
  assert.equal(progress.canActivateMember, false);

  const view = toOnboardingView(accepted);
  assert.equal("tokenHash" in view, false);
  assert.equal(view.status, "accepted");
});

test("transition guard and terminal helper are consistent", () => {
  assert.equal(canTransition("invited", "accepted"), true);
  assert.equal(canTransition("invited", "completed"), false);
  assert.equal(canTransition("account_activated", "completed"), true);
  assert.equal(canTransition("completed", "revoked"), false);
  assert.equal(isTerminalStatus("completed"), true);
  assert.equal(isTerminalStatus("invited"), false);
});
