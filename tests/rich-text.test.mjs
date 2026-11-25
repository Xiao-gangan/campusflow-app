import test from "node:test";
import assert from "node:assert/strict";
import {
  richTextToPlainText,
  sanitizeRichTextDoc,
} from "../shared/design/rich-text.ts";
import { renderDesignEmail } from "../shared/email/design-renderer.ts";
import { createDefaultDocument, updateBlockProps } from "../shared/domain/design.ts";
import { buildInvitePage } from "../shared/invite/model.ts";

const allowed = new Map([["candidate_name", "收件人姓名"]]);

function richDoc() {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { textAlign: "center" },
        content: [
          {
            type: "text",
            text: "你好 ",
            marks: [{ type: "bold" }],
          },
          {
            type: "personalizationField",
            attrs: { field: "candidate_name" },
            marks: [
              {
                type: "textStyle",
                attrs: { color: "#1d5343", fontSize: "18px" },
              },
            ],
          },
          {
            type: "text",
            text: " 危险链接",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
          {
            type: "text",
            text: " 安全链接",
            marks: [
              { type: "link", attrs: { href: "https://example.test/invite" } },
            ],
          },
          {
            type: "text",
            text: " 无效颜色",
            marks: [
              { type: "textStyle", attrs: { color: "red", fontSize: "99px" } },
            ],
          },
        ],
      },
    ],
  };
}

test("rich text sanitizer keeps supported marks and canonical fields", () => {
  const sanitized = sanitizeRichTextDoc(richDoc(), allowed);
  assert.ok(sanitized);
  const paragraph = sanitized.content[0];
  assert.equal(paragraph.attrs.textAlign, "center");
  const nodes = paragraph.content ?? [];
  assert.equal(nodes[0].marks?.[0].type, "bold");
  assert.equal(nodes[1].type, "personalizationField");
  assert.equal(nodes[1].attrs.field, "candidate_name");
  assert.equal(nodes[1].attrs.label, "收件人姓名");
  assert.equal(
    nodes[2].marks,
    undefined,
    "javascript links must be removed",
  );
  assert.equal(nodes[3].marks?.[0].type, "link");
  assert.equal(nodes[4].marks, undefined, "invalid color/font size must be removed");
});

test("unknown fields are not converted into editable variables", () => {
  const document = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "personalizationField",
            attrs: { field: "internal_secret" },
          },
        ],
      },
    ],
  };
  const sanitized = sanitizeRichTextDoc(document, allowed);
  assert.equal(sanitized.content[0].content[0].type, "text");
  assert.equal(sanitized.content[0].content[0].text, "未识别字段");
});

test("equivalent TipTap paragraphs normalize to the same content", () => {
  const withDefaultAttrs = sanitizeRichTextDoc({
    type: "doc",
    content: [{
      type: "paragraph",
      attrs: { textAlign: null },
      content: [{ type: "text", text: "同一段文字" }],
    }],
  });
  const withoutAttrs = sanitizeRichTextDoc({
    type: "doc",
    content: [{
      type: "paragraph",
      content: [{ type: "text", text: "同一段文字" }],
    }],
  });
  assert.deepEqual(withDefaultAttrs, withoutAttrs);
});

test("rich text produces consistent email HTML and plain text", () => {
  const document = createDefaultDocument("email");
  const textBlock = document.blocks.find((block) => block.type === "text");
  const rich = sanitizeRichTextDoc(richDoc(), allowed);
  const withRich = updateBlockProps(document, textBlock.id, {
    text: "你好 {{candidate_name}} 危险链接 安全链接 无效颜色",
    richText: { text: rich },
  });
  const result = renderDesignEmail(withRich, {
    candidate_name: "张三",
    organization_name: "CampusFlow",
  });

  assert.match(result.html, /<strong>你好 <\/strong>/);
  assert.match(result.html, /font-size:18px/);
  assert.match(result.html, /张三/);
  assert.match(result.html, /https:\/\/example\.test\/invite/);
  assert.equal(result.html.includes("javascript:"), false);
  assert.match(result.text, /你好 张三/);
  assert.match(result.text, /安全链接/);
});

test("email data image URLs are opt-in for local preview", () => {
  const document = createDefaultDocument("email");
  const image = document.blocks.find((block) => block.type === "logo");
  const withImage = updateBlockProps(document, image.id, {
    src: "data:image/png;base64,AAAA",
    alt: "本地 Logo",
  });

  const blocked = renderDesignEmail(withImage, {});
  assert.equal(blocked.html.includes("data:image/png"), false);

  const preview = renderDesignEmail(withImage, {}, { allowDataImageUrls: true });
  assert.equal(preview.html.includes("data:image/png"), true);
});

test("invite model carries sanitized rich text into the page model", () => {
  const document = createDefaultDocument("invite_page");
  const hero = document.blocks.find((block) => block.type === "hero");
  const rich = sanitizeRichTextDoc(richDoc(), new Map([["candidate_name", "受邀人姓名"]]));
  const withRich = updateBlockProps(document, hero.id, {
    title: "你好 {{candidate_name}}",
    richText: { title: rich },
  });

  const model = buildInvitePage(withRich, { candidate_name: "林知夏" });
  const heroSection = model.sections.find((section) => section.kind === "hero");
  assert.ok(heroSection?.richText?.title);
  assert.equal(heroSection.richText.title.content[0].attrs.textAlign, "center");
});

test("plain text projection tracks missing rich-text variables", () => {
  const sanitized = sanitizeRichTextDoc(richDoc(), allowed);
  const missing = new Set();
  const text = richTextToPlainText(sanitized, {}, missing);
  assert.equal(text.includes("你好"), true);
  assert.equal(text.includes("危险链接"), true);
  assert.ok(missing.has("candidate_name"));
});

test("saved rich text retains target-specific field labels", () => {
  const doc = richDoc();
  doc.content[0].content[1].attrs.label = "收件人姓名";
  const sanitized = sanitizeRichTextDoc(doc);
  assert.equal(
    sanitized.content[0].content[1].attrs.label,
    "收件人姓名",
  );
});

test("plain text emits a link URL only once per linked run", () => {
  const sanitized = sanitizeRichTextDoc(richDoc(), allowed);
  const missing = new Set();
  const text = richTextToPlainText(
    sanitized,
    { candidate_name: "张三" },
    missing,
  );
  assert.equal(
    text.match(/https:\/\/example\.test\/invite/gu)?.length,
    1,
  );
});
