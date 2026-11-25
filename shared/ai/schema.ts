import type {
  DesignBlock,
  DesignBlockType,
  DesignDocument,
  DesignTheme,
  DesignTarget,
} from "../contracts/design.ts";
import { createBlock } from "../domain/design.ts";
import { defaultTheme, moduleDefinition } from "../design/modules.ts";
import {
  STYLE_RECIPE_IDS,
  STYLE_RECIPES,
  normalizeVariant,
} from "../design/style-recipes.ts";
import {
  THEME_PRESETS,
  applyThemePreset,
  type ThemePresetId,
} from "../design/theme-presets.ts";
import { variablesForTarget } from "../design/variables.ts";
import { buttonLinkValue } from "../design/button-links.ts";
import {
  BLOCK_STYLE_FIELDS,
  blockStyleKeys,
  isBlockStyleKey,
  parseBlockStyleValue,
  readBlockStyleOverrides,
  type BlockStyleOverrides,
} from "../design/block-style.ts";

export const AI_BLOCK_TYPES = [
  "logo",
  "heading",
  "text",
  "info_card",
  "button",
  "divider",
  "footer",
  "spacer",
] as const;
export const INVITE_AI_BLOCK_TYPES = [...AI_BLOCK_TYPES, "hero", "event_info", "rsvp"] as const;
export type AiBlockType = (typeof INVITE_AI_BLOCK_TYPES)[number];

export function aiBlockTypes(target: DesignTarget = "email"): readonly AiBlockType[] {
  return target === "invite_page" ? INVITE_AI_BLOCK_TYPES : AI_BLOCK_TYPES;
}

export function supportsAiBlockType(type: string, target: DesignTarget = "email"): boolean {
  return (aiBlockTypes(target) as readonly string[]).includes(type);
}

export const AI_STYLE_IDS = STYLE_RECIPE_IDS;
export const AI_THEME_IDS = THEME_PRESETS.map((preset) => preset.id);
export const AI_FONT_KEYS = ["sans", "serif", "mono"] as const;
export type AiFontKey = (typeof AI_FONT_KEYS)[number];

export const AI_FONT_FAMILIES: Record<AiFontKey, string> = {
  sans: "'PingFang SC','Noto Sans SC','Microsoft YaHei',Arial,sans-serif",
  serif: "'Songti SC','Noto Serif SC',Georgia,serif",
  mono: "ui-monospace,SFMono-Regular,Menlo,monospace",
};

export const AI_LIMITS = {
  prompt: 2000,
  blocksMin: 4,
  blocksMax: 9,
  subject: 80,
  preheader: 120,
  heading: 80,
  text: 800,
  infoTitle: 30,
  infoBody: 400,
  button: 24,
  footer: 160,
  alt: 60,
  purpose: 120,
} as const;

export type AiPlanBlock = {
  id: string;
  type: AiBlockType;
  purpose: string;
};

const INVITE_THEME_COLORS = ["primaryColor", "accentColor", "backgroundColor", "surfaceColor", "textColor", "mutedTextColor", "buttonColor", "buttonTextColor", "borderColor"] as const;
type ThemeColors = Partial<Pick<DesignTheme, (typeof INVITE_THEME_COLORS)[number]>>;
function inviteColors(value: unknown): ThemeColors {
  if (value === undefined) return {};
  const colors = record(value, "网页配色");
  const result: ThemeColors = {};
  for (const key of INVITE_THEME_COLORS) {
    if (!Object.hasOwn(colors, key)) continue;
    const color = parseBlockStyleValue("backgroundColor", colors[key]);
    if (typeof color !== "string") throw new AiValidationError("invalid_theme", "网页主题颜色必须是十六进制颜色。", key);
    result[key] = color;
  }
  return result;
}

export type AiPlan = {
  target: DesignTarget;
  colors?: ThemeColors;
  version: 1;
  themePreset: ThemePresetId;
  fontFamily: AiFontKey;
  radius: number;
  spacing: number;
  subject: string;
  preheader: string;
  tone: string;
  blocks: AiPlanBlock[];
};

export type AiReferenceBlock = BlockStyleOverrides & {
  type: AiBlockType;
  variant?: string;
  text?: string;
};

