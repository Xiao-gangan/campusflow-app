export const AI_OVERALL_TIMEOUT_MS = 120_000;

export const AI_TIMEOUT_MESSAGE =
  "AI 生成超过 2 分钟仍未完成，已停止请求。请稍后重试或缩短需求。";

export const AI_UNAVAILABLE_MESSAGE =
  "无法连接 AI 服务，请确认本地 AI 函数服务已启动或服务已部署。";

export const AI_INCOMPLETE_MESSAGE =
  "AI 响应提前结束，未收到完整结果。请重试或缩短需求。";

export function aiHttpStatusMessage(status: number): string | null {
  if (status === 401 || status === 403) {
    return "DeepSeek API Key 无效或没有访问权限，请检查后重试。";
  }
  if (status === 402) {
    return "DeepSeek 账户余额不足，请充值或使用本地演示模式。";
  }
  if (status === 429) {
    return "AI 请求过于频繁，请稍等片刻再试。";
  }
  if (status === 404 || status === 502 || status === 504) {
    return "AI 服务尚未启动或尚未部署，请确认本地 AI 函数服务正在运行。";
  }
  if (status >= 500) {
    return "AI 服务暂时不可用，请稍后重试。";
  }
  return null;
}

export function aiTransportErrorMessage(
  error: unknown,
  timedOut: boolean,
): string {
  if (timedOut) return AI_TIMEOUT_MESSAGE;
  if (error instanceof TypeError) return AI_UNAVAILABLE_MESSAGE;
  if (error instanceof Error && error.message) return error.message;
  return "AI 服务暂时不可用，请稍后重试。";
}

export function scheduleAiTimeout(
  controller: AbortController,
  onTimeout: () => void,
  timeoutMs = AI_OVERALL_TIMEOUT_MS,
): () => void {
  const timer = setTimeout(() => {
    onTimeout();
    controller.abort();
  }, timeoutMs);
  return () => clearTimeout(timer);
}
