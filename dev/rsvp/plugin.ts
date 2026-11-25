import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";
import { isInterviewInvitationUsable } from "../../shared/domain/interview.ts";
import { openRsvpStore, RsvpError } from "./store.ts";
import { createDemoHandler, type MailTools } from "./handler.ts";
import { offerRoundTemplates, presetRoundTemplates, savedOfferPresets, savedTemplatePresets } from "../open-api/template-presets.ts";
import { openAgentStore, type AgentStore } from "../open-api/store.ts";
import { openLocalEmailRepository, type LocalEmailRepository } from "../recruitment/email-repository.ts";
import { createLocalMailService, ensureDemoAccounts } from "../recruitment/mail.ts";
import { openSmtpSecretVault } from "../recruitment/smtp-secrets.ts";
import { openSmtpAccountStore } from "../recruitment/smtp-store.ts";
import { createSmtpConnectionTransport, createSmtpTestTransport, sendSmtpMessage } from "../recruitment/smtp-transport.ts";

import { aiMiddleware } from "../ai/middleware.ts";

type Store = ReturnType<typeof openRsvpStore>;
type SmtpTools = ReturnType<typeof openSmtpAccountStore>;

const loopback = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;


async function readBody(req: IncomingMessage, limit = 512 * 1024): Promise<Record<string, unknown>> {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new RsvpError(415, "需要 JSON 请求。");
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) throw new RsvpError(413, "请求内容过大。");
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {
    /* Return a uniform validation error. */
  }
  throw new RsvpError(400, "请求内容无效。");
}

function assertLocalManagement(req: IncomingMessage) {
  const host = req.headers.host ?? "";
  const expectedOrigin = `http://${host}`;
  const origin = req.headers.origin;
  const fetchSite = req.headers["sec-fetch-site"];
  const readOnly = req.method === "GET" || req.method === "HEAD";
  const siteProven = fetchSite === undefined || fetchSite === "same-origin";
  const originProven =
    origin !== undefined
      ? origin === expectedOrigin
      : readOnly && fetchSite === "same-origin";
  if (
    !loopback.has(req.socket.remoteAddress ?? "") ||
    !localHost.test(host) ||
    !siteProven ||
    !originProven ||
    req.headers["x-campusflow-demo"] !== "1"
  )
    throw new RsvpError(403, "仅限本机演示管理。");
}

function requestBaseUrl(req: IncomingMessage) {
  if (process.env.CAMPUSFLOW_PUBLIC_URL) return publicOrigin(process.env.CAMPUSFLOW_PUBLIC_URL);
  const host = req.headers.host ?? "127.0.0.1";
  const origin = req.headers.origin;
  if (origin && /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/u.test(origin))
    return origin;
  return `http://${host}`;
}

export function publicOrigin(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash)
    throw new Error("CAMPUSFLOW_PUBLIC_URL 需要填写 HTTP 或 HTTPS 站点源地址。");
  return url.origin;
}

export function smtpTestMode(env: NodeJS.ProcessEnv = process.env): "disabled" | "synthetic" | "real" {
  const explicit = env.CAMPUSFLOW_SMTP_MODE;
  if (explicit === "disabled") return "disabled";
  if (env.NODE_TEST_CONTEXT) return "synthetic";
  if (explicit === "synthetic" || explicit === "real") return explicit;
  if (explicit !== undefined) throw new Error("CAMPUSFLOW_SMTP_MODE 必须是 real、synthetic 或 disabled。");
  if (env.CAMPUSFLOW_REAL_MAIL_TEST !== undefined || env.CAMPUSFLOW_REAL_SMTP_TEST !== undefined) {
    if (env.CAMPUSFLOW_REAL_MAIL_TEST !== "1") return "disabled";
    return env.CAMPUSFLOW_REAL_SMTP_TEST === "1" ? "real" : "synthetic";
  }
  return "real";
}

function isLocalAi(req: IncomingMessage) {
  const origin = req.headers.origin;
  return loopback.has(req.socket.remoteAddress ?? "") && localHost.test(req.headers.host ?? "") &&
    (origin === undefined || origin === `http://${req.headers.host}`) &&
    (req.headers["sec-fetch-site"] === undefined || req.headers["sec-fetch-site"] === "same-origin");
}

