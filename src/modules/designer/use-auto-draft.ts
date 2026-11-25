import { useCallback, useEffect, useRef, useState } from "react";
import type { DesignDocument, DesignTarget } from "@/shared/contracts/design";
import { writeDesignerDraft, type DraftStorage } from "@/shared/design/draft";
import type { DraftSaveState } from "./draft-state";

export type { DraftSaveState } from "./draft-state";

type UseAutoDraftOptions = {
  target: DesignTarget;
  document: DesignDocument;
  storage: DraftStorage | null;
  initialDocuments: Record<DesignTarget, DesignDocument>;
  initialSavedAt?: Partial<Record<DesignTarget, string | null>>;
  delayMs?: number;
};

const STORAGE_UNAVAILABLE =
  "浏览器不允许使用本地存储，自动草稿、模板和本机素材不会保留。";

export function useAutoDraft({
  target,
  document,
  storage,
  initialDocuments,
  initialSavedAt,
  delayMs = 700,
}: UseAutoDraftOptions) {
  const [state, setState] = useState<DraftSaveState>(() => {
    if (!storage) {
      return { status: "unavailable", message: STORAGE_UNAVAILABLE };
    }
    const savedAt = initialSavedAt?.[target];
    return savedAt ? { status: "saved", savedAt } : { status: "idle" };
  });

  const latestRef = useRef({ target, document });
  latestRef.current = { target, document };
  const lastRef = useRef({ target, document });
  const savedJsonRef = useRef<Record<DesignTarget, string | null>>({
    email: JSON.stringify(initialDocuments.email),
    invite_page: JSON.stringify(initialDocuments.invite_page),
  });
  const savedAtRef = useRef<Partial<Record<DesignTarget, string>>>({
    email: initialSavedAt?.email ?? undefined,
    invite_page: initialSavedAt?.invite_page ?? undefined,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDocument = useCallback(
    (
      saveTarget: DesignTarget,
      saveTargetDocument: DesignDocument,
      showSaving = true,
      force = false,
    ) => {
      const isActive = saveTarget === latestRef.current.target;
      if (!storage) {
        if (isActive) {
          setState({ status: "unavailable", message: STORAGE_UNAVAILABLE });
        }
        return false;
      }
      const json = JSON.stringify(saveTargetDocument);
      if (!force && savedJsonRef.current[saveTarget] === json) return true;

      if (isActive && showSaving) setState({ status: "saving" });
      const result = writeDesignerDraft(storage, saveTarget, saveTargetDocument);
      if (result.ok) {
        savedJsonRef.current[saveTarget] = json;
        savedAtRef.current[saveTarget] = result.savedAt;
        if (isActive) {
          const latestJson = JSON.stringify(latestRef.current.document);
          setState(
            latestJson === json
              ? { status: "saved", savedAt: result.savedAt }
              : { status: "pending" },
          );
        }
        return true;
      }
      if (isActive) {
        setState(
          result.reason === "unavailable"
            ? { status: "unavailable", message: result.message }
            : { status: "error", message: result.message },
        );
      }
      return false;
    },
    [storage],
  );

  const saveLatest = useCallback(
    (showSaving = true, force = false) => {
      const { target: activeTarget, document: activeDocument } =
        latestRef.current;
      return saveDocument(activeTarget, activeDocument, showSaving, force);
    },
    [saveDocument],
  );

  const retry = useCallback(() => saveLatest(true, true), [saveLatest]);

  useEffect(() => {
    const previous = lastRef.current;
    if (previous.target !== target) {
      saveDocument(previous.target, previous.document, false);
    }
    lastRef.current = { target, document };
  }, [saveDocument, target, document]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!storage) {
      setState({ status: "unavailable", message: STORAGE_UNAVAILABLE });
      return;
    }
    const json = JSON.stringify(document);
    if (savedJsonRef.current[target] === json) {
      const savedAt = savedAtRef.current[target];
      setState(savedAt ? { status: "saved", savedAt } : { status: "idle" });
      return;
    }
    setState({ status: "pending" });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      saveLatest();
    }, delayMs);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [delayMs, document, saveLatest, storage, target]);

  const flushRef = useRef(() => {});
  flushRef.current = () => saveLatest(false);

  useEffect(() => {
    const flush = () => saveLatest(false);
    const onVisibility = () => {
      if (window.document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    window.document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [saveLatest]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flushRef.current();
    };
  }, []);

  return { state, retry };
}
