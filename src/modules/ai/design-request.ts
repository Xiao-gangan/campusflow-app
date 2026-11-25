import { BROWSER_DEMO } from "../browser-demo/mode.ts";
import { readActiveCredential, readCredential } from "./credentials.ts";
import type { AiProviderId } from "../../../shared/ai/providers.ts";

const ENDPOINT = "/functions/v1/app/api/ai/design";

export async function requestDesign(
  body: Record<string, unknown> & { mock: boolean },
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (BROWSER_DEMO) return mockDesign(body, signal);
  const headers = new Headers({ "Content-Type": "application/json" });
  let outgoing = body;
  if (!body.mock) {
    const credential = await readActiveCredential();
    headers.set("Authorization", `Bearer ${credential.apiKey}`);
    outgoing = {
      ...body,
      provider: credential.provider,
      model: credential.model,
    };
  }
  signal.throwIfAborted();
  return fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(outgoing),
    signal,
    cache: "no-store",
    redirect: "error",
  });
}

export async function requestAiConnectionTest(
  provider: AiProviderId,
  model: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (BROWSER_DEMO) return mockDesign({ mode: "test", requestId: crypto.randomUUID(), target: "email", provider, model }, signal);
  const apiKey = await readCredential(provider);
  signal.throwIfAborted();
  return fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      mode: "test",
      provider,
      model,
      target: "email",
      mock: false,
    }),
    signal,
    cache: "no-store",
    redirect: "error",
  });
}

async function mockDesign(body: Record<string, unknown>, signal: AbortSignal) {
  const { handleAiDesignRequest } = await import("../../../shared/ai/server.ts");
  return handleAiDesignRequest(new Request(new URL(ENDPOINT, window.location.origin), {
    method: "POST", signal,
    body: JSON.stringify({ ...body, mock: true }),
  }), { allowMock: true });
}
