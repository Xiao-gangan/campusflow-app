import { useEffect, useState, type ReactNode } from "react";
import { candidateCsvTemplate, candidateCsvTemplateName } from "@/shared/recruitment/candidate-csv";
import { APPLICANT_STATUSES, type ApplicantStatus } from "@/shared/contracts/domain";
import type {
  CandidateImportPreview,
  CandidateInput,
  RosterCandidate,
} from "@/shared/contracts/recruitment-console";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { demoApi } from "./local-demo-client";
import { emptyCandidateInput, STAGE_LABELS } from "./recruitment-labels";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function CandidateImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (message: string) => Promise<void>;
}) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<CandidateImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setCsv("");
    setPreview(null);
    setBusy(false);
    setError("");
  }, [open]);

  async function run(commit: boolean) {
    if (!csv.trim()) {
      setError("请粘贴 CSV 或选择文件。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await demoApi.importCandidates(csv, commit);
      setPreview(result);
      if (commit) {
        const skipped = result.skipped.length
          ? `，${result.skipped.length} 行在写入时被跳过`
          : "";
        await onImported(`已导入 ${result.created.length} 名候选人${skipped}。`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "CSV 处理失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>CSV 导入候选人</DialogTitle>
          <DialogDescription>
            先预览逐行校验结果，再导入有效行；同周期重复邮箱会自动标出并跳过。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-xs">CSV 内容</Label>
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="cursor-pointer rounded-md border border-input px-2.5 py-1 text-xs font-medium hover:bg-muted">
                选择 CSV 文件
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setPreview(null);
                    setError("");
                    void file.text().then(setCsv).catch(() => setError("无法读取该文件。"));
                  }}
                />
              </label>
              <Button type="button" size="sm" variant="outline" onClick={() => {
                const href = URL.createObjectURL(new Blob([candidateCsvTemplate], { type: "text/csv;charset=utf-8" }));
                const link = document.createElement("a");
                link.href = href;
                link.download = candidateCsvTemplateName;
                link.click();
                window.setTimeout(() => URL.revokeObjectURL(href), 1000);
              }}>下载 CSV 模板</Button>
              <button
                type="button"
                className="text-xs text-primary underline underline-offset-2"
                onClick={() => {
                  setPreview(null);
                  setCsv(
                    "姓名,邮箱,部门,阶段,面试日期,开始时间,结束时间,地点,备注\n苏晓,su.xiao@example.test,技术部,新申请,2026-11-25,10:00,10:30,信息楼 A305,CSV 示例\n何川,he.chuan@example.test,设计部,筛选,2026-11-26,15:00,15:30,信息楼 A306,CSV 示例\n林知夏,lin@example.test,技术部,面试,,,,\n错误邮箱,not-an-email,运营部,新申请,,,,",
                  );
                }}
              >
                填入示例
              </button>
            </div>
          </div>
          <Textarea
            value={csv}
            onChange={(event) => {
              setCsv(event.target.value);
              setPreview(null);
            }}
            rows={6}
            placeholder="姓名,邮箱,部门,阶段,面试日期,开始时间,结束时间,地点,备注"
            aria-label="CSV 内容"
            className="font-mono text-xs"
          />
          <p className="text-[11px] leading-4 text-muted-foreground">
            必需列：姓名、邮箱、部门。阶段支持 new / screening / interview / accepted / rejected 或中文标签。
          </p>
        </div>
        {error ? (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        ) : null}
        {preview ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {preview.cycle} · 有效 {preview.validCount} 行 · 错误 {preview.errorCount} 行 · 重复{" "}
              {preview.duplicateCount} 行
            </p>
            <div className="max-h-[38vh] overflow-auto rounded-xl border border-border/60">
              <table className="w-full min-w-[540px] text-left text-xs">
                <thead className="sticky top-0 bg-muted/85 text-muted-foreground">
                  <tr>
                    <th className="px-2.5 py-2 font-medium">行</th>
                    <th className="px-2.5 py-2 font-medium">姓名</th>
                    <th className="px-2.5 py-2 font-medium">邮箱</th>
                    <th className="px-2.5 py-2 font-medium">部门</th>
                    <th className="px-2.5 py-2 font-medium">阶段</th>
                    <th className="px-2.5 py-2 font-medium">结果</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr
                      key={`${row.row}-${row.email}`}
                      className={
                        row.valid
                          ? "border-t border-border/50"
                          : "border-t border-border/50 bg-rose-50/60"
                      }
                    >
                      <td className="px-2.5 py-2 text-muted-foreground">{row.row}</td>
                      <td className="px-2.5 py-2">{row.name || "—"}</td>
                      <td className="max-w-[180px] truncate px-2.5 py-2">{row.email || "—"}</td>
                      <td className="px-2.5 py-2">{row.department || "—"}</td>
                      <td className="px-2.5 py-2">{row.stage}</td>
                      <td className="px-2.5 py-2">
                        {row.valid ? (
                          <span className="text-emerald-700">可导入</span>
                        ) : (
                          <span className="text-rose-800">{row.issues.join(" ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void run(false)}>
            {busy ? "处理中…" : "预览导入"}
          </Button>
          <Button type="button" disabled={busy || !preview?.validCount} onClick={() => void run(true)}>
            导入 {preview?.validCount ?? 0} 人
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CandidateDialog({
  state,
  onOpenChange,
  onSaved,
}: {
  state: { candidate: RosterCandidate | null } | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [form, setForm] = useState<CandidateInput>(emptyCandidateInput);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!state) return;
    setError("");
    setForm(
      state.candidate
        ? {
            name: state.candidate.name,
            email: state.candidate.email,
            department: state.candidate.department,
            stage: state.candidate.stage,
            note: state.candidate.note,
            interviewDate: state.candidate.interviewDate,
            startTime: state.candidate.startTime,
            endTime: state.candidate.endTime,
            location: state.candidate.location,
          }
        : emptyCandidateInput(),
    );
  }, [state]);

  async function save() {
    if (!state || saving) return;
    setSaving(true);
    setError("");
    try {
      if (state.candidate) {
        await demoApi.updateCandidate(state.candidate.id, form);
        await onSaved(`已更新 ${form.name.trim()}。`);
      } else {
        await demoApi.createCandidate(form);
        await onSaved(`已新增 ${form.name.trim()}。`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存候选人失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-card sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{state?.candidate ? "编辑候选人" : "新增候选人"}</DialogTitle>
          <DialogDescription>同招新周期内候选人邮箱不能重复。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="姓名">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="邮箱">
            <Input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </Field>
          <Field label="部门">
            <Input
              value={form.department}
              onChange={(event) => setForm({ ...form, department: event.target.value })}
            />
          </Field>
          <Field label="招新阶段">
            <select
              value={form.stage}
              onChange={(event) =>
                setForm({ ...form, stage: event.target.value as ApplicantStatus })
              }
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm leading-9"
            >
              {APPLICANT_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {STAGE_LABELS[item]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="面试日期">
            <Input
              type="date"
              value={form.interviewDate ?? ""}
              onChange={(event) =>
                setForm({ ...form, interviewDate: event.target.value })
              }
            />
          </Field>
          <Field label="面试地点">
            <Input
              value={form.location ?? ""}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
            />
          </Field>
          <Field label="开始时间">
            <Input
              type="time"
              value={form.startTime ?? ""}
              onChange={(event) => setForm({ ...form, startTime: event.target.value })}
            />
          </Field>
          <Field label="结束时间">
            <Input
              type="time"
              value={form.endTime ?? ""}
              onChange={(event) => setForm({ ...form, endTime: event.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="备注">
              <Textarea
                value={form.note ?? ""}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                rows={2}
              />
            </Field>
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-xs text-rose-700">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
