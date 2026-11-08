import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { openDatabase } from '../src/database.js';
import { seedDemo } from '../src/seed.js';
import { createApp } from '../src/app.js';
import { settleOrder } from '../src/settlements.js';

const password = 'Decision2026!',
  headers = { 'X-Requested-With': 'MonMiamMiam', Origin: 'http://localhost:5133' };
async function fixture(options = {}) {
  const db = await openDatabase({ memory: true });
  await seedDemo(db, password);
  const app = createApp(db, {
    production: false,
    origin: headers.Origin,
    paymentMode: 'disabled',
    demoPreview: true,
    ...options,
  });
  const agents = {},
    users = {};
  for (const role of ['student', 'employee', 'manager', 'admin']) {
    agents[role] = request.agent(app);
    const login = await agents[role]
      .post('/api/auth/login')
      .set(headers)
      .send({ email: `${role}@demo.miam.test`, password });
    assert.equal(login.status, 200);
    users[role] = login.body.user;
  }
  const send = (role, method, path, body) => {
    const req = (typeof role === 'string' ? agents[role] : role)
      [method]('/api' + path)
      .set(headers);
    return body ? req.send(body) : req;
  };
  const create = async (method = 'cash', agent = 'student') => {
    const result = await send(agent, 'post', '/orders', {
      requestKey: randomUUID(),
      items: [{ dishId: 'moambe', quantity: 1 }],
      service: 'onsite',
      arrivalAt: new Date(Date.now() + 3600000).toISOString(),
      points: 0,
      paymentMethod: method,
    });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body.order;
  };
  return { db, app, agents, users, send, create };
}

