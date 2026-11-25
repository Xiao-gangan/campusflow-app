import type { DesignBlockType } from "../contracts/design.ts";
import type { EditorDoc } from "./legacy-text.ts";
import { contrastText } from "./colors.ts";
import { resolveStyle, styleRecipeFor, type ResolvedStyle, type StyleTheme } from "./style-recipes.ts";

type StyleField =
  | { label: string; kind: "color" }
  | { label: string; kind: "gradient" }
  | { label: string; kind: "number"; min: number; max: number; step: number; unit?: string }
  | { label: string; kind: "select"; options: Record<string, string> };

export const SHADOW_CSS: Record<string, string> = {
  none: "none",
  sm: "0 4px 14px -4px rgba(15,23,42,0.12)",
  md: "0 12px 28px -8px rgba(15,23,42,0.18)",
  lg: "0 22px 48px -14px rgba(15,23,42,0.26)",
};

export const FONT_WEIGHT_CSS: Record<string, number> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

export function shadowValue(shadow: string | undefined): string | undefined {
  return shadow && Object.hasOwn(SHADOW_CSS, shadow) ? SHADOW_CSS[shadow] : undefined;
}

export function fontWeightValue(weight: string | undefined): number | undefined {
  return weight && Object.hasOwn(FONT_WEIGHT_CSS, weight) ? FONT_WEIGHT_CSS[weight] : undefined;
}

export const BLOCK_STYLE_FIELDS = {
  borderColor: { label: "边框颜色", kind: "color" },
  borderWidth: { label: "边框粗细", kind: "number", min: 0, max: 12, step: 1, unit: "px" },
  borderStyle: { label: "边框线型", kind: "select", options: { solid: "实线", dashed: "虚线", dotted: "点线", double: "双线" } },
  borderPlacement: { label: "边框位置", kind: "select", options: { all: "四周", top: "上侧", right: "右侧", bottom: "下侧", left: "左侧", y: "上下", none: "无边框" } },
  backgroundColor: { label: "背景颜色", kind: "color" },
  backgroundGradient: { label: "渐变背景", kind: "gradient" },
  shadow: { label: "阴影", kind: "select", options: { none: "无阴影", sm: "轻柔", md: "立体", lg: "悬浮" } },
  textColor: { label: "文字颜色", kind: "color" },
  fontSize: { label: "字号", kind: "number", min: 10, max: 64, step: 1, unit: "px" },
  fontWeight: { label: "字重", kind: "select", options: { normal: "常规", medium: "中等", semibold: "半粗", bold: "加粗" } },
  lineHeight: { label: "行高", kind: "number", min: 1, max: 3, step: 0.1 },
  letterSpacing: { label: "字距", kind: "number", min: -1, max: 8, step: 0.5, unit: "px" },
  borderRadius: { label: "圆角", kind: "number", min: 0, max: 64, step: 1, unit: "px" },
  paddingX: { label: "横向内边距", kind: "number", min: 0, max: 48, step: 1, unit: "px" },
  paddingY: { label: "纵向内边距", kind: "number", min: 0, max: 48, step: 1, unit: "px" },
} as const satisfies Record<string, StyleField>;

export type BlockStyleKey = keyof typeof BLOCK_STYLE_FIELDS;
export type BlockStyleOverrides = {
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: string;
  borderPlacement?: string;
  backgroundColor?: string;
  backgroundGradient?: string;
  shadow?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: string;
  lineHeight?: number;
  letterSpacing?: number;
  borderRadius?: number;
  paddingX?: number;
  paddingY?: number;
};

const STYLE_KEYS = Object.keys(BLOCK_STYLE_FIELDS) as BlockStyleKey[];
const CUSTOM_BLOCKS = new Set<string>(["heading", "text", "info_card", "button", "footer", "hero", "event_info", "rsvp"]);
const SIDES = ["top", "right", "bottom", "left"] as const;

