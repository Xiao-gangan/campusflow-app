import { OFFER_EMAIL_TEMPLATE_ID, OFFER_INVITE_TEMPLATE_ID, type InterviewRound, type InterviewRoundKind } from "@/shared/contracts/interview-rounds";
import { responseLabels } from "@/shared/recruitment/round-presentation";
import type { ApplicantStatus } from "@/shared/contracts/domain";
import type {
  CandidateInput,
  RosterCandidate,
} from "@/shared/contracts/recruitment-console";
import { createDefaultDocument, updateBlockProps } from "@/shared/domain/design";
import { createInvitePresetDocument } from "@/shared/invite/presets";
import { browserDesignLibrary } from "../designer/local-library";

export const STAGE_LABELS: Record<ApplicantStatus, string> = {
  new: "新申请",
  screening: "筛选",
  interview: "面试",
  accepted: "已录用",
  rejected: "未通过",
};

export const STAGE_TONES: Record<ApplicantStatus, string> = {
  new: "border-sky-200/80 bg-sky-50/80 text-sky-800",
  screening: "border-amber-200/80 bg-amber-50/80 text-amber-800",
  interview: "border-violet-200/80 bg-violet-50/80 text-violet-800",
  accepted: "border-emerald-200/80 bg-emerald-50/80 text-emerald-800",
  rejected: "border-stone-200/80 bg-stone-50/80 text-stone-600",
};

export const DELIVERY_LABELS: Record<string, string> = {
  pending: "等待发送",
  sending: "发送中",
  simulated: "已模拟",
  sent: "已发送",
  failed: "投递失败",
  cancelled: "已取消",
  skipped: "已跳过",
};

export const BATCH_LABELS: Record<string, string> = {
  draft: "草稿",
  preflight: "预检",
  queued: "待发送",
  sending: "发送中",
  sent: "已模拟",
  partial_failed: "部分失败",
  failed: "失败",
  cancelled: "已取消",
};

export function tomorrowLocal() {
  const date = new Date(Date.now() + 86400000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function dateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
}

export function saveDemoTemplates() {
  const library = browserDesignLibrary();
  const base = createDefaultDocument("email");
  const info = base.blocks.find((block) => block.type === "info_card");
  const document = info
    ? updateBlockProps(base, info.id, {
        body: "时间：{{interview_time}}\n地点：{{interview_location}}",
      })
    : base;
  library.saveTemplate({
    name: "面试邀请邮件 · 本机演示",
    document,
  });
  library.saveTemplate({
    name: "候选人邀请函 · 本机演示",
    document: createInvitePresetDocument("formal"),
  });
  return library.listTemplates();
}

export function inviteLabel(candidate: RosterCandidate) {
  const invite = candidate.latestInvite;
  if (!invite) return { text: "未签发", tone: "text-muted-foreground" };
  if (invite.revokedAt || invite.status === "revoked")
    return { text: "已撤销", tone: "text-stone-500" };
  if (!invite.valid) return { text: "已过期", tone: "text-amber-700" };
  return { text: "邀请有效", tone: "text-emerald-700" };
}

export function rsvpLabel(candidate: RosterCandidate, kind?: InterviewRoundKind) {
  const status = candidate.latestInvite?.rsvpStatus ?? "pending";
  const text = responseLabels(kind).status[status];
  const tones = {
    pending: "text-muted-foreground",
    confirmed: "text-emerald-700 font-medium",
    cancelled: "text-rose-700 font-medium",
    reschedule_requested: "text-amber-700 font-medium",
  };
  return { text, tone: tones[status] };
}

export function defaultRoundTemplate<T extends { id: string }>(
  templates: T[], target: "email" | "invite_page", rounds: InterviewRound[], round?: InterviewRound,
) {
  const field = target === "email" ? "defaultEmailTemplateId" : "defaultInviteTemplateId";
  const configured = templates.find(({ id }) => id === round?.[field]);
  if (configured || round?.kind === "offer") return configured;
  const offerIds = rounds.filter(({ kind }) => kind === "offer").map((item) => item[field]);
  const builtIn = target === "email" ? OFFER_EMAIL_TEMPLATE_ID : OFFER_INVITE_TEMPLATE_ID;
  return templates.find(({ id }) => id !== builtIn && !offerIds.includes(id));
}

export function deliveryLabel(candidate: RosterCandidate) {
  const delivery = candidate.latestDelivery;
  if (!delivery) return { text: "未发送", tone: "text-muted-foreground" };
  return {
    text: DELIVERY_LABELS[delivery.status] ?? delivery.status,
    tone:
      delivery.status === "simulated" || delivery.status === "sent"
        ? "text-emerald-700"
        : delivery.status === "failed"
          ? "text-rose-700 font-medium"
          : "text-amber-700",
  };
}

export function emptyCandidateInput(): CandidateInput {
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  return {
    name: "",
    email: "",
    department: "",
    stage: "new",
    note: "",
    interviewDate: date,
    startTime: "14:00",
    endTime: "14:30",
    location: "信息楼 A302",
  };
}
