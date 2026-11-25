import type { Editor } from "@tiptap/core";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  Underline,
  Unlink,
} from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { RICH_FONT_SIZES } from "@/shared/design/rich-text";

const LINK_PATTERN = /^(?:https?:|mailto:)/iu;

function ToolButton({
  label,
  active = false,
  disabled = false,
  onMouseDown,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onMouseDown?: (event: MouseEvent) => void;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={onMouseDown}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-30",
        active && "bg-primary/10 text-primary",
      )}
    >
      {children}
    </button>
  );
}

export function RichTextToolbar({
  editor,
  disabledColor = false,
  disabledFontSize = false,
}: {
  editor: Editor;
  disabledColor?: boolean;
  disabledFontSize?: boolean;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");

  const fontSize = String(
    editor.getAttributes("textStyle").fontSize ?? "16px",
  );
  const color = String(editor.getAttributes("textStyle").color ?? "#182420");

  function openLinkEditor() {
    setLinkUrl(String(editor.getAttributes("link").href ?? ""));
    setLinkError("");
    setLinkOpen(true);
  }

  function applyLink() {
    const next = linkUrl.trim();
    if (!LINK_PATTERN.test(next)) {
      setLinkError("请输入 http(s) 或 mailto 链接。");
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: next })
      .run();
    setLinkOpen(false);
  }

  function removeLink() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-border/70 bg-background/70 p-1">
      <select
        aria-label="字号"
        title={
          disabledFontSize
            ? "选区字号由组件统一，解除统一字号后可单独设置"
            : undefined
        }
        value={fontSize}
        disabled={disabledFontSize}
        onChange={(event) =>
          editor.chain().focus().setFontSize(event.target.value).run()
        }
        className="h-7 rounded-md border border-transparent bg-transparent px-1.5 text-[11px] font-medium text-muted-foreground outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {RICH_FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {Number.parseInt(size, 10)}
          </option>
        ))}
      </select>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
      <ToolButton
        label="加粗"
        active={editor.isActive("bold")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-3.5" />
      </ToolButton>
      <ToolButton
        label="斜体"
        active={editor.isActive("italic")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-3.5" />
      </ToolButton>
      <ToolButton
        label="下划线"
        active={editor.isActive("underline")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline className="size-3.5" />
      </ToolButton>
      <label
        title={
          disabledColor
            ? "选区颜色由组件统一，解除统一颜色后可单独设置"
            : "文字颜色"
        }
        className={cn(
          "relative grid size-7 cursor-pointer place-items-center rounded-md hover:bg-accent",
          disabledColor && "cursor-not-allowed opacity-40 hover:bg-transparent",
        )}
      >
        <span
          className="size-3.5 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,.18)]"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <input
          type="color"
          aria-label="文字颜色"
          title={
            disabledColor
              ? "选区颜色由组件统一，解除统一颜色后可单独设置"
              : undefined
          }
          value={color}
          disabled={disabledColor}
          onChange={(event) =>
            editor.chain().focus().setColor(event.target.value).run()
          }
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </label>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
      {(["left", "center", "right"] as const).map((align) => {
        const Icon =
          align === "left"
            ? AlignLeft
            : align === "center"
              ? AlignCenter
              : AlignRight;
        return (
          <ToolButton
            key={align}
            label={align === "left" ? "左对齐" : align === "center" ? "居中" : "右对齐"}
            active={editor.isActive({ textAlign: align })}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign(align).run()}
          >
            <Icon className="size-3.5" />
          </ToolButton>
        );
      })}
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
      <Popover open={linkOpen} onOpenChange={setLinkOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="添加链接"
            title="添加链接"
            onMouseDown={(event) => event.preventDefault()}
            onClick={openLinkEditor}
            className={cn(
              "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              editor.isActive("link") && "bg-primary/10 text-primary",
            )}
          >
            <Link2 className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3">
          <div className="space-y-2">
            <Label htmlFor="rich-text-link" className="text-[12px]">
              链接地址
            </Label>
            <Input
              id="rich-text-link"
              type="url"
              value={linkUrl}
              onChange={(event) => {
                setLinkUrl(event.target.value);
                setLinkError("");
              }}
              placeholder="https://..."
              onKeyDown={(event) => {
                if (event.key === "Enter") applyLink();
              }}
            />
            {linkError ? (
              <p className="text-[11px] text-destructive" role="alert">
                {linkError}
              </p>
            ) : null}
            <div className="flex justify-end gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={removeLink}
              >
                <Unlink className="size-3.5" aria-hidden="true" />
                移除
              </Button>
              <Button type="button" size="sm" onClick={applyLink}>
                应用
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
