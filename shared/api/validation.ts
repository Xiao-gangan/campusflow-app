import type { PaginationQuery } from "../contracts/api.ts";
import { ApiError } from "./errors.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(field: string, reason: string): never {
  throw new ApiError("invalid_request", 400, { field, reason });
}

export async function readJsonBody(
  request: Request,
  maxBytes = 64 * 1024,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new ApiError("unsupported_media_type");
  }

  const reader = request.body?.getReader();
  if (!reader) invalid("body", "missing_body");

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new ApiError("payload_too_large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError("invalid_json");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    invalid("body", "object_required");
  }

  return parsed as Record<string, unknown>;
}

export function requireString(
  value: unknown,
  field: string,
  options: { minLength?: number; maxLength?: number } = {},
): string {
  const { minLength = 1, maxLength = 500 } = options;
  if (typeof value !== "string") invalid(field, "string_required");

  const trimmed = value.trim();
  if (trimmed.length < minLength) invalid(field, "too_short");
  if (trimmed.length > maxLength) invalid(field, "too_long");
  return trimmed;
}

export function optionalString(
  value: unknown,
  field: string,
  maxLength = 500,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireString(value, field, { maxLength });
}

export function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    invalid(field, "unsupported_value");
  }
  return value as T;
}

export function requireInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    invalid(field, "integer_out_of_range");
  }
  return value;
}

export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") invalid(field, "boolean_required");
  return value;
}

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    invalid(field, "uuid_required");
  }
  return value;
}

export function requireArray(
  value: unknown,
  field: string,
  options: { minLength?: number; maxLength?: number } = {},
): unknown[] {
  const { minLength = 0, maxLength = 200 } = options;
  if (!Array.isArray(value)) invalid(field, "array_required");
  if (value.length < minLength) invalid(field, "too_few_items");
  if (value.length > maxLength) invalid(field, "too_many_items");
  return value;
}

export function parsePagination(
  url: URL,
  defaults: { limit?: number; maxLimit?: number } = {},
): PaginationQuery {
  const { limit: defaultLimit = 20, maxLimit = 100 } = defaults;
  const limitValue = url.searchParams.get("limit");
  const offsetValue = url.searchParams.get("offset");

  const limit = limitValue === null ? defaultLimit : Number(limitValue);
  const offset = offsetValue === null ? 0 : Number(offsetValue);

  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    invalid("limit", "integer_out_of_range");
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) {
    invalid("offset", "integer_out_of_range");
  }

  return { limit, offset };
}
