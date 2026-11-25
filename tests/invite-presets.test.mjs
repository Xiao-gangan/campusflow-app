import test from "node:test";
import assert from "node:assert/strict";
import {
  INVITE_PRESETS,
  createInvitePresetDocument,
  invitePresetById,
} from "../shared/invite/presets.ts";
import { buildInvitePage } from "../shared/invite/model.ts";

const context = {
  candidate_name: "张三",
  department: "技术部",
  interview_location: "信息楼 A302",
  organization_name: "星海大学计算机协会",
};

test("two invite presets expose distinct, complete page structures", () => {
  assert.equal(INVITE_PRESETS.length, 2);
  assert.deepEqual(
    INVITE_PRESETS.map((preset) => preset.id),
    ["formal", "playful"],
  );

  for (const preset of INVITE_PRESETS) {
    const document = createInvitePresetDocument(preset.id);
    const types = document.blocks.map((block) => block.type);
    assert.equal(document.target, "invite_page");
    assert.equal(document.blocks.length, 5);
    assert.equal(types[0], "logo");
    assert.ok(types.includes("hero"));
    assert.ok(types.includes("event_info"));
    assert.ok(types.includes("rsvp"));
    assert.ok(types.includes("footer"));
    assert.equal(new Set(document.blocks.map((block) => block.id)).size, 5);
    assert.equal(document.theme.width, preset.id === "formal" ? 760 : 800);
    assert.equal(document.theme.primaryColor, preset.palette[0]);

    const model = buildInvitePage(document, context);
    assert.deepEqual(model.missingVariables, []);
    assert.deepEqual(model.warnings, []);
    const hero = model.sections.find((section) => section.kind === "hero");
    assert.match(hero.title, /张三/);
    const footer = model.sections.find((section) => section.kind === "footer");
    assert.match(footer.text, /星海大学计算机协会/);
  }
});

test("preset documents are independent and use fresh block ids", () => {
  const first = createInvitePresetDocument("formal");
  const second = createInvitePresetDocument("formal");

  assert.notEqual(first.blocks[0].id, second.blocks[0].id);
  first.theme.primaryColor = "#000000";
  first.blocks[1].props.title = "被修改的标题";

  assert.notEqual(INVITE_PRESETS[0].theme.primaryColor, "#000000");
  assert.notEqual(second.theme.primaryColor, "#000000");
  assert.notEqual(second.blocks[1].props.title, "被修改的标题");
});

test("preset lookup rejects unknown ids", () => {
  assert.equal(invitePresetById("formal")?.name, "正式简约");
  assert.equal(invitePresetById("playful")?.name, "轻快现代");
  assert.equal(invitePresetById("missing"), undefined);
  assert.throws(
    () => createInvitePresetDocument("missing"),
    (error) => error.message === "invite_preset_not_found",
  );
});
