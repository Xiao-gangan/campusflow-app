import test from "node:test";
import assert from "node:assert/strict";
import {
  createAiProvider,
} from "../shared/ai/provider.ts";
import { handleAiDesignRequest } from "../shared/ai/server.ts";
import { createMockProvider } from "../shared/ai/mock.ts";
import { AI_PROVIDERS, resolveProviderModel } from "../shared/ai/providers.ts";

const TEST_KEY = "test-synthetic-key";
const patchInput = {
  blockId: "b-info",
  blockType: "info_card",
  currentProps: {
    title: "面试安排",
    body: "时间：11 月 15 日 14:00\n地点：信息楼 A302",
    variant: "style:plain",
  },
  instruction: "更简洁",
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

function completion(model) {
  return new Response(JSON.stringify({
    model,
    choices: [{ index: 0, message: { role: "assistant", content: validPatchText }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("Qwen uses its official endpoint and supported request parameters", async () => {
  const calls = [];
  const provider = createAiProvider({
    provider: "qwen",
    apiKey: TEST_KEY,
    model: "qwen-plus",
    fetchImpl: async (url, init) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(String(init.body)) });
      return completion("qwen-plus");
    },
  });
  const patch = await provider.patch(patchInput);
  assert.equal(patch.fields.variant, "style:soft");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
  assert.equal(calls[0].headers.Authorization, `Bearer ${TEST_KEY}`);
  assert.equal(calls[0].body.model, "qwen-plus");
  assert.equal(calls[0].body.max_tokens, 700);
  assert.equal(typeof calls[0].body.temperature, "number");
  assert.equal(calls[0].body.max_completion_tokens, undefined);
  assert.equal(calls[0].body.thinking, undefined);
  assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
});

test("Kimi uses kimi-k3.1-pro, max_completion_tokens and low reasoning without temperature or thinking", async () => {
  const calls = [];
  const provider = createAiProvider({
    provider: "kimi",
    apiKey: TEST_KEY,
    model: "kimi-k3.1-pro",
    fetchImpl: async (url, init) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(String(init.body)) });
      return completion("kimi-k3.1-pro");
    },
  });
  await provider.patch(patchInput);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.moonshot.cn/v1/chat/completions");
  assert.equal(calls[0].headers.Authorization, `Bearer ${TEST_KEY}`);
  assert.equal(calls[0].body.model, "kimi-k3.1-pro");
  assert.equal(calls[0].body.max_completion_tokens, 700);
  assert.equal(calls[0].body.max_tokens, undefined);
  assert.equal(calls[0].body.temperature, undefined);
  assert.equal(calls[0].body.thinking, undefined);
  assert.equal(calls[0].body.reasoning_effort, "low");
  assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
  assert.throws(() => resolveProviderModel("kimi", "moonshot-v1-8k"), /不支持/u);
});

test("DeepSeek V4 Pro and Kimi K3 variants use the same provider endpoints and JSON parameters", async () => {
  const deepseekCalls = [];
  const deepseek = createAiProvider({
    provider: "deepseek",
    apiKey: TEST_KEY,
    model: "deepseek-v4-pro",
    fetchImpl: async (url, init) => {
      deepseekCalls.push({ url, body: JSON.parse(String(init.body)) });
      return completion("deepseek-v4-pro");
    },
  });
  await deepseek.patch(patchInput);
  assert.equal(deepseekCalls[0].url, "https://api.deepseek.com/chat/completions");
  assert.equal(deepseekCalls[0].body.model, "deepseek-v4-pro");
  assert.equal(deepseekCalls[0].body.max_tokens, 700);
  assert.equal(typeof deepseekCalls[0].body.temperature, "number");
  assert.deepEqual(deepseekCalls[0].body.thinking, { type: "disabled" });
  assert.deepEqual(deepseekCalls[0].body.response_format, { type: "json_object" });
  assert.equal(AI_PROVIDERS.deepseek.defaultModel, "deepseek-flash");
  assert.throws(() => resolveProviderModel("deepseek", "deepseek-chat"), /不支持/u);
  assert.throws(() => resolveProviderModel("deepseek", "deepseek-reasoner"), /不支持/u);

  for (const model of ["kimi-k3", "kimi-k3.1-pro-highspeed"]) {
    const calls = [];
    const provider = createAiProvider({
      provider: "kimi",
      apiKey: TEST_KEY,
      model,
      fetchImpl: async (url, init) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return completion(model);
      },
    });
    await provider.patch(patchInput);
    assert.equal(calls[0].url, "https://api.moonshot.cn/v1/chat/completions");
    assert.equal(calls[0].body.model, model);
    assert.equal(calls[0].body.max_completion_tokens, 700);
    assert.equal(calls[0].body.max_tokens, undefined);
    assert.equal(calls[0].body.temperature, undefined);
    assert.equal(calls[0].body.thinking, undefined);
    assert.equal(calls[0].body.reasoning_effort, "low");
    assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
  }
  assert.equal(AI_PROVIDERS.kimi.defaultModel, "kimi-k3.1-pro");
  assert.throws(() => resolveProviderModel("kimi", "moonshot-v1-32k"), /不支持/u);
});

