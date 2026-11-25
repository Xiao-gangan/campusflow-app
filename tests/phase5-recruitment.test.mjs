import assert from "node:assert/strict";
import test from "node:test";
import { importCandidates } from "../dev/recruitment/api.ts";
import { openRsvpStore } from "../dev/rsvp/store.ts";
import { candidateCsvTemplate, candidateCsvTemplateName } from "../shared/recruitment/candidate-csv.ts";
import { blankRound, formPreset, parseRoundInput } from "../shared/recruitment/round-config.ts";

test("downloadable UTF-8 CSV includes BOM and two directly importable candidates", () => {
  assert.equal(candidateCsvTemplateName, "招新名单导入模板.csv");
  assert.deepEqual([...Buffer.from(candidateCsvTemplate).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const [heading, ...rows] = candidateCsvTemplate.slice(1).trimEnd().split("\r\n");
  assert.equal(heading, "姓名,邮箱,部门,阶段,面试日期,开始时间,结束时间,地点,备注");
  assert.equal(rows.length, 2);
  const store = openRsvpStore(":memory:");
  try {
    const preview = importCandidates(store, { csv: candidateCsvTemplate, commit: false });
    assert.deepEqual([preview.validCount, preview.errorCount, preview.duplicateCount], [2, 0, 0]);
    const imported = importCandidates(store, { csv: candidateCsvTemplate, commit: true });
    assert.equal(imported.skipped.length, 0);
    assert.deepEqual(imported.created.map(({ name, stage, location }) => [name, stage, location]), [
      ["苏晓", "new", "信息楼 A305"], ["何川", "screening", "信息楼 A306"],
    ]);
  } finally { store.close(); }
});

test("complete campus résumé preset has eighteen independent, generic and valid questions", () => {
  let number = 0;
  const questions = formPreset("complete", () => "q-" + ++number);
  assert.equal(questions.length, 18);
  assert.equal(new Set(questions.map(({ id }) => id)).size, 18);
  assert.doesNotMatch(JSON.stringify(questions), /校友会|校友活动|深圳大学/u);
  const department = questions.find(({ title }) => title === "意向部门");
  assert.deepEqual(department.options, ["技术部", "设计部", "运营部", "宣传部", "外联部", "组织部"]);
  assert.equal(department.type, "select");
  assert.equal(questions.filter(({ title }) => title.includes("AI")).length, 2);
  const full = parseRoundInput({ ...blankRound(), name: "校园通用", formConfig: { enabled: true, questions } });
  assert.deepEqual(full.formConfig.questions, questions);
  assert.equal(formPreset("general", () => "q-" + ++number).length, 3);
  assert.equal(formPreset("portfolio", () => "q-" + ++number).length, 4);
});
