-- Existing complaints retain manager review. Re-execution preserves all data.
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS review_role TEXT NOT NULL DEFAULT 'manager'
 CHECK(review_role IN ('manager','admin'));
