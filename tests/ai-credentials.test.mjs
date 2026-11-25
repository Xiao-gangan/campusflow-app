import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  clearCredential,
  credentialStatus,
  readCredential,
  saveCredential,
} from "../src/modules/ai/credentials.ts";
import { requestDesign } from "../src/modules/ai/design-request.ts";

test("demo design never needs browser credential storage and sends no key", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "/functions/v1/app/api/ai/design");
    assert.equal(init.headers.has("Authorization"), false);
    return Response.json({});
  });
  await requestDesign(
    { mock: true, mode: "full", target: "invite_page" },
    new AbortController().signal,
  );
  assert.equal(fetch.mock.callCount(), 1);
});

test("both design modes read the current temporary credential, clear blocks dispatch, and an invalid replacement preserves the old value", async (t) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    value: new EventTarget(),
    configurable: true,
  });
  t.after(async () => {
    await clearCredential("temporary");
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const first = randomUUID(),
    second = randomUUID();
  let expected = first;
  const fetch = t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.ok(init.headers.get("Authorization") === "Bearer " + expected);
    assert.ok(!init.body.includes(first) && !init.body.includes(second));
    assert.equal(init.redirect, "error");
    return Response.json({});
  });
  const signal = new AbortController().signal;
  await saveCredential("  " + first + " ", false);
  assert.equal(await credentialStatus(), "temporary");
  await requestDesign({ mock: false, target: "email", mode: "full" }, signal);
  await assert.rejects(saveCredential("invalid", false));
  assert.ok((await readCredential()) === first);
  expected = second;
  await saveCredential(second, false);
  await requestDesign(
    { mock: false, target: "invite_page", mode: "block" },
    signal,
  );
  await assert.rejects(requestDesign({ mock: false }, AbortSignal.abort()), {
    name: "AbortError",
  });
  await clearCredential("temporary");
  await assert.rejects(requestDesign({ mock: false }, signal), /AI 配置/);
  assert.equal(fetch.mock.callCount(), 2);
});

test("failed persistent writes do not report success or silently remember a secret in memory", async () => {
  await assert.rejects(saveCredential(randomUUID(), true), /未能保存/);
  assert.equal(await credentialStatus(), "unavailable");
  await assert.rejects(readCredential(), /AI 配置/);
});

test("without IndexedDB persistent storage fails explicitly and temporary use remains available", async (t) => {
  const fakeWindow = new EventTarget();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    value: fakeWindow,
    configurable: true,
  });
  t.after(async () => {
    await clearCredential("temporary");
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });

  assert.equal(await credentialStatus(), "unavailable");
  const secret = randomUUID();
  await assert.rejects(saveCredential(secret, true), /未能保存/);
  await saveCredential(secret, false);
  assert.equal(await credentialStatus(), "temporary");
  assert.equal(await readCredential(), secret);
  await clearCredential("temporary");
  assert.equal(await credentialStatus(), "unavailable");
  await assert.rejects(readCredential(), /AI 配置/);
});
