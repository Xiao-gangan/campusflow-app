import type { SqlDatabase } from "../../shared/data/sql-database.ts";
import {
  FIRST_ROUND_ID, OFFER_ROUND_ID, REVIEW_DECISIONS, type FormAnswers, type InterviewRound, type InviteActivities, type InviteSubmission,
  type InterviewRoundKind, type PromotionSchedule, type RoundProgress, type RoundReview, type RoundSchedule, type RoundSubmission,
  isActivityTerminal, type CustomActivity,
} from "../../shared/contracts/interview-rounds.ts";
import type { InterviewInvitation } from "../../shared/contracts/interview.ts";
import { blankRound, csvCell, parseRoundInput, scoreMbti, validateForm, validateMbti } from "../../shared/recruitment/round-config.ts";
import { initializeActivityStorage } from "./activity-storage.ts";
import { RsvpError } from "../rsvp/error.ts";

type RoundRow = {
  id: string; kind: InterviewRoundKind; name: string; description: string; sort_order: number; default_email_template_id: string | null;
  default_invite_template_id: string | null; form_config_json: string; mbti_config_json: string; custom_activities_json: string;
  archived_at: string | null; created_at: string; updated_at: string;
};

function fromRow(row: RoundRow): InterviewRound {
  return {
    id: row.id, kind: row.kind, name: row.name, description: row.description, sortOrder: row.sort_order,
    defaultEmailTemplateId: row.default_email_template_id, defaultInviteTemplateId: row.default_invite_template_id,
    formConfig: JSON.parse(row.form_config_json), mbtiConfig: JSON.parse(row.mbti_config_json),
    customActivities: JSON.parse(row.custom_activities_json),
    archivedAt: row.archived_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

const emptySchedule: RoundSchedule = { interviewDate: "", startTime: "", endTime: "", location: "" };

function parsePromotionSchedule(raw: unknown): PromotionSchedule {
  if (raw === undefined) return { mode: "keep" };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const input = raw as Record<string, unknown>;
    if (input.mode === "keep" || input.mode === "clear") return { mode: input.mode };
    if (input.mode === "replace") {
      const { interviewDate, startTime, endTime, location } = input;
      const validTime = (value: unknown): value is string => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value);
      const validDate = typeof interviewDate === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(interviewDate)
        && Number.isFinite(Date.parse(interviewDate)) && new Date(interviewDate).toISOString().slice(0, 10) === interviewDate;
      if (!validDate || !validTime(startTime) || !validTime(endTime) || startTime >= endTime
        || typeof location !== "string" || !location.trim() || location.trim().length > 200)
        throw new RsvpError(400, "请填写有效的日期、起止时间和地点，结束时间须晚于开始时间。");
      return { mode: "replace", interviewDate, startTime, endTime, location: location.trim() };
    }
  }
  throw new RsvpError(400, "请选择如何安排本轮时间地点。");
}

type ReviewRow = { rating: number; decision: RoundReview["decision"]; notes: string; reviewer_name: string; updated_at: string };
type ActivitySnapshot = Omit<InviteActivities, "customActivities"> & { customActivities: CustomActivity[] };
function reviewFromRow(row: ReviewRow): RoundReview {
  return { rating: row.rating, decision: row.decision, notes: row.notes, reviewerName: row.reviewer_name, updatedAt: row.updated_at };
}

