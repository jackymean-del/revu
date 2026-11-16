-- 027_family_accounts.sql: a family signs in for its child with a user name
-- (the admission number, or a unique field the institution chose) and a
-- password. The first password is random and temporary: it is sent once
-- and must be changed at the first sign-in. Only its hash is kept.

CREATE TABLE family_accounts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  student_id uuid NOT NULL,
  username text NOT NULL CHECK (btrim(username) <> ''),
  password_hash text NOT NULL,
  must_change boolean NOT NULL DEFAULT true,
  failed int NOT NULL DEFAULT 0,          -- wrong passwords in a row
  locked_until timestamptz,               -- after too many, for a while
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by text,
  last_sign_in timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, student_id),
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id)
);
CREATE UNIQUE INDEX family_accounts_username ON family_accounts (org_id, lower(username));
SELECT revu_tenant_table('family_accounts');

-- A signed-in family holds a token; only its hash is kept, and it ends.
CREATE TABLE family_sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  account_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, account_id) REFERENCES family_accounts (org_id, id) ON DELETE CASCADE
);
SELECT revu_tenant_table('family_sessions');

-- Messages to families wait here until they are sent by SMS or email, or
-- handed over on paper. A sign-in message carries the temporary password,
-- so its text is wiped as soon as it is sent or handed over.
CREATE TABLE family_messages (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  student_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sign_in')),
  channel text NOT NULL CHECK (channel IN ('sms', 'email', 'paper')),
  recipient text NOT NULL DEFAULT '',     -- who it is for, by name
  address text NOT NULL DEFAULT '',       -- phone or email; empty for paper
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'sent', 'handed', 'failed', 'replaced')),
  error text NOT NULL DEFAULT '',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  FOREIGN KEY (org_id, student_id) REFERENCES students (org_id, id)
);
CREATE INDEX family_messages_ready ON family_messages (org_id, status, created_at);
SELECT revu_tenant_table('family_messages');
