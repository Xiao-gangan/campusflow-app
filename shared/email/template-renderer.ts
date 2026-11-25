import type {
  EmailBlock,
  EmailEditorDocument,
  EmailTemplate,
} from "../contracts/email.ts";
import { emailBoxStyle, fontWeightValue, resolveBlockStyle, richTextWithBlockStyle } from "../design/block-style.ts";
import type { EditorDoc } from "../design/legacy-text.ts";
import {
  richTextToPlainText,
  sanitizeRichTextDoc,
} from "../design/rich-text.ts";
import { variablesForTarget } from "../design/variables.ts";
import {
  dividerSpec,
  styleRecipeFor,
  type ResolvedStyle,
} from "../design/style-recipes.ts";
import {
  richTextToEmailInlineHtml,
  richTextToEmailParagraphsHtml,
} from "./rich-text.ts";

export type EmailTemplateContext = Record<string, string | undefined>;

export type EmailRenderOptions = {
  allowDataImageUrls?: boolean;
};

export type EmailRenderResult = {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  missingVariables: string[];
  warnings: string[];
};

const VARIABLE_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
const COLOR_PATTERN = /^#[0-9a-f]{3,8}$/iu;

const EMAIL_FIELDS = new Map(
  variablesForTarget("email").map((variable) => [
    variable.key,
    variable.label,
  ]),
);

type RenderTheme = {
  width: number;
  background: string;
  fontFamily: string;
  textColor: string;
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  mutedTextColor: string;
  borderColor: string;
  buttonColor: string;
  buttonTextColor: string;
  radius: number;
  spacing: number;
};

function richTextProp(
  props: Record<string, unknown>,
  key: string,
): EditorDoc | null {
  const map = props.richText;
  if (!map || typeof map !== "object") return null;
  return sanitizeRichTextDoc(
    (map as Record<string, unknown>)[key],
    EMAIL_FIELDS,
  );
}

function stringProp(
  props: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  const value = props[key];
  return typeof value === "string" ? value : fallback;
}

function numberProp(
  props: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && COLOR_PATTERN.test(value.trim())
    ? value.trim()
    : fallback;
}

function parseHex(value: string): [number, number, number] | null {
  const normalized = value.replace(/^#/u, "");
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/iu.test(normalized)) return null;
  const hex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => character + character)
          .join("")
      : normalized;
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

export function contrastText(color: string): string {
  const rgb = parseHex(color);
  if (!rgb) return "#172019";
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance < 0.42 ? "#fffdf8" : "#172019";
}

function safeAlign(value: string, fallback = "left"): string {
  return ["left", "center", "right"].includes(value) ? value : fallback;
}

