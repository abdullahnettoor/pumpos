-- Phase E1: typed Organization access fields.
--
-- `subscription_plan` / `subscription_status` were free-text labels ('Core',
-- 'Active', 'Deactivated', 'Revoked'). They now carry the typed Product Plan
-- and Subscription Status keys the access registry in `@pump/core` defines.
-- `access_until` records the instant access is paid through; Phase E1 reports
-- it, Phase E2 enforces grace periods with it.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS access_until timestamptz;

ALTER TABLE public.organizations
  ALTER COLUMN subscription_plan SET DEFAULT 'CORE';

ALTER TABLE public.organizations
  ALTER COLUMN subscription_status SET DEFAULT 'ACTIVE';

-- Existing rows. Only 'Core' is a known legacy plan; anything else is left as
-- stored and resolves to the CORE baseline in code rather than being guessed at.
UPDATE public.organizations
SET subscription_plan = 'CORE'
WHERE upper(subscription_plan) = 'CORE';

-- Deactivated and Revoked were both manual PumpOS stops, which is exactly what
-- SUSPENDED means in the typed model.
UPDATE public.organizations
SET subscription_status = CASE upper(subscription_status)
  WHEN 'ACTIVE' THEN 'ACTIVE'
  WHEN 'DEACTIVATED' THEN 'SUSPENDED'
  WHEN 'REVOKED' THEN 'SUSPENDED'
  ELSE upper(subscription_status)
END;

-- The Owner signup trigger writes the plan and status explicitly, so it must
-- speak the typed keys too — otherwise every new Organization is created with
-- legacy values the moment this migration lands. Body is otherwise unchanged
-- from 20260914090000_authoritative_rls_tenancy.sql.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_existing_user_id uuid;
  v_new_org_id uuid;
  v_new_user_id uuid;
  v_org_name text;
  v_full_name text;
  v_owner_intent boolean;
BEGIN
  IF NEW.email IS NOT NULL THEN
    SELECT id INTO v_existing_user_id FROM public.users WHERE email = NEW.email;
  END IF;

  -- Owner bootstrap requires authority the end user cannot self-supply:
  -- either server-set app metadata (admin createUser) or a server-issued
  -- invite (invited_at is set only by the admin invite flow).
  v_owner_intent :=
    COALESCE(NEW.raw_app_meta_data->>'signup_intent', '') = 'owner'
    OR (
      NEW.invited_at IS NOT NULL
      AND COALESCE(NEW.raw_user_meta_data->>'signup_intent', '') = 'owner'
    );

  IF v_existing_user_id IS NOT NULL THEN
    UPDATE public.users
    SET
      auth_user_id = NEW.id,
      status = 'ACTIVE',
      full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', full_name),
      role = COALESCE(role, 'Staff'),
      updated_at = now()
    WHERE id = v_existing_user_id;

  ELSIF v_owner_intent THEN
    v_org_name := COALESCE(NEW.raw_user_meta_data->>'organization_name', NEW.raw_app_meta_data->>'organization_name', SPLIT_PART(NEW.email, '@', 1) || '''s Station');

    INSERT INTO public.organizations (id, name, subscription_plan, subscription_status, created_at, updated_at)
    VALUES (gen_random_uuid(), v_org_name, 'CORE', 'ACTIVE', now(), now())
    RETURNING id INTO v_new_org_id;

    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));

    v_new_user_id := gen_random_uuid();
    INSERT INTO public.users (id, organization_id, auth_user_id, full_name, email, role, status, created_at, updated_at)
    VALUES (v_new_user_id, v_new_org_id, NEW.id, v_full_name, NEW.email, 'Owner', 'ACTIVE', now(), now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
