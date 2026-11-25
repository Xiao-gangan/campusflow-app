import { Check, ChevronDown, Palette } from "lucide-react";
import { useState } from "react";
import type { DesignBlockType, DesignTheme } from "@/shared/contracts/design";
import {
  STYLE_RECIPES,
  resolveStyle,
  styleRecipeById,
  normalizeVariant,
} from "@/shared/design/style-recipes";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type StyleVariantPickerProps = {
  module: DesignBlockType;
  value: string;
  theme: DesignTheme;
  onChange: (value: string) => void;
  compact?: boolean;
  compactLabel?: string;
  side?: "bottom" | "right" | "left";
  align?: "start" | "center" | "end";
};

export function StyleVariantPicker({
  module,
  value,
  theme,
  onChange,
  compact = false,
  compactLabel = "选择样式",
  side = "bottom",
  align = "start",
}: StyleVariantPickerProps) {
  const [open, setOpen] = useState(false);
  const currentId = normalizeVariant(module, value);
  const current = styleRecipeById(currentId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0 text-muted-foreground/70 hover:text-primary"
            aria-label={compactLabel}
            title={compactLabel}
          >
            <Palette className="size-3.5" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full justify-between gap-2 py-2 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">{current.label}</span>
              <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                {current.hint}
              </span>
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={6}
        className="w-[min(360px,calc(100vw-2rem))] p-2"
      >
        <div className="flex items-center justify-between px-1 pb-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            选择样式
          </p>
          <span className="text-[10px] text-muted-foreground">20 种</span>
        </div>
        <div className="grid max-h-[min(440px,62vh)] grid-cols-2 gap-1.5 overflow-y-auto">
          {STYLE_RECIPES.map((recipe) => {
            const resolved = resolveStyle(recipe, theme);
            const active = recipe.id === currentId;
            return (
              <button
                key={recipe.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onChange(`style:${recipe.id}`);
                  setOpen(false);
                }}
                className={cn(
                  "flex flex-col gap-1.5 rounded-xl border p-2 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border/70 hover:border-primary/40",
                )}
              >
                <span
                  className="flex h-9 items-center justify-center overflow-hidden rounded-md"
                  style={{
                    backgroundColor: resolved.background ?? "transparent",
                    border: resolved.border ?? "0",
                    borderLeft: resolved.borderLeft ?? undefined,
                    borderTop: resolved.borderTop ?? undefined,
                    borderRadius: Math.min(8, resolved.borderRadius / 2),
                  }}
                >
                  <span
                    style={{
                      color: resolved.textColor,
                      fontSize: 13 + resolved.sizeScale * 3,
                      fontWeight: 600,
                      fontStyle: resolved.italic ? "italic" : undefined,
                      textDecoration: resolved.underline ? "underline" : undefined,
                      letterSpacing: resolved.spaced ? "0.08em" : undefined,
                    }}
                  >
                    Aa
                  </span>
                </span>
                <span className="flex items-center justify-between gap-1">
                  <span className="truncate text-[11px] font-medium">
                    {recipe.label}
                  </span>
                  {active ? (
                    <Check className="size-3 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                </span>
                <span className="truncate text-[9px] leading-3 text-muted-foreground">
                  {recipe.hint}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
