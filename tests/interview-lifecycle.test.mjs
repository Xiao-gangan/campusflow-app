import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERVIEW_INVITATION_STATUSES,
} from "../shared/contracts/interview.ts";
import { ONBOARDING_STATUSES } from "../shared/contracts/onboarding.ts";
import {
  canApplyAsyncInterviewResult,
  isInterviewInvitationUsable,
  markInterviewInvitationSent,
  respondToInterviewInvitation,
  revokeInterviewInvitation,
  rotateInterviewInvitationToken,
} from "../shared/domain/interview.ts";

const base = {
  id: "interview-1",
  applicantId: "applicant-1",
  tokenHash: "old-hash",
  status: "ready",
  rsvpStatus: "pending",
  version: 1,
  expiresAt: "2026-12-31T00:00:00.000Z",
  revokedAt: null,
  sentAt: null,
  respondedAt: null,
  interviewDate: "2026-11-15",
  startTime: "14:00",
  endTime: "14:30",
  location: "信息楼 A302",
  notes: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

const at = "2026-11-10T00:00:00.000Z";

test("interview and onboarding invitation statuses remain separate", () => {
  assert.equal(INTERVIEW_INVITATION_STATUSES.includes("completed"), false);
  assert.equal(ONBOARDING_STATUSES.includes("completed"), true);
  assert.equal(INTERVIEW_INVITATION_STATUSES.includes("sent"), true);
});

test("sending requires the expected version and cannot reactivate a revoked invite", () => {
  const sent = markInterviewInvitationSent(base, 1, at);
  assert.equal(sent.ok, true);
  assert.equal(sent.invite.status, "sent");
  assert.equal(sent.invite.version, 2);
  assert.equal(sent.invite.sentAt, at);

  const idempotent = markInterviewInvitationSent(sent.invite, 2, at);
  assert.equal(idempotent.ok, true);
  assert.equal(idempotent.invite.version, 2);

  const stale = markInterviewInvitationSent(sent.invite, 1, at);
  assert.equal(stale.ok, false);
  assert.equal(stale.error, "version_conflict");

  const revoked = revokeInterviewInvitation(sent.invite, at);
  assert.equal(revoked.ok, true);
  assert.equal(revoked.invite.status, "revoked");
  assert.equal(revoked.invite.version, 3);
  assert.equal(
    markInterviewInvitationSent(revoked.invite, 3, at).error,
    "terminal_status",
  );
  assert.equal(
    canApplyAsyncInterviewResult(
      revoked.invite,
      { version: 3, status: "revoked" },
      at,
    ),
    false,
  );
});

test("token rotation invalidates the prior credential and increments version", () => {
  const rotated = rotateInterviewInvitationToken(base, "new-hash", at);
  assert.equal(rotated.ok, true);
  assert.equal(rotated.invite.tokenHash, "new-hash");
  assert.equal(rotated.invite.version, 2);
  assert.equal(
    canApplyAsyncInterviewResult(
      rotated.invite,
      { version: 1, status: "ready" },
      at,
    ),
    false,
  );
  assert.equal(
    canApplyAsyncInterviewResult(
      rotated.invite,
      { version: 2, status: "ready" },
      at,
    ),
    true,
  );

  const revoked = revokeInterviewInvitation(rotated.invite, at);
  assert.equal(
    rotateInterviewInvitationToken(revoked.invite, "another-hash", at).error,
    "terminal_status",
  );
});

test("interview RSVP updates only RSVP state, not onboarding or invitation lifecycle", () => {
  const onboarding = { status: "invited", version: 1 };
  const responded = respondToInterviewInvitation(base, "confirmed", at);
  assert.equal(responded.ok, true);
  assert.equal(responded.invite.status, "ready");
  assert.equal(responded.invite.rsvpStatus, "confirmed");
  assert.equal(responded.invite.version, 2);
  assert.equal(responded.invite.respondedAt, at);
  assert.deepEqual(onboarding, { status: "invited", version: 1 });

  const revoked = revokeInterviewInvitation(base, at);
  assert.equal(
    respondToInterviewInvitation(revoked.invite, "confirmed", at).error,
    "rsvp_not_open",
  );
});

test("expired invitations are unusable for send, rotate and RSVP", () => {
  const expired = { ...base, expiresAt: "2026-11-01T00:00:00.000Z" };
  assert.equal(isInterviewInvitationUsable(expired, at), false);
  assert.equal(markInterviewInvitationSent(expired, 1, at).error, "invite_expired");
  assert.equal(
    rotateInterviewInvitationToken(expired, "new-hash", at).error,
    "invite_expired",
  );
  assert.equal(
    respondToInterviewInvitation(expired, "confirmed", at).error,
    "rsvp_not_open",
  );
  assert.equal(
    canApplyAsyncInterviewResult(expired, { version: 1, status: "ready" }, at),
    false,
  );
});
