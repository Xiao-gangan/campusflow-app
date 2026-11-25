import { Check, Link2, Sparkles } from "lucide-react";
import { useMemo } from "react";
import {
  BUTTON_LINK_ACTIONS,
  buttonLinkActionById,
  buttonLinkPurpose,
  buttonLinkValue,
  buttonLinkNeedsUrl,
  type ButtonLinkPurpose,
} from "@/shared/design/button-links";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ButtonLinkFieldProps = {
  fieldId: string;
  value: string;
  onChange: (next: string) => void;
};

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function ButtonLinkField({
  fieldId,
  value,
  onChange,
}: ButtonLinkFieldProps) {
  const purpose = useMemo(() => buttonLinkPurpose(value), [value]);
  const active = buttonLinkActionById(purpose);
  const legacyToken =
    purpose === "custom" && /^\{\{[^}]+\}\}$/u.test(value.trim());
  const customInvalid =
    purpose === "custom" &&
    value.trim().length > 0 &&
    !legacyToken &&
    !isHttpUrl(value.trim());

  function selectPurpose(next: ButtonLinkPurpose) {
    if (next === purpose) return;
    if (next === "custom") {
      onChange("");
      return;
    }
    onChange(buttonLinkValue(next));
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5">
        {BUTTON_LINK_ACTIONS.map((action) => {
          const selected = action.id === purpose;
          return (
            <button
              key={action.id}
              type="button"
              aria-pressed={selected}
              onClick={() => selectPurpose(action.id)}
              className={cn(
                "flex items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border/70 hover:border-primary/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-transparent",
                )}
                aria-hidden="true"
              >
                <Check className="size-2.5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[12px] font-medium">
                  {action.id === "custom" ? (
                    <Link2 className="size-3" aria-hidden="true" />
                  ) : (
                    <Sparkles className="size-3" aria-hidden="true" />
                  )}
                  {action.label}
                  {action.status === "unavailable" ? (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800">
                      尚未开放
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                  {action.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {buttonLinkNeedsUrl(purpose) ? (
        <div className="space-y-1">
          <Input
            id={fieldId}
            type="url"
            value={value}
            placeholder="https://..."
            onChange={(event) => onChange(event.target.value)}
          />
          {legacyToken ? (
            <p className="text-[11px] leading-4 text-amber-700">
              此链接来自旧模板，请重新选择用途或输入完整网址。
            </p>
          ) : customInvalid ? (
            <p className="text-[11px] leading-4 text-destructive" role="alert">
              请输入以 http:// 或 https:// 开头的完整网址。
            </p>
          ) : (
            <p className="text-[11px] leading-4 text-muted-foreground">
              用于固定网页，不会包含候选人个人信息。
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-muted/50 px-2.5 py-2 text-[11px] leading-4 text-muted-foreground">
          {active.status === "unavailable"
            ? "入组信息填写尚未开放；当前只保存用途，预览中不会生效。"
            : "正式发送时会生成每位候选人的专属邀请函链接，点击后跳转到邀请函网页完成出席答复；预览中不会真正跳转或提交。"}
        </p>
      )}
    </div>
  );
}
