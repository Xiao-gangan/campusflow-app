import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openAgentStore } from "../dev/open-api/store.ts";
import { presetRoundTemplates, savedTemplatePresets } from "../dev/open-api/template-presets.ts";
import { renderAgentTemplate } from "../dev/open-api/templates.ts";
import { previewMail } from "../dev/recruitment/api.ts";
import { candidateContext } from "../dev/recruitment/mail.ts";
import { openRsvpStore } from "../dev/rsvp/store.ts";
import { isDesignDocument } from "../shared/design/draft.ts";
import { sampleVariableValues } from "../shared/design/variables.ts";
import { renderFreeEmailHtml } from "../shared/email/free-html.ts";
import { buildInvitePage } from "../shared/invite/model.ts";

const file = () => join(mkdtempSync(join(tmpdir(), "campusflow-template-presets-")), "workspace.sqlite");

test("all six complete presets pass schema and render the expected candidate variables", () => {
  const presets = savedTemplatePresets();
  assert.equal(new Set(presets.map(({ id }) => id)).size, 6);
  assert.equal(new Set(presets.map(({ name }) => name)).size, 6);
  for (const target of ["email", "invite_page"]) {
    assert.deepEqual(presets.filter((item) => item.document.target === target).map(({ document }) => document.mode), ["html", "html", "blocks"]);
  }
  const roster = openRsvpStore(":memory:");
  try {
    const candidate = roster.listCandidates()[0];
    const testLink = "https://example.test/signed-invitation";
    const context = candidateContext(candidate, testLink, "青禾组织");
    const invite = presets.find(({ document }) => document.target === "invite_page").document;
    for (const { document, warnings } of presets) {
      assert.equal(isDesignDocument(document, document.target), true);
      assert.deepEqual(warnings, []);
      assert.doesNotMatch(JSON.stringify(document), /深圳大学|星海大学|Xiao-gangan|light-shadow/u);
      const rendered = renderAgentTemplate(document, context);
      assert.deepEqual(rendered.missingVariables, []);
      assert.match(rendered.text, /青禾组织/u);
      assert.ok(rendered.text.includes(candidate.name));
      assert.ok(rendered.text.includes(candidate.interviewDate));
      assert.ok(rendered.text.includes(candidate.location));
      if (document.target === "email") {
        assert.ok(rendered.html.includes(`href="${testLink}"`));
        const preview = previewMail(roster, {
          candidateIds: [candidate.id], emailDocument: document, inviteDocument: invite,
          organizationName: context.organization_name, expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        }, "http://127.0.0.1:5378");
        assert.equal(preview.eligible, 1, preview.items.flatMap(({ issues }) => issues).join(" "));
      }
    }
  } finally { roster.close(); }
  for (const field of ["interview_date", "start_time", "end_time", "location"])
    assert.ok(sampleVariableValues()[field]);
});

test("default associations and preset writes initialize once and preserve user edits and deletions across reopen", () => {
  const filename = file();
  const roster = openRsvpStore(filename);
  let agent = openAgentStore(filename);
  try {
    assert.equal(agent.listTemplates().length, 0);
    agent.initializeTemplatePresets(savedTemplatePresets, presetRoundTemplates);
    assert.equal(agent.listTemplates().length, 6);
    for (const { roundId, emailId, inviteId } of presetRoundTemplates) {
      const round = roster.rounds.requireRound(roundId);
      assert.equal(round.defaultEmailTemplateId, emailId);
      assert.equal(round.defaultInviteTemplateId, inviteId);
    }
    const [edited, deleted] = savedTemplatePresets();
    agent.writeTemplate(edited.id, { ...edited, name: "我的修订稿" }, "replace");
    agent.deleteTemplate(deleted.id, true);
    agent.close();
    agent = openAgentStore(filename);
    agent.initializeTemplatePresets(savedTemplatePresets, presetRoundTemplates);
    assert.equal(agent.requireTemplate(edited.id).name, "我的修订稿");
    assert.equal(agent.templateExists(deleted.id), false);
    for (const template of agent.listTemplates()) agent.deleteTemplate(template.id, true);
    agent.initializeTemplatePresets(savedTemplatePresets, presetRoundTemplates);
    assert.equal(agent.listTemplates().length, 0);
  } finally { agent.close(); roster.close(); }
});

test("existing libraries remain intact and a failed first seed leaves no partial preset or marker", () => {
  const filename = file();
  const roster = openRsvpStore(filename);
  const store = openAgentStore(filename);
  try {
    const preset = savedTemplatePresets()[0];
    assert.throws(() => store.initializeTemplatePresets(() => [preset, preset], presetRoundTemplates), /UNIQUE/u);
    assert.equal(store.listTemplates().length, 0);
    assert.equal(roster.rounds.requireRound("round-1").defaultEmailTemplateId, null);
    const user = store.writeTemplate(crypto.randomUUID(), { name: "已有模板", document: preset.document }, "create");
    store.initializeTemplatePresets(savedTemplatePresets, presetRoundTemplates);
    assert.deepEqual(store.listTemplates().map(({ id }) => id), [user.id]);
    assert.equal(roster.rounds.requireRound("round-1").defaultEmailTemplateId, null);
    store.deleteTemplate(user.id, true);
    store.initializeTemplatePresets(savedTemplatePresets, presetRoundTemplates);
    assert.equal(store.listTemplates().length, 0);
  } finally { store.close(); roster.close(); }
});

test("signed invitations use issued organization and schedule while retaining native RSVP", async () => {
  const store = openRsvpStore(":memory:");
  try {
    const candidate = store.listCandidates()[0];
    const expires = new Date(Date.now() + 86_400_000).toISOString();
    const invitations = savedTemplatePresets().filter(({ document }) => document.target === "invite_page");
    for (const { document } of invitations) {
      const { token } = await store.issue(document, expires, candidate, "round-1", "青禾组织");
      const view = await store.view(token);
      assert.equal(view.context.organization_name, "青禾组织");
      assert.equal(view.context.interview_date, candidate.interviewDate);
      assert.equal(view.context.start_time, candidate.startTime);
      assert.equal(view.context.end_time, candidate.endTime);
      assert.equal(view.context.location, candidate.location);
      if (document.mode === "html") {
        const rendered = renderFreeEmailHtml(view.document, view.context);
        assert.deepEqual(rendered.missingVariables, []);
        assert.ok(rendered.html.includes("青禾组织"));
      } else {
        const page = buildInvitePage(view.document, view.context);
        assert.ok(page.sections.some(({ kind }) => kind === "rsvp"));
      }
      assert.equal((await store.respond(token, "attending", view.version)).rsvpStatus, "confirmed");
    }
  } finally { store.close(); }
});
