import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultDocument } from "../shared/domain/design.ts";
import {
  INVITE_PREVIEW_DRAFT_KEY,
  clearInvitePreviewDraft,
  readInvitePreviewDraft,
  writeInvitePreviewDraft,
} from "../shared/invite/preview-draft.ts";

function createStorage() {
  const values = new Map();
  return {
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

test("invite preview drafts round-trip template structure only", () => {
  const storage = createStorage();
  const document = createDefaultDocument("invite_page");

  assert.equal(writeInvitePreviewDraft(storage, document), true);
  const stored = storage.getItem(INVITE_PREVIEW_DRAFT_KEY);
  assert.match(stored, /\{\{candidate_name\}\}/);
  assert.equal(stored.includes("林知夏"), false);

  const loaded = readInvitePreviewDraft(storage);
  assert.equal(loaded.target, "invite_page");
  assert.deepEqual(
    loaded.blocks.map((block) => block.type),
    document.blocks.map((block) => block.type),
  );

  clearInvitePreviewDraft(storage);
  assert.equal(readInvitePreviewDraft(storage), null);
});

test("email documents and malformed drafts are rejected", () => {
  const emailStorage = createStorage();
  assert.equal(
    writeInvitePreviewDraft(emailStorage, createDefaultDocument("email")),
    false,
  );
  assert.equal(readInvitePreviewDraft(emailStorage), null);

  const malformed = createStorage();
  malformed.setItem(INVITE_PREVIEW_DRAFT_KEY, "{not-json");
  assert.equal(readInvitePreviewDraft(malformed), null);

  malformed.setItem(
    INVITE_PREVIEW_DRAFT_KEY,
    JSON.stringify({ document: { ...createDefaultDocument("email") } }),
  );
  assert.equal(readInvitePreviewDraft(malformed), null);
});

test("storage failures degrade to a missing preview draft", () => {
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };

  assert.equal(
    writeInvitePreviewDraft(broken, createDefaultDocument("invite_page")),
    false,
  );
  assert.equal(readInvitePreviewDraft(broken), null);
  assert.doesNotThrow(() => clearInvitePreviewDraft(broken));
});
