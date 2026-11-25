import type { InterviewRoundKind, ReviewDecision, RoundSchedule } from "../contracts/interview-rounds.ts";

export const REVIEW_LABELS: Record<ReviewDecision, string> = {
  pass: "推荐通过",
  hold: "待定",
  reject: "暂不通过",
};

export function responseLabels(kind: InterviewRoundKind = "interview") {
  return kind === "offer" ? {
    title: "录取确认与答复",
    step: "录取确认",
    confirm: "确认接受录取",
    decline: "放弃本次录取",
    status: { pending: "待答复", confirmed: "已接受录取", cancelled: "已放弃录取", reschedule_requested: "待进一步联系" },
  } : {
    title: "出席确认与答复",
    step: "出席确认",
    confirm: "确认参加",
    decline: "婉拒邀请",
    status: { pending: "待答复", confirmed: "已确认参加", cancelled: "已婉拒", reschedule_requested: "已申请改期" },
  };
}

export function scheduleTime({ interviewDate, startTime, endTime }: RoundSchedule) {
  return [interviewDate, startTime && (endTime ? `${startTime}–${endTime}` : startTime)].filter(Boolean).join(" ");
}
