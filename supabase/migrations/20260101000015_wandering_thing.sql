-- DERIVED from packages/db/migrations/0015_wandering_thing.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

CREATE TABLE "user_permission_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"granted" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revoked" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_permission_changes" ADD CONSTRAINT "user_permission_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_changes" ADD CONSTRAINT "user_permission_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_changes" ADD CONSTRAINT "user_permission_changes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_permission_changes_user_uniq" ON "user_permission_changes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_permission_changes_org_idx" ON "user_permission_changes" USING btree ("organization_id");