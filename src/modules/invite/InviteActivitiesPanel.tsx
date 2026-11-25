import { useState } from "react";
import type { FormAnswers, InviteActivities, MbtiAnswers } from "@/shared/contracts/interview-rounds";
import { PERSONALITY_SCALE } from "@/shared/recruitment/personality-questions";
import { Button } from "@/components/ui/button";
import { PersonalityCard, QuestionAnswers, QuestionField } from "../recruitment/QuestionFields";
import { inviteRequest } from "./rsvp-client";
import { InviteCustomActivity } from "./InviteCustomActivity";

function useActivity<K extends "form" | "mbti">(url: string, kind: K, initial: NonNullable<InviteActivities[K]>, onSubmitted: (kind: K) => void) {
  const [progress, setProgress] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function persist(answers: FormAnswers | MbtiAnswers, mode: "draft" | "submit") {
    if (busy) return false;
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      const response = await inviteRequest<InviteActivities>(url + "/" + kind, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ answers, mode, revision: progress.revision }),
      });
      const latest = response[kind];
      if (latest) setProgress(latest);
      if (latest?.submittedAt) onSubmitted(kind);
      setMessage(latest?.submittedAt ? "已提交" : "进度已保存，刷新后可继续。");
      return true;
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "暂时无法保存，请重试。");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { progress, busy, persist, status: message ? <p role={failed ? "alert" : "status"} className={failed ? "text-sm text-rose-800" : "text-sm text-emerald-900"}>{message}</p> : null };
}

type ActivitySubmitted = (kind: "form" | "mbti") => void;

function InviteQuestionnaire({ url, form, onSubmitted }: { url: string; form: NonNullable<InviteActivities["form"]>; onSubmitted: ActivitySubmitted }) {
  const { progress, busy, persist, status } = useActivity(url, "form", form, onSubmitted);
  const [open, setOpen] = useState(!form.submittedAt);
  const [answers, setAnswers] = useState<FormAnswers>(form.answers);
  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="min-w-0 rounded-xl border border-current/15 p-3">
    <summary className="cursor-pointer text-sm font-semibold">简历问卷{progress.submittedAt ? " · 已提交" : ""}</summary>
    {progress.submittedAt ? <div className="mt-3 space-y-2 text-sm">
      <p className="font-medium" role="status">你的问卷已提交。</p>
      <QuestionAnswers questions={progress.questions} answers={progress.answers} />
    </div> : <form className="mt-3 space-y-4" onSubmit={(event) => {
      event.preventDefault();
      void persist(answers, "submit");
    }}>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        {progress.questions.map((question, index) => <QuestionField key={question.id} question={question} index={index} value={answers[question.id]}
          onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} />)}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void persist(answers, "draft")}>保存问卷草稿</Button>
          <Button type="submit" size="sm">提交问卷</Button>
        </div>
      </fieldset>
      {status}
    </form>}
  </details>;
}

const PAGE_SIZE = 6;
function InviteMbti({ url, mbti, onSubmitted }: { url: string; mbti: NonNullable<InviteActivities["mbti"]>; onSubmitted: ActivitySubmitted }) {
  const { progress, busy, persist, status } = useActivity(url, "mbti", mbti, onSubmitted);
  const [open, setOpen] = useState(!mbti.submittedAt);
  const [answers, setAnswers] = useState<MbtiAnswers>(mbti.answers);
  const [page, setPage] = useState(() => {
    const firstUnanswered = mbti.questions.findIndex((question) => !Object.hasOwn(mbti.answers, question.id));
    return Math.floor(Math.max(0, firstUnanswered) / PAGE_SIZE);
  });
  const count = progress.questions.length;
  const pageCount = Math.ceil(count / PAGE_SIZE);
  const answered = Object.keys(answers).length;
  const percent = count ? Math.round(answered * 100 / count) : 0;
  const visible = progress.questions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="min-w-0 rounded-xl border border-current/15 p-3">
    <summary className="cursor-pointer text-sm font-semibold">MBTI 性格测评{progress.submittedAt ? " · " + progress.result?.type : ""}</summary>
    <div className="mt-3 space-y-3">
      <div className="space-y-1.5">
        <div className="flex justify-between gap-2 text-xs">
          <span>已答 {answered} / {count} 题</span><span className="tabular-nums">{percent}%</span>
        </div>
        <div role="progressbar" aria-label="性格测评进度" aria-valuenow={percent}
          className="h-2 overflow-hidden rounded-full bg-current/10">
          <div className="h-full rounded-full bg-primary" style={{ width: percent + "%" }} />
        </div>
      </div>
      {progress.result ? <PersonalityCard result={progress.result} /> : <>
        <p className="text-xs leading-5 opacity-75">第 {page + 1} / {pageCount} 组 · 结果供校园协作破冰参考。</p>
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          {visible.map((question, index) => <fieldset key={question.id} className="min-w-0 rounded-lg border border-current/15 px-2 pb-2.5">
            <legend className="max-w-full px-1 text-sm font-medium [overflow-wrap:anywhere]">{page * PAGE_SIZE + index + 1}. {question.text}</legend>
            <div className="mt-1 grid grid-cols-5 gap-1">
              {PERSONALITY_SCALE.map(({ value, label }) => <label key={label}
                className="flex min-h-11 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-current/10 px-0.5 py-1 text-center text-[10px] leading-tight has-checked:bg-emerald-100 has-checked:text-emerald-950">
                <input name={question.id} type="radio" aria-label={label} className="size-3.5 accent-[#1d5343]" checked={answers[question.id] === value}
                  onChange={() => setAnswers((current) => ({ ...current, [question.id]: value }))} />
                {label}
              </label>)}
            </div>
          </fieldset>)}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>上一组</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void persist(answers, "draft")}>保存测评进度</Button>
            {page + 1 < pageCount
              ? <Button type="button" size="sm" onClick={async () => { if (await persist(answers, "draft")) setPage(page + 1); }}>下一组</Button>
              : <Button type="button" size="sm" disabled={answered !== count} onClick={() => void persist(answers, "submit")}>提交测评</Button>}
          </div>
        </fieldset>
        {status}
      </>}
    </div>
  </details>;
}

export function InviteActivitiesPanel({ url, activities, onSubmitted, onCustomChanged }: {
  url: string; activities: InviteActivities; onSubmitted: ActivitySubmitted; onCustomChanged: (activityId: string, done: boolean) => void;
}) {
  const custom = activities.customActivities ?? [];
  if (!activities.form && !activities.mbti && !custom.length) return null;
  return <div className="grid min-w-0 gap-3 border-t border-current/15 pt-3" aria-label="本轮面试环节">
    <p className="text-xs font-medium opacity-75">{activities.roundName} · 面试环节</p>
    {activities.form && <InviteQuestionnaire url={url} form={activities.form} onSubmitted={onSubmitted} />}
    {activities.mbti && <InviteMbti url={url} mbti={activities.mbti} onSubmitted={onSubmitted} />}
    {custom.map((activity) => <InviteCustomActivity key={activity.id + ":" + activity.generation} url={url} activity={activity} onChanged={(done) => onCustomChanged(activity.id, done)} />)}
  </div>;
}
