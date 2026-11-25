import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openAgentStore } from "../dev/open-api/store.ts";
import { offerRoundTemplates, presetRoundTemplates, savedOfferPresets, savedTemplatePresets } from "../dev/open-api/template-presets.ts";
import { renderAgentTemplate } from "../dev/open-api/templates.ts";
import { openRsvpStore } from "../dev/rsvp/store.ts";
import { sampleVariableValues } from "../shared/design/variables.ts";
import { isDesignDocument } from "../shared/design/draft.ts";
import { sanitizeEmailHtml, sanitizeInlineStyle } from "../shared/email/free-html.ts";
import { createDesignLibrary } from "../src/modules/designer/local-library.ts";

const legacy = JSON.parse(readFileSync(new URL("./fixtures/phase5-simple-email.json", import.meta.url), "utf8"));
const all = () => [...savedTemplatePresets(), ...savedOfferPresets()];
const bindings = [...presetRoundTemplates, ...offerRoundTemplates];

test("invitation HTML permits same-origin preset art and safe modern inline layout while email retains its existing policy", () => {
  const path = "/presets/invitation-autumn-envelope.webp";
  const style = `background-image:url('${path}');background-size:cover;background-position:center;background-repeat:no-repeat;min-height:480px;aspect-ratio:3/4;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);flex-direction:column;align-items:center;justify-content:center;gap:clamp(8px,2vw,20px);box-shadow:0 2px 16px rgba(0,0,0,.1);backdrop-filter:blur(4px);border-radius:12px;text-wrap:balance;font-variant-numeric:tabular-nums;transform:rotate(-2deg) translate(2px,4%);`;
  const raw = `<div style="${style}"><img src="${path}" alt="纸面"></div>`;
  const invite = sanitizeEmailHtml(raw, { target: "invite_page" });
  assert.deepEqual(invite.warnings, []);
  assert.match(invite.html, /background-image:url\(&quot;\/presets\/invitation-autumn-envelope.webp&quot;\)/u);
  assert.match(invite.html, /<img src="\/presets\/invitation-autumn-envelope.webp"/u);
  for (const property of ["aspect-ratio", "grid-template-columns", "clamp(", "box-shadow", "backdrop-filter", "transform:rotate"]) assert.ok(invite.html.includes(property));
  assert.equal(sanitizeEmailHtml(invite.html, { target: "invite_page" }).html, invite.html);
  assert.doesNotMatch(sanitizeEmailHtml(raw).html, /\/presets\//u);
});

test("invitation HTML rejects arbitrary CSS sources, invalid transforms, traversal, unsafe schemes and scripts", () => {
  for (const declaration of ["background-image:url(https://example.test/photo.jpg)", "background-image:url(/presets/../photo.jpg)",
    "background-image:url(/presets/photo.webp?size=2)", "background-image:url(/presets/photo.svg)", "background-image:image-set('https://example.test/photo.jpg' 1x)",
    "background-image:url(/presets/photo.webp),none", "background-image:url(javascript:void(0))", "width:expression(0)",
    "transform:scale(2)", "position:fixed", "@import:url(https://example.test/design.css)"]) {
    const result = sanitizeInlineStyle(declaration, "invite_page");
    assert.equal(result.style, "", declaration);
    assert.equal(result.stripped, true, declaration);
  }
  const cleaned = sanitizeEmailHtml(`<script>ignored</script><style>@import 'https://example.test/m.css';</style>
    <img src="/presets/../photo.jpg" onload="ignored"><img src="javascript:void(0)"><div>正文</div>`, { target: "invite_page" });
  assert.doesNotMatch(cleaned.html, /<script|<style|onload|javascript:|\/presets\/|ignored/u);
  assert.match(cleaned.html, /正文/u);
});

test("all eight redesigned presets validate, render their variables and use the three bundled WebP assets only in web invitations", () => {
  const presets = all();
  assert.equal(presets.length, 8);
  assert.equal(new Set(presets.map(({ id }) => id)).size, 8);
  assert.equal(presets.filter(({ document }) => document.target === "email").length, 4);
  assert.equal(presets.filter(({ document }) => document.mode === "blocks").length, 2);
  for (const { name, document, warnings } of presets) {
    assert.ok(isDesignDocument(document, document.target), name);
    assert.deepEqual(warnings, [], name);
    assert.doesNotMatch(JSON.stringify(document), /深圳大学|深大相见|校友会|校友活动|CCTEAA|AT SZU/u);
    const result = renderAgentTemplate(document, sampleVariableValues());
    assert.deepEqual(result.missingVariables, [], name);
    assert.deepEqual(result.warnings, [], name);
    assert.ok(result.html.length > 300 && result.text.length > 10, name);
    assert.doesNotMatch(result.html, /\{\{/u, name);
    if (document.target === "email") assert.doesNotMatch(result.html, /\/presets\//u, name);
    if (document.target === "invite_page" && document.mode === "html") assert.match(result.html, /\/presets\/[a-z0-9-]+\.webp/u, name);
  }
  for (const asset of ["invitation-autumn-envelope", "invitation-pine-waxseal", "invitation-forest-envelope"]) {
    const bytes = readFileSync(new URL(`../public/presets/${asset}.webp`, import.meta.url));
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.ok(bytes.length >= 150 * 1024 && bytes.length <= 260 * 1024, asset);
  }
});

test("stored legacy presets upgrade in place, explicit restore keeps customized templates and never duplicates the new set", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "campusflow-featured-")), "workspace.sqlite");
  let date = new Date("2026-11-22T00:00:00Z");
  const roster = openRsvpStore(file, () => date);
  const store = openAgentStore(file, () => date);
  try {
    store.initializeTemplatePresets(() => [legacy], []);
    const oldDate = store.requireTemplate(legacy.id).createdAt;
    const customized = all()[0];
    const customDoc = { ...customized.document, meta: { ...customized.document.meta, subjectTemplate: "自定邮件主题" } };
    store.writeTemplate(customized.id, { name: "自定邀请邮件", document: customDoc }, "create");
    const custom = store.requireTemplate(customized.id);
    const myId = "e63833a0-62b2-4b73-a789-a376f7cf86fd";
    store.writeTemplate(myId, { name: "另存模板", document: customDoc }, "create");
    date = new Date("2026-11-24T00:00:00Z");
    assert.deepEqual(store.updateFeaturedPresets(all(), bindings, false), { added: 0, updated: 1 });
    assert.equal(store.requireTemplate(legacy.id).createdAt, oldDate);
    assert.notEqual(store.requireTemplate(legacy.id).document.theme.backgroundColor, legacy.document.theme.backgroundColor);
    assert.deepEqual(store.requireTemplate(customized.id), custom);
    assert.deepEqual(store.updateFeaturedPresets(all(), bindings, true), { added: 7, updated: 0 });
    assert.deepEqual(store.updateFeaturedPresets(all(), bindings, true), { added: 0, updated: 0 });
    assert.deepEqual(store.requireTemplate(customized.id), custom);
    assert.equal(store.requireTemplate(myId).name, "另存模板");
    assert.equal(store.listTemplates().length, 10);
    for (const binding of bindings) {
      const round = roster.rounds.requireRound(binding.roundId);
      assert.equal(round.defaultInviteTemplateId, binding.inviteId);
      assert.equal(round.defaultEmailTemplateId, binding.emailId);
    }
  } finally { store.close(); roster.close(); }
});

test("browser-only library upgrades unchanged records and explicitly restores the featured set", async () => {
  const timestamp = "2026-11-22T00:00:00Z";
  const values = new Map([["campusflow.designer.templates.v1", JSON.stringify([
    { ...legacy, target: "email", schemaVersion: 1, origin: "manual", createdAt: timestamp, updatedAt: timestamp },
  ])]]);
  const library = createDesignLibrary({ getItem: (id) => values.get(id) ?? null, setItem: (id, value) => values.set(id, value) });
  await library.refreshTemplates();
  assert.notEqual(library.listTemplates()[0].document.theme.backgroundColor, legacy.document.theme.backgroundColor);
  assert.deepEqual(await library.updateFeaturedPresets(), { added: 7, updated: 0 });
  assert.deepEqual(await library.updateFeaturedPresets(), { added: 0, updated: 0 });
  assert.equal(library.listTemplates().length, 8);
});
