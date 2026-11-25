import type { MemberSession } from "../contracts/auth.ts";
import type { CampusRepository } from "../data/repository.ts";
import { createSecretToken, hashToken } from "../security/tokens.ts";

export type IssueMemberSessionInput = {
  repository: Pick<CampusRepository, "createMemberSession">;
  memberId: string;
  now: Date;
  ttlMinutes?: number;
};

export type IssueMemberSessionResult = {
  sessionToken: string;
  session: MemberSession;
};

export async function issueMemberSession(
  input: IssueMemberSessionInput,
): Promise<IssueMemberSessionResult> {
  const sessionToken = createSecretToken();
  const ttlMinutes = input.ttlMinutes ?? 60 * 24 * 7;
  const session = await input.repository.createMemberSession({
    memberId: input.memberId,
    tokenHash: await hashToken(sessionToken),
    expiresAt: new Date(
      input.now.getTime() + ttlMinutes * 60_000,
    ).toISOString(),
    createdAt: input.now.toISOString(),
  });

  return { sessionToken, session };
}
