import type { DesignDocument, DesignTarget } from "../contracts/design.ts";

export const HISTORY_LIMIT = 60;
export const HISTORY_COALESCE_WINDOW_MS = 900;

export type HistorySnapshot = {
  document: DesignDocument;
  selectedBlockId: string | null;
};

export type HistoryEntry = HistorySnapshot & {
  label: string;
  coalesceKey?: string;
  at: number;
};

export type TargetHistory = {
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Set after undo/redo so the next edit never merges into a restored entry. */
  barrier: boolean;
};

export type HistoryState = Record<DesignTarget, TargetHistory>;

export type CommitMeta = {
  label: string;
  coalesceKey?: string;
  at?: number;
  coalesceWindowMs?: number;
};

export type UndoResult = {
  history: TargetHistory;
  snapshot: HistorySnapshot | null;
  label?: string;
};

export function createTargetHistory(): TargetHistory {
  return { past: [], future: [], barrier: false };
}

export function createHistoryState(): HistoryState {
  return {
    email: createTargetHistory(),
    invite_page: createTargetHistory(),
  };
}

function trim<T>(entries: T[]): T[] {
  return entries.length > HISTORY_LIMIT
    ? entries.slice(entries.length - HISTORY_LIMIT)
    : entries;
}

export function commitHistory(
  history: TargetHistory,
  before: HistorySnapshot,
  meta: CommitMeta,
): TargetHistory {
  const at = meta.at ?? Date.now();
  const windowMs = meta.coalesceWindowMs ?? HISTORY_COALESCE_WINDOW_MS;
  const last = history.past[history.past.length - 1];
  const canCoalesce =
    !history.barrier &&
    Boolean(meta.coalesceKey) &&
    last !== undefined &&
    last.coalesceKey === meta.coalesceKey &&
    at - last.at <= windowMs;

  if (canCoalesce && last) {
    return {
      past: [
        ...history.past.slice(0, -1),
        { ...last, at },
      ],
      future: [],
      barrier: false,
    };
  }

  return {
    past: trim([
      ...history.past,
      {
        document: before.document,
        selectedBlockId: before.selectedBlockId,
        label: meta.label,
        ...(meta.coalesceKey ? { coalesceKey: meta.coalesceKey } : {}),
        at,
      },
    ]),
    future: [],
    barrier: false,
  };
}

export function undoHistory(
  history: TargetHistory,
  current: HistorySnapshot,
  at = Date.now(),
): UndoResult {
  const entry = history.past[history.past.length - 1];
  if (!entry) return { history, snapshot: null };
  return {
    history: {
      past: history.past.slice(0, -1),
      future: trim([
        ...history.future,
        {
          document: current.document,
          selectedBlockId: current.selectedBlockId,
          label: entry.label,
          ...(entry.coalesceKey ? { coalesceKey: entry.coalesceKey } : {}),
          at,
        },
      ]),
      barrier: true,
    },
    snapshot: {
      document: entry.document,
      selectedBlockId: entry.selectedBlockId,
    },
    label: entry.label,
  };
}

export function redoHistory(
  history: TargetHistory,
  current: HistorySnapshot,
  at = Date.now(),
): UndoResult {
  const entry = history.future[history.future.length - 1];
  if (!entry) return { history, snapshot: null };
  return {
    history: {
      past: trim([
        ...history.past,
        {
          document: current.document,
          selectedBlockId: current.selectedBlockId,
          label: entry.label,
          ...(entry.coalesceKey ? { coalesceKey: entry.coalesceKey } : {}),
          at,
        },
      ]),
      future: history.future.slice(0, -1),
      barrier: true,
    },
    snapshot: {
      document: entry.document,
      selectedBlockId: entry.selectedBlockId,
    },
    label: entry.label,
  };
}

export function canUndo(history: TargetHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: TargetHistory): boolean {
  return history.future.length > 0;
}

export function undoLabel(history: TargetHistory): string | null {
  return history.past[history.past.length - 1]?.label ?? null;
}

export function redoLabel(history: TargetHistory): string | null {
  return history.future[history.future.length - 1]?.label ?? null;
}
