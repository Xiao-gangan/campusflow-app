import { inviteHref } from "../../shared/invite/link.ts";
import type { DesignDocument } from "../../shared/contracts/design.ts";
import type { EmailRecipient } from "../../shared/contracts/email.ts";
import type {
  CandidateImportResult,
  CandidateInviteSummary,
  CandidateDeliverySummary,
  MailBatchDetail,
  MailPreviewItem,
  MailPreviewRequest,
  MailPreviewResult,
  MailSendRequest,
  RosterCandidate,
} from "../../shared/contracts/recruitment-console.ts";
import { previewCandidateCsv } from "./csv.ts";
import { isDesignDocument } from "../../shared/design/draft.ts";
import { designToEmailDocument } from "../../shared/email/design-renderer.ts";
import { renderDesignEmail } from "../../shared/email/design-renderer.ts";
import { renderFreeEmailHtml } from "../../shared/email/free-html.ts";
import { buildInvitePage } from "../../shared/invite/model.ts";
import { isInterviewInvitationUsable } from "../../shared/domain/interview.ts";
import type { LocalEmailRepository } from "./email-repository.ts";
import {
  candidateContext,
  createLocalMailService,
  ensureDemoAccounts,
  localAssetIssues,
} from "./mail.ts";
import { RsvpError } from "../rsvp/error.ts";
import type { createRsvpStore } from "../rsvp/store-core.ts";

type Store = ReturnType<typeof createRsvpStore>;
type MailService = ReturnType<typeof createLocalMailService>;
function fail(status: number, message: string): never {
  throw new RsvpError(status, message);
}

function requireText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim())
    fail(400, `请填写${label}。`);
  return value.trim();
}

function requireStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    fail(400, "收件人选择无效。");
  return [...new Set(value as string[])];
}

function inviteSummary(store: Store, candidateId: string, roundId: string): CandidateInviteSummary | null {
  const invite = store.latestInvite(candidateId, roundId);
  if (!invite) return null;
  return {
    id: invite.id,
    status: invite.status,
    rsvpStatus: invite.rsvpStatus,
    expiresAt: invite.expiresAt,
    respondedAt: invite.respondedAt,
    version: invite.version,
    valid: isInterviewInvitationUsable(invite, new Date().toISOString()),
    revokedAt: invite.revokedAt,
  };
}

function deliverySummary(store: Store, repository: LocalEmailRepository, candidateId: string, roundId: string): CandidateDeliverySummary | null {
  const delivery = repository.latestDeliveryForCandidate(candidateId, roundId);
  if (!delivery) return null;
  const link = repository.getDeliveryLink(delivery.id);
  return {
    batchId: delivery.batchId,
    status: delivery.status,
    subject: delivery.subject,
    sentAt: delivery.sentAt,
    retryable: delivery.retryable,
    errorMessage: delivery.errorMessage,
    rsvpUrl: link && store.deliveryInvite(link.inviteId, link.rsvpUrl)?.status === "valid" ? link.rsvpUrl : null,
  };
}

export function listRoster(store: Store, repository: LocalEmailRepository): RosterCandidate[] {
  return store.listCandidates().map((candidate) => {
    const review = store.rounds.getReview(candidate.id, candidate.roundId);
    return {
      ...candidate,
      progress: store.rounds.progress(candidate.id, store.rounds.requireRound(candidate.roundId)),
      completedByRound: store.rounds.completedByRound(candidate.id),
      latestInvite: inviteSummary(store, candidate.id, candidate.roundId),
      latestDelivery: deliverySummary(store, repository, candidate.id, candidate.roundId),
      deliveryByRound: repository.deliveryByRound(candidate.id),
      review: review ? { rating: review.rating, decision: review.decision } : null,
    };
  });
}

export function createCandidate(store: Store, body: Record<string, unknown>) {
  return store.createCandidate({
    name: requireText(body.name, "姓名"),
    email: requireText(body.email, "邮箱"),
    department: requireText(body.department, "部门"),
    stage: body.stage as never,
    note: typeof body.note === "string" ? body.note : "",
    interviewDate: typeof body.interviewDate === "string" ? body.interviewDate : undefined,
    startTime: typeof body.startTime === "string" ? body.startTime : undefined,
    endTime: typeof body.endTime === "string" ? body.endTime : undefined,
    location: typeof body.location === "string" ? body.location : undefined,
  });
}

