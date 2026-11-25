import test from "node:test";
import assert from "node:assert/strict";
import {
  interpolateDesignVariables,
  sampleVariableValues,
  variablesForTarget,
} from "../shared/design/variables.ts";

test("variable registry is target-aware", () => {
  const email = variablesForTarget("email").map((variable) => variable.key);
  const invite = variablesForTarget("invite_page").map((variable) => variable.key);

  assert.equal(email.includes("candidate_name"), true);
  assert.equal(email.includes("onboarding_link"), true);
  assert.equal(invite.includes("candidate_name"), true);
  assert.equal(invite.includes("onboarding_link"), false);
});

test("preview interpolation uses sample values and keeps unknown tokens", () => {
  const values = sampleVariableValues();
  assert.equal(
    interpolateDesignVariables("你好，{{candidate_name}}", values),
    "你好，林知夏",
  );
  assert.equal(
    interpolateDesignVariables("{{unknown_value}}", values),
    "{{unknown_value}}",
  );
});
