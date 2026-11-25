import type { DesignBlock, DesignDocument, DesignTarget } from "../../shared/contracts/design.ts";
import { readBlockStyleOverrides } from "../../shared/design/block-style.ts";
import { isDesignDocument } from "../../shared/design/draft.ts";
import { moduleDefinition } from "../../shared/design/modules.ts";
import { sanitizeRichTextMap } from "../../shared/design/rich-text.ts";
import { variablesForTarget } from "../../shared/design/variables.ts";
import { renderDesignEmail } from "../../shared/email/design-renderer.ts";
import { MAX_FREE_HTML_LENGTH, renderFreeEmailHtml, sanitizeEmailHtml } from "../../shared/email/free-html.ts";
import { localAssetIssues } from "../recruitment/mail.ts";
import { RsvpError } from "../rsvp/error.ts";

const tokenPattern = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
const protectedLink = /\{\{\s*(?:rsvp_link|onboarding_link)\s*\}\}/i;
const wholeToken = /^\{\{\s*[a-z0-9_]+\s*\}\}$/i;
const colors = ["primaryColor", "accentColor", "backgroundColor", "surfaceColor", "textColor",
  "mutedTextColor", "buttonColor", "buttonTextColor", "borderColor"] as const;
const safeColor = /^(?:#[0-9a-f]{3,8}|transparent)$/i;
const safeFont = /^[\p{L}\p{N} ,"'_-]{1,200}$/u;

export function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function badTemplate(message: string): never {
  throw new RsvpError(400, message);
}

function checkVariables(text: string, fields: Map<string, string>, acceptUnknown: boolean) {
  for (const [, key] of text.matchAll(tokenPattern)) {
    if (!fields.has(key) && (!acceptUnknown || key === "onboarding_link"))
      badTemplate(`模板包含当前目标不支持的变量 {{${key}}}。`);
  }
}

function safeUrl(value: string, image: boolean, allowData: boolean): string {
  const raw = value.trim();
  if (!raw || wholeToken.test(raw)) return raw;
  if (protectedLink.test(raw)) badTemplate("专属链接变量必须独立作为链接地址。");
  if (image && allowData && /^(?:blob:|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(raw))
    return raw;
  try {
    const url = new URL(raw);
    if (["https:", "http:"].includes(url.protocol) || (!image && url.protocol === "mailto:")) return raw;
  } catch { /* An invalid URL is dropped. */ }
  return "";
}

function cleanBlock(block: DesignBlock, target: DesignTarget, fields: Map<string, string>, local: boolean): DesignBlock {
  const definition = moduleDefinition(block.type);
  if (!definition?.targets.includes(target)) badTemplate("模板包含当前目标不支持的模块。");
  const props: Record<string, unknown> = {};
  const keys = new Set([
    ...Object.keys(definition.defaultProps), ...definition.fields.map((field) => field.key),
    "assetId", "backgroundImage", "secondaryAction",
  ]);
  for (const key of keys) {
    const value = block.props[key];
    if (typeof value === "string") {
      if (key !== "assetId") checkVariables(value, fields, local);
      if (key === "url" || key === "src" || key === "backgroundImage") {
        if (key !== "url" && protectedLink.test(value)) badTemplate("专属链接变量只能用作链接地址。");
        props[key] = safeUrl(value, key !== "url", local);
      } else props[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) props[key] = value;
    else if (typeof value === "boolean") props[key] = value;
    else if (!local && value !== undefined && value !== null) badTemplate(`模块字段 ${key} 格式无效。`);
  }
  const richText = sanitizeRichTextMap(block.props.richText, fields);
  const richKeys = new Set(definition.fields.filter((field) => field.rich).map((field) => field.key));
  const editableRichText = Object.fromEntries(Object.entries(richText).filter(([key]) => richKeys.has(key)));
  for (const doc of Object.values(editableRichText)) {
    for (const paragraph of doc.content) {
      for (const node of paragraph.content ?? []) {
        if (node.type === "text") checkVariables(node.text, fields, local);
        for (const mark of ("marks" in node ? node.marks ?? [] : [])) {
          const href = mark.attrs?.href;
          if (typeof href === "string" && protectedLink.test(href))
            badTemplate("专属链接变量必须使用独立的按钮链接。");
        }
      }
    }
  }
  return {
    id: block.id,
    type: block.type,
    props: { ...props, ...readBlockStyleOverrides(block.type, block.props),
      ...(Object.keys(editableRichText).length ? { richText: editableRichText } : {}) },
  };
}

export function templateInput(body: Record<string, unknown>, local = false) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 160) badTemplate("请输入 1–160 字的模板名称。");
  const document = body.document;
  const target = record(document)?.target;
  if ((target !== "email" && target !== "invite_page") || !isDesignDocument(document, target))
    badTemplate("模板必须符合 CampusFlow DesignDocument v1。");
  if (body.origin !== undefined && body.origin !== "manual" && body.origin !== "ai")
    badTemplate("模板来源无效。");
  if (document.blocks.length > 200 || new Set(document.blocks.map((block) => block.id)).size !== document.blocks.length)
    badTemplate("模块最多 200 个，且 ID 不可重复。");

  const fields = new Map(variablesForTarget(target).map((item) => [item.key, item.label]));
  const theme = { ...document.theme };
  for (const key of colors) {
    const color = theme[key];
    if (color !== undefined && (typeof color !== "string" || !safeColor.test(color))) badTemplate("模板主题颜色无效。");
  }
  for (const key of ["width", "radius", "spacing"] as const) {
    if (!Number.isFinite(theme[key]) || theme[key] < 0 || theme[key] > 2400)
      badTemplate("模板主题尺寸无效。");
  }
  if (!safeFont.test(theme.fontFamily)) badTemplate("模板主题字体无效。");
  const meta: DesignDocument["meta"] = {};
  for (const key of ["subjectTemplate", "preheaderText"] as const) {
    const value = document.meta[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > 5000) badTemplate("模板主题或预览文字无效。");
    checkVariables(value, fields, local);
    meta[key] = value;
  }
  const warnings: string[] = [];
  let customHtml: DesignDocument["customHtml"];
  if (document.customHtml !== undefined) {
    const custom = document.customHtml;
    if (custom.html.length > MAX_FREE_HTML_LENGTH) badTemplate(`自由 HTML 最多 ${MAX_FREE_HTML_LENGTH} 字符。`);
    if (custom.fontFamily && !safeFont.test(custom.fontFamily)) badTemplate("自由 HTML 字体无效。");
    const cleaned = sanitizeEmailHtml(custom.html, { allowDataImages: local, target });
    warnings.push(...cleaned.warnings);
    checkVariables(cleaned.html, fields, local);
    for (const [, value] of cleaned.html.matchAll(/\b(?:href|src)="([^"]*)"/gi)) {
      if (protectedLink.test(value) && !wholeToken.test(value))
        badTemplate("专属链接变量必须独立作为链接地址。");
    }
    if (/\bsrc="[^"]*\{\{\s*(?:rsvp_link|onboarding_link)\s*\}\}/i.test(cleaned.html))
      badTemplate("专属链接变量只能用作链接地址。");
    if (document.mode === "html" && !cleaned.html) badTemplate("安全清洗后没有可用的 HTML 正文。");
    customHtml = { html: cleaned.html, fontFamily: custom.fontFamily, source: custom.source };
  } else if (document.mode === "html") badTemplate("自由 HTML 模式需要 customHtml.html。");

  const safeDocument: DesignDocument = {
    schemaVersion: 1, target, mode: document.mode,
    meta, theme: {
      ...Object.fromEntries(colors.flatMap((key) => theme[key] === undefined ? [] : [[key, theme[key]]])),
      width: theme.width, radius: theme.radius, spacing: theme.spacing, fontFamily: theme.fontFamily,
    } as DesignDocument["theme"],
    blocks: document.blocks.map((block) => cleanBlock(block, target, fields, local)),
    ...(customHtml ? { customHtml } : {}),
  };
  return { name, document: safeDocument, origin: body.origin, warnings } as const;
}

