-- 025_paper_review.sql: a set goes from its teacher to those who moderate
-- it before it is final. Submitted, it is the moderators' alone; they may
-- send it back with a note. A set copied from another remembers which, so
-- its teacher sees what is still to rewrite.

ALTER TABLE papers DROP CONSTRAINT papers_status_check;
ALTER TABLE papers ADD CONSTRAINT papers_status_check CHECK (status IN ('draft', 'submitted', 'final'));
ALTER TABLE papers ADD COLUMN copied_from uuid;
ALTER TABLE papers ADD COLUMN review_note text NOT NULL DEFAULT '';
ALTER TABLE papers ADD COLUMN submitted_by text;
ALTER TABLE papers ADD COLUMN submitted_at timestamptz;