export function isBlockStyleKey(key: string): key is BlockStyleKey {
  return Object.hasOwn(BLOCK_STYLE_FIELDS, key);
}

export function blockStyleKeys(type: string): readonly BlockStyleKey[] {
  return CUSTOM_BLOCKS.has(type) ? STYLE_KEYS : [];
}

const LINEAR_GRADIENT_PATTERN =
  /^linear-gradient\(\s*(?:\d{1,3}deg|to\s+(?:top|bottom|left|right)(?:\s+(?:top|bottom|left|right))?)\s*(?:,\s*#(?:[0-9a-f]{3}|[0-9a-f]{6})(?:\s+\d{1,3}%)?\s*){2,4}\)$/iu;

function normalizeHex(hex: string): string {
  return (hex.length === 4
    ? "#" + [...hex.slice(1)].map((char) => char.repeat(2)).join("")
    : hex).toLowerCase();
}

export function gradientFallbackColor(gradient: string | undefined): string | undefined {
  if (!gradient) return undefined;
  const match = gradient.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})/iu);
  return match ? normalizeHex(match[0]) : undefined;
}

export function parseBlockStyleValue(key: BlockStyleKey, value: unknown): string | number | undefined {
  const field: StyleField = BLOCK_STYLE_FIELDS[key];
  if (field.kind === "color") {
    if (typeof value !== "string" || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/iu.test(value)) return;
    return normalizeHex(value);
  }
  if (field.kind === "gradient") {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!LINEAR_GRADIENT_PATTERN.test(trimmed)) return;
    return trimmed
      .replace(/\s+/gu, " ")
      .replace(/#(?:[0-9a-f]{6}|[0-9a-f]{3})/giu, (hex) => normalizeHex(hex));
  }
  if (field.kind === "select") {
    return typeof value === "string" && Object.hasOwn(field.options, value) ? value : undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < field.min || value > field.max) return;
  const scaled = value / field.step;
  return Math.abs(scaled - Math.round(scaled)) < 1e-8 ? value : undefined;
}

export function blockStyleInputHint(key: BlockStyleKey): string {
  const field: StyleField = BLOCK_STYLE_FIELDS[key];
  return field.kind === "color" ? "#RRGGBB"
    : field.kind === "gradient" ? "linear-gradient(135deg, #RRGGBB 0%, #RRGGBB 100%)，仅限十六进制色标"
      : field.kind === "select" ? Object.keys(field.options).join("/")
        : `${field.min}–${field.max}${field.unit ? ` ${field.unit}` : ""}，数字，步长 ${field.step}`;
}

export function readBlockStyleOverrides(type: string, props: Record<string, unknown>): BlockStyleOverrides {
  return Object.fromEntries(blockStyleKeys(type).flatMap((key) => {
    const value = parseBlockStyleValue(key, props[key]);
    return value === undefined ? [] : [[key, value]];
  }));
}

type Side = (typeof SIDES)[number];
type Border = { width: number; line: string; color: string };
type BorderMap = Record<Side, Border | null>;
type BoxStyle = {
  backgroundColor?: string;
  backgroundImage?: string;
  boxShadow?: string;
  borderRadius?: number;
  padding?: string;
  borders: BorderMap;
};

function parseBorder(value: string | null | undefined): Border | null {
  const match = value?.match(/^(\d+(?:\.\d+)?)px (solid|dashed|dotted|double) (.+)$/u);
  return match ? { width: Number(match[1]), line: match[2], color: match[3] } : null;
}

function borderCss(border: Border | null): string {
  return border?.width ? `${border.width}px ${border.line} ${border.color}` : "0";
}

