import test from "node:test";
import assert from "node:assert/strict";
import { createDesignLibrary } from "../src/modules/designer/local-library.ts";
import { createDefaultDocument, updateBlockProps } from "../shared/domain/design.ts";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("templates can be saved, listed by target, updated and deleted", () => {
  const storage = createStorage();
  const library = createDesignLibrary(storage);
  const email = createDefaultDocument("email");
  const invite = createDefaultDocument("invite_page");

  const savedEmail = library.saveTemplate({ name: "面试邀请", document: email });
  const savedInvite = library.saveTemplate({ name: "欢迎页", document: invite });

  assert.equal(library.listTemplates("email").length, 1);
  assert.equal(library.listTemplates("invite_page").length, 1);
  assert.equal(library.listTemplates("email")[0].name, "面试邀请");
  assert.equal(library.listTemplates("email")[0].document.blocks.length, email.blocks.length);

  const edited = updateBlockProps(email, email.blocks[1].id, { text: "更新后的标题" });
  library.saveTemplate({
    id: savedEmail.id,
    name: "面试邀请更新",
    document: edited,
  });
  const loaded = library.listTemplates("email")[0];
  assert.equal(loaded.name, "面试邀请更新");
  assert.equal(loaded.document.blocks[1].props.text, "更新后的标题");

  library.deleteTemplate(savedInvite.id);
  assert.equal(library.listTemplates("invite_page").length, 0);
  assert.equal(createDesignLibrary(storage).listTemplates("email").length, 1);
});

test("assets are stored as URL references and can be deleted", () => {
  const storage = createStorage();
  const library = createDesignLibrary(storage);

  const logo = library.saveAsset({
    name: "社团 Logo",
    url: "https://example.test/logo.png",
    kind: "logo",
  });
  library.saveAsset({
    name: "活动背景",
    url: "https://example.test/background.jpg",
    kind: "background",
  });

  assert.equal(library.listAssets().length, 2);
  assert.equal(createDesignLibrary(storage).listAssets()[0].name, "活动背景");
  assert.equal(logo.url, "https://example.test/logo.png");

  library.deleteAsset(logo.id);
  assert.equal(library.listAssets().length, 1);
  assert.equal(library.listAssets()[0].kind, "background");
});

test("uploaded asset metadata keeps source and dimensions", () => {
  const storage = createStorage();
  const library = createDesignLibrary(storage);

  const uploaded = library.saveAsset({
    name: "本地图片",
    url: "",
    kind: "image",
    source: "upload",
    mimeType: "image/png",
    size: 1234,
    width: 120,
    height: 60,
  });

  assert.equal(uploaded.source, "upload");
  assert.equal(uploaded.url, "");
  assert.equal(uploaded.size, 1234);
  assert.equal(uploaded.width, 120);
  assert.equal(createDesignLibrary(storage).listAssets()[0].height, 60);
});

test("templates keep manual and AI origins separate and support rename/duplicate", () => {
  const storage = createStorage();
  const library = createDesignLibrary(storage);
  const email = createDefaultDocument("email");
  const manual = library.saveTemplate({ name: "手动模板", document: email });
  const ai = library.saveTemplate({
    name: "AI 模板",
    document: email,
    origin: "ai",
  });
  assert.equal(library.listTemplates("email", "manual").length, 1);
  assert.equal(library.listTemplates("email", "manual")[0].id, manual.id);
  assert.equal(library.listTemplates("email", "ai").length, 1);
  assert.equal(library.listTemplates("email", "ai")[0].id, ai.id);

  const renamed = library.renameTemplate(ai.id, "重新命名");
  assert.equal(renamed.name, "重新命名");
  const copy = library.duplicateTemplate(ai.id);
  assert.ok(copy);
  assert.notEqual(copy.id, ai.id);
  assert.equal(copy.origin, "ai");
  assert.equal(library.listTemplates("email", "ai").length, 2);
});
