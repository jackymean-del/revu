-- 007_invitations.sql: inviting people by email, and what a signed-in
-- person needs to see their own work.
--
-- An invitation names an email address and the role it will give. It is
-- claimed when someone signs in whose verified email (as the sign-in service
-- reports it to the server, never as the browser says) matches, which turns
-- it into a membership. Nobody gets a password from revU (Part 56.5).

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  org_id uuid NOT NULL REFERENCES orgs,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email LIKE '%_@_%'),
  role member_role NOT NULL,
  branch_id uuid,
  staff_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  sent boolean NOT NULL DEFAULT false,   -- the sign-in service emailed the link
  invited_by text,
  accepted_by text,                      -- the sign-in id that claimed it
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  FOREIGN KEY (org_id, branch_id) REFERENCES branches (org_id, id),
  FOREIGN KEY (org_id, staff_id) REFERENCES staff (org_id, id)
);
-- One open invitation per address and role in an organisation.
CREATE UNIQUE INDEX invitations_open ON invitations (org_id, email, role, branch_id) NULLS NOT DISTINCT WHERE status = 'pending';

SELECT revu_tenant_table('invitations');

-- Claims every open invitation for these verified addresses, in every
-- organisation, for the signed-in person. Runs as the owner because the
-- person belongs to none of those organisations yet; it only ever uses ids
-- and addresses the server has verified, and it audits each claim.
CREATE FUNCTION revu_claim_invitations(p_clerk_user_id text, p_emails text[])
  RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT i.* FROM invitations i JOIN orgs o ON o.id = i.org_id
     WHERE i.status = 'pending' AND o.deleted_at IS NULL
       AND i.email = ANY (SELECT lower(btrim(e)) FROM unnest(p_emails) e)
     FOR UPDATE OF i
  LOOP
    INSERT INTO memberships (org_id, clerk_user_id, role, branch_id, staff_id, source)
    VALUES (r.org_id, p_clerk_user_id, r.role, r.branch_id, r.staff_id, 'revu')
    ON CONFLICT DO NOTHING;
    UPDATE invitations SET status = 'accepted', accepted_by = p_clerk_user_id, accepted_at = now() WHERE id = r.id;
    INSERT INTO audit_log (org_id, actor_id, action, entity, entity_id, after)
    VALUES (r.org_id, p_clerk_user_id, 'accept', 'invitations', r.id,
            jsonb_build_object('email', r.email, 'role', r.role::text));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION revu_claim_invitations(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revu_claim_invitations(text, text[]) TO revu_app;

-- The organisation list also says which staff record is this person's, so
-- their home can show the classes they teach.
DROP FUNCTION revu_my_orgs(text);
CREATE FUNCTION revu_my_orgs(p_clerk_user_id text)
  RETURNS TABLE (id uuid, name text, preset text, roles text[], staff_id uuid, setup_done boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT o.id, o.name, o.preset,
           array_agg(DISTINCT m.role::text ORDER BY m.role::text),
           (array_agg(m.staff_id) FILTER (WHERE m.staff_id IS NOT NULL))[1],
           coalesce((o.settings ->> 'setupDone')::boolean, false)
      FROM memberships m JOIN orgs o ON o.id = m.org_id
     WHERE m.clerk_user_id = p_clerk_user_id AND o.deleted_at IS NULL
     GROUP BY o.id, o.name, o.preset, o.settings
     ORDER BY o.name
  $$;
REVOKE EXECUTE ON FUNCTION revu_my_orgs(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revu_my_orgs(text) TO revu_app;
