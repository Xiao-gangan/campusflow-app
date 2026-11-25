import { BROWSER_DEMO } from "../browser-demo/mode";
import { openApiSpec } from "../../../dev/open-api/spec";
import { Copy, KeyRound, Plus } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OPEN_API_SCOPES, type OpenApiKeyInfo, type OpenApiScope } from "@/shared/contracts/open-api";
import { openKeyApi } from "./client";

const scopeLabels: Record<OpenApiScope, string> = {
  "templates:read": "读取和渲染模板",
  "templates:write": "创建、编辑和删除模板",
  "recruitment:read": "读取名单、答复和各轮环节结果",
  "rounds:read": "读取面试轮次与环节配置",
  "rounds:write": "创建和编辑面试轮次与环节",
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "请求未完成，请重试。";
}

function KeySettings() {
  const [rows, setRows] = useState<OpenApiKeyInfo[] | null>(null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<OpenApiScope[]>(["templates:read"]);
  const [busy, setBusy] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ id: string; secret: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const origin = window.location.origin;
  const specJson = JSON.stringify(openApiSpec, null, 2);
  const exampleBase = BROWSER_DEMO ? "https://YOUR-CAMPUSFLOW-SERVER" : origin;
  const schemaUrl = `${exampleBase}/api/open/v1/openapi.json`;
  const agentPrompt = `使用 CampusFlow Open API。先读取 ${schemaUrl} 获取端点、权限和模板样例。用环境变量 CAMPUSFLOW_API_KEY 作为 Authorization: Bearer 的值。模板可用 render 检查 HTML、纯文本及缺失变量，保留 {{rsvp_link}} 和 {{onboarding_link}} 为完整链接。

挂载互动环节：GET /rounds（rounds:read）读取当前配置，再按 InterviewRoundInput 的可写字段构造 PUT /rounds/{id}（rounds:write），保留现有设置并写入 customActivities。每项含 id、title、kind、required、enabled，可附 description。新配置仅用于之后签发的邀请。

sandbox_widget 使用内联 HTML/CSS/JS（UTF-8 ≤128 KB）。用 parent.postMessage({ type: "campusflow:activity:progress", progress: 60, progressText: "第 3/5 题", payload: { answers: [] } }, "*") 暂存；载入时发送 { type: "campusflow:activity:ready" } 并监听宿主的 campusflow:activity:restore，从 saved 恢复。提交时改用 campusflow:activity:submit，status 为 completed 或 needs_review。

external_app 使用 HTTP(S) 地址，从 URL hash fragment 读取 cf_activity_token、cf_session_url、cf_callback_url。用 Authorization: Bearer <cf_activity_token> 请求 session GET 获取当前候选人的脱敏环节状态，或用 POST session { cf_activity_token }。向 cf_callback_url POST JSON，凭证可放 Bearer 或 cf_activity_token 字段。浏览器来源需与配置地址匹配。凭证只绑定一人一邀请一环节，服务端验签并核对 SHA-256 记录，有效期最长两小时且受邀请截止约束。进度可多次保存，completed / needs_review 结果锁定。换发、吊销后旧凭证返回 401，管理员可只重签一个环节并保留历史。

按 OpenAPI 的 ExternalActivityCallback 输出纯数据。终态 summary 必填，score/maxScore 与 scoreLabel/scoreUnit 可选；用 badge={ label, tone }、metrics=[{ label, value, max, unit }]（≤8）、qa=[{ question, answer, tag }]（≤40）、tags（≤10）和 payload（JSON 对象 ≤16 KiB）让 CampusFlow 原生渲染。省略 status 的旧 score/summary/payload 格式仍可提交。通过 /candidates/{id}/submissions 读取各轮历史（recruitment:read）。`;
  const curl = `curl -fsS -H "Authorization: Bearer $CAMPUSFLOW_API_KEY" "${exampleBase}/api/open/v1/templates?target=email"`;

  function load() {
    setBusy("list");
    setError("");
    void openKeyApi.list().then(setRows).catch((cause) => setError(errorText(cause))).finally(() => setBusy(null));
  }

  useEffect(load, []);

  async function create() {
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const { secret, ...key } = await openKeyApi.create(name.trim(), scopes);
      setRows((current) => [key, ...(current ?? [])]);
      setRevealed({ id: key.id, secret });
      setName("");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const key = await openKeyApi.revoke(id);
      setRows((current) => current?.map((item) => item.id === id ? key : item) ?? null);
      setRevealed((current) => current?.id === id ? null : current);
      setNotice("API Key 已撤销。");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string, label: string, isSecret = false) {
    setManualCopy("");
    setError("");
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label}已复制。`);
    } catch {
      if (!isSecret) setManualCopy(text);
      setError("浏览器未允许复制，请选中文本手动复制。");
    }
  }

  return (
    <div className="min-w-0 space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void copy(BROWSER_DEMO ? specJson : schemaUrl, BROWSER_DEMO ? "OpenAPI 规范" : "OpenAPI 地址")}>{BROWSER_DEMO ? "复制 OpenAPI 规范" : "复制 OpenAPI 地址"}</Button>
        <Button size="sm" variant="outline" onClick={() => void copy(agentPrompt, "接入提示词")}>复制 Agent 接入提示词</Button>
        <Button size="sm" variant="outline" onClick={() => void copy(curl, "cURL 示例")}>复制 cURL 示例</Button>
      </div>
      {BROWSER_DEMO && <details><summary className="cursor-pointer">浏览 OpenAPI 3.1 规范</summary><pre tabIndex={0} className="mt-2 max-h-56 overflow-auto rounded-lg bg-muted p-3 text-xs">{specJson}</pre></details>}
      {manualCopy ? <Textarea aria-label="手动复制内容" value={manualCopy} readOnly onFocus={(event) => event.target.select()} /> : null}

      {revealed ? (
        <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <Label htmlFor="open-api-secret">新 API Key，仅此一次显示</Label>
          <Input id="open-api-secret" readOnly autoComplete="off" value={revealed.secret}
            className="font-mono text-xs" onFocus={(event) => event.target.select()} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void copy(revealed.secret, "API Key", true)}>
              <Copy aria-hidden="true" />复制 API Key
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>完成</Button>
          </div>
        </div>
      ) : (
        <form className="min-w-0 space-y-3 rounded-xl border border-border/70 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && name.trim() && scopes.length) void create();
          }}>
          <div className="space-y-1.5">
            <Label htmlFor="open-api-key-name">Key 名称</Label>
            <Input id="open-api-key-name" value={name} maxLength={80}
              onChange={(event) => setName(event.target.value)} placeholder="例如：本机模板 Agent" />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium">授予权限</legend>
            {OPEN_API_SCOPES.map((scope) => (
              <label key={scope} className="flex items-start gap-2 text-xs">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[#1d5343]" checked={scopes.includes(scope)}
                  onChange={(event) => setScopes((current) => event.target.checked
                    ? [...current, scope] : current.filter((item) => item !== scope))} />
                <span>{scopeLabels[scope]}</span>
              </label>
            ))}
          </fieldset>
          <Button type="submit" size="sm" disabled={!!busy || !name.trim() || scopes.length === 0}>
            <Plus aria-hidden="true" />{busy === "create" ? "正在创建…" : "创建 API Key"}
          </Button>
        </form>
      )}
      {error ? <p role="alert" className="break-words rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p> : null}
      {notice ? <p role="status" className="text-xs text-emerald-800">{notice}</p> : null}

      <section aria-labelledby="open-api-keys-heading" className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="open-api-keys-heading" className="text-sm font-medium">API Key 列表</h3>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={load}>刷新</Button>
        </div>
        {rows === null && busy === "list" ? <p className="text-xs text-muted-foreground">正在读取…</p> : null}
        {rows?.length === 0 ? <p className="text-xs text-muted-foreground">还没有 API Key。</p> : null}
        {rows?.map((key) => (
          <article key={key.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 p-3">
            <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <p className="text-xs font-medium">{key.name}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{key.maskedPrefix}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{key.scopes.map((scope) => scopeLabels[scope]).join(" · ")}</p>
            </div>
            {key.revokedAt
              ? <span className="shrink-0 text-xs text-muted-foreground">已撤销</span>
              : <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void revoke(key.id)}>撤销</Button>}
          </article>
        ))}
      </section>
    </div>
  );
}

export function OpenApiSettingsDialog({ children }: { children: ReactElement }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="size-4" aria-hidden="true" />开放 API</DialogTitle>
          <DialogDescription>{BROWSER_DEMO ? "演示密钥保存在此浏览器，用于体验签发和撤销。接口示例供连接独立服务时参考。" : "为自有 Agent 签发仅限所选权限的本机访问 Key。"}</DialogDescription>
        </DialogHeader>
        {open && <KeySettings />}
      </DialogContent>
    </Dialog>
  );
}
