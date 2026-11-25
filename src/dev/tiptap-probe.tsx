import { mergeAttributes, Node, type Editor, type JSONContent } from "@tiptap/core";
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
import { UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  docToLegacyText,
  legacyTextToDoc,
  type EditorDoc,
} from "../../shared/design/legacy-text";
import {
  DESIGN_VARIABLES,
  interpolateDesignVariables,
  sampleVariableValues,
} from "../../shared/design/variables";
import "../globals.css";

const INITIAL_LEGACY =
  "你好，{{candidate_name}} 同学，期待在 {{interview_time}} 与你见面。\n面试地点：{{interview_location}}。";

const FIELD_LABELS = new Map(
  DESIGN_VARIABLES.map((variable) => [variable.key, variable.label]),
);

const FIELD_SAMPLES = new Map(
  DESIGN_VARIABLES.map((variable) => [variable.key, variable.sample]),
);

const PersonalizationField = Node.create({
  name: "personalizationField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      field: {
        default: "candidate_name",
        parseHTML: (element) =>
          element.getAttribute("data-personalization-field") ??
          "candidate_name",
        renderHTML: (attributes) => ({
          "data-personalization-field": attributes.field,
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-personalization-field]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const field = String(node.attrs.field ?? "");
    const label = FIELD_LABELS.get(field) ?? "未识别字段";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "e0-token",
        contenteditable: "false",
      }),
      label,
    ];
  },
  renderText({ node }) {
    return FIELD_LABELS.get(String(node.attrs.field ?? "")) ?? "未识别字段";
  },
});

type E0ProbeApi = {
  editor: Editor;
  getLegacy: () => string;
  getJSON: () => JSONContent;
  getHTML: () => string;
  getFieldCount: () => number;
  getSelection: () => { from: number; to: number; empty: boolean };
  insertField: (field: string) => boolean;
  focusEnd: () => void;
  setText: (text: string) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
};

declare global {
  interface Window {
    __E0__?: E0ProbeApi;
  }
}

function getFieldCount(doc: EditorDoc): number {
  return doc.content.reduce(
    (total, paragraph) =>
      total +
      (paragraph.content ?? []).filter(
        (node) => node.type === "personalizationField",
      ).length,
    0,
  );
}

