import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultDocument, updateMeta } from "../shared/domain/design.ts";
import { renderDesignEmail } from "../shared/email/design-renderer.ts";

const context = {
  candidate_name: "张三",
  interview_time: "11 月 15 日 14:00",
  interview_location: "信息楼 A302",
  rsvp_link: "https://example.test/invite/token",
  organization_name: "CampusFlow",
};

test("email design renders subject, info card, HTML and plain text", () => {
  const document = createDefaultDocument("email");
  const result = renderDesignEmail(document, context);

  assert.match(result.subject, /张三/);
  assert.match(result.preheader, /11 月 15 日/);
  assert.match(result.html, /面试安排/);
  assert.match(result.html, /信息楼 A302/);
  assert.match(result.html, /https:\/\/example\.test\/invite\/token/);
  assert.match(result.text, /张三/);
  assert.match(result.text, /面试安排/);
  assert.equal(result.missingVariables.length, 0);
  assert.ok(result.warnings.some((warning) => warning.includes("Logo")));
  assert.match(result.html, /CampusFlow/);
  assert.equal(result.html.includes("Logo 未设置"), false);
});

test("email design reports missing variables and rejects invite documents", () => {
  const document = {
    ...createDefaultDocument("email"),
    meta: { subjectTemplate: "{{missing_subject}}", preheaderText: "" },
  };
  const result = renderDesignEmail(document, {});
  assert.equal(result.subject, "");
  assert.ok(result.missingVariables.includes("missing_subject"));

  assert.throws(
    () => renderDesignEmail(createDefaultDocument("invite_page"), {}),
    (error) => error.message === "design_target_not_email",
  );
});

test("email design metadata can be updated without mutating the source", () => {
  const document = createDefaultDocument("email");
  const updated = updateMeta(document, {
    subjectTemplate: "自定义主题 {{candidate_name}}",
  });
  assert.match(updated.meta.subjectTemplate, /自定义主题/);
  assert.notEqual(updated.meta.subjectTemplate, document.meta.subjectTemplate);
});

test("export HTML excludes editor chrome and resolves legal variables", () => {
  const document = createDefaultDocument("email");
  const result = renderDesignEmail(document, {
    ...context,
    department: "技术部",
    onboarding_link: "https://example.test/onboarding/token",
    personal_note: "期待见面",
  });
  assert.equal(result.missingVariables.length, 0);
  for (const label of [
    "拖动排序",
    "双击直接修改",
    "实时预览",
    "画布工具条",
    "插入个性化信息",
  ]) {
    assert.equal(result.html.includes(label), false, label);
  }
  assert.equal(result.html.includes("{{"), false);
});
