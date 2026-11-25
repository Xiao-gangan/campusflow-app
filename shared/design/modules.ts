import type {
  DesignModuleDefinition,
  DesignTarget,
  DesignTheme,
} from "../contracts/design.ts";
import { STYLE_RECIPES } from "./style-recipes.ts";

const ALL_TARGETS = ["email", "invite_page"] as const;
const INVITE_ONLY = ["invite_page"] as const;

const alignField = {
  key: "align",
  label: "对齐",
  type: "select" as const,
  options: [
    { label: "左对齐", value: "left" },
    { label: "居中", value: "center" },
    { label: "右对齐", value: "right" },
  ],
};

const styleField = {
  key: "variant",
  label: "样式",
  type: "select" as const,
  options: STYLE_RECIPES.map((recipe) => ({
    label: `${recipe.label} · ${recipe.hint}`,
    value: `style:${recipe.id}`,
  })),
  help: "20 种样式会自动适配邮件和邀请函。",
};

export const DESIGN_MODULES: DesignModuleDefinition[] = [
  {
    type: "heading",
    label: "标题",
    description: "突出主题或欢迎语。",
    category: "基础",
    targets: ALL_TARGETS,
    defaultProps: {
      text: "一封来自 CampusFlow 的邀请",
      level: 1,
      align: "left",
      variant: "style:plain",
    },
    fields: [
      {
        key: "text",
        label: "标题内容",
        type: "text",
        placeholder: "输入标题",
        rich: true,
      },
      {
        key: "level",
        label: "标题级别",
        type: "select",
        options: [
          { label: "一级标题", value: "1" },
          { label: "二级标题", value: "2" },
          { label: "三级标题", value: "3" },
        ],
      },
      styleField,
      alignField,
    ],
  },
  {
    type: "text",
    label: "正文",
    description: "添加一段说明或欢迎语。",
    category: "基础",
    targets: ALL_TARGETS,
    defaultProps: {
      text: "{{candidate_name}} 同学，你好！\n这是一封示例邀请，用于检查编辑器的排版与预览效果。",
      align: "left",
      variant: "style:plain",
    },
    fields: [
      {
        key: "text",
        label: "正文内容",
        type: "textarea",
        placeholder: "输入正文内容",
        rich: true,
      },
      styleField,
      alignField,
    ],
  },
  {
    type: "logo",
    label: "Logo",
    description: "展示组织 Logo 或品牌标识。",
    category: "内容",
    targets: ALL_TARGETS,
    defaultProps: {
      src: "",
      alt: "CampusFlow Logo",
      width: 200,
      align: "center",
      variant: "style:plain",
    },
    fields: [
      {
        key: "src",
        label: "图片地址",
        type: "url",
        placeholder: "https://...",
        help: "上传本机图片，或使用公网图片链接。",
      },
      { key: "alt", label: "替代文本", type: "text" },
      { key: "width", label: "宽度（px）", type: "number", min: 48, max: 600 },
      styleField,
      alignField,
    ],
  },
  {
    type: "image",
    label: "图片",
    description: "插入一张内容图片。",
    category: "内容",
    targets: ALL_TARGETS,
    defaultProps: {
      src: "",
      alt: "示例图片",
      width: 320,
      align: "center",
      variant: "style:plain",
    },
    fields: [
      {
        key: "src",
        label: "图片地址",
        type: "url",
        placeholder: "https://...",
      },
      { key: "alt", label: "替代文本", type: "text" },
      { key: "width", label: "宽度（px）", type: "number", min: 48, max: 720 },
      styleField,
      alignField,
    ],
  },
  {
    type: "info_card",
    label: "信息卡片",
    description: "展示时间、地点或注意事项。",
    category: "内容",
    targets: ALL_TARGETS,
    defaultProps: {
      title: "面试安排",
      body: "时间：11 月 15 日 14:00 - 14:30\n地点：信息楼 A302",
      variant: "style:plain",
    },
    fields: [
      { key: "title", label: "卡片标题", type: "text" },
      { key: "body", label: "卡片内容", type: "textarea", rich: true },
      styleField,
    ],
  },
  {
    type: "button",
    label: "按钮",
    description: "添加主要操作入口。",
    category: "行动",
    targets: ALL_TARGETS,
    defaultProps: {
      text: "打开邀请函并确认出席",
      url: "{{rsvp_link}}",
      align: "center",
      variant: "style:solid",
    },
    fields: [
      { key: "text", label: "按钮文字", type: "text" },
      { key: "url", label: "链接地址", type: "url", placeholder: "https://..." },
      styleField,
      alignField,
    ],
  },
  {
    type: "divider",
    label: "分隔线",
    description: "分隔不同内容模块。",
    category: "基础",
    targets: ALL_TARGETS,
    defaultProps: { spacing: 16, variant: "plain" },
    fields: [
      { key: "spacing", label: "上下间距", type: "number", min: 4, max: 80 },
      styleField,
    ],
  },
  {
    type: "footer",
    label: "页脚",
    description: "展示组织署名或说明。",
    category: "基础",
    targets: ALL_TARGETS,
    defaultProps: {
      text: "{{organization_name}} · 校园组织招新",
      align: "center",
      variant: "style:plain",
    },
    fields: [
      { key: "text", label: "页脚文字", type: "textarea", rich: true },
      styleField,
      alignField,
    ],
  },
  {
    type: "spacer",
    label: "留白",
    description: "增加模块之间的垂直空间。",
    category: "基础",
    targets: ALL_TARGETS,
    defaultProps: { height: 24, variant: "plain" },
    fields: [
      { key: "height", label: "高度（px）", type: "number", min: 4, max: 160 },
      styleField,
    ],
  },
  {
    type: "hero",
    label: "邀请函首屏",
    description: "邀请函网页的欢迎标题区。",
    category: "邀请函",
    targets: INVITE_ONLY,
    defaultProps: {
      eyebrow: "{{organization_name}} · 2026",
      title: "{{candidate_name}}，期待与你见面",
      subtitle:
        "诚挚邀请你参加{{department}}的面试。请查看下方安排，并告诉我们是否出席。",
      align: "center",
      variant: "style:plain",
    },
    fields: [
      { key: "eyebrow", label: "眉题", type: "text" },
      { key: "title", label: "主标题", type: "text", rich: true },
      { key: "subtitle", label: "副标题", type: "textarea", rich: true },
      styleField,
      alignField,
    ],
  },
  {
    type: "event_info",
    label: "活动信息",
    description: "邀请函网页中的时间、地点与说明。",
    category: "邀请函",
    targets: INVITE_ONLY,
    defaultProps: {
      title: "面试信息",
      date: "11 月 15 日",
      time: "14:00 - 14:30",
      location: "{{interview_location}}",
      note: "请提前 10 分钟到达，并携带学生证。",
      variant: "style:plain",
    },
    fields: [
      { key: "title", label: "区块标题", type: "text" },
      { key: "date", label: "日期", type: "text" },
      { key: "time", label: "时间", type: "text" },
      { key: "location", label: "地点", type: "text" },
      { key: "note", label: "补充说明", type: "textarea", rich: true },
      styleField,
    ],
  },
  {
    type: "rsvp",
    label: "出席确认",
    description: "邀请函网页中的出席确认展示模块。",
    category: "邀请函",
    targets: INVITE_ONLY,
    defaultProps: {
      title: "确认出席",
      description:
        "请在本周日 18:00 前告诉我们是否参加。如需调整时间，也可以直接申请。",
      confirmLabel: "确认参加",
      rescheduleLabel: "申请调整时间",
      variant: "style:plain",
    },
    fields: [
      { key: "title", label: "面板标题", type: "text" },
      { key: "description", label: "说明", type: "textarea", rich: true },
      { key: "confirmLabel", label: "确认按钮", type: "text" },
      { key: "rescheduleLabel", label: "改期按钮", type: "text" },
      styleField,
    ],
  },
];

export function modulesForTarget(
  target: DesignTarget,
): DesignModuleDefinition[] {
  return DESIGN_MODULES.filter((module) => module.targets.includes(target));
}

export function moduleDefinition(
  type: DesignModuleDefinition["type"],
): DesignModuleDefinition | undefined {
  return DESIGN_MODULES.find((module) => module.type === type);
}

export function defaultTheme(target: DesignTarget): DesignTheme {
  return {
    primaryColor: "#1d5343",
    accentColor: "#c7e6a3",
    backgroundColor: target === "email" ? "#f4f1ea" : "#12251d",
    surfaceColor: "#fffdf8",
    textColor: target === "email" ? "#182420" : "#f4f1ea",
    mutedTextColor: target === "email" ? "#6d756f" : "#b8c8bd",
    fontFamily:
      "'PingFang SC','Noto Sans SC','Microsoft YaHei',Arial,sans-serif",
    width: target === "email" ? 600 : 760,
    radius: target === "email" ? 16 : 28,
    spacing: 16,
    buttonColor: "#1d5343",
    buttonTextColor: "#fffdfa",
    borderColor: target === "email" ? "#ddd6c8" : "#2f4a3e",
  };
}
