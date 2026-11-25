import { BROWSER_DEMO } from "../browser-demo/mode";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Cable,
  CheckCircle2,
  CircleAlert,
  HelpCircle,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldX,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SmtpAccount,
  SmtpAccountInput,
  SmtpConnectionResult,
  SmtpTestInboxItem,
  SmtpTestMode,
  SmtpTestResult,
} from "@/shared/contracts/smtp";
import type { SavedDesignTemplate } from "@/shared/contracts/open-api";
import { SMTP_PRESETS } from "@/shared/email/smtp-presets";
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
import { Label } from "@/components/ui/label";
import { CONNECTION_FRESH_MS, evaluateAccountReadiness } from "./smtp-readiness";
import { DemoApiError, demoApi } from "./local-demo-client";
import { isOrganizationCustomized, useOrganizationProfile } from "../org/organization";

type FormState = {
  provider: SmtpAccount["provider"];
  label: string;
  fromName: string;
  fromEmail: string;
  credential: string;
  isDefault: boolean;
};

const STATUS: Record<SmtpAccount["status"], { label: string; tone: string }> = {
  unverified: { label: "未验证", tone: "border-amber-200 bg-amber-50 text-amber-800" },
  verified: { label: "已验证", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  failed: { label: "验证失败", tone: "border-rose-200 bg-rose-50 text-rose-800" },
  disabled: { label: "已停用", tone: "border-stone-200 bg-stone-50 text-stone-700" },
};

const TEST_MODE: Record<SmtpTestMode, { short: string; className: string; action: string; dialog: string }> = {
  disabled: {
    short: "测试关闭 · 不连接",
    className: "border-stone-200 bg-stone-50 text-stone-700",
    action: "检查测试开关",
    dialog: "真实测试当前关闭；点击只会返回关闭原因，不会发送邮件。",
  },
  synthetic: {
    short: "本机合成 · 不联网",
    className: "border-sky-200 bg-sky-50 text-sky-900",
    action: "执行合成测试",
    dialog: "本机合成模式：只写入本机合成收件箱，不连接真实 SMTP。",
  },
  real: {
    short: "真实测试 · 单封",
    className: "border-amber-200 bg-amber-50 text-amber-900",
    action: "确认发送 1 封真实测试邮件",
    dialog: "真实模式将向你填写的收件邮箱发送一封测试邮件。",
  },
};

function defaultSenderName(profile: ReturnType<typeof useOrganizationProfile>) {
  return isOrganizationCustomized(profile) ? `${profile.name.trim()} 招新组` : "招新组";
}

function initialForm(fromName = "招新组"): FormState {
  const preset = SMTP_PRESETS.qq;
  return {
    provider: "qq",
    label: preset.label,
    fromName,
    fromEmail: "",
    credential: "",
    isDefault: false,
  };
}

function dateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function errorText(error: unknown) {
  return error instanceof DemoApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "操作失败。";
}

export default function MailAccountSettings({ emailTemplates, onRefreshTemplates }: {
  emailTemplates: SavedDesignTemplate[];
  onRefreshTemplates: () => void;
}) {
  const organization = useOrganizationProfile();
  const testRecipientId = useId();
  const testTemplateId = useId();
  const [accounts, setAccounts] = useState<SmtpAccount[]>([]);
  const [inbox, setInbox] = useState<SmtpTestInboxItem[]>([]);
  const [testMode, setTestMode] = useState<{ mode: SmtpTestMode; recipientConfigured: boolean }>({
    mode: "disabled",
    recipientConfigured: false,
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{ account: SmtpAccount | null } | null>(null);
  const [testing, setTesting] = useState<{ account: SmtpAccount; to: string; templateId: string } | null>(null);
  const [testError, setTestError] = useState("");
  const [testResult, setTestResult] = useState<SmtpTestResult | null>(null);
  const [connectionBusyId, setConnectionBusyId] = useState("");
  const [connectionResults, setConnectionResults] = useState<Record<string, SmtpConnectionResult>>({});
  const [connectionCheckedAt, setConnectionCheckedAt] = useState<Record<string, number>>({});
  const [connectionClock, setConnectionClock] = useState(() => Date.now());

  useEffect(() => {
    const next = Math.min(...Object.values(connectionCheckedAt)
      .map((time) => time + CONNECTION_FRESH_MS)
      .filter((time) => time > connectionClock));
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(() => setConnectionClock(Date.now()), Math.max(0, next - Date.now()) + 1);
    return () => window.clearTimeout(timer);
  }, [connectionCheckedAt, connectionClock]);

  const load = async () => {
    setLoading(true);
    setError("");
    setConnectionResults({});
    setConnectionCheckedAt({});
    try {
      const [rows, messages, mode] = await Promise.all([
        demoApi.listSmtpAccounts(),
        demoApi.listSmtpInbox(),
        demoApi.getSmtpTestMode(),
      ]);
      setAccounts(rows);
      setInbox(messages);
      setTestMode(mode);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const ordered = useMemo(
    () => [...accounts].sort((left, right) => Number(right.isDefault) - Number(left.isDefault)),
    [accounts],
  );
  const modeCopy = BROWSER_DEMO ? {
    ...TEST_MODE.synthetic, short: "公开演示 · 模拟发信",
    dialog: "邮件只写入此浏览器的演示收件箱。请使用示例地址，不输入真实授权码。",
  } : TEST_MODE[testMode.mode];

  async function setDefault(account: SmtpAccount) {
    setBusyId(account.id);
    setError("");
    try {
      await demoApi.updateSmtpAccount(account.id, {
        provider: account.provider,
        label: account.label,
        fromName: account.fromName,
        fromEmail: account.fromEmail,
        isDefault: true,
      });
      setNotice(`${account.fromEmail} 已设为默认发件邮箱。`);
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusyId("");
    }
  }

  async function disable(account: SmtpAccount) {
    setBusyId(account.id);
    setError("");
    try {
      await demoApi.disableSmtpAccount(account.id);
      setNotice(`${account.fromEmail} 已停用。`);
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusyId("");
    }
  }

  async function runConnection(account: SmtpAccount) {
    if (connectionBusyId) return;
    setConnectionBusyId(account.id);
    setError("");
    try {
      const result = await demoApi.testSmtpConnection(account.id);
      setConnectionResults((current) => ({ ...current, [account.id]: result }));
      const checkedAt = Date.now();
      setConnectionCheckedAt((current) => ({ ...current, [account.id]: checkedAt }));
      setConnectionClock(checkedAt);
      setTestMode((current) => ({ ...current, mode: result.mode }));
      setAccounts((current) => current.map((item) => item.id === account.id && item.updatedAt === account.updatedAt ? result.account : item));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setConnectionBusyId("");
    }
  }

  async function runTest() {
    if (!testing || busyId) return;
    setBusyId(testing.account.id);
    setTestError("");
    setTestResult(null);
    try {
      const result = await demoApi.testSmtpAccount(testing.account.id, {
        to: testing.to.trim(),
        ...(testing.templateId ? { templateId: testing.templateId, organizationName: organization.name } : {}),
      });
      setTestResult(result);
      setTestMode((current) => ({ ...current, mode: result.mode }));
      setTesting((current) => current ? { ...current, account: result.account } : null);
      await load();
    } catch (cause) {
      setTestError(errorText(cause));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-card/80 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`rounded-full border px-2 py-0.5 ${modeCopy.className}`}>{modeCopy.short}</span>
          {testMode.mode === "real" && testMode.recipientConfigured ? (
            <span className="text-amber-800">已限定测试收件人</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            刷新
          </Button>
          <Button type="button" size="sm" className="h-7 px-2.5" onClick={() => setEditor({ account: null })}>
            <Plus className="size-3.5 shrink-0" aria-hidden="true" />
            添加发件邮箱
          </Button>
        </div>
      </div>

      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs">{notice}</p> : null}

      {loading ? (
        <p className="rounded-2xl bg-card/70 px-4 py-8 text-center text-sm text-muted-foreground">正在读取发件邮箱…</p>
      ) : ordered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-10 text-center">
          <p className="text-sm font-medium">尚未配置发件邮箱</p>
          <p className="mt-1 text-xs text-muted-foreground">添加 QQ、163、126 或腾讯企业邮箱；主机与端口由服务端预设。</p>
        </div>
      ) : (
        <div className="grid min-w-0 gap-3 xl:grid-cols-2">
          {ordered.map((account) => {
            const status = account.status === "verified" && account.verificationMethod === "synthetic"
              ? { label: "本机合成通过", tone: "border-sky-200 bg-sky-50 text-sky-800" }
              : STATUS[account.status];
            const preset = SMTP_PRESETS[account.provider];
            const connectionResult = connectionResults[account.id];
            const readiness = evaluateAccountReadiness(
              account,
              testMode.mode,
              connectionResult,
              connectionCheckedAt[account.id],
              connectionClock,
            );
            return (
              <article key={account.id} className="min-w-0 max-w-full rounded-[22px] border border-border/70 bg-card/80 p-4">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{account.label}</h3>
                      <Badge variant="outline" className="rounded-full text-[10px]">{preset.label}</Badge>
                      {account.isDefault ? <Badge className="rounded-full bg-primary text-[10px] text-primary-foreground">默认</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{account.fromName} · {account.fromEmail}</p>
                    <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{account.smtpHost}:{account.smtpPort} · {account.encryption.toUpperCase()}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${status.tone}`}>{status.label}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                  <span className={`rounded-full border px-2 py-0.5 font-medium ${readiness.tone}`}>{readiness.badge}</span>
                  <span className="rounded-full border border-border/60 px-2 py-0.5">{account.hasSecret ? "已保存凭据" : "无凭据"}</span>
                  <span className="rounded-full border border-border/60 px-2 py-0.5">最近测试：{dateTime(account.lastTestedAt)}</span>
                  {account.lastErrorCode ? <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-800">{account.lastErrorCode}</span> : null}
                </div>
                <div className="mt-3 min-w-0 space-y-2 border-t border-border/60 pt-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" size="sm" className="h-7" disabled={!account.hasSecret || account.status === "disabled"} onClick={() => { onRefreshTemplates(); setTestResult(null); setTestError(""); setTesting({ account, to: "", templateId: "" }); }}>
                      <Send className="size-3" aria-hidden="true" />
                      发送测试邮件
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7"
                      title="仅测试 TLS、EHLO 与 AUTH 连接，不发送邮件"
                      disabled={connectionBusyId === account.id}
                      onClick={() => void runConnection(account)}
                    >
                      <Cable className="size-3" aria-hidden="true" />
                      {connectionBusyId === account.id ? "连接中…" : "测试连接"}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setEditor({ account })}>
                      <Pencil className="size-3" aria-hidden="true" />
                      编辑
                    </Button>
                    {!account.isDefault ? (
                      <Button type="button" size="sm" variant="ghost" className="h-7" disabled={account.status === "disabled" || busyId === account.id} onClick={() => void setDefault(account)}>
                        <Star className="size-3" aria-hidden="true" />
                        设为默认
                      </Button>
                    ) : null}
                    {account.status !== "disabled" ? (
                      <Button type="button" size="sm" variant="ghost" className="h-7 text-rose-700" disabled={busyId === account.id} onClick={() => void disable(account)}>
                        <ShieldX className="size-3" aria-hidden="true" />
                        停用
                      </Button>
                    ) : null}
                  </div>
                </div>
                {connectionResult ? (
                  <div className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-[11px] leading-5 ${connectionResult.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                    {connectionResult.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}
                    <span>
                      [{connectionResult.mode === "real" ? "真实连接" : connectionResult.mode === "synthetic" ? "本机合成连接" : "连接测试关闭"}]
                      {" "}{connectionResult.message}（{connectionResult.code}）
                    </span>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {testMode.mode === "synthetic" || inbox.length > 0 ? (
        <div className="rounded-[24px] border border-border/70 bg-card/80 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{BROWSER_DEMO ? "浏览器演示收件箱" : "单封测试记录"}</h3>
              <p className="mt-1 text-[10px] text-muted-foreground">只有测试发送成功时才会写入；不会连接网络。</p>
            </div>
            <Badge variant="outline" className="rounded-full text-[10px]">{inbox.length} 封</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {inbox.length === 0 ? (
              <p className="rounded-xl bg-muted/30 px-3 py-5 text-center text-xs text-muted-foreground">还没有合成测试邮件。</p>
            ) : inbox.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/60 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{item.subject}</span>
                  <span className="text-[10px] text-muted-foreground">{dateTime(item.createdAt)}</span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">{item.recipient} · {item.code}</p>
                <p className="mt-1 whitespace-pre-line text-[10px] leading-4 text-muted-foreground [overflow-wrap:anywhere]">{item.bodyText}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <SmtpEditorDialog
        state={editor}
        testMode={testMode.mode}
        connectionResult={editor?.account ? connectionResults[editor.account.id] : undefined}
        connectionCheckedAt={editor?.account ? connectionCheckedAt[editor.account.id] : undefined}
        connectionClock={connectionClock}
        connectionBusy={Boolean(editor?.account && connectionBusyId === editor.account.id)}
        onTestConnection={runConnection}
        onClose={() => setEditor(null)}
        onSaved={async (message) => {
          setEditor(null);
          setNotice(message);
          await load();
        }}
      />

      <Dialog
        open={Boolean(testing)}
        onOpenChange={(open) => {
          if (!open && !busyId) {
            setTesting(null);
            setTestResult(null);
            setTestError("");
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>发送单封测试邮件</DialogTitle>
            <DialogDescription>{modeCopy.dialog}{testMode.mode === "real" && testMode.recipientConfigured ? " 收件地址受服务端白名单限制。" : ""}</DialogDescription>
          </DialogHeader>
          {testing ? (
            <div className="space-y-3">
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                {testing.account.fromName} · {testing.account.fromEmail} · {testing.account.smtpHost}:{testing.account.smtpPort}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor={testRecipientId} className="text-[12px]">测试收件人</Label>
                <Input
                  id={testRecipientId}
                  disabled={!!busyId}
                  value={testing.to}
                  onChange={(event) => setTesting({ ...testing, to: event.target.value })}
                  placeholder={testMode.recipientConfigured ? "输入允许的测试邮箱" : "输入测试邮箱"}
                  type="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={testTemplateId} className="text-[12px]">邮件内容</Label>
                <select id={testTemplateId} className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                  value={testing.templateId} disabled={!!busyId} onChange={(event) => {
                    setTestResult(null);
                    setTestError("");
                    setTesting({ ...testing, templateId: event.target.value });
                  }}>
                  <option value="">基础连通性纯文本</option>
                  {testing.templateId && !emailTemplates.some(({ id }) => id === testing.templateId) &&
                    <option value={testing.templateId}>模板已移除，请重新选择</option>}
                  {emailTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </div>
              {testError && <p role="alert" className="text-xs text-rose-800">{testError}</p>}
              {testResult ? (
                <div role="status" className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${testResult.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                  {testResult.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                  <span>
                    [{testResult.mode === "real" ? "真实 SMTP" : testResult.mode === "synthetic" ? "本机合成" : "测试关闭"}]
                    {" "}{testResult.message}（{testResult.code}）
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={!!busyId} onClick={() => { setTesting(null); setTestResult(null); setTestError(""); }}>关闭</Button>
            <Button type="button" disabled={!testing?.to.trim() || busyId !== ""} onClick={() => void runTest()}>
              <Send className="size-3.5" aria-hidden="true" />
              {busyId ? "测试中…" : modeCopy.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

type PreviewFocusField = "fromName" | "label" | "fromEmail" | "isDefault" | null;

const SMTP_PROVIDER_HINTS: Record<
  SmtpAccount["provider"],
  { placeholder: string; path: string; note: string; rateTip: string }
> = {
  qq: {
    placeholder: "recruit@qq.com",
    path: "网页版 QQ 邮箱 → 设置 → 账号 → 开启「POP3/SMTP 服务」→ 验证后生成授权码",
    note: "请填生成的授权码，不是 QQ 登录密码。",
    rateTip: "QQ 邮箱建议每批不超过 10 封，两批之间间隔数分钟。",
  },
  "163": {
    placeholder: "recruit@163.com",
    path: "网页版 163 邮箱 → 设置 → POP3/SMTP/IMAP → 开启「IMAP/SMTP 服务」→ 新增授权密码",
    note: "请填生成的授权密码，不是邮箱登录密码。",
    rateTip: "163 邮箱建议每批不超过 10 封，两批之间间隔数分钟。",
  },
  "126": {
    placeholder: "recruit@126.com",
    path: "网页版 126 邮箱 → 设置 → POP3/SMTP/IMAP → 开启「IMAP/SMTP 服务」→ 新增授权密码",
    note: "请填生成的授权密码，不是邮箱登录密码。",
    rateTip: "126 邮箱与 163 规则相近，建议每批 ≤10 封错峰发送，避免触发临时限制。",
  },
  exmail: {
    placeholder: "recruit@org-domain.com",
    path: "网页版腾讯企业邮箱 → 设置 → 邮箱绑定 / 安全登录 → 点击「生成新密码」获取客户端专用密码",
    note: "开启安全登录/微信绑定后必须使用客户端专用密码。",
    rateTip: "企业邮箱发信额度高于个人邮箱，大批量通知仍建议分批发送并先测试连接。",
  },
};

function previewAvatarChar(name: string) {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0] : "招";
}

function SmtpEditorDialog({
  state,
  testMode,
  connectionResult,
  connectionCheckedAt,
  connectionClock,
  connectionBusy,
  onTestConnection,
  onClose,
  onSaved,
}: {
  state: { account: SmtpAccount | null } | null;
  testMode: SmtpTestMode;
  connectionResult?: SmtpConnectionResult;
  connectionCheckedAt?: number;
  connectionClock: number;
  connectionBusy: boolean;
  onTestConnection: (account: SmtpAccount) => Promise<void>;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const org = useOrganizationProfile();
  const orgRef = useRef(org);
  orgRef.current = org;
  const [form, setForm] = useState<FormState>(() => initialForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeField, setActiveField] = useState<PreviewFocusField>(null);
  const [showAuthGuide, setShowAuthGuide] = useState(false);

  useEffect(() => {
    if (!state) return;
    setError("");
    setActiveField(null);
    setShowAuthGuide(false);
    if (state.account) {
      setForm({
        provider: state.account.provider,
        label: state.account.label,
        fromName: state.account.fromName,
        fromEmail: state.account.fromEmail,
        credential: "",
        isDefault: state.account.isDefault,
      });
    } else {
      setForm(initialForm(defaultSenderName(orgRef.current)));
    }
  }, [state]);

  const fieldId = useId();
  const preset = SMTP_PRESETS[form.provider];
  const providerHint = SMTP_PROVIDER_HINTS[form.provider];
  const previewFromName = form.fromName.trim() || "招新组";
  const previewEmail = form.fromEmail.trim() || providerHint.placeholder;
  const previewLabel = form.label.trim() || preset.label;
  const readiness = evaluateAccountReadiness(
    state?.account ?? null,
    testMode,
    connectionResult,
    connectionCheckedAt,
    connectionClock,
  );
  const account = state?.account;
  const connectionChanged = Boolean(account && (
    form.credential.trim() || form.provider !== account.provider || form.fromEmail.trim() !== account.fromEmail
  ));
  const canInlineTest = Boolean(account?.hasSecret && account.status !== "disabled" && !connectionChanged);

  async function save() {
    if (!state || saving) return;
    if (!form.fromEmail.trim() || !form.fromName.trim()) {
      setError("请填写发件邮箱和发件人名称。");
      return;
    }
    setSaving(true);
    setError("");
    const input: SmtpAccountInput = {
      provider: form.provider,
      label: form.label.trim() || preset.label,
      fromName: form.fromName.trim(),
      fromEmail: form.fromEmail.trim(),
      isDefault: form.isDefault,
      ...(BROWSER_DEMO ? { credential: "demo-only" } : form.credential.trim() ? { credential: form.credential.trim() } : {}),
    };
    try {
      if (state.account) await demoApi.updateSmtpAccount(state.account.id, input);
      else await demoApi.createSmtpAccount(input);
      await onSaved(state.account ? "发件邮箱已更新。" : "发件邮箱已添加。");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{state?.account ? "编辑发件邮箱" : "添加发件邮箱"}</DialogTitle>
          <DialogDescription>主机、TLS 与端口由服务端厂商预设决定，不接受任意主机。</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,272px)] md:items-start">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${fieldId}-provider`} className="text-[12px]">邮箱厂商</Label>
              <select
                id={`${fieldId}-provider`}
                value={form.provider}
                onChange={(event) => {
                  const provider = event.target.value as FormState["provider"];
                  setForm({ ...form, provider, label: SMTP_PRESETS[provider].label });
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {Object.values(SMTP_PRESETS).map((item) => <option key={item.provider} value={item.provider}>{item.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[12px]">服务端预设</Label>
              <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 font-mono text-[11px]">
                {preset.host}:{preset.port} · {preset.encryption.toUpperCase()}（只读）
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-fromName`} className="text-[12px]">发件人名称</Label>
              <Input
                id={`${fieldId}-fromName`}
                value={form.fromName}
                onMouseEnter={() => setActiveField("fromName")}
                onMouseLeave={(event) => {
                  if (document.activeElement !== event.currentTarget)
                    setActiveField((current) => current === "fromName" ? null : current);
                }}
                onFocus={() => setActiveField("fromName")}
                onBlur={() => setActiveField((current) => (current === "fromName" ? null : current))}
                onChange={(event) => setForm({ ...form, fromName: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-label`} className="text-[12px]">显示标签</Label>
              <Input
                id={`${fieldId}-label`}
                value={form.label}
                onMouseEnter={() => setActiveField("label")}
                onMouseLeave={(event) => {
                  if (document.activeElement !== event.currentTarget)
                    setActiveField((current) => current === "label" ? null : current);
                }}
                onFocus={() => setActiveField("label")}
                onBlur={() => setActiveField((current) => (current === "label" ? null : current))}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${fieldId}-fromEmail`} className="text-[12px]">发件邮箱</Label>
              <Input
                id={`${fieldId}-fromEmail`}
                type="email"
                value={form.fromEmail}
                onMouseEnter={() => setActiveField("fromEmail")}
                onMouseLeave={(event) => {
                  if (document.activeElement !== event.currentTarget)
                    setActiveField((current) => current === "fromEmail" ? null : current);
                }}
                onFocus={() => setActiveField("fromEmail")}
                onBlur={() => setActiveField((current) => (current === "fromEmail" ? null : current))}
                onChange={(event) => setForm({ ...form, fromEmail: event.target.value })}
                placeholder={providerHint.placeholder}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor={`${fieldId}-credential`} className="text-[12px]">SMTP 授权码 / 密码</Label>
                <button
                  type="button"
                  onClick={() => setShowAuthGuide((open) => !open)}
                  aria-expanded={showAuthGuide}
                  aria-controls={`${fieldId}-auth-guide`}
                  aria-label="查看如何获取 SMTP 授权码"
                  title="查看获取路径"
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded-full transition-colors",
                    showAuthGuide
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <HelpCircle className="size-3.5" aria-hidden="true" />
                </button>
              </div>
              {showAuthGuide ? (
                <div id={`${fieldId}-auth-guide`} className="rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2 text-[11px] leading-5 text-foreground/85">
                  <p className="font-medium text-foreground">{preset.label} 获取路径</p>
                  <p className="mt-0.5 text-muted-foreground">{providerHint.path}</p>
                  <p className="mt-1 text-[10.5px] text-primary/90">{providerHint.note}</p>
                </div>
              ) : null}
              <Input
                id={`${fieldId}-credential`}
                type="password"
                value={form.credential} disabled={BROWSER_DEMO}
                onChange={(event) => setForm({ ...form, credential: event.target.value })}
                placeholder={BROWSER_DEMO ? "此演示无需授权码" : state?.account?.hasSecret ? "留空保留已保存凭据；输入新值会重置验证状态" : "输入邮箱授权码或客户端密码"}
                autoComplete="new-password"
              />
              <p className="text-[10px] leading-4 text-muted-foreground">{BROWSER_DEMO ? "此浏览器只使用模拟凭据。" : "凭据只在服务端加密保存；列表与响应仅返回有无凭据。"}</p>
            </div>
            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <input
                type="checkbox"
                checked={form.isDefault}
                disabled={Boolean(state?.account?.isDefault)}
                onMouseEnter={() => setActiveField("isDefault")}
                onMouseLeave={(event) => {
                  if (document.activeElement !== event.currentTarget)
                    setActiveField((current) => current === "isDefault" ? null : current);
                }}
                onFocus={() => setActiveField("isDefault")}
                onBlur={() => setActiveField((current) => (current === "isDefault" ? null : current))}
                onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
                className="size-4 accent-[#1d5343]"
              />
              设为默认发件邮箱
            </label>
          </div>

          <aside
            aria-label="发件效果实时预览"
            className="min-w-0 space-y-3 rounded-2xl border border-border/70 bg-muted/25 p-3.5"
          >
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                候选人收件箱所见
              </p>
              <div className="rounded-xl border border-border/70 bg-background p-3 shadow-2xs">
                <div className="flex items-start gap-2.5">
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary"
                    aria-hidden="true"
                  >
                    {previewAvatarChar(previewFromName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        data-preview-field="fromName"
                        data-highlighted={activeField === "fromName"}
                        className={cn(
                          "truncate rounded px-1 -mx-1 text-xs font-semibold transition-colors",
                          activeField === "fromName" && "bg-primary/12 text-primary ring-1 ring-primary/30",
                        )}
                      >
                        {previewFromName}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">刚刚</span>
                    </div>
                    <p
                      data-preview-field="fromEmail"
                      data-highlighted={activeField === "fromEmail"}
                      className={cn(
                        "mt-0.5 truncate rounded px-1 -mx-1 font-mono text-[10px] text-muted-foreground transition-colors",
                        activeField === "fromEmail" && "bg-primary/12 text-primary ring-1 ring-primary/30",
                      )}
                    >
                      &lt;{previewEmail}&gt;
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 border-t border-border/50 pt-2">
                  <p className="truncate text-[11.5px] font-medium text-foreground">
                    【面试邀请】欢迎参加本次招新面试
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-4 text-muted-foreground">
                    你好，诚邀你参加本次面试，请点击邮件中的专属链接确认是否出席…
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                后台发件列表所见
              </p>
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    data-preview-field="label"
                    data-highlighted={activeField === "label"}
                    className={cn(
                      "min-w-0 max-w-full truncate rounded px-1 -mx-1 text-xs font-semibold transition-colors",
                      activeField === "label" && "bg-primary/12 text-primary ring-1 ring-primary/30",
                    )}
                  >
                    {previewLabel}
                  </span>
                  <Badge variant="outline" className="rounded-full text-[9.5px]">
                    {preset.label}
                  </Badge>
                  <Badge
                    variant={form.isDefault ? "default" : "outline"}
                    data-preview-field="isDefault"
                    data-highlighted={activeField === "isDefault"}
                    className={cn(
                      "rounded-full text-[9.5px]",
                      activeField === "isDefault" && "ring-2 ring-primary/35 ring-offset-1",
                    )}
                  >
                    {form.isDefault ? "默认" : "非默认"}
                  </Badge>
                </div>
                <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                  {previewFromName} · {previewEmail}
                </p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/75">
                  {preset.host}:{preset.port} · {preset.encryption.toUpperCase()}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  连接状态与发信建议
                </p>
                <span className={cn(
                  "rounded-full border px-2 py-0.5 text-[9.5px] font-medium",
                  connectionChanged ? "border-amber-200 bg-amber-50 text-amber-900" : readiness.tone,
                )}>
                  {connectionChanged ? "保存后重测" : readiness.badge}
                </span>
              </div>
              <div className="space-y-2 rounded-xl border border-border/70 bg-background p-3 text-[11px] leading-5">
                <p className="text-muted-foreground">
                  {connectionChanged
                    ? "配置已修改，请先保存后再测试连接。"
                    : readiness.summary}
                </p>
                {state?.account ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 w-full text-xs"
                    disabled={!canInlineTest || connectionBusy}
                    onClick={() => { if (account) void onTestConnection(account); }}
                  >
                    <Cable className="size-3" aria-hidden="true" />
                    {connectionBusy ? "正在测试连接…" : "测试当前连接状态"}
                  </Button>
                ) : null}
                <p className="border-t border-border/50 pt-2 text-[10.5px] leading-4 text-amber-800/90">
                  {providerHint.rateTip}
                </p>
              </div>
            </div>
          </aside>
        </div>

        {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? "保存中…" : "保存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
