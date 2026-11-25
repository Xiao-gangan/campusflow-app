import type {
  CustomHtmlDocument,
  DesignBlock,
  DesignBlockType,
  DesignDocument,
  DesignTarget,
  DesignTheme,
  EmailDesignMode,
} from "../contracts/design.ts";
import {
  defaultTheme,
  moduleDefinition,
} from "../design/modules.ts";

export function createBlock(type: DesignBlockType): DesignBlock | null {
  const definition = moduleDefinition(type);
  if (!definition) return null;
  return {
    id: crypto.randomUUID(),
    type,
    props: structuredClone(definition.defaultProps),
  };
}

export function createDefaultDocument(target: DesignTarget): DesignDocument {
  const types: DesignBlockType[] =
    target === "email"
      ? ["logo", "heading", "text", "info_card", "button", "footer"]
      : ["logo", "hero", "event_info", "rsvp", "footer"];

  return {
    schemaVersion: 1,
    target,
    meta:
      target === "email"
        ? {
            subjectTemplate: "【CampusFlow】{{candidate_name}} 面试邀请",
            preheaderText: "{{interview_time}} · {{interview_location}}",
          }
        : {},
    theme: defaultTheme(target),
    blocks: types
      .map((type) => createBlock(type))
      .filter((block): block is DesignBlock => block !== null),
  };
}

export function addBlock(
  document: DesignDocument,
  type: DesignBlockType,
  index?: number,
): DesignDocument {
  const definition = moduleDefinition(type);
  if (!definition || !definition.targets.includes(document.target)) {
    return document;
  }
  const block = createBlock(type);
  if (!block) return document;
  const blocks = [...document.blocks];
  const insertAt =
    index === undefined
      ? blocks.length
      : Math.min(Math.max(0, index), blocks.length);
  blocks.splice(insertAt, 0, block);
  return { ...document, blocks };
}

export function removeBlock(
  document: DesignDocument,
  blockId: string,
): DesignDocument {
  return {
    ...document,
    blocks: document.blocks.filter((block) => block.id !== blockId),
  };
}

export function duplicateBlock(
  document: DesignDocument,
  blockId: string,
): { document: DesignDocument; block: DesignBlock | null } {
  const index = document.blocks.findIndex((block) => block.id === blockId);
  if (index < 0) return { document, block: null };
  const source = document.blocks[index];
  const copy: DesignBlock = {
    id: crypto.randomUUID(),
    type: source.type,
    props: structuredClone(source.props),
  };
  const blocks = [...document.blocks];
  blocks.splice(index + 1, 0, copy);
  return { document: { ...document, blocks }, block: copy };
}

export function moveBlock(
  document: DesignDocument,
  blockId: string,
  direction: -1 | 1,
): DesignDocument {
  const index = document.blocks.findIndex((block) => block.id === blockId);
  if (index < 0) return document;
  const target = index + direction;
  if (target < 0 || target >= document.blocks.length) return document;
  const blocks = [...document.blocks];
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  return { ...document, blocks };
}

export function reorderBlock(
  document: DesignDocument,
  blockId: string,
  overId: string,
  position: "before" | "after",
): DesignDocument {
  if (blockId === overId) return document;
  const fromIndex = document.blocks.findIndex((block) => block.id === blockId);
  const overIndex = document.blocks.findIndex((block) => block.id === overId);
  if (fromIndex < 0 || overIndex < 0) return document;

  const blocks = [...document.blocks];
  const [moved] = blocks.splice(fromIndex, 1);
  const targetIndex = blocks.findIndex((block) => block.id === overId);
  if (!moved || targetIndex < 0) return document;
  blocks.splice(targetIndex + (position === "after" ? 1 : 0), 0, moved);
  if (blocks.every((block, index) => block.id === document.blocks[index]?.id)) {
    return document;
  }
  return { ...document, blocks };
}

function samePropValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    left !== null &&
    right !== null &&
    typeof left === "object" &&
    typeof right === "object"
  ) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }
  return false;
}

export function updateBlockProps(
  document: DesignDocument,
  blockId: string,
  patch: Record<string, unknown>,
): DesignDocument {
  let changed = false;
  const blocks = document.blocks.map((block) => {
    if (block.id !== blockId) return block;
    for (const [key, value] of Object.entries(patch)) {
      if (!samePropValue(block.props[key], value)) {
        changed = true;
        break;
      }
    }
    return changed
      ? { ...block, props: { ...block.props, ...patch } }
      : block;
  });
  return changed ? { ...document, blocks } : document;
}

export function updateTheme(
  document: DesignDocument,
  patch: Partial<DesignTheme>,
): DesignDocument {
  const changed = Object.entries(patch).some(
    ([key, value]) =>
      !samePropValue(
        document.theme[key as keyof DesignTheme],
        value,
      ),
  );
  return changed
    ? { ...document, theme: { ...document.theme, ...patch } }
    : document;
}

export function updateMeta(
  document: DesignDocument,
  patch: Partial<DesignDocument["meta"]>,
): DesignDocument {
  const changed = Object.entries(patch).some(
    ([key, value]) =>
      !samePropValue(
        document.meta[key as keyof DesignDocument["meta"]],
        value,
      ),
  );
  return changed
    ? { ...document, meta: { ...document.meta, ...patch } }
    : document;
}

export function setDesignMode(
  document: DesignDocument,
  mode: EmailDesignMode,
  fallbackHtml?: string,
): DesignDocument {
  const currentMode: EmailDesignMode = document.mode === "html" ? "html" : "blocks";
  const needsStarter =
    mode === "html" && (!document.customHtml || !document.customHtml.html.trim());
  if (currentMode === mode && !needsStarter) return document;
  return {
    ...document,
    mode,
    ...(needsStarter && fallbackHtml
      ? {
          customHtml: {
            html: fallbackHtml,
            source: "starter" as const,
          },
        }
      : {}),
  };
}

export const setEmailMode = setDesignMode;

export function updateCustomHtml(
  document: DesignDocument,
  patch: Partial<CustomHtmlDocument>,
): DesignDocument {
  const current: CustomHtmlDocument = document.customHtml ?? { html: "" };
  const next: CustomHtmlDocument = { ...current, ...patch };
  if (samePropValue(current, next)) return document;
  return {
    ...document,
    customHtml: next,
  };
}