test('espèces : les trois rôles peuvent valider le montant reçu, jamais le client, sans doublon', async () => {
  const f = await fixture();
  try {
    for (const role of ['employee', 'manager', 'admin']) {
      const o = await f.create();
      assert.equal(o.payment_method, 'cash');
      assert.equal(o.payment_status, 'pending');
      assert.equal(
        (await f.send('employee', 'patch', `/orders/${o.id}/status`, { status: 'preparing' }))
          .status,
        409,
      );
      assert.equal(
        (
          await f.send('student', 'post', `/orders/${o.id}/cash/confirm`, {
            received: true,
            amount: 9000,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await f.send(role, 'post', `/orders/${o.id}/cash/confirm`, {
            received: false,
            amount: 9000,
          })
        ).status,
        400,
      );
      assert.equal(
        (await f.send(role, 'post', `/orders/${o.id}/cash/confirm`, { received: true, amount: 1 }))
          .status,
        409,
      );
      for (let i = 0; i < 2; i++) {
        const result = await f.send(role, 'post', `/orders/${o.id}/cash/confirm`, {
          received: true,
          amount: 9000,
        });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.order.status, 'confirmed');
        assert.equal(result.body.order.is_simulated, false);
      }
      const invoice = (await f.send('student', 'get', `/invoices/${o.id}`)).body.invoice;
      assert.equal(invoice.total, 9000);
      assert.equal(invoice.payment_method, 'cash');
      assert.equal(invoice.is_simulated, false);
      const payment = (
        await f.db.query(
          "SELECT confirmed_by,confirmed_at FROM payments WHERE order_id=$1 AND mode='cash'",
          [o.id],
        )
      ).rows[0];
      assert.equal(payment.confirmed_by, f.users[role].id);
      assert.ok(payment.confirmed_at);
      const before = (await f.send('student', 'get', '/loyalty')).body.balance;
      for (const status of ['preparing', 'ready', 'served', 'served'])
        assert.equal(
          (await f.send('employee', 'patch', `/orders/${o.id}/status`, { status })).status,
          200,
        );
      assert.equal((await f.send('student', 'get', '/loyalty')).body.balance, before + 3);
    }
    const report = await f.send('manager', 'get', '/analytics?period=all&source=real');
    assert.equal(report.status, 200, JSON.stringify(report.body));
    assert.equal(report.body.summary.cash_received, 27000);
    assert.equal(report.body.summary.real_revenue, 27000);
    assert.equal(report.body.summary.simulated_revenue, 0);
    assert.equal(report.body.customers[0].fulfilled, 3);
    const bills = await f.send('admin', 'get', '/invoices?period=all&source=real');
    assert.equal(bills.body.total, 3);
    assert.equal(new Set(bills.body.invoices.map((i) => i.number)).size, 3);
    const unpaid = await f.create();
    await f.send('student', 'post', `/orders/${unpaid.id}/cancel`);
    assert.equal(
      (
        await f.send('admin', 'post', `/orders/${unpaid.id}/cash/confirm`, {
          received: true,
          amount: 9000,
        })
      ).status,
      409,
    );
  } finally {
    await f.db.close();
  }
});

test('simulation intégrale : confirmation, cuisine, facture, statistiques et points sans double récompense', async () => {
  const f = await fixture();
  try {
    const o = await f.create('simulation'),
      before = (await f.send('student', 'get', '/loyalty')).body.balance;
    assert.equal(
      (await f.send('student', 'post', `/orders/${o.id}/simulation`, { outcome: 'failed' })).status,
      200,
    );
    assert.equal((await f.send('student', 'get', `/invoices/${o.id}`)).status, 404);
    const attempts = await Promise.all([
      f.send('student', 'post', `/orders/${o.id}/simulation`, { outcome: 'paid' }),
      f.send('student', 'post', `/orders/${o.id}/simulation`, { outcome: 'paid' }),
    ]);
    assert.deepEqual(
      attempts.map((r) => r.status),
      [200, 200],
    );
    const confirmed = (await f.send('student', 'get', `/orders/${o.id}`)).body.order;
    assert.equal(confirmed.status, 'confirmed');
    assert.equal(confirmed.payment_status, 'paid');
    assert.equal(confirmed.is_simulated, true);
    assert.equal(confirmed.points_earned, 3);
    assert.equal((await f.send('student', 'get', '/loyalty')).body.balance, before + 3);
    for (const status of ['preparing', 'ready', 'served', 'served'])
      assert.equal(
        (await f.send('employee', 'patch', `/orders/${o.id}/status`, { status })).status,
        200,
      );
    assert.equal((await f.send('student', 'get', '/loyalty')).body.balance, before + 3);
    assert.equal(
      (
        await f.send('student', 'post', `/orders/${o.id}/review`, {
          rating: 5,
          message: 'Recette de démonstration complète',
        })
      ).status,
      201,
    );
    const bill = (await f.send('student', 'get', `/invoices/${o.id}`)).body.invoice;
    assert.ok(bill.number.startsWith('DEMO-'));
    assert.equal(bill.items[0].name, 'Poulet à la moambé');
    assert.equal(bill.total, 9000);
    const report = (await f.send('admin', 'get', '/analytics?period=all&source=simulation')).body;
    assert.equal(report.summary.simulated_revenue, 9000);
    assert.equal(report.summary.real_revenue, 0);
    assert.equal(report.summary.paid_orders, 1);
    assert.equal(report.operations.fulfilled, 1);
    assert.equal(report.popular[0].quantity, 1);
    assert.equal(report.customers[0].purchases, 1);
    assert.equal(
      (await f.send('admin', 'get', '/analytics?period=all&source=real')).body.summary.total,
      0,
    );
  } finally {
    await f.db.close();
  }
});

test('factures : accès par client et restaurant, instantané conservé, filtres et CSV protégé', async () => {
  const f = await fixture();
  try {
    const other = request.agent(f.app);
    let response = await f.send(other, 'post', '/auth/register', {
      name: '=2+2',
      email: 'autre@example.test',
      phone: '+243810000002',
      password,
    });
    assert.equal(response.status, 201);
    const otherId = response.body.user.id;
    const first = await f.create(),
      second = await f.create('cash', other);
    for (const o of [first, second])
      assert.equal(
        (
          await f.send('admin', 'post', `/orders/${o.id}/cash/confirm`, {
            received: true,
            amount: 9000,
          })
        ).status,
        200,
      );
    assert.equal((await f.send('student', 'get', `/invoices/${second.id}`)).status, 404);
    assert.equal((await f.send(other, 'get', `/invoices/${first.id}`)).status, 404);
    for (const role of ['student', 'employee'])
      for (const path of ['/analytics', '/invoices', '/invoices/export'])
        assert.equal((await f.send(role, 'get', path)).status, 403);
    assert.equal((await request(f.app).get('/api/invoices')).status, 401);
    await f.db.query("INSERT INTO restaurants(id,name,slug) VALUES('other','Autre','other')");
    assert.notEqual(
      (await f.agents.admin.get(`/api/invoices/${first.id}`).set('X-Restaurant-Slug', 'other'))
        .status,
      200,
    );
    assert.equal(
      (await f.agents.student.get(`/api/invoices/${first.id}`).set('X-Restaurant-Slug', 'other'))
        .status,
      404,
    );
    const filtered = await f.send('manager', 'get', `/invoices?period=all&customer=${otherId}`);
    assert.equal(filtered.body.total, 1);
    assert.equal(filtered.body.invoices[0].user_id, otherId);
    assert.equal(
      (await f.send('manager', 'get', '/invoices?period=all&q=' + encodeURIComponent('%'))).body
        .total,
      0,
    );
    const exported = await f.send(
      'admin',
      'get',
      `/invoices/export?period=all&customer=${otherId}`,
    );
    assert.equal(exported.status, 200);
    assert.ok(exported.body.csv.includes('"\'=2+2"'));
    assert.ok(exported.body.csv.startsWith('\uFEFF'));
    const snapshot = (await f.send(other, 'get', `/invoices/${second.id}`)).body.invoice;
    await f.db.query("UPDATE users SET name='Nouveau nom' WHERE id=$1", [otherId]);
    await f.db.query("UPDATE dishes SET name='Nouveau plat',price=12000 WHERE id='moambe'");
    assert.deepEqual((await f.send(other, 'get', `/invoices/${second.id}`)).body.invoice, snapshot);
    for (const url of [
      '/analytics?source=oops',
      '/invoices?page=0',
      '/invoices?period=year',
      '/invoices?q=' + 'x'.repeat(101),
    ])
      assert.equal((await f.send('admin', 'get', url)).status, 400);
  } finally {
    await f.db.close();
  }
});

test('factures : pagination stable et filtre sur la date de paiement en heure de Kinshasa', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 27; i++) {
      const id = randomUUID();
      await f.db.query(
        "INSERT INTO orders(id,restaurant_id,user_id,request_key,service,subtotal,discount,delivery_fee,total) VALUES($1,$2,$3,$1,'onsite',9000,0,0,9000)",
        [id, f.users.student.restaurant_id, f.users.student.id],
      );
      await f.db.transaction((tx) => settleOrder(tx, id, 'cash', false, f.users.admin.id));
    }
    const page1 = (await f.send('admin', 'get', '/invoices?period=all&page=1')).body,
      page2 = (await f.send('admin', 'get', '/invoices?period=all&page=2')).body;
    assert.equal(page1.total, 27);
    assert.equal(page1.invoices.length, 25);
    assert.equal(page2.invoices.length, 2);
    assert.equal(new Set([...page1.invoices, ...page2.invoices].map((i) => i.order_id)).size, 27);
    await f.db.query("UPDATE invoices SET issued_at=NOW()-INTERVAL '40 days' WHERE order_id=$1", [
      page2.invoices[0].order_id,
    ]);
    assert.equal((await f.send('admin', 'get', '/invoices?period=month')).body.total, 26);
    assert.equal(
      (await f.send('admin', 'get', '/analytics?period=all')).body.summary.returning_customers,
      1,
    );
  } finally {
    await f.db.close();
  }
});

