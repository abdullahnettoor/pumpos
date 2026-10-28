-- Per-user Permission changes (ADR 0013): tenant-readable (own Organization),
-- written only by the server.
ALTER TABLE "user_permission_changes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_permission_changes_tenant_select_policy ON "user_permission_changes";
CREATE POLICY user_permission_changes_tenant_select_policy ON "user_permission_changes" FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());
