import type { DesignTarget } from "../contracts/design.ts";
import { variablesForTarget } from "./variables.ts";

export type PersonalizationCategory =
  | "姓名与部门"
  | "面试安排"
  | "组织信息"
  | "专属链接";

export type PersonalizationField = {
  key: string;
  label: string;
  sample: string;
  category: PersonalizationCategory;
  isLink: boolean;
};

export const PERSONALIZATION_CATEGORY_ORDER: PersonalizationCategory[] = [
  "姓名与部门",
  "面试安排",
  "组织信息",
  "专属链接",
];

const CATEGORY_BY_KEY: Record<string, PersonalizationCategory> = {
  candidate_name: "姓名与部门",
  candidate_email: "姓名与部门",
  department: "姓名与部门",
  interview_time: "面试安排",
  interview_location: "面试安排",
  organization_name: "组织信息",
  personal_note: "组织信息",
  rsvp_link: "专属链接",
  onboarding_link: "专属链接",
};

const LABEL_BY_KEY: Record<
  string,
  { default: string; email?: string; invite_page?: string }
> = {
  candidate_name: {
    default: "姓名",
    email: "收件人姓名",
    invite_page: "受邀人姓名",
  },
  candidate_email: {
    default: "邮箱",
    email: "收件人邮箱",
    invite_page: "受邀人邮箱",
  },
  department: { default: "意向部门" },
  interview_time: { default: "面试时间" },
  interview_location: { default: "面试地点" },
  organization_name: { default: "组织名称" },
  personal_note: { default: "个性化备注" },
  rsvp_link: { default: "出席确认链接" },
  onboarding_link: { default: "入组注册链接" },
};

const LINK_KEYS = new Set(["rsvp_link", "onboarding_link"]);

export function personalizationLabel(
  key: string,
  target: DesignTarget,
): string | undefined {
  const labels = LABEL_BY_KEY[key];
  if (!labels) return undefined;
  return labels[target] ?? labels.default;
}

export function personalizationDefaultLabel(key: string): string | undefined {
  return LABEL_BY_KEY[key]?.default;
}

export function personalizationGroups(
  target: DesignTarget,
): { category: PersonalizationCategory; fields: PersonalizationField[] }[] {
  const variables = new Map(
    variablesForTarget(target).map((variable) => [variable.key, variable]),
  );

  return PERSONALIZATION_CATEGORY_ORDER.map((category) => ({
    category,
    fields: [...variables.values()]
      .filter((variable) => CATEGORY_BY_KEY[variable.key] === category)
      .map((variable) => ({
        key: variable.key,
        label: personalizationLabel(variable.key, target) ?? variable.label,
        sample: variable.sample,
        category,
        isLink: LINK_KEYS.has(variable.key),
      })),
  })).filter((group) => group.fields.length > 0);
}

export function personalizationLinkFields(
  target: DesignTarget,
): PersonalizationField[] {
  return personalizationGroups(target)
    .flatMap((group) => group.fields)
    .filter((field) => field.isLink);
}
