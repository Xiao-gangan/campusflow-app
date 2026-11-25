import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type { DesignDocument } from "@/shared/contracts/design";
import { AI_PROVIDERS, isAiProviderId } from "@/shared/ai/providers";
import { readBlockStyleOverrides } from "@/shared/design/block-style";
import { moduleDefinition } from "@/shared/design/modules";
import { resolvePreviewLayout } from "@/shared/design/devices";
import { sanitizeRichTextMap } from "@/shared/design/rich-text";
import { sampleVariableValues } from "@/shared/design/variables";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InvitePageView } from "../invite/InvitePageView";
import { BlockPreview } from "./BlockPreview";
import { ScaledPreview } from "./ScaledPreview";
import { CanvasInlineEditor } from "./CanvasInlineEditor";
import { useModuleDrag } from "./use-module-drag";
import { orgPreviewVariables, useOrganizationProfile } from "../org/organization";

const SAMPLE_INVITE_CONTEXT = sampleVariableValues();
const FLOATING_TOOLBAR_KEY = "campusflow.designer.floating-toolbar";

type DesignerCanvasProps = {
  document: DesignDocument;
  selectedBlockId: string | null;
  revision: number;
  revealToken: number;
  onSelect: (id: string | null) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (
    activeId: string,
    overId: string,
    position: "before" | "after",
  ) => void;
  onUpdateBlockProps: (blockId: string, patch: Record<string, unknown>) => void;
  onInlineEditEnd?: () => void;
  previewDocument?: DesignDocument | null;
  previewPlan?: { id: string; type: string; purpose?: string }[] | null;
  previewStatus?:
    | "idle"
    | "starting"
    | "planning"
    | "generating"
    | "completed"
    | "failed"
    | "cancelled"
    | null;
  previewStage?: string | null;
  previewProvider?: string | null;
  previewViewportWidth?: number | null;
  deviceControl?: ReactNode;
};

type InlineEditing = {
  blockId: string;
  fieldKey: string;
  point?: { x: number; y: number };
};

function readFloatingToolbarPreference() {
  try {
    return window.localStorage.getItem(FLOATING_TOOLBAR_KEY) !== "0";
  } catch {
    return true;
  }
}

