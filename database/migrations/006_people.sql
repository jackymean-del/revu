-- 006_people.sql: people details and import jobs.
--
-- A student is one permanent identity; where they study each year is an
-- enrolment (Part 31.3). Leaving (TC), graduating and re-admission change
-- the student's status, never the identity (D16: TC is a student status,
-- not a mark).

ALTER TABLE students
  ADD COLUMN preferred_name text,
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'graduated'));

ALTER TABLE staff ADD COLUMN designation text;

-- One import of a file: its preview (what would be created, updated or
-- rejected, with reasons) and, once applied, the result. The rows to apply
-- are kept with the job so applying uses exactly what was previewed.
CREATE TABLE import_jobs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  kind text NOT NULL CHECK (kind IN ('students')),
  status text NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed', 'applied')),
  file_name text NOT NULL,
  total_rows int NOT NULL,
  options jsonb NOT NULL DEFAULT '{}',
  accepted jsonb NOT NULL DEFAULT '[]',   -- rows that passed, ready to apply
  rejected jsonb NOT NULL DEFAULT '[]',   -- rows that did not, with reasons
  summary jsonb NOT NULL DEFAULT '{}',    -- counts of the preview and of the apply
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);
CREATE INDEX import_jobs_recent ON import_jobs (org_id, created_at DESC);

SELECT revu_tenant_table('import_jobs');
