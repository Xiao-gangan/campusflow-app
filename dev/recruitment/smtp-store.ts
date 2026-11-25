import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SmtpSecretVault } from "./smtp-secrets.ts";
import { createSmtpAccountStore } from "./smtp-store-core.ts";
export * from "./smtp-store-core.ts";

export function openSmtpAccountStore(
  filename: string,
  vault: SmtpSecretVault,
  clock = () => new Date(),
) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  return createSmtpAccountStore(new DatabaseSync(filename), vault, clock);
}
