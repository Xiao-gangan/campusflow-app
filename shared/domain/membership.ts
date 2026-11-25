import type { Member, MemberStatus, Role } from "../contracts/domain.ts";
import type { MemberActor } from "../api/actor.ts";

export function isFormalMember(member: Member): boolean {
  return member.status === "active";
}

export function isPendingOnboarding(member: Member): boolean {
  return member.status === "pending_onboarding";
}

export function isSchedulingEligible(member: Member): boolean {
  return isFormalMember(member);
}

export function filterSchedulingCandidates<T extends Member>(members: T[]): T[] {
  return members.filter((member) => isSchedulingEligible(member));
}

export function hasAnyRole(member: Member, roles: readonly Role[]): boolean {
  return roles.includes(member.role);
}

export function hasMemberStatus(
  member: Member,
  status: MemberStatus,
): boolean {
  return member.status === status;
}

// Managers only receive derived availability. Full course details stay with
// the member themselves.
export function canViewCourseDetails(
  actor: MemberActor,
  targetMemberId: string,
): boolean {
  return actor.memberId === targetMemberId && actor.memberStatus === "active";
}
