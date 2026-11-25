import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
export { activityTokenFrom, activityCallbackOrigin } from "./activity-request.ts";
import { RsvpError } from "./error.ts";

export const activityTtlMs = 2 * 60 * 60 * 1000;
const tokenPattern = /^(v2\.([a-f0-9-]{36})\.[a-f0-9]{64})\.([a-f0-9]{64})$/u;
const macFor = (key: Buffer, claim: string) => createHmac("sha256", key).update("campusflow:activity:" + claim).digest();
const hashFor = (token: string) => createHash("sha256").update(token).digest("hex");

export function invalidActivityCredential() {
  return new RsvpError(401, "环节凭证已失效，请从专属邀请函重新打开。");
}

export function mintActivityCredential(key: Buffer) {
  const id = randomUUID();
  const claim = "v2." + id + "." + randomBytes(32).toString("hex");
  const token = claim + "." + macFor(key, claim).toString("hex");
  return { id, token, hash: hashFor(token) };
}

export function verifyActivityCredential(key: Buffer, token: unknown) {
  const match = typeof token === "string" && token.length === 169 ? tokenPattern.exec(token) : null;
  if (!match || !timingSafeEqual(Buffer.from(match[3], "hex"), macFor(key, match[1]))) throw invalidActivityCredential();
  return { id: match[2], hash: hashFor(match[0]) };
}
