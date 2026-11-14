-- 022_answer_space.sql: the room a question gets on the printed paper, set
-- for each question: ruled lines, blank space, a box to draw in, or none.
-- With 'auto' the paper decides from the marks, as before. The size is in
-- lines, or the height in line-heights for blank space and a box.

ALTER TABLE questions ADD COLUMN space_kind text NOT NULL DEFAULT 'auto' CHECK (space_kind IN ('auto', 'lines', 'blank', 'box', 'none'));
ALTER TABLE questions ADD COLUMN space_size int NOT NULL DEFAULT 0 CHECK (space_size BETWEEN 0 AND 60);
