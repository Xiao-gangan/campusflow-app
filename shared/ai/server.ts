import type { DesignBlock, DesignDocument } from "../contracts/design.ts";
import {
  AiProviderError,
  createAiProvider,
  type AiProvider,
} from "./provider.ts";
import {
  isAiProviderId,
  providerDefinition,
  resolveProviderModel,
  type AiProviderId,
} from "./providers.ts";
import { createMockProvider } from "./mock.ts";
import {
  MAX_FREE_HTML_LENGTH,
  sanitizeEmailHtml,
} from "../email/free-html.ts";
import {
  supportsAiBlockType,
  AI_LIMITS,
  AiValidationError,
  aiBlockToDesignBlock,
  buildAiDocument,
  buildAiTheme,
  parseAiBlock,
  parseAiFullDesign,
  parseAiPatch,
  parseAiPlan,
  parseAiReference,
  type AiPlan,
  type AiReference,
} from "./schema.ts";

export type AiServerDeps = {
  allowMock?: boolean;
  providerFactory?: (
    apiKey: string,
    selection?: { provider: AiProviderId; model: string },
  ) => AiProvider;
  mockProvider?: AiProvider;
  maxBodyBytes?: number;
};

const MAX_BODY_BYTES = 64 * 1024;

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function fail(
  status: number,
  code: string,
  message: string,
  diagnostics?: unknown,
): Response {
  return json(status, {
    error: code,
    message,
    ...(diagnostics ? { diagnostics } : {}),
  });
}

function userMessage(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  status: number;
  diagnostics?: unknown;
} {
  if (error instanceof AiProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      status: error.status,
      ...(error.diagnostics ? { diagnostics: error.diagnostics } : {}),
    };
  }
  if (error instanceof AiValidationError) {
    return {
      code: `invalid_output_${error.code}`,
      message: `AI 生成的设计未通过校验：${error.message} 请重新生成。`,
      retryable: true,
      status: 422,
    };
  }
  return {
    code: "generation_failed",
    message: "生成过程中出现异常，请重试。",
    retryable: true,
    status: 500,
  };
}

function parseRequestId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9-]{8,64}$/iu.test(value)) {
    throw new AiValidationError("invalid_request", "请求标识不合法。", "requestId");
  }
  return value;
}

function parsePrompt(value: unknown): string {
  if (typeof value !== "string") {
    throw new AiValidationError("invalid_prompt", "请输入设计需求。", "prompt");
  }
  const prompt = value.trim();
  if (prompt.length < 1 || prompt.length > AI_LIMITS.prompt) {
    throw new AiValidationError(
      "invalid_prompt",
      `设计需求需要在 1–${AI_LIMITS.prompt} 个字符之间。`,
      "prompt",
    );
  }
  return prompt;
}

function parseStyle(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 40) {
    throw new AiValidationError("invalid_style", "风格选项不合法。", "style");
  }
  return value;
}

function parseProviderId(value: unknown): AiProviderId {
  if (value === undefined) return "deepseek";
  if (!isAiProviderId(value))
    throw new AiValidationError("invalid_provider", "不支持的 AI 厂商。", "provider");
  return value;
}

function parseProviderModel(value: unknown, provider: AiProviderId): string {
  if (value !== undefined && (typeof value !== "string" || value.length > 80))
    throw new AiValidationError("invalid_model", "AI 模型不合法。", "model");
  try {
    return resolveProviderModel(provider, typeof value === "string" ? value : undefined);
  } catch {
    throw new AiValidationError("invalid_model", "AI 模型不适用于该厂商。", "model");
  }
}

function requestKey(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/iu.exec(header.trim());
  const key = match?.[1]?.trim() ?? "";
  if (!key || key.length < 12 || key.length > 300 || /\s/u.test(key)) {
    return null;
  }
  return key;
}

