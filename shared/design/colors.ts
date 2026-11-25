export function parseHexColor(value: string): [number, number, number] | null {
  const normalized = value.trim().replace(/^#/u, "");
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/iu.test(normalized)) return null;
  const hex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => character + character)
          .join("")
      : normalized;
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

export function contrastText(color: string, fallback = "#172019"): string {
  const rgb = parseHexColor(color);
  if (!rgb) return fallback;
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance < 0.42 ? "#fffdf8" : "#172019";
}

function channelHex(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, "0");
}

export function mixHex(
  foreground: string,
  background: string,
  foregroundWeight: number,
): string {
  const a = parseHexColor(foreground);
  const b = parseHexColor(background);
  if (!a || !b) return background;
  const weight = Math.min(1, Math.max(0, foregroundWeight));
  return `#${a
    .map((channel, index) =>
      channelHex(channel * weight + b[index] * (1 - weight)),
    )
    .join("")}`;
}