export type AiReference = {
  colors?: ThemeColors;
  themePreset: ThemePresetId;
  subject?: string;
  blocks: AiReferenceBlock[];
  preserveCopy: boolean;
};

export type AiBlockPayload = BlockStyleOverrides & (
  | { id: string; type: "hero"; eyebrow: string; title: string; subtitle: string; align: "left" | "center" | "right"; variant: string }
  | { id: string; type: "event_info"; title: string; note: string; variant: string }
  | { id: string; type: "rsvp"; title: string; description: string; variant: string }
  | {
      id: string;
      type: "logo";
      alt: string;
      width: number;
      align: "left" | "center" | "right";
      variant: string;
    }
  | {
      id: string;
      type: "heading";
      text: string;
      level: 1 | 2 | 3;
      align: "left" | "center" | "right";
      variant: string;
    }
  | {
      id: string;
      type: "text";
      text: string;
      align: "left" | "center" | "right";
      variant: string;
    }
  | {
      id: string;
      type: "info_card";
      title: string;
      body: string;
      variant: string;
    }
  | {
      id: string;
      type: "button";
      text: string;
      purpose: "interview" | "onboarding" | "custom";
      url?: string;
      align: "left" | "center" | "right";
      variant: string;
    }
  | {
      id: string;
      type: "divider";
      spacing: number;
      variant: string;
    }
  | {
      id: string;
      type: "footer";
      text: string;
      align: "left" | "center" | "right";
      variant: string;
    }
  | {
      id: string;
      type: "spacer";
      height: number;
      variant: string;
    });

export class AiValidationError extends Error {
  code: string;
  field: string;

  constructor(code: string, message: string, field = "") {
    super(message);
    this.name = "AiValidationError";
    this.code = code;
    this.field = field;
  }
}

const VARIABLE_KEYS = {
  email: new Set(variablesForTarget("email").map(({ key }) => key)),
  invite_page: new Set(variablesForTarget("invite_page").map(({ key }) => key)),
};
const VARIABLE_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/giu;
const UNSAFE_MARKUP = /<(?:script|iframe|object|embed|style)\b|\son[a-z]+\s*=/iu;

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiValidationError("invalid_shape", `${field} 必须是对象。`, field);
  }
  return value as Record<string, unknown>;
}

function stringValue(
  value: unknown,
  field: string,
  min: number,
  max: number,
): string {
  if (typeof value !== "string") {
    throw new AiValidationError("invalid_text", `${field} 必须是文字。`, field);
  }
  const normalized = value.replace(/\r\n/gu, "\n").replace(/\u0000/gu, "").trim();
  if (normalized.length < min || normalized.length > max) {
    throw new AiValidationError(
      "invalid_length",
      `${field} 长度需要在 ${min}–${max} 个字符之间。`,
      field,
    );
  }
  if (UNSAFE_MARKUP.test(normalized)) {
    throw new AiValidationError("unsafe_markup", `${field} 包含不安全内容。`, field);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new AiValidationError("invalid_text", `${field} 必须是文字。`, field);
  }
  const normalized = value.replace(/\r\n/gu, "\n").replace(/\u0000/gu, "").trim();
  if (normalized.length > max) {
    throw new AiValidationError(
      "invalid_length",
      `${field} 不能超过 ${max} 个字符。`,
      field,
    );
  }
  if (UNSAFE_MARKUP.test(normalized)) {
    throw new AiValidationError("unsafe_markup", `${field} 包含不安全内容。`, field);
  }
  return normalized;
}

function numberValue(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AiValidationError("invalid_number", `${field} 必须是数字。`, field);
  }
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) {
    throw new AiValidationError(
      "invalid_range",
      `${field} 需要在 ${min}–${max} 之间。`,
      field,
    );
  }
  return rounded;
}

function enumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new AiValidationError(
      "invalid_enum",
      `${field} 不是允许的取值。`,
      field,
    );
  }
  return value as T;
}

function alignValue(value: unknown): "left" | "center" | "right" {
  return enumValue(value, "对齐", ["left", "center", "right"] as const);
}

