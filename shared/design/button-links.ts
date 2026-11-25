export type ButtonLinkPurpose = "interview" | "onboarding" | "custom";

export type ButtonLinkStatus = "available" | "planned" | "unavailable";

export type ButtonLinkAction = {
  id: ButtonLinkPurpose;
  label: string;
  description: string;
  token: string | null;
  status: ButtonLinkStatus;
};

export const BUTTON_LINK_ACTIONS: ButtonLinkAction[] = [
  {
    id: "interview",
    label: "打开专属邀请函（确认面试）",
    description: "点击后跳转到该候选人的专属邀请函网页完成出席确认，邮箱内不会直接提交状态。",
    token: "rsvp_link",
    status: "planned",
  },
  {
    id: "onboarding",
    label: "填写入组信息",
    description: "发送时系统会生成专属入组链接。",
    token: "onboarding_link",
    status: "unavailable",
  },
  {
    id: "custom",
    label: "打开其他网页",
    description: "使用固定网址，不包含候选人个人信息。",
    token: null,
    status: "available",
  },
];

export function buttonLinkActionById(
  id: ButtonLinkPurpose,
): ButtonLinkAction {
  return BUTTON_LINK_ACTIONS.find((action) => action.id === id) ?? BUTTON_LINK_ACTIONS[2];
}

export function buttonLinkPurpose(value: string): ButtonLinkPurpose {
  const normalized = value.trim();
  if (normalized === "{{rsvp_link}}") return "interview";
  if (normalized === "{{onboarding_link}}") return "onboarding";
  return "custom";
}

export function buttonLinkValue(purpose: ButtonLinkPurpose): string {
  if (purpose === "custom") return "";
  return `{{${buttonLinkActionById(purpose).token}}}`;
}

export function buttonLinkNeedsUrl(purpose: ButtonLinkPurpose): boolean {
  return purpose === "custom";
}

export const PREVIEW_LINK_NOTE =
  "预览使用示例链接，按钮不会真正打开页面或提交状态；正式发送时会生成每位候选人的专属链接。";
