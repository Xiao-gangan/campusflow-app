import { readBlockStyleOverrides, type BlockStyleOverrides } from "../design/block-style.ts";
import type {
  DesignBlock,
  DesignDocument,
  DesignTheme,
} from "../contracts/design.ts";
import type { EditorDoc } from "../design/legacy-text.ts";
import { sanitizeRichTextMap } from "../design/rich-text.ts";
import { variablesForTarget } from "../design/variables.ts";

export type InviteContext = Record<string, string | undefined>;
export type InviteAlignment = "left" | "center" | "right";

type InviteSectionBase = {
  customStyle?: BlockStyleOverrides;
  blockId: string;
  richText?: Record<string, EditorDoc>;
  variant?: string;
};

const INVITE_FIELDS = new Map(
  variablesForTarget("invite_page").map((variable) => [
    variable.key,
    variable.label,
  ]),
);

export type InviteSection =
  | (InviteSectionBase & {
      kind: "logo";
      src: string | null;
      alt: string;
      width: number;
      align: InviteAlignment;
    })
  | (InviteSectionBase & {
      kind: "image";
      src: string | null;
      alt: string;
      width: number;
      align: InviteAlignment;
    })
  | (InviteSectionBase & {
      kind: "hero";
      eyebrow: string;
      title: string;
      subtitle: string;
      align: InviteAlignment;
    })
  | (InviteSectionBase & {
      kind: "event_info";
      title: string;
      date: string;
      time: string;
      location: string;
      note: string;
    })
  | (InviteSectionBase & {
      kind: "rsvp";
      title: string;
      description: string;
      confirmLabel: string;
      rescheduleLabel: string;
      secondaryAction?: "decline";
    })
  | (InviteSectionBase & {
      kind: "heading";
      text: string;
      level: number;
      align: InviteAlignment;
      variant: string;
    })
  | (InviteSectionBase & {
      kind: "text";
      text: string;
      align: InviteAlignment;
      variant: string;
    })
  | (InviteSectionBase & {
      kind: "info_card";
      title: string;
      body: string;
      variant: string;
    })
  | (InviteSectionBase & {
      kind: "button";
      text: string;
      url: string | null;
      align: InviteAlignment;
      variant: string;
    })
  | (InviteSectionBase & { kind: "divider"; spacing: number; variant: string })
  | (InviteSectionBase & { kind: "footer"; text: string; align: InviteAlignment })
  | (InviteSectionBase & { kind: "spacer"; height: number });

export type InvitePageModel = {
  target: "invite_page";
  theme: DesignTheme;
  meta: DesignDocument["meta"];
  sections: InviteSection[];
  missingVariables: string[];
  warnings: string[];
};

const VARIABLE_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