export function DesignerCanvas({
  document,
  selectedBlockId,
  revision,
  revealToken,
  onSelect,
  onMove,
  onRemove,
  onDuplicate,
  onReorder,
  onUpdateBlockProps,
  onInlineEditEnd,
  previewDocument = null,
  previewPlan = null,
  previewStatus = null,
  previewStage = null,
  previewProvider = null,
  previewViewportWidth = null,
  deviceControl,
}: DesignerCanvasProps) {
  const isInvite = document.target === "invite_page";
  const org = useOrganizationProfile();
  const inviteContext = orgPreviewVariables(SAMPLE_INVITE_CONTEXT, org);
  const drag = useModuleDrag(onReorder);
  const theme = document.theme;
  const canvasRef = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState<InlineEditing | null>(null);
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(
    readFloatingToolbarPreference,
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        FLOATING_TOOLBAR_KEY,
        showFloatingToolbar ? "1" : "0",
      );
    } catch {
      // The preference is optional; editing still works without storage.
    }
  }, [showFloatingToolbar]);

  useEffect(() => {
    setEditing((current) =>
      current && current.blockId !== selectedBlockId ? null : current,
    );
  }, [selectedBlockId]);

  useEffect(() => {
    setEditing(null);
  }, [document.target, revision]);

  useEffect(() => {
    if (!revealToken || !selectedBlockId) return;
    const surface = canvasRef.current?.querySelector<HTMLElement>(
      "[data-canvas-surface]",
    );
    const element = surface?.querySelector<HTMLElement>(
      `[data-module-id="${selectedBlockId}"]`,
    );
    if (!element) return;
    element.scrollIntoView({ block: "nearest", behavior: "smooth" });
    element.classList.remove("module-reveal");
    void element.offsetWidth;
    element.classList.add("module-reveal");
    const timer = window.setTimeout(
      () => element.classList.remove("module-reveal"),
      1400,
    );
    return () => window.clearTimeout(timer);
  }, [revealToken, selectedBlockId]);

  function beginInlineEdit(
    blockId: string,
    fieldKey: string,
    point?: { x: number; y: number },
  ) {
    onSelect(blockId);
    setEditing({ blockId, fieldKey, point });
  }

  function beginPrimaryInlineEdit(blockId: string) {
    const block = document.blocks.find((item) => item.id === blockId);
    if (!block) return;
    const field = moduleDefinition(block.type)?.fields.find((item) => item.rich);
    if (!field) return;
    beginInlineEdit(blockId, field.key);
  }

  function closeInlineEdit() {
    if (!editing) return;
    setEditing(null);
    onInlineEditEnd?.();
  }

  function handleInlineDoubleClick(event: ReactMouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(".canvas-inline-editor")) return;
    const fieldElement = target.closest<HTMLElement>("[data-inline-field]");
    const blockElement = target.closest<HTMLElement>("[data-module-id]");
    if (!fieldElement || !blockElement) return;
    const fieldKey = fieldElement.dataset.inlineField;
    const blockId = blockElement.dataset.moduleId;
    if (!fieldKey || !blockId) return;
    event.preventDefault();
    beginInlineEdit(blockId, fieldKey, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  function renderInlineEditor(blockId: string, fieldKey: string) {
    if (
      !editing ||
      editing.blockId !== blockId ||
      editing.fieldKey !== fieldKey
    ) {
      return null;
    }
    const block = document.blocks.find((item) => item.id === blockId);
    if (!block) return null;
    const field = moduleDefinition(block.type)?.fields.find(
      (item) => item.key === fieldKey,
    );
    if (!field) return null;
    const richMap = sanitizeRichTextMap(block.props.richText);
    const { textColor, fontSize } = readBlockStyleOverrides(block.type, block.props);
    return (
      <CanvasInlineEditor
        key={`${blockId}:${fieldKey}`}
        value={String(block.props[fieldKey] ?? "")}
        richText={richMap[fieldKey]}
        target={document.target}
        multiline={field.type === "textarea"}
        label={field.label}
        focusPoint={editing.point}
        showToolbar={showFloatingToolbar}
        useBlockTextColor={textColor !== undefined}
        useBlockFontSize={fontSize !== undefined}
        onClearBlockTextColor={() =>
          onUpdateBlockProps(blockId, { textColor: undefined })
        }
        onClearBlockFontSize={() =>
          onUpdateBlockProps(blockId, { fontSize: undefined })
        }
        onHideToolbar={() => setShowFloatingToolbar(false)}
        onClose={closeInlineEdit}
        onChange={(next, nextRichText) => {
          const nextMap = { ...richMap };
          if (nextRichText) nextMap[fieldKey] = nextRichText;
          else delete nextMap[fieldKey];
          onUpdateBlockProps(blockId, {
            [fieldKey]: next,
            richText: nextMap,
          });
        }}
      />
    );
  }

  const aiPreview = Boolean(previewDocument);
  const shownTheme = aiPreview && previewDocument ? previewDocument.theme : theme;
  const naturalWidth = isInvite ? shownTheme.width : 600;
  const { viewportWidth, contentWidth } = resolvePreviewLayout(
    previewViewportWidth && previewViewportWidth > 0
      ? previewViewportWidth
      : naturalWidth,
    naturalWidth,
  );
  const emailSurfaceStyle: CSSProperties = {
    backgroundColor: shownTheme.surfaceColor,
    borderRadius: shownTheme.radius,
    padding: !isInvite && viewportWidth <= 480 ? 20 : 28,
    border: `1px solid ${shownTheme.borderColor ?? "rgba(29,83,67,.14)"}`,
    boxShadow: "0 24px 60px -30px rgba(18,37,29,.35)",
  };
  const aiPlan =
    aiPreview && previewDocument
      ? (previewPlan ??
          previewDocument.blocks.map((block) => ({
            id: block.id,
            type: block.type,
            purpose: "",
          })))
      : [];

  return (
    <section ref={canvasRef} className="rounded-[24px] border border-border/70 bg-card/70 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex flex-wrap items-center gap-2">
          {aiPreview ? (
            <>
              <Badge
                variant="outline"
                className="rounded-full border-primary/30 bg-background/60 text-[11px] text-primary"
              >
                <span className="flex items-center gap-1">
                  <Sparkles className="size-3" aria-hidden="true" />
                  AI 预览
                </span>
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {previewStage ?? "正在准备"}
              </span>
            </>
          ) : (
            deviceControl
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {aiPreview ? (
            <>
              <span className="text-[11px] text-muted-foreground">
                只读预览 · 尚未应用
              </span>
              {previewProvider ? (
                <Badge variant="outline" className="rounded-full text-[10px]">
                  {previewProvider === "mock" ? "本地演示" : isAiProviderId(previewProvider) ? AI_PROVIDERS[previewProvider].label : "AI"}
                </Badge>
              ) : null}
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
              aria-pressed={showFloatingToolbar}
              title={
                showFloatingToolbar
                  ? "隐藏画布中的浮动格式工具条"
                  : "显示画布中的浮动格式工具条"
              }
              onClick={() => setShowFloatingToolbar((current) => !current)}
            >
              {showFloatingToolbar ? (
                <Eye className="size-3.5" aria-hidden="true" />
              ) : (
                <EyeOff className="size-3.5" aria-hidden="true" />
              )}
              画布工具条
            </Button>
          )}
          <span className="text-[11px] text-muted-foreground">
            {aiPreview ? aiPlan.length : document.blocks.length} 个模块
          </span>
        </div>
      </div>

      {aiPreview && previewDocument && !isInvite ? (
        <div
          className="campus-grid min-h-[520px] overflow-x-auto rounded-[22px] border border-border/60 p-4 sm:p-6"
          style={{ backgroundColor: "#ece7dc" }}
        >
          <ScaledPreview
            viewportWidth={viewportWidth}
            contentWidth={contentWidth}
          >
            <div className="w-full" data-canvas-surface="">
              <div style={emailSurfaceStyle}>
                <div className="mb-4 flex items-center justify-between gap-2 rounded-xl bg-primary/5 px-3 py-2 text-[11px]">
                <span className="flex items-center gap-1.5 text-primary">
                  {previewStatus === "completed" ? (
                    <Sparkles className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  )}
                  {previewStatus === "completed"
                    ? "AI 设计已完成，尚未应用"
                    : previewStage ?? "正在生成"}
                </span>
                {previewProvider ? (
                  <span className="text-[10px] text-muted-foreground">
                    {previewProvider === "mock" ? "本地演示" : isAiProviderId(previewProvider) ? AI_PROVIDERS[previewProvider].label : "AI"}
                  </span>
                ) : null}
              </div>
              {aiPlan.length === 0 ? (
                <div className="grid min-h-[300px] place-items-center rounded-2xl border border-dashed border-border bg-background/40 p-6 text-center">
                  <div className="space-y-1">
                    <Loader2 className="mx-auto size-4 animate-spin text-primary" />
                    <p className="text-sm font-medium">正在规划邮件结构</p>
                    <p className="text-[11px] text-muted-foreground">
                      结构和主题确定后会立即显示模块。
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: shownTheme.spacing,
                  }}
                >
                  {aiPlan.map((item) => {
                    const block = previewDocument.blocks.find(
                      (candidate) => candidate.id === item.id,
                    );
                    if (!block) {
                      const label =
                        moduleDefinition(
                          item.type as DesignDocument["blocks"][number]["type"],
                        )?.label ?? "内容";
                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-dashed border-border bg-background/40 p-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-muted-foreground">
                              {label}
                            </span>
                            <Loader2 className="size-3.5 animate-spin text-primary" />
                          </div>
                          <div className="mt-3 space-y-2">
                            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={block.id} className="p-2">
                        <BlockPreview
                          block={block}
                          theme={shownTheme}
                          target="email"
                          viewportWidth={viewportWidth}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          </ScaledPreview>
        </div>
      ) : isInvite ? (
        <div className="min-h-[520px] overflow-hidden rounded-[22px] border border-border/60">
          <ScaledPreview
            viewportWidth={viewportWidth}
            contentWidth={contentWidth}
          >
            <div className="w-full" data-canvas-surface="">
              <div className="invite-canvas-scroll" onDoubleClick={aiPreview ? undefined : handleInlineDoubleClick}>
              {previewDocument ? (
                <div inert>
                  <InvitePageView document={previewDocument} context={inviteContext} embedded />
                </div>
              ) : (
              <InvitePageView
                document={document}
                context={inviteContext}
                embedded
                editable
                selectedBlockId={selectedBlockId}
                onSelectBlock={onSelect}
                onMoveBlock={onMove}
                onDuplicateBlock={onDuplicate}
                onRemoveBlock={onRemove}
                onReorderBlock={onReorder}
                onEditBlock={beginPrimaryInlineEdit}
                editingBlockId={editing?.blockId ?? null}
                editingField={editing?.fieldKey ?? null}
                renderInlineEditor={renderInlineEditor}
              />
              )}
            </div>
          </div>
          </ScaledPreview>
        </div>
      ) : (
        <div
          className="campus-grid min-h-[520px] overflow-x-auto rounded-[22px] border border-border/60 p-4 sm:p-6"
          style={{ backgroundColor: "#ece7dc" }}
          onDoubleClick={handleInlineDoubleClick}
        >
          <ScaledPreview
            viewportWidth={viewportWidth}
            contentWidth={contentWidth}
          >
            <div className="w-full" data-canvas-surface="">
              <div style={emailSurfaceStyle}>
              {document.blocks.length === 0 ? (
                <div className="grid min-h-[360px] place-items-center rounded-2xl border border-dashed border-border p-8 text-center">
                  <div>
                    <p className="text-sm font-medium text-foreground">画布还是空的</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      从左侧模块库添加一个模块开始。
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: shownTheme.spacing,
                  }}
                >
                  {document.blocks.map((block, index) => {
                    const selected = block.id === selectedBlockId;
                    const blockLabel =
                      moduleDefinition(block.type)?.label ?? "内容";
                    const hasRichTextField = Boolean(
                      moduleDefinition(block.type)?.fields.some(
                        (field) => field.rich,
                      ),
                    );
                    return (
                      <div
                        key={block.id}
                        data-module-id={block.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`选择${blockLabel}模块`}
                        aria-pressed={selected}
                        onClick={() => onSelect(block.id)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelect(block.id);
                          }
                        }}
                        onDragOver={(event) => drag.onDragOver(event, block.id)}
                        onDrop={(event) => drag.onDrop(event, block.id)}
                        className={cn(
                          "relative rounded-2xl p-2 transition-all",
                          selected
                            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                            : "hover:ring-1 hover:ring-primary/30",
                          drag.dropClass(block.id),
                          drag.isDragging(block.id) && "module-dragging",
                        )}
                      >
                        {selected ? (
                          <div
                            data-block-toolbar=""
                            className="absolute -top-7 right-2 z-10 flex items-center gap-1 rounded-full border border-border bg-background/95 p-1 shadow-sm"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              draggable
                              tabIndex={-1}
                              aria-label="按住拖动，调整模块顺序"
                              title="按住拖动，调整模块顺序"
                              className="flex h-6 cursor-grab items-center gap-1 rounded-full px-1.5 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
                              onDragStart={(event) =>
                                drag.onDragStart(event, block.id)
                              }
                              onDragEnd={drag.onDragEnd}
                            >
                              <GripVertical className="size-3.5" aria-hidden="true" />
                              <span>拖动排序</span>
                            </button>
                            {hasRichTextField ? (
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="ghost"
                                aria-label="在画布上编辑文字"
                                title="在画布上编辑文字"
                                onClick={() => beginPrimaryInlineEdit(block.id)}
                              >
                                <Pencil className="size-3" />
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              aria-label="上移模块"
                              disabled={index === 0}
                              onClick={() => onMove(block.id, -1)}
                            >
                              <ArrowUp className="size-3" />
                            </Button>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              aria-label="下移模块"
                              disabled={index === document.blocks.length - 1}
                              onClick={() => onMove(block.id, 1)}
                            >
                              <ArrowDown className="size-3" />
                            </Button>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              aria-label="复制模块"
                              title="复制模块"
                              onClick={() => onDuplicate(block.id)}
                            >
                              <Copy className="size-3" />
                            </Button>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              aria-label="删除模块"
                              className="text-destructive hover:text-destructive"
                              onClick={() => onRemove(block.id)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        ) : null}
                        <BlockPreview
                          block={block}
                          theme={theme}
                          target={document.target}
                          viewportWidth={viewportWidth}
                          editingField={
                            editing?.blockId === block.id
                              ? editing.fieldKey
                              : null
                          }
                          renderInlineEditor={(fieldKey) =>
                            renderInlineEditor(block.id, fieldKey)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          </ScaledPreview>
        </div>
      )}
    </section>
  );
}
