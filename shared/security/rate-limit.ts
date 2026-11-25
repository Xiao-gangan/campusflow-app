export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export type RateLimiter = {
  check(key: string, now?: number): RateLimitDecision;
};

export function createMemoryRateLimiter(options: {
  windowMs: number;
  maxAttempts: number;
}): RateLimiter {
  const attempts = new Map<string, number[]>();
  const windowMs = options.windowMs;
  const maxAttempts = options.maxAttempts;

  return {
    check(key, now = Date.now()) {
      const threshold = now - windowMs;
      const recent = (attempts.get(key) ?? []).filter(
        (timestamp) => timestamp > threshold,
      );

      if (recent.length >= maxAttempts) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((recent[0] + windowMs - now) / 1000),
        );
        attempts.set(key, recent);
        return { allowed: false, retryAfterSeconds };
      }

      recent.push(now);
      attempts.set(key, recent);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

export function requestRateLimitKey(request: Request): string {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return (
    forwarded ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown-client"
  );
}
