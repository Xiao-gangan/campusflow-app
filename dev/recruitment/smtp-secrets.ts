import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type SmtpSecretVault = {
  encrypt(accountId: string, secret: string): string;
  decrypt(accountId: string, payload: string): string;
};

function decodeKey(value: string) {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("CAMPUSFLOW_SMTP_KEY 必须是 32 字节 Base64。");
  return key;
}

function readKeyFile(path: string) {
  try {
    return decodeKey(readFileSync(path, "utf8").trim());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = dirname(path);
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    const key = randomBytes(32);
    try {
      writeFileSync(path, key.toString("base64"), { mode: 0o600, flag: "wx" });
      return key;
    } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw writeError;
      return decodeKey(readFileSync(path, "utf8").trim());
    }
  }
}

export function openSmtpSecretVault(
  databaseFile: string,
  env: NodeJS.ProcessEnv = process.env,
): SmtpSecretVault {
  const key = env.CAMPUSFLOW_SMTP_KEY
    ? decodeKey(env.CAMPUSFLOW_SMTP_KEY.trim())
    : readKeyFile(join(dirname(databaseFile), "smtp-credentials.key"));
  return createLocalSecretVault(key, "smtp");
}

export function openInviteLinkVault(databaseFile: string) {
  const key = databaseFile === ":memory:" ? randomBytes(32) : readKeyFile(join(dirname(databaseFile), "rsvp-links.key"));
  return createLocalSecretVault(key, "rsvp");
}

export function openActivitySigningKey(databaseFile: string) {
  return databaseFile === ":memory:" ? randomBytes(32) : readKeyFile(join(dirname(databaseFile), "activity-callback.key"));
}

function createLocalSecretVault(key: Buffer, namespace: string): SmtpSecretVault {
  const additionalData = (accountId: string) => Buffer.from(`campusflow:${namespace}:${accountId}`);
  return {
    encrypt(accountId, secret) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(additionalData(accountId));
      const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
      return [
        "v1",
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        encrypted.toString("base64"),
      ].join(".");
    },
    decrypt(accountId, payload) {
      const [version, iv, tag, encrypted] = payload.split(".");
      if (version !== "v1" || !iv || !tag || encrypted === undefined)
        throw new Error("凭据密文格式无效。");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      decipher.setAAD(additionalData(accountId));
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, "base64")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}
