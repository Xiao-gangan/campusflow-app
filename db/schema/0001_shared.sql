-- CampusFlow shared foundation schema (single organization).
-- Design artifact for 2A-1. Do not apply automatically; migrate through the
-- reviewed hosted database workflow in a later batch.
--
-- No org_id or tenant columns: the system serves exactly one organization.

CREATE TABLE app.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  week_count integer NOT NULL DEFAULT 18 CHECK (week_count BETWEEN 1 AND 30),
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date < end_date)
);
CREATE UNIQUE INDEX terms_one_active_idx ON app.terms (active) WHERE active;

CREATE TABLE app.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text UNIQUE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'recruiter', 'scheduler', 'member')),
  department_id uuid REFERENCES app.departments (id),
  status text NOT NULL DEFAULT 'pending_onboarding'
    CHECK (status IN ('pending_onboarding', 'active', 'inactive')),
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'active' OR activated_at IS NOT NULL)
);
CREATE INDEX members_status_idx ON app.members (status);

CREATE TABLE app.member_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES app.members (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX member_sessions_member_idx
  ON app.member_sessions (member_id, expires_at);

CREATE TABLE app.recruitment_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL REFERENCES app.terms (id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed')),
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES app.recruitment_cycles (id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  student_no text,
  major text,
  grade text,
  phone text,
  department_id uuid REFERENCES app.departments (id),
  skills text[] NOT NULL DEFAULT '{}',
  intro text,
  personal_note text,
  source text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'screening', 'interview', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, email)
);
CREATE INDEX applicants_cycle_status_idx
  ON app.applicants (cycle_id, status, created_at DESC);

CREATE TABLE app.timetable_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES app.members (id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES app.terms (id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('manual', 'import')),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, term_id)
);

CREATE TABLE app.onboarding_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES app.applicants (id) ON DELETE CASCADE,
  member_id uuid REFERENCES app.members (id),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN (
      'invited', 'accepted', 'profile_completed', 'timetable_confirmed',
      'account_activated', 'completed', 'expired', 'revoked'
    )),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  accepted_at timestamptz,
  profile_completed_at timestamptz,
  timetable_confirmed_at timestamptz,
  account_activated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX onboarding_one_open_per_applicant_idx
  ON app.onboarding_invites (applicant_id)
  WHERE status NOT IN ('completed', 'expired', 'revoked');
CREATE INDEX onboarding_invites_status_idx ON app.onboarding_invites (status);

CREATE TABLE app.onboarding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES app.onboarding_invites (id) ON DELETE CASCADE,
  step text NOT NULL
    CHECK (step IN (
      'invited', 'accepted', 'profile_completed', 'timetable_confirmed',
      'account_activated', 'completed', 'expired', 'revoked'
    )),
  actor_kind text NOT NULL CHECK (actor_kind IN ('candidate', 'admin', 'system')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX onboarding_events_invite_idx
  ON app.onboarding_events (invite_id, created_at);

CREATE TABLE app.demo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_version text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'resetting')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reset_at timestamptz
);

CREATE TABLE app.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_kind text NOT NULL
    CHECK (actor_kind IN ('member', 'candidate', 'demo', 'anonymous', 'system')),
  actor_id text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  result text NOT NULL CHECK (result IN ('success', 'failure', 'denied')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_at_idx ON app.audit_logs (created_at DESC);

-- Email templates/assets, courses, shifts and schedule versions are owned by
-- later module migrations. Their TypeScript contracts live in shared/contracts.
--
-- Production activation must update onboarding_invites and members in one
-- transaction (or one conditional statement). The local in-memory adapter only
-- simulates this guarantee and does not establish production atomicity.
-- Admin bootstrap must also be race-safe, e.g. a unique admin constraint plus a
-- single insert/transaction that creates the admin and first session.
