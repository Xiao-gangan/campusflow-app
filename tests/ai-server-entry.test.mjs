import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const preload = resolve(here, "fixtures/fake-deepseek-preload.mjs");
const KEY = "synthetic" + "-reference-123456";

async function freePort() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolveClose) => listener.close(resolveClose));
  return port;
}

function requestBody(marker, requestId) {
  return JSON.stringify({
    requestId,
    mode: "block",
    blockId: "synthetic-card",
    blockType: "info_card",
    currentProps: {
      title: "面试安排",
      body: "时间：11 月 15 日 14:00",
      variant: "style:plain",
    },
    instruction: `${marker} 能改的好看一点吗 现在有点太土了`,
  });
}

test("the real local HTTP entry aborts upstream work on client disconnect", { timeout: 15000 }, async () => {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    ["--import", preload, resolve(root, "scripts/ai-server.mjs")],
    {
      cwd: root,
      env: { ...process.env, AI_PORT: String(port), AI_MOCK: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    log += String(chunk);
  });

  const waitFor = async (pattern, timeout = 4000) => {
    const until = Date.now() + timeout;
    while (!pattern.test(log) && Date.now() < until) await delay(10);
    assert.match(log, pattern);
  };

  const wire = (marker, requestId, { disconnect = false } = {}) => {
    const req = httpRequest({
      hostname: "127.0.0.1",
      port,
      path: "/api/ai/design",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KEY}`,
      },
    });
    const response = new Promise((resolveResponse, rejectResponse) => {
      req.on("error", (error) => {
        if (disconnect) resolveResponse({ clientAborted: true, error: error.code });
        else rejectResponse(error);
      });
      req.on("response", async (res) => {
        const chunks = [];
        for await (const chunk of res) chunks.push(chunk);
        const text = Buffer.concat(chunks).toString("utf8");
        resolveResponse({ status: res.statusCode, body: JSON.parse(text) });
      });
    });
    req.end(requestBody(marker, requestId));
    return { req, response };
  };

  try {
    await waitFor(/local function listening/u);

    const first = wire("OLD_STALL", "req-wire-old", { disconnect: true });
    await waitFor(/synthetic:start:OLD_STALL:1/u);
    first.req.destroy();
    const firstResult = await first.response;
    assert.equal(firstResult.clientAborted, true);
    await waitFor(/synthetic:abort:OLD_STALL:1/u);
    await delay(260);
    assert.equal(/synthetic:start:OLD_STALL:2/u.test(log), false);
    assert.equal((log.match(/synthetic:start:OLD_STALL:/gu) ?? []).length, 1);

    const second = wire("RETRY_STALL", "req-wire-retry", { disconnect: true });
    await waitFor(/synthetic:start:RETRY_STALL:1/u);
    await waitFor(/synthetic:start:RETRY_STALL:2/u);
    second.req.destroy();
    const secondResult = await second.response;
    assert.equal(secondResult.clientAborted, true);
    await waitFor(/synthetic:abort:RETRY_STALL:2/u);
    await delay(260);
    assert.equal((log.match(/synthetic:start:RETRY_STALL:/gu) ?? []).length, 2);

    const normal = await wire("NEW_OK", "req-wire-new").response;
    assert.equal(normal.status, 200);
    assert.equal(normal.body.requestId, "req-wire-new");
    assert.equal(normal.body.patch.fields.variant, "style:soft");

    const normalAgain = await wire("NEW_OK", "req-wire-new-2").response;
    assert.equal(normalAgain.status, 200);
    assert.equal(normalAgain.body.requestId, "req-wire-new-2");
    assert.equal(/synthetic:start:OLD_STALL:2/u.test(log), false);
    assert.equal((log.match(/synthetic:start:RETRY_STALL:/gu) ?? []).length, 2);

    const logPath = process.env.CAMPUSFLOW_WIRE_LOG;
    if (logPath) await writeFile(logPath, log);
    const resultPath = process.env.CAMPUSFLOW_WIRE_RESULT;
    if (resultPath) {
      await writeFile(
        resultPath,
        JSON.stringify(
          {
            oldUpstreamCalls: (log.match(/synthetic:start:OLD_STALL:/gu) ?? []).length,
            oldAbort: /synthetic:abort:OLD_STALL:1/u.test(log),
            retryUpstreamCalls: (log.match(/synthetic:start:RETRY_STALL:/gu) ?? []).length,
            retryAbort: /synthetic:abort:RETRY_STALL:2/u.test(log),
            newStatus: normal.status,
            newRequestId: normal.body.requestId,
            followUpStatus: normalAgain.status,
          },
          null,
          2,
        ),
      );
    }
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit").catch(() => {});
  }
});
