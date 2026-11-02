-- 008_subject_choices.sql: subject groups and each student's choices
-- (blueprint Part 74.1).
--
-- A group such as Second language belongs to a level and offers options
-- (Hindi, Odia, Sanskrit) with a rule for how many a student takes. A
-- subject outside any group applies to every student of the level.
--
-- A choice is held for a year with the days it applies. Changing it mid-year
-- ends the old row the day before the new one starts, so marks entered under
-- the earlier subject keep their place in history. Choices are never
-- deleted; one withdrawn before it started is ended before it began.

CREATE TABLE subject_groups (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  level_id uuid NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  rule text NOT NULL CHECK (rule IN ('exactly_one', 'at_most_one', 'range')),
  min_choices int NOT NULL,
  max_choices int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, level_id) REFERENCES levels (org_id, id),
  CHECK (CASE rule
    WHEN 'exactly_one' THEN min_choices = 1 AND max_choices = 1
    WHEN 'at_most_one' THEN min_choices = 0 AND max_choices = 1
    ELSE min_choices >= 0 AND max_choices >= 1 AND min_choices <= max_choices
  END)
);
CREATE UNIQUE INDEX subject_groups_name ON subject_groups (level_id, lower(name)) WHERE deleted_at IS NULL;
SELECT revu_tenant_table('subject_groups');

CREATE TABLE subject_group_options (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  group_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  FOREIGN KEY (org_id, group_id) REFERENCES subject_groups (org_id, id),
  FOREIGN KEY (org_id, subject_id) REFERENCES subjects (org_id, id)
);
CREATE UNIQUE INDEX subject_group_options_pair ON subject_group_options (group_id, subject_id) WHERE deleted_at IS NULL;
SELECT revu_tenant_table('subject_group_options');

CREATE TABLE student_subject_choices (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  student_id uuid NOT NULL,
  year_id uuid NOT NULL,
  group_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  effective_from date NOT NULL,
  effective_to date,            -- the last day it applies; null runs to the end of the year
  source text NOT NULL CHECK (source IN ('manual', 'import', 'copied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id),
  FOREIGN KEY (org_id, year_id) REFERENCES academic_years (org_id, id),
  FOREIGN KEY (org_id, group_id) REFERENCES subject_groups (org_id, id),
  FOREIGN KEY (org_id, subject_id) REFERENCES subjects (org_id, id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from - 1)
);
-- One running row per student, group and subject; history rows are ended.
CREATE UNIQUE INDEX student_subject_choices_open ON student_subject_choices (student_id, year_id, group_id, subject_id) WHERE effective_to IS NULL;
CREATE INDEX student_subject_choices_student ON student_subject_choices (student_id, year_id);
SELECT revu_tenant_table('student_subject_choices');
