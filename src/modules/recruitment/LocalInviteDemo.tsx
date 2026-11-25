import { inviteHref } from "@/shared/invite/link";
import { BROWSER_DEMO } from "../browser-demo/mode";
import { useRef, useState } from "react";
import { Check, Copy, ExternalLink, LayoutTemplate, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createInvitePresetDocument } from "@/shared/invite/presets";
import { PageHeader } from "../../components/app/page-header";
import { browserDesignLibrary } from "../designer/local-library";
import { useTemplateList } from "../designer/use-template-list";
import { useOrganizationProfile } from "../org/organization";
import { inviteRequest, InviteRequestError } from "../invite/rsvp-client";

const endpoint = "/api/local-demo/interview-invites";
type Issued = { id: string; token?: string };

function tomorrowLocal() {
  const at = new Date(Date.now() + 86400000);
  return new Date(at.getTime() - at.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function manage<T>(path: string, body: object = {}) {
  return inviteRequest<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CampusFlow-Demo": "1" },
    body: JSON.stringify(body),
  });
}

export default function LocalInviteDemo({
  embedded = false,
}: {
  embedded?: boolean;
} = {}) {
  const organization = useOrganizationProfile();
  const [library] = useState(browserDesignLibrary);
  const templates = useTemplateList(library, "invite_page");
  const [selected, setSelected] = useState(() => templates[0]?.id ?? "");
  const [deadline, setDeadline] = useState(tomorrowLocal);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone?: "info" | "error" } | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const current = templates.find((template) => template.id === selected) ?? templates[0];
  const link = issued?.token
    ? inviteHref(window.location.origin + window.location.pathname, issued.token, BROWSER_DEMO)
    : "";

  function saveExample() {
    try {
      const template = library.saveTemplate({
        name: "面试邀请 · 本地演示",
        document: createInvitePresetDocument("formal"),
      });
      setSelected(template.id);
      setNotice({ text: "已保存示例邀请函模板。" });
    } catch {
      setNotice({ text: "无法保存模板，请检查浏览器存储。", tone: "error" });
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setNotice({ text: "专属链接已复制。" });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setNotice({ text: "链接已选中，请手动复制。" });
    }
  }

  async function perform(action: "issue" | "rotate" | "revoke") {
    if (busy) return;
    setBusy(true);
    setCopied(false);
    setNotice(null);
    // The old token may already be invalid if the reply to rotate or revoke is lost.
    if (action !== "issue" && issued) setIssued({ id: issued.id });
    try {
      if (action === "issue" && current) {
        setIssued(
          await manage<Issued>(endpoint, {
            document: current.document,
            expiresAt: new Date(deadline).toISOString(),
            organizationName: organization.name,
          }),
        );
        setNotice({ text: "专属链接已生成。" });
      } else if (action === "rotate" && issued) {
        setIssued(await manage<Issued>(`${endpoint}/${issued.id}/rotate`));
        setNotice({ text: "已换发，新链接保留原答复，旧链接已失效。" });
      } else if (action === "revoke" && issued) {
        await manage(`${endpoint}/${issued.id}/revoke`);
        setIssued(null);
        setNotice({ text: "邀请已撤销。" });
      }
    } catch (error) {
      if (
        action !== "issue" &&
        error instanceof InviteRequestError &&
        [404, 410].includes(error.status)
      ) {
        setIssued(null);
        setNotice({ text: error.message, tone: "error" });
      } else if (action === "rotate") {
        setNotice({
          text: "暂时无法确认换发结果，请再次换发以获取新链接。",
          tone: "error",
        });
      } else if (action === "revoke") {
        setNotice({
          text: "暂时无法确认撤销结果，请再次撤销。",
          tone: "error",
        });
      } else {
        setNotice({
          text: error instanceof Error ? error.message : "操作失败，请重试。",
          tone: "error",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            单链接快速测试：为示例候选人生成专属 RSVP 链接，演示确认、换发与撤销。
          </p>
          <Button variant="outline" size="sm" asChild>
            <a href="#/designer?target=invite_page">
              <LayoutTemplate className="size-3.5" aria-hidden="true" />
              去设计邀请函
            </a>
          </Button>
        </div>
      ) : (
        <PageHeader
          eyebrow="招新管理"
          title="生成面试邀请"
          description="模拟候选人林知夏 · 技术部，签发专属链接并演示出席答复、换发与撤销。"
          badge={
            <Badge variant="outline" className="rounded-full bg-card/70 text-[10px]">
              本机演示
            </Badge>
          }
          actions={
            <Button variant="outline" asChild>
              <a href="#/designer?target=invite_page">
                <LayoutTemplate className="size-4" aria-hidden="true" />
                去设计邀请函模板
              </a>
            </Button>
          }
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <section className="space-y-4 rounded-[24px] border border-border/70 bg-card/80 p-5 sm:p-6">
          <div className="space-y-1.5">
            <Label htmlFor="invite-template-select" className="text-[13px]">
              已保存的邀请函模板
            </Label>
            <select
              id="invite-template-select"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={current?.id ?? ""}
              onChange={(event) => setSelected(event.target.value)}
            >
              {!templates.length && <option value="">暂无邀请函模板</option>}
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {!templates.length ? (
              <div className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={saveExample}
                >
                  保存示例邀请函模板
                </Button>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-deadline-input" className="text-[13px]">
              答复截止时间
            </Label>
            <Input
              id="invite-deadline-input"
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </div>

          <Button
            type="button"
            disabled={busy || !current || !deadline}
            onClick={() => void perform("issue")}
          >
            生成专属链接
          </Button>
        </section>

        {issued ? (
          <section className="space-y-4 rounded-[24px] border border-border/70 bg-card/80 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">当前有效邀请</h2>
              {link ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={link} target="_blank" rel="noreferrer">
                    打开候选人邀请函
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </Button>
              ) : null}
            </div>

            {link ? (
              <div className="flex items-center gap-2">
                <Input
                  ref={linkInput}
                  className="min-w-0 flex-1 font-mono text-xs"
                  readOnly
                  aria-label="专属邀请链接"
                  value={link}
                  onFocus={(event) => event.target.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void copyLink()}
                >
                  {copied ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3.5" aria-hidden="true" />
                  )}
                  {copied ? "已复制" : "复制链接"}
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void perform("rotate")}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                换发链接
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => void perform("revoke")}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                撤销邀请
              </Button>
            </div>
          </section>
        ) : null}
      </div>

      {notice ? (
        <p
          role="status"
          className={
            notice.tone === "error"
              ? "rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-2.5 text-xs text-amber-900"
              : "rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs text-primary"
          }
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
