import test from "node:test";
import assert from "node:assert/strict";
import {
  personalizationDefaultLabel,
  personalizationGroups,
  personalizationLabel,
  personalizationLinkFields,
} from "../shared/design/personalization.ts";

test("personalization menu labels are user-facing and target-aware", () => {
  assert.equal(personalizationLabel("candidate_name", "email"), "收件人姓名");
  assert.equal(
    personalizationLabel("candidate_name", "invite_page"),
    "受邀人姓名",
  );
  assert.equal(personalizationLabel("candidate_email", "email"), "收件人邮箱");
  assert.equal(personalizationLabel("unknown_field", "email"), undefined);
  assert.equal(personalizationDefaultLabel("candidate_name"), "姓名");
});

test("menu groups follow the expected order and never expose internal keys", () => {
  const groups = personalizationGroups("email");
  assert.deepEqual(
    groups.map((group) => group.category),
    ["姓名与部门", "面试安排", "组织信息", "专属链接"],
  );

  const labels = groups.flatMap((group) =>
    group.fields.map((field) => field.label),
  );
  assert.ok(labels.includes("收件人姓名"));
  assert.ok(labels.includes("面试时间"));
  assert.ok(labels.includes("组织名称"));
  assert.ok(labels.includes("出席确认链接"));
  assert.equal(labels.some((label) => label.includes("{{")), false);
  assert.equal(labels.some((label) => label.includes("_")), false);
});

test("link fields and target filtering stay consistent", () => {
  assert.deepEqual(
    personalizationLinkFields("email").map((field) => field.key),
    ["rsvp_link", "onboarding_link"],
  );
  assert.deepEqual(
    personalizationLinkFields("invite_page").map((field) => field.key),
    ["rsvp_link"],
  );

  const inviteKeys = personalizationGroups("invite_page").flatMap((group) =>
    group.fields.map((field) => field.key),
  );
  assert.equal(inviteKeys.includes("onboarding_link"), false);
  assert.equal(inviteKeys.includes("candidate_name"), true);
});
