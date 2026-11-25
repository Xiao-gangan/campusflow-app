import net from "node:net";
import tls from "node:tls";
import { smtpAddress } from "../../shared/email/smtp-presets.ts";
import type { SmtpAccount } from "../../shared/contracts/smtp.ts";
import type {
  SmtpConnectionTransport,
  SmtpTestMessage,
  SmtpTestTransport,
} from "./smtp-store.ts";

type Reply = { code: number; lines: string[] };

class SmtpReplyError extends Error {
  readonly code: number;
  constructor(code: number, line: string) {
    super(line);
    this.code = code;
  }
}

class SmtpClient {
  private buffer = "";
  private lines: string[] = [];
  private pending: {
    resolve: (reply: Reply) => void;
    reject: (error: Error) => void;
  } | null = null;
  private failure: Error | null = null;
  private socket: net.Socket;

  constructor(socket: net.Socket) {
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.flush();
    });
    socket.on("error", (error) => this.reject(error));
    socket.on("close", () => {
      this.reject(new Error("SMTP 连接已关闭。"));
    });
  }

  private flush() {
    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) break;
      this.lines.push(this.buffer.slice(0, newline).replace(/\r$/u, ""));
      this.buffer = this.buffer.slice(newline + 1);
      this.tryResolve();
    }
  }

  private tryResolve() {
    if (!this.pending) return;
    const first = this.lines[0];
    if (!first || !/^\d{3}[ -]/u.test(first)) {
      if (first) {
        this.lines.shift();
        this.pending.reject(new Error("SMTP 响应格式无效。"));
        this.pending = null;
      }
      return;
    }
    const code = Number(first.slice(0, 3));
    const multiline = first[3] === "-";
    const end = multiline
      ? this.lines.findIndex((line, index) => index > 0 && line.startsWith(`${code} `))
      : 0;
    if (end < 0) return;
    const lines = this.lines.splice(0, end + 1);
    const pending = this.pending;
    this.pending = null;
    pending.resolve({ code, lines });
  }

  private reject(error: Error) {
    this.failure = error;
    if (!this.pending) return;
    const pending = this.pending;
    this.pending = null;
    pending.reject(error);
  }

  readReply() {
    if (this.failure && !this.lines.length) return Promise.reject(this.failure);
    return new Promise<Reply>((resolve, reject) => {
      this.pending = { resolve, reject };
      this.tryResolve();
    });
  }

  async command(line: string, expected: number[]) {
    this.socket.write(`${line}\r\n`);
    const reply = await this.readReply();
    if (!expected.includes(reply.code))
      throw new SmtpReplyError(reply.code, reply.lines.join(" "));
    return reply;
  }

  async login(username: string, password: string) {
    await this.command("AUTH LOGIN", [334]);
    await this.command(Buffer.from(username).toString("base64"), [334]);
    await this.command(Buffer.from(password).toString("base64"), [235]);
  }

}

function headerSafe(value: string) {
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value))
    throw new Error("邮件头包含换行或控制字符。");
  return value;
}

function encodeHeader(value: string) {
  const words: string[] = [];
  let chunk = "";
  let bytes = 0;
  const encode = (text: string) => `=?UTF-8?B?${Buffer.from(text).toString("base64")}?=`;
  for (const character of headerSafe(value)) {
    const size = Buffer.byteLength(character);
    if (bytes + size > 42) {
      words.push(encode(chunk));
      chunk = "";
      bytes = 0;
    }
    chunk += character;
    bytes += size;
  }
  words.push(encode(chunk));
  return words.join("\r\n ");
}

export function encodeSmtpDisplayName(value: string) {
  return encodeHeader(value.trim());
}

const base64Lines = (text: string) => Buffer.from(text, "utf8").toString("base64").match(/.{1,76}/gu)?.join("\r\n") ?? "";

