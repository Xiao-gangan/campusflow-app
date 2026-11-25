import { ApiError } from "../api/errors.ts";

export function isSameOrigin(
  request: Request,
  allowedOrigins: readonly string[] = [],
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const host = request.headers.get("host");
  if (host && originUrl.host === host) return true;

  return allowedOrigins.some(
    (allowed) => allowed === origin || allowed === originUrl.origin || allowed === originUrl.host,
  );
}

// Cookie-authenticated writes need an explicit same-origin check. Bearer
// clients are not vulnerable to browser CSRF and may omit Origin.
export function requireSameOriginForCookieAuth(
  request: Request,
  allowedOrigins: readonly string[] = [],
): void {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const usesSessionCookie = cookieHeader
    .split(";")
    .some((part) => part.trim().startsWith("campusflow_session="));

  if (!usesSessionCookie) return;

  if (!request.headers.get("origin")) {
    throw new ApiError("forbidden", 403, {
      reason: "csrf_origin_required",
    });
  }

  if (!isSameOrigin(request, allowedOrigins)) {
    throw new ApiError("forbidden", 403, {
      reason: "csrf_origin_mismatch",
    });
  }
}
