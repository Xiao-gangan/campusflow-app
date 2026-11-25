import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultDocument, updateBlockProps } from "../shared/domain/design.ts";
import {
  HISTORY_LIMIT,
  commitHistory,
  createHistoryState,
  createTargetHistory,
  redoHistory,
  undoHistory,
} from "../shared/design/history.ts";

function snapshot(document, selectedBlockId = null) {
  return { document, selectedBlockId };
}

test("edits can be undone and redone with selection restored", () => {
  const base = createDefaultDocument("email");
  const edited = updateBlockProps(base, base.blocks[1].id, { text: "新标题" });
  const history = commitHistory(
    createTargetHistory(),
    snapshot(base, base.blocks[1].id),
    { label: "修改标题", at: 1000 },
  );

  const undone = undoHistory(history, snapshot(edited, base.blocks[1].id), 2000);
  assert.equal(undone.snapshot.document.blocks[1].props.text, base.blocks[1].props.text);
  assert.equal(undone.snapshot.selectedBlockId, base.blocks[1].id);
  assert.equal(undone.label, "修改标题");

  const redone = redoHistory(undone.history, undone.snapshot, 3000);
  assert.equal(redone.snapshot.document.blocks[1].props.text, "新标题");
  assert.equal(redone.history.past.at(-1).label, "修改标题");
  assert.equal(redone.history.future.length, 0);
});

test("typing coalesces within the window and splits after it", () => {
  const base = createDefaultDocument("email");
  const id = base.blocks[1].id;
  let history = createTargetHistory();
  let current = base;

  current = updateBlockProps(current, id, { text: "标" });
  history = commitHistory(history, snapshot(base, id), {
    label: "编辑标题",
    coalesceKey: "rich:heading:text",
    at: 1000,
  });
  const afterFirst = current;

  current = updateBlockProps(current, id, { text: "标题" });
  history = commitHistory(history, snapshot(afterFirst, id), {
    label: "编辑标题",
    coalesceKey: "rich:heading:text",
    at: 1400,
  });
  assert.equal(history.past.length, 1);

  current = updateBlockProps(current, id, { text: "标题二" });
  history = commitHistory(history, snapshot(afterFirst, id), {
    label: "编辑标题",
    coalesceKey: "rich:heading:text",
    at: 2400,
  });
  assert.equal(history.past.length, 2);
});

test("a different operation never coalesces", () => {
  const base = createDefaultDocument("email");
  const id = base.blocks[1].id;
  let history = commitHistory(createTargetHistory(), snapshot(base, id), {
    label: "编辑标题",
    coalesceKey: "rich:heading:text",
    at: 1000,
  });
  const first = updateBlockProps(base, id, { text: "一" });
  history = commitHistory(history, snapshot(first, id), {
    label: "调整对齐",
    coalesceKey: "prop:heading:align",
    at: 1100,
  });
  assert.equal(history.past.length, 2);
});

test("undo then edit clears the redo branch and blocks coalescing", () => {
  const base = createDefaultDocument("email");
  const id = base.blocks[1].id;
  const first = updateBlockProps(base, id, { text: "一" });
  let history = commitHistory(createTargetHistory(), snapshot(base, id), {
    label: "编辑标题",
    coalesceKey: "rich:heading:text",
    at: 1000,
  });
  const undone = undoHistory(history, snapshot(first, id), 2000);
  assert.equal(undone.history.future.length, 1);

  const second = updateBlockProps(base, id, { text: "二" });
  history = commitHistory(undone.history, snap(undone.snapshot), {
    label: "编辑标题",
    coalesceKey: "rich:heading:text",
    at: 2100,
  });
  assert.equal(history.future.length, 0);
  assert.equal(history.past.length, 1);
  assert.equal(history.past[0].document.blocks[1].props.text, base.blocks[1].props.text);
});

test("history is limited to the newest entries", () => {
  const base = createDefaultDocument("email");
  let history = createTargetHistory();
  for (let index = 0; index < HISTORY_LIMIT + 12; index += 1) {
    history = commitHistory(history, snapshot(base, null), {
      label: `操作 ${index}`,
      at: index * 10_000,
    });
  }
  assert.equal(history.past.length, HISTORY_LIMIT);
  assert.equal(history.past.at(-1).label, `操作 ${HISTORY_LIMIT + 11}`);
});

test("undo and redo do nothing when the stack is empty", () => {
  const base = createDefaultDocument("email");
  const history = createTargetHistory();
  const undone = undoHistory(history, snapshot(base), 1000);
  assert.equal(undone.snapshot, null);
  assert.equal(undone.history, history);

  const redone = redoHistory(history, snapshot(base), 1000);
  assert.equal(redone.snapshot, null);
});

function snap(snapshotValue) {
  return snapshotValue ?? snapshot(createDefaultDocument("email"));
}

test("email and invite histories stay independent", () => {
  const email = createDefaultDocument("email");
  const invite = createDefaultDocument("invite_page");
  let state = createHistoryState();
  state = {
    ...state,
    email: commitHistory(state.email, snapshot(email, email.blocks[0].id), {
      label: "编辑邮件",
      at: 1000,
    }),
    invite_page: commitHistory(
      state.invite_page,
      snapshot(invite, invite.blocks[0].id),
      { label: "编辑邀请函", at: 1000 },
    ),
  };
  assert.equal(state.email.past.length, 1);
  assert.equal(state.invite_page.past.length, 1);

  const undoneEmail = undoHistory(
    state.email,
    snapshot(email, email.blocks[0].id),
    2000,
  );
  assert.equal(undoneEmail.history.past.length, 0);
  assert.equal(undoneEmail.history.future.length, 1);
  assert.equal(state.invite_page.past.length, 1);
});

test("undo and redo preserve image references", () => {
  const base = createDefaultDocument("email");
  const imageBlock = base.blocks[0];
  const withAsset = updateBlockProps(base, imageBlock.id, {
    src: "",
    assetId: "asset-123",
  });
  const replaced = updateBlockProps(withAsset, imageBlock.id, {
    src: "",
    assetId: "asset-456",
  });
  const history = commitHistory(
    createTargetHistory(),
    snapshot(withAsset, imageBlock.id),
    { label: "更换图片", at: 1000 },
  );
  const undone = undoHistory(history, snapshot(replaced, imageBlock.id), 2000);
  assert.equal(undone.snapshot.document.blocks[0].props.assetId, "asset-123");
  const redone = redoHistory(undone.history, undone.snapshot, 3000);
  assert.equal(redone.snapshot.document.blocks[0].props.assetId, "asset-456");
});
