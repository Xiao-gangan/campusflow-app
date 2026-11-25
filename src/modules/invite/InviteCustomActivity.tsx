import { BROWSER_DEMO } from "../browser-demo/mode";
import { useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { CandidateInvite } from "@/shared/contracts/candidate-invite";
import { isActivityTerminal, type CustomActivityResult, type CustomActivitySubmission, type InviteCustomActivity as Activity } from "@/shared/contracts/interview-rounds";
import { ActivityResultCard } from "../recruitment/ActivityResultCard";
import { CustomActivityFrame } from "../recruitment/CustomActivityFrame";
import { inviteRequest } from "./rsvp-client";

export function InviteCustomActivity({ activity, url, onChanged }: { activity: Activity; url: string; onChanged: (done: boolean) => void }) {
  const [open, setOpen] = useState(!isActivityTerminal(activity.submission));
  const [refreshed, setRefreshed] = useState<Activity | null>(null);
  const [saved, setSaved] = useState<CustomActivitySubmission | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const queued = useRef<CustomActivityResult | null>(null);
  const current = refreshed && refreshed.generation >= activity.generation ? refreshed : activity;
  const result = current.kind === "sandbox_widget" && saved && saved.revision >= (current.submission?.revision ?? 0) ? saved : current.submission;
  const terminal = isActivityTerminal(result);
  const activityUrl = url + "/activities/" + encodeURIComponent(activity.id);

  async function flush() {
    if (inFlight.current || !queued.current || terminal) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    setMessage("");
    try {
      while (queued.current) {
        const next: CustomActivityResult = queued.current;
        queued.current = null;
        try {
          const latest = await inviteRequest<CustomActivitySubmission>(activityUrl, { method: "POST",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify(BROWSER_DEMO ? { ...next, demoGeneration: current.generation } : next), signal: AbortSignal.timeout(15_000) });
          setSaved(latest);
          const done = isActivityTerminal(latest);
          onChanged(done);
          if (done) queued.current = null;
        } catch (failure) {
          if (isActivityTerminal(next) || !queued.current) queued.current = next;
          throw failure;
        }
      }
    } catch (failure) {
      setError(true);
      setMessage(failure instanceof Error ? failure.message : "互动结果暂时无法保存。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    setMessage("");
    try {
      const latest = await inviteRequest<CandidateInvite>(url, { signal: AbortSignal.timeout(15_000) });
      const updated = latest.activities?.customActivities?.find(({ id }) => id === activity.id);
      if (!updated) throw new Error("这份邀请没有启用该互动环节。");
      setRefreshed(updated);
      onChanged(isActivityTerminal(updated.submission));
      if (!updated.submission && !updated.revoked) setMessage("暂未收到结果。请在外部应用提交后再刷新。");
    } catch (failure) {
      setError(true);
      setMessage(failure instanceof Error ? failure.message : "互动结果暂时无法读取。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="min-w-0 rounded-xl border border-current/15 p-3">
    <summary className="cursor-pointer text-sm font-semibold [overflow-wrap:anywhere]">
      {activity.title} · {result?.status === "needs_review" ? "待人工复核" : terminal ? "已完成" : result ? "进行中" : activity.required ? "必做" : "选做"}
    </summary>
    <div className="mt-3 min-w-0 space-y-3 text-sm">
      {!terminal && activity.description && <p className="whitespace-pre-wrap opacity-80 [overflow-wrap:anywhere]">{activity.description}</p>}
      {current.kind === "sandbox_widget" && !current.revoked && !terminal && <>
        <CustomActivityFrame activity={current} resume={result} onSubmit={(next) => {
          if (terminal || isActivityTerminal(queued.current)) return;
          queued.current = next;
          void flush();
        }} />
        {busy && <p role="status" className="text-xs opacity-80">正在保存互动进度…</p>}
        {!busy && queued.current && <Button size="sm" variant="outline" onClick={() => void flush()}>重试保存结果</Button>}
      </>}
      {result && <ActivityResultCard result={result} submittedAt={result.submittedAt} />}
      {current.revoked && current.kind === "sandbox_widget" && <p role="status">环节凭证已吊销，请联系组织者。</p>}
      {current.kind === "external_app" && BROWSER_DEMO && <p>当前演示可配置外部环节，外部回传由本机服务处理。</p>}
      {current.kind === "external_app" && !BROWSER_DEMO && <>
        <div className="flex flex-wrap items-center gap-2">
          {!terminal && !current.revoked && <a href={activityUrl + "/launch"} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm" })}>
            打开互动环节<ArrowUpRight aria-hidden="true" />
          </a>}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void refresh()}>{busy ? "正在刷新…" : "刷新环节状态"}</Button>
        </div>
        {current.revoked ? <p role="status" className="text-xs opacity-75">环节凭证已吊销。如需继续，请联系组织者。</p>
          : !terminal && <p className="text-xs opacity-75">在新标签页完成后，回到这里刷新环节状态。</p>}
      </>}
      {message && <p role={error ? "alert" : "status"} className={error ? "text-rose-800" : "opacity-80"}>{message}</p>}
    </div>
  </details>;
}
