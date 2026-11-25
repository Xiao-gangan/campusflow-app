import test from "node:test";
import assert from "node:assert/strict";
import { handleAiDesignRequest } from "../shared/ai/server.ts";
import { createDeepSeekProvider } from "../shared/ai/provider.ts";
import { createMockProvider } from "../shared/ai/mock.ts";
import {
  buildBlockPrompt,
  buildPatchPrompt,
  buildPlanPrompt,
} from "../shared/ai/prompt.ts";
import {
  aiBlockToDesignBlock,
  buildAiTheme,
  parseAiBlock,
  parseAiPatch,
  parseAiPlan,
} from "../shared/ai/schema.ts";
import { isValidAiCompletion } from "../shared/ai/stream.ts";
import { applyAiBlockFields } from "../shared/ai/block-revision.ts";
import { buildInvitePage } from "../shared/invite/model.ts";
import { openRsvpStore } from "../dev/rsvp/store.ts";

const target = "invite_page";
const blocks = ["hero", "event_info", "rsvp", "footer"].map((type, i) => ({
  id: "b" + i,
  type,
  purpose: type,
}));
const plan = {
  themePreset: "forest",
  fontFamily: "sans",
  blocks,
  colors: { primaryColor: "#176b7d" },
};
const mock = createMockProvider({ delayMs: 0 });
async function request(body, provider = mock) {
  return handleAiDesignRequest(
    new Request("http://localhost/api/ai/design", {
      method: "POST",
      body: JSON.stringify({
        requestId: "invite-qa-12345",
        mock: true,
        ...body,
      }),
    }),
    { allowMock: true, mockProvider: provider },
  );
}

test("invite SSE builds an editable page with protected event placeholders and genuine RSVP controls", async (t) => {
  const res = await request({ target, mode: "full", prompt: "正式邀请" });
  const frames = (await res.text())
    .trim()
    .split("\n\n")
    .map((s) => JSON.parse(s.split("\ndata: ")[1]));
  const design = frames.at(-1).design;
  assert.equal(design.target, target);
  assert.deepEqual(design.meta, {});
  assert.deepEqual(
    design.blocks.map((b) => b.type),
    ["hero", "event_info", "rsvp", "footer"],
  );
  assert.ok(isValidAiCompletion(frames[1].plan.blocks, design, target));
  assert.equal(
    isValidAiCompletion(frames[1].plan.blocks, design, "email"),
    false,
  );
  const db = openRsvpStore(":memory:", () => new Date("2026-11-22T01:00:00Z"));
  t.after(() => db.close());
  const { token } = await db.issue(design, "2026-11-23T01:00:00Z");
  const invite = await db.view(token);
  const sections = buildInvitePage(invite.document, invite.context).sections;
  assert.match(sections.find((s) => s.kind === "hero").title, /林知夏/);
  assert.equal(
    sections.find((s) => s.kind === "event_info").location,
    invite.context.interview_location,
  );
  assert.equal(
    (await db.respond(token, "attending", invite.version)).rsvpStatus,
    "confirmed",
  );
});

test("invite rules enforce target, core modules, variable scope, exact colors and safe styles", () => {
  const parsed = parseAiPlan(plan, target);
  assert.equal(buildAiTheme(parsed).primaryColor, "#176b7d");
  assert.equal(buildAiTheme(parsed).width, 760);
  assert.throws(() =>
    parseAiPlan({ ...plan, colors: { primaryColor: "red" } }, target),
  );
  assert.throws(() =>
    parseAiPlan(
      {
        ...plan,
        blocks: [
          ...blocks.slice(0, 2),
          blocks[3],
          { ...blocks[3], id: "last" },
        ],
      },
      target,
    ),
  );
  assert.throws(() => parseAiPlan({ ...plan, subject: "邮件" }, "email"));
  const raw = {
    ...blocks[0],
    title: "{{candidate_name}}，你好",
    borderColor: "#abcdef",
    paddingX: 0,
  };
  const payload = parseAiBlock(raw, blocks[0], target);
  assert.equal(aiBlockToDesignBlock(payload).props.paddingX, 0);
  assert.throws(() =>
    parseAiBlock({ ...raw, title: "{{onboarding_link}}" }, blocks[0], target),
  );
  const event = aiBlockToDesignBlock(
    parseAiBlock(
      { ...blocks[1], title: "日程", location: "幻觉地址", time: "错误时间" },
      blocks[1],
      target,
    ),
  );
  assert.equal(event.props.time, "{{interview_time}}");
  assert.equal(event.props.location, "{{interview_location}}");
});

