import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultDocument, updateBlockProps } from "../shared/domain/design.ts";
import {
  clearDesignerDraft,
  designerDraftKey,
  readDesignerDraft,
  writeDesignerDraft,
} from "../shared/design/draft.ts";

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

function quotaStorage() {
  return {
    getItem() {
      return null;
    },
    setItem() {
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    },
    removeItem() {},
  };
}

test("drafts are stored per target and restored with save time", () => {
  const storage = createStorage();
  const email = createDefaultDocument("email");
  const invite = createDefaultDocument("invite_page");
  const edited = updateBlockProps(email, email.blocks[1].id, {
    text: "已自动保存的标题",
  });

  const written = writeDesignerDraft(storage, "email", edited);
  assert.equal(written.ok, true);
  assert.equal(writeDesignerDraft(storage, "invite_page", invite).ok, true);

  const emailRead = readDesignerDraft(storage, "email");
  assert.equal(emailRead.status, "ok");
  assert.equal(emailRead.document.blocks[1].props.text, "已自动保存的标题");
  assert.equal(emailRead.savedAt, written.savedAt);

  const inviteRead = readDesignerDraft(storage, "invite_page");
  assert.equal(inviteRead.status, "ok");
  assert.equal(inviteRead.document.target, "invite_page");
});

test("draft serialization keeps documented document fields only", () => {
  const storage = createStorage();
  const document = createDefaultDocument("email");
  const secretField = "api" + "Key";
  document[secretField] = "not-a-real-key-value";
  document.blocks[0].props[secretField] = "not-a-real-nested-value";

  writeDesignerDraft(storage, "email", document);
  const raw = storage.getItem(designerDraftKey("email"));
  assert.equal(raw.includes("not-a-real-key-value"), false);

  const read = readDesignerDraft(storage, "email");
  assert.equal(read.status, "ok");
  assert.equal(secretField in read.document, false);
});

test("corrupt and incompatible drafts are detected cleanly", () => {
  const corruptStorage = createStorage({
    [designerDraftKey("email")]: "{not-json",
  });
  const corrupt = readDesignerDraft(corruptStorage, "email");
  assert.equal(corrupt.status, "corrupt");

  const oldStorage = createStorage({
    [designerDraftKey("email")]: JSON.stringify({
      schemaVersion: 99,
      target: "email",
      savedAt: new Date().toISOString(),
      document: createDefaultDocument("email"),
    }),
  });
  const incompatible = readDesignerDraft(oldStorage, "email");
  assert.equal(incompatible.status, "incompatible");
  assert.match(incompatible.reason, /旧版本/);

  const wrongTargetStorage = createStorage({
    [designerDraftKey("email")]: JSON.stringify({
      schemaVersion: 1,
      target: "email",
      savedAt: new Date().toISOString(),
      document: createDefaultDocument("invite_page"),
    }),
  });
  assert.equal(readDesignerDraft(wrongTargetStorage, "email").status, "corrupt");
});

test("draft clearing removes only the requested target", () => {
  const storage = createStorage();
  writeDesignerDraft(storage, "email", createDefaultDocument("email"));
  writeDesignerDraft(storage, "invite_page", createDefaultDocument("invite_page"));

  assert.equal(clearDesignerDraft(storage, "email"), true);
  assert.equal(readDesignerDraft(storage, "email").status, "empty");
  assert.equal(readDesignerDraft(storage, "invite_page").status, "ok");
});

test("storage failures are classified and never throw", () => {
  const wrote = writeDesignerDraft(
    quotaStorage(),
    "email",
    createDefaultDocument("email"),
  );
  assert.equal(wrote.ok, false);
  assert.equal(wrote.reason, "quota");
  assert.match(wrote.message, /空间不足/);

  const unavailable = readDesignerDraft(
    {
      getItem() {
        const error = new Error("blocked");
        error.name = "SecurityError";
        throw error;
      },
      setItem() {},
    },
    "email",
  );
  assert.equal(unavailable.status, "unavailable");
});
