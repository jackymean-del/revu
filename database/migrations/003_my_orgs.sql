-- 003_my_orgs.sql: the organisations a signed-in person belongs to.
--
-- Choosing an organisation happens before any tenant is set, so row-level
-- security would show nothing. This function is the one narrow way across:
-- it runs as the owner, takes only the caller's verified user id (from the
-- server, never from the client) and returns only that person's own
-- memberships.
CREATE FUNCTION revu_my_orgs(p_clerk_user_id text)
  RETURNS TABLE (id uuid, name text, preset text, roles text[])
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT o.id, o.name, o.preset, array_agg(DISTINCT m.role::text ORDER BY m.role::text)
      FROM memberships m JOIN orgs o ON o.id = m.org_id
     WHERE m.clerk_user_id = p_clerk_user_id AND o.deleted_at IS NULL
     GROUP BY o.id, o.name, o.preset
     ORDER BY o.name
  $$;
REVOKE EXECUTE ON FUNCTION revu_my_orgs(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revu_my_orgs(text) TO revu_app;

-- Presets are the ones the terminology module knows.
ALTER TABLE orgs ADD CONSTRAINT orgs_preset CHECK (preset IN ('school', 'college', 'university'));