test("server accepts provider/model selection and keeps keys provider-independent", async () => {
  const selections = [];
  const request = (body) => new Request("http://local.test/functions/v1/app/api/ai/design", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const factory = (apiKey, selection) => {
    selections.push({ apiKey, ...selection });
    return {
      name: selection.provider,
      probe: async () => ({ model: selection.model }),
    };
  };
  const testResponse = await handleAiDesignRequest(request({
    requestId: "provider-test-1",
    mode: "test",
    provider: "kimi",
    model: "kimi-k3.1-pro",
    target: "email",
  }), { providerFactory: factory });
  assert.equal(testResponse.status, 200);
  assert.deepEqual(selections[0], {
    apiKey: TEST_KEY,
    provider: "kimi",
    model: "kimi-k3.1-pro",
  });
  const testBody = await testResponse.json();
  assert.equal(testBody.provider, "kimi");
  assert.equal(testBody.model, "kimi-k3.1-pro");

  const invalid = await handleAiDesignRequest(request({
    requestId: "provider-test-2",
    mode: "test",
    provider: "other",
    model: "whatever",
  }), { providerFactory: factory });
  assert.equal(invalid.status, 400);
  const invalidModel = await handleAiDesignRequest(request({
    requestId: "provider-test-3",
    mode: "test",
    provider: "kimi",
    model: "moonshot-v1-8k",
  }), { providerFactory: factory });
  assert.equal(invalidModel.status, 400);
});

test("full and block requests carry the selected provider into the shared factory", async () => {
  let selection;
  const factory = (_apiKey, next) => {
    selection = next;
    return createMockProvider({ delayMs: 0 });
  };
  const full = await handleAiDesignRequest(new Request("http://local.test/functions/v1/app/api/ai/design", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-full-key" },
    body: JSON.stringify({
      requestId: "full-provider-1",
      mode: "full",
      target: "invite_page",
      prompt: "生成一份简洁的邀请函",
      provider: "qwen",
      model: "qwen-max",
      mock: false,
    }),
  }), { providerFactory: factory });
  assert.equal(full.status, 200);
  assert.deepEqual(selection, { provider: "qwen", model: "qwen-max" });
  await full.text();

  const block = await handleAiDesignRequest(new Request("http://local.test/functions/v1/app/api/ai/design", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-block-key" },
    body: JSON.stringify({
      requestId: "block-provider-1",
      mode: "block",
      target: "email",
      blockId: "b-info",
      blockType: "info_card",
      currentProps: patchInput.currentProps,
      instruction: "更简洁",
      provider: "kimi",
      model: "kimi-k3.1-pro",
      mock: false,
    }),
  }), { providerFactory: factory });
  assert.equal(block.status, 200);
  assert.deepEqual(selection, { provider: "kimi", model: "kimi-k3.1-pro" });
});