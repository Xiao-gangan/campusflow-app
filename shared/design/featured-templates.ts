import { OFFER_EMAIL_TEMPLATE_ID, OFFER_INVITE_TEMPLATE_ID, OFFER_ROUND_ID } from "../contracts/interview-rounds.ts";
import type { DesignBlockType, DesignDocument, DesignTarget, DesignTheme } from "../contracts/design.ts";
import type { SavedDesignTemplate } from "../contracts/open-api.ts";
import { defaultTheme } from "./modules.ts";
import { sanitizeEmailHtml } from "../email/free-html.ts";
import { autumn, pine, gold, illustratedInvitation, offerInvitation, editorialMail } from "./featured-template-art.ts";

function htmlDocument(
  target: DesignTarget, html: string, subjectTemplate: string, preheaderText: string, colors: Partial<DesignTheme> = {},
): DesignDocument {
  return { schemaVersion: 1, target, mode: "html", theme: { ...defaultTheme(target), ...colors },
    meta: { subjectTemplate, preheaderText }, blocks: [], customHtml: { html: sanitizeEmailHtml(html, { target }).html, source: "starter" } };
}

function blocksDocument(
  target: DesignTarget, subjectTemplate: string, blocks: { type: DesignBlockType; props: Record<string, unknown> }[],
): DesignDocument {
  return {
    schemaVersion: 1, target, mode: "blocks", meta: { subjectTemplate, preheaderText: "{{organization_name}} · {{department}}" },
    theme: target === "email" ? {
      ...defaultTheme(target), backgroundColor: "#e7eee7", surfaceColor: "#fffdf8",
      textColor: "#23332b", mutedTextColor: "#4d6457", buttonColor: "#235342",
      primaryColor: "#235342", accentColor: "#e7f0e5", borderColor: "#d5ded3", radius: 16, spacing: 14,
    } : {
      ...defaultTheme(target), backgroundColor: "#e5eee6", surfaceColor: "#fffdf7", textColor: "#1e392e",
      mutedTextColor: "#496051", primaryColor: "#245641", buttonColor: "#245641", accentColor: "#dcead9", borderColor: "#d5ded3",
      radius: 22, spacing: 19,
    },
    blocks: blocks.map(({ type, props }, index) => ({ id: `${type}-${index + 1}`, type, props })),
  };
}

const simpleEmail = blocksDocument("email", "{{organization_name}}｜{{department}} 招新通知", [
  { type: "text", props: { text: "{{organization_name}} · RECRUITMENT", variant: "style:note", align: "left" } },
  { type: "heading", props: { text: "招新面试通知", level: 1, align: "left" } },
  { type: "text", props: { text: "{{candidate_name}} 同学，你好！我们邀请你参加 {{department}} 的招新面试。请查收时间地点，并回复是否出席。", align: "left" } },
  { type: "info_card", props: { title: "面试安排", body: "日期：{{interview_date}}\n时间：{{start_time}} – {{end_time}}\n地点：{{location}}", variant: "style:soft" } },
  { type: "button", props: { text: "打开邀请函", url: "{{rsvp_link}}", align: "left", variant: "style:solid" } },
  { type: "footer", props: { text: "{{organization_name}} 招新组", align: "left" } },
]);

const campusInvite = blocksDocument("invite_page", "面试邀请函 · {{organization_name}}", [
  { type: "hero", props: { eyebrow: "{{organization_name}} · {{department}}", title: "{{candidate_name}}，约个时间见面",
    subtitle: "感谢你关注我们的招新。期待和你聊聊想做的事，也聊聊团队能为你提供什么。", align: "center", variant: "style:lead" } },
  { type: "event_info", props: { title: "面试安排", date: "{{interview_date}}", time: "{{start_time}} – {{end_time}}", location: "{{location}}",
    note: "请提前到达，给自己留一点找到场地和准备的时间。" } },
  { type: "info_card", props: { title: "带着一段经历来", body: "挑一个你愿意分享的项目、作品或校园活动。我们也欢迎你带着想了解的问题来。", variant: "style:soft" } },
  { type: "rsvp", props: { title: "确认出席", description: "请在下方选择是否参加，并查看本轮需要完成的环节。",
    confirmLabel: "确认参加", rescheduleLabel: "婉拒邀请", secondaryAction: "decline" } },
  { type: "footer", props: { text: "{{organization_name}} · 招新组", align: "center" } },
]);

const IDS = {
  paperEmail: "87643db4-1a0b-4406-a50b-7fcb3bc732f8",
  pineEmail: "3741df42-500c-48a6-b08e-3b5abbf0e578",
  simpleEmail: "d1371b80-c7d6-49d6-8d3c-06439e7a413c",
  paperInvite: "5c59cda4-0ab9-4514-9131-3d5ebb10f240",
  pineInvite: "b426b6aa-bef8-4d1b-8711-6391d25734dc",
  campusInvite: "e85162b5-ca86-4e08-8d14-2cfa8a13765e",
} as const;

export const presetRoundTemplates = [
  { roundId: "round-1", emailId: IDS.paperEmail, inviteId: IDS.paperInvite },
  { roundId: "round-2", emailId: IDS.pineEmail, inviteId: IDS.pineInvite },
];


