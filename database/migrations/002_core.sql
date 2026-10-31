-- 002_core.sql: organisations, structure, people, memberships, audit log,
-- terminology and feature flags.
--
-- Tenancy: every table below carries org_id and a row-level security policy.
-- The server talks to the database as revu_app, which owns nothing and cannot
-- bypass RLS, so it sees only the organisation named in app.org_id for the
-- current transaction, and nothing at all when app.org_id is not set.
-- Migrations run as the owner role (MIGRATE_DATABASE_URL).

-- The application role. It can log in once the server sets its password from
-- APP_DB_PASSWORD at start (internal/db.SetAppPassword).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'revu_app') THEN
    CREATE ROLE revu_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO revu_app;

-- The organisation of the current transaction, or null outside one.
CREATE FUNCTION app_org_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;

CREATE FUNCTION set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- Every tenant table is registered through this, so each one gets the same
-- policy, grants and updated_at trigger. Later migrations call it too.
CREATE FUNCTION revu_tenant_table(t regclass) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY tenant ON %s USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id())', t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO revu_app', t);
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = t AND attname = 'updated_at' AND NOT attisdropped) THEN
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION revu_tenant_table(regclass) FROM PUBLIC;

CREATE TYPE institution_type AS ENUM ('school', 'college', 'university');
CREATE TYPE member_role AS ENUM ('admin', 'principal', 'coordinator', 'teacher', 'class_teacher', 'viewer');

-- Organisations ---------------------------------------------------------------

CREATE TABLE orgs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  institution_type institution_type NOT NULL DEFAULT 'school',
  preset text NOT NULL DEFAULT 'school',
  time_zone text NOT NULL DEFAULT 'Asia/Kolkata',
  settings jsonb NOT NULL DEFAULT '{}',
  clerk_org_id text UNIQUE,     -- the shared bhusku Clerk organisation
  external_id text,             -- schedU's id for the same institution, when linked
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
-- An organisation is its own tenant: the app sees only its own row and can
-- change its settings. Creating one is a sign-up step run by the owner role.
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON orgs USING (id = app_org_id()) WITH CHECK (id = app_org_id());
GRANT SELECT, UPDATE ON orgs TO revu_app;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON orgs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Structure -------------------------------------------------------------------
-- Parents carry UNIQUE (org_id, id) so children reference them by
-- (org_id, parent_id): a row can never point at another organisation's row,
-- even with a known id (foreign key checks do not apply RLS).

CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  name text NOT NULL CHECK (btrim(name) <> ''),
  address text,
  logo_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id)
);
CREATE UNIQUE INDEX branches_name ON branches (org_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE academic_years (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  label text NOT NULL CHECK (btrim(label) <> ''),
  starts_on date NOT NULL,
  ends_on date NOT NULL CHECK (ends_on > starts_on),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id)
);
CREATE UNIQUE INDEX academic_years_label ON academic_years (org_id, label) WHERE deleted_at IS NULL;

CREATE TABLE periods (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  year_id uuid NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  seq int NOT NULL,
  kind text NOT NULL DEFAULT 'term',
  starts_on date NOT NULL,
  ends_on date NOT NULL CHECK (ends_on >= starts_on),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, year_id) REFERENCES academic_years (org_id, id)
);
CREATE UNIQUE INDEX periods_seq ON periods (year_id, seq) WHERE deleted_at IS NULL;

