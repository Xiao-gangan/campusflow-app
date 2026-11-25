import { useEffect, useMemo, useState } from "react";
import {
  ImagePlus,
  Copy,
  Link2,
  Palette,
  Pencil,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  DesignAsset,
  DesignAssetKind,
  DesignDocument,
  DesignTarget,
  DesignTheme,
} from "@/shared/contracts/design";
import {
  THEME_PRESETS,
  applyThemePreset,
} from "@/shared/design/theme-presets";
import {
  INVITE_PRESETS,
  createInvitePresetDocument,
} from "@/shared/invite/presets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildAssetReferenceMap } from "./asset-reference";
import { assetSource } from "./asset-resolution";
import { deleteImageBlob } from "./asset-store";
import type { DesignLibrary, SavedDesignTemplate } from "./local-library";

export type LibraryTab = "templates" | "ai" | "styles" | "assets";

type LibraryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: DesignTarget;
  document: DesignDocument;
  documents: DesignDocument[];
  library: DesignLibrary;
  assets: DesignAsset[];
  canUseAsset: boolean;
  initialTab?: LibraryTab;
  onAssetsChange: (assets: DesignAsset[]) => void;
  onLoad: (document: DesignDocument) => void;
  onUseAsset: (asset: DesignAsset) => void;
  onApplyTheme: (theme: DesignTheme) => void;
  onRequestSave: () => void;
};

