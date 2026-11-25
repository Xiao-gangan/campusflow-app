import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ActivityCredential } from "@/shared/contracts/interview-rounds";
import { demoApi } from "./local-demo-client";
import { dateTime } from "./recruitment-labels";

const statuses = { unissued: "待候选人打开", active: "有效", locked: "成绩已锁定", revoked: "已吊销", expired: "已过期" };

export function ActivityCredentialControls({ initial, candidateId, inviteId, onChanged }: {
  initial: ActivityCredential; candidateId: string; inviteId: string; onChanged: () => void;
}) {
  const [entry, setEntry] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState(false);
  async function action(next: "reissue" | "revoke") {
    const question = next === "reissue" ? "重签此环节凭证并开启重测？以往成绩仍保留。" : "吊销此环节凭证？候选人将暂时无法继续。";
    if (!window.confirm(question)) return;
    setBusy(true);
    setFeedback("");
    setError(false);
    try {
      setEntry(await demoApi.manageActivityCredential(candidateId, inviteId, entry.activityId, next));
      setFeedback(next === "reissue" ? "已重签。候选人可使用原邀请函打开环节。" : "环节凭证已吊销。");
      onChanged();
    } catch (failure) {
      setError(true);
      setFeedback(failure instanceof Error ? failure.message : "操作未完成，请重试。");
    } finally { setBusy(false); }
  }

  return <div className="min-w-0 space-y-2 rounded-lg border border-border/70 p-2.5 [overflow-wrap:anywhere]" aria-label={entry.activityTitle + " · 环节凭证"}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="font-medium">{entry.activityTitle}</p><span className="text-xs text-muted-foreground">第 {entry.generation} 次 · {statuses[entry.status]}</span>
    </div>
    {entry.expiresAt && <p className="text-xs text-muted-foreground">有效至 {dateTime(entry.expiresAt)}{entry.lastUsedAt ? ` · 上次使用 ${dateTime(entry.lastUsedAt)}` : ""}</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void action("reissue")}>重签环节凭证</Button>
      <Button size="sm" variant="ghost" disabled={busy || entry.status === "revoked"} onClick={() => void action("revoke")}>吊销环节凭证</Button>
    </div>
    {feedback && <p role={error ? "alert" : "status"} className={error ? "text-xs text-rose-800" : "text-xs text-emerald-900"}>{feedback}</p>}
  </div>;
}
