import type { Actor } from "../api/actor.ts";
import type {
  AuditActorKind,
  AuditEventInput,
} from "../contracts/audit.ts";

export { redactAuditMetadata } from "../security/audit.ts";

type AuditSink = {
  recordAuditEvent(input: AuditEventInput): Promise<unknown>;
};

export async function recordAuditSafely(
  sink: AuditSink,
  input: AuditEventInput,
): Promise<void> {
  try {
    await sink.recordAuditEvent(input);
  } catch {
    // Audit failures must not turn a completed security operation into a
    // retryable client error. Production sinks should alert separately.
  }
}

export function auditActor(actor: Actor): {
  actorKind: AuditActorKind;
  actorId: string | null;
} {
  if (actor.kind === "member") {
    return { actorKind: "member", actorId: actor.memberId };
  }
  if (actor.kind === "candidate") {
    return { actorKind: "candidate", actorId: actor.applicantId };
  }
  if (actor.kind === "demo") {
    return { actorKind: "demo", actorId: actor.demoSessionId };
  }
  return { actorKind: "anonymous", actorId: null };
}
