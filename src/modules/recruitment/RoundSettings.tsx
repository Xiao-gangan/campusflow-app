import { useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QUESTION_TYPES, type FormQuestion, type InterviewRound, type InterviewRoundInput } from "@/shared/contracts/interview-rounds";
import type { SavedDesignTemplate } from "@/shared/contracts/open-api";
import { blankQuestion, blankRound, DIMENSIONS, formPreset, isChoice, mbtiPreset, parseRoundInput } from "@/shared/recruitment/round-config";
import { fieldClass, QUESTION_LABELS, QuestionField } from "./QuestionFields";
import { demoApi } from "./local-demo-client";
import { CustomActivityEditor } from "./CustomActivityEditor";

const checkbox = "size-4 shrink-0 accent-[#1d5343]";
const panel = "min-w-0 space-y-4 rounded-2xl border border-border/70 bg-card/90 p-4 sm:p-5";

function move<T>(items: T[], index: number, offset: number) {
  const list = [...items];
  const next = index + offset;
  [list[index], list[next]] = [list[next], list[index]];
  return list;
}

export async function downloadQuestionnaire(roundId: string) {
  const blob = await demoApi.exportQuestionnaire(roundId);
  const href = URL.createObjectURL(blob);
  const element = document.createElement("a");
  element.href = href;
  element.download = "问卷结果.csv";
  element.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function FormBuilder({ config, change }: { config: InterviewRoundInput["formConfig"]; change: (config: InterviewRoundInput["formConfig"]) => void }) {
  const [sample, setSample] = useState<Record<string, string | string[] | number>>({});
  const previewId = useId();
  const previewRef = useRef<HTMLDivElement>(null);
  const update = (questions: FormQuestion[]) => change({ ...config, questions });
  const revise = (id: string, patch: Partial<FormQuestion>) =>
    update(config.questions.map((question) => question.id === id ? { ...question, ...patch } : question));

  function usePreset(mode: Parameters<typeof formPreset>[0]) {
    if (config.questions.length && !window.confirm("用起步预设替换当前题目？")) return;
    update(formPreset(mode, () => crypto.randomUUID()));
    setSample({});
  }

  return <section className={panel} aria-labelledby="form-builder-title">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="form-builder-title" className="font-semibold">简历问卷</h2>
      <label className="flex items-center gap-2 text-sm"><input className={checkbox} type="checkbox" checked={config.enabled}
        onChange={(event) => change({ ...config, enabled: event.target.checked })} />启用简历问卷</label>
    </div>
    {config.enabled && <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => usePreset("general")}>社团通用招新简历</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => usePreset("portfolio")}>技术/设计岗作品集问卷</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => usePreset("complete")}>完整校园招新简历表（18 题）</Button>
        {config.questions.length > 4 && <Button type="button" size="sm" variant="ghost" className="xl:hidden" aria-controls={previewId}
          onClick={() => { previewRef.current?.scrollIntoView({ block: "start" }); previewRef.current?.focus({ preventScroll: true }); }}>查看填写预览</Button>}
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          {config.questions.map((question, index) => <fieldset key={question.id} data-question-id={question.id}
            className="min-w-0 space-y-2.5 rounded-xl border border-border/75 p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">问题 {index + 1}</legend>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <select aria-label={`问题 ${index + 1} 题型`} className="min-w-0 rounded-lg border border-input bg-background px-2 py-1.5 text-sm" value={question.type} onChange={(event) => {
                const type = event.target.value as FormQuestion["type"];
                revise(question.id, { type, options: isChoice(type) ? question.options.length ? question.options : ["选项 1", "选项 2"] : [] });
                setSample((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== question.id)));
              }}>
                {QUESTION_TYPES.map((type) => <option key={type} value={type}>{QUESTION_LABELS[type]}</option>)}
              </select>
              <div className="flex gap-1">
                <span className="hidden cursor-grab touch-none items-center px-1 text-muted-foreground select-none active:cursor-grabbing sm:flex"
                  title={`拖动问题 ${index + 1}`} onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }} onPointerUp={(event) => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-question-id]");
                    const destination = config.questions.findIndex(({ id }) => id === target?.dataset.questionId);
                    if (destination < 0 || destination === index) return;
                    const next = config.questions.filter(({ id }) => id !== question.id);
                    next.splice(destination, 0, question);
                    update(next);
                  }}><GripVertical className="pointer-events-none size-4" aria-hidden="true" /></span>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`上移问题 ${index + 1}`} disabled={index === 0}
                  onClick={() => update(move(config.questions, index, -1))}><ArrowUp /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`下移问题 ${index + 1}`} disabled={index === config.questions.length - 1}
                  onClick={() => update(move(config.questions, index, 1))}><ArrowDown /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`复制问题 ${index + 1}`} disabled={config.questions.length >= 40}
                  onClick={() => update([...config.questions.slice(0, index + 1), { ...question, id: crypto.randomUUID() }, ...config.questions.slice(index + 1)])}><Copy /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`删除问题 ${index + 1}`}
                  onClick={() => update(config.questions.filter((item) => item.id !== question.id))}><Trash2 /></Button>
              </div>
            </div>
            <Input aria-label={`问题 ${index + 1} 标题`} placeholder="输入题目" value={question.title} maxLength={200} onChange={(e) => revise(question.id, { title: e.target.value })} />
            <Input aria-label={`问题 ${index + 1} 说明`} placeholder="填写说明（可选）" value={question.description} maxLength={400} onChange={(e) => revise(question.id, { description: e.target.value })} />
            {isChoice(question.type)
              ? <textarea aria-label={`问题 ${index + 1} 选项`} className={fieldClass + " min-h-20"} placeholder="每行一个选项" value={question.options.join("\n")}
                onChange={(e) => revise(question.id, { options: e.target.value.split("\n") })} />
              : null}
            {["text", "textarea", "url", "select"].includes(question.type) && <Input aria-label={`问题 ${index + 1} 占位文字`} placeholder="占位文字（可选）" value={question.placeholder} maxLength={160}
                onChange={(e) => revise(question.id, { placeholder: e.target.value })} />}
            <label className="flex items-center gap-2 text-sm"><input className={checkbox} type="checkbox" checked={question.required}
              onChange={(e) => revise(question.id, { required: e.target.checked })} />必填</label>
          </fieldset>)}
          <Button type="button" size="sm" variant="outline" disabled={config.questions.length >= 40} onClick={() => update([...config.questions, blankQuestion(crypto.randomUUID())])}>
            <Plus className="size-4" />添加问题
          </Button>
        </div>
        <div id={previewId} ref={previewRef} tabIndex={-1}
          className="min-w-0 scroll-mt-36 space-y-4 rounded-xl border border-border/80 bg-background/75 p-3 sm:p-4 xl:sticky xl:top-4" aria-label="问卷填写预览">
          <h3 className="text-sm font-semibold">填写预览</h3>
          {config.questions.length === 0 && <p className="text-sm text-muted-foreground">添加问题后可在这里试填。</p>}
          {config.questions.map((question, index) => <QuestionField key={question.id} question={{
            ...question, options: [...new Set(question.options.map((option) => option.trim()).filter(Boolean))],
          }} index={index} value={sample[question.id]} onChange={(value) => setSample((current) => ({ ...current, [question.id]: value }))} />)}
        </div>
      </div>
    </>}
  </section>;
}

