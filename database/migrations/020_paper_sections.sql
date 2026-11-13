-- 020_paper_sections.sql: a paper's sections as records of their own, so a
-- teacher names them, orders them, marks one core or extra, and chooses
-- which print. A question belongs to a section; its type stays on the
-- question. A paper may also be built freely, with no blueprint.

CREATE TABLE paper_sections (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  paper_id uuid NOT NULL,
  seq int NOT NULL,
  title text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 80),
  instructions text NOT NULL DEFAULT '' CHECK (length(instructions) <= 500),
  kind text NOT NULL DEFAULT 'core' CHECK (kind IN ('core', 'extra')),  -- extra is not counted in the marks
  print boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, paper_id) REFERENCES papers (org_id, id) ON DELETE CASCADE
);
CREATE INDEX paper_sections_paper ON paper_sections (paper_id, seq);
SELECT revu_tenant_table('paper_sections');

ALTER TABLE paper_items ADD COLUMN section_id uuid;
ALTER TABLE paper_items ADD CONSTRAINT paper_items_section FOREIGN KEY (org_id, section_id) REFERENCES paper_sections (org_id, id) ON DELETE CASCADE;

-- Sections for a paper's questions that have none yet: one per question
-- type, in the order the types first appear.
CREATE FUNCTION revu_paper_sections(paper uuid) RETURNS void
  LANGUAGE sql
  AS $$
    WITH s AS (
      INSERT INTO paper_sections (org_id, paper_id, seq, title)
      SELECT (array_agg(org_id))[1], paper,
             coalesce((SELECT max(seq) FROM paper_sections WHERE paper_id = paper), 0) + row_number() OVER (ORDER BY min(seq)), section
        FROM paper_items WHERE paper_id = paper AND section_id IS NULL GROUP BY section
      RETURNING id, title)
    UPDATE paper_items i SET section_id = s.id FROM s WHERE i.paper_id = paper AND i.section_id IS NULL AND i.section = s.title
  $$;
GRANT EXECUTE ON FUNCTION revu_paper_sections(uuid) TO revu_app;

SELECT revu_paper_sections(id) FROM papers;

-- How marks are entered for an assessment whose paper is final: one mark a
-- question, one a section, or the total only. The holistic report says
-- which, since its detail follows from it.
ALTER TABLE assessments ADD COLUMN marks_by text CHECK (marks_by IN ('questions', 'sections', 'total'));
