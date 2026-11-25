import { isDesignDocument } from "../../shared/design/draft.ts";
import { inviteHref } from "../../shared/invite/link.ts";
import type { SmtpAccountInput } from "../../shared/contracts/smtp.ts";
import { CUSTOM_ACTIVITY_CALLBACK, CUSTOM_ACTIVITY_SESSION } from "../../shared/contracts/interview-rounds.ts";
import { handleAgentManagement, handleOpenApi, isAgentManagementPath, OPEN_API_PATH } from "../open-api/routes.ts";
import type { AgentStore } from "../open-api/store-core.ts";
import type { LocalEmailRepository } from "../recruitment/email-repository-core.ts";
import type { createLocalMailService } from "../recruitment/mail.ts";
import { ensureDemoAccounts } from "../recruitment/mail.ts";
import { renderSmtpTestTemplate, smtpTestTemplateRequest } from "../recruitment/smtp-template.ts";
import {
  testSmtpAccount, testSmtpConnection, type LocalSmtpStore as SmtpTools,
  type SmtpConnectionTransport, type SmtpTestTransport,
} from "../recruitment/smtp-store-core.ts";
import { cancelBatch, createCandidate, getBatchDetail, importCandidates, issueCandidateInvite,
  listBatches, listRoster, previewMail, retryBatch, sendMail, updateCandidate } from "../recruitment/api.ts";
import { activityCallbackOrigin, activityTokenFrom } from "./activity-request.ts";
import { RsvpError } from "./error.ts";
import type { createRsvpStore } from "./store-core.ts";

export type DemoRequest = Pick<import("node:http").IncomingMessage, "method" | "url" | "headers">;
export type DemoResponse = { statusCode?: number; setHeader(name: string, value: string): unknown; end(body?: string): unknown };
type Store = ReturnType<typeof createRsvpStore>;
export type MailTools = { repository: LocalEmailRepository; service: ReturnType<typeof createLocalMailService> };
type MailProvider = () => Promise<MailTools>;

const PUBLIC = "/api/v1/rsvp/";
const MANAGE = "/api/local-demo/interview-invites";
const RECRUIT = "/api/local-demo/recruitment/";
const MAIL = "/api/local-demo/mail/";
const roundBodyLimit = 3 * 1024 * 1024;
const activityBodyLimit = 128 * 1024;

