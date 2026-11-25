import { CheckCircle2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { HAS_LOCAL_DEMO } from "../open-api/client";
import type { DesignDocument } from "@/shared/contracts/design";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DesignLibrary, SavedDesignTemplate } from "./local-library";

type SaveTemplateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: DesignDocument;
  library: DesignLibrary;
  onViewTemplates: () => void;
  storageAvailable?: boolean;
};

export function SaveTemplateDialog({
  open,
  onOpenChange,
  document,
  library,
  onViewTemplates,
  storageAvailable = true,
}: SaveTemplateDialogProps) {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<SavedDesignTemplate | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setSaved(null);
    setError("");
  }, [open]);

  function save() {
    if (!storageAvailable) {
      setError("浏览器不允许本地存储，无法保存模板。请先导出邮件或联系管理员。");
      return;
    }
    try {
      const template = library.saveTemplate({
        name,
        document,
      });
      setSaved(template);
    } catch {
      setError("保存失败，请检查浏览器是否允许本地存储。");
    }
  }

  const targetLabel = document.target === "email" ? "邮件模板" : "邀请函模板";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>保存模板</DialogTitle>
          <DialogDescription>
            {HAS_LOCAL_DEMO ? "保存到本机模板库，服务恢复后会同步离线保存的模板。" : "保存当前设计，供此浏览器以后复用。"}
          </DialogDescription>
        </DialogHeader>

        {saved ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-emerald-900">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p className="text-sm font-medium">已保存「{saved.name}」</p>
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                onViewTemplates();
              }}
            >
              查看我的模板
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="save-template-name" className="text-[13px]">
                模板名称
              </Label>
              <Input
                id="save-template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={`例如：${targetLabel} · 技术部一面`}
                onKeyDown={(event) => {
                  if (event.key === "Enter") save();
                }}
                disabled={!storageAvailable}
              />
            </div>
            {!storageAvailable ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800" role="status">
                浏览器不允许本地存储，模板无法保存。你仍可继续编辑和导出。
              </p>
            ) : null}
            {error ? (
              <p className="text-[11px] text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {saved ? (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              继续编辑
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="button" onClick={save} disabled={!storageAvailable}>
                <Save className="size-3.5" aria-hidden="true" />
                保存模板
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
