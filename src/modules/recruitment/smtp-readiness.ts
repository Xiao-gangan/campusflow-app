import type { SmtpAccount, SmtpConnectionResult, SmtpTestMode } from "../../../shared/contracts/smtp.ts";

export const CONNECTION_FRESH_MS = 15 * 60 * 1000;

type AccountReadiness = {
  ready: boolean;
  badge: string;
  tone: string;
  summary: string;
};

export function evaluateAccountReadiness(
  account: SmtpAccount | null,
  testMode: SmtpTestMode,
  connectionResult?: SmtpConnectionResult,
  checkedAt?: number,
  now = Date.now(),
): AccountReadiness {
  if (!account) {
    return {
      ready: false,
      badge: "保存后可测连接",
      tone: "border-border/70 bg-background text-muted-foreground",
      summary: "保存后点「测试连接」验证能否鉴权发信，不会发出测试邮件。",
    };
  }
  if (account.status === "disabled") {
    return {
      ready: false,
      badge: "已停用 · 不可发",
      tone: "border-stone-200 bg-stone-50 text-stone-700",
      summary: "该发件邮箱已停用。",
    };
  }
  if (!account.hasSecret) {
    return {
      ready: false,
      badge: "缺少授权码",
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      summary: "请先填写并保存 SMTP 授权码后再测试连接。",
    };
  }
  if (connectionResult && connectionResult.mode === testMode) {
    if (connectionResult.ok) {
      const fresh = checkedAt !== undefined && now >= checkedAt && now - checkedAt < CONNECTION_FRESH_MS;
      return fresh
        ? {
            ready: true,
            badge: connectionResult.mode === "real" ? "连接正常 · 仅完成认证" : "合成连接通过",
            tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
            summary: `${connectionResult.message}（15 分钟内有效）`,
          }
        : {
            ready: false,
            badge: "建议重测连接",
            tone: "border-amber-200 bg-amber-50 text-amber-900",
            summary: "上次连接检测已超过 15 分钟，正式发信前建议重新测一次。",
          };
    }
    return {
      ready: false,
      badge: testMode === "disabled" ? "测试开关关闭" : "连接未通过",
      tone: testMode === "disabled"
        ? "border-stone-200 bg-stone-50 text-stone-700"
        : "border-rose-200 bg-rose-50 text-rose-800",
      summary: connectionResult.message,
    };
  }
  if (account.status === "failed") {
    return {
      ready: false,
      badge: "上次测试失败",
      tone: "border-rose-200 bg-rose-50 text-rose-800",
      summary: "上次测试未通过，建议核对授权码后重新测试连接。",
    };
  }
  if (testMode === "disabled") {
    return {
      ready: false,
      badge: "本机演示 · 未联网",
      tone: "border-stone-200 bg-stone-50 text-stone-700",
      summary: "本机连接测试当前关闭。候选人批次仍使用模拟传输。",
    };
  }
  return {
    ready: false,
    badge: "待测连接",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
    summary: "发信前建议先点「测试连接」，确认账号与授权码可正常登录。",
  };
}
