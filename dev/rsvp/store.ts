import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { openActivitySigningKey, openInviteLinkVault } from "../recruitment/smtp-secrets.ts";
import { mintActivityCredential, verifyActivityCredential } from "./activity-callback.ts";
import { createRsvpStore } from "./store-core.ts";
export { RsvpError } from "./error.ts";

export function openRsvpStore(filename: string, clock = () => new Date()) {
  let linkVault: ReturnType<typeof openInviteLinkVault> | undefined;
  let signingKey: Buffer | undefined;
  const key = () => signingKey ??= openActivitySigningKey(filename);
  return createRsvpStore(new DatabaseSync(filename), {
    vault: () => linkVault ??= openInviteLinkVault(filename),
    signing: {
      mint: () => mintActivityCredential(key()),
      verify: (token) => verifyActivityCredential(key(), token),
    },
    sha256: (value) => createHash("sha256").update(value).digest("hex"),
  }, clock);
}
