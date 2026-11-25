import type { DesignTarget } from "../../../shared/contracts/design.ts";

export function targetFromHash(hash: string): DesignTarget {
  const query = hash.split("?")[1] ?? "";
  return new URLSearchParams(query).get("target") === "invite_page"
    ? "invite_page"
    : "email";
}

export function hashForTarget(target: DesignTarget): string {
  return target === "invite_page"
    ? "#/designer?target=invite_page"
    : "#/designer";
}

export function isDesignerOverviewHash(hash: string): boolean {
  const query = hash.split("?")[1] ?? "";
  return new URLSearchParams(query).get("view") === "overview";
}

export const DESIGNER_OVERVIEW_HASH = "#/designer?view=overview";
