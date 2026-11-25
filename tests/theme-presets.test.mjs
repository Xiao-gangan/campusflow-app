import test from "node:test";
import assert from "node:assert/strict";
import { defaultTheme } from "../shared/design/modules.ts";
import {
  THEME_PRESETS,
  applyThemePreset,
  themePresetById,
} from "../shared/design/theme-presets.ts";

test("theme presets cover both targets and every required color", () => {
  assert.equal(THEME_PRESETS.length, 6);
  for (const preset of THEME_PRESETS) {
    for (const target of ["email", "invite_page"]) {
      const colors = preset.colors[target];
      for (const key of [
        "primaryColor",
        "accentColor",
        "backgroundColor",
        "surfaceColor",
        "textColor",
        "mutedTextColor",
        "buttonColor",
        "buttonTextColor",
        "borderColor",
      ]) {
        assert.match(colors[key], /^#[0-9a-f]{6}$/iu, `${preset.id}.${target}.${key}`);
      }
    }
  }
});

test("applying a preset changes colors only and preserves layout settings", () => {
  const theme = {
    ...defaultTheme("email"),
    fontFamily: "Custom Font",
    width: 600,
    radius: 22,
    spacing: 18,
  };
  const preset = themePresetById("ocean");
  assert.ok(preset);
  const next = applyThemePreset(theme, preset, "email");

  assert.equal(next.fontFamily, theme.fontFamily);
  assert.equal(next.width, theme.width);
  assert.equal(next.radius, theme.radius);
  assert.equal(next.spacing, theme.spacing);
  assert.equal(next.primaryColor, "#1f4e79");
  assert.equal(next.backgroundColor, "#f1f5f8");
  assert.equal(next.buttonColor, "#1f4e79");
  assert.equal(next.borderColor, "#d5e1e8");
  assert.notEqual(next.surfaceColor, theme.surfaceColor);
});