test('un EasyPay réellement confirmé après une simulation rapproche la facture sans double comptage', async () => {
  let attempt;
  const provider = {
    configured() {},
    async initiate(p) {
      attempt = p;
      return { reference: 'EP-test' };
    },
    async check() {
      return {
        transaction: {
          order_ref: attempt.reference,
          reference: 'EP-test',
          amount: attempt.amount,
          currency: 'CDF',
        },
        payment: { reference: 'EP-test', status: 'SUCCESS' },
      };
    },
  };
  const f = await fixture({ paymentMode: 'easypay-live', easypay: provider });
  try {
    const o = await f.create('easypay');
    const result = await f.send('student', 'post', `/orders/${o.id}/payments`, {
      phone: '+243810000001',
      operator: 'm-pesa',
    });
    assert.equal(result.status, 201);
    const paymentId = result.body.payment.id;
    assert.equal((await f.send('student', 'post', `/orders/${o.id}/cash`)).status, 409);
    await f.send('student', 'post', `/orders/${o.id}/simulation`, { outcome: 'paid' });
    const before = (await f.send('student', 'get', '/loyalty')).body.balance;
    for (const status of ['preparing', 'ready'])
      await f.send('employee', 'patch', `/orders/${o.id}/status`, { status });
    assert.equal(
      (await f.send('student', 'post', `/orders/${o.id}/payments/${paymentId}/check`)).status,
      200,
    );
    const order = (await f.send('student', 'get', `/orders/${o.id}`)).body.order;
    assert.equal(order.status, 'ready');
    assert.equal(order.is_simulated, false);
    assert.equal(order.payment_method, 'easypay');
    const report = (await f.send('admin', 'get', '/analytics?period=all')).body;
    assert.equal(report.summary.real_revenue, 9000);
    assert.equal(report.summary.simulated_revenue, 0);
    assert.equal(report.summary.paid_orders, 1);
    const invoice = (await f.send('student', 'get', `/invoices/${o.id}`)).body.invoice;
    assert.equal(invoice.is_simulated, false);
    assert.ok(!invoice.number.startsWith('DEMO-'));
    await f.send('employee', 'patch', `/orders/${o.id}/status`, { status: 'served' });
    assert.equal((await f.send('student', 'get', '/loyalty')).body.balance, before);
  } finally {
    await f.db.close();
  }
});

