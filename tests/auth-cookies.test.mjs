import test from "node:test";
import assert from "node:assert/strict";
import {
  clearSessionCookie,
  serializeSessionCookie,
} from "../shared/auth/cookies.ts";
import {
  isSameOrigin,
  requireSameOriginForCookieAuth,
} from "../shared/auth/csrf.ts";

function request(headers) {
  return new Request("http://app.example.test/api/v1/auth/logout", {
    method: "POST",
    headers: { host: "app.example.test", ...headers },
  });
}

test("session cookies use HttpOnly, Secure, SameSite and bounded lifetime", () => {
  const cookie = serializeSessionCookie("opaque-token");
  assert.match(cookie, /^campusflow_session=opaque-token/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=604800/);

  const cleared = clearSessionCookie();
  assert.match(cleared, /Max-Age=0/);

  const local = serializeSessionCookie("local-token", {
    secure: false,
    sameSite: "Lax",
    maxAgeSeconds: 60,
  });
  assert.equal(local.includes("Secure"), false);
  assert.match(local, /SameSite=Lax/);
  assert.match(local, /Max-Age=60/);
});

test("cross-origin or origin-less cookie writes are rejected", () => {
  const cookieHeader = "campusflow_session=opaque-token";

  assert.throws(
    () => requireSameOriginForCookieAuth(request({ cookie: cookieHeader })),
    (error) => error.code === "forbidden",
  );
  assert.throws(
    () =>
      requireSameOriginForCookieAuth(
        request({ cookie: cookieHeader, origin: "https://evil.example" }),
      ),
    (error) => error.code === "forbidden",
  );

  requireSameOriginForCookieAuth(
    request({ cookie: cookieHeader, origin: "https://app.example.test" }),
  );
  requireSameOriginForCookieAuth(
    request({ cookie: cookieHeader, origin: "https://other.example" }),
    ["https://other.example"],
  );
  requireSameOriginForCookieAuth(
    request({ authorization: "Bearer token", origin: "https://evil.example" }),
  );
});

test("same-origin helper compares host or explicit allowlist", () => {
  assert.equal(
    isSameOrigin(
      request({ origin: "https://app.example.test", host: "app.example.test" }),
    ),
    true,
  );
  assert.equal(
    isSameOrigin(
      request({ origin: "https://evil.example", host: "app.example.test" }),
    ),
    false,
  );
  assert.equal(
    isSameOrigin(
      request({ origin: "https://trusted.example", host: "app.example.test" }),
      ["trusted.example"],
    ),
    true,
  );
});
