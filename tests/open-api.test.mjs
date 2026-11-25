import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { rsvpMiddleware } from "../dev/rsvp/plugin.ts";
import { openRsvpStore } from "../dev/rsvp/store.ts";
import { openSmtpAccountStore } from "../dev/recruitment/smtp-store.ts";
import { openSmtpSecretVault } from "../dev/recruitment/smtp-secrets.ts";
import { openAgentStore } from "../dev/open-api/store.ts";
import { createDefaultDocument } from "../shared/domain/design.ts";
import { createDesignLibrary } from "../src/modules/designer/local-library.ts";

const management = "/api/local-demo";
const apiPrefix = "/api/open/v1";
const templateScopes = ["templates:read", "templates:write"];

async function fixture(t) {
  const file = join(mkdtempSync(join(tmpdir(), "campusflow-agent-")), "workspace.sqlite");
  const agent = openAgentStore(file);
  const roster = openRsvpStore(file);
  const server = createServer(rsvpMiddleware(() => roster, undefined, undefined, () => agent));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    agent.close();
    roster.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(prefix, path, { method = "GET", body, secret, admin = false } = {}) {
    const response = await fetch(origin + prefix + path, {
      method,
      headers: {
        ...(admin ? { Origin: origin, "X-CampusFlow-Demo": "1" } : {}),
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  const local = (path, opts) => request(management, path, { ...opts, admin: true });
  const open = (path, opts) => request(apiPrefix, path, opts);
  async function key(scopes, name = "测试 Agent") {
    const result = await local("/open-api/keys", { method: "POST", body: { name, scopes } });
    assert.equal(result.status, 200);
    return result.body.data;
  }
  return { open, local, key, request, file, roster };
}

test("OpenAPI discovery is public, management is same-origin and a revoked key cannot be reused", async (t) => {
  const f = await fixture(t);
  const discovery = await f.open("/openapi.json");
  assert.equal(discovery.status, 200);
  assert.equal(discovery.body.openapi, "3.1.0");
  assert.deepEqual(discovery.body.paths["/templates"].post["x-required-scopes"], ["templates:write"]);
  assert.equal(discovery.body.paths["/templates/{id}/render"].post.requestBody.content["application/json"].schema.$ref,
    "#/components/schemas/RenderInput");
  assert.ok(discovery.body.components.schemas.TemplateInput.examples.length >= 2);

  assert.equal((await f.open("/templates")).status, 401);
  assert.match((await f.open("/templates")).headers.get("www-authenticate"), /^Bearer/);
  assert.equal((await f.request(management, "/open-api/keys")).status, 403);

  const key = await f.key(["templates:read"]);
  assert.match(key.secret, /^cf_open_[a-f0-9]{64}$/);
  assert.equal(key.lastUsedAt, null);
  const db = new DatabaseSync(f.file);
  try {
    const row = db.prepare("SELECT * FROM open_api_keys WHERE id=?").get(key.id);
    assert.equal(row.hash, createHash("sha256").update(key.secret).digest("hex"));
    assert.equal(JSON.stringify(row).includes(key.secret), false);
  } finally { db.close(); }

  const list = (await f.local("/open-api/keys")).body.data;
  assert.deepEqual(list, [Object.fromEntries(Object.entries(key).filter(([name]) => name !== "secret"))]);
  assert.equal((await f.open("/templates", { secret: key.secret })).status, 200);
  assert.ok((await f.local("/open-api/keys")).body.data[0].lastUsedAt);
  assert.equal((await f.open("/templates", { secret: key.secret, method: "POST", body: {} })).status, 403);
  assert.equal((await f.open("/candidates", { secret: key.secret })).status, 403);
  assert.equal((await f.local("/open-api/keys", { method: "POST", body: { name: "不受支持", scopes: ["mail:send"] } })).status, 400);
  const revoked = await f.local(`/open-api/keys/${key.id}`, { method: "DELETE" });
  assert.ok(revoked.body.data.revokedAt);
  assert.equal(Object.hasOwn(revoked.body.data, "secret"), false);
  assert.equal((await f.open("/templates", { secret: key.secret })).status, 401);
});

test("Agent CRUD handles native blocks and safe free HTML, with target and protected variable validation", async (t) => {
  const f = await fixture(t);
  const { secret } = await f.key(templateScopes);
  const create = (name, document) => f.open("/templates", { method: "POST", secret, body: { name, document } });
  const blocks = createDefaultDocument("email");
  const added = await create("积木面试模板", blocks);
  assert.equal(added.status, 201);
  const template = added.body.data;
  const item = `/templates/${template.id}`;
  assert.equal(template.document.blocks.length, blocks.blocks.length);
  assert.equal((await f.open(item, { secret })).body.data.name, "积木面试模板");

  const html = { ...createDefaultDocument("invite_page"), mode: "html",
    customHtml: { source: "import", html: '<script>removed</script><p onclick="removed">您好 {{candidate_name}}</p><a href="javascript:removed">示例</a>' },
  };
  const invite = await create("邀请函 HTML", html);
  assert.equal(invite.status, 201);
  assert.ok(invite.body.warnings.length > 0);
  assert.doesNotMatch(invite.body.data.document.customHtml.html, /<script|onclick|javascript:/iu);
  const invitePath = `/templates/${invite.body.data.id}`;
  const checked = await f.open(invitePath, { secret, method: "PUT", body: {
    name: "邀请函已更新", document: { ...html, customHtml: { html: "<h1>更新后的邀请 {{candidate_name}}</h1>" } },
  } });
  assert.equal(checked.status, 200);
  assert.equal(checked.body.data.name, "邀请函已更新");
  assert.equal((await f.open(item, { secret, method: "PUT", body: { name: "积木已更新", document: blocks } })).status, 200);
  const listed = (await f.open("/templates?target=invite_page", { secret })).body.data;
  assert.deepEqual(listed.map((row) => row.name), ["邀请函已更新"]);
  assert.equal((await f.open("/templates?target=bad", { secret })).status, 400);
  assert.equal((await create("无效目标", { ...blocks, target: "draft" })).status, 400);
  assert.equal((await create("应用端保留的链接", { ...html, customHtml: { html: '<a href="https://example.test/?invite={{rsvp_link}}">链接</a>' } })).status, 400);
  assert.equal((await create("越目标变量", { ...html, customHtml: { html: "<p>{{onboarding_link}}</p>" } })).status, 400);
  assert.equal((await create("无可用内容", { ...html, customHtml: { html: "<script>only script</script>" } })).status, 400);

  const rendered = await f.open(invitePath + "/render", {
    method: "POST", secret, body: { variables: { candidate_name: '林 <夏>' } },
  });
  assert.match(rendered.body.data.html, /林 &lt;夏&gt;/u);
  assert.match(rendered.body.data.text, /林 <夏>/u);
  assert.deepEqual(rendered.body.data.missingVariables, []);
  const withCss = await create("变量样式净化", {
    ...html, customHtml: { html: '<p style="color:{{personal_note}}">安全预览</p>' },
  });
  const cssRender = await f.open(`/templates/${withCss.body.data.id}/render`, {
    method: "POST", secret, body: { variables: { personal_note: "red;background:url(https://example.test/sample.png)" } },
  });
  assert.match(cssRender.body.data.html, /color:red/u);
  assert.doesNotMatch(cssRender.body.data.html, /url\(|example\.test\/sample/);
  assert.ok(cssRender.body.data.warnings.length);
  const noValues = await f.open(item + "/render", { method: "POST", secret, body: { variables: {} } });
  assert.ok(noValues.body.data.missingVariables.includes("candidate_name"));
  assert.ok(noValues.body.data.warnings.some((warning) => warning.includes("candidate_name")));
  assert.equal((await f.open(invitePath, { method: "DELETE", secret })).status, 200);
  assert.equal((await f.open(invitePath, { secret })).status, 404);
});

test("Open API roster returns a read-only summary and candidate rendering requires both scopes", async (t) => {
  const f = await fixture(t);
  const read = await f.key(["templates:read"]);
  const full = await f.key([...templateScopes, "recruitment:read"]);
  const smtp = openSmtpAccountStore(f.file, openSmtpSecretVault(f.file, {}));
  t.after(() => smtp.close());
  const syntheticCredential = "smtp-synthetic-" + crypto.randomUUID();
  const savedMailbox = smtp.create({
    provider: "qq", label: "合成账号", fromName: "招新组",
    fromEmail: "private-mailbox@example.test", credential: syntheticCredential,
  });
  assert.equal(smtp.readSecret(savedMailbox.id), syntheticCredential);
  const first = f.roster.listCandidates()[0];
  const preset = createDefaultDocument("invite_page");
  const issued = await f.roster.issue(preset, new Date(Date.now() + 2e6).toISOString(), first);
  const invite = await f.roster.view(issued.token);
  await f.roster.respond(issued.token, "attending", invite.version);
  const result = await f.open("/candidates", { secret: full.secret });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.find((row) => row.id === first.id).latestRsvp.status, "confirmed");
  assert.doesNotMatch(JSON.stringify(result.body), /token|rsvpUrl|credential|secret|smtp|apiKey/iu);
  assert.ok(!JSON.stringify(result.body).includes(syntheticCredential));
  assert.ok(!JSON.stringify(result.body).includes(savedMailbox.fromEmail));
  assert.equal((await f.open("/candidates", { secret: full.secret, method: "POST", body: {} })).status, 405);
  for (const path of ["/smtp-accounts", "/ai/config", "/mail/batches", "/open-api/keys"]) {
    assert.equal((await f.open(path, { secret: full.secret })).status, 404);
  }
  assert.equal((await f.request(management, "/open-api/keys", { secret: full.secret })).status, 403);

  const template = (await f.open("/templates", { method: "POST", secret: full.secret,
    body: { name: "候选人渲染", document: createDefaultDocument("email") } })).body.data;
  const render = `/templates/${template.id}/render`;
  assert.equal((await f.open(render, { method: "POST", secret: read.secret, body: { candidateId: first.id } })).status, 403);
  const html = await f.open(render, { method: "POST", secret: full.secret, body: { candidateId: first.id } });
  assert.match(html.body.data.subject, new RegExp(first.name, "u"));
  assert.equal(html.body.data.html.includes(issued.token), false);
});

test("browser template replica imports local templates, reads agent changes and syncs saved work after reconnecting", async (t) => {
  const f = await fixture(t);
  const { secret } = await f.key(templateScopes);
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const document = createDefaultDocument("email");
  const legacy = createDesignLibrary(storage).saveTemplate({ name: "已有本机模板", document });
  let online = true;
  async function api(path, opts) {
    if (!online) throw new Error("offline");
    const result = await f.local(path, opts);
    if (result.status !== 200) throw new Error("sync failed");
    return result.body.data;
  }
  const transport = {
    list: () => api("/templates"),
    put: (template, initialImport) => api(`/templates/${template.id}${initialImport ? "?import=1" : ""}`, {
      method: "PUT", body: { name: template.name, document: template.document, origin: template.origin },
    }),
    remove: (id) => api(`/templates/${id}`, { method: "DELETE" }),
  };
  const browser = createDesignLibrary(storage, transport);
  await browser.refreshTemplates();
  assert.equal((await f.open(`/templates/${legacy.id}`, { secret })).status, 200);
  const added = (await f.open("/templates", { method: "POST", secret, body: { name: "Agent 写入", document } })).body.data;
  await browser.refreshTemplates();
  assert.ok(browser.listTemplates().some((row) => row.id === added.id));
  await f.open(`/templates/${added.id}`, { method: "PUT", secret, body: { name: "Agent 修改", document } });
  await browser.refreshTemplates();
  assert.equal(browser.listTemplates().find((row) => row.id === added.id).name, "Agent 修改");
  await f.open(`/templates/${added.id}`, { method: "DELETE", secret });
  await browser.refreshTemplates();
  assert.ok(browser.listTemplates().every((row) => row.id !== added.id));

  online = false;
  const offline = browser.saveTemplate({ name: "离线保存", document });
  await browser.refreshTemplates();
  const reopened = createDesignLibrary(storage, transport);
  assert.ok(reopened.listTemplates().some((row) => row.id === offline.id));
  online = true;
  await reopened.refreshTemplates();
  assert.equal((await f.open(`/templates/${offline.id}`, { secret })).body.data.name, "离线保存");

  const reopenedServer = openAgentStore(f.file);
  try {
    assert.equal(reopenedServer.requireTemplate(offline.id).name, "离线保存");
    assert.ok(reopenedServer.authorize(`Bearer ${secret}`, "templates:read"));
  } finally { reopenedServer.close(); }
});
