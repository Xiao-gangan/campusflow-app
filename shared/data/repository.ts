import type { Department, Member, Term } from "../contracts/domain.ts";
import type { OnboardingInvite } from "../contracts/onboarding.ts";
import type { Course, TimetableConfirmation } from "../contracts/scheduling.ts";
import type { AuditRepository } from "./audit-repository.ts";
import type { AuthRepository } from "./auth-repository.ts";
import type { OnboardingLifecycleRepository } from "./onboarding-repository.ts";

export interface CampusRepository
  extends AuthRepository, AuditRepository, OnboardingLifecycleRepository {
  listMembers(): Promise<Member[]>;
  findMemberById(id: string): Promise<Member | null>;
  listDepartments(): Promise<Department[]>;
  listTerms(): Promise<Term[]>;
  findOnboardingInviteById(id: string): Promise<OnboardingInvite | null>;
  findOnboardingInviteByTokenHash(
    tokenHash: string,
  ): Promise<OnboardingInvite | null>;
  listCoursesForMember(memberId: string, termId: string): Promise<Course[]>;
  findTimetableConfirmation(
    memberId: string,
    termId: string,
  ): Promise<TimetableConfirmation | null>;
}
