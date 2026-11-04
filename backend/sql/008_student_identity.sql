ALTER TABLE users ADD COLUMN IF NOT EXISTS student_identity_id TEXT REFERENCES users(id);
CREATE UNIQUE INDEX IF NOT EXISTS users_student_membership_unique
ON users(student_identity_id,restaurant_id) WHERE student_identity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_student_identity ON users(student_identity_id);
