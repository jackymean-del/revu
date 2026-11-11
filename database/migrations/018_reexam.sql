-- 018_reexam.sql: re-exams (blueprint v23 B7, first slice). A re-exam is
-- a new assessment linked to the original and numbered as an attempt; the
-- original and its marks are never changed. Its marks count only for the
-- students chosen to sit it, and only under a policy approved and applied.

ALTER TABLE assessments ADD COLUMN retake_of uuid;
ALTER TABLE assessments ADD COLUMN attempt smallint NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 9);
ALTER TABLE assessments ADD CONSTRAINT assessments_retake_of FOREIGN KEY (org_id, retake_of) REFERENCES assessments (org_id, id);
CREATE INDEX assessments_retakes ON assessments (retake_of) WHERE retake_of IS NOT NULL;

-- How a re-exam counts, and where it stands.
CREATE TABLE reexams (
  assessment_id uuid PRIMARY KEY,   -- the re-exam's own assessment
  org_id uuid NOT NULL REFERENCES orgs,
  source_id uuid NOT NULL,          -- the original assessment
  policy text NOT NULL DEFAULT 'higher' CHECK (policy IN ('replace', 'higher', 'separate')),
  absent_rule text NOT NULL DEFAULT 'keep' CHECK (absent_rule IN ('keep', 'pending')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'applied')),
  criteria jsonb NOT NULL DEFAULT '{}',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by text,
  approved_at timestamptz,
  applied_by text,
  applied_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, assessment_id),
  FOREIGN KEY (org_id, assessment_id) REFERENCES assessments (org_id, id),
  FOREIGN KEY (org_id, source_id) REFERENCES assessments (org_id, id)
);
SELECT revu_tenant_table('reexams');

-- Who sits a re-exam, and why: the reason a list rule gave, or one typed
-- for a student added by hand.
CREATE TABLE reexam_candidates (
  org_id uuid NOT NULL REFERENCES orgs,
  assessment_id uuid NOT NULL,
  student_id uuid NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> '' AND length(reason) <= 200),
  added_by_hand boolean NOT NULL DEFAULT false,
  PRIMARY KEY (assessment_id, student_id),
  FOREIGN KEY (org_id, assessment_id) REFERENCES reexams (org_id, assessment_id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id)
);
SELECT revu_tenant_table('reexam_candidates');
