import {
  QUESTION_TYPES, type FormAnswers, type FormQuestion, type InterviewRoundInput, type MbtiAnswers,
  type MbtiConfig, type MbtiQuestion, type MbtiResult, type QuestionType,
} from "../contracts/interview-rounds.ts";
import { PERSONALITY_QUESTIONS, type PersonalityDimension } from "./personality-questions.ts";
import { parseCustomActivities } from "./custom-activities.ts";

export const DIMENSIONS: readonly PersonalityDimension[] = ["EI", "SN", "TF", "JP"];
const choiceTypes = new Set<QuestionType>(["single_choice", "multi_choice", "select"]);
export const isChoice = (type: QuestionType) => choiceTypes.has(type);

// Six questions per dimension, evenly keyed, with a comparable pair in each.
const quickQuestionIds = new Set([
  "q01", "q02", "q03", "q04", "q06", "q21",
  "q23", "q24", "q25", "q26", "q28", "q41",
  "q45", "q46", "q47", "q48", "q51", "q54",
  "q67", "q68", "q69", "q70", "q72", "q79",
]);

export function mbtiPreset(mode: "full" | "quick"): MbtiQuestion[] {
  const source = mode === "full" ? PERSONALITY_QUESTIONS : PERSONALITY_QUESTIONS.filter(({ id }) => quickQuestionIds.has(id));
  return source.map((question) => ({ ...question, enabled: true }));
}

export function blankRound(): InterviewRoundInput {
  return {
    name: "", description: "", defaultEmailTemplateId: null, defaultInviteTemplateId: null,
    formConfig: { enabled: false, questions: [] },
    mbtiConfig: { enabled: false, questions: mbtiPreset("full") },
    customActivities: [],
  };
}

export function blankQuestion(id: string, title = ""): FormQuestion {
  return { id, title, type: "text", description: "", placeholder: "", required: false, options: [] };
}

export function formPreset(mode: "general" | "portfolio" | "complete", makeId: () => string): FormQuestion[] {
  const question = (title: string, type: QuestionType, required = true) =>
    ({ ...blankQuestion(makeId(), title), type, required });
  if (mode === "complete") {
    const item = (title: string, description: string, type: QuestionType = "textarea", required = true, options: string[] = []) =>
      ({ ...question(title, type, required), description, options });
    return [
      item("年级与专业", "填写目前就读的年级及专业方向。", "text"),
      item("所在班级补充说明", "需要补充班级或培养方向时填写。", "text", false),
      item("联系方式", "填写方便招新工作人员联系你的方式。", "text"),
      item("自我介绍", "用几句话让我们认识你。"),
      item("校园经历 / 学生工作经历", "可以介绍社团、学生组织、志愿服务或其他校园经历。"),
      item("项目 / 活动经历", "举一个参与过的项目或活动，说明你负责的工作。"),
      item("曾任职务", "可以填写过往在班级、社团或其他团队中的职务。", "textarea", false),
      item("现任职务", "填写目前担任的职务。", "text", false),
      item("特长 / 技能", "可以介绍专业工具，也可以是沟通、组织或表达。"),
      item("兴趣爱好", "分享你愿意持续投入的兴趣。", "textarea", false),
      item("加入动机", "你对本组织了解多少，希望参与哪些工作？"),
      item("意向部门", "选择目前最想尝试的方向。", "select", true, ["技术部", "设计部", "运营部", "宣传部", "外联部", "组织部"]),
      item("部门匹配度", "结合意向部门，说说你能贡献什么，也可以写想学习的能力。"),
      item("任职计划 / 个人想法", "你希望承担什么工作，或解决什么问题？"),
      item("时间安排 / 可投入时间", "说明平时、周末和考试周的大致可投入时间。"),
      item("策划一次校园活动时，你会怎样使用 AI？", "选择最符合你当前理解的一项。", "select", true, [
        "查资料、问问题和起草文案", "拆解工作并一起修改方案", "根据资料产出方案、表格或宣传内容",
        "经授权调用工具并根据结果继续执行", "进一步设定权限、数据来源和人工确认节点",
      ]),
      item("最近一次用 AI 完成的复杂任务", "说明任务、分步骤的做法，以及你如何检查输出。没有类似经历可以写预想方案。"),
      item("补充说明", "填写你还想告诉我们的信息。", "textarea", false),
    ];
  }
  return mode === "general"
    ? [question("年级与专业", "text"), question("为什么想加入？", "textarea"), question("每周可以投入多少时间？", "text")]
    : [question("作品集链接", "url"), question("介绍一项你参与的作品", "textarea"),
      question("你最希望尝试的方向", "text"), question("当前对该方向的熟悉程度", "rating", false)];
}

