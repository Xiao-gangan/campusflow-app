import type { ActivityPayload } from "@/shared/contracts/interview-rounds";

export function ActivityResultDetails({ payload }: { payload: ActivityPayload }) {
  return <details className="min-w-0 rounded-md border border-current/10 p-2 text-xs">
    <summary className="cursor-pointer font-medium">查看原始数据</summary>
    <dl className="mt-2 min-w-0 space-y-2">
      {Object.entries(payload).map(([key, value]) => <div key={key} className="min-w-0 [overflow-wrap:anywhere]">
        <dt className="font-medium">{key}</dt>
        <dd className="whitespace-pre-wrap opacity-80">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</dd>
      </div>)}
    </dl>
  </details>;
}
