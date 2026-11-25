import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_REQUEST_TIMEOUT_MS,
  createDeepSeekProvider,
  patchTokenBudget,
} from "../shared/ai/provider.ts";
import { handleAiDesignRequest } from "../shared/ai/server.ts";

function completion({
  content,
  finishReason = "stop",
  model = "deepseek-flash",
  usage = {
    prompt_tokens: 120,
    completion_tokens: 80,
    total_tokens: 200,
    completion_tokens_details: { reasoning_tokens: 0 },
  },
} = {}) {
  return new Response(
    JSON.stringify({
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: finishReason,
        },
      ],
      usage,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function scriptedFetch(responses) {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(JSON.parse(String(init?.body ?? "{}")));
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra fetch");
    return next(init);
  };
  return { fetchImpl, calls };
}

const TEST_KEY = "test" + "-key";

const patchInput = {
  blockId: "b-info",
  blockType: "info_card",
  currentProps: {
    title: "面试安排",
    body: "时间：11 月 15 日 14:00\n地点：信息楼 A302",
    variant: "style:plain",
  },
  instruction: "能改的好看一点吗 现在有点太土了",
  signal: new AbortController().signal,
};

const validPatchText = JSON.stringify({
  blockId: "b-info",
  blockType: "info_card",
  fields: {
    title: "面试安排",
    body: "11 月 15 日 14:00 · 信息楼 A302",
    variant: "style:soft",
  },
});

test("info_card patches disable thinking and use a field-sized budget", async () => {
  const { fetchImpl, calls } = scriptedFetch([() => completion({ content: validPatchText })]);
  const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });
  const patch = await provider.patch(patchInput);

  assert.equal(patch.fields.variant, "style:soft");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].thinking, { type: "disabled" });
  assert.equal(calls[0].max_tokens, patchTokenBudget("info_card"));
  assert.equal(calls[0].max_tokens, 700);
  assert.deepEqual(calls[0].response_format, { type: "json_object" });
  assert.match(calls[0].messages[1].content, /"fields": \{/);
  assert.equal(calls[0].messages[1].content.includes("..."), false);
});

test("truncated patch output is retried once then reported as incomplete", async () => {
  const truncated = () =>
    completion({
      content: '{"blockId":"b-info","blockType":"info_card","fields":{"title":"',
      finishReason: "length",
    });
  const { fetchImpl, calls } = scriptedFetch([truncated, truncated]);
  const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });

  await assert.rejects(provider.patch(patchInput), (error) => {
    assert.equal(error.code, "truncated_response");
    assert.equal(error.message, "AI 输出不完整，请重试。");
    assert.equal(error.diagnostics.finishReason, "length");
    assert.equal(error.diagnostics.retries, 1);
    assert.equal(error.diagnostics.model, "deepseek-flash");
    assert.equal(error.diagnostics.category, "truncated_response");
    assert.equal(error.diagnostics.contentLength > 0, true);
    assert.equal(JSON.stringify(error.diagnostics).includes("太土"), false);
    assert.equal(JSON.stringify(error.diagnostics).includes("信息楼"), false);
    return true;
  });
  assert.equal(calls.length, 2);
});

test("empty output is retried once and can recover", async () => {
  const { fetchImpl, calls } = scriptedFetch([
    () => completion({ content: "   ", finishReason: "stop" }),
    () => completion({ content: validPatchText }),
  ]);
  const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });
  const patch = await provider.patch(patchInput);
  assert.equal(patch.fields.variant, "style:soft");
  assert.equal(calls.length, 2);
});

test("non-JSON output is retried once then reported as a format error", async () => {
  const plain = () => completion({ content: "我建议把卡片改成浅色。", finishReason: "stop" });
  const { fetchImpl, calls } = scriptedFetch([plain, plain]);
  const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });

  await assert.rejects(provider.patch(patchInput), (error) => {
    assert.equal(error.code, "invalid_json");
    assert.equal(error.message, "AI 返回格式不正确，请重试。");
    assert.equal(error.diagnostics.retries, 1);
    assert.equal(error.diagnostics.contentLength > 0, true);
    return true;
  });
  assert.equal(calls.length, 2);
});