export function initializeRounds(db: SqlDatabase, clock: () => Date, transaction: <T>(fn: () => T) => T, browser = false) {
  const now = () => clock().toISOString();
  const activityStorage = transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS interview_rounds (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'interview', name TEXT NOT NULL, sort_order INTEGER NOT NULL, description TEXT NOT NULL,
        default_email_template_id TEXT, default_invite_template_id TEXT, form_config_json TEXT NOT NULL,
        mbti_config_json TEXT NOT NULL, custom_activities_json TEXT NOT NULL DEFAULT '[]',
        archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS candidate_round_history (
        candidate_id TEXT NOT NULL, round_id TEXT NOT NULL, entered_at TEXT NOT NULL, schedule TEXT, PRIMARY KEY(candidate_id, round_id)
      );
      CREATE TABLE IF NOT EXISTS round_reviews (
        candidate_id TEXT NOT NULL, round_id TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
        decision TEXT NOT NULL CHECK(decision IN ('pass','hold','reject')), notes TEXT NOT NULL,
        reviewer_name TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(candidate_id, round_id)
      );
      CREATE TABLE IF NOT EXISTS interview_activity (
        invite_id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, round_id TEXT NOT NULL, snapshot TEXT NOT NULL
      );
    `);
    if (!db.prepare("PRAGMA table_info(interview_rounds)").all().some((column) => column.name === "kind"))
      db.exec("ALTER TABLE interview_rounds ADD COLUMN kind TEXT NOT NULL DEFAULT 'interview'");
    if (!db.prepare("PRAGMA table_info(interview_rounds)").all().some((column) => column.name === "custom_activities_json"))
      db.exec("ALTER TABLE interview_rounds ADD COLUMN custom_activities_json TEXT NOT NULL DEFAULT '[]'");
    if (!db.prepare("PRAGMA table_info(candidate_round_history)").all().some((column) => column.name === "schedule"))
      db.exec("ALTER TABLE candidate_round_history ADD COLUMN schedule TEXT");
    for (const table of ["demo_candidate", "demo_interview"] as const) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all();
      if (!columns.some((column) => column.name === "round_id"))
        db.exec(`ALTER TABLE ${table} ADD COLUMN round_id TEXT NOT NULL DEFAULT '${FIRST_ROUND_ID}'`);
    }
    const columns = db.prepare("PRAGMA table_info(demo_interview)").all();
    if (!columns.some((column) => column.name === "link_secret"))
      db.exec("ALTER TABLE demo_interview ADD COLUMN link_secret TEXT");
    db.exec("CREATE INDEX IF NOT EXISTS demo_interview_round ON demo_interview(candidate_id, round_id)");
    const seed = db.prepare(`INSERT OR IGNORE INTO interview_rounds
      (id,kind,name,sort_order,description,form_config_json,mbti_config_json,created_at,updated_at)
      VALUES (?,?,?,?,'',?,?,?,?)`);
    const defaults = blankRound();
    const form = JSON.stringify(defaults.formConfig);
    const mbti = JSON.stringify(defaults.mbtiConfig);
    for (const [id, name, order] of [[FIRST_ROUND_ID, "一面", 0], ["round-2", "二面", 1]] as const) {
      seed.run(id, "interview", name, order, form, mbti, now(), now());
    }
    if (!db.prepare("SELECT 1 FROM interview_rounds WHERE kind='offer'").get()) {
      const order = Number(db.prepare("SELECT MAX(sort_order) AS maximum FROM interview_rounds").get()?.maximum ?? 1) + 1;
      seed.run(OFFER_ROUND_ID, "offer", "录取通知", order, form, mbti, now(), now());
    }
    db.exec(`INSERT OR IGNORE INTO candidate_round_history(candidate_id, round_id, entered_at)
      SELECT id, round_id, created_at FROM demo_candidate`);
    db.exec(`UPDATE candidate_round_history AS history
      SET schedule=(SELECT json_object('interviewDate', interview_date, 'startTime', start_time, 'endTime', end_time, 'location', location)
        FROM demo_candidate WHERE id=history.candidate_id AND round_id=history.round_id)
      WHERE schedule IS NULL`);
    db.exec(`UPDATE candidate_round_history AS history
      SET schedule=(SELECT json_object(
        'interviewDate', COALESCE(json_extract(state, '$.interviewDate'), ''),
        'startTime', COALESCE(json_extract(state, '$.startTime'), ''),
        'endTime', COALESCE(json_extract(state, '$.endTime'), ''),
        'location', COALESCE(json_extract(state, '$.location'), ''))
        FROM demo_interview WHERE candidate_id=history.candidate_id AND round_id=history.round_id
        ORDER BY rowid DESC LIMIT 1)
      WHERE schedule IS NULL`);
    return initializeActivityStorage(db, now);
  });

  function list(): InterviewRound[] {
    return (db.prepare("SELECT * FROM interview_rounds ORDER BY sort_order, id").all() as RoundRow[]).map(fromRow);
  }

  function requireRound(id: string, active = false): InterviewRound {
    const row = db.prepare("SELECT * FROM interview_rounds WHERE id=?").get(id) as RoundRow | undefined;
    if (!row) throw new RsvpError(404, "面试轮次不存在。");
    if (active && row.archived_at) throw new RsvpError(409, "该轮次已归档，请选择其他轮次。");
    return fromRow(row);
  }

  function validated(raw: unknown) {
    try { return parseRoundInput(raw); }
    catch (error) { throw new RsvpError(400, (error as Error).message); }
  }

  function configuration(input: ReturnType<typeof validated>) {
    return [input.name, input.description, input.defaultEmailTemplateId, input.defaultInviteTemplateId,
      JSON.stringify(input.formConfig), JSON.stringify(input.mbtiConfig)] as const;
  }

  function create(raw: unknown) {
    const input = validated(raw);
    return transaction(() => {
      const id = crypto.randomUUID();
      const order = Number(db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS maximum FROM interview_rounds").get()?.maximum) + 1;
      db.prepare(`INSERT INTO interview_rounds
        (id,sort_order,kind,name,description,default_email_template_id,default_invite_template_id,form_config_json,mbti_config_json,custom_activities_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, order, input.kind ?? "interview", ...configuration(input), JSON.stringify(input.customActivities ?? []), now(), now());
      return requireRound(id);
    });
  }

  function update(id: string, raw: unknown) {
    const input = validated(raw);
    return transaction(() => {
      const prior = requireRound(id, true);
      db.prepare(`UPDATE interview_rounds SET kind=?,name=?,description=?,default_email_template_id=?,default_invite_template_id=?,
        form_config_json=?,mbti_config_json=?,custom_activities_json=?,updated_at=? WHERE id=?`)
        .run(input.kind ?? prior.kind, ...configuration(input), JSON.stringify(input.customActivities ?? prior.customActivities), now(), id);
      return requireRound(id);
    });
  }

  function archive(id: string) {
    return transaction(() => {
      requireRound(id, true);
      if (list().filter((round) => !round.archivedAt).length === 1)
        throw new RsvpError(409, "至少需要保留一个可用轮次。");
      db.prepare("UPDATE interview_rounds SET archived_at=?,updated_at=? WHERE id=?").run(now(), now(), id);
      return requireRound(id);
    });
  }

  function reorder(ids: unknown) {
    return transaction(() => {
      const rounds = list().filter((round) => !round.archivedAt);
      if (!Array.isArray(ids) || ids.length !== rounds.length || new Set(ids).size !== ids.length
        || ids.some((id) => !rounds.some((round) => round.id === id)))
        throw new RsvpError(400, "轮次已变化，请刷新后重新排序。");
      const write = db.prepare("UPDATE interview_rounds SET sort_order=?,updated_at=? WHERE id=?");
      ids.forEach((id, index) => write.run(rounds[index].sortOrder, now(), id));
      return list();
    });
  }

  function initialRoundId() {
    const row = db.prepare("SELECT id FROM interview_rounds WHERE archived_at IS NULL ORDER BY (id=?) DESC, sort_order LIMIT 1").get(FIRST_ROUND_ID);
    return String(row?.id ?? FIRST_ROUND_ID);
  }

  function register(candidateId: string, roundId: string, enteredAt: string, schedule?: RoundSchedule) {
    db.prepare(`INSERT OR IGNORE INTO candidate_round_history(candidate_id,round_id,entered_at,schedule)
      VALUES (?,?,?,?)`).run(candidateId, roundId, enteredAt, schedule ? JSON.stringify(schedule) : null);
  }

  function saveSchedule(candidateId: string, roundId: string, schedule: RoundSchedule) {
    db.prepare("UPDATE candidate_round_history SET schedule=? WHERE candidate_id=? AND round_id=?")
      .run(JSON.stringify(schedule), candidateId, roundId);
  }

  function scheduleFor(candidateId: string, roundId: string): RoundSchedule | undefined {
    const row = db.prepare("SELECT schedule FROM candidate_round_history WHERE candidate_id=? AND round_id=?").get(candidateId, roundId);
    return row?.schedule ? JSON.parse(String(row.schedule)) : undefined;
  }

  function promote(ids: unknown, roundId: unknown, scheduleInput?: unknown) {
    if (typeof roundId !== "string" || !Array.isArray(ids) || !ids.length || ids.length > 500
      || ids.some((id) => typeof id !== "string")) throw new RsvpError(400, "请选择候选人和目标轮次。");
    const request = parsePromotionSchedule(scheduleInput);
    return transaction(() => {
      const round = requireRound(roundId, true);
      const timestamp = now();
      const write = db.prepare(`UPDATE demo_candidate SET round_id=?,updated_at=?,interview_date=?,start_time=?,end_time=?,location=? WHERE id=?`);
      const read = db.prepare(`SELECT round_id,interview_date AS interviewDate,start_time AS startTime,end_time AS endTime,location
        FROM demo_candidate WHERE id=?`);
      const candidates = new Set<string>(ids);
      for (const id of candidates) {
        const current = read.get(id) as (RoundSchedule & { round_id: string }) | undefined;
        if (!current) throw new RsvpError(404, "有候选人已不存在。");
        const { round_id, ...prior } = current;
        const schedule = request.mode === "keep" ? prior : request.mode === "clear" ? emptySchedule : {
          interviewDate: request.interviewDate, startTime: request.startTime, endTime: request.endTime, location: request.location,
        };
        saveSchedule(id, round_id, prior);
        write.run(round.id, timestamp, schedule.interviewDate, schedule.startTime, schedule.endTime, schedule.location, id);
        register(id, round.id, timestamp, schedule);
        saveSchedule(id, round.id, schedule);
      }
      return { moved: candidates.size, round };
    });
  }

  function requireMembership(candidateId: string, roundId: string) {
    if (!db.prepare("SELECT 1 FROM candidate_round_history WHERE candidate_id=? AND round_id=?").get(candidateId, roundId))
      throw new RsvpError(404, "候选人没有该轮次记录。");
  }

  function getReview(candidateId: string, roundId: string): RoundReview | null {
    const row = db.prepare("SELECT * FROM round_reviews WHERE candidate_id=? AND round_id=?").get(candidateId, roundId) as ReviewRow | undefined;
    return row ? reviewFromRow(row) : null;
  }

  function saveReview(candidateId: string, roundId: string, body: Record<string, unknown>): RoundReview {
    const { rating, decision, notes, reviewerName } = body;
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5
      || !REVIEW_DECISIONS.some((item) => item === decision)
      || typeof notes !== "string" || notes.length > 4000
      || (reviewerName !== undefined && (typeof reviewerName !== "string" || reviewerName.length > 100)))
      throw new RsvpError(400, "请填写 1–5 星评分、有效结论及面评。");
    return transaction(() => {
      requireMembership(candidateId, roundId);
      const review = { rating, decision: decision as RoundReview["decision"], notes: notes.trim(),
        reviewerName: reviewerName?.trim() || "面试官", updatedAt: now() };
      db.prepare(`INSERT INTO round_reviews VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(candidate_id,round_id) DO UPDATE SET rating=excluded.rating,decision=excluded.decision,
          notes=excluded.notes,reviewer_name=excluded.reviewer_name,updated_at=excluded.updated_at`)
        .run(candidateId, roundId, review.rating, review.decision, review.notes, review.reviewerName, review.updatedAt);
      return review;
    });
  }

  function deleteReview(candidateId: string, roundId: string) {
    requireMembership(candidateId, roundId);
    return { deleted: db.prepare("DELETE FROM round_reviews WHERE candidate_id=? AND round_id=?").run(candidateId, roundId).changes > 0 };
  }

  function readSnapshot(inviteId: string): ActivitySnapshot | undefined {
    const row = db.prepare("SELECT snapshot FROM interview_activity WHERE invite_id=?").get(inviteId);
    if (row) return { customActivities: [], ...JSON.parse(String(row.snapshot)) };
  }

  function currentActivity(inviteId: string, activity: CustomActivity) {
    const access = activityStorage.access(inviteId, activity.id);
    return { ...activity, generation: access.generation, ...(access.revoked_at ? { revoked: true } : {}),
      submission: activityStorage.result(inviteId, activity.id, access.generation) };
  }

  function inviteActivities(inviteId: string, state = readSnapshot(inviteId)): InviteActivities | undefined {
    if (!state) return;
    return { ...state, customActivities: state.customActivities.map((activity) => currentActivity(inviteId, activity)) };
  }

  function requireCustomActivity<K extends CustomActivity["kind"]>(inviteId: string, activityId: string, kind: K) {
    const activity = readSnapshot(inviteId)?.customActivities.find((entry) => entry.id === activityId && entry.enabled);
    if (!activity || activity.kind !== kind) throw new RsvpError(404, "这份邀请没有启用该互动环节。");
    return activity as Extract<CustomActivity, { kind: K }>;
  }

  function issue(inviteId: string, candidateId: string, round: InterviewRound, issuedAt: string, schedule: RoundSchedule) {
    register(candidateId, round.id, issuedAt, schedule);
    const state: ActivitySnapshot = {
      roundName: round.name,
      roundKind: round.kind,
      form: round.formConfig.enabled
        ? { questions: round.formConfig.questions, answers: {}, revision: 0, submittedAt: null } : null,
      mbti: round.mbtiConfig.enabled
        ? { questions: round.mbtiConfig.questions.filter((question) => question.enabled),
          answers: {}, result: null, revision: 0, submittedAt: null } : null,
      customActivities: round.customActivities.filter(({ enabled }) => enabled),
    };
    db.prepare("INSERT INTO interview_activity VALUES (?,?,?,?)").run(inviteId, candidateId, round.id, JSON.stringify(state));
  }

  function writeActivity(inviteId: string, activity: "form" | "mbti", body: Record<string, unknown>) {
    const state = readSnapshot(inviteId);
    const progress = state?.[activity];
    if (!state || !progress) throw new RsvpError(404, "这份邀请没有启用该环节。");
    if (progress.submittedAt) return inviteActivities(inviteId, state);
    if (body.mode !== "draft" && body.mode !== "submit") throw new RsvpError(400, "请选择保存或提交。");
    if (body.revision !== progress.revision) throw new RsvpError(409, "填写进度已更新，请刷新后继续。");
    const submit = body.mode === "submit";
    try {
      if (activity === "form" && state.form) state.form.answers = validateForm(state.form.questions, body.answers, submit);
      if (activity === "mbti" && state.mbti) {
        state.mbti.answers = validateMbti(state.mbti.questions, body.answers, submit);
        if (submit) state.mbti.result = scoreMbti(state.mbti.questions, state.mbti.answers);
      }
    } catch (error) {
      throw new RsvpError(400, (error as Error).message);
    }
    progress.revision += 1;
    if (submit) progress.submittedAt = now();
    db.prepare("UPDATE interview_activity SET snapshot=? WHERE invite_id=?").run(JSON.stringify(state), inviteId);
    return inviteActivities(inviteId, state);
  }

  function submissions(candidateId: string, includeActivityCredentials = false): RoundSubmission[] {
    if (!db.prepare("SELECT 1 FROM demo_candidate WHERE id=?").get(candidateId))
      throw new RsvpError(404, "候选人不存在。");
    const rounds = db.prepare(`SELECT round_id,entered_at,name,kind FROM candidate_round_history
      JOIN interview_rounds ON id=round_id WHERE candidate_id=? ORDER BY entered_at,sort_order`).all(candidateId);
    const invites = db.prepare(`SELECT d.round_id,d.state,a.snapshot FROM demo_interview d
      LEFT JOIN interview_activity a ON a.invite_id=d.id WHERE d.candidate_id=? ORDER BY d.rowid DESC`).all(candidateId);
    return rounds.map((round) => ({
      roundId: String(round.round_id), roundName: String(round.name), roundKind: round.kind as InterviewRoundKind, enteredAt: String(round.entered_at),
      review: getReview(candidateId, String(round.round_id)),
      invitations: invites.filter((entry) => entry.round_id === round.round_id).map((entry): InviteSubmission => {
        const state = JSON.parse(String(entry.state)) as InterviewInvitation;
        const activities = entry.snapshot ? JSON.parse(String(entry.snapshot)) as ActivitySnapshot : undefined;
        const form = activities?.form;
        const mbti = activities?.mbti;
        const custom = activities?.customActivities ?? [];
        const results = custom.length ? activityStorage.history(state.id) : [];
        return {
          inviteId: state.id, issuedAt: state.createdAt, rsvpStatus: state.rsvpStatus, respondedAt: state.respondedAt,
          form: form?.submittedAt ? { submittedAt: form.submittedAt, questions: form.questions, answers: form.answers } : null,
          mbti: mbti?.submittedAt && mbti.result ? { submittedAt: mbti.submittedAt, result: mbti.result } : null,
          customActivities: custom.flatMap(({ id: activityId, title, kind, required }) =>
            results.filter((item) => item.activityId === activityId).map(({ result, generation }) => ({ activityId, title, kind, required, generation, ...result }))),
          ...(includeActivityCredentials ? { activityCredentials: custom.filter(({ kind }) => browser || kind === "external_app")
            .map((activity) => activityStorage.credential(state.id, activity)) } : {}),
        };
      }),
    }));
  }

  function completedByRound(candidateId: string) {
    const rows = db.prepare(`SELECT round_id,
        MAX(json_extract(snapshot, '$.form.submittedAt') IS NOT NULL) AS form,
        MAX(json_extract(snapshot, '$.mbti.submittedAt') IS NOT NULL) AS mbti
      FROM interview_activity WHERE candidate_id=? GROUP BY round_id`).all(candidateId);
    return Object.fromEntries(rows.map((row) => [String(row.round_id), { form: !!row.form, mbti: !!row.mbti }]));
  }

  function progress(candidateId: string, round: InterviewRound): RoundProgress {
    const rows = db.prepare(`SELECT a.invite_id,a.snapshot FROM demo_interview d JOIN interview_activity a ON a.invite_id=d.id
      WHERE d.candidate_id=? AND d.round_id=? ORDER BY d.rowid DESC`).all(candidateId, round.id)
    const entries = rows.map((row) => JSON.parse(String(row.snapshot)) as ActivitySnapshot);
    const active = entries[0];
    const formDone = entries.some((entry) => !!entry.form?.submittedAt);
    const latestMbti = entries.find((entry) => !!entry.mbti?.submittedAt)?.mbti;
    const custom = active ? (active.customActivities ?? []) : round.customActivities.filter(({ enabled }) => enabled);
    const inviteId = rows[0] ? String(rows[0].invite_id) : null;
    const states = inviteId ? custom.flatMap((activity) => {
      const current = currentActivity(inviteId, activity).submission;
      return current ? [{ id: activity.id, title: activity.title, status: current.status, progress: current.progress, badge: current.badge }] : [];
    }) : [];
    const status = (saved: boolean, enabled: boolean, draft: boolean): RoundProgress["form"] => {
      if (saved) return "submitted";
      if (!enabled) return "off";
      return draft ? "draft" : "pending";
    };
    return {
      form: status(formDone, !!(active ? active.form : round.formConfig.enabled), !!active?.form?.revision),
      mbti: status(!!latestMbti, !!(active ? active.mbti : round.mbtiConfig.enabled), !!active?.mbti?.revision),
      mbtiType: latestMbti?.result?.type ?? null,
      customActivities: { completed: states.filter(isActivityTerminal).length, total: custom.length, ...(states.length ? { statuses: states } : {}) },
    };
  }

  function exportCsv(roundId: string) {
    const round = requireRound(roundId);
    const rows = db.prepare(`SELECT d.candidate_id,c.name,c.email,a.snapshot
      FROM demo_interview d JOIN interview_activity a ON a.invite_id=d.id
      JOIN demo_candidate c ON c.id=d.candidate_id WHERE d.round_id=? ORDER BY d.rowid DESC`).all(roundId);
    const questions = new Map(round.formConfig.questions.map((question) => [question.id, question.title]));
    const collected = new Map<string, { name: string; email: string; date: string; answers: FormAnswers }>();
    for (const row of rows) {
      const form = (JSON.parse(String(row.snapshot)) as ActivitySnapshot).form;
      if (!form?.submittedAt || collected.has(String(row.candidate_id))) continue;
      for (const question of form.questions) if (!questions.has(question.id)) questions.set(question.id, question.title);
      collected.set(String(row.candidate_id), { name: String(row.name), email: String(row.email), date: form.submittedAt, answers: form.answers });
    }
    const answer = (value: FormAnswers[string] | undefined) => Array.isArray(value) ? value.join(" / ") : String(value ?? "");
    return "\uFEFF" + [
      ["姓名", "邮箱", "提交时间", ...questions.values()],
      ...[...collected.values()].map((row) => [row.name, row.email, row.date, ...[...questions.keys()].map((key) => answer(row.answers[key]))]),
    ].map((row) => row.map(csvCell).join(",")).join("\r\n");
  }

  return { list, requireRound, create, update, archive, reorder, initialRoundId, register, saveSchedule, scheduleFor, promote, issue, inviteActivities, writeActivity,
    requireCustomActivity, readSnapshot, activityStorage, submissions, progress, completedByRound, exportCsv, requireMembership, getReview, saveReview, deleteReview };
}
