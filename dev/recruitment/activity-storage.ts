import type { SqlDatabase } from "../../shared/data/sql-database.ts";
import { isActivityTerminal, type ActivityCredential, type CustomActivity, type CustomActivitySubmission } from "../../shared/contracts/interview-rounds.ts";
import { parseCustomActivityResult } from "../../shared/recruitment/custom-activities.ts";
import { RsvpError } from "../rsvp/error.ts";

type ResultRow = { activity_id: string; generation: number; result_json: string; updated_at: string; revision: number };
type AccessRow = { generation: number; revoked_at: string | null };
export type ActivityTokenRow = {
  token_id: string; invite_id: string; candidate_id: string; round_id: string; activity_id: string; generation: number;
  status: "active" | "locked" | "revoked"; issued_at: string; expires_at: string;
  last_used_at: string | null; locked_at: string | null; revoked_at: string | null;
};

function submission(row: ResultRow): CustomActivitySubmission {
  const value: ReturnType<typeof parseCustomActivityResult> = JSON.parse(row.result_json);
  return { ...value, submittedAt: isActivityTerminal(value) ? row.updated_at : null, revision: row.revision };
}

export function initializeActivityStorage(db: SqlDatabase, now: () => string) {
  const hasResults = db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='activity_results'").get();
  db.exec(`CREATE TABLE IF NOT EXISTS activity_results (
      invite_id TEXT NOT NULL, activity_id TEXT NOT NULL, generation INTEGER NOT NULL,
      result_json TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL,
      PRIMARY KEY(invite_id,activity_id,generation)
    );
    CREATE TABLE IF NOT EXISTS activity_access (
      invite_id TEXT NOT NULL, activity_id TEXT NOT NULL, generation INTEGER NOT NULL, revoked_at TEXT,
      PRIMARY KEY(invite_id,activity_id)
    );
    CREATE TABLE IF NOT EXISTS activity_tokens (
      token_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, invite_id TEXT NOT NULL, candidate_id TEXT NOT NULL,
      round_id TEXT NOT NULL, activity_id TEXT NOT NULL, generation INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','locked','revoked')), issued_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      last_used_at TEXT, locked_at TEXT, revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS activity_tokens_invite ON activity_tokens(invite_id,activity_id,generation);`);
  if (!hasResults && db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='custom_activity_submissions'").get()) {
    const legacy = db.prepare("SELECT * FROM custom_activity_submissions").all();
    const migrate = db.prepare("INSERT INTO activity_results VALUES (?,?,1,?,?,?)");
    for (const row of legacy) {
      const result = { status: "completed", summary: row.summary, ...(row.score !== null ? { score: row.score } : {}),
        ...(typeof row.payload_json === "string" ? { payload: JSON.parse(row.payload_json) } : {}) };
      migrate.run(row.invite_id, row.activity_id, JSON.stringify(result), row.submitted_at, row.revision);
    }
  }

  function access(inviteId: string, activityId: string): AccessRow {
    return db.prepare("SELECT generation,revoked_at FROM activity_access WHERE invite_id=? AND activity_id=?")
      .get(inviteId, activityId) as AccessRow | undefined ?? { generation: 1, revoked_at: null };
  }

  function result(inviteId: string, activityId: string, generation: number) {
    const row = db.prepare("SELECT * FROM activity_results WHERE invite_id=? AND activity_id=? AND generation=?")
      .get(inviteId, activityId, generation) as ResultRow | undefined;
    return row ? submission(row) : null;
  }

  function history(inviteId: string) {
    return (db.prepare("SELECT * FROM activity_results WHERE invite_id=? ORDER BY generation DESC").all(inviteId) as ResultRow[])
      .map((row) => ({ activityId: row.activity_id, generation: row.generation, result: submission(row) }));
  }

  function save(inviteId: string, activityId: string, generation: number, raw: unknown) {
    const prior = result(inviteId, activityId, generation);
    if (prior && isActivityTerminal(prior)) return prior;
    let incoming;
    try { incoming = parseCustomActivityResult(raw); }
    catch (error) { throw new RsvpError(400, (error as Error).message); }
    // An omitted field preserves previously saved progress and structured data.
    const merged = { ...prior, ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => value !== undefined)) };
    const { revision: _revision, submittedAt: _submittedAt, ...fields } = merged;
    let validated;
    try { validated = parseCustomActivityResult(fields); }
    catch (error) { throw new RsvpError(400, (error as Error).message); }
    const revision = (prior?.revision ?? 0) + 1;
    const updatedAt = now();
    db.prepare(`INSERT INTO activity_results VALUES (?,?,?,?,?,?) ON CONFLICT(invite_id,activity_id,generation)
      DO UPDATE SET result_json=excluded.result_json,updated_at=excluded.updated_at,revision=excluded.revision`)
      .run(inviteId, activityId, generation, JSON.stringify(validated), updatedAt, revision);
    return { ...validated, submittedAt: isActivityTerminal(validated) ? updatedAt : null, revision };
  }

  function revoke(inviteId: string, activityId?: string) {
    if (activityId) db.prepare("UPDATE activity_tokens SET status='revoked',revoked_at=? WHERE invite_id=? AND activity_id=? AND status<>'revoked'")
      .run(now(), inviteId, activityId);
    else db.prepare("UPDATE activity_tokens SET status='revoked',revoked_at=? WHERE invite_id=? AND status<>'revoked'").run(now(), inviteId);
  }

  function credential(inviteId: string, activity: CustomActivity): ActivityCredential {
    const { generation, revoked_at } = access(inviteId, activity.id);
    const row = db.prepare(`SELECT * FROM activity_tokens WHERE invite_id=? AND activity_id=? AND generation=? ORDER BY rowid DESC LIMIT 1`)
      .get(inviteId, activity.id, generation) as ActivityTokenRow | undefined;
    const status = revoked_at ? "revoked" : !row ? "unissued" : row.status === "revoked" ? "revoked" : row.expires_at <= now() ? "expired" : row.status;
    return { activityId: activity.id, activityTitle: activity.title, generation, status, issuedAt: row?.issued_at ?? null,
      expiresAt: row?.expires_at ?? null, lastUsedAt: row?.last_used_at ?? null, lockedAt: row?.locked_at ?? null, revokedAt: revoked_at ?? row?.revoked_at ?? null };
  }

  return { access, result, history, save, revoke, credential,
    issue(input: { id: string; hash: string; inviteId: string; candidateId: string; roundId: string; activityId: string; generation: number; expiresAt: string; locked: boolean }) {
      revoke(input.inviteId, input.activityId);
      const timestamp = now();
      db.prepare(`INSERT INTO activity_tokens (token_id,token_hash,invite_id,candidate_id,round_id,activity_id,generation,status,issued_at,expires_at,locked_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(input.id, input.hash, input.inviteId, input.candidateId, input.roundId, input.activityId,
          input.generation, input.locked ? "locked" : "active", timestamp, input.expiresAt, input.locked ? timestamp : null);
    },
    findToken(hash: string) {
      return db.prepare("SELECT * FROM activity_tokens WHERE token_hash=?").get(hash) as ActivityTokenRow | undefined;
    },
    use(row: ActivityTokenRow, terminal = false) {
      const timestamp = now();
      db.prepare(`UPDATE activity_tokens SET last_used_at=?, status=?, locked_at=COALESCE(locked_at,?) WHERE token_id=?`)
        .run(timestamp, terminal ? "locked" : row.status, terminal ? timestamp : null, row.token_id);
    },
    manage(inviteId: string, activity: CustomActivity, action: "reissue" | "revoke") {
      const { generation } = access(inviteId, activity.id);
      revoke(inviteId, activity.id);
      db.prepare(`INSERT INTO activity_access VALUES (?,?,?,?) ON CONFLICT(invite_id,activity_id)
        DO UPDATE SET generation=excluded.generation,revoked_at=excluded.revoked_at`)
        .run(inviteId, activity.id, generation + (action === "reissue" ? 1 : 0), action === "revoke" ? now() : null);
      return credential(inviteId, activity);
    },
  };
}
