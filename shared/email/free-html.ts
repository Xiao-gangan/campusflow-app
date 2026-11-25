import type { DesignDocument, DesignTarget } from "../contracts/design.ts";
import {
  variablesForTarget,
  type DesignVariable,
} from "../design/variables.ts";
import type {
  EmailRenderOptions,
  EmailRenderResult,
  EmailTemplateContext,
} from "./template-renderer.ts";

export type FreeHtmlFontKey = "inherit" | "sans" | "serif" | "mono";

export const FREE_HTML_FONT_PRESETS: Record<
  FreeHtmlFontKey,
  { label: string; css: string }
> = {
  inherit: {
    label: "保持原设计字体",
    css: "",
  },
  sans: {
    label: "现代无衬线",
    css: "'PingFang SC','Noto Sans SC','Microsoft YaHei',Arial,sans-serif",
  },
  serif: {
    label: "典雅衬线",
    css: "'Songti SC','Noto Serif SC',Georgia,'Times New Roman',serif",
  },
  mono: {
    label: "极简等宽",
    css: "ui-monospace,SFMono-Regular,Menlo,Consolas,'PingFang SC',monospace",
  },
};

export const MAX_FREE_HTML_LENGTH = 48_000;

export const STARTER_FREE_EMAIL_HTML = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background-color:#f1eeeb;color:#302321">
  <tr>
    <td align="center" style="padding:24px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" style="width:100%;max-width:620px;border-collapse:collapse;background-color:#fffdfa;border:1px solid #e5dad3">
        <tr>
          <td style="height:4px;background-color:#8a3d3c;font-size:0;line-height:0">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:36px 28px 18px;text-align:center">
            <div style="font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:14px;line-height:22px;font-weight:600;letter-spacing:1.2px;color:#49666a">{{organization_name}}</div>
            <div style="margin-top:2px;font-family:Arial,'PingFang SC',sans-serif;font-size:10px;line-height:16px;letter-spacing:2px;color:#7c8c8f">CAMPUS RECRUITMENT · INVITATION</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 28px 0;text-align:center">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:20px;letter-spacing:4px;color:#8a3d3c">YOU’RE INVITED</div>
            <div style="margin-top:12px;font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:30px;line-height:42px;font-weight:700;letter-spacing:2px;color:#241b19">{{department}}面试邀请</div>
            <div style="margin-top:6px;font-family:Georgia,'Times New Roman',serif;font-size:10px;line-height:16px;letter-spacing:3px;color:#6e5953">INTERVIEW INVITATION</div>
            <div style="width:48px;height:1px;margin:18px auto 0;background-color:#c7b8ae;font-size:0;line-height:0">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 36px 0;text-align:center">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;line-height:18px;letter-spacing:4px;color:#8a3d3c">TO</div>
            <div style="margin-top:6px;font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:24px;line-height:36px;font-weight:600;letter-spacing:2px;color:#302321">{{candidate_name}}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 36px 0;text-align:center">
            <div style="font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:15px;line-height:27px;color:#6e625e">
              很高兴通知你进入本轮面试<br />
              我们诚挚邀请你参加<br />
              <strong style="font-weight:600;color:#302321">{{organization_name}} · {{department}} 面试交流</strong><br />
              一封专属于你的面试邀请函已经准备好了
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;border-top:1px solid #c7b8ae;border-bottom:1px solid #c7b8ae">
              <tr>
                <td width="44%" valign="middle" style="padding:22px 14px 22px 6px">
                  <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;line-height:16px;letter-spacing:2.5px;color:#8a3d3c">SCHEDULE</div>
                  <div style="margin-top:6px;font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:17px;line-height:26px;font-weight:600;color:#241b19">{{interview_time}}</div>
                </td>
                <td width="56%" valign="middle" style="padding:22px 6px 22px 18px;border-left:1px solid #c7b8ae">
                  <div style="font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:15px;line-height:24px;font-weight:600;color:#302321">{{interview_location}}</div>
                  <div style="margin-top:6px;font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:12px;line-height:20px;color:#8a7770">{{personal_note}}<br />具体注意事项与确认出席请在专属邀请函页面查看</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 28px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
              <tr>
                <td align="center" bgcolor="#8a3d3c" style="border-radius:3px;background-color:#8a3d3c">
                  <a href="{{rsvp_link}}" style="display:inline-block;min-width:220px;padding:14px 28px;color:#fffdfa;text-decoration:none;font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:15px;line-height:22px;font-weight:600;letter-spacing:1px">开启我的邀请函 →<br /><span style="font-family:Arial,sans-serif;font-size:9px;line-height:15px;font-weight:400;letter-spacing:2px;color:#f3e5e3">OPEN MY INVITATION</span></a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 34px;text-align:center">
            <div style="width:36px;height:1px;margin:0 auto 14px;background-color:#c7b8ae;font-size:0;line-height:0">&nbsp;</div>
            <div style="font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:12px;line-height:20px;color:#6e625e">{{organization_name}} · 招新工作组</div>
            <div style="font-family:Arial,sans-serif;font-size:9px;line-height:17px;letter-spacing:1.8px;color:#8a7770">CAMPUSFLOW · INVITATION LETTER</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

