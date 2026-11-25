import { subscribeToBrowserDemo } from "../browser-demo/mode";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { CandidateInvite } from "@/shared/contracts/candidate-invite";
import type { RsvpResponseValue } from "@/shared/contracts/recruitment";
import { isActivityTerminal } from "@/shared/contracts/interview-rounds";
import { responseLabels } from "@/shared/recruitment/round-presentation";
import { InviteActivitiesPanel } from "./InviteActivitiesPanel";
import { InvitePageView } from "./InvitePageView";
import { inviteRequest, InviteRequestError } from "./rsvp-client";

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
function readToken() {
  return (
    window.location.hash.match(/^#\/invite\/([a-f0-9]{64})$/u)?.[1]
    ?? new URLSearchParams(window.location.hash.split("?")[1]).get("token") ?? ""
  );
}
export default function CandidateInvitePage() {
  const token = useSyncExternalStore(subscribe, readToken);
  return <Invitation key={token} token={token} />;
}

type ViewState = {
  phase: "reading" | "ready" | "saving" | "recoverable" | "closed";
  message?: string;
};

type InviteAction =
  | { type: "read"; afterConflict?: boolean }
  | { type: "reply"; response: RsvpResponseValue; version: number };

function Invitation({ token }: { token: string }) {
  const [completed, setCompleted] = useState({ form: false, mbti: false });
  const [completedCustom, setCompletedCustom] = useState<Record<string, boolean>>({});
  const [invite, setInvite] = useState<CandidateInvite | null>(null);
  const [view, setView] = useState<ViewState>({ phase: "reading" });
  const request = useRef<AbortController | null>(null);
  const url = `/api/v1/rsvp/${encodeURIComponent(token)}`;

  const sync = useCallback(
    async function sync(action: InviteAction) {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      const saving = action.type === "reply";
      setView({
        phase: saving ? "saving" : "reading",
        message: saving
          ? "正在保存答复…"
          : action.afterConflict
            ? "答复已在其他页面更新，正在读取最新结果…"
            : "正在读取最新答复…",
      });
      try {
        const latest = await inviteRequest<CandidateInvite>(url, {
          signal: controller.signal,
          ...(saving
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  response: action.response,
                  version: action.version,
                }),
              }
            : {}),
        });
        if (request.current !== controller) return;
        setInvite(latest);
        setView({
          phase: "ready",
          message:
            !saving && action.afterConflict
              ? "答复已在其他页面更新。"
              : undefined,
        });
      } catch (error) {
        if (request.current !== controller) return;
        if (error instanceof InviteRequestError) {
          if (error.status === 404 || error.status === 410) {
            setInvite(null);
            setView({ phase: "closed", message: error.message });
            return;
          }
          if (saving && error.status === 409) {
            void sync({ type: "read", afterConflict: true });
            return;
          }
        }
        setView({
          phase: "recoverable",
          message: saving
            ? "暂时无法确认答复是否已保存。"
            : "暂时无法读取最新答复，请稍后再试。",
        });
      } finally {
        window.clearTimeout(timeout);
        if (request.current === controller) request.current = null;
      }
    },
    [url],
  );

  useEffect(() => {
    if (!/^[0-9a-f]{64}$/.test(token)) {
      setView({
        phase: "closed",
        message: "邀请链接无效，请使用组织发给你的完整链接。",
      });
      return;
    }
    void sync({ type: "read" });
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void sync({ type: "read" });
      }
    };
    window.addEventListener("pageshow", restore);
    const unsubscribe = subscribeToBrowserDemo(() => { if (!request.current) void sync({ type: "read" }); });
    return () => {
      unsubscribe();
      window.removeEventListener("pageshow", restore);
      request.current?.abort();
      request.current = null;
    };
  }, [sync, token]);

  function respond(response: RsvpResponseValue) {
    if (invite && view.phase === "ready" && !request.current) {
      void sync({ type: "reply", response, version: invite.version });
    }
  }

  if (!invite)
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">面试邀请</h1>
        <p role="status">
          {view.phase === "reading" ? "正在读取邀请…" : view.message}
        </p>
        {view.phase === "recoverable" && (
          <button
            className="self-start underline"
            onClick={() => void sync({ type: "read" })}
          >
            重新读取邀请
          </button>
        )}
      </main>
    );
  const labels = responseLabels(invite.roundKind);
  const status = labels.status[invite.rsvpStatus];
  const offer = invite.roundKind === "offer";
  const steps = [
    { id: "reply", label: labels.step, done: invite.rsvpStatus !== "pending" },
    ...(invite.activities?.form ? [{ id: "form", label: "简历问卷", done: completed.form || !!invite.activities.form.submittedAt }] : []),
    ...(invite.activities?.mbti ? [{ id: "mbti", label: "性格测评", done: completed.mbti || !!invite.activities.mbti.submittedAt }] : []),
    ...(invite.activities?.customActivities ?? []).map((activity) => ({ id: "custom:" + activity.id, label: activity.title,
      done: completedCustom[activity.id] ?? isActivityTerminal(activity.submission) })),
  ];
  const firstPending = steps.findIndex(({ done }) => !done);
  const date = (iso: string) =>
    new Date(iso).toLocaleString("zh-CN", { hour12: false });
  return (
    <InvitePageView
      document={invite.document}
      context={invite.context}
      candidateResponseTitle={offer ? labels.title : undefined}
      candidateResponse={
        <div role="group" aria-label={labels.title} className="mt-4 space-y-3">
          {steps.length > 1 && <ol aria-label="本轮环节进度" className="flex flex-wrap gap-1.5 text-xs">
            {steps.map(({ id, label, done }, index) => <li key={id}
              aria-current={index === firstPending ? "step" : undefined}
              className="min-w-0 max-w-full rounded-full border border-current/15 px-2 py-1 [overflow-wrap:anywhere]">
              {done ? <span aria-label="已完成">✓ </span> : `${index + 1}. `}{label}
            </li>)}
          </ol>}
          <div className="space-y-1 text-sm leading-6">
            <p className="font-medium">
              {invite.context.candidate_name} · {offer ? invite.context.department
                : `${invite.context.interview_time} · ${invite.context.interview_location}`}
            </p>
            <p className="text-xs opacity-75">
              截止 {date(invite.expiresAt)}，此前可随时修改答复。
            </p>
          </div>
          <div
            className={
              view.phase === "recoverable"
                ? "rounded-xl border border-current/25 bg-black/[0.03] px-3.5 py-2.5"
                : "rounded-xl border border-current/12 bg-black/[0.02] px-3.5 py-2"
            }
          >
            <div role="status" aria-live="polite" className="text-sm leading-6">
              {view.message ? <span>{view.message} </span> : null}
              {view.phase === "ready" ? (
                <strong>
                  当前状态：{status}
                  {invite.respondedAt ? ` · ${date(invite.respondedAt)}` : ""}
                </strong>
              ) : null}
            </div>
            {view.phase === "recoverable" ? (
              <button
                type="button"
                className="mt-1 min-h-9 rounded-sm text-sm font-medium underline underline-offset-4"
                onClick={() => void sync({ type: "read" })}
              >
                查看最新答复
              </button>
            ) : null}
          </div>
          <div className="invite-actions">
            <button
              type="button"
              className="invite-action invite-action-primary disabled:opacity-55"
              disabled={
                view.phase !== "ready" || invite.rsvpStatus === "confirmed"
              }
              onClick={() => respond("attending")}
            >
              {labels.confirm}
            </button>
            <button
              type="button"
              className="invite-action invite-action-secondary disabled:opacity-55"
              disabled={
                view.phase !== "ready" || invite.rsvpStatus === "cancelled"
              }
              onClick={() => respond("not_attending")}
            >
              {labels.decline}
            </button>
          </div>
          {invite.activities && <InviteActivitiesPanel url={url} activities={invite.activities}
            onSubmitted={(kind) => setCompleted((current) => ({ ...current, [kind]: true }))}
            onCustomChanged={(id, done) => setCompletedCustom((current) => ({ ...current, [id]: done }))} />}
        </div>
      }
    />
  );
}
