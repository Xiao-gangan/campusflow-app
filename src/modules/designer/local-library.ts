import type {
  DesignAsset,
  DesignAssetKind,
  DesignDocument,
  DesignTarget,
} from "@/shared/contracts/design";

import type { SavedDesignTemplate, SavedTemplateOrigin } from "@/shared/contracts/open-api";
import { templateTransport } from "../open-api/client.ts";
import { createTemplateSync, type TemplateTransport } from "./template-sync.ts";

const TEMPLATE_KEY = "campusflow.designer.templates.v1";
const ASSET_KEY = "campusflow.designer.assets.v1";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type { SavedDesignTemplate, SavedTemplateOrigin } from "@/shared/contracts/open-api";

function readArray<T>(
  storage: StorageLike,
  key: string,
  guard: (value: unknown) => value is T,
): T[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(storage: StorageLike, key: string, value: T[]): void {
  storage.setItem(key, JSON.stringify(value));
}

function isTemplate(value: unknown): value is SavedDesignTemplate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavedDesignTemplate>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    (candidate.target === "email" || candidate.target === "invite_page") &&
    Boolean(candidate.document) &&
    typeof candidate.document === "object" &&
    Array.isArray(candidate.document?.blocks)
  );
}

function isAsset(value: unknown): value is DesignAsset {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DesignAsset>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.url === "string" &&
    (candidate.kind === "logo" ||
      candidate.kind === "image" ||
      candidate.kind === "background") &&
    typeof candidate.createdAt === "string"
  );
}

