-- 015_papers.sql: the Blueprint Builder, the question bank and question
-- papers with sets (pilot P0.9; blueprint v23 B3.2 to B3.4). A blueprint
-- belongs to one assessment (one examination, level and subject) and
-- applies to every section that sits it. Totals are always worked out from
-- the cells, never stored.

CREATE TABLE blueprints (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  assessment_id uuid NOT NULL,
  taxonomy text NOT NULL DEFAULT 'bloom' CHECK (taxonomy IN ('bloom', 'none')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'returned')),
  version int NOT NULL DEFAULT 1,
  comment text,
  submitted_by text,
  submitted_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (assessment_id),
  FOREIGN KEY (org_id, assessment_id) REFERENCES assessments (org_id, id)
);
SELECT revu_tenant_table('blueprints');

-- A row is a chapter (a lesson of the syllabus, or typed when there is
-- none) and a question type.
CREATE TABLE blueprint_rows (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  blueprint_id uuid NOT NULL,
  seq int NOT NULL,
  lesson_id uuid,
  chapter text NOT NULL CHECK (btrim(chapter) <> ''),
  qtype text NOT NULL CHECK (btrim(qtype) <> ''),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, blueprint_id) REFERENCES blueprints (org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, lesson_id) REFERENCES lessons (org_id, id)
);
SELECT revu_tenant_table('blueprint_rows');

-- A cell is one taxonomy level of a row ('' with no taxonomy): how many
-- questions and how many marks in all. A blank cell has no row here.
CREATE TABLE blueprint_cells (
  org_id uuid NOT NULL REFERENCES orgs,
  row_id uuid NOT NULL,
  level text NOT NULL,
  questions int NOT NULL CHECK (questions >= 0),
  marks numeric(8,2) NOT NULL CHECK (marks >= 0),
  PRIMARY KEY (row_id, level),
  FOREIGN KEY (org_id, row_id) REFERENCES blueprint_rows (org_id, id) ON DELETE CASCADE,
  CHECK (level IN ('', 'remember', 'understand', 'apply', 'analyse', 'evaluate', 'create')),
  CHECK ((questions = 0) = (marks = 0))
);
SELECT revu_tenant_table('blueprint_cells');

CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  level_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  lesson_id uuid,
  outcome_id uuid,
  bloom text NOT NULL DEFAULT 'understand' CHECK (bloom IN ('remember', 'understand', 'apply', 'analyse', 'evaluate', 'create')),
  qtype text NOT NULL CHECK (btrim(qtype) <> ''),
  marks numeric(8,2) NOT NULL CHECK (marks > 0),
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  text text NOT NULL CHECK (btrim(text) <> ''),
  options jsonb NOT NULL DEFAULT '[]',   -- for choice questions, in order
  answer text NOT NULL DEFAULT '',       -- the answer or marking rubric
  source text NOT NULL DEFAULT 'typed' CHECK (source IN ('typed', 'ai', 'imported')),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('draft', 'approved', 'retired')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, level_id) REFERENCES levels (org_id, id),
  FOREIGN KEY (org_id, subject_id) REFERENCES subjects (org_id, id),
  FOREIGN KEY (org_id, lesson_id) REFERENCES lessons (org_id, id),
  FOREIGN KEY (org_id, outcome_id) REFERENCES learning_outcomes (org_id, id)
);
CREATE INDEX questions_place ON questions (level_id, subject_id) WHERE status <> 'retired';
SELECT revu_tenant_table('questions');

-- A paper is one set of an assessment; Set B is an independent copy.
CREATE TABLE papers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  assessment_id uuid NOT NULL,
  set_label text NOT NULL CHECK (set_label ~ '^[A-Z]$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  blueprint_version int NOT NULL,
  instructions text NOT NULL DEFAULT '',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalised_by text,
  finalised_at timestamptz,
  UNIQUE (org_id, id),
  UNIQUE (assessment_id, set_label),
  FOREIGN KEY (org_id, assessment_id) REFERENCES assessments (org_id, id)
);
SELECT revu_tenant_table('papers');

-- A slot of a paper, as the blueprint asks for it, and the question in it.
CREATE TABLE paper_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  paper_id uuid NOT NULL,
  seq int NOT NULL,
  section text NOT NULL,                 -- the question type, which heads its section
  chapter text NOT NULL,
  lesson_id uuid,
  bloom text NOT NULL DEFAULT '',
  marks numeric(8,2) NOT NULL CHECK (marks > 0),
  question_id uuid,
  locked boolean NOT NULL DEFAULT false,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, paper_id) REFERENCES papers (org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, lesson_id) REFERENCES lessons (org_id, id),
  FOREIGN KEY (org_id, question_id) REFERENCES questions (org_id, id)
);
CREATE INDEX paper_items_paper ON paper_items (paper_id, seq);
SELECT revu_tenant_table('paper_items');

-- Assign paper (B4.1): which set a section, or one student, sits, and when.
CREATE TABLE paper_assignments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  paper_id uuid NOT NULL,
  section_id uuid NOT NULL,
  student_id uuid,                      -- one student, or the whole section when empty
  sit_on date,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, paper_id) REFERENCES papers (org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, section_id) REFERENCES sections (org_id, id),
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id)
);
CREATE UNIQUE INDEX paper_assignments_one ON paper_assignments (paper_id, section_id, student_id) NULLS NOT DISTINCT;
SELECT revu_tenant_table('paper_assignments');
