import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  LayoutTemplate,
  Mail,
  Send,
  Upload,
  Users,
} from "lucide-react";
import type { InterviewRound } from "@/shared/contracts/interview-rounds";
import type { EmailBatch } from "@/shared/contracts/email";
import type { RosterCandidate } from "@/shared/contracts/recruitment-console";
import { Button } from "@/components/ui/button";
import { demoApi } from "./local-demo-client";
import {
  BATCH_LABELS,
  dateTime,
} from "./recruitment-labels";

type RecruitmentOverviewProps = {
  candidates: RosterCandidate[];
  rounds: InterviewRound[];
  onManageRounds: () => void;
  loading: boolean;
  onGoRoster: () => void;
  onGoMail: () => void;
  onOpenImport: () => void;
};

export function RecruitmentOverview({
  candidates,
  rounds,
  onManageRounds,
  loading,
  onGoRoster,
  onGoMail,
  onOpenImport,
}: RecruitmentOverviewProps) {
  const [batches, setBatches] = useState<EmailBatch[]>([]);

  useEffect(() => {
    let cancelled = false;
    demoApi
      .listBatches()
      .then((rows) => {
        if (!cancelled) setBatches(rows);
      })
      .catch(() => {
        // Overview stays usable even if batch summary fails to load.
      });
    return () => {
      cancelled = true;
    };
  }, [candidates.length]);

  const metrics = useMemo(() => {
    const total = candidates.length;
    const validInvites = candidates.filter((c) => c.latestInvite?.valid).length;
    const confirmed = candidates.filter(
      (c) => c.latestInvite?.rsvpStatus === "confirmed",
    ).length;
    const failedDeliveries = candidates.filter(
      (c) => c.latestDelivery?.status === "failed",
    ).length;
    const roundsStats = rounds.filter(({ archivedAt }) => !archivedAt).map((round) => {
      const members = candidates.filter(({ roundId }) => roundId === round.id);
      const form = candidates.filter(({ completedByRound }) => completedByRound[round.id]?.form).length;
      const mbti = candidates.filter(({ completedByRound }) => completedByRound[round.id]?.mbti).length;
      return { ...round, count: members.length, form, mbti };
    });
    return { total, validInvites, confirmed, failedDeliveries, roundsStats };
  }, [candidates, rounds]);

  const recentBatches = batches.slice(0, 4);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={onGoRoster}
          className="group rounded-2xl border border-border/70 bg-card/85 p-4 text-left transition-colors hover:border-primary/35"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>候选人总数</span>
            <Users className="size-4 text-muted-foreground/70 group-hover:text-primary" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {loading ? "—" : metrics.total}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">点击进入招新名单</p>
        </button>

        <button
          type="button"
          onClick={onGoRoster}
          className="group rounded-2xl border border-border/70 bg-card/85 p-4 text-left transition-colors hover:border-primary/35"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>有效邀请</span>
            <Mail className="size-4 text-muted-foreground/70 group-hover:text-primary" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {loading ? "—" : metrics.validInvites}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            已签发且尚未过期或撤销
          </p>
        </button>

        <button
          type="button"
          onClick={onGoRoster}
          className="group rounded-2xl border border-border/70 bg-card/85 p-4 text-left transition-colors hover:border-primary/35"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>已确认答复</span>
            <CheckCircle2 className="size-4 text-emerald-600/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-700">
            {loading ? "—" : metrics.confirmed}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            来自候选人专属邀请函回执
          </p>
        </button>

        <button
          type="button"
          onClick={onGoMail}
          className="group rounded-2xl border border-border/70 bg-card/85 p-4 text-left transition-colors hover:border-primary/35"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>发送批次</span>
            <Send className="size-4 text-muted-foreground/70 group-hover:text-primary" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {batches.length}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {metrics.failedDeliveries > 0
              ? `${metrics.failedDeliveries} 封失败待重试`
              : "查看发件箱与投递记录"}
          </p>
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="space-y-4 rounded-2xl border border-border/70 bg-card/85 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">轮次进度</h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={onManageRounds}
            >
              管理面试轮次
              <ArrowRight className="size-3" aria-hidden="true" />
            </Button>
          </div>

          <div className="divide-y divide-border/65">
            {metrics.roundsStats.map(({ id, name, count, form, mbti, kind }) => (
              <div key={id} className="min-w-0 space-y-1 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={kind === "offer" ? "text-sm font-semibold text-amber-900" : "text-sm font-semibold"}>{name}</span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{loading ? "—" : count} 人</span>
                </div>
                <p className="text-xs text-muted-foreground">问卷完成 {form} · MBTI 完成 {mbti}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
            <Button type="button" size="sm" onClick={onGoRoster}>
              <Users className="size-3.5" aria-hidden="true" />
              进入招新名单
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onOpenImport}>
              <Upload className="size-3.5" aria-hidden="true" />
              CSV 导入名单
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onGoMail}>
              <Send className="size-3.5" aria-hidden="true" />
              撰写邀请邮件
            </Button>
            <Button type="button" size="sm" variant="ghost" asChild>
              <a href="#/designer?target=email">
                <LayoutTemplate className="size-3.5" aria-hidden="true" />
                去设计模板
              </a>
            </Button>
          </div>
        </section>

        <section className="flex flex-col rounded-2xl border border-border/70 bg-card/85">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 px-5 py-3.5">
            <h2 className="text-sm font-semibold">最近发送批次</h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={onGoMail}
            >
              打开邮件发送
              <ArrowRight className="size-3" aria-hidden="true" />
            </Button>
          </div>

          {recentBatches.length === 0 ? (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  还没有发送批次记录，可在撰写页选人并发起邀请。
                </p>
                <Button type="button" size="sm" variant="outline" onClick={onGoMail}>
                  去发送邮件
                </Button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {recentBatches.map((batch) => (
                <button
                  key={batch.id}
                  type="button"
                  onClick={onGoMail}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{batch.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      成功 {batch.simulatedCount} · 失败 {batch.failedCount} ·{" "}
                      {dateTime(batch.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
                    {BATCH_LABELS[batch.status] ?? batch.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
