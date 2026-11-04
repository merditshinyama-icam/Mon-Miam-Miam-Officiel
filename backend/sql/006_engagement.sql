CREATE TABLE IF NOT EXISTS announcements (
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 kind TEXT NOT NULL CHECK(kind IN ('promotion','event','game')),
 title TEXT NOT NULL, description TEXT NOT NULL, image TEXT NOT NULL,
 starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL,
 published BOOLEAN NOT NULL DEFAULT FALSE, archived BOOLEAN NOT NULL DEFAULT FALSE,
 capacity INTEGER CHECK(capacity BETWEEN 1 AND 10000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS announcements_restaurant ON announcements(restaurant_id,ends_at);
CREATE TABLE IF NOT EXISTS participations (
 announcement_id TEXT NOT NULL REFERENCES announcements(id),
 user_id TEXT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(announcement_id,user_id)
);
CREATE TABLE IF NOT EXISTS point_adjustments (
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 user_id TEXT NOT NULL REFERENCES users(id), actor_id TEXT NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL, delta INTEGER NOT NULL CHECK(delta BETWEEN -10000 AND 10000 AND delta <> 0),
 reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(actor_id,request_key)
);
