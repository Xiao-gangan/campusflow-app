import test from "node:test";
import assert from "node:assert/strict";
import { addBlock, createDefaultDocument, updateBlockProps } from "../shared/domain/design.ts";
import {
  documentReferencesAsset,
  evaluateLocalAssetReadiness,
} from "../src/modules/designer/asset-resolution.ts";
import { renderDesignEmail } from "../shared/email/design-renderer.ts";
import {
  assetReferenceReason,
  buildAssetReferenceMap,
} from "../src/modules/designer/asset-reference.ts";

const uploadAsset = (id, name = id) => ({
  id,
  name,
  url: "",
  kind: "image",
  source: "upload",
  createdAt: "2026-11-16",
});

test("asset readiness distinguishes loading, ready, missing and unrelated failures", () => {
  const assets = [uploadAsset("a"), uploadAsset("b")];
  const loading = evaluateLocalAssetReadiness({
    localIds: ["a", "b"],
    assets,
    status: "loading",
    failureIds: [],
  });
  assert.equal(loading.loading, true);
  assert.equal(loading.ready, false);
  assert.deepEqual(loading.missingIds, []);

  const failed = evaluateLocalAssetReadiness({
    localIds: ["a", "b"],
    assets,
    status: "ready",
    failureIds: ["b"],
    resolvedIds: ["a"],
  });
  assert.equal(failed.loading, false);
  assert.equal(failed.ready, false);
  assert.deepEqual(failed.missingIds, ["b"]);

  const unrelated = evaluateLocalAssetReadiness({
    localIds: ["a"],
    assets: [...assets, uploadAsset("unrelated")],
    status: "ready",
    failureIds: ["unrelated"],
    resolvedIds: ["a"],
  });
  assert.equal(unrelated.ready, true);

  const staleReady = evaluateLocalAssetReadiness({
    localIds: ["a", "new"],
    assets: [...assets, uploadAsset("new")],
    status: "ready",
    failureIds: [],
    resolvedIds: ["a"],
  });
  assert.deepEqual(staleReady.missingIds, ["new"]);
  assert.equal(staleReady.ready, false);

  const resolvedReady = evaluateLocalAssetReadiness({
    localIds: ["a"],
    assets,
    status: "ready",
    failureIds: [],
    resolvedIds: ["a"],
  });
  assert.equal(resolvedReady.ready, true);

  const missingMetadata = evaluateLocalAssetReadiness({
    localIds: ["deleted"],
    assets,
    status: "ready",
    failureIds: [],
  });
  assert.deepEqual(missingMetadata.missingIds, ["deleted"]);
  assert.equal(missingMetadata.ready, false);

  const noImages = evaluateLocalAssetReadiness({
    localIds: [],
    assets: [uploadAsset("unrelated")],
    status: "loading",
    failureIds: [],
  });
  assert.equal(noImages.ready, true);
});

test("documents expose asset references for deletion protection", () => {
  const document = createDefaultDocument("email");
  const logo = updateBlockProps(document, document.blocks[0].id, {
    src: "",
    assetId: "asset-1",
  });
  assert.equal(documentReferencesAsset(logo, "asset-1"), true);
  assert.equal(documentReferencesAsset(logo, "asset-2"), false);

  const withImage = addBlock(logo, "image");
  const image = updateBlockProps(withImage, withImage.blocks.at(-1).id, {
    src: "",
    assetId: "asset-2",
  });
  assert.equal(documentReferencesAsset(image, "asset-2"), true);
});

test("missing local image references are reported as unavailable, not unset", () => {
  const base = createDefaultDocument("email");
  const imageDoc = addBlock(base, "image");
  const imageBlock = imageDoc.blocks.at(-1);
  const document = updateBlockProps(imageDoc, imageBlock.id, {
    src: "",
    assetId: "deleted-asset",
  });
  const result = renderDesignEmail(document, {});
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("引用的本机素材不可用"),
    ),
  );
  assert.equal(
    result.warnings.some((warning) =>
      warning.includes("图片未设置"),
    ),
    false,
  );
});

test("asset reference reasons cover current design and saved templates", () => {
  const assetId = "asset-protected";
  const document = updateBlockProps(createDefaultDocument("email"), "logo", {
    assetId,
  });
  const referenced = addBlock(createDefaultDocument("email"), "image");
  const withRef = updateBlockProps(referenced, referenced.blocks.at(-1).id, {
    assetId,
  });
  const clean = createDefaultDocument("email");

  assert.equal(
    assetReferenceReason({
      assetId,
      documents: [withRef, clean],
      templateDocuments: [],
    }),
    "当前设计",
  );
  assert.equal(
    assetReferenceReason({
      assetId,
      documents: [clean],
      templateDocuments: [withRef],
    }),
    "已保存模板",
  );
  assert.equal(
    assetReferenceReason({
      assetId,
      documents: [clean],
      templateDocuments: [clean],
    }),
    null,
  );
  const referenceMap = buildAssetReferenceMap({
    documents: [clean],
    templateDocuments: [withRef],
  });
  assert.equal(referenceMap.get(assetId), "已保存模板");
  assert.equal(documentReferencesAsset(document, assetId), false);
});
