import type { CampusRepository } from "../data/repository.ts";
import type { Member } from "../contracts/domain.ts";
import {
  constantTimeEqual,
  createSecretToken,
  hashToken,
} from "../security/tokens.ts";

export type AdminBootstrapServiceInput = {
  repository: Pick<CampusRepository, "createInitialAdmin">;
  expectedToken: string;
  providedToken: string;
  name: string;
  email: string;
  now: Date;
  sessionTtlMinutes: number;
};

export type AdminBootstrapServiceResult =
  | {
      ok: true;
      member: Member;
      sessionToken: string;
      expiresAt: string;
    }
  | {
      ok: false;
      error: "invalid_bootstrap_token" | "admin_already_initialized";
    };

export async function bootstrapAdmin(
  input: AdminBootstrapServiceInput,
): Promise<AdminBootstrapServiceResult> {
  if (
    !input.expectedToken ||
    !constantTimeEqual(input.expectedToken, input.providedToken)
  ) {
    return { ok: false, error: "invalid_bootstrap_token" };
  }

  const sessionToken = createSecretToken();
  const sessionTokenHash = await hashToken(sessionToken);
  const expiresAt = new Date(
    input.now.getTime() + input.sessionTtlMinutes * 60_000,
  ).toISOString();

  const result = await input.repository.createInitialAdmin({
    name: input.name,
    email: input.email,
    sessionTokenHash,
    sessionExpiresAt: expiresAt,
    createdAt: input.now.toISOString(),
  });

  if (!result.ok) {
    return { ok: false, error: "admin_already_initialized" };
  }

  return {
    ok: true,
    member: result.member,
    sessionToken,
    expiresAt,
  };
}
