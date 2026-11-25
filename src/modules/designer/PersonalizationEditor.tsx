import type { DesignTarget } from "@/shared/contracts/design";
import type { PersonalizationField as PersonalizationFieldMeta } from "@/shared/design/personalization";
import type { EditorDoc } from "@/shared/design/legacy-text";
import { closeHistory } from "@tiptap/pm/history";
import { EditorContent } from "@tiptap/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { RichTextToolbar } from "./RichTextToolbar";
import { BlockTextStyleNotice } from "./BlockTextStyleNotice";
import { usePersonalizationEditor } from "./use-personalization-editor";

type PersonalizationEditorProps = {
  value: string;
  richText?: EditorDoc | null;
  rich?: boolean;
  target: DesignTarget;
  multiline?: boolean;
  placeholder?: string;
  label: string;
  useBlockTextColor?: boolean;
  useBlockFontSize?: boolean;
  blockTextColor?: string;
  blockFontSize?: number;
  onClearBlockTextColor?: () => void;
  onClearBlockFontSize?: () => void;
  onChange: (next: string, richText?: EditorDoc) => void;
};

export function PersonalizationEditor({
  value,
  richText,
  rich = false,
  target,
  multiline = false,
  placeholder,
  label,
  useBlockTextColor = false,
  useBlockFontSize = false,
  blockTextColor,
  blockFontSize,
  onClearBlockTextColor,
  onClearBlockFontSize,
  onChange,
}: PersonalizationEditorProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { editor, groups } = usePersonalizationEditor({
    value,
    richText,
    rich,
    target,
    multiline,
    placeholder,
    label,
    onChange,
  });

  function insertField(field: PersonalizationFieldMeta) {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "personalizationField",
        attrs: { field: field.key, label: field.label },
      })
      .run();
    const transaction = editor.state.tr;
    closeHistory(transaction);
    editor.view.dispatch(transaction);
    setMenuOpen(false);
  }

  const suppressColor = rich && useBlockTextColor;
  const suppressFontSize = rich && useBlockFontSize;

  return (
    <div className="space-y-1.5">
      {rich && editor ? (
        <RichTextToolbar
          editor={editor}
          disabledColor={suppressColor}
          disabledFontSize={suppressFontSize}
        />
      ) : null}
      {rich ? (
        <BlockTextStyleNotice
          color={suppressColor}
          fontSize={suppressFontSize}
          onClearColor={onClearBlockTextColor}
          onClearFontSize={onClearBlockFontSize}
        />
      ) : null}
      <div
        className={cn(
          "personalization-editor",
          multiline ? "is-multiline" : "is-single",
        )}
        data-block-text-color={suppressColor || undefined}
        data-block-font-size={suppressFontSize || undefined}
        style={
          suppressColor || suppressFontSize
            ? {
                color: suppressColor ? blockTextColor : undefined,
                fontSize: suppressFontSize ? blockFontSize : undefined,
              }
            : undefined
        }
      >
        {editor ? <EditorContent editor={editor} /> : null}
      </div>
      <div className="flex items-center">
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-full px-3 text-[11px]"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              插入个性化信息
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[min(320px,calc(100vw-2rem))] p-0"
          >
            <div className="max-h-[min(420px,70vh)] overflow-y-auto p-2">
              {groups.map((group) => (
                <div key={group.category} className="py-1">
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {group.category}
                  </p>
                  {group.fields.map((field) => (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() => insertField(field)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <span className="shrink-0 text-[13px] font-medium">
                        {field.label}
                      </span>
                      <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                        {field.sample}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
