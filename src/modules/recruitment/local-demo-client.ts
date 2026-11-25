import { demoFetch } from "../browser-demo/request.ts";
import type { ActivityCredential, InterviewRound, InterviewRoundInput, PromotionSchedule, RoundReview, RoundReviewInput, RoundSubmission } from "@/shared/contracts/interview-rounds";
import type { DesignDocument } from "@/shared/contracts/design";
import type {
  CandidateImportResult,
  CandidateInput,
  MailBatchDetail,
  MailPreviewRequest,
  MailPreviewResult,
  MailSendRequest,
  RosterCandidate,
} from "@/shared/contracts/recruitment-console";
import type { EmailAccount, EmailBatch } from "@/shared/contracts/email";
import type {
  SmtpAccount,
  SmtpAccountInput,
  SmtpConnectionResult,
  SmtpTestInboxItem,
  SmtpTestResult,
  SmtpTestRequest,
} from "@/shared/contracts/smtp";

const RECRUIT = "/api/local-demo/recruitment";
const MAIL = "/api/local-demo/mail";

export class DemoApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function demoRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await demoFetch(path, {
    method: options.method ?? "GET",
    cache: "no-store",
    headers: {
      "X-CampusFlow-Demo": "1",
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new DemoApiError(
      response.status,
      typeof body?.message === "string" ? body.message : "本机演示服务暂时不可用。",
    );
  }
  const body = await response.json();
  return body.data as T;
}

export const demoApi = {
  listRounds: () => demoRequest<InterviewRound[]>(`${RECRUIT}/rounds`),
  saveRound: (id: string | null, input: InterviewRoundInput) =>
    demoRequest<InterviewRound>(`${RECRUIT}/rounds${id ? "/" + id : ""}`, { method: id ? "PUT" : "POST", body: input }),
  archiveRound: (id: string) => demoRequest<InterviewRound>(`${RECRUIT}/rounds/${id}`, { method: "DELETE" }),
  reorderRounds: (ids: string[]) =>
    demoRequest<InterviewRound[]>(`${RECRUIT}/rounds/reorder`, { method: "PUT", body: { ids } }),
  promote: (candidateIds: string[], roundId: string, schedule?: PromotionSchedule) =>
    demoRequest<{ moved: number; round: InterviewRound }>(`${RECRUIT}/promote`, { method: "POST", body: { candidateIds, roundId, schedule } }),
  saveReview: (candidateId: string, roundId: string, input: RoundReviewInput) =>
    demoRequest<RoundReview>(`${RECRUIT}/candidates/${encodeURIComponent(candidateId)}/rounds/${encodeURIComponent(roundId)}/review`,
      { method: "PUT", body: input }),
  submissions: (id: string) => demoRequest<RoundSubmission[]>(`${RECRUIT}/candidates/${encodeURIComponent(id)}/submissions`),
  manageActivityCredential: (candidateId: string, inviteId: string, activityId: string, action: "reissue" | "revoke") =>
    demoRequest<ActivityCredential>(`${RECRUIT}/candidates/${encodeURIComponent(candidateId)}/invites/${encodeURIComponent(inviteId)}/activities/${encodeURIComponent(activityId)}/${action}`, { method: "POST" }),
  exportQuestionnaire: async (id: string) => {
    const response = await demoFetch(`${RECRUIT}/rounds/${id}/csv`, { headers: { "X-CampusFlow-Demo": "1" }, cache: "no-store" });
    if (!response.ok) throw new Error("暂时无法导出问卷结果。");
    return response.blob();
  },
  listCandidates: () => demoRequest<RosterCandidate[]>(`${RECRUIT}/candidates`),
  createCandidate: (input: CandidateInput) =>
    demoRequest<RosterCandidate>(`${RECRUIT}/candidates`, { method: "POST", body: input }),
  updateCandidate: (id: string, input: CandidateInput) =>
    demoRequest<RosterCandidate>(`${RECRUIT}/candidates/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
    }),
  importCandidates: (csv: string, commit: boolean) =>
    demoRequest<CandidateImportResult>(`${RECRUIT}/candidates/import`, {
      method: "POST",
      body: { csv, commit },
    }),
  issueInvite: (candidateId: string, document: DesignDocument, expiresAt: string, roundId?: string, organizationName?: string) =>
    demoRequest<{ id: string; token: string; rsvpUrl: string }>(
      `${RECRUIT}/candidates/${encodeURIComponent(candidateId)}/invite`,
      { method: "POST", body: { document, expiresAt, roundId, organizationName } },
    ),
  inviteLink: (id: string) =>
    demoRequest<{ rsvpUrl: string }>(`/api/local-demo/interview-invites/${id}/link`),
  rotateInvite: (id: string) =>
    demoRequest<{ id: string; token: string }>(
      `/api/local-demo/interview-invites/${encodeURIComponent(id)}/rotate`,
      { method: "POST", body: {} },
    ),
  revokeInvite: (id: string) =>
    demoRequest<{ revoked: boolean }>(
      `/api/local-demo/interview-invites/${encodeURIComponent(id)}/revoke`,
      { method: "POST", body: {} },
    ),
  listAccounts: () => demoRequest<EmailAccount[]>(`${MAIL}/accounts`),
  listSmtpAccounts: () => demoRequest<SmtpAccount[]>(`${MAIL}/smtp-accounts`),
  createSmtpAccount: (input: SmtpAccountInput) =>
    demoRequest<SmtpAccount>(`${MAIL}/smtp-accounts`, { method: "POST", body: input }),
  updateSmtpAccount: (id: string, input: SmtpAccountInput) =>
    demoRequest<SmtpAccount>(`${MAIL}/smtp-accounts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
    }),
  disableSmtpAccount: (id: string) =>
    demoRequest<SmtpAccount>(`${MAIL}/smtp-accounts/${encodeURIComponent(id)}/disable`, {
      method: "POST",
      body: {},
    }),
  testSmtpAccount: (id: string, input: SmtpTestRequest) =>
    demoRequest<SmtpTestResult>(`${MAIL}/smtp-accounts/${encodeURIComponent(id)}/test`, {
      method: "POST",
      body: input,
    }),
  testSmtpConnection: (id: string) =>
    demoRequest<SmtpConnectionResult>(`${MAIL}/smtp-accounts/${encodeURIComponent(id)}/test-connection`, {
      method: "POST",
      body: {},
    }),
  getSmtpTestMode: () =>
    demoRequest<{ mode: SmtpTestResult["mode"]; recipientConfigured: boolean }>(
      `${MAIL}/smtp-test-mode`,
    ),
  listSmtpInbox: () => demoRequest<SmtpTestInboxItem[]>(`${MAIL}/smtp-test-inbox`),
  preview: (input: MailPreviewRequest) =>
    demoRequest<MailPreviewResult>(`${MAIL}/preview`, { method: "POST", body: input }),
  send: (input: MailSendRequest) =>
    demoRequest<MailBatchDetail>(`${MAIL}/batches`, { method: "POST", body: input }),
  listBatches: () => demoRequest<EmailBatch[]>(`${MAIL}/batches`),
  getBatch: (id: string) =>
    demoRequest<MailBatchDetail>(`${MAIL}/batches/${encodeURIComponent(id)}`),
  retry: (id: string) =>
    demoRequest<MailBatchDetail>(`${MAIL}/batches/${encodeURIComponent(id)}/retry`, {
      method: "POST",
      body: {},
    }),
  cancel: (id: string) =>
    demoRequest<MailBatchDetail>(`${MAIL}/batches/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: {},
    }),
};
