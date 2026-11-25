import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  LEGACY_DEEPSEEK_KEY,
  MemoryCredentialStore,
  createCredentialManager,
} from "../src/modules/ai/credential-manager.ts";

function legacyStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    values,
  };
}

const managerFor = (store, legacy = legacyStorage()) =>
  createCredentialManager({ store, legacyStorage: legacy, subtle: crypto.subtle, cryptoImpl: crypto });

test("concurrent first saves share one master key and keep every provider readable", async () => {
  const store = new MemoryCredentialStore();
  const first = managerFor(store);
  const second = managerFor(store);
  const qwenKey = randomUUID();
  const kimiKey = randomUUID();
  await Promise.all([
    first.save("qwen", qwenKey, true, "qwen-plus"),
    second.save("kimi", kimiKey, true, "kimi-k3.1-pro"),
  ]);
  const reader = managerFor(store);
  assert.equal((await reader.read("qwen")).apiKey, qwenKey);
  assert.equal((await reader.read("kimi")).apiKey, kimiKey);
  assert.equal((await reader.read("qwen")).model, "qwen-plus");
  assert.equal((await reader.read("kimi")).model, "kimi-k3.1-pro");
  const master = await store.get("master-key");
  assert.ok(master && typeof master === "object" && "algorithm" in master);
  const qwenRecord = await store.get("credential:qwen");
  const kimiRecord = await store.get("credential:kimi");
  assert.equal(JSON.stringify(qwenRecord).includes(qwenKey), false);
  assert.equal(JSON.stringify(kimiRecord).includes(kimiKey), false);
});

test("keys, models and defaults stay independent per provider", async () => {
  const store = new MemoryCredentialStore();
  const manager = managerFor(store);
  const keys = {
    deepseek: randomUUID(),
    qwen: randomUUID(),
    kimi: randomUUID(),
  };
  await manager.save("deepseek", keys.deepseek, true, "deepseek-flash");
  await manager.save("qwen", keys.qwen, true, "qwen-max");
  await manager.save("kimi", keys.kimi, true, "kimi-k3.1-pro");
  for (const [provider, key] of Object.entries(keys))
    assert.equal((await manager.read(provider)).apiKey, key);
  assert.equal((await manager.defaultProvider()), "deepseek");
  await manager.setDefault("kimi");
  assert.equal((await manager.defaultProvider()), "kimi");
  const summaries = await manager.summaries();
  assert.equal(summaries.find((row) => row.provider === "qwen")?.model, "qwen-max");
  assert.equal(summaries.find((row) => row.provider === "kimi")?.isDefault, true);
  await manager.saveModel("qwen", "qwen-turbo");
  assert.equal((await manager.read("qwen")).model, "qwen-turbo");
});

test("legacy DeepSeek localStorage is migrated only after encrypted read-back succeeds", async () => {
  const store = new MemoryCredentialStore();
  const legacy = legacyStorage({ [LEGACY_DEEPSEEK_KEY]: randomUUID() });
  const secret = legacy.getItem(LEGACY_DEEPSEEK_KEY);
  const manager = managerFor(store, legacy);
  assert.equal(await manager.status("deepseek"), "saved");
  assert.equal(await manager.status("deepseek"), "saved");
  assert.equal(await manager.status("deepseek"), "saved");
  assert.equal((await manager.read("deepseek")).apiKey, secret);
  assert.equal(legacy.getItem(LEGACY_DEEPSEEK_KEY), null);
  assert.equal(JSON.stringify(await store.get("credential:deepseek")).includes(secret), false);
});

test("a failed migration keeps the legacy key usable instead of deleting it", async () => {
  class FailingWriteStore extends MemoryCredentialStore {
    async put(key, value) {
      if (key.startsWith("credential:")) throw new Error("quota");
      return super.put(key, value);
    }
  }
  const store = new FailingWriteStore();
  const secret = randomUUID();
  const legacy = legacyStorage({ [LEGACY_DEEPSEEK_KEY]: secret });
  const manager = managerFor(store, legacy);
  assert.equal(await manager.status("deepseek"), "legacy");
  assert.equal((await manager.read("deepseek")).apiKey, secret);
  assert.equal(legacy.getItem(LEGACY_DEEPSEEK_KEY), secret);
});

test("temporary credentials stay independent and can be cleared without persistence", async () => {
  const store = new MemoryCredentialStore();
  const manager = managerFor(store);
  const key = randomUUID();
  await manager.save("qwen", key, false, "qwen-plus");
  assert.equal(await manager.status("qwen"), "temporary");
  assert.equal((await manager.read("qwen")).apiKey, key);
  await manager.clear("qwen", "temporary");
  assert.equal(await manager.status("qwen"), "empty");
  await assert.rejects(manager.read("qwen"), /通义千问/u);
});