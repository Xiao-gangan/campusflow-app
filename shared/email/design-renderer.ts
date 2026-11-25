import type { DesignDocument } from "../contracts/design.ts";
import type {
  EmailBlock,
  EmailBlockType,
  EmailEditorDocument,
} from "../contracts/email.ts";
import {
  renderEmailTemplate,
  type EmailRenderOptions,
  type EmailRenderResult,
  type EmailTemplateContext,
} from "./template-renderer.ts";
import { renderFreeEmailHtml } from "./free-html.ts";

const ALLOWED_EMAIL_BLOCKS: readonly EmailBlockType[] = [
  "heading",
  "text",
  "image",
  "logo",
  "button",
  "divider",
  "info_card",
  "footer",
  "spacer",
];

export function designToEmailDocument(
  document: DesignDocument,
): EmailEditorDocument {
  if (document.target !== "email") {
    throw new Error("design_target_not_email");
  }

  const blocks: EmailBlock[] = document.blocks
    .filter((block) =>
      ALLOWED_EMAIL_BLOCKS.includes(block.type as EmailBlockType),
    )
    .map((block) => ({
      id: block.id,
      type: block.type as EmailBlockType,
      props: block.props,
    }));

  return {
    schemaVersion: 1,
    settings: {
      width: document.theme.width,
      background: document.theme.backgroundColor,
      fontFamily: document.theme.fontFamily,
      textColor: document.theme.textColor,
      primaryColor: document.theme.primaryColor,
      accentColor: document.theme.accentColor,
      surfaceColor: document.theme.surfaceColor,
      mutedTextColor: document.theme.mutedTextColor,
      borderColor:
        document.theme.borderColor ?? document.theme.mutedTextColor,
      buttonColor:
        document.theme.buttonColor ?? document.theme.primaryColor,
      buttonTextColor: document.theme.buttonTextColor ?? "#fffdfa",
      radius: document.theme.radius,
      spacing: document.theme.spacing,
    },
    blocks,
  };
}

export function renderDesignEmail(
  document: DesignDocument,
  context: EmailTemplateContext = {},
  options: EmailRenderOptions = {},
): EmailRenderResult {
  if (document.target === "email" && document.mode === "html") {
    return renderFreeEmailHtml(document, context, options);
  }
  const editorDocument = designToEmailDocument(document);
  return renderEmailTemplate(
    {
      subjectTemplate:
        document.meta.subjectTemplate?.trim() || "CampusFlow 邮件",
      preheaderText: document.meta.preheaderText ?? null,
      editorDocument,
    },
    context,
    options,
  );
}
