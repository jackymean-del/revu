-- 009_marks.sql: assessments and the marks entered for them (pilot P0.3,
-- a thin form of blueprint v2.1 to v2.3, v2.9 to v2.13 and Part 74).
--
-- An assessment is held in one period for one subject and the sections it
-- covers. Its parts are the entry columns: one part named for the total in
-- Total marks mode, or one per paper section in Section-wise mode. A part of
-- kind additional is a component such as a practical, with its own code.
-- Question-wise entry adds questions under parts later.
--
-- Evidence is one row per student and part, with a state. A blank is
-- pending and never zero: only a scored row has a value (decision D16).
-- Every change goes through the evidence write service, which bumps the
-- version and writes a history row in the same transaction.

CREATE TYPE value_state AS ENUM ('scored', 'absent', 'exempt', 'not_applicable', 'pending', 'not_assessed');
CREATE TYPE entry_source AS ENUM ('grid', 'question', 'scan', 'import', 'makeup');
CREATE TYPE assess_status AS ENUM ('draft', 'published', 'open', 'locked');
CREATE TYPE part_kind AS ENUM ('main', 'additional');

CREATE TABLE assessments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  year_id uuid NOT NULL,
  period_id uuid NOT NULL,
  level_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  title text NOT NULL CHECK (btrim(title) <> ''),
  kind text NOT NULL DEFAULT 'periodic_test',   -- periodic_test, midterm, term_end, oral, practical, project
  entry_mode text NOT NULL CHECK (entry_mode IN ('total', 'sections')),
  status assess_status NOT NULL DEFAULT 'open',
  held_on date,
  created_by text,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, year_id) REFERENCES academic_years (org_id, id),
  FOREIGN KEY (org_id, period_id) REFERENCES periods (org_id, id),
  FOREIGN KEY (org_id, level_id) REFERENCES levels (org_id, id),
  FOREIGN KEY (org_id, subject_id) REFERENCES subjects (org_id, id)
);
CREATE INDEX assessments_period ON assessments (period_id, subject_id) WHERE deleted_at IS NULL;
SELECT revu_tenant_table('assessments');

CREATE TABLE assessment_scopes (
  org_id uuid NOT NULL REFERENCES orgs,
  assessment_id uuid NOT NULL,
  section_id uuid NOT NULL,
  PRIMARY KEY (assessment_id, section_id),
  FOREIGN KEY (org_id, assessment_id) REFERENCES assessments (org_id, id),
  FOREIGN KEY (org_id, section_id) REFERENCES sections (org_id, id)
);
CREATE INDEX assessment_scopes_section ON assessment_scopes (section_id);
SELECT revu_tenant_table('assessment_scopes');

CREATE TABLE assessment_parts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  assessment_id uuid NOT NULL,
  seq int NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  kind part_kind NOT NULL DEFAULT 'main',
  component_code text,              -- required when kind = 'additional'
  counts_in_total boolean NOT NULL DEFAULT true,
  max_marks numeric(8,2) NOT NULL CHECK (max_marks > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, assessment_id) REFERENCES assessments (org_id, id),
  CHECK (kind = 'main' OR btrim(coalesce(component_code, '')) <> '')
);
CREATE INDEX assessment_parts_assessment ON assessment_parts (assessment_id) WHERE deleted_at IS NULL;
SELECT revu_tenant_table('assessment_parts');

-- A bulk write (an upload, a paste, marking blanks not applicable, a
-- component absent for many) is one undoable step.
CREATE TABLE bulk_writes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  assessment_id uuid NOT NULL,
  section_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('upload', 'paste', 'blanks_not_applicable', 'component_absent')),
  cells int NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_by text,
  undone_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, assessment_id) REFERENCES assessments (org_id, id),
  FOREIGN KEY (org_id, section_id) REFERENCES sections (org_id, id)
);
SELECT revu_tenant_table('bulk_writes');

CREATE TABLE evidence (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  student_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  part_id uuid NOT NULL,
  value numeric(8,2),
  state value_state NOT NULL DEFAULT 'pending',
  source entry_source NOT NULL,
  entered_by text,
  version int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (student_id, part_id),
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id),
  FOREIGN KEY (org_id, assessment_id) REFERENCES assessments (org_id, id),
  FOREIGN KEY (org_id, part_id) REFERENCES assessment_parts (org_id, id),
  CHECK ((state = 'scored') = (value IS NOT NULL)),
  CHECK (value IS NULL OR value >= 0)
);
CREATE INDEX evidence_assessment ON evidence (assessment_id);
SELECT revu_tenant_table('evidence');

