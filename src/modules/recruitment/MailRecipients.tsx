import { useId, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { InterviewRound } from "@/shared/contracts/interview-rounds";
import type { RosterCandidate } from "@/shared/contracts/recruitment-console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const deliveryTime = new Intl.DateTimeFormat("en-US", {
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Shanghai",
});

type MailRecipientsProps = {
  candidates: RosterCandidate[];
  selectedCandidates: RosterCandidate[];
  round?: InterviewRound;
  loading: boolean;
  disabled: boolean;
  onSelectIds: (ids: string[]) => void;
};

export function MailRecipients({ candidates, selectedCandidates, round, loading, disabled, onSelectIds }: MailRecipientsProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showAllRounds, setShowAllRounds] = useState(false);
  const selected = new Set(selectedCandidates.map(({ id }) => id));
  const text = query.trim().toLowerCase();
  const roundScope = round && !showAllRounds ? round.id : null;
  const deliveryFor = (candidate: RosterCandidate) => candidate.deliveryByRound[round?.id ?? candidate.roundId];
  const sentLast = (candidate: RosterCandidate) => deliveryFor(candidate)?.status === "sent";
  const sentBefore = (candidate: RosterCandidate) => sentLast(candidate) || Boolean(deliveryFor(candidate)?.sentAt);
  const visible = candidates.filter(({ roundId, name, email, department }) =>
    (!roundScope || roundId === roundScope) &&
    [name, email, department].some((value) => value.toLowerCase().includes(text)))
    .sort((a, b) => Number(sentLast(a)) - Number(sentLast(b)));
  const visibleIds = new Set(visible.map(({ id }) => id));
  const outside = selectedCandidates.filter(({ id }) => !visibleIds.has(id)).length;
  const canSelectMore = visible.some(({ id }) => !selected.has(id));
  const unsent = visible.filter((candidate) => !sentBefore(candidate));
  const canSelectUnsent = unsent.some(({ id }) => !selected.has(id))
    || visible.some((candidate) => sentBefore(candidate) && selected.has(candidate.id));
  const shortList = selectedCandidates.slice(0, 2).map(({ name }) => name).join("、");

  function toggle(id: string) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    onSelectIds([...selected]);
  }

  return (
    <section className="min-w-0 rounded-xl border border-border/65 bg-muted/35 px-3 py-2.5" aria-label="收件人">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-medium">收件人（已选 {selected.size} 人）</h3>
          {shortList && (
            <div className="mt-0.5 flex min-w-0 gap-1 text-[11px] leading-5 text-muted-foreground">
              <span className="truncate">{shortList}</span>
              {selected.size > 2 && <span className="shrink-0">等 {selected.size} 人</span>}
            </div>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
          aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
          {open ? "收起名单" : "选择收件人"}
          <ChevronDown className={`size-3.5 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </Button>
      </div>

      <div id={panelId} className={open ? "mt-2.5 space-y-2" : "hidden"}>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[9rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <Input type="search" aria-label="搜索收件人" placeholder="姓名、邮箱或部门" className="h-9 pl-8 text-sm"
              value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <select aria-label="收件人轮次范围" value={roundScope ? "current" : "all"} disabled={!round}
            className="h-9 min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-xs"
            onChange={(event) => setShowAllRounds(event.target.value === "all")}>
            {round && <option value="current">当前邀请轮次 · {round.name}</option>}
            <option value="all">全部轮次</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
            disabled={disabled || loading || !canSelectUnsent}
            onClick={() => onSelectIds([...selectedCandidates.filter(({ id }) => !visibleIds.has(id)).map(({ id }) => id), ...unsent.map(({ id }) => id)])}>
            全选未发送
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
            disabled={disabled || loading || !canSelectMore}
            onClick={() => onSelectIds([...new Set([...selected, ...visibleIds])])}>
            全选当前
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
            disabled={disabled || !selected.size} onClick={() => onSelectIds([])}>
            清空
          </Button>
          {outside > 0 && <span className="px-1 text-[11px] text-muted-foreground">{outside} 位已选在当前列表外</span>}
        </div>
        <div className="max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-border/65 bg-background/80" aria-label="候选收件人列表">
          {loading || !visible.length ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {loading ? "正在读取招新名单…" : "没有符合筛选条件的候选人。"}
            </p>
          ) : (
            <ul className="divide-y divide-border/55">
              {visible.map((candidate) => {
                const { id, name, email, department } = candidate;
                const delivery = deliveryFor(candidate);
                const time = delivery?.sentAt && deliveryTime.format(new Date(delivery.sentAt)).replace(", ", " ");
                const label = delivery?.status === "sent" ? `本轮已发${time ? " · " + time : ""}`
                  : delivery?.status === "failed" ? `本轮失败${time ? " · 曾发送 " + time : ""}` : "本轮未发";
                return <li key={id} className="min-w-0">
                  <label className="flex min-w-0 items-start gap-2.5 px-3 py-2 hover:bg-muted/40">
                    <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" aria-label={`选择 ${name}`}
                      checked={selected.has(id)} disabled={disabled} onChange={() => toggle(id)} />
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                        <span className="text-xs font-medium">{name}</span>
                        <span className={delivery?.status === "sent" ? "text-[11px] text-emerald-800"
                          : delivery?.status === "failed" ? "text-[11px] text-rose-800" : "text-[11px] text-muted-foreground"}>{label}</span>
                      </span>
                      <span className="block text-[11px] leading-4 text-muted-foreground">{email} · {department}</span>
                    </span>
                  </label>
                </li>;
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
