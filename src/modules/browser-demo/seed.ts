import { FIRST_ROUND_ID, OFFER_ROUND_ID, type FormAnswers } from "../../../shared/contracts/interview-rounds.ts";
import { offerRoundTemplates, presetRoundTemplates, savedOfferPresets, savedTemplatePresets } from "../../../dev/open-api/template-presets.ts";
import type { AgentStore } from "../../../dev/open-api/store-core.ts";
import { sendMail } from "../../../dev/recruitment/api.ts";
import { ensureDemoAccounts } from "../../../dev/recruitment/mail.ts";
import type { createSmtpAccountStore } from "../../../dev/recruitment/smtp-store-core.ts";
import type { MailTools } from "../../../dev/rsvp/handler.ts";
import type { createRsvpStore } from "../../../dev/rsvp/store-core.ts";
import { formPreset, mbtiPreset } from "../../../shared/recruitment/round-config.ts";
import { activityExample } from "../recruitment/activity-example.ts";

export async function seedBrowserWorkspace(
  store: ReturnType<typeof createRsvpStore>,
  library: AgentStore,
  mail: MailTools,
  smtp: ReturnType<typeof createSmtpAccountStore>,
  origin: string,
  clock: () => Date,
) {
  library.initializeTemplatePresets(savedTemplatePresets, presetRoundTemplates);
  library.initializeTemplatePresets(savedOfferPresets, offerRoundTemplates, { initialization: "saved-template-offer-v1", onlyIfEmpty: false });
  const first = store.rounds.requireRound(FIRST_ROUND_ID);
  let questionIndex = 0;
  const questions = formPreset("complete", () => `campus-question-${++questionIndex}`);
  const personality = mbtiPreset("full");
  const activityId = "campus-teamwork";
  const { name, description, kind, defaultEmailTemplateId, defaultInviteTemplateId } = first;
  store.rounds.update(first.id, {
    name, description, kind, defaultEmailTemplateId, defaultInviteTemplateId,
    formConfig: { enabled: true, questions },
    mbtiConfig: { enabled: true, questions: personality },
    customActivities: [{ id: activityId, kind: "sandbox_widget", title: "校园协作情景快答",
      description: "三道团队协作情景题", html: activityExample, height: 360, enabled: true, required: false }],
  });
  const date = new Date(clock().getTime() + 3 * 86400000).toISOString().slice(0, 10);
  const candidates = [
    ["林知夏", "技术部", FIRST_ROUND_ID], ["陈嘉禾", "设计部", FIRST_ROUND_ID],
    ["顾知遥", "运营部", FIRST_ROUND_ID], ["许闻舟", "宣传部", FIRST_ROUND_ID],
    ["程可欣", "设计部", "round-2"], ["沈予安", "外联部", "round-2"],
    ["周明澄", "组织部", OFFER_ROUND_ID],
  ].map(([name, department, round], index) => {
    const person = store.createCandidate({
      name, department, email: `student${index + 1}@example.test`, stage: "interview",
      interviewDate: date, startTime: "14:00", endTime: "14:30", location: "活动中心 · 203 室",
    });
    if (round !== FIRST_ROUND_ID) store.rounds.promote([person.id], round, { mode: "keep" });
    return { ...person, roundId: round };
  });
  const [account] = await ensureDemoAccounts(mail.service);
  smtp.create({ provider: "qq", label: "评委演示邮箱", fromName: "晴野校园共创社 招新组",
    fromEmail: "team@example.test", credential: "demo", isDefault: true });
  const deadline = new Date(clock().getTime() + 14 * 86400000).toISOString();
  for (const index of [0, 1, 4, 6]) {
    const candidate = candidates[index];
    const round = store.rounds.requireRound(candidate.roundId);
    await sendMail(store, mail.repository, mail.service, {
      candidateIds: [candidate.id], roundId: round.id, accountId: account.id, idempotencyKey: "seed-candidate-" + index,
      batchName: round.name + " · 示例面试邀请",
      emailDocument: library.requireTemplate(round.defaultEmailTemplateId!).document,
      inviteDocument: library.requireTemplate(round.defaultInviteTemplateId!).document,
      expiresAt: deadline, organizationName: "晴野校园共创社",
    }, origin, true);
    const invitation = store.latestInvite(candidate.id, round.id);
    if (!invitation) throw new Error("示例邀请初始化失败。");
    const token = store.reopenLink(invitation.id);
    await store.respond(token, index === 1 ? "not_attending" : "attending", invitation.version);
    store.rounds.saveReview(candidate.id, round.id, { rating: index === 1 ? 3 : 5,
      decision: index === 1 ? "hold" : "pass", notes: "能够举出具体例子，主动核对分工和交付节点。", reviewerName: "示例面试官" });
    if (index !== 0) continue;
    const responses = [
      "大二 · 信息管理", "校园实践方向", "student1@example.test",
      "喜欢把复杂流程做成简单工具，最近在学习交互设计。",
      "组织过院系迎新，负责志愿者排班和现场签到。",
      "和同学做过校园物品共享小程序，负责表单验证与体验测试。",
      "校内创意市集志愿组组长", "班级学习委员", "前端开发、信息图排版与现场协调。",
      "羽毛球、阅读和做手账。", "希望做一套新成员入门指引，让交接更容易。",
      "技术部", "可以拆分需求、开发原型并记录每一轮测试反馈。",
      "先整理常见问题，提供可重复使用的活动签到模板。",
      "平时每周 5 小时，周末可机动，考试周提前报备。",
      questions[15].options[4], "用 AI 整理开放日回访，把改进意见按场景分类，最后逐条人工核对。",
      "可以参与面试当天的设备准备。",
    ];
    const answers: FormAnswers = Object.fromEntries(questions.map(({ id }, i) => [id, responses[i]]));
    await store.saveActivity(token, "form", { mode: "submit", revision: 0, answers });
    await store.saveActivity(token, "mbti", { mode: "submit", revision: 0,
      answers: Object.fromEntries(personality.map(({ id }, i) => [id, (i % 5) - 2])) });
    await store.saveSandboxActivity(token, activityId, {
      status: "completed", summary: "能在时间紧张时协调分工和核对重要信息。", score: 100, maxScore: 100,
      badge: { label: "协作清晰", tone: "success" }, tags: ["主动沟通", "如期交付"],
      metrics: [{ label: "分工", value: 100, max: 100 }, { label: "反馈", value: 100, max: 100 }],
      qa: [{ question: "分工有分歧时怎样处理？", answer: "先对齐目标，再明确负责人与时间。" }],
      payload: { answered: 3 },
    });
  }
}
