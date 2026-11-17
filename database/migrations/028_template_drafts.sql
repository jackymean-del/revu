-- 028_template_drafts.sql: questions drafted without an AI, from the
-- bank's own questions and stems for the level, are marked as such.

ALTER TABLE questions DROP CONSTRAINT questions_source_check;
ALTER TABLE questions ADD CONSTRAINT questions_source_check CHECK (source IN ('typed', 'ai', 'template', 'imported'));
