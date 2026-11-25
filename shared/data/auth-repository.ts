import type {
  AdminBootstrapInput,
  AdminBootstrapRepositoryResult,
  MemberActivationInput,
  MemberActivationRepositoryResult,
  MemberSession,
} from "../contracts/auth.ts";

export interface AuthRepository {
  hasAdmin(): Promise<boolean>;
  createInitialAdmin(
    input: AdminBootstrapInput,
  ): Promise<AdminBootstrapRepositoryResult>;
  findMemberSessionByTokenHash(
    tokenHash: string,
  ): Promise<MemberSession | null>;
  createMemberSession(input: {
    memberId: string;
    tokenHash: string;
    expiresAt: string;
    createdAt: string;
  }): Promise<MemberSession>;
  revokeMemberSessionByTokenHash(
    tokenHash: string,
    at: string,
  ): Promise<boolean>;
  revokeMemberSessionsForMember(
    memberId: string,
    at: string,
  ): Promise<number>;
  commitOnboardingActivation(
    input: MemberActivationInput,
  ): Promise<MemberActivationRepositoryResult>;
}
