import { demoFetch } from "../browser-demo/request.ts";
import type { OpenApiKeyInfo, OpenApiScope, SavedDesignTemplate } from "@/shared/contracts/open-api";
import type { FeaturedPresetUpdate } from "@/shared/design/featured-templates";

export { LOCAL_DEMO as HAS_LOCAL_DEMO } from "../browser-demo/mode.ts";

export async function localAgentRequest<T>(path: string, method = "GET", data?: object): Promise<T> {
  const response = await demoFetch(`/api/local-demo${path}`, {
    method, cache: "no-store", credentials: "same-origin",
    headers: { "X-CampusFlow-Demo": "1", ...(data ? { "Content-Type": "application/json" } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || !Object.hasOwn(body, "data"))
    throw new Error(typeof body?.message === "string" ? body.message : "本机服务暂不可用，请重试。");
  return body.data as T;
}

export const templateTransport = {
  list: () => localAgentRequest<SavedDesignTemplate[]>("/templates"),
  put: (template: SavedDesignTemplate, initialImport: boolean) => localAgentRequest<SavedDesignTemplate>(
    `/templates/${encodeURIComponent(template.id)}${initialImport ? "?import=1" : ""}`, "PUT",
    { name: template.name, document: template.document, origin: template.origin },
  ),
  remove: (id: string) => localAgentRequest<{ deleted: boolean }>(`/templates/${encodeURIComponent(id)}`, "DELETE"),
  updateFeatured: () => localAgentRequest<FeaturedPresetUpdate>("/templates/presets", "POST"),
};

export const openKeyApi = {
  list: () => localAgentRequest<OpenApiKeyInfo[]>("/open-api/keys"),
  create: (name: string, scopes: OpenApiScope[]) =>
    localAgentRequest<OpenApiKeyInfo & { secret: string }>("/open-api/keys", "POST", { name, scopes }),
  revoke: (id: string) => localAgentRequest<OpenApiKeyInfo>(`/open-api/keys/${encodeURIComponent(id)}`, "DELETE"),
};
