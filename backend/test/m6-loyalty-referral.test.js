import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/database.js';
import {
  RESTAURANT,
  DEFAULT_SETTINGS,
  addPoints,
  balance,
  calculateTotals,
  reservePoints,
  releasePoints,
  rewardFulfilledOrder,
} from '../src/domain.js';

// MMM-34 / MMM-35 : regression tests prepared with Codex, using only an in-memory DB.
let db;
before(async () => {
  db = await openDatabase({ memory: true });
  await db.query('INSERT INTO restaurants(id,name,slug,settings) VALUES($1,$2,$1,$3)', [
    RESTAURANT,
    'Restaurant de test M6',
    JSON.stringify(DEFAULT_SETTINGS),
  ]);
});
after(async () => {
  await db?.close();
});

async function student(referrer = null) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO users(id,restaurant_id,email,name,phone,password_hash,role,referral_code,referrer_id)
    VALUES($1,$2,$3,'Test M6','+243810000000','not-a-login-hash','student',$1,$4)`,
    [id, RESTAURANT, `${id}@example.test`, referrer],
  );
  return id;
}
async function order(userId, overrides = {}) {
  const data = {
    id: randomUUID(),
    restaurant_id: RESTAURANT,
    user_id: userId,
    subtotal: 12000,
    discount: 3000,
    delivery_fee: 2000,
    payment_status: 'paid',
    ...overrides,
  };
  const { rows } = await db.query(
    `INSERT INTO orders(id,restaurant_id,user_id,request_key,service,
    subtotal,discount,delivery_fee,total,payment_status,status)
    VALUES($1,$2,$3,$1,'delivery',$4,$5,$6,$7,$8,'delivered') RETURNING *`,
    [
      data.id,
      data.restaurant_id,
      userId,
      data.subtotal,
      data.discount,
      data.delivery_fee,
      data.subtotal - data.discount + data.delivery_fee,
      data.payment_status,
    ],
  );
  return rows[0];
}
const reward = (value) => db.transaction((tx) => rewardFulfilledOrder(tx, value));

test('MMM-34 : les gains excluent la remise et les frais de livraison', async () => {
  const id = await student();
  const value = await order(id);
  await reward(value);
  assert.equal(await balance(db, id), 3); // (12000 - 3000) / 3000
  const { rows } = await db.query('SELECT points_earned FROM orders WHERE id=$1', [value.id]);
  assert.equal(rows[0].points_earned, 3);
});

test('MMM-34 : retraiter une commande ne double pas les points', async () => {
  const id = await student();
  const value = await order(id, { subtotal: 10000, discount: 0 });
  await reward(value);
  await reward(value);
  assert.equal(await balance(db, id), 3);
  const { rows } = await db.query(
    'SELECT COUNT(*)::integer AS count FROM point_lots WHERE source=$1',
    [`order:${value.id}`],
  );
  assert.equal(rows[0].count, 1);
});

test('MMM-34 : reserver les points consomme le lot expirant le plus tot', async () => {
  const id = await student();
  const value = await order(id);
  await addPoints(db, id, 10, `soon:${id}`, 10);
  await addPoints(db, id, 20, `later:${id}`, 30);
  await db.transaction((tx) => reservePoints(tx, id, value.id, 15));
  const { rows } = await db.query(
    'SELECT source,remaining FROM point_lots WHERE user_id=$1 ORDER BY expires_at',
    [id],
  );
  assert.deepEqual(
    rows.map((row) => row.remaining),
    [0, 15],
  );
  assert.equal(await balance(db, id), 15);
  await db.transaction((tx) => releasePoints(tx, value.id));
  await db.transaction((tx) => releasePoints(tx, value.id));
  assert.equal(await balance(db, id), 30); // cancellation replay cannot credit twice
});

test('MMM-34 : solde insuffisant, aucune reservation partielle', async () => {
  const id = await student();
  const value = await order(id);
  await addPoints(db, id, 10, `insufficient:${id}`, 30);
  await assert.rejects(
    db.transaction((tx) => reservePoints(tx, id, value.id, 15)),
    (error) => error.status === 409,
  );
  assert.equal(await balance(db, id), 10);
  const { rows } = await db.query(
    'SELECT COUNT(*)::integer AS count FROM point_allocations WHERE order_id=$1',
    [value.id],
  );
  assert.equal(rows[0].count, 0);
});

test('MMM-34 : remise CDF par lots et frais de livraison conserves', () => {
  assert.deepEqual(
    calculateTotals([{ price: 9000, quantity: 1 }], 'delivery', 15, DEFAULT_SETTINGS),
    { subtotal: 9000, discount: 3000, deliveryFee: 2000, total: 8000 },
  );
  assert.throws(
    () => calculateTotals([{ price: 9000, quantity: 1 }], 'onsite', 1, DEFAULT_SETTINGS),
    /lots/,
  );
});

test('MMM-35 : aucun gain ni bonus de parrainage avant paiement confirme', async () => {
  const parent = await student();
  const child = await student(parent);
  const value = await order(child, { payment_status: 'pending' });
  await assert.rejects(reward(value), (error) => error.status === 409);
  assert.equal(await balance(db, child), 0);
  assert.equal(await balance(db, parent), 0);
  const { rows } = await db.query('SELECT referral_rewarded FROM users WHERE id=$1', [child]);
  assert.equal(rows[0].referral_rewarded, false);
});

test('MMM-35 : un seul bonus par filleul, meme apres plusieurs commandes', async () => {
  const parent = await student();
  const child = await student(parent);
  const first = await order(child);
  await reward(first);
  await reward(first);
  await reward(await order(child));
  assert.equal(await balance(db, parent), DEFAULT_SETTINGS.referralBonus);
  assert.equal(await balance(db, child), 6);
  const { rows } = await db.query('SELECT referral_rewarded FROM users WHERE id=$1', [child]);
  assert.equal(rows[0].referral_rewarded, true);
  const lots = await db.query('SELECT COUNT(*)::integer AS count FROM point_lots WHERE source=$1', [
    `referral:${child}`,
  ]);
  assert.equal(lots.rows[0].count, 1);
});
