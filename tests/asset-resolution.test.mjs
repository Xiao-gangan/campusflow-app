import test from "node:test";
import assert from "node:assert/strict";
import { addBlock, createDefaultDocument, updateBlockProps } from "../shared/domain/design.ts";
import {
  documentUsesUploadedAssets,
  localAssetIdsInDocument,
  resolveDocumentAssetUrls,
} from "../src/modules/designer/asset-resolution.ts";

test("asset references resolve without modifying the stored document", () => {
  let document = createDefaultDocument("email");
  document = addBlock(document, "image");
  const image = document.blocks[document.blocks.length - 1];
  document = updateBlockProps(document, image.id, {
    src: "",
    assetId: "upload-1",
  });

  const unresolved = resolveDocumentAssetUrls(document, {});
  const resolved = resolveDocumentAssetUrls(document, {
    "upload-1": "blob:http://127.0.0.1/preview",
  });

  assert.equal(localAssetIdsInDocument(document)[0], "upload-1");
  assert.equal(
    document.blocks[document.blocks.length - 1].props.src,
    "",
    "source document remains untouched",
  );
  assert.equal(
    unresolved.blocks[document.blocks.length - 1].props.src,
    "",
    "missing local blobs render as empty",
  );
  assert.equal(
    resolved.blocks[document.blocks.length - 1].props.src,
    "blob:http://127.0.0.1/preview",
  );
});

test("uploaded assets are distinguishable from URL assets", () => {
  const document = createDefaultDocument("email");
  const assets = [
    {
      id: "upload-1",
      name: "本机图片",
      url: "",
      kind: "image",
      createdAt: "2026-11-06T00:00:00.000Z",
      source: "upload",
    },
    {
      id: "url-1",
      name: "公网图片",
      url: "https://example.test/image.png",
      kind: "image",
      createdAt: "2026-11-06T00:00:00.000Z",
    },
  ];

  assert.equal(documentUsesUploadedAssets(document, assets), false);
  const withUpload = updateBlockProps(document, document.blocks[0].id, {
    assetId: "upload-1",
  });
  assert.equal(documentUsesUploadedAssets(withUpload, assets), true);
});
