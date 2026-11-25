import type {
  DesignBlock,
  DesignDocument,
  DesignTarget,
  DesignTheme,
} from "../contracts/design.ts";

export const DESIGNER_DRAFT_SCHEMA_VERSION = 1;
export const DESIGNER_DRAFT_KEY_PREFIX = "campusflow.designer.draft.v1";

export type DraftStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

export type DraftReadResult =
  | { status: "empty" }
  | {
      status: "ok";
      document: DesignDocument;
      savedAt: string;
    }
  | {
      status: "corrupt" | "incompatible";
      reason: string;
    }
  | { status: "unavailable"; reason: string };

export type DraftWriteResult =
  | { ok: true; savedAt: string }
  | { ok: false; reason: "quota" | "unavailable" | "unknown"; message: string };

export function designerDraftKey(target: DesignTarget): string {
  return `${DESIGNER_DRAFT_KEY_PREFIX}.${target}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTheme(value: unknown): value is DesignTheme {
  if (!isRecord(value)) return false;
  return (
    typeof value.primaryColor === "string" &&
    typeof value.accentColor === "string" &&
    typeof value.backgroundColor === "string" &&
    typeof value.surfaceColor === "string" &&
    typeof value.textColor === "string" &&
    typeof value.mutedTextColor === "string" &&
    typeof value.fontFamily === "string" &&
    typeof value.width === "number" &&
    typeof value.radius === "number" &&
    typeof value.spacing === "number"
  );
}

function isBlock(value: unknown): value is DesignBlock {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.type === "string" &&
    isRecord(value.props)
  );
}

function isCustomHtml(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (typeof value.html !== "string") return false;
  if (value.fontFamily !== undefined && typeof value.fontFamily !== "string") return false;
  if (
    value.source !== undefined &&
    value.source !== "starter" &&
    value.source !== "ai" &&
    value.source !== "import"
  ) {
    return false;
  }
  return true;
}

export function isDesignDocument(
  value: unknown,
  target: DesignTarget,
): value is DesignDocument {
  if (!isRecord(value)) return false;
  const validMode =
    value.mode === undefined || value.mode === "blocks" || value.mode === "html";
  return (
    value.schemaVersion === DESIGNER_DRAFT_SCHEMA_VERSION &&
    value.target === target &&
    validMode &&
    isCustomHtml(value.customHtml) &&
    isRecord(value.meta) &&
    isTheme(value.theme) &&
    Array.isArray(value.blocks) &&
    value.blocks.every(isBlock)
  );
}

function toStorableDocument(document: DesignDocument): DesignDocument {
  return {
    schemaVersion: DESIGNER_DRAFT_SCHEMA_VERSION,
    target: document.target,
    ...(document.mode === "html" ? { mode: "html" as const } : {}),
    ...(document.customHtml && typeof document.customHtml.html === "string"
      ? {
          customHtml: {
            html: document.customHtml.html,
            ...(typeof document.customHtml.fontFamily === "string"
              ? { fontFamily: document.customHtml.fontFamily }
              : {}),
            ...(document.customHtml.source
              ? { source: document.customHtml.source }
              : {}),
          },
        }
      : {}),
    meta: {
      subjectTemplate:
        typeof document.meta.subjectTemplate === "string"
          ? document.meta.subjectTemplate
          : undefined,
      preheaderText:
        typeof document.meta.preheaderText === "string"
          ? document.meta.preheaderText
          : undefined,
    },
    theme: { ...document.theme },
    blocks: document.blocks.map((block) => ({
      id: block.id,
      type: block.type,
      props: structuredClone(block.props),
    })),
  };
}

function storageErrorName(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" ? name : "";
}

export function classifyDraftStorageError(
  error: unknown,
): "quota" | "unavailable" | "unknown" {
  const name = storageErrorName(error);
  if (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    name === "QUOTA_EXCEEDED_ERR"
  ) {
    return "quota";
  }
  if (name === "SecurityError" || name === "NotAllowedError") {
    return "unavailable";
  }
  return "unknown";
}

export function readDesignerDraft(
  storage: DraftStorage,
  target: DesignTarget,
): DraftReadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(designerDraftKey(target));
  } catch {
    return {
      status: "unavailable",
      reason: "浏览器不允许访问本地存储，自动草稿暂时无法保存或恢复。",
    };
  }
  if (!raw) return { status: "empty" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: "corrupt",
      reason: "上次保存的自动草稿已损坏，已为你重置为默认模板。",
    };
  }
  if (!isRecord(parsed)) {
    return {
      status: "corrupt",
      reason: "上次保存的自动草稿格式异常，已为你重置为默认模板。",
    };
  }
  const recordVersion = parsed.schemaVersion;
  const document = parsed.document;
  if (
    recordVersion !== DESIGNER_DRAFT_SCHEMA_VERSION ||
    (isRecord(document) &&
      document.schemaVersion !== DESIGNER_DRAFT_SCHEMA_VERSION)
  ) {
    return {
      status: "incompatible",
      reason: "上次保存的自动草稿来自旧版本，已为你重置为默认模板。",
    };
  }
  if (!isDesignDocument(document, target)) {
    return {
      status: "corrupt",
      reason: "上次保存的自动草稿内容不完整，已为你重置为默认模板。",
    };
  }
  const savedAt =
    typeof parsed.savedAt === "string"
      ? parsed.savedAt
      : new Date().toISOString();
  return {
    status: "ok",
    document: toStorableDocument(document),
    savedAt,
  };
}

export function writeDesignerDraft(
  storage: DraftStorage,
  target: DesignTarget,
  document: DesignDocument,
): DraftWriteResult {
  const savedAt = new Date().toISOString();
  try {
    storage.setItem(
      designerDraftKey(target),
      JSON.stringify({
        schemaVersion: DESIGNER_DRAFT_SCHEMA_VERSION,
        target,
        savedAt,
        document: toStorableDocument({ ...document, target }),
      }),
    );
    return { ok: true, savedAt };
  } catch (error) {
    const reason = classifyDraftStorageError(error);
    return {
      ok: false,
      reason,
      message:
        reason === "quota"
          ? "保存失败：浏览器本地存储空间不足。内容仍保留在当前页面，请先导出或清理本机素材。"
          : reason === "unavailable"
            ? "保存失败：浏览器不允许使用本地存储。内容仍保留在当前页面，关闭页面后会丢失。"
            : "保存失败：无法写入浏览器本地存储。内容仍保留在当前页面。",
    };
  }
}

export function clearDesignerDraft(
  storage: DraftStorage,
  target: DesignTarget,
): boolean {
  try {
    storage.removeItem?.(designerDraftKey(target));
    return true;
  } catch {
    return false;
  }
}
