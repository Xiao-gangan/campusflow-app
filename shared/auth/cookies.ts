export type SessionCookieOptions = {
  name?: string;
  secure?: boolean;
  sameSite?: "Strict" | "Lax";
  maxAgeSeconds?: number;
  path?: string;
  domain?: string;
};

const DEFAULT_NAME = "campusflow_session";
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function serializeSessionCookie(
  token: string,
  options: SessionCookieOptions = {},
): string {
  const parts = [
    `${options.name ?? DEFAULT_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    `SameSite=${options.sameSite ?? "Strict"}`,
    `Path=${options.path ?? "/"}`,
    `Max-Age=${options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS}`,
  ];

  if (options.secure ?? true) parts.push("Secure");
  if (options.domain) parts.push(`Domain=${options.domain}`);

  return parts.join("; ");
}

export function clearSessionCookie(
  options: SessionCookieOptions = {},
): string {
  return serializeSessionCookie("", { ...options, maxAgeSeconds: 0 });
}
