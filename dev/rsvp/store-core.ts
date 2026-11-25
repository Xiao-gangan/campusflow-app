import { interviewScheduleVariables } from "../../shared/design/variables.ts";
import { FIRST_ROUND_ID, isActivityTerminal, type ActivitySession } from "../../shared/contracts/interview-rounds.ts";
import type { SmtpSecretVault } from "../recruitment/smtp-secrets.ts";
import { initializeRounds } from "../recruitment/rounds.ts";

import { RsvpError } from "./error.ts";

import type { SqlDatabase } from "../../shared/data/sql-database.ts";
import type { DesignDocument } from "../../shared/contracts/design.ts";
import type { CandidateInvite } from "../../shared/contracts/candidate-invite.ts";
import type { InterviewInvitation } from "../../shared/contracts/interview.ts";
import type { RsvpResponseValue } from "../../shared/contracts/recruitment.ts";
import {
  APPLICANT_STATUSES,
  type ApplicantStatus,
} from "../../shared/contracts/domain.ts";
import type {
  CandidateInput,
  DemoCandidate,
  MailInviteLink,
} from "../../shared/contracts/recruitment-console.ts";
import {
  isInterviewInvitationUsable,
  respondToInterviewInvitation,
  revokeInterviewInvitation,
  rotateInterviewInvitationToken,
} from "../../shared/domain/interview.ts";
import { constantTimeEqual, createSecretToken, hashToken } from "../../shared/security/tokens.ts";

const randomUUID = () => crypto.randomUUID();
const invalidActivityCredential = () => new RsvpError(401, "环节凭证已失效，请从专属邀请函重新打开。");

type Entry = {
  invite: InterviewInvitation;
  document: DesignDocument;
  context: Record<string, string>;
  candidateId: string | null;
  roundId: string;
};

type CandidateRow = {
  id: string;
  cycle: string;
  name: string;
  email: string;
  department: string;
  stage: ApplicantStatus;
  note: string;
  interview_date: string;
  start_time: string;
  end_time: string;
  location: string;
  created_at: string;
  updated_at: string;
  round_id: string;
};

const DEMO_CYCLE = "2026 秋招";
const DEFAULT_INTERVIEW = {
  startTime: "14:00",
  endTime: "14:30",
  location: "信息楼 A302",
};

function candidateFromRow(row: CandidateRow): DemoCandidate {
  return {
    id: row.id,
    cycle: row.cycle,
    name: row.name,
    email: row.email,
    department: row.department,
    stage: row.stage,
    note: row.note,
    interviewDate: row.interview_date,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    roundId: row.round_id,
  };
}

function interviewDateFromClock(now: Date) {
  return new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
}

function requireOpen(invite: InterviewInvitation, now: string) {
  if (invite.status === "revoked" || invite.revokedAt)
    throw new RsvpError(410, "这份邀请已撤销。");
  if (!isInterviewInvitationUsable(invite, now))
    throw new RsvpError(410, "这份邀请已超过答复截止时间。");
  if (invite.status !== "ready" && invite.status !== "sent")
    throw new RsvpError(404, "邀请链接无效。");
}

function candidateView({ invite, document, context }: Entry): CandidateInvite {
  const { rsvpStatus, respondedAt, version, expiresAt } = invite;
  return { document, context: {
    ...interviewScheduleVariables(invite.interviewDate, invite.startTime, invite.endTime, invite.location ?? ""),
    ...context,
  }, rsvpStatus, respondedAt, version, expiresAt };
}

/** Each callback is synchronous; token lookup, time/version checks and writes share one SQLite transaction. */
export type ActivitySigning = {
  mint(): { id: string; token: string; hash: string };
  verify(token: unknown): { id: string; hash: string };
};