// The shared HTML renderer supports the common block set. Invitation actions are
// represented as text here; the signed candidate route owns RSVP mutations.
function invitationRenderDocument(document: DesignDocument): DesignDocument {
  const stringProp = (block: DesignBlock, key: string) =>
    typeof block.props[key] === "string" ? block.props[key] : "";
  const blocks = document.blocks.flatMap((block): DesignBlock[] => {
    if (block.type === "hero") {
      return [
        { id: block.id, type: "heading", props: { ...block.props, text: stringProp(block, "title") } },
        { id: `${block.id}-subtitle`, type: "text", props: { text: stringProp(block, "subtitle"), align: block.props.align } },
      ];
    }
    if (block.type === "event_info") {
      return [{ id: block.id, type: "info_card", props: { ...block.props,
        body: ["date", "time", "location", "note"].map((key) => stringProp(block, key)).filter(Boolean).join("\n") } }];
    }
    if (block.type === "rsvp") {
      return [{ id: block.id, type: "info_card", props: { ...block.props, body: stringProp(block, "description") } }];
    }
    return [block];
  });
  return { ...document, target: "email", blocks };
}

export function renderAgentTemplate(document: DesignDocument, variables: Record<string, string>) {
  const preview = document.target === "invite_page" ? {
    ...document, meta: { ...document.meta, subjectTemplate: document.meta.subjectTemplate || "CampusFlow 邀请函" },
  } : document;
  const result = preview.mode === "html"
    ? renderFreeEmailHtml(preview, variables)
    : renderDesignEmail(preview.target === "invite_page" ? invitationRenderDocument(preview) : preview, variables);
  return { ...result, warnings: [
    ...new Set([...result.warnings, ...localAssetIssues(preview),
      ...result.missingVariables.map((key) => `缺少变量：${key}`)]),
  ] };
}