test("invalid keys are not retried", async () => {
  const { fetchImpl, calls } = scriptedFetch([
    () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
  ]);
  const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });

  await assert.rejects(provider.patch(patchInput), (error) => {
    assert.equal(error.code, "invalid_key");
    assert.equal(error.diagnostics.category, "invalid_key");
    assert.equal(error.diagnostics.retries, 0);
    return true;
  });
  assert.equal(calls.length, 1);
});

test("provider resource interruption is not automatically retried", async () => {
  const { fetchImpl, calls } = scriptedFetch([
    () =>
      completion({
        content: validPatchText,
        finishReason: "insufficient_system_resource",
      }),
  ]);
  const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });

  await assert.rejects(provider.patch(patchInput), (error) => {
    assert.equal(error.code, "provider_unavailable");
    assert.equal(error.diagnostics.finishReason, "insufficient_system_resource");
    assert.equal(error.diagnostics.retries, 0);
    return true;
  });
  assert.equal(calls.length, 1);
});

test("aborting during the automatic retry rejects as cancelled", async () => {
  const controller = new AbortController();
  let calls = 0;
  const fetchImpl = async (_url, init) => {
    calls += 1;
    if (calls === 1) {
      return completion({
        content: '{"blockId":"b-info","blockType":"info_card","fields":{"title":"',
        finishReason: "length",
      });
    }
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  };
  const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });
  const pending = provider.patch({ ...patchInput, signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();

  await assert.rejects(pending, (error) => {
    assert.equal(error.code, "cancelled");
    return true;
  });
  assert.equal(calls, 2);
});

test("scope violations from a real provider payload are rejected by the server", async () => {
  const { fetchImpl, calls } = scriptedFetch([
    () =>
      completion({
        content: JSON.stringify({
          blockId: "b-info",
          blockType: "info_card",
          fields: { title: "面试安排", body: "说明", radius: 20 },
        }),
      }),
  ]);
  const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });
  const request = new Request(
    "http://127.0.0.1:8000/functions/v1/app/api/ai/design",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_KEY}-1234567890`,
      },
      body: JSON.stringify({
        requestId: "req-provider-scope-12345678",
        mode: "block",
        blockId: "b-info",
        blockType: "info_card",
        currentProps: patchInput.currentProps,
        instruction: patchInput.instruction,
      }),
    },
  );
  const response = await handleAiDesignRequest(request, {
    providerFactory: () => provider,
  });
  const body = await response.json();
  assert.equal(response.status, 422);
  assert.equal(body.error, "invalid_output_scope_violation");
  assert.equal(calls.length, 1);
});

test("block failures expose redacted diagnostics without request content or key", async () => {
  const truncated = () =>
    completion({
      content: '{"blockId":"b-info","blockType":"info_card","fields":{"title":"',
      finishReason: "length",
    });
  const { fetchImpl } = scriptedFetch([truncated, truncated]);
  const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });
  const request = new Request(
    "http://127.0.0.1:8000/functions/v1/app/api/ai/design",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_KEY}-1234567890`,
      },
      body: JSON.stringify({
        requestId: "req-provider-diag-12345678",
        mode: "block",
        blockId: "b-info",
        blockType: "info_card",
        currentProps: patchInput.currentProps,
        instruction: patchInput.instruction,
      }),
    },
  );
  const response = await handleAiDesignRequest(request, {
    providerFactory: () => provider,
  });
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.error, "truncated_response");
  assert.equal(body.message, "AI 输出不完整，请重试。");
  assert.equal(body.diagnostics.finishReason, "length");
  assert.equal(body.diagnostics.retries, 1);
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes("test-key"), false);
  assert.equal(serialized.includes("太土"), false);
  assert.equal(serialized.includes("信息楼"), false);
});

test("finish_reason length is rejected even when the JSON text parses", async () => {
  const lengthStop = () =>
    completion({ content: validPatchText, finishReason: "length" });
  const { fetchImpl, calls } = scriptedFetch([lengthStop, lengthStop]);
  const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });

  await assert.rejects(provider.patch(patchInput), (error) => {
    assert.equal(error.code, "truncated_response");
    assert.equal(error.diagnostics.finishReason, "length");
    assert.equal(error.diagnostics.promptTokens, 120);
    assert.equal(error.diagnostics.completionTokens, 80);
    assert.equal(error.diagnostics.retries, 1);
    return true;
  });
  assert.equal(calls.length, 2);
});

