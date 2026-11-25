import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  isAiProviderId,
  resolveProviderModel,
  type AiProviderId,
} from "../../../shared/ai/providers.ts";
import {
  CREDENTIAL_CHANGE_EVENT,
  LEGACY_DEEPSEEK_KEY,
  MissingCredentialError,
  createCredentialManager,
  type ActiveCredential,
  type CredentialManager,
  type CredentialStatus,
  type ProviderSummary,
  type SecureKeyValueStore,
} from "./credential-manager.ts";

export { MissingCredentialError, LEGACY_DEEPSEEK_KEY };
export type { ActiveCredential, CredentialStatus, ProviderSummary };

const DB_NAME = "campusflow.ai.credentials.v1";
const STORE_NAME = "kv";

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 操作失败。"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB 事务失败。"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB 事务中止。"));
  });
}

class IndexedDbStore implements SecureKeyValueStore {
  private readonly db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
  }

  static async open(factory: IDBFactory): Promise<IndexedDbStore> {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME))
          request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("无法打开 IndexedDB。"));
      request.onblocked = () => reject(new Error("IndexedDB 被其它标签页阻塞。"));
    });
    return new IndexedDbStore(database);
  }

  async get(key: string) {
    const transaction = this.db.transaction(STORE_NAME, "readonly");
    return requestValue(transaction.objectStore(STORE_NAME).get(key));
  }

  async put(key: string, value: unknown) {
    const transaction = this.db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    await transactionDone(transaction);
  }

  async add(key: string, value: unknown) {
    const transaction = this.db.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    try {
      await requestValue(transaction.objectStore(STORE_NAME).add(value, key));
      await done;
      return true;
    } catch (error) {
      await done.catch(() => undefined);
      if (error instanceof DOMException && error.name === "ConstraintError")
        return false;
      throw error;
    }
  }

  async delete(key: string) {
    const transaction = this.db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    await transactionDone(transaction);
  }
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function notifyChanged() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(CREDENTIAL_CHANGE_EVENT));
}

let managerPromise: Promise<CredentialManager | null> | null = null;
const fallbackTemporary = new Map<AiProviderId, { apiKey: string; model: string }>();
let fallbackDefault: AiProviderId = "deepseek";

function defaultManager() {
  if (!managerPromise) {
    managerPromise = (async () => {
      const factory = typeof indexedDB !== "undefined" ? indexedDB : null;
      if (!factory || !globalThis.crypto?.subtle) return null;
      try {
        return createCredentialManager({
          store: await IndexedDbStore.open(factory),
          legacyStorage: storage(),
          subtle: globalThis.crypto.subtle,
          cryptoImpl: globalThis.crypto,
          onChange: notifyChanged,
        });
      } catch {
        return null;
      }
    })();
  }
  return managerPromise;
}

function validateFallbackKey(input: string, provider: AiProviderId) {
  const value = input.trim();
  if (value.length < 12 || value.length > 300 || !/^[!-~]+$/u.test(value)) {
    throw new Error(`请粘贴完整的 ${AI_PROVIDERS[provider].label} API Key，密钥中不能含空格。`);
  }
  return value;
}

function fallbackSummary(provider: AiProviderId): ProviderSummary {
  const temporary = fallbackTemporary.get(provider);
  return {
    provider,
    label: AI_PROVIDERS[provider].label,
    status: temporary ? "temporary" : "unavailable",
    model: temporary?.model ?? AI_PROVIDERS[provider].defaultModel,
    hasKey: Boolean(temporary),
    isDefault: provider === fallbackDefault,
  };
}

export function subscribeCredentials(refresh: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LEGACY_DEEPSEEK_KEY) refresh();
  };
  window.addEventListener(CREDENTIAL_CHANGE_EVENT, refresh);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CREDENTIAL_CHANGE_EVENT, refresh);
    window.removeEventListener("storage", onStorage);
  };
}

export async function credentialStatus(provider: AiProviderId = "deepseek"): Promise<CredentialStatus> {
  const active = await defaultManager();
  if (active) return active.status(provider);
  return fallbackTemporary.has(provider) ? "temporary" : "unavailable";
}

export async function providerSummaries(): Promise<ProviderSummary[]> {
  const active = await defaultManager();
  if (active) return active.summaries();
  return AI_PROVIDER_IDS.map(fallbackSummary);
}

export async function saveCredential(
  input: string,
  remember: boolean,
  provider: AiProviderId = "deepseek",
  model?: string,
) {
  const active = await defaultManager();
  if (active) {
    await active.save(provider, input, remember, model);
    return;
  }
  if (remember) throw new Error("浏览器未能保存这次更改，请检查 IndexedDB 与 Web Crypto 后重试。");
  const apiKey = validateFallbackKey(input, provider);
  fallbackTemporary.set(provider, {
    apiKey,
    model: resolveProviderModel(provider, model),
  });
  notifyChanged();
}

export async function saveProviderModel(provider: AiProviderId, model: string) {
  const active = await defaultManager();
  if (active) return active.saveModel(provider, model);
  const temporary = fallbackTemporary.get(provider);
  if (!temporary) throw new MissingCredentialError(provider);
  fallbackTemporary.set(provider, {
    ...temporary,
    model: resolveProviderModel(provider, model),
  });
  notifyChanged();
}

export async function clearCredential(
  status: CredentialStatus,
  provider: AiProviderId = "deepseek",
) {
  const active = await defaultManager();
  if (active) {
    await active.clear(provider, status);
    return;
  }
  fallbackTemporary.delete(provider);
  notifyChanged();
}

export async function readCredential(provider: AiProviderId = "deepseek"): Promise<string> {
  const active = await defaultManager();
  if (active) return (await active.read(provider)).apiKey;
  const temporary = fallbackTemporary.get(provider);
  if (temporary) return temporary.apiKey;
  throw new MissingCredentialError(provider);
}

export async function readActiveCredential(): Promise<ActiveCredential> {
  const active = await defaultManager();
  if (active) return active.active();
  const provider = fallbackDefault;
  const temporary = fallbackTemporary.get(provider);
  if (!temporary) throw new MissingCredentialError(provider);
  return {
    provider,
    label: AI_PROVIDERS[provider].label,
    model: temporary.model,
    apiKey: temporary.apiKey,
  };
}

export async function defaultProvider(): Promise<AiProviderId> {
  const active = await defaultManager();
  return active ? active.defaultProvider() : fallbackDefault;
}

export async function setDefaultProvider(provider: AiProviderId) {
  if (!isAiProviderId(provider)) throw new Error("不支持的 AI 厂商。");
  fallbackDefault = provider;
  const active = await defaultManager();
  if (active) await active.setDefault(provider);
  else notifyChanged();
}