export const AI_PROVIDER_IDS = ["deepseek", "qwen", "kimi"] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export type AiModelOption = {
  id: string;
  label: string;
};

export type AiProviderDefinition = {
  id: AiProviderId;
  label: string;
  endpoint: string;
  defaultModel: string;
  models: AiModelOption[];
  supportsThinking: boolean;
  supportsTemperature: boolean;
  tokenField: "max_tokens" | "max_completion_tokens";
  reasoningEffort?: "low";
};

export const AI_PROVIDERS: Record<AiProviderId, AiProviderDefinition> = {
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-flash",
    models: [
      { id: "deepseek-flash", label: "DeepSeek Flash" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    ],
    supportsThinking: true,
    supportsTemperature: true,
    tokenField: "max_tokens",
  },
  qwen: {
    id: "qwen",
    label: "通义千问",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    defaultModel: "qwen-plus",
    models: [
      { id: "qwen-plus", label: "Qwen Plus" },
      { id: "qwen-max", label: "Qwen Max" },
      { id: "qwen-turbo", label: "Qwen Turbo" },
    ],
    supportsThinking: false,
    supportsTemperature: true,
    tokenField: "max_tokens",
  },
  kimi: {
    id: "kimi",
    label: "Kimi",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    defaultModel: "kimi-k3.1-pro",
    models: [
      { id: "kimi-k3.1-pro", label: "Kimi K3.1 Pro" },
      { id: "kimi-k3", label: "Kimi K3" },
      { id: "kimi-k3.1-pro-highspeed", label: "Kimi K3.1 Pro Highspeed" },
    ],
    supportsThinking: false,
    supportsTemperature: false,
    tokenField: "max_completion_tokens",
    reasoningEffort: "low",
  },
};

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && AI_PROVIDER_IDS.includes(value as AiProviderId);
}

export function providerDefinition(provider: AiProviderId): AiProviderDefinition {
  return AI_PROVIDERS[provider];
}

export function resolveProviderModel(provider: AiProviderId, value?: string): string {
  const definition = providerDefinition(provider);
  const model = value?.trim() || definition.defaultModel;
  if (!definition.models.some((item) => item.id === model))
    throw new Error("不支持的模型。");
  return model;
}