test('migration : les anciens résultats positifs deviennent des commandes de démonstration sans duplication', async () => {
  const raw = new PGlite();
  try {
    const sqlDir = new URL('../sql/', import.meta.url);
    for (const file of (await readdir(sqlDir))
      .filter((f) => /^\d+.*\.sql$/.test(f) && f < '012')
      .sort())
      await raw.exec(await readFile(new URL(file, sqlDir), 'utf8'));
    await seedDemo(raw, password);
    const user = (await raw.query("SELECT * FROM users WHERE role='student' LIMIT 1")).rows[0];
    const id = randomUUID();
    await raw.query(
      "INSERT INTO orders(id,restaurant_id,user_id,request_key,service,subtotal,discount,delivery_fee,total) VALUES($1,$2,$3,$1,'onsite',9000,0,0,9000)",
      [id, user.restaurant_id, user.id],
    );
    await raw.query(
      "INSERT INTO payment_simulations(order_id,outcome,points_earned) VALUES($1,'paid',3)",
      [id],
    );
    const sql = await readFile(new URL('012_cash_invoices.sql', sqlDir), 'utf8');
    await raw.exec(sql);
    const order = (await raw.query('SELECT * FROM orders WHERE id=$1', [id])).rows[0];
    assert.equal(order.status, 'confirmed');
    assert.equal(order.is_simulated, true);
    assert.equal(order.points_earned, 3);
    await raw.query("UPDATE orders SET status='served' WHERE id=$1", [id]);
    await raw.exec(sql);
    assert.equal(
      (await raw.query('SELECT status FROM orders WHERE id=$1', [id])).rows[0].status,
      'served',
    );
    assert.equal(
      (await raw.query('SELECT COUNT(*)::integer AS n FROM invoices WHERE order_id=$1', [id]))
        .rows[0].n,
      1,
    );
  } finally {
    await raw.close();
  }
});
