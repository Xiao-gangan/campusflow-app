import { BROWSER_DEMO, subscribeToBrowserDemo } from "../browser-demo/mode";
import { useEffect, useState } from "react";
import type { RoundSubmission } from "@/shared/contracts/interview-rounds";
import type { RosterCandidate } from "@/shared/contracts/recruitment-console";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PersonalityCard, QuestionAnswers } from "./QuestionFields";
import { demoApi } from "./local-demo-client";
import { dateTime } from "./recruitment-labels";

import { responseLabels } from "@/shared/recruitment/round-presentation";
import { RoundReviewForm } from "./RoundReviewForm";
import { ActivityResultCard } from "./ActivityResultCard";
import { ActivityCredentialControls } from "./ActivityCredentialControls";

export function CandidateSubmissions({ candidate, onClose, onReviewed }: { candidate: RosterCandidate; onClose: () => void; onReviewed: () => void }) {
  const [rows, setRows] = useState<RoundSubmission[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    demoApi.submissions(candidate.id).then((result) => { if (active) setRows(result); })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "读取失败。"); });
    const unsubscribe = subscribeToBrowserDemo(() => setAttempt((n) => n + 1));
    return () => { active = false; unsubscribe(); };
  }, [candidate.id, attempt]);

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{candidate.name} · 面试记录</DialogTitle><DialogDescription>各轮出席答复与已提交的环节</DialogDescription></DialogHeader>
      {error ? <div role="alert" className="space-y-2 text-sm text-rose-800">{error}<Button size="sm" variant="outline" onClick={() => { setError(""); setAttempt((n) => n + 1); }}>重试</Button></div>
        : !rows ? <p className="text-sm text-muted-foreground">正在读取面试记录…</p>
        : <div className="space-y-3">{rows.map((round) => <section className="min-w-0 space-y-2 rounded-xl border border-border/70 p-3" key={round.roundId}>
          <h3 className="break-words font-semibold">{round.roundName}</h3>
          {round.invitations.length === 0 && <p className="text-sm text-muted-foreground">尚未签发邀请</p>}
          {round.invitations.map((invite, index) => <details key={invite.inviteId} open={index === 0 || undefined} className="min-w-0 rounded-lg border border-border/60 p-2.5">
            <summary className="cursor-pointer text-sm font-medium">{responseLabels(round.roundKind).step} · {responseLabels(round.roundKind).status[invite.rsvpStatus]} · {dateTime(invite.issuedAt)}</summary>
            <div className="mt-3 min-w-0 space-y-3 text-sm">
              {invite.form && <div className="min-w-0 space-y-1.5">
                <h4 className="font-semibold">问卷答案</h4>
                <QuestionAnswers questions={invite.form.questions} answers={invite.form.answers} />
              </div>}
              {invite.mbti && <PersonalityCard result={invite.mbti.result} />}
              {!!invite.customActivities?.length && <div className="min-w-0 space-y-2">
                <h4 className="font-semibold">互动结果</h4>
                {invite.customActivities.map((activity) => <ActivityResultCard key={`${activity.activityId}:${activity.generation}`} result={activity}
                  title={activity.kind === "external_app" ? `${activity.title} · 第 ${activity.generation} 次` : activity.title} submittedAt={activity.submittedAt} />)}
              </div>}
              {!!invite.activityCredentials?.length && <div className="min-w-0 space-y-2">
                <h4 className="font-semibold">{BROWSER_DEMO ? "互动环节凭证" : "外部环节凭证"}</h4>
                {invite.activityCredentials.map((credential) => <ActivityCredentialControls key={credential.activityId} initial={credential}
                  candidateId={candidate.id} inviteId={invite.inviteId} onChanged={onReviewed} />)}
              </div>}
              {!invite.form && !invite.mbti && !invite.customActivities?.length && <p className="text-muted-foreground">暂无已提交环节。</p>}
            </div>
          </details>)}
          <RoundReviewForm candidateId={candidate.id} roundId={round.roundId} review={round.review} onReviewed={(review) => {
            setRows((current) => current?.map((item) => item.roundId === round.roundId ? { ...item, review } : item) ?? null);
            onReviewed();
          }} />
        </section>)}</div>}
    </DialogContent>
  </Dialog>;
}
