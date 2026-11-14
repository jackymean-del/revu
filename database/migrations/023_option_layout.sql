-- 023_option_layout.sql: how a choice question's options are set on the
-- printed paper: in how many columns (0 fits them by their length, 1 is one
-- under another), and whether each has a box to tick.

ALTER TABLE questions ADD COLUMN option_cols int NOT NULL DEFAULT 0 CHECK (option_cols BETWEEN 0 AND 6);
ALTER TABLE questions ADD COLUMN option_boxes boolean NOT NULL DEFAULT true;
