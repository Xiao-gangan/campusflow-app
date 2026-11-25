import test from "node:test";
import assert from "node:assert/strict";
import {
  addBlock,
  createDefaultDocument,
  updateBlockProps,
  updateTheme,
} from "../shared/domain/design.ts";
import { buildInvitePage } from "../shared/invite/model.ts";

const context = {
  candidate_name: "张三",
  department: "技术部",
  interview_time: "11 月 15 日 14:00",
  interview_location: "信息楼 A302",
  rsvp_link: "https://example.test/invite/token",
  organization_name: "星海大学计算机协会",
  personal_note: "期待与你见面。",
};

function section(model, kind) {
  return model.sections.find((item) => item.kind === kind);
}

test("invite renderer injects candidate data into the template structure", () => {
  const document = createDefaultDocument("invite_page");
  const model = buildInvitePage(document, context);

  assert.deepEqual(
    model.sections.map((item) => item.kind),
    ["logo", "hero", "event_info", "rsvp", "footer"],
  );
  assert.equal(section(model, "logo").src, null);
  assert.equal(section(model, "hero").title, "张三，期待与你见面");
  assert.match(section(model, "hero").subtitle, /技术部/);
  assert.equal(section(model, "event_info").location, "信息楼 A302");
  assert.equal(section(model, "rsvp").confirmLabel, "确认参加");
  assert.match(section(model, "footer").text, /星海大学计算机协会/);
  assert.equal(model.theme.width, 760);
  assert.deepEqual(model.missingVariables, []);
  assert.deepEqual(model.warnings, []);

  assert.throws(
    () => buildInvitePage(createDefaultDocument("email"), context),
    (error) => error.message === "design_target_not_invite_page",
  );
});

test("candidate data changes the render model without mutating the template", () => {
  const document = createDefaultDocument("invite_page");
  const snapshot = structuredClone(document);

  const first = buildInvitePage(document, {
    ...context,
    candidate_name: "第一位候选人",
  });
  const second = buildInvitePage(document, {
    ...context,
    candidate_name: "第二位候选人",
  });

  assert.match(section(first, "hero").title, /第一位候选人/);
  assert.match(section(second, "hero").title, /第二位候选人/);
  assert.notEqual(section(first, "hero").title, section(second, "hero").title);
  assert.deepEqual(document, snapshot);
  assert.match(document.blocks[1].props.title, /\{\{candidate_name\}\}/);
});

test("missing variables and unsafe links are reported and removed", () => {
  let document = createDefaultDocument("invite_page");
  document = updateBlockProps(document, document.blocks[1].id, {
    title: "你好，{{unknown_name}}",
  });
  document = addBlock(document, "button");
  const buttonId = document.blocks[document.blocks.length - 1].id;
  document = updateBlockProps(document, buttonId, {
    text: "打开邀请",
    url: "javascript:alert(1)",
  });

  const model = buildInvitePage(document, context);
  assert.deepEqual(model.missingVariables, ["unknown_name"]);
  assert.equal(section(model, "hero").title, "你好，");
  assert.equal(section(model, "button").url, null);
  assert.ok(model.warnings.some((warning) => warning.includes("链接地址")));
});

test("image links are validated and theme values pass through", () => {
  let document = createDefaultDocument("invite_page");
  document = addBlock(document, "image");
  const imageId = document.blocks[document.blocks.length - 1].id;
  document = updateBlockProps(document, imageId, {
    src: "https://example.test/invite.png",
    alt: "邀请图片",
  });
  document = updateTheme(document, { primaryColor: "#123456" });

  const valid = buildInvitePage(document, context);
  assert.equal(section(valid, "image").src, "https://example.test/invite.png");
  assert.equal(valid.theme.primaryColor, "#123456");
  assert.equal(valid.warnings.length, 0);

  const unsafe = updateBlockProps(document, imageId, {
    src: "javascript:alert(1)",
  });
  const invalid = buildInvitePage(unsafe, context);
  assert.equal(section(invalid, "image").src, null);
  assert.ok(
    invalid.warnings.some((warning) => warning.includes("图片地址")),
  );

  const local = updateBlockProps(document, imageId, {
    src: "data:image/png;base64,AAAA",
  });
  assert.equal(
    section(buildInvitePage(local, context), "image").src,
    "data:image/png;base64,AAAA",
  );
});
