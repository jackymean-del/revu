-- 021_paper_hierarchy.sql: a paper as a hierarchy. A section may hold
-- sub-sections (one level); a question may have bits, its lettered parts
-- (a), (b), each with its own marks, which add up to the question's marks.
-- Sections keep one running order across the paper: a sub-section follows
-- its section, before the next section.

ALTER TABLE paper_sections ADD COLUMN parent_id uuid;
ALTER TABLE paper_sections ADD CONSTRAINT paper_sections_parent FOREIGN KEY (org_id, parent_id) REFERENCES paper_sections (org_id, id) ON DELETE CASCADE;

-- [{"text": "...", "marks": "2", "answer": "..."}], in order.
ALTER TABLE questions ADD COLUMN bits jsonb NOT NULL DEFAULT '[]';