test("empty resource and aborted stops keep their terminal classification", async () => {
  const cases = [
    ["insufficient_system_resource", "provider_unavailable", 503],
    ["aborted", "provider_aborted", 503],
  ];
  for (const [finishReason, code, status] of cases) {
    for (const content of ["", validPatchText]) {
      const { fetchImpl, calls } = scriptedFetch([
        () => completion({ content, finishReason }),
      ]);
      const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });
      await assert.rejects(provider.patch(patchInput), (error) => {
        assert.equal(error.code, code);
        assert.equal(error.status, status);
        assert.equal(error.diagnostics.finishReason, finishReason);
        assert.equal(error.diagnostics.contentLength, content.length);
        assert.equal(error.diagnostics.retries, 0);
        return true;
      });
      assert.equal(calls.length, 1);
    }
  }
});

test("a header timeout is reported as timeout without retry", async () => {
  const realSetTimeout = globalThis.setTimeout;
  try {
    globalThis.setTimeout = (callback, ms, ...args) =>
      realSetTimeout(callback, ms === AI_REQUEST_TIMEOUT_MS ? 20 : ms, ...args);
    const { fetchImpl, calls } = scriptedFetch([
      (init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener(
            "abort",
            () => reject(init.signal.reason),
            { once: true },
          );
        }),
    ]);
    const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });
    await assert.rejects(provider.patch(patchInput), (error) => {
      assert.equal(error.code, "timeout");
      assert.equal(error.status, 504);
      assert.equal(error.diagnostics.category, "timeout");
      assert.equal(error.diagnostics.retries, 0);
      return true;
    });
    assert.equal(calls.length, 1);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

function stalledBodyResponse(init, onBodyStarted) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
        init.signal.addEventListener(
          "abort",
          () => controller.error(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
        onBodyStarted?.();
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("a body-read timeout is reported as timeout without retry", async () => {
  const realSetTimeout = globalThis.setTimeout;
  try {
    globalThis.setTimeout = (callback, ms, ...args) =>
      realSetTimeout(callback, ms === AI_REQUEST_TIMEOUT_MS ? 20 : ms, ...args);
    const { fetchImpl, calls } = scriptedFetch([
      (init) => stalledBodyResponse(init),
    ]);
    const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });
    await assert.rejects(provider.patch(patchInput), (error) => {
      assert.equal(error.code, "timeout");
      assert.equal(error.status, 504);
      assert.equal(error.diagnostics.category, "timeout");
      assert.equal(error.diagnostics.retries, 0);
      return true;
    });
    assert.equal(calls.length, 1);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

test("cancelling while reading the body stays cancelled", async () => {
  const controller = new AbortController();
  let bodyStarted = false;
  const { fetchImpl, calls } = scriptedFetch([
    (init) =>
      stalledBodyResponse(init, () => {
        bodyStarted = true;
      }),
  ]);
  const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });
  const pending = provider.patch({ ...patchInput, signal: controller.signal });
  while (!bodyStarted) await new Promise((resolve) => setTimeout(resolve, 2));
  controller.abort();
  await assert.rejects(pending, (error) => {
    assert.equal(error.code, "cancelled");
    assert.equal(error.status, 499);
    assert.equal(error.diagnostics.category, "cancelled");
    assert.equal(error.diagnostics.retries, 0);
    return true;
  });
  assert.equal(calls.length, 1);
});

test("the patch retry shares the original 30s budget", async () => {
  const realSetTimeout = globalThis.setTimeout;
  const started = Date.now();
  try {
    globalThis.setTimeout = (callback, ms, ...args) =>
      realSetTimeout(callback, ms === AI_REQUEST_TIMEOUT_MS ? 70 : ms, ...args);
    const { fetchImpl, calls } = scriptedFetch([
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return completion({
          content: '{"blockId":"b-info","blockType":"info_card","fields":{"title":"',
          finishReason: "length",
        });
      },
      (init) => stalledBodyResponse(init),
    ]);
    const provider = createDeepSeekProvider({ apiKey: TEST_KEY, fetchImpl });
    await assert.rejects(provider.patch(patchInput), (error) => {
      assert.equal(error.code, "timeout");
      assert.equal(error.status, 504);
      assert.equal(error.diagnostics.retries, 1);
      return true;
    });
    assert.equal(calls.length, 2);
    assert.equal(Date.now() - started < 500, true);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});
