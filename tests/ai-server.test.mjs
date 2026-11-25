import test from "node:test";
import assert from "node:assert/strict";
import { handleAiDesignRequest } from "../shared/ai/server.ts";
import { createMockProvider } from "../shared/ai/mock.ts";
import { AiProviderError } from "../shared/ai/provider.ts";

function parseSse(text) {
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => {
      const lines = frame.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
      const data = lines.find((line) => line.startsWith("data: "))?.slice(6);
      return { event, data: data ? JSON.parse(data) : null };
    })
    .filter((item) => item.event);
}

function fullRequest(mock = true) {
  return new Request("http://127.0.0.1:8000/functions/v1/app/api/ai/design", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: "req-12345678",
      mode: "full",
      prompt: "帮我设计一封正式面试邀请，深大红，信息清晰。",
      mock,
    }),
  });
}

test("mock full generation streams validated blocks before completion", async () => {
  const response = await handleAiDesignRequest(fullRequest(), {
    allowMock: true,
    mockProvider: createMockProvider({ delayMs: 0 }),
  });
  assert.equal(response.status, 200);
  const events = parseSse(await response.text());
  assert.equal(events[0].event, "generation-started");
  const structure = events.find((event) => event.event === "structure-ready");
  assert.ok(structure);
  assert.equal(structure.data.plan.blocks.length, 6);
  const blocks = events.filter((event) => event.event === "block-ready");
  assert.equal(blocks.length, 6);
  const completed = events.find((event) => event.event === "generation-completed");
  assert.ok(completed);
  assert.equal(completed.data.design.target, "email");
  assert.equal(completed.data.design.blocks.length, 6);
  assert.equal(events.at(-1).event, "generation-completed");
});

test("mock variations produce different structures and themes", async () => {
  async function generate(prompt) {
    const response = await handleAiDesignRequest(
      new Request("http://127.0.0.1:8000/functions/v1/app/api/ai/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: `req-${prompt.length}-12345678`,
          mode: "full",
          prompt,
          mock: true,
        }),
      }),
      { allowMock: true, mockProvider: createMockProvider({ delayMs: 0 }) },
    );
    const events = parseSse(await response.text());
    return events.find((event) => event.event === "generation-completed")?.data
      .design;
  }
  const formal = await generate("正式的深大红面试邀请");
  const playful = await generate("青春校园活动，轻快活泼");
  const minimal = await generate("简约高级的合作邀请，大量留白");
  assert.equal(formal.theme.primaryColor, "#8f2d2d");
  assert.equal(playful.theme.primaryColor, "#b25e2f");
  assert.equal(minimal.theme.primaryColor, "#1f2321");
  assert.notDeepEqual(
    formal.blocks.map((block) => block.type),
    playful.blocks.map((block) => block.type),
  );
  assert.notEqual(formal.blocks[1].props.variant, playful.blocks[1].props.variant);
  assert.notEqual(playful.blocks[1].props.variant, minimal.blocks[1].props.variant);
});

test("missing key, disabled mock and provider failures stay explicit", async () => {
  const noKey = await handleAiDesignRequest(fullRequest(false), {});
  assert.equal(noKey.status, 401);
  assert.equal((await noKey.json()).error, "missing_key");

  const forbiddenMock = await handleAiDesignRequest(fullRequest(true), {
    allowMock: false,
  });
  assert.equal(forbiddenMock.status, 403);

  const provider = {
    name: "deepseek",
    async plan() {
      throw new AiProviderError("invalid_key", "Key 无效。", 401, false);
    },
    async block() {
      throw new Error("unreachable");
    },
    async patch() {
      throw new Error("unreachable");
    },
  };
  const failure = await handleAiDesignRequest(
    new Request("http://127.0.0.1:8000/functions/v1/app/api/ai/design", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-test-1234567890",
      },
      body: JSON.stringify({
        requestId: "req-failure-12345678",
        mode: "full",
        prompt: "正式面试邀请",
      }),
    }),
    { providerFactory: () => provider },
  );
  const events = parseSse(await failure.text());
  const failed = events.find((event) => event.event === "generation-failed");
  assert.ok(failed);
  assert.equal(failed.data.code, "invalid_key");
  assert.equal(events.some((event) => event.event === "generation-completed"), false);
});

test("block patches are returned as scoped patches", async () => {
  const response = await handleAiDesignRequest(
    new Request("http://127.0.0.1:8000/functions/v1/app/api/ai/design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "req-patch-12345678",
        mode: "block",
        blockId: "b2",
        blockType: "heading",
        currentProps: {
          text: "诚邀 {{candidate_name}} 参加面试",
          align: "left",
          variant: "style:plain",
        },
        instruction: "更正式一些",
        mock: true,
      }),
    }),
    { allowMock: true, mockProvider: createMockProvider({ delayMs: 0 }) },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.patch.blockId, "b2");
  assert.ok(body.patch.fields.text.includes("{{candidate_name}}"));
  assert.ok(body.patch.changedFields.includes("文字"));
});


