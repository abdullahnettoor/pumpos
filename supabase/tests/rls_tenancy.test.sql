-- =====================================================================
-- RLS tenancy assertions (run with psql -v ON_ERROR_STOP=1 against a
-- database that has all supabase/migrations applied, e.g. a throwaway
-- local cluster). Fails loudly via ASSERT when a policy regresses.
--
-- Verifies:
--   1. A user claiming another org in JWT user_metadata reads nothing
--      outside their authoritative organization.
--   2. Members cannot directly UPDATE users rows (role escalation) or
--      INSERT station assignments via the Data API role.
--   3. Organization access history (capability grants, Limit overrides) is
--      invisible and unwritable to tenant roles: commercial data belongs to
--      the platform, and tenants only ever see the effective Access Document.
--   4. handle_new_user() ignores caller-supplied signup_intent unless the
--      account was server-invited or carries server-set app metadata,
--      handles GoTrue's follow-up invited_at update idempotently, and always
--      pins the bootstrap role to Owner.
-- =====================================================================
BEGIN;

-- Local-shim grants mirroring Supabase's defaults for `authenticated`.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Fixtures: two organizations, one active user in each.
INSERT INTO organizations (id, name, subscription_plan, subscription_status)
VALUES ('00000000-0000-0000-0000-00000000000a', 'Org A', 'CORE', 'ACTIVE'),
       ('00000000-0000-0000-0000-00000000000b', 'Org B', 'CORE', 'ACTIVE');

-- Access history for Alice's own organization: even her own commercial rows
-- must be invisible to her.
INSERT INTO organization_capability_grants (organization_id, capability_key, granted_by_email, reason)
VALUES ('00000000-0000-0000-0000-00000000000a', 'exports.tally', 'admin@pumpos.app', 'Pilot');

INSERT INTO organization_limit_overrides (organization_id, limit_key, value, assigned_by_email, reason)
VALUES ('00000000-0000-0000-0000-00000000000a', 'station_count', 3, 'admin@pumpos.app', 'Three sites');

INSERT INTO users (id, organization_id, auth_user_id, full_name, email, role, status)
VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-0000000000aa', 'Alice A', 'alice@a.test', 'Staff', 'ACTIVE'),
       ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b',
        '00000000-0000-0000-0000-0000000000bb', 'Bob B', 'bob@b.test', 'Owner', 'ACTIVE');

INSERT INTO stations (id, organization_id, name, code)
VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b', 'B Station', 'BST')
ON CONFLICT DO NOTHING;

-- === Act as Alice (org A) while CLAIMING org B in user_metadata ===
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-0000000000aa',
  'user_metadata', json_build_object('organization_id', '00000000-0000-0000-0000-00000000000b')
)::text, true);

DO $$
BEGIN
  -- 1. Metadata claim is ignored: only the authoritative org is visible.
  ASSERT (SELECT count(*) FROM organizations) = 1, 'expected exactly one visible organization';
  ASSERT (SELECT id FROM organizations) = '00000000-0000-0000-0000-00000000000a',
    'metadata org claim leaked another organization';
  ASSERT (SELECT count(*) FROM users WHERE organization_id = '00000000-0000-0000-0000-00000000000b') = 0,
    'cross-org users visible';

  -- 2. No direct role escalation: UPDATE matches zero rows under the
  --    SELECT-only policy.
  UPDATE users SET role = 'Owner' WHERE id = '00000000-0000-0000-0000-0000000000a1';
  ASSERT NOT FOUND, 'direct users UPDATE was allowed';

  -- 3. Commercial access history is platform-only.
  ASSERT (SELECT count(*) FROM organization_capability_grants) = 0,
    'capability grants leaked to a tenant role';
  ASSERT (SELECT count(*) FROM organization_limit_overrides) = 0,
    'limit overrides leaked to a tenant role';

  -- A tenant cannot grant itself access either.
  BEGIN
    INSERT INTO organization_capability_grants (organization_id, capability_key, granted_by_email)
    VALUES ('00000000-0000-0000-0000-00000000000a', 'exports.tally', 'alice@a.test');
    RAISE EXCEPTION 'tenant INSERT into organization_capability_grants was allowed';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL; -- expected: RLS denies the write
  END;

  BEGIN
    INSERT INTO organization_limit_overrides (organization_id, limit_key, value, assigned_by_email)
    VALUES ('00000000-0000-0000-0000-00000000000a', 'station_count', 99, 'alice@a.test');
    RAISE EXCEPTION 'tenant INSERT into organization_limit_overrides was allowed';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL; -- expected: RLS denies the write
  END;

  -- Direct assignment INSERT is denied outright.
  BEGIN
    INSERT INTO user_station_assignments (user_id, station_id)
    VALUES ('00000000-0000-0000-0000-0000000000a1', gen_random_uuid());
    RAISE EXCEPTION 'direct user_station_assignments INSERT was allowed';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL; -- expected: RLS denies the write
  END;
