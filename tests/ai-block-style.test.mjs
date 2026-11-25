import test from "node:test";
import assert from "node:assert/strict";
import { aiBlockToDesignBlock, parseAiBlock, parseAiFullDesign, parseAiPatch, parseAiReference } from "../shared/ai/schema.ts";
import { buildFullDesignPrompt } from "../shared/ai/prompt.ts";
import {
  aiBlockInput,
  applyAiBlockFields,
  captureAiBlockRevision,
  previewAiBlockRevision,
} from "../shared/ai/block-revision.ts";
import { boxStyleProperties, resolveBlockStyle, richTextWithBlockStyle } from "../shared/design/block-style.ts";
import { createBlock, createDefaultDocument, updateBlockProps } from "../shared/domain/design.ts";
import { renderDesignEmail } from "../shared/email/design-renderer.ts";

function fixture() {
  const document = createDefaultDocument("email");
  const card = document.blocks.find((block) => block.type === "info_card");
  card.props.variant = "style:accent";
  card.props.body = "请问 {{candidate_name}} 是否参加？";
  card.props.richText = {
    body: {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "请问 " },
          { type: "personalizationField", attrs: { field: "candidate_name" } },
          { type: "text", text: " 是否参加？", marks: [
            { type: "textStyle", attrs: { color: "#448899", fontSize: "18px" } },
            { type: "bold" },
            { type: "link", attrs: { href: "https://example.test/schedule" } },
          ] },
        ],
      }],
    },
  };
  return { document, card };
}

function patchFor(block, fields, theme) {
  return parseAiPatch({ blockId: block.id, blockType: block.type, fields }, {
    blockId: block.id, blockType: block.type, currentProps: aiBlockInput(block, theme),
  });
}

