import type { Member } from "../contracts/domain.ts";
import type {
  Course,
  ManagerAvailabilityView,
  MemberAvailabilitySlot,
  TimetableConfirmation,
  Weekday,
} from "../contracts/scheduling.ts";

const DAY_START = 8 * 60;
const DAY_END = 22 * 60;
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

function mergedBlocks(courses: Course[], termId: string, memberId: string, weekday: Weekday) {
  const blocks = courses
    .filter(
      (course) =>
        course.termId === termId &&
        course.memberId === memberId &&
        course.weekday === weekday,
    )
    .map((course) => ({
      start: Math.max(DAY_START, course.startMinute),
      end: Math.min(DAY_END, course.endMinute),
    }))
    .filter((block) => block.start < block.end)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (last && block.start <= last.end) {
      last.end = Math.max(last.end, block.end);
    } else {
      merged.push({ ...block });
    }
  }
  return merged;
}

function unknownView(
  member: Member,
  readiness: "UNINITIALIZED" | "UNVERIFIED",
): ManagerAvailabilityView {
  return {
    memberId: member.id,
    memberName: member.name,
    confirmed: false,
    readiness,
    slots: WEEKDAYS.map((weekday) => ({
      weekday,
      startMinute: DAY_START,
      endMinute: DAY_END,
      state: "UNKNOWN",
    })),
  };
}

export function toManagerAvailability(
  member: Member,
  termId: string,
  courses: Course[],
  confirmation: TimetableConfirmation | null,
): ManagerAvailabilityView {
  if (
    !confirmation ||
    confirmation.memberId !== member.id ||
    confirmation.termId !== termId
  ) {
    return unknownView(
      member,
      courses.some((course) => course.memberId === member.id && course.termId === termId)
        ? "UNVERIFIED"
        : "UNINITIALIZED",
    );
  }

  const slots: MemberAvailabilitySlot[] = [];

  for (const weekday of WEEKDAYS) {
    const blocks = mergedBlocks(courses, termId, member.id, weekday);
    let cursor = DAY_START;

    for (const block of blocks) {
      if (block.start > cursor) {
        slots.push({
          weekday,
          startMinute: cursor,
          endMinute: block.start,
          state: "FREE",
        });
      }
      slots.push({
        weekday,
        startMinute: block.start,
        endMinute: block.end,
        state: "BUSY",
      });
      cursor = Math.max(cursor, block.end);
    }

    if (cursor < DAY_END) {
      slots.push({
        weekday,
        startMinute: cursor,
        endMinute: DAY_END,
        state: "FREE",
      });
    }
  }

  return {
    memberId: member.id,
    memberName: member.name,
    confirmed: true,
    readiness: "READY",
    slots,
  };
}