export function styleValue(
  value: unknown,
  _module: DesignBlockType,
  fallback = "plain",
): string {
  if (value === undefined || value === null || value === "") {
    return `style:${fallback}`;
  }
  if (typeof value !== "string") {
    throw new AiValidationError("invalid_style", "样式必须是字符串。", "variant");
  }
  const raw = value.trim().replace(/^style:/u, "");
  if (!(STYLE_RECIPE_IDS as readonly string[]).includes(raw)) {
    throw new AiValidationError(
      "invalid_style",
      `不支持的样式：${raw}。`,
      "variant",
    );
  }
  // AI output is already a recipe ID. Legacy aliases are only for saved documents.
  return `style:${raw}`;
}

function variableKeys(text: string): string[] {
  return [...text.matchAll(VARIABLE_PATTERN)].map((match) => match[1].toLowerCase());
}

function assertKnownVariables(text: string, field: string, target: DesignTarget): void {
  for (const key of variableKeys(text)) {
    if (!VARIABLE_KEYS[target].has(key)) {
      throw new AiValidationError(
        "unknown_variable",
        `${field} 使用了未注册的个性化字段：${key}。`,
        field,
      );
    }
  }
}

function assertPreservedVariables(
  before: string,
  after: string,
  field: string,
): void {
  const afterKeys = new Set(variableKeys(after));
  for (const key of variableKeys(before)) {
    if (!afterKeys.has(key)) {
      throw new AiValidationError(
        "missing_variable",
        `${field} 不能删除已有的个性化字段：${key}。`,
        field,
      );
    }
  }
}

function safeCustomUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AiValidationError("missing_url", "打开其他网页需要填写网址。", "url");
  }
  const trimmed = value.trim();
  if (trimmed.length > 500) {
    throw new AiValidationError("invalid_url", "网址过长。", "url");
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("protocol");
    }
    return url.toString();
  } catch {
    throw new AiValidationError(
      "invalid_url",
      "按钮网址必须是 http:// 或 https:// 开头。",
      "url",
    );
  }
}

export function parseAiPlan(value: unknown, target: DesignTarget = "email"): AiPlan {
  const input = record(value, "结构规划");
  const themePreset = enumValue(
    input.themePreset,
    "主题",
    AI_THEME_IDS as ThemePresetId[],
  );
  const fontFamily = enumValue(input.fontFamily, "字体", AI_FONT_KEYS);
  const radius = numberValue(input.radius ?? 16, "圆角", 0, 32);
  const spacing = numberValue(input.spacing ?? 16, "间距", 8, 32);
  const subject = target === "invite_page" ? "" : stringValue(input.subject, "邮件主题", 1, AI_LIMITS.subject);
  const preheader = target === "invite_page" ? "" : optionalText(input.preheader, "预览摘要", AI_LIMITS.preheader);
  const tone = optionalText(input.tone, "语气", 40);
  assertKnownVariables(subject, "邮件主题", target);
  assertKnownVariables(preheader, "预览摘要", target);

  if (!Array.isArray(input.blocks)) {
    throw new AiValidationError("invalid_blocks", "缺少模块计划。", "blocks");
  }
  if (
    input.blocks.length < AI_LIMITS.blocksMin ||
    input.blocks.length > AI_LIMITS.blocksMax
  ) {
    throw new AiValidationError(
      "invalid_block_count",
      `模块数量需要在 ${AI_LIMITS.blocksMin}–${AI_LIMITS.blocksMax} 之间。`,
      "blocks",
    );
  }
  const ids = new Set<string>();
  const counts = new Map<AiBlockType, number>();
  const blocks: AiPlanBlock[] = input.blocks.map((raw, index) => {
    const item = record(raw, `模块 ${index + 1}`);
    const id = stringValue(item.id, `模块 ${index + 1} ID`, 1, 32);
    if (!/^[a-z0-9][a-z0-9-]*$/iu.test(id) || ids.has(id)) {
      throw new AiValidationError("invalid_block_id", "模块 ID 重复或格式不合法。", "blocks");
    }
    ids.add(id);
    const type = enumValue(item.type, `模块 ${index + 1} 类型`, aiBlockTypes(target));
    counts.set(type, (counts.get(type) ?? 0) + 1);
    return {
      id,
      type,
      purpose: optionalText(item.purpose, "模块用途", AI_LIMITS.purpose),
    };
  });
  const headingCount = counts.get("heading") ?? 0;
  const bodyCount = (counts.get("text") ?? 0) + (counts.get("info_card") ?? 0);
  if (target === "invite_page" && (["hero", "event_info", "rsvp"] as const).some((type) => counts.get(type) !== 1)) {
    throw new AiValidationError("missing_core_block", "邀请函需要各一个首屏、活动信息和出席答复模块。", "blocks");
  }
  if (target === "email" && (headingCount < 1 || bodyCount < 1)) {
    throw new AiValidationError(
      "missing_core_block",
      "设计中至少需要一个标题和一个正文/信息卡片。",
      "blocks",
    );
  }
  if (
    headingCount > 2 ||
    (counts.get("logo") ?? 0) > 1 ||
    (counts.get("footer") ?? 0) > 1 ||
    (counts.get("button") ?? 0) > 2 ||
    (counts.get("info_card") ?? 0) > 3
  ) {
    throw new AiValidationError(
      "too_many_blocks",
      "某些模块数量过多，请简化设计。",
      "blocks",
    );
  }
  const colors = inviteColors(input.colors);
  return {
    version: 1,
    target,
    ...(Object.keys(colors).length ? { colors } : {}),
    themePreset,
    fontFamily,
    radius,
    spacing,
    subject,
    preheader,
    tone,
    blocks,
  };
}

