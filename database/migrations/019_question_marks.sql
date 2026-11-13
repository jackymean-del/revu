-- 019_question_marks.sql: marks question by question. A finalised paper
-- gives one part per question; each is tagged with its question's learning
-- outcome, per set, because Set B may ask another question in the same
-- slot. A tag with no paper applies to everyone (parts tagged by hand).

ALTER TABLE part_tags ADD COLUMN paper_id uuid;
ALTER TABLE part_tags ADD CONSTRAINT part_tags_paper FOREIGN KEY (org_id, paper_id) REFERENCES papers (org_id, id) ON DELETE CASCADE;
DROP INDEX part_tags_one;
CREATE UNIQUE INDEX part_tags_one ON part_tags (part_id, outcome_id, competency_id, paper_id) NULLS NOT DISTINCT;

-- The set a student sat: their own assignment, else their section's, else
-- the assessment's first final set. Row-level security applies as usual.
CREATE FUNCTION revu_paper_sat(assessment uuid, student uuid) RETURNS uuid
  LANGUAGE sql STABLE
  AS $$
    SELECT coalesce(
      (SELECT pa.paper_id FROM paper_assignments pa JOIN papers p ON p.id = pa.paper_id
        WHERE p.assessment_id = assessment AND pa.student_id = student LIMIT 1),
      (SELECT pa.paper_id FROM paper_assignments pa JOIN papers p ON p.id = pa.paper_id
         JOIN assessments a ON a.id = p.assessment_id
         JOIN enrolments e ON e.section_id = pa.section_id AND e.student_id = student AND e.year_id = a.year_id AND e.deleted_at IS NULL
        WHERE p.assessment_id = assessment AND pa.student_id IS NULL LIMIT 1),
      (SELECT p.id FROM papers p WHERE p.assessment_id = assessment AND p.status = 'final' ORDER BY p.finalised_at, p.created_at LIMIT 1))
  $$;
GRANT EXECUTE ON FUNCTION revu_paper_sat(uuid, uuid) TO revu_app;
