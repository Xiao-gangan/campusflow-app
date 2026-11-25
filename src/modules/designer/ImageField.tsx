import {
  ImagePlus,
  Loader2,
  Replace,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import type {
  DesignAsset,
  DesignAssetKind,
} from "@/shared/contracts/design";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { assetSource } from "./asset-resolution";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ImageFieldProps = {
  src: string;
  assetId: string;
  kind: Exclude<DesignAssetKind, "background">;
  assets: DesignAsset[];
  assetUrls: Record<string, string>;
  idPrefix: string;
  onUpdate: (patch: { src: string; assetId: string }) => void;
  onUpload: (
    file: File,
    dimensions: { width: number; height: number },
  ) => Promise<DesignAsset>;
  onUseAsset: (asset: DesignAsset) => void;
};

function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const dimensions = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
      URL.revokeObjectURL(url);
      resolve(dimensions);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_decode_failed"));
    };
    image.src = url;
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ImageField({
  src,
  assetId,
  kind,
  assets,
  assetUrls,
  idPrefix,
  onUpdate,
  onUpload,
  onUseAsset,
}: ImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showUrl, setShowUrl] = useState(() => Boolean(src && !assetId));
  const [urlDraft, setUrlDraft] = useState(src);

  const currentAsset = assets.find((asset) => asset.id === assetId);
  const currentSource = currentAsset ? assetSource(currentAsset) : src ? "url" : null;
  const preview =
    currentAsset && assetSource(currentAsset) === "upload"
      ? assetUrls[currentAsset.id] ?? ""
      : src || currentAsset?.url || "";
  const missingLocal =
    Boolean(assetId) && (!currentAsset || assetSource(currentAsset) === "upload") && !preview;

  useEffect(() => {
    setUrlDraft(src);
    if (src && !assetId) setShowUrl(true);
  }, [src, assetId]);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError("");
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError("请选择 PNG、JPG、WebP 或 GIF 图片。");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("图片超过 5MB，请压缩后再上传。");
      return;
    }

    setBusy(true);
    try {
      const dimensions = await readImageDimensions(file);
      const asset = await onUpload(file, dimensions);
      onUpdate({ src: "", assetId: asset.id });
      setShowUrl(false);
    } catch {
      setError("图片读取或保存失败，请换一张图片重试。");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    void handleFiles(event.dataTransfer.files);
  }

  const dropzoneProps = {
    onDragEnter: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragActive(true);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragActive(true);
    },
    onDragLeave: () => setDragActive(false),
    onDrop: handleDrop,
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        aria-label="上传图片"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      {preview ? (
        <div
          {...dropzoneProps}
          className={cn(
            "rounded-2xl border border-border/70 bg-background/60 p-3",
            dragActive && "border-primary bg-accent/50",
          )}
        >
          <div className="flex items-start gap-3">
            <img
              src={preview}
              alt=""
              className="size-20 shrink-0 rounded-xl border border-border/60 object-contain"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-[12px] font-medium">
                  {currentAsset?.name || "图片链接"}
                </p>
                {currentSource === "upload" ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-800">
                    仅本机预览
                  </span>
                ) : currentSource === "url" ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">
                    图片链接
                  </span>
                ) : null}
              </div>
              {currentAsset?.source === "upload" &&
              currentAsset.size !== undefined ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {formatBytes(currentAsset.size)}
                  {currentAsset.width && currentAsset.height
                    ? ` · ${currentAsset.width} × ${currentAsset.height}`
                    : ""}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full px-2.5 text-[10px]"
                  onClick={() => inputRef.current?.click()}
                >
                  <Replace className="size-3" aria-hidden="true" />
                  替换
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-full px-2.5 text-[10px] text-destructive hover:text-destructive"
                  onClick={() => onUpdate({ src: "", assetId: "" })}
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                  移除
                </Button>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            {currentSource === "upload"
              ? "本机图片只用于当前浏览器预览；真实邮件需要公网图片。"
              : "图片链接会在预览和发送时直接使用。"}
          </p>
        </div>
      ) : (
        <button
          type="button"
          {...dropzoneProps}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-background/40 px-4 py-5 text-center transition-colors hover:border-primary/40 hover:bg-accent/30",
            dragActive && "border-primary bg-accent/60",
          )}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
          ) : (
            <ImagePlus className="size-5 text-primary" aria-hidden="true" />
          )}
          <span className="text-[12px] font-medium">
            {dragActive ? "松开即可上传" : "拖入图片，或点击选择"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            PNG / JPG / WebP / GIF · 最大 5MB
          </span>
        </button>
      )}

      {missingLocal ? (
        <p className="text-[11px] leading-4 text-destructive" role="alert">
          本机素材不可用，可能已被删除或来自另一台设备，请重新上传或使用图片链接。
        </p>
      ) : null}
      {error ? (
        <p className="text-[11px] leading-4 text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {assets.length > 0 ? (
        <div className="space-y-1.5">
          <Label className="text-[12px]">从素材库选择</Label>
          <select
            value=""
            onChange={(event) => {
              const asset = assets.find((item) => item.id === event.target.value);
              if (!asset) return;
              onUseAsset(asset);
              setShowUrl(false);
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">选择已保存素材</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name} · {assetSource(asset) === "upload" ? "本机" : "链接"}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {showUrl ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-url`} className="text-[12px]">
            使用图片链接
          </Label>
          <Input
            id={`${idPrefix}-url`}
            type="url"
            value={urlDraft}
            placeholder="https://..."
            onChange={(event) => setUrlDraft(event.target.value)}
            onBlur={() => {
              const next = urlDraft.trim();
              if (next) onUpdate({ src: next, assetId: "" });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <p className="text-[10px] leading-4 text-muted-foreground">
            公网图片链接可直接用于邮件；本机上传不替代真实投递。
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
          onClick={() => setShowUrl(true)}
        >
          <UploadCloud className="size-3" aria-hidden="true" />
          改用图片链接
        </button>
      )}
    </div>
  );
}
