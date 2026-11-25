import test from "node:test";
import assert from "node:assert/strict";
import {
  canViewCourseDetails,
  filterSchedulingCandidates,
  isFormalMember,
  isPendingOnboarding,
  isSchedulingEligible,
} from "../shared/domain/membership.ts";
import { toManagerAvailability } from "../shared/domain/availability.ts";

const termId = "55555555-5555-4555-8555-555555555555";

const activeMember = {
  id: "33333333-3333-4333-8333-333333333333",
  userId: "user-1",
  name: "林知夏",
  email: "lin@example.test",
  role: "member",
  departmentId: null,
  status: "active",
  activatedAt: "2026-11-01T00:00:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z",
};

const pendingMember = {
  ...activeMember,
  id: "22222222-2222-4222-8222-222222222222",
  name: "待入组同学",
  status: "pending_onboarding",
  activatedAt: null,
};

const inactiveMember = {
  ...activeMember,
  id: "99999999-9999-4999-8999-999999999999",
  status: "inactive",
};

const courses = [
  {
    id: "course-1",
    memberId: activeMember.id,
    termId,
    name: "高等数学",
    teacher: "张老师",
    room: "A101",
    weekday: 1,
    startMinute: 480,
    endMinute: 580,
    weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  },
];

const confirmation = {
  id: "confirmation-1",
  memberId: activeMember.id,
  termId,
  source: "manual",
  confirmedAt: "2026-11-02T00:00:00.000Z",
};

test("only active members are formal and scheduling-eligible", () => {
  assert.equal(isFormalMember(activeMember), true);
  assert.equal(isPendingOnboarding(pendingMember), true);
  assert.equal(isSchedulingEligible(activeMember), true);
  assert.equal(isSchedulingEligible(pendingMember), false);
  assert.equal(isSchedulingEligible(inactiveMember), false);

  const candidates = filterSchedulingCandidates([
    activeMember,
    pendingMember,
    inactiveMember,
  ]);
  assert.deepEqual(candidates.map((member) => member.id), [activeMember.id]);
});

test("course details are visible only to the member themselves", () => {
  const selfActor = {
    kind: "member",
    memberId: activeMember.id,
    role: "member",
    memberStatus: "active",
  };
  const adminActor = {
    kind: "member",
    memberId: "11111111-1111-4111-8111-111111111111",
    role: "admin",
    memberStatus: "active",
  };

  assert.equal(canViewCourseDetails(selfActor, activeMember.id), true);
  assert.equal(canViewCourseDetails(adminActor, activeMember.id), false);
  assert.equal(
    canViewCourseDetails({ ...selfActor, memberStatus: "pending_onboarding" }, activeMember.id),
    false,
  );
});

test("manager availability exposes FREE/BUSY but never course details", () => {
  const view = toManagerAvailability(activeMember, termId, courses, confirmation);
  const serialized = JSON.stringify(view);

  assert.equal(view.confirmed, true);
  assert.equal(serialized.includes("高等数学"), false);
  assert.equal(serialized.includes("张老师"), false);
  assert.equal(serialized.includes("A101"), false);
  assert.equal(serialized.includes("course-1"), false);
  assert.ok(view.slots.some((slot) => slot.state === "BUSY"));
  assert.ok(view.slots.some((slot) => slot.state === "FREE"));
});

test("unconfirmed timetables are reported as UNKNOWN", () => {
  const view = toManagerAvailability(activeMember, termId, courses, null);

  assert.equal(view.confirmed, false);
  assert.equal(view.slots.length, 7);
  assert.ok(view.slots.every((slot) => slot.state === "UNKNOWN"));
});
