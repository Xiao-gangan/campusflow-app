import test from "node:test";
import assert from "node:assert/strict";
import {
  collectFieldKeys,
  docToLegacyText,
  legacyTextToDoc,
} from "../shared/design/legacy-text.ts";

test("legacy template strings round-trip without changing fixed text", () => {
  const legacy =
    "你好，{{candidate_name}} 同学，期待在 {{interview_time}} 与你见面。\n面试地点：{{interview_location}}。";
  const doc = legacyTextToDoc(legacy);

  assert.equal(doc.content.length, 2);
  assert.deepEqual(collectFieldKeys(doc), [
    "candidate_name",
    "interview_time",
    "interview_location",
  ]);
  assert.equal(docToLegacyText(doc), legacy);
});

test("empty lines, unknown fields and plain text are preserved", () => {
  const legacy = "第一行\n\n你好 {{unknown_field}} 同学";
  const doc = legacyTextToDoc(legacy);

  assert.equal(doc.content.length, 3);
  assert.equal(doc.content[1].content, undefined);
  assert.deepEqual(collectFieldKeys(doc), ["unknown_field"]);
  assert.equal(docToLegacyText(doc), legacy);
});

test("label resolvers are stored on converted field nodes", () => {
  const doc = legacyTextToDoc("你好 {{candidate_name}}", (key) =>
    key === "candidate_name" ? "收件人姓名" : undefined,
  );
  const field = doc.content[0].content?.find(
    (node) => node.type === "personalizationField",
  );
  assert.deepEqual(field?.attrs, {
    field: "candidate_name",
    label: "收件人姓名",
  });
});

test("rich-text marks do not affect the plain text projection", () => {
  const legacy = "你好，{{candidate_name}}";
  const doc = legacyTextToDoc(legacy);
  const first = doc.content[0].content?.[0];
  if (first?.type === "text") {
    first.marks = [{ type: "bold" }];
  }

  assert.equal(docToLegacyText(doc), legacy);
});
