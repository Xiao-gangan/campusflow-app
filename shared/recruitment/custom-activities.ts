import {
  CUSTOM_ACTIVITY_HTML_LIMIT, CUSTOM_ACTIVITY_LIMIT, CUSTOM_ACTIVITY_MAX_HEIGHT, CUSTOM_ACTIVITY_MIN_HEIGHT,
  ACTIVITY_BADGE_TONES, ACTIVITY_RESULT_STATUSES, CUSTOM_ACTIVITY_PAYLOAD_LIMIT, CUSTOM_ACTIVITY_TOTAL_HTML_LIMIT,
  type ActivityPayload, type CustomActivity, type CustomActivityResult,
} from "../contracts/interview-rounds.ts";

const encoder = new TextEncoder();
const bytes = (value: string) => encoder.encode(value).length;
const blockedKeys = new Set(["__proto__", "constructor", "prototype"]);
export const CUSTOM_ACTIVITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;
export const isCustomActivityId = (value: unknown): value is string => typeof value === "string"
  && CUSTOM_ACTIVITY_ID_PATTERN.test(value) && !blockedKeys.has(value);

export function isDataObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseActivityUrl(value: unknown): URL {
  if (typeof value === "string" && value.length <= 2048 && /^https?:\/\//iu.test(value.trim()) && !/[\u0000-\u0020\u007f\\]/u.test(value.trim())) {
    try {
      const url = new URL(value.trim());
      if (!url.username && !url.password && url.hostname) return url;
    } catch { /* Use the same validation error as other invalid links. */ }
  }
  throw new Error("请输入不含账号密码的 HTTP 或 HTTPS 链接。");
}

export function parseCustomActivities(value: unknown): CustomActivity[] {
  if (!Array.isArray(value) || value.length > CUSTOM_ACTIVITY_LIMIT) throw new Error(`最多可添加 ${CUSTOM_ACTIVITY_LIMIT} 个互动环节。`);
  let total = 0;
  const ids = new Set<string>();
  return value.map((item) => {
    if (!isDataObject(item)) throw new Error("互动环节配置无效。");
    const { id, title, description, required, enabled, kind, html, height, url } = item;
    const fields = ["id", "title", "description", "required", "enabled", "kind", ...(kind === "sandbox_widget" ? ["html", "height"] : ["url"])];
    if (Object.keys(item).some((key) => !fields.includes(key)) || !isCustomActivityId(id) || ids.has(id)
      || typeof title !== "string" || !title.trim() || title.length > 80
      || (description !== undefined && (typeof description !== "string" || description.length > 400))
      || typeof required !== "boolean" || typeof enabled !== "boolean") throw new Error("请检查互动环节的名称、说明和配置。");
    ids.add(id);
    const base = { id, title: title.trim(), ...(description ? { description: description.trim() } : {}), required, enabled };
    if (kind === "external_app") return { ...base, kind, url: parseActivityUrl(url).href };
    if (kind !== "sandbox_widget" || typeof html !== "string" || !html.trim()) throw new Error("请提供互动环节的单文件 HTML。");
    const size = bytes(html);
    total += size;
    if (size > CUSTOM_ACTIVITY_HTML_LIMIT || total > CUSTOM_ACTIVITY_TOTAL_HTML_LIMIT)
      throw new Error("互动 HTML 超出大小限制，单个最多 128 KB，每轮合计最多 384 KB。");
    if (height !== undefined && (typeof height !== "number" || !Number.isInteger(height)
      || height < CUSTOM_ACTIVITY_MIN_HEIGHT || height > CUSTOM_ACTIVITY_MAX_HEIGHT)) throw new Error("互动窗口高度须为 240 至 720 px 的整数。");
    return { ...base, kind, html, ...(height !== undefined ? { height } : {}) };
  });
}

function isJsonData(value: unknown, depth: number, budget: { remaining: number }): boolean {
  if (--budget.remaining < 0 || depth > 12) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return (budget.remaining -= value.length) >= 0;
  if (Array.isArray(value)) return value.length <= budget.remaining && value.every((child) => isJsonData(child, depth + 1, budget));
  return isDataObject(value) && Object.entries(value).every(([key, child]) => !blockedKeys.has(key)
    && (budget.remaining -= key.length) >= 0 && isJsonData(child, depth + 1, budget));
}

