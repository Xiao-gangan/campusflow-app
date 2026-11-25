import { useMemo, useState } from "react";
import { ActivityBadgeLabel } from "./ActivityResultCard";
import {
  ExternalLink,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  ShieldX,
  Upload,
} from "lucide-react";
import { APPLICANT_STATUSES, type ApplicantStatus } from "@/shared/contracts/domain";
import type { InterviewRound, PromotionSchedule } from "@/shared/contracts/interview-rounds";
import type { RosterCandidate } from "@/shared/contracts/recruitment-console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REVIEW_LABELS, scheduleTime } from "@/shared/recruitment/round-presentation";
import { PromoteCandidatesDialog } from "./PromoteCandidatesDialog";
import { cn } from "@/lib/utils";
import {
  dateTime,
  deliveryLabel,
  inviteLabel,
  rsvpLabel,
  STAGE_LABELS,
  STAGE_TONES,
} from "./recruitment-labels";

const PROGRESS_LABEL = { off: "未启用", pending: "待填写", draft: "已暂存", submitted: "已提交" };
function ActivityLabels({ candidate, round }: { candidate: RosterCandidate; round?: InterviewRound }) {
  const custom = candidate.progress.customActivities;
  return <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
    <span className="font-medium text-foreground [overflow-wrap:anywhere]">{round?.name ?? "面试轮次"}{round?.archivedAt ? "（已归档）" : ""}</span>
    {candidate.progress.form !== "off" && <span>问卷 {PROGRESS_LABEL[candidate.progress.form]}</span>}
    {candidate.progress.mbti !== "off" && <span>MBTI {candidate.progress.mbtiType ?? PROGRESS_LABEL[candidate.progress.mbti]}</span>}
    {custom?.total > 0 && <span>互动 {custom.completed}/{custom.total}</span>}
    {custom?.statuses?.map(({ id, title, status, badge, progress }) => <span key={id} title={title} className="min-w-0">
      {badge ? <ActivityBadgeLabel badge={badge} /> : status === "in_progress"
        ? <span>进行中{progress === undefined ? "" : ` ${progress}%`}</span>
        : status === "needs_review" ? <ActivityBadgeLabel badge={{ label: "待人工复核", tone: "warning" }} /> : null}
    </span>)}
    {candidate.review && <span className="rounded-full border border-primary/20 bg-primary/5 px-1.5 text-primary">
      {REVIEW_LABELS[candidate.review.decision]} · {candidate.review.rating}/5
    </span>}
  </div>;
}

type RosterPanelProps = {
  rounds: InterviewRound[];
  onSubmissions: (candidate: RosterCandidate) => void;
  onPromote: (ids: string[], roundId: string, schedule: PromotionSchedule) => Promise<void>;
  candidates: RosterCandidate[];
  loading: boolean;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onRefresh: () => void;
  onCreate: () => void;
  onImport: () => void;
  onEdit: (candidate: RosterCandidate) => void;
  onIssue: (candidate: RosterCandidate) => void;
  onShowLink: (candidate: RosterCandidate) => void;
  onRotate: (candidate: RosterCandidate) => void;
  onRevoke: (candidate: RosterCandidate) => void;
  onGoMail: () => void;
};

