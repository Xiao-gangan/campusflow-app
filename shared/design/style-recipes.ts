import type { DesignBlockType, DesignTheme } from "../contracts/design.ts";
import { contrastText, mixHex } from "./colors.ts";

export const STYLE_RECIPE_IDS = [
  "plain",
  "soft",
  "tinted",
  "accent",
  "outline",
  "solid",
  "filled",
  "band",
  "pill",
  "underline",
  "sidebar",
  "topline",
  "dashed",
  "short",
  "quote",
  "note",
  "lead",
  "editorial",
  "inverse",
  "mono",
] as const;

export type StyleRecipeId = (typeof STYLE_RECIPE_IDS)[number];

type SurfaceToken = "none" | "soft" | "tint" | "accent" | "primary";
type BorderToken = "none" | "left" | "top" | "full" | "dashed";
type ToneToken = "text" | "muted" | "primary" | "inverse";
type SizeToken = "sm" | "md" | "lg";

export type StyleTokens = {
  surface: SurfaceToken;
  border: BorderToken;
  radius: "none" | "soft" | "round";
  tone: ToneToken;
  size: SizeToken;
  italic?: boolean;
  underline?: boolean;
  spaced?: boolean;
};

export type StyleRecipe = {
  id: StyleRecipeId;
  label: string;
  hint: string;
  tokens: StyleTokens;
};

export const STYLE_RECIPES: StyleRecipe[] = [
  { id: "plain", label: "简洁", hint: "不加装饰的默认样式", tokens: { surface: "none", border: "none", radius: "soft", tone: "text", size: "md" } },
  { id: "soft", label: "柔和", hint: "浅卡片背景", tokens: { surface: "soft", border: "none", radius: "soft", tone: "text", size: "md" } },
  { id: "tinted", label: "浅色", hint: "辅助色浅底", tokens: { surface: "tint", border: "none", radius: "soft", tone: "text", size: "md" } },
  { id: "accent", label: "强调", hint: "左侧强调线", tokens: { surface: "none", border: "left", radius: "soft", tone: "primary", size: "md" } },
  { id: "outline", label: "描边", hint: "细边框", tokens: { surface: "none", border: "full", radius: "soft", tone: "text", size: "md" } },
  { id: "solid", label: "实心", hint: "主色实心块", tokens: { surface: "primary", border: "none", radius: "soft", tone: "inverse", size: "md" } },
  { id: "filled", label: "填充", hint: "辅助色实心块", tokens: { surface: "accent", border: "none", radius: "soft", tone: "inverse", size: "md" } },
  { id: "band", label: "色块", hint: "整行色块", tokens: { surface: "accent", border: "none", radius: "none", tone: "inverse", size: "md" } },
  { id: "pill", label: "胶囊", hint: "圆角胶囊", tokens: { surface: "none", border: "full", radius: "round", tone: "primary", size: "md" } },
  { id: "underline", label: "下划线", hint: "强调文字链接", tokens: { surface: "none", border: "none", radius: "none", tone: "primary", size: "md", underline: true } },
  { id: "sidebar", label: "侧边强调", hint: "浅底与左侧强调线", tokens: { surface: "tint", border: "left", radius: "soft", tone: "primary", size: "md" } },
  { id: "topline", label: "顶部强调", hint: "顶部细线", tokens: { surface: "none", border: "top", radius: "none", tone: "primary", size: "md" } },
  { id: "dashed", label: "虚线", hint: "虚线边框", tokens: { surface: "none", border: "dashed", radius: "soft", tone: "text", size: "md" } },
  { id: "short", label: "短横线", hint: "短分隔线", tokens: { surface: "none", border: "none", radius: "none", tone: "primary", size: "sm" } },
  { id: "quote", label: "引用", hint: "斜体与侧边线", tokens: { surface: "none", border: "left", radius: "soft", tone: "muted", size: "md", italic: true } },
  { id: "note", label: "注释", hint: "小号柔和文字", tokens: { surface: "soft", border: "none", radius: "soft", tone: "muted", size: "sm" } },
  { id: "lead", label: "引导", hint: "更大的引导文字", tokens: { surface: "none", border: "none", radius: "none", tone: "text", size: "lg" } },
  { id: "editorial", label: "杂志", hint: "宽松字距与顶部线", tokens: { surface: "none", border: "top", radius: "none", tone: "text", size: "lg", spaced: true } },
  { id: "inverse", label: "反白", hint: "主色底上的浅色文字", tokens: { surface: "primary", border: "none", radius: "soft", tone: "inverse", size: "md" } },
  { id: "mono", label: "极简黑白", hint: "无圆角的中性样式", tokens: { surface: "none", border: "full", radius: "none", tone: "text", size: "md" } },
];