export const STARTER_FREE_INVITE_HTML = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background-color:#f1eeeb;color:#302321">
  <tr>
    <td align="center" style="padding:28px 14px 20px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:100%;max-width:640px;border-collapse:collapse;background-color:#fffdfa;border:1px solid #e5dad3">
        <tr>
          <td style="height:4px;background-color:#8a3d3c;font-size:0;line-height:0">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:36px 28px 16px;text-align:center">
            <div style="font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:14px;line-height:22px;font-weight:600;letter-spacing:1.4px;color:#49666a">{{organization_name}}</div>
            <div style="margin-top:2px;font-family:Arial,'PingFang SC',sans-serif;font-size:10px;line-height:16px;letter-spacing:2px;color:#7c8c8f">OFFICIAL INTERVIEW INVITATION</div>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 28px 0;text-align:center">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:20px;letter-spacing:4px;color:#8a3d3c">YOU’RE INVITED</div>
            <div style="margin-top:12px;font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:32px;line-height:44px;font-weight:700;letter-spacing:2px;color:#241b19">{{department}}面试邀请函</div>
            <div style="margin-top:6px;font-family:Georgia,'Times New Roman',serif;font-size:10px;line-height:16px;letter-spacing:3px;color:#6e5953">PERSONALIZED INVITATION LETTER</div>
            <div style="width:48px;height:1px;margin:18px auto 0;background-color:#c7b8ae;font-size:0;line-height:0">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 32px 0;text-align:center">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;line-height:18px;letter-spacing:4px;color:#8a3d3c">TO</div>
            <div style="margin-top:6px;font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:26px;line-height:38px;font-weight:600;letter-spacing:2px;color:#302321">{{candidate_name}}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px 0;text-align:center">
            <div style="font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:15px;line-height:28px;color:#6e625e">
              感谢你对 <strong style="font-weight:600;color:#302321">{{organization_name}}</strong> 的关注与信任<br />
              我们认真阅读了你的报名信息，诚挚邀请你参加 <strong style="font-weight:600;color:#302321">{{department}}</strong> 面试交流<br />
              期待与你面对面聊聊校园故事与未来想法
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;border-top:1px solid #c7b8ae;border-bottom:1px solid #c7b8ae">
              <tr>
                <td width="46%" valign="middle" style="padding:22px 14px 22px 6px">
                  <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;line-height:16px;letter-spacing:2.5px;color:#8a3d3c">TIME &amp; DATE</div>
                  <div style="margin-top:6px;font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:17px;line-height:26px;font-weight:600;color:#241b19">{{interview_time}}</div>
                </td>
                <td width="54%" valign="middle" style="padding:22px 6px 22px 18px;border-left:1px solid #c7b8ae">
                  <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;line-height:16px;letter-spacing:2.5px;color:#8a3d3c">LOCATION</div>
                  <div style="margin-top:6px;font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:15px;line-height:24px;font-weight:600;color:#302321">{{interview_location}}</div>
                  <div style="margin-top:6px;font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:12px;line-height:20px;color:#8a7770">{{personal_note}}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px 32px;text-align:center">
            <div style="font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:13px;line-height:22px;color:#8a3d3c">请在下方确认你的出席状态 ↓</div>
            <div style="width:36px;height:1px;margin:16px auto 14px;background-color:#c7b8ae;font-size:0;line-height:0">&nbsp;</div>
            <div style="font-family:'PingFang SC','Noto Sans SC',Arial,sans-serif;font-size:12px;line-height:20px;color:#6e625e">{{organization_name}} · 招新工作组</div>
            <div style="font-family:Arial,sans-serif;font-size:9px;line-height:17px;letter-spacing:1.8px;color:#8a7770">CAMPUSFLOW · INVITATION PAGE</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

