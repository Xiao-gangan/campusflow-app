import type { DesignTarget } from "../contracts/design.ts";
import type { AiPlan, AiPlanBlock, AiReference } from "./schema.ts";
import { AI_PROMPT_VERSION } from "./prompt.ts";
import {
  AI_PROVIDERS,
  providerDefinition,
  resolveProviderModel,
  type AiProviderId,
} from "./providers.ts";

export const DEEPSEEK_ENDPOINT = AI_PROVIDERS.deepseek.endpoint;
export const DEEPSEEK_DEFAULT_MODEL = AI_PROVIDERS.deepseek.defaultModel;
export const AI_REQUEST_TIMEOUT_MS = 30_000;

export type AiDiagnostics = {
  model?: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  contentLength?: number;
  category?: string;
  retries?: number;
};

export class AiProviderError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  diagnostics?: AiDiagnostics;

  constructor(
    code: string,
    message: string,
    status = 502,
    retryable = true,
    diagnostics?: AiDiagnostics,
  ) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.diagnostics = diagnostics;
  }
}

export type AiProvider = {
  name: AiProviderId | "mock";
  probe?(input: { signal: AbortSignal }): Promise<{ model: string }>;
  design?(input: {
    target?: DesignTarget;
    prompt: string;
    style?: string;
    reference?: AiReference;
    correction?: string;
    signal: AbortSignal;
  }): Promise<unknown>;
  designHtml?(input: {
    target?: DesignTarget;
    prompt: string;
    style?: string;
    currentHtml?: string;
    subject?: string;
    correction?: string;
    signal: AbortSignal;
  }): Promise<unknown>;
  plan(input: {
    target?: DesignTarget;
    prompt: string;
    style?: string;
    reference?: AiReference;
    correction?: string;
    signal: AbortSignal;
  }): Promise<unknown>;
  block(input: {
    plan: AiPlan;
    requirement?: string;
    reference?: AiReference;
    block: AiPlanBlock;
    previous: { type: string; text: string; variant?: string }[];
    correction?: string;
    signal: AbortSignal;
  }): Promise<unknown>;
  patch(input: {
    target?: DesignTarget;
    blockId: string;
    blockType: string;
    currentProps: Record<string, unknown>;
    instruction: string;
    quickAction?: string;
    correction?: string;
    signal: AbortSignal;
  }): Promise<unknown>;
};

type ChatMessage = { role: "system" | "user"; content: string };

export function extractJsonObject(value: string): unknown {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new AiProviderError(
      "invalid_json",
      "AI 返回格式不正确，请重试。",
      502,
      true,
    );
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new AiProviderError(
      "invalid_json",
      "AI 返回格式不正确，请重试。",
      502,
      true,
    );
  }
}

function mapStatus(status: number, label = "AI"): AiProviderError {
  if (status === 401 || status === 403) {
    return new AiProviderError(
      "invalid_key",
      `${label} API Key 无效或没有权限，请检查后重试。`,
      status,
      false,
    );
  }
  if (status === 402) {
    return new AiProviderError(
      "insufficient_balance",
      `${label} 账户余额不足，请充值后重试。`,
      status,
      false,
    );
  }
  if (status === 429) {
    return new AiProviderError(
      "rate_limited",
      `${label} 请求过于频繁，请稍后再试。`,
      status,
      true,
    );
  }
  if (status === 400) {
    return new AiProviderError(
      "provider_rejected",
      `${label} 拒绝了请求，请稍后重试或更换模型。`,
      status,
      false,
    );
  }
  return new AiProviderError(
    "provider_unavailable",
    `${label} 服务暂时不可用，请稍后重试。`,
    status,
    true,
  );
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export type AiTimeoutBudget = {
  signal: AbortSignal;
  timedOut: () => boolean;
  cleanup: () => void;
};

export function createAiTimeoutBudget(
  parent: AbortSignal,
  timeoutMs = AI_REQUEST_TIMEOUT_MS,
): AiTimeoutBudget {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("ai_timeout"));
  }, timeoutMs);
  const onAbort = () => controller.abort(parent.reason);
  if (parent.aborted) controller.abort(parent.reason);
  else parent.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", onAbort);
    },
  };
}

