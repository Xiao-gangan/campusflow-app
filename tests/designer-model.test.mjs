import test from "node:test";
import assert from "node:assert/strict";
import {
  DESIGN_MODULES,
  defaultTheme,
  moduleDefinition,
  modulesForTarget,
} from "../shared/design/modules.ts";
import {
  addBlock,
  createDefaultDocument,
  duplicateBlock,
  moveBlock,
  removeBlock,
  reorderBlock,
  updateBlockProps,
  updateMeta,
  updateTheme,
} from "../shared/domain/design.ts";

test("design modules have unique types and target filtering", () => {
  const types = DESIGN_MODULES.map((module) => module.type);
  assert.equal(new Set(types).size, types.length);

  const emailTypes = modulesForTarget("email").map((module) => module.type);
  const inviteTypes = modulesForTarget("invite_page").map((module) => module.type);
  assert.equal(emailTypes.includes("rsvp"), false);
  assert.equal(emailTypes.includes("hero"), false);
  assert.equal(inviteTypes.includes("rsvp"), true);
  assert.equal(inviteTypes.includes("event_info"), true);
  assert.equal(moduleDefinition("heading").targets.includes("email"), true);
});

test("default documents contain target-appropriate modules", () => {
  const email = createDefaultDocument("email");
  const invite = createDefaultDocument("invite_page");

  assert.equal(email.target, "email");
  assert.deepEqual(
    email.blocks.map((block) => block.type),
    ["logo", "heading", "text", "info_card", "button", "footer"],
  );
  assert.equal(invite.target, "invite_page");
  assert.deepEqual(
    invite.blocks.map((block) => block.type),
    ["logo", "hero", "event_info", "rsvp", "footer"],
  );
  assert.equal(new Set(email.blocks.map((block) => block.id)).size, email.blocks.length);
  assert.deepEqual(defaultTheme("email").fontFamily, defaultTheme("invite_page").fontFamily);
});

test("block operations are immutable and target-aware", () => {
  const email = createDefaultDocument("email");
  const added = addBlock(email, "text", 1);
  assert.equal(added.blocks.length, email.blocks.length + 1);
  assert.equal(added.blocks[1].type, "text");
  assert.equal(email.blocks.length, 6);

  const unsupported = addBlock(email, "rsvp");
  assert.equal(unsupported, email);

  const selected = added.blocks[0];
  const updated = updateBlockProps(added, selected.id, {
    text: "新的标题",
    level: 2,
  });
  assert.equal(updated.blocks[0].props.text, "新的标题");
  assert.equal(updated.blocks[0].props.level, 2);
  assert.notEqual(updated.blocks[0].props.text, selected.props.text);

  const moved = moveBlock(updated, updated.blocks[0].id, 1);
  assert.equal(moved.blocks[1].id, selected.id);
  const removed = removeBlock(moved, selected.id);
  assert.equal(removed.blocks.some((block) => block.id === selected.id), false);
  assert.equal(moved.blocks.some((block) => block.id === selected.id), true);

  const themed = updateTheme(updated, { primaryColor: "#000000" });
  assert.equal(themed.theme.primaryColor, "#000000");
  assert.equal(updated.theme.primaryColor, "#1d5343");
});

test("blocks can be reordered before or after another block", () => {
  const document = createDefaultDocument("email");
  const ids = document.blocks.map((block) => block.id);

  const before = reorderBlock(document, ids[0], ids[2], "before");
  assert.deepEqual(
    before.blocks.map((block) => block.id),
    [ids[1], ids[0], ids[2], ids[3], ids[4], ids[5]],
  );

  const after = reorderBlock(document, ids[0], ids[2], "after");
  assert.deepEqual(
    after.blocks.map((block) => block.id),
    [ids[1], ids[2], ids[0], ids[3], ids[4], ids[5]],
  );

  assert.equal(reorderBlock(document, ids[1], ids[1], "before"), document);
  assert.equal(reorderBlock(document, "missing", ids[1], "before"), document);
});

test("duplicating a block creates a unique deep copy right after the source", () => {
  const document = createDefaultDocument("email");
  const source = updateBlockProps(document, document.blocks[2].id, {
    text: "原始正文",
    assetId: "asset-1",
    richText: { text: { type: "doc", content: [] } },
  });
  const { document: next, block } = duplicateBlock(source, source.blocks[2].id);

  assert.equal(next.blocks.length, source.blocks.length + 1);
  assert.equal(next.blocks[3].id, block.id);
  assert.notEqual(block.id, source.blocks[2].id);
  assert.equal(block.props.text, "原始正文");
  assert.equal(block.props.assetId, "asset-1");

  block.props.text = "修改副本";
  assert.equal(next.blocks[3].props.text, "修改副本");
  assert.equal(next.blocks[2].props.text, "原始正文");

  const missing = duplicateBlock(source, "missing");
  assert.equal(missing.document, source);
  assert.equal(missing.block, null);
});

test("duplicating an invite block preserves image references and isolates props", () => {
  const document = createDefaultDocument("invite_page");
  const source = updateBlockProps(document, document.blocks[0].id, {
    alt: "社团 Logo",
    assetId: "invite-asset-1",
  });
  const { document: next, block } = duplicateBlock(source, source.blocks[0].id);

  assert.equal(next.blocks.length, source.blocks.length + 1);
  assert.equal(next.blocks[1].id, block.id);
  assert.notEqual(block.id, source.blocks[0].id);
  assert.equal(block.props.assetId, "invite-asset-1");
  block.props.alt = "副本 Logo";
  assert.equal(next.blocks[1].props.alt, "副本 Logo");
  assert.equal(next.blocks[0].props.alt, "社团 Logo");
});

test("no-op property, theme, meta and equivalent reorder keep the same document", () => {
  const document = createDefaultDocument("email");
  const blockId = document.blocks[1].id;
  const variant = document.blocks[1].props.variant;

  assert.equal(
    updateBlockProps(document, blockId, { variant }),
    document,
  );
  assert.equal(
    updateBlockProps(document, blockId, {
      text: document.blocks[1].props.text,
    }),
    document,
  );
  assert.equal(
    updateTheme(document, { primaryColor: document.theme.primaryColor }),
    document,
  );
  assert.equal(
    updateMeta(document, {
      subjectTemplate: document.meta.subjectTemplate,
    }),
    document,
  );

  const ids = document.blocks.map((block) => block.id);
  assert.equal(reorderBlock(document, ids[1], ids[2], "before"), document);
  assert.equal(reorderBlock(document, ids[1], ids[0], "after"), document);
});
