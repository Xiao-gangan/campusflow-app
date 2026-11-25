import type {
  DesignAsset,
  DesignBlock,
  DesignTarget,
  DesignTheme,
} from "@/shared/contracts/design";
import { moduleDefinition } from "@/shared/design/modules";
import { readBlockStyleOverrides } from "@/shared/design/block-style";
import { sanitizeRichTextMap } from "@/shared/design/rich-text";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ButtonLinkField } from "./ButtonLinkField";
import { BlockStyleFields } from "./BlockStyleFields";
import { StyleVariantPicker } from "./StyleVariantPicker";
import { Sparkles } from "lucide-react";
import { ImageField } from "./ImageField";
import { PersonalizationEditor } from "./PersonalizationEditor";

type PropertyPanelProps = {
  block: DesignBlock | null;
  target: DesignTarget;
  theme: DesignTheme;
  assets: DesignAsset[];
  assetUrls: Record<string, string>;
  revision: number;
  onUpdateProp: (key: string, value: unknown) => void;
  onUpdateProps: (patch: Record<string, unknown>) => void;
  onUploadImage: (
    file: File,
    dimensions: { width: number; height: number },
  ) => Promise<DesignAsset>;
  onUseAsset: (asset: DesignAsset) => void;
  onUseAi?: () => void;
};

export function PropertyPanel({
  block,
  target,
  theme,
  assets,
  assetUrls,
  revision,
  onUpdateProp,
  onUpdateProps,
  onUploadImage,
  onUseAsset,
  onUseAi,
}: PropertyPanelProps) {
  if (!block) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-background/50 p-5 text-center">
        <p className="text-sm font-medium">选择一个模块</p>
      </div>
    );
  }

  const definition = moduleDefinition(block.type);
  if (!definition) return null;
  const richTextMap = sanitizeRichTextMap(block.props.richText);
  const blockStyleValues = readBlockStyleOverrides(block.type, block.props);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{definition.label}</h3>
        {onUseAi ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 h-7 w-full gap-1.5 border-primary/25 text-primary"
            onClick={onUseAi}
          >
            <Sparkles className="size-3" aria-hidden="true" />
            使用 AI 优化
          </Button>
        ) : null}
      </div>

      <div className="space-y-4">
        {definition.fields.map((field) => {
          const raw = block.props[field.key];
          const value = raw === undefined || raw === null ? "" : String(raw);
          const fieldId = `designer-field-${field.key}`;

          if (
            (field.type === "text" || field.type === "textarea") &&
            field.key !== "alt"
          ) {
            return (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-[13px]">{field.label}</Label>
                <PersonalizationEditor
                  key={`${block.id}:${field.key}:${revision}`}
                  value={value}
                  richText={field.rich ? richTextMap[field.key] : undefined}
                  rich={field.rich === true}
                  target={target}
                  multiline={field.type === "textarea"}
                  placeholder={field.placeholder}
                  label={field.label}
                  useBlockTextColor={blockStyleValues.textColor !== undefined}
                  useBlockFontSize={blockStyleValues.fontSize !== undefined}
                  blockTextColor={blockStyleValues.textColor}
                  blockFontSize={blockStyleValues.fontSize}
                  onClearBlockTextColor={() =>
                    onUpdateProps({ textColor: undefined })
                  }
                  onClearBlockFontSize={() =>
                    onUpdateProps({ fontSize: undefined })
                  }
                  onChange={(next, nextRichText) => {
                    if (!field.rich) {
                      onUpdateProp(field.key, next);
                      return;
                    }
                    const nextMap = { ...richTextMap };
                    if (nextRichText) nextMap[field.key] = nextRichText;
                    else delete nextMap[field.key];
                    onUpdateProps({
                      [field.key]: next,
                      richText: nextMap,
                    });
                  }}
                />
                {field.help ? (
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    {field.help}
                  </p>
                ) : null}
              </div>
            );
          }

          if (field.key === "variant") {
            return (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-[13px]">{field.label}</Label>
                <StyleVariantPicker
                  module={block.type}
                  value={value}
                  theme={theme}
                  onChange={(next) => onUpdateProp(field.key, next)}
                />
                <BlockStyleFields block={block} onUpdate={onUpdateProps} />
              </div>
            );
          }

          if (field.type === "select") {
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={fieldId} className="text-[13px]">
                  {field.label}
                </Label>
                <select
                  id={fieldId}
                  value={value}
                  onChange={(event) => onUpdateProp(field.key, event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (field.type === "number") {
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={fieldId} className="text-[13px]">
                  {field.label}
                </Label>
                <Input
                  id={fieldId}
                  type="number"
                  min={field.min}
                  max={field.max}
                  value={value}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next)) onUpdateProp(field.key, next);
                  }}
                />
              </div>
            );
          }

          if (
            field.key === "src" &&
            (block.type === "image" || block.type === "logo")
          ) {
            return (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-[13px]">{field.label}</Label>
                <ImageField
                  src={value}
                  assetId={
                    typeof block.props.assetId === "string"
                      ? block.props.assetId
                      : ""
                  }
                  kind={block.type === "logo" ? "logo" : "image"}
                  assets={assets}
                  assetUrls={assetUrls}
                  idPrefix={`${block.id}-${field.key}`}
                  onUpdate={(patch) => onUpdateProps(patch)}
                  onUpload={onUploadImage}
                  onUseAsset={onUseAsset}
                />
              </div>
            );
          }

          if (
            field.type === "url" &&
            block.type === "button" &&
            field.key === "url"
          ) {
            return (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-[13px]">按钮用途</Label>
                <ButtonLinkField
                  fieldId={fieldId}
                  value={value}
                  onChange={(next) => onUpdateProp(field.key, next)}
                />
              </div>
            );
          }

          return (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={fieldId} className="text-[13px]">
                {field.label}
              </Label>
              <Input
                id={fieldId}
                type={field.type === "url" ? "url" : "text"}
                value={value}
                placeholder={field.placeholder}
                onChange={(event) => onUpdateProp(field.key, event.target.value)}
              />
              {field.help ? (
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {field.help}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