const LEGACY_ALIASES: Record<DesignBlockType, Record<string, StyleRecipeId>> = {
  heading: { plain: "plain", accent: "underline", band: "band" },
  text: { default: "plain", lead: "lead", note: "note", quote: "quote" },
  info_card: { default: "plain", accent: "accent", filled: "filled", quiet: "soft" },
  button: { solid: "solid", outline: "outline", soft: "tinted", link: "underline" },
  divider: { solid: "topline", dashed: "dashed", short: "short", accent: "accent" },
  image: {},
  logo: {},
  footer: {},
  spacer: {},
  hero: {},
  event_info: {},
  rsvp: {},
};

export function normalizeVariant(
  module: DesignBlockType,
  value: string | undefined,
): StyleRecipeId {
  const normalized = value?.trim();
  if (!normalized) return "plain";
  if (normalized.startsWith("style:")) {
    const raw = normalized.slice(6);
    if ((STYLE_RECIPE_IDS as readonly string[]).includes(raw)) {
      return raw as StyleRecipeId;
    }
    return "plain";
  }
  const legacy = LEGACY_ALIASES[module]?.[normalized];
  if (legacy) return legacy;
  if ((STYLE_RECIPE_IDS as readonly string[]).includes(normalized)) {
    return normalized as StyleRecipeId;
  }
  return "plain";
}

export function styleOptionValue(
  module: DesignBlockType,
  value: string | undefined,
): string {
  return `style:${normalizeVariant(module, value)}`;
}

export function styleRecipeById(id: StyleRecipeId): StyleRecipe {
  return STYLE_RECIPES.find((recipe) => recipe.id === id) ?? STYLE_RECIPES[0];
}

export function styleRecipeFor(
  module: DesignBlockType,
  value: string | undefined,
): StyleRecipe {
  return styleRecipeById(normalizeVariant(module, value));
}

export type ResolvedStyle = {
  id: StyleRecipeId;
  label: string;
  background: string | null;
  border: string | null;
  borderLeft: string | null;
  borderTop: string | null;
  borderRadius: number;
  padding: string;
  textColor: string;
  mutedColor: string;
  sizeScale: number;
  italic: boolean;
  underline: boolean;
  spaced: boolean;
  hasSurface: boolean;
  button: "solid" | "outline" | "soft" | "link";
  divider: "solid" | "dashed" | "short" | "accent";
};

type DividerSpec = {
  width: number;
  line: "solid" | "dashed" | "dotted" | "double";
  color: string;
  short: boolean;
};

export function dividerSpec(
  recipe: StyleRecipe,
  theme: StyleTheme,
): DividerSpec {
  const borderColor = theme.borderColor ?? theme.mutedTextColor;
  const table: Record<StyleRecipeId, DividerSpec> = {
    plain: { width: 1, line: "solid", color: borderColor, short: false },
    soft: { width: 1, line: "solid", color: theme.mutedTextColor, short: false },
    tinted: { width: 1, line: "solid", color: theme.accentColor, short: false },
    accent: { width: 3, line: "solid", color: theme.primaryColor, short: false },
    outline: { width: 1, line: "solid", color: theme.primaryColor, short: false },
    solid: { width: 2, line: "solid", color: theme.primaryColor, short: false },
    filled: { width: 2, line: "solid", color: theme.accentColor, short: false },
    band: { width: 4, line: "solid", color: theme.accentColor, short: false },
    pill: { width: 2, line: "solid", color: theme.primaryColor, short: false },
    underline: { width: 1, line: "dashed", color: theme.primaryColor, short: false },
    sidebar: { width: 3, line: "solid", color: theme.mutedTextColor, short: false },
    topline: { width: 2, line: "solid", color: theme.accentColor, short: false },
    dashed: { width: 1, line: "dashed", color: borderColor, short: false },
    short: { width: 2, line: "solid", color: theme.primaryColor, short: true },
    quote: { width: 1, line: "dotted", color: theme.primaryColor, short: false },
    note: { width: 1, line: "dotted", color: borderColor, short: false },
    lead: { width: 3, line: "double", color: theme.primaryColor, short: false },
    editorial: { width: 1, line: "double", color: borderColor, short: false },
    inverse: { width: 4, line: "solid", color: theme.primaryColor, short: false },
    mono: { width: 2, line: "solid", color: theme.textColor, short: false },
  };
  return table[recipe.id];
}