export function updateCandidate(
  store: Store,
  id: string,
  body: Record<string, unknown>,
) {
  return store.updateCandidate(id, {
    name: requireText(body.name, "姓名"),
    email: requireText(body.email, "邮箱"),
    department: requireText(body.department, "部门"),
    stage: body.stage as never,
    note: typeof body.note === "string" ? body.note : "",
    interviewDate: typeof body.interviewDate === "string" ? body.interviewDate : undefined,
    startTime: typeof body.startTime === "string" ? body.startTime : undefined,
    endTime: typeof body.endTime === "string" ? body.endTime : undefined,
    location: typeof body.location === "string" ? body.location : undefined,
  });
}

export function importCandidates(
  store: Store,
  body: Record<string, unknown>,
): CandidateImportResult {
  const csv = requireText(body.csv, "CSV 内容");
  const existing = store.listCandidates();
  const cycle = existing[0]?.cycle ?? "2026 秋招";
  const preview = previewCandidateCsv(csv, cycle, existing);
  if (body.commit !== true) return { ...preview, created: [], skipped: [] };
  const created: CandidateImportResult["created"] = [];
  const skipped: CandidateImportResult["skipped"] = [];
  for (const row of preview.rows) {
    if (!row.valid || !row.input) continue;
    try {
      created.push(store.createCandidate(row.input));
    } catch (error) {
      skipped.push({
        row: row.row,
        email: row.email,
        reason: error instanceof RsvpError ? error.message : "导入失败。",
      });
    }
  }
  return { ...preview, created, skipped };
}

function selectRound(store: Store, value: unknown, candidateIds: string[]) {
  if (value !== undefined) {
    if (typeof value !== "string") fail(400, "请选择有效的面试轮次。");
    return store.rounds.requireRound(value, true).id;
  }
  for (const id of candidateIds) {
    const candidate = store.getCandidate(id);
    if (candidate) store.rounds.requireRound(candidate.roundId, true);
  }
  return undefined;
}

function validateDocuments(body: Record<string, unknown>): {
  emailDocument: DesignDocument;
  inviteDocument: DesignDocument;
  candidateIds: string[];
  expiresAt: string;
} {
  if (!isDesignDocument(body.emailDocument, "email"))
    fail(400, "请选择已保存的邮件模板。");
  if (!isDesignDocument(body.inviteDocument, "invite_page"))
    fail(400, "请选择已保存的邀请函模板。");
  const candidateIds = requireStringArray(body.candidateIds);
  if (!candidateIds.length) fail(400, "请至少选择一名候选人。");
  if (typeof body.expiresAt !== "string" || !Number.isFinite(Date.parse(body.expiresAt)))
    fail(400, "请选择有效的答复截止时间。");
  if (Date.parse(body.expiresAt) <= Date.now())
    fail(400, "答复截止时间必须晚于当前时间。");
  return {
    emailDocument: body.emailDocument as DesignDocument,
    inviteDocument: body.inviteDocument as DesignDocument,
    candidateIds,
    expiresAt: new Date(body.expiresAt).toISOString(),
  };
}

function hasAttendanceLink(html: string, expected: string): boolean {
  let target: URL;
  try {
    target = new URL(expected);
  } catch {
    return false;
  }
  const path = (value: string) => value.replace(/\/+$/u, "") || "/";
  for (const match of html.matchAll(/href=["']([^"']+)["']/gu)) {
    try {
      const actual = new URL(match[1].replace(/&amp;/gu, "&"));
      if (
        actual.origin === target.origin &&
        path(actual.pathname) === path(target.pathname) &&
        actual.search === target.search &&
        actual.hash === target.hash
      )
        return true;
    } catch {
      // Only canonical href attributes can serve as a clickable CTA.
    }
  }
  return false;
}

function previewFor(
  store: Store,
  candidateIds: string[],
  emailDocument: DesignDocument,
  inviteDocument: DesignDocument,
  baseUrl: string,
  organizationName?: string,
  roundId?: string,
  browser = false,
): MailPreviewResult {
  const candidates = candidateIds
    .map((id) => store.getCandidate(id, roundId))
    .filter((candidate) => candidate !== null);
  if (candidates.length !== candidateIds.length)
    fail(404, "部分候选人已不存在，请刷新名单。");
  const documentIssues = [
    ...localAssetIssues(emailDocument),
    ...localAssetIssues(inviteDocument),
  ];
  const items: MailPreviewItem[] = candidates.map((candidate) => {
    const previewLink = inviteHref(baseUrl, "preview-" + candidate.id, browser);
    const context = candidateContext(candidate, previewLink, organizationName);
    const inviteCheck =
      inviteDocument.mode === "html"
        ? renderFreeEmailHtml(inviteDocument, context)
        : buildInvitePage(inviteDocument, context);
    const email = renderDesignEmail(emailDocument, context);
    const issues = [
      ...documentIssues,
      ...(inviteCheck.missingVariables.length
        ? [`邀请函缺少变量：${inviteCheck.missingVariables.join("、")}`]
        : []),
      ...(email.missingVariables.length
        ? [`邮件缺少变量：${email.missingVariables.join("、")}`]
        : []),
      ...(!hasAttendanceLink(email.html, previewLink)
        ? ["邮件模板没有可用的出席确认入口；请在邮件中加入 {{rsvp_link}} 按钮或链接。"]
        : []),
    ];
    return {
      candidateId: candidate.id,
      name: candidate.name,
      email: candidate.email,
      eligible: issues.length === 0,
      issues: [...new Set(issues)],
      subject: email.subject,
      html: email.html,
      text: email.text,
      missingVariables: email.missingVariables,
      warnings: [...new Set([...email.warnings, ...inviteCheck.warnings])],
    };
  });
  return {
    items,
    eligible: items.filter((item) => item.eligible).length,
    excluded: items.filter((item) => !item.eligible).length,
  };
}