function safeUrl(value: string, allowDataImage = false): string | null {
  if (
    allowDataImage &&
    /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/iu.test(value)
  ) {
    return value;
  }
  try {
    const url = new URL(value);
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function renderVariables(
  input: string,
  context: EmailTemplateContext,
  missing: Set<string>,
): string {
  return input.replace(VARIABLE_PATTERN, (_match, key: string) => {
    if (context[key] === undefined) {
      missing.add(key);
      return "";
    }
    return context[key] ?? "";
  });
}

function renderTextValue(
  input: string,
  context: EmailTemplateContext,
  missing: Set<string>,
): string {
  return escapeHtml(renderVariables(input, context, missing));
}

function renderUrlValue(
  input: string,
  context: EmailTemplateContext,
  missing: Set<string>,
  warnings: string[],
  allowDataImage = false,
): string | null {
  const rendered = renderVariables(input, context, missing).trim();
  if (!rendered) return null;
  const url = safeUrl(rendered, allowDataImage);
  if (!url) {
    warnings.push("模板包含不受支持的链接地址，已跳过链接渲染。");
    return null;
  }
  return url;
}

function lineBreaks(value: string): string {
  return value.replace(/\r?\n/gu, "<br />");
}

function themeFromSettings(
  settings: EmailEditorDocument["settings"],
): RenderTheme {
  const radius = Number(settings.radius);
  const spacing = Number(settings.spacing);
  return {
    width: clamp(Number(settings.width) || 600, 320, 720),
    background: safeColor(settings.background, "#f4f1ea"),
    fontFamily:
      settings.fontFamily ||
      "'PingFang SC','Noto Sans SC','Microsoft YaHei',Arial,sans-serif",
    textColor: safeColor(settings.textColor, "#182420"),
    primaryColor: safeColor(settings.primaryColor, "#1d5343"),
    accentColor: safeColor(settings.accentColor, "#c7e6a3"),
    surfaceColor: safeColor(settings.surfaceColor, "#fffdf8"),
    mutedTextColor: safeColor(settings.mutedTextColor, "#6d756f"),
    borderColor: safeColor(settings.borderColor, "#ddd6c8"),
    buttonColor: safeColor(settings.buttonColor, "#1d5343"),
    buttonTextColor: safeColor(settings.buttonTextColor, "#fffdfa"),
    radius: clamp(Number.isFinite(radius) ? radius : 16, 0, 48),
    spacing: clamp(Number.isFinite(spacing) ? spacing : 16, 4, 48),
  };
}

function headingHtml(
  level: number,
  content: string,
  color: string,
  theme: RenderTheme,
  align: string,
): string {
  const fontSize = level === 1 ? 30 : level === 2 ? 24 : 20;
  return `<h${level} class="cf-heading cf-heading-${level}" style="margin:0;font-family:${escapeHtml(theme.fontFamily)};font-size:${fontSize}px;line-height:1.3;font-weight:600;color:${color};text-align:${align}">${content}</h${level}>`;
}

function logoWordmark(
  alt: string,
  context: EmailTemplateContext,
  missing: Set<string>,
  theme: RenderTheme,
  align: string,
  color = theme.primaryColor,
): string {
  const cleaned = alt.replace(/\s*logo\s*$/iu, "").trim();
  const fallbackOrg = context.organization_name?.trim() ?? "";
  const name =
    cleaned && !/^(?:邮件|图片|logo)$/iu.test(cleaned) ? cleaned : fallbackOrg;
  if (!name) return "";
  return `<div style="text-align:${align}"><p style="margin:0;font-family:${escapeHtml(theme.fontFamily)};font-size:20px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${color}">${escapeHtml(renderVariables(name, context, missing))}</p></div>`;
}

function styleWrapper(
  style: ResolvedStyle,
  paddingOverride?: string,
): string {
  const parts: string[] = [];
  if (style.background) parts.push(`background:${style.background}`);
  if (style.border) parts.push(`border:${style.border}`);
  if (style.borderLeft) parts.push(`border-left:${style.borderLeft}`);
  if (style.borderTop) parts.push(`border-top:${style.borderTop}`);
  if (style.borderRadius) parts.push(`border-radius:${style.borderRadius}px`);
  const padding = paddingOverride ?? style.padding;
  if (style.hasSurface || paddingOverride) parts.push(`padding:${padding}`);
  return parts.join(";");
}

function blockHtml(
  block: EmailBlock,
  context: EmailTemplateContext,
  missing: Set<string>,
  warnings: string[],
  theme: RenderTheme,
  options: EmailRenderOptions = {},
): string {
  const props = block.props;
  const textAlign = safeAlign(stringProp(props, "align", "left"));
  const recipe = styleRecipeFor(
    block.type,
    stringProp(props, "variant", ""),
  );
  const { style, custom, box, hasBox, linkButton, textColor, mutedColor } =
    resolveBlockStyle(block.type, props, theme);
  const richField = (key: string) => {
    const doc = richTextProp(props, key);
    return doc ? richTextWithBlockStyle(doc, custom) : null;
  };
  const fontClass = custom.fontSize === undefined ? "" : " cf-custom-font-size";
  const lineClass = custom.lineHeight === undefined ? "" : " cf-custom-line-height";

  switch (block.type) {
    case "heading": {
      const level = Math.min(3, Math.max(1, numberProp(props, "level", 1)));
      const rich = richField("text");
      const content = rich
        ? richTextToEmailInlineHtml(rich, context, missing)
        : renderTextValue(stringProp(props, "text"), context, missing);
      const richAlign = safeAlign(
        rich?.content[0]?.attrs?.textAlign ?? textAlign,
        textAlign,
      );
      const fontSize = custom.fontSize ?? Math.round(
        (level === 1 ? 30 : level === 2 ? 24 : 20) * style.sizeScale,
      );
      const headingWeight = fontWeightValue(custom.fontWeight) ?? 600;
      const headingTracking =
        custom.letterSpacing !== undefined
          ? `letter-spacing:${custom.letterSpacing}px;`
          : style.spaced
            ? "letter-spacing:0.08em;"
            : "";
      const heading = `<h${level} class="cf-heading cf-heading-${level}${fontClass}${lineClass}" style="margin:0;font-family:${escapeHtml(theme.fontFamily)};font-size:${fontSize}px;line-height:${custom.lineHeight ?? 1.3};font-weight:${headingWeight};color:${textColor};text-align:${richAlign};${style.italic ? "font-style:italic;" : ""}${headingTracking}">${content}</h${level}>`;
      const bar = style.underline
        ? `<div style="width:48px;height:4px;border-radius:2px;background:${theme.accentColor};margin:${
            richAlign === "center"
              ? "10px auto 0"
              : richAlign === "right"
                ? "10px 0 0 auto"
                : "10px auto 0 0"
          }"></div>`
        : "";
      return hasBox
        ? `<div style="${emailBoxStyle(box)}">${heading}${bar}</div>`
        : `${heading}${bar}`;
    }
    case "text": {
      const rich = richField("text");
      const fontSize = custom.fontSize ?? Math.round(15 * style.sizeScale);
      const lineHeight = custom.lineHeight ?? 1.8;
      const customWeight = fontWeightValue(custom.fontWeight);
      const typoStyle = `${customWeight ? `font-weight:${customWeight};` : ""}${custom.letterSpacing !== undefined ? `letter-spacing:${custom.letterSpacing}px;` : ""}`;
      const textStyle = `font-size:${fontSize}px;line-height:${lineHeight};color:${textColor};${typoStyle}${style.italic ? "font-style:italic;" : ""}${style.underline ? "text-decoration:underline;" : ""}`;
      const body = rich
        ? richTextToEmailParagraphsHtml(
            rich,
            context,
            missing,
            {
              fontFamily: theme.fontFamily,
              color: textColor,
              fontSize,
              lineHeight,
            },
            textAlign,
            "0 0 8px",
          )
        : `<p class="cf-text${fontClass}" style="margin:0;font-family:${escapeHtml(theme.fontFamily)};${textStyle};text-align:${textAlign}">${lineBreaks(renderTextValue(stringProp(props, "text"), context, missing))}</p>`;
      const content = `<div style="${style.italic ? "font-style:italic;" : ""}${style.underline ? "text-decoration:underline;" : ""}">${body}</div>`;
      return hasBox
        ? `<div style="${emailBoxStyle(box)}">${content}</div>`
        : content;
    }
    case "image":
    case "logo": {
      const source = renderUrlValue(
        stringProp(props, "src"),
        context,
        missing,
        warnings,
        options.allowDataImageUrls === true,
      );
      const alt = stringProp(
        props,
        "alt",
        block.type === "logo" ? "Logo" : "邮件图片",
      );
      if (!source) {
        const hasAssetReference = Boolean(stringProp(props, "assetId"));
        if (block.type === "logo") {
          const wordmark = logoWordmark(
            alt,
            context,
            missing,
            theme,
            textAlign,
            style.textColor,
          );
          warnings.push(
            hasAssetReference
              ? "Logo 引用的本机素材不可用，已使用文字品牌名代替。"
              : wordmark
                ? "Logo 未设置，邮件中使用文字品牌名代替。"
                : "Logo 未设置，已从邮件中省略。",
          );
          return style.hasSurface
            ? `<div style="${styleWrapper(style)}">${wordmark}</div>`
            : wordmark;
        }
        warnings.push(
          hasAssetReference
            ? "图片引用的本机素材不可用，已从邮件中省略。"
            : "图片未设置，已从邮件中省略。",
        );
        return "";
      }
      const width = Math.min(
        theme.width,
        Math.max(
          40,
          numberProp(props, "width", block.type === "logo" ? 200 : 320),
        ),
      );
      const image = `<img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}" width="${width}" style="display:inline-block;max-width:100%;height:auto;margin:0;border:0" />`;
      const link = renderUrlValue(
        stringProp(props, "link"),
        context,
        missing,
        warnings,
      );
      const inner = `<div style="text-align:${textAlign}">${link ? `<a href="${escapeHtml(link)}" style="text-decoration:none">${image}</a>` : image}</div>`;
      return style.hasSurface
        ? `<div style="${styleWrapper(style)}">${inner}</div>`
        : inner;
    }
    case "button": {
      const label = renderTextValue(
        stringProp(props, "text", "查看详情"),
        context,
        missing,
      );
      const url = renderUrlValue(
        stringProp(props, "url"),
        context,
        missing,
        warnings,
      );
      const buttonAlign = safeAlign(
        stringProp(props, "align", "center"),
        "center",
      );
      const fontSize = custom.fontSize ?? Math.round(15 * style.sizeScale);
      const className = linkButton ? "cf-button-link" : "cf-button-block";
      const buttonWeight = fontWeightValue(custom.fontWeight) ?? 600;
      const buttonTracking = custom.letterSpacing !== undefined ? `letter-spacing:${custom.letterSpacing}px;` : "";
      const elementStyle = `display:inline-block;font-family:${escapeHtml(theme.fontFamily)};font-size:${fontSize}px;line-height:${custom.lineHeight ?? 1.4};font-weight:${buttonWeight};${buttonTracking}text-align:center;text-decoration:${linkButton ? "underline" : "none"};color:${textColor};${emailBoxStyle(box)}`;
      const element = url
        ? `<a class="${className}" href="${escapeHtml(url)}" style="${elementStyle}">${label}</a>`
        : `<span class="${className}" style="${elementStyle}">${label}</span>`;
      if (!url) warnings.push("按钮没有可用链接，邮件中仅显示文字。");
      return `<div class="cf-button" style="text-align:${buttonAlign}">${element}</div>`;
    }
    case "divider": {
      const spacing = Math.max(4, numberProp(props, "spacing", theme.spacing));
      const spec = dividerSpec(recipe, theme);
      if (spec.short) {
        return `<div style="text-align:center;margin:${spacing}px 0"><div style="display:inline-block;width:56px;height:${spec.width}px;border-radius:2px;background:${spec.color}"></div></div>`;
      }
      return `<hr style="border:0;border-top:${spec.width}px ${spec.line} ${spec.color};margin:${spacing}px 0" />`;
    }
    case "info_card": {
      const title = renderTextValue(
        stringProp(props, "title", "信息卡片"),
        context,
        missing,
      );
      const fontSize = custom.fontSize ?? 14;
      const lineHeight = custom.lineHeight ?? 1.8;
      const rich = richField("body");
      const body = rich
        ? richTextToEmailParagraphsHtml(
            rich,
            context,
            missing,
            {
              fontFamily: theme.fontFamily,
              color: mutedColor,
              fontSize,
              lineHeight,
            },
            "left",
            "0 0 5px",
          )
        : `<p style="margin:0;font-family:${escapeHtml(theme.fontFamily)};font-size:${fontSize}px;line-height:${lineHeight};color:${mutedColor}">${lineBreaks(renderTextValue(stringProp(props, "body"), context, missing))}</p>`;
      const tableStyle = `width:100%;border-collapse:separate;${emailBoxStyle(box, false)}`;
      const radiusClass = custom.borderRadius === undefined ? "" : " cf-custom-radius";
      const cardWeight = fontWeightValue(custom.fontWeight) ?? 600;
      const cardTracking = custom.letterSpacing !== undefined ? `letter-spacing:${custom.letterSpacing}px;` : "";
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="cf-card-table${radiusClass}" style="${tableStyle}"><tr><td style="padding:${box.padding}"><p style="margin:0;font-family:${escapeHtml(theme.fontFamily)};font-size:${custom.fontSize ?? 15}px;line-height:${custom.lineHeight ?? 1.6};font-weight:${cardWeight};${cardTracking}color:${textColor}">${title}</p><div style="margin-top:10px">${body}</div></td></tr></table>`;
    }
    case "footer": {
      const rich = richField("text");
      const fontSize = custom.fontSize ?? Math.round(12 * style.sizeScale);
      const lineHeight = custom.lineHeight ?? 1.7;
      const footerWeight = fontWeightValue(custom.fontWeight);
      const footerTracking = custom.letterSpacing !== undefined ? `letter-spacing:${custom.letterSpacing}px;` : "";
      const textStyle = `color:${mutedColor};${footerWeight ? `font-weight:${footerWeight};` : ""}${footerTracking}${style.italic ? "font-style:italic;" : ""}${style.underline ? "text-decoration:underline;" : ""}`;
      const body = rich
        ? richTextToEmailParagraphsHtml(
            rich,
            context,
            missing,
            {
              fontFamily: theme.fontFamily,
              color: mutedColor,
              fontSize,
              lineHeight,
            },
            textAlign,
            "0",
          )
        : `<p class="cf-text${fontClass}" style="margin:0;font-family:${escapeHtml(theme.fontFamily)};font-size:${fontSize}px;line-height:${lineHeight};${textStyle};text-align:${textAlign}">${lineBreaks(renderTextValue(stringProp(props, "text"), context, missing))}</p>`;
      return hasBox
        ? `<div style="${emailBoxStyle(box)}">${body}</div>`
        : body;
    }
    case "spacer": {
      const height = Math.round(
        clamp(numberProp(props, "height", 24), 4, 160) * style.sizeScale,
      );
      if (style.hasSurface) {
        return `<div style="${styleWrapper(style)};min-height:${height}px;line-height:1">&#160;</div>`;
      }
      return `<div style="height:${height}px;line-height:1">&#160;</div>`;
    }
    default:
      warnings.push(
        `未知邮件模块 ${(block as { type?: string }).type ?? "unknown"}，已跳过。`,
      );
      return "";
  }
}

function blockText(
  block: EmailBlock,
  context: EmailTemplateContext,
  missing: Set<string>,
  warnings: string[],
): string {
  const props = block.props;
  switch (block.type) {
    case "heading":
    case "text":
    case "footer": {
      const rich = richTextProp(props, "text");
      if (rich) return richTextToPlainText(rich, context, missing);
      return renderVariables(stringProp(props, "text"), context, missing);
    }
    case "image":
    case "logo":
      return stringProp(props, "src")
        ? stringProp(props, "alt", "邮件图片")
        : "";
    case "button": {
      const label = renderVariables(
        stringProp(props, "text", "查看详情"),
        context,
        missing,
      );
      const url = renderUrlValue(
        stringProp(props, "url"),
        context,
        missing,
        warnings,
      );
      return url ? `${label}: ${url}` : label;
    }
    case "divider":
      return "---";
    case "info_card": {
      const title = renderVariables(
        stringProp(props, "title", "信息卡片"),
        context,
        missing,
      );
      const rich = richTextProp(props, "body");
      const body = rich
        ? richTextToPlainText(rich, context, missing)
        : renderVariables(stringProp(props, "body"), context, missing);
      return `${title}\n${body}`;
    }
    case "spacer":
      return "";
    default:
      return "";
  }
}

export function renderEmailTemplate(
  template: Pick<
    EmailTemplate,
    "subjectTemplate" | "preheaderText" | "editorDocument"
  >,
  context: EmailTemplateContext,
  options: EmailRenderOptions = {},
): EmailRenderResult {
  const missing = new Set<string>();
  const warnings: string[] = [];
  const document: EmailEditorDocument = template.editorDocument;
  const theme = themeFromSettings(document.settings);

  const body = document.blocks
    .map((block) =>
      blockHtml(block, context, missing, warnings, theme, options),
    )
    .filter(Boolean)
    .join(
      `<div style="height:${theme.spacing}px;line-height:1;font-size:1px">&#160;</div>`,
    );

  const subject = renderVariables(
    template.subjectTemplate,
    context,
    missing,
  )
    .replace(/\s+/gu, " ")
    .trim();
  const preheader = template.preheaderText
    ? renderVariables(template.preheaderText, context, missing).trim()
    : "";
  const text = document.blocks
    .map((block) => blockText(block, context, missing, warnings))
    .filter((value) => value.length > 0)
    .join("\n\n");

  const preheaderHtml = preheader
    ? `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;font-size:1px;line-height:1px">${escapeHtml(preheader)}</span>`
    : "";

  const html = `<!doctype html><html lang="zh-CN"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="x-apple-disable-message-reformatting" /><title>${escapeHtml(subject)}</title><style>
@media only screen and (max-width:480px){
  .cf-shell{padding:16px 10px !important}
  .cf-card{padding:20px 18px !important}
  .cf-heading-1:not(.cf-custom-font-size){font-size:24px !important}
  .cf-heading-1:not(.cf-custom-line-height){line-height:1.3 !important}
  .cf-heading-2:not(.cf-custom-font-size){font-size:21px !important}
  .cf-heading-3:not(.cf-custom-font-size){font-size:18px !important}
  .cf-text:not(.cf-custom-font-size){font-size:14px !important}
  .cf-button-block{display:block !important;width:100% !important;box-sizing:border-box !important}
  .cf-card-table:not(.cf-custom-radius){border-radius:10px !important}
}
</style></head><body style="margin:0;padding:0;background:${theme.background};color:${theme.textColor}">${preheaderHtml}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:${theme.background}"><tr><td align="center" class="cf-shell" style="padding:24px 12px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${theme.width}" style="width:100%;max-width:${theme.width}px;border-collapse:separate;background:${theme.surfaceColor};border:1px solid ${theme.borderColor};border-radius:${theme.radius}px"><tr><td class="cf-card" style="padding:28px 32px">${body}</td></tr></table></td></tr></table></body></html>`;

  return {
    subject,
    preheader,
    html,
    text,
    missingVariables: [...missing],
    warnings,
  };
}
