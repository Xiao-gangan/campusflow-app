import { BROWSER_DEMO } from "../browser-demo/mode";
import { useEffect, useId, useMemo, useState, type ReactElement } from "react";
import { CheckCircle2, Eye, EyeOff, XCircle } from "lucide-react";
import { AI_PROVIDERS, type AiProviderId } from "@/shared/ai/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clearCredential,
  credentialStatus,
  saveCredential,
  saveProviderModel,
  setDefaultProvider,
  subscribeCredentials,
  type CredentialStatus,
} from "./credentials";
import { useProviderSummaries } from "./use-ai-configuration";
import { requestAiConnectionTest } from "./design-request";

export function useCredentialStatus(provider: AiProviderId = "deepseek") {
  const [status, setStatus] = useState<CredentialStatus | "loading">("loading");
  useEffect(() => {
    let revision = 0;
    function refresh() {
      const current = ++revision;
      void credentialStatus(provider).then((next) => {
        if (current === revision) setStatus(next);
      });
    }
    const unsubscribe = subscribeCredentials(refresh);
    refresh();
    return () => {
      revision++;
      unsubscribe();
    };
  }, [provider]);
  return status;
}

const labels: Record<CredentialStatus, string> = {
  saved: "已加密保存在此浏览器",
  temporary: "当前标签页已配置，刷新后失效",
  legacy: "仍在使用旧版本地配置，加密迁移尚未完成",
  empty: "尚未配置密钥",
  unavailable: "IndexedDB 或 Web Crypto 不可用，可仅在此标签页使用",
};

const statusTone: Record<CredentialStatus, string> = {
  saved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  temporary: "border-sky-200 bg-sky-50 text-sky-800",
  legacy: "border-amber-200 bg-amber-50 text-amber-900",
  empty: "border-border/60 bg-muted/40 text-muted-foreground",
  unavailable: "border-rose-200 bg-rose-50 text-rose-800",
};

function statusLabel(status: CredentialStatus) {
  return status === "saved"
    ? "已保存"
    : status === "temporary"
      ? "临时"
      : status === "legacy"
        ? "旧配置"
        : status === "empty"
          ? "未配置"
          : "存储不可用";
}

