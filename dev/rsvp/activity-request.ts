import { parseActivityUrl } from "../../shared/recruitment/custom-activities.ts";
import { RsvpError } from "./error.ts";

const invalidActivityCredential = () => new RsvpError(401, "环节凭证已失效，请从专属邀请函重新打开。");

export function activityTokenFrom(authorization: string | undefined, body: unknown) {
  if (authorization !== undefined) {
    const header = /^Bearer ([^\s]+)$/iu.exec(authorization);
    if (!header || (body !== undefined && body !== header[1])) throw invalidActivityCredential();
    return header[1];
  }
  if (typeof body !== "string") throw invalidActivityCredential();
  return body;
}

export function activityCallbackOrigin(value: string) {
  try { if (parseActivityUrl(value).origin === value) return value; }
  catch { /* An opaque or malformed origin cannot call this endpoint. */ }
  throw new RsvpError(403, "互动回传来源无效。");
}
