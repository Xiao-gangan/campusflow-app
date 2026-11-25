import type { DesignTarget } from "../contracts/design.ts";
import type { AiPlan, AiPlanBlock } from "./schema.ts";
import { AiProviderError, type AiProvider } from "./provider.ts";
import { starterFreeHtml } from "../email/free-html.ts";

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new AiProviderError("cancelled", "已取消生成。", 499, false));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AiProviderError("cancelled", "已取消生成。", 499, false));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

type Fixture = {
  themePreset: "crimson" | "apricot" | "mono";
  fontFamily: "sans" | "serif" | "mono";
  radius: number;
  spacing: number;
  subject: string;
  preheader: string;
  tone: string;
  blocks: { id: string; type: AiPlanBlock["type"]; purpose: string }[];
  heading: string;
  text: string;
  cardTitle: string;
  cardBody: string;
  button: string;
  buttonPurpose: "interview" | "custom";
  buttonUrl?: string;
  styles: Record<string, string>;
};

const FIXTURES: Fixture[] = [
  {
    themePreset: "crimson",
    fontFamily: "sans",
    radius: 18,
    spacing: 16,
    subject: "【{{organization_name}}】{{candidate_name}} 面试邀请",
    preheader: "{{interview_time}} · {{interview_location}}",
    tone: "正式、可信、信息清晰",
    blocks: [
      { id: "b1", type: "logo", purpose: "组织品牌" },
      { id: "b2", type: "heading", purpose: "面试邀请主标题" },
      { id: "b3", type: "text", purpose: "开场邀请正文" },
      { id: "b4", type: "info_card", purpose: "面试时间地点" },
      { id: "b5", type: "button", purpose: "确认是否参加面试" },
      { id: "b6", type: "footer", purpose: "组织署名" },
    ],
    heading: "诚邀 {{candidate_name}} 参加 {{department}} 面试",
    text: "你好，{{candidate_name}}。感谢你关注 {{organization_name}}。我们诚挚邀请你参加 {{department}} 的面试，具体安排如下。",
    cardTitle: "面试安排",
    cardBody: "时间：{{interview_time}}\n地点：{{interview_location}}",
    button: "打开邀请函并确认出席",
    buttonPurpose: "interview",
    styles: {
      logo: "style:plain",
      heading: "style:band",
      text: "style:sidebar",
      info_card: "style:accent",
      button: "style:solid",
      footer: "style:plain",
    },
  },
  {
    themePreset: "apricot",
    fontFamily: "sans",
    radius: 24,
    spacing: 20,
    subject: "{{candidate_name}}，{{department}} 校园活动等你来",
    preheader: "轻松一点，先来认识我们",
    tone: "轻快、热情、校园感",
    blocks: [
      { id: "b1", type: "logo", purpose: "校园组织品牌" },
      { id: "b2", type: "heading", purpose: "活动主标题" },
      { id: "b3", type: "text", purpose: "轻松开场" },
      { id: "b4", type: "divider", purpose: "节奏分隔" },
      { id: "b5", type: "info_card", purpose: "活动信息" },
      { id: "b6", type: "button", purpose: "确认参加" },
      { id: "b7", type: "footer", purpose: "署名" },
    ],
    heading: "{{candidate_name}}，来和我们见一面吧",
    text: "这次不用紧张，我们准备了一场轻松的 {{department}} 校园活动。带上好奇心来就好。",
    cardTitle: "活动信息",
    cardBody: "时间：{{interview_time}}\n地点：{{interview_location}}",
    button: "我会来",
    buttonPurpose: "interview",
    styles: {
      logo: "style:plain",
      heading: "style:underline",
      text: "style:lead",
      divider: "style:short",
      info_card: "style:tinted",
      button: "style:pill",
      footer: "style:note",
    },
  },
  {
    themePreset: "mono",
    fontFamily: "serif",
    radius: 6,
    spacing: 28,
    subject: "{{organization_name}} · 合作邀请",
    preheader: "{{interview_time}} · 期待与你进一步交流",
    tone: "克制、大量留白、信息层次清晰",
    blocks: [
      { id: "b1", type: "logo", purpose: "简洁品牌" },
      { id: "b2", type: "heading", purpose: "合作邀请标题" },
      { id: "b3", type: "divider", purpose: "留白分隔" },
      { id: "b4", type: "text", purpose: "合作说明" },
      { id: "b5", type: "info_card", purpose: "会面安排" },
      { id: "b6", type: "button", purpose: "打开合作说明" },
      { id: "b7", type: "footer", purpose: "署名" },
    ],
    heading: "与 {{organization_name}} 的一次合作邀请",
    text: "我们希望与 {{candidate_name}} 就 {{department}} 的合作进一步交流。这里是一份简洁的安排。",
    cardTitle: "会面安排",
    cardBody: "时间：{{interview_time}}\n地点：{{interview_location}}",
    button: "查看合作说明",
    buttonPurpose: "custom",
    buttonUrl: "https://example.test/partnership",
    styles: {
      logo: "style:plain",
      heading: "style:editorial",
      divider: "style:topline",
      text: "style:quote",
      info_card: "style:outline",
      button: "style:outline",
      footer: "style:note",
    },
  },
];

