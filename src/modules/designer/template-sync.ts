import type { SavedDesignTemplate } from "@/shared/contracts/open-api";
import type { StorageLike } from "./local-library";
import type { FeaturedPresetUpdate } from "@/shared/design/featured-templates";

const SYNC_KEY = "campusflow.designer.shared-templates.v1";

type Change = { id: string; template: SavedDesignTemplate | null; initialImport?: boolean };
type SyncState = { cache: SavedDesignTemplate[]; pending: Change[] };
export type TemplateTransport = {
  list(): Promise<SavedDesignTemplate[]>;
  put(template: SavedDesignTemplate, initialImport: boolean): Promise<SavedDesignTemplate>;
  remove(id: string): Promise<unknown>;
  updateFeatured?(): Promise<FeaturedPresetUpdate>;
};

export function createTemplateSync(
  storage: StorageLike,
  legacy: () => SavedDesignTemplate[],
  transport: TemplateTransport,
  onChanged: () => void,
) {
  function load(): SyncState {
    try {
      const raw = storage.getItem(SYNC_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SyncState;
        if (Array.isArray(parsed?.cache) && Array.isArray(parsed?.pending)) return parsed;
      }
    } catch { /* Keep the original local templates available. */ }
    return { cache: [], pending: legacy().map((template) => ({ id: template.id, template, initialImport: true })) };
  }

  let state = load();
  let running: Promise<void> | null = null;
  let rerun = false;

  function list() {
    const result = new Map(state.cache.map((template) => [template.id, template]));
    for (const change of state.pending) {
      if (change.template) result.set(change.id, change.template);
      else result.delete(change.id);
    }
    return [...result.values()];
  }

  function save(next: SyncState) {
    const before = JSON.stringify(state);
    const after = JSON.stringify(next);
    storage.setItem(SYNC_KEY, after);
    state = next;
    if (before !== after) onChanged();
  }

  async function flush() {
    do {
      rerun = false;
      // Keep the order of local edits and keep failed edits visible as local copies.
      for (const change of [...state.pending]) {
        try {
          const synced = change.template
            ? await transport.put(change.template, change.initialImport === true)
            : (await transport.remove(change.id), null);
          save({
            cache: [...state.cache.filter((item) => item.id !== change.id), ...(synced ? [synced] : [])],
            pending: state.pending.filter((item) => item !== change),
          });
        } catch { /* The queued edit remains available offline. */ }
      }
      try {
        const cache = await transport.list();
        save({ ...state, cache });
      } catch { /* Use the last readable replica. */ }
    } while (rerun);
  }

  function refresh() {
    running ??= flush().finally(() => { running = null; });
    return running;
  }

  function stage(change: Change) {
    save({ ...state, pending: [...state.pending.filter((item) => item.id !== change.id), change] });
    if (running) rerun = true;
    void refresh();
  }

  return { list, refresh, stage };
}
