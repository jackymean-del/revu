-- 026_student_details.sql: a student's values for the institution's own
-- list of fields (gender, contact, health, and any it adds), keyed by the
-- field's key. The list itself is in the organisation's settings.

ALTER TABLE students ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
