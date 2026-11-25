type IncomingMessage = Pick<import("node:http").IncomingMessage, "method" | "url" | "headers">;
import { sampleVariableValues, variablesForTarget } from "../../shared/design/variables.ts";
import { isInterviewInvitationUsable } from "../../shared/domain/interview.ts";
import { candidateContext } from "../recruitment/mail.ts";
import { RsvpError } from "../rsvp/error.ts";
import type { createRsvpStore } from "../rsvp/store-core.ts";
import { openApiSpec } from "./spec.ts";
import { offerRoundTemplates, presetRoundTemplates, savedOfferPresets, savedTemplatePresets } from "./template-presets.ts";
import type { AgentStore } from "./store.ts";
import { record, renderAgentTemplate, templateInput } from "./templates.ts";

export const OPEN_API_PATH = "/api/open/v1";
const ADMIN_TEMPLATES = "/api/local-demo/templates";
const ADMIN_KEYS = "/api/local-demo/open-api/keys";
const uuid = "[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}";

type GetRoster = () => ReturnType<typeof createRsvpStore>;
type ReadBody<R extends IncomingMessage = IncomingMessage> = (request: R) => Promise<Record<string, unknown>>;

export function isAgentManagementPath(path: string) {
  return path === ADMIN_TEMPLATES || path.startsWith(ADMIN_TEMPLATES + "/")
    || path === ADMIN_KEYS || path.startsWith(ADMIN_KEYS + "/");
}

function noMethod(): never {
  throw new RsvpError(405, "此路径不支持该请求方法。");
}

function notFound(): never {
  throw new RsvpError(404, "接口不存在。");
}

function targetFilter(url: URL) {
  const target = url.searchParams.get("target");
  if (target === null) return undefined;
  if (target !== "email" && target !== "invite_page") throw new RsvpError(400, "target 须为 email 或 invite_page。");
  return target;
}

export async function handleAgentManagement<R extends IncomingMessage>(req: R, url: URL, store: AgentStore, readBody: ReadBody<R>) {
  if (url.pathname === ADMIN_KEYS) {
    if (req.method === "GET") return store.listKeys();
    if (req.method === "POST") return store.createKey(await readBody(req));
    return noMethod();
  }
  const key = new RegExp(`^${ADMIN_KEYS}/(${uuid})$`).exec(url.pathname);
  if (key) {
    if (req.method === "DELETE") return store.revokeKey(key[1]);
    return noMethod();
  }
  if (url.pathname === ADMIN_TEMPLATES) {
    if (req.method === "GET") return store.listTemplates(targetFilter(url));
    if (req.method === "POST") return store.writeTemplate(crypto.randomUUID(), templateInput(await readBody(req), true), "create");
    return noMethod();
  }
  if (url.pathname === ADMIN_TEMPLATES + "/presets") {
    if (req.method !== "POST") return noMethod();
    return store.updateFeaturedPresets([...savedTemplatePresets(), ...savedOfferPresets()], [...presetRoundTemplates, ...offerRoundTemplates], true);
  }
  const template = new RegExp(`^${ADMIN_TEMPLATES}/(${uuid})$`).exec(url.pathname);
  if (!template) return notFound();
  const id = template[1];
  if (req.method === "GET") return store.requireTemplate(id);
  if (req.method === "DELETE") return store.deleteTemplate(id, false);
  if (req.method !== "PUT") return noMethod();
  const body = await readBody(req);
  if (url.searchParams.get("import") === "1" && store.templateExists(id)) return store.requireTemplate(id);
  return store.writeTemplate(id, templateInput(body, true), url.searchParams.get("import") === "1" ? "ensure" : "upsert");
}

function candidateSummary(roster: ReturnType<GetRoster>) {
  return roster.listCandidates().map(({ id, name, email, department, cycle, stage, roundId }) => {
    const invite = roster.latestInvite(id);
    return {
      id, name, email, department, cycle, stage, roundId,
      latestRsvp: invite ? {
        status: invite.rsvpStatus,
        invitationStatus: invite.status,
        respondedAt: invite.respondedAt,
        expiresAt: invite.expiresAt,
        valid: isInterviewInvitationUsable(invite, new Date().toISOString()),
      } : null,
    };
  });
}

