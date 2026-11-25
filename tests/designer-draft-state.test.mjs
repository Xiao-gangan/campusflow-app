import test from "node:test";
import assert from "node:assert/strict";
import { addBlock, createDefaultDocument } from "../shared/domain/design.ts";
import {
  designerDraftKey,
  writeDesignerDraft,
} from "../shared/design/draft.ts";
import { loadInitialDesignerState } from "../src/modules/designer/draft-state.ts";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function seedDraft(storage, target, blockCount) {
  let document = createDefaultDocument(target);
  while (document.blocks.length < blockCount) {
    document = addBlock(document, target === "email" ? "text" : "spacer");
  }
  writeDesignerDraft(storage, target, document);
  return document;
}

test("initial state restores valid drafts per target and records save timestamps", () => {
  const storage = createStorage();
  const restored = seedDraft(storage, "email", 7);

  const state = loadInitialDesignerState(storage);
  assert.equal(state.storage, storage);
  assert.equal(state.documents.email.blocks.length, 7);
  assert.equal(
    state.documents.email.blocks[1].props.text,
    restored.blocks[1].props.text,
  );
  assert.equal(typeof state.savedAtByTarget.email, "string");
  assert.equal(state.savedAtByTarget.invite_page, null);
  assert.ok(state.notices.some((notice) => notice.kind === "restored" && notice.target === "email"));
});

test("corrupt draft resets to default without affecting the other target", () => {
  const storage = createStorage({
    [designerDraftKey("email")]: "{broken",
  });
  seedDraft(storage, "invite_page", 7);

  const state = loadInitialDesignerState(storage);
  assert.equal(state.documents.email.blocks.length, 6);
  assert.equal(storage.getItem(designerDraftKey("email")), null);
  assert.ok(state.notices.some((notice) => notice.kind === "reset" && notice.target === "email"));

  assert.equal(state.documents.invite_page.blocks.length, 7);
  assert.ok(state.notices.some((notice) => notice.kind === "restored" && notice.target === "invite_page"));
});

test("unavailable storage falls back to defaults cleanly", () => {
  const nullState = loadInitialDesignerState(null);
  assert.equal(nullState.storage, null);
  assert.equal(nullState.documents.email.blocks.length, 6);
  assert.ok(nullState.notices.some((notice) => notice.kind === "unavailable"));

  const blockedState = loadInitialDesignerState({
    getItem() {
      const error = new Error("blocked");
      error.name = "SecurityError";
      throw error;
    },
    setItem() {},
  });
  assert.equal(blockedState.storage, null);
  assert.ok(blockedState.notices.some((notice) => notice.kind === "unavailable"));
});
