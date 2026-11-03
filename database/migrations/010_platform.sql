-- 010_platform.sql: the platform owner's side (blueprint Parts 49, 56 and 77).
--
-- A group is a virtual container over independent institutions: it owns no
-- records and is never a tenant (decision D2). Its administrators are named
-- by email and see status counts of its institutions, never their content.
--
-- groups, group_admins and platform_audit are platform tables. The
-- application role has no privilege on them at all, so no institution's
-- request can read them; the server reaches them only through the owner
-- account, in the owner and group handlers. group_members carries org_id and
-- is an ordinary tenant table.

CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX groups_name ON groups (lower(name));
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE group_admins (
  group_id uuid NOT NULL REFERENCES groups ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email LIKE '%_@_%'),
  added_by text,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, email)
);
ALTER TABLE group_admins ENABLE ROW LEVEL SECURITY;

-- An institution is in one group at most.
CREATE TABLE group_members (
  org_id uuid PRIMARY KEY REFERENCES orgs,
  group_id uuid NOT NULL REFERENCES groups ON DELETE CASCADE,
  added_by text,
  added_at timestamptz NOT NULL DEFAULT now()
);
SELECT revu_tenant_table('group_members');

-- What the platform owner did, with before and after (Part 56.9).
CREATE TABLE platform_audit (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  actor text NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  detail jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_audit ENABLE ROW LEVEL SECURITY;
