import { subscribeToBrowserDemo } from "../browser-demo/mode";
import type { InterviewRound } from "@/shared/contracts/interview-rounds";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ExternalLink,
  Mail,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import type { EmailAccount, EmailBatch } from "@/shared/contracts/email";
import type {
  MailBatchDetail,
  MailDeliveryView,
  MailPreviewResult,
  RosterCandidate,
} from "@/shared/contracts/recruitment-console";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import type { SavedDesignTemplate } from "../designer/local-library";
import { useOrganizationProfile } from "../org/organization";
import { DemoApiError, demoApi } from "./local-demo-client";
import MailAccountSettings from "./MailAccountSettings";
import { MailRecipients } from "./MailRecipients";
import { BatchForwardingDialog, downloadForwardingFile, ExportInviteButtons, InviteCopyButtons, InviteLinkStatus, type ForwardAction } from "./BatchForwarding";
import { canForwardInvite, forwardingExport, forwardingMessage } from "@/shared/recruitment/invite-forwarding";
import {
  BATCH_LABELS,
  dateTime,
  defaultRoundTemplate,
  DELIVERY_LABELS,
  saveDemoTemplates,
  tomorrowLocal,
} from "./recruitment-labels";

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium">{label}</label>
      {children}
    </div>
  );
}

type MailConsoleProps = {
  rounds: InterviewRound[];
  candidates: RosterCandidate[];
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  loading: boolean;
  emailTemplates: SavedDesignTemplate[];
  inviteTemplates: SavedDesignTemplate[];
  onTemplatesChanged: () => void;
  onSent: () => Promise<void>;
  onNotice: (message: string) => void;
  onEditInviteTemplate: () => void;
  onEditEmailTemplate: () => void;
};