function templateVariables(raw: unknown, target: "email" | "invite_page") {
  if (raw === undefined) return {};
  const values = record(raw);
  if (!values) throw new RsvpError(400, "variables 必须是变量名到字符串的对象。");
  const names = new Set(variablesForTarget(target).map(({ key }) => key));
  const entries = Object.entries(values).map(([key, value]) => {
    if (!names.has(key) || typeof value !== "string" || value.length > 4000)
      throw new RsvpError(400, "提供了不支持的变量名称或值。");
    if ((key === "rsvp_link" || key === "onboarding_link") && value !== "" && !/^https?:\/\/[^\s]+$/i.test(value))
      throw new RsvpError(400, "邀请链接变量须使用 HTTP 或 HTTPS 地址。");
    return [key, value] as const;
  });
  return Object.fromEntries(entries);
}

export async function handleOpenApi<R extends IncomingMessage>(
  req: R, url: URL, getStore: () => AgentStore, getRoster: GetRoster, readBody: ReadBody<R>,
): Promise<{ data: unknown; status?: number; raw?: boolean; warnings?: string[] }> {
  if (url.pathname === OPEN_API_PATH + "/openapi.json") {
    if (req.method !== "GET") return noMethod();
    return { data: openApiSpec, raw: true };
  }
  const authorize = (scope: Parameters<AgentStore["authorize"]>[1]) => getStore().authorize(req.headers.authorization, scope);
  if (url.pathname === OPEN_API_PATH + "/candidates") {
    if (req.method !== "GET") return noMethod();
    authorize("recruitment:read");
    return { data: candidateSummary(getRoster()) };
  }
  if (url.pathname === OPEN_API_PATH + "/rounds") {
    if (req.method === "GET") {
      authorize("rounds:read");
      return { data: getRoster().rounds.list() };
    }
    if (req.method === "POST") {
      authorize("rounds:write");
      return { data: getRoster().rounds.create(await readBody(req)), status: 201 };
    }
    return noMethod();
  }
  const round = new RegExp(`^${OPEN_API_PATH}/rounds/([a-zA-Z0-9_-]{1,80})$`).exec(url.pathname);
  if (round) {
    if (req.method !== "PUT") return noMethod();
    authorize("rounds:write");
    return { data: getRoster().rounds.update(round[1], await readBody(req)) };
  }
  const candidate = new RegExp(`^${OPEN_API_PATH}/candidates/([a-zA-Z0-9_-]{1,100})/submissions$`).exec(url.pathname);
  if (candidate) {
    if (req.method !== "GET") return noMethod();
    authorize("recruitment:read");
    return { data: getRoster().rounds.submissions(candidate[1]) };
  }
  if (url.pathname === OPEN_API_PATH + "/templates") {
    if (req.method === "GET") {
      authorize("templates:read");
      return { data: getStore().listTemplates(targetFilter(url)) };
    }
    if (req.method === "POST") {
      authorize("templates:write");
      const input = templateInput(await readBody(req));
      return { data: getStore().writeTemplate(crypto.randomUUID(), input, "create"), status: 201, warnings: input.warnings };
    }
    return noMethod();
  }
  const route = new RegExp(`^${OPEN_API_PATH}/templates/(${uuid})(/render)?$`).exec(url.pathname);
  if (!route) return notFound();
  const [, id, render] = route;
  if (render) {
    if (req.method !== "POST") return noMethod();
    const key = authorize("templates:read");
    const body = await readBody(req);
    const { document } = getStore().requireTemplate(id);
    const variables = templateVariables(body.variables, document.target);
    if (body.candidateId !== undefined) {
      if (!key.scopes.includes("recruitment:read")) throw new RsvpError(403, "按候选人渲染需要 recruitment:read 权限。");
      if (typeof body.candidateId !== "string" || !body.candidateId.trim())
        throw new RsvpError(400, "候选人 ID 无效。");
      const candidate = getRoster().getCandidate(body.candidateId);
      if (!candidate) throw new RsvpError(404, "候选人不存在。");
      return { data: renderAgentTemplate(document, { ...candidateContext(candidate, ""), ...variables }) };
    }
    return { data: renderAgentTemplate(document, body.variables === undefined ? sampleVariableValues() : variables) };
  }
  if (req.method === "GET") {
    authorize("templates:read");
    return { data: getStore().requireTemplate(id) };
  }
  if (req.method === "PUT") {
    authorize("templates:write");
    const input = templateInput(await readBody(req));
    return { data: getStore().writeTemplate(id, input, "replace"), warnings: input.warnings };
  }
  if (req.method === "DELETE") {
    authorize("templates:write");
    return { data: getStore().deleteTemplate(id, true) };
  }
  return noMethod();
}
