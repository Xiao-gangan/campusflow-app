import type {
  CandidateImportPreview,
  CandidateImportRow,
  CandidateInput,
} from "../../shared/contracts/recruitment-console.ts";
import type { ApplicantStatus } from "../../shared/contracts/domain.ts";
import { APPLICANT_STATUSES } from "../../shared/contracts/domain.ts";
import { RsvpError } from "../rsvp/error.ts";

type Column =
  | "name"
  | "email"
  | "department"
  | "stage"
  | "interviewDate"
  | "startTime"
  | "endTime"
  | "location"
  | "note";

const COLUMNS: Record<Column, string[]> = {
  name: ["name", "姓名"],
  email: ["email", "邮箱", "电子邮箱"],
  department: ["department", "部门", "意向部门"],
  stage: ["stage", "阶段", "招新阶段"],
  interviewDate: ["interviewdate", "面试日期", "日期"],
  startTime: ["starttime", "开始时间"],
  endTime: ["endtime", "结束时间"],
  location: ["location", "地点", "面试地点"],
  note: ["note", "备注"],
};

const STAGE_LABELS: Record<string, ApplicantStatus> = {
  new: "new",
  screening: "screening",
  interview: "interview",
  accepted: "accepted",
  rejected: "rejected",
  新申请: "new",
  筛选: "screening",
  面试: "interview",
  已录用: "accepted",
  未通过: "rejected",
};

function canonical(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]/gu, "");
}

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim()));
}

export function previewCandidateCsv(
  csv: string,
  cycle: string,
  existing: { email: string; cycle: string }[],
): CandidateImportPreview {
  const table = splitCsv(csv.replace(/^\uFEFF/u, ""));
  if (table.length < 2) throw new RsvpError(400, "CSV 至少需要表头和一行候选人。");
  const header = table[0].map(canonical);
  const indexes = {} as Record<Column, number>;
  for (const [column, aliases] of Object.entries(COLUMNS) as [Column, string[]][]) {
    indexes[column] = header.findIndex((value) => aliases.some((alias) => canonical(alias) === value));
  }
  for (const required of ["name", "email", "department"] as const) {
    if (indexes[required] < 0)
      throw new RsvpError(400, `CSV 缺少必需列：${COLUMNS[required][0]}。`);
  }
  const existingEmails = new Set(
    existing
      .filter((candidate) => candidate.cycle === cycle)
      .map((candidate) => candidate.email.trim().toLowerCase()),
  );
  const seen = new Set<string>();
  const rows: CandidateImportRow[] = table.slice(1).map((cells, offset) => {
    const value = (column: Column) => {
      const index = indexes[column];
      return index >= 0 ? (cells[index] ?? "").trim() : "";
    };
    const name = value("name");
    const email = value("email").toLowerCase();
    const department = value("department");
    const stageText = value("stage");
    const stage = stageText ? STAGE_LABELS[canonical(stageText)] : "new";
    const issues: string[] = [];
    if (!name) issues.push("缺少姓名。");
    if (!email) issues.push("缺少邮箱。");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
      issues.push("邮箱格式不正确。");
    if (!department) issues.push("缺少部门。");
    if (!stage || !APPLICANT_STATUSES.includes(stage))
      issues.push("阶段无效；可选新申请、筛选、面试、已录用、未通过。");
    let duplicate = false;
    if (email && existingEmails.has(email)) {
      duplicate = true;
      issues.push("当前招新周期已存在该邮箱。");
    } else if (email && seen.has(email)) {
      duplicate = true;
      issues.push("CSV 内邮箱重复。");
    }
    if (email) seen.add(email);
    const input: CandidateInput | null =
      name && email && department && stage && issues.length === 0
        ? {
            name,
            email,
            department,
            stage,
            note: value("note"),
            interviewDate: value("interviewDate") || undefined,
            startTime: value("startTime") || undefined,
            endTime: value("endTime") || undefined,
            location: value("location") || undefined,
          }
        : null;
    return {
      row: offset + 2,
      name,
      email,
      department,
      stage: stageText || "new",
      valid: issues.length === 0,
      duplicate,
      issues,
      input,
    };
  });
  return {
    cycle,
    rows,
    validCount: rows.filter((row) => row.valid).length,
    errorCount: rows.filter((row) => !row.valid).length,
    duplicateCount: rows.filter((row) => row.duplicate).length,
  };
}