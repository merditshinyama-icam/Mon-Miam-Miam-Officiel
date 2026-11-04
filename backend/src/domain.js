import { randomUUID } from 'node:crypto';
export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const requireCondition = (value, status, message) => {
  if (!value) throw new AppError(status, message);
};
export const DEFAULT_SETTINGS = {
  deliveryFee: 2000,
  earnEvery: 3000,
  redeemPoints: 15,
  redeemValue: 3000,
  referralBonus: 5,
  pointValidityDays: 365,
  openingHours: 'Lundi – samedi · 11 h – 19 h',
  location: 'Kinshasa · Restaurant étudiant',
};
export const RESTAURANT = 'mon-miam-miam-kinshasa';
export const THEMES = ['official', 'forest', 'burgundy', 'blue', 'plum', 'orange'];
export const publicUser = (user) => {
  const { password_hash, ...safe } = user;
  return safe;
};
export async function settings(db, restaurantId = RESTAURANT) {
  const { rows } = await db.query('SELECT settings FROM restaurants WHERE id=$1', [restaurantId]);
  return { ...DEFAULT_SETTINGS, ...rows[0]?.settings };
}
export async function balance(db, userId) {
  const { rows } = await db.query(
    'SELECT COALESCE(SUM(remaining),0)::integer AS balance FROM point_lots WHERE user_id=$1 AND expires_at > NOW()',
    [userId],
  );
  return rows[0].balance;
}
export function calculateTotals(items, service, points, rules) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  requireCondition(Number.isSafeInteger(subtotal) && subtotal > 0, 400, 'Panier invalide.');
  requireCondition(
    points % rules.redeemPoints === 0,
    400,
    `Utilisez vos points par lots de ${rules.redeemPoints}.`,
  );
  const discount = (points / rules.redeemPoints) * rules.redeemValue;
  requireCondition(discount <= subtotal, 400, 'La réduction dépasse le montant des articles.');
  const deliveryFee = service === 'delivery' ? rules.deliveryFee : 0;
  return { subtotal, discount, deliveryFee, total: subtotal - discount + deliveryFee };
}
export async function addPoints(db, userId, amount, source, validityDays) {
  if (amount <= 0) return;
  await db.query(
    `INSERT INTO point_lots(id,user_id,source,earned,remaining,expires_at)
    VALUES($1,$2,$3,$4,$4,NOW()+($5::integer * INTERVAL '1 day')) ON CONFLICT(source) DO NOTHING`,
    [randomUUID(), userId, source, amount, validityDays],
  );
}
export async function reservePoints(db, userId, orderId, amount) {
  const { rows } = await db.query(
    'SELECT * FROM point_lots WHERE user_id=$1 AND remaining>0 AND expires_at>NOW() ORDER BY expires_at,id FOR UPDATE',
    [userId],
  );
  requireCondition(
    rows.reduce((s, l) => s + l.remaining, 0) >= amount,
    409,
    'Solde de points insuffisant.',
  );
  let rest = amount;
  for (const lot of rows) {
    if (!rest) break;
    const spend = Math.min(rest, lot.remaining);
    rest -= spend;
    await db.query('UPDATE point_lots SET remaining=remaining-$1 WHERE id=$2', [spend, lot.id]);
    await db.query('INSERT INTO point_allocations(order_id,lot_id,amount) VALUES($1,$2,$3)', [
      orderId,
      lot.id,
      spend,
    ]);
  }
}
export async function releasePoints(db, orderId) {
  const { rows } = await db.query(
    'UPDATE point_allocations SET released=TRUE WHERE order_id=$1 AND released=FALSE RETURNING lot_id,amount',
    [orderId],
  );
  for (const allocation of rows)
    await db.query('UPDATE point_lots SET remaining=remaining+$1 WHERE id=$2', [
      allocation.amount,
      allocation.lot_id,
    ]);
}
export function nextStatuses(order) {
  return (
    {
      confirmed: ['preparing'],
      preparing: ['ready'],
      ready: [order.service === 'onsite' ? 'served' : 'delivering'],
      delivering: ['delivered'],
    }[order.status] || []
  );
}
export async function rewardFulfilledOrder(db, order) {
  requireCondition(order.payment_status === 'paid', 409, 'Le paiement doit être confirmé.');
  const rules = await settings(db, order.restaurant_id);
  const earned = Math.floor((order.subtotal - order.discount) / rules.earnEvery);
  await addPoints(db, order.user_id, earned, `order:${order.id}`, rules.pointValidityDays);
  await db.query('UPDATE orders SET points_earned=$1 WHERE id=$2', [earned, order.id]);
  const {
    rows: [user],
  } = await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [order.user_id]);
  if (user.referrer_id && !user.referral_rewarded) {
    await addPoints(
      db,
      user.referrer_id,
      rules.referralBonus,
      `referral:${user.id}`,
      rules.pointValidityDays,
    );
    await db.query('UPDATE users SET referral_rewarded=TRUE WHERE id=$1', [user.id]);
  }
}
export async function audit(db, actor, action, entity) {
  await db.query('INSERT INTO audit_log(id,actor_id,action,entity_id) VALUES($1,$2,$3,$4)', [
    randomUUID(),
    actor,
    action,
    entity,
  ]);
}
