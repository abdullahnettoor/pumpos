ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "access_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "subscription_plan" SET DEFAULT 'CORE';--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "subscription_status" SET DEFAULT 'ACTIVE';--> statement-breakpoint
UPDATE "organizations" SET "subscription_plan" = 'CORE' WHERE upper("subscription_plan") = 'CORE';--> statement-breakpoint
UPDATE "organizations" SET "subscription_status" = CASE upper("subscription_status")
    WHEN 'ACTIVE' THEN 'ACTIVE'
    WHEN 'DEACTIVATED' THEN 'SUSPENDED'
    WHEN 'REVOKED' THEN 'SUSPENDED'
    ELSE upper("subscription_status")
  END;--> statement-breakpoint
-- The Owner signup trigger writes the plan and status explicitly, so it must
-- speak the typed keys too. Mirrors supabase/migrations/20260919090000.
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
