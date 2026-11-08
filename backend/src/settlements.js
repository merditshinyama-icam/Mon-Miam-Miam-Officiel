import { audit, requireCondition } from './domain.js';

export async function issueInvoice(tx, id) {
  await tx.query(
    `INSERT INTO invoices(order_id,restaurant_id,user_id,number,issued_at,customer_name,customer_email,restaurant_name,
    payment_method,is_simulated,subtotal,discount,delivery_fee,total,items)
   SELECT o.id,o.restaurant_id,o.user_id,
    (CASE WHEN o.is_simulated THEN 'DEMO-' ELSE '' END)||'MMM-'||to_char(COALESCE(o.paid_at,o.updated_at),'YYYY')||'-'||upper(replace(o.id,'-','')),
    COALESCE(o.paid_at,o.updated_at),u.name,u.email,r.name,COALESCE(o.payment_method,'legacy'),o.is_simulated,o.subtotal,o.discount,o.delivery_fee,o.total,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('name',i.name,'price',i.price,'quantity',i.quantity) ORDER BY i.name)
     FROM order_items i WHERE i.order_id=o.id),'[]'::jsonb)
   FROM orders o JOIN users u ON u.id=o.user_id JOIN restaurants r ON r.id=o.restaurant_id
   WHERE o.id=$1 AND o.payment_status='paid'
   ON CONFLICT(order_id) DO UPDATE SET payment_method=EXCLUDED.payment_method,is_simulated=FALSE,number=EXCLUDED.number,issued_at=EXCLUDED.issued_at
    WHERE invoices.is_simulated=TRUE AND EXCLUDED.is_simulated=FALSE`,
    [id],
  );
}

export async function settleOrder(tx, id, method, simulated, actor = null) {
  const {
    rows: [order],
  } = await tx.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [id]);
  requireCondition(
    order && order.status !== 'cancelled',
    409,
    'Cette commande ne peut pas être réglée.',
  );
  if (
    order.payment_status === 'paid' &&
    order.payment_method &&
    !(order.is_simulated && !simulated)
  ) {
    await issueInvoice(tx, id);
    return order;
  }
  const {
    rows: [updated],
  } = await tx.query(
    `UPDATE orders SET payment_status='paid',
   status=CASE WHEN status='awaiting_payment' THEN 'confirmed' ELSE status END,
   payment_method=$1,is_simulated=$2,paid_at=CASE WHEN is_simulated AND NOT $2 THEN NOW() ELSE COALESCE(paid_at,NOW()) END,updated_at=NOW() WHERE id=$3 RETURNING *`,
    [method, simulated, id],
  );
  await issueInvoice(tx, id);
  await audit(
    tx,
    actor,
    order.is_simulated && !simulated
      ? 'simulation_reconciled_real_payment'
      : `order_paid_${method}`,
    id,
  );
  return updated;
}
