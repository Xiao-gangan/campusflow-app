import { Info, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import type { DesignDocument } from "@/shared/contracts/design";
import {
  devicePresetById,
  resolveDeviceSize,
  type DeviceId,
} from "@/shared/design/devices";
import { sampleVariableValues } from "@/shared/design/variables";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InvitePageView } from "../invite/InvitePageView";
import { DevicePicker } from "./DevicePicker";
import { PreviewFrame } from "./PreviewFrame";
import { orgPreviewVariables, useOrganizationProfile } from "../org/organization";

const SAMPLE_CONTEXT = sampleVariableValues();

type InvitePreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: DesignDocument;
  initialDeviceId?: DeviceId;
  initialCustomWidth?: number;
  onOpenInNewTab: () => void;
};

export function InvitePreviewDialog({
  open,
  onOpenChange,
  document,
  initialDeviceId,
  initialCustomWidth,
  onOpenInNewTab,
}: InvitePreviewDialogProps) {
  const org = useOrganizationProfile();
  const previewContext = orgPreviewVariables(SAMPLE_CONTEXT, org);
  const [deviceId, setDeviceId] = useState<DeviceId>(
    initialDeviceId ?? "desktop",
  );
  const [customWidth, setCustomWidth] = useState(initialCustomWidth ?? 390);
  const [notice, setNotice] = useState<string | null>(null);
  const device = resolveDeviceSize(deviceId, customWidth);
  useEffect(() => {
    if (!open) return;
    if (initialDeviceId) setDeviceId(initialDeviceId);
    if (initialCustomWidth !== undefined) setCustomWidth(initialCustomWidth);
  }, [open, initialDeviceId, initialCustomWidth]);
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
          <DialogTitle>邀请函页面预览</DialogTitle>
          <DialogDescription>
            使用示例候选人数据预览响应式页面，不会提交出席确认。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>浏览器按 CSS 视口宽度模拟，不等同于真实设备测试。</span>
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

        <div className="min-w-0 rounded-2xl border border-border/70 bg-muted/30 px-3 py-4">
          <PreviewFrame
            width={device.width}
            height={device.height}
            kind={deviceKind}
            label={device.label}
          >
            <div
              style={{
                width: device.width,
                height: device.height,
                overflow: "auto",
                backgroundColor: document.theme.backgroundColor,
              }}
            >
              <InvitePageView
                document={document}
                context={previewContext}
                minHeight={`${device.height}px`}
                onAction={() =>
                  setNotice("管理员预览中，按钮不会真正打开或提交。")
                }
              />
            </div>
          </PreviewFrame>
        </div>

        {notice ? (
          <p
            role="status"
            className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800"
          >
            {notice}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onOpenInNewTab}>
            <ExternalLink className="size-3.5" aria-hidden="true" />
            在新窗口打开
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
