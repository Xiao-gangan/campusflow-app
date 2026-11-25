import { Maximize2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { DesignDocument } from "@/shared/contracts/design";
import { aiPatchFieldLabel, styleLabelFor } from "@/shared/ai/schema";
import { displayVariableText } from "@/shared/ai/prompt";
import { BLOCK_STYLE_FIELDS, isBlockStyleKey } from "@/shared/design/block-style";
import { resolvePreviewLayout } from "@/shared/design/devices";
import { moduleDefinition } from "@/shared/design/modules";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { resolveDocumentAssetUrls } from "./asset-resolution";
import { sampleVariableValues } from "@/shared/design/variables";
import { InvitePageView } from "../invite/InvitePageView";
import { BlockPreview } from "./BlockPreview";
import { ScaledPreview } from "./ScaledPreview";
import type { AiSession } from "./use-ai-design";

const INVITE_CONTEXT = sampleVariableValues();

function ReadOnlyDesign({
  document,
  blockId,
  viewportWidth,
}: {
  document: DesignDocument;
  blockId?: string;
  viewportWidth: number;
}) {
  const theme = document.theme;
  const blocks = blockId ? document.blocks.filter((block) => block.id === blockId) : document.blocks;
  const { viewportWidth: logicalViewportWidth, contentWidth } = resolvePreviewLayout(
    viewportWidth,
    theme.width,
  );
  if (document.target === "invite_page") {
    return (
      <ScaledPreview viewportWidth={logicalViewportWidth} contentWidth={contentWidth}>
        <div inert>
          <InvitePageView document={{ ...document, blocks }} context={INVITE_CONTEXT} embedded />
        </div>
      </ScaledPreview>
    );
  }
  return (
    <div className="min-w-0 rounded-xl border border-border/60 p-2" style={{ backgroundColor: theme.backgroundColor }}>
      <ScaledPreview viewportWidth={logicalViewportWidth} contentWidth={contentWidth}>
        <div
          className="mx-auto w-full"
          style={{
            maxWidth: theme.width,
            overflowWrap: "anywhere",
            backgroundColor: theme.surfaceColor,
            borderRadius: theme.radius,
            border: `1px solid ${theme.borderColor ?? "#dfe7e2"}`,
            padding: logicalViewportWidth <= 480 ? 20 : 28,
          }}
        >
          {!blockId && (document.meta.subjectTemplate || document.meta.preheaderText) ? (
            <dl
              className="mb-3 space-y-1 border-b pb-2"
              style={{ fontFamily: theme.fontFamily, borderColor: theme.borderColor }}
            >
              {document.meta.subjectTemplate ? (
                <>
                  <dt className="sr-only">邮件主题</dt>
                  <dd className="text-xs font-medium" style={{ color: theme.textColor }}>
                    {displayVariableText(document.meta.subjectTemplate)}
                  </dd>
                </>
              ) : null}
              {document.meta.preheaderText ? (
                <>
                  <dt className="sr-only">预览摘要</dt>
                  <dd className="text-[11px]" style={{ color: theme.mutedTextColor }}>
                    {displayVariableText(document.meta.preheaderText)}
                  </dd>
                </>
              ) : null}
            </dl>
          ) : null}
          <div className="flex min-w-0 flex-col" style={{ gap: theme.spacing }}>
            {blocks.map((block) => (
              <div key={block.id} className="p-2">
                <BlockPreview
                  block={block}
                  theme={theme}
                  target={document.target}
                  viewportWidth={viewportWidth}
                  interactiveLinks={false}
                />
              </div>
            ))}
          </div>
          {blocks.length === 0 ? <p className="text-center text-xs text-muted-foreground">暂无内容</p> : null}
        </div>
      </ScaledPreview>
    </div>
  );
}

function diffDisplay(key: string, value: string | number | undefined): string {
  if (value === undefined) return isBlockStyleKey(key) ? "跟随预设" : "—";
  if (key === "variant" && typeof value === "string") return styleLabelFor(value);
  if (isBlockStyleKey(key)) {
    const field = BLOCK_STYLE_FIELDS[key];
    if (field.kind === "number" && "unit" in field) return `${value} ${field.unit}`;
    if (field.kind === "select") return (field.options as Record<string, string>)[String(value)] ?? String(value);
  }
  return displayVariableText(String(value));
}

export function AiDesignComparison({
  session,
  assetUrls,
  viewportWidth,
}: {
  session: AiSession;
  assetUrls: Record<string, string>;
  viewportWidth: number;
}) {
  const [side, setSide] = useState<"before" | "after">("after");
  const [open, setOpen] = useState(false);
  const before = useMemo(
    () => session.beforeDocument ? resolveDocumentAssetUrls(session.beforeDocument, assetUrls) : null,
    [session.beforeDocument, assetUrls],
  );
  const after = useMemo(
    () => session.previewDocument ? resolveDocumentAssetUrls(session.previewDocument, assetUrls) : null,
    [session.previewDocument, assetUrls],
  );
  if (!before || !after) return null;
  const patch = session.patch;
  const label = patch ? moduleDefinition(patch.blockType)?.label ?? "组件" : before.target === "invite_page" ? "整页邀请函" : "整篇邮件";

  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-background/60 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <p className="text-xs font-medium">{label}对比</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]">
              <Maximize2 className="size-3" aria-hidden="true" />
              放大对比
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-7xl">
            <DialogHeader>
              <DialogTitle>{label}前后对比</DialogTitle>
              <DialogDescription>查看此次请求生成前后的效果。</DialogDescription>
            </DialogHeader>
            <div className="grid min-w-0 items-start gap-4 md:grid-cols-2">
              <section className="min-w-0 space-y-2" aria-label="修改前">
                <h3 className="text-sm font-medium">修改前</h3>
                <ReadOnlyDesign document={before} blockId={patch?.blockId} viewportWidth={viewportWidth} />
              </section>
              <section className="min-w-0 space-y-2" aria-label="修改后">
                <h3 className="text-sm font-medium">修改后</h3>
                <ReadOnlyDesign document={after} blockId={patch?.blockId} viewportWidth={viewportWidth} />
              </section>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {patch ? (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/45 p-1" role="group" aria-label="组件预览">
            {(["before", "after"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={side === item}
                className={cn("rounded-md px-2 py-1 text-[11px]", side === item && "bg-background font-medium shadow-sm")}
                onClick={() => setSide(item)}
              >
                {item === "before" ? "修改前" : "修改后"}
              </button>
            ))}
          </div>
          <ReadOnlyDesign document={side === "before" ? before : after} blockId={patch.blockId} viewportWidth={viewportWidth} />
          <dl className="space-y-1.5 pt-1 text-[11px]">
            {Object.keys(patch.after).map((key) => (
              <div key={key} className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] gap-1.5 break-words">
                <dt className="font-medium">{aiPatchFieldLabel(patch.blockType, key)}</dt>
                <dd className="min-w-0 space-y-0.5">
                  <p className="text-muted-foreground line-through">{diffDisplay(key, patch.before[key])}</p>
                  <p>{diffDisplay(key, patch.after[key])}</p>
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </div>
  );
}
