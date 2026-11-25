import type { DesignDocument, DesignTarget } from "../../../shared/contracts/design.ts";
import { createDefaultDocument } from "../../../shared/domain/design.ts";
import {
  clearDesignerDraft,
  readDesignerDraft,
  type DraftStorage,
} from "../../../shared/design/draft.ts";

export type DraftNotice =
  | {
      kind: "restored";
      target: DesignTarget;
      savedAt: string;
    }
  | {
      kind: "reset";
      target: DesignTarget;
      reason: string;
    }
  | { kind: "unavailable"; reason: string };

export type InitialDesignerState = {
  storage: DraftStorage | null;
  documents: Record<DesignTarget, DesignDocument>;
  notices: DraftNotice[];
  savedAtByTarget: Partial<Record<DesignTarget, string | null>>;
};

export type DraftSaveState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "saving" }
  | { status: "saved"; savedAt: string }
  | { status: "error"; message: string }
  | { status: "unavailable"; message: string };

const STORAGE_UNAVAILABLE_REASON =
  "浏览器不允许访问本地存储。你仍可编辑和导出，但刷新或离开页面后内容不会保留。";

export function resolveDraftStorage(
  storageOverride?: DraftStorage | null,
): DraftStorage | null {
  if (storageOverride !== undefined) return storageOverride;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadInitialDesignerState(
  storageOverride?: DraftStorage | null,
): InitialDesignerState {
  const storage = resolveDraftStorage(storageOverride);
  const notices: DraftNotice[] = [];
  const savedAtByTarget: Partial<Record<DesignTarget, string | null>> = {
    email: null,
    invite_page: null,
  };
  const documents: Record<DesignTarget, DesignDocument> = {
    email: createDefaultDocument("email"),
    invite_page: createDefaultDocument("invite_page"),
  };

  if (!storage) {
    notices.push({
      kind: "unavailable",
      reason: STORAGE_UNAVAILABLE_REASON,
    });
    return {
      storage: null,
      documents,
      notices,
      savedAtByTarget,
    };
  }

  let storageUnavailable = false;
  for (const target of ["email", "invite_page"] as const) {
    const result = readDesignerDraft(storage, target);
    if (result.status === "ok") {
      documents[target] = result.document;
      savedAtByTarget[target] = result.savedAt;
      notices.push({ kind: "restored", target, savedAt: result.savedAt });
      continue;
    }
    if (result.status === "corrupt" || result.status === "incompatible") {
      clearDesignerDraft(storage, target);
      notices.push({ kind: "reset", target, reason: result.reason });
      continue;
    }
    if (result.status === "unavailable") {
      storageUnavailable = true;
      notices.push({ kind: "unavailable", reason: result.reason });
      break;
    }
  }

  return {
    storage: storageUnavailable ? null : storage,
    documents,
    notices,
    savedAtByTarget,
  };
}
