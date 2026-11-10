-- 016_paper_levels.sql: blueprints by Bloom, SOLO, the institution's own
-- levels or none; a cell's marks are marks for each question; sets may
-- have any name (pilot P0.9 after the first review).

ALTER TABLE blueprints DROP CONSTRAINT blueprints_taxonomy_check;
ALTER TABLE blueprints ADD CONSTRAINT blueprints_taxonomy_check CHECK (taxonomy IN ('bloom', 'solo', 'custom', 'none'));

-- Levels are checked by the server against the blueprint's taxonomy.
ALTER TABLE blueprint_cells DROP CONSTRAINT blueprint_cells_level_check;
ALTER TABLE blueprint_cells ADD CONSTRAINT blueprint_cells_level_check CHECK (length(level) <= 40);

-- Marks are for each question now: 2 questions of 2 marks is 4 marks.
ALTER TABLE blueprint_cells RENAME COLUMN marks TO marks_each;
UPDATE blueprint_cells SET marks_each = round(marks_each / questions, 2) WHERE questions > 0;

-- A question may carry a SOLO level and a level of the institution's own
-- taxonomy beside its Bloom level, which the holistic report reads.
ALTER TABLE questions ADD COLUMN solo text CHECK (solo IN ('prestructural', 'unistructural', 'multistructural', 'relational', 'extended'));
ALTER TABLE questions ADD COLUMN custom_level text CHECK (length(custom_level) <= 40);

-- A paper keeps the taxonomy its slots were laid out in; its name is free.
ALTER TABLE papers ADD COLUMN taxonomy text NOT NULL DEFAULT 'bloom' CHECK (taxonomy IN ('bloom', 'solo', 'custom', 'none'));
ALTER TABLE papers DROP CONSTRAINT papers_set_label_check;
ALTER TABLE papers ADD CONSTRAINT papers_set_label_check CHECK (btrim(set_label) <> '' AND length(set_label) <= 30);
UPDATE papers SET set_label = 'Set ' || set_label WHERE set_label ~ '^[A-Z]$';
ALTER TABLE paper_items RENAME COLUMN bloom TO level;
