import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraftSaveState } from "./use-auto-draft";

type DraftStatusProps = {
  state: DraftSaveState;
  onRetry: () => void;
  compact?: boolean;
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDraftTime(iso: string): string {
  return formatTime(iso);
}

export function draftStatusText(state: DraftSaveState): string {
  if (state.status === "pending") return "待保存…";
  if (state.status === "saving") return "保存中…";
  if (state.status === "saved") {
    const time = formatTime(state.savedAt);
    return time ? `草稿已保存 ${time}` : "草稿已保存";
  }
  if (state.status === "error") return "草稿保存失败";
  if (state.status === "unavailable") return "无法自动保存";
  return "自动草稿";
}

export function DraftStatus({ state, onRetry, compact = false }: DraftStatusProps) {
  const text = draftStatusText(state);
  const isError = state.status === "error";
  const isUnavailable = state.status === "unavailable";
  const isWarning = isError || isUnavailable;
  const message = isWarning ? state.message : undefined;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
        isWarning
          ? "border-amber-300/70 bg-amber-50 text-amber-800"
          : "border-border/70 bg-background/60 text-muted-foreground",
        compact && "px-2 py-0.5",
      )}
      role="status"
      aria-live="polite"
      title={
        message ??
        "编辑内容会自动保存在当前浏览器，和“保存模板”分开；刷新或重新打开可恢复。"
      }
      data-testid="draft-status"
    >
      {state.status === "pending" || state.status === "saving" ? (
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      ) : isWarning ? (
        <AlertTriangle className="size-3" aria-hidden="true" />
      ) : (
        <Check className="size-3 text-primary" aria-hidden="true" />
      )}
      <span className="whitespace-nowrap">{text}</span>
      {isError ? (
        <button
          type="button"
          className="ml-0.5 rounded-full px-1 text-[10px] font-medium underline underline-offset-2 hover:text-amber-950 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={onRetry}
        >
          重试
        </button>
      ) : null}
    </span>
  );
}
