-- 013_reteach.sql: what a teacher decided about a reteach item (pilot P0.6;
-- blueprint v23 B8.7). An item is a paper section of an assessment in one
-- section of students; the list itself is worked out each time from the
-- marks, so only the teacher's decision is stored.

CREATE TABLE reteach_marks (
  org_id uuid NOT NULL REFERENCES orgs,
  assessment_id uuid NOT NULL,
  section_id uuid NOT NULL,
  part_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('planned', 'done', 'not_needed')),
  set_by text,
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_id, section_id, part_id),
  FOREIGN KEY (org_id, assessment_id) REFERENCES assessments (org_id, id),
  FOREIGN KEY (org_id, section_id) REFERENCES sections (org_id, id),
  FOREIGN KEY (org_id, part_id) REFERENCES assessment_parts (org_id, id)
);
SELECT revu_tenant_table('reteach_marks');
