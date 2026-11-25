import test from "node:test";
import assert from "node:assert/strict";
import {
  BUTTON_LINK_ACTIONS,
  buttonLinkActionById,
  buttonLinkNeedsUrl,
  buttonLinkPurpose,
  buttonLinkValue,
} from "../shared/design/button-links.ts";

test("button link purposes map to stable tokens", () => {
  assert.equal(buttonLinkPurpose("{{rsvp_link}}"), "interview");
  assert.equal(buttonLinkPurpose("{{onboarding_link}}"), "onboarding");
  assert.equal(buttonLinkPurpose("https://example.test/form"), "custom");
  assert.equal(buttonLinkPurpose(""), "custom");

  assert.equal(buttonLinkValue("interview"), "{{rsvp_link}}");
  assert.equal(buttonLinkValue("onboarding"), "{{onboarding_link}}");
  assert.equal(buttonLinkValue("custom"), "");
  assert.equal(buttonLinkNeedsUrl("custom"), true);
  assert.equal(buttonLinkNeedsUrl("interview"), false);
});

test("unfinished onboarding is marked as unavailable", () => {
  const onboarding = buttonLinkActionById("onboarding");
  assert.equal(onboarding.status, "unavailable");
  assert.match(onboarding.description, /专属入组链接/);
  assert.equal(BUTTON_LINK_ACTIONS.length, 3);
});
