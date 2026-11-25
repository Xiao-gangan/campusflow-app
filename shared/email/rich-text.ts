import type { EditorDoc, EditorInlineNode } from "../design/legacy-text.ts";

export type RichEmailBaseStyle = {
  fontFamily: string;
  color: string;
  fontSize: number;
  fontWeight?: number;
  lineHeight?: number;
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

function renderInlineNode(
  node: EditorInlineNode,
  context: Record<string, string | undefined>,
  missing: Set<string>,
): string {
  let html: string;
  if (node.type === "hardBreak") return "<br />";
  if (node.type === "personalizationField") {
    const value = context[node.attrs.field];
    if (value === undefined) {
      missing.add(node.attrs.field);
      html = "";
    } else {
      html = escapeHtml(value);
    }
  } else if (node.type === "text") {
    html = escapeHtml(node.text);
  } else {
    return "";
  }

  const marks = node.marks ?? [];
  const styleParts: string[] = [];
  for (const mark of marks) {
    if (mark.type === "textStyle") {
      const color = mark.attrs?.color;
      const fontSize = mark.attrs?.fontSize;
      if (typeof color === "string") styleParts.push(`color:${color}`);
      if (typeof fontSize === "string") styleParts.push(`font-size:${fontSize}`);
    }
  }
  if (styleParts.length > 0) {
    html = `<span style="${styleParts.join(";")}">${html}</span>`;
  }
  if (marks.some((mark) => mark.type === "underline")) {
    html = `<u>${html}</u>`;
  }
  if (marks.some((mark) => mark.type === "italic")) {
    html = `<em>${html}</em>`;
  }
  if (marks.some((mark) => mark.type === "bold")) {
    html = `<strong>${html}</strong>`;
  }
  const link = marks.find((mark) => mark.type === "link");
  if (link && typeof link.attrs?.href === "string") {
    html = `<a href="${escapeHtml(link.attrs.href)}" style="color:inherit;text-decoration:underline">${html}</a>`;
  }
  return html;
}

export function richTextToEmailInlineHtml(
  doc: EditorDoc,
  context: Record<string, string | undefined>,
  missing: Set<string>,
): string {
  return doc.content
    .map((paragraph) =>
      (paragraph.content ?? [])
        .map((node) => renderInlineNode(node, context, missing))
        .join(""),
    )
    .join("<br />");
}

export function richTextToEmailParagraphsHtml(
  doc: EditorDoc,
  context: Record<string, string | undefined>,
  missing: Set<string>,
  base: RichEmailBaseStyle,
  fallbackAlign: string,
  margin = "0 0 8px",
): string {
  return doc.content
    .map((paragraph) => {
      const align = paragraph.attrs?.textAlign ?? fallbackAlign;
      const content = (paragraph.content ?? [])
        .map((node) => renderInlineNode(node, context, missing))
        .join("");
      return `<p style="margin:${margin};font-family:${base.fontFamily};font-size:${base.fontSize}px;line-height:${base.lineHeight ?? 1.8};font-weight:${base.fontWeight ?? 400};color:${base.color};text-align:${align}">${content}</p>`;
    })
    .join("");
}