function inviteTheme(colors: typeof gold): Partial<DesignTheme> {
  return { backgroundColor: colors.surround, surfaceColor: colors.paper, textColor: colors.ink,
    primaryColor: colors.accent, buttonColor: colors.accent, mutedTextColor: colors.metal, borderColor: colors.line };
}

export const offerRoundTemplates = [{ roundId: OFFER_ROUND_ID, emailId: OFFER_EMAIL_TEMPLATE_ID, inviteId: OFFER_INVITE_TEMPLATE_ID }];

export type FeaturedPreset = Pick<SavedDesignTemplate, "id" | "name" | "document">;

export function featuredInterviewPresets(): FeaturedPreset[] {
  return [
    { id: IDS.paperEmail, name: "朱红信笺 · 初面邀请邮件",
      document: htmlDocument("email", editorialMail("first"), "{{organization_name}}｜{{candidate_name}} 的初面邀请", "初面安排与出席确认") },
    { id: IDS.pineEmail, name: "深松绿编辑风 · 二面复试邀请",
      document: htmlDocument("email", editorialMail("second"), "{{organization_name}}｜{{candidate_name}} 的二面复试邀请", "复试安排与准备提示") },
    { id: IDS.simpleEmail, name: "极简通栏 · 快捷招新通知", document: simpleEmail },
    { id: IDS.paperInvite, name: "秋日红信 · 初面邀请函",
      document: htmlDocument("invite_page", illustratedInvitation(autumn), "初面邀请函 · {{organization_name}}", "初面见面安排", inviteTheme(autumn)) },
    { id: IDS.pineInvite, name: "松绿火漆 · 二面深度交流邀请函",
      document: htmlDocument("invite_page", illustratedInvitation(pine), "二面深度交流 · {{organization_name}}", "二面作品交流邀请", inviteTheme(pine)) },
    { id: IDS.campusInvite, name: "清朗校园 · 积木邀请函", document: campusInvite },
  ];
}

export function featuredOfferPresets(): FeaturedPreset[] {
  return [
    { id: OFFER_EMAIL_TEMPLATE_ID, name: "暖金喜报 · 录取通知邮件",
      document: htmlDocument("email", editorialMail("offer"), "{{organization_name}}｜{{candidate_name}} 的录取通知", "请查收专属录取函并确认意向") },
    { id: OFFER_INVITE_TEMPLATE_ID, name: "金笺喜报 · 正式录取函",
      document: htmlDocument("invite_page", offerInvitation, "{{organization_name}}｜正式录取函", "感谢你的投入，欢迎加入", inviteTheme(gold)) },
  ];
}

// Canonical content signatures of the eight shipped templates before the visual refresh.
export const legacyTemplateDigests: Readonly<Record<string, string>> = {
  [IDS.paperEmail]: "82f22dc053fe1898f154f85eef6e3d8aa18d69289f4037c66d88006d8001728c",
  [IDS.pineEmail]: "584b8b6a850b090f77c4f2cd1623e1b5c9da6e45f4dccebc7ddc7e425e618165",
  [IDS.simpleEmail]: "68f606b6084a624b28f7bf02be9816dedf3d7b86dcc547edbe7629850ed41f79",
  [IDS.paperInvite]: "7c17b0854550236eee0e2ebaf2bc1303986730fbddd7ee24b3c92f7c9e9ba590",
  [IDS.pineInvite]: "ac5f0f10191b227139756389ed33c330a6a279cb5601bcafe28ec10485f32a34",
  [IDS.campusInvite]: "8265e4e688d8b3ae12687e6b332c0eedea5b870e402b613585ffc049683f0673",
  [OFFER_EMAIL_TEMPLATE_ID]: "3a1481dc832eb7feef7e805092333748508fe5b474c1355b6b20ff04ce0f4f8f",
  [OFFER_INVITE_TEMPLATE_ID]: "127e3c66833487d22c1b0347d401aeccd6ed0aea03dfbd3f48f4ec61fb60c196",
};

export function templateContent({ name, document }: Pick<FeaturedPreset, "name" | "document">): string {
  return JSON.stringify({ name, document }, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]))
      : value);
}

export function canUpgradeLegacy(template: SavedDesignTemplate) {
  return template.origin === "manual" && template.createdAt === template.updatedAt && Object.hasOwn(legacyTemplateDigests, template.id);
}

export type FeaturedPresetUpdate = { added: number; updated: number };

export function planFeaturedPresetUpdate(
  existing: SavedDesignTemplate[], presets: FeaturedPreset[], matchesLegacy: (template: SavedDesignTemplate) => boolean,
  { allowAdd, timestamp, makeId }: { allowAdd: boolean; timestamp: string; makeId: () => string },
) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  const contents = new Set(allowAdd ? existing.map(templateContent) : []);
  const writes: SavedDesignTemplate[] = [];
  const summary: FeaturedPresetUpdate = { added: 0, updated: 0 };
  for (const preset of presets) {
    const original = byId.get(preset.id);
    const replacing = original && canUpgradeLegacy(original) && matchesLegacy(original);
    if (!replacing && (!allowAdd || contents.has(templateContent(preset)))) continue;
    writes.push({
      ...preset, id: original && !replacing ? makeId() : preset.id, target: preset.document.target, schemaVersion: 1, origin: "manual",
      createdAt: replacing ? original.createdAt : timestamp, updatedAt: timestamp,
    });
    if (replacing) summary.updated += 1;
    else summary.added += 1;
  }
  return { writes, summary };
}