END $$;

RESET ROLE;

-- === Signup trigger gating ===
DO $$
DECLARE
  v_count int;
  v_invited_user_id uuid := gen_random_uuid();
BEGIN
  -- 3a. Public signup with self-supplied signup_intent creates nothing.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (gen_random_uuid(), 'selfsignup@evil.test',
          '{"signup_intent":"owner","organization_name":"Evil Org"}'::jsonb);
  SELECT count(*) INTO v_count FROM organizations WHERE name = 'Evil Org';
  ASSERT v_count = 0, 'self-signup metadata created an organization';

  -- 3b. GoTrue inserts an invite with invited_at NULL, then sets invited_at.
  INSERT INTO auth.users (id, email, raw_user_meta_data, invited_at)
  VALUES (v_invited_user_id, 'invited@owner.test',
          '{"signup_intent":"owner","organization_name":"Invited Org","role":"PlatformAdmin"}'::jsonb,
          NULL);
  SELECT count(*) INTO v_count FROM organizations WHERE name = 'Invited Org';
  ASSERT v_count = 0, 'owner invite bootstrapped before invited_at was set';

  UPDATE auth.users SET invited_at = now() WHERE id = v_invited_user_id;
  SELECT count(*) INTO v_count FROM organizations WHERE name = 'Invited Org';
  ASSERT v_count = 1, 'invited_at update did not bootstrap an organization';
  ASSERT (SELECT role FROM users WHERE email = 'invited@owner.test') = 'Owner',
    'bootstrap role was not pinned to Owner';

  -- Repeating the column update invokes the trigger but must not duplicate
  -- either the organization or profile.
  UPDATE auth.users SET invited_at = invited_at + interval '1 second' WHERE id = v_invited_user_id;
  ASSERT (SELECT count(*) FROM organizations WHERE name = 'Invited Org') = 1,
    'repeated invited_at update duplicated the organization';
  ASSERT (SELECT count(*) FROM users WHERE auth_user_id = v_invited_user_id) = 1,
    'repeated invited_at update duplicated the user profile';

  -- 3c. If invited_at arrives before metadata, a later server-controlled app
  -- metadata update must also self-heal the account.
  INSERT INTO auth.users (id, email, invited_at)
  VALUES (gen_random_uuid(), 'late-metadata@owner.test', now());
  ASSERT (SELECT count(*) FROM organizations WHERE name = 'Late Metadata Org') = 0,
    'invite without owner metadata created an organization';
  UPDATE auth.users
  SET raw_app_meta_data = '{"signup_intent":"owner","organization_name":"Late Metadata Org"}'::jsonb
  WHERE email = 'late-metadata@owner.test';
  ASSERT (SELECT count(*) FROM organizations WHERE name = 'Late Metadata Org') = 1,
    'server app metadata update did not bootstrap an invited owner';

  -- 3d. Server-set app metadata also authorizes the bootstrap.
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (gen_random_uuid(), 'appmeta@owner.test',
          '{"organization_name":"AppMeta Org"}'::jsonb,
          '{"signup_intent":"owner"}'::jsonb);
  SELECT count(*) INTO v_count FROM organizations WHERE name = 'AppMeta Org';
  ASSERT v_count = 1, 'app-metadata owner did not bootstrap an organization';
END $$;

ROLLBACK;
SELECT 'RLS tenancy assertions passed' AS result;
