import type {
  AuditEvent,
  AuditEventInput,
} from "../contracts/audit.ts";

export interface AuditRepository {
  recordAuditEvent(input: AuditEventInput): Promise<AuditEvent>;
  listAuditEvents(input: {
    limit: number;
    offset: number;
  }): Promise<{ items: AuditEvent[]; total: number }>;
}
