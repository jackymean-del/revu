-- 004_guardians.sql: guardians are rows, not a jsonb list on the student
-- (decision D14), so consent, language and channel preference attach to
-- each person who receives reports and messages (Parts 68 and 70).

CREATE TABLE guardians (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  student_id uuid NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  relation text,                -- mother, father, guardian, ... as the family states it
  phone text,
  email text,
  language text NOT NULL DEFAULT 'en',
  channel text CHECK (channel IN ('whatsapp', 'sms', 'email')),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id)
);
CREATE INDEX guardians_student ON guardians (student_id) WHERE deleted_at IS NULL;
-- At most one primary contact per student.
CREATE UNIQUE INDEX guardians_one_primary ON guardians (student_id) WHERE is_primary AND deleted_at IS NULL;

SELECT revu_tenant_table('guardians');

ALTER TABLE students DROP COLUMN guardians;