export function starterFreeHtml(target: DesignTarget): string {
  return target === "invite_page"
    ? STARTER_FREE_INVITE_HTML
    : STARTER_FREE_EMAIL_HTML;
}

const VARIABLE_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/giu;

const DROP_WITH_CONTENT_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "textarea",
  "button",
  "select",
  "option",
  "svg",
  "math",
  "link",
  "meta",
  "base",
  "noscript",
  "template",
  "head",
  "title",
]);

const ALLOWED_TAGS = new Set([
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "div",
  "p",
  "span",
  "a",
  "img",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "small",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "blockquote",
  "center",
]);

const VOID_TAGS = new Set(["br", "hr", "img"]);
const INVITE_TAGS = new Set(["article", "header", "section", "footer"]);
const PRESET_IMAGE_PATH = /^\/presets\/[a-z0-9._-]+\.(?:webp|png|jpg|jpeg)$/u;
const INVITE_CSS_FUNCTIONS = new Set([
  "calc", "clamp", "min", "max", "minmax", "repeat", "fit-content", "var",
  "rgb", "rgba", "hsl", "hsla", "color-mix", "linear-gradient", "radial-gradient", "conic-gradient",
  "blur", "brightness", "contrast", "grayscale", "hue-rotate", "invert", "opacity", "saturate", "sepia",
]);
const simpleCssLength = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem|%|vw|vh)?`;
const simpleInviteTransform = new RegExp(String.raw`^(?:none|(?:\s*(?:rotate\([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:deg|rad|turn)\)|translate(?:x|y)\(\s*${simpleCssLength}\s*\)|translate\(\s*${simpleCssLength}(?:\s*,\s*${simpleCssLength})?\s*\)))+)$`, "iu");

const GLOBAL_ATTRS = new Set([
  "style",
  "align",
  "valign",
  "width",
  "height",
  "bgcolor",
  "dir",
  "title",
  "role",
  "class",
]);

const TAG_ATTRS: Record<string, ReadonlySet<string>> = {
  table: new Set(["cellpadding", "cellspacing", "border"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "border"]),
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function decodeBasicEntities(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function isPureVariable(value: string): boolean {
  return /^\{\{\s*[a-z0-9_]+\s*\}\}$/iu.test(value.trim());
}

function isSafeUrlValue(
  value: string,
  allowDataImages: boolean,
  allowAnchor = true,
  allowPresetImage = false,
): boolean {
  const trimmed = decodeBasicEntities(value).trim();
  if (!trimmed) return false;
  if (isPureVariable(trimmed)) return true;
  if (allowPresetImage && PRESET_IMAGE_PATH.test(trimmed)) return true;
  if (allowAnchor && trimmed.startsWith("#")) return true;
  if (
    allowDataImages &&
    /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/iu.test(trimmed)
  ) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function sanitizeInlineStyle(rawStyle: string, target: DesignTarget = "email"): {
  style: string;
  stripped: boolean;
} {
  let stripped = false;
  const declarations = rawStyle.split(";");
  const safe: string[] = [];
  for (const part of declarations) {
    const colon = part.indexOf(":");
    if (colon < 1) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    const val = part.slice(colon + 1).trim();
    if (!prop || !val || !/^[a-z-]+$/u.test(prop)) {
      stripped = true;
      continue;
    }
    const lowerVal = val.toLowerCase();
    const invite = target === "invite_page";
    const asset = invite && prop === "background-image" ? /^url\(\s*(["']?)([^"'()\s]+)\1\s*\)$/iu.exec(val) : null;
    if (asset && PRESET_IMAGE_PATH.test(asset[2])) {
      safe.push(`background-image:url("${asset[2]}")`);
      continue;
    }
    if (
      prop === "behavior" ||
      prop === "-moz-binding" ||
      prop === "position" ||
      /[\\<>]|\/\*/u.test(val) ||
      lowerVal.includes("expression(") ||
      lowerVal.includes("javascript:") ||
      lowerVal.includes("vbscript:") ||
      lowerVal.includes("@import") ||
      /\burl\s*\(/iu.test(val) ||
      (invite && (prop === "transform"
        ? !simpleInviteTransform.test(val)
        : [...lowerVal.matchAll(/([a-z][a-z0-9-]*)\s*\(/gu)].some((match) => !INVITE_CSS_FUNCTIONS.has(match[1]))))
    ) {
      stripped = true;
      continue;
    }
    safe.push(`${prop}:${val}`);
  }
  return { style: safe.join(";"), stripped };
}

function extractBodyContent(raw: string): { html: string; bodyStyle: string } {
  const bodyMatch = /<body\b([^>]*)>([\s\S]*?)<\/body>/iu.exec(raw);
  if (!bodyMatch) {
    return {
      html: raw
        .replace(/<!doctype[^>]*>/giu, "")
        .replace(/<\/?html\b[^>]*>/giu, "")
        .trim(),
      bodyStyle: "",
    };
  }
  const attrs = bodyMatch[1] ?? "";
  const styleMatch = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/iu.exec(attrs);
  const bodyStyle = (styleMatch?.[1] ?? styleMatch?.[2] ?? "").trim();
  return { html: (bodyMatch[2] ?? "").trim(), bodyStyle };
}

function sanitizeTagAttributes(
  tag: string,
  rawAttrs: string,
  allowDataImages: boolean,
  target: DesignTarget,
  warnings: Set<string>,
): string {
  const allowedExtra = TAG_ATTRS[tag];
  const attrPattern =
    /([a-z][a-z0-9:_-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/giu;
  const attrs: string[] = [];
  let hasTargetBlank = false;
  const rel = new Set<string>();

  for (const match of rawAttrs.matchAll(attrPattern)) {
    const name = (match[1] ?? "").toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!name) continue;
    if (name.startsWith("on")) {
      warnings.add("已移除不安全的脚本事件属性。");
      continue;
    }
    if (!GLOBAL_ATTRS.has(name) && !allowedExtra?.has(name)) {
      continue;
    }
    if (name === "style") {
      const cleaned = sanitizeInlineStyle(decodeBasicEntities(value), target);
      if (cleaned.stripped) {
        warnings.add("已过滤不受支持的 CSS 规则（如定位、脚本表达式或外部 url()）。");
      }
      if (cleaned.style) {
        attrs.push(`style="${escapeAttr(cleaned.style)}"`);
      }
      continue;
    }
    if (name === "href") {
      if (!isSafeUrlValue(value, false, true)) {
        warnings.add("已移除不安全的链接协议。");
        continue;
      }
      attrs.push(`href="${escapeAttr(decodeBasicEntities(value).trim())}"`);
      continue;
    }
    if (name === "src") {
      if (!isSafeUrlValue(value, allowDataImages, false, target === "invite_page")) {
        warnings.add("已移除不受支持的图片地址。");
        continue;
      }
      attrs.push(`src="${escapeAttr(decodeBasicEntities(value).trim())}"`);
      continue;
    }
    if (name === "target") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "_blank") {
        hasTargetBlank = true;
        attrs.push('target="_blank"');
      }
      continue;
    }
    if (name === "rel") {
      for (const token of value.toLowerCase().split(/\s+/u)) {
        if (["nofollow", "noopener", "noreferrer", "sponsored", "ugc"].includes(token)) rel.add(token);
      }
      continue;
    }
    if (name === "class") {
      const safeClass = value
        .split(/\s+/u)
        .filter((token) => /^[a-z0-9_-]{1,40}$/iu.test(token))
        .join(" ");
      if (safeClass) attrs.push(`class="${safeClass}"`);
      continue;
    }
    attrs.push(`${name}="${escapeAttr(decodeBasicEntities(value))}"`);
  }

  if (tag === "a" && hasTargetBlank) {
    rel.add("noopener");
    rel.add("noreferrer");
  }
  if (tag === "a" && rel.size) attrs.push(`rel="${[...rel].join(" ")}"`);
  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

export type SanitizeEmailHtmlResult = {
  html: string;
  strippedTags: string[];
  warnings: string[];
};

export function sanitizeEmailHtml(
  rawHtml: string,
  options: { allowDataImages?: boolean; target?: DesignTarget } = {},
): SanitizeEmailHtmlResult {
  const allowDataImages = options.allowDataImages ?? false;
  const target = options.target ?? "email";
  const warnings = new Set<string>();
  const strippedTags = new Set<string>();

  const bounded =
    rawHtml.length > MAX_FREE_HTML_LENGTH
      ? (warnings.add(`HTML 内容超过 ${MAX_FREE_HTML_LENGTH} 字符，已自动截断。`),
        rawHtml.slice(0, MAX_FREE_HTML_LENGTH))
      : rawHtml;

  const { html: extracted, bodyStyle } = extractBodyContent(bounded);

  let working = extracted.replace(/<!--[\s\S]*?-->/gu, "");

  for (const tag of DROP_WITH_CONTENT_TAGS) {
    const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "giu");
    if (paired.test(working)) {
      strippedTags.add(tag);
      working = working.replace(paired, "");
    }
    const single = new RegExp(`<\\/?${tag}\\b[^>]*>`, "giu");
    if (single.test(working)) {
      strippedTags.add(tag);
      working = working.replace(single, "");
    }
  }

  if (strippedTags.size > 0) {
    warnings.add(
      `已按${target === "email" ? "邮件" : "邀请函"}安全规范移除标签：${[...strippedTags].join("、")}。`,
    );
  }

  const tagPattern = /<(\/?)([a-z][a-z0-9:-]*)((?:"[^"]*"|'[^']*'|[^"'<>])*)>/giu;
  const safeText = (text: string) => text.replaceAll("<", "&lt;");
  let offset = 0;
  const parts: string[] = [];
  for (const match of working.matchAll(tagPattern)) {
    const [token, closing, rawTag, rawAttrs] = match;
    parts.push(safeText(working.slice(offset, match.index)));
    offset = match.index + token.length;
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag) && !(target === "invite_page" && INVITE_TAGS.has(tag))) {
      strippedTags.add(tag);
      continue;
    }
    if (closing) {
      if (!VOID_TAGS.has(tag)) parts.push(`</${tag}>`);
      continue;
    }
    const selfClosing = /\/\s*$/u.test(rawAttrs) && VOID_TAGS.has(tag);
    const attrs = sanitizeTagAttributes(tag, rawAttrs.replace(/\/\s*$/u, ""), allowDataImages, target, warnings);
    parts.push(`<${tag}${attrs}${selfClosing ? " /" : ""}>`);
  }
  parts.push(safeText(working.slice(offset)));

  let result = parts.join("").trim();

  if (bodyStyle && result && !/^<table\b[^>]*background-color/iu.test(result)) {
    const cleanedBody = sanitizeInlineStyle(bodyStyle, target);
    const bgMatch = /background(?:-color)?\s*:\s*([^;]+)/iu.exec(cleanedBody.style);
    if (bgMatch) {
      result = `<div style="${escapeAttr(cleanedBody.style)}">${result}</div>`;
    }
  }

  return {
    html: result,
    strippedTags: [...strippedTags],
    warnings: [...warnings],
  };
}

export type EmailHtmlInspection = {
  knownVariables: DesignVariable[];
  unknownVariables: string[];
  hasInviteLink: boolean;
  hasOnboardingLink: boolean;
};

export function inspectEmailHtmlVariables(
  html: string,
  target: DesignTarget = "email",
): EmailHtmlInspection {
  const emailVars = variablesForTarget(target);
  const byKey = new Map(emailVars.map((item) => [item.key, item]));
  const foundKnown = new Map<string, DesignVariable>();
  const foundUnknown = new Set<string>();

  for (const match of html.matchAll(VARIABLE_PATTERN)) {
    const key = (match[1] ?? "").trim();
    if (!key) continue;
    const variable = byKey.get(key);
    if (variable) foundKnown.set(key, variable);
    else foundUnknown.add(key);
  }

  const hasInviteLink =
    /href\s*=\s*(?:"[^"]*\{\{\s*rsvp_link\s*\}\}[^"]*"|'[^']*\{\{\s*rsvp_link\s*\}\}[^']*')/iu.test(
      html,
    );
  const hasOnboardingLink =
    /href\s*=\s*(?:"[^"]*\{\{\s*onboarding_link\s*\}\}[^"]*"|'[^']*\{\{\s*onboarding_link\s*\}\}[^']*')/iu.test(
      html,
    );

  return {
    knownVariables: [...foundKnown.values()],
    unknownVariables: [...foundUnknown],
    hasInviteLink,
    hasOnboardingLink,
  };
}

export function resolveFreeHtmlFontCss(fontFamily: string | undefined): string {
  if (!fontFamily || fontFamily === "inherit") return "";
  if (Object.hasOwn(FREE_HTML_FONT_PRESETS, fontFamily)) {
    return FREE_HTML_FONT_PRESETS[fontFamily as FreeHtmlFontKey].css;
  }
  return fontFamily.replace(/[;<>"']/gu, "").trim();
}

function renderTemplateText(
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

function substituteVariablesInHtml(
  sanitizedHtml: string,
  context: EmailTemplateContext,
  missing: Set<string>,
  warnings: string[],
  allowDataImages: boolean,
  target: DesignTarget,
): string {
  // First substitute variables inside href/src attributes with strict URL validation.
  const withAttrs = sanitizedHtml.replace(
    /\b(href|src)="([^"]*\{\{[^"]*)"/giu,
    (_match, attr: string, rawVal: string) => {
      const replaced = renderTemplateText(rawVal, context, missing).trim();
      const isSrc = attr.toLowerCase() === "src";
      if (!replaced) {
        if (!isSrc) warnings.push("部分链接变量为空，已隐藏链接跳转。");
        return "";
      }
      if (!isSafeUrlValue(replaced, isSrc && allowDataImages, !isSrc, isSrc && target === "invite_page")) {
        warnings.push("变量替换后的链接地址不受支持，已跳过链接渲染。");
        return "";
      }
      return `${attr}="${escapeAttr(replaced)}"`;
    },
  );

  // Then substitute remaining variables in text content with HTML escaping.
  return withAttrs.replace(VARIABLE_PATTERN, (_match, key: string) => {
    if (context[key] === undefined) {
      missing.add(key);
      return "";
    }
    return escapeHtml(context[key] ?? "");
  });
}

function htmlToPlainText(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/giu, (_m, href: string, text: string) => {
        const cleanText = text.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
        return cleanText ? `${cleanText}: ${href}\n` : `${href}\n`;
      })
      .replace(/<br\s*\/?>/giu, "\n")
      .replace(/<\/(?:p|div|tr|h[1-4]|li|table|blockquote)>/giu, "\n")
      .replace(/<[^>]+>/gu, "")
      .replace(/&nbsp;/giu, " ")
      .replace(/[ \t]+\n/gu, "\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trim(),
  );
}

export function renderFreeEmailHtml(
  document: DesignDocument,
  context: EmailTemplateContext = {},
  options: EmailRenderOptions = {},
): EmailRenderResult {
  const missing = new Set<string>();
  const warnings: string[] = [];
  const allowDataImages = options.allowDataImageUrls ?? false;

  const subject = renderTemplateText(
    document.meta.subjectTemplate?.trim() || "CampusFlow 邮件",
    context,
    missing,
  ).trim() || "CampusFlow 邮件";

  const preheader = renderTemplateText(
    document.meta.preheaderText?.trim() || "",
    context,
    missing,
  ).trim();

  const rawHtml =
    document.customHtml?.html?.trim() || starterFreeHtml(document.target);
  const sanitized = sanitizeEmailHtml(rawHtml, { allowDataImages, target: document.target });
  warnings.push(...sanitized.warnings);

  const interpolated = substituteVariablesInHtml(
    sanitized.html,
    context,
    missing,
    warnings,
    allowDataImages,
    document.target,
  );
  const renderedBody = sanitizeEmailHtml(interpolated, { allowDataImages, target: document.target });
  warnings.push(...renderedBody.warnings);
  const interpolatedBody = renderedBody.html;

  const fontCss = resolveFreeHtmlFontCss(document.customHtml?.fontFamily);
  const fontOverrideStyle = fontCss
    ? `<style>body,table,td,th,div,p,span,a,h1,h2,h3,h4,li,strong{font-family:${fontCss} !important;}</style>`
    : "";

  const preheaderHtml = preheader
    ? `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;font-size:1px;line-height:1px">${escapeHtml(preheader)}</span>`
    : "";

  const html = `<!doctype html><html lang="zh-CN"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(subject)}</title>${fontOverrideStyle}</head><body style="margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">${preheaderHtml}${interpolatedBody}</body></html>`;

  return {
    subject,
    preheader,
    html,
    text: htmlToPlainText(interpolatedBody),
    missingVariables: [...missing],
    warnings: [...new Set(warnings)],
  };
}

