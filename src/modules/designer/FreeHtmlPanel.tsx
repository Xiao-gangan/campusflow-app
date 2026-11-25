import { BROWSER_DEMO } from "../browser-demo/mode";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  FileUp,
  KeyRound,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  Wand2,
} from "lucide-react";
import type { DesignDocument } from "@/shared/contracts/design";
import {
  FREE_HTML_FONT_PRESETS,
  buildExternalAiPromptTemplate,
  inspectEmailHtmlVariables,
  sanitizeEmailHtml,
  starterFreeHtml,
  type FreeHtmlFontKey,
} from "@/shared/email/free-html";
import { requestDesign } from "../ai/design-request";
import { AiSettingsDialog, useCredentialStatus } from "../ai/AiSettingsDialog";
import { useActiveProvider } from "../ai/use-ai-configuration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const REFINE_CHIPS = [
  "换成深松绿纸面信笺配色",
  "换成深藏青科技编辑风",
  "改成典雅衬线书信质感",
  "精简正文并放大日程时间对比",
  "顶部加细彩条，按钮改深暖棕",
] as const;

const FONT_KEYS: FreeHtmlFontKey[] = ["inherit", "sans", "serif", "mono"];

type FreeHtmlPanelProps = {
  document: DesignDocument;
  onApplyHtml: (
    next: {
      html: string;
      subject?: string;
      preheader?: string;
      source: "starter" | "ai" | "import";
    },
    label: string,
  ) => void;
  onUpdateMeta: (patch: Partial<DesignDocument["meta"]>, label: string) => void;
  onUpdateFont: (font: FreeHtmlFontKey) => void;
};