function customBlockStyle(input: Record<string, unknown>, type: AiBlockType): BlockStyleOverrides {
  const supported = blockStyleKeys(type);
  for (const key of Object.keys(input)) {
    if (!isBlockStyleKey(key)) continue;
    if (!supported.includes(key)) {
      throw new AiValidationError("scope_violation", `此组件不支持自定义${BLOCK_STYLE_FIELDS[key].label}。`, key);
    }
    if (parseBlockStyleValue(key, input[key]) === undefined) {
      throw new AiValidationError("invalid_style", `${BLOCK_STYLE_FIELDS[key].label}格式或取值不合法。`, key);
    }
  }
  return readBlockStyleOverrides(type, input);
}

export function parseAiBlock(
  value: unknown,
  planBlock: AiPlanBlock,
  target: DesignTarget = "email",
): AiBlockPayload {
  const input = record(value, `模块 ${planBlock.id}`);
  const id = stringValue(input.id ?? planBlock.id, "模块 ID", 1, 32);
  const type = enumValue(input.type ?? planBlock.type, "模块类型", aiBlockTypes(target));
  if (id !== planBlock.id || type !== planBlock.type) {
    throw new AiValidationError(
      "plan_mismatch",
      "AI 返回的模块与布局计划不一致。",
      "blocks",
    );
  }
  const variant = styleValue(input.variant, type);
  const align = alignValue(input.align ?? "left");
  const custom = customBlockStyle(input, type);
  const textField = (key: string, max: number, required = false) => {
    const text = required ? stringValue(input[key], key, 1, max) : optionalText(input[key], key, max);
    assertKnownVariables(text, key, target);
    return text;
  };
  switch (type) {
    case "hero":
      return { id, type, eyebrow: textField("eyebrow", 80), title: textField("title", 80, true), subtitle: textField("subtitle", 400), align, variant, ...custom };
    case "event_info":
      return { id, type, title: textField("title", 80, true), note: textField("note", 400), variant, ...custom };
    case "rsvp":
      return { id, type, title: textField("title", 80, true), description: textField("description", 400), variant, ...custom };
    case "heading": {
      const text = stringValue(input.text, "标题", 1, AI_LIMITS.heading);
      assertKnownVariables(text, "标题", target);
      return {
        id,
        type,
        text,
        level: numberValue(input.level ?? 1, "标题级别", 1, 3) as 1 | 2 | 3,
        align,
        variant,
        ...custom,
      };
    }
    case "text": {
      const text = stringValue(input.text, "正文", 1, AI_LIMITS.text);
      assertKnownVariables(text, "正文", target);
      return { id, type, text, align, variant, ...custom };
    }
    case "info_card": {
      const title = stringValue(input.title, "卡片标题", 1, AI_LIMITS.infoTitle);
      const body = stringValue(input.body, "卡片内容", 1, AI_LIMITS.infoBody);
      assertKnownVariables(title, "卡片标题", target);
      assertKnownVariables(body, "卡片内容", target);
      return { id, type, title, body, variant, ...custom };
    }
    case "button": {
      const text = stringValue(input.text, "按钮文字", 1, AI_LIMITS.button);
      assertKnownVariables(text, "按钮文字", target);
      const purpose = enumValue(
        input.purpose ?? "interview",
        "按钮用途",
        ["interview", "onboarding", "custom"] as const,
      );
      if (target === "invite_page" && purpose !== "custom") {
        throw new AiValidationError("invalid_link", "邀请函的出席操作由出席答复模块提供。", "purpose");
      }
      return {
        id,
        type,
        text,
        purpose,
        ...(purpose === "custom" ? { url: safeCustomUrl(input.url) } : {}),
        align,
        variant,
        ...custom,
      };
    }
    case "divider":
      return {
        id,
        type,
        spacing: numberValue(input.spacing ?? 16, "分隔线间距", 4, 80),
        variant,
        ...custom,
      };
    case "footer": {
      const text = stringValue(input.text, "页脚", 1, AI_LIMITS.footer);
      assertKnownVariables(text, "页脚", target);
      return { id, type, text, align, variant, ...custom };
    }
    case "spacer":
      return {
        id,
        type,
        height: numberValue(input.height ?? 24, "留白高度", 4, 160),
        variant,
        ...custom,
      };
    case "logo": {
      const alt = stringValue(input.alt ?? "组织品牌", "Logo 说明", 1, AI_LIMITS.alt);
      assertKnownVariables(alt, "Logo 说明", target);
      return {
        id,
        type,
        alt,
        width: numberValue(input.width ?? 200, "Logo 宽度", 80, 400),
        align,
        variant,
        ...custom,
      };
    }
    default:
      throw new AiValidationError("invalid_block", "不支持的模块类型。", "type");
  }
}

