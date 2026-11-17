-- 029_holistic_insights.sql: a child's insight for each subject of a term on
-- the holistic progress card: a short line for the first page, and a fuller
-- one for the subject's own part, worked out from the marks of every
-- assessment of the term. Drafted (from the data, or with AI), then edited
-- and approved by the class teacher; only approved ones print.

CREATE TABLE holistic_insights (
  org_id uuid NOT NULL REFERENCES orgs,
  student_id uuid NOT NULL,
  period_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 400),
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 1500),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  from_ai boolean NOT NULL DEFAULT false,
  written_by text,
  approved_by text,
  approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, period_id, subject_id),
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id),
  FOREIGN KEY (org_id, period_id) REFERENCES periods (org_id, id),
  FOREIGN KEY (org_id, subject_id) REFERENCES subjects (org_id, id)
);
SELECT revu_tenant_table('holistic_insights');