export function FreeHtmlPanel({
  document,
  onApplyHtml,
  onUpdateMeta,
  onUpdateFont,
}: FreeHtmlPanelProps) {
  const activeProvider = useActiveProvider();
  const keyStatus = useCredentialStatus(activeProvider.provider);
  const [tab, setTab] = useState<"ai" | "import" | "source">("ai");
  const [prompt, setPrompt] = useState("");
  const [mock, setMock] = useState(BROWSER_DEMO);
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState<{ code?: string; message: string } | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // External AI prompt & HTML import state
  const [externalGoal, setExternalGoal] = useState("");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [importDraft, setImportDraft] = useState("");
  const [importFeedback, setImportFeedback] = useState<{
    warnings: string[];
    ok: boolean;
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isInvite = document.target === "invite_page";
  const targetLabel = isInvite ? "邀请函网页" : "邮件";

  // Source editor state
  const currentHtml =
    document.customHtml?.html?.trim() || starterFreeHtml(document.target);
  const [sourceDraft, setSourceDraft] = useState<string | null>(null);
  const activeSource = sourceDraft ?? currentHtml;
  const currentFont = (
    Object.hasOwn(FREE_HTML_FONT_PRESETS, document.customHtml?.fontFamily ?? "")
      ? document.customHtml?.fontFamily
      : "inherit"
  ) as FreeHtmlFontKey;

  const hasKey =
    keyStatus === "saved" || keyStatus === "temporary" || keyStatus === "legacy";

  async function runAiHtml(modeType: "refine" | "fresh") {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setAiError({ message: "请先描述你的设计或修改要求。" });
      return;
    }
    if (!mock && !hasKey) {
      setAiError({
        code: "missing_key",
        message: `请先配置 ${activeProvider.label} API Key，或切换本地演示模式体验。`,
      });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setAiError(null);
    setAiSummary(null);
    setAiWarnings([]);

    try {
      const response = await requestDesign(
        {
          requestId: crypto.randomUUID(),
          mode: "html",
          target: document.target,
          prompt: trimmed,
          ...(modeType === "refine" ? { currentHtml } : {}),
          ...(!isInvite ? { subject: document.meta.subjectTemplate } : {}),
          mock,
        },
        controller.signal,
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        result?: {
          html?: string;
          subject?: string;
          preheader?: string;
          summary?: string;
          warnings?: string[];
        };
      };
      if (!response.ok || !data.result?.html) {
        setAiError({
          code: data.error,
          message: data.message || "AI 生成失败，请稍后重试。",
        });
        return;
      }
      onApplyHtml(
        {
          html: data.result.html,
          ...(!isInvite
            ? {
                subject: data.result.subject,
                preheader: data.result.preheader,
              }
            : {}),
          source: "ai",
        },
        modeType === "refine"
          ? `AI 精修${targetLabel} HTML`
          : `AI 生成${targetLabel} HTML`,
      );
      setSourceDraft(null);
      setAiSummary(data.result.summary ?? "已应用 AI 自由排版设计。");
      setAiWarnings(data.result.warnings ?? []);
    } catch (error) {
      if (controller.signal.aborted) {
        setAiError({ message: "已取消生成。" });
      } else {
        setAiError({
          message:
            error instanceof Error && error.message
              ? error.message
              : "连接 AI 服务失败，请检查网络或本地 AI 服务是否启动。",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyExternalPrompt() {
    const text = buildExternalAiPromptTemplate(externalGoal, document.target);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrompt(true);
      window.setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      setShowPromptPreview(true);
    }
  }

  function applyImportedHtml(raw: string, label = `导入外部 HTML ${targetLabel}`) {
    const trimmed = raw.trim();
    if (!trimmed || !/<[a-z]/iu.test(trimmed)) {
      setImportFeedback({
        ok: false,
        warnings: [],
        message: "未检测到有效的 HTML 标签，请粘贴完整的 HTML 代码。",
      });
      return;
    }
    const cleaned = sanitizeEmailHtml(trimmed, { allowDataImages: true, target: document.target });
    if (cleaned.html.length < 20) {
      setImportFeedback({
        ok: false,
        warnings: cleaned.warnings,
        message: "安全清洗后内容为空，请确认导入的是正文 HTML 而非纯脚本。",
      });
      return;
    }
    const inspection = inspectEmailHtmlVariables(cleaned.html, document.target);
    const notes = [...cleaned.warnings];
    if (!isInvite && !inspection.hasInviteLink && !inspection.hasOnboardingLink) {
      notes.push("提示：当前 HTML 中未检测到 {{rsvp_link}} 邀请函跳转链接。");
    }
    onApplyHtml({ html: cleaned.html, source: "import" }, label);
    setSourceDraft(null);
    setImportFeedback({
      ok: true,
      warnings: notes,
      message: `已安全清洗并导入画布（识别到 ${inspection.knownVariables.length} 个动态变量）。`,
    });
  }

  async function handleFileUpload(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setImportDraft(text);
    applyImportedHtml(text, `导入文件 ${file.name}`);
  }

  const importPreview = importDraft.trim()
    ? inspectEmailHtmlVariables(importDraft, document.target)
    : null;

  return (
    <aside className="rounded-3xl border border-border/70 bg-card/85 p-4">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as "ai" | "import" | "source");
          if (value === "source") setSourceDraft(null);
        }}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ai" className="text-xs">
            AI 调试
          </TabsTrigger>
          <TabsTrigger value="import" className="text-xs">
            外部导入
          </TabsTrigger>
          <TabsTrigger value="source" className="text-xs">
            源码与字体
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/60 px-2.5 py-2 text-xs">
            <span className="text-muted-foreground">
              {mock
                ? "本地演示模式"
                : !hasKey
                  ? "未配置 API Key"
                  : `${activeProvider.label} 已就绪`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={BROWSER_DEMO} onClick={() => setMock((prev) => !prev)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                  mock
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {BROWSER_DEMO ? "浏览器演示" : mock ? "切真实 AI" : "演示模式"}
              </button>
              <AiSettingsDialog>
                <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]">
                  <KeyRound className="size-3" aria-hidden="true" />
                  配置
                </Button>
              </AiSettingsDialog>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="free-html-prompt" className="text-xs">
              告诉 AI 你想要的效果或修改点
            </Label>
            <textarea
              id="free-html-prompt"
              rows={4}
              value={prompt}
              disabled={busy}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="例如：改成深松绿纸面信笺风，顶部加 4px 压顶条，日程区用左右两栏大字号突出时间，语气真诚温暖。"
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-xs leading-5 outline-none focus:border-primary"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {REFINE_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={busy}
                onClick={() => setPrompt(chip)}
                className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {chip}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {busy ? (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-1.5"
                onClick={() => abortRef.current?.abort()}
              >
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                正在生成中…点击取消
                <Square className="ml-1 size-3" aria-hidden="true" />
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  className="w-full gap-1.5"
                  onClick={() => runAiHtml("refine")}
                >
                  <Wand2 className="size-3.5" aria-hidden="true" />
                  AI 精修当前设计
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-1.5"
                  onClick={() => runAiHtml("fresh")}
                >
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  按需求从零重新设计
                </Button>
              </>
            )}
          </div>

          {aiError ? (
            <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <p>{aiError.message}</p>
              {aiError.code === "missing_key" ? (
                <AiSettingsDialog>
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs">
                    <KeyRound className="size-3" aria-hidden="true" />
                    打开 AI 配置
                  </Button>
                </AiSettingsDialog>
              ) : null}
            </div>
          ) : null}

          {aiSummary ? (
            <div className="space-y-1 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
              <p className="font-medium">{aiSummary}</p>
              {aiWarnings.map((warning) => (
                <p key={warning} className="text-[11px] text-amber-800">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="import" className="mt-4 space-y-4">
          <div className="space-y-2 rounded-2xl border border-border/70 bg-background/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">1. 复制约束提示词给外部 AI</span>
              <button
                type="button"
                onClick={() => setShowPromptPreview((prev) => !prev)}
                className="text-[11px] text-primary hover:underline"
              >
                {showPromptPreview ? "收起内容" : "查看提示词"}
              </button>
            </div>
            <Input
              value={externalGoal}
              onChange={(event) => setExternalGoal(event.target.value)}
              placeholder="可选：补充你的社团/活动风格要求"
              className="h-8 text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-xs"
              onClick={copyExternalPrompt}
            >
              {copiedPrompt ? (
                <>
                  <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
                  已复制规范提示词（可直接发给 通义千问 / DeepSeek / 任意 AI 助手）
                </>
              ) : (
                <>
                  <Copy className="size-3.5" aria-hidden="true" />
                  一键复制格式约束提示词
                </>
              )}
            </Button>
            {showPromptPreview ? (
              <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/40 p-2.5 font-mono text-[10px] leading-4 text-muted-foreground">
                {buildExternalAiPromptTemplate(externalGoal, document.target)}
              </pre>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="external-html-import" className="text-xs font-medium">
                2. 粘贴外部 AI 生成的 HTML 或上传文件
              </Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm,text/html"
                className="hidden"
                onChange={(event) => {
                  void handleFileUpload(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="size-3" aria-hidden="true" />
                上传 .html
              </Button>
            </div>
            <textarea
              id="external-html-import"
              rows={6}
              value={importDraft}
              onChange={(event) => setImportDraft(event.target.value)}
              placeholder="把外部 AI 输出的完整 HTML 粘贴到这里，系统会自动过滤危险脚本并绑定 CampusFlow 变量…"
              className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 font-mono text-[11px] leading-4 outline-none focus:border-primary"
            />
            {importPreview ? (
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                <span>变量识别：{importPreview.knownVariables.length} 项</span>
                {!isInvite && !importPreview.hasInviteLink && !importPreview.hasOnboardingLink ? (
                  <span className="inline-flex items-center gap-0.5 text-amber-700">
                    <AlertTriangle className="size-3" aria-hidden="true" />
                    未见 {"{{rsvp_link}}"}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => applyImportedHtml(importDraft)}
              >
                安全清洗并导入画布
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                title="恢复内置信笺示范模板"
                onClick={() => {
                  onApplyHtml(
                    { html: starterFreeHtml(document.target), source: "starter" },
                    "恢复信笺示范模板",
                  );
                  setSourceDraft(null);
                  setImportFeedback({
                    ok: true,
                    warnings: [],
                    message: "已恢复内置双栏信笺示范模板。",
                  });
                }}
              >
                <RotateCcw className="size-3" aria-hidden="true" />
                示范模板
              </Button>
            </div>
            {importFeedback ? (
              <div
                className={cn(
                  "space-y-1 rounded-xl border p-2.5 text-[11px]",
                  importFeedback.ok
                    ? "border-primary/20 bg-primary/5 text-primary"
                    : "border-destructive/30 bg-destructive/5 text-destructive",
                )}
              >
                <p className="font-medium">{importFeedback.message}</p>
                {importFeedback.warnings.map((warning) => (
                  <p key={warning} className="text-amber-800">
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="source" className="mt-4 space-y-4">
          {!isInvite ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="free-email-subject" className="text-xs">
                  邮件主题
                </Label>
                <Input
                  id="free-email-subject"
                  value={document.meta.subjectTemplate ?? ""}
                  onChange={(event) =>
                    onUpdateMeta({ subjectTemplate: event.target.value }, "修改邮件主题")
                  }
                  placeholder="例如：【{{organization_name}}】{{candidate_name}} 面试邀请"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="free-email-preheader" className="text-xs">
                  预览摘要
                </Label>
                <Input
                  id="free-email-preheader"
                  value={document.meta.preheaderText ?? ""}
                  onChange={(event) =>
                    onUpdateMeta({ preheaderText: event.target.value }, "修改预览摘要")
                  }
                  placeholder="收件箱列表展示的一行摘要"
                  className="h-8 text-xs"
                />
              </div>
            </>
          ) : null}

          <div className="space-y-1.5">
            <Label className="text-xs">全局字体覆盖</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {FONT_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onUpdateFont(key)}
                  className={cn(
                    "rounded-xl border px-2.5 py-1.5 text-left text-xs transition-colors",
                    currentFont === key
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border/70 bg-background/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {FREE_HTML_FONT_PRESETS[key].label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="free-html-source" className="inline-flex items-center gap-1 text-xs">
                <Code2 className="size-3.5" aria-hidden="true" />
                HTML 源码
              </Label>
              <Button
                type="button"
                size="sm"
                className="h-7 px-2.5 text-xs"
                disabled={sourceDraft === null || sourceDraft.trim() === currentHtml}
                onClick={() => {
                  if (sourceDraft === null) return;
                  const cleaned = sanitizeEmailHtml(sourceDraft, {
                    allowDataImages: true,
                    target: document.target,
                  }).html;
                  if (cleaned) {
                    onApplyHtml(
                      { html: cleaned, source: document.customHtml?.source ?? "import" },
                      "修改 HTML 源码",
                    );
                    setSourceDraft(null);
                  }
                }}
              >
                应用源码
              </Button>
            </div>
            <textarea
              id="free-html-source"
              rows={10}
              value={activeSource}
              onChange={(event) => setSourceDraft(event.target.value)}
              spellCheck={false}
              className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 font-mono text-[11px] leading-4 outline-none focus:border-primary"
            />
          </div>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
