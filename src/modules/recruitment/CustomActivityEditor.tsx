import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CUSTOM_ACTIVITY_DEFAULT_HEIGHT, CUSTOM_ACTIVITY_LIMIT, CUSTOM_ACTIVITY_MAX_HEIGHT, CUSTOM_ACTIVITY_MIN_HEIGHT,
  type CustomActivity, type CustomActivityResult,
} from "@/shared/contracts/interview-rounds";
import { parseCustomActivities } from "@/shared/recruitment/custom-activities";
import { activityExample } from "./activity-example";
import { ActivityResultCard } from "./ActivityResultCard";
import { CustomActivityFrame } from "./CustomActivityFrame";
import { fieldClass } from "./QuestionFields";

type Widget = Extract<CustomActivity, { kind: "sandbox_widget" }>;
const emptyHtml = "<main><h1>我的互动环节</h1></main>";

export function CustomActivityEditor({ activities, onChange }: { activities: CustomActivity[]; onChange: (items: CustomActivity[]) => void }) {
  const [preview, setPreview] = useState<{ run: number; activity: Widget } | null>(null);
  const [result, setResult] = useState<CustomActivityResult | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  function add(example = false) {
    onChange([...activities, {
      id: crypto.randomUUID(), title: example ? "校园协作情景快答" : "新互动环节", description: example ? "用三道情景题完成一次校园协作练习。" : "",
      kind: "sandbox_widget", enabled: true, required: true, html: example ? activityExample : emptyHtml,
    }]);
  }
  function swap(index: number, offset: number) {
    const next = [...activities];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  }
  function play(activity: Widget) {
    try {
      const [validated] = parseCustomActivities([activity]);
      if (validated.kind !== "sandbox_widget") return;
      setError(null);
      setResult(null);
      setPreview((current) => ({ run: (current?.run ?? 0) + 1, activity: validated }));
    } catch (failure) {
      setError({ id: activity.id, message: failure instanceof Error ? failure.message : "请检查互动配置。" });
    }
  }

  return <section className="min-w-0 space-y-4 rounded-2xl border border-border/70 bg-card/90 p-4 sm:p-5" aria-labelledby="custom-activity-editor-title">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="custom-activity-editor-title" className="font-semibold">自定义互动环节</h2>
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="outline" onClick={() => add(true)} disabled={activities.length >= CUSTOM_ACTIVITY_LIMIT}>载入示例：校园协作情景快答</Button>
        <Button type="button" size="sm" onClick={() => add()} disabled={activities.length >= CUSTOM_ACTIVITY_LIMIT}><Plus aria-hidden="true" className="size-4" />添加环节</Button>
      </div>
    </div>
    {activities.map((item, index) => {
      const update = (next: CustomActivity) => onChange(activities.map((entry) => entry.id === item.id ? next : entry));
      const playing = preview?.activity.id === item.id ? preview : null;
      return <div key={item.id} role="group" aria-label={`互动环节 ${index + 1}`} className="min-w-0 space-y-3 rounded-xl border border-border/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="break-all text-sm font-medium">{item.title || "未命名环节"}</span>
          <div className="flex gap-1">
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`上移环节 ${index + 1}`} disabled={index === 0} onClick={() => swap(index, -1)}><ArrowUp /></Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`下移环节 ${index + 1}`} disabled={index === activities.length - 1} onClick={() => swap(index, 1)}><ArrowDown /></Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`删除环节 ${index + 1}`} onClick={() => {
              if (playing) setPreview(null);
              onChange(activities.filter((entry) => entry.id !== item.id));
            }}><Trash2 /></Button>
          </div>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1.5 text-sm">环节名称<Input value={item.title} maxLength={80} onChange={(e) => update({ ...item, title: e.target.value })} /></label>
          <label className="grid min-w-0 gap-1.5 text-sm">环节类型<select className={fieldClass} value={item.kind} onChange={(e) => {
            const { id, title, description, enabled, required } = item;
            const base = { id, title, description, enabled, required };
            if (playing) setPreview(null);
            update(e.target.value === "external_app" ? { ...base, kind: "external_app", url: "" } : { ...base, kind: "sandbox_widget", html: emptyHtml });
          }}><option value="sandbox_widget">内嵌沙箱小游戏（HTML/JS）</option><option value="external_app">外部应用链接（URL）</option></select></label>
        </div>
        <label className="grid min-w-0 gap-1.5 text-sm">环节说明（选填）
          <Input value={item.description ?? ""} maxLength={400} onChange={(e) => update({ ...item, description: e.target.value })} />
        </label>
        {item.kind === "sandbox_widget" ? <>
          <label className="grid min-w-0 gap-1.5 text-sm">单文件 HTML
            <textarea className={`${fieldClass} min-h-28 font-mono text-xs`} spellCheck={false} value={item.html} onChange={(e) => update({ ...item, html: e.target.value })} />
          </label>
          <label className="grid w-36 gap-1.5 text-sm">窗口高度（px）<Input type="number" min={CUSTOM_ACTIVITY_MIN_HEIGHT} max={CUSTOM_ACTIVITY_MAX_HEIGHT}
            placeholder={String(CUSTOM_ACTIVITY_DEFAULT_HEIGHT)} value={item.height ?? ""} onChange={(e) => update({ ...item, height: e.target.value ? Number(e.target.value) : undefined })} /></label>
        </> : <label className="grid min-w-0 gap-1.5 text-sm">外部应用地址<Input type="url" placeholder="https://" value={item.url} maxLength={2048}
          onChange={(e) => update({ ...item, url: e.target.value })} /></label>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-primary" checked={item.enabled} onChange={(e) => update({ ...item, enabled: e.target.checked })} />启用</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-primary" checked={item.required} onChange={(e) => update({ ...item, required: e.target.checked })} />必做</label>
          {item.kind === "sandbox_widget" && <Button type="button" size="sm" variant="outline" onClick={() => play(item)}>{playing ? "重新试玩" : "试玩预览"}</Button>}
          {playing && <Button type="button" size="sm" variant="ghost" onClick={() => setPreview(null)}>关闭试玩</Button>}
        </div>
        {error?.id === item.id && <p role="alert" className="text-sm text-rose-800">{error.message}</p>}
        {playing && <div className="min-w-0 space-y-2 border-t border-border/70 pt-3">
          <CustomActivityFrame key={playing.run} activity={playing.activity} onSubmit={setResult} />
          {result ? <ActivityResultCard result={result} preview /> : <p role="status" className="text-sm text-muted-foreground">等待试玩结果</p>}
        </div>}
      </div>;
    })}
  </section>;
}
