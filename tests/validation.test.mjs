import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePagination,
  readJsonBody,
  requireArray,
  requireEnum,
  requireInteger,
  requireString,
  requireUuid,
} from "../shared/api/validation.ts";

function jsonRequest(body, contentType = "application/json") {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error.code === code);
}

test("readJsonBody accepts object payloads and enforces media type and size", async () => {
  const parsed = await readJsonBody(jsonRequest(JSON.stringify({ name: "CampusFlow" })));
  assert.deepEqual(parsed, { name: "CampusFlow" });

  await assert.rejects(
    readJsonBody(jsonRequest("{}", "text/plain")),
    (error) => error.code === "unsupported_media_type",
  );
  await assert.rejects(
    readJsonBody(jsonRequest("{not-json")),
    (error) => error.code === "invalid_json",
  );
  await assert.rejects(
    readJsonBody(jsonRequest(JSON.stringify([1, 2, 3]))),
    (error) => error.code === "invalid_request",
  );
  await assert.rejects(
    readJsonBody(jsonRequest(JSON.stringify({ name: "CampusFlow" })), 8),
    (error) => error.code === "payload_too_large",
  );
});

test("string, enum, integer, array and UUID guards reject invalid values", () => {
  assert.equal(requireString("  CampusFlow  ", "name"), "CampusFlow");
  assert.equal(requireString(" x ", "name", { minLength: 1, maxLength: 2 }), "x");
  expectCode(() => requireString("", "name"), "invalid_request");
  expectCode(() => requireString(42, "name"), "invalid_request");

  assert.equal(requireEnum("admin", ["admin", "member"], "role"), "admin");
  expectCode(() => requireEnum("owner", ["admin", "member"], "role"), "invalid_request");

  assert.equal(requireInteger(3, "limit", 1, 10), 3);
  expectCode(() => requireInteger(11, "limit", 1, 10), "invalid_request");

  assert.deepEqual(requireArray([1, 2], "ids"), [1, 2]);
  expectCode(() => requireArray("not-array", "ids"), "invalid_request");

  assert.equal(
    requireUuid("11111111-1111-4111-8111-111111111111", "id"),
    "11111111-1111-4111-8111-111111111111",
  );
  expectCode(() => requireUuid("not-a-uuid", "id"), "invalid_request");
});

test("pagination has bounded defaults and rejects invalid values", () => {
  assert.deepEqual(parsePagination(new URL("http://localhost/api/v1/members")), {
    limit: 20,
    offset: 0,
  });
  assert.deepEqual(
    parsePagination(new URL("http://localhost/api/v1/members?limit=10&offset=5")),
    { limit: 10, offset: 5 },
  );
  expectCode(
    () => parsePagination(new URL("http://localhost/api/v1/members?limit=101")),
    "invalid_request",
  );
  expectCode(
    () => parsePagination(new URL("http://localhost/api/v1/members?offset=-1")),
    "invalid_request",
  );
});
