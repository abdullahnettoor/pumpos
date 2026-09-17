-- GoTrue may set invited_at and metadata in separate writes. Keep the existing
-- AFTER INSERT trigger and retry on either server-controlled signal. The
-- function itself accepts user metadata only when invited_at is present, while
-- raw_app_meta_data cannot be edited by the invited user.
DROP TRIGGER IF EXISTS on_auth_user_invited ON auth.users;
CREATE TRIGGER on_auth_user_invited
  AFTER UPDATE OF invited_at, raw_app_meta_data ON auth.users
  FOR EACH ROW
  WHEN (
    (OLD.invited_at IS DISTINCT FROM NEW.invited_at AND NEW.invited_at IS NOT NULL)
    OR OLD.raw_app_meta_data IS DISTINCT FROM NEW.raw_app_meta_data
  )
  EXECUTE FUNCTION public.handle_new_user();
