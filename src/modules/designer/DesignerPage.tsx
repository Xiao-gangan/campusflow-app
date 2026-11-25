import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Code2,
  Copy,
  Eye,
  LayoutGrid,
  Library,
  Palette,
  Redo2,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type {
  DesignAsset,
  DesignBlockType,
  DesignDocument,
  DesignTarget,
  DesignTheme,
  EmailDesignMode,
} from "@/shared/contracts/design";
import {
  addBlock,
  createDefaultDocument,
  duplicateBlock,
  moveBlock,
  removeBlock,
  reorderBlock,
  setDesignMode,
  updateBlockProps,
  updateCustomHtml,
  updateMeta,
  updateTheme,
} from "@/shared/domain/design";
import {
  starterFreeHtml,
  type FreeHtmlFontKey,
} from "@/shared/email/free-html";
import { supportsAiBlockType } from "@/shared/ai/schema";
import type { HistorySnapshot } from "@/shared/design/history";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { writeInvitePreviewDraft } from "@/shared/invite/preview-draft";
import {
  resolveDeviceSize,
  type DeviceId,
} from "@/shared/design/devices";
import { pathToHash } from "../../app/navigation";
import { navigateHash, useLocationHash } from "../../app/use-hash-route";
import { PageHeader } from "../../components/app/page-header";
import { DraftStatus, formatDraftTime } from "./DraftStatus";
import { loadInitialDesignerState, type DraftNotice } from "./draft-state";
import { saveImageBlob } from "./asset-store";
import { resolveDocumentAssetUrls } from "./asset-resolution";
import { isBlockStyleKey } from "@/shared/design/block-style";
import { AiDesignPanel } from "./AiDesignPanel";
import { DesignerCanvas } from "./DesignerCanvas";
import { DesignerOverview } from "./DesignerOverview";
import { FreeHtmlCanvas } from "./FreeHtmlCanvas";
import { FreeHtmlPanel } from "./FreeHtmlPanel";
import { DevicePicker } from "./DevicePicker";
import { EmailOutputDialog } from "./EmailOutputDialog";
import { InvitePreviewDialog } from "./InvitePreviewDialog";
import { LibraryDialog, type LibraryTab } from "./LibraryDialog";
import { SaveTemplateDialog } from "./SaveTemplateDialog";
import { browserDesignLibrary, type SavedDesignTemplate } from "./local-library";
import { useTemplateList } from "./use-template-list";
import { ModulePalette } from "./ModulePalette";
import { PersonalizationEditor } from "./PersonalizationEditor";
import { PropertyPanel } from "./PropertyPanel";
import { ThemePanel } from "./ThemePanel";
import { useAiDesign } from "./use-ai-design";
import { useAssetUrls } from "./use-asset-urls";
import { useAutoDraft } from "./use-auto-draft";
import { useDesignerHistory } from "./use-designer-history";
import { useMediaQuery } from "./use-media-query";
import {
  hashForTarget,
  isDesignerOverviewHash,
  targetFromHash,
} from "./target-route";

type Panel = "module" | "theme" | "ai";
type MobileSheet = "library" | "module" | "theme" | "ai";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