test("a red border patch preserves the preset and all unrequested fields", () => {
  const { document, card } = fixture();
  const patch = patchFor(card, { borderPlacement: "all", borderStyle: "solid", borderColor: "#F00", title: card.props.title }, document.theme);
  assert.deepEqual(patch.fields, { borderColor: "#ff0000", borderStyle: "solid", borderPlacement: "all" });
  const snapshot = captureAiBlockRevision(document, card.id);
  const preview = previewAiBlockRevision(snapshot, patch.fields);
  assert.deepEqual(preview.nextBlock.props, { ...card.props, ...patch.fields });
  assert.deepEqual(preview.document.blocks.filter((block) => block.id !== card.id), document.blocks.filter((block) => block.id !== card.id));
  assert.deepEqual(preview.document.theme, document.theme);
  const previewStyle = boxStyleProperties(resolveBlockStyle("info_card", preview.nextBlock.props, document.theme).box);
  assert.equal(previewStyle.borderWidth, "1px 1px 1px 1px");
  assert.equal(previewStyle.borderStyle, "solid solid solid solid");
  assert.equal(previewStyle.borderColor, "#ff0000 #ff0000 #ff0000 #ff0000");
  const html = renderDesignEmail(preview.document, { candidate_name: "李同学" }).html;
  assert.match(html, /border:1px solid #ff0000/);
  assert.match(html, /color:#448899;font-size:18px/);
  assert.match(html, /href="https:\/\/example.test\/schedule"/);
  assert.match(html, /李同学/);
});

test("strict style values reject CSS, out-of-range numbers, nulls and fields outside scope", () => {
  const { document, card } = fixture();
  for (const fields of [
    { borderColor: "#f00;background:red" }, { backgroundColor: "url(https://example.test)" },
    { borderStyle: "hidden" }, { borderPlacement: "diagonal" }, { borderWidth: "4px" },
    { fontSize: 65 }, { lineHeight: Infinity }, { lineHeight: 1.26 }, { paddingY: -1 },
    { borderRadius: null }, { url: "https://example.test" }, { body: "改变原文 {{candidate_name}}" },
  ]) assert.throws(() => patchFor(card, fields, document.theme));
  const divider = createBlock("divider");
  assert.throws(() => patchFor(divider, { borderWidth: 3 }, document.theme), { code: "scope_violation" });
});

test("empty and unchanged fields are rejected without clearing rich text or a legacy preset", () => {
  const { document, card } = fixture();
  card.props.variant = "accent";
  card.props.borderColor = "#FF0000";
  for (const fields of [{}, { body: card.props.body }, { variant: "style:accent", borderColor: "#f00" }]) {
    assert.throws(() => patchFor(card, fields, document.theme), { code: "empty_patch" });
  }
  const heading = document.blocks.find((block) => block.type === "heading");
  heading.props.variant = "style:accent";
  assert.throws(() => patchFor(heading, { variant: "style:accent" }, document.theme), { code: "empty_patch" });
  heading.props.variant = "style:plain";
  assert.deepEqual(patchFor(heading, { variant: "accent" }, document.theme).fields, { variant: "style:accent" });
  const button = document.blocks.find((block) => block.type === "button");
  assert.notEqual(button.props.align, "right");
  const patch = patchFor(button, { align: "right" }, document.theme);
  assert.deepEqual(patch.fields, { align: "right" });
  assert.equal(applyAiBlockFields(button, patch.fields).props.url, button.props.url);
});

test("full generation retains custom properties and renderer honors them in mobile email", () => {
  const expected = {
    borderPlacement: "bottom", borderStyle: "dashed", borderWidth: 3, borderColor: "#e22",
    backgroundColor: "#f2b5a0", textColor: "#701629", fontSize: 21, lineHeight: 1.3,
    borderRadius: 0, paddingX: 0, paddingY: 10,
  };
  const planBlock = { id: "newcard", type: "info_card", purpose: "面试信息" };
  const payload = parseAiBlock({ id: planBlock.id, type: planBlock.type, title: "安排", body: "正文", variant: "style:tinted", ...expected }, planBlock);
  const generated = aiBlockToDesignBlock(payload);
  for (const [key, value] of Object.entries(expected)) assert.equal(generated.props[key], key === "borderColor" ? "#ee2222" : value);
  const reference = parseAiReference({ themePreset: "crimson", preserveCopy: true, blocks: [{ type: "info_card", borderRadius: 0, borderColor: "#eee" }] });
  assert.deepEqual(Object.fromEntries(Object.entries(reference.blocks[0]).filter(([key]) => key.startsWith("border"))),
    { borderColor: "#eeeeee", borderRadius: 0 });
  const { document } = fixture();
  const heading = document.blocks.find((block) => block.type === "heading");
  heading.props.fontSize = 42;
  heading.props.lineHeight = 2;
  const html = renderDesignEmail({ ...document, blocks: [heading, generated] }, { candidate_name: "李同学" }).html;
  assert.match(html, /cf-heading-1 cf-custom-font-size cf-custom-line-height[^>]*font-size:42px;line-height:2/);
  assert.match(html, /cf-card-table cf-custom-radius[^>]*background:#f2b5a0;border-bottom:3px dashed #ee2222;border-radius:0px/);
  assert.match(html, /<td style="padding:10px 0px">/);
  assert.match(html, /font-size:21px;line-height:1.3[^>]*color:#701629/);
});

test("comparison is tied to the request snapshot even if live state and selection change", () => {
  const { document, card } = fixture();
  const snapshot = captureAiBlockRevision(document, card.id);
  const originalTitle = snapshot.block.props.title;
  const originalThemeColor = snapshot.document.theme.primaryColor;
  document.theme.primaryColor = "#cccccc";
  card.props.title = "请求后的手工编辑";
  document.blocks.reverse();
  const preview = previewAiBlockRevision(snapshot, { borderColor: "#ff0000", textColor: "#b2192e", fontSize: 24 });
  assert.equal(preview.document.theme.primaryColor, originalThemeColor);
  assert.equal(snapshot.block.props.title, originalTitle);
  assert.equal(snapshot.block.props.borderColor, undefined);
  assert.equal(preview.nextBlock.id, card.id);
  assert.equal(preview.nextBlock.props.title, originalTitle);
  assert.equal(preview.nextBlock.props.borderColor, "#ff0000");
  assert.equal(document.blocks.find((block) => block.id === card.id).props.title, "请求后的手工编辑");
  assert.equal(document.blocks.find((block) => block.id === card.id).props.borderColor, undefined);
  const html = renderDesignEmail(preview.document, { candidate_name: "李同学" }).html;
  assert.match(html, /<strong> 是否参加？<\/strong>/);
  assert.match(html, /href="https:\/\/example.test\/schedule"/);
  assert.match(html, /李同学/);
  assert.match(html, /font-size:24px[^>]*color:#b2192e/);
  assert.doesNotMatch(html.split("</head>")[1], /#448899|font-size:18px/);
  assert.equal(snapshot.block.props.richText.body.content[0].content[2].marks[0].attrs.color, "#448899");
});

test("clearing color or size only removes that override and preserves rich text", () => {
  const { document, card } = fixture();
  const originalRichText = structuredClone(card.props.richText);
  const styled = updateBlockProps(document, card.id, {
    textColor: "#ff0000",
    fontSize: 24,
    borderColor: "#00ff00",
    backgroundColor: "#ffffff",
  });
  const styledCard = styled.blocks.find((block) => block.id === card.id);
  assert.equal(styledCard.props.textColor, "#ff0000");
  assert.equal(styledCard.props.fontSize, 24);

  const colorCleared = updateBlockProps(styled, card.id, { textColor: undefined });
  const colorClearedCard = colorCleared.blocks.find((block) => block.id === card.id);
  assert.equal(colorClearedCard.props.textColor, undefined);
  assert.equal(colorClearedCard.props.fontSize, 24);
  assert.equal(colorClearedCard.props.borderColor, "#00ff00");
  assert.equal(colorClearedCard.props.backgroundColor, "#ffffff");
  assert.deepEqual(colorClearedCard.props.richText, originalRichText);

  const bothCleared = updateBlockProps(colorCleared, card.id, { fontSize: undefined });
  const bothClearedCard = bothCleared.blocks.find((block) => block.id === card.id);
  assert.equal(bothClearedCard.props.fontSize, undefined);
  assert.equal(bothClearedCard.props.borderColor, "#00ff00");
  assert.equal(bothClearedCard.props.backgroundColor, "#ffffff");
  assert.deepEqual(bothClearedCard.props.richText, originalRichText);
});

test("block color and size suppression only hides the matching rich-text marks", () => {
  const { document, card } = fixture();
  const original = card.props.richText.body;
  const originalCopy = structuredClone(original);
  const textNode = (doc) => doc.content[0].content[2];

  const colorOnly = richTextWithBlockStyle(original, { textColor: "#112233" });
  const colorMark = textNode(colorOnly).marks.find((mark) => mark.type === "textStyle");
  assert.equal(colorMark.attrs.color, undefined);
  assert.equal(colorMark.attrs.fontSize, "18px");
  assert.ok(textNode(colorOnly).marks.some((mark) => mark.type === "bold"));
  assert.ok(textNode(colorOnly).marks.some((mark) => mark.type === "link"));

  const sizeOnly = richTextWithBlockStyle(original, { fontSize: 24 });
  const sizeMark = textNode(sizeOnly).marks.find((mark) => mark.type === "textStyle");
  assert.equal(sizeMark.attrs.color, "#448899");
  assert.equal(sizeMark.attrs.fontSize, undefined);

  const both = richTextWithBlockStyle(original, { textColor: "#112233", fontSize: 24 });
  assert.equal(textNode(both).marks.some((mark) => mark.type === "textStyle"), false);
  assert.ok(textNode(both).marks.some((mark) => mark.type === "bold"));
  assert.ok(textNode(both).marks.some((mark) => mark.type === "link"));
  assert.deepEqual(original, originalCopy);
});

test("explicit radius creates a box, while an unset module keeps its original structure", () => {
  const document = createDefaultDocument("email");
  for (const type of ["heading", "text", "footer"]) {
    const block = document.blocks.find((item) => item.type === type);
    assert.equal(resolveBlockStyle(type, block.props, document.theme).hasBox, false);

    for (const radius of [0, 12]) {
      const next = updateBlockProps(document, block.id, { borderRadius: radius });
      const nextBlock = next.blocks.find((item) => item.id === block.id);
      assert.equal(resolveBlockStyle(type, nextBlock.props, document.theme).hasBox, true);
      const html = renderDesignEmail(next, {}).html;
      assert.ok(html.includes(`border-radius:${radius}px`));
    }
  }
  const html = renderDesignEmail(document, {}).html;
  assert.equal(/border-radius:0px/iu.test(html), false);
});

test("gradient, shadow, fontWeight and letterSpacing validate strictly and render with email fallbacks", () => {
  const { document, card } = fixture();
  const patch = patchFor(
    card,
    {
      backgroundGradient: "linear-gradient(135deg, #1D5343 0%, #2F7A60 100%)",
      shadow: "md",
      fontWeight: "bold",
      letterSpacing: 1.5,
    },
    document.theme,
  );
  assert.deepEqual(patch.fields, {
    backgroundGradient: "linear-gradient(135deg, #1d5343 0%, #2f7a60 100%)",
    shadow: "md",
    fontWeight: "bold",
    letterSpacing: 1.5,
  });
  const next = updateBlockProps(document, card.id, patch.fields);
  const html = renderDesignEmail(next, { candidate_name: "李同学" }).html;
  assert.match(html, /background:#1d5343;background-image:linear-gradient\(135deg, #1d5343 0%, #2f7a60 100%\)/);
  assert.match(html, /box-shadow:0 12px 28px -8px rgba\(15,23,42,0\.18\)/);
  assert.match(html, /font-weight:700;letter-spacing:1\.5px/);

  for (const unsafe of [
    { backgroundGradient: "url(https://evil.test/x.png)" },
    { backgroundGradient: "linear-gradient(135deg, red, blue)" },
    { backgroundGradient: "linear-gradient(135deg, #fff, #000);color:red" },
    { shadow: "huge" },
    { fontWeight: "900" },
    { letterSpacing: 1.25 },
  ]) {
    assert.throws(() => patchFor(card, unsafe, document.theme));
  }
});

test("borderPlacement y renders top and bottom hairline borders only", () => {
  const { document, card } = fixture();
  const patch = patchFor(
    card,
    { borderPlacement: "y", borderWidth: 1, borderStyle: "solid", borderColor: "#c7b8ae", borderRadius: 0 },
    document.theme,
  );
  const next = updateBlockProps(document, card.id, patch.fields);
  const preview = boxStyleProperties(resolveBlockStyle("info_card", next.blocks.find((b) => b.id === card.id).props, next.theme).box);
  assert.equal(preview.borderWidth, "1px 0px 1px 0px");
  assert.equal(preview.borderStyle, "solid none solid none");
  assert.equal(preview.borderColor, "#c7b8ae transparent #c7b8ae transparent");
  const html = renderDesignEmail(next, { candidate_name: "李同学" }).html;
  assert.match(html, /border-top:1px solid #c7b8ae;border-bottom:1px solid #c7b8ae/);
  assert.equal(/border-left:/iu.test(html), false);
});

test("buildFullDesignPrompt embedded JSON examples satisfy parseAiFullDesign", () => {
  for (const target of ["email", "invite_page"]) {
    const prompt = buildFullDesignPrompt({ target, prompt: "设计一封正式面试邀请" });
    const start = prompt.user.indexOf("{\n");
    const end = prompt.user.indexOf("\n\n硬性约束：", start);
    assert.ok(start > 0 && end > start, `missing JSON example for ${target}`);
    const parsed = parseAiFullDesign(JSON.parse(prompt.user.slice(start, end)), target);
    assert.equal(parsed.plan.target, target);
    assert.ok(parsed.blocks.length >= 4);
  }
});