test("invite patches work for all three native blocks and reject changes to candidate actions or facts", async () => {
  for (const block of blocks.slice(0, 3)) {
    const res = await request({
      target,
      mode: "block",
      blockId: block.id,
      blockType: block.type,
      currentProps: { title: "原文" },
      instruction: "加 #123abc 边框",
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).patch.fields.borderColor, "#123abc");
  }
  const input = {
    target,
    blockId: "a",
    blockType: "rsvp",
    currentProps: { description: "{{candidate_name}} 的邀请" },
  };
  for (const fields of [
    { confirmLabel: "转账" },
    { rescheduleLabel: "改期" },
    { url: "https://example.test" },
    { description: "丢失字段" },
  ]) {
    assert.throws(() =>
      parseAiPatch({ blockId: "a", blockType: "rsvp", fields }, input),
    );
  }
  assert.throws(() =>
    parseAiPatch(
      { blockId: "a", blockType: "event_info", fields: { date: "明日" } },
      { ...input, blockType: "event_info" },
    ),
  );
  for (const [target, blockType] of [
    ["email", "hero"],
    ["email", "rsvp"],
    ["invite_page", "image"],
    ["other", "text"],
  ]) {
    assert.equal(
      (
        await request({
          target,
          mode: "block",
          blockId: "a",
          blockType,
          currentProps: {},
        })
      ).status,
      400,
    );
  }
});

test("rewriting invite rich text changes just that field; a style-only change preserves marks and link fields", () => {
  const block = {
    id: "b1",
    type: "hero",
    props: {
      title: "主标题",
      subtitle: "副标题",
      richText: { title: { content: [] }, subtitle: { content: [] } },
    },
  };
  assert.deepEqual(
    applyAiBlockFields(block, { borderRadius: 12 }).props.richText,
    block.props.richText,
  );
  const updated = applyAiBlockFields(block, { subtitle: "新文案" });
  assert.deepEqual(updated.props.richText, { title: { content: [] } });
  assert.throws(() =>
    parseAiPatch(
      { blockId: "b1", blockType: "hero", fields: { subtitle: "新副标题" } },
      {
        target,
        blockId: "b1",
        blockType: "hero",
        currentProps: { subtitle: "链接", linkedTextFields: ["subtitle"] },
      },
    ),
  );
});

test("provider prompts retain invitation target, custom colors, and selected component scope", () => {
  const a = buildPlanPrompt({ target, prompt: "青绿色邀请函" });
  assert.match(a.system, /邀请函网页/);
  assert.doesNotMatch(a.system, /onboarding_link/);
  assert.match(a.user, /primaryColor/);
  const b = buildBlockPrompt(
    parseAiPlan(plan, target),
    blocks[0],
    [],
    "首屏标题居中",
  );
  assert.match(b.system, /邀请函网页/);
  assert.match(b.user, /"subtitle"/);
  const p = buildPatchPrompt({
    target,
    blockId: "b2",
    blockType: "event_info",
    currentProps: { title: "日程" },
    instruction: "修改边框",
  });
  assert.match(p.user, /borderColor/);
  assert.doesNotMatch(
    p.user.match(/只允许修改：([^。]+)/)?.[1] ?? "",
    /location|date|time/,
  );
});

test("the real provider adapter sends invitation prompts and accepts a custom palette using a local transport fixture", async () => {
  const fullReply = {
    ...plan,
    blocks: [
      {
        ...blocks[0],
        title: "{{candidate_name}} 的邀请",
        subtitle: "欢迎",
        borderColor: "#12abef",
        backgroundGradient: "linear-gradient(135deg, #176b7d 0%, #0f3d4c 100%)",
        shadow: "lg",
      },
      { ...blocks[1], title: "安排" },
      { ...blocks[2], title: "答复", description: "请确认或婉拒。" },
      { ...blocks[3], text: "{{organization_name}}", align: "center" },
    ],
  };
  const calls = [];
  const providerFactory = (apiKey) => createDeepSeekProvider({
    apiKey,
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body).messages);
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(fullReply) },
          },
        ],
      });
    },
  });
  const response = await handleAiDesignRequest(
    new Request("http://localhost/api/ai/design", {
      method: "POST",
      headers: { Authorization: "Bearer local-fixture-only" },
      body: JSON.stringify({
        target,
        mode: "full",
        requestId: "local-fixture-1234",
        prompt: "请使用 #176b7d 做主色",
      }),
    }),
    { providerFactory },
  );
  const design = JSON.parse(
    (await response.text()).trim().split("\n\n").at(-1).split("\ndata: ")[1],
  ).design;
  assert.equal(design.theme.primaryColor, "#176b7d");
  assert.equal(design.blocks[0].props.borderColor, "#12abef");
  assert.equal(
    design.blocks[0].props.backgroundGradient,
    "linear-gradient(135deg, #176b7d 0%, #0f3d4c 100%)",
  );
  assert.equal(design.blocks[0].props.shadow, "lg");
  assert.equal(calls.length, 1);
  assert.ok(
    calls.every((messages) => messages[0].content.includes("邀请函网页")),
  );
});