export function buildAiTheme(plan: AiPlan): DesignTheme {
  const preset = THEME_PRESETS.find((item) => item.id === plan.themePreset);
  if (!preset) throw new AiValidationError("invalid_theme", "主题不存在。");
  const target = plan.target ?? "email";
  const theme = applyThemePreset(defaultTheme(target), preset, target);
  return {
    ...theme,
    ...plan.colors,
    fontFamily: AI_FONT_FAMILIES[plan.fontFamily],
    radius: plan.radius,
    spacing: plan.spacing,
  };
}

export function aiBlockToDesignBlock(payload: AiBlockPayload): DesignBlock {
  const definition = moduleDefinition(payload.type);
  const base = createBlock(payload.type);
  if (!definition || !base) {
    throw new AiValidationError("invalid_block", "无法创建该模块。", "type");
  }
  const props: Record<string, unknown> = {
    ...base.props,
    variant: payload.variant,
    ...readBlockStyleOverrides(payload.type, payload),
  };
  switch (payload.type) {
    case "hero":
      Object.assign(props, { eyebrow: payload.eyebrow, title: payload.title, subtitle: payload.subtitle, align: payload.align });
      break;
    case "event_info":
      Object.assign(props, { title: payload.title, note: payload.note, date: "", time: "{{interview_time}}", location: "{{interview_location}}" });
      break;
    case "rsvp":
      Object.assign(props, { title: payload.title, description: payload.description, secondaryAction: "decline", rescheduleLabel: "婉拒邀请" });
      break;
    case "heading":
      props.text = payload.text;
      props.level = payload.level;
      props.align = payload.align;
      break;
    case "text":
      props.text = payload.text;
      props.align = payload.align;
      break;
    case "info_card":
      props.title = payload.title;
      props.body = payload.body;
      break;
    case "button":
      props.text = payload.text;
      props.align = payload.align;
      props.url =
        payload.purpose === "custom"
          ? payload.url ?? ""
          : buttonLinkValue(payload.purpose);
      break;
    case "divider":
      props.spacing = payload.spacing;
      break;
    case "footer":
      props.text = payload.text;
      props.align = payload.align;
      break;
    case "spacer":
      props.height = payload.height;
      break;
    case "logo":
      props.alt = payload.alt;
      props.width = payload.width;
      props.align = payload.align;
      props.src = "";
      props.assetId = "";
      break;
  }
  return { id: payload.id, type: payload.type, props };
}

