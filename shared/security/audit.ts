const SENSITIVE_KEY =
  /(token|password|passwd|secret|cookie|authorization|credential|email|phone|student_?no|student_?id)/i;

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return redactAuditMetadata(value as Record<string, unknown>);
  }
  return value;
}

export function redactAuditMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY.test(key)) continue;
    redacted[key] = redactValue(value);
  }

  return redacted;
}
