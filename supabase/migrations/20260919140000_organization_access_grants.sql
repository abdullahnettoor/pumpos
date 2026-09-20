-- Phase E1: Organization Entitlement and Limit history.
--
-- Grants and Limit overrides are append-only: revocation closes the active row
-- and a regrant inserts a new one, so every access period stays inspectable.
-- Actor columns are platform-admin snapshots (email + optional auth subject),
-- deliberately not foreign keys to tenant `users`.

CREATE TABLE "organization_capability_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"capability_key" varchar(100) NOT NULL,
	"granted_by_subject" varchar(255),
	"granted_by_email" varchar(255) NOT NULL,
	"reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_subject" varchar(255),
	"revoked_by_email" varchar(255)
);
CREATE TABLE "organization_limit_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"limit_key" varchar(100) NOT NULL,
	"value" integer NOT NULL,
	"assigned_by_subject" varchar(255),
	"assigned_by_email" varchar(255) NOT NULL,
	"reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_subject" varchar(255),
	"revoked_by_email" varchar(255),
	CONSTRAINT "organization_limit_overrides_value_positive" CHECK ("organization_limit_overrides"."value" > 0)
);
ALTER TABLE "organization_capability_grants" ADD CONSTRAINT "organization_capability_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "organization_limit_overrides" ADD CONSTRAINT "organization_limit_overrides_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "organization_capability_grants_org_idx" ON "organization_capability_grants" USING btree ("organization_id");

CREATE UNIQUE INDEX "organization_capability_grants_active_uniq" ON "organization_capability_grants" USING btree ("organization_id","capability_key") WHERE "organization_capability_grants"."revoked_at" IS NULL;

CREATE INDEX "organization_limit_overrides_org_idx" ON "organization_limit_overrides" USING btree ("organization_id");

CREATE UNIQUE INDEX "organization_limit_overrides_active_uniq" ON "organization_limit_overrides" USING btree ("organization_id","limit_key") WHERE "organization_limit_overrides"."revoked_at" IS NULL;

-- Commercial history is platform-only. RLS is enabled with no policy for
-- tenant roles, so `authenticated` and `anon` are denied by default, and the
-- table grants are revoked outright. The server (service role) still reads and
-- writes these rows; tenants only ever see the effective Access Document.
ALTER TABLE public.organization_capability_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_limit_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_capability_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_limit_overrides FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_capability_grants FROM authenticated, anon;
REVOKE ALL ON TABLE public.organization_limit_overrides FROM authenticated, anon;