function SettingsForm() {
  const inputId = useId();
  const { summaries, loading } = useProviderSummaries();
  const [selected, setSelected] = useState<AiProviderId>("deepseek");
  const [model, setModel] = useState(AI_PROVIDERS.deepseek.defaultModel);
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testState, setTestState] = useState<{ ok: boolean; message: string } | null>(null);
  const current = useMemo(
    () => summaries.find((item) => item.provider === selected),
    [summaries, selected],
  );
  const status = current?.status ?? "empty";
  const configured = status === "saved" || status === "temporary" || status === "legacy";
  const canSave = !busy && value.trim().length > 0;

  useEffect(() => {
    if (current?.model) setModel(current.model);
  }, [current?.model, selected]);

  async function update(action: "save" | "temporary" | "clear") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    setTestState(null);
    try {
      if (action === "clear") {
        await clearCredential(status, selected);
        setNotice(`${AI_PROVIDERS[selected].label} 配置已清除。`);
      } else {
        await saveCredential(value, action === "save", selected, model);
        setNotice(
          action === "save"
            ? `${AI_PROVIDERS[selected].label} 密钥已加密保存。`
            : `${AI_PROVIDERS[selected].label} 仅在当前标签页使用。`,
        );
      }
      setValue("");
      setVisible(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function changeModel(nextModel: string) {
    setModel(nextModel);
    setError("");
    if (!configured || status === "legacy") return;
    setBusy(true);
    try {
      await saveProviderModel(selected, nextModel);
      setNotice(`${AI_PROVIDERS[selected].label} 的模型偏好已更新。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "模型保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault() {
    setBusy(true);
    setError("");
    try {
      await setDefaultProvider(selected);
      setNotice(`${AI_PROVIDERS[selected].label} 已设为默认模型。邮件和邀请函共用。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "设置默认模型失败。");
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    if (!configured) return;
    setBusy(true);
    setError("");
    setTestState(null);
    try {
      const response = await requestAiConnectionTest(selected, model, new AbortController().signal);
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "连接测试失败。");
      setTestState({
        ok: true,
        message: `连接成功：${body.provider} · ${body.model}`,
      });
    } catch (cause) {
      setTestState({
        ok: false,
        message: cause instanceof Error ? cause.message : "连接测试失败。",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {summaries.map((summary) => (
          <button
            key={summary.provider}
            type="button"
            onClick={() => {
              setSelected(summary.provider);
              setValue("");
              setTestState(null);
              setError("");
            }}
            className={
              summary.provider === selected
                ? "rounded-xl border border-primary/50 bg-primary/[0.04] p-3 text-left"
                : "rounded-xl border border-border/70 p-3 text-left hover:bg-muted/40"
            }
          >
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold">{summary.label}</span>
              {summary.isDefault ? <Badge className="rounded-full text-[9px]">默认</Badge> : null}
            </span>
            <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] ${statusTone[summary.status]}`}>
              {statusLabel(summary.status)}
            </span>
            <span className="mt-1 block truncate text-[10px] text-muted-foreground">{summary.model}</span>
          </button>
        ))}
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) void update(status === "unavailable" ? "temporary" : "save");
        }}
      >
        <div className="space-y-2">
          <Label htmlFor={inputId}>{AI_PROVIDERS[selected].label} API Key</Label>
          <div className="flex items-center gap-2">
            <Input
              id={inputId}
              type={visible ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              value={value}
              disabled={busy}
              placeholder={configured ? "输入新密钥以更换" : "粘贴你的密钥"}
              onChange={(event) => {
                setValue(event.target.value);
                setError("");
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy || !value}
              aria-label={visible ? "隐藏输入的密钥" : "显示输入的密钥"}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
          <p role="status" className="text-xs text-muted-foreground">
            {loading ? "正在读取配置…" : labels[status]}
          </p>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {notice ? <p role="status" className="text-xs text-emerald-700">{notice}</p> : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label className="text-[12px]">模型</Label>
            <select
              value={model}
              disabled={busy}
              onChange={(event) => void changeModel(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {AI_PROVIDERS[selected].models.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" disabled={busy || !configured} onClick={() => void testConnection()}>
            测试连接
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={!canSave}>
            {status === "unavailable" ? "仅在此标签页使用" : "保存到此浏览器"}
          </Button>
          {status !== "temporary" && status !== "unavailable" ? (
            <Button type="button" variant="outline" disabled={!canSave} onClick={() => void update("temporary")}>
              仅在此标签页使用
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={busy || !configured} onClick={() => void makeDefault()}>
            设为默认模型
          </Button>
          {configured ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void update("clear")}>
              {status === "temporary" ? "清除临时密钥" : "清除配置"}
            </Button>
          ) : null}
        </div>
        {testState ? (
          <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${testState.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
            {testState.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
            <span>{testState.message}</span>
          </p>
        ) : null}
      </form>

      <p className="text-[11px] leading-5 text-muted-foreground">
        各厂商密钥独立加密保存在当前浏览器；邮件与邀请函共用默认模型。
      </p>
    </div>
  );
}

export function AiSettingsDialog({ children }: { children: ReactElement }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI 配置</DialogTitle>
          <DialogDescription>
            {BROWSER_DEMO ? "浏览器内模拟生成邮件和邀请函。打开设计编辑器即可体验，无需输入 API Key。" : "邮件和邀请函共用默认模型。真实调用会消耗对应厂商额度；本机演示勾选“本地演示”时不调用任何模型。"}
          </DialogDescription>
        </DialogHeader>
        {!BROWSER_DEMO && <SettingsForm />}
      </DialogContent>
    </Dialog>
  );
}