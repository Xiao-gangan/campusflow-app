import type { DesignTarget } from "../contracts/design.ts";

export type DesignVariable = {
  key: string;
  label: string;
  sample: string;
  targets: readonly DesignTarget[];
};

const ALL_TARGETS = ["email", "invite_page"] as const;
const EMAIL_ONLY = ["email"] as const;

export const DESIGN_VARIABLES: DesignVariable[] = [
  {
    key: "candidate_name",
    label: "候选人姓名",
    sample: "林知夏",
    targets: ALL_TARGETS,
  },
  {
    key: "candidate_email",
    label: "候选人邮箱",
    sample: "lin@example.test",
    targets: ALL_TARGETS,
  },
  {
    key: "department",
    label: "意向部门",
    sample: "技术部",
    targets: ALL_TARGETS,
  },
  {
    key: "interview_time",
    label: "面试时间",
    sample: "11 月 15 日 14:00 - 14:30",
    targets: ALL_TARGETS,
  },
  {
    key: "interview_location",
    label: "面试地点",
    sample: "信息楼 A302",
    targets: ALL_TARGETS,
  },
  { key: "interview_date", label: "面试日期", sample: "11 月 15 日", targets: ALL_TARGETS },
  { key: "start_time", label: "面试开始", sample: "14:00", targets: ALL_TARGETS },
  { key: "end_time", label: "面试结束", sample: "14:30", targets: ALL_TARGETS },
  { key: "location", label: "面试地点（简写变量）", sample: "信息楼 A302", targets: ALL_TARGETS },
  {
    key: "rsvp_link",
    label: "出席确认链接",
    sample: "https://example.test/invite/sample",
    targets: ALL_TARGETS,
  },
  {
    key: "onboarding_link",
    label: "入组注册链接",
    sample: "https://example.test/onboarding/sample",
    targets: EMAIL_ONLY,
  },
  {
    key: "organization_name",
    label: "组织名称",
    sample: "CampusFlow",
    targets: ALL_TARGETS,
  },
  {
    key: "personal_note",
    label: "个性化备注",
    sample: "期待与你见面。",
    targets: ALL_TARGETS,
  },
];

export function variablesForTarget(
  target: DesignTarget,
): DesignVariable[] {
  return DESIGN_VARIABLES.filter((variable) =>
    variable.targets.includes(target),
  );
}

export function sampleVariableValues(): Record<string, string> {
  return Object.fromEntries(
    DESIGN_VARIABLES.map((variable) => [variable.key, variable.sample]),
  );
}

export function interviewScheduleVariables(date: string, start: string, end: string | null, location: string) {
  return {
    interview_date: date || "待定", start_time: start || "待定", end_time: end || (start ? "" : "待定"), location: location || "待定",
    interview_time: [date, start && (end ? `${start}–${end}` : start)].filter(Boolean).join(" ") || "时间待定",
    interview_location: location || "地点待定",
  };
}

export function interpolateDesignVariables(
  text: string,
  values: Record<string, string | undefined> = sampleVariableValues(),
): string {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, key: string) => {
    return values[key] ?? match;
  });
}
