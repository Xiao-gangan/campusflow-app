import type {
  DesignBlockType,
  DesignDocument,
  DesignTheme,
} from "../contracts/design.ts";
import { moduleDefinition } from "../design/modules.ts";

export type InvitePresetId = "formal" | "playful";

export type InvitePresetBlockSpec = {
  type: DesignBlockType;
  props: Record<string, unknown>;
};

export type InvitePreset = {
  id: InvitePresetId;
  name: string;
  description: string;
  palette: string[];
  theme: DesignTheme;
  blocks: InvitePresetBlockSpec[];
};

const FORMAL_THEME: DesignTheme = {
  primaryColor: "#1d5343",
  accentColor: "#c7e6a3",
  backgroundColor: "#0f2018",
  surfaceColor: "#fffaf0",
  textColor: "#f6f1e6",
  mutedTextColor: "#b7c8bb",
  fontFamily:
    "'PingFang SC','Noto Sans SC','Microsoft YaHei',Arial,sans-serif",
  width: 760,
  radius: 28,
  spacing: 18,
};

const PLAYFUL_THEME: DesignTheme = {
  primaryColor: "#c75b3f",
  accentColor: "#f2c9a8",
  backgroundColor: "#fbf2e8",
  surfaceColor: "#fffaf4",
  textColor: "#2b211b",
  mutedTextColor: "#7a675d",
  fontFamily:
    "'PingFang SC','Noto Sans SC','Microsoft YaHei',Arial,sans-serif",
  width: 800,
  radius: 32,
  spacing: 18,
};

export const INVITE_PRESETS: InvitePreset[] = [
  {
    id: "formal",
    name: "正式简约",
    description: "深绿与暖白，适合正式面试邀请。",
    palette: ["#1d5343", "#c7e6a3", "#fffaf0", "#0f2018"],
    theme: FORMAL_THEME,
    blocks: [
      {
        type: "logo",
        props: {
          src: "",
          alt: "CampusFlow",
          width: 132,
          align: "center",
        },
      },
      {
        type: "hero",
        props: {
          eyebrow: "{{organization_name}} · 招新邀请",
          title: "{{candidate_name}}，期待与你见面",
          subtitle:
            "诚挚邀请你参加{{department}}的面试。请查看下方安排，并告诉我们是否出席。",
          align: "center",
        },
      },
      {
        type: "event_info",
        props: {
          title: "面试安排",
          date: "11 月 15 日",
          time: "14:00 - 14:30",
          location: "{{interview_location}}",
          note: "请提前 10 分钟到达，并携带学生证。",
        },
      },
      {
        type: "rsvp",
        props: {
          title: "确认出席",
          description:
            "请在本周日 18:00 前告诉我们是否参加。如需调整时间，也可以直接申请。",
          confirmLabel: "确认参加",
          rescheduleLabel: "申请调整时间",
        },
      },
      {
        type: "footer",
        props: {
          text: "{{organization_name}} · 校园组织招新",
          align: "center",
        },
      },
    ],
  },
  {
    id: "playful",
    name: "轻快现代",
    description: "暖色与圆角卡片，适合轻松的招新活动。",
    palette: ["#c75b3f", "#f2c9a8", "#fffaf4", "#fbf2e8"],
    theme: PLAYFUL_THEME,
    blocks: [
      {
        type: "logo",
        props: {
          src: "",
          alt: "CampusFlow",
          width: 132,
          align: "left",
        },
      },
      {
        type: "hero",
        props: {
          eyebrow: "HELLO · {{department}}",
          title: "{{candidate_name}}，来见面吧",
          subtitle: "这是一份轻松的面试邀请，时间地点都写在下面。",
          align: "left",
        },
      },
      {
        type: "event_info",
        props: {
          title: "面试小卡片",
          date: "11 月 15 日",
          time: "14:00 - 14:30",
          location: "{{interview_location}}",
          note: "提前 10 分钟到就好，带上学生证。",
        },
      },
      {
        type: "rsvp",
        props: {
          title: "方便来吗？",
          description:
            "在周日 18:00 前告诉我们一声。如果时间不合适，也可以申请调整。",
          confirmLabel: "我会来",
          rescheduleLabel: "换个时间",
        },
      },
      {
        type: "footer",
        props: {
          text: "{{organization_name}} · 期待见到你",
          align: "center",
        },
      },
    ],
  },
];

// These legacy examples advertise a fixed deadline and rescheduling; the live form supplies its own deadline and actions.
const sampleResponseInstructions = new Set([
  moduleDefinition("rsvp")?.defaultProps.description,
  ...INVITE_PRESETS.flatMap(preset => preset.blocks.filter(block => block.type === "rsvp").map(block => block.props.description)),
]);
export function isSampleResponseInstruction(text: string): boolean {
  return sampleResponseInstructions.has(text);
}

export function invitePresetById(
  id: InvitePresetId,
): InvitePreset | undefined {
  return INVITE_PRESETS.find((preset) => preset.id === id);
}

export function createInvitePresetDocument(
  id: InvitePresetId,
): DesignDocument {
  const preset = invitePresetById(id);
  if (!preset) throw new Error("invite_preset_not_found");

  return {
    schemaVersion: 1,
    target: "invite_page",
    meta: {},
    theme: structuredClone(preset.theme),
    blocks: preset.blocks.map((spec) => {
      const definition = moduleDefinition(spec.type);
      return {
        id: crypto.randomUUID(),
        type: spec.type,
        props: {
          ...structuredClone(definition?.defaultProps ?? {}),
          ...structuredClone(spec.props),
        },
      };
    }),
  };
}
