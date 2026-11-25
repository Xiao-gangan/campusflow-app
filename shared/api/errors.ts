import {
  API_ERROR_MESSAGES,
  API_ERROR_STATUS,
  type ApiErrorBody,
  type ApiErrorCode,
  type ApiSuccess,
} from "../contracts/api.ts";

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  details?: unknown;

  constructor(
    code: ApiErrorCode,
    status: number = API_ERROR_STATUS[code],
    details?: unknown,
  ) {
    super(API_ERROR_MESSAGES[code]);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function success<T>(data: T, status = 200): Response {
  const body: ApiSuccess<T> = { data };
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function failure(error: unknown, extraHeaders?: HeadersInit): Response {
  const apiError =
    error instanceof ApiError ? error : new ApiError("internal_error");

  const body: ApiErrorBody = {
    error: apiError.code,
    message: API_ERROR_MESSAGES[apiError.code],
    ...(apiError.details === undefined ? {} : { details: apiError.details }),
  };

  const headers = new Headers({ "cache-control": "no-store" });
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  }

  return Response.json(body, { status: apiError.status, headers });
}

export function notFound(): Response {
  return failure(new ApiError("not_found"));
}

export function methodNotAllowed(allow: string[]): Response {
  return failure(new ApiError("method_not_allowed"), {
    Allow: allow.join(", "),
  });
}
