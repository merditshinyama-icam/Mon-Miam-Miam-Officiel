-- Version 001. Idempotent bootstrap; future changes must use numbered migrations.
CREATE TABLE IF NOT EXISTS restaurants (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, settings JSONB NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, phone TEXT NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','employee','manager','admin')),
 active BOOLEAN NOT NULL DEFAULT TRUE, photo TEXT, theme TEXT NOT NULL DEFAULT 'official',
 dark BOOLEAN NOT NULL DEFAULT FALSE, public_ranking BOOLEAN NOT NULL DEFAULT FALSE,
 referral_code TEXT NOT NULL UNIQUE, referrer_id TEXT REFERENCES users(id),
 referral_rewarded BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS dishes (
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id), name TEXT NOT NULL,
 description TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('Plats','Boissons','Snacks')),
 price INTEGER NOT NULL CHECK(price > 0), image TEXT NOT NULL, available BOOLEAN NOT NULL DEFAULT TRUE,
 archived BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id), user_id TEXT NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'awaiting_payment'
 CHECK(status IN ('awaiting_payment','confirmed','preparing','ready','delivering','served','delivered','cancelled')),
 service TEXT NOT NULL CHECK(service IN ('onsite','delivery')), arrival_at TIMESTAMPTZ, address TEXT,
 subtotal INTEGER NOT NULL CHECK(subtotal >= 0), discount INTEGER NOT NULL CHECK(discount >= 0 AND discount <= subtotal),
 delivery_fee INTEGER NOT NULL CHECK(delivery_fee >= 0), total INTEGER NOT NULL CHECK(total >= 0),
 points_spent INTEGER NOT NULL DEFAULT 0, points_earned INTEGER NOT NULL DEFAULT 0,
 payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','failed','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(user_id, request_key), CHECK(total = subtotal - discount + delivery_fee)
);
CREATE INDEX IF NOT EXISTS orders_restaurant_created ON orders(restaurant_id, created_at);
CREATE TABLE IF NOT EXISTS order_items (
 order_id TEXT NOT NULL REFERENCES orders(id), dish_id TEXT NOT NULL REFERENCES dishes(id),
 name TEXT NOT NULL, price INTEGER NOT NULL CHECK(price > 0), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),
 PRIMARY KEY(order_id, dish_id)
);
CREATE TABLE IF NOT EXISTS payments (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), mode TEXT NOT NULL,
 phone TEXT NOT NULL, operator TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','paid','failed')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_pending ON payments(order_id) WHERE status = 'pending';
CREATE TABLE IF NOT EXISTS point_lots (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), source TEXT NOT NULL UNIQUE,
 earned INTEGER NOT NULL CHECK(earned > 0), remaining INTEGER NOT NULL CHECK(remaining >= 0 AND remaining <= earned),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS point_allocations (
 order_id TEXT NOT NULL REFERENCES orders(id), lot_id TEXT NOT NULL REFERENCES point_lots(id),
 amount INTEGER NOT NULL CHECK(amount > 0), released BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY(order_id, lot_id)
);
CREATE TABLE IF NOT EXISTS complaints (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), user_id TEXT NOT NULL REFERENCES users(id),
 message TEXT NOT NULL, draft TEXT, response TEXT, status TEXT NOT NULL DEFAULT 'open'
 CHECK(status IN ('open','pending','revise','resolved')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reviews (
 order_id TEXT PRIMARY KEY REFERENCES orders(id), user_id TEXT NOT NULL REFERENCES users(id),
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), message TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_log (
 id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id), action TEXT NOT NULL, entity_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