export function MailConsole({
  candidates,
  rounds,
  selectedIds,
  onSelectIds,
  loading,
  emailTemplates,
  inviteTemplates,
  onTemplatesChanged,
  onSent,
  onNotice,
  onEditInviteTemplate,
  onEditEmailTemplate,
}: MailConsoleProps) {
  const org = useOrganizationProfile();
  const [roundOverride, setRoundOverride] = useState<string | null>(null);
  const [mode, setMode] = useState<"compose" | "outbox" | "settings">("compose");
  const [emailTemplateId, setEmailTemplateId] = useState("");
  const [inviteTemplateId, setInviteTemplateId] = useState("");
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const sender = accounts.find((account) => account.id === accountId);
  const isRealSender = Boolean(sender?.smtpHost);
  const suggestSmallBatch = isRealSender && ["qq", "163"].includes(sender?.providerType ?? "") && selectedIds.length > 10;
  const [expiresAt, setExpiresAt] = useState(tomorrowLocal);
  const [savedPreview, setSavedPreview] = useState<{ signature: string; result: MailPreviewResult } | null>(null);
  const previewRequest = useRef<symbol | null>(null);
  const [previewCandidateId, setPreviewCandidateId] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [batches, setBatches] = useState<EmailBatch[]>([]);
  const [batchDetail, setBatchDetail] = useState<MailBatchDetail | null>(null);
  const [forwardPrompt, setForwardPrompt] = useState(false);
  const [forwardBusy, setForwardBusy] = useState(false);
  const [forwardFeedback, setForwardFeedback] = useState("");
  const [outboxBusy, setOutboxBusy] = useState(false);
  const [error, setError] = useState("");
  const [deliveryPreview, setDeliveryPreview] = useState<MailDeliveryView | null>(null);
  const [sendKey, setSendKey] = useState(() => `mail-${crypto.randomUUID()}`);

  const selectedCandidates = candidates.filter((candidate) => selectedIds.includes(candidate.id));
  const commonRoundId = selectedCandidates[0]?.roundId;
  const sameRound = commonRoundId && selectedCandidates.every((candidate) => candidate.roundId === commonRoundId) ? commonRoundId : "";
  const activeRounds = rounds.filter((round) => !round.archivedAt);
  const roundId = roundOverride ?? (activeRounds.some((round) => round.id === sameRound) ? sameRound : "");
  const round = activeRounds.find((item) => item.id === roundId);
  const emailTemplate = emailTemplates.find((template) => template.id === emailTemplateId)
    ?? defaultRoundTemplate(emailTemplates, "email", rounds, round);
  const inviteTemplate = inviteTemplates.find((template) => template.id === inviteTemplateId)
    ?? defaultRoundTemplate(inviteTemplates, "invite_page", rounds, round);
  const composeSignature = JSON.stringify([
    selectedIds, roundId, emailTemplate?.id, emailTemplate?.updatedAt, inviteTemplate?.id, inviteTemplate?.updatedAt,
    expiresAt, accountId, org.name,
  ]);
  const preview = savedPreview?.signature === composeSignature ? savedPreview.result : null;
  const previewItems = preview?.items ?? [];
  const previewItem =
    previewItems.find((item) => item.candidateId === previewCandidateId) ??
    previewItems[0];

  useEffect(() => {
    let cancelled = false;
    demoApi
      .listAccounts()
      .then((rows) => {
        if (cancelled) return;
        setAccounts(rows);
        setAccountId(
          (current) =>
            rows.some((account) => account.id === current)
              ? current
              : rows.find((account) => account.isDefault)?.id || rows[0]?.id || "",
        );
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "无法读取发件身份。");
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const loadBatches = async () => {
    setOutboxBusy(true);
    try {
      const rows = await demoApi.listBatches();
      setBatches(rows);
      setBatchDetail((current) => current && rows.some((batch) => batch.id === current.batch.id) ? current : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取发件箱。");
    } finally {
      setOutboxBusy(false);
    }
  };

  useEffect(() => {
    void loadBatches();
  }, []);

  useEffect(() => {
    setSavedPreview(null);
    setPreviewBusy(false);
    setSendKey(`mail-${crypto.randomUUID()}`);
    return () => { previewRequest.current = null; };
  }, [composeSignature]);

  function saveSamples() {
    try {
      const rows = saveDemoTemplates();
      onTemplatesChanged();
      const email = rows.find((row) => row.target === "email");
      const invite = rows.find((row) => row.target === "invite_page");
      if (email) setEmailTemplateId(email.id);
      if (invite) setInviteTemplateId(invite.id);
      onNotice("已保存示例邮件与邀请函模板。");
    } catch {
      setError("无法保存示例模板，请检查浏览器存储。");
    }
  }

  async function runPreview() {
    if (!emailTemplate || !inviteTemplate) {
      setError("请先保存并选择邮件和邀请函模板。");
      return;
    }
    if (!selectedIds.length) {
      setError("请先选择收件人。");
      return;
    }
    const request = Symbol();
    previewRequest.current = request;
    setPreviewBusy(true);
    setError("");
    try {
      const result = await demoApi.preview({
        candidateIds: selectedIds,
        emailDocument: emailTemplate.document,
        inviteDocument: inviteTemplate.document,
        expiresAt: new Date(expiresAt).toISOString(),
        organizationName: org.name,
        roundId: roundId || undefined,
      });
      if (previewRequest.current !== request) return;
      setSavedPreview({ signature: composeSignature, result });
      setPreviewCandidateId(result.items[0]?.candidateId ?? "");
      if (result.excluded > 0)
        onNotice(`${result.excluded} 人存在跳过原因，请逐人检查。`);
    } catch (cause) {
      if (previewRequest.current === request) setError(cause instanceof Error ? cause.message : "预览失败。");
    } finally {
      if (previewRequest.current === request) {
        previewRequest.current = null;
        setPreviewBusy(false);
      }
    }
  }

  async function sendNow() {
    if (!emailTemplate || !inviteTemplate) return;
    if (!preview || preview.eligible === 0) {
      setError("请先预览并处理所有跳过原因。");
      return;
    }
    if (!sender) {
      setError("请选择发件账号。");
      return;
    }
    if (sendBusy) return;
    if (isRealSender && !window.confirm(
      `将通过 ${sender.fromEmail} 真实发送 ${preview.eligible} 封邮件。请确认收件人与邀请链接可访问。` +
      (suggestSmallBatch ? " QQ/163 建议每批不超过 10 封，批次间隔数分钟。" : ""),
    )) return;
    setSendBusy(true);
    setError("");
    try {
      const detail = await demoApi.send({
        candidateIds: selectedIds,
        emailDocument: emailTemplate.document,
        inviteDocument: inviteTemplate.document,
        expiresAt: new Date(expiresAt).toISOString(),
        batchName: `招新面试邀请 · ${new Date().toLocaleDateString("zh-CN")}`,
        accountId,
        ...(isRealSender ? { confirmSmtp: true } : {}),
        idempotencyKey: sendKey,
        organizationName: org.name,
        roundId: roundId || undefined,
      });
      setSendKey(`mail-${crypto.randomUUID()}`);
      setBatchDetail(detail);
      setForwardFeedback("");
      setMode("outbox");
      setForwardPrompt(true);
      await loadBatches();
      await onSent();
    } catch (cause) {
      setError(cause instanceof DemoApiError ? cause.message : "发送失败，请重试。");
    } finally {
      setSendBusy(false);
    }
  }

  async function openBatch(id: string) {
    setOutboxBusy(true);
    setForwardFeedback("");
    setError("");
    try {
      setBatchDetail(await demoApi.getBatch(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取批次。");
    } finally {
      setOutboxBusy(false);
    }
  }

  const activeBatchId = batchDetail?.batch.id;
  useEffect(() => {
    if (!activeBatchId || mode !== "outbox") return;
    let mounted = true;
    const refreshLinks = () => {
      if (document.visibilityState !== "visible") return;
      void demoApi.getBatch(activeBatchId).then((detail) => {
        if (mounted) setBatchDetail((current) => current?.batch.id === activeBatchId ? detail : current);
      }).catch(() => {
        // Copy and download also validate on demand, and can surface connection failures.
      });
    };
    document.addEventListener("visibilitychange", refreshLinks);
    const unsubscribe = subscribeToBrowserDemo(refreshLinks);
    return () => {
      unsubscribe();
      mounted = false;
      document.removeEventListener("visibilitychange", refreshLinks);
    };
  }, [mode, activeBatchId]);

  async function forward(kind: ForwardAction, deliveryId?: string) {
    if (!activeBatchId || forwardBusy) return;
    setForwardBusy(true);
    setForwardFeedback("");
    try {
      const detail = await demoApi.getBatch(activeBatchId);
      setBatchDetail((current) => current?.batch.id === activeBatchId ? detail : current);
      if (kind === "txt" || kind === "csv") {
        if (!detail.deliveries.some(canForwardInvite)) {
          setForwardFeedback("本批次没有有效专属链接可导出。");
          return;
        }
        downloadForwardingFile(forwardingExport(detail.deliveries, kind), kind);
        setForwardFeedback("已生成下载文件，仅包含有效链接。");
      } else {
        const delivery = detail.deliveries.find(({ id }) => id === deliveryId);
        if (!delivery || !canForwardInvite(delivery)) {
          setForwardFeedback("旧链接已失效，请使用当前有效的专属链接。");
          return;
        }
        try {
          await navigator.clipboard.writeText(kind === "link" ? delivery.rsvpUrl : forwardingMessage(delivery));
          setForwardFeedback(kind === "link" ? "专属链接已复制。" : "转发文案已复制。");
        } catch {
          setForwardFeedback("无法写入剪贴板，请通过下载文件复制。");
        }
      }
    } catch {
      setForwardFeedback("暂时无法核对链接状态，请重试。");
    } finally {
      setForwardBusy(false);
    }
  }

  async function retryCurrent() {
    if (!batchDetail) return;
    setOutboxBusy(true);
    try {
      setBatchDetail(await demoApi.retry(batchDetail.batch.id));
      await loadBatches();
      await onSent();
      onNotice("已重试可重试的失败投递。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "重试失败。");
    } finally {
      setOutboxBusy(false);
    }
  }

  async function cancelCurrent() {
    if (!batchDetail) return;
    if (!window.confirm("取消该批次中尚未发送的投递？")) return;
    setOutboxBusy(true);
    try {
      setBatchDetail(await demoApi.cancel(batchDetail.batch.id));
      await loadBatches();
      onNotice("已取消待发送投递。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "取消失败。");
    } finally {
      setOutboxBusy(false);
    }
  }

  const missingTemplates = !emailTemplates.length || !inviteTemplates.length;
  const recipientPicker = <MailRecipients candidates={candidates} selectedCandidates={selectedCandidates} round={round}
    loading={loading} disabled={sendBusy} onSelectIds={onSelectIds} />;
  const previewLink = batchDetail?.deliveries.find(({ id }) => id === deliveryPreview?.id)?.rsvpUrl;

  return (
    <section className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-border/70 bg-card/85 p-0.5">
          {(["compose", "outbox", "settings"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                item === mode
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item === "compose"
                ? "撰写发送"
                : item === "outbox"
                  ? `发件箱${batches.length ? ` (${batches.length})` : ""}`
                  : "发件邮箱设置"}
            </button>
          ))}
        </div>
        {mode === "outbox" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={async () => {
              await loadBatches();
              if (activeBatchId) await openBatch(activeBatchId);
            }}
            disabled={outboxBusy}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            刷新发件箱
          </Button>
        ) : mode === "compose" ? (
          <span className="text-xs text-muted-foreground">
            已选 {selectedCandidates.length} 位收件人 · 模拟投递通道
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            SMTP 账户配置与本机测试
          </span>
        )}
      </div>

      {mode === "compose" && selectedCandidates.length > 10 ? (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-[11px] leading-4 text-amber-900">
          本次已选 {selectedCandidates.length} 人。通过 QQ 或 163 邮箱实际发信时，建议每批不超过 10 封，并间隔数分钟。
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800"
        >
          {error}
        </p>
      ) : null}

      {mode === "settings" ? (
        <MailAccountSettings emailTemplates={emailTemplates} onRefreshTemplates={onTemplatesChanged} />
      ) : mode === "compose" ? (
        missingTemplates ? (
          <div className="space-y-3 rounded-2xl border border-dashed border-border/70 bg-card/70 p-6">
            <p className="text-sm font-medium">还没有已保存的邮件或邀请函模板</p>
            <p className="text-xs leading-5 text-muted-foreground">
              保存模板后即可逐人预览并模拟发送。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={saveSamples}>
                一键保存示例模板
              </Button>
              {!emailTemplate ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onEditEmailTemplate}
                >
                  去设计邮件
                </Button>
              ) : null}
              {!inviteTemplate ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onEditInviteTemplate}
                >
                  去设计邀请函
                </Button>
              ) : null}
            </div>
            {recipientPicker}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="min-w-0 space-y-3.5 rounded-2xl border border-border/70 bg-card/85 p-4 sm:p-5">
              <Field id="mail-round" label="邀请轮次">
                <select id="mail-round" value={roundId} onChange={(event) => {
                  setRoundOverride(event.target.value);
                  setEmailTemplateId("");
                  setInviteTemplateId("");
                }} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm leading-9">
                  <option value="">按候选人当前轮次</option>
                  {activeRounds.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <Field id="mail-email-template" label="邮件模板">
                <select id="mail-email-template"
                  value={emailTemplate?.id ?? ""}
                  onChange={(event) => setEmailTemplateId(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm leading-9"
                >
                  {!emailTemplate && <option value="" disabled>请选择邮件模板</option>}
                  {emailTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="mail-invite-template" label="邀请函模板">
                <select id="mail-invite-template"
                  value={inviteTemplate?.id ?? ""}
                  onChange={(event) => setInviteTemplateId(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm leading-9"
                >
                  {!inviteTemplate && <option value="" disabled>请选择邀请函模板</option>}
                  {inviteTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="mail-account" label="发件账号">
                <select id="mail-account"
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm leading-9"
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label} · {account.fromEmail}
                    </option>
                  ))}
                </select>
              </Field>
              {isRealSender && (
                <p className="text-xs leading-5 text-muted-foreground">
                  本批次将发送真实邮件。{suggestSmallBatch && "QQ/163 建议每批不超过 10 封，批次间隔数分钟。"}
                </p>
              )}
              <Field id="mail-deadline" label="答复截止时间">
                <Input id="mail-deadline"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </Field>
              {recipientPicker}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  disabled={previewBusy || sendBusy || !selectedIds.length || !emailTemplate || !inviteTemplate}
                  onClick={() => void runPreview()}
                >
                  <Mail className="size-3.5" aria-hidden="true" />
                  {previewBusy ? "预览中…" : "逐人预览"}
                </Button>
                <Button
                  type="button"
                  disabled={!sender || !preview || previewBusy || sendBusy || preview.eligible === 0}
                  onClick={() => void sendNow()}
                >
                  <Send className="size-3.5" aria-hidden="true" />
                  {sendBusy
                    ? (isRealSender ? "真实发送中…" : "模拟发送中…")
                    : `确认${isRealSender ? "真实" : "模拟"}发送 ${preview?.eligible ?? 0} 人`}
                </Button>
              </div>
            </div>

            <div className="min-w-0 space-y-3 rounded-2xl border border-border/70 bg-card/85 p-4 sm:p-5">
              {!preview ? (
                <div className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-xs leading-5 text-muted-foreground">
                  点击左侧「逐人预览」，检查每位候选人的邮件主题、正文与链接校验结果。
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.items.map((item) => (
                      <button
                        key={item.candidateId}
                        type="button"
                        onClick={() => setPreviewCandidateId(item.candidateId)}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs transition-colors",
                          item.candidateId === previewItem?.candidateId
                            ? "bg-primary text-primary-foreground"
                            : "border border-border/70 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {item.name}
                        {item.eligible ? "" : " · 跳过"}
                      </button>
                    ))}
                  </div>
                  {previewItem ? (
                    <>
                      <div className="border-b border-border/60 pb-2">
                        <p className="text-sm font-medium">{previewItem.subject}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          收件人：{previewItem.email}
                        </p>
                      </div>
                      {previewItem.issues.length ? (
                        <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                          {previewItem.issues.map((issue) => (
                            <p key={issue}>{issue}</p>
                          ))}
                        </div>
                      ) : null}
                      {previewItem.warnings.length ? (
                        <p className="text-[11px] leading-4 text-amber-700">
                          {previewItem.warnings.join(" ")}
                        </p>
                      ) : null}
                      <iframe
                        title={`${previewItem.name} 邮件预览`}
                        sandbox=""
                        srcDoc={previewItem.html}
                        className="h-[460px] w-full rounded-xl border border-border/60 bg-white"
                      />
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="grid overflow-hidden rounded-2xl border border-border/70 bg-card/85 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
          <div className="border-b border-border/70 xl:border-r xl:border-b-0">
            <div className="border-b border-border/60 px-4 py-3 text-xs font-medium text-muted-foreground">
              发送批次
            </div>
            {batches.length === 0 ? (
              <p className="px-4 py-12 text-center text-xs text-muted-foreground">
                还没有模拟批次。
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {batches.map((batch) => {
                  const active = batchDetail?.batch.id === batch.id;
                  return (
                    <button
                      key={batch.id}
                      type="button"
                      onClick={() => void openBatch(batch.id)}
                      disabled={outboxBusy || forwardBusy}
                      className={cn(
                        "w-full px-4 py-3 text-left text-xs transition-colors hover:bg-muted/35",
                        active && "bg-primary/[0.06]",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">
                          {batch.name}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                          {BATCH_LABELS[batch.status] ?? batch.status}
                        </span>
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        成功 {batch.simulatedCount} · 失败 {batch.failedCount} · 跳过{" "}
                        {batch.skippedCount} · {dateTime(batch.createdAt)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            {!batchDetail ? (
              <p className="px-4 py-16 text-center text-xs text-muted-foreground">
                选择左侧批次查看逐封投递结果。
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold">{batchDetail.batch.name}</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {BATCH_LABELS[batchDetail.batch.status] ?? batchDetail.batch.status}{" "}
                      · {dateTime(batchDetail.batch.completedAt)}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {batchDetail.batch.retryableFailedCount > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => void retryCurrent()}
                        disabled={outboxBusy}
                      >
                        <RefreshCw className="size-3.5" aria-hidden="true" />
                        重试失败项
                      </Button>
                    ) : null}
                    {batchDetail.batch.pendingCount > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-rose-700"
                        onClick={() => void cancelCurrent()}
                        disabled={outboxBusy}
                      >
                        <XCircle className="size-3.5" aria-hidden="true" />
                        取消待发送
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2 border-b border-border/60 px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <ExportInviteButtons detail={batchDetail} busy={forwardBusy || outboxBusy} onAction={(kind) => void forward(kind)} />
                  </div>
                  {!forwardPrompt && forwardFeedback && <p role="status" className="text-xs text-primary">{forwardFeedback}</p>}
                </div>
                <div className="divide-y divide-border/60">
                  {batchDetail.deliveries.map((delivery) => (
                    <div
                      key={delivery.id}
                      className="flex flex-col gap-2 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">
                            {delivery.candidateName}
                          </span>
                          <span className="truncate text-muted-foreground">
                            {delivery.toEmail}
                          </span>
                          <Badge variant="outline" className="rounded-full text-[10px]">
                            {DELIVERY_LABELS[delivery.status] ?? delivery.status}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-muted-foreground">
                          {delivery.subject} · 尝试 {delivery.attemptCount} 次 ·{" "}
                          {dateTime(delivery.sentAt)}
                        </p>
                        <p className="mt-1 [overflow-wrap:anywhere]">
                          {delivery.invite?.roundName && <span className="text-muted-foreground">{delivery.invite.roundName} · </span>}
                          <InviteLinkStatus delivery={delivery} />
                        </p>
                        {delivery.errorMessage ? (
                          <p className="mt-1 text-rose-700">{delivery.errorMessage}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <InviteCopyButtons delivery={delivery} busy={forwardBusy || outboxBusy} onAction={(kind, id) => void forward(kind, id)} />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => setDeliveryPreview(delivery)}
                        >
                          查看邮件
                        </Button>
                        {delivery.rsvpUrl ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 text-xs"
                            asChild
                          >
                            <a href={delivery.rsvpUrl} target="_blank" rel="noreferrer">
                              打开邀请
                              <ExternalLink className="size-3" aria-hidden="true" />
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {batchDetail && <BatchForwardingDialog detail={batchDetail} open={forwardPrompt}
        onClose={() => { setForwardPrompt(false); setForwardFeedback(""); }} busy={forwardBusy || outboxBusy}
        feedback={forwardFeedback} onAction={(kind, id) => void forward(kind, id)} />}

      <Dialog
        open={Boolean(deliveryPreview)}
        onOpenChange={(open) => {
          if (!open) setDeliveryPreview(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-card sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>模拟投递邮件</DialogTitle>
            <DialogDescription>
              {deliveryPreview?.toEmail} · 由本机持久记录渲染
            </DialogDescription>
          </DialogHeader>
          {deliveryPreview ? (
            <iframe
              title="模拟投递邮件"
              sandbox=""
              srcDoc={deliveryPreview.bodyHtml}
              className="h-[60vh] w-full rounded-xl border border-border/60 bg-white"
            />
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeliveryPreview(null)}
            >
              关闭
            </Button>
            {previewLink ? (
              <Button asChild>
                <a href={previewLink} target="_blank" rel="noreferrer">
                  打开候选人邀请
                </a>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
