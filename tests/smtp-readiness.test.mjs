import assert from "node:assert/strict";
import test from "node:test";
import { CONNECTION_FRESH_MS, evaluateAccountReadiness } from "../src/modules/recruitment/smtp-readiness.ts";

test("connection readiness expires after 15 minutes and never confuses synthetic or delivery status with real connection", () => {
  const account = { hasSecret: true, status: "verified" };
  const checked = 1_700_000_000_000;
  const result = { ok: true, mode: "synthetic", message: "合成通过" };
  assert.equal(evaluateAccountReadiness(account, "synthetic", result, checked, checked + CONNECTION_FRESH_MS - 1).ready, true);
  assert.equal(evaluateAccountReadiness(account, "synthetic", result, checked, checked + CONNECTION_FRESH_MS).ready, false);
  assert.equal(evaluateAccountReadiness(account, "real", result, checked, checked).ready, false);
  assert.equal(evaluateAccountReadiness(account, "disabled", result, checked, checked).ready, false);
  assert.equal(evaluateAccountReadiness({ ...account, status: "disabled" }, "synthetic", result, checked, checked).ready, false);
});
