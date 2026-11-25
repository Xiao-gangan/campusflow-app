import { subscribeToBrowserDemo } from "../browser-demo/mode";
import { DemoWorkspaceNotice } from "../browser-demo/DemoWorkspaceNotice";
import { inviteHref } from "@/shared/invite/link";
import { BROWSER_DEMO } from "../browser-demo/mode";
import { lazy, Suspense, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import type { InterviewRound } from "@/shared/contracts/interview-rounds";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RosterCandidate } from "@/shared/contracts/recruitment-console";
import { navigateHash, useLocationHash } from "../../app/use-hash-route";
import { PageHeader } from "../../components/app/page-header";
import { browserDesignLibrary } from "../designer/local-library";
import { useTemplateList } from "../designer/use-template-list";
import { CandidateDialog, CandidateImportDialog } from "./CandidateDialogs";
import { MailConsole } from "./MailConsole";
import { RecruitmentOverview } from "./RecruitmentOverview";
import { RosterPanel } from "./RosterPanel";
import { demoApi } from "./local-demo-client";
import { RoundSettings } from "./RoundSettings";
import { CandidateSubmissions } from "./CandidateSubmissions";
import { InviteLinkActions, IssueInviteDialog } from "./IssueInviteDialog";
import {
  hashForRecruitmentTab,
  recruitmentTabFromHash,
  type RecruitmentTab,
} from "./recruitment-route";

const LocalInviteDemo = lazy(() => import("./LocalInviteDemo"));

const TAB_TITLES: Record<RecruitmentTab, string> = {
  overview: "招新管理",
  roster: "招新名单",
  mail: "邮件发送",
  legacy: "单链接演示",
  rounds: "面试轮次",
};

