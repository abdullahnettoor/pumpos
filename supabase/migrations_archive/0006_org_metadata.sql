-- Org-level profile/branding metadata (legal name, GSTIN, PAN, address, etc.)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb NOT NULL;