export function previewMail(
  store: Store,
  body: Record<string, unknown>,
  baseUrl: string,
  browser = false,
): MailPreviewResult {
  const { emailDocument, inviteDocument, candidateIds } = validateDocuments(body);
  const roundId = selectRound(store, body.roundId, candidateIds);
  const organizationName =
    typeof body.organizationName === "string" ? body.organizationName.trim() : undefined;
  return previewFor(
    store,
    candidateIds,
    emailDocument,
    inviteDocument,
    baseUrl,
    organizationName,
    roundId,
    browser,
  );
}

function batchDetail(
  service: MailService,
  repository: LocalEmailRepository,
  store: Store,
  batchId: string,
): Promise<MailBatchDetail | null> {
  return (async () => {
    const batch = await service.getBatch(batchId);
    if (!batch) return null;
    const deliveries = await service.listDeliveries(batchId);
    const links = new Map(
      repository.listDeliveryLinks(batchId).map((link) => [link.deliveryId, link]),
    );
    const candidates = new Map(store.listCandidates().map((item) => [item.id, item]));
    return {
      batch,
      deliveries: deliveries.map((delivery) => {
        const link = links.get(delivery.id);
        const candidate = candidates.get(delivery.sourceId);
        const invite = link ? store.deliveryInvite(link.inviteId, link.rsvpUrl) : null;
        return {
          ...delivery,
          candidateId: delivery.sourceId,
          candidateName: link?.candidateName ?? candidate?.name ?? "候选人",
          inviteId: link?.inviteId ?? "",
          invite,
          rsvpUrl: invite?.status === "valid" ? link?.rsvpUrl ?? "" : "",
        };
      }),
    };
  })();
}

