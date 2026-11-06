-- Résultats pédagogiques séparés des transactions du prestataire.
CREATE TABLE IF NOT EXISTS payment_simulations (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 outcome TEXT NOT NULL CHECK(outcome IN ('paid','failed')),
 points_earned INTEGER NOT NULL DEFAULT 0 CHECK(points_earned>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
