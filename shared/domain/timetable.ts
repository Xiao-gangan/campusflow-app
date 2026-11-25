import type { TimetableReadiness } from "../contracts/scheduling.ts";

export type WeekPattern = "all" | "odd" | "even" | "custom";

export function normalizeWeeks(
  weeks: readonly number[],
  totalWeeks: number,
): number[] {
  if (!Number.isInteger(totalWeeks) || totalWeeks < 1) return [];
  const normalized = new Set<number>();
  for (const week of weeks) {
    if (Number.isInteger(week) && week >= 1 && week <= totalWeeks) {
      normalized.add(week);
    }
  }
  return [...normalized].sort((left, right) => left - right);
}

export function weeksForPattern(
  pattern: WeekPattern,
  totalWeeks: number,
  custom: readonly number[] = [],
): number[] {
  if (!Number.isInteger(totalWeeks) || totalWeeks < 1) return [];
  if (pattern === "custom") return normalizeWeeks(custom, totalWeeks);

  const weeks: number[] = [];
  for (let week = 1; week <= totalWeeks; week += 1) {
    if (pattern === "odd" && week % 2 === 0) continue;
    if (pattern === "even" && week % 2 === 1) continue;
    weeks.push(week);
  }
  return weeks;
}

export function isWeekActive(
  weeks: readonly number[],
  week: number,
  totalWeeks: number,
): boolean {
  return normalizeWeeks(weeks, totalWeeks).includes(week);
}

export function resolveTimetableReadiness(input: {
  hasCourses: boolean;
  confirmedAt: string | null;
}): TimetableReadiness {
  if (input.confirmedAt) return "READY";
  return input.hasCourses ? "UNVERIFIED" : "UNINITIALIZED";
}