function MbtiBuilder({ config, change }: { config: InterviewRoundInput["mbtiConfig"]; change: (config: InterviewRoundInput["mbtiConfig"]) => void }) {
  const [dimension, setDimension] = useState(config.questions[0]?.dimension ?? "EI");
  const [expanded, setExpanded] = useState(false);
  const update = (questions: InterviewRoundInput["mbtiConfig"]["questions"]) => change({ ...config, questions });
  const enabledCount = config.questions.filter((question) => question.enabled).length;
  const setPreset = (mode: "full" | "quick") => {
    const current = JSON.stringify(config.questions);
    const edited = !(["full", "quick"] as const).some((preset) => current === JSON.stringify(mbtiPreset(preset)));
    if (!edited || !config.questions.length || window.confirm("用预设替换当前轮次的题库？")) update(mbtiPreset(mode));
  };

  return <section className={panel} aria-labelledby="mbti-builder-title">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="mbti-builder-title" className="font-semibold">MBTI 性格测评</h2>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkbox} checked={config.enabled}
        onChange={(e) => change({ ...config, enabled: e.target.checked })} />启用性格测评</label>
    </div>
    {config.enabled && <>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setPreset("full")}>完整版（88 题）</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setPreset("quick")}>快速演示版（24 题）</Button>
        <span className="text-xs text-muted-foreground" role="status">已启用 {enabledCount} 题</span>
      </div>
      <Button type="button" size="sm" variant="ghost" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>管理题库</Button>
      {expanded && <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm" aria-label="按测评维度筛选"
            value={dimension} onChange={(e) => setDimension(e.target.value as typeof dimension)}>
            {DIMENSIONS.map((item) => <option key={item}>{item}</option>)}
          </select>
          <Button type="button" size="sm" variant="outline" disabled={config.questions.length >= 160}
            onClick={() => update([...config.questions, { id: crypto.randomUUID(), dimension, direction: 1, enabled: true, text: "" }])}>新增测评题</Button>
        </div>
        <div className="grid gap-2 xl:grid-cols-2">
          {config.questions.filter((question) => question.dimension === dimension).map((question, index) => {
            const revise = (patch: Partial<typeof question>) => update(config.questions.map((item) => item.id === question.id ? { ...item, ...patch } : item));
            return <div key={question.id} className="min-w-0 space-y-2 rounded-lg border border-border/70 p-2.5">
              <textarea maxLength={240} value={question.text} aria-label={`${dimension} 题干 ${index + 1}`} placeholder="输入题干"
                className={fieldClass + " min-h-14 resize-y"} onChange={(e) => revise({ text: e.target.value })} />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={question.enabled} className={checkbox}
                  onChange={(e) => revise({ enabled: e.target.checked })} />启用此题</label>
                <select className="rounded-md border border-input bg-background px-2 py-1 text-xs" aria-label={`${dimension} 计分方向 ${index + 1}`}
                  value={question.direction} onChange={(e) => revise({ direction: e.target.value === "1" ? 1 : -1 })}>
                  <option value={1}>正向 · {dimension[0]}</option><option value={-1}>反向 · {dimension[1]}</option>
                </select>
              </div>
            </div>;
          })}
        </div>
      </div>}
    </>}
  </section>;
}

