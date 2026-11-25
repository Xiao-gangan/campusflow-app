import {
  Check,
  ChevronsUpDown,
  Monitor,
  SlidersHorizontal,
  Smartphone,
  Tablet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CUSTOM_WIDTH_MAX,
  CUSTOM_WIDTH_MIN,
  DEVICE_PRESETS,
  clampCustomWidth,
  resolveDeviceSize,
  type DeviceId,
} from "@/shared/design/devices";
import { cn } from "@/lib/utils";

type DevicePickerProps = {
  value: DeviceId;
  customWidth: number;
  onChange: (id: DeviceId, customWidth: number) => void;
  className?: string;
  label?: string;
};

function DeviceIcon({
  kind,
  className,
}: {
  kind: "phone" | "tablet" | "desktop";
  className?: string;
}) {
  const Icon =
    kind === "phone" ? Smartphone : kind === "tablet" ? Tablet : Monitor;
  return <Icon className={className} aria-hidden="true" />;
}

export function DevicePicker({
  value,
  customWidth,
  onChange,
  className,
  label,
}: DevicePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftWidth, setDraftWidth] = useState(String(customWidth));
  useEffect(() => {
    setDraftWidth(String(customWidth));
  }, [customWidth]);
  const current = resolveDeviceSize(value, customWidth);

  function applyCustomWidth() {
    const width = clampCustomWidth(Number(draftWidth));
    setDraftWidth(String(width));
    onChange("custom", width);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("gap-1.5", className)}
          aria-label={label ? `选择${label}` : "选择预览设备"}
          title={label ? `${label}：${current.label}` : undefined}
        >
          {label ? (
            <span className="text-[10px] font-normal text-muted-foreground">
              {label}
            </span>
          ) : null}
          <DeviceIcon kind={value === "desktop" ? "desktop" : value === "tablet" ? "tablet" : "phone"} className="size-3.5" />
          {current.label}
          <ChevronsUpDown className="size-3 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(340px,calc(100vw-2rem))] p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          设备视口
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {DEVICE_PRESETS.map((preset) => {
            const active = value === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onChange(preset.id, customWidth);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border/70 hover:border-primary/40",
                )}
              >
                <DeviceIcon kind={preset.kind} className="size-4 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium">
                    {preset.label}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {preset.width} × {preset.height}
                  </span>
                </span>
                {active ? (
                  <Check className="ml-auto size-3.5 shrink-0 text-primary" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-3 border-t border-border/60 pt-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <p className="text-[11px] font-medium">自定义宽度</p>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <Input
              type="number"
              min={CUSTOM_WIDTH_MIN}
              max={CUSTOM_WIDTH_MAX}
              value={draftWidth}
              onChange={(event) => setDraftWidth(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyCustomWidth();
              }}
              className="h-8 text-xs"
              aria-label="自定义预览宽度"
            />
            <span className="text-[11px] text-muted-foreground">px</span>
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0"
              onClick={applyCustomWidth}
            >
              应用
            </Button>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            按 CSS 视口宽度模拟，不等同于真实邮箱客户端或设备测试。
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
