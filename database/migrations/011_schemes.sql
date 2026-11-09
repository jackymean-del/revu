-- 011_schemes.sql: schemes, where they apply, and the results they compute
-- (pilot P0.4, a thin form of blueprint v3.1 to v3.8 and Part 4).
--
-- A scheme is versioned JSON checked by the engine in internal/scheme. The
-- versions of one scheme share a family_id, the id of version 1. A
-- published version never changes: editing makes the next version, and a
-- result keeps the version it was computed with until it is recomputed.
--
-- An assignment says which scheme family applies to a level, period and
-- subject; null means all. The most specific assignment wins, and the
-- latest published version of its family is the one used.

CREATE TYPE result_state AS ENUM ('complete', 'provisional', 'blocked', 'not_assessed');

CREATE TABLE schemes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  family_id uuid NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  board text,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  definition jsonb NOT NULL,
  pack_key text,                    -- board-stage@version, when imported from a board pack
  created_by text,
  published_by text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id),
  UNIQUE (family_id, version),
  CHECK ((version = 1) = (family_id = id))
);
-- Importing a pack twice finds the scheme made the first time (AT-v3-11).
CREATE UNIQUE INDEX schemes_pack ON schemes (org_id, pack_key) WHERE pack_key IS NOT NULL AND version = 1 AND deleted_at IS NULL;
CREATE UNIQUE INDEX schemes_one_draft ON schemes (family_id) WHERE status = 'draft' AND deleted_at IS NULL;
SELECT revu_tenant_table('schemes');

-- A published version is immutable (AT-v3-07). Only its status may move on,
-- to retired, when a later version is published.
CREATE FUNCTION schemes_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' AND (NEW.definition IS DISTINCT FROM OLD.definition OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.version IS DISTINCT FROM OLD.version OR NEW.family_id IS DISTINCT FROM OLD.family_id
      OR NEW.status = 'draft' OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
    RAISE EXCEPTION 'scheme.immutable: a published scheme cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER schemes_immutable BEFORE UPDATE ON schemes FOR EACH ROW EXECUTE FUNCTION schemes_immutable();

CREATE TABLE scheme_assignments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  family_id uuid NOT NULL,
  level_id uuid,
  period_id uuid,
  subject_id uuid,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE NULLS NOT DISTINCT (org_id, level_id, period_id, subject_id),
  FOREIGN KEY (org_id, family_id) REFERENCES schemes (org_id, id),
  FOREIGN KEY (org_id, level_id) REFERENCES levels (org_id, id),
  FOREIGN KEY (org_id, period_id) REFERENCES periods (org_id, id),
  FOREIGN KEY (org_id, subject_id) REFERENCES subjects (org_id, id)
);
SELECT revu_tenant_table('scheme_assignments');

-- One row per student, period, subject and component, and one with
-- component_code '_subject' for the subject result, whose detail explains
-- every number. A blocked or unassessed result never carries a number.
CREATE TABLE computed_results (
  org_id uuid NOT NULL REFERENCES orgs,
  student_id uuid NOT NULL,
  period_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  component_code text NOT NULL,
  value numeric(10,2),
  max numeric(10,2),
  pct numeric(7,2),
  grade text,
  state result_state NOT NULL,
  reason text,
  detail jsonb,
  scheme_id uuid NOT NULL,
  scheme_version int NOT NULL,
  stale boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, period_id, subject_id, component_code),
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id),
  FOREIGN KEY (org_id, period_id) REFERENCES periods (org_id, id),
  FOREIGN KEY (org_id, subject_id) REFERENCES subjects (org_id, id),
  FOREIGN KEY (org_id, scheme_id) REFERENCES schemes (org_id, id),
  CHECK (state NOT IN ('blocked', 'not_assessed') OR value IS NULL)
);
CREATE INDEX computed_results_period ON computed_results (period_id, subject_id);
SELECT revu_tenant_table('computed_results');

-- The recompute loop asks which institutions have results waiting, past
-- the debounce, without reading anything else across institutions.
CREATE FUNCTION revu_orgs_with_stale_results(debounce interval) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT DISTINCT org_id FROM result_stale_intents WHERE marked_at <= now() - debounce $$;
REVOKE EXECUTE ON FUNCTION revu_orgs_with_stale_results(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revu_orgs_with_stale_results(interval) TO revu_app;
