import type { MailDeliveryView, MailInviteLink } from "../contracts/recruitment-console.ts";
import { csvCell } from "./round-config.ts";

export type ForwardableDelivery = MailDeliveryView & { invite: MailInviteLink & { status: "valid" } };

export function canForwardInvite(delivery: MailDeliveryView): delivery is ForwardableDelivery {
  return !!delivery.rsvpUrl && delivery.invite?.status === "valid";
}

export function inviteDeadline(value: string) {
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(time) + "（北京时间）";
}

export function forwardingMessage({ candidateName, invite, rsvpUrl }: ForwardableDelivery) {
  const { roundName, expiresAt, interviewDate, startTime, endTime, location } = invite;
  return [
    `${candidateName} 同学，你好！邀请你参加「${roundName}」面试。`,
    `面试时间：${interviewDate} ${startTime}${endTime ? "–" + endTime : ""}`,
    `面试地点：${location || "待通知"}`,
    `专属答复链接：${rsvpUrl}`,
    `请在 ${inviteDeadline(expiresAt)} 前答复。`,
  ].join("\n");
}

export function forwardingExport(deliveries: MailDeliveryView[], format: "txt" | "csv"): string {
  const valid = deliveries.filter(canForwardInvite);
  if (format === "txt") return valid.map(forwardingMessage).join("\n\n");
  const rows = [
    ["姓名", "邮箱", "轮次", "面试日期", "开始时间", "结束时间", "地点", "答复截止（北京时间）", "专属链接"],
    ...valid.map(({ candidateName, toEmail, invite, rsvpUrl }) => [
      candidateName, toEmail, invite.roundName, invite.interviewDate,
      invite.startTime, invite.endTime, invite.location, inviteDeadline(invite.expiresAt), rsvpUrl,
    ]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
