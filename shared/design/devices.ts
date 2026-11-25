export type DeviceId =
  | "phone-small"
  | "iphone"
  | "iphone-large"
  | "android"
  | "tablet"
  | "desktop"
  | "custom";

export type DevicePreset = {
  id: Exclude<DeviceId, "custom">;
  label: string;
  width: number;
  height: number;
  kind: "phone" | "tablet" | "desktop";
};

export const DEVICE_PRESETS: DevicePreset[] = [
  { id: "phone-small", label: "小屏手机", width: 320, height: 640, kind: "phone" },
  { id: "iphone", label: "iPhone 标准", width: 390, height: 844, kind: "phone" },
  { id: "iphone-large", label: "iPhone 大屏", width: 430, height: 932, kind: "phone" },
  { id: "android", label: "Android 常见", width: 360, height: 800, kind: "phone" },
  { id: "tablet", label: "平板", width: 768, height: 1024, kind: "tablet" },
  { id: "desktop", label: "桌面", width: 1280, height: 800, kind: "desktop" },
];

export const CUSTOM_WIDTH_MIN = 280;
export const CUSTOM_WIDTH_MAX = 1440;

export function devicePresetById(id: DeviceId): DevicePreset | undefined {
  return DEVICE_PRESETS.find((preset) => preset.id === id);
}

export function clampCustomWidth(value: number): number {
  if (!Number.isFinite(value)) return 390;
  return Math.min(
    CUSTOM_WIDTH_MAX,
    Math.max(CUSTOM_WIDTH_MIN, Math.round(value)),
  );
}

export function resolveDeviceSize(
  id: DeviceId,
  customWidth: number,
): { width: number; height: number; label: string } {
  if (id === "custom") {
    const width = clampCustomWidth(customWidth);
    return { width, height: Math.round(width * 1.95), label: `自定义 ${width}px` };
  }
  const preset = devicePresetById(id) ?? DEVICE_PRESETS[1];
  return {
    width: preset.width,
    height: preset.height,
    label: preset.label,
  };
}

/** The device viewport controls breakpoints; the content remains within its
 * natural email/page width and is scaled only by the display container. */
export function resolvePreviewLayout(
  viewportWidth: number,
  contentMaxWidth: number,
): { viewportWidth: number; contentWidth: number } {
  const viewport = Math.max(1, Math.round(viewportWidth));
  const content = Math.max(1, Math.round(contentMaxWidth));
  return { viewportWidth: viewport, contentWidth: Math.min(viewport, content) };
}

export function isMobilePreviewWidth(viewportWidth: number): boolean {
  return viewportWidth <= 480;
}
