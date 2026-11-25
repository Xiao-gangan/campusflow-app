import type { DesignDocument } from "../contracts/design.ts";

export const INVITE_PREVIEW_DRAFT_KEY = "campusflow.invite.preview.v1";

export type PreviewStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

function isDesignDocument(value: unknown): value is DesignDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DesignDocument>;
  return (
    candidate.schemaVersion === 1 &&
    candidate.target === "invite_page" &&
    Boolean(candidate.theme) &&
    typeof candidate.theme === "object" &&
    Array.isArray(candidate.blocks) &&
    candidate.blocks.every(
      (block) =>
        Boolean(block) &&
        typeof block === "object" &&
        typeof block.id === "string" &&
        typeof block.type === "string" &&
        Boolean(block.props) &&
        typeof block.props === "object",
    )
  );
}

export function writeInvitePreviewDraft(
  storage: PreviewStorage,
  document: DesignDocument,
): boolean {
  if (document.target !== "invite_page") return false;
  try {
    storage.setItem(
      INVITE_PREVIEW_DRAFT_KEY,
      JSON.stringify({ savedAt: new Date().toISOString(), document }),
    );
    return true;
  } catch {
    return false;
  }
}

export function readInvitePreviewDraft(
  storage: PreviewStorage,
): DesignDocument | null {
  try {
    const raw = storage.getItem(INVITE_PREVIEW_DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const document = (parsed as { document?: unknown }).document;
    return isDesignDocument(document) ? document : null;
  } catch {
    return null;
  }
}

export function clearInvitePreviewDraft(storage: PreviewStorage): void {
  try {
    storage.removeItem?.(INVITE_PREVIEW_DRAFT_KEY);
  } catch {
    // Preview storage is optional; a blocked storage area should not break the page.
  }
}
