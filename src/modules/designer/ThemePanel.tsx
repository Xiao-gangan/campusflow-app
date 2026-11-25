import { useEffect, useState } from "react";
import type { DesignTarget, DesignTheme } from "@/shared/contracts/design";
import {
  THEME_PRESETS,
  applyThemePreset,
} from "@/shared/design/theme-presets";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ThemePanelProps = {
  target: DesignTarget;
  theme: DesignTheme;
  onUpdate: (patch: Partial<DesignTheme>) => void;
};

const COLOR_FIELDS: {
  key: keyof DesignTheme;
  label: string;
  fallback?: keyof DesignTheme;
}[] = [
  { key: "primaryColor", label: "主色" },
  { key: "accentColor", label: "辅助色" },
  { key: "backgroundColor", label: "页面背景" },
  { key: "surfaceColor", label: "卡片背景" },
  { key: "textColor", label: "正文颜色" },
  { key: "mutedTextColor", label: "次要文字" },
  { key: "buttonColor", label: "按钮颜色", fallback: "primaryColor" },
  { key: "buttonTextColor", label: "按钮文字" },
  { key: "borderColor", label: "边框颜色" },
];

const FONT_OPTIONS = [
  {
    label: "系统中文无衬线",
    value: "'PingFang SC','Noto Sans SC','Microsoft YaHei',Arial,sans-serif",
  },
  { label: "宋体 / 衬线", value: "'Songti SC','Noto Serif SC',Georgia,serif" },
  { label: "等宽", value: "ui-monospace,SFMono-Regular,Menlo,monospace" },
];

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function ThemeColorField({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs" htmlFor={id}>
        {label}
      </Label>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
        <input
          type="color"
          aria-label={`${label}颜色`}
          value={isHexColor(value) ? value : "#000000"}
          onChange={(event) => onCommit(event.target.value)}
          className="size-9 cursor-pointer rounded-lg border border-input bg-background p-1"
        />
        <Input
          id={id}
          value={draft}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (isHexColor(next.trim())) onCommit(next.trim());
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          onBlur={() => {
            const normalized = draft.trim();
            if (isHexColor(normalized)) {
              if (normalized !== value) onCommit(normalized);
            } else {
              setDraft(value);
            }
          }}
          className="font-mono text-xs"
        />
      </div>
    </div>
  );
}

function ThemeNumberField({
  id,
  label,
  value,
  min,
  max,
  disabled = false,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  function commit() {
    const raw = draft.trim();
    if (!raw) {
      setDraft(String(value));
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.round(parsed)));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (next.trim() !== "") {
            const parsed = Number(next);
            if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
              onCommit(Math.round(parsed));
            }
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}

export function ThemePanel({ target, theme, onUpdate }: ThemePanelProps) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold">主题设置</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          一键套用配色，只改变颜色，不修改文字、变量和模块顺序。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {THEME_PRESETS.map((preset) => {
          const colors = preset.colors[target];
          const active =
            theme.primaryColor === colors.primaryColor &&
            theme.backgroundColor === colors.backgroundColor;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              title={preset.description}
              onClick={() => onUpdate(applyThemePreset(theme, preset, target))}
              className={`rounded-xl border p-2 text-left transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                active
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/70 hover:border-primary/40"
              }`}
            >
              <span className="flex gap-1" aria-hidden="true">
                {preset.palette.map((color) => (
                  <span
                    key={color}
                    className="h-4 flex-1 rounded-[3px] border border-black/5"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
              <span className="mt-1.5 block text-[11px] font-medium">
                {preset.name}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {COLOR_FIELDS.map((field) => {
          const fallback = field.fallback
            ? String(theme[field.fallback] ?? "")
            : "";
          const value = String(theme[field.key] ?? fallback);
          return (
            <ThemeColorField
              key={field.key}
              id={`theme-${field.key}`}
              label={field.label}
              value={value}
              onCommit={(next) =>
                onUpdate({ [field.key]: next } as Partial<DesignTheme>)
              }
            />
          );
        })}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="theme-font" className="text-xs">
          字体
        </Label>
        <select
          id="theme-font"
          value={theme.fontFamily}
          onChange={(event) => onUpdate({ fontFamily: event.target.value })}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {FONT_OPTIONS.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ThemeNumberField
          id="theme-width"
          label="宽度"
          min={320}
          max={960}
          value={target === "email" ? 600 : theme.width}
          disabled={target === "email"}
          onCommit={(width) => onUpdate({ width })}
        />
        <ThemeNumberField
          id="theme-radius"
          label="圆角"
          min={0}
          max={48}
          value={theme.radius}
          onCommit={(radius) => onUpdate({ radius })}
        />
        <ThemeNumberField
          id="theme-spacing"
          label="间距"
          min={8}
          max={48}
          value={theme.spacing}
          onCommit={(spacing) => onUpdate({ spacing })}
        />
      </div>

      {target === "email" ? (
        <p className="text-[11px] leading-5 text-muted-foreground">
          邮件正文宽度固定为 600px，便于兼容常见邮箱客户端。
        </p>
      ) : null}
    </div>
  );
}
