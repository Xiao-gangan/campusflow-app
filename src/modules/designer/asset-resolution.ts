import type { DesignAsset, DesignDocument } from "@/shared/contracts/design";

export function assetSource(asset: DesignAsset): "url" | "upload" {
  return asset.source === "upload" ? "upload" : "url";
}

export function resolveDocumentAssetUrls(
  document: DesignDocument,
  urls: Record<string, string>,
): DesignDocument {
  let changed = false;
  const blocks = document.blocks.map((block) => {
    if (block.type !== "image" && block.type !== "logo") return block;
    const assetId = block.props.assetId;
    if (typeof assetId !== "string" || !assetId) return block;
    changed = true;
    return {
      ...block,
      props: {
        ...block.props,
        src: urls[assetId] ?? "",
      },
    };
  });
  return changed ? { ...document, blocks } : document;
}

export function localAssetIdsInDocument(document: DesignDocument): string[] {
  const ids = new Set<string>();
  for (const block of document.blocks) {
    if (block.type !== "image" && block.type !== "logo") continue;
    const assetId = block.props.assetId;
    if (typeof assetId === "string" && assetId) ids.add(assetId);
  }
  return [...ids];
}

export function documentUsesUploadedAssets(
  document: DesignDocument,
  assets: DesignAsset[],
): boolean {
  const uploaded = new Set(
    assets.filter((asset) => assetSource(asset) === "upload").map((asset) => asset.id),
  );
  return localAssetIdsInDocument(document).some((id) => uploaded.has(id));
}

export function documentReferencesAsset(
  document: DesignDocument,
  assetId: string,
): boolean {
  return localAssetIdsInDocument(document).includes(assetId);
}

export type LocalAssetReadiness = {
  localUploadIds: string[];
  missingMetadataIds: string[];
  missingIds: string[];
  loading: boolean;
  ready: boolean;
};

export function evaluateLocalAssetReadiness(input: {
  localIds: string[];
  assets: DesignAsset[];
  status: "idle" | "loading" | "ready";
  failureIds: string[];
  resolvedIds?: string[];
}): LocalAssetReadiness {
  const localUploadIds = input.localIds.filter((id) => {
    const asset = input.assets.find((item) => item.id === id);
    return !asset || assetSource(asset) === "upload";
  });
  const missingMetadataIds = input.localIds.filter(
    (id) => !input.assets.some((asset) => asset.id === id),
  );
  const localIdSet = new Set(input.localIds);
  const resolved = new Set(input.resolvedIds ?? []);
  const unresolvedIds =
    input.status === "ready"
      ? localUploadIds.filter(
          (id) => !resolved.has(id) && !input.failureIds.includes(id),
        )
      : [];
  const missingIds = [
    ...new Set([
      ...missingMetadataIds,
      ...input.failureIds.filter((id) => localIdSet.has(id)),
      ...unresolvedIds,
    ]),
  ];
  const loading =
    localUploadIds.length > 0 &&
    (input.status === "idle" || input.status === "loading");
  return {
    localUploadIds,
    missingMetadataIds,
    missingIds,
    loading,
    ready: !loading && missingIds.length === 0,
  };
}
