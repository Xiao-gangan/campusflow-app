import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_OVERALL_TIMEOUT_MS,
  AI_TIMEOUT_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  aiHttpStatusMessage,
  aiTransportErrorMessage,
  scheduleAiTimeout,
} from "../shared/ai/client-policy.ts";

test("AI overall timeout is two minutes", () => {
  assert.equal(AI_OVERALL_TIMEOUT_MS, 120_000);
});

test("AI status codes map to actionable messages", () => {
  assert.match(aiHttpStatusMessage(401), /API Key/);
  assert.match(aiHttpStatusMessage(403), /API Key/);
  assert.match(aiHttpStatusMessage(402), /余额/);
  assert.match(aiHttpStatusMessage(429), /频繁/);
  assert.match(aiHttpStatusMessage(502), /尚未启动/);
  assert.match(aiHttpStatusMessage(500), /暂时不可用/);
  assert.equal(aiHttpStatusMessage(400), null);
});

test("AI transport errors distinguish timeout, offline and server messages", () => {
  assert.equal(aiTransportErrorMessage(new Error("x"), true), AI_TIMEOUT_MESSAGE);
  assert.equal(
    aiTransportErrorMessage(new TypeError("Failed to fetch"), false),
    AI_UNAVAILABLE_MESSAGE,
  );
  assert.equal(
    aiTransportErrorMessage(new Error("自定义错误"), false),
    "自定义错误",
  );
  assert.match(aiTransportErrorMessage(null, false), /暂时不可用/);
});

test("overall timeout aborts the request after the scheduled delay", async () => {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = scheduleAiTimeout(controller, () => {
    timedOut = true;
  }, 20);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(timedOut, true);
  assert.equal(controller.signal.aborted, true);
  cancel();
});

test("cancelling the overall timeout prevents abort", async () => {
  const controller = new AbortController();
  const cancel = scheduleAiTimeout(controller, () => {}, 20);
  cancel();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(controller.signal.aborted, false);
});
