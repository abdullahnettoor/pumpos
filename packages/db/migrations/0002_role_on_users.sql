ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar(50);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    UPDATE "users" u
    SET "role" = r."role"
    FROM (
      SELECT DISTINCT ON ("user_id") "user_id", "role"
      FROM "user_roles"
      ORDER BY "user_id", "created_at" DESC, "id" DESC
    ) r
    WHERE u."id" = r."user_id"
      AND (u."role" IS NULL OR u."role" = '');
  END IF;
END
$$;
--> statement-breakpoint
UPDATE "users"
SET "role" = 'Staff'
WHERE "role" IS NULL OR "role" = '';
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'Staff';
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;
--> statement-breakpoint
DROP POLICY IF EXISTS user_roles_tenant_policy ON "user_roles";
--> statement-breakpoint
DROP TABLE IF EXISTS "user_roles";
--> statement-breakpoint
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
    UPDATE public.users
    SET
      auth_user_id = NEW.id,
      status = 'ACTIVE',
      full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', full_name),
      role = COALESCE(role, NEW.raw_user_meta_data->>'role', 'Staff'),
      updated_at = now()
    WHERE id = v_existing_user_id;
  ELSE
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