function TemplateThumb({ document }: { document: DesignDocument }) {
  const theme = document.theme;
  return (
    <div
      className="grid h-11 w-16 shrink-0 place-items-center rounded-lg border border-black/5"
      style={{ backgroundColor: theme.backgroundColor }}
      aria-hidden="true"
    >
      <div
        className="w-10 space-y-1 rounded-[3px] p-1.5"
        style={{ backgroundColor: theme.surfaceColor }}
      >
        <span
          className="block h-1.5 rounded-sm"
          style={{ backgroundColor: theme.primaryColor }}
        />
        <span className="block h-1 rounded-sm bg-black/10" />
        <span className="block h-1 w-2/3 rounded-sm bg-black/10" />
      </div>
    </div>
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function LibraryDialog({
  open,
  onOpenChange,
  target,
  document,
  documents,
  library,
  assets,
  canUseAsset,
  initialTab = "templates",
  onAssetsChange,
  onLoad,
  onUseAsset,
  onApplyTheme,
  onRequestSave,
}: LibraryDialogProps) {
  const [templates, setTemplates] = useState<SavedDesignTemplate[]>([]);
  const [tab, setTab] = useState<LibraryTab>(initialTab);
  const [assetName, setAssetName] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [assetKind, setAssetKind] = useState<DesignAssetKind>("logo");
  const [message, setMessage] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const showPresets = target === "invite_page";

  useEffect(() => {
    if (!open) return;
    setTemplates(library.listTemplates(target));
    setTab(initialTab);
    setMessage("");
    setRenamingId(null);
    const unsubscribe = library.subscribeTemplates(() => setTemplates(library.listTemplates(target)));
    void library.refreshTemplates();
    return unsubscribe;
  }, [open, target, library, initialTab]);

  const assetReferences = useMemo(() => {
    if (!open) return new Map<string, string>();
    return buildAssetReferenceMap({
      documents,
      templateDocuments: library.listTemplates().map((item) => item.document),
    });
  }, [open, documents, library, templates]);

  function deleteTemplate(id: string) {
    library.deleteTemplate(id);
    setTemplates(library.listTemplates(target));
    setMessage("模板已删除。");
  }

  function saveRename() {
    if (!renamingId) return;
    const updated = library.renameTemplate(renamingId, renameValue);
    setTemplates(library.listTemplates(target));
    setRenamingId(null);
    setMessage(updated ? `已重命名为「${updated.name}」。` : "重命名失败。");
  }

  function duplicateTemplate(id: string) {
    const copy = library.duplicateTemplate(id);
    setTemplates(library.listTemplates(target));
    setMessage(copy ? `已另存为「${copy.name}」。` : "另存失败。");
  }

  function renderTemplates(
    list: SavedDesignTemplate[],
    emptyText: string,
  ) {
    if (list.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          {emptyText}
        </div>
      );
    }
    return list.map((template) => (
      <div
        key={template.id}
        className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <TemplateThumb document={template.document} />
          <div className="min-w-0">
            {renamingId === template.id ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveRename();
                    if (event.key === "Escape") setRenamingId(null);
                  }}
                  className="h-7 text-xs"
                  aria-label="模板名称"
                  autoFocus
                />
                <Button type="button" size="sm" className="h-7" onClick={saveRename}>
                  保存
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[13px] font-medium">{template.name}</p>
                {(template.origin ?? "manual") === "ai" ? (
                  <Badge variant="outline" className="rounded-full text-[9px]">
                    AI 生成
                  </Badge>
                ) : null}
              </div>
            )}
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {template.target === "email" ? "邮件正文" : "邀请函网页"} ·{" "}
              {new Date(template.updatedAt).toLocaleString("zh-CN")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              onLoad(template.document);
              onOpenChange(false);
            }}
          >
            载入
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`重命名模板 ${template.name}`}
            title="重命名"
            onClick={() => {
              setRenamingId(template.id);
              setRenameValue(template.name);
            }}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`另存模板 ${template.name}`}
            title="另存为"
            onClick={() => duplicateTemplate(template.id)}
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`删除模板 ${template.name}`}
            className="text-destructive hover:text-destructive"
            onClick={() => deleteTemplate(template.id)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    ));
  }

  const myTemplates = templates.filter(
    (template) => (template.origin ?? "manual") !== "ai",
  );
  const aiTemplates = templates.filter(
    (template) => (template.origin ?? "manual") === "ai",
  );

  function saveAsset() {
    if (!assetUrl.trim() || !isHttpUrl(assetUrl.trim())) {
      setMessage("素材地址需以 http:// 或 https:// 开头。");
      return;
    }
    library.saveAsset({
      name: assetName,
      url: assetUrl,
      kind: assetKind,
    });
    onAssetsChange(library.listAssets());
    setAssetName("");
    setAssetUrl("");
    setMessage("素材引用已保存。");
  }

  async function deleteAsset(id: string) {
    const reference = assetReferences.get(id) ?? null;
    if (reference) {
      setMessage(
        `该素材仍被${reference}引用，不能删除。请先替换相关图片后再试。`,
      );
      return;
    }
    const asset = assets.find((item) => item.id === id);
    library.deleteAsset(id);
    if (asset?.source === "upload") {
      try {
        await deleteImageBlob(id);
      } catch {
        setMessage("素材记录已删除，但本机图片清理失败。");
        onAssetsChange(library.listAssets());
        return;
      }
    }
    onAssetsChange(library.listAssets());
    setMessage("素材引用已删除。");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>模板与素材</DialogTitle>
          <DialogDescription>
            模板、配色和素材都保存在本机浏览器，换设备或清除浏览器数据后不会同步。
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as LibraryTab);
            setMessage("");
          }}
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="templates">我的模板</TabsTrigger>
            <TabsTrigger value="ai">AI 生成模板</TabsTrigger>
            <TabsTrigger value="styles">风格模板</TabsTrigger>
            <TabsTrigger value="assets">素材库</TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="mt-4 space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2">
                <Save className="mt-0.5 size-4 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-[13px] font-medium">保存当前模板</p>
                  <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                    保存当前文字、变量、样式和模块顺序。
                  </p>
                </div>
              </div>
              <Button type="button" className="shrink-0" onClick={onRequestSave}>
                保存模板
              </Button>
            </div>

            <div className="space-y-2">
              {renderTemplates(myTemplates, "当前目标还没有保存的模板。")}
            </div>
          </TabsContent>

          <TabsContent value="ai" className="mt-4 space-y-3">
            <div className="flex items-start gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-[13px] font-medium">AI 生成模板</p>
                <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                  在 AI 设计完成后使用「保存为 AI 模板」，即可在这里重新编辑或另存。
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {renderTemplates(aiTemplates, "还没有 AI 生成模板。完成一次 AI 设计后即可保存。")}
            </div>
          </TabsContent>

          <TabsContent value="styles" className="mt-4 space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <Palette className="size-4 text-primary" aria-hidden="true" />
                <h3 className="text-[13px] font-semibold">配色风格</h3>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                只改变主色、辅助色、背景、文字、按钮和边框，不修改文字、变量与模块顺序。
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {THEME_PRESETS.map((preset) => {
                  const colors = preset.colors[target];
                  const active =
                    document.theme.primaryColor === colors.primaryColor &&
                    document.theme.backgroundColor === colors.backgroundColor;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={active}
                      className={`rounded-2xl border p-3 text-left transition-colors ${
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border/70 hover:border-primary/40"
                      }`}
                      onClick={() => {
                        onApplyTheme(
                          applyThemePreset(document.theme, preset, target),
                        );
                        setMessage(
                          `已应用「${preset.name}」，文字和模块顺序保持不变。`,
                        );
                      }}
                    >
                      <span className="flex gap-1" aria-hidden="true">
                        {preset.palette.map((color) => (
                          <span
                            key={color}
                            className="h-5 flex-1 rounded-[4px] border border-black/5"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium">{preset.name}</span>
                        {active ? (
                          <Badge variant="outline" className="rounded-full text-[9px]">
                            已应用
                          </Badge>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                        {preset.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {showPresets ? (
              <div className="border-t border-border/60 pt-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" aria-hidden="true" />
                  <h3 className="text-[13px] font-semibold">整套邀请函模板</h3>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  会替换当前邀请函的文字和模块，已保存的模板不受影响。
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {INVITE_PRESETS.map((preset) => (
                    <article
                      key={preset.id}
                      className="overflow-hidden rounded-2xl border border-border/70 bg-card/70"
                    >
                      <div
                        className="relative flex h-20 items-end justify-between p-3"
                        style={{
                          background: `linear-gradient(135deg, ${preset.palette[0]}, ${preset.palette[1]})`,
                        }}
                      >
                        <span
                          className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold"
                          style={{ color: preset.palette[0] }}
                        >
                          {preset.name}
                        </span>
                      </div>
                      <div className="p-3">
                        <p className="text-[12px] font-medium">{preset.name}</p>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                          {preset.description}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-3 w-full"
                          onClick={() => {
                            onLoad(createInvitePresetDocument(preset.id));
                            onOpenChange(false);
                          }}
                        >
                          使用此整套模板
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="assets" className="mt-4 space-y-4">
            <div className="rounded-2xl border border-border/70 bg-background/60 p-3">
              <div className="flex items-center gap-2">
                <ImagePlus className="size-4 text-primary" aria-hidden="true" />
                <Label className="text-[13px]">新增素材引用</Label>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                <Input
                  value={assetName}
                  onChange={(event) => setAssetName(event.target.value)}
                  placeholder="素材名称"
                  aria-label="素材名称"
                />
                <Input
                  value={assetUrl}
                  onChange={(event) => setAssetUrl(event.target.value)}
                  placeholder="https://..."
                  aria-label="素材地址"
                  type="url"
                />
                <select
                  value={assetKind}
                  onChange={(event) =>
                    setAssetKind(event.target.value as DesignAssetKind)
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  aria-label="素材类型"
                >
                  <option value="logo">Logo</option>
                  <option value="image">图片</option>
                  <option value="background">背景</option>
                </select>
              </div>
              <Button
                type="button"
                className="mt-2"
                variant="outline"
                onClick={saveAsset}
                disabled={!assetUrl.trim() || !isHttpUrl(assetUrl.trim())}
              >
                <Link2 className="size-3.5" aria-hidden="true" />
                保存素材引用
              </Button>
            </div>

            <div className="space-y-2">
              {assets.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  还没有素材引用。保存 Logo 或图片链接后可在这里复用。
                </div>
              ) : (
                assets.map((asset) => {
                  const reference = assetReferences.get(asset.id) ?? null;
                  return (
                  <div
                    key={asset.id}
                    className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-medium">{asset.name}</p>
                        <Badge variant="outline" className="rounded-full text-[10px]">
                          {asset.kind}
                        </Badge>
                        <Badge variant="outline" className="rounded-full text-[10px]">
                          {assetSource(asset) === "upload" ? "本机素材" : "图片链接"}
                        </Badge>
                        {reference ? (
                          <Badge variant="outline" className="rounded-full border-amber-300 text-[10px] text-amber-800">
                            使用中
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {assetSource(asset) === "upload"
                          ? "仅当前浏览器可用"
                          : asset.url}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canUseAsset}
                        onClick={() => onUseAsset(asset)}
                      >
                        引用到选中图片/Logo
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`删除素材 ${asset.name}`}
                        title={
                          reference
                            ? `仍被${reference}引用，不能删除`
                            : "删除素材"
                        }
                        disabled={Boolean(reference)}
                        className="text-destructive hover:text-destructive"
                        onClick={() => void deleteAsset(asset.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">
              被当前设计或已保存模板引用的素材不能删除。
            </p>
            {!canUseAsset ? (
              <p className="text-[11px] leading-5 text-muted-foreground">
                先在画布中选中「图片」或「Logo」模块，才能引用素材。
              </p>
            ) : null}
          </TabsContent>
        </Tabs>

        {message ? (
          <p
            role="status"
            className="rounded-xl bg-accent/60 px-3 py-2 text-[11px] text-accent-foreground"
          >
            {message}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