export default function DesignerPage() {
  const hash = useLocationHash();
  const showOverview = isDesignerOverviewHash(hash);
  const [initialState] = useState(loadInitialDesignerState);
  const [target, setTarget] = useState<DesignTarget>(() =>
    targetFromHash(window.location.hash),
  );
  const [pendingTemplate, setPendingTemplate] =
    useState<SavedDesignTemplate | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(() => {
    const initialTarget = targetFromHash(window.location.hash);
    return initialState.documents[initialTarget].blocks[0]?.id ?? null;
  });
  const [panel, setPanel] = useState<Panel>("module");
  const [mobileSheet, setMobileSheet] = useState<MobileSheet | null>(null);
  const [deviceId, setDeviceId] = useState<DeviceId>("desktop");
  const [customWidth, setCustomWidth] = useState(390);
  const [library] = useState(() =>
    browserDesignLibrary(initialState.storage ?? createMemoryStorage()),
  );
  const templates = useTemplateList(library, undefined, showOverview);
  const [assets, setAssets] = useState<DesignAsset[]>(() => library.listAssets());
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [invitePreviewOpen, setInvitePreviewOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("templates");
  const [outputTab, setOutputTab] = useState<"preview" | "export">("preview");
  const [documentRevision, setDocumentRevision] = useState(0);
  const [revealToken, setRevealToken] = useState(0);
  const [draftNotices, setDraftNotices] = useState<DraftNotice[]>(
    initialState.notices,
  );
  const [operationNotice, setOperationNotice] = useState<{
    message: string;
    undoable: boolean;
  } | null>(null);
  const isWide = useMediaQuery("(min-width: 1360px)");
  const canvasViewportWidth = resolveDeviceSize(deviceId, customWidth).width;

  const history = useDesignerHistory(
    initialState.documents,
    target,
    selectedBlockId,
  );
  const targetRef = useRef(target);
  targetRef.current = target;
  const documentsRef = useRef(history.documents);
  documentsRef.current = history.documents;
  const designDocument = history.documents[target];
  const designMode: EmailDesignMode =
    designDocument.mode === "html" ? "html" : "blocks";
  const isFreeHtml = designMode === "html";
  const selectedBlock =
    designDocument.blocks.find((block) => block.id === selectedBlockId) ?? null;
  const assetUrls = useAssetUrls(assets);
  const renderedDocument = useMemo(
    () => resolveDocumentAssetUrls(designDocument, assetUrls),
    [designDocument, assetUrls],
  );
  const draft = useAutoDraft({
    target,
    document: designDocument,
    storage: initialState.storage,
    initialDocuments: initialState.documents,
    initialSavedAt: initialState.savedAtByTarget,
  });

  const commitDocument = useCallback(
    (
      updater: (current: DesignDocument) => DesignDocument,
      label: string,
      coalesceKey?: string,
    ) =>
      history.commit(updater, {
        label,
        coalesceKey,
        selectedBlockId,
      }),
    [history.commit, selectedBlockId],
  );

  const restoreSnapshot = useCallback((snapshot: HistorySnapshot | null) => {
    if (!snapshot) return;
    const nextSelected =
      snapshot.selectedBlockId &&
      snapshot.document.blocks.some(
        (block) => block.id === snapshot.selectedBlockId,
      )
        ? snapshot.selectedBlockId
        : (snapshot.document.blocks[0]?.id ?? null);
    setSelectedBlockId(nextSelected);
    setDocumentRevision((revision) => revision + 1);
    setRevealToken((value) => value + 1);
  }, []);

  const handleUndo = useCallback(() => {
    const snapshot = history.undo();
    if (!snapshot) return;
    restoreSnapshot(snapshot);
    setOperationNotice({ message: "已撤销上一步，可重做。", undoable: false });
  }, [history.undo, restoreSnapshot]);

  const handleRedo = useCallback(() => {
    const snapshot = history.redo();
    if (!snapshot) return;
    restoreSnapshot(snapshot);
    setOperationNotice({ message: "已重做上一步。", undoable: false });
  }, [history.redo, restoreSnapshot]);

  const aiLockedRef = useRef(false);

  // Auto-dismiss routine operation notices and restored draft notices so floating toasts never linger.
  useEffect(() => {
    if (!operationNotice) return;
    const timer = window.setTimeout(() => setOperationNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [operationNotice]);

  useEffect(() => {
    const hasRestored = draftNotices.some(
      (notice) => notice.kind === "restored" && notice.target === target,
    );
    if (!hasRestored) return;
    const timer = window.setTimeout(() => {
      setDraftNotices((current) =>
        current.filter((notice) => !(notice.kind === "restored" && notice.target === target)),
      );
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [draftNotices, target]);

  function switchDesignMode(nextMode: EmailDesignMode) {
    if (nextMode === designMode) return;
    commitDocument(
      (current) => setDesignMode(current, nextMode, starterFreeHtml(current.target)),
      nextMode === "html" ? "切换到自由 HTML 模式" : "切换到积木排版模式",
    );
    setMobileSheet(null);
  }

  function applyFreeHtml(
    next: {
      html: string;
      subject?: string;
      preheader?: string;
      source: "starter" | "ai" | "import";
    },
    label: string,
  ) {
    commitDocument((current) => {
      let updated = updateCustomHtml(setDesignMode(current, "html"), {
        html: next.html,
        source: next.source,
      });
      if (next.subject !== undefined || next.preheader !== undefined) {
        updated = updateMeta(updated, {
          ...(next.subject !== undefined ? { subjectTemplate: next.subject } : {}),
          ...(next.preheader !== undefined ? { preheaderText: next.preheader } : {}),
        });
      }
      return updated;
    }, label);
    setOperationNotice({ message: `${label}已应用，可随时撤销。`, undoable: true });
  }

  function updateFreeHtmlFont(fontFamily: FreeHtmlFontKey) {
    commitDocument(
      (current) =>
        updateCustomHtml(
          setDesignMode(current, "html", starterFreeHtml(current.target)),
          { fontFamily },
        ),
      "切换全局字体",
      "free-html-font",
    );
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (aiLockedRef.current) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || event.isComposing) return;
      const key = event.key.toLowerCase();
      const isUndo = key === "z" && !event.shiftKey;
      const isRedo = (key === "z" && event.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;
      const targetNode = event.target;
      const element =
        targetNode instanceof Element ? targetNode : null;
      if (
        element?.closest(
          "input, textarea, select, [contenteditable='true'], .personalization-editor, .canvas-inline-editor",
        )
      ) {
        // Text fields keep their own undo history; document undo is for the canvas.
        return;
      }
      event.preventDefault();
      if (isUndo) handleUndo();
      else handleRedo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRedo, handleUndo]);

  function switchTarget(next: DesignTarget) {
    targetRef.current = next;
    setTarget(next);
    setSelectedBlockId(documentsRef.current[next].blocks[0]?.id ?? null);
    setPanel("module");
    setMobileSheet(null);
    setOperationNotice(null);
    setDocumentRevision((revision) => revision + 1);
    const nextHash =
      next === "invite_page"
        ? hashForTarget("invite_page")
        : "#/designer?target=email";
    if (window.location.hash !== nextHash) {
      navigateHash(nextHash);
    }
  }

  useEffect(() => {
    if (!pendingTemplate || pendingTemplate.target !== target) return;
    const next = structuredClone(pendingTemplate.document);
    commitDocument(() => next, `载入模板：${pendingTemplate.name}`);
    setSelectedBlockId(next.blocks[0]?.id ?? null);
    setPanel("module");
    setDocumentRevision((revision) => revision + 1);
    setOperationNotice({
      message: `已载入模板「${pendingTemplate.name}」。`,
      undoable: true,
    });
    setPendingTemplate(null);
  }, [commitDocument, pendingTemplate, target]);

  useEffect(() => {
    const syncTargetFromHash = () => {
      if (isDesignerOverviewHash(window.location.hash)) return;
      const next = targetFromHash(window.location.hash);
      if (next === targetRef.current) return;
      targetRef.current = next;
      setTarget(next);
      setSelectedBlockId(documentsRef.current[next].blocks[0]?.id ?? null);
      setPanel("module");
      setMobileSheet(null);
      setOperationNotice(null);
      setDocumentRevision((revision) => revision + 1);
    };
    window.addEventListener("hashchange", syncTargetFromHash);
    return () => window.removeEventListener("hashchange", syncTargetFromHash);
  }, []);

  function addModule(type: DesignBlockType, variant?: string) {
    let createdId: string | null = null;
    const changed = commitDocument(
      (current) => {
        const next = addBlock(current, type);
        if (next === current) return current;
        const created = next.blocks[next.blocks.length - 1];
        if (!created) return current;
        createdId = created.id;
        return variant
          ? updateBlockProps(next, created.id, { variant })
          : next;
      },
      variant ? "添加模块并应用样式" : "添加模块",
    );
    if (!changed || !createdId) return;
    setSelectedBlockId(createdId);
    setPanel("module");
    setRevealToken((value) => value + 1);
    setMobileSheet(null);
    setOperationNotice({
      message: "已添加模块，可在画布中拖动排序。",
      undoable: true,
    });
  }

  function removeSelected(id: string) {
    const index = designDocument.blocks.findIndex((block) => block.id === id);
    const changed = commitDocument(
      (current) => removeBlock(current, id),
      "删除模块",
    );
    if (!changed) return;
    if (selectedBlockId === id) {
      const neighbor =
        index > 0
          ? designDocument.blocks[index - 1]
          : (designDocument.blocks[index + 1] ?? null);
      setSelectedBlockId(neighbor?.id ?? null);
    }
    setRevealToken((value) => value + 1);
    setOperationNotice({ message: "已删除模块，可撤销恢复。", undoable: true });
  }

  function duplicateSelected(id: string) {
    let copiedId: string | null = null;
    const changed = commitDocument((current) => {
      const result = duplicateBlock(current, id);
      copiedId = result.block?.id ?? null;
      return result.document;
    }, "复制模块");
    if (!changed || !copiedId) return;
    setSelectedBlockId(copiedId);
    setPanel("module");
    setRevealToken((value) => value + 1);
    setOperationNotice({
      message: "已复制模块，新模块在下方。",
      undoable: true,
    });
  }

  function moveSelected(id: string, direction: -1 | 1) {
    commitDocument(
      (current) => moveBlock(current, id, direction),
      direction === -1 ? "上移模块" : "下移模块",
    );
    setRevealToken((value) => value + 1);
  }

  function reorderModules(
    activeId: string,
    overId: string,
    position: "before" | "after",
  ) {
    commitDocument(
      (current) => reorderBlock(current, activeId, overId, position),
      "调整模块顺序",
    );
    setRevealToken((value) => value + 1);
  }

  function updateBlockPropsById(
    blockId: string,
    patch: Record<string, unknown>,
  ) {
    const changedKeys = Object.keys(patch)
      .filter((key) => key !== "richText")
      .sort();
    const styleOnly = changedKeys.length > 0 && changedKeys.every((key) => key === "variant" || isBlockStyleKey(key));
    commitDocument(
      (current) => updateBlockProps(current, blockId, patch),
      styleOnly ? "调整模块样式" : "修改模块内容",
      changedKeys.length ? `block:${blockId}:${changedKeys.join(",")}` : undefined,
    );
  }

  function updateProps(patch: Record<string, unknown>) {
    if (!selectedBlockId) return;
    updateBlockPropsById(selectedBlockId, patch);
  }

  function updateProp(key: string, value: unknown) {
    updateProps({ [key]: value });
  }

  function updateThemePatch(patch: Partial<DesignTheme>) {
    const keys = Object.keys(patch).sort();
    commitDocument(
      (current) => updateTheme(current, patch),
      "调整主题",
      `theme:${keys.join(",")}`,
    );
  }

  function updateMetaPatch(patch: Partial<DesignDocument["meta"]>) {
    const keys = Object.keys(patch).sort();
    commitDocument(
      (current) => updateMeta(current, patch),
      "编辑邮件信息",
      `meta:${keys.join(",")}`,
    );
  }

  function resetCanvas() {
    const next = createDefaultDocument(target);
    if (!commitDocument(() => next, "重置画布")) return;
    setSelectedBlockId(next.blocks[0]?.id ?? null);
    setPanel("module");
    setMobileSheet(null);
    setRevealToken((value) => value + 1);
    setDocumentRevision((revision) => revision + 1);
    setOperationNotice({
      message: "已重置为默认模板，可用撤销恢复之前的内容。",
      undoable: true,
    });
  }

  function loadTemplate(next: DesignDocument) {
    const document = structuredClone(next);
    if (!commitDocument(() => document, "载入模板")) return;
    setSelectedBlockId(document.blocks[0]?.id ?? null);
    setPanel("module");
    setMobileSheet(null);
    setRevealToken((value) => value + 1);
    setDocumentRevision((revision) => revision + 1);
    setOperationNotice({
      message: "已载入模板，可用撤销恢复之前的内容。",
      undoable: true,
    });
  }

  function useAsset(asset: DesignAsset) {
    if (!selectedBlock) return;
    if (selectedBlock.type !== "image" && selectedBlock.type !== "logo") return;
    if (asset.source === "upload") {
      updateProps({ src: "", assetId: asset.id });
      return;
    }
    updateProps({ src: asset.url, assetId: "" });
  }

  async function uploadImage(
    file: File,
    dimensions: { width: number; height: number },
  ): Promise<DesignAsset> {
    const kind = selectedBlock?.type === "logo" ? "logo" : "image";
    const asset = library.saveAsset({
      name: file.name.replace(/\.[^.]+$/u, "") || "图片",
      url: "",
      kind,
      source: "upload",
      mimeType: file.type,
      size: file.size,
      width: dimensions.width,
      height: dimensions.height,
    });
    try {
      await saveImageBlob(asset.id, file);
    } catch (error) {
      library.deleteAsset(asset.id);
      throw error;
    }
    setAssets(library.listAssets());
    return asset;
  }

  function openLibrary(tab: LibraryTab) {
    setLibraryTab(tab);
    setLibraryOpen(true);
  }

  function openEmailOutput(tab: "preview" | "export") {
    setOutputTab(tab);
    setOutputOpen(true);
  }

  function openInvitePreview() {
    try {
      writeInvitePreviewDraft(window.localStorage, designDocument);
    } catch {
      // Preview still opens with a built-in sample when storage is unavailable.
    }
    window.open(pathToHash("/invite/preview"), "_blank", "noopener,noreferrer");
  }

  function openMobileSheet(sheet: MobileSheet) {
    if (aiLocked && sheet !== "ai") return;
    setMobileSheet(sheet);
    if (sheet === "module") setPanel("module");
    if (sheet === "theme") setPanel("theme");
    if (sheet === "ai") setPanel("ai");
  }

  function applyAiDesign(next: DesignDocument, label: string) {
    if (next.target !== targetRef.current || !commitDocument(() => next, label)) return;
    setSelectedBlockId(
      next.blocks.find((block) => block.id === selectedBlockId)?.id ??
        next.blocks[0]?.id ??
        null,
    );
    setPanel("module");
    setMobileSheet(null);
    setRevealToken((value) => value + 1);
    setDocumentRevision((revision) => revision + 1);
    setOperationNotice({
      message: `${label}已应用，可用撤销恢复原内容。`,
      undoable: true,
    });
  }

  function saveAiTemplate(name: string, document: DesignDocument): string {
    const saved = library.saveTemplate({ name, document, origin: "ai" });
    return `已保存「${saved.name}」到 AI 生成模板。`;
  }

  const ai = useAiDesign({
    document: designDocument,
    target,
    selectedBlock,
    onApply: applyAiDesign,
    onSaveTemplate: saveAiTemplate,
  });
  const aiLocked = ai.isBusy || Boolean(ai.previewDocument);
  aiLockedRef.current = aiLocked;

  const aiPreviewDocument = useMemo(
    () =>
      ai.previewDocument
        ? resolveDocumentAssetUrls(ai.previewDocument, assetUrls)
        : null,
    [ai.previewDocument, assetUrls],
  );

  function dismissDraftNotice(notice: DraftNotice) {
    setDraftNotices((current) => current.filter((item) => item !== notice));
  }

  const sidePanel = (
    <aside className="rounded-[24px] border border-border/70 bg-card/80 p-4">
      <Tabs value={panel} onValueChange={(value) => setPanel(value as Panel)}>
        <TabsList
          className="grid w-full grid-cols-3"
        >
          <TabsTrigger value="module" disabled={aiLocked}>
            模块属性
          </TabsTrigger>
          <TabsTrigger value="theme" disabled={aiLocked}>
            主题
          </TabsTrigger>
          <TabsTrigger value="ai">AI 设计</TabsTrigger>
        </TabsList>
        <TabsContent value="module" className="mt-4">
          <PropertyPanel
            block={selectedBlock}
            target={target}
            theme={designDocument.theme}
            assets={assets}
            assetUrls={assetUrls}
            revision={documentRevision}
            onUpdateProp={updateProp}
            onUpdateProps={updateProps}
            onUploadImage={uploadImage}
            onUseAsset={useAsset}
            onUseAi={
              selectedBlock &&
              supportsAiBlockType(selectedBlock.type, target)
                ? () => {
                    ai.setMode("block");
                    setPanel("ai");
                  }
                : undefined
            }
          />
        </TabsContent>
        <TabsContent value="theme" className="mt-4">
          <ThemePanel
            target={target}
            theme={designDocument.theme}
            onUpdate={updateThemePatch}
          />
        </TabsContent>
        <TabsContent value="ai" className="mt-4">
            <AiDesignPanel
              ai={ai}
              assetUrls={assetUrls}
              previewViewportWidth={canvasViewportWidth}
              selectedBlock={selectedBlock}
              onOpenAiTemplates={() => {
                ai.discard();
                openLibrary("ai");
              }}
            />
          </TabsContent>
      </Tabs>
    </aside>
  );

  const mobileSheetTitle =
    mobileSheet === "library"
      ? "内容模块"
      : mobileSheet === "module"
        ? "模块属性"
        : mobileSheet === "theme"
          ? "主题"
          : "AI 设计";
  const mobileSheetDescription =
    mobileSheet === "library"
      ? "点击模块添加到画布末尾；带样式按钮可直接选择样式后添加。"
      : mobileSheet === "module"
        ? "修改选中模块的文字、链接、图片和样式；关闭后画布位置保持不变。"
        : mobileSheet === "theme"
          ? "配色只影响样式，不会改动文字、变量或模块顺序。"
          : "使用自己的 AI 厂商 API Key，或在本机演示模式下预览效果。";

  const devicePickerNode = (
    <DevicePicker
      value={deviceId}
      customWidth={customWidth}
      onChange={(id, width) => {
        setDeviceId(id);
        setCustomWidth(width);
      }}
    />
  );

  if (showOverview) {
    return (
      <DesignerOverview
        documents={history.documents}
        templates={templates}
        onUpdateFeatured={library.updateFeaturedPresets}
        onOpenEditor={(nextTarget) => switchTarget(nextTarget)}
        onLoadTemplate={(template) => {
          setPendingTemplate(template);
          switchTarget(template.target);
        }}
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader title={target === "email" ? "邮件设计" : "邀请函网页"} />

      <div className="flex flex-col gap-2.5 rounded-2xl border border-border/70 bg-card/90 px-3 py-2.5 shadow-xs backdrop-blur-md sm:flex-row sm:items-center sm:justify-between lg:sticky lg:top-3 lg:z-30">
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="inline-flex items-center rounded-full border border-border/70 bg-background/70 p-0.5"
            role="group"
            aria-label="排版模式"
          >
            <button
              type="button"
              disabled={aiLocked}
              onClick={() => switchDesignMode("blocks")}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                !isFreeHtml
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="size-3" aria-hidden="true" />
              积木
            </button>
            <button
              type="button"
              disabled={aiLocked}
              onClick={() => switchDesignMode("html")}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                isFreeHtml
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Code2 className="size-3" aria-hidden="true" />
              自由 HTML
            </button>
          </div>
          <DraftStatus
            state={draft.state}
            onRetry={draft.retry}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center rounded-full border border-border/70 bg-background/60"
            role="group"
            aria-label="撤销与重做"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-r-none"
              disabled={aiLocked || !history.canUndo}
              onClick={handleUndo}
              title={
                history.undoLabel
                  ? `撤销：${history.undoLabel}（⌘Z / Ctrl+Z）`
                  : "暂无可撤销操作"
              }
              aria-label={
                history.undoLabel ? `撤销：${history.undoLabel}` : "撤销"
              }
              aria-keyshortcuts="Meta+Z Control+Z"
            >
              <Undo2 className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-l-none"
              disabled={aiLocked || !history.canRedo}
              onClick={handleRedo}
              title={
                history.redoLabel
                  ? `重做：${history.redoLabel}（⇧⌘Z / Ctrl+Y）`
                  : "暂无可重做操作"
              }
              aria-label={
                history.redoLabel ? `重做：${history.redoLabel}` : "重做"
              }
              aria-keyshortcuts="Meta+Shift+Z Control+Y"
            >
              <Redo2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="模板与素材"
                title="模板与素材"
                disabled={aiLocked}
              >
                <Library className="size-3.5" aria-hidden="true" />
                <span>模板</span>
                <ChevronDown className="size-3" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => openLibrary("templates")}>
                我的模板
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openLibrary("ai")}>
                AI 生成模板
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openLibrary("styles")}>
                风格模板
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openLibrary("assets")}>
                素材库
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={resetCanvas}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                重置为默认模板
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="保存模板"
            title="保存为可复用模板"
            disabled={aiLocked}
            onClick={() => setSaveOpen(true)}
          >
            <Save className="size-3.5" aria-hidden="true" />
            <span>保存</span>
          </Button>
          {target === "email" ? (
            <Button
              type="button"
              size="sm"
              aria-label="预览与导出邮件"
              title="预览与导出邮件"
              disabled={aiLocked}
              onClick={() => openEmailOutput("preview")}
            >
              <Eye className="size-3.5" aria-hidden="true" />
              <span>预览与导出</span>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              aria-label="页面预览"
              disabled={aiLocked}
              title={aiLocked ? "应用或取消 AI 设计后可打开页面预览" : "页面预览"}
              onClick={() => setInvitePreviewOpen(true)}
            >
              <Eye className="size-3.5" aria-hidden="true" />
              <span>页面预览</span>
            </Button>
          )}
        </div>
      </div>

      {!isWide ? (
        isFreeHtml ? (
          <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card/80 p-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => openMobileSheet("ai")}
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              AI 调试 / 外部导入 / 源码
            </Button>
          </div>
        ) : (
        <div
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/80 p-2"
          aria-label="编辑工具"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            disabled={aiLocked}
            title={aiLocked ? "AI 处理中，应用或取消后可继续编辑" : undefined}
            onClick={() => openMobileSheet("library")}
          >
            <LayoutGrid className="size-3.5" aria-hidden="true" />
            内容
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            disabled={aiLocked}
            title={aiLocked ? "AI 处理中，应用或取消后可继续编辑" : undefined}
            onClick={() => openMobileSheet("module")}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            属性
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            disabled={aiLocked}
            title={aiLocked ? "AI 处理中，应用或取消后可继续编辑" : undefined}
            onClick={() => openMobileSheet("theme")}
          >
            <Palette className="size-3.5" aria-hidden="true" />
            主题
          </Button>
          <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => openMobileSheet("ai")}
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              AI
            </Button>
        </div>
        )
      ) : null}

      {isFreeHtml ? (
        <div className="grid gap-4 min-[1360px]:grid-cols-[minmax(0,1fr)_340px] min-[1600px]:grid-cols-[minmax(0,1fr)_360px] min-[1360px]:gap-5">
          <FreeHtmlCanvas
            document={designDocument}
            viewportWidth={canvasViewportWidth}
            deviceControl={devicePickerNode}
            onUpdateHtml={(html, label) =>
              applyFreeHtml(
                { html, source: designDocument.customHtml?.source ?? "starter" },
                label,
              )
            }
            onUpdateFont={updateFreeHtmlFont}
          />
          {isWide ? (
            <div className="min-w-0 min-[1360px]:sticky min-[1360px]:top-20 min-[1360px]:self-start min-[1360px]:max-h-[calc(100vh-6rem)] min-[1360px]:overflow-y-auto">
              <FreeHtmlPanel
                document={designDocument}
                onApplyHtml={applyFreeHtml}
                onUpdateMeta={(patch, label) =>
                  commitDocument((current) => updateMeta(current, patch), label, "free-html-meta")
                }
                onUpdateFont={updateFreeHtmlFont}
              />
            </div>
          ) : null}
        </div>
      ) : (
      <div className="flex flex-col gap-4">
        {target === "email" ? (
          <div className={cn("order-2 grid gap-3 rounded-2xl border border-border/70 bg-card/80 p-3 sm:grid-cols-2 min-[1360px]:order-1", aiLocked && "pointer-events-none opacity-60")}>
            <div className="space-y-1.5">
              <Label className="text-[13px]">邮件主题</Label>
              <PersonalizationEditor
                key={`email-subject-${documentRevision}`}
                value={designDocument.meta.subjectTemplate ?? ""}
                target="email"
                label="邮件主题"
                placeholder="例如：面试邀请"
                onChange={(next) => updateMetaPatch({ subjectTemplate: next })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">预览摘要</Label>
              <PersonalizationEditor
                key={`email-preheader-${documentRevision}`}
                value={designDocument.meta.preheaderText ?? ""}
                target="email"
                label="预览摘要"
                placeholder="收件箱列表中显示的简短摘要"
                onChange={(next) => updateMetaPatch({ preheaderText: next })}
              />
            </div>
          </div>
        ) : null}

        <div className="order-1 grid gap-4 min-[1360px]:order-2 min-[1360px]:grid-cols-[232px_minmax(0,1fr)_284px] min-[1600px]:grid-cols-[252px_minmax(0,1fr)_304px] min-[1360px]:gap-5">
        {isWide ? (
          <div className="order-2 min-w-0 min-[1360px]:sticky min-[1360px]:top-20 min-[1360px]:order-1 min-[1360px]:self-start min-[1360px]:max-h-[calc(100vh-6rem)] min-[1360px]:overflow-y-auto">
            {aiLocked ? (
              <div className="rounded-[24px] border border-dashed border-border/70 bg-card/60 p-4 text-center">
                <p className="text-sm font-medium">{ai.isBusy ? "AI 生成中" : "AI 预览中"}</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  应用或取消 AI 设计后，可继续从模块库添加内容。
                </p>
              </div>
            ) : (
              <ModulePalette
                target={target}
                theme={designDocument.theme}
                onAdd={addModule}
              />
            )}
          </div>
        ) : null}

        <div className={cn("order-1 min-w-0 min-[1360px]:order-2", ai.isBusy && !aiPreviewDocument && "pointer-events-none opacity-80")}>
          <DesignerCanvas
            document={renderedDocument}
            selectedBlockId={selectedBlockId}
            revision={documentRevision}
            revealToken={revealToken}
            onSelect={(id) => {
              setSelectedBlockId(id);
              if (id) setPanel("module");
            }}
            onMove={moveSelected}
            onRemove={removeSelected}
            onDuplicate={duplicateSelected}
            onReorder={reorderModules}
            onUpdateBlockProps={updateBlockPropsById}
            previewDocument={aiPreviewDocument?.target === target ? aiPreviewDocument : null}
            previewPlan={ai.session?.plan?.blocks ?? null}
            previewStatus={ai.session?.status ?? null}
            previewStage={ai.session?.stage ?? null}
            previewProvider={ai.session?.provider ?? null}
            previewViewportWidth={canvasViewportWidth}
            deviceControl={devicePickerNode}
          />
        </div>

        {isWide ? (
          <div className="order-3 min-w-0 min-[1360px]:sticky min-[1360px]:top-20 min-[1360px]:self-start min-[1360px]:max-h-[calc(100vh-6rem)] min-[1360px]:overflow-y-auto">
            {sidePanel}
          </div>
        ) : null}
        </div>
      </div>
      )}

      {!isWide ? (
        <Sheet
          open={mobileSheet !== null}
          onOpenChange={(open) => {
            if (!open) setMobileSheet(null);
          }}
        >
          <SheetContent
            side="bottom"
            className="max-h-[88dvh] gap-0 overflow-y-auto p-0"
          >
            <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
              <SheetTitle className="text-sm">{mobileSheetTitle}</SheetTitle>
              <SheetDescription className="sr-only">
                {mobileSheetDescription}
              </SheetDescription>
            </SheetHeader>
            <div className="px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
              {mobileSheet === "library" ? (
                <ModulePalette
                  target={target}
                  theme={designDocument.theme}
                  onAdd={addModule}
                />
              ) : null}
              {mobileSheet === "module" ? (
                <div className="space-y-3">
                  {selectedBlock ? (
                    <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border/70 bg-background/60 p-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => moveSelected(selectedBlock.id, -1)}
                      >
                        <ArrowUp className="size-3" aria-hidden="true" />
                        上移
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => moveSelected(selectedBlock.id, 1)}
                      >
                        <ArrowDown className="size-3" aria-hidden="true" />
                        下移
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => duplicateSelected(selectedBlock.id)}
                      >
                        <Copy className="size-3" aria-hidden="true" />
                        复制
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-[11px] text-destructive"
                        onClick={() => removeSelected(selectedBlock.id)}
                      >
                        <Trash2 className="size-3" aria-hidden="true" />
                        删除
                      </Button>
                    </div>
                  ) : null}
                  <PropertyPanel
                    block={selectedBlock}
                    target={target}
                    theme={designDocument.theme}
                    assets={assets}
                    assetUrls={assetUrls}
                    revision={documentRevision}
                    onUpdateProp={updateProp}
                    onUpdateProps={updateProps}
                    onUploadImage={uploadImage}
                    onUseAsset={useAsset}
                    onUseAi={
                      selectedBlock &&
                      supportsAiBlockType(selectedBlock.type, target)
                        ? () => {
                            ai.setMode("block");
                            setMobileSheet("ai");
                          }
                        : undefined
                    }
                  />
                </div>
              ) : null}
              {mobileSheet === "theme" ? (
                <ThemePanel
                  target={target}
                  theme={designDocument.theme}
                  onUpdate={updateThemePatch}
                />
              ) : null}
              {mobileSheet === "ai" ? (
                isFreeHtml ? (
                  <FreeHtmlPanel
                    document={designDocument}
                    onApplyHtml={applyFreeHtml}
                    onUpdateMeta={(patch, label) =>
                      commitDocument((current) => updateMeta(current, patch), label, "free-html-meta")
                    }
                    onUpdateFont={updateFreeHtmlFont}
                  />
                ) : (
                  <AiDesignPanel
                    ai={ai}
                    assetUrls={assetUrls}
                    previewViewportWidth={canvasViewportWidth}
                    selectedBlock={selectedBlock}
                    onOpenAiTemplates={() => {
                      ai.discard();
                      setMobileSheet(null);
                      openLibrary("ai");
                    }}
                  />
                )
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      <LibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        target={target}
        document={designDocument}
        documents={[history.documents.email, history.documents.invite_page]}
        library={library}
        assets={assets}
        canUseAsset={
          selectedBlock?.type === "image" || selectedBlock?.type === "logo"
        }
        initialTab={libraryTab}
        onAssetsChange={setAssets}
        onLoad={loadTemplate}
        onUseAsset={useAsset}
        onApplyTheme={(theme) =>
          commitDocument((current) => ({ ...current, theme }), "应用主题")
        }
        onRequestSave={() => {
          setLibraryOpen(false);
          setSaveOpen(true);
        }}
      />
      <SaveTemplateDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        document={designDocument}
        library={library}
        storageAvailable={Boolean(initialState.storage)}
        onViewTemplates={() => openLibrary("templates")}
      />
      <EmailOutputDialog
        open={outputOpen}
        onOpenChange={setOutputOpen}
        document={designDocument}
        assets={assets}
        initialTab={outputTab}
        initialDeviceId={deviceId}
        initialCustomWidth={customWidth}
        draftState={draft.state}
      />
      <InvitePreviewDialog
        open={invitePreviewOpen}
        onOpenChange={setInvitePreviewOpen}
        document={renderedDocument}
        initialDeviceId={deviceId}
        initialCustomWidth={customWidth}
        onOpenInNewTab={openInvitePreview}
      />

      {(() => {
        const visibleDraftNotices = draftNotices.filter(
          (notice) => !("target" in notice) || notice.target === target,
        );
        if (!visibleDraftNotices.length && !operationNotice) return null;
        return (
          <div
            className="pointer-events-none fixed bottom-5 right-5 z-40 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
            aria-live="polite"
          >
            {visibleDraftNotices.map((notice) => {
              const isRestored = notice.kind === "restored";
              return (
                <div
                  key={`${notice.kind}-${"target" in notice ? notice.target : "global"}`}
                  className={cn(
                    "pointer-events-auto flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-xs shadow-lg backdrop-blur-md",
                    isRestored
                      ? "border-border/80 bg-card/95 text-foreground"
                      : "border-amber-300/80 bg-amber-50/95 text-amber-900",
                  )}
                  role="status"
                >
                  <p className="min-w-0 leading-5">
                    {isRestored
                      ? `已恢复上次未保存的${notice.target === "email" ? "邮件" : "邀请函"}草稿（${formatDraftTime(notice.savedAt) || "刚刚"}）`
                      : notice.reason}
                  </p>
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground"
                    aria-label="关闭提示"
                    onClick={() => dismissDraftNotice(notice)}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
            {operationNotice ? (
              <div
                className="pointer-events-auto flex items-center justify-between gap-2 rounded-2xl border border-primary/25 bg-card/95 px-3.5 py-2.5 text-xs text-foreground shadow-lg backdrop-blur-md"
                role="status"
              >
                <span className="min-w-0 leading-5">{operationNotice.message}</span>
                <div className="flex shrink-0 items-center gap-1">
                  {operationNotice.undoable && history.canUndo ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-primary"
                      onClick={handleUndo}
                    >
                      <Undo2 className="size-3" aria-hidden="true" />
                      撤销
                    </Button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-full p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground"
                    aria-label="关闭提示"
                    onClick={() => setOperationNotice(null)}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })()}
    </div>
  );
}
