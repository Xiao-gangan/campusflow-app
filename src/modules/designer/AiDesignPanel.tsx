import { BROWSER_DEMO } from "../browser-demo/mode";
import { useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  Square,
  Wand2,
} from "lucide-react";
import { AiSettingsDialog, useCredentialStatus } from "../ai/AiSettingsDialog";
import { useActiveProvider } from "../ai/use-ai-configuration";
import type { DesignBlock } from "@/shared/contracts/design";
import {
  supportsAiBlockType,
} from "@/shared/ai/schema.ts";
import { moduleDefinition } from "@/shared/design/modules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AiDesignComparison } from "./AiDesignComparison";
import type { UseAiDesign } from "./use-ai-design";

const STYLE_CHIPS = [
  "正式商务",
  "青春校园",
  "简约高级",
  "活力现代",
  "温暖亲和",
] as const;

const QUICK_ACTIONS = [
  "优化文案",
  "更正式一些",
  "更活泼一些",
  "精简表达",
  "调整视觉风格",
] as const;

function blockLabel(block: DesignBlock): string {
  return moduleDefinition(block.type)?.label ?? "内容";
}

export function AiDesignPanel({
  ai,
  selectedBlock,
  assetUrls,
  previewViewportWidth,
  onOpenAiTemplates,
}: {
  ai: UseAiDesign;
  selectedBlock: DesignBlock | null;
  assetUrls: Record<string, string>;
  previewViewportWidth: number;
  onOpenAiTemplates?: () => void;
}) {
  const activeProvider = useActiveProvider();
  const keyStatus = useCredentialStatus(activeProvider.provider);
  const session = ai.session;
  const { discard } = ai;

  useEffect(() => {
    if (
      session?.errorCode === "missing_key" &&
      (ai.mock || keyStatus === "saved" || keyStatus === "temporary" || keyStatus === "legacy")
    ) {
      discard();
    }
  }, [ai.mock, discard, keyStatus, session?.errorCode]);
  const busy = ai.isBusy;
  const completed = session?.status === "completed";
  const failed = session?.status === "failed";
  const cancelled = session?.status === "cancelled";
  const planned = session?.plan?.blocks ?? [];
  const plannedDone = new Set(
    (session?.previewDocument?.blocks ?? []).map((block) => block.id),
  );
  const currentBlock = selectedBlock;
  const blockAiAvailable = Boolean(
    currentBlock && supportsAiBlockType(currentBlock.type, ai.target),
  );
  const sessionBlockUnavailable = session?.mode === "block" && !ai.canRegenerateBlock;

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "space-y-2",
          !ai.mock && "rounded-xl border border-border/70 bg-background/60 p-2.5",
        )}
      >
        {!ai.mock ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {keyStatus === "saved"
                ? `${activeProvider.label} · 已配置`
                : keyStatus === "temporary"
                  ? `${activeProvider.label} · 临时密钥`
                  : keyStatus === "legacy"
                    ? `${activeProvider.label} · 旧配置`
                    : activeProvider.label}
            </span>
            <AiSettingsDialog>
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <KeyRound className="size-3" aria-hidden="true" />AI 配置
              </Button>
            </AiSettingsDialog>
          </div>
        ) : null}
        {import.meta.env.DEV ? (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-amber-50/70 px-2 py-1.5 text-[10px] leading-4 text-amber-800">
            <input
              type="checkbox"
              checked={ai.mock} disabled={BROWSER_DEMO}
              onChange={(event) => ai.setMock(event.target.checked)}
              className="accent-[#8f2d2d]"
            />
            <span>本地演示（不调用模型）</span>
          </label>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-1.5 rounded-full border border-border/70 bg-muted/30 p-1">
        <button
          type="button"
          aria-pressed={ai.mode === "full"}
          disabled={busy}
          onClick={() => ai.setMode("full")}
          className={cn(
            "rounded-full px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40",
            ai.mode === "full" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          整篇设计
        </button>
        <button
          type="button"
          aria-pressed={ai.mode === "block"}
          disabled={busy || !blockAiAvailable}
          title={
            blockAiAvailable
              ? undefined
              : "当前组件暂不支持 AI 优化"
          }
          onClick={() => ai.setMode("block")}
          className={cn(
            "rounded-full px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40",
            ai.mode === "block" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          优化当前组件
        </button>
      </div>

      {ai.mode === "full" ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ai-full-prompt" className="text-[11px]">
              设计需求
            </Label>
            <textarea
              id="ai-full-prompt"
              value={ai.fullPrompt}
              onChange={(event) => ai.setFullPrompt(event.target.value)}
              placeholder={ai.target === "invite_page" ? "例如：设计一张校园面试邀请函网页。首屏用深绿色，面试安排用细边框，底部保留出席答复。" : "例如：设计一封荔枝红色的面试邀请邮件，突出面试信息卡片和跳转邀请函按钮。"}
              rows={4}
              className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs leading-5 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                aria-pressed={ai.style === chip}
                onClick={() => ai.setStyle(ai.style === chip ? undefined : chip)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
                  ai.style === chip
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border/70 text-muted-foreground hover:border-primary/40",
                )}
              >
                {chip}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2 text-[10px] leading-4 text-muted-foreground">
            <input
              type="checkbox"
              checked={ai.referenceMode}
              onChange={(event) => ai.setReferenceMode(event.target.checked)}
            />
            <span>以当前设计为参考</span>
          </label>
          {ai.referenceMode ? (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                aria-pressed={ai.preserveCopy}
                title="保留现有文案，主要调整样式"
                onClick={() => ai.setPreserveCopy(true)}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-[10px]",
                  ai.preserveCopy ? "border-primary bg-primary/5" : "border-border/70",
                )}
              >
                保留文案
              </button>
              <button
                type="button"
                aria-pressed={!ai.preserveCopy}
                title="同时优化文案和样式"
                onClick={() => ai.setPreserveCopy(false)}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-[10px]",
                  !ai.preserveCopy ? "border-primary bg-primary/5" : "border-border/70",
                )}
              >
                同时优化文案
              </button>
            </div>
          ) : null}

          {planned.length > 0 && !completed ? (
            <div className="space-y-1.5 rounded-xl border border-border/70 bg-background/60 p-2.5">
              <p className="text-[10px] font-medium text-muted-foreground">
                生成进度
              </p>
              <div className="space-y-1">
                {planned.map((block, index) => {
                  const done = plannedDone.has(block.id);
                  const isCurrent = !done && plannedDone.size === index;
                  const label = moduleDefinition(block.type)?.label ?? block.type;
                  return (
                    <div
                      key={block.id}
                      className="flex items-center justify-between gap-2 text-[10px]"
                    >
                      <span className={cn("flex items-center gap-1.5", done ? "text-foreground" : "text-muted-foreground")}>
                        {done ? (
                          <CheckCircle2 className="size-3 text-emerald-600" />
                        ) : isCurrent && busy ? (
                          <Loader2 className="size-3 animate-spin text-primary" />
                        ) : (
                          <span className="size-2 rounded-full border border-border" />
                        )}
                        {label}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {done ? "已生成" : isCurrent && busy ? "生成中" : "等待"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/40 px-2.5 py-2 text-[10px] leading-4 text-muted-foreground">
            {currentBlock
              ? blockAiAvailable
                ? `当前组件：${blockLabel(currentBlock)}`
                : "当前组件暂不支持 AI 优化，请选择标题、正文、信息卡片等组件。"
              : "先在画布中选择一个组件"}
          </div>
          {blockAiAvailable ? (
            <>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                aria-pressed={ai.blockQuickAction === action}
                onClick={() =>
                  ai.setBlockQuickAction(ai.blockQuickAction === action ? undefined : action)
                }
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
                  ai.blockQuickAction === action
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border/70 text-muted-foreground hover:border-primary/40",
                )}
              >
                {action}
              </button>
            ))}
          </div>
          <textarea
            value={ai.blockInstruction}
            onChange={(event) => ai.setBlockInstruction(event.target.value)}
            placeholder="例如：把四周边框改成红色实线，其他保持不变。"
            rows={3}
            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs leading-5 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
            </>
          ) : null}
        </div>
      )}

      {completed && session?.beforeDocument && session.previewDocument ? (
        <AiDesignComparison
          key={session.requestId}
          session={session}
          assetUrls={assetUrls}
          viewportWidth={previewViewportWidth}
        />
      ) : null}

      {session?.stage && !completed ? (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {busy ? <Loader2 className="size-3 animate-spin" /> : null}
          <span>{session.stage}</span>
        </div>
      ) : null}

      {session?.error ? (
        <div className="space-y-2 rounded-xl bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{session.error}</span>
          </div>
          {session.errorCode === "missing_key" ? (
            <AiSettingsDialog>
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 bg-background text-[11px]">
                <KeyRound className="size-3" aria-hidden="true" />
                打开 AI 配置
              </Button>
            </AiSettingsDialog>
          ) : null}
        </div>
      ) : null}

      {completed && session?.mode === "full" ? (
        <div className="space-y-2">
          <div className="grid gap-1.5">
            <Input
              value={ai.templateName}
              onChange={(event) => ai.setTemplateName(event.target.value)}
              placeholder="模板名称"
              className="h-8 text-xs"
              aria-label="AI 模板名称"
            />
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" size="sm" className="h-8" onClick={() => ai.apply()}>
                应用此设计
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={ai.saveAsTemplate}
              >
                保存为 AI 模板
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={ai.regenerate}
              >
                <RefreshCw className="size-3" />
                重新生成
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={ai.discard}
              >
                放弃
              </Button>
            </div>
          </div>
          {ai.saveMessage ? (
            <div className="space-y-1.5">
              <p className="text-[10px] leading-4 text-emerald-700">{ai.saveMessage}</p>
              {onOpenAiTemplates ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={onOpenAiTemplates}
                >
                  查看 AI 生成模板
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {completed && session?.mode === "block" ? (
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" className="h-8" onClick={() => ai.apply()}>
            接受修改
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={sessionBlockUnavailable}
            title={sessionBlockUnavailable ? "当前组件暂不支持 AI 优化" : undefined}
            onClick={ai.regenerate}
          >
            重新生成
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={ai.discard}>
            放弃
          </Button>
        </div>
      ) : null}

      {!completed && !failed && !cancelled ? (
        <Button
          type="button"
          className="w-full"
          disabled={busy || (ai.mode === "block" && !blockAiAvailable)}
          onClick={() => (ai.mode === "block" ? ai.startBlock() : ai.startFull())}
        >
          {busy ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              生成中…
            </>
          ) : (
            <>
              <Wand2 className="size-3.5" />
              {ai.mode === "block" ? "生成组件修改" : "开始设计"}
            </>
          )}
        </Button>
      ) : null}
      {busy ? (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={ai.cancel}>
          <Square className="size-3" />
          取消生成
        </Button>
      ) : null}
      {failed || cancelled ? (
        <div className="space-y-2">
          {sessionBlockUnavailable ? (
            <p className="text-[10px] leading-4 text-muted-foreground">
              本次组件不可用。请退出会话，再选择要修改的组件。
            </p>
          ) : null}
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={sessionBlockUnavailable}
              title={sessionBlockUnavailable ? "当前组件暂不支持 AI 优化" : undefined}
              onClick={ai.regenerate}
            >
              重试
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8" onClick={ai.discard}>
              退出会话
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
