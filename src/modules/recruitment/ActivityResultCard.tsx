import type { ActivityBadge, CustomActivityResult } from "@/shared/contracts/interview-rounds";
import { ActivityResultDetails } from "./ActivityResultDetails";

const tones: Record<NonNullable<ActivityBadge["tone"]>, string> = {
  neutral: "border-stone-300 bg-stone-100 text-stone-800", info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950", warning: "border-amber-200 bg-amber-50 text-amber-950",
  danger: "border-rose-200 bg-rose-50 text-rose-900",
};
export function ActivityBadgeLabel({ badge }: { badge: ActivityBadge }) {
  return <span className={`max-w-full rounded-full border px-2 py-0.5 text-[11px] font-medium [overflow-wrap:anywhere] ${tones[badge.tone ?? "neutral"]}`}>
    {badge.label}
  </span>;
}

const timestamp = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });
const labels = { in_progress: "进行中", completed: "已完成", needs_review: "待人工复核" };

export function ActivityResultCard({ result, title, submittedAt, preview = false }: {
  result: CustomActivityResult; title?: string; submittedAt?: string | null; preview?: boolean;
}) {
  const pending = result.status === "in_progress";
  return <section aria-label={title ?? "互动结果"} className="min-w-0 space-y-3 rounded-xl border border-emerald-900/15 bg-emerald-50/55 p-3 text-emerald-950 [overflow-wrap:anywhere]">
    <div className="flex flex-wrap items-center justify-between gap-2">
      {title && <h5 className="min-w-0 text-sm font-semibold">{title}</h5>}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs" role="status">
        {preview && <span className="font-semibold">{pending ? "已收到模拟进度" : "已收到模拟结果"}</span>}
        <ActivityBadgeLabel badge={{ label: labels[result.status], tone: pending ? "info" : result.status === "needs_review" ? "warning" : "success" }} />
        {result.badge && <ActivityBadgeLabel badge={result.badge} />}
      </div>
    </div>
    {pending && (result.progress !== undefined || result.progressText) && <div className="space-y-1.5 text-xs">
      <div className="flex flex-wrap justify-between gap-2"><span>{result.progressText || "环节进度"}</span>{result.progress !== undefined && <span>{result.progress}%</span>}</div>
      {result.progress !== undefined && <progress aria-label="环节进度" max="100" value={result.progress} className="block h-2 w-full accent-emerald-800" />}
    </div>}
    {result.score !== undefined && <div className="rounded-lg border border-emerald-900/10 bg-white/75 px-3 py-2.5">
      <p className="text-xs opacity-75">{result.scoreLabel || "得分"}</p>
      <p className="flex flex-wrap items-baseline gap-1.5 tabular-nums"><span className="text-2xl leading-tight font-semibold">{result.score}</span>
        {result.maxScore !== undefined && <span className="text-sm">/ {result.maxScore}</span>}
        <span className="text-xs">{result.scoreUnit ?? "分"}</span></p>
    </div>}
    {result.summary && <p className="whitespace-pre-wrap text-sm">{result.summary}</p>}
    {!!result.metrics?.length && <div className="grid gap-2 rounded-lg border border-emerald-900/10 bg-white/60 p-2.5 sm:grid-cols-2" aria-label="多维指标">
      {result.metrics.map(({ label, value, max, unit }, index) => <div key={index} className="min-w-0 space-y-1.5 text-xs">
        <div className="flex flex-wrap justify-between gap-1"><span>{label}</span><span className="tabular-nums">{value}{max !== undefined ? ` / ${max}` : ""}{unit ? ` ${unit}` : ""}</span></div>
        {max !== undefined && <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-1.5 overflow-hidden rounded-full bg-emerald-950/10">
          <div className="h-full rounded-full bg-emerald-800" style={{ width: `${100 * (value / max)}%` }} />
        </div>}
      </div>)}
    </div>}
    {!!result.qa?.length && <div className="space-y-1.5" aria-label="问答明细">
      <p className="text-xs font-semibold">问答明细</p>
      <ol className="space-y-1.5">{result.qa.map(({ question, answer, tag }, index) => <li key={index} className="min-w-0 rounded-lg border border-emerald-900/10 bg-white/70 p-2.5">
        <p className="text-xs font-medium">{index + 1}. {question}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{answer}</p>
        {tag && <span className="mt-1 inline-block text-[11px] font-medium opacity-75">{tag}</span>}
      </li>)}</ol>
    </div>}
    {!!result.tags?.length && <ul aria-label="结果关键词" className="flex flex-wrap gap-1.5">
      {result.tags.map((tag, index) => <li key={index} className="rounded-full border border-emerald-900/15 bg-white/70 px-2 py-0.5 text-xs">{tag}</li>)}
    </ul>}
    {submittedAt && <p className="text-xs opacity-75"><time dateTime={submittedAt}>{timestamp.format(new Date(submittedAt))}</time> · 已锁定成绩</p>}
    {result.payload && <ActivityResultDetails payload={result.payload} />}
  </section>;
}
