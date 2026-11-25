import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_PROMPT_VERSION,
  buildBlockPrompt,
  buildPatchPrompt,
  buildPlanPrompt,
} from "../shared/ai/prompt.ts";
import { parseAiPatch } from "../shared/ai/schema.ts";
import { STYLE_RECIPES } from "../shared/design/style-recipes.ts";

const plan = {
  version: 1,
  themePreset: "crimson",
  fontFamily: "sans",
  radius: 16,
  spacing: 16,
  subject: "面试邀请",
  preheader: "安排",
  tone: "正式",
  blocks: [
    { id: "b1", type: "heading", purpose: "标题" },
    { id: "b2", type: "text", purpose: "正文" },
  ],
};

test("system prompts are versioned and contain the controlled capabilities", () => {
  const prompt = buildPlanPrompt({ prompt: "正式面试邀请" });
  assert.equal(prompt.version, AI_PROMPT_VERSION);
  assert.match(prompt.system, /只能输出严格 JSON/);
  assert.match(prompt.system, /不能使用图片模块/);
  assert.match(prompt.system, /candidate_name/);
  assert.match(prompt.system, /interview/);
  for (const recipe of STYLE_RECIPES) {
    assert.ok(prompt.system.includes(recipe.id), `prompt lists ${recipe.id}`);
  }
  assert.equal(prompt.system.includes("林知夏"), false);
});

test("block and patch prompts keep the scope explicit", () => {
  const block = buildBlockPrompt(plan, plan.blocks[0], [], "把标题背景设为棕色");
  assert.match(block.user, /只生成模块 b1/);
  assert.match(block.user, /style:band/);
  assert.match(block.user, /variant/);
  assert.match(block.user, /把标题背景设为棕色/);
  assert.match(block.user, /backgroundColor/);
  const patch = buildPatchPrompt({
    blockId: "b1",
    blockType: "button",
    currentProps: { text: "确认", variant: "style:solid" },
    instruction: "更正式",
  });
  assert.match(patch.user, /只优化当前组件/);
  assert.match(patch.user, /不能修改链接\/用途/);
  assert.match(patch.user, /必须保留/);
});

test("patch prompt contains a parseable, whitelist-compatible JSON example", () => {
  const patch = buildPatchPrompt({
    blockId: "b-info",
    blockType: "info_card",
    currentProps: {
      title: "面试安排",
      body: "时间：11 月 15 日 14:00",
      variant: "style:plain",
    },
    instruction: "能改的好看一点吗 现在有点太土了",
  });
  const marker = "格式示例（只参考结构，不要照抄文案）：\n";
  const example = patch.user.slice(patch.user.indexOf(marker) + marker.length);
  const parsed = JSON.parse(example);
  assert.equal(parsed.blockId, "b-info");
  assert.equal(parsed.blockType, "info_card");
  assert.deepEqual(
    parseAiPatch(parsed, { blockId: "b-info", blockType: "info_card", currentProps: { variant: "style:plain" } }).fields,
    { borderColor: "#ff0000" },
  );
  assert.match(patch.user, /省略任何字段表示保持原值/);
  assert.equal(patch.user.includes("..."), false);
  assert.match(patch.user, /json/i);
  assert.match(patch.user, /面试安排/);
  assert.match(patch.user, /{{key}}/);
});