function renderText(
  input: string,
  context: InviteContext,
  missing: Set<string>,
): string {
  return input.replace(VARIABLE_PATTERN, (_match, key: string) => {
    const value = context[key];
    if (value === undefined) {
      missing.add(key);
      return "";
    }
    return value;
  });
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
  min: number,
  max: number,
): number {
  const value = Number(props[key]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function alignProp(
  props: Record<string, unknown>,
  fallback: InviteAlignment = "center",
): InviteAlignment {
  const value = props.align;
  return value === "left" || value === "right" || value === "center"
    ? value
    : fallback;
}

function safeHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function safeImageUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/iu.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    return ["http:", "https:", "blob:"].includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function imageUrl(
  props: Record<string, unknown>,
  missing: Set<string>,
  context: InviteContext,
  warnings: Set<string>,
): string | null {
  const raw = renderText(stringProp(props, "src"), context, missing).trim();
  if (!raw) return null;
  const url = safeImageUrl(raw);
  if (!url) warnings.add("邀请函包含不受支持的图片地址，已跳过图片。");
  return url;
}

function sectionFor(
  block: DesignBlock,
  context: InviteContext,
  missing: Set<string>,
  warnings: Set<string>,
): InviteSection | null {
  const props = block.props;
  const text = (key: string, fallback = "") =>
    renderText(stringProp(props, key, fallback), context, missing);

  switch (block.type) {
    case "logo":
      return {
        blockId: block.id,
        kind: "logo",
        src: imageUrl(props, missing, context, warnings),
        alt: text("alt", "组织 Logo"),
        width: numberProp(props, "width", 160, 48, 600),
        align: alignProp(props),
      };
    case "image":
      return {
        blockId: block.id,
        kind: "image",
        src: imageUrl(props, missing, context, warnings),
        alt: text("alt", "邀请图片"),
        width: numberProp(props, "width", 480, 48, 960),
        align: alignProp(props),
      };
    case "hero":
      return {
        blockId: block.id,
        kind: "hero",
        eyebrow: text("eyebrow"),
        title: text("title", "邀请函"),
        subtitle: text("subtitle"),
        align: alignProp(props),
      };
    case "event_info":
      return {
        blockId: block.id,
        kind: "event_info",
        title: text("title", "活动信息"),
        date: text("date"),
        time: text("time"),
        location: text("location"),
        note: text("note"),
      };
    case "rsvp":
      return {
        blockId: block.id,
        kind: "rsvp",
        title: text("title", "确认出席"),
        description: text("description"),
        confirmLabel: text("confirmLabel", "确认参加"),
        rescheduleLabel: text("rescheduleLabel", "申请调整时间"),
        ...(props.secondaryAction === "decline" ? { secondaryAction: "decline" as const } : {}),
      };
    case "heading":
      return {
        blockId: block.id,
        kind: "heading",
        text: text("text"),
        level: Math.round(numberProp(props, "level", 1, 1, 3)),
        align: alignProp(props, "left"),
        variant: stringProp(props, "variant", "plain"),
      };
    case "text":
      return {
        blockId: block.id,
        kind: "text",
        text: text("text"),
        align: alignProp(props, "left"),
        variant: stringProp(props, "variant", "default"),
      };
    case "info_card":
      return {
        blockId: block.id,
        kind: "info_card",
        title: text("title", "信息卡片"),
        body: text("body"),
        variant: stringProp(props, "variant", "default"),
      };
    case "button": {
      const rawUrl = renderText(stringProp(props, "url"), context, missing).trim();
      let url: string | null = null;
      if (rawUrl) {
        url = safeHttpUrl(rawUrl);
        if (!url) {
          warnings.add("邀请函包含不受支持的链接地址，已跳过链接。");
        }
      }
      return {
        blockId: block.id,
        kind: "button",
        text: text("text", "查看详情"),
        url,
        align: alignProp(props),
        variant: stringProp(props, "variant", "solid"),
      };
    }
    case "divider":
      return {
        blockId: block.id,
        kind: "divider",
        spacing: numberProp(props, "spacing", 20, 4, 80),
        variant: stringProp(props, "variant", "solid"),
      };
    case "footer":
      return {
        blockId: block.id,
        kind: "footer",
        text: text("text"),
        align: alignProp(props),
      };
    case "spacer":
      return {
        blockId: block.id,
        kind: "spacer",
        height: numberProp(props, "height", 24, 4, 160),
      };
    default:
      warnings.add(`未知邀请函模块 ${block.type}，已跳过。`);
      return null;
  }
}

export function buildInvitePage(
  document: DesignDocument,
  context: InviteContext = {},
): InvitePageModel {
  if (document.target !== "invite_page") {
    throw new Error("design_target_not_invite_page");
  }

  const missing = new Set<string>();
  const warnings = new Set<string>();
  const sections: InviteSection[] = [];

  for (const block of document.blocks) {
    const section = sectionFor(block, context, missing, warnings);
    if (section) {
      const richText = sanitizeRichTextMap(block.props.richText, INVITE_FIELDS);
      const variant =
        typeof block.props.variant === "string"
          ? block.props.variant
          : "plain";
      const customStyle = readBlockStyleOverrides(block.type, block.props);
      sections.push({
        ...(Object.keys(customStyle).length ? { customStyle } : {}),
        ...section,
        variant,
        ...(Object.keys(richText).length > 0 ? { richText } : {}),
      });
    }
  }

  return {
    target: "invite_page",
    theme: document.theme,
    meta: document.meta,
    sections,
    missingVariables: [...missing],
    warnings: [...warnings],
  };
}
