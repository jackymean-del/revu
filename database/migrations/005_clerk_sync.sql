-- 005_clerk_sync.sql: keep memberships in step with Clerk organisations.
--
-- A membership now says where it came from. Rows from Clerk ('clerk') follow
-- the person's role in the linked Clerk organisation and are replaced when
-- it changes. Rows set inside revU ('revu') are never touched by the sync:
-- revU, not the identity provider, decides who may do what (Part 38).
ALTER TABLE memberships ADD COLUMN source text NOT NULL DEFAULT 'revu' CHECK (source IN ('revu', 'clerk'));

-- The Clerk webhook arrives with no tenant set, so these three functions are
-- the only way it crosses organisations. They run as the owner, take Clerk
-- ids that the server has already verified (Svix signature), act only on
-- organisations linked by clerk_org_id, and audit every change.

-- Sets the person's Clerk-sourced role in the linked organisation. Returns
-- false when no revU organisation is linked to that Clerk organisation.
CREATE FUNCTION revu_clerk_set_membership(p_clerk_org_id text, p_clerk_user_id text, p_role member_role)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_org uuid;
  v_before text[];
BEGIN
  SELECT id INTO v_org FROM orgs WHERE clerk_org_id = p_clerk_org_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN
    RETURN false;
  END IF;
  SELECT array_agg(role::text ORDER BY role::text) INTO v_before
    FROM memberships WHERE org_id = v_org AND clerk_user_id = p_clerk_user_id AND source = 'clerk';
  IF v_before = ARRAY[p_role::text] THEN
    RETURN true; -- already in step: a repeated delivery changes nothing
  END IF;
  DELETE FROM memberships WHERE org_id = v_org AND clerk_user_id = p_clerk_user_id AND source = 'clerk';
  INSERT INTO memberships (org_id, clerk_user_id, role, source) VALUES (v_org, p_clerk_user_id, p_role, 'clerk')
    ON CONFLICT DO NOTHING; -- the same role already set inside revU stays as it is
  INSERT INTO audit_log (org_id, action, entity, before, after)
    VALUES (v_org, 'sync', 'memberships',
            jsonb_build_object('user', p_clerk_user_id, 'roles', coalesce(v_before, '{}')),
            jsonb_build_object('user', p_clerk_user_id, 'roles', ARRAY[p_role::text]));
  RETURN true;
END $$;

-- The person left the linked Clerk organisation: every membership there
-- ends, wherever it came from, since they can no longer sign in to it.
CREATE FUNCTION revu_clerk_remove_membership(p_clerk_org_id text, p_clerk_user_id text)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_org uuid;
  v_removed text[];
BEGIN
  SELECT id INTO v_org FROM orgs WHERE clerk_org_id = p_clerk_org_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN
    RETURN false;
  END IF;
  WITH gone AS (
    DELETE FROM memberships WHERE org_id = v_org AND clerk_user_id = p_clerk_user_id RETURNING role::text
  ) SELECT array_agg(role ORDER BY role) INTO v_removed FROM gone;
  IF v_removed IS NOT NULL THEN
    INSERT INTO audit_log (org_id, action, entity, before, after)
      VALUES (v_org, 'sync', 'memberships', jsonb_build_object('user', p_clerk_user_id, 'roles', v_removed),
              jsonb_build_object('user', p_clerk_user_id, 'roles', '{}'::text[]));
  END IF;
  RETURN true;
END $$;

-- The Clerk account was deleted: every membership in every organisation ends.
CREATE FUNCTION revu_clerk_remove_user(p_clerk_user_id text)
  RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    DELETE FROM memberships WHERE clerk_user_id = p_clerk_user_id RETURNING org_id, role::text AS role
  LOOP
    v_count := v_count + 1;
    INSERT INTO audit_log (org_id, action, entity, before, after)
      VALUES (r.org_id, 'sync', 'memberships', jsonb_build_object('user', p_clerk_user_id, 'roles', ARRAY[r.role]),
              jsonb_build_object('user', p_clerk_user_id, 'roles', '{}'::text[]));
  END LOOP;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION revu_clerk_set_membership(text, text, member_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION revu_clerk_remove_membership(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION revu_clerk_remove_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revu_clerk_set_membership(text, text, member_role) TO revu_app;
GRANT EXECUTE ON FUNCTION revu_clerk_remove_membership(text, text) TO revu_app;
GRANT EXECUTE ON FUNCTION revu_clerk_remove_user(text) TO revu_app;
