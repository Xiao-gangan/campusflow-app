import test from "node:test";
import assert from "node:assert/strict";
import { DESIGN_MODULES } from "../shared/design/modules.ts";
import {
  STYLE_RECIPES,
  normalizeVariant,
  resolveStyle,
  styleRecipeById,
} from "../shared/design/style-recipes.ts";
import { defaultTheme } from "../shared/design/modules.ts";

test("every module exposes exactly twenty distinct style options", () => {
  assert.equal(STYLE_RECIPES.length, 20);
  for (const module of DESIGN_MODULES) {
    const field = module.fields.find((item) => item.key === "variant");
    assert.ok(field, `${module.type} has a variant field`);
    assert.equal(field.options.length, 20, `${module.type} has 20 styles`);
    const values = field.options.map((option) => option.value);
    assert.equal(new Set(values).size, 20, `${module.type} style ids are unique`);
    assert.equal(values[0], "style:plain");
  }
});

test("legacy variant names map to stable style recipes", () => {
  assert.equal(normalizeVariant("heading", "plain"), "plain");
  assert.equal(normalizeVariant("heading", "accent"), "underline");
  assert.equal(normalizeVariant("heading", "band"), "band");
  assert.equal(normalizeVariant("text", "default"), "plain");
  assert.equal(normalizeVariant("text", "quote"), "quote");
  assert.equal(normalizeVariant("button", "link"), "underline");
  assert.equal(normalizeVariant("divider", "short"), "short");
  assert.equal(normalizeVariant("button", "style:solid"), "solid");
  assert.equal(normalizeVariant("button", "unknown"), "plain");
});

test("resolved styles expose surfaces, borders and sizes", () => {
  const theme = defaultTheme("email");
  const band = resolveStyle(styleRecipeById("band"), theme);
  assert.equal(band.background, theme.accentColor);
  assert.equal(band.hasSurface, true);
  const sidebar = resolveStyle(styleRecipeById("sidebar"), theme);
  assert.match(sidebar.borderLeft, /4px solid/);
  const lead = resolveStyle(styleRecipeById("lead"), theme);
  assert.ok(lead.sizeScale > 1);
  const pill = resolveStyle(styleRecipeById("pill"), theme);
  assert.equal(pill.borderRadius, 999);
});