export function RosterPanel({
  candidates,
  rounds,
  onPromote,
  onSubmissions,
  loading,
  selectedIds,
  onSelect,
  onRefresh,
  onCreate,
  onImport,
  onEdit,
  onIssue,
  onShowLink,
  onRotate,
  onRevoke,
  onGoMail,
}: RosterPanelProps) {
  const [roundId, setRoundId] = useState("");
  const [promotionIds, setPromotionIds] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<ApplicantStatus | "all">("all");

  const filtered = useMemo(
    () =>
      candidates.filter((candidate) => {
        if (roundId && candidate.roundId !== roundId) return false;
        if (stage !== "all" && candidate.stage !== stage) return false;
        const text = query.trim().toLowerCase();
        if (!text) return true;
        return [candidate.name, candidate.email, candidate.department, candidate.cycle]
          .join(" ")
          .toLowerCase()
          .includes(text);
      }),
    [candidates, query, stage, roundId],
  );

  const roundById = new Map(rounds.map((round) => [round.id, round]));
  const roundTabs = rounds.filter((round) => !round.archivedAt || candidates.some((candidate) => candidate.roundId === round.id))
    .map(({ id, name }) => ({ id, name, count: candidates.filter((candidate) => candidate.roundId === id).length }));
  roundTabs.push({ id: "", name: "全部", count: candidates.length });
  const selected = new Set(selectedIds);
  const distribution = new Map<string, number>();
  for (const { progress: { mbtiType } } of filtered) {
    if (mbtiType) distribution.set(mbtiType, (distribution.get(mbtiType) ?? 0) + 1);
  }
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((candidate) => selected.has(candidate.id));

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelect([...next]);
  }

  function toggleAll() {
    if (allVisibleSelected) {
      onSelect(
        selectedIds.filter((id) => !filtered.some((candidate) => candidate.id === id)),
      );
    } else {
      onSelect([
        ...new Set([...selectedIds, ...filtered.map((candidate) => candidate.id)]),
      ]);
    }
  }

  return (
    <section className="space-y-3.5">
      <div role="tablist" aria-label="招新轮次" className="flex min-w-0 flex-wrap gap-1.5 rounded-2xl border border-border/70 bg-card/85 p-2"
        onKeyDown={(event) => {
          const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
          const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === "ArrowRight" ? (current + 1) % tabs.length
            : event.key === "ArrowLeft" ? (current - 1 + tabs.length) % tabs.length
            : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault();
          tabs[next]?.focus();
          tabs[next]?.click();
        }}>
        {roundTabs.map(({ id, name, count }) => <button type="button" role="tab" key={id}
          id={`roster-tab-${id || "all"}`} aria-controls="roster-round-panel" aria-selected={roundId === id}
          tabIndex={roundId === id ? 0 : -1} onClick={() => setRoundId(id)}
          className={cn("max-w-full rounded-xl px-3 py-2 text-center text-xs font-medium [overflow-wrap:anywhere]",
            roundId === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60")}>
          {name} <span className="tabular-nums">({count})</span>
        </button>)}
      </div>
      <div className="flex flex-col gap-2.5 rounded-2xl border border-border/70 bg-card/85 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:w-64 sm:flex-none">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索姓名、邮箱、部门"
              className="h-9 pl-8 text-sm"
              aria-label="搜索候选人"
            />
          </div>
          <select
            value={stage}
            onChange={(event) =>
              setStage(event.target.value as ApplicantStatus | "all")
            }
            className="h-9 rounded-md border border-input bg-background px-3 text-sm leading-9"
            aria-label="按流程状态筛选"
          >
            <option value="all">所有状态</option>
            {APPLICANT_STATUSES.map((item) => (
              <option key={item} value={item}>
                {STAGE_LABELS[item]}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            className="h-9 px-3 text-xs"
            onClick={toggleAll}
          >
            {allVisibleSelected ? "取消全选" : "全选当前"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-9"
            onClick={onRefresh}
            title="刷新名单"
            aria-label="刷新名单"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" className="h-9 gap-1.5 px-3 text-xs" onClick={onImport}>
            <Upload className="size-3.5" aria-hidden="true" />
            CSV 导入
          </Button>
          <Button
            type="button"
            variant={selectedIds.length > 0 ? "outline" : "default"}
            className="h-9 gap-1.5 px-3 text-xs"
            onClick={onCreate}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            新增
          </Button>
          <Button
            type="button"
            variant={selectedIds.length > 0 ? "default" : "outline"}
            className="h-9 gap-1.5 px-3 text-xs"
            disabled={!selectedIds.length}
            onClick={onGoMail}
          >
            <Mail className="size-3.5" aria-hidden="true" />
            去发送邮件{selectedIds.length ? ` (${selectedIds.length})` : ""}
          </Button>
        </div>
      </div>

      {selectedIds.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-card p-3">
        <span className="text-sm">已勾选 {selectedIds.length} 人</span>
        <Button size="sm" type="button" onClick={() => setPromotionIds([...selectedIds])}>推进到目标轮次</Button>
        <Button size="sm" type="button" variant="ghost" onClick={() => onSelect([])}>清空勾选</Button>
      </div>}
      {promotionIds && <PromoteCandidatesDialog count={promotionIds.length} currentRoundId={roundId} rounds={rounds}
        onClose={() => setPromotionIds(null)} onPromote={async (target, schedule) => {
          await onPromote(promotionIds, target, schedule);
          setRoundId(target);
        }} />}
      <div role="tabpanel" id="roster-round-panel" aria-labelledby={`roster-tab-${roundId || "all"}`} className="space-y-3.5">
      {distribution.size > 0 && <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="当前名单 MBTI 分布">
        <span className="font-medium">MBTI 分布</span>
        {[...distribution].sort((a, b) => b[1] - a[1]).map(([type, count]) => <span className="rounded-full bg-muted px-2 py-1" key={type}>{type} · {count}</span>)}
      </div>}
      {loading ? (
        <div className="rounded-2xl border border-border/70 bg-card/70 px-4 py-12 text-center text-sm text-muted-foreground">
          正在读取招新名单…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-12 text-center text-sm text-muted-foreground">
          没有符合条件的候选人。
        </div>
      ) : (
        <>
          {/* Desktop table view */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border/70 bg-card/85 md:block">
            <table className="w-full min-w-[780px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/35 text-xs text-muted-foreground">
                  <th className="w-10 px-3.5 py-2.5">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      aria-label="全选当前结果"
                      className="size-4 accent-[#1d5343]"
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">候选人</th>
                  <th className="px-3 py-2.5 font-medium">部门与排期</th>
                  <th className="px-3 py-2.5 font-medium">邀请与答复</th>
                  <th className="px-3 py-2.5 font-medium">邮件投递</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((candidate) => {
                  const invite = inviteLabel(candidate);
                  const rsvp = rsvpLabel(candidate, roundById.get(candidate.roundId)?.kind);
                  const delivery = deliveryLabel(candidate);
                  const checked = selected.has(candidate.id);
                  const hasValidInvite = Boolean(candidate.latestInvite?.valid);
                  return (
                    <tr
                      key={candidate.id}
                      className={cn(
                        "transition-colors hover:bg-muted/25",
                        checked && "bg-primary/[0.035]",
                      )}
                    >
                      <td className="px-3.5 py-3 align-middle">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(candidate.id)}
                          aria-label={`选择 ${candidate.name}`}
                          className="size-4 accent-[#1d5343]"
                        />
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="font-medium text-foreground">{candidate.name}</div>
                        <div className="mt-0.5 max-w-[220px] truncate text-xs text-muted-foreground">
                          {candidate.email}
                        </div>
                        <ActivityLabels candidate={candidate} round={roundById.get(candidate.roundId)} />
                        {candidate.latestDelivery?.errorMessage ? (
                          <p className="mt-1 max-w-[260px] text-[11px] leading-4 text-rose-700">
                            {candidate.latestDelivery.errorMessage}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${STAGE_TONES[candidate.stage]}`}
                          >
                            {STAGE_LABELS[candidate.stage]}
                          </span>
                          <span className="text-xs text-foreground/80">
                            {candidate.department}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {[scheduleTime(candidate), candidate.location].filter(Boolean).join(" · ") || "时间地点待定"}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle text-xs">
                        <div className={invite.tone}>{invite.text}</div>
                        <div className={cn("mt-0.5", rsvp.tone)}>RSVP：{rsvp.text}</div>
                      </td>
                      <td className="px-3 py-3 align-middle text-xs">
                        <div className={delivery.tone}>{delivery.text}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {candidate.latestDelivery?.sentAt
                            ? dateTime(candidate.latestDelivery.sentAt)
                            : "—"}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 align-middle">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
                            aria-label={`查看 ${candidate.name} 面试记录`} onClick={() => onSubmissions(candidate)}>面试记录</Button>
                          {hasValidInvite && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onShowLink(candidate)}>
                            <ExternalLink className="size-3" aria-hidden="true" />邀请链接
                          </Button>}
                          {hasValidInvite ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => onRotate(candidate)}
                              >
                                <RotateCw className="size-3" aria-hidden="true" />
                                换发
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 gap-1 px-2 text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                onClick={() => onRevoke(candidate)}
                              >
                                <ShieldX className="size-3" aria-hidden="true" />
                                撤销
                              </Button>
                              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onIssue(candidate)}>签发其他轮次</Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => onIssue(candidate)}
                            >
                              <Mail className="size-3" aria-hidden="true" />
                              签发邀请
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="size-7 text-muted-foreground hover:text-foreground"
                            onClick={() => onEdit(candidate)}
                            aria-label={`编辑 ${candidate.name}`}
                            title="编辑"
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile compact card view */}
          <div className="space-y-2.5 md:hidden">
            {filtered.map((candidate) => {
              const invite = inviteLabel(candidate);
              const rsvp = rsvpLabel(candidate, roundById.get(candidate.roundId)?.kind);
              const delivery = deliveryLabel(candidate);
              const checked = selected.has(candidate.id);
              const hasValidInvite = Boolean(candidate.latestInvite?.valid);
              return (
                <article
                  key={candidate.id}
                  className={cn(
                    "rounded-2xl border p-3.5",
                    checked
                      ? "border-primary/40 bg-primary/[0.035]"
                      : "border-border/70 bg-card/85",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(candidate.id)}
                      aria-label={`选择 ${candidate.name}`}
                      className="mt-1 size-4 accent-[#1d5343]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{candidate.name}</h3>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${STAGE_TONES[candidate.stage]}`}
                        >
                          {STAGE_LABELS[candidate.stage]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {candidate.department}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {candidate.email}
                      </p>
                      <ActivityLabels candidate={candidate} round={roundById.get(candidate.roundId)} />
                      {roundById.get(candidate.roundId)?.kind !== "offer" && <p className="mt-1 text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                        {[scheduleTime(candidate), candidate.location].filter(Boolean).join(" · ") || "时间地点待定"}
                      </p>}
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        <span className={invite.tone}>{invite.text}</span>
                        <span className={rsvp.tone}>RSVP：{rsvp.text}</span>
                        <span className={delivery.tone}>{delivery.text}</span>
                      </div>
                      {candidate.latestDelivery?.errorMessage ? (
                        <p className="mt-1.5 text-xs text-rose-700">
                          {candidate.latestDelivery.errorMessage}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 px-3 text-xs"
                      onClick={() => onEdit(candidate)}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      编辑
                    </Button>
                    <Button type="button" size="sm" variant="ghost" aria-label={`查看 ${candidate.name} 面试记录`}
                      onClick={() => onSubmissions(candidate)}>面试记录</Button>
                    {hasValidInvite ? (
                      <>
                        <Button type="button" size="sm" variant="outline" className="h-9 px-3 text-xs" onClick={() => onShowLink(candidate)}>
                          <ExternalLink className="size-3.5" aria-hidden="true" />邀请链接
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 px-3 text-xs"
                          onClick={() => onRotate(candidate)}
                        >
                          <RotateCw className="size-3.5" aria-hidden="true" />
                          换发
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-9 px-3 text-xs text-rose-700"
                          onClick={() => onRevoke(candidate)}
                        >
                          <ShieldX className="size-3.5" aria-hidden="true" />
                          撤销
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => onIssue(candidate)}>签发其他轮次</Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 px-3 text-xs"
                        onClick={() => onIssue(candidate)}
                      >
                        <Mail className="size-3.5" aria-hidden="true" />
                        签发邀请
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
      </div>
    </section>
  );
}