function pickFixture(prompt: string, style?: string): Fixture {
  const text = `${prompt} ${style ?? ""}`;
  if (/简约|高级|克制|合作|留白|mono|minimal/iu.test(text)) return FIXTURES[2];
  if (/校园|青春|活泼|活动|轻快|招新/iu.test(text)) return FIXTURES[1];
  return FIXTURES[0];
}

function blockFixture(fixture: Fixture, block: AiPlanBlock): Record<string, unknown> {
  const variant = fixture.styles[block.type] ?? "style:plain";
  switch (block.type) {
    case "hero":
      return { id: block.id, type: block.type, title: fixture.heading, eyebrow: "{{organization_name}}", subtitle: fixture.text, align: "center", variant };
    case "event_info":
      return { id: block.id, type: block.type, title: "面试安排", note: "{{personal_note}}", variant: "style:outline" };
    case "rsvp":
      return { id: block.id, type: block.type, title: "你的出席答复", description: "请选择确认参加或婉拒邀请。", variant: "style:tinted" };
    case "logo":
      return {
        id: block.id,
        type: block.type,
        alt: "{{organization_name}}",
        width: 200,
        align: "center",
        variant,
      };
    case "heading":
      return {
        id: block.id,
        type: block.type,
        text: fixture.heading,
        level: 1,
        align: fixture.themePreset === "mono" ? "left" : "center",
        variant,
      };
    case "text":
      return {
        id: block.id,
        type: block.type,
        text: fixture.text,
        align: "left",
        variant,
      };
    case "info_card":
      return {
        id: block.id,
        type: block.type,
        title: fixture.cardTitle,
        body: fixture.cardBody,
        variant,
      };
    case "button":
      return {
        id: block.id,
        type: block.type,
        text: fixture.button,
        purpose: fixture.buttonPurpose,
        ...(fixture.buttonUrl ? { url: fixture.buttonUrl } : {}),
        align: fixture.themePreset === "mono" ? "left" : "center",
        variant,
      };
    case "divider":
      return { id: block.id, type: block.type, spacing: 20, variant };
    case "footer":
      return {
        id: block.id,
        type: block.type,
        text: "{{organization_name}} · 校园组织",
        align: "center",
        variant,
      };
    case "spacer":
      return { id: block.id, type: block.type, height: 24, variant };
    default:
      return { id: block.id, type: block.type, variant };
  }
}

function preserveVariables(current: unknown, next: string): string {
  if (typeof current !== "string") return next;
  const keys = [...current.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/giu)].map(
    (match) => match[1],
  );
  for (const key of keys) {
    if (!next.includes(`{{${key}}}`)) next = `${next} {{${key}}}`;
  }
  return next;
}

function mockFreeEmailHtml(
  prompt: string,
  style?: string,
  currentHtml?: string,
  target: DesignTarget = "email",
) {
  const signal = `${prompt} ${style ?? ""}`.toLowerCase();
  const isForest = /绿|森|松|清新|校园|环保|forest|green/u.test(signal);
  const isOcean = !isForest && /蓝|科技|极客|技术|深海|藏青|ocean|blue|tech/u.test(signal);
  const isSerif = /衬线|书信|学术|复古|古典|典雅|serif/u.test(signal);

  const primary = isOcean ? "#1c3f60" : isForest ? "#1d4d3e" : "#8a3d3c";
  const accent = isOcean ? "#b6c7d6" : isForest ? "#b7cabf" : "#c7b8ae";
  const outerBg = isOcean ? "#edf1f5" : isForest ? "#eef2ef" : "#f1eeeb";
  const cardBg = isOcean ? "#fcfdff" : isForest ? "#fcfdfa" : "#fffdfa";
  const cardBorder = isOcean ? "#d8e1ea" : isForest ? "#d8e2dc" : "#e5dad3";
  const ink = isOcean ? "#162432" : isForest ? "#192621" : "#241b19";
  const muted = isOcean ? "#5b6d7e" : isForest ? "#5c6d66" : "#6e625e";

  const starter = starterFreeHtml(target);
  const base = currentHtml?.trim()
    ? currentHtml
        .replaceAll("#8a3d3c", primary)
        .replaceAll("#1d4d3e", primary)
        .replaceAll("#1c3f60", primary)
        .replaceAll("#f1eeeb", outerBg)
        .replaceAll("#eef2ef", outerBg)
        .replaceAll("#edf1f5", outerBg)
    : starter
        .replaceAll("#8a3d3c", primary)
        .replaceAll("#c7b8ae", accent)
        .replaceAll("#f1eeeb", outerBg)
        .replaceAll("#fffdfa", cardBg)
        .replaceAll("#e5dad3", cardBorder)
        .replaceAll("#241b19", ink)
        .replaceAll("#302321", ink)
        .replaceAll("#6e625e", muted);

  const html = isSerif
    ? base.replaceAll(
        "'PingFang SC','Noto Sans SC',Arial,sans-serif",
        "'Songti SC','Noto Serif SC',Georgia,serif",
      )
    : base;

  const paletteLabel = isOcean
    ? "深藏青科技编辑风"
    : isForest
      ? "深松绿温润信笺风"
      : "经典砖红信笺风";
  return {
    subject:
      target === "invite_page"
        ? ""
        : "【{{organization_name}}】{{candidate_name}} · {{department}}面试邀请",
    preheader:
      target === "invite_page" ? "" : "{{interview_time}} · {{interview_location}}",
    summary: currentHtml?.trim()
      ? `已按要求调整为${paletteLabel}${isSerif ? "并切换衬线排版" : ""}。`
      : `已生成${paletteLabel}${target === "invite_page" ? "专属邀请函网页" : "双栏日程邮件"}模板。`,
    html,
  };
}

