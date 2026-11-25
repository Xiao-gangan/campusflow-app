import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CUSTOM_ACTIVITY_DEFAULT_HEIGHT, CUSTOM_ACTIVITY_MIN_HEIGHT, CUSTOM_ACTIVITY_RESIZE_MAX,
  CUSTOM_ACTIVITY_RESIZE_MESSAGE, CUSTOM_ACTIVITY_SUBMIT_MESSAGE, CUSTOM_ACTIVITY_PROGRESS_MESSAGE, CUSTOM_ACTIVITY_READY_MESSAGE,
  CUSTOM_ACTIVITY_RESTORE_MESSAGE, type CustomActivity, type CustomActivityResult, type CustomActivitySubmission,
} from "@/shared/contracts/interview-rounds";
import { isDataObject, parseCustomActivityResult } from "@/shared/recruitment/custom-activities";

type Widget = Extract<CustomActivity, { kind: "sandbox_widget" }>;
const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";

export function CustomActivityFrame({ activity, onSubmit, resume }: {
  activity: Widget; onSubmit: (result: CustomActivityResult) => void; resume?: CustomActivitySubmission | null;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(activity.height ?? CUSTOM_ACTIVITY_DEFAULT_HEIGHT);
  const [error, setError] = useState("");
  const source = useMemo(() => `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1">${activity.html}`, [activity.html]);

  useLayoutEffect(() => {
    function receive(event: MessageEvent) {
      const frame = iframe.current?.contentWindow;
      if (!frame || event.source !== frame || event.origin !== "null" || !isDataObject(event.data)) return;
      const { type, activityId, ...data } = event.data;
      if (activityId !== undefined && activityId !== activity.id) return;
      if (type === CUSTOM_ACTIVITY_READY_MESSAGE) {
        const saved = resume?.status === "in_progress" ? { progress: resume.progress, progressText: resume.progressText,
          payload: resume.payload, revision: resume.revision } : null;
        frame.postMessage({ type: CUSTOM_ACTIVITY_RESTORE_MESSAGE, activityId: activity.id, saved }, "*");
        return;
      }
      if (type === CUSTOM_ACTIVITY_RESIZE_MESSAGE) {
        if (typeof data.height === "number" && Number.isFinite(data.height))
          setHeight(Math.max(CUSTOM_ACTIVITY_MIN_HEIGHT, Math.min(CUSTOM_ACTIVITY_RESIZE_MAX, Math.round(data.height))));
        return;
      }
      if (type !== CUSTOM_ACTIVITY_SUBMIT_MESSAGE && type !== CUSTOM_ACTIVITY_PROGRESS_MESSAGE) return;
      try {
        const progress = type === CUSTOM_ACTIVITY_PROGRESS_MESSAGE;
        if (data.status !== undefined && (progress ? data.status !== "in_progress" : data.status === "in_progress"))
          throw new Error("互动消息与状态不匹配。");
        const result = parseCustomActivityResult(progress ? { ...data, status: "in_progress" } : data);
        setError("");
        onSubmit(result);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "互动环节返回了无效结果。");
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [activity.id, onSubmit, resume]);

  return <div className="min-w-0 space-y-2">
    <iframe ref={iframe} title={activity.title} sandbox="allow-scripts" referrerPolicy="no-referrer"
      srcDoc={source} style={{ height }} className="block w-full min-w-0 rounded-lg border border-current/10 bg-white" />
    {error && <p role="alert" className="text-xs text-rose-800">{error}</p>}
  </div>;
}
