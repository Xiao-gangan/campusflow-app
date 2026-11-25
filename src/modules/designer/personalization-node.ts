import { mergeAttributes, Node } from "@tiptap/core";
import {
  personalizationDefaultLabel,
} from "@/shared/design/personalization";

export const PersonalizationField = Node.create({
  name: "personalizationField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  marks: "_",
  addAttributes() {
    return {
      field: {
        default: "candidate_name",
        parseHTML: (element) =>
          element.getAttribute("data-personalization-field") ?? "",
        renderHTML: (attributes) => ({
          "data-personalization-field": attributes.field,
        }),
      },
      label: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-personalization-label") ??
          element.textContent ??
          null,
        renderHTML: (attributes) =>
          typeof attributes.label === "string" && attributes.label
            ? { "data-personalization-label": attributes.label }
            : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-personalization-field]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const field = String(node.attrs.field ?? "");
    const label =
      (typeof node.attrs.label === "string" && node.attrs.label) ||
      personalizationDefaultLabel(field) ||
      "未识别字段";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "personalization-token",
        contenteditable: "false",
        "data-personalization-label": label,
      }),
      label,
    ];
  },
  renderText({ node }) {
    const field = String(node.attrs.field ?? "");
    return (
      (typeof node.attrs.label === "string" && node.attrs.label) ||
      personalizationDefaultLabel(field) ||
      "未识别字段"
    );
  },
});