function object(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || (keys && Object.keys(value).some((key) => !keys.includes(key)))) throw new Error("配置字段无效。");
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim()))
    throw new Error(label + "格式无效。");
  return value.trim();
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("请提供有效的开关状态。");
  return value;
}

function id(value: unknown): string {
  const result = string(value, "标识", 80, true);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u.test(result) || ["constructor", "prototype"].includes(result))
    throw new Error("标识格式无效。");
  return result;
}

function list<T>(value: unknown, max: number, convert: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("题目或选项数量超出限制。");
  return value.map(convert);
}

function unique<T>(items: T[]): T[] {
  if (new Set(items).size !== items.length) throw new Error("题目标识或选项不能重复。");
  return items;
}

export function parseRoundInput(raw: unknown): InterviewRoundInput {
  const body = object(raw, ["kind", "name", "description", "defaultEmailTemplateId", "defaultInviteTemplateId", "formConfig", "mbtiConfig", "customActivities"]);
  if (body.kind !== undefined && body.kind !== "offer" && body.kind !== "interview") throw new Error("轮次类型无效。");
  const form = object(body.formConfig, ["enabled", "questions"]);
  const mbti = object(body.mbtiConfig, ["enabled", "questions"]);
  const questions = list<FormQuestion>(form.questions, 40, (rawQuestion) => {
    const question = object(rawQuestion, ["id", "title", "type", "description", "placeholder", "required", "options"]);
    const type = QUESTION_TYPES.find((item) => item === question.type);
    if (!type) throw new Error("题型无效。");
    const options = unique(list(question.options, 24, (value) => string(value, "选项", 120, true)));
    if (isChoice(type) ? options.length < 2 : options.length !== 0) throw new Error("选择题至少需要两个选项。");
    return {
      id: id(question.id), title: string(question.title, "题目", 200, true), type,
      description: string(question.description, "题目说明", 400),
      placeholder: string(question.placeholder, "占位文字", 160), required: flag(question.required), options,
    };
  });
  unique(questions.map((question) => question.id));
  const formEnabled = flag(form.enabled);
  if (formEnabled && !questions.length) throw new Error("启用问卷前请至少添加一道题。");
  const bank: MbtiConfig = {
    enabled: flag(mbti.enabled),
    questions: list<MbtiQuestion>(mbti.questions, 160, (rawQuestion) => {
      const question = object(rawQuestion, ["id", "text", "dimension", "direction", "enabled", "consistencyGroup"]);
      const dimension = DIMENSIONS.find((item) => item === question.dimension);
      if (!dimension || (question.direction !== 1 && question.direction !== -1)) throw new Error("测评维度或计分方向无效。");
      const consistencyGroup = question.consistencyGroup === undefined ? undefined : id(question.consistencyGroup);
      return {
        id: id(question.id), text: string(question.text, "测评题干", 240, true),
        dimension, direction: question.direction, enabled: flag(question.enabled),
        ...(consistencyGroup ? { consistencyGroup } : {}),
      };
    }),
  };
  unique(bank.questions.map((question) => question.id));
  if (bank.enabled && DIMENSIONS.some((dimension) => !bank.questions.some((q) => q.enabled && q.dimension === dimension)))
    throw new Error("开启性格测评时，每个维度至少启用一道题。");
  return {
    ...(body.kind ? { kind: body.kind } : {}),
    name: string(body.name, "轮次名称", 60, true), description: string(body.description, "轮次说明", 1000),
    defaultEmailTemplateId: body.defaultEmailTemplateId === null ? null : id(body.defaultEmailTemplateId),
    defaultInviteTemplateId: body.defaultInviteTemplateId === null ? null : id(body.defaultInviteTemplateId),
    formConfig: { enabled: formEnabled, questions }, mbtiConfig: bank,
    ...(body.customActivities === undefined ? {} : { customActivities: parseCustomActivities(body.customActivities) }),
  };
}

