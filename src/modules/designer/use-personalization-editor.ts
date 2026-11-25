import type { Editor } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import { Color } from "@tiptap/extension-color";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { TextAlign } from "@tiptap/extension-text-align";
import { FontSize, TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import type { DesignTarget } from "@/shared/contracts/design";
import {
  docToLegacyText,
  legacyTextToDoc,
  type EditorDoc,
} from "@/shared/design/legacy-text";
import {
  personalizationGroups,
  personalizationLabel,
} from "@/shared/design/personalization";
import {
  sanitizePastedPersonalizationHtml,
  sanitizeRichTextDoc,
} from "@/shared/design/rich-text";
import { cn } from "@/lib/utils";
import { PersonalizationField } from "./personalization-node";

type UsePersonalizationEditorOptions = {
  value: string;
  richText?: EditorDoc | null;
  rich?: boolean;
  target: DesignTarget;
  multiline?: boolean;
  placeholder?: string;
  label: string;
  proseClassName?: string;
  testId?: string;
  onChange: (next: string, richText?: EditorDoc) => void;
  onReady?: (editor: Editor) => void;
};

export function usePersonalizationEditor({
  value,
  richText,
  rich = false,
  target,
  multiline = false,
  placeholder,
  label,
  proseClassName,
  testId = "personalization-editor",
  onChange,
  onReady,
}: UsePersonalizationEditorOptions) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const readyRef = useRef(false);

  const groups = useMemo(() => personalizationGroups(target), [target]);
  const allowedFields = useMemo(
    () =>
      new Map(
        groups.flatMap((group) =>
          group.fields.map((field) => [field.key, field.label] as const),
        ),
      ),
    [groups],
  );
  const labelFor = useMemo(
    () => (key: string) => personalizationLabel(key, target),
    [target],
  );
  const initialContentRef = useRef<EditorDoc | null>(null);
  if (!initialContentRef.current) {
    const initialRich = rich ? sanitizeRichTextDoc(richText) : null;
    initialContentRef.current = initialRich ?? legacyTextToDoc(value, labelFor);
  }

  // These objects must stay referentially stable: Tiptap reapplies options
  // when they change, which would reset the undo history on every keystroke.
  const extensions = useMemo(
    () => [
      Document,
      Paragraph,
      Text,
      HardBreak,
      UndoRedo,
      Placeholder.configure({
        placeholder: placeholder ?? "输入内容，或插入个性化信息",
      }),
      PersonalizationField,
      ...(rich
        ? [
            Bold,
            Italic,
            Underline,
            Link.configure({
              openOnClick: false,
              autolink: false,
              linkOnPaste: false,
              HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
            }),
            TextStyle,
            FontSize,
            Color,
            TextAlign.configure({ types: ["paragraph"] }),
          ]
        : []),
    ],
    [placeholder, rich],
  );
  const editorProps = useMemo(
    () => ({
      attributes: {
        class: cn(
          "personalization-prose",
          proseClassName,
          rich && "personalization-prose--rich",
        ),
        "aria-label": label,
        "data-testid": testId,
      },
      handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
        if (!multiline && event.key === "Enter") {
          event.preventDefault();
          return true;
        }
        if (
          (event.key === "Backspace" || event.key === "Delete") &&
          view.state.selection instanceof NodeSelection &&
          view.state.selection.node.type.name === "personalizationField"
        ) {
          const transaction = view.state.tr;
          closeHistory(transaction);
          view.dispatch(transaction);
        }
        return false;
      },
      transformPastedText: (text: string) =>
        multiline ? text : text.replace(/\r?\n/gu, " "),
      transformPastedHTML: (html: string) =>
        sanitizePastedPersonalizationHtml(html, allowedFields),
    }),
    [allowedFields, label, multiline, proseClassName, rich, testId],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: initialContentRef.current,
    editorProps,
    onUpdate({ editor: current }) {
      const json = current.getJSON() as EditorDoc;
      const text = docToLegacyText(json);
      onChangeRef.current(
        text,
        rich ? sanitizeRichTextDoc(json) ?? undefined : undefined,
      );
    },
  });

  useEffect(() => {
    if (!editor || readyRef.current) return;
    readyRef.current = true;
    onReadyRef.current?.(editor);
  }, [editor]);

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const nextRich = rich ? sanitizeRichTextDoc(richText) : null;
    const nextContent = nextRich ?? legacyTextToDoc(value, labelFor);
    const currentJson = editor.getJSON() as EditorDoc;
    const currentContent = rich
      ? (sanitizeRichTextDoc(currentJson) ?? legacyTextToDoc(docToLegacyText(currentJson), labelFor))
      : legacyTextToDoc(docToLegacyText(currentJson), labelFor);
    if (JSON.stringify(currentContent) === JSON.stringify(nextContent)) return;
    editor.commands.setContent(nextContent, { emitUpdate: false });
    const transaction = editor.state.tr;
    closeHistory(transaction);
    editor.view.dispatch(transaction);
  }, [editor, labelFor, rich, richText, value]);

  return { editor, groups, allowedFields };
}