function textPart(mime: "text/plain" | "text/html", body: string) {
  return [
    `Content-Type: ${mime}; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(body),
  ];
}

export function buildSmtpTestMessage(
  account: SmtpAccount, recipient: string, message: SmtpTestMessage, messageId = crypto.randomUUID(),
) {
  const from = smtpAddress(account.fromEmail);
  const to = smtpAddress(recipient);
  if (!from || !to) throw new Error("邮件地址无效。");
  const headers = [
    `From: ${encodeSmtpDisplayName(account.fromName)} <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}@campusflow.local>`,
    "MIME-Version: 1.0",
  ];
  const plain = textPart("text/plain", message.bodyText);
  if (message.bodyHtml === undefined) return [...headers, ...plain].join("\r\n");
  const boundary = `campusflow-${crypto.randomUUID()}`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    ...plain,
    `--${boundary}`,
    ...textPart("text/html", message.bodyHtml),
    `--${boundary}--`,
  ].join("\r\n");
}

function connect(account: SmtpAccount): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    if (process.env.NODE_TEST_CONTEXT) {
      reject(new Error("自动化测试禁止连接真实 SMTP。"));
      return;
    }
    if (account.encryption !== "ssl") {
      reject(new Error("固定预设仅支持 SSL 直连。"));
      return;
    }
    const socket = tls.connect({
      host: account.smtpHost,
      port: account.smtpPort,
      servername: account.smtpHost,
      rejectUnauthorized: true,
    });
    socket.setTimeout(15_000, () => {
      socket.destroy();
      reject(new Error("SMTP 连接超时。"));
    });
    socket.once("secureConnect", () => resolve(socket));
    socket.once("error", reject);
  });
}

export function createSmtpConnectionTransport(): SmtpConnectionTransport {
  return {
    async testConnection({ account, credential }) {
      let socket: net.Socket | undefined;
      try {
        socket = await connect(account);
        const client = new SmtpClient(socket);
        const greeting = await client.readReply();
        if (greeting.code !== 220) throw new SmtpReplyError(greeting.code, greeting.lines.join(" "));
        await client.command("EHLO campusflow.local", [250]);
        await client.login(account.fromEmail, credential);
        socket.write("QUIT\r\n");
        socket.end();
        return { ok: true, code: "connected", method: "real" };
      } catch (error) {
        const code = error instanceof SmtpReplyError && (error.code === 535 || error.code === 530)
          ? "auth_failed"
          : "connection_failed";
        return { ok: false, code, method: "real" };
      } finally {
        socket?.destroy();
      }
    },
  };
}

export type SmtpDelivery = {
  account: SmtpAccount;
  credential: string;
  recipient: string;
  message: SmtpTestMessage;
};

export async function sendSmtpMessage({ account, credential, recipient, message }: SmtpDelivery) {
  const from = smtpAddress(account.fromEmail);
  const to = smtpAddress(recipient);
  if (!from || !to) throw new Error("邮件地址无效。");
  const messageId = crypto.randomUUID();
  const mime = buildSmtpTestMessage(account, to, message, messageId);
  const socket = await connect(account);
  try {
    const client = new SmtpClient(socket);
    const greeting = await client.readReply();
    if (greeting.code !== 220) throw new SmtpReplyError(greeting.code, greeting.lines.join(" "));
    await client.command("EHLO campusflow.local", [250]);
    await client.login(from, credential);
    await client.command(`MAIL FROM:<${from}>`, [250]);
    await client.command(`RCPT TO:<${to}>`, [250, 251]);
    await client.command("DATA", [354]);
    await client.command(mime + "\r\n.", [250]);
    socket.end("QUIT\r\n");
    return `${messageId}@campusflow.local`;
  } finally {
    socket.destroy();
  }
}

export function createSmtpTestTransport(): SmtpTestTransport {
  return {
    async sendTest({ account, credential, recipient, message }) {
      const subject = message?.subject ?? "CampusFlow SMTP 测试邮件";
      const bodyText = message?.bodyText ?? [
        "这是一封 CampusFlow 真实 SMTP 单封测试邮件。",
        `发件邮箱：${account.fromName} <${account.fromEmail}>`,
        `服务器：${account.smtpHost}:${account.smtpPort}`,
        `测试收件人：${recipient}`,
      ].join("\n");
      try {
        await sendSmtpMessage({ account, credential, recipient, message: { subject, bodyText, bodyHtml: message?.bodyHtml } });
        return { ok: true, code: "accepted", method: "real", subject, bodyText };
      } catch (error) {
        const code = error instanceof SmtpReplyError && (error.code === 535 || error.code === 530)
          ? "auth_failed"
          : "connection_failed";
        return { ok: false, code, method: "real", subject, bodyText };
      }
    },
  };
}
