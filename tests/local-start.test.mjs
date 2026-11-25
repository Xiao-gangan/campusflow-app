import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("one local server provides AI, persisted recruitment, and Open API with SMTP isolated", async (t) => {
  const state = await mkdtemp(join(tmpdir(), "campusflow-start-"));
  process.env.CAMPUSFLOW_RSVP_DB = join(state, "workspace.sqlite");
  process.env.AI_MOCK_DELAY = "0";
  const server = await createServer({
    mode: "rsvp-demo",
    cacheDir: join(state, "vite-cache"),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: "127.0.0.1", port: 0 },
  });
  t.after(() => server.close());
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const local = { Origin: base, "X-CampusFlow-Demo": "1" };
  const get = async (path, headers = {}) => {
    const response = await fetch(base + path, { headers });
    assert.equal(response.status, 200, path);
    return response.json();
  };
  const roster = await get("/api/local-demo/recruitment/candidates", local);
  assert.ok(roster.data.length > 0);
  const api = await get("/api/open/v1/openapi.json");
  assert.ok(api.openapi);
  const mode = await get("/api/local-demo/mail/smtp-test-mode", local);
  assert.equal(mode.data.mode, "synthetic");
  const ai = (origin) => fetch(base + "/functions/v1/app/api/ai/design", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ requestId: "test-local-server-1", mode: "full", prompt: "正式面试邀请", mock: true }),
  });
  const generated = await ai(base);
  assert.equal(generated.status, 200);
  assert.match(await generated.text(), /event: generation-completed/u);
  assert.equal((await ai("https://other.example.test")).status, 403);
});

test("the overview shows a safe source link only in browser demo mode", async () => {
  const loadOverview = async (mode) => {
    const vite = await createServer({
      mode,
      cacheDir: await mkdtemp(join(tmpdir(), "campusflow-overview-")),
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true, ws: false },
    });
    try {
      const page = await vite.ssrLoadModule("/src/pages/OverviewPage.tsx");
      return renderToStaticMarkup(createElement(page.default));
    } finally {
      await vite.close();
    }
  };
  globalThis.window = { localStorage: { getItem: () => null } };
  try {
    assert.doesNotMatch(await loadOverview("rsvp-demo"), /当前为在线演示版/u);
    const online = await loadOverview("production");
    assert.match(online, /当前为在线演示版/u);
    assert.match(online, /href="https:\/\/github\.com\/Xiao-gangan\/campusflow-app" target="_blank" rel="noopener noreferrer"/u);
  } finally {
    delete globalThis.window;
  }
});
