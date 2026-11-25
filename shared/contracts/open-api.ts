import type { DesignDocument, DesignTarget } from "./design.ts";

export const OPEN_API_SCOPES = ["templates:read", "templates:write", "recruitment:read", "rounds:read", "rounds:write"] as const;
export type OpenApiScope = (typeof OPEN_API_SCOPES)[number];

export type OpenApiKeyInfo = {
  id: string;
  name: string;
  maskedPrefix: string;
  scopes: OpenApiScope[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type SavedTemplateOrigin = "manual" | "ai";
export type SavedDesignTemplate = {
  id: string;
  name: string;
  target: DesignTarget;
  schemaVersion: 1;
  document: DesignDocument;
  origin?: SavedTemplateOrigin;
  createdAt: string;
  updatedAt: string;
};
