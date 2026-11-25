import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  isAiProviderId,
  resolveProviderModel,
  type AiProviderId,
} from "../../../shared/ai/providers.ts";

export const LEGACY_DEEPSEEK_KEY = "campusflow.ai.deepseek-key.v1";
export const CREDENTIAL_CHANGE_EVENT = "campusflow-ai-configuration-changed";

export type CredentialStatus =
  | "saved"
  | "temporary"
  | "legacy"
  | "empty"
  | "unavailable";

export type ProviderSummary = {
  provider: AiProviderId;
  label: string;
  status: CredentialStatus;
  model: string;
  hasKey: boolean;
  isDefault: boolean;
};

export type ActiveCredential = {
  provider: AiProviderId;
  label: string;
  model: string;
  apiKey: string;
};

export type StoredCredential = {
  apiKey: string;
  model: string;
};

export type SecureKeyValueStore = {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  add(key: string, value: unknown): Promise<boolean>;
  delete(key: string): Promise<void>;
};

export class MissingCredentialError extends Error {
  constructor(provider: AiProviderId = "deepseek") {
    super(`请先打开「AI 配置」，填写你的 ${AI_PROVIDERS[provider].label} API Key。`);
    this.name = "MissingCredentialError";
  }
}

function validateKey(input: string, provider: AiProviderId) {
  const value = input.trim();
  if (value.length < 12 || value.length > 300 || !/^[!-~]+$/u.test(value)) {
    throw new Error(`请粘贴完整的 ${AI_PROVIDERS[provider].label} API Key，密钥中不能含空格。`);
  }
  return value;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function createCredentialManager(options: {
  store: SecureKeyValueStore;
  legacyStorage?: Pick<Storage, "getItem" | "removeItem"> | null;
  subtle?: SubtleCrypto;
  cryptoImpl?: Crypto;
  onChange?: () => void;
  now?: () => Date;
}) {
  const subtle = options.subtle ?? globalThis.crypto?.subtle;
  const cryptoImpl = options.cryptoImpl ?? globalThis.crypto;
  const now = options.now ?? (() => new Date());
  if (!subtle || !cryptoImpl) throw new Error("当前浏览器不支持 Web Crypto。");
  const temporary = new Map<AiProviderId, StoredCredential>();
  let memoryDefault: AiProviderId | null = null;
  let migrated: Promise<void> | null = null;

  const recordKey = (provider: AiProviderId) => `credential:${provider}`;
  const notify = () => options.onChange?.();

  async function masterKey() {
    const existing = await options.store.get("master-key");
    if (existing && typeof existing === "object" && "algorithm" in existing)
      return existing as CryptoKey;
    const created = await subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const won = await options.store.add("master-key", created);
    if (won) {
      const readBack = await options.store.get("master-key");
      if (!readBack || typeof readBack !== "object" || !("algorithm" in readBack))
        throw new Error("浏览器未能建立本机加密密钥。");
      return readBack as CryptoKey;
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const winner = await options.store.get("master-key");
      if (winner && typeof winner === "object" && "algorithm" in winner)
        return winner as CryptoKey;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("无法读取并发建立的本机加密密钥。");
  }

  async function encryptCredential(provider: AiProviderId, credential: StoredCredential) {
    const key = await masterKey();
    const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
    const encrypted = await subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(credential)),
    );
    return {
      version: 1,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      updatedAt: now().toISOString(),
      provider,
    };
  }

  async function decryptCredential(value: unknown): Promise<StoredCredential> {
    if (!value || typeof value !== "object")
      throw new Error("本机配置损坏。");
    const record = value as Record<string, unknown>;
    if (
      record.version !== 1 ||
      typeof record.iv !== "string" ||
      typeof record.ciphertext !== "string"
    )
      throw new Error("本机配置格式无效。");
    const key = await masterKey();
    const plaintext = await subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(record.iv) },
      key,
      base64ToBytes(record.ciphertext),
    );
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as StoredCredential).apiKey !== "string" ||
      typeof (parsed as StoredCredential).model !== "string"
    )
      throw new Error("本机配置内容无效。");
    return parsed as StoredCredential;
  }

  async function persistent(provider: AiProviderId): Promise<StoredCredential | null> {
    const record = await options.store.get(recordKey(provider));
    return record ? decryptCredential(record) : null;
  }

  async function writePersistent(provider: AiProviderId, credential: StoredCredential) {
    const key = recordKey(provider);
    const previous = await options.store.get(key);
    await options.store.put(key, await encryptCredential(provider, credential));
    try {
      const verified = await persistent(provider);
      if (verified?.apiKey !== credential.apiKey || verified.model !== credential.model)
        throw new Error("写入后读取校验失败。");
    } catch (error) {
      if (previous) await options.store.put(key, previous);
      else await options.store.delete(key);
      throw error;
    }
  }

  function legacyValue(provider: AiProviderId) {
    if (provider !== "deepseek") return null;
    try {
      const value = options.legacyStorage?.getItem(LEGACY_DEEPSEEK_KEY)?.trim();
      return value && value.length >= 12 && /^[!-~]+$/u.test(value) ? value : null;
    } catch {
      return null;
    }
  }

  async function migrateLegacy() {
    if (migrated) return migrated;
    migrated = (async () => {
      const legacy = legacyValue("deepseek");
      if (!legacy) return;
      try {
        const existing = await persistent("deepseek");
        if (!existing) {
          await writePersistent("deepseek", {
            apiKey: legacy,
            model: AI_PROVIDERS.deepseek.defaultModel,
          });
        }
        const verified = await persistent("deepseek");
        if (!verified) throw new Error("迁移校验失败。");
        options.legacyStorage?.removeItem(LEGACY_DEEPSEEK_KEY);
        notify();
      } catch {
        // Keep the legacy item usable; migration can retry on the next read.
        migrated = null;
      }
    })();
    return migrated;
  }

  async function status(provider: AiProviderId): Promise<CredentialStatus> {
    if (temporary.has(provider)) return "temporary";
    await migrateLegacy();
    try {
      if (await persistent(provider)) return "saved";
    } catch {
      return legacyValue(provider) ? "legacy" : "unavailable";
    }
    return legacyValue(provider) ? "legacy" : "empty";
  }

  async function read(provider: AiProviderId): Promise<StoredCredential> {
    const temp = temporary.get(provider);
    if (temp) return temp;
    await migrateLegacy();
    try {
      const saved = await persistent(provider);
      if (saved) return saved;
    } catch {
      // Fall through to the legacy fallback when available.
    }
    const legacy = legacyValue(provider);
    if (legacy)
      return { apiKey: legacy, model: AI_PROVIDERS[provider].defaultModel };
    throw new MissingCredentialError(provider);
  }

  async function defaultProvider(): Promise<AiProviderId> {
    if (memoryDefault) return memoryDefault;
    try {
      const value = await options.store.get("default-provider");
      if (isAiProviderId(value)) return value;
    } catch {
      // Use the built-in default.
    }
    return "deepseek";
  }

  async function setDefault(provider: AiProviderId) {
    if (!isAiProviderId(provider)) throw new Error("不支持的 AI 厂商。");
    memoryDefault = provider;
    try {
      await options.store.put("default-provider", provider);
    } catch {
      // A tab-local default still applies when persistent metadata is unavailable.
    }
    notify();
  }

  return {
    async summaries(): Promise<ProviderSummary[]> {
      await migrateLegacy();
      const active = await defaultProvider();
      return Promise.all(AI_PROVIDER_IDS.map(async (provider) => {
        const state = await status(provider);
        let model = AI_PROVIDERS[provider].defaultModel;
        try {
          model = (await persistent(provider))?.model ?? model;
        } catch {
          // Keep the provider default.
        }
        return {
          provider,
          label: AI_PROVIDERS[provider].label,
          status: state,
          model,
          hasKey: state === "saved" || state === "temporary" || state === "legacy",
          isDefault: provider === active,
        };
      }));
    },
    status,
    async save(
      provider: AiProviderId,
      input: string,
      remember: boolean,
      modelValue?: string,
    ): Promise<void> {
      const apiKey = validateKey(input, provider);
      const model = resolveProviderModel(provider, modelValue);
      if (!remember) {
        temporary.set(provider, { apiKey, model });
        notify();
        return;
      }
      await writePersistent(provider, { apiKey, model });
      temporary.delete(provider);
      notify();
    },
    async saveModel(provider: AiProviderId, modelValue: string) {
      const model = resolveProviderModel(provider, modelValue);
      const temp = temporary.get(provider);
      if (temp) {
        temporary.set(provider, { ...temp, model });
        notify();
        return;
      }
      const saved = await persistent(provider);
      if (!saved) throw new MissingCredentialError(provider);
      await writePersistent(provider, { ...saved, model });
      notify();
    },
    async clear(provider: AiProviderId, current: CredentialStatus) {
      temporary.delete(provider);
      if (current !== "temporary") {
        await options.store.delete(recordKey(provider));
        if (provider === "deepseek") options.legacyStorage?.removeItem(LEGACY_DEEPSEEK_KEY);
      }
      notify();
    },
    read,
    async active(): Promise<ActiveCredential> {
      const provider = await defaultProvider();
      const credential = await read(provider);
      return {
        provider,
        label: AI_PROVIDERS[provider].label,
        model: credential.model,
        apiKey: credential.apiKey,
      };
    },
    defaultProvider,
    setDefault,
  };
}

export type CredentialManager = ReturnType<typeof createCredentialManager>;

export class MemoryCredentialStore implements SecureKeyValueStore {
  private readonly values = new Map<string, unknown>();
  async get(key: string) {
    return this.values.get(key);
  }
  async put(key: string, value: unknown) {
    this.values.set(key, structuredClone(value));
  }
  async add(key: string, value: unknown) {
    if (this.values.has(key)) return false;
    this.values.set(key, structuredClone(value));
    return true;
  }
  async delete(key: string) {
    this.values.delete(key);
  }
}