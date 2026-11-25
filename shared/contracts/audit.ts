export const AUDIT_ACTIONS = [
  "admin.bootstrap",
  "auth.login",
  "auth.logout",
  "auth.session_revoked",
  "member.role_changed",
  "member.activated",
  "member.deactivated",
  "invitation.created",
  "invitation.revoked",
  "invitation.regenerated",
  "onboarding.transitioned",
  "security.access_denied",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditActorKind =
  | "member"
  | "candidate"
  | "demo"
  | "anonymous"
  | "system";

export type AuditResult = "success" | "failure" | "denied";

export type AuditEvent = {
  id: string;
  actorKind: AuditActorKind;
  actorId: string | null;
  action: AuditAction;
  targetType: string;
  targetId: string | null;
  result: AuditResult;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AuditEventInput = Omit<AuditEvent, "id" | "createdAt"> & {
  createdAt?: string;
};
