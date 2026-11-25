import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DesignTarget } from "@/shared/contracts/design";
import type { EditorDoc } from "@/shared/design/legacy-text";
import { RichTextToolbar } from "./RichTextToolbar";
import { BlockTextStyleNotice } from "./BlockTextStyleNotice";
import { usePersonalizationEditor } from "./use-personalization-editor";

type CanvasInlineEditorProps = {
  value: string;
  richText?: EditorDoc | null;
  target: DesignTarget;
  multiline: boolean;
  label: string;
  focusPoint?: { x: number; y: number } | null;
  showToolbar: boolean;
  useBlockTextColor: boolean;
  useBlockFontSize: boolean;
  onClearBlockTextColor: () => void;
  onClearBlockFontSize: () => void;
  onChange: (next: string, richText?: EditorDoc) => void;
  onClose: () => void;
  onHideToolbar: () => void;
};

type ToolbarPosition = { top: number; left: number };

function selectionRect(editor: Editor) {
  const { from, to } = editor.state.selection;
  const start = editor.view.coordsAtPos(from);
  const end = editor.view.coordsAtPos(to);
  return {
    left: Math.min(start.left, end.left),
    right: Math.max(start.right, end.right),
    top: Math.min(start.top, end.top),
    bottom: Math.max(start.bottom, end.bottom),
  };
}

export function CanvasInlineEditor({
  value,
  richText,
  target,
  multiline,
  label,
  focusPoint,
  showToolbar,
  useBlockTextColor,
  useBlockFontSize,
  onClearBlockTextColor,
  onClearBlockFontSize,
  onChange,
  onClose,
  onHideToolbar,
}: CanvasInlineEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition | null>(
    null,
  );

  const positionToolbar = useCallback((current?: Editor | null) => {
    const active = current ?? editorRef.current;
    const root = rootRef.current;
    if (!active || !root) return;
    const anchor = selectionRect(active);
    const field = root.getBoundingClientRect();
    if (!field.width && !field.height) return;
    const toolbar = toolbarRef.current;
    const width = toolbar?.offsetWidth ?? 349;
    const height = toolbar?.offsetHeight ?? 38;
    const margin = 8;
    const gap = 10;
    const centered =
      anchor.left + (anchor.right - anchor.left) / 2 - width / 2;
    const viewportLeft = Math.min(
      Math.max(margin, centered),
      Math.max(margin, window.innerWidth - width - margin),
    );
    const surface = root
      .closest<HTMLElement>("[data-canvas-surface]")
      ?.getBoundingClientRect();
    const surfaceMin = surface ? surface.left + margin : 0;
    const surfaceMax = surface ? surface.right - width - margin : 0;
    const left =
      surface && surfaceMax >= surfaceMin
        ? Math.min(Math.max(viewportLeft, surfaceMin), surfaceMax)
        : viewportLeft;
    const block = root.closest("[data-module-id]");
    const blockToolbars = block
      ? Array.from(block.querySelectorAll<HTMLElement>("[data-block-toolbar]"))
          .map((element) => element.getBoundingClientRect())
          .filter(
            (rect) =>
              rect.width > 0 &&
              rect.height > 0 &&
              rect.left < left + width &&
              rect.right > left,
          )
      : [];
    // Keep the bar above the edited field and above the block's drag toolbar,
    // so it never covers the current text box or the sorting controls.
    const upperLimit = Math.min(
      field.top,
      ...blockToolbars.map((rect) => rect.top),
    );
    const aboveTop = upperLimit - height - gap;
    const belowTop = field.bottom + gap;
    const aboveFits = aboveTop >= margin;
    const belowFits = belowTop + height <= window.innerHeight - margin;

    let top: number;
    if (aboveFits) {
      top = aboveTop;
    } else if (belowFits) {
      top = belowTop;
    } else {
      top = Math.min(
        Math.max(margin, belowTop),
        Math.max(margin, window.innerHeight - height - margin),
      );
    }

    setToolbarPosition((previous) =>
      previous && previous.top === top && previous.left === left
        ? previous
        : { top, left },
    );
  }, []);

  const { editor } = usePersonalizationEditor({
    value,
    richText,
    rich: true,
    target,
    multiline,
    placeholder: "输入文字…",
    label,
    proseClassName: "canvas-inline-prose",
    testId: "canvas-inline-editor",
    onChange,
    onReady(current) {
      editorRef.current = current;
      if (focusPoint) {
        const position = current.view.posAtCoords({
          left: focusPoint.x,
          top: focusPoint.y,
        });
        if (position) current.commands.focus(position.pos);
        else current.commands.focus("end");
      } else {
        current.commands.focus("end");
      }
      positionToolbar(current);
      requestAnimationFrame(() => {
        rootRef.current?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      });
    },
  });

  useEffect(() => {
    if (!editor || !showToolbar) {
      setToolbarPosition(null);
      return;
    }
    const update = () => positionToolbar(editor);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    editor.on("focus", update);
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    update();
    const frame = requestAnimationFrame(update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
      editor.off("focus", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
      cancelAnimationFrame(frame);
    };
  }, [editor, positionToolbar, showToolbar]);

  useLayoutEffect(() => {
    if (!showToolbar || !toolbarPosition || !editorRef.current) return;
    positionToolbar(editorRef.current);
  }, [positionToolbar, showToolbar, toolbarPosition]);

  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) return;
      if (rootRef.current?.contains(targetNode)) return;
      if (toolbarRef.current?.contains(targetNode)) return;
      const element = targetNode instanceof Element ? targetNode : null;
      if (
        element?.closest(
          "[data-radix-popper-content-wrapper], [data-radix-portal]",
        )
      ) {
        return;
      }
      onCloseRef.current();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener("mousedown", handlePointer, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const hasBlockFormat = useBlockTextColor || useBlockFontSize;

  return (
    <div
      ref={rootRef}
      className="canvas-inline-editor"
      data-block-text-color={useBlockTextColor || undefined}
      data-block-font-size={useBlockFontSize || undefined}
    >
      {editor ? <EditorContent editor={editor} /> : null}
      {showToolbar && editor && toolbarPosition
        ? createPortal(
            <div
              ref={toolbarRef}
              role="toolbar"
              aria-label="文字格式"
              data-inline-toolbar=""
              data-block-format={hasBlockFormat || undefined}
              className="canvas-floating-toolbar"
              style={{
                top: toolbarPosition.top,
                left: toolbarPosition.left,
              }}
            >
              <div className="canvas-floating-toolbar-tools min-w-0">
                <RichTextToolbar
                  editor={editor}
                  disabledColor={useBlockTextColor}
                  disabledFontSize={useBlockFontSize}
                />
                <BlockTextStyleNotice
                  color={useBlockTextColor}
                  fontSize={useBlockFontSize}
                  onClearColor={onClearBlockTextColor}
                  onClearFontSize={onClearBlockFontSize}
                />
              </div>
              <button
                type="button"
                className="canvas-floating-toolbar-close"
                aria-label="隐藏浮动工具条"
                title="隐藏浮动工具条"
                onClick={onHideToolbar}
              >
                <X className="size-3.5" />
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
