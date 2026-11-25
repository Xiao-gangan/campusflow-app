import { BROWSER_DEMO } from "./mode.ts";

export async function demoFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (!BROWSER_DEMO) return fetch(url, options);
  const { browserDemoRuntime } = await import("./transport.ts");
  return browserDemoRuntime().request(url, options);
}