export function buildAiDocument(
  plan: AiPlan,
  blocks: DesignBlock[],
): DesignDocument {
  if (blocks.length !== plan.blocks.length) {
    throw new AiValidationError("incomplete_design", "设计尚未完成。", "blocks");
  }
  return {
    schemaVersion: 1,
    target: plan.target ?? "email",
    meta: plan.target === "invite_page" ? {} : {
      subjectTemplate: plan.subject,
      preheaderText: plan.preheader,
    },
    theme: buildAiTheme(plan),
    blocks,
  };
}

export function parseAiFullDesign(
  value: unknown,
  target: DesignTarget = "email",
): { plan: AiPlan; blocks: DesignBlock[] } {
  const input = record(value, "整篇设计");
  const plan = parseAiPlan(input, target);
  const rawBlocks = input.blocks as unknown[];
  const blocks = plan.blocks.map((planBlock, index) => {
    const payload = parseAiBlock(rawBlocks[index], planBlock, target);
    if (payload.id !== planBlock.id || payload.type !== planBlock.type) {
      throw new AiValidationError(
        "plan_mismatch",
        "AI 返回的模块与布局计划不一致。",
        "blocks",
      );
    }
    return aiBlockToDesignBlock(payload);
  });
  return { plan, blocks };
}

const PATCH_FIELDS: Record<AiBlockType, readonly string[]> = {
  hero: ["eyebrow", "title", "subtitle", "align", "variant"],
  event_info: ["title", "note", "variant"],
  rsvp: ["title", "description", "variant"],
  heading: ["text", "level", "align", "variant"],
  text: ["text", "align", "variant"],
  info_card: ["title", "body", "variant"],
  button: ["text", "align", "variant"],
  footer: ["text", "align", "variant"],
  divider: ["spacing", "variant"],
  spacer: ["height", "variant"],
  logo: ["alt", "width", "align", "variant"],
};

export function aiPatchFieldKeys(type: AiBlockType): readonly string[] {
  return [...PATCH_FIELDS[type], ...blockStyleKeys(type)];
}

export function aiPatchFieldLabel(type: AiBlockType, key: string): string {
  if (isBlockStyleKey(key)) return BLOCK_STYLE_FIELDS[key].label;
  return ({
    text: type === "button" ? "按钮文字" : "文字",
    title: type === "info_card" ? "卡片标题" : "标题",
    eyebrow: "眉题", subtitle: "副标题", note: "补充说明", description: "答复说明",
    body: "卡片内容",
    align: "对齐",
    level: "标题级别",
    variant: "样式",
    spacing: "间距",
    height: "高度",
    alt: "Logo 说明",
    width: "宽度",
  } as Record<string, string>)[key] ?? key;
}

export type AiBlockPatch = {
  blockId: string;
  blockType: AiBlockType;
  fields: Record<string, string | number>;
  changedFields: string[];
};