export function createDemoHandler<R extends DemoRequest>(
  getStore: () => Store,
  getMail: MailProvider | undefined,
  getSmtp: (() => SmtpTools) | undefined,
  getAgent: (() => AgentStore) | undefined,
  policy: {
    readBody: (req: R, limit?: number) => Promise<Record<string, unknown>>;
    baseUrl: (req: R) => string;
    assertLocal: (req: R) => void;
    allowOpenApi: (req: R) => boolean;
    smtpMode: () => "disabled" | "synthetic" | "real";
    smtpRecipient: (body?: Record<string, unknown>) => string | null;
    smtpConnection?: () => SmtpConnectionTransport;
    smtpTest?: () => SmtpTestTransport;
    browser?: boolean;
  },
) {
  const { readBody, baseUrl: requestBaseUrl, assertLocal: assertLocalManagement, smtpMode: smtpTestMode, browser = false } = policy;
  return async (
    req: R,
    res: DemoResponse,
    next: () => void,
  ) => {
    const path = (req.url ?? "").split("?")[0];
    const openApi = path === OPEN_API_PATH || path.startsWith(OPEN_API_PATH + "/");
    const agentManagement = isAgentManagementPath(path);
    const management =
      path === MANAGE ||
      path.startsWith(MANAGE + "/") ||
      path.startsWith(RECRUIT) ||
      path.startsWith(MAIL) ||
      agentManagement;
    if (!path.startsWith(PUBLIC) && !management && !openApi) return next();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (openApi || agentManagement) res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      let data: unknown;
      if (path === CUSTOM_ACTIVITY_CALLBACK || path === CUSTOM_ACTIVITY_SESSION) {
        if (browser) throw new RsvpError(403, "外部应用回传需要本机服务。");
        const session = path === CUSTOM_ACTIVITY_SESSION;
        res.setHeader("Vary", "Origin");
        const origin = req.headers.origin === undefined ? undefined : activityCallbackOrigin(req.headers.origin);
        if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
        if (req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Methods", session ? "GET, POST, OPTIONS" : "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST" && !(session && req.method === "GET")) throw new RsvpError(405, "互动接口不支持此请求方法。");
        const { cf_activity_token, ...result } = req.method === "POST" || Number(req.headers["content-length"]) > 0 || req.headers["transfer-encoding"]
          ? await readBody(req, session ? 4096 : activityBodyLimit) : {};
        const token = activityTokenFrom(req.headers.authorization, cf_activity_token);
        if (session && Object.keys(result).length) throw new RsvpError(400, "会话查询只接受环节凭证。");
        data = session ? getStore().externalActivitySession(token, origin) : getStore().saveExternalActivity(token, result, origin);
        res.end(JSON.stringify({ data }));
        return;
      }
      if (openApi) {
        if (!policy.allowOpenApi(req))
          throw new RsvpError(403, "开放 API 仅在本机演示服务中可用。");
        if (!getAgent) throw new RsvpError(503, "开放 API 服务尚未准备。");
        const roundsPath = OPEN_API_PATH + "/rounds";
        const bodyLimit = path === roundsPath || path.startsWith(roundsPath + "/") ? roundBodyLimit : undefined;
        const result = await handleOpenApi(req, new URL(req.url ?? "/", "http://localhost"), getAgent, getStore,
          (request) => readBody(request, bodyLimit));
        res.statusCode = result.status ?? 200;
        res.end(JSON.stringify(result.raw ? result.data : {
          data: result.data, ...(result.warnings?.length ? { warnings: result.warnings } : {}),
        }));
        return;
      }
      if (path.startsWith(PUBLIC)) {
        const match = /^([a-f0-9]{64})(?:\/(form|mbti)|\/activities\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,79})(\/launch)?)?$/u.exec(path.slice(PUBLIC.length));
        if (!match) throw new RsvpError(404, "邀请链接无效。");
        const [, token, activity, activityId, launch] = match;
        if (activityId) {
          if (launch) {
            if (browser) throw new RsvpError(403, "外部互动回传需要本机服务，可用内嵌环节体验。");
            if (req.method !== "GET") throw new RsvpError(405, "请使用邀请函中的打开入口。");
            const callbackUrl = new URL(CUSTOM_ACTIVITY_CALLBACK, requestBaseUrl(req)).href;
            const sessionUrl = new URL(CUSTOM_ACTIVITY_SESSION, requestBaseUrl(req)).href;
            const location = await getStore().launchExternalActivity(token, activityId, callbackUrl, sessionUrl);
            res.statusCode = 303;
            res.setHeader("Location", location);
            res.end();
            return;
          }
          if (req.method !== "POST") throw new RsvpError(405, "互动结果仅支持 POST。");
          data = await getStore().saveSandboxActivity(token, activityId, await readBody(req, activityBodyLimit));
          res.end(JSON.stringify({ data }));
          return;
        }
        if (activity === "form" || activity === "mbti") {
          if (req.method !== "POST") throw new RsvpError(405, "请使用 POST。");
          data = await getStore().saveActivity(token, activity, await readBody(req));
          res.statusCode = 200;
          res.end(JSON.stringify({ data }));
          return;
        }
        if (req.method === "GET") data = await getStore().view(token);
        else if (req.method === "POST") {
          const { response, version } = await readBody(req);
          if (
            (response !== "attending" && response !== "not_attending") ||
            typeof version !== "number" ||
            !Number.isSafeInteger(version) ||
            version < 1
          )
            throw new RsvpError(400, "请选择有效的答复。");
          data = await getStore().respond(token, response, version);
        } else throw new RsvpError(405, "邀请接口仅支持读取和提交。");
      } else {
        assertLocalManagement(req);
        const activityManagement = /^\/api\/local-demo\/recruitment\/candidates\/([A-Za-z0-9_-]{1,100})\/invites\/([a-f0-9-]{36})\/activities\/([A-Za-z0-9][A-Za-z0-9_-]{0,79})\/(reissue|revoke)$/u.exec(path);
        if (activityManagement) {
          if (req.method !== "POST") throw new RsvpError(405, "凭证管理仅支持 POST。");
          const [, candidateId, inviteId, activityId, action] = activityManagement;
          data = getStore().manageActivityCredential(candidateId, inviteId, activityId, action === "revoke" ? "revoke" : "reissue");
        } else if (agentManagement) {
          if (!getAgent) throw new RsvpError(503, "开放 API 服务尚未准备。");
          data = await handleAgentManagement(req, new URL(req.url ?? "/", "http://localhost"), getAgent(), readBody);
        } else if (path.startsWith(MANAGE + "/") && path.endsWith("/link")) {
          if (req.method !== "GET") throw new RsvpError(405, "请使用 GET。");
          const id = path.slice(MANAGE.length + 1, -"/link".length);
          const token = getStore().reopenLink(id);
          data = { rsvpUrl: inviteHref(requestBaseUrl(req), token, browser) };
        } else if (path === MANAGE) {
          if (req.method !== "POST") throw new RsvpError(405, "请使用 POST。");
          const body = await readBody(req);
          const doc = body.document;
          if (!isDesignDocument(doc, "invite_page") || typeof body.expiresAt !== "string")
            throw new RsvpError(400, "请选择保存的邀请函模板和截止时间。");
          if (
            doc.blocks.some(
              (block) =>
                block.props.assetId ||
                [block.props.src, block.props.backgroundImage].some(
                  (url) => typeof url === "string" && /^(?:blob|data):/i.test(url),
                ),
            )
          )
            throw new RsvpError(400, "此模板含本机图片，请改用可访问的图片 URL 后重新保存。");
          const organizationName = typeof body.organizationName === "string" ? body.organizationName : undefined;
          data = await getStore().issue(doc, body.expiresAt, undefined, undefined, organizationName);
        } else if (path.startsWith(MANAGE + "/")) {
          if (req.method !== "POST") throw new RsvpError(405, "请使用 POST。");
          const match = /^\/api\/local-demo\/interview-invites\/([a-f0-9-]{36})\/(rotate|revoke)$/.exec(path);
          if (!match) throw new RsvpError(404, "操作不存在。");
          if (match[2] === "rotate") data = await getStore().rotate(match[1]);
          else {
            getStore().revoke(match[1]);
            data = { revoked: true };
          }
        } else if (
          path === MAIL + "smtp-accounts" ||
          path.startsWith(MAIL + "smtp-accounts/") ||
          path === MAIL + "smtp-test-inbox" ||
          path === MAIL + "smtp-test-mode"
        ) {
          if (!getSmtp) throw new RsvpError(503, "发件邮箱服务尚未准备。");
          const smtp = getSmtp();
          if (path === MAIL + "smtp-test-mode") {
            if (req.method !== "GET") throw new RsvpError(405, "请使用 GET。");
            data = {
              mode: smtpTestMode(),
              recipientConfigured: Boolean(policy.smtpRecipient()),
            };
          } else if (path === MAIL + "smtp-accounts") {
            if (req.method === "GET") data = smtp.list();
            else if (req.method === "POST")
              data = smtp.create((await readBody(req)) as unknown as SmtpAccountInput);
            else throw new RsvpError(405, "请使用 GET 或 POST。");
          } else if (path === MAIL + "smtp-test-inbox") {
            if (req.method !== "GET") throw new RsvpError(405, "请使用 GET。");
            data = smtp.listInbox();
          } else {
            const match = /^\/api\/local-demo\/mail\/smtp-accounts\/([^/]+)(?:\/(test-connection|test|disable))?$/u.exec(path);
            if (!match) throw new RsvpError(404, "操作不存在。");
            const id = decodeURIComponent(match[1]);
            if (match[2] === "test-connection") {
              if (req.method !== "POST") throw new RsvpError(405, "请使用 POST。");
              const mode = smtpTestMode();
              const connection = mode === "real" ? policy.smtpConnection?.() : undefined;
              if (mode === "real" && !connection) throw new RsvpError(503, "真实 SMTP 传输未配置。");
              data = await testSmtpConnection(smtp, { mode }, id, connection);
            } else if (match[2] === "test") {
              if (req.method !== "POST") throw new RsvpError(405, "请使用 POST。");
              const body = await readBody(req);
              if (typeof body.to !== "string" || !body.to.trim())
                throw new RsvpError(400, "请填写测试收件人。");
              const template = smtpTestTemplateRequest(body);
              const mode = smtpTestMode();
              const transport = mode === "real" ? policy.smtpTest?.() : undefined;
              if (mode === "real" && !transport) throw new RsvpError(503, "真实 SMTP 传输未配置。");
              data = await testSmtpAccount(
                smtp,
                {
                  mode,
                  recipient: policy.smtpRecipient(body),
                },
                id,
                body.to,
                transport,
                template ? () => {
                  if (!getAgent) throw new RsvpError(503, "模板库尚未准备。");
                  return renderSmtpTestTemplate(getAgent(), template);
                } : undefined,
              );
            } else if (match[2] === "disable") {
              if (req.method !== "POST") throw new RsvpError(405, "请使用 POST。");
              data = smtp.disable(id);
            } else {
              if (req.method !== "PATCH") throw new RsvpError(405, "请使用 PATCH。");
              data = smtp.update(id, (await readBody(req)) as unknown as SmtpAccountInput);
            }
          }
        } else if (/^\/api\/local-demo\/recruitment\/candidates\/[^/]+\/rounds\/[^/]+\/review$/u.test(path)) {
          const [, candidateId,, roundId] = path.slice(RECRUIT.length).split("/").map(decodeURIComponent);
          const rounds = getStore().rounds;
          if (req.method === "GET") {
            rounds.requireMembership(candidateId, roundId);
            data = rounds.getReview(candidateId, roundId);
          } else if (req.method === "PUT") {
            data = rounds.saveReview(candidateId, roundId, await readBody(req));
          } else if (req.method === "DELETE") {
            data = rounds.deleteReview(candidateId, roundId);
          } else throw new RsvpError(405, "此路径不支持该请求。");
        } else if (path === RECRUIT + "rounds" || path.startsWith(RECRUIT + "rounds/") || path === RECRUIT + "promote"
          || /^\/api\/local-demo\/recruitment\/candidates\/[^/]+\/submissions$/u.test(path)) {
          const rounds = getStore().rounds;
          const method = req.method;
          const segments = path.slice(RECRUIT.length).split("/");
          if (path === RECRUIT + "promote" && method === "POST") {
            const { candidateIds, roundId, schedule } = await readBody(req);
            data = rounds.promote(candidateIds, roundId, schedule);
          } else if (segments[0] === "candidates" && method === "GET") {
            data = rounds.submissions(decodeURIComponent(segments[1]), true);
          } else if (segments.length === 1 && segments[0] === "rounds" && method === "GET") {
            data = rounds.list();
          } else if (segments.length === 1 && segments[0] === "rounds" && method === "POST") {
            data = rounds.create(await readBody(req, roundBodyLimit));
          } else if (segments.length === 2 && segments[1] === "reorder" && method === "PUT") {
            data = rounds.reorder((await readBody(req)).ids);
          } else if (segments.length === 2 && method === "PUT") {
            data = rounds.update(segments[1], await readBody(req, roundBodyLimit));
          } else if (segments.length === 2 && method === "DELETE") {
            data = rounds.archive(segments[1]);
          } else if (segments.length === 3 && segments[2] === "csv" && method === "GET") {
            const csv = rounds.exportCsv(segments[1]);
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", "attachment; filename=questionnaire.csv");
            res.setHeader("X-Content-Type-Options", "nosniff");
            res.end(csv);
            return;
          } else throw new RsvpError(405, "此路径不支持该请求。");
        } else {
          if (!getMail) throw new RsvpError(503, "邮件演示服务尚未准备。");
          const mail = await getMail();
          if (path === RECRUIT + "candidates") {
            if (req.method === "GET") data = listRoster(getStore(), mail.repository);
            else if (req.method === "POST") {
              data = createCandidate(getStore(), await readBody(req));
            } else throw new RsvpError(405, "请使用 GET 或 POST。");
          } else if (path === RECRUIT + "candidates/import") {
            if (req.method !== "POST") throw new RsvpError(405, "请使用 POST。");
            data = importCandidates(getStore(), await readBody(req));
          } else if (/^\/api\/local-demo\/recruitment\/candidates\/[^/]+\/invite$/u.test(path)) {
            if (req.method !== "POST") throw new RsvpError(405, "请使用 POST。");
            const id = decodeURIComponent(path.split("/")[5]);
            data = await issueCandidateInvite(getStore(), id, await readBody(req), requestBaseUrl(req), browser);
          } else if (/^\/api\/local-demo\/recruitment\/candidates\/[^/]+$/u.test(path)) {
            if (req.method !== "PATCH") throw new RsvpError(405, "请使用 PATCH。");
            const id = decodeURIComponent(path.split("/")[5]);
            data = updateCandidate(getStore(), id, await readBody(req));
          } else if (path === MAIL + "accounts") {
            if (req.method !== "GET") throw new RsvpError(405, "请使用 GET。");
            data = await ensureDemoAccounts(mail.service);
          } else if (path === MAIL + "preview") {
            if (req.method !== "POST") throw new RsvpError(405, "请使用 POST。");
            data = previewMail(getStore(), await readBody(req), requestBaseUrl(req), browser);
          } else if (path === MAIL + "batches") {
            if (req.method === "GET") {
              data = await listBatches(getStore(), mail.repository, mail.service);
            } else if (req.method === "POST") {
              data = await sendMail(getStore(), mail.repository, mail.service, await readBody(req), requestBaseUrl(req), browser);
            } else throw new RsvpError(405, "请使用 GET 或 POST。");
          } else if (/^\/api\/local-demo\/mail\/batches\/[^/]+$/u.test(path)) {
            if (req.method !== "GET") throw new RsvpError(405, "请使用 GET。");
            const id = decodeURIComponent(path.split("/")[5]);
            data = await getBatchDetail(getStore(), mail.repository, mail.service, id);
          } else if (/^\/api\/local-demo\/mail\/batches\/[^/]+\/(retry|cancel)$/u.test(path)) {
            if (req.method !== "POST") throw new RsvpError(405, "请使用 POST。");
            const parts = path.split("/");
            const id = decodeURIComponent(parts[5]);
            data = parts[6] === "retry"
              ? await retryBatch(getStore(), mail.repository, mail.service, id)
              : await cancelBatch(getStore(), mail.repository, mail.service, id);
          } else {
            throw new RsvpError(404, "操作不存在。");
          }
        }
      }
      res.end(JSON.stringify({ data }));
    } catch (error) {
      res.statusCode = error instanceof RsvpError ? error.status : 500;
      if (openApi && res.statusCode === 401) res.setHeader("WWW-Authenticate", 'Bearer realm="CampusFlow"');
      res.end(
        JSON.stringify({
          message:
            error instanceof RsvpError
              ? error.message
              : "演示服务暂时不可用，请重试。",
        }),
      );
    }
  };
}