CREATE TABLE levels (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  name text NOT NULL CHECK (btrim(name) <> ''),
  seq int NOT NULL,
  stage text,                   -- for example foundational or secondary; from the preset
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id)
);
CREATE UNIQUE INDEX levels_name ON levels (org_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE sections (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  branch_id uuid NOT NULL,
  level_id uuid NOT NULL,
  year_id uuid NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, branch_id) REFERENCES branches (org_id, id),
  FOREIGN KEY (org_id, level_id) REFERENCES levels (org_id, id),
  FOREIGN KEY (org_id, year_id) REFERENCES academic_years (org_id, id)
);
CREATE UNIQUE INDEX sections_name ON sections (year_id, branch_id, level_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE subjects (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  name text NOT NULL CHECK (btrim(name) <> ''),
  code text,
  domain_id uuid,               -- framework domain, from v3
  kind text NOT NULL DEFAULT 'academic' CHECK (kind IN ('academic', 'co_curricular')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id)
);
CREATE UNIQUE INDEX subjects_name ON subjects (org_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE level_subjects (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  level_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  optional boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  FOREIGN KEY (org_id, level_id) REFERENCES levels (org_id, id),
  FOREIGN KEY (org_id, subject_id) REFERENCES subjects (org_id, id)
);
CREATE UNIQUE INDEX level_subjects_pair ON level_subjects (level_id, subject_id) WHERE deleted_at IS NULL;

-- People ----------------------------------------------------------------------

CREATE TABLE staff (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  name text NOT NULL CHECK (btrim(name) <> ''),
  email text,
  phone text,
  employee_no text,
  clerk_user_id text,           -- set once the person signs in
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id)
);
CREATE UNIQUE INDEX staff_email ON staff (org_id, lower(email)) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX staff_employee_no ON staff (org_id, employee_no) WHERE deleted_at IS NULL AND employee_no IS NOT NULL;

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  admission_no text NOT NULL CHECK (btrim(admission_no) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  dob date,
  guardians jsonb NOT NULL DEFAULT '[]',
  photo_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id)
);
-- The admission number is the key a CSV import matches on, so re-running an
-- import updates instead of duplicating.
CREATE UNIQUE INDEX students_admission_no ON students (org_id, admission_no) WHERE deleted_at IS NULL;

CREATE TABLE enrolments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  student_id uuid NOT NULL,
  section_id uuid NOT NULL,
  year_id uuid NOT NULL,
  roll_no text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id),
  FOREIGN KEY (org_id, section_id) REFERENCES sections (org_id, id),
  FOREIGN KEY (org_id, year_id) REFERENCES academic_years (org_id, id)
);
CREATE UNIQUE INDEX enrolments_one_per_year ON enrolments (student_id, year_id) WHERE deleted_at IS NULL;
CREATE INDEX enrolments_section ON enrolments (section_id) WHERE deleted_at IS NULL;

-- subject_id null means class teacher of the section, across its subjects.
CREATE TABLE teaching_assignments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  staff_id uuid NOT NULL,
  section_id uuid NOT NULL,
  subject_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  FOREIGN KEY (org_id, staff_id) REFERENCES staff (org_id, id),
  FOREIGN KEY (org_id, section_id) REFERENCES sections (org_id, id),
  FOREIGN KEY (org_id, subject_id) REFERENCES subjects (org_id, id)
);
CREATE UNIQUE INDEX teaching_assignments_unique ON teaching_assignments (staff_id, section_id, subject_id)
  NULLS NOT DISTINCT WHERE deleted_at IS NULL;

-- One person can hold several roles, and a role can be limited to a branch
-- (branch_id null means the whole organisation).
CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  clerk_user_id text NOT NULL,
  branch_id uuid,
  role member_role NOT NULL,
  staff_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, branch_id) REFERENCES branches (org_id, id),
  FOREIGN KEY (org_id, staff_id) REFERENCES staff (org_id, id),
  UNIQUE NULLS NOT DISTINCT (org_id, clerk_user_id, branch_id, role)
);
CREATE INDEX memberships_user ON memberships (clerk_user_id);

-- Platform --------------------------------------------------------------------

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  actor_id text,                -- Clerk user id, or null for the system
  action text NOT NULL,         -- create, update, delete, restore, import, ...
  entity text NOT NULL,
  entity_id uuid,
  before jsonb,
  after jsonb,
  request_id text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity ON audit_log (org_id, entity, entity_id, at DESC);
CREATE INDEX audit_log_at ON audit_log (org_id, at DESC);

CREATE TABLE terminology (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  branch_id uuid,               -- null means the whole organisation
  key text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  singular text NOT NULL,
  plural text NOT NULL,
  form jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, branch_id) REFERENCES branches (org_id, id),
  UNIQUE NULLS NOT DISTINCT (org_id, branch_id, key, locale)
);

CREATE TABLE feature_flags (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);

SELECT revu_tenant_table(t) FROM unnest(ARRAY[
  'branches', 'academic_years', 'periods', 'levels', 'sections', 'subjects',
  'level_subjects', 'staff', 'students', 'enrolments', 'teaching_assignments',
  'memberships', 'audit_log', 'terminology', 'feature_flags'
]::regclass[]) AS t;

-- The audit log is append-only for the application.
REVOKE UPDATE, DELETE ON audit_log FROM revu_app;
