export type RecruitmentTab = "overview" | "roster" | "mail" | "legacy" | "rounds";

export function recruitmentTabFromHash(hash: string): RecruitmentTab {
  const query = hash.split("?")[1] ?? "";
  const raw = new URLSearchParams(query).get("tab");
  if (raw === "roster" || raw === "mail" || raw === "legacy" || raw === "rounds") return raw;
  return "overview";
}

export function hashForRecruitmentTab(tab: RecruitmentTab): string {
  return tab === "overview" ? "#/recruitment" : `#/recruitment?tab=${tab}`;
}
