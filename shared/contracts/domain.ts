export const ROLES = ["admin", "recruiter", "scheduler", "member"] as const;
export type Role = (typeof ROLES)[number];

export const MEMBER_STATUSES = [
  "pending_onboarding",
  "active",
  "inactive",
] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const APPLICANT_STATUSES = [
  "new",
  "screening",
  "interview",
  "accepted",
  "rejected",
] as const;
export type ApplicantStatus = (typeof APPLICANT_STATUSES)[number];

export const CYCLE_STATUSES = ["draft", "open", "closed"] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export type Department = {
  id: string;
  name: string;
  createdAt: string;
};

export type Term = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  weekCount: number;
  active: boolean;
  createdAt: string;
};

export type Member = {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  role: Role;
  departmentId: string | null;
  status: MemberStatus;
  activatedAt: string | null;
  createdAt: string;
};

export type RecruitmentCycle = {
  id: string;
  termId: string;
  title: string;
  status: CycleStatus;
  opensAt: string | null;
  closesAt: string | null;
  createdAt: string;
};

export type Applicant = {
  id: string;
  cycleId: string;
  name: string;
  email: string;
  studentNo: string | null;
  major: string | null;
  grade: string | null;
  phone: string | null;
  departmentId: string | null;
  skills: string[];
  intro: string | null;
  personalNote: string | null;
  source: string | null;
  status: ApplicantStatus;
  createdAt: string;
  updatedAt: string;
};

export type AuditLog = {
  id: string;
  actorMemberId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};