function overrideBorders(
  borders: BorderMap,
  commonBorder: Border | null,
  custom: BlockStyleOverrides,
  fallbackColor: string,
): BorderMap {
  const { borderColor, borderWidth, borderStyle, borderPlacement } = custom;
  if ([borderColor, borderWidth, borderStyle, borderPlacement].every((value) => value === undefined)) {
    return borders;
  }
  const hasExistingBorder = SIDES.some((side) => borders[side]);
  const next = (side: Side): Border | null => {
    const enabled = borderPlacement === undefined
      ? !hasExistingBorder || Boolean(borders[side])
      : borderPlacement === "all"
        || borderPlacement === side
        || (borderPlacement === "y" && (side === "top" || side === "bottom"));
    if (!enabled) return null;
    const base = (borderPlacement === "all" || borderPlacement === "y" ? commonBorder : borders[side]);
    return {
      width: borderWidth ?? base?.width ?? 1,
      line: borderStyle ?? base?.line ?? "solid",
      color: borderColor ?? base?.color ?? fallbackColor,
    };
  };
  return { top: next("top"), right: next("right"), bottom: next("bottom"), left: next("left") };
}

export function boxStyleProperties(box: BoxStyle) {
  const borders = SIDES.map((side) => borderCss(box.borders[side]));
  return {
    backgroundColor: box.backgroundColor,
    ...(box.backgroundImage ? { backgroundImage: box.backgroundImage } : {}),
    ...(box.boxShadow ? { boxShadow: box.boxShadow } : {}),
    borderWidth: SIDES.map((side) => `${box.borders[side]?.width ?? 0}px`).join(" "),
    borderStyle: borders.every((border) => border === "0") ? undefined
      : SIDES.map((side) => box.borders[side]?.line ?? "none").join(" "),
    borderColor: SIDES.map((side) => box.borders[side]?.color ?? "transparent").join(" "),
    borderRadius: box.borderRadius,
    padding: box.padding,
  };
}

export function emailBoxStyle(box: BoxStyle, includePadding = true): string {
  const parts: string[] = [];
  if (box.backgroundColor !== undefined) parts.push(`background:${box.backgroundColor}`);
  if (box.backgroundImage !== undefined) parts.push(`background-image:${box.backgroundImage}`);
  const borders = SIDES.map((side) => borderCss(box.borders[side]));
  if (borders[0] !== "0" && borders.every((border) => border === borders[0])) {
    parts.push(`border:${borders[0]}`);
  } else {
    SIDES.forEach((side, index) => {
      if (borders[index] !== "0") parts.push(`border-${side}:${borders[index]}`);
    });
  }
  if (box.borderRadius !== undefined) parts.push(`border-radius:${box.borderRadius}px`);
  if (box.boxShadow !== undefined && box.boxShadow !== "none") parts.push(`box-shadow:${box.boxShadow}`);
  if (includePadding && box.padding !== undefined) parts.push(`padding:${box.padding}`);
  return parts.join(";");
}

function effectivePadding(padding: string | undefined, custom: BlockStyleOverrides) {
  if (custom.paddingX === undefined && custom.paddingY === undefined) return padding;
  const [y = "0", x = y] = padding?.split(" ") ?? [];
  return `${custom.paddingY === undefined ? y : `${custom.paddingY}px`} ${custom.paddingX === undefined ? x : `${custom.paddingX}px`}`;
}

function buttonDefaults(style: ResolvedStyle, theme: StyleTheme) {
  const buttonColor = theme.buttonColor ?? theme.primaryColor;
  const { id, sizeScale: scale } = style;
  const padding = (y: number, x: number) => `${Math.round(y * scale)}px ${Math.round(x * scale)}px`;
  if (id === "underline") return { link: true, padding: "0", background: "transparent", border: null, color: buttonColor };
  if (["dashed", "outline", "pill", "mono"].includes(id)) {
    return {
      link: false, padding: padding(11, 23), background: "transparent",
      border: `1px ${id === "dashed" ? "dashed" : "solid"} ${id === "mono" ? (theme.borderColor ?? theme.mutedTextColor) : buttonColor}`,
      color: id === "mono" ? theme.textColor : buttonColor,
    };
  }
  if (["soft", "tinted", "note", "sidebar"].includes(id)) {
    return {
      link: false, padding: padding(12, 24), background: style.background ?? theme.surfaceColor,
      border: `1px solid ${style.background ?? theme.borderColor ?? theme.mutedTextColor}`, color: style.textColor,
    };
  }
  const accent = id === "filled" || id === "band";
  const background = accent ? theme.accentColor : buttonColor;
  return {
    link: false, padding: padding(12, 24), background,
    border: `1px solid ${background}`, color: accent ? contrastText(background) : (theme.buttonTextColor ?? "#fffdfa"),
  };
}