export default function RecruitmentConsole() {
  const hash = useLocationHash();
  const tab = recruitmentTabFromHash(hash);

  const [rounds, setRounds] = useState<InterviewRound[]>([]);
  const [submissions, setSubmissions] = useState<RosterCandidate | null>(null);
  const [issuing, setIssuing] = useState<RosterCandidate | null>(null);
  const [activeLink, setActiveLink] = useState<{ url: string; rotated: boolean } | null>(null);
  const [candidates, setCandidates] = useState<RosterCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [library] = useState(browserDesignLibrary);
  const templates = useTemplateList(library);
  const [editing, setEditing] = useState<{ candidate: RosterCandidate | null } | null>(
    null,
  );
  const [importing, setImporting] = useState(false);

  const switchTab = (next: RecruitmentTab) => {
    navigateHash(hashForRecruitmentTab(next));
  };

  const reloadCandidates = async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, nextRounds] = await Promise.all([demoApi.listCandidates(), demoApi.listRounds()]);
      setRounds(nextRounds);
      setCandidates(rows);
      setSelectedIds((current) =>
        current.filter((id) => rows.some((row) => row.id === id)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取招新名单。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reloadCandidates();
    return subscribeToBrowserDemo(() => void reloadCandidates());
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const refreshTemplates = () => { void library.refreshTemplates(); };

  const emailTemplates = templates.filter((template) => template.target === "email");
  const inviteTemplates = templates.filter(
    (template) => template.target === "invite_page",
  );

  async function showLink(candidate: RosterCandidate) {
    if (!candidate.latestInvite) return;
    try {
      const result = await demoApi.inviteLink(candidate.latestInvite.id);
      setActiveLink({ url: result.rsvpUrl, rotated: false });
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : "无法读取邀请链接。");
    }
  }

  async function handleRotate(candidate: RosterCandidate) {
    const invite = candidate.latestInvite;
    if (!invite) return;
    try {
      const result = await demoApi.rotateInvite(invite.id);
      const url = inviteHref(window.location.origin + window.location.pathname, result.token, BROWSER_DEMO);
      setNotice(`已为 ${candidate.name} 换发邀请，旧链接已失效。`);
      setActiveLink({ url, rotated: true });
      await reloadCandidates();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "换发邀请失败。");
    }
  }

  async function handleRevoke(candidate: RosterCandidate) {
    const invite = candidate.latestInvite;
    if (!invite) return;
    if (!window.confirm(`撤销 ${candidate.name} 的邀请？已打开的旧链接将失效。`))
      return;
    try {
      await demoApi.revokeInvite(invite.id);
      setNotice(`已撤销 ${candidate.name} 的邀请。`);
      await reloadCandidates();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "撤销邀请失败。");
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader title={TAB_TITLES[tab]} />
      <DemoWorkspaceNotice />

      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
          <button
            type="button"
            className="ml-auto underline"
            onClick={() => void reloadCandidates()}
          >
            重试
          </button>
        </div>
      ) : null}

      {tab === "overview" ? (
        <RecruitmentOverview
          candidates={candidates}
          rounds={rounds}
          onManageRounds={() => switchTab("rounds")}
          loading={loading}
          onGoRoster={() => switchTab("roster")}
          onGoMail={() => switchTab("mail")}
          onOpenImport={() => setImporting(true)}
        />
      ) : null}

      {tab === "roster" ? (
        <RosterPanel
          candidates={candidates}
          loading={loading}
          rounds={rounds}
          onSubmissions={setSubmissions}
          onPromote={async (ids, id, schedule) => {
            const { moved, round } = await demoApi.promote(ids, id, schedule);
            setSelectedIds([]);
            setNotice(`已将 ${moved} 人推进到「${round.name}」。`);
            await reloadCandidates();
          }}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
          onRefresh={() => void reloadCandidates()}
          onCreate={() => setEditing({ candidate: null })}
          onImport={() => setImporting(true)}
          onEdit={(candidate) => setEditing({ candidate })}
          onIssue={setIssuing}
          onShowLink={showLink}
          onRotate={handleRotate}
          onRevoke={handleRevoke}
          onGoMail={() => switchTab("mail")}
        />
      ) : null}

      {tab === "mail" ? (
        <MailConsole
          candidates={candidates}
          rounds={rounds}
          loading={loading}
          selectedIds={selectedIds}
          onSelectIds={setSelectedIds}
          emailTemplates={emailTemplates}
          inviteTemplates={inviteTemplates}
          onTemplatesChanged={refreshTemplates}
          onSent={async () => {
            await reloadCandidates();
          }}
          onNotice={setNotice}
          onEditInviteTemplate={() => navigateHash("#/designer?target=invite_page")}
          onEditEmailTemplate={() => navigateHash("#/designer?target=email")}
        />
      ) : null}

      {tab === "rounds" && <RoundSettings rounds={rounds} emailTemplates={emailTemplates} inviteTemplates={inviteTemplates} onChanged={reloadCandidates} />}

      {tab === "legacy" ? (
        <Suspense
          fallback={
            <p className="py-8 text-center text-sm text-muted-foreground">
              正在读取单链接演示…
            </p>
          }
        >
          <LocalInviteDemo embedded />
        </Suspense>
      ) : null}

      {submissions && <CandidateSubmissions key={submissions.id} candidate={submissions} onClose={() => setSubmissions(null)} onReviewed={() => void reloadCandidates()} />}
      {issuing && <IssueInviteDialog candidate={issuing} rounds={rounds} templates={inviteTemplates}
        onClose={() => setIssuing(null)} onIssued={() => { void reloadCandidates(); }} />}
      {activeLink && <Dialog open onOpenChange={(open) => { if (!open) setActiveLink(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{activeLink.rotated ? "邀请已换发" : "候选人专属链接"}</DialogTitle><DialogDescription>{activeLink.rotated ? "旧链接已失效。" : "请仅发送给对应候选人。"}</DialogDescription></DialogHeader>
          <InviteLinkActions url={activeLink.url} />
        </DialogContent>
      </Dialog>}

      <CandidateDialog
        state={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={async (message) => {
          setEditing(null);
          setNotice(message);
          await reloadCandidates();
        }}
      />

      <CandidateImportDialog
        open={importing}
        onOpenChange={setImporting}
        onImported={async (message) => {
          setImporting(false);
          setNotice(message);
          await reloadCandidates();
        }}
      />

      {notice ? (
        <div
          className="fixed bottom-5 right-5 z-40 flex w-[min(360px,calc(100vw-2rem))] items-center justify-between gap-2 rounded-2xl border border-primary/25 bg-card/95 px-3.5 py-2.5 text-xs text-foreground shadow-lg backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          <span className="flex min-w-0 items-center gap-2 leading-5">
            <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">{notice}</span>
          </span>
          <button
            type="button"
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground"
            aria-label="关闭提示"
            onClick={() => setNotice("")}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
