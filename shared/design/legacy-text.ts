export type PersonalizationFieldNode = {
  type: "personalizationField";
  attrs: {
    field: string;
    label?: string;
  };
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

export type EditorTextNode = {
  type: "text";
  text: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

export type EditorHardBreak = {
  type: "hardBreak";
};

export type EditorInlineNode =
  | EditorTextNode
  | PersonalizationFieldNode
  | EditorHardBreak;

export type EditorParagraph = {
  type: "paragraph";
  attrs?: {
    textAlign?: "left" | "center" | "right";
  };
  content?: EditorInlineNode[];
};

export type EditorDoc = {
  type: "doc";
  content: EditorParagraph[];
};

const FIELD_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

function paragraphFromLine(
  line: string,
  resolveLabel?: (key: string) => string | undefined,
): EditorParagraph {
  const content: EditorInlineNode[] = [];
  let cursor = 0;

  for (const match of line.matchAll(FIELD_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      content.push({ type: "text", text: line.slice(cursor, index) });
    }
    const label = resolveLabel?.(match[1]);
    content.push({
      type: "personalizationField",
      attrs: label ? { field: match[1], label } : { field: match[1] },
    });
    cursor = index + match[0].length;
  }

  if (cursor < line.length) {
    content.push({ type: "text", text: line.slice(cursor) });
  }

  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

/**
 * Converts the plain-text template format used by existing templates into
 * editor content. Unknown field keys are preserved as field nodes.
 */
export function legacyTextToDoc(
  text: string,
  resolveLabel?: (key: string) => string | undefined,
): EditorDoc {
  const lines = text.replace(/\r\n/gu, "\n").split("\n");
  return {
    type: "doc",
    content: lines.map((line) => paragraphFromLine(line, resolveLabel)),
  };
}

/**
 * Produces the plain-text representation used by the existing renderers.
 * Rich-text marks are intentionally ignored here; they remain in the editor
 * document and are only relevant to rich-text renderers.
 */
export function docToLegacyText(doc: EditorDoc): string {
  return doc.content
    .map((paragraph) =>
      (paragraph.content ?? [])
        .map((node) => {
          if (node.type === "text") return node.text;
          if (node.type === "personalizationField") {
            return `{{${node.attrs.field}}}`;
          }
          if (node.type === "hardBreak") return "\n";
          return "";
        })
        .join(""),
    )
    .join("\n");
}

export function collectFieldKeys(doc: EditorDoc): string[] {
  const keys = new Set<string>();
  for (const paragraph of doc.content) {
    for (const node of paragraph.content ?? []) {
      if (node.type === "personalizationField") keys.add(node.attrs.field);
    }
  }
  return [...keys];
}
