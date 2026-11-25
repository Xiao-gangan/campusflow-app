import type { SqlDatabase } from "../../shared/data/sql-database.ts";
import type {
  SmtpAccount,
  SmtpAccountInput,
  SmtpConnectionResult,
  SmtpTestInboxItem,
  SmtpTestResult,
} from "../../shared/contracts/smtp.ts";
import { smtpAddress, SMTP_PRESETS } from "../../shared/email/smtp-presets.ts";
import { RsvpError } from "../rsvp/error.ts";
import type { SmtpSecretVault } from "./smtp-secrets.ts";

const bool = (value: unknown) => value === 1 || value === true;
const int = (value: unknown) => Number(value ?? 0);
const PROVIDERS = new Set(Object.keys(SMTP_PRESETS));

function accountFrom(row: Record<string, unknown>): SmtpAccount {
  return {
    id: String(row.id),
    provider: row.provider as SmtpAccount["provider"],
    label: String(row.label),
    fromName: String(row.from_name),
    fromEmail: String(row.from_email),
    smtpHost: String(row.smtp_host),
    smtpPort: int(row.smtp_port),
    encryption: row.encryption as SmtpAccount["encryption"],
    status: row.status as SmtpAccount["status"],
    hasSecret: Boolean(row.secret_payload),
    isDefault: bool(row.is_default),
    verificationMethod:
      row.verification_method === "synthetic" || row.verification_method === "real"
        ? row.verification_method
        : null,
    lastTestedAt: row.last_tested_at ? String(row.last_tested_at) : null,
    lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function inboxFrom(row: Record<string, unknown>): SmtpTestInboxItem {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    recipient: String(row.recipient),
    subject: String(row.subject),
    bodyText: String(row.body_text),
    code: String(row.code),
    createdAt: String(row.created_at),
  };
}

export type LocalSmtpStore = ReturnType<typeof createSmtpAccountStore>;

export function createSmtpAccountStore(db: SqlDatabase, vault: SmtpSecretVault, clock = () => new Date()) {
  db.exec(`PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS demo_smtp_account (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, label TEXT NOT NULL,
      from_name TEXT NOT NULL, from_email TEXT NOT NULL,
      smtp_host TEXT NOT NULL, smtp_port INTEGER NOT NULL, encryption TEXT NOT NULL,
      status TEXT NOT NULL, secret_payload TEXT, is_default INTEGER NOT NULL,
      verification_method TEXT,
      last_tested_at TEXT, last_error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS demo_smtp_test_inbox (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, recipient TEXT NOT NULL,
      subject TEXT NOT NULL, body_text TEXT NOT NULL, code TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  const smtpColumns = (db.prepare("PRAGMA table_info(demo_smtp_account)").all() as { name: string }[])
    .map((column) => column.name);
  if (!smtpColumns.includes("verification_method"))
    db.exec("ALTER TABLE demo_smtp_account ADD COLUMN verification_method TEXT");
  const getRow = (id: string) =>
    db.prepare("SELECT * FROM demo_smtp_account WHERE id=?").get(id) as
      | Record<string, unknown>
      | undefined;
  const write = (account: SmtpAccount, secretPayload: string | null) => {
    db.prepare(`INSERT INTO demo_smtp_account
      (id,provider,label,from_name,from_email,smtp_host,smtp_port,encryption,status,secret_payload,
       is_default,verification_method,last_tested_at,last_error_code,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      account.id, account.provider, account.label, account.fromName, account.fromEmail,
      account.smtpHost, account.smtpPort, account.encryption, account.status, secretPayload,
      account.isDefault ? 1 : 0, account.verificationMethod, account.lastTestedAt, account.lastErrorCode,
      account.createdAt, account.updatedAt,
    );
  };
  const updateWrite = (account: SmtpAccount, secretPayload: string | null) => {
    db.prepare(`UPDATE demo_smtp_account SET provider=?,label=?,from_name=?,from_email=?,
      smtp_host=?,smtp_port=?,encryption=?,status=?,secret_payload=?,is_default=?,
      verification_method=?,last_tested_at=?,last_error_code=?,updated_at=? WHERE id=?`).run(
      account.provider, account.label, account.fromName, account.fromEmail,
      account.smtpHost, account.smtpPort, account.encryption, account.status, secretPayload,
      account.isDefault ? 1 : 0, account.verificationMethod, account.lastTestedAt, account.lastErrorCode,
      account.updatedAt, account.id,
    );
  };
  const secretPayload = (id: string) => {
    const row = getRow(id);
    return row?.secret_payload ? String(row.secret_payload) : null;
  };
  const normalizeInput = (input: SmtpAccountInput) => {
    if (!input || typeof input !== "object")
      throw new RsvpError(400, "请提交发件邮箱配置。");
    if (typeof input.provider !== "string" || !PROVIDERS.has(input.provider))
      throw new RsvpError(400, "不支持的发件邮箱厂商。");
    if (typeof input.fromEmail !== "string" || !input.fromEmail.trim())
      throw new RsvpError(400, "请填写发件邮箱。");
    if (/[\r\n\u0000-\u001f\u007f]/u.test(input.fromEmail))
      throw new RsvpError(400, "发件邮箱不能包含换行或控制字符。");
    const fromEmail = smtpAddress(input.fromEmail)?.toLowerCase();
    if (!fromEmail)
      throw new RsvpError(400, "发件邮箱格式不正确。");
    if (typeof input.fromName !== "string" || !input.fromName.trim())
      throw new RsvpError(400, "请填写发件人名称。");
    if (/[\r\n\u0000-\u001f\u007f]/u.test(input.fromName))
      throw new RsvpError(400, "发件人名称不能包含换行或控制字符。");
    if (input.label !== undefined && typeof input.label !== "string")
      throw new RsvpError(400, "显示标签格式不正确。");
    if (typeof input.label === "string" && /[\r\n\u0000-\u001f\u007f]/u.test(input.label))
      throw new RsvpError(400, "显示标签不能包含换行或控制字符。");
    if (input.credential !== undefined && typeof input.credential !== "string")
      throw new RsvpError(400, "客户端授权凭据格式不正确。");
    const preset = SMTP_PRESETS[input.provider];
    return {
      provider: input.provider,
      label: input.label?.trim() || preset.label,
      fromName: input.fromName.trim(),
      fromEmail,
      smtpHost: preset.host,
      smtpPort: preset.port,
      encryption: preset.encryption,
    };
  };

  return {
    list(): SmtpAccount[] {
      return (db.prepare("SELECT * FROM demo_smtp_account ORDER BY is_default DESC, created_at").all() as Record<string, unknown>[]).map(accountFrom);
    },
    get(id: string): SmtpAccount | null {
      const row = getRow(id);
      return row ? accountFrom(row) : null;
    },
    readSecret(id: string): string | null {
      const payload = secretPayload(id);
      return payload ? vault.decrypt(id, payload) : null;
    },
    create(input: SmtpAccountInput): SmtpAccount {
      const normalized = normalizeInput(input);
      const id = crypto.randomUUID();
      const now = clock().toISOString();
      const credential = input.credential?.trim() ?? "";
      const count = int((db.prepare("SELECT COUNT(*) AS count FROM demo_smtp_account").get() as Record<string, unknown>)?.count);
      const isDefault = Boolean(input.isDefault) || count === 0;
      if (isDefault) db.prepare("UPDATE demo_smtp_account SET is_default=0").run();
      const account: SmtpAccount = {
        id,
        ...normalized,
        status: "unverified",
        hasSecret: Boolean(credential),
        isDefault,
        verificationMethod: null,
        lastTestedAt: null,
        lastErrorCode: null,
        createdAt: now,
        updatedAt: now,
      };
      write(account, credential ? vault.encrypt(id, credential) : null);
      return account;
    },
    update(id: string, input: SmtpAccountInput): SmtpAccount {
      const row = getRow(id);
      if (!row) throw new RsvpError(404, "发件邮箱不存在。");
      const previous = accountFrom(row);
      const normalized = normalizeInput(input);
      const credential = input.credential?.trim() ?? "";
      const credentialChanged = Boolean(credential);
      const providerChanged = normalized.provider !== previous.provider;
      const fromEmailChanged = normalized.fromEmail !== previous.fromEmail;
      const configurationChanged = providerChanged || fromEmailChanged;
      const clearCredential = configurationChanged && !credentialChanged;
      const invalidate = credentialChanged || configurationChanged;
      const staysDisabled = previous.status === "disabled";
      if (input.isDefault && previous.status === "disabled")
        throw new RsvpError(409, "停用的发件邮箱不能设为默认。");
      if (input.isDefault) db.prepare("UPDATE demo_smtp_account SET is_default=0").run();
      const updated: SmtpAccount = {
        ...previous,
        ...normalized,
        status: staysDisabled ? "disabled" : invalidate ? "unverified" : previous.status,
        hasSecret: clearCredential ? false : credentialChanged ? true : previous.hasSecret,
        isDefault: input.isDefault ? true : previous.isDefault,
        verificationMethod: staysDisabled || invalidate ? null : previous.verificationMethod,
        lastTestedAt: staysDisabled || invalidate ? null : previous.lastTestedAt,
        lastErrorCode: staysDisabled || invalidate ? null : previous.lastErrorCode,
        updatedAt: clock().toISOString(),
      };
      updateWrite(
        updated,
        clearCredential
          ? null
          : credentialChanged
            ? vault.encrypt(id, credential)
            : secretPayload(id),
      );
      return updated;
    },
    signature(id: string): string | null {
      const row = getRow(id);
      if (!row) return null;
      return [
        row.provider,
        row.from_email,
        row.smtp_host,
        row.smtp_port,
        row.encryption,
        row.secret_payload ?? "",
        row.status,
      ].join("\u0000");
    },
    disable(id: string): SmtpAccount {
      const row = getRow(id);
      if (!row) throw new RsvpError(404, "发件邮箱不存在。");
      const previous = accountFrom(row);
      db.prepare("UPDATE demo_smtp_account SET status='disabled',is_default=0,verification_method=NULL,updated_at=? WHERE id=?")
        .run(clock().toISOString(), id);
      if (previous.isDefault) {
        const replacement = db.prepare(
          "SELECT id FROM demo_smtp_account WHERE id<>? AND status<>'disabled' ORDER BY created_at LIMIT 1",
        ).get(id) as { id: string } | undefined;
        if (replacement)
          db.prepare("UPDATE demo_smtp_account SET is_default=1 WHERE id=?").run(replacement.id);
      }
      return this.get(id)!;
    },
    setTestResult(
      id: string,
      ok: boolean,
      code: string,
      verificationMethod: "synthetic" | "real" | null,
    ): SmtpAccount {
      const account = this.get(id);
      if (!account) throw new RsvpError(404, "发件邮箱不存在。");
      db.prepare(`UPDATE demo_smtp_account SET status=?,verification_method=?,last_tested_at=?,last_error_code=?,updated_at=? WHERE id=?`)
        .run(
          ok ? "verified" : "failed",
          ok ? verificationMethod : null,
          clock().toISOString(),
          ok ? null : code,
          clock().toISOString(),
          id,
        );
      return this.get(id)!;
    },
    addInbox(input: Omit<SmtpTestInboxItem, "id" | "createdAt">): SmtpTestInboxItem {
      const item: SmtpTestInboxItem = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: clock().toISOString(),
      };
      db.prepare(`INSERT INTO demo_smtp_test_inbox
        (id,account_id,recipient,subject,body_text,code,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        item.id, item.accountId, item.recipient, item.subject, item.bodyText, item.code, item.createdAt,
      );
      return item;
    },
    listInbox(limit = 10): SmtpTestInboxItem[] {
      return (db.prepare("SELECT * FROM demo_smtp_test_inbox ORDER BY created_at DESC LIMIT ?").all(limit) as Record<string, unknown>[]).map(inboxFrom);
    },
    close() {
      db.close();
    },
  };
}

export type SmtpTestMessage = { subject: string; bodyText: string; bodyHtml?: string };

export type SmtpTestTransport = {
  sendTest(input: {
    account: SmtpAccount;
    credential: string;
    recipient: string;
    message?: SmtpTestMessage;
  }): Promise<{
    ok: boolean;
    code: "accepted" | "auth_failed" | "connection_failed";
    method: "synthetic" | "real";
    subject: string;
    bodyText: string;
  }>;
};

export function createSyntheticSmtpTestTransport(): SmtpTestTransport {
  return {
    async sendTest({ account, credential, recipient, message }) {
      const subject = message?.subject ?? "CampusFlow 本机合成发件测试";
      const bodyText = message?.bodyText ?? [
        `本机合成测试邮件，未连接真实 SMTP。`,
        `发件邮箱：${account.fromName} <${account.fromEmail}>`,
        `服务器预设：${account.smtpHost}:${account.smtpPort} (${account.encryption})`,
        `测试收件人：${recipient}`,
      ].join("\n");
      if (credential.includes("fail-connect"))
        return { ok: false, code: "connection_failed", method: "synthetic", subject, bodyText };
      if (credential.includes("fail-auth"))
        return { ok: false, code: "auth_failed", method: "synthetic", subject, bodyText };
      return { ok: true, code: "accepted", method: "synthetic", subject, bodyText };
    },
  };
}

export type SmtpTestConfig = {
  mode: "disabled" | "synthetic" | "real";
  recipient: string | null;
};

export async function testSmtpAccount(
  store: LocalSmtpStore,
  config: SmtpTestConfig,
  id: string,
  to: string,
  transport: SmtpTestTransport = createSyntheticSmtpTestTransport(),
  renderMessage?: () => SmtpTestMessage,
): Promise<SmtpTestResult> {
  const account = store.get(id);
  if (!account) throw new RsvpError(404, "发件邮箱不存在。");
  const result = (code: SmtpTestResult["code"], message: string, inboxItem: SmtpTestInboxItem | null = null): SmtpTestResult => ({
    ok: code === "accepted",
    code,
    mode: config.mode,
    message,
    account,
    inboxItem,
  });
  if (config.mode === "disabled")
    return result("real_test_disabled", "真实测试开关默认关闭；未连接真实 SMTP，也未发送邮件。");
  if (!config.recipient && config.mode !== "real")
    return result("test_recipient_not_configured", "服务端未配置测试收件人。");
  const recipient = smtpAddress(to);
  if (!recipient)
    return result("invalid_recipient", "请输入有效的测试收件邮箱。");
  if (config.recipient && recipient !== config.recipient)
    return result("recipient_not_allowed", "只允许发送到服务端配置的测试收件人。");
  if (account.status === "disabled")
    return result("account_disabled", "发件邮箱已停用，无法测试。");
  const credential = store.readSecret(id);
  if (!account.hasSecret || !credential)
    return result("missing_credential", "未保存客户端授权凭据，无法测试。");
  const signature = store.signature(id);
  const sent = await transport.sendTest({ account, credential, recipient, message: renderMessage?.() });
  const current = store.get(id);
  if (!current || current.status === "disabled" || store.signature(id) !== signature)
    return {
      ok: false,
      code: "stale_test",
      mode: config.mode,
      message: "测试期间发件邮箱已变更或停用；本次结果未写回，避免误标验证状态。",
      account: current ?? account,
      inboxItem: null,
    };
  const updated = store.setTestResult(
    id,
    sent.ok,
    sent.code,
    sent.ok ? sent.method : null,
  );
  const inboxItem = sent.ok
    ? store.addInbox({
        accountId: id,
        recipient,
        subject: sent.subject,
        bodyText: sent.bodyText,
        code: sent.code,
      })
    : null;
  return {
    ok: sent.ok,
    code: sent.code,
    mode: config.mode,
    message: sent.ok
      ? sent.method === "real"
        ? "真实 SMTP 已接收测试邮件。"
        : "本机合成 SMTP 已接收测试邮件，仅供本机验收，不代表真实 SMTP 通过。"
      : sent.method === "real"
        ? sent.code === "auth_failed"
          ? "真实 SMTP 认证失败。"
          : "真实 SMTP 连接失败。"
        : sent.code === "auth_failed"
          ? "本机合成 SMTP 认证失败。"
          : "本机合成 SMTP 连接失败。",
    account: updated,
    inboxItem,
  };
}
export type SmtpConnectionTransport = {
  testConnection(input: {
    account: SmtpAccount;
    credential: string;
  }): Promise<{
    ok: boolean;
    code: "connected" | "auth_failed" | "connection_failed";
    method: "synthetic" | "real";
  }>;
};

export function createSyntheticSmtpConnectionTransport(): SmtpConnectionTransport {
  return {
    async testConnection({ credential }) {
      if (credential.includes("fail-connect"))
        return { ok: false, code: "connection_failed", method: "synthetic" };
      if (credential.includes("fail-auth"))
        return { ok: false, code: "auth_failed", method: "synthetic" };
      return { ok: true, code: "connected", method: "synthetic" };
    },
  };
}

export async function testSmtpConnection(
  store: LocalSmtpStore,
  config: Pick<SmtpTestConfig, "mode">,
  id: string,
  transport: SmtpConnectionTransport = createSyntheticSmtpConnectionTransport(),
): Promise<SmtpConnectionResult> {
  const account = store.get(id);
  if (!account) throw new RsvpError(404, "发件邮箱不存在。");
  const result = (
    code: SmtpConnectionResult["code"],
    message: string,
    current: SmtpAccount = account,
  ): SmtpConnectionResult => ({
    ok: code === "connected",
    code,
    mode: config.mode,
    message,
    account: current,
  });
  if (config.mode === "disabled")
    return result("real_test_disabled", "真实连接测试开关默认关闭；未建立 TLS 或 SMTP 连接。");
  if (account.status === "disabled")
    return result("account_disabled", "发件邮箱已停用，无法测试连接。");
  const credential = store.readSecret(id);
  if (!account.hasSecret || !credential)
    return result("missing_credential", "未保存客户端授权凭据，无法测试连接。");
  const signature = store.signature(id);
  const tested = await transport.testConnection({ account, credential });
  const current = store.get(id);
  if (!current || current.status === "disabled" || store.signature(id) !== signature)
    return result(
      "stale_test",
      "连接测试期间发件邮箱已变更或停用；本次结果未写回。",
      current ?? account,
    );
  if (!tested.ok)
    return result(
      tested.code,
      tested.method === "real"
        ? tested.code === "auth_failed"
          ? "真实 SMTP 认证失败，未发送邮件。"
          : "真实 SMTP 连接失败，未发送邮件。"
        : tested.code === "auth_failed"
          ? "本机合成 SMTP 认证失败，未发送邮件。"
          : "本机合成 SMTP 连接失败，未发送邮件。",
      current,
    );
  return result(
    "connected",
    tested.method === "real"
      ? "真实 SMTP 连接成功：TLS、EHLO、AUTH 完成；未执行 MAIL FROM / RCPT TO / DATA，未发送邮件。"
      : "本机合成连接成功：TLS、EHLO、AUTH 完成；未连接网络、未发送邮件、未写入收件箱。",
    current,
  );
}
