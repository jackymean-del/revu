-- 001: baseline. The schema itself starts in v1.3 (orgs, structure, people, audit).
-- gen_random_uuid() is built in; UUID v7 identifiers are made in Go.
-- This file only proves that migrations apply in order on a fresh database.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
