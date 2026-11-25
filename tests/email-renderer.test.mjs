import test from "node:test";
import assert from "node:assert/strict";
import { renderEmailTemplate } from "../shared/email/template-renderer.ts";

function document(extraBlocks = []) {
  return {
    schemaVersion: 1,
    settings: {
      width: 600,
      background: "#f4f1ea",
      fontFamily: "Arial",
      textColor: "#182420",
    },
    blocks: [
      {
        id: "heading",
        type: "heading",
        props: { text: "你好，{{candidate_name}}", level: 1 },
      },
      {
        id: "text",
        type: "text",
        props: {
          text: "时间：{{interview_time}}\n地点：{{interview_location}}",
        },
      },
      {
        id: "logo",
        type: "logo",
        props: {
          src: "https://example.test/logo.png",
          alt: "CampusFlow Logo",
          width: 240,
        },
      },
      ...extraBlocks,
      { id: "divider", type: "divider", props: {} },
      { id: "footer", type: "footer", props: { text: "CampusFlow" } },
    ],
  };
}

const context = {
  candidate_name: "<b>张三</b>",
  interview_time: "周六 14:00",
  interview_location: "信息楼 A302",
  rsvp_link: "https://example.test/rsvp?token=opaque",
};

test("structured template renders subject, HTML and plain text", () => {
  const result = renderEmailTemplate(
    {
      subjectTemplate: "【CampusFlow】{{candidate_name}} 面试邀请",
      preheaderText: "{{interview_time}} · {{interview_location}}",
      editorDocument: document([
        {
          id: "button",
          type: "button",
          props: {
            text: "确认参加",
            url: "{{rsvp_link}}",
            backgroundColor: "#1d5343",
          },
        },
      ]),
    },
    context,
  );

  assert.equal(result.subject, "【CampusFlow】<b>张三</b> 面试邀请");
  assert.match(result.html, /&lt;b&gt;张三&lt;\/b&gt;/);
  assert.equal(result.html.includes("<b>张三</b>"), false);
  assert.match(result.html, /href="https:\/\/example\.test\/rsvp\?token=opaque"/);
  assert.match(result.html, /max-width:600px/);
  assert.match(result.text, /周六 14:00/);
  assert.match(result.text, /信息楼 A302/);
  assert.match(result.text, /确认参加: https:\/\/example\.test\/rsvp\?token=opaque/);
  assert.match(result.text, /---/);
  assert.deepEqual(result.missingVariables, []);
});

test("missing variables are removed and reported", () => {
  const result = renderEmailTemplate(
    {
      subjectTemplate: "{{missing_subject}}",
      preheaderText: "",
      editorDocument: document([
        { id: "unknown", type: "text", props: { text: "{{missing_body}}" } },
      ]),
    },
    {},
  );

  assert.equal(result.subject, "");
  assert.equal(result.html.includes("{{"), false);
  assert.ok(result.missingVariables.includes("missing_subject"));
  assert.ok(result.missingVariables.includes("missing_body"));
});

test("unsafe URLs are not rendered as links", () => {
  const result = renderEmailTemplate(
    {
      subjectTemplate: "测试",
      preheaderText: "",
      editorDocument: document([
        {
          id: "unsafe",
          type: "button",
          props: { text: "危险链接", url: "javascript:alert(1)" },
        },
      ]),
    },
    {},
  );

  assert.equal(result.html.includes("javascript:"), false);
  assert.ok(result.warnings.length > 0);
  assert.equal(result.text.includes("javascript:"), false);
});