export function RoundSettings({ rounds, emailTemplates, inviteTemplates, onChanged }: {
  rounds: InterviewRound[]; emailTemplates: SavedDesignTemplate[]; inviteTemplates: SavedDesignTemplate[]; onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<{ id: string | null; value: InterviewRoundInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const active = rounds.filter((round) => !round.archivedAt);
  const archived = rounds.filter((round) => !!round.archivedAt);
  const patch = (update: Partial<InterviewRoundInput>) =>
    setEditing((current) => current ? { ...current, value: { ...current.value, ...update } } : null);

  function edit(round?: InterviewRound) {
    setError("");
    setMessage("");
    if (!round) setEditing({ id: null, value: blankRound() });
    else {
      const { name, description, defaultEmailTemplateId, defaultInviteTemplateId, formConfig, mbtiConfig, customActivities } = round;
      setEditing({ id: round.id, value: { name, description, defaultEmailTemplateId, defaultInviteTemplateId, formConfig, mbtiConfig, customActivities } });
    }
  }

  async function perform(operation: () => Promise<unknown>, label: string, refresh = true) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
      if (refresh) await onChanged();
      setMessage(label);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "操作未完成，请重试。");
    } finally {
      setBusy(false);
    }
  }

  const templateSelector = (label: string, options: SavedDesignTemplate[], value: string | null, update: (id: string | null) => void) =>
    <label className="grid min-w-0 gap-1.5 text-sm">{label}<select className={fieldClass} value={value ?? ""} onChange={(e) => update(e.target.value || null)}>
      <option value="">无默认模板</option>
      {value && !options.some((option) => option.id === value) && <option value={value}>已移除的模板</option>}
      {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select></label>;

  return <div className="min-w-0 space-y-4">
    {error && !editing && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-900">{message}</p>}
    {editing ? <div className="min-w-0 space-y-3">
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{editing.id ? "编辑轮次" : "新建轮次"}</h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(null); setError(""); }}>返回轮次列表</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">轮次名称<Input maxLength={60} value={editing.value.name} onChange={(e) => patch({ name: e.target.value })} placeholder="如 终面" /></label>
            <label className="grid gap-1.5 text-sm">轮次说明<Input maxLength={1000} value={editing.value.description} onChange={(e) => patch({ description: e.target.value })} /></label>
            {templateSelector("默认邮件模板", emailTemplates, editing.value.defaultEmailTemplateId, (id) => patch({ defaultEmailTemplateId: id }))}
            {templateSelector("默认邀请函模板", inviteTemplates, editing.value.defaultInviteTemplateId, (id) => patch({ defaultInviteTemplateId: id }))}
          </div>
        </section>
        <FormBuilder config={editing.value.formConfig} change={(formConfig) => patch({ formConfig })} />
        <MbtiBuilder config={editing.value.mbtiConfig} change={(mbtiConfig) => patch({ mbtiConfig })} />
        <CustomActivityEditor activities={editing.value.customActivities ?? []} onChange={(customActivities) => patch({ customActivities })} />
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-border/75 bg-card/95 p-2 backdrop-blur">
          {error && <p role="alert" className="mr-auto text-sm text-rose-800">{error}</p>}
          <Button type="button" onClick={() => void perform(async () => {
            const value = editing.value;
            const input = parseRoundInput({ ...value, formConfig: { ...value.formConfig, questions: value.formConfig.questions.map((question) => ({
              ...question, options: question.options.map((option) => option.trim()).filter(Boolean),
            })) } });
            await demoApi.saveRound(editing.id, input);
            setEditing(null);
          }, "轮次已保存。")}>保存轮次</Button>
        </div>
      </fieldset>
    </div> : <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">轮次列表</h2>
        <Button type="button" size="sm" disabled={busy} onClick={() => edit()}><Plus className="size-4" />新建轮次</Button>
      </div>
      {rounds.length === 0 && <p className="text-sm text-muted-foreground">未读取到轮次。请确认本机招新服务已启动。</p>}
      <div className="divide-y divide-border/70">
        {[...active, ...archived].map((round, index) => {
          const enabledActivities = round.customActivities?.filter(({ enabled }) => enabled).length ?? 0;
          return <div key={round.id} className="flex min-w-0 flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <h3 className="break-words text-sm font-semibold">{round.name}{round.archivedAt && <span className="ml-2 text-xs font-normal text-muted-foreground">已归档</span>}</h3>
              {round.description && <p className="break-words text-xs text-muted-foreground">{round.description}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{[round.kind === "offer" ? "录取确认" : "出席答复",
                ...(round.formConfig.enabled ? ["简历问卷"] : []), ...(round.mbtiConfig.enabled ? ["性格测评"] : []),
                ...(enabledActivities ? [`互动 ${enabledActivities} 项`] : [])].join(" · ")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {!round.archivedAt && <>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={"上移" + round.name} disabled={busy || index === 0}
                  onClick={() => void perform(() => demoApi.reorderRounds(move(active.map(({ id }) => id), index, -1)), "轮次顺序已更新。")}><ArrowUp /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={"下移" + round.name} disabled={busy || index === active.length - 1}
                  onClick={() => void perform(() => demoApi.reorderRounds(move(active.map(({ id }) => id), index, 1)), "轮次顺序已更新。")}><ArrowDown /></Button>
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => edit(round)} aria-label={"编辑" + round.name}>编辑</Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy || active.length <= 1} onClick={() => {
                  if (window.confirm("归档「" + round.name + "」？候选人历史和已签发链接会保留。"))
                    void perform(() => demoApi.archiveRound(round.id), "轮次已归档。");
                }}>归档</Button>
              </>}
              <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={`导出${round.name}问卷 CSV`}
                onClick={() => void perform(() => downloadQuestionnaire(round.id), "CSV 已生成。", false)}>导出问卷 CSV</Button>
            </div>
          </div>;
        })}
      </div>
    </section>}
  </div>;
}
