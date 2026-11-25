import { useEffect, useMemo, useState } from "react";
import { Download, Info, Loader2, RefreshCw } from "lucide-react";
import type { DesignAsset, DesignDocument } from "@/shared/contracts/design";
import { PREVIEW_LINK_NOTE } from "@/shared/design/button-links";
import {
  devicePresetById,
  resolveDeviceSize,
  type DeviceId,
} from "@/shared/design/devices";
import {
  DESIGN_VARIABLES,
  sampleVariableValues,
} from "@/shared/design/variables";
import { renderDesignEmail } from "@/shared/email/design-renderer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  assetSource,
  evaluateLocalAssetReadiness,
  localAssetIdsInDocument,
  resolveDocumentAssetUrls,
} from "./asset-resolution";
import { DevicePicker } from "./DevicePicker";
import { PreviewFrame } from "./PreviewFrame";
import type { DraftSaveState } from "./use-auto-draft";
import { useAssetDataUrls } from "./use-asset-urls";
import { orgPreviewVariables, useOrganizationProfile } from "../org/organization";

type EmailOutputDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: DesignDocument;
  assets: DesignAsset[];
  initialTab?: "preview" | "export";
  initialDeviceId?: DeviceId;
  initialCustomWidth?: number;
  draftState?: DraftSaveState;
};

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function EmailOutputDialog({
  open,
  onOpenChange,
  document,
  assets,
  initialTab = "preview",
  initialDeviceId,
  initialCustomWidth,
  draftState,
}: EmailOutputDialogProps) {
  const org = useOrganizationProfile();
  const [tab, setTab] = useState<"preview" | "export">(initialTab);
  const [deviceId, setDeviceId] = useState<DeviceId>(
    initialDeviceId ?? "iphone",
  );
  const [customWidth, setCustomWidth] = useState(initialCustomWidth ?? 390);
  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    if (initialDeviceId) setDeviceId(initialDeviceId);
    if (initialCustomWidth !== undefined) setCustomWidth(initialCustomWidth);
  }, [open, initialTab, initialDeviceId, initialCustomWidth]);
  const isEmail = document.target === "email";
  const localIds = useMemo(
    () => localAssetIdsInDocument(document),
    [document],
  );
  const requiredUploadAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          assetSource(asset) === "upload" &&
          localIds.includes(asset.id),
      ),
    [assets, localIds],
  );
  const assetState = useAssetDataUrls(
    requiredUploadAssets,
    open && isEmail,
  );
  const dataUrls = assetState.urls;
  const resolvedDocument = useMemo(
    () => resolveDocumentAssetUrls(document, dataUrls),
    [document, dataUrls],
  );

  if (!isEmail) return null;

  const readiness = evaluateLocalAssetReadiness({
    localIds,
    assets,
    status: assetState.status,
    failureIds: assetState.failures.map((failure) => failure.id),
    resolvedIds: Object.keys(assetState.urls),
  });
  const { missingIds: missingLocalIds, loading: assetsLoading } = readiness;
  const htmlReady = readiness.ready;
  const localImageNames = missingLocalIds.map(
    (id) => assets.find((asset) => asset.id === id)?.name ?? "未知本机图片",
  );
  const hasLocalImages = readiness.localUploadIds.length > 0;
  const usesOnboardingLink = document.blocks.some(
    (block) =>
      block.type === "button" &&
      block.props.url === "{{onboarding_link}}",
  );
  const result = renderDesignEmail(
    resolvedDocument,
    orgPreviewVariables(sampleVariableValues(), org),
    { allowDataImageUrls: true },
  );
  const knownVariables = new Set(DESIGN_VARIABLES.map((item) => item.key));
  const unknownVariables = result.missingVariables.filter(
    (key) => !knownVariables.has(key),
  );
  const missingSampleVariables = result.missingVariables.filter((key) =>
    knownVariables.has(key),
  );
  const uniqueWarnings = [...new Set(result.warnings)].filter(
    (warning) => !assetsLoading || !warning.includes("本机素材不可用"),
  );
  const draftFailed =
    draftState?.status === "error" || draftState?.status === "unavailable";
  const device = resolveDeviceSize(deviceId, customWidth);
  const deviceKind =
    deviceId === "custom"
      ? "phone"
      : (devicePresetById(deviceId)?.kind ?? "desktop");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-y-auto",
          deviceKind === "desktop"
            ? "sm:max-w-6xl"
            : deviceKind === "tablet"
              ? "sm:max-w-3xl"
              : "sm:max-w-2xl",
        )}
      >
        <DialogHeader>
          <DialogTitle>邮件预览与导出</DialogTitle>
          <DialogDescription>
            使用示例候选人信息预览；正式发送时系统会替换为真实候选人数据。
          </DialogDescription>
        </DialogHeader>

        {hasLocalImages ? (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
            {assetsLoading ? (
              <p className="flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                正在读取本机图片，完成前不能导出 HTML。
              </p>
            ) : missingLocalIds.length > 0 ? (
              <p>
                本机图片不可用：{localImageNames.join("、")}。无法生成完整 HTML，
                请重试或替换相关图片。
              </p>
            ) : (
              <p>
                本机图片只用于预览。导出的 HTML 会内嵌本机图片，不能作为真实邮件投递；
                正式发送请使用公网图片链接。
              </p>
            )}
          </div>
        ) : null}

        {draftFailed && draftState ? (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
            {draftState.status === "error" || draftState.status === "unavailable"
              ? draftState.message
              : null}
            <span className="mt-1 block">
              当前内容仍在页面中，可以继续预览或导出；关闭页面前请先保存模板或下载导出文件。
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              邮件主题
            </p>
            <p className="mt-1 truncate text-sm font-medium">{result.subject}</p>
          </div>
          <DevicePicker
            value={deviceId}
            customWidth={customWidth}
            onChange={(id, width) => {
              setDeviceId(id);
              setCustomWidth(width);
            }}
          />
        </div>

        {usesOnboardingLink ? (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
            入组信息填写尚未开放；使用该用途的按钮在预览中不会真正生效。
          </div>
        ) : null}

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as "preview" | "export")}
          className="min-w-0"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preview">邮件预览</TabsTrigger>
            <TabsTrigger value="export">导出</TabsTrigger>
          </TabsList>
          <TabsContent value="preview" className="mt-4">
            <div className="min-w-0 rounded-2xl border border-border/70 bg-muted/30 px-3 py-4">
              {htmlReady ? (
                <PreviewFrame
                  width={device.width}
                  height={device.height}
                  kind={deviceKind}
                  label={device.label}
                >
                  <iframe
                    title="实际导出 HTML 预览"
                    srcDoc={result.html}
                    sandbox=""
                    style={{
                      display: "block",
                      width: device.width,
                      height: device.height,
                      border: 0,
                      background: "#ffffff",
                    }}
                  />
                </PreviewFrame>
              ) : (
                <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border bg-background/40 p-5 text-center">
                  <div className="space-y-2">
                    {assetsLoading ? (
                      <>
                        <Loader2 className="mx-auto size-4 animate-spin text-primary" />
                        <p className="text-[12px] font-medium">
                          正在读取本机图片…
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[12px] font-medium">
                          无法生成完整 HTML 预览
                        </p>
                        <p className="text-[11px] leading-5 text-muted-foreground">
                          本机图片缺失或读取失败：{localImageNames.join("、")}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5"
                          onClick={assetState.retry}
                        >
                          <RefreshCw className="size-3" aria-hidden="true" />
                          重试读取
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                预览与导出使用同一份 HTML，按 CSS 视口模拟，真实邮箱客户端可能有细微差异。{PREVIEW_LINK_NOTE}
              </span>
            </p>
          </TabsContent>
          <TabsContent value="export" className="mt-4 space-y-3">
            <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
              <p className="text-[13px] font-medium">纯文本预览</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                HTML 包含表格布局、内联样式与移动端适配；使用下方按钮可导出 HTML 或纯文本。
              </p>
              <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl bg-muted/30 p-3 text-xs leading-6 text-foreground">
                {result.text}
              </pre>
            </div>
          </TabsContent>
        </Tabs>

        {unknownVariables.length > 0 ||
        missingSampleVariables.length > 0 ||
        uniqueWarnings.length > 0 ? (
          <div className="space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
            {unknownVariables.length > 0 ? (
              <p>
                无法识别的变量：
                {unknownVariables.map((key) => `{{${key}}}`).join("、")}
                。这些内容不会在正式邮件中替换，请检查拼写。
              </p>
            ) : null}
            {missingSampleVariables.length > 0 ? (
              <p>
                示例数据缺少变量：{missingSampleVariables.join("、")}
                ，预览中会显示为空。
              </p>
            ) : null}
            {uniqueWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Badge variant="outline" className="mr-auto rounded-full text-[10px]">
            {device.label}
          </Badge>
          <Button
            type="button"
            variant="outline"
            disabled={!htmlReady}
            title={
              htmlReady
                ? undefined
                : assetsLoading
                  ? "本机图片尚未读取完成"
                  : "本机图片缺失或读取失败"
            }
            onClick={() =>
              downloadText(
                "campusflow-email.html",
                result.html,
                "text/html;charset=utf-8",
              )
            }
          >
            <Download className="size-3.5" aria-hidden="true" />
            {assetsLoading
              ? "等待图片加载…"
              : hasLocalImages
                ? "导出本地预览 HTML"
                : "导出 HTML"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              downloadText(
                "campusflow-email.txt",
                result.text,
                "text/plain;charset=utf-8",
              )
            }
          >
            <Download className="size-3.5" aria-hidden="true" />
            导出纯文本
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
