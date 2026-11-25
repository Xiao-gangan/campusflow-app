import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, CheckCircle2, Eye, Pencil } from "lucide-react";
import type { DesignDocument } from "@/shared/contracts/design";
import {
  FREE_HTML_FONT_PRESETS,
  inspectEmailHtmlVariables,
  renderFreeEmailHtml,
  resolveFreeHtmlFontCss,
  sanitizeEmailHtml,
  starterFreeHtml,
  type FreeHtmlFontKey,
} from "@/shared/email/free-html";
import { sampleVariableValues } from "@/shared/design/variables";
import { orgPreviewVariables, useOrganizationProfile } from "../org/organization";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FONT_KEYS: FreeHtmlFontKey[] = ["inherit", "sans", "serif", "mono"];
const FONT_SHORT_LABELS: Record<FreeHtmlFontKey, string> = {
  inherit: "原字体",
  sans: "无衬线",
  serif: "衬线体",
  mono: "等宽",
};

type FreeHtmlCanvasProps = {
  document: DesignDocument;
  viewportWidth: number;
  deviceControl?: ReactNode;
  onUpdateHtml: (html: string, label: string) => void;
  onUpdateFont: (fontFamily: FreeHtmlFontKey) => void;
};

export function FreeHtmlCanvas({
  document,
  viewportWidth,
  deviceControl,
  onUpdateHtml,
  onUpdateFont,
}: FreeHtmlCanvasProps) {
  const [editTextMode, setEditTextMode] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(740);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isInvite = document.target === "invite_page";
  const rawHtml =
    document.customHtml?.html?.trim() || starterFreeHtml(document.target);
  const currentFont = (
    Object.hasOwn(FREE_HTML_FONT_PRESETS, document.customHtml?.fontFamily ?? "")
      ? document.customHtml?.fontFamily
      : "inherit"
  ) as FreeHtmlFontKey;

  const inspection = useMemo(
    () => inspectEmailHtmlVariables(rawHtml, document.target),
    [document.target, rawHtml],
  );

  const org = useOrganizationProfile();
  const previewContext = useMemo(
    () => orgPreviewVariables(sampleVariableValues(), org),
    [org],
  );
  const previewHtml = useMemo(() => {
    if (!editTextMode) {
      return renderFreeEmailHtml(document, previewContext, {
        allowDataImageUrls: true,
      }).html;
    }
    const sanitized = sanitizeEmailHtml(rawHtml, { allowDataImages: true, target: document.target }).html;
    const fontCss = resolveFreeHtmlFontCss(currentFont);
    const editCss = `
      ${fontCss ? `body,table,td,th,div,p,span,a,h1,h2,h3,h4,li,strong{font-family:${fontCss} !important;}` : ""}
      body{margin:0;padding:0;cursor:text;}
      body [contenteditable="true"]:focus{outline:none;}
      body *:hover{outline:1px dashed rgba(29,83,67,0.35);outline-offset:2px;}
    `;
    return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8" /><style>${editCss}</style></head><body>${sanitized}</body></html>`;
  }, [currentFont, document, editTextMode, previewContext, rawHtml]);

  function measureHeight() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    const next = isInvite
      ? Math.max(120, Math.min(3600, Math.ceil(doc.body.getBoundingClientRect().height)))
      : Math.max(460, Math.min(2200, doc.body.scrollHeight + 24));
    setIframeHeight(next);
  }

  function commitInlineTextEdits() {
    const body = iframeRef.current?.contentDocument?.body;
    if (!body) {
      setEditTextMode(false);
      return;
    }
    const cleaned = sanitizeEmailHtml(body.innerHTML, { allowDataImages: true, target: document.target }).html;
    if (cleaned && cleaned !== rawHtml) {
      onUpdateHtml(cleaned, "修改邮件文字");
    }
    setEditTextMode(false);
  }

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let observer: ResizeObserver | undefined;

    const handleLoad = () => {
      measureHeight();
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      observer?.disconnect();
      if (isInvite) {
        observer = new ResizeObserver(measureHeight);
        observer.observe(doc.body);
      }
      if (editTextMode) {
        doc.body.setAttribute("contenteditable", "true");
        doc.body.setAttribute("spellcheck", "false");
        doc.addEventListener("click", (event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest("a")) event.preventDefault();
        });
        doc.body.addEventListener("input", measureHeight);
      } else {
        doc.body.removeAttribute("contenteditable");
        doc.addEventListener("click", (event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest("a")) event.preventDefault();
        });
      }
    };

    iframe.addEventListener("load", handleLoad);
    return () => {
      iframe.removeEventListener("load", handleLoad);
      observer?.disconnect();
    };
  }, [editTextMode, isInvite, previewHtml]);

  const missingInviteLink =
    !isInvite && !inspection.hasInviteLink && !inspection.hasOnboardingLink;

  return (
    <section
      aria-label={isInvite ? "AI 自由 HTML 邀请函画布" : "AI 自由 HTML 邮件画布"}
      className="flex min-w-0 flex-1 flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-card/80 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-full border border-border/70 bg-background/70 p-0.5">
            <button
              type="button"
              onClick={() => {
                if (editTextMode) commitInlineTextEdits();
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                !editTextMode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Eye className="size-3" aria-hidden="true" />
              变量预览
            </button>
            <button
              type="button"
              onClick={() => setEditTextMode(true)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                editTextMode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Pencil className="size-3" aria-hidden="true" />
              直接改字
            </button>
          </div>
          {editTextMode ? (
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 rounded-full px-2.5 text-xs"
              onClick={commitInlineTextEdits}
            >
              <Check className="size-3" aria-hidden="true" />
              保存文字
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="全局字体切换">
            {FONT_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onUpdateFont(key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  currentFont === key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/70 bg-background/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {FONT_SHORT_LABELS[key]}
              </button>
            ))}
          </div>
          {deviceControl}
        </div>
      </div>

      <div className={cn("relative flex min-h-[520px] flex-1 flex-col items-center overflow-x-auto rounded-3xl bg-muted/35",
        !isInvite && "border border-border/70 p-4 sm:p-6")}>
        <div
          className={cn("w-full overflow-hidden transition-[max-width] duration-200",
            !isInvite && "rounded-2xl border border-border/60 bg-[#f1eeeb] shadow-sm")}
          style={{ maxWidth: viewportWidth, ...(isInvite ? { backgroundColor: document.theme.backgroundColor } : {}) }}
        >
          <iframe
            ref={iframeRef}
            title={isInvite ? "自由 HTML 邀请函画布" : "自由 HTML 邮件画布"}
            sandbox="allow-same-origin"
            srcDoc={previewHtml}
            className="block w-full border-0 bg-transparent"
            style={{ height: iframeHeight }}
          />
          {isInvite ? (
            <div className="px-3.5 pt-4 pb-6">
              <div className="mx-auto max-w-[640px] rounded-[18px] bg-[#fffdfa] p-5 text-center shadow-sm">
                <div className="font-serif text-[11px] tracking-[3px]" style={{ color: document.theme.primaryColor }}>
                  RSVP · 系统自动挂载
                </div>
                <div className="mt-1 text-base font-semibold text-[#241b19]">
                  出席确认与答复
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                  <span className="inline-flex min-w-[140px] items-center justify-center rounded px-4 py-2 text-xs font-semibold text-[#fffdfa]"
                    style={{ backgroundColor: document.theme.buttonColor ?? document.theme.primaryColor }}>
                    确认准时参加
                  </span>
                  <span className="inline-flex min-w-[140px] items-center justify-center rounded border border-[#c7b8ae] bg-transparent px-4 py-2 text-xs font-medium text-[#302321]">
                    申请调整时间 / 婉拒
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/60 bg-card/70 px-3 py-2 text-[11px]">
        {inspection.knownVariables.length > 0 ? (
          <>
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              已识别变量
            </span>
            {inspection.knownVariables.map((item) => (
              <span
                key={item.key}
                className="rounded-full border border-emerald-200 bg-emerald-50/80 px-2 py-0.5 text-emerald-800"
                title={`{{${item.key}}}`}
              >
                {item.label}
              </span>
            ))}
          </>
        ) : (
          <span className="text-muted-foreground">未检测到动态变量（将按静态内容发送）</span>
        )}
        {missingInviteLink ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-amber-800">
            <AlertTriangle className="size-3" aria-hidden="true" />
            未绑定邀请函链接 {"{{rsvp_link}}"}
          </span>
        ) : null}
        {inspection.unknownVariables.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-amber-800">
            <AlertTriangle className="size-3" aria-hidden="true" />
            未识别变量：{inspection.unknownVariables.join("、")}
          </span>
        ) : null}
      </div>
    </section>
  );
}
