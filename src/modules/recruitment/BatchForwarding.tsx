import type { MailBatchDetail, MailDeliveryView } from "@/shared/contracts/recruitment-console";
import { canForwardInvite, inviteDeadline } from "@/shared/recruitment/invite-forwarding";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ForwardAction = "link" | "message" | "txt" | "csv";

export function InviteLinkStatus({ delivery }: { delivery: MailDeliveryView }) {
  if (!delivery.inviteId) return <span className="text-muted-foreground">未签发专属链接</span>;
  if (canForwardInvite(delivery)) return <span className="text-emerald-800">链接有效</span>;
  const reason = { rotated: "已换发", revoked: "已撤销", expired: "已过期", missing: "链接不可用", valid: "链接不可用" };
  return <span className="font-medium text-amber-900">旧链接已失效<span className="ml-1 text-muted-foreground">· {reason[delivery.invite?.status ?? "missing"]}</span></span>;
}

export function InviteCopyButtons({ delivery, busy, fullLabel, onAction }: {
  delivery: MailDeliveryView;
  busy: boolean;
  fullLabel?: boolean;
  onAction: (kind: "link" | "message", id: string) => void;
}) {
  if (!delivery.inviteId) return null;
  const disabled = busy || !canForwardInvite(delivery);
  return <>
    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={disabled} onClick={() => onAction("link", delivery.id)}>复制链接</Button>
    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={disabled} onClick={() => onAction("message", delivery.id)}>{fullLabel ? "复制转发文案" : "复制文案"}</Button>
  </>;
}

export function ExportInviteButtons({ detail, busy, prompt, onAction }: {
  detail: MailBatchDetail; busy: boolean; prompt?: boolean; onAction: (kind: "txt" | "csv") => void;
}) {
  const disabled = busy || !detail.deliveries.some(canForwardInvite);
  return <>
    <Button type="button" size="sm" variant={prompt ? "default" : "outline"} disabled={disabled} onClick={() => onAction("txt")}>
      {prompt ? "下载" : "导出"}转发文案 (.txt)
    </Button>
    <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onAction("csv")}>
      {prompt ? "下载" : "导出"}链接清单 (.csv)
    </Button>
  </>;
}

export function BatchForwardingDialog({ detail, open, onClose, busy, feedback, onAction }: {
  detail: MailBatchDetail;
  open: boolean;
  onClose: () => void;
  busy: boolean;
  feedback: string;
  onAction: (kind: ForwardAction, deliveryId?: string) => void;
}) {
  const valid = detail.deliveries.filter(canForwardInvite);
  const summaries = new Map<string, { round: string; expiry: string; count: number }>();
  for (const { invite } of valid) {
    const key = JSON.stringify([invite.roundName, invite.expiresAt]);
    const current = summaries.get(key);
    if (current) current.count += 1;
    else summaries.set(key, { round: invite.roundName, expiry: invite.expiresAt, count: 1 });
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>发送完成 · 导出邀请链接</DialogTitle>
        <DialogDescription>本批次有 {new Set(valid.map(({ candidateId }) => candidateId)).size} 位候选人的专属链接仍有效。</DialogDescription>
      </DialogHeader>
      <div className="min-w-0 space-y-3 text-sm">
        {[...summaries].map(([key, { round, expiry, count }]) =>
          <p className="rounded-lg bg-muted/55 px-3 py-2 text-xs leading-5 [overflow-wrap:anywhere]" key={key}>{round} · {count} 人 · 答复截止 {inviteDeadline(expiry)}</p>)}
        <div className="divide-y divide-border/60 rounded-lg border border-border/75">
          {detail.deliveries.map((delivery) => <div key={delivery.id} className="flex min-w-0 flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-xs [overflow-wrap:anywhere]">
              <p className="font-medium">{delivery.candidateName}</p>
              <p className="mt-0.5">{delivery.invite?.roundName && <span className="text-muted-foreground">{delivery.invite.roundName} · </span>}<InviteLinkStatus delivery={delivery} /></p>
            </div>
            <div className="flex flex-wrap gap-1.5"><InviteCopyButtons delivery={delivery} busy={busy} fullLabel onAction={onAction} /></div>
          </div>)}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">导出文件含候选人专属答复链接，请勿公开分享。</p>
        {feedback && <p role="status" className="text-xs leading-5 text-primary">{feedback}</p>}
      </div>
      <DialogFooter className="flex-wrap">
        <ExportInviteButtons detail={detail} busy={busy} prompt onAction={onAction} />
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>暂不下载（稍后可在发件箱查看）</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function downloadForwardingFile(content: string, format: "txt" | "csv") {
  const mime = format === "txt" ? "text/plain" : "text/csv";
  const url = URL.createObjectURL(new Blob([content], { type: mime + ";charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = format === "txt" ? "邀请转发文案.txt" : "邀请链接清单.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
