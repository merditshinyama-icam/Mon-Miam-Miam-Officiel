import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/database.js';
import { seedDemo } from '../src/seed.js';
import { createApp } from '../src/app.js';
import { rewardFulfilledOrder } from '../src/domain.js';
import { settleOrder } from '../src/settlements.js';

const headers = { 'X-Requested-With': 'MonMiamMiam', Origin: 'https://demo.example' };
async function fixture(enabled = true) {
  const db = await openDatabase({ memory: true });
  const password = 'Simulation2026!';
  await seedDemo(db, password);
  const app = createApp(db, {
    production: true,
    origin: headers.Origin,
    paymentMode: 'disabled',
    demoPreview: enabled,
  });
  const agent = request.agent(app);
  const login = await agent
    .post('/api/auth/login')
    .set(headers)
    .send({ email: 'student@demo.miam.test', password });
  assert.equal(login.status, 200);
  const cookie = login.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ');
  const authenticated = {
    get: (url) => agent.get(url).set('Cookie', cookie),
    post: (url) => agent.post(url).set('Cookie', cookie),
  };
  const user = login.body.user;
  const id = randomUUID();
  await db.query(
    `INSERT INTO orders(id,restaurant_id,user_id,request_key,service,subtotal,discount,delivery_fee,total)
   VALUES($1,$2,$3,$1,'delivery',12000,3000,2000,11000)`,
    [id, user.restaurant_id, user.id],
  );
  await db.query(
    "INSERT INTO payments(id,order_id,mode,phone,operator,provider_state) VALUES($1,$2,'easypay-live','+243810000000','m-pesa','INIT')",
    [randomUUID(), id],
  );
  return {
    db,
    agent: authenticated,
    app,
    user,
    id,
    cookie,
    post: (outcome) =>
      authenticated.post(`/api/orders/${id}/simulation`).set(headers).send({ outcome }),
  };
}

test('échec sans points, réussite persistante et répétitions concurrentes sans doubler le crédit ni modifier EasyPay', async () => {
  const f = await fixture();
  try {
    const before = (await f.agent.get('/api/loyalty')).body.balance;
    const payments = (await f.db.query('SELECT * FROM payments WHERE order_id=$1', [f.id])).rows;
    const original = (await f.db.query('SELECT * FROM orders WHERE id=$1', [f.id])).rows;
    assert.equal((await f.agent.get(`/api/orders/${f.id}/simulation`)).body.simulation, null);
    assert.equal((await f.post('failed')).status, 200);
    assert.equal((await f.agent.get('/api/loyalty')).body.balance, before);
    const results = await Promise.all([f.post('paid'), f.post('paid')]);
    assert.deepEqual(
      results.map((r) => r.status),
      [200, 200],
    );
    const result = await f.agent.get(`/api/orders/${f.id}/simulation`);
    assert.equal(result.body.simulation.outcome, 'paid');
    assert.equal(result.body.simulation.points_earned, 3); // hors remise et livraison
    assert.equal(result.body.balance, before + 3);
    const confirmed = (await f.db.query('SELECT * FROM orders WHERE id=$1', [f.id])).rows[0];
    assert.equal(confirmed.payment_status, 'paid');
    assert.equal(confirmed.status, 'confirmed');
    assert.equal(confirmed.is_simulated, true);
    assert.equal(confirmed.total, original[0].total);
    assert.equal(
      (await f.db.query('SELECT COUNT(*)::integer AS n FROM invoices WHERE order_id=$1', [f.id]))
        .rows[0].n,
      1,
    );
    assert.deepEqual(
      (await f.db.query("SELECT * FROM payments WHERE order_id=$1 AND mode<>'demo'", [f.id])).rows,
      payments,
    );
    assert.equal((await f.post('failed')).status, 409);
    assert.equal((await f.post('paid')).status, 200);
    assert.equal((await f.agent.get('/api/loyalty')).body.balance, before + 3);
    // Un vrai paiement honoré plus tard ne récompense pas à nouveau la même commande.
    await f.db.transaction((tx) => settleOrder(tx, f.id, 'easypay', false));
    await f.db.query("UPDATE orders SET status='delivered' WHERE id=$1", [f.id]);
    const order = (await f.db.query('SELECT * FROM orders WHERE id=$1', [f.id])).rows[0];
    await f.db.transaction((tx) => rewardFulfilledOrder(tx, order));
    assert.equal((await f.agent.get('/api/loyalty')).body.balance, before + 3);
    assert.equal((await f.post('paid')).status, 409);
  } finally {
    await f.db.close();
  }
});

test('simulation protégée par activation, session, rôle, propriétaire, restaurant et validation du corps', async () => {
  const f = await fixture();
  try {
    assert.equal(
      (
        await request(f.app)
          .post(`/api/orders/${f.id}/simulation`)
          .set(headers)
          .send({ outcome: 'paid' })
      ).status,
      401,
    );
    assert.equal(
      (
        await f.agent
          .post(`/api/orders/${f.id}/simulation`)
          .set(headers)
          .send({ outcome: 'paid', points: 10000 })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.agent
          .post(`/api/orders/${randomUUID()}/simulation`)
          .set(headers)
          .send({ outcome: 'paid' })
      ).status,
      404,
    );
    const adminLogin = await request(f.app)
      .post('/api/auth/login')
      .set(headers)
      .send({ email: 'admin@demo.miam.test', password: 'Simulation2026!' });
    const adminCookie = adminLogin.headers['set-cookie']
      .map((value) => value.split(';')[0])
      .join('; ');
    assert.equal(
      (
        await request(f.app)
          .post(`/api/orders/${f.id}/simulation`)
          .set(headers)
          .set('Cookie', adminCookie)
          .send({ outcome: 'paid' })
      ).status,
      403,
    );
    await f.db.query("INSERT INTO restaurants(id,name,slug) VALUES('other','Autre','other')");
    assert.equal(
      (
        await f.agent
          .post(`/api/orders/${f.id}/simulation`)
          .set(headers)
          .set('X-Restaurant-Slug', 'other')
          .send({ outcome: 'paid' })
      ).status,
      404,
    );
    await f.db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [f.id]);
    assert.equal((await f.post('paid')).status, 409);
    await f.db.query("UPDATE orders SET status='awaiting_payment' WHERE id=$1", [f.id]);
    await f.db.query(
      "UPDATE orders SET user_id=(SELECT id FROM users WHERE role='admin' LIMIT 1) WHERE id=$1",
      [f.id],
    );
    assert.equal((await f.post('paid')).status, 404);
    const disabled = createApp(f.db, {
      production: true,
      origin: headers.Origin,
      paymentMode: 'disabled',
      demoPreview: false,
    });
    const agent = request.agent(disabled);
    assert.equal(
      (
        await agent
          .post(`/api/orders/${f.id}/simulation`)
          .set(headers)
          .set('Cookie', f.cookie)
          .send({ outcome: 'paid' })
      ).status,
      404,
    );
  } finally {
    await f.db.close();
  }
});