function sseFrame(
  event: string,
  data: Record<string, unknown>,
  seq: number,
): string {
  return `id: ${seq}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function linkAbort(request: Request): AbortController {
  const controller = new AbortController();
  if (request.signal.aborted) controller.abort();
  else request.signal.addEventListener("abort", () => controller.abort(), { once: true });
  return controller;
}

export async function handleAiDesignRequest(
  request: Request,
  deps: AiServerDeps = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return fail(405, "method_not_allowed", "只支持 POST 请求。");
  }
  const maxBody = deps.maxBodyBytes ?? MAX_BODY_BYTES;
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return fail(400, "invalid_body", "无法读取请求内容。");
  }
  if (rawBody.length > maxBody) {
    return fail(413, "body_too_large", "请求内容过长。");
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("shape");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, "invalid_json", "请求格式不正确。");
  }

  const mode = body.mode;
  if (mode !== "full" && mode !== "block" && mode !== "html" && mode !== "test") {
    return fail(400, "invalid_mode", "不支持的 AI 模式。");
  }
  const target = body.target === undefined ? "email" : body.target;
  if (target !== "email" && target !== "invite_page") return fail(400, "invalid_target", "不支持的设计目标。");
  let requestId: string;
  let prompt = "";
  let style: string | undefined;
  let reference: AiReference | undefined;
  let currentHtml: string | undefined;
  let currentSubject: string | undefined;
  let blockId = "";
  let blockType = "";
  let currentProps: Record<string, unknown> = {};
  let instruction = "";
  let quickAction = "";
  let providerId: AiProviderId = "deepseek";
  let model: string;
  try {
    requestId = parseRequestId(body.requestId);
    providerId = parseProviderId(body.provider);
    model = parseProviderModel(body.model, providerId);
    if (mode === "full") {
      prompt = parsePrompt(body.prompt);
      style = parseStyle(body.style);
      reference = parseAiReference(body.reference, target);
    } else if (mode === "html") {
      prompt = parsePrompt(body.prompt);
      style = parseStyle(body.style);
      if (body.currentHtml !== undefined) {
        if (typeof body.currentHtml !== "string" || body.currentHtml.length > MAX_FREE_HTML_LENGTH) {
          throw new AiValidationError("invalid_html", "当前 HTML 内容不合法或过长。", "currentHtml");
        }
        currentHtml = body.currentHtml.trim() || undefined;
      }
      if (body.subject !== undefined) {
        if (typeof body.subject !== "string" || body.subject.length > 160) {
          throw new AiValidationError("invalid_subject", "邮件主题不合法。", "subject");
        }
        currentSubject = body.subject.trim() || undefined;
      }
    } else if (mode === "block") {
      if (typeof body.blockId !== "string" || body.blockId.length > 64) {
        throw new AiValidationError("invalid_block", "组件标识不合法。", "blockId");
      }
      if (
        typeof body.blockType !== "string" ||
        !supportsAiBlockType(body.blockType, target)
      ) {
        throw new AiValidationError("invalid_block", "不支持的组件类型。", "blockType");
      }
      if (!body.currentProps || typeof body.currentProps !== "object" || Array.isArray(body.currentProps)) {
        throw new AiValidationError("invalid_block", "组件内容不合法。", "currentProps");
      }
      blockId = body.blockId;
      blockType = body.blockType;
      currentProps = body.currentProps as Record<string, unknown>;
      instruction =
        typeof body.instruction === "string" ? body.instruction.slice(0, 500) : "";
      quickAction =
        typeof body.quickAction === "string" ? body.quickAction.slice(0, 40) : "";
      prompt = instruction;
    }
  } catch (error) {
    const info = userMessage(error);
    return fail(400, info.code.replace(/^invalid_output_/u, ""), info.message);
  }

  const wantsMock = body.mock === true;
  if (wantsMock && !deps.allowMock) {
    return fail(403, "mock_not_allowed", "当前环境未启用本地演示模式。");
  }
  let provider: AiProvider;
  if (wantsMock) {
    provider = deps.mockProvider ?? createMockProvider();
  } else {
    const apiKey = requestKey(request);
    if (!apiKey) {
      return fail(401, "missing_key", `请先填写 ${providerDefinition(providerId).label} API Key。`);
    }
    provider =
      deps.providerFactory?.(apiKey, { provider: providerId, model }) ??
      createAiProvider({ apiKey, provider: providerId, model });
  }

  const abort = linkAbort(request);
  if (mode === "test") {
    if (!provider.probe)
      return fail(501, "unsupported_mode", "当前 AI 服务不支持连接测试。");
    try {
      const result = await provider.probe({ signal: abort.signal });
      return json(200, {
        requestId,
        provider: provider.name,
        model: result.model,
        ok: true,
      });
    } catch (error) {
      const info = userMessage(error);
      return fail(info.status, info.code, info.message, info.diagnostics);
    }
  }
  const validationCorrection = (error: AiValidationError) =>
    error.field ? `${error.message}（出错字段：${error.field}）` : error.message;

  if (mode === "html") {
    if (!provider.designHtml) {
      return fail(501, "unsupported_mode", "当前 AI 服务不支持自由 HTML 设计。");
    }
    try {
      let correction: string | undefined;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const raw = await provider.designHtml({
          target,
          prompt,
          style,
          currentHtml,
          subject: currentSubject,
          correction,
          signal: abort.signal,
        });
        try {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            throw new AiValidationError("invalid_shape", "AI 返回的 HTML 结果不是合法对象。", "html");
          }
          const payload = raw as Record<string, unknown>;
          const rawHtml = typeof payload.html === "string" ? payload.html.trim() : "";
          if (rawHtml.length < 30 || !/<[a-z]/iu.test(rawHtml)) {
            throw new AiValidationError("empty_html", "AI 未返回有效的 HTML 邮件正文。", "html");
          }
          const sanitized = sanitizeEmailHtml(rawHtml, { target });
          if (sanitized.html.length < 30) {
            throw new AiValidationError("empty_html", target === "email"
              ? "安全清洗后 HTML 内容为空，请使用邮件表格与行内样式。"
              : "安全清洗后 HTML 内容为空，请使用静态正文与行内样式。", "html");
          }
          const subject =
            typeof payload.subject === "string" && payload.subject.trim()
              ? payload.subject.trim().slice(0, AI_LIMITS.subject)
              : undefined;
          const preheader =
            typeof payload.preheader === "string" && payload.preheader.trim()
              ? payload.preheader.trim().slice(0, AI_LIMITS.preheader)
              : undefined;
          const summary =
            typeof payload.summary === "string" && payload.summary.trim()
              ? payload.summary.trim().slice(0, 120)
              : "已完成 HTML 邮件设计。";
          return json(200, {
            requestId,
            provider: provider.name,
            result: {
              html: sanitized.html,
              ...(subject ? { subject } : {}),
              ...(preheader ? { preheader } : {}),
              summary,
              warnings: sanitized.warnings,
            },
          });
        } catch (error) {
          if (attempt === 0 && error instanceof AiValidationError && !abort.signal.aborted) {
            correction = validationCorrection(error);
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      const info = userMessage(error);
      return fail(info.status, info.code, info.message, info.diagnostics);
    }
  }

  if (mode === "block") {
    try {
      let correction: string | undefined;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const raw = await provider.patch({
          target,
          blockId,
          blockType,
          currentProps,
          instruction,
          quickAction,
          correction,
          signal: abort.signal,
        });
        try {
          const patch = parseAiPatch(raw, {
            target,
            blockId,
            blockType: blockType as never,
            currentProps,
          });
          return json(200, { requestId, patch });
        } catch (error) {
          if (
            attempt === 0 &&
            error instanceof AiValidationError &&
            error.code !== "scope_violation" &&
            !abort.signal.aborted
          ) {
            correction = validationCorrection(error);
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      const info = userMessage(error);
      return fail(info.status, info.code, info.message, info.diagnostics);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let seq = 0;
      let closed = false;
      const send = (event: string, data: Record<string, unknown>) => {
        if (closed) return;
        seq += 1;
        controller.enqueue(
          encoder.encode(
            sseFrame(event, { requestId, ...data }, seq),
          ),
        );
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };
      const failEvent = (error: unknown) => {
        if (abort.signal.aborted) {
          send("generation-cancelled", {});
          return;
        }
        const info = userMessage(error);
        send("generation-failed", {
          code: info.code,
          message: info.message,
          retryable: info.retryable,
          ...(info.diagnostics ? { diagnostics: info.diagnostics } : {}),
        });
      };

      void (async () => {
        try {
          send("generation-started", {
            mode: "full",
            provider: provider.name,
          });
          if (provider.design) {
            let parsed!: ReturnType<typeof parseAiFullDesign>;
            let designCorrection: string | undefined;
            for (let attempt = 0; attempt < 2; attempt += 1) {
              const raw = await provider.design({
                target,
                prompt,
                style,
                reference,
                correction: designCorrection,
                signal: abort.signal,
              });
              try {
                parsed = parseAiFullDesign(raw, target);
                break;
              } catch (error) {
                if (
                  attempt === 0 &&
                  error instanceof AiValidationError &&
                  !abort.signal.aborted
                ) {
                  designCorrection = validationCorrection(error);
                  continue;
                }
                throw error;
              }
            }
            const theme = buildAiTheme(parsed.plan);
            send("structure-ready", {
              plan: {
                theme,
                subject: parsed.plan.subject,
                preheader: parsed.plan.preheader,
                blocks: parsed.plan.blocks,
                tone: parsed.plan.tone,
              },
            });
            for (let index = 0; index < parsed.blocks.length; index += 1) {
              send("block-ready", {
                block: parsed.blocks[index],
                index,
                total: parsed.blocks.length,
              });
            }
            const design = buildAiDocument(parsed.plan, parsed.blocks);
            send("generation-completed", { design });
            return;
          }
          let plan!: AiPlan;
          let planCorrection: string | undefined;
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const planRaw = await provider.plan({
              target,
              prompt,
              style,
              reference,
              correction: planCorrection,
              signal: abort.signal,
            });
            try {
              plan = parseAiPlan(planRaw, target);
              break;
            } catch (error) {
              if (
                attempt === 0 &&
                error instanceof AiValidationError &&
                !abort.signal.aborted
              ) {
                planCorrection = validationCorrection(error);
                continue;
              }
              throw error;
            }
          }
          const theme = buildAiTheme(plan);
          send("structure-ready", {
            plan: {
              theme,
              subject: plan.subject,
              preheader: plan.preheader,
              blocks: plan.blocks,
              tone: plan.tone,
            },
          });
          const blocks: DesignBlock[] = [];
          for (let index = 0; index < plan.blocks.length; index += 1) {
            if (abort.signal.aborted) throw new AiProviderError("cancelled", "已取消生成。", 499, false);
            const planBlock = plan.blocks[index];
            const previous = blocks.map((block) => ({
              type: block.type,
              text:
                typeof block.props.text === "string"
                  ? block.props.text
                  : typeof block.props.body === "string"
                    ? block.props.body
                    : "",
              variant:
                typeof block.props.variant === "string"
                  ? block.props.variant
                  : undefined,
            }));
            let payload!: ReturnType<typeof parseAiBlock>;
            let blockCorrection: string | undefined;
            for (let attempt = 0; attempt < 2; attempt += 1) {
              const raw = await provider.block({
                plan,
                requirement: prompt,
                ...(reference ? { reference } : {}),
                block: planBlock,
                previous,
                correction: blockCorrection,
                signal: abort.signal,
              });
              try {
                payload = parseAiBlock(raw, planBlock, target);
                if (payload.id !== planBlock.id || payload.type !== planBlock.type) {
                  throw new AiValidationError(
                    "plan_mismatch",
                    "AI 返回的模块与布局计划不一致。",
                  );
                }
                break;
              } catch (error) {
                if (
                  attempt === 0 &&
                  error instanceof AiValidationError &&
                  !abort.signal.aborted
                ) {
                  blockCorrection = validationCorrection(error);
                  continue;
                }
                throw error;
              }
            }
            const block = aiBlockToDesignBlock(payload);
            blocks.push(block);
            send("block-ready", {
              block,
              index,
              total: plan.blocks.length,
            });
          }
          const design = buildAiDocument(plan, blocks);
          send("generation-completed", { design });
        } catch (error) {
          failEvent(error);
        } finally {
          close();
        }
      })();
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export type { DesignDocument };
