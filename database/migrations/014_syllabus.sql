-- 014_syllabus.sql: lessons, competencies and learning outcomes with their
-- Bloom levels, and the tags that tie a part of a paper to what it tests
-- (pilot P0.11 H1; blueprint v23 B2.3, B2.4, B8.6.2). A competency's kind
-- follows its subject: an academic subject's competencies are worked out
-- from marks, a co-curricular subject's are rated by the teacher.

CREATE TABLE lessons (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  level_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  seq int NOT NULL DEFAULT 0,
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, level_id) REFERENCES levels (org_id, id),
  FOREIGN KEY (org_id, subject_id) REFERENCES subjects (org_id, id)
);
CREATE UNIQUE INDEX lessons_name ON lessons (level_id, subject_id, lower(btrim(name))) WHERE deleted_at IS NULL;
SELECT revu_tenant_table('lessons');

-- A competency belongs to a subject, for every level unless a level is set.
CREATE TABLE competencies (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  subject_id uuid NOT NULL,
  level_id uuid,
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text,
  seq int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, subject_id) REFERENCES subjects (org_id, id),
  FOREIGN KEY (org_id, level_id) REFERENCES levels (org_id, id)
);
CREATE UNIQUE INDEX competencies_name ON competencies (subject_id, level_id, lower(btrim(name))) NULLS NOT DISTINCT WHERE deleted_at IS NULL;
SELECT revu_tenant_table('competencies');

CREATE TABLE learning_outcomes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  level_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  lesson_id uuid,
  competency_id uuid,
  code text,                        -- the id an earlier system gave it, kept for matching
  text text NOT NULL CHECK (btrim(text) <> ''),
  bloom text NOT NULL DEFAULT 'understand' CHECK (bloom IN ('remember', 'understand', 'apply', 'analyse', 'evaluate', 'create')),
  bloom_by text NOT NULL DEFAULT 'suggested' CHECK (bloom_by IN ('suggested', 'teacher')),
  note text,                        -- review comments brought in with it
  seq int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, level_id) REFERENCES levels (org_id, id),
  FOREIGN KEY (org_id, subject_id) REFERENCES subjects (org_id, id),
  FOREIGN KEY (org_id, lesson_id) REFERENCES lessons (org_id, id),
  FOREIGN KEY (org_id, competency_id) REFERENCES competencies (org_id, id)
);
-- The same outcome in the same lesson is one record however often it is imported.
CREATE UNIQUE INDEX learning_outcomes_text ON learning_outcomes (level_id, subject_id, lesson_id, md5(lower(btrim(text)))) NULLS NOT DISTINCT WHERE deleted_at IS NULL;
CREATE INDEX learning_outcomes_place ON learning_outcomes (level_id, subject_id) WHERE deleted_at IS NULL;
SELECT revu_tenant_table('learning_outcomes');

-- What a part of a paper tests: outcomes, or competencies directly.
CREATE TABLE part_tags (
  org_id uuid NOT NULL REFERENCES orgs,
  part_id uuid NOT NULL,
  outcome_id uuid,
  competency_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((outcome_id IS NULL) <> (competency_id IS NULL)),
  FOREIGN KEY (org_id, part_id) REFERENCES assessment_parts (org_id, id),
  FOREIGN KEY (org_id, outcome_id) REFERENCES learning_outcomes (org_id, id),
  FOREIGN KEY (org_id, competency_id) REFERENCES competencies (org_id, id)
);
CREATE UNIQUE INDEX part_tags_one ON part_tags (part_id, outcome_id, competency_id) NULLS NOT DISTINCT;
SELECT revu_tenant_table('part_tags');
