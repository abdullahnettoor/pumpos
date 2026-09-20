-- Suspension is independent of billing.
--
-- It was previously stored as a Subscription Status, which meant a confirmed
-- payment overwrote it: an Organization suspended for fraud could clear its
-- own stop by paying an invoice. The stop now lives in its own column, so the
-- billing lifecycle and the manual stop can move independently.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

-- Existing stops keep their meaning.
UPDATE public.organizations
SET suspended_at = now()
WHERE upper(subscription_status) = 'SUSPENDED';