export function parseAiPatch(
  value: unknown,
  input: {
    blockId: string;
    blockType: AiBlockType;
    target?: DesignTarget;
    currentProps: Record<string, unknown>;
  },
): AiBlockPatch {
  const raw = record(value, "组件补丁");
  const blockId = stringValue(raw.blockId, "组件 ID", 1, 64);
  const blockType = enumValue(raw.blockType, "组件类型", aiBlockTypes(input.target));
  if (blockId !== input.blockId || blockType !== input.blockType) {
    throw new AiValidationError(
      "scope_violation",
      "AI 修改范围超出当前组件。",
      "blockId",
    );
  }
  const rawFields = record(raw.fields, "补丁字段");
  const allowed = new Set(aiPatchFieldKeys(blockType));
  for (const key of Object.keys(rawFields)) {
    if (!allowed.has(key)) {
      throw new AiValidationError("scope_violation", `AI 不允许修改字段：${key}。`, key);
    }
  }
  const custom = customBlockStyle(rawFields, blockType);
  const fields: Record<string, string | number> = {};
  const current = input.currentProps;
  const set = (key: string, next: string | number, previous = current[key]) => {
    if (next !== previous) fields[key] = next;
  };
  const copy = (key: string, limit: number) => {
    if (!Object.hasOwn(rawFields, key)) return;
    const label = aiPatchFieldLabel(blockType, key);
    const next = stringValue(rawFields[key], label, 1, limit);
    const before = String(current[key] ?? "");
    if (next === before.replace(/\r\n/gu, "\n").trim()) return;
    if (Array.isArray(current.linkedTextFields) && current.linkedTextFields.includes(key)) {
      throw new AiValidationError("contains_link", `${label}包含已有链接，请保留原文或手动编辑。`, key);
    }
    assertKnownVariables(next, label, input.target ?? "email");
    assertPreservedVariables(before, next, label);
    set(key, next);
  };
  const number = (key: string, min: number, max: number) => {
    if (Object.hasOwn(rawFields, key)) {
      const previous = typeof current[key] === "string" && current[key] ? Number(current[key]) : current[key];
      set(key, numberValue(rawFields[key], aiPatchFieldLabel(blockType, key), min, max), previous);
    }
  };
  if (Object.hasOwn(rawFields, "variant")) {
    if (typeof rawFields.variant !== "string" || !rawFields.variant.trim()) {
      throw new AiValidationError("invalid_style", "样式必须是合法的样式 ID。", "variant");
    }
    const previous = typeof current.variant === "string" ? current.variant : undefined;
    set("variant", styleValue(rawFields.variant, blockType), `style:${normalizeVariant(blockType, previous)}`);
  }
  if (Object.hasOwn(rawFields, "align")) {
    set("align", alignValue(rawFields.align), current.align ?? (
      blockType === "button" || blockType === "footer" || blockType === "logo" ? "center" : "left"
    ));
  }
  switch (blockType) {
    case "hero":
      copy("eyebrow", 80); copy("title", 80); copy("subtitle", 400);
      break;
    case "event_info":
      copy("title", 80); copy("note", 400);
      break;
    case "rsvp":
      copy("title", 80); copy("description", 400);
      break;
    case "heading":
      copy("text", AI_LIMITS.heading);
      number("level", 1, 3);
      break;
    case "text":
      copy("text", AI_LIMITS.text);
      break;
    case "footer":
      copy("text", AI_LIMITS.footer);
      break;
    case "button":
      copy("text", AI_LIMITS.button);
      break;
    case "info_card":
      copy("title", AI_LIMITS.infoTitle);
      copy("body", AI_LIMITS.infoBody);
      break;
    case "divider":
      number("spacing", 4, 80);
      break;
    case "spacer":
      number("height", 4, 160);
      break;
    case "logo":
      copy("alt", AI_LIMITS.alt);
      number("width", 80, 400);
      break;
  }
  for (const key of blockStyleKeys(blockType)) {
    const value = custom[key];
    if (value !== undefined) set(key, value, parseBlockStyleValue(key, current[key]));
  }
  const changedFields = Object.keys(fields).map((key) => aiPatchFieldLabel(blockType, key));
  if (changedFields.length === 0) {
    throw new AiValidationError("empty_patch", "AI 没有产生有效修改。", "fields");
  }
  return { blockId, blockType, fields, changedFields };
}

export function parseAiReference(value: unknown, target: DesignTarget = "email"): AiReference | undefined {
  if (value === undefined || value === null) return undefined;
  const input = record(value, "参考设计");
  const themePreset = enumValue(
    input.themePreset,
    "参考主题",
    AI_THEME_IDS as ThemePresetId[],
  );
  if (!Array.isArray(input.blocks) || input.blocks.length > 8) {
    throw new AiValidationError("invalid_reference", "参考设计模块过多。", "blocks");
  }
  const blocks = input.blocks.map((raw, index) => {
    const item = record(raw, `参考模块 ${index + 1}`);
    const type = enumValue(item.type, "参考模块类型", aiBlockTypes(target));
    return {
      type,
      ...customBlockStyle(item, type),
      variant:
        typeof item.variant === "string"
          ? styleValue(item.variant, item.type as AiBlockType)
          : undefined,
      text: optionalText(item.text, "参考文字", 200),
    };
  });
  return {
    themePreset,
    ...(target === "invite_page" ? { colors: inviteColors(input.colors) } : {}),
    subject: optionalText(input.subject, "参考主题", AI_LIMITS.subject),
    blocks,
    preserveCopy: input.preserveCopy === true,
  };
}

export function styleLabelFor(id: string): string {
  const raw = id.replace(/^style:/u, "");
  return STYLE_RECIPES.find((recipe) => recipe.id === raw)?.label ?? "简洁";
}
