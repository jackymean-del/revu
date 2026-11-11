-- 017_holistic.sql: what the holistic progress report needs beyond marks
-- (pilot P0.11 H4; blueprint v23 B8.6.2). Competency and Bloom levels are
-- worked out from tagged marks and never stored; these are the parts a
-- teacher gives: activity ratings, the 360-degree voices, and the note.

-- A teacher's term rating of an activity competency (a competency of a
-- co-curricular subject), as a step of the institution's level scale,
-- 1 the lowest.
CREATE TABLE holistic_ratings (
  org_id uuid NOT NULL REFERENCES orgs,
  student_id uuid NOT NULL,
  period_id uuid NOT NULL,
  competency_id uuid NOT NULL,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 8),
  rated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, period_id, competency_id),
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id),
  FOREIGN KEY (org_id, period_id) REFERENCES periods (org_id, id),
  FOREIGN KEY (org_id, competency_id) REFERENCES competencies (org_id, id)
);
SELECT revu_tenant_table('holistic_ratings');

-- One line each of self, peer and parent reflection, and the ambition.
CREATE TABLE holistic_voices (
  org_id uuid NOT NULL REFERENCES orgs,
  student_id uuid NOT NULL,
  period_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('self', 'peer', 'parent', 'ambition')),
  text text NOT NULL CHECK (btrim(text) <> '' AND length(text) <= 300),
  recorded_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, period_id, kind),
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id),
  FOREIGN KEY (org_id, period_id) REFERENCES periods (org_id, id)
);
SELECT revu_tenant_table('holistic_voices');

-- The teacher's note; a draft from AI is marked so until it is approved.
CREATE TABLE holistic_notes (
  org_id uuid NOT NULL REFERENCES orgs,
  student_id uuid NOT NULL,
  period_id uuid NOT NULL,
  text text NOT NULL CHECK (length(text) <= 1500),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  from_ai boolean NOT NULL DEFAULT false,
  written_by text,
  approved_by text,
  approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, period_id),
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id),
  FOREIGN KEY (org_id, period_id) REFERENCES periods (org_id, id)
);
SELECT revu_tenant_table('holistic_notes');