export function parseCustomActivityResult(value: unknown): CustomActivityResult {
  const raw = resultObject(value, ["status", "summary", "payload", "progress", "progressText", "badge", "score", "maxScore", "scoreLabel", "scoreUnit", "metrics", "qa", "tags"]);
  const status = raw.status === undefined ? "completed" : ACTIVITY_RESULT_STATUSES.find((item) => item === raw.status);
  if (!status) throw new Error("互动结果状态无效。");
  const summary = resultText(raw.summary, "摘要", 500, status !== "in_progress") ?? "";
  const score = resultNumber(raw.score, "得分", 0, 10_000);
  const maxScore = resultNumber(raw.maxScore, "最高分", Number.MIN_VALUE, 10_000);
  if (score !== undefined && maxScore !== undefined && score > maxScore) throw new Error("互动得分不能超过最高分。");
  const { payload } = raw;
  if (payload !== undefined && (!isDataObject(payload) || !isJsonData(payload, 0, { remaining: CUSTOM_ACTIVITY_PAYLOAD_LIMIT })
    || bytes(JSON.stringify(payload)) > CUSTOM_ACTIVITY_PAYLOAD_LIMIT)) throw new Error("互动数据须为不超过 16 KB 的 JSON 对象。");
  let badge: CustomActivityResult["badge"];
  if (raw.badge !== undefined) {
    const fields = resultObject(raw.badge, ["label", "tone"]);
    const tone = ACTIVITY_BADGE_TONES.find((item) => item === fields.tone);
    if (fields.tone !== undefined && !tone) throw new Error("互动角标色调无效。");
    badge = { label: resultText(fields.label, "角标", 24, true)!, ...(tone ? { tone } : {}) };
  }
  const metrics = resultList(raw.metrics, 8, (item) => {
    const fields = resultObject(item, ["label", "value", "max", "unit"]);
    const value = resultNumber(fields.value, "指标值", -1e9, 1e9, true)!;
    const max = resultNumber(fields.max, "指标上限", Number.MIN_VALUE, 1e9);
    if (max !== undefined && (value < 0 || value > max)) throw new Error("有上限的指标值须在 0 与上限之间。");
    return { label: resultText(fields.label, "指标名", 40, true)!, value, max, unit: resultText(fields.unit, "指标单位", 16) };
  });
  const qa = resultList(raw.qa, 40, (item) => {
    const fields = resultObject(item, ["question", "answer", "tag"]);
    return { question: resultText(fields.question, "问题", 500, true)!, answer: resultText(fields.answer, "答案", 2000, true)!,
      tag: resultText(fields.tag, "问答标签", 24) };
  });
  const tags = resultList(raw.tags, 10, (item) => resultText(item, "标签", 24, true)!);
  const normalized = { status, summary, score, maxScore, badge, metrics, qa, tags, payload: payload as ActivityPayload | undefined,
    progress: resultNumber(raw.progress, "进度", 0, 100), progressText: resultText(raw.progressText, "进度说明", 100),
    scoreLabel: resultText(raw.scoreLabel, "得分名称", 40), scoreUnit: resultText(raw.scoreUnit, "得分单位", 16) };
  if (bytes(JSON.stringify(normalized)) > 96 * 1024) throw new Error("互动结果总大小不能超过 96 KB。");
  return normalized;
}

function resultObject(value: unknown, keys: string[]) {
  if (!isDataObject(value) || Object.keys(value).some((key) => !keys.includes(key))) throw new Error("互动结果格式无效。");
  return value;
}

function resultText(value: unknown, label: string, max: number, required = false) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || value.length > max || (required && !value.trim()))
    throw new Error(`互动${label}${required ? "须填写且" : ""}不超过 ${max} 字。`);
  return value.trim();
}

function resultNumber(value: unknown, label: string, min: number, max: number, required = false) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`互动${label}数值无效。`);
  return value;
}

function resultList<T>(value: unknown, max: number, parse: (item: unknown) => T) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > max) throw new Error(`互动结果列表不能超过 ${max} 项。`);
  return Array.from(value, parse);
}
