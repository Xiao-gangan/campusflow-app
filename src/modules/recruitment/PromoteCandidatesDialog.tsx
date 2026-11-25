import { useState } from "react";
import type { InterviewRound, PromotionSchedule } from "@/shared/contracts/interview-rounds";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fieldClass } from "./QuestionFields";

const timingOptions = [
  ["keep", "沿用原时间地点"],
  ["replace", "统一填写新时间地点"],
  ["clear", "清空时间地点待定"],
] as const;

export function PromoteCandidatesDialog({ count, rounds, currentRoundId, onClose, onPromote }: {
  count: number;
  rounds: InterviewRound[];
  currentRoundId: string;
  onClose: () => void;
  onPromote: (roundId: string, schedule: PromotionSchedule) => Promise<void>;
}) {
  const active = rounds.filter(({ archivedAt }) => !archivedAt);
  const currentPosition = active.findIndex(({ id }) => id === currentRoundId);
  const next = currentPosition >= 0 ? active[currentPosition + 1] : undefined;
  const [target, setTarget] = useState(next?.id ?? "");
  const [mode, setMode] = useState<PromotionSchedule["mode"]>("keep");
  const [schedule, setSchedule] = useState({ interviewDate: "", startTime: "", endTime: "", location: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>推进到目标轮次</DialogTitle>
        <DialogDescription>已勾选 {count} 位候选人</DialogDescription>
      </DialogHeader>
      <form className="min-w-0 space-y-4" onSubmit={async (event) => {
        event.preventDefault();
        if (!target || busy) return;
        setBusy(true);
        setError("");
        try {
          await onPromote(target, mode === "replace" ? { mode, ...schedule } : { mode });
          onClose();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "推进失败，请重试。");
        } finally { setBusy(false); }
      }}>
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          <label className="grid min-w-0 gap-1.5 text-sm">目标面试轮次
            <select required className={fieldClass} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">请选择轮次</option>
              {active.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
            </select>
          </label>
          <fieldset className="min-w-0 space-y-2">
            <legend className="mb-1 text-sm font-medium">本轮时间地点</legend>
            {timingOptions.map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm">
              <input type="radio" className="size-4 accent-primary" name="promotion-schedule" checked={mode === value}
                onChange={() => setMode(value)} />{label}
            </label>)}
          </fieldset>
          {mode === "replace" && <div className="grid min-w-0 gap-2.5 sm:grid-cols-2">
            {([
              ["interviewDate", "日期", "date"], ["location", "地点", "text"],
              ["startTime", "开始时间", "time"], ["endTime", "结束时间", "time"],
            ] as const).map(([name, label, type]) => <label className="grid min-w-0 gap-1 text-sm" key={name}>{label}
              <Input type={type} value={schedule[name]} required maxLength={200}
                onChange={(e) => setSchedule({ ...schedule, [name]: e.target.value })} />
            </label>)}
          </div>}
        </fieldset>
        {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>取消</Button>
          <Button type="submit" disabled={busy || !target}>{busy ? "推进中…" : "确认推进"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
