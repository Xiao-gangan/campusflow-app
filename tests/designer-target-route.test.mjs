import test from "node:test";
import assert from "node:assert/strict";
import {
  hashForTarget,
  targetFromHash,
} from "../src/modules/designer/target-route.ts";

test("designer target is read from the existing hash query", () => {
  assert.equal(targetFromHash("#/designer"), "email");
  assert.equal(targetFromHash("#/designer?target=email"), "email");
  assert.equal(targetFromHash("#/designer?target=invite_page"), "invite_page");
  assert.equal(
    targetFromHash("#/designer?target=invite_page&from=bookmark"),
    "invite_page",
  );
  assert.equal(targetFromHash("#/designer?target=unknown"), "email");
});

test("designer hash keeps the invite target and a clean email URL", () => {
  assert.equal(hashForTarget("email"), "#/designer");
  assert.equal(hashForTarget("invite_page"), "#/designer?target=invite_page");
});
