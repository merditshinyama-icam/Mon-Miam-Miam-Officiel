ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS slug TEXT;
UPDATE restaurants SET slug=id WHERE slug IS NULL;
ALTER TABLE restaurants ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_slug_unique ON restaurants(slug);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS branding JSONB NOT NULL DEFAULT '{}';
-- One address may have separate accounts in different restaurants.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_restaurant_email_unique ON users(restaurant_id,email);
