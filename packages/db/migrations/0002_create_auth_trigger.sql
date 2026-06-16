-- Conditionally create auth schema and users table if they do not exist (for vanilla local Postgres compatibility)
-- Wrapped in a DO block to prevent permission checks on remote Supabase instances where schema 'auth' already exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar(255),
      raw_user_meta_data jsonb,
      raw_app_meta_data jsonb
    );
  END IF;
END
$$;

-- Trigger function to handle user creation sync
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
  -- 1. Check if user already exists by email in public.users
  SELECT id INTO v_existing_user_id FROM public.users WHERE email = NEW.email;

  IF v_existing_user_id IS NOT NULL THEN
    -- User exists (Invitation Flow)
    -- Update the existing user with the auth_user_id and activate them
    UPDATE public.users
    SET 
      auth_user_id = NEW.id,
      status = 'ACTIVE',
      full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', full_name),
      updated_at = now()
    WHERE id = v_existing_user_id;
  ELSE
    -- User does not exist (Self-Signup / Owner Flow)
    -- Resolve organization name
    v_org_name := COALESCE(NEW.raw_user_meta_data->>'organization_name', NEW.raw_user_meta_data->>'company_name', SPLIT_PART(NEW.email, '@', 1) || '''s Station');
    
    -- Create a new organization
    INSERT INTO public.organizations (id, name, subscription_plan, subscription_status, created_at, updated_at)
    VALUES (gen_random_uuid(), v_org_name, 'Core', 'Active', now(), now())
    RETURNING id INTO v_new_org_id;

    -- Resolve full name
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));

    -- Create new user
    v_new_user_id := gen_random_uuid();
    INSERT INTO public.users (id, organization_id, auth_user_id, full_name, email, status, created_at, updated_at)
    VALUES (v_new_user_id, v_new_org_id, NEW.id, v_full_name, NEW.email, 'ACTIVE', now(), now());

    -- Resolve default role (Owner for self-signup)
    v_default_role := COALESCE(NEW.raw_user_meta_data->>'role', 'Owner');

    -- Insert role assignment
    INSERT INTO public.user_roles (id, user_id, role, created_at)
    VALUES (gen_random_uuid(), v_new_user_id, v_default_role, now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if it exists and recreate it
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();