export function buildExternalAiPromptTemplate(
  requirement = "",
  target: DesignTarget = "email",
): string {
  const vars = variablesForTarget(target)
    .filter((item) => target === "email" || item.key !== "rsvp_link")
    .map((item) => `- \`{{${item.key}}}\`：${item.label}（示例：${item.sample}）`)
    .join("\n");

  if (target === "invite_page") {
    const goal = requirement.trim()
      ? requirement.trim()
      : "设计一张正式、克制、富有信笺仪式感的高校学生组织专属面试邀请函网页";

    return `你是一位擅长移动端与桌面端邀请函设计的视觉设计师。请帮我设计一份可直接导入 CampusFlow 邀请函网页的 HTML 模板。

【设计需求】
${goal}

【必须严格遵守的 CampusFlow 邀请函网页约束】
1. 只输出 HTML 代码，使用响应式居中布局。所有样式写在行内 \`style="..."\` 中，可使用 Grid、Flex、clamp()、渐变和阴影。
2. 禁止脚本、样式表、iframe、表单、事件属性、定位和外部 CSS。CSS 图片只允许在 background-image 引用站内 /presets/ 的单个图片文件，可选 invitation-autumn-envelope.webp、invitation-pine-waxseal.webp、invitation-forest-envelope.webp。
3. 不要写死真实候选人信息，请优先使用以下 CampusFlow 系统变量：
${vars}
4. **重要**：候选人真实的「确认出席 / 申请改期 / 留言答复」交互卡片会由 CampusFlow 系统自动挂载在邀请函正文正下方，请**不要**自己伪造表单或假确认按钮（可在页面底部用一句轻引导语提示候选人「请在下方确认出席状态 ↓」）。
5. 视觉与排版建议：
   - 保持低饱和、高对比度的 60-30-10 配色（推荐温润纸面底色 + 1 个沉稳主色），避免高饱和跨色相渐变；
   - 用宽字距眉标、衬线主标题和留白建立层级。姓名和日程可分成两列，使用细竖线分隔。用底图时把文字放在信纸空白处，给装饰留出空间。

请直接输出完整的 HTML 代码。`;
  }

  const goal = requirement.trim()
    ? requirement.trim()
    : "设计一封正式、克制、富有信笺仪式感的高校学生组织面试邀请邮件";

  return `你是一位擅长邮件排版的视觉设计师。请帮我设计一封可直接导入 CampusFlow 邮件系统的 HTML 邮件模板。

【设计需求】
${goal}

【必须严格遵守的 CampusFlow 格式约束】
1. 只输出纯 HTML 代码（不需要 Markdown 解释文字），使用邮箱客户端兼容的 \`<table>\` 居中布局（最大宽度 600–640px），所有样式必须写在行内 \`style="..."\` 中。
2. 严禁使用 \`<script>\`、\`<style>\`、\`<iframe>\`、\`<form>\`、\`<svg>\`、\`on*\` 事件、外部 CSS、CSS \`url()\` 或 \`position: absolute/fixed\`。
3. 不要写死真实候选人信息，请优先使用以下 CampusFlow 系统变量：
${vars}
4. 邮件内无法直接提交出席确认，主按钮必须使用 \`<a href="{{rsvp_link}}">\` 跳转到候选人的专属邀请函网页（如文案写「开启我的邀请函 →」「查看邀请函并确认出席」）。如为入组注册邮件，链接改用 \`{{onboarding_link}}\`。
5. 视觉与排版建议：
   - 保持低饱和、高对比度的 60-30-10 配色（推荐温润纸面底色 + 1 个沉稳主色），避免高饱和跨色相渐变；
   - 可大胆发挥 HTML 的版式优势：如顶部 3–4px 主色细压顶条、宽字距英文眉标、中英混排、左右两栏大数字日程区（上下 1px 细线 + 中间竖线）、双行实心主按钮、克制留白与轻盈页脚；
   - 兼顾桌面端与手机端阅读体验，文字字号清晰、留白充足。

请直接输出完整的 HTML 代码。`;
}
