import { createSecretToken } from "../../shared/security/tokens.ts";
import type { SqlDatabase } from "../../shared/data/sql-database.ts";
import type { DesignTarget } from "../../shared/contracts/design.ts";
import { OPEN_API_SCOPES, type OpenApiKeyInfo, type OpenApiScope, type SavedDesignTemplate } from "../../shared/contracts/open-api.ts";
import { RsvpError } from "../rsvp/error.ts";
import {
  legacyTemplateDigests, planFeaturedPresetUpdate, templateContent, type FeaturedPreset,
} from "../../shared/design/featured-templates.ts";

type TemplateInput = Pick<SavedDesignTemplate, "name" | "document" | "origin">;
type KeyRow = {
  id: string;
  name: string;
  masked_prefix: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};


function keyInfo(row: KeyRow): OpenApiKeyInfo {
  return {
    id: row.id,
    name: row.name,
    maskedPrefix: row.masked_prefix,
    scopes: JSON.parse(row.scopes),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export function createAgentStore(db: SqlDatabase, hashKey: (input: string) => string, clock = () => new Date(), browser = false) {
  db.exec(`
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS open_api_keys (
      id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE,
      masked_prefix TEXT NOT NULL, name TEXT NOT NULL, scopes TEXT NOT NULL,
      created_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS saved_design_templates (
      id TEXT PRIMARY KEY, target TEXT NOT NULL, payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS demo_workspace_initializations (
      name TEXT PRIMARY KEY, initialized_at TEXT NOT NULL
    );
  `);
  const now = () => clock().toISOString();

  function getTemplate(id: string): SavedDesignTemplate | null {
    const row = db.prepare("SELECT payload FROM saved_design_templates WHERE id = ?").get(id);
    return row ? JSON.parse(String(row.payload)) : null;
  }
  function requireTemplate(id: string) {
    const template = getTemplate(id);
    if (!template) throw new RsvpError(404, "模板不存在。");
    return template;
  }
  function writeTemplate(id: string, input: TemplateInput, mode: "create" | "ensure" | "replace" | "upsert") {
    db.exec("BEGIN IMMEDIATE");
    try {
      const existing = getTemplate(id);
      if (mode === "create" && existing) throw new RsvpError(409, "模板已存在。");
      if (mode === "replace" && !existing) throw new RsvpError(404, "模板不存在。");
      if (mode === "ensure" && existing) {
        db.exec("COMMIT");
        return existing;
      }
      if (existing && input.document.target !== existing.target)
        throw new RsvpError(409, "编辑模板时不可更换设计目标。");
      const timestamp = now();
      const template: SavedDesignTemplate = {
        id, name: input.name, target: input.document.target, schemaVersion: 1,
        document: input.document, origin: input.origin ?? existing?.origin ?? "manual",
        createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp,
      };
      db.prepare(`INSERT INTO saved_design_templates VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`)
        .run(id, template.target, JSON.stringify(template));
      db.exec("COMMIT");
      return template;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function bindPresetDefaults(roundDefaults: readonly { roundId: string; emailId: string; inviteId: string }[], timestamp: string) {
    if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='interview_rounds'").get()) return;
    const bind = db.prepare(`UPDATE interview_rounds
      SET default_email_template_id=COALESCE(default_email_template_id,?),
          default_invite_template_id=COALESCE(default_invite_template_id,?), updated_at=?
      WHERE id=? AND archived_at IS NULL
        AND (default_email_template_id IS NULL OR default_invite_template_id IS NULL)`);
    for (const { roundId, emailId, inviteId } of roundDefaults) bind.run(emailId, inviteId, timestamp, roundId);
  }

  function listTemplates(target?: DesignTarget): SavedDesignTemplate[] {
    const rows = target
      ? db.prepare("SELECT payload FROM saved_design_templates WHERE target = ?").all(target)
      : db.prepare("SELECT payload FROM saved_design_templates").all();
    return rows.map((row) => JSON.parse(String(row.payload)) as SavedDesignTemplate)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  return {
    initializeTemplatePresets(
      loadPresets: () => readonly (TemplateInput & { id: string })[],
      roundDefaults: readonly { roundId: string; emailId: string; inviteId: string }[],
      { initialization = "saved-template-presets-v1", onlyIfEmpty = true } = {},
    ) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const seen = db.prepare("SELECT 1 FROM demo_workspace_initializations WHERE name=?").get(initialization);
        if (!seen) {
          const timestamp = now();
          if (!onlyIfEmpty || !db.prepare("SELECT 1 FROM saved_design_templates LIMIT 1").get()) {
            const save = db.prepare(onlyIfEmpty
              ? "INSERT INTO saved_design_templates VALUES (?,?,?)"
              : "INSERT INTO saved_design_templates VALUES (?,?,?) ON CONFLICT(id) DO NOTHING");
            for (const { id, document, name } of loadPresets()) {
              const template: SavedDesignTemplate = {
                id, name, target: document.target, schemaVersion: 1, document,
                origin: "manual", createdAt: timestamp, updatedAt: timestamp,
              };
              save.run(id, template.target, JSON.stringify(template));
            }
            bindPresetDefaults(roundDefaults, timestamp);
          }
          db.prepare("INSERT INTO demo_workspace_initializations VALUES (?,?)").run(initialization, timestamp);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    updateFeaturedPresets(presets: FeaturedPreset[], roundDefaults: readonly { roundId: string; emailId: string; inviteId: string }[], allowAdd: boolean) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const timestamp = now();
        const { writes, summary } = planFeaturedPresetUpdate(listTemplates(), presets,
          (template) => hashKey(templateContent(template)) === legacyTemplateDigests[template.id],
          { allowAdd, timestamp, makeId: () => crypto.randomUUID() });
        const write = db.prepare(`INSERT INTO saved_design_templates VALUES (?,?,?)
          ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`);
        for (const template of writes) write.run(template.id, template.target, JSON.stringify(template));
        if (allowAdd) bindPresetDefaults(roundDefaults, timestamp);
        db.exec("COMMIT");
        return summary;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    listTemplates,
    requireTemplate,
    templateExists: (id: string) => getTemplate(id) !== null,
    writeTemplate,
    deleteTemplate(id: string, required: boolean) {
      const result = db.prepare("DELETE FROM saved_design_templates WHERE id = ?").run(id);
      if (required && result.changes === 0) throw new RsvpError(404, "模板不存在。");
      return { deleted: true };
    },
    listKeys(): OpenApiKeyInfo[] {
      return (db.prepare("SELECT * FROM open_api_keys ORDER BY created_at DESC, rowid DESC").all() as KeyRow[]).map(keyInfo);
    },
    createKey(body: Record<string, unknown>) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const scopes = body.scopes;
      if (!name || name.length > 80) throw new RsvpError(400, "请输入 1–80 字的 Key 名称。");
      if (!Array.isArray(scopes) || scopes.length < 1 || scopes.length > OPEN_API_SCOPES.length
        || scopes.some((scope) => !OPEN_API_SCOPES.includes(scope)))
        throw new RsvpError(400, "请选择有效的 API 权限。");
      const secret = `${browser ? "cf_demo_" : "cf_open_"}${createSecretToken()}`;
      const row: KeyRow = {
        id: crypto.randomUUID(), name, masked_prefix: `${secret.slice(0, 16)}…`,
        scopes: JSON.stringify([...new Set(scopes)]), created_at: now(),
        last_used_at: null, revoked_at: null,
      };
      db.prepare("INSERT INTO open_api_keys VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)")
        .run(row.id, hashKey(secret), row.masked_prefix, row.name, row.scopes, row.created_at);
      return { ...keyInfo(row), secret };
    },
    revokeKey(id: string): OpenApiKeyInfo {
      const result = db.prepare("UPDATE open_api_keys SET revoked_at=COALESCE(revoked_at, ?) WHERE id=?").run(now(), id);
      if (result.changes === 0) throw new RsvpError(404, "API Key 不存在。");
      return keyInfo(db.prepare("SELECT * FROM open_api_keys WHERE id=?").get(id) as KeyRow);
    },
    authorize(authorization: string | undefined, required: OpenApiScope) {
      const match = /^Bearer (cf_open_[a-f0-9]{64})$/i.exec(authorization ?? "");
      if (!match) throw new RsvpError(401, "请提供有效的 Bearer API Key。");
      const row = db.prepare("SELECT * FROM open_api_keys WHERE hash=? AND revoked_at IS NULL").get(hashKey(match[1])) as KeyRow | undefined;
      if (!row) throw new RsvpError(401, "API Key 无效或已撤销。");
      const info = keyInfo(row);
      if (!info.scopes.includes(required)) throw new RsvpError(403, `此 API Key 缺少 ${required} 权限。`);
      db.prepare("UPDATE open_api_keys SET last_used_at = ? WHERE id = ?").run(now(), row.id);
      return info;
    },
    close: () => db.close(),
  };
}

export type AgentStore = ReturnType<typeof createAgentStore>;
