ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS confirmed_by TEXT REFERENCES users(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Reprise unique des paiements et démonstrations déjà enregistrés.
DO $upgrade$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM app_data_migrations WHERE id='012-payment-kinds') THEN
  UPDATE orders o SET is_simulated=TRUE,payment_method='simulation'
  WHERE EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status='paid' AND p.mode IN ('demo','easypay-sandbox'))
   AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status='paid' AND p.mode='easypay-live');
  UPDATE orders o SET payment_status='paid',status='confirmed',is_simulated=TRUE,
   payment_method='simulation',points_earned=s.points_earned,paid_at=s.updated_at,updated_at=NOW()
  FROM payment_simulations s WHERE s.order_id=o.id AND s.outcome='paid'
   AND o.status='awaiting_payment' AND o.payment_status<>'paid';
  UPDATE orders o SET payment_method=COALESCE(payment_method,
   CASE WHEN total=0 THEN 'points' WHEN EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status='paid' AND p.mode IN ('easypay-live','easypay-sandbox')) THEN 'easypay' ELSE 'legacy' END),
   paid_at=COALESCE(paid_at,updated_at) WHERE payment_status='paid';
  INSERT INTO app_data_migrations(id) VALUES('012-payment-kinds');
 END IF;
END $upgrade$;

CREATE TABLE IF NOT EXISTS invoices (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),user_id TEXT NOT NULL REFERENCES users(id),
 number TEXT NOT NULL UNIQUE,issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 customer_name TEXT NOT NULL,customer_email TEXT NOT NULL,restaurant_name TEXT NOT NULL,
 payment_method TEXT NOT NULL,is_simulated BOOLEAN NOT NULL,
 subtotal INTEGER NOT NULL,discount INTEGER NOT NULL,delivery_fee INTEGER NOT NULL,total INTEGER NOT NULL,
 items JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS invoices_restaurant_date ON invoices(restaurant_id,issued_at DESC);
CREATE INDEX IF NOT EXISTS invoices_customer_date ON invoices(restaurant_id,user_id,issued_at DESC);
INSERT INTO invoices(order_id,restaurant_id,user_id,number,issued_at,customer_name,customer_email,restaurant_name,
 payment_method,is_simulated,subtotal,discount,delivery_fee,total,items)
 SELECT o.id,o.restaurant_id,o.user_id,
 (CASE WHEN o.is_simulated THEN 'DEMO-' ELSE '' END)||'MMM-'||to_char(COALESCE(o.paid_at,o.updated_at),'YYYY')||'-'||upper(replace(o.id,'-','')),
 COALESCE(o.paid_at,o.updated_at),u.name,u.email,r.name,COALESCE(o.payment_method,'legacy'),o.is_simulated,o.subtotal,o.discount,o.delivery_fee,o.total,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('name',i.name,'price',i.price,'quantity',i.quantity) ORDER BY i.name)
  FROM order_items i WHERE i.order_id=o.id),'[]'::jsonb)
 FROM orders o JOIN users u ON u.id=o.user_id JOIN restaurants r ON r.id=o.restaurant_id
 WHERE o.payment_status='paid' ON CONFLICT(order_id) DO NOTHING;