export async function sendMail(
  store: Store,
  repository: LocalEmailRepository,
  service: MailService,
  body: Record<string, unknown>,
  baseUrl: string,
  browser = false,
): Promise<MailBatchDetail> {
  const idempotencyKey = requireText(body.idempotencyKey, "请求标识");
  let existing = await repository.findBatchByIdempotencyKey(idempotencyKey);
  if (existing) {
    const detail = await batchDetail(service, repository, store, existing.id);
    if (detail) return detail;
  }
  const { emailDocument, inviteDocument, candidateIds, expiresAt } = validateDocuments(body);
  const roundId = selectRound(store, body.roundId, candidateIds);
  const organizationName =
    typeof body.organizationName === "string" ? body.organizationName.trim() : undefined;
  const accountId = requireText(body.accountId, "发件身份");
  const accounts = await ensureDemoAccounts(service);
  const account = accounts.find((item) => item.id === accountId);
  if (!account) fail(400, "发件身份不存在或尚未通过真实投递验证。");
  if (account.smtpHost && body.confirmSmtp !== true)
    fail(400, "请确认本次使用真实 SMTP 发信。");
  const preview = previewFor(
    store,
    candidateIds,
    emailDocument,
    inviteDocument,
    baseUrl,
    organizationName,
    roundId,
    browser,
  );
  if (preview.eligible === 0)
    fail(400, "没有可发送的候选人，请先处理预览中的问题。");
  let claimed = repository.claimMailRequest(idempotencyKey);
  if (!claimed) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      existing = await repository.findBatchByIdempotencyKey(idempotencyKey);
      if (existing) {
        const detail = await batchDetail(service, repository, store, existing.id);
        if (detail) return detail;
      }
      if (!repository.hasMailRequest(idempotencyKey)) break;
    }
    claimed = repository.claimMailRequest(idempotencyKey);
    if (!claimed)
      fail(409, "相同发送请求正在处理或已创建，请刷新发件箱查看结果。");
  }
  const candidates = new Map(store.listCandidates().map((item) => [item.id, item]));
  const previewById = new Map(preview.items.map((item) => [item.candidateId, item]));
  const issued: { candidateId: string; inviteId: string; rsvpUrl: string }[] = [];
  const recipients: EmailRecipient[] = [];
  let batchCompleted = false;
  try {
    for (const candidateId of candidateIds) {
      const candidate = roundId ? store.getCandidate(candidateId, roundId) : candidates.get(candidateId);
      const item = previewById.get(candidateId);
      if (!candidate || !item) continue;
      let rsvpUrl = inviteHref(baseUrl, "preview-" + candidate.id, browser);
      if (item.eligible) {
        const issuedInvite = await store.issue(inviteDocument, expiresAt, candidate, roundId ?? candidate.roundId, organizationName);
        rsvpUrl = inviteHref(baseUrl, issuedInvite.token, browser);
        issued.push({ candidateId, inviteId: issuedInvite.id, rsvpUrl });
      }
      recipients.push({
        sourceId: candidate.id,
        sourceVersion: 1,
        email: candidate.email,
        name: candidate.name,
        context: candidateContext(candidate, rsvpUrl, organizationName),
        eligible: item.eligible,
        issues: item.issues,
      });
    }
    const template = await service.createTemplate({
      name: requireText(body.batchName, "批次名称"),
      subjectTemplate: emailDocument.meta.subjectTemplate?.trim() || "面试邀请",
      preheaderText: emailDocument.meta.preheaderText ?? null,
      editorDocument: designToEmailDocument(emailDocument),
      status: "active",
    });
    repository.saveDesignDocument(template.id, emailDocument);
    const created = await service.createBatch({
      name: requireText(body.batchName, "批次名称"),
      templateId: template.id,
      accountId,
      mode: "send",
      sourceModule: "recruitment",
      recipients,
      idempotencyKey,
    });
    repository.completeMailRequest(idempotencyKey, created.id);
    batchCompleted = true;
    const queuedDeliveries = await service.listDeliveries(created.id);
    const issuedById = new Map(issued.map((item) => [item.candidateId, item]));
    for (const delivery of queuedDeliveries) {
      const invite = issuedById.get(delivery.sourceId);
      if (!invite) continue;
      repository.setDeliveryLink({
        deliveryId: delivery.id,
        batchId: created.id,
        candidateId: delivery.sourceId,
        candidateName: candidates.get(delivery.sourceId)?.name ?? "候选人",
        inviteId: invite.inviteId,
        rsvpUrl: invite.rsvpUrl,
      });
    }
    const sent = await service.sendBatch(created.id);
    const detail = await batchDetail(service, repository, store, sent.id);
    if (!detail) fail(500, "无法读取刚创建的发件批次。");
    return detail;
  } catch (error) {
    if (!batchCompleted) {
      for (const invite of issued) {
        try {
          store.revoke(invite.inviteId);
        } catch {
          // The batch may already be terminal; keep the original error.
        }
      }
      repository.releaseMailRequest(idempotencyKey);
    }
    throw error;
  }
}

export async function listBatches(
  store: Store,
  repository: LocalEmailRepository,
  service: MailService,
) {
  return repository.listBatches();
}

export async function getBatchDetail(
  store: Store,
  repository: LocalEmailRepository,
  service: MailService,
  id: string,
) {
  return batchDetail(service, repository, store, id);
}

export async function retryBatch(
  store: Store,
  repository: LocalEmailRepository,
  service: MailService,
  id: string,
) {
  await service.retryBatch(id);
  return batchDetail(service, repository, store, id);
}

export async function cancelBatch(
  store: Store,
  repository: LocalEmailRepository,
  service: MailService,
  id: string,
) {
  await service.cancelBatch(id);
  return batchDetail(service, repository, store, id);
}

export function issueCandidateInvite(
  store: Store,
  candidateId: string,
  body: Record<string, unknown>,
  baseUrl: string,
  browser = false,
) {
  const candidate = store.getCandidate(candidateId);
  if (!candidate) fail(404, "候选人不存在。");
  if (!isDesignDocument(body.document, "invite_page"))
    fail(400, "请选择已保存的邀请函模板。");
  if (typeof body.expiresAt !== "string")
    fail(400, "请选择答复截止时间。");
  const roundId = selectRound(store, body.roundId, [candidate.id]);
  const organizationName = typeof body.organizationName === "string" ? body.organizationName.trim() : undefined;
  return store.issue(body.document as DesignDocument, body.expiresAt, candidate, roundId, organizationName).then((issued) => ({
    ...issued,
    rsvpUrl: inviteHref(baseUrl, issued.token, browser),
  }));
}
