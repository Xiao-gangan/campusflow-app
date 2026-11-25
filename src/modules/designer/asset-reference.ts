import type { DesignDocument } from "../../../shared/contracts/design.ts";
import { localAssetIdsInDocument } from "./asset-resolution.ts";

export function assetReferenceReason(input: {
  assetId: string;
  documents: DesignDocument[];
  templateDocuments: DesignDocument[];
}): string | null {
  if (
    input.documents.some((document) =>
      localAssetIdsInDocument(document).includes(input.assetId),
    )
  ) {
    return "当前设计";
  }
  if (
    input.templateDocuments.some((document) =>
      localAssetIdsInDocument(document).includes(input.assetId),
    )
  ) {
    return "已保存模板";
  }
  return null;
}

export function buildAssetReferenceMap(input: {
  documents: DesignDocument[];
  templateDocuments: DesignDocument[];
}): Map<string, string> {
  const map = new Map<string, string>();
  for (const document of input.templateDocuments) {
    for (const id of localAssetIdsInDocument(document)) {
      if (!map.has(id)) map.set(id, "已保存模板");
    }
  }
  for (const document of input.documents) {
    for (const id of localAssetIdsInDocument(document)) {
      map.set(id, "当前设计");
    }
  }
  return map;
}
