import test from "node:test";
import assert from "node:assert/strict";
import {
  isWeekActive,
  normalizeWeeks,
  resolveTimetableReadiness,
  weeksForPattern,
} from "../shared/domain/timetable.ts";
import { toManagerAvailability } from "../shared/domain/availability.ts";

const member = {
  id: "member-1",
  userId: null,
  name: "林知夏",
  email: "lin@example.test",
  role: "member",
  departmentId: null,
  status: "active",
  activatedAt: "2026-11-01T00:00:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z",
};

const termId = "term-1";

test("week expressions support all, odd, even and custom weeks", () => {
  assert.deepEqual(normalizeWeeks([1, 3, 3, 99, 0], 16), [1, 3]);
  assert.deepEqual(weeksForPattern("all", 4), [1, 2, 3, 4]);
  assert.deepEqual(weeksForPattern("odd", 6), [1, 3, 5]);
  assert.deepEqual(weeksForPattern("even", 6), [2, 4, 6]);
  assert.deepEqual(weeksForPattern("custom", 6, [6, 2, 2, 9]), [2, 6]);
  assert.equal(isWeekActive([1, 3, 5], 3, 16), true);
  assert.equal(isWeekActive([1, 3, 5], 4, 16), false);
});

test("timetable readiness distinguishes uninitialized, unverified and ready", () => {
  assert.equal(
    resolveTimetableReadiness({ hasCourses: false, confirmedAt: null }),
    "UNINITIALIZED",
  );
  assert.equal(
    resolveTimetableReadiness({ hasCourses: true, confirmedAt: null }),
    "UNVERIFIED",
  );
  assert.equal(
    resolveTimetableReadiness({
      hasCourses: true,
      confirmedAt: "2026-11-02T00:00:00.000Z",
    }),
    "READY",
  );
});

test("manager availability exposes readiness and keeps privacy", () => {
  const course = {
    id: "course-1",
    memberId: member.id,
    termId,
    name: "高等数学",
    teacher: "张老师",
    room: "A101",
    weekday: 1,
    startMinute: 480,
    endMinute: 580,
    weeks: [1, 2, 3],
  };

  const unknown = toManagerAvailability(member, termId, [course], null);
  assert.equal(unknown.readiness, "UNVERIFIED");
  assert.equal(unknown.slots.every((slot) => slot.state === "UNKNOWN"), true);

  const ready = toManagerAvailability(member, termId, [course], {
    id: "confirmation-1",
    memberId: member.id,
    termId,
    source: "manual",
    confirmedAt: "2026-11-02T00:00:00.000Z",
  });
  assert.equal(ready.readiness, "READY");
  assert.equal(JSON.stringify(ready).includes("高等数学"), false);
  assert.equal(JSON.stringify(ready).includes("张老师"), false);
  assert.equal(JSON.stringify(ready).includes("A101"), false);
});