export function rsvpMiddleware(
  getStore: () => Store,
  getMail?: () => Promise<MailTools>,
  getSmtp?: () => SmtpTools,
  getAgent?: () => AgentStore,
) {
  return createDemoHandler(getStore, getMail, getSmtp, getAgent, {
    readBody,
    baseUrl: requestBaseUrl,
    assertLocal: assertLocalManagement,
    allowOpenApi: (req) => loopback.has(req.socket.remoteAddress ?? "") && localHost.test(req.headers.host ?? ""),
    smtpMode: smtpTestMode,
    smtpRecipient: (body) => process.env.CAMPUSFLOW_TEST_RECIPIENT?.trim() ||
      (smtpTestMode() === "synthetic" && typeof body?.to === "string" ? body.to : null),
    smtpConnection: createSmtpConnectionTransport,
    smtpTest: createSmtpTestTransport,
  });
}

export function localRsvpPlugin(): Plugin {
  return {
    name: "campusflow-local-rsvp",
    apply: "serve",
    configureServer(server) {
      smtpTestMode();
      if (process.env.CAMPUSFLOW_PUBLIC_URL) publicOrigin(process.env.CAMPUSFLOW_PUBLIC_URL);
      let store: Store | undefined;
      let mail: Promise<MailTools> | undefined;
      let repository: LocalEmailRepository | undefined;
      let smtp: ReturnType<typeof openSmtpAccountStore> | undefined;
      let agent: AgentStore | undefined;
      const file =
        process.env.CAMPUSFLOW_RSVP_DB ??
        join(homedir(), ".campusflow", "demo", "rsvp.sqlite");
      const ensureStore = () => {
        if (!store) {
          mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
          store = openRsvpStore(file);
        }
        return store;
      };
      const getMail = () => {
        const currentStore = ensureStore();
        if (!mail) {
          repository = openLocalEmailRepository(file);
          const currentRepository = repository;
          const service = createLocalMailService(currentRepository, async (delivery) => {
            const link = currentRepository.getDeliveryLink(delivery.id);
            if (!link) return { eligible: false, issues: ["邮件与候选人邀请关联缺失。"] };
            const invite = currentStore.getInvite(link.inviteId);
            if (!invite) return { eligible: false, issues: ["候选人邀请已不存在。"] };
            if (!isInterviewInvitationUsable(invite, new Date().toISOString()))
              return { eligible: false, issues: ["候选人邀请已撤销或过期，请重新签发后再发送。"] };
            if (invite.version !== delivery.sourceVersion)
              return { eligible: false, issues: ["候选人邀请版本已变化，请重新生成邮件。"] };
            return { eligible: true, issues: [] };
          }, { store: getSmtp, mode: smtpTestMode, send: sendSmtpMessage });
          mail = ensureDemoAccounts(service).then(() => ({ repository: currentRepository, service }));
        }
        return mail;
      };
      const getSmtp = () => {
        if (!smtp) smtp = openSmtpAccountStore(file, openSmtpSecretVault(file));
        return smtp;
      };
      const getAgent = () => {
        if (!agent) {
          ensureStore();
          agent = openAgentStore(file);
        }
        return agent;
      };
      if (process.env.CAMPUSFLOW_TEMPLATE_PRESETS !== "0") {
        const templates = getAgent();
        templates.initializeTemplatePresets(savedTemplatePresets, presetRoundTemplates);
        templates.initializeTemplatePresets(savedOfferPresets, offerRoundTemplates, {
          initialization: "saved-template-offer-v1", onlyIfEmpty: false,
        });
        templates.updateFeaturedPresets([...savedTemplatePresets(), ...savedOfferPresets()], [], false);
      }
      server.middlewares.use(aiMiddleware({ allowMock: process.env.AI_MOCK !== "0", allowed: isLocalAi }));
      server.middlewares.use(rsvpMiddleware(ensureStore, getMail, getSmtp, getAgent));
      server.httpServer?.once("close", () => {
        store?.close();
        repository?.close();
        smtp?.close();
        agent?.close();
      });
    },
  };
}
