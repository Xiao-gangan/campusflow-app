import type {
  EditorDoc,
  EditorInlineNode,
  EditorParagraph,
} from "./legacy-text.ts";

export type RichMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export const RICH_FONT_SIZES = [
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
] as const;

const FONT_SIZE_SET = new Set<string>(RICH_FONT_SIZES);
const COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;
const LINK_PATTERN = /^(?:https?:|mailto:)/iu;

export type RichTextFieldMap = Map<string, string>;

function sanitizeMarks(value: unknown): RichMark[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const marks: RichMark[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const mark = candidate as { type?: unknown; attrs?: unknown };
    if (
      mark.type === "bold" ||
      mark.type === "italic" ||
      mark.type === "underline"
    ) {
      marks.push({ type: mark.type });
      continue;
    }
    if (mark.type === "link") {
      const attrs =
        mark.attrs && typeof mark.attrs === "object"
          ? (mark.attrs as Record<string, unknown>)
          : {};
      if (typeof attrs.href === "string" && LINK_PATTERN.test(attrs.href.trim())) {
        marks.push({ type: "link", attrs: { href: attrs.href.trim() } });
      }
      continue;
    }
    if (mark.type === "textStyle") {
      const attrs =
        mark.attrs && typeof mark.attrs === "object"
          ? (mark.attrs as Record<string, unknown>)
          : {};
      const safe: Record<string, string> = {};
      if (typeof attrs.color === "string" && COLOR_PATTERN.test(attrs.color)) {
        safe.color = attrs.color;
      }
      if (
        typeof attrs.fontSize === "string" &&
        FONT_SIZE_SET.has(attrs.fontSize)
      ) {
        safe.fontSize = attrs.fontSize;
      }
      if (Object.keys(safe).length > 0) {
        marks.push({ type: "textStyle", attrs: safe });
      }
    }
  }

  return marks.length > 0 ? marks : undefined;
}

function sanitizeNode(
  value: unknown,
  allowedFields?: RichTextFieldMap,
): EditorInlineNode | null {
  if (!value || typeof value !== "object") return null;
  const node = value as {
    type?: unknown;
    text?: unknown;
    attrs?: unknown;
    marks?: unknown;
  };

  if (node.type === "text" && typeof node.text === "string") {
    if (!node.text) return null;
    const marks = sanitizeMarks(node.marks);
    return {
      type: "text",
      text: node.text,
      ...(marks ? { marks } : {}),
    };
  }

  if (node.type === "hardBreak") {
    return { type: "hardBreak" };
  }

  if (node.type === "personalizationField") {
    const attrs =
      node.attrs && typeof node.attrs === "object"
        ? (node.attrs as Record<string, unknown>)
        : {};
    const field = typeof attrs.field === "string" ? attrs.field : "";
    const canonicalLabel = allowedFields?.get(field);
    if (!field || (allowedFields && !canonicalLabel)) {
      return { type: "text", text: "未识别字段" };
    }
    const savedLabel =
      !allowedFields && typeof attrs.label === "string" ? attrs.label : undefined;
    const label = canonicalLabel ?? savedLabel;
    const marks = sanitizeMarks(node.marks);
    return {
      type: "personalizationField",
      attrs: {
        field,
        ...(label ? { label } : {}),
      },
      ...(marks ? { marks } : {}),
    };
  }

  return null;
}

function sanitizeParagraph(
  value: unknown,
  allowedFields?: RichTextFieldMap,
): EditorParagraph | null {
  if (!value || typeof value !== "object") return null;
  const paragraph = value as {
    type?: unknown;
    attrs?: unknown;
    content?: unknown;
  };
  if (paragraph.type !== "paragraph") return null;

  const rawAlign =
    paragraph.attrs && typeof paragraph.attrs === "object"
      ? (paragraph.attrs as Record<string, unknown>).textAlign
      : undefined;
  const textAlign =
    rawAlign === "left" || rawAlign === "center" || rawAlign === "right"
      ? rawAlign
      : undefined;

  const content = Array.isArray(paragraph.content)
    ? paragraph.content
        .map((node) => sanitizeNode(node, allowedFields))
        .filter((node): node is EditorInlineNode => node !== null)
    : [];

  return {
    type: "paragraph",
    ...(textAlign ? { attrs: { textAlign } } : {}),
    ...(content.length > 0 ? { content } : {}),
  };
}

export function sanitizeRichTextDoc(
  value: unknown,
  allowedFields?: RichTextFieldMap,
): EditorDoc | null {
  if (!value || typeof value !== "object") return null;
  const document = value as { type?: unknown; content?: unknown };
  if (document.type !== "doc" || !Array.isArray(document.content)) return null;

  const content = document.content
    .map((paragraph) => sanitizeParagraph(paragraph, allowedFields))
    .filter((paragraph): paragraph is EditorParagraph => paragraph !== null);

  return {
    type: "doc",
    content:
      content.length > 0 ? content : [{ type: "paragraph" as const }],
  };
}

export function sanitizeRichTextMap(
  value: unknown,
  allowedFields?: RichTextFieldMap,
): Record<string, EditorDoc> {
  if (!value || typeof value !== "object") return {};
  const entries: [string, EditorDoc][] = [];
  for (const [key, doc] of Object.entries(value)) {
    const sanitized = sanitizeRichTextDoc(doc, allowedFields);
    if (sanitized) entries.push([key, sanitized]);
  }
  return Object.fromEntries(entries);
}

export function richTextToPlainText(
  doc: EditorDoc,
  context: Record<string, string | undefined>,
  missing: Set<string>,
): string {
  return doc.content
    .map((paragraph) => {
      let text = "";
      let activeLink = "";
      for (const node of paragraph.content ?? []) {
        if (node.type === "hardBreak") {
          if (activeLink) {
            text += ` (${activeLink})`;
            activeLink = "";
          }
          text += "\n";
          continue;
        }

        let value: string;
        if (node.type === "text") {
          value = node.text;
        } else {
          const resolved = context[node.attrs.field];
          if (resolved === undefined) {
            missing.add(node.attrs.field);
            value = "";
          } else {
            value = resolved;
          }
        }
        const link = node.marks?.find((mark) => mark.type === "link");
        const href =
          link && typeof link.attrs?.href === "string" ? link.attrs.href : "";
        if (activeLink && activeLink !== href) {
          text += ` (${activeLink})`;
          activeLink = "";
        }
        if (href && !activeLink) activeLink = href;
        text += value;
      }
      if (activeLink) text += ` (${activeLink})`;
      return text;
    })
    .join("\n");
}

export function sanitizePastedPersonalizationHtml(
  html: string,
  allowedFields: RichTextFieldMap,
): string {
  if (typeof DOMParser === "undefined") return html;
  const document = new DOMParser().parseFromString(html, "text/html");
  for (const element of document.querySelectorAll(
    "[data-personalization-field]",
  )) {
    const field = element.getAttribute("data-personalization-field") ?? "";
    const label = allowedFields.get(field);
    if (!field || !label) {
      element.replaceWith(document.createTextNode("未识别字段"));
      continue;
    }
    element.setAttribute("data-personalization-field", field);
    element.setAttribute("data-personalization-label", label);
  }
  return document.body.innerHTML;
}
