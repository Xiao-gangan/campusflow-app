import type { DesignBlock, DesignDocument, DesignTheme } from "../contracts/design.ts";
import { blockStyleKeys, currentBlockBorder, isBlockStyleKey, readBlockStyleOverrides } from "../design/block-style.ts";
import { sanitizeRichTextMap } from "../design/rich-text.ts";
import { aiPatchFieldKeys, type AiBlockPatch, type AiBlockType } from "./schema.ts";

type Fields = AiBlockPatch["fields"];

export function aiBlockInput(block: DesignBlock, theme: DesignTheme): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const key of aiPatchFieldKeys(block.type as AiBlockType)) {
    const value = block.props[key];
    if (!isBlockStyleKey(key) &&
        (typeof value === "string" || (typeof value === "number" && Number.isFinite(value)))) {
      fields[key] = value;
    }
  }
  Object.assign(fields, readBlockStyleOverrides(block.type, block.props));
  if (blockStyleKeys(block.type).length) {
    fields.effectiveBorder = currentBlockBorder(block.type, block.props, theme);
  }
  const linkedTextFields = Object.entries(sanitizeRichTextMap(block.props.richText))
    .filter(([, doc]) => doc.content.some((para) => para.content?.some(
      (node) => node.type !== "hardBreak" && node.marks?.some((mark) => mark.type === "link"),
    )))
    .map(([key]) => key);
  if (linkedTextFields.length) fields.linkedTextFields = linkedTextFields;
  return fields;
}

export function applyAiBlockFields(block: DesignBlock, fields: Fields): DesignBlock {
  const props = { ...block.props, ...fields };
  const rewritten = ["text", "title", "body", "subtitle", "description", "note"].filter((key) => Object.hasOwn(fields, key));
  const richText = props.richText;
  if (rewritten.length && richText && typeof richText === "object" && !Array.isArray(richText)) {
    const nextRich = { ...(richText as Record<string, unknown>) };
    for (const key of rewritten) delete nextRich[key];
    props.richText = nextRich;
  }
  return { ...block, props };
}

export function replaceAiBlock(document: DesignDocument, nextBlock: DesignBlock): DesignDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) => block.id === nextBlock.id ? nextBlock : block),
  };
}

export function captureAiBlockRevision(doc: DesignDocument, blockId: string) {
  const document = structuredClone(doc);
  const block = document.blocks.find((item) => item.id === blockId);
  return block ? { document, block } : null;
}

export function previewAiBlockRevision(
  snapshot: NonNullable<ReturnType<typeof captureAiBlockRevision>>,
  fields: Fields,
) {
  const nextBlock = applyAiBlockFields(snapshot.block, fields);
  return { nextBlock, document: replaceAiBlock(snapshot.document, nextBlock) };
}