CREATE TABLE evidence_history (
  org_id uuid NOT NULL REFERENCES orgs,
  evidence_id uuid NOT NULL,
  version int NOT NULL,
  value numeric(8,2),
  state value_state NOT NULL,
  source entry_source NOT NULL,
  bulk_id uuid,                     -- the bulk write it was part of, to undo it in one step
  undo_of uuid,                     -- set on the rows an undo wrote
  changed_by text,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evidence_id, version),
  FOREIGN KEY (org_id, evidence_id) REFERENCES evidence (org_id, id),
  FOREIGN KEY (org_id, bulk_id) REFERENCES bulk_writes (org_id, id)
);
CREATE INDEX evidence_history_bulk ON evidence_history (bulk_id) WHERE bulk_id IS NOT NULL;
SELECT revu_tenant_table('evidence_history');

-- Row status for one student in one assessment (Part 74.2), held apart
-- from the marks: setting it hides them, clearing it brings them back.
CREATE TABLE assessment_participation (
  org_id uuid NOT NULL REFERENCES orgs,
  assessment_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('not_applicable', 'absent', 'exempt', 'left')),
  reason_code text,
  note text,
  effective_from date,
  set_by text,
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_id, student_id),
  FOREIGN KEY (org_id, assessment_id) REFERENCES assessments (org_id, id),
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id)
);
SELECT revu_tenant_table('assessment_participation');

-- Offline edits carry an op id; a replayed op returns its first answer.
CREATE TABLE sync_outbox_receipts (
  org_id uuid NOT NULL REFERENCES orgs,
  op_id text NOT NULL CHECK (length(op_id) BETWEEN 8 AND 80),
  device_id text,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, op_id)
);
SELECT revu_tenant_table('sync_outbox_receipts');

-- What results must recompute once the scheme engine arrives (blueprint
-- v2.2: v2 writes the intent, v3 consumes it).
CREATE TABLE result_stale_intents (
  org_id uuid NOT NULL REFERENCES orgs,
  student_id uuid NOT NULL,
  period_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  marked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, period_id, subject_id),
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id)
);
SELECT revu_tenant_table('result_stale_intents');

-- A person's own view of an entry grid (Part 73, P0 stage): column order,
-- visibility and pinning, and how students are sorted. Order never changes
-- a calculation.
CREATE TABLE layout_profiles (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  surface text NOT NULL CHECK (surface IN ('entry_grid', 'marksheet', 'score_table', 'report', 'analysis', 'export')),
  scope_kind text NOT NULL CHECK (scope_kind IN ('org', 'group', 'level', 'section', 'template', 'user')),
  scope_id text NOT NULL,           -- for a personal entry grid view: the assessment
  user_id text,                     -- the owner of a personal view
  name text NOT NULL DEFAULT 'My view',
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE NULLS NOT DISTINCT (org_id, surface, scope_kind, scope_id, user_id)
);
SELECT revu_tenant_table('layout_profiles');

CREATE TABLE layout_items (
  org_id uuid NOT NULL REFERENCES orgs,
  profile_id uuid NOT NULL,
  item_kind text NOT NULL,          -- part, for an entry grid
  item_id text NOT NULL,
  position int NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  pinned boolean NOT NULL DEFAULT false,
  group_label text,
  width int,
  PRIMARY KEY (profile_id, item_kind, item_id),
  FOREIGN KEY (org_id, profile_id) REFERENCES layout_profiles (org_id, id)
);
SELECT revu_tenant_table('layout_items');

CREATE TABLE layout_sort_rules (
  org_id uuid NOT NULL REFERENCES orgs,
  profile_id uuid NOT NULL,
  seq int NOT NULL,
  field text NOT NULL CHECK (field IN ('roll_no', 'admission_no', 'name')),
  direction text NOT NULL DEFAULT 'asc' CHECK (direction IN ('asc', 'desc')),
  PRIMARY KEY (profile_id, seq),
  FOREIGN KEY (org_id, profile_id) REFERENCES layout_profiles (org_id, id)
);
SELECT revu_tenant_table('layout_sort_rules');