export function createRsvpStore(
  db: SqlDatabase,
  { vault, signing, sha256, browser = false }: {
    vault: () => SmtpSecretVault;
    signing: ActivitySigning;
    sha256: (value: string) => string;
    browser?: boolean;
  },
  clock = () => new Date(),
) {
  db.exec(`PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS demo_interview (
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, state TEXT NOT NULL,
      document TEXT NOT NULL, context TEXT NOT NULL, candidate_id TEXT
    );
    CREATE TABLE IF NOT EXISTS demo_candidate (
      id TEXT PRIMARY KEY,
      cycle TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      department TEXT NOT NULL,
      stage TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      interview_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      location TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(cycle, email)
    );
    CREATE INDEX IF NOT EXISTS demo_candidate_cycle_stage
      ON demo_candidate(cycle, stage);
  `);
  const interviewColumns = db
    .prepare("PRAGMA table_info(demo_interview)")
    .all()
    .map((row) => String(row.name));
  if (!interviewColumns.includes("candidate_id")) {
    db.exec("ALTER TABLE demo_interview ADD COLUMN candidate_id TEXT");
  }
  db.exec("CREATE INDEX IF NOT EXISTS demo_interview_candidate ON demo_interview(candidate_id)");
  function read(key: "id" | "token_hash", value: string): Entry {
    const row = db
      .prepare(
        `SELECT state, document, context, candidate_id, round_id FROM demo_interview WHERE ${key}=?`,
      )
      .get(value);
    if (!row) throw new RsvpError(404, "邀请链接无效，请使用最新邀请。");
    return {
      invite: JSON.parse(String(row.state)),
      document: JSON.parse(String(row.document)),
      context: JSON.parse(String(row.context)),
      candidateId: typeof row.candidate_id === "string" ? row.candidate_id : null,
      roundId: String(row.round_id),
    };
  }
  function save(invite: InterviewInvitation) {
    db.prepare(
      "UPDATE demo_interview SET token_hash=?, state=? WHERE id=?",
    ).run(invite.tokenHash, JSON.stringify(invite), invite.id);
  }
  function candidateRow(id: string): CandidateRow | null {
    return (db.prepare("SELECT * FROM demo_candidate WHERE id=?").get(id) as CandidateRow | undefined) ?? null;
  }
  function listCandidateRows(): CandidateRow[] {
    return db.prepare("SELECT * FROM demo_candidate ORDER BY created_at DESC, id DESC").all() as CandidateRow[];
  }
  function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }
  function validateCandidateInput(input: CandidateInput) {
    if (
      !input.name.trim() ||
      !input.email.trim() ||
      !input.department.trim() ||
      !APPLICANT_STATUSES.includes(input.stage)
    ) {
      throw new RsvpError(400, "请填写姓名、邮箱、部门和有效阶段。");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input.email.trim())) {
      throw new RsvpError(400, "邮箱格式不正确。");
    }
  }
  function insertCandidate(input: CandidateInput, now: string): DemoCandidate {
    validateCandidateInput(input);
    const id = `demo-candidate-${randomUUID()}`;
    const email = normalizeEmail(input.email);
    const interviewDate =
      input.interviewDate?.trim() || interviewDateFromClock(new Date(now));
    return transaction(() => {
      const row: CandidateRow = {
        id, cycle: DEMO_CYCLE, name: input.name.trim(), email,
        department: input.department.trim(), stage: input.stage, note: input.note?.trim() ?? "",
        interview_date: interviewDate,
        start_time: input.startTime?.trim() || DEFAULT_INTERVIEW.startTime,
        end_time: input.endTime?.trim() || DEFAULT_INTERVIEW.endTime,
        location: input.location?.trim() || DEFAULT_INTERVIEW.location,
        created_at: now, updated_at: now, round_id: rounds.initialRoundId(),
      };
      if (db.prepare("SELECT 1 FROM demo_candidate WHERE cycle=? AND email=?").get(row.cycle, row.email))
        throw new RsvpError(409, "本招新周期内该邮箱已存在。");
      db.prepare(`INSERT INTO demo_candidate
        (id,cycle,name,email,department,stage,note,interview_date,start_time,end_time,location,created_at,updated_at,round_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        row.id, row.cycle, row.name, row.email, row.department, row.stage, row.note, row.interview_date,
        row.start_time, row.end_time, row.location, row.created_at, row.updated_at, row.round_id,
      );
      rounds.register(row.id, row.round_id, now, {
        interviewDate: row.interview_date, startTime: row.start_time, endTime: row.end_time, location: row.location,
      });
      return candidateFromRow(row);
    });
  }
  function seedCandidates() {
    const count = db.prepare("SELECT COUNT(*) AS count FROM demo_candidate").get();
    if (Number(count?.count ?? 0) > 0) return;
    const now = clock().toISOString();
    const date = interviewDateFromClock(clock());
    for (const candidate of [
      {
        name: "林知夏", email: "lin@example.test", department: "技术部",
        stage: "interview" as const, note: "模拟候选人 · 正常投递",
      },
      {
        name: "陈嘉禾", email: "chen@example.test", department: "设计部",
        stage: "screening" as const, note: "模拟候选人 · 正常投递",
      },
      {
        name: "周雨", email: "zhou.fail@example.test", department: "运营部",
        stage: "new" as const, note: "模拟候选人 · 首投失败重试演示",
      },
    ]) {
      const id = `demo-candidate-${candidate.email.split("@")[0].replace(/\W/gu, "-")}`;
      db.prepare(
        "INSERT INTO demo_candidate (id,cycle,name,email,department,stage,note,interview_date,start_time,end_time,location,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id, DEMO_CYCLE, candidate.name, candidate.email, candidate.department,
        candidate.stage, candidate.note, date, DEFAULT_INTERVIEW.startTime,
        DEFAULT_INTERVIEW.endTime, DEFAULT_INTERVIEW.location, now, now,
      );
    }
  }
  if (!browser) seedCandidates();
  function transaction<T>(fn: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      db.exec("COMMIT");
      return value;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  const rounds = initializeRounds(db, clock, transaction, browser);


  const storage = rounds.activityStorage;

  function externalSession(token: unknown, origin?: string) {
    const proof = signing.verify(token);
    const row = storage.findToken(proof.hash);
    if (!row || row.token_id !== proof.id || row.status === "revoked" || row.expires_at <= clock().toISOString()) throw invalidActivityCredential();
    const entry = read("id", row.invite_id);
    if (entry.candidateId !== row.candidate_id || entry.roundId !== row.round_id
      || (entry.invite.status !== "ready" && entry.invite.status !== "sent") || !isInterviewInvitationUsable(entry.invite, clock().toISOString()))
      throw invalidActivityCredential();
    const access = storage.access(row.invite_id, row.activity_id);
    if (access.revoked_at || access.generation !== row.generation) throw invalidActivityCredential();
    const activity = rounds.requireCustomActivity(row.invite_id, row.activity_id, "external_app");
    if (origin && new URL(activity.url).origin !== origin) throw new RsvpError(403, "互动回传来源与已配置应用不一致。");
    const snapshot = rounds.readSnapshot(row.invite_id);
    const saved = storage.result(row.invite_id, row.activity_id, row.generation);
    const session: ActivitySession = { candidateName: entry.context.candidate_name,
      roundName: snapshot?.roundName ?? "", activityId: activity.id, activityTitle: activity.title,
      status: saved?.status ?? "pending", expiresAt: row.expires_at, submission: saved };
    return { row, session };
  }

  function viewWithActivities(entry: Entry): CandidateInvite {
    const activities = rounds.inviteActivities(entry.invite.id);
    return { ...candidateView(entry), ...(activities ? { activities, roundKind: activities.roundKind ?? "interview" } : {}) };
  }

  function candidateForRound(row: CandidateRow, roundId?: string): DemoCandidate {
    const current = candidateFromRow(row);
    if (!roundId || roundId === current.roundId) return current;
    return { ...current, ...rounds.scheduleFor(current.id, roundId) };
  }

  return {
    rounds,
    close: () => db.close(),
    async issue(document: DesignDocument, expiresAt: string, candidate?: DemoCandidate, roundId?: string, organizationName?: string) {
      const token = createSecretToken();
      const tokenHash = await hashToken(token);
      const now = clock().toISOString();
      if (
        !Number.isFinite(Date.parse(expiresAt)) ||
        Date.parse(expiresAt) <= Date.parse(now)
      )
        throw new RsvpError(400, "请选择将来的答复截止时间。");
      return transaction(() => {
        const current = candidate ? candidateRow(candidate.id) : null;
        if (candidate && !current) throw new RsvpError(404, "候选人不存在。");
        const round = current ? rounds.requireRound(roundId ?? current.round_id, true) : null;
        const effective = current ? candidateForRound(current, round?.id) : undefined;
        const deadlineDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(Date.parse(expiresAt) + 86400000));
        const date = effective?.interviewDate ?? deadlineDate;
        const startTime = effective?.startTime ?? "14:00";
        const endTime = effective?.endTime ?? "14:30";
        const location = effective?.location ?? "信息楼 A302";
        const candidateName = effective?.name || "林知夏";
        const candidateEmail = effective?.email || "lin@example.test";
        const department = effective?.department || "技术部";
        const applicantId = effective?.id || "demo-applicant-lin";
        const note = effective?.note || "请提前十分钟到达。";
        const invite: InterviewInvitation = {
          id: randomUUID(),
          applicantId,
          tokenHash,
          status: "ready",
          rsvpStatus: "pending",
          version: 1,
          expiresAt: new Date(expiresAt).toISOString(),
          revokedAt: null,
          sentAt: null,
          respondedAt: null,
          interviewDate: date,
          startTime,
          endTime,
          location,
          notes: null,
          createdAt: now,
          updatedAt: now,
        };
        const context = {
          candidate_name: candidateName,
          organization_name: organizationName?.trim() || "CampusFlow",
          department,
          personal_note: note,
          candidate_email: candidateEmail,
        };
        const snapshot: DesignDocument = {
          ...document,
          blocks: document.blocks.map((block) =>
            block.type === "event_info"
              ? {
                  ...block,
                  props: {
                    ...block.props,
                    date: date || "待定",
                    time: startTime ? (endTime ? `${startTime}–${endTime}` : startTime) : "待定",
                    location: location || "待定",
                  },
                }
              : block,
          ),
        };
        db.prepare(`INSERT INTO demo_interview (id,token_hash,state,document,context,candidate_id,round_id,link_secret)
          VALUES (?,?,?,?,?,?,?,?)`).run(invite.id, tokenHash, JSON.stringify(invite), JSON.stringify(snapshot),
          JSON.stringify(context), current?.id ?? null, round?.id ?? FIRST_ROUND_ID, current ? vault().encrypt(invite.id, token) : null);
        if (round && current) rounds.issue(invite.id, current.id, round, now, { interviewDate: date, startTime, endTime, location });
        return { id: invite.id, token };
      });
    },
    async view(token: string) {
      const entry = read("token_hash", await hashToken(token));
      requireOpen(entry.invite, clock().toISOString());
      return viewWithActivities(entry);
    },
    async respond(token: string, response: RsvpResponseValue, version: number) {
      const hash = await hashToken(token);
      return transaction(() => {
        const entry = read("token_hash", hash);
        const now = clock().toISOString();
        requireOpen(entry.invite, now);
        const status = response === "attending" ? "confirmed" : "cancelled";
        if (entry.invite.rsvpStatus === status) return viewWithActivities(entry);
        if (entry.invite.version !== version)
          throw new RsvpError(409, "答复已更新，请查看最新状态后再选择。");
        const result = respondToInterviewInvitation(entry.invite, status, now);
        if (!result.ok) throw new RsvpError(410, "当前邀请已无法答复。");
        save(result.invite);
        return viewWithActivities({ ...entry, invite: result.invite });
      });
    },
    async saveActivity(token: string, activity: "form" | "mbti", body: Record<string, unknown>) {
      const hash = await hashToken(token);
      return transaction(() => {
        const entry = read("token_hash", hash);
        requireOpen(entry.invite, clock().toISOString());
        return rounds.writeActivity(entry.invite.id, activity, body);
      });
    },
    async saveSandboxActivity(token: string, activityId: string, body: Record<string, unknown>) {
      const hash = await hashToken(token);
      return transaction(() => {
        const { invite } = read("token_hash", hash);
        requireOpen(invite, clock().toISOString());
        rounds.requireCustomActivity(invite.id, activityId, "sandbox_widget");
        const access = storage.access(invite.id, activityId);
        if (!browser) return storage.save(invite.id, activityId, 1, body);
        const { demoGeneration, ...result } = body;
        if (access.revoked_at || (demoGeneration ?? 1) !== access.generation) throw invalidActivityCredential();
        return storage.save(invite.id, activityId, access.generation, result);
      });
    },
    async launchExternalActivity(token: string, activityId: string, callbackUrl: string, sessionUrl: string) {
      const hash = await hashToken(token);
      return transaction(() => {
        const { invite, candidateId, roundId } = read("token_hash", hash);
        const now = clock();
        requireOpen(invite, now.toISOString());
        const activity = rounds.requireCustomActivity(invite.id, activityId, "external_app");
        const access = storage.access(invite.id, activityId);
        if (!candidateId || access.revoked_at) throw new RsvpError(401, "此环节凭证已吊销，请联系组织者。");
        const credential = signing.mint();
        const expiresAt = new Date(Math.min(now.getTime() + 2 * 60 * 60 * 1000, Date.parse(invite.expiresAt))).toISOString();
        storage.issue({ id: credential.id, hash: credential.hash, inviteId: invite.id, candidateId, roundId, activityId,
          generation: access.generation, expiresAt, locked: isActivityTerminal(storage.result(invite.id, activityId, access.generation)) });
        const url = new URL(activity.url);
        for (const name of ["cf_activity_token", "cf_session_url", "cf_callback_url"]) url.searchParams.delete(name);
        const fragment = new URLSearchParams({ cf_activity_token: credential.token, cf_session_url: sessionUrl, cf_callback_url: callbackUrl });
        if (url.hash) fragment.set("cf_app_fragment", url.hash.slice(1));
        url.hash = fragment.toString();
        return url.href;
      });
    },
    externalActivitySession(token: unknown, origin?: string) {
      return transaction(() => {
        const { row, session } = externalSession(token, origin);
        storage.use(row);
        return session;
      });
    },
    saveExternalActivity(token: unknown, body: Record<string, unknown>, origin?: string) {
      return transaction(() => {
        const { row, session } = externalSession(token, origin);
        const result = row.status === "locked" && session.submission
          ? session.submission : storage.save(row.invite_id, row.activity_id, row.generation, body);
        storage.use(row, isActivityTerminal(result));
        return result;
      });
    },
    manageActivityCredential(candidateId: string, inviteId: string, activityId: string, action: "reissue" | "revoke") {
      return transaction(() => {
        const entry = read("id", inviteId);
        if (entry.candidateId !== candidateId) throw new RsvpError(404, "这份邀请不属于该候选人。");
        if (action === "reissue") requireOpen(entry.invite, clock().toISOString());
        const activity = browser
          ? rounds.readSnapshot(inviteId)?.customActivities.find((item) => item.id === activityId)
          : rounds.requireCustomActivity(inviteId, activityId, "external_app");
        if (!activity) throw new RsvpError(404, "互动环节不存在。");
        return storage.manage(inviteId, activity, action);
      });
    },
    async rotate(id: string) {
      const token = createSecretToken();
      const hash = await hashToken(token);
      return transaction(() => {
        const { invite, candidateId } = read("id", id);
        const result = rotateInterviewInvitationToken(
          invite,
          hash,
          clock().toISOString(),
        );
        if (!result.ok) throw new RsvpError(410, "这份邀请已失效，无法换发。");
        save(result.invite);
        storage.revoke(id);
        if (candidateId) db.prepare("UPDATE demo_interview SET link_secret=? WHERE id=?").run(vault().encrypt(id, token), id);
        return { id, token };
      });
    },
    revoke(id: string) {
      transaction(() => {
        const result = revokeInterviewInvitation(
          read("id", id).invite,
          clock().toISOString(),
        );
        if (!result.ok) throw new RsvpError(410, "这份邀请已失效。");
        save(result.invite);
        storage.revoke(id);
      });
    },
    listCandidates(): DemoCandidate[] {
      return listCandidateRows().map(candidateFromRow);
    },
    getCandidate(id: string, roundId?: string): DemoCandidate | null {
      const row = candidateRow(id);
      return row ? candidateForRound(row, roundId) : null;
    },
    createCandidate(input: CandidateInput): DemoCandidate {
      return insertCandidate(input, clock().toISOString());
    },
    updateCandidate(id: string, input: CandidateInput): DemoCandidate {
      const existing = candidateRow(id);
      if (!existing) throw new RsvpError(404, "候选人不存在。");
      validateCandidateInput(input);
      const email = normalizeEmail(input.email);
      try {
        db.prepare(
          `UPDATE demo_candidate SET name=?, email=?, department=?, stage=?,
             note=?, interview_date=?, start_time=?, end_time=?, location=?, updated_at=?
           WHERE id=?`,
        ).run(
          input.name.trim(), email, input.department.trim(), input.stage,
          input.note?.trim() ?? "",
          input.interviewDate?.trim() || existing.interview_date,
          input.startTime?.trim() || existing.start_time,
          input.endTime?.trim() || existing.end_time,
          input.location?.trim() || existing.location,
          clock().toISOString(), id,
        );
      } catch {
        throw new RsvpError(409, "本招新周期内该邮箱已存在。");
      }
      return candidateFromRow(candidateRow(id)!);
    },
    latestInvite(candidateId: string, roundId?: string): InterviewInvitation | null {
      const row = roundId
        ? db.prepare("SELECT state FROM demo_interview WHERE candidate_id=? AND round_id=? ORDER BY rowid DESC LIMIT 1").get(candidateId, roundId)
        : db.prepare("SELECT state FROM demo_interview WHERE candidate_id=? ORDER BY rowid DESC LIMIT 1").get(candidateId);
      return row ? JSON.parse(String(row.state)) : null;
    },
    deliveryInvite(id: string, url: string): MailInviteLink | null {
      const row = db.prepare(`SELECT d.state, COALESCE(json_extract(a.snapshot, '$.roundName'), r.name) AS round_name
        FROM demo_interview d
        LEFT JOIN interview_rounds r ON r.id=d.round_id
        LEFT JOIN interview_activity a ON a.invite_id=d.id
        WHERE d.id=?`).get(id);
      if (!row) return null;
      const invite = JSON.parse(String(row.state)) as InterviewInvitation;
      let token = "";
      try {
        const parsed = new URL(url);
        if (["http:", "https:"].includes(parsed.protocol))
          token = browser ? parsed.hash.match(/^#\/invite\/([a-f0-9]{64})$/u)?.[1] ?? ""
            : new URLSearchParams(parsed.hash.startsWith("#/invite/rsvp?") ? parsed.hash.slice("#/invite/rsvp?".length) : "").get("token") ?? "";
      } catch {
        // A malformed historical link is never offered for forwarding.
      }
      let status: MailInviteLink["status"];
      if (invite.status === "revoked" || invite.revokedAt) status = "revoked";
      else if (!isInterviewInvitationUsable(invite, clock().toISOString())) status = "expired";
      else if (!/^[a-f0-9]{64}$/u.test(token) || (invite.status !== "ready" && invite.status !== "sent")) status = "missing";
      else status = constantTimeEqual(sha256(token), invite.tokenHash) ? "valid" : "rotated";
      return {
        status, roundName: String(row.round_name ?? "面试"), expiresAt: invite.expiresAt,
        interviewDate: invite.interviewDate, startTime: invite.startTime, endTime: invite.endTime ?? "", location: invite.location ?? "",
      };
    },
    reopenLink(id: string) {
      const { invite, candidateId } = read("id", id);
      requireOpen(invite, clock().toISOString());
      if (!candidateId) throw new RsvpError(404, "这份邀请链接不可重新打开。");
      const row = db.prepare("SELECT link_secret FROM demo_interview WHERE id=?").get(id);
      if (!row?.link_secret) throw new RsvpError(404, "该历史邀请未保存链接，可换发链接。");
      try { return vault().decrypt(id, String(row.link_secret)); }
      catch { throw new RsvpError(409, "无法恢复链接，请换发邀请。"); }
    },
    getInvite(id: string): InterviewInvitation | null {
      const row = db
        .prepare("SELECT state FROM demo_interview WHERE id=?")
        .get(id) as { state: string } | undefined;
      return row ? (JSON.parse(row.state) as InterviewInvitation) : null;
    },
    countInvites(candidateId: string): number {
      const row = db
        .prepare("SELECT COUNT(*) AS count FROM demo_interview WHERE candidate_id=?")
        .get(candidateId) as { count: number } | undefined;
      return Number(row?.count ?? 0);
    },
  };
}