export type StyleTheme = Pick<
  DesignTheme,
  | "primaryColor"
  | "accentColor"
  | "surfaceColor"
  | "textColor"
  | "mutedTextColor"
  | "borderColor"
  | "radius"
  | "buttonColor"
  | "buttonTextColor"
>;

export function resolveStyle(
  recipe: StyleRecipe,
  theme: StyleTheme,
): ResolvedStyle {
  const tokens = recipe.tokens;
  const accentText = contrastText(theme.accentColor);
  const primaryText = contrastText(theme.primaryColor);
  const background =
    tokens.surface === "soft"
      ? theme.surfaceColor
      : tokens.surface === "tint"
        ? mixHex(theme.accentColor, theme.surfaceColor, 0.28)
        : tokens.surface === "accent"
          ? theme.accentColor
          : tokens.surface === "primary"
            ? theme.primaryColor
            : null;
  const inverseText =
    tokens.surface === "accent"
      ? accentText
      : tokens.surface === "primary"
        ? primaryText
        : "#fffdf8";
  const surfaceText = background
    ? contrastText(background)
    : theme.textColor;
  const surfaceMuted = background
    ? mixHex(contrastText(background), background, 0.72)
    : theme.mutedTextColor;
  const textColor =
    tokens.tone === "inverse"
      ? inverseText
      : tokens.tone === "muted"
        ? surfaceMuted
        : tokens.tone === "primary"
          ? theme.primaryColor
          : surfaceText;
  const borderColor = theme.borderColor ?? theme.mutedTextColor;
  const border =
    tokens.border === "full"
      ? `1px solid ${borderColor}`
      : tokens.border === "dashed"
        ? `1px dashed ${borderColor}`
        : null;
  const borderLeft =
    tokens.border === "left" ? `4px solid ${theme.primaryColor}` : null;
  const borderTop =
    tokens.border === "top" ? `2px solid ${theme.primaryColor}` : null;
  const borderRadius =
    tokens.radius === "round"
      ? 999
      : tokens.radius === "none"
        ? 0
        : Math.max(4, Math.round(theme.radius / 2));
  const hasPadding =
    tokens.surface !== "none" ||
    tokens.border === "full" ||
    tokens.border === "dashed" ||
    tokens.border === "left" ||
    tokens.border === "top";
  const padding = hasPadding
    ? tokens.size === "sm"
      ? "10px 12px"
      : tokens.size === "lg"
        ? "20px 22px"
        : "14px 16px"
    : "0";
  const button: ResolvedStyle["button"] =
    tokens.underline
      ? "link"
      : background
        ? "solid"
        : tokens.border !== "none"
          ? "outline"
          : "solid";
  const divider: ResolvedStyle["divider"] =
    recipe.id === "short"
      ? "short"
      : tokens.border === "dashed"
        ? "dashed"
        : tokens.border === "left" ||
            tokens.border === "top" ||
            tokens.border === "full"
          ? "accent"
          : "solid";

  return {
    id: recipe.id,
    label: recipe.label,
    background,
    border,
    borderLeft,
    borderTop,
    borderRadius,
    padding,
    textColor,
    mutedColor:
      tokens.tone === "inverse" ? inverseText : surfaceMuted,
    sizeScale: tokens.size === "sm" ? 0.9 : tokens.size === "lg" ? 1.12 : 1,
    italic: tokens.italic === true,
    underline: tokens.underline === true,
    spaced: tokens.spaced === true,
    hasSurface: hasPadding,
    button,
    divider,
  };
}
