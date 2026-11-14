-- 024_marks_by_bits.sql: marks may be entered bit by bit: a part for each
-- bit of a question that has bits, and one for each question that has none.

ALTER TABLE assessments DROP CONSTRAINT assessments_marks_by_check;
ALTER TABLE assessments ADD CONSTRAINT assessments_marks_by_check CHECK (marks_by IN ('questions', 'bits', 'sections', 'total'));
