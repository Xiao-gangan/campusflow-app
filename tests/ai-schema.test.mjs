import test from "node:test";
import assert from "node:assert/strict";
import {
  AiValidationError,
  buildAiDocument,
  buildAiTheme,
  parseAiBlock,
  parseAiPatch,
  parseAiPlan,
  supportsAiBlockType,
} from "../shared/ai/schema.ts";
import { renderDesignEmail } from "../shared/email/design-renderer.ts";

const plan = {
  themePreset: "crimson",
  fontFamily: "sans",
  radius: 18,
  spacing: 16,
  subject: "【{{organization_name}}】{{candidate_name}} 面试邀请",
  preheader: "{{interview_time}} · {{interview_location}}",
  tone: "正式",
  blocks: [
    { id: "b1", type: "logo", purpose: "品牌" },
    { id: "b2", type: "heading", purpose: "标题" },
    { id: "b3", type: "text", purpose: "正文" },
    { id: "b4", type: "info_card", purpose: "安排" },
    { id: "b5", type: "button", purpose: "确认" },
    { id: "b6", type: "footer", purpose: "页脚" },
  ],
};

const block = {
  id: "b2",
  type: "heading",
  text: "诚邀 {{candidate_name}} 参加面试",
  level: 1,
  align: "center",
  variant: "style:band",
};

test("valid AI plan and blocks become an existing DesignDocument", () => {
  const parsedPlan = parseAiPlan(plan);
  const theme = buildAiTheme(parsedPlan);
  assert.equal(theme.primaryColor, "#8f2d2d");
  assert.equal(theme.spacing, 16);

  const parsedBlock = parseAiBlock(block, parsedPlan.blocks[1]);
  assert.equal(parsedBlock.variant, "style:band");
  const doc = buildAiDocument(parsedPlan, [
    {
      id: "b2",
      type: "heading",
      props: {
        text: parsedBlock.text,
        level: 1,
        align: "center",
        variant: parsedBlock.variant,
      },
    },
    { id: "b3", type: "text", props: { text: "正文", variant: "style:plain" } },
    { id: "b4", type: "info_card", props: { title: "安排", body: "时间", variant: "style:plain" } },
    { id: "b5", type: "button", props: { text: "确认", url: "{{rsvp_link}}", variant: "style:solid" } },
    { id: "b6", type: "footer", props: { text: "署名", variant: "style:plain" } },
    { id: "b1", type: "logo", props: { alt: "组织", src: "", variant: "style:plain" } },
  ]);
  const rendered = renderDesignEmail(doc, {
    candidate_name: "张三",
    organization_name: "CampusFlow",
    interview_time: "11 月 15 日",
    interview_location: "信息楼",
  });
  assert.match(rendered.html, /张三/);
  assert.match(rendered.html, /background:#e8b4a6|background:#8f2d2d/);
  assert.equal(rendered.html.includes("<script"), false);
});

test("unsafe modules, links, variables and markup are rejected", () => {
  assert.throws(
    () =>
      parseAiPlan({
        ...plan,
        blocks: [
          ...plan.blocks.slice(0, 5),
          { id: "b9", type: "script", purpose: "x" },
        ],
      }),
    (error) => error instanceof AiValidationError,
  );
  assert.throws(
    () =>
      parseAiPlan({
        ...plan,
        subject: "{{real_candidate_email}} 邀请",
      }),
    /未注册的个性化字段/,
  );
  assert.throws(
    () =>
      parseAiBlock(
        {
          id: "b2",
          type: "heading",
          text: "<script>alert(1)</script>",
          level: 1,
          variant: "style:plain",
        },
        plan.blocks[1],
      ),
    /不安全内容/,
  );
  assert.throws(
    () =>
      parseAiBlock(
        {
          id: "b5",
          type: "button",
          text: "危险",
          purpose: "custom",
          url: "javascript:alert(1)",
          variant: "style:solid",
        },
        plan.blocks[4],
      ),
    /http/,
  );
  assert.throws(
    () =>
      parseAiBlock(
        { ...block, variant: "style:not-real" },
        plan.blocks[1],
      ),
    /不支持的样式/,
  );
});

test("block patch is limited to the selected block and preserves variables", () => {
  const currentProps = {
    text: "诚邀 {{candidate_name}} 参加面试",
    align: "left",
    variant: "style:plain",
  };
  const patch = parseAiPatch(
    {
      blockId: "b2",
      blockType: "heading",
      fields: {
        text: "诚挚邀请 {{candidate_name}} 参加 {{department}} 面试",
        variant: "style:band",
      },
    },
    { blockId: "b2", blockType: "heading", currentProps },
  );
  assert.deepEqual(patch.changedFields, ["样式", "文字"]);
  assert.throws(
    () =>
      parseAiPatch(
        {
          blockId: "b2",
          blockType: "heading",
          fields: { url: "https://evil.test" },
        },
        { blockId: "b2", blockType: "heading", currentProps },
      ),
    /不允许修改字段/,
  );
  assert.throws(
    () =>
      parseAiPatch(
        {
          blockId: "b2",
          blockType: "heading",
          fields: { text: "诚邀你参加面试" },
        },
        { blockId: "b2", blockType: "heading", currentProps },
      ),
    /不能删除已有的个性化字段/,
  );
  assert.throws(
    () =>
      parseAiPatch(
        {
          blockId: "b3",
          blockType: "heading",
          fields: { text: "越权" },
        },
        { blockId: "b2", blockType: "heading", currentProps },
      ),
    /范围超出/,
  );
});

test("AI component support excludes image modules", () => {
  assert.equal(supportsAiBlockType("heading"), true);
  assert.equal(supportsAiBlockType("info_card"), true);
  assert.equal(supportsAiBlockType("logo"), true);
  assert.equal(supportsAiBlockType("image"), false);
  assert.equal(supportsAiBlockType("unknown"), false);
});
