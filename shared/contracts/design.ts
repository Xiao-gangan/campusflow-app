export const DESIGN_TARGETS = ["email", "invite_page"] as const;
export type DesignTarget = (typeof DESIGN_TARGETS)[number];

export type DesignTheme = {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  fontFamily: string;
  width: number;
  radius: number;
  spacing: number;
  buttonColor?: string;
  buttonTextColor?: string;
  borderColor?: string;
};

export const DESIGN_BLOCK_TYPES = [
  "heading",
  "text",
  "image",
  "logo",
  "button",
  "divider",
  "info_card",
  "hero",
  "event_info",
  "rsvp",
  "footer",
  "spacer",
] as const;
export type DesignBlockType = (typeof DESIGN_BLOCK_TYPES)[number];

export type DesignBlock = {
  id: string;
  type: DesignBlockType;
  props: Record<string, unknown>;
};

export type DesignDocumentMeta = {
  subjectTemplate?: string;
  preheaderText?: string;
};

export type EmailDesignMode = "blocks" | "html";

export type CustomHtmlDocument = {
  html: string;
  fontFamily?: string;
  source?: "starter" | "ai" | "import";
};

export type DesignDocument = {
  schemaVersion: 1;
  target: DesignTarget;
  mode?: EmailDesignMode;
  customHtml?: CustomHtmlDocument;
  meta: DesignDocumentMeta;
  theme: DesignTheme;
  blocks: DesignBlock[];
};

export type DesignAssetKind = "logo" | "image" | "background";
export type DesignAssetSource = "url" | "upload";

export type DesignAsset = {
  id: string;
  name: string;
  url: string;
  kind: DesignAssetKind;
  createdAt: string;
  source?: DesignAssetSource;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
};

export type DesignFieldType =
  | "text"
  | "textarea"
  | "color"
  | "number"
  | "select"
  | "url";

export type DesignField = {
  key: string;
  label: string;
  type: DesignFieldType;
  placeholder?: string;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  help?: string;
  rich?: boolean;
};

export type DesignModuleDefinition = {
  type: DesignBlockType;
  label: string;
  description: string;
  category: "基础" | "内容" | "行动" | "邀请函";
  targets: readonly DesignTarget[];
  defaultProps: Record<string, unknown>;
  fields: DesignField[];
};
