-- 012_reports.sql: report cards and marksheets (pilot P0.5; blueprint v23
-- B8.2 to B8.4).
--
-- Branding is versioned: each save adds a version, and a report run keeps
-- the version it used, so later edits never change a report already made.
-- A template holds the report's sections, their order, the subject order,
-- the sign-off lines and the print options, also versioned. A run is one
-- generation for a section and period; each item holds the facts the report
-- was drawn from, so it can be shown again exactly as it was.

CREATE TABLE branding_versions (
  org_id uuid NOT NULL REFERENCES orgs,
  version int NOT NULL CHECK (version >= 1),
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  address text,
  contact text,
  affiliation text,
  header_note text,
  logo bytea CHECK (logo IS NULL OR octet_length(logo) <= 262144),
  logo_type text CHECK (logo_type IN ('image/png', 'image/jpeg')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, version),
  CHECK ((logo IS NULL) = (logo_type IS NULL))
);
SELECT revu_tenant_table('branding_versions');

CREATE TABLE report_templates (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  name text NOT NULL CHECK (btrim(name) <> ''),
  version int NOT NULL DEFAULT 1,
  config jsonb NOT NULL,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);
-- One template per institution in the pilot.
CREATE UNIQUE INDEX report_templates_one ON report_templates (org_id);
SELECT revu_tenant_table('report_templates');

CREATE TABLE report_template_versions (
  org_id uuid NOT NULL REFERENCES orgs,
  template_id uuid NOT NULL,
  version int NOT NULL,
  config jsonb NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, version),
  FOREIGN KEY (org_id, template_id) REFERENCES report_templates (org_id, id)
);
SELECT revu_tenant_table('report_template_versions');

CREATE TABLE report_runs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  section_id uuid NOT NULL,
  period_id uuid NOT NULL,
  template_id uuid NOT NULL,
  template_version int NOT NULL,
  branding_version int,
  options jsonb NOT NULL DEFAULT '{}',
  students int NOT NULL DEFAULT 0,
  pages int NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, section_id) REFERENCES sections (org_id, id),
  FOREIGN KEY (org_id, period_id) REFERENCES periods (org_id, id),
  FOREIGN KEY (org_id, template_id) REFERENCES report_templates (org_id, id)
);
SELECT revu_tenant_table('report_runs');

CREATE TABLE report_run_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  run_id uuid NOT NULL,
  student_id uuid NOT NULL,
  facts jsonb NOT NULL,
  pages int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, run_id) REFERENCES report_runs (org_id, id),
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id)
);
CREATE INDEX report_run_items_run ON report_run_items (run_id);
SELECT revu_tenant_table('report_run_items');
