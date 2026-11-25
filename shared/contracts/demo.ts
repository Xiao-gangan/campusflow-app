export const DEMO_SESSION_STATUSES = [
  "active",
  "expired",
  "resetting",
] as const;
export type DemoSessionStatus = (typeof DEMO_SESSION_STATUSES)[number];

export type DemoSession = {
  id: string;
  seedVersion: string;
  status: DemoSessionStatus;
  expiresAt: string;
  createdAt: string;
  resetAt: string | null;
};

export type DemoScope = {
  demoSessionId: string;
};
