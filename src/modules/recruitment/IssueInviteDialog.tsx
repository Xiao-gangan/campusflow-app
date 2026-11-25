import { useState } from "react";
import type { InterviewRound } from "@/shared/contracts/interview-rounds";
import type { SavedDesignTemplate } from "@/shared/contracts/open-api";
import type { RosterCandidate } from "@/shared/contracts/recruitment-console";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useOrganizationProfile } from "../org/organization";
import { demoApi } from "./local-demo-client";
import { fieldClass } from "./QuestionFields";
import { defaultRoundTemplate, tomorrowLocal } from "./recruitment-labels";

export function InviteLinkActions({ url }: { url: string }) {
  const [message, setMessage] = useState("");
  return <div className="space-y-2">
    <Input aria-label="候选人专属链接" value={url} readOnly onFocus={(event) => event.target.select()} />
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={async () => {
        try { await navigator.clipboard.writeText(url); setMessage("链接已复制。"); }
        catch { setMessage("请选择上方链接并手动复制。"); }
      }}>复制专属链接</Button>
      <Button size="sm" asChild><a href={url} target="_blank" rel="noreferrer">打开候选人邀请函</a></Button>
    </div>
    {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
  </div>;
}

export function IssueInviteDialog({ candidate, rounds, templates, onClose, onIssued }: {
  candidate: RosterCandidate; rounds: InterviewRound[]; templates: SavedDesignTemplate[]; onClose: () => void; onIssued: () => void;
}) {
  const organization = useOrganizationProfile();
  const active = rounds.filter((round) => !round.archivedAt);
  const firstRound = active.find((round) => round.id === candidate.roundId) ?? active[0];
  const [roundId, setRoundId] = useState(firstRound?.id ?? "");
  const defaultTemplate = (round?: InterviewRound) => defaultRoundTemplate(templates, "invite_page", rounds, round)?.id ?? "";
  const [selectedTemplate, setSelectedTemplate] = useState(defaultTemplate(firstRound));
  const [deadline, setDeadline] = useState(tomorrowLocal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{active.find(({ id }) => id === roundId)?.kind === "offer" ? "签发录取函" : "签发面试邀请"}</DialogTitle>
        <DialogDescription>{candidate.name}</DialogDescription>
      </DialogHeader>
      {url ? <><p role="status" className="text-sm text-emerald-900">专属链接已生成。</p><InviteLinkActions url={url} /></> : <form className="space-y-3" onSubmit={async (event) => {
        event.preventDefault();
        const template = templates.find((item) => item.id === selectedTemplate);
        if (!template || !roundId || !deadline || busy) return;
        setBusy(true);
        setError("");
        try {
          const result = await demoApi.issueInvite(candidate.id, template.document, new Date(deadline).toISOString(), roundId, organization.name);
          setUrl(result.rsvpUrl);
          onIssued();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "签发失败，请重试。");
        } finally { setBusy(false); }
      }}>
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          <label className="grid gap-1.5 text-sm">邀请轮次<select required className={fieldClass} value={roundId} onChange={(e) => {
            const next = active.find((round) => round.id === e.target.value);
            setRoundId(e.target.value);
            setSelectedTemplate(defaultTemplate(next));
          }}>
            <option value="" disabled>请选择轮次</option>
            {active.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}
          </select></label>
          <label className="grid gap-1.5 text-sm">邀请函模板<select required className={fieldClass} value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}>
            {!selectedTemplate && <option value="" disabled>{templates.length ? "请选择邀请函模板" : "暂无模板，请先在模板设计器保存"}</option>}
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select></label>
          <label className="grid gap-1.5 text-sm">答复截止时间<Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required /></label>
          {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
          <Button type="submit" disabled={!selectedTemplate || !roundId || !deadline}>生成专属链接</Button>
        </fieldset>
      </form>}
    </DialogContent>
  </Dialog>;
}
