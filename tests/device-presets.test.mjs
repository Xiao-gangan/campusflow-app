import test from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOM_WIDTH_MAX,
  CUSTOM_WIDTH_MIN,
  DEVICE_PRESETS,
  clampCustomWidth,
  isMobilePreviewWidth,
  resolveDeviceSize,
  resolvePreviewLayout,
} from "../shared/design/devices.ts";

test("device presets use CSS viewport sizes", () => {
  const widths = Object.fromEntries(
    DEVICE_PRESETS.map((preset) => [preset.id, preset.width]),
  );
  assert.deepEqual(widths, {
    "phone-small": 320,
    iphone: 390,
    "iphone-large": 430,
    android: 360,
    tablet: 768,
    desktop: 1280,
  });
});

test("custom widths are clamped and resolved", () => {
  assert.equal(clampCustomWidth(200), CUSTOM_WIDTH_MIN);
  assert.equal(clampCustomWidth(5000), CUSTOM_WIDTH_MAX);
  assert.equal(clampCustomWidth(412.4), 412);
  const custom = resolveDeviceSize("custom", 412);
  assert.equal(custom.width, 412);
  assert.match(custom.label, /412/);
  const iphone = resolveDeviceSize("iphone", 412);
  assert.equal(iphone.width, 390);
  assert.equal(iphone.height, 844);
});

test("logical viewport controls the breakpoint while content keeps its max width", () => {
  assert.deepEqual(resolvePreviewLayout(1280, 600), {
    viewportWidth: 1280,
    contentWidth: 600,
  });
  assert.deepEqual(resolvePreviewLayout(390, 600), {
    viewportWidth: 390,
    contentWidth: 390,
  });
  assert.deepEqual(resolvePreviewLayout(1280, 760), {
    viewportWidth: 1280,
    contentWidth: 760,
  });
  assert.equal(isMobilePreviewWidth(480), true);
  assert.equal(isMobilePreviewWidth(481), false);
  assert.equal(resolvePreviewLayout(480, 600).contentWidth, 480);
  assert.equal(resolvePreviewLayout(481, 600).contentWidth, 481);
});