export function validateForm(questions: FormQuestion[], raw: unknown, submitting: boolean): FormAnswers {
  const answers = object(raw, questions.map((question) => question.id));
  const result: FormAnswers = {};
  for (const question of questions) {
    const value = Object.hasOwn(answers, question.id) ? answers[question.id] : undefined;
    const empty = value === undefined || (typeof value === "string" && !value.trim()) || (question.type === "multi_choice" && Array.isArray(value) && !value.length);
    if (empty) {
      if (submitting && question.required) throw new Error("请填写「" + question.title + "」。");
      continue;
    }
    const fail = () => { throw new Error("请检查「" + question.title + "」的填写格式。"); };
    if (question.type === "multi_choice") {
      if (!Array.isArray(value) || new Set(value).size !== value.length || value.some((entry) => !question.options.includes(entry))) fail();
    } else if (question.type === "rating") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) fail();
    } else {
      if (typeof value !== "string" || value.length > (question.type === "textarea" ? 8000 : 1000)) { fail(); continue; }
      if (isChoice(question.type) && !question.options.includes(value)) fail();
      if (question.type === "url" && submitting) {
        try { if (!["http:", "https:"].includes(new URL(value.trim()).protocol)) fail(); }
        catch { fail(); }
      }
    }
    result[question.id] = value as FormAnswers[string];
  }
  return result;
}

export function validateMbti(questions: MbtiQuestion[], raw: unknown, submitting: boolean): MbtiAnswers {
  const answers = object(raw, questions.map((question) => question.id));
  const entries = Object.entries(answers);
  if (entries.some(([, value]) => typeof value !== "number" || !Number.isInteger(value) || value < -2 || value > 2))
    throw new Error("每道测评题请选择一个有效选项。");
  if (submitting && entries.length !== questions.length) throw new Error("请完成全部测评题目。");
  return answers as MbtiAnswers;
}

export function scoreMbti(questions: MbtiQuestion[], answers: MbtiAnswers): MbtiResult {
  const enabled = questions.filter((question) => question.enabled);
  const responses = validateMbti(enabled, answers, true);
  const groups = new Map<string, number[]>();
  let type = "";
  const dimensions = DIMENSIONS.map((dimension) => {
    const selected = enabled.filter((question) => question.dimension === dimension);
    if (!selected.length) throw new Error("测评缺少题目维度。");
    let score = 0;
    for (const question of selected) {
      const value = responses[question.id] * question.direction;
      score += value;
      if (question.consistencyGroup) {
        const key = dimension + ":" + question.consistencyGroup;
        const group = groups.get(key) ?? [];
        group.push(value);
        groups.set(key, group);
      }
    }
    const firstPercent = Math.round(50 + 25 * score / selected.length);
    const close = Math.abs(firstPercent - 50) <= 8;
    type += dimension[score >= 0 ? 0 : 1];
    return { dimension, score, count: selected.length, firstPercent, close };
  });
  const comparable = [...groups.values()].filter((group) => group.length > 1);
  const stability = comparable.length
    ? Math.round(comparable.reduce((total, group) => total + 100 - 25 * (Math.max(...group) - Math.min(...group)), 0) / comparable.length)
    : null;
  return { type, dimensions, stability, answeredCount: enabled.length };
}

export function csvCell(value: string): string {
  const safe = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/u.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
