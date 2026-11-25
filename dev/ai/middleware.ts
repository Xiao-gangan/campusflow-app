import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAiDesignRequest } from "../../shared/ai/server.ts";
import { createMockProvider } from "../../shared/ai/mock.ts";

const MAX_BODY = 32 * 1024;

export function aiMiddleware({ allowMock, allowed }: {
  allowMock: boolean;
  allowed: (request: IncomingMessage) => boolean;
}) {
  const mockProvider = createMockProvider({ delayMs: Number(process.env.AI_MOCK_DELAY ?? 220) });
  const rate: number[] = [];
  const active = { count: 0 };

  function allowRequest() {
    const now = Date.now();
    while (rate.length > 0 && rate[0] <= now - 60_000) rate.shift();
    if (rate.length >= 12) return false;
    rate.push(now);
    return true;
  }

  function sendJson(res: ServerResponse, status: number, body: unknown) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Length": Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  return async (req: IncomingMessage, res: ServerResponse, next?: () => void) => {
    const path = (req.url ?? "").split("?")[0];
    const allowedPath =
      path === "/functions/v1/app/api/ai/design" || path === "/api/ai/design";
    if (!allowedPath) {
      if (next) return next();
      sendJson(res, 404, { error: "not_found", message: "Not found" });
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed", message: "只支持 POST" });
      return;
    }
    if (!allowed(req)) {
      sendJson(res, 403, { error: "forbidden", message: "请从本机工作台访问 AI 服务。" });
      return;
    }
    if (!allowRequest()) {
      sendJson(res, 429, {
        error: "rate_limited",
        message: "请求过于频繁，请稍后再试。",
      });
      return;
    }
    if (active.count >= 4) {
      sendJson(res, 429, {
        error: "busy",
        message: "当前生成任务较多，请稍后再试。",
      });
      return;
    }

    const controller = new AbortController();
    const abortOnClientDisconnect = () => {
      if (!res.writableEnded) {
        controller.abort(new Error("client_disconnected"));
      }
    };
    req.on("aborted", abortOnClientDisconnect);
    res.on("close", abortOnClientDisconnect);

    let activeStarted = false;
    try {
      const chunks: Buffer[] = [];
      let byteLength = 0;
      let tooLarge = false;
      try {
        for await (const chunk of req) {
          const buffer = Buffer.from(chunk);
          byteLength += buffer.byteLength;
          if (byteLength > MAX_BODY) {
            tooLarge = true;
            break;
          }
          chunks.push(buffer);
        }
      } catch {
        if (controller.signal.aborted) return;
        throw new Error("request_body_failed");
      }
      if (tooLarge) {
        sendJson(res, 413, { error: "body_too_large", message: "请求内容过长。" });
        return;
      }

      active.count += 1;
      activeStarted = true;
      const request = new Request(`http://127.0.0.1${path}`, {
        method: "POST",
        headers: new Headers(Object.entries(req.headers).flatMap<[string, string]>(([key, value]) =>
          value === undefined ? [] : [[key, Array.isArray(value) ? value.join(", ") : value]])),
        body: Buffer.concat(chunks).toString("utf8"),
        signal: controller.signal,
      });
      const response = await handleAiDesignRequest(request, {
        allowMock,
        mockProvider,
      });
      if (response.status >= 400) {
        const errorText = await response.text();
        res.writeHead(
          response.status,
          Object.fromEntries(response.headers.entries()),
        );
        res.end(errorText);
        return;
      }
      res.writeHead(
        response.status,
        Object.fromEntries(response.headers.entries()),
      );
      if (response.body) {
        const reader = response.body.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) res.write(Buffer.from(value));
          }
        } catch {
          // Client disconnected or upstream stream ended.
        } finally {
          reader.releaseLock();
        }
      }
      res.end();
    } catch {
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: "server_error",
          message: "AI 本地服务出现异常。",
        });
      } else {
        res.end();
      }
    } finally {
      req.off("aborted", abortOnClientDisconnect);
      res.off("close", abortOnClientDisconnect);
      if (activeStarted) active.count -= 1;
    }
  };
}