type ChatCompletionResult = {
  content: string;
  diagnostics: AiDiagnostics;
};

async function chatCompletion(
  apiKey: string,
  messages: ChatMessage[],
  options: {
    signal: AbortSignal;
    maxTokens: number;
    temperature: number;
    fetchImpl: typeof fetch;
    model: string;
    endpoint: string;
    label: string;
    supportsTemperature: boolean;
    tokenField: "max_tokens" | "max_completion_tokens";
    reasoningEffort?: "low";
    thinking?: "enabled" | "disabled";
    deadline?: AiTimeoutBudget;
  },
): Promise<ChatCompletionResult> {
  let ownTimedOut = false;
  const ownTimeout = options.deadline ? null : new AbortController();
  const timer = options.deadline
    ? null
    : setTimeout(() => {
        ownTimedOut = true;
        ownTimeout?.abort(new Error("ai_timeout"));
      }, AI_REQUEST_TIMEOUT_MS);
  const signal =
    options.deadline?.signal ??
    AbortSignal.any([options.signal, ownTimeout!.signal]);
  const timedOut = () => options.deadline?.timedOut() ?? ownTimedOut;
  try {
    const response = await options.fetchImpl(options.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: false,
        ...(options.supportsTemperature
          ? { temperature: options.temperature }
          : {}),
        ...(options.tokenField === "max_completion_tokens"
          ? { max_completion_tokens: options.maxTokens }
          : { max_tokens: options.maxTokens }),
        response_format: { type: "json_object" },
        ...(options.reasoningEffort
          ? { reasoning_effort: options.reasoningEffort }
          : {}),
        ...(options.thinking
          ? { thinking: { type: options.thinking } }
          : {}),
      }),
      signal,
    });
    if (!response.ok) {
      const error = mapStatus(response.status, options.label);
      error.diagnostics = {
        model: options.model,
        category: error.code,
      };
      throw error;
    }
    let payload: {
      model?: unknown;
      choices?: {
        finish_reason?: unknown;
        message?: { content?: unknown; reasoning_content?: unknown };
      }[];
      usage?: {
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
        completion_tokens_details?: { reasoning_tokens?: unknown };
      };
    };
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      if (options.signal.aborted) {
        throw new AiProviderError(
          "cancelled",
          "已取消生成。",
          499,
          false,
          { model: options.model, category: "cancelled" },
        );
      }
      if (timedOut()) {
        throw new AiProviderError(
          "timeout",
          `${options.label} 响应超时，请稍后重试。`,
          504,
          true,
          { model: options.model, category: "timeout" },
        );
      }
      throw new AiProviderError(
        "provider_invalid_response",
        `${options.label} 返回了无法解析的响应，请重试。`,
        502,
        true,
        { model: options.model, category: "provider_invalid_response" },
      );
    }

    const choice = payload.choices?.[0];
    const content =
      typeof choice?.message?.content === "string"
        ? choice.message.content
        : "";
    const finishReason =
      typeof choice?.finish_reason === "string"
        ? choice.finish_reason
        : "missing";
    const diagnostics: AiDiagnostics = {
      model:
        typeof payload.model === "string" ? payload.model : options.model,
      finishReason,
      promptTokens: numeric(payload.usage?.prompt_tokens),
      completionTokens: numeric(payload.usage?.completion_tokens),
      reasoningTokens: numeric(
        payload.usage?.completion_tokens_details?.reasoning_tokens,
      ),
      contentLength: content.length,
    };

    if (finishReason === "length") {
      throw new AiProviderError(
        "truncated_response",
        "AI 输出不完整，请重试。",
        502,
        true,
        diagnostics,
      );
    }
    if (finishReason === "content_filter") {
      throw new AiProviderError(
        "content_filtered",
        "AI 输出被安全策略拦截，请调整内容后重试。",
        422,
        false,
        diagnostics,
      );
    }
    if (finishReason === "insufficient_system_resource") {
      throw new AiProviderError(
        "provider_unavailable",
        `${options.label} 资源不足，请稍后重试。`,
        503,
        true,
        diagnostics,
      );
    }
    if (finishReason === "aborted") {
      throw new AiProviderError(
        "provider_aborted",
        `${options.label} 中断了本次生成，请重试。`,
        503,
        true,
        diagnostics,
      );
    }
    if (finishReason !== "stop") {
      throw new AiProviderError(
        "invalid_finish_reason",
        "AI 返回了不受支持的内容，请重试。",
        502,
        true,
        diagnostics,
      );
    }
    if (!content.trim()) {
      throw new AiProviderError(
        "empty_response",
        "AI 没有返回内容，请重试。",
        502,
        true,
        diagnostics,
      );
    }
    return { content, diagnostics };
  } catch (error) {
    if (error instanceof AiProviderError) {
      error.diagnostics = {
        ...error.diagnostics,
        model: error.diagnostics?.model ?? options.model,
        category: error.code,
      };
      throw error;
    }
    if (options.signal.aborted) {
      throw new AiProviderError(
        "cancelled",
        "已取消生成。",
        499,
        false,
        { model: options.model, category: "cancelled" },
      );
    }
    if (timedOut()) {
      throw new AiProviderError(
        "timeout",
        `${options.label} 响应超时，请稍后重试。`,
        504,
        true,
        { model: options.model, category: "timeout" },
      );
    }
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message === "ai_timeout")
    ) {
      throw new AiProviderError(
        "timeout",
        `${options.label} 响应超时，请稍后重试。`,
        504,
        true,
        { model: options.model, category: "timeout" },
      );
    }
    throw new AiProviderError(
      "network_error",
      `无法连接 ${options.label}，请检查网络后重试。`,
      502,
      true,
      { model: options.model, category: "network_error" },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const PATCH_TOKEN_BUDGETS: Record<string, number> = {
  hero: 700,
  event_info: 650,
  rsvp: 650,
  heading: 220,
  text: 1000,
  info_card: 700,
  button: 180,
  footer: 260,
  divider: 80,
  spacer: 80,
  logo: 180,
};

export function patchTokenBudget(blockType: string): number {
  return PATCH_TOKEN_BUDGETS[blockType] ?? 300;
}

const PATCH_RETRY_CODES = new Set([
  "truncated_response",
  "invalid_json",
  "empty_response",
  "invalid_finish_reason",
  "provider_invalid_response",
]);

export function createAiProvider(options: {
  provider: AiProviderId;
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): AiProvider {
  const definition = providerDefinition(options.provider);
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = resolveProviderModel(options.provider, options.model);
  const label = definition.label;
  async function request(
    system: string,
    user: string,
    signal: AbortSignal,
    maxTokens: number,
    temperature: number,
    thinking?: "enabled" | "disabled",
    deadline?: AiTimeoutBudget,
  ): Promise<unknown> {
    const result = await chatCompletion(
      options.apiKey,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        signal,
        maxTokens,
        temperature,
        fetchImpl,
        model,
        endpoint: definition.endpoint,
        label,
        supportsTemperature: definition.supportsTemperature,
        tokenField: definition.tokenField,
        reasoningEffort: definition.reasoningEffort,
        ...(definition.supportsThinking && thinking ? { thinking } : {}),
        deadline,
      },
    );
    try {
      return extractJsonObject(result.content);
    } catch (error) {
      if (error instanceof AiProviderError) {
        error.diagnostics = result.diagnostics;
      }
      throw error;
    }
  }
  async function requestWithRetry(
    system: string,
    user: string,
    signal: AbortSignal,
    maxTokens: number,
    temperature: number,
  ): Promise<unknown> {
    const deadline = createAiTimeoutBudget(signal);
    const cancelled = (retries: number) =>
      new AiProviderError(
        "cancelled",
        "已取消生成。",
        499,
        false,
        { model, category: "cancelled", retries },
      );
    const timeout = (retries: number) =>
      new AiProviderError(
        "timeout",
        `${label} 响应超时，请稍后重试。`,
        504,
        true,
        { model, category: "timeout", retries },
      );
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (signal.aborted) throw cancelled(attempt);
        if (deadline.timedOut()) throw timeout(attempt);
        if (deadline.signal.aborted) throw cancelled(attempt);
        try {
          return await request(
            system,
            user,
            signal,
            maxTokens,
            temperature,
            definition.supportsThinking ? "disabled" : undefined,
            deadline,
          );
        } catch (error) {
          const retryable =
            error instanceof AiProviderError &&
            PATCH_RETRY_CODES.has(error.code) &&
            !signal.aborted &&
            !deadline.signal.aborted;
          if (!retryable || attempt === 1) {
            if (error instanceof AiProviderError) {
              error.diagnostics = {
                ...error.diagnostics,
                retries: attempt,
              };
            }
            throw error;
          }
          if (signal.aborted) throw cancelled(0);
          if (deadline.timedOut()) throw timeout(0);
          if (deadline.signal.aborted) throw cancelled(0);
        }
      }
      throw new AiProviderError(
        "generation_failed",
        "AI 生成失败，请重试。",
        502,
        false,
        { model, category: "generation_failed", retries: 1 },
      );
    } finally {
      deadline.cleanup();
    }
  }
  return {
    name: options.provider,
    async probe({ signal }) {
      const result = await chatCompletion(
        options.apiKey,
        [
          { role: "system", content: "你是连接测试端点，只返回简短 JSON。" },
          { role: "user", content: '返回 {"ok":true}' },
        ],
        {
          signal,
          maxTokens: 32,
          temperature: 0,
          fetchImpl,
          model,
          endpoint: definition.endpoint,
          label,
          supportsTemperature: definition.supportsTemperature,
          tokenField: definition.tokenField,
          reasoningEffort: definition.reasoningEffort,
        },
      );
      return { model: result.diagnostics.model ?? model };
    },
    async design(input) {
      const { buildFullDesignPrompt } = await import("./prompt.ts");
      const prompt = buildFullDesignPrompt({
        target: input.target,
        prompt: input.prompt,
        style: input.style,
        reference: input.reference,
        correction: input.correction,
      });
      return requestWithRetry(prompt.system, prompt.user, input.signal, 3200, 0.7);
    },
    async designHtml(input) {
      const { buildFreeHtmlPrompt } = await import("./prompt.ts");
      const prompt = buildFreeHtmlPrompt({
        target: input.target,
        prompt: input.prompt,
        style: input.style,
        currentHtml: input.currentHtml,
        subject: input.subject,
        correction: input.correction,
      });
      return requestWithRetry(prompt.system, prompt.user, input.signal, 4096, 0.55);
    },
    async plan(input) {
      const { buildPlanPrompt } = await import("./prompt.ts");
      const prompt = buildPlanPrompt({
        target: input.target,
        prompt: input.prompt,
        style: input.style,
        reference: input.reference,
        correction: input.correction,
      });
      return requestWithRetry(prompt.system, prompt.user, input.signal, 1400, 0.65);
    },
    async block(input) {
      const { buildBlockPrompt } = await import("./prompt.ts");
      const prompt = buildBlockPrompt(
        input.plan,
        input.block,
        input.previous,
        input.requirement,
        input.reference,
        input.correction,
      );
      return requestWithRetry(prompt.system, prompt.user, input.signal, 900, 0.6);
    },
    async patch(input) {
      const { buildPatchPrompt } = await import("./prompt.ts");
      const prompt = buildPatchPrompt(input);
      return requestWithRetry(
        prompt.system,
        prompt.user,
        input.signal,
        patchTokenBudget(input.blockType),
        0.5,
      );
    },
  };
}

export function createDeepSeekProvider(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): AiProvider {
  return createAiProvider({
    provider: "deepseek",
    apiKey: options.apiKey,
    model:
      options.model?.trim() ||
      process.env.DEEPSEEK_MODEL?.trim() ||
      DEEPSEEK_DEFAULT_MODEL,
    fetchImpl: options.fetchImpl,
  });
}

export function promptVersion(): string {
  return AI_PROMPT_VERSION;
}
