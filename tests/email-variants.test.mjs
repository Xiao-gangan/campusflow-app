import test from "node:test";
import assert from "node:assert/strict";
import { renderEmailTemplate } from "../shared/email/template-renderer.ts";

const settings = {
  width: 600,
  background: "#f4f1ea",
  fontFamily: "Arial",
  textColor: "#182420",
  primaryColor: "#123456",
  accentColor: "#abcdef",
  surfaceColor: "#fafafa",
  mutedTextColor: "#888888",
  borderColor: "#fedcba",
  buttonColor: "#111111",
  buttonTextColor: "#222222",
  radius: 20,
  spacing: 12,
};

function render(blocks, context = { organization_name: "CampusFlow" }) {
  return renderEmailTemplate(
    {
      subjectTemplate: "面试邀请",
      preheaderText: "",
      editorDocument: {
        schemaVersion: 1,
        settings,
        blocks: blocks.map((block, index) => ({ id: `b${index}`, ...block })),
      },
    },
    context,
  );
}

test("email HTML uses theme colors, radius and spacing", () => {
  const result = render([
    { type: "heading", props: { text: "标题", level: 1, align: "center" } },
    { type: "button", props: { text: "确认", url: "https://example.test/rsvp", align: "center" } },
  ]);
  assert.match(result.html, /background:#fafafa/);
  assert.match(result.html, /border:1px solid #fedcba/);
  assert.match(result.html, /border-radius:20px/);
  assert.match(result.html, /height:12px/);
  assert.match(result.html, /background:#111111/);
  assert.match(result.html, /color:#222222/);
  assert.match(result.html, /@media only screen and \(max-width:480px\)/);
  assert.match(result.html, /cf-heading-1/);
  assert.match(result.html, /cf-button-block/);
});

test("button alignment is explicit and variants stay email-safe", () => {
  const center = render([
    {
      type: "button",
      props: { text: "确认", url: "https://example.test/rsvp", align: "center" },
    },
  ]);
  assert.match(center.html, /<div class="cf-button" style="text-align:center">/);
  assert.match(center.html, /padding:12px 24px/);

  const outline = render([
    {
      type: "button",
      props: {
        text: "了解详情",
        url: "https://example.test/info",
        align: "left",
        variant: "outline",
      },
    },
  ]);
  assert.match(outline.html, /text-align:left/);
  assert.match(outline.html, /background:transparent/);
  assert.match(outline.html, /border:1px solid #111111/);

  const link = render([
    {
      type: "button",
      props: { text: "打开网页", url: "https://example.test", variant: "link" },
    },
  ]);
  assert.match(link.html, /text-decoration:underline/);
});

test("heading, text, card and divider variants render distinct styles", () => {
  const result = render([
    {
      type: "heading",
      props: { text: "色块标题", level: 1, variant: "band" },
    },
    {
      type: "heading",
      props: { text: "强调标题", level: 2, variant: "accent", align: "center" },
    },
    {
      type: "text",
      props: { text: "侧边强调", variant: "style:sidebar" },
    },
    {
      type: "text",
      props: { text: "引用", variant: "quote" },
    },
    {
      type: "info_card",
      props: { title: "卡片", body: "内容", variant: "accent" },
    },
    { type: "divider", props: { variant: "dashed", spacing: 20 } },
    { type: "divider", props: { variant: "short" } },
    { type: "divider", props: { variant: "accent" } },
  ]);
  assert.match(result.html, /background:#abcdef/);
  assert.match(result.html, /width:48px;height:4px/);
  assert.match(result.html, /border-left:4px solid #123456/);
  assert.match(result.html, /font-style:italic/);
  assert.match(result.html, /border-left:4px solid #123456/);
  assert.match(result.html, /border-top:1px dashed #fedcba/);
  assert.match(result.html, /display:inline-block;width:56px;height:2px/);
  assert.match(result.html, /border-top:3px solid #123456/);
});

test("missing logo uses a wordmark and never exposes placeholder text", () => {
  const result = render([
    { type: "logo", props: { src: "", alt: "CampusFlow Logo", align: "center" } },
  ]);
  assert.match(result.html, />CampusFlow</);
  assert.equal(result.html.includes("CampusFlow Logo"), false);
  assert.ok(result.warnings.some((warning) => warning.includes("文字品牌名")));
});

test("missing images are omitted instead of showing alt placeholders", () => {
  const result = render([
    { type: "image", props: { src: "", alt: "示例图片" } },
  ]);
  assert.equal(result.html.includes("示例图片"), false);
  assert.ok(result.warnings.some((warning) => warning.includes("已从邮件中省略")));
});