export function createDesignLibrary(storage: StorageLike, transport?: TemplateTransport) {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const legacy = () => readArray(storage, TEMPLATE_KEY, isTemplate);
  const sync = transport ? createTemplateSync(storage, legacy, transport, notify) : undefined;
  const readTemplates = () => sync?.list() ?? legacy();

  function storeTemplate(templates: SavedDesignTemplate[], template: SavedDesignTemplate) {
    if (sync) sync.stage({ id: template.id, template });
    else {
      writeArray(storage, TEMPLATE_KEY, templates);
      notify();
    }
  }

  let initialPresetUpgrade: Promise<void> | undefined;

  async function updateLocalFeaturedPresets(allowAdd: boolean) {
    if (!allowAdd && readTemplates().length === 0) return { added: 0, updated: 0 };
    const { canUpgradeLegacy, featuredInterviewPresets, featuredOfferPresets, legacyTemplateDigests, planFeaturedPresetUpdate, templateContent } =
      await import("../../../shared/design/featured-templates.ts");
    const matches = new Set<string>();
    if (crypto.subtle) {
      for (const item of readTemplates().filter(canUpgradeLegacy)) {
        const content = templateContent(item);
        const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
        const hex = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
        if (hex === legacyTemplateDigests[item.id]) matches.add(content);
      }
    }
    const existing = readTemplates();
    const { writes, summary } = planFeaturedPresetUpdate(existing, [...featuredInterviewPresets(), ...featuredOfferPresets()],
      (item) => matches.has(templateContent(item)), { allowAdd, timestamp: new Date().toISOString(), makeId: () => crypto.randomUUID() });
    if (writes.length) {
      if (sync) for (const template of writes) sync.stage({ id: template.id, template });
      else {
        const ids = new Set(writes.map(({ id }) => id));
        writeArray(storage, TEMPLATE_KEY, [...existing.filter(({ id }) => !ids.has(id)), ...writes]);
        notify();
      }
    }
    return summary;
  }

  return {
    refreshTemplates: () => sync?.refresh() ?? (initialPresetUpgrade ??= updateLocalFeaturedPresets(false)
      .then(() => undefined).catch(() => { /* Existing local templates remain available. */ })),
    async updateFeaturedPresets() {
      if (sync && transport?.updateFeatured) {
        await sync.refresh();
        const result = await transport.updateFeatured();
        await sync.refresh();
        return result;
      }
      return updateLocalFeaturedPresets(true);
    },
    subscribeTemplates(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    listTemplates(
      target?: DesignTarget,
      origin?: SavedTemplateOrigin,
    ): SavedDesignTemplate[] {
      return readTemplates()
        .map((template, index) => ({ template, index }))
        .filter(({ template }) => !target || template.target === target)
        .filter(
          ({ template }) =>
            !origin || (template.origin ?? "manual") === origin,
        )
        .sort((left, right) => {
          const byDate = right.template.updatedAt.localeCompare(
            left.template.updatedAt,
          );
          return byDate !== 0 ? byDate : right.index - left.index;
        })
        .map(({ template }) => template);
    },

    saveTemplate(input: {
      name: string;
      document: DesignDocument;
      id?: string;
      origin?: SavedTemplateOrigin;
    }): SavedDesignTemplate {
      const templates = readTemplates();
      const now = new Date().toISOString();
      const existingIndex = input.id
        ? templates.findIndex((template) => template.id === input.id)
        : -1;
      const name =
        input.name.trim() ||
        (input.document.target === "email" ? "邮件模板" : "邀请函模板");
      const document = structuredClone(input.document);

      if (existingIndex >= 0) {
        const updated: SavedDesignTemplate = {
          ...templates[existingIndex],
          name,
          target: document.target,
          document,
          origin: input.origin ?? templates[existingIndex].origin ?? "manual",
          updatedAt: now,
        };
        templates[existingIndex] = updated;
        storeTemplate(templates, updated);
        return structuredClone(updated);
      }

      const created: SavedDesignTemplate = {
        id: crypto.randomUUID(),
        name,
        target: document.target,
        schemaVersion: 1,
        document,
        origin: input.origin ?? "manual",
        createdAt: now,
        updatedAt: now,
      };
      templates.push(created);
      storeTemplate(templates, created);
      return structuredClone(created);
    },

    deleteTemplate(id: string): void {
      if (sync) sync.stage({ id, template: null });
      else {
        writeArray(storage, TEMPLATE_KEY, legacy().filter((template) => template.id !== id));
        notify();
      }
    },

    renameTemplate(id: string, name: string): SavedDesignTemplate | null {
      const templates = readTemplates();
      const index = templates.findIndex((template) => template.id === id);
      if (index < 0) return null;
      const updated: SavedDesignTemplate = {
        ...templates[index],
        name: name.trim() || templates[index].name,
        updatedAt: new Date().toISOString(),
      };
      templates[index] = updated;
      storeTemplate(templates, updated);
      return structuredClone(updated);
    },

    duplicateTemplate(id: string): SavedDesignTemplate | null {
      const templates = readTemplates();
      const source = templates.find((template) => template.id === id);
      if (!source) return null;
      const now = new Date().toISOString();
      const copy: SavedDesignTemplate = {
        ...structuredClone(source),
        id: crypto.randomUUID(),
        name: `${source.name} 副本`,
        createdAt: now,
        updatedAt: now,
      };
      templates.push(copy);
      storeTemplate(templates, copy);
      return structuredClone(copy);
    },

    listAssets(): DesignAsset[] {
      return readArray(storage, ASSET_KEY, isAsset)
        .map((asset, index) => ({ asset, index }))
        .sort((left, right) => {
          const byDate = right.asset.createdAt.localeCompare(
            left.asset.createdAt,
          );
          return byDate !== 0 ? byDate : right.index - left.index;
        })
        .map(({ asset }) => asset);
    },

    saveAsset(input: {
      name: string;
      url: string;
      kind: DesignAssetKind;
      source?: DesignAsset["source"];
      mimeType?: string;
      size?: number;
      width?: number;
      height?: number;
    }): DesignAsset {
      const assets = readArray(storage, ASSET_KEY, isAsset);
      const asset: DesignAsset = {
        id: crypto.randomUUID(),
        name: input.name.trim() || "未命名素材",
        url: input.url.trim(),
        kind: input.kind,
        createdAt: new Date().toISOString(),
        source: input.source ?? "url",
        ...(input.mimeType ? { mimeType: input.mimeType } : {}),
        ...(input.size !== undefined ? { size: input.size } : {}),
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.height !== undefined ? { height: input.height } : {}),
      };
      assets.push(asset);
      writeArray(storage, ASSET_KEY, assets);
      return { ...asset };
    },

    deleteAsset(id: string): void {
      const assets = readArray(storage, ASSET_KEY, isAsset).filter(
        (asset) => asset.id !== id,
      );
      writeArray(storage, ASSET_KEY, assets);
    },
  };
}

export type DesignLibrary = ReturnType<typeof createDesignLibrary>;

let browserLibrary: DesignLibrary | undefined;

export function browserDesignLibrary(fallback?: StorageLike): DesignLibrary {
  if (browserLibrary) return browserLibrary;
  let storage: StorageLike;
  try { storage = window.localStorage; }
  catch {
    const values = new Map<string, string>();
    storage = fallback ?? {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
    };
  }
  browserLibrary = createDesignLibrary(storage, templateTransport);
  return browserLibrary;
}