test("provider rate limits, timeouts and invalid output are reported without completion", async () => {
  const cases = [
    new AiProviderError("rate_limited", "请求过于频繁。", 429, true),
    new AiProviderError("timeout", "响应超时。", 504, true),
    new AiProviderError("provider_unavailable", "服务不可用。", 503, true),
  ];
  for (const [index, failure] of cases.entries()) {
    const provider = {
      name: "deepseek",
      async plan() {
        throw failure;
      },
      async block() {
        throw new Error("unreachable");
      },
      async patch() {
        throw new Error("unreachable");
      },
    };
    const response = await handleAiDesignRequest(
      new Request("http://127.0.0.1:8000/functions/v1/app/api/ai/design", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-test-1234567890",
        },
        body: JSON.stringify({
          requestId: `req-error-${index}-12345678`,
          mode: "full",
          prompt: "正式邀请",
        }),
      }),
      { providerFactory: () => provider },
    );
    const events = parseSse(await response.text());
    const failed = events.find((event) => event.event === "generation-failed");
    assert.equal(failed.data.code, failure.code);
    assert.equal(events.some((event) => event.event === "generation-completed"), false);
  }

  const invalidProvider = {
    name: "deepseek",
    async plan() {
      return { themePreset: "crimson", blocks: [] };
    },
    async block() {
      return {};
    },
    async patch() {
      return {};
    },
  };
  const invalidResponse = await handleAiDesignRequest(
    new Request("http://127.0.0.1:8000/functions/v1/app/api/ai/design", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-test-1234567890",
      },
      body: JSON.stringify({
        requestId: "req-invalid-12345678",
        mode: "full",
        prompt: "正式邀请",
      }),
    }),
    { providerFactory: () => invalidProvider },
  );
  const invalidEvents = parseSse(await invalidResponse.text());
  const invalidFailed = invalidEvents.find((event) => event.event === "generation-failed");
  assert.match(invalidFailed.data.code, /invalid_output/);
  assert.equal(invalidEvents.some((event) => event.event === "generation-completed"), false);
});

test("validation errors in plan, block and patch retry once with error feedback and recover", async () => {
  const seenCorrections = [];
  let patchAttempts = 0;
  const recoveringProvider = {
    name: "deepseek",
    async plan(input) {
      if (!input.correction) {
        return { themePreset: "crimson", fontFamily: "sans", subject: "面试", blocks: [] };
      }
      seenCorrections.push(input.correction);
      return {
        themePreset: "ocean",
        colors: { primaryColor: "#145da0" },
        fontFamily: "sans",
        radius: 16,
        spacing: 16,
        subject: "面试邀请",
        preheader: "欢迎参加",
        tone: "正式",
        blocks: [
          { id: "b1", type: "logo", purpose: "品牌" },
          { id: "b2", type: "heading", purpose: "主标题" },
          { id: "b3", type: "text", purpose: "正文" },
          { id: "b4", type: "footer", purpose: "署名" },
        ],
      };
    },
    async block(input) {
      if (input.block.id === "b2" && !input.correction) {
        return { id: "b2", type: "heading", text: "标题", level: 1, variant: "style:not-real" };
      }
      if (input.correction) seenCorrections.push(input.correction);
      if (input.block.type === "logo") return { id: "b1", type: "logo", alt: "组织", width: 180, align: "center", variant: "style:plain" };
      if (input.block.type === "heading") return { id: "b2", type: "heading", text: "诚邀参加面试", level: 1, align: "center", variant: "style:band" };
      if (input.block.type === "text") return { id: "b3", type: "text", text: "你好，{{candidate_name}}", align: "left", variant: "style:lead" };
      return { id: "b4", type: "footer", text: "{{organization_name}}", align: "center", variant: "style:note" };
    },
    async patch(input) {
      patchAttempts += 1;
      if (patchAttempts === 1) {
        return { blockId: input.blockId, blockType: input.blockType, fields: { lineHeight: 1.55 } };
      }
      seenCorrections.push(input.correction);
      return { blockId: input.blockId, blockType: input.blockType, fields: { lineHeight: 1.6 } };
    },
  };

  const fullRes = await handleAiDesignRequest(
    new Request("http://127.0.0.1:8000/functions/v1/app/api/ai/design", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-test-1234567890",
      },
      body: JSON.stringify({
        requestId: "req-recover-full-1234",
        mode: "full",
        prompt: "深蓝正式邀请",
      }),
    }),
    { providerFactory: () => recoveringProvider },
  );
  const fullEvents = parseSse(await fullRes.text());
  const completed = fullEvents.find((event) => event.event === "generation-completed");
  assert.ok(completed);
  assert.equal(completed.data.design.theme.primaryColor, "#145da0");

  const patchRes = await handleAiDesignRequest(
    new Request("http://127.0.0.1:8000/functions/v1/app/api/ai/design", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-test-1234567890",
      },
      body: JSON.stringify({
        requestId: "req-recover-patch-1234",
        mode: "block",
        blockId: "b3",
        blockType: "text",
        currentProps: { text: "你好" },
        instruction: "调整行高",
      }),
    }),
    { providerFactory: () => recoveringProvider },
  );
  assert.equal(patchRes.status, 200);
  const patchBody = await patchRes.json();
  assert.equal(patchBody.patch.fields.lineHeight, 1.6);
  assert.equal(seenCorrections.length, 3);
});
