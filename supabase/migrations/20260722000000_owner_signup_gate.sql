-- =====================================================================
-- 20260722000000 — Gate self-signup to invited owners only (Phase A0)
--
-- Hardens public.handle_new_user() so an unmatched auth.users insert no
-- longer silently creates an organization + Owner. The self-signup branch
-- now fires ONLY when the invite metadata explicitly carries
-- `signup_intent = 'owner'`. Any other unmatched insert (e.g. a synthetic
-- staff handle, a stray/manual insert) links if it matches an existing
-- users row and otherwise does nothing — no org is created.
--
-- Idempotent: CREATE OR REPLACE. Re-running is safe.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_existing_user_id uuid;
  v_new_org_id uuid;
  v_new_user_id uuid;
  v_org_name text;
  v_full_name text;
  v_default_role text;
BEGIN
  IF NEW.email IS NOT NULL THEN
    SELECT id INTO v_existing_user_id FROM public.users WHERE email = NEW.email;
  END IF;

  IF v_existing_user_id IS NOT NULL THEN
    -- Invitation flow: attach auth identity to the pre-created user
    UPDATE public.users
    SET
      auth_user_id = NEW.id,
      status = 'ACTIVE',
      full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', full_name),
      role = COALESCE(role, NEW.raw_user_meta_data->>'role', 'Staff'),
      updated_at = now()
    WHERE id = v_existing_user_id;

  ELSIF COALESCE(NEW.raw_user_meta_data->>'signup_intent', '') = 'owner' THEN
    -- Owner-invite flow ONLY: create organization + owner user.
    -- Gated behind an explicit signup_intent so stray/unmatched inserts
    -- (including synthetic staff handles) never provision a tenant.
    v_org_name := COALESCE(NEW.raw_user_meta_data->>'organization_name', NEW.raw_user_meta_data->>'company_name', SPLIT_PART(NEW.email, '@', 1) || '''s Station');

    INSERT INTO public.organizations (id, name, subscription_plan, subscription_status, created_at, updated_at)
    VALUES (gen_random_uuid(), v_org_name, 'Core', 'Active', now(), now())
    RETURNING id INTO v_new_org_id;

    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));
    v_default_role := COALESCE(NEW.raw_user_meta_data->>'role', 'Owner');

    v_new_user_id := gen_random_uuid();
    INSERT INTO public.users (id, organization_id, auth_user_id, full_name, email, role, status, created_at, updated_at)
    VALUES (v_new_user_id, v_new_org_id, NEW.id, v_full_name, NEW.email, v_default_role, 'ACTIVE', now(), now());

  END IF;
  -- Any other unmatched insert: no-op (no org created).

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