export function resolveBlockStyle(
  type: DesignBlockType,
  props: Record<string, unknown>,
  theme: StyleTheme,
) {
  const style = resolveStyle(styleRecipeFor(type, typeof props.variant === "string" ? props.variant : ""), theme);
  const custom = readBlockStyleOverrides(type, props);
  const button = type === "button" ? buttonDefaults(style, theme) : undefined;
  const card = type === "info_card";
  const fallbackColor = theme.borderColor ?? theme.mutedTextColor;
  const commonBorder = parseBorder(button ? button.border : style.border ?? (card ? `1px solid ${fallbackColor}` : null));
  const box: BoxStyle = {
    backgroundColor: custom.backgroundColor ?? gradientFallbackColor(custom.backgroundGradient) ?? (button?.background ?? style.background ?? (card ? theme.surfaceColor : undefined)),
    ...(custom.backgroundGradient ? { backgroundImage: custom.backgroundGradient } : {}),
    ...(shadowValue(custom.shadow) ? { boxShadow: shadowValue(custom.shadow) } : {}),
    borderRadius: custom.borderRadius ?? style.borderRadius,
    padding: effectivePadding(button?.padding ?? (style.hasSurface ? style.padding : card ? "18px 20px" : undefined), custom),
    borders: overrideBorders({
      top: button ? commonBorder : parseBorder(style.borderTop) ?? commonBorder,
      right: commonBorder,
      bottom: commonBorder,
      left: button ? commonBorder : parseBorder(style.borderLeft) ?? commonBorder,
    }, commonBorder, custom, fallbackColor),
  };
  const hasBox = card || Boolean(button) || style.hasSurface || box.backgroundColor !== undefined ||
    box.backgroundImage !== undefined || (box.boxShadow !== undefined && box.boxShadow !== "none") ||
    box.padding !== undefined || custom.borderRadius !== undefined ||
    SIDES.some((side) => Boolean(box.borders[side]?.width));
  return {
    custom,
    box,
    hasBox,
    style,
    linkButton: button?.link ?? false,
    textColor: custom.textColor ?? button?.color ?? style.textColor,
    mutedColor: custom.textColor ?? style.mutedColor,
  };
}

/** Describe the existing visible border without sending theme data unrelated to this block. */
export function currentBlockBorder(type: DesignBlockType, props: Record<string, unknown>, theme: StyleTheme) {
  const { box } = resolveBlockStyle(type, props, theme);
  return Object.fromEntries(SIDES.map((side) => [side, borderCss(box.borders[side])]));
}

/** Keep inline formatting stored; explicit block overrides win only for the same property. */
export function richTextWithBlockStyle(
  doc: EditorDoc,
  custom: BlockStyleOverrides,
): EditorDoc {
  if (custom.textColor === undefined && custom.fontSize === undefined) return doc;
  return {
    ...doc,
    content: doc.content.map((paragraph) => ({
      ...paragraph,
      content: paragraph.content?.map((node) => {
        if (node.type === "hardBreak" || !node.marks) return node;
        return {
          ...node,
          marks: node.marks.flatMap((mark) => {
            if (mark.type !== "textStyle") return [mark];
            const attrs = { ...mark.attrs };
            if (custom.textColor !== undefined) delete attrs.color;
            if (custom.fontSize !== undefined) delete attrs.fontSize;
            return Object.keys(attrs).length ? [{ ...mark, attrs }] : [];
          }),
        };
      }),
    })),
  };
}
