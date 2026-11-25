import test from "node:test";
import assert from "node:assert/strict";
import {
  applicantStatusAfterRsvp,
  canCreateOnboardingInvite,
  isRsvpOpen,
} from "../shared/domain/recruitment.ts";
import { canActivateMember } from "../shared/domain/onboarding.ts";

const applicant = {
  id: "77777777-7777-4777-8777-777777777777",
  cycleId: "88888888-8888-4888-8888-888888888888",
  name: "唐予安",
  email: "tang@example.test",
  studentNo: null,
  major: null,
  grade: null,
  phone: null,
  departmentId: null,
  skills: [],
  intro: null,
  personalNote: null,
  source: null,
  status: "interview",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

const rsvpToken = {
  id: "token-1",
  applicantId: applicant.id,
  campaignId: null,
  tokenHash: "hash",
  purpose: "interview",
  round: 1,
  expiresAt: "2026-11-20T00:00:00.000Z",
  revokedAt: null,
  firstRespondedAt: null,
  lastRespondedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
};

test("RSVP attendance never changes the applicant status", () => {
  assert.equal(isRsvpOpen(rsvpToken, "2026-11-10T00:00:00.000Z"), true);
  assert.equal(applicantStatusAfterRsvp(applicant), "interview");
  assert.equal(canCreateOnboardingInvite(applicant), false);
});

test("only accepted applicants can receive an onboarding invite", () => {
  assert.equal(canCreateOnboardingInvite(applicant), false);
  assert.equal(
    canCreateOnboardingInvite({ ...applicant, status: "accepted" }),
    true,
  );
});

test("acceptance alone does not create an active member", () => {
  const notCompletedInvite = {
    id: "invite-1",
    applicantId: applicant.id,
    memberId: "member-1",
    tokenHash: "hash",
    status: "account_activated",
    version: 1,
    expiresAt: "2026-12-31T00:00:00.000Z",
    revokedAt: null,
    acceptedAt: "2026-11-05T10:00:00.000Z",
    profileCompletedAt: "2026-11-05T10:01:00.000Z",
    timetableConfirmedAt: null,
    accountActivatedAt: "2026-11-05T10:02:00.000Z",
    completedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-05T10:02:00.000Z",
  };

  assert.equal(canActivateMember(notCompletedInvite), false);
  assert.equal(
    canActivateMember({
      ...notCompletedInvite,
      status: "completed",
      timetableConfirmedAt: "2026-11-05T10:01:30.000Z",
      completedAt: "2026-11-05T10:03:00.000Z",
    }),
    true,
  );
});

test("RSVP closes after its deadline or revocation", () => {
  assert.equal(isRsvpOpen(rsvpToken, "2026-11-21T00:00:00.000Z"), false);
  assert.equal(
    isRsvpOpen(
      { ...rsvpToken, revokedAt: "2026-11-10T00:00:00.000Z" },
      "2026-11-11T00:00:00.000Z",
    ),
    false,
  );
});
