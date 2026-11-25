import { useEffect, useId, useState } from "react";
import type { DesignBlock } from "@/shared/contracts/design";
import {
  BLOCK_STYLE_FIELDS,
  blockStyleKeys,
  parseBlockStyleValue,
  readBlockStyleOverrides,
  type BlockStyleKey,
} from "@/shared/design/block-style";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELD_ORDER: BlockStyleKey[] = [
  "borderPlacement", "borderStyle", "borderColor", "borderWidth",
  "backgroundColor", "shadow", "backgroundGradient",
  "textColor", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
  "borderRadius", "paddingX", "paddingY",
];

function StyleField({
  fieldKey,
  current,
  onUpdate,
  onClear,
}: {
  fieldKey: BlockStyleKey;
  current: string | number | undefined;
  onUpdate: (value: string | number | undefined) => void;
  onClear?: () => void;
}) {
  const id = useId();
  const field = BLOCK_STYLE_FIELDS[fieldKey];
  const [draft, setDraft] = useState(String(current ?? ""));
  useEffect(() => setDraft(String(current ?? "")), [current]);
  return (
    <div className={field.kind === "gradient" ? "col-span-2 min-w-0 space-y-1" : "min-w-0 space-y-1"}>
      <div className="flex items-center justify-between gap-1">
        <Label htmlFor={id} className="text-[11px] leading-4">
          {field.label}{"unit" in field ? ` (${field.unit})` : ""}
        </Label>
        {current !== undefined && onClear ? (
          <button
            type="button"
            className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            aria-label={`清除${field.label}覆盖`}
            onClick={onClear}
          >
            清除
          </button>
        ) : null}
      </div>
      {field.kind === "select" ? (
        <select
          id={id}
          value={String(current ?? "")}
          onChange={(event) => onUpdate(parseBlockStyleValue(fieldKey, event.target.value))}
          className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <option value="">跟随预设</option>
          {Object.entries(field.options).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      ) : (
        <div className="flex min-w-0 items-center gap-1">
          {field.kind === "color" ? (
            <input
              type="color"
              className="size-6 shrink-0 cursor-pointer border-0 bg-transparent p-0"
              aria-label={`选择${field.label}`}
              value={typeof current === "string" ? current : "#000000"}
              onChange={(event) => onUpdate(parseBlockStyleValue(fieldKey, event.target.value))}
            />
          ) : null}
          <Input
            id={id}
            name={fieldKey}
            type={field.kind === "number" ? "number" : "text"}
            min={field.kind === "number" ? field.min : undefined}
            max={field.kind === "number" ? field.max : undefined}
            step={field.kind === "number" ? field.step : undefined}
            className="h-8 min-w-0 px-1.5 text-xs tabular-nums"
            placeholder={
              field.kind === "color"
                ? "#RRGGBB"
                : field.kind === "gradient"
                  ? "linear-gradient(135deg, #1d5343 0%, #2f7a60 100%)"
                  : "跟随预设"
            }
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            onBlur={() => {
              const raw = draft.trim();
              const value = raw ? parseBlockStyleValue(fieldKey, field.kind === "number" ? Number(raw) : raw) : undefined;
              if (raw && value === undefined) {
                setDraft(String(current ?? ""));
                return;
              }
              setDraft(String(value ?? ""));
              if (value !== current) onUpdate(value);
            }}
          />
        </div>
      )}
      {fieldKey === "borderRadius" ? (
        <p className="text-[10px] leading-4 text-muted-foreground">
          单独圆角可能不可见，需配合背景、边框或内边距。
        </p>
      ) : null}
    </div>
  );
}

export function BlockStyleFields({
  block,
  onUpdate,
}: {
  block: DesignBlock;
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const keys = blockStyleKeys(block.type);
  if (!keys.length) return null;
  const values = readBlockStyleOverrides(block.type, block.props);
  const overridden = keys.filter((key) => values[key] !== undefined);
  return (
    <details className="group rounded-xl border border-border/70 px-2.5 open:pb-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-2.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
        自定义样式
        <span className="flex items-center gap-1.5">
          {overridden.length ? <span className="text-[10px] text-muted-foreground">{overridden.length} 项</span> : null}
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">
        {FIELD_ORDER.filter((key) => keys.includes(key)).map((key) => (
          <StyleField
            key={`${block.id}:${key}`}
            fieldKey={key}
            current={values[key]}
            onUpdate={(value) => onUpdate({ [key]: value })}
            onClear={
              key === "textColor" || key === "fontSize" || key === "backgroundGradient"
                ? () => onUpdate({ [key]: undefined })
                : undefined
            }
          />
        ))}
      </div>
      {overridden.length ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-7 px-1.5 text-[11px]"
          onClick={() => onUpdate(Object.fromEntries(overridden.map((key) => [key, undefined])))}
        >
          恢复预设样式
        </Button>
      ) : null}
    </details>
  );
}
