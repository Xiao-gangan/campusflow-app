import { useEffect, useState } from "react";

export const ORG_PROFILE_KEY = "campusflow.org.profile.v1";
const ORG_PROFILE_EVENT = "campusflow:org-profile-change";

export type OrganizationProfile = {
  name: string;
  subtitle: string;
  defaultDepartment: string;
};

export const DEFAULT_ORGANIZATION_PROFILE: OrganizationProfile = {
  name: "CampusFlow",
  subtitle: "",
  defaultDepartment: "技术部",
};

function sanitizeProfile(raw: unknown): OrganizationProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_ORGANIZATION_PROFILE;
  }
  const obj = raw as Record<string, unknown>;
  const name =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim().slice(0, 60)
      : DEFAULT_ORGANIZATION_PROFILE.name;
  const subtitle =
    typeof obj.subtitle === "string" ? obj.subtitle.trim().slice(0, 80) : "";
  const defaultDepartment =
    typeof obj.defaultDepartment === "string" && obj.defaultDepartment.trim()
      ? obj.defaultDepartment.trim().slice(0, 40)
      : DEFAULT_ORGANIZATION_PROFILE.defaultDepartment;
  return { name, subtitle, defaultDepartment };
}

export function readOrganizationProfile(): OrganizationProfile {
  if (typeof window === "undefined") return DEFAULT_ORGANIZATION_PROFILE;
  try {
    const raw = window.localStorage.getItem(ORG_PROFILE_KEY);
    if (!raw) return DEFAULT_ORGANIZATION_PROFILE;
    return sanitizeProfile(JSON.parse(raw));
  } catch {
    return DEFAULT_ORGANIZATION_PROFILE;
  }
}

export function isOrganizationCustomized(profile: OrganizationProfile): boolean {
  return (
    profile.name !== DEFAULT_ORGANIZATION_PROFILE.name ||
    profile.subtitle.length > 0
  );
}

export function saveOrganizationProfile(
  next: Partial<OrganizationProfile>,
): OrganizationProfile {
  const merged = sanitizeProfile({ ...readOrganizationProfile(), ...next });
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(ORG_PROFILE_KEY, JSON.stringify(merged));
    } catch {
      // Ignore storage quota / privacy mode errors.
    }
    window.dispatchEvent(new CustomEvent(ORG_PROFILE_EVENT, { detail: merged }));
  }
  return merged;
}

export function useOrganizationProfile(): OrganizationProfile {
  const [profile, setProfile] = useState<OrganizationProfile>(readOrganizationProfile);

  useEffect(() => {
    const sync = () => setProfile(readOrganizationProfile());
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === ORG_PROFILE_KEY) sync();
    };
    window.addEventListener(ORG_PROFILE_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ORG_PROFILE_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return profile;
}

export function orgPreviewVariables(
  base: Record<string, string>,
  profile: OrganizationProfile,
): Record<string, string> {
  return {
    ...base,
    organization_name: profile.name || base.organization_name,
    ...(profile.defaultDepartment
      ? { department: profile.defaultDepartment }
      : {}),
  };
}