export function createMockProvider(options: { delayMs?: number } = {}): AiProvider {
  const delayMs = options.delayMs ?? 220;
  return {
    name: "mock",
    async designHtml(input) {
      await sleep(delayMs, input.signal);
      return mockFreeEmailHtml(input.prompt, input.style, input.currentHtml, input.target);
    },
    async plan(input) {
      await sleep(delayMs, input.signal);
      const fixture = pickFixture(input.prompt, input.style);
      return {
        themePreset: fixture.themePreset,
        fontFamily: fixture.fontFamily,
        radius: fixture.radius,
        spacing: fixture.spacing,
        subject: fixture.subject,
        preheader: fixture.preheader,
        tone: fixture.tone,
        blocks: input.target === "invite_page" ? [
          { id: "b1", type: "hero", purpose: "欢迎候选人" },
          { id: "b2", type: "event_info", purpose: "面试安排" },
          { id: "b3", type: "rsvp", purpose: "出席答复" },
          { id: "b4", type: "footer", purpose: "组织署名" },
        ] : fixture.blocks,
      };
    },
    async block(input) {
      await sleep(delayMs, input.signal);
      const fixture =
        FIXTURES.find((item) => item.themePreset === input.plan.themePreset) ??
        FIXTURES[0];
      return blockFixture(fixture, input.block);
    },
    async patch(input) {
      await sleep(delayMs, input.signal);
      const current = input.currentProps;
      const type = input.blockType;
      const variant =
        type === "heading"
          ? "style:editorial"
          : type === "text"
            ? "style:lead"
            : type === "info_card"
              ? "style:accent"
              : type === "button"
                ? "style:pill"
                : type === "footer"
                  ? "style:note"
                  : "style:plain";
      const fields: Record<string, unknown> = { variant };
      if (type === "heading" || type === "text" || type === "footer") {
        const base = typeof current.text === "string" ? current.text : "";
        const polished =
          type === "heading"
            ? base.replace(/^/, "诚挚邀请：")
            : `${base}\n期待与你进一步交流。`;
        fields.text = preserveVariables(base, polished).slice(0, type === "footer" ? 160 : 800);
        fields.align = type === "heading" ? "center" : current.align ?? "left";
      } else if (type === "hero" || type === "event_info" || type === "rsvp") {
        const instructions = input.instruction || input.quickAction || "";
        if (/边框/u.test(instructions)) {
          fields.borderPlacement = "all";
          fields.borderColor = instructions.match(/#[0-9a-f]{6}\b/iu)?.[0] ?? "#16867a";
          fields.borderWidth = 2;
          delete fields.variant;
        } else {
          fields.variant = "style:outline";
          fields.title = preserveVariables(current.title, `${current.title ?? "邀请"} · ${type === "hero" ? "期待与你相遇" : "温馨提示"}`).slice(0, 80);
        }
      } else if (type === "info_card") {
        fields.title = typeof current.title === "string" ? current.title : "安排";
        fields.body = preserveVariables(
          current.body,
          `${typeof current.body === "string" ? current.body : ""}\n请提前 10 分钟到达。`,
        ).slice(0, 400);
      } else if (type === "button") {
        fields.text = preserveVariables(
          current.text,
          typeof current.text === "string" ? current.text : "确认参加",
        ).slice(0, 24);
        fields.align = current.align ?? "center";
      } else if (type === "divider") {
        fields.spacing = 24;
      } else if (type === "spacer") {
        fields.height = 32;
      } else if (type === "logo") {
        fields.width = 220;
        fields.align = current.align ?? "center";
      }
      return { blockId: input.blockId, blockType: type, fields };
    },
  };
}
