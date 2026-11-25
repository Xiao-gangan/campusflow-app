import { useCallback, useRef, useState } from "react";
import type { DesignDocument, DesignTarget } from "@/shared/contracts/design";
import {
  canRedo,
  canUndo,
  commitHistory,
  createHistoryState,
  redoHistory,
  redoLabel,
  undoHistory,
  undoLabel,
  type HistorySnapshot,
  type HistoryState,
} from "@/shared/design/history";

type Documents = Record<DesignTarget, DesignDocument>;

export type CommitOptions = {
  label: string;
  coalesceKey?: string;
  selectedBlockId: string | null;
};

export type DesignerHistory = {
  documents: Documents;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  commit: (
    updater: (current: DesignDocument) => DesignDocument,
    options: CommitOptions,
  ) => boolean;
  undo: () => HistorySnapshot | null;
  redo: () => HistorySnapshot | null;
};

export function useDesignerHistory(
  initialDocuments: Documents,
  activeTarget: DesignTarget,
  selectedBlockId: string | null,
): DesignerHistory {
  const [documents, setDocuments] = useState(initialDocuments);
  const [histories, setHistories] = useState<HistoryState>(createHistoryState);
  const documentsRef = useRef(initialDocuments);
  const historiesRef = useRef(histories);
  const selectionRef = useRef(selectedBlockId);
  selectionRef.current = selectedBlockId;
  const targetRef = useRef(activeTarget);
  targetRef.current = activeTarget;

  const commit = useCallback(
    (
      updater: (current: DesignDocument) => DesignDocument,
      options: CommitOptions,
    ) => {
      const target = targetRef.current;
      const current = documentsRef.current[target];
      const next = updater(current);
      if (next === current) return false;

      const nextHistory = commitHistory(
        historiesRef.current[target],
        {
          document: current,
          selectedBlockId: options.selectedBlockId ?? selectionRef.current,
        },
        { label: options.label, coalesceKey: options.coalesceKey },
      );
      documentsRef.current = { ...documentsRef.current, [target]: next };
      historiesRef.current = { ...historiesRef.current, [target]: nextHistory };
      setDocuments(documentsRef.current);
      setHistories(historiesRef.current);
      return true;
    },
    [],
  );

  const undo = useCallback(() => {
    const target = targetRef.current;
    const result = undoHistory(historiesRef.current[target], {
      document: documentsRef.current[target],
      selectedBlockId: selectionRef.current,
    });
    if (!result.snapshot) return null;
    historiesRef.current = {
      ...historiesRef.current,
      [target]: result.history,
    };
    documentsRef.current = {
      ...documentsRef.current,
      [target]: result.snapshot.document,
    };
    setDocuments(documentsRef.current);
    setHistories(historiesRef.current);
    return result.snapshot;
  }, []);

  const redo = useCallback(() => {
    const target = targetRef.current;
    const result = redoHistory(historiesRef.current[target], {
      document: documentsRef.current[target],
      selectedBlockId: selectionRef.current,
    });
    if (!result.snapshot) return null;
    historiesRef.current = {
      ...historiesRef.current,
      [target]: result.history,
    };
    documentsRef.current = {
      ...documentsRef.current,
      [target]: result.snapshot.document,
    };
    setDocuments(documentsRef.current);
    setHistories(historiesRef.current);
    return result.snapshot;
  }, []);

  const activeHistory = histories[activeTarget];

  return {
    documents,
    canUndo: canUndo(activeHistory),
    canRedo: canRedo(activeHistory),
    undoLabel: undoLabel(activeHistory),
    redoLabel: redoLabel(activeHistory),
    commit,
    undo,
    redo,
  };
}