function Probe() {
  const [legacyText, setLegacyText] = useState(INITIAL_LEGACY);
  const [jsonText, setJsonText] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Bold,
      Italic,
      Underline,
      Link,
      UndoRedo,
      PersonalizationField,
      TextStyle,
      FontSize,
      Color,
      TextAlign.configure({ types: ["paragraph"] }),
    ],
    content: legacyTextToDoc(INITIAL_LEGACY),
    editorProps: {
      attributes: {
        "data-testid": "e0-editor",
        class: "e0-prose",
        "aria-label": "E0 Tiptap 编辑探针",
      },
    },
    onUpdate({ editor: current }) {
      setLegacyText(docToLegacyText(current.getJSON() as EditorDoc));
      setJsonText(JSON.stringify(current.getJSON(), null, 2));
    },
  });

  useEffect(() => {
    if (!editor) return;
    setJsonText(JSON.stringify(editor.getJSON(), null, 2));
    setLegacyText(docToLegacyText(editor.getJSON() as EditorDoc));

    const api: E0ProbeApi = {
      editor,
      getLegacy: () => docToLegacyText(editor.getJSON() as EditorDoc),
      getJSON: () => editor.getJSON(),
      getHTML: () => editor.getHTML(),
      getFieldCount: () => getFieldCount(editor.getJSON() as EditorDoc),
      getSelection: () => ({
        from: editor.state.selection.from,
        to: editor.state.selection.to,
        empty: editor.state.selection.empty,
      }),
      insertField: (field: string) =>
        editor
          .chain()
          .focus()
          .insertContent({ type: "personalizationField", attrs: { field } })
          .run(),
      focusEnd: () => {
        editor.commands.focus("end");
      },
      setText: (text: string) => {
        editor.commands.setContent(legacyTextToDoc(text));
        setLegacyText(docToLegacyText(editor.getJSON() as EditorDoc));
        setJsonText(JSON.stringify(editor.getJSON(), null, 2));
      },
      undo: () => {
        editor.chain().focus().undo().run();
      },
      redo: () => {
        editor.chain().focus().redo().run();
      },
      reset: () => {
        editor.commands.setContent(legacyTextToDoc(INITIAL_LEGACY));
        setLegacyText(INITIAL_LEGACY);
        setJsonText(JSON.stringify(editor.getJSON(), null, 2));
        editor.commands.focus("end");
      },
    };
    window.__E0__ = api;

    return () => {
      delete window.__E0__;
    };
  }, [editor]);

  const preview = interpolateDesignVariables(
    legacyText,
    sampleVariableValues(),
  );
  const fieldCount = getFieldCount(legacyTextToDoc(legacyText));

  function insertField(field: string) {
    editor
      ?.chain()
      .focus()
      .insertContent({ type: "personalizationField", attrs: { field } })
      .run();
  }

  return (
    <div className="e0-root">
      <style>{`
        .e0-root { min-height: 100dvh; background: #f4f1ea; color: #182420; padding: 28px; font-family: "PingFang SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif; }
        .e0-panel { max-width: 1120px; margin: 0 auto; }
        .e0-kicker { color: #1d5343; font-size: 10px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
        .e0-title { margin: 8px 0 0; font-size: 26px; font-weight: 650; letter-spacing: -.03em; }
        .e0-lead { margin: 8px 0 18px; color: #6d756f; font-size: 12px; line-height: 1.8; }
        .e0-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(300px, .85fr); gap: 18px; }
        .e0-card { border: 1px solid #ddd6c8; border-radius: 20px; background: #fffdf8; padding: 16px; }
        .e0-toolbar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .e0-btn { border: 1px solid #b9cabb; border-radius: 999px; background: #f6faf3; color: #1d5343; padding: 6px 10px; font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
        .e0-btn:hover { background: #e3efe0; }
        .e0-btn.secondary { border-color: #ddd6c8; background: #fff; color: #5b665f; }
        .e0-editor-wrap { border: 1px solid #cfc8b9; border-radius: 14px; background: #fff; }
        .e0-prose { min-height: 190px; padding: 16px; outline: none; font-size: 15px; line-height: 1.95; white-space: pre-wrap; }
        .e0-prose p { margin: 0 0 8px; }
        .e0-prose p:last-child { margin-bottom: 0; }
        .e0-token { display: inline-flex; align-items: center; border: 1px solid #b9d5b7; border-radius: 999px; background: #edf5e8; color: #28533e; padding: 2px 8px; font-size: 12px; font-weight: 600; line-height: 1.65; white-space: nowrap; }
        .e0-token.ProseMirror-selectednode { outline: 2px solid #1d5343; outline-offset: 2px; }
        .e0-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .e0-status { margin: 10px 0 0; color: #6d756f; font-size: 11px; }
        .e0-output { margin: 8px 0 0; max-height: 230px; overflow: auto; border: 1px solid #e3dccf; border-radius: 12px; background: #faf7ef; padding: 10px; color: #3e4a43; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; line-height: 1.65; white-space: pre-wrap; }
        .e0-output-label { margin: 12px 0 0; color: #5b665f; font-size: 11px; font-weight: 650; }
        .e0-preview { margin-top: 12px; border: 1px solid #e3dccf; border-radius: 12px; background: #f6faf3; padding: 12px; color: #28533e; font-size: 13px; line-height: 1.8; white-space: pre-wrap; }
        .e0-note { margin-top: 10px; color: #7b857f; font-size: 10px; line-height: 1.7; }
        @media (max-width: 860px) { .e0-root { padding: 16px; } .e0-grid { grid-template-columns: minmax(0, 1fr); } }
      `}</style>
      <div className="e0-panel">
        <div className="e0-kicker">E0 · Tiptap technical probe</div>
        <h1 className="e0-title">编辑内容与个性化字段的最小验证</h1>
        <p className="e0-lead">
          仅开发环境探针，不是正式界面。验证 inline atom、中文输入、光标、撤销重做、复制粘贴和旧字符串兼容转换。
        </p>
        <div className="e0-grid">
          <section className="e0-card">
            <div className="e0-toolbar">
              <button type="button" className="e0-btn" data-testid="e0-insert-name" onClick={() => insertField("candidate_name")}>
                ＋ 收件人姓名
              </button>
              <button type="button" className="e0-btn" data-testid="e0-insert-time" onClick={() => insertField("interview_time")}>
                ＋ 面试时间
              </button>
              <button type="button" className="e0-btn secondary" data-testid="e0-undo" onClick={() => editor?.chain().focus().undo().run()}>
                撤销
              </button>
              <button type="button" className="e0-btn secondary" data-testid="e0-redo" onClick={() => editor?.chain().focus().redo().run()}>
                重做
              </button>
              <button type="button" className="e0-btn secondary" data-testid="e0-reset" onClick={() => editor?.commands.setContent(legacyTextToDoc(INITIAL_LEGACY))}>
                重置
              </button>
            </div>
            <div className="e0-editor-wrap">
              {editor ? <EditorContent editor={editor} /> : null}
            </div>
            <div className="e0-actions">
              <span className="e0-status" data-testid="e0-status">
                字段数：{fieldCount} · 序列化长度：{legacyText.length}
              </span>
            </div>
            <div className="e0-note">
              编辑区里的中文标签是原子节点；下面的兼容序列化应恢复为旧模板 token。正式界面不会展示这些 token。
            </div>
          </section>
          <aside className="e0-card">
            <div className="e0-output-label">兼容序列化（旧渲染器输入）</div>
            <pre className="e0-output" data-testid="e0-legacy">{legacyText}</pre>
            <div className="e0-output-label">示例候选人渲染</div>
            <div className="e0-preview" data-testid="e0-preview">{preview}</div>
            <div className="e0-output-label">编辑器 JSON（截断显示）</div>
            <pre className="e0-output" data-testid="e0-json">{jsonText.slice(0, 2400)}</pre>
          </aside>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Probe />
  </StrictMode>,
);
