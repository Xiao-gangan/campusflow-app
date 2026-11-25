import { ApiError } from "../api/errors.ts";
import {
  requireActiveMember,
  type Actor,
  type MemberActor,
} from "../api/actor.ts";
import type { Role } from "../contracts/domain.ts";

export const PERMISSIONS = [
  "members.read",
  "members.manage",
  "directory.read",
  "members.availability.read",
  "onboarding.read",
  "onboarding.manage",
  "recruitment.read",
  "recruitment.manage",
  "recruitment.send",
  "email_accounts.manage",
  "email_templates.manage",
  "scheduling.read",
  "scheduling.manage",
  "published_schedule.read",
  "self.read",
  "self.timetable.manage",
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const SELF_PERMISSIONS = ["self.read", "self.timetable.manage"] as const;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: [...PERMISSIONS],
  recruiter: [
    "members.read",
    "directory.read",
    "onboarding.read",
    "onboarding.manage",
    "recruitment.read",
    "recruitment.manage",
    "recruitment.send",
    "email_templates.manage",
    ...SELF_PERMISSIONS,
  ],
  scheduler: [
    "members.read",
    "directory.read",
    "members.availability.read",
    "scheduling.read",
    "scheduling.manage",
    "published_schedule.read",
    ...SELF_PERMISSIONS,
  ],
  member: [
    "directory.read",
    "published_schedule.read",
    ...SELF_PERMISSIONS,
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function requirePermission(
  actor: Actor,
  permission: Permission,
): MemberActor {
  const member = requireActiveMember(actor);
  if (!hasPermission(member.role, permission)) {
    throw new ApiError("forbidden", 403, { permission });
  }
  return member;
}
