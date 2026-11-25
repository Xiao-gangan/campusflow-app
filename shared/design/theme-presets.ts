import type { DesignTarget, DesignTheme } from "../contracts/design.ts";

export type ThemePresetId =
  | "forest"
  | "ocean"
  | "crimson"
  | "twilight"
  | "apricot"
  | "mono";

type ThemeColors = Pick<
  DesignTheme,
  | "primaryColor"
  | "accentColor"
  | "backgroundColor"
  | "surfaceColor"
  | "textColor"
  | "mutedTextColor"
  | "buttonColor"
  | "buttonTextColor"
  | "borderColor"
>;

export type ThemePreset = {
  id: ThemePresetId;
  name: string;
  description: string;
  palette: string[];
  colors: Record<DesignTarget, ThemeColors>;
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "forest",
    name: "森林绿",
    description: "沉稳的校园绿与暖白，适合正式邀请。",
    palette: ["#1d5343", "#c7e6a3", "#fffdf8", "#182420"],
    colors: {
      email: {
        primaryColor: "#1d5343",
        accentColor: "#c7e6a3",
        backgroundColor: "#f4f1ea",
        surfaceColor: "#fffdf8",
        textColor: "#182420",
        mutedTextColor: "#6d756f",
        buttonColor: "#1d5343",
        buttonTextColor: "#fffdfa",
        borderColor: "#ddd6c8",
      },
      invite_page: {
        primaryColor: "#1d5343",
        accentColor: "#c7e6a3",
        backgroundColor: "#0f2018",
        surfaceColor: "#fffaf0",
        textColor: "#f6f1e6",
        mutedTextColor: "#b7c8bb",
        buttonColor: "#1d5343",
        buttonTextColor: "#fffdfa",
        borderColor: "#2f4a3e",
      },
    },
  },
  {
    id: "ocean",
    name: "深海蓝",
    description: "冷静清晰的深蓝，适合技术与研究团队。",
    palette: ["#1f4e79", "#9cc7e6", "#f7fbff", "#16232e"],
    colors: {
      email: {
        primaryColor: "#1f4e79",
        accentColor: "#9cc7e6",
        backgroundColor: "#f1f5f8",
        surfaceColor: "#ffffff",
        textColor: "#16232e",
        mutedTextColor: "#5f707c",
        buttonColor: "#1f4e79",
        buttonTextColor: "#f7fbff",
        borderColor: "#d5e1e8",
      },
      invite_page: {
        primaryColor: "#1f4e79",
        accentColor: "#9cc7e6",
        backgroundColor: "#0b1823",
        surfaceColor: "#f7fbff",
        textColor: "#eef6fb",
        mutedTextColor: "#a8bcc9",
        buttonColor: "#1f4e79",
        buttonTextColor: "#f7fbff",
        borderColor: "#28414f",
      },
    },
  },
  {
    id: "crimson",
    name: "典雅红",
    description: "克制的酒红与暖灰，适合正式仪式与晚会。",
    palette: ["#8f2d2d", "#e8b4a6", "#fffdfb", "#2a1d1b"],
    colors: {
      email: {
        primaryColor: "#8f2d2d",
        accentColor: "#e8b4a6",
        backgroundColor: "#f7f1ee",
        surfaceColor: "#fffdfb",
        textColor: "#2a1d1b",
        mutedTextColor: "#75615d",
        buttonColor: "#8f2d2d",
        buttonTextColor: "#fffaf7",
        borderColor: "#e3d3cd",
      },
      invite_page: {
        primaryColor: "#8f2d2d",
        accentColor: "#e8b4a6",
        backgroundColor: "#1f1111",
        surfaceColor: "#fffaf7",
        textColor: "#f8ece8",
        mutedTextColor: "#c9aaa4",
        buttonColor: "#8f2d2d",
        buttonTextColor: "#fffaf7",
        borderColor: "#47292a",
      },
    },
  },
  {
    id: "twilight",
    name: "暮光紫",
    description: "低饱和紫调，适合创意与社团活动。",
    palette: ["#5b4b8a", "#d8c7f2", "#fbf8ff", "#221f2e"],
    colors: {
      email: {
        primaryColor: "#5b4b8a",
        accentColor: "#d8c7f2",
        backgroundColor: "#f4f1f8",
        surfaceColor: "#fffdfd",
        textColor: "#221f2e",
        mutedTextColor: "#6a6478",
        buttonColor: "#5b4b8a",
        buttonTextColor: "#fbf8ff",
        borderColor: "#ddd5ea",
      },
      invite_page: {
        primaryColor: "#5b4b8a",
        accentColor: "#d8c7f2",
        backgroundColor: "#15111f",
        surfaceColor: "#fbf8ff",
        textColor: "#f1ecfa",
        mutedTextColor: "#b4a9c7",
        buttonColor: "#5b4b8a",
        buttonTextColor: "#fbf8ff",
        borderColor: "#332c46",
      },
    },
  },
  {
    id: "apricot",
    name: "暖杏橙",
    description: "温暖的杏色与陶土色，适合轻松的招新。",
    palette: ["#b25e2f", "#f4d3b3", "#fffdf9", "#2d2118"],
    colors: {
      email: {
        primaryColor: "#b25e2f",
        accentColor: "#f4d3b3",
        backgroundColor: "#faf2e8",
        surfaceColor: "#fffdf9",
        textColor: "#2d2118",
        mutedTextColor: "#7b6657",
        buttonColor: "#b25e2f",
        buttonTextColor: "#fffaf4",
        borderColor: "#ead8c5",
      },
      invite_page: {
        primaryColor: "#b25e2f",
        accentColor: "#f4d3b3",
        backgroundColor: "#1f1510",
        surfaceColor: "#fffaf4",
        textColor: "#f8eee4",
        mutedTextColor: "#c7ae9b",
        buttonColor: "#b25e2f",
        buttonTextColor: "#fffaf4",
        borderColor: "#4a3528",
      },
    },
  },
  {
    id: "mono",
    name: "极简黑白",
    description: "克制的黑白灰，适合信息密度较高的通知。",
    palette: ["#1f2321", "#d7d9d5", "#ffffff", "#171a18"],
    colors: {
      email: {
        primaryColor: "#1f2321",
        accentColor: "#d7d9d5",
        backgroundColor: "#f6f6f4",
        surfaceColor: "#ffffff",
        textColor: "#171a18",
        mutedTextColor: "#6b706c",
        buttonColor: "#1f2321",
        buttonTextColor: "#ffffff",
        borderColor: "#dedfdb",
      },
      invite_page: {
        primaryColor: "#1f2321",
        accentColor: "#d7d9d5",
        backgroundColor: "#101211",
        surfaceColor: "#f7f7f5",
        textColor: "#f2f3f0",
        mutedTextColor: "#b6bab5",
        buttonColor: "#1f2321",
        buttonTextColor: "#ffffff",
        borderColor: "#313533",
      },
    },
  },
];

export function themePresetById(
  id: ThemePresetId,
): ThemePreset | undefined {
  return THEME_PRESETS.find((preset) => preset.id === id);
}

export function matchThemePreset(theme: DesignTheme, target: DesignTarget = "email"): ThemePresetId {
  const match = THEME_PRESETS.find(
    (preset) =>
      preset.colors[target].primaryColor === theme.primaryColor &&
      preset.colors[target].backgroundColor === theme.backgroundColor,
  );
  return match?.id ?? "forest";
}

export function applyThemePreset(
  theme: DesignTheme,
  preset: ThemePreset,
  target: DesignTarget,
): DesignTheme {
  return { ...theme, ...preset.colors[target] };
}
