import { Button } from "@/components/ui/button";

export function BlockTextStyleNotice({
  color,
  fontSize,
  onClearColor,
  onClearFontSize,
}: {
  color: boolean;
  fontSize: boolean;
  onClearColor?: () => void;
  onClearFontSize?: () => void;
}) {
  if (!color && !fontSize) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/40 px-2 py-1 text-[10px] leading-4 text-muted-foreground"
      role="status"
    >
      {color ? (
        <span className="flex items-center gap-1.5">
          选区颜色由组件统一
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClearColor}
          >
            解除统一颜色
          </Button>
        </span>
      ) : null}
      {fontSize ? (
        <span className="flex items-center gap-1.5">
          选区字号由组件统一
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClearFontSize}
          >
            解除统一字号
          </Button>
        </span>
      ) : null}
    </div>
  );
}
