import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultDocument, setEmailMode, updateCustomHtml } from "../shared/domain/design.ts";
import { renderDesignEmail } from "../shared/email/design-renderer.ts";
import {
  STARTER_FREE_EMAIL_HTML,
  STARTER_FREE_INVITE_HTML,
  buildExternalAiPromptTemplate,
  inspectEmailHtmlVariables,
  sanitizeEmailHtml,
} from "../shared/email/free-html.ts";
import {
  readDesignerDraft,
  writeDesignerDraft,
} from "../shared/design/draft.ts";
import { handleAiDesignRequest } from "../shared/ai/server.ts";

test("sanitizeEmailHtml strips unsafe tags, scripts, event handlers, bad URLs and risky CSS while preserving table layout", () => {
  const dirty = `<!doctype html><html><head><style>body{background:url(https://evil.test/track.png)}</style></head><body style="background-color:#f1eeeb"><script>alert(1)</script><iframe src="https://evil.test"></iframe><form action="https://evil.test"><input /></form><table width="600" style="border-top:1px solid #c7b8ae;position:fixed;background:url(https://evil.test/p.png)"><tr><td onclick="evil()" style="color:#241b19">你好 {{candidate_name}}<a href="javascript:alert(1)">坏链接</a><a href="{{rsvp_link}}" target="_blank">开启邀请函</a></td></tr></table></body></html>`;

  const result = sanitizeEmailHtml(dirty);
  assert.doesNotMatch(result.html, /<script|<iframe|<form|<input|<style/iu);
  assert.doesNotMatch(result.html, /onclick=|javascript:|position:|url\(/iu);
  assert.match(result.html, /border-top:1px solid #c7b8ae/);
  assert.match(result.html, /href="\{\{rsvp_link\}\}"/);
  assert.match(result.html, /rel="noopener noreferrer"/);
  assert.ok(result.warnings.length > 0);
});

test("inspectEmailHtmlVariables identifies known variables, unknown keys and invite link binding", () => {
  const inspection = inspectEmailHtmlVariables(
    `<a href="{{rsvp_link}}">Hi {{candidate_name}} {{unknown_field}}</a>`,
  );
  assert.deepEqual(
    inspection.knownVariables.map((item) => item.key).sort(),
    ["candidate_name", "rsvp_link"],
  );
  assert.deepEqual(inspection.unknownVariables, ["unknown_field"]);
  assert.equal(inspection.hasInviteLink, true);
  assert.equal(inspection.hasOnboardingLink, false);
});

test("renderDesignEmail renders free HTML mode with font override, HTML-escaped variables, and safe link substitution", () => {
  let doc = createDefaultDocument("email");
  doc = setEmailMode(doc, "html", STARTER_FREE_EMAIL_HTML);
  doc = updateCustomHtml(doc, { fontFamily: "serif" });

  const rendered = renderDesignEmail(doc, {
    organization_name: "深大校友会",
    department: "技术部",
    candidate_name: "林<script>知夏",
    interview_time: "11月20日 19:00",
    interview_location: "致工楼 B201",
    personal_note: "请提前 10 分钟到达。",
    rsvp_link: "https://example.test/invite/abc123",
  });

  assert.match(rendered.html, /Songti SC/);
  assert.match(rendered.html, /林&lt;script&gt;知夏/);
  assert.doesNotMatch(rendered.html, /<script>知夏/);
  assert.match(rendered.html, /href="https:\/\/example\.test\/invite\/abc123"/);
  assert.match(rendered.text, /开启我的邀请函/);
  assert.match(rendered.text, /https:\/\/example\.test\/invite\/abc123/);

  const badLink = renderDesignEmail(doc, {
    candidate_name: "林知夏",
    rsvp_link: "javascript:alert(1)",
  });
  assert.doesNotMatch(badLink.html, /javascript:alert/iu);
  assert.ok(badLink.warnings.some((item) => item.includes("不受支持")));
});

test("draft storage preserves both free HTML mode and existing blocks without data loss", () => {
  const map = new Map();
  const storage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  };

  let doc = createDefaultDocument("email");
  const originalBlockCount = doc.blocks.length;
  doc = setEmailMode(doc, "html", STARTER_FREE_EMAIL_HTML);
  doc = updateCustomHtml(doc, { fontFamily: "mono", source: "import" });

  const write = writeDesignerDraft(storage, "email", doc);
  assert.equal(write.ok, true);

  const read = readDesignerDraft(storage, "email");
  assert.equal(read.status, "ok");
  assert.equal(read.document.mode, "html");
  assert.equal(read.document.customHtml?.fontFamily, "mono");
  assert.equal(read.document.customHtml?.source, "import");
  assert.equal(read.document.blocks.length, originalBlockCount);
});

test("handleAiDesignRequest supports mode html with sanitization, refinement and target guard", async () => {
  const mockReq = new Request("http://127.0.0.1/api/ai/design", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: "html-req-0001",
      mode: "html",
      target: "email",
      prompt: "帮我设计一封深松绿信笺风格的技术部面试邀请",
      mock: true,
    }),
  });
  const res = await handleAiDesignRequest(mockReq, { allowMock: true });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.requestId, "html-req-0001");
  assert.match(body.result.html, /#1d4d3e/i);
  assert.match(body.result.html, /\{\{rsvp_link\}\}/);

  const inviteReq = new Request("http://127.0.0.1/api/ai/design", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: "html-req-0002",
      mode: "html",
      target: "invite_page",
      prompt: "设计一张深藏青科技编辑风邀请函网页",
      mock: true,
    }),
  });
  const inviteRes = await handleAiDesignRequest(inviteReq, { allowMock: true });
  assert.equal(inviteRes.status, 200);
  const inviteBody = await inviteRes.json();
  assert.match(inviteBody.result.html, /#1c3f60/i);
  assert.match(inviteBody.result.html, /\{\{candidate_name\}\}/);
  assert.doesNotMatch(inviteBody.result.html, /<form|<script/iu);
});

test("buildExternalAiPromptTemplate embeds CampusFlow variables and security constraints for both email and invite_page", () => {
  const emailPrompt = buildExternalAiPromptTemplate("校园音乐节志愿面试邀请", "email");
  assert.match(emailPrompt, /校园音乐节志愿面试邀请/);
  assert.match(emailPrompt, /\{\{candidate_name\}\}/);
  assert.match(emailPrompt, /\{\{rsvp_link\}\}/);
  assert.match(emailPrompt, /<script>/);

  const invitePrompt = buildExternalAiPromptTemplate("校友会二面邀请函", "invite_page");
  assert.match(invitePrompt, /校友会二面邀请函/);
  assert.match(invitePrompt, /\{\{candidate_name\}\}/);
  assert.match(invitePrompt, /系统自动挂载/);
  assert.match(STARTER_FREE_INVITE_HTML, /\{\{interview_time\}\}/);
});
