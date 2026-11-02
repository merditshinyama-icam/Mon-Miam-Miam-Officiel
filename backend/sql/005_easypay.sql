ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_reference TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_order_ref TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_state TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_reference_unique ON payments(provider_reference) WHERE provider_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_order_ref_unique ON payments(provider_order_ref) WHERE provider_order_ref IS NOT NULL;
