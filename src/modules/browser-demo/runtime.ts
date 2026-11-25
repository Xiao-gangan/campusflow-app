import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { SqlJsStatic } from "sql.js";
import { createAgentStore } from "../../../dev/open-api/store-core.ts";
import { createLocalEmailRepository } from "../../../dev/recruitment/email-repository-core.ts";
import { createLocalMailService } from "../../../dev/recruitment/mail.ts";
import { createSmtpAccountStore } from "../../../dev/recruitment/smtp-store-core.ts";
import { RsvpError } from "../../../dev/rsvp/error.ts";
import { createDemoHandler, type DemoRequest, type DemoResponse } from "../../../dev/rsvp/handler.ts";
import { createRsvpStore } from "../../../dev/rsvp/store-core.ts";
import { isInterviewInvitationUsable } from "../../../shared/domain/interview.ts";
import { BROWSER_DEMO_STORAGE } from "./mode.ts";
import { seedBrowserWorkspace } from "./seed.ts";
import { wrapBrowserDatabase } from "./sqlite.ts";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type RequestOptions = Pick<RequestInit, "method" | "body" | "signal">;
type BrowserRequest = DemoRequest & { body: string };

const hash = (value: string) => bytesToHex(sha256(new TextEncoder().encode(value)));
const encode = (bytes: Uint8Array) => {
  const chunks = [];
  for (let start = 0; start < bytes.length; start += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(start, start + 8192)));
  }
  return btoa(chunks.join(""));
};
const decode = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
const noExternalCredential = (): never => { throw new RsvpError(403, "浏览器演示仅支持内嵌互动。"); };

export function createBrowserDemoRuntime(
  engine: Promise<SqlJsStatic>,
  storage: Storage,
  origin: string,
  lock: <T>(operation: () => Promise<T>) => Promise<T>,
  clock = () => new Date(),
) {
  async function withWorkspace<T>(run: (dispatch: ReturnType<typeof createDemoHandler<BrowserRequest>>) => Promise<{ result: T; save: boolean }>, reset = false) {
    const sqlite = await engine;
    return lock(async () => {
      let current: string | null;
      try { current = storage.getItem(BROWSER_DEMO_STORAGE); }
      catch { throw new Error("浏览器禁止站点保存演示数据。"); }
      const encoded = reset ? null : current;
      const database = new sqlite.Database(encoded ? decode(encoded) : undefined);
      const db = wrapBrowserDatabase(database);
      try {
        const roster = createRsvpStore(db, {
          browser: true, sha256: hash,
          vault: () => ({ encrypt: (_id, token) => token, decrypt: (_id, token) => token }),
          signing: { mint: noExternalCredential, verify: noExternalCredential },
        }, clock);
        const library = createAgentStore(db, hash, clock, true);
        const repository = createLocalEmailRepository(db);
        const smtp = createSmtpAccountStore(db, {
          encrypt: () => "demo-only",
          decrypt: () => "demo-only",
        }, clock);
        const service = createLocalMailService(repository, async (delivery) => {
          const link = repository.getDeliveryLink(delivery.id);
          const invite = link && roster.getInvite(link.inviteId);
          return invite && isInterviewInvitationUsable(invite, clock().toISOString()) && invite.version === delivery.sourceVersion
            ? { eligible: true, issues: [] }
            : { eligible: false, issues: ["邀请链接已失效，请重新签发。"] };
        });
        if (!encoded) await seedBrowserWorkspace(roster, library, { repository, service }, smtp, origin, clock);
        const dispatch = createDemoHandler<BrowserRequest>(
          () => roster, async () => ({ repository, service }), () => smtp, () => library,
          {
            browser: true, baseUrl: () => origin, assertLocal: () => {}, allowOpenApi: () => false,
            smtpMode: () => "synthetic",
            smtpRecipient: (body) => typeof body?.to === "string" ? body.to.trim() : "review@example.test",
            async readBody(req, limit = 512 * 1024) {
              if (new TextEncoder().encode(req.body).length > limit) throw new RsvpError(413, "请求内容过大。");
              try {
                const body = JSON.parse(req.body);
                if (body && typeof body === "object" && !Array.isArray(body)) return body;
              } catch { /* Use the uniform validation error below. */ }
              throw new RsvpError(400, "请求内容无效。");
            },
          },
        );
        const { result, save } = await run(dispatch);
        if (save || !encoded) {
          try { storage.setItem(BROWSER_DEMO_STORAGE, encode(database.export())); }
          catch { throw new Error("演示数据保存失败，浏览器存储可能已满。"); }
        }
        return result;
      } finally {
        db.close();
      }
    });
  }

  return {
    async request(path: string, options: RequestOptions = {}) {
      const method = options.method ?? "GET";
      options.signal?.throwIfAborted();
      return withWorkspace(async (dispatch) => {
        options.signal?.throwIfAborted();
        const req = { method, url: path, headers: {}, body: typeof options.body === "string" ? options.body : "{}" };
        const headers = new Headers();
        let body: string | null = null;
        const writer: DemoResponse = {
          statusCode: 200,
          setHeader: (name, value) => headers.set(name, value),
          end: (value) => { body = value ?? null; },
        };
        await dispatch(req, writer, () => { writer.statusCode = 404; });
        const status = writer.statusCode ?? 200;
        return { result: new Response(body, { status, headers }), save: method !== "GET" && status < 400 };
      });
    },
    reset: () => withWorkspace(async () => ({ result: undefined, save: true }), true),
  };
}
