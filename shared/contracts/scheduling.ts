export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const AVAILABILITY_STATES = ["FREE", "BUSY", "UNKNOWN"] as const;
export type AvailabilityState = (typeof AVAILABILITY_STATES)[number];

export type Course = {
  id: string;
  memberId: string;
  termId: string;
  name: string;
  teacher: string | null;
  room: string | null;
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  weeks: number[];
};

export type CourseOccurrenceException = {
  id: string;
  courseId: string;
  date: string;
  status: "cancelled" | "modified";
  courseName?: string | null;
  weekday?: Weekday | null;
  startMinute?: number | null;
  endMinute?: number | null;
};

export type TimetableReadiness = "UNINITIALIZED" | "UNVERIFIED" | "READY";

export type TimetableConfirmation = {
  id: string;
  memberId: string;
  termId: string;
  source: "manual" | "import";
  confirmedAt: string;
};

export type TimetableState = {
  memberId: string;
  termId: string;
  readiness: TimetableReadiness;
  confirmedAt: string | null;
  courses: Course[];
  exceptions: CourseOccurrenceException[];
};

export type MemberAvailabilitySlot = {
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  state: AvailabilityState;
};

export type ManagerAvailabilityView = {
  memberId: string;
  memberName: string;
  confirmed: boolean;
  readiness: TimetableReadiness;
  slots: MemberAvailabilitySlot[];
};

export type SchedulingCandidate = {
  memberId: string;
  name: string;
  status: "active";
};

export type ShiftOccurrence = {
  id: string;
  termId: string;
  ruleId: string | null;
  date: string;
  startMinute: number;
  endMinute: number;
  requiredCount: number;
  location: string | null;
  status: "scheduled" | "cancelled";
};

export type RecurrenceRule = {
  id: string;
  termId: string;
  name: string;
  weekdays: Weekday[];
  startMinute: number;
  endMinute: number;
  requiredCount: number;
  location: string | null;
  startDate: string;
  endDate: string;
  intervalWeeks: 1 | 2;
  exceptions: string[];
  active: boolean;
};

export type ScheduleVersion = {
  id: string;
  termId: string;
  version: number;
  status: "draft" | "published" | "archived";
  createdByMemberId: string;
  publishedAt: string | null;
  snapshot: PublishedScheduleSnapshot | null;
};

export type DutyAssignment = {
  id: string;
  versionId: string;
  occurrenceId: string;
  memberId: string;
  status: "assigned" | "confirmed" | "swapped";
  source: "auto" | "manual";
};

export type ScheduleConflictCode =
  | "course_conflict"
  | "unavailable"
  | "shift_overlap"
  | "load_exceeded"
  | "duplicate_assignment"
  | "shift_unstaffed";

export type ScheduleConflictSeverity = "BLOCKING" | "WARNING";

export type ScheduleConflict = {
  code: ScheduleConflictCode;
  severity: ScheduleConflictSeverity;
  message?: string;
  occurrenceId: string | null;
  memberId: string | null;
};

export type PublishedScheduleSnapshot = {
  versionId: string;
  termId: string;
  version: number;
  publishedAt: string;
  publishedByMemberId: string;
  slots: ShiftOccurrence[];
  assignments: DutyAssignment[];
};

export type PlanDraftResult = {
  assignments: DutyAssignment[];
  unstaffed: { occurrenceId: string; missing: number }[];
  conflicts: ScheduleConflict[];
};
