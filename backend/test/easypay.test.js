import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/database.js';
import { seedDemo } from '../src/seed.js';
import { createApp } from '../src/app.js';
import { AppError } from '../src/domain.js';
import { createEasyPayClient } from '../src/easypay-client.js';

const password = 'PaymentTests2026!';
const headers = { 'X-Requested-With': 'MonMiamMiam', Origin: 'http://localhost:5173' };
let db, app, student, other, state, calls, checks, fail, reject, mismatch, mismatchAmount;
const provider = {
  configured() {},
  async initiate(p) {
    calls++;
    if (fail) throw new AppError(502, 'Test timeout');
    if (reject) return { rejected: true };
    state.set(p.reference, { ...p, status: 'PENDING', providerRef: `EP-${p.reference}` });
    return { reference: `EP-${p.reference}` };
  },
  async check(ref) {
    checks++;
    const p = [...state.values()].find((p) => p.providerRef === ref);
    return {
      transaction: {
        order_ref: mismatch ? 'wrong' : p.reference,
        reference: ref,
        amount: mismatchAmount ? 1 : p.amount,
        currency: 'CDF',
      },
      payment: { reference: ref, status: p.status },
    };
  },
};
const send = (agent, method, path, body) => {
  const req = agent[method](`/api${path}`).set(headers);
  return body ? req.send(body) : req;
};
async function order() {
  return (
    await send(student, 'post', '/orders', {
      requestKey: randomUUID(),
      items: [{ dishId: 'moambe', quantity: 1 }],
      service: 'onsite',
      arrivalAt: new Date(Date.now() + 3600000).toISOString(),
      points: 0,
    })
  ).body.order;
}
async function start(o) {
  return send(student, 'post', `/orders/${o.id}/payments`, {
    phone: '+243810000001',
    operator: 'm-pesa',
  });
}
async function row(id) {
  return (await db.query('SELECT * FROM payments WHERE id=$1', [id])).rows[0];
}
function ipn(p, status = 'SUCCESS') {
  return request(app)
    .post('/api/payments/easypay/ipn')
    .send({
      transaction: { order_ref: p.provider_order_ref, reference: p.provider_reference },
      payment: { reference: p.provider_reference, status },
    });
}
before(async () => {
  state = new Map();
  calls = 0;
  checks = 0;
  db = await openDatabase({ memory: true });
  await seedDemo(db, password);
  app = createApp(db, {
    production: false,
    origin: headers.Origin,
    paymentMode: 'easypay-sandbox',
    easypay: provider,
  });
  student = request.agent(app);
  other = request.agent(app);
  for (const [a, email] of [
    [student, 'student@demo.miam.test'],
    [other, 'admin@demo.miam.test'],
  ])
    assert.equal((await send(a, 'post', '/auth/login', { email, password })).status, 200);
});
after(async () => db?.close());

test('client EasyPay : montant CDF, téléphone local, HTTPS fixe et secrets absents du corps', async () => {
  let seen;
  const client = createEasyPayClient(
    {
      paymentMode: 'easypay-sandbox',
      easypayToken: 'fake-test-key',
      easypayCorrelationId: 'fake-test-cid',
    },
    async (url, options) => {
      seen = { url, options };
      return new Response(JSON.stringify({ code: 1, reference: 'EPtest' }), { status: 200 });
    },
  );
  assert.equal(
    (
      await client.initiate({
        reference: 'ABC123',
        amount: 9000,
        phone: '+243810000001',
        name: 'Étudiant test',
      })
    ).reference,
    'EPtest',
  );
  assert.equal(seen.url.origin, 'https://www.e-com-easypay.com');
  assert.equal(seen.url.pathname, '/sandbox/mobile-money/payment');
  assert.equal(seen.url.searchParams.get('cid'), 'fake-test-cid');
  const body = JSON.parse(seen.options.body);
  assert.equal(body.customer_phone, '810000001');
  assert.equal(body.amount, 9000);
  assert.equal(body.currency, 'CDF');
  assert.equal(body.customer_email, undefined);
  assert.equal(body.token, undefined);
  assert.equal(seen.options.redirect, 'error');
});
test('la clé marchande est transmise telle quelle : ses champs JWT non vérifiés ne bloquent pas localement', async () => {
  let network = 0;
  const key = `e30.${Buffer.from(JSON.stringify({ exp: 1, nbf: 4102444800 })).toString('base64url')}.fake`;
  const client = createEasyPayClient(
    { paymentMode: 'easypay-sandbox', easypayToken: key, easypayCorrelationId: 'test' },
    async (url) => {
      network++;
      assert.equal(url.searchParams.get('token'), key);
      return new Response(JSON.stringify({ code: 0 }), { status: 200 });
    },
  );
  assert.deepEqual(
    await client.initiate({ reference: 'ABC123', amount: 9000, phone: '+243810000001' }),
    { rejected: true },
  );
  assert.equal(network, 1);
});
test('des identifiants absents restent refusés sans appel réseau', async () => {
  let network = 0;
  const client = createEasyPayClient({ paymentMode: 'easypay-sandbox' }, async () => network++);
  await assert.rejects(
    () => client.initiate({ reference: 'ABC123', amount: 9000, phone: '+243810000001' }),
    /identifiants/,
  );
  assert.equal(network, 0);
});
test('les erreurs de transport ne révèlent ni token ni URL', async () => {
  const client = createEasyPayClient(
    {
      paymentMode: 'easypay-sandbox',
      easypayToken: 'fake-secret-token',
      easypayCorrelationId: 'fake-secret-cid',
    },
    async (url) => {
      throw new Error(url.toString());
    },
  );
  await assert.rejects(
    () => client.initiate({ reference: 'ABC123', amount: 9000, phone: '+243810000001' }),
    (e) => !e.message.includes('fake-secret') && !e.message.includes('https:'),
  );
});
test('deux demandes simultanées ne déclenchent qu’une seule demande EasyPay', async () => {
  const o = await order(),
    before = calls;
  const results = await Promise.all([start(o), start(o)]);
  assert.deepEqual(
    results.map((r) => r.status),
    [201, 201],
  );
  assert.equal(results[0].body.payment.id, results[1].body.payment.id);
  assert.equal(calls, before + 1);
  assert.match((await row(results[0].body.payment.id)).provider_order_ref, /^[a-f0-9]{16}$/);
  assert.equal(results[0].body.payment.phone, undefined);
  assert.equal(
    (await send(student, 'get', `/orders/${o.id}`)).body.order.payment_status,
    'pending',
  );
});
test('IPN sans cookie ni en-tête navigateur : un faux succès ne marque pas payé', async () => {
  const o = await order(),
    r = await start(o),
    p = await row(r.body.payment.id),
    before = checks;
  assert.equal((await ipn(p, 'SUCCESS')).status, 200);
  assert.equal(checks, before + 1);
  assert.equal(
    (await send(student, 'get', `/orders/${o.id}`)).body.order.payment_status,
    'pending',
  );
  state.get(p.provider_order_ref).status = 'SUCCESS';
  assert.equal((await ipn(p)).status, 200);
  assert.equal((await ipn(p)).status, 200);
  let saved = (await send(student, 'get', `/orders/${o.id}`)).body.order;
  assert.equal(saved.payment_status, 'paid');
  assert.equal(saved.status, 'confirmed');
  state.get(p.provider_order_ref).status = 'DECLINED';
  assert.equal((await ipn(p, 'DECLINED')).status, 200);
  saved = (await send(student, 'get', `/orders/${o.id}`)).body.order;
  assert.equal(saved.payment_status, 'paid');
  const { rows } = await db.query(
    "SELECT * FROM audit_log WHERE action='easypay_verified_paid' AND entity_id=$1",
    [p.id],
  );
  assert.equal(rows.length, 1);
});
test('IPN référence falsifiée, commande incohérente et montant incohérent sont refusés', async () => {
  const o = await order(),
    r = await start(o),
    p = await row(r.body.payment.id);
  const forged = { ...p, provider_reference: 'attacker' };
  assert.equal((await ipn(forged)).status, 400);
  mismatch = true;
  assert.equal((await ipn(p)).status, 502);
  mismatch = false;
  mismatchAmount = true;
  assert.equal((await ipn(p)).status, 502);
  mismatchAmount = false;
  assert.equal((await row(p.id)).status, 'pending');
});
test('vérification manuelle protégée, annulation en attente et simulation sont interdites', async () => {
  const o = await order(),
    r = await start(o),
    p = await row(r.body.payment.id);
  assert.equal((await send(student, 'post', `/orders/${o.id}/cancel`)).status, 409);
  assert.equal(
    (await send(student, 'post', `/orders/${o.id}/payments/${p.id}/simulate`, { outcome: 'paid' }))
      .status,
    404,
  );
  const stranger = request.agent(app);
  await send(stranger, 'post', '/auth/register', {
    name: 'Autre étudiant',
    email: 'autre@demo.miam.test',
    phone: '+243810000009',
    password,
  });
  assert.equal(
    (await send(stranger, 'post', `/orders/${o.id}/payments/${p.id}/check`)).status,
    404,
  );
  state.get(p.provider_order_ref).status = 'DECLINED';
  assert.equal((await send(student, 'post', `/orders/${o.id}/payments/${p.id}/check`)).status, 200);
  assert.equal((await row(p.id)).status, 'failed');
  assert.equal((await send(student, 'post', `/orders/${o.id}/cancel`)).status, 200);
});
test('un timeout reste en attente et une nouvelle demande n’est pas envoyée', async () => {
  const o = await order(),
    before = calls;
  fail = true;
  assert.equal((await start(o)).status, 502);
  fail = false;
  const again = await start(o);
  assert.equal(again.status, 201);
  assert.equal(again.body.payment.provider_state, 'uncertain');
  assert.equal(calls, before + 1);
  assert.equal(
    (await send(student, 'post', `/orders/${o.id}/payments/${again.body.payment.id}/check`)).status,
    409,
  );
});
test('un refus explicite libère la tentative pour un nouvel essai', async () => {
  const o = await order();
  reject = true;
  assert.equal((await start(o)).status, 422);
  reject = false;
  assert.equal((await start(o)).status, 201);
});
test('le compte marchand ne collecte pas pour un autre restaurant', async () => {
  const response = await send(other, 'post', '/restaurants', {
    restaurantName: 'Autre restaurant',
    slug: 'autre-paiement',
    location: 'Kinshasa Campus',
    openingHours: 'Tous les jours',
    name: 'Autre admin',
    email: 'autre-admin@demo.miam.test',
    phone: '+243810000008',
    password,
  });
  assert.equal(response.status, 201);
  const catalog = await request(app).get('/api/catalog').set('X-Restaurant-Slug', 'autre-paiement');
  assert.equal(catalog.body.paymentMode, 'disabled');
});

test('premier administrateur : création hachée et aucun écrasement au redémarrage', async () => {
  const { bootstrapAdmin } = await import('../src/bootstrap-admin.js');
  const isolated = await openDatabase({ memory: true });
  try {
    const { seedCatalog } = await import('../src/seed.js');
    await seedCatalog(isolated);
    await assert.rejects(
      () => bootstrapAdmin(isolated, { ADMIN_EMAIL: 'admin@example.test' }),
      /incomplète/,
    );
    await bootstrapAdmin(isolated, {
      ADMIN_EMAIL: 'owner@example.test',
      ADMIN_NAME: 'Owner Test',
      ADMIN_PHONE: '+243810000007',
      ADMIN_PASSWORD: 'PrivateAdmin2026!',
    });
    const first = (await isolated.query("SELECT * FROM users WHERE role='admin'")).rows[0];
    assert.notEqual(first.password_hash, 'PrivateAdmin2026!');
    await bootstrapAdmin(isolated, {
      ADMIN_EMAIL: 'different@example.test',
      ADMIN_PASSWORD: 'OtherPassword2026!',
    });
    const rows = (await isolated.query("SELECT * FROM users WHERE role='admin'")).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, 'owner@example.test');
    assert.equal(rows[0].password_hash, first.password_hash);
  } finally {
    await isolated.close();
  }
});

test('paiement désactivé : aucune commande payante ni réservation de points n’est enregistrée', async () => {
  const disabled = createApp(db, {
    production: false,
    origin: headers.Origin,
    paymentMode: 'disabled',
  });
  const agent = request.agent(disabled);
  assert.equal(
    (await send(agent, 'post', '/auth/login', { email: 'student@demo.miam.test', password }))
      .status,
    200,
  );
  const {
    rows: [before],
  } = await db.query('SELECT COUNT(*)::int AS count FROM orders');
  const beforePoints = (await send(agent, 'get', '/loyalty')).body.balance;
  const response = await send(agent, 'post', '/orders', {
    requestKey: randomUUID(),
    items: [{ dishId: 'moambe', quantity: 1 }],
    service: 'onsite',
    arrivalAt: new Date(Date.now() + 3600000).toISOString(),
    points: 15,
  });
  assert.equal(response.status, 503);
  const {
    rows: [after],
  } = await db.query('SELECT COUNT(*)::int AS count FROM orders');
  assert.equal(after.count, before.count);
  assert.equal((await send(agent, 'get', '/loyalty')).body.balance, beforePoints);
});

test('paiement désactivé : une commande entièrement couverte par les points reste possible', async () => {
  const disabled = createApp(db, {
    production: false,
    origin: headers.Origin,
    paymentMode: 'disabled',
  });
  const agent = request.agent(disabled);
  assert.equal(
    (await send(agent, 'post', '/auth/login', { email: 'student@demo.miam.test', password }))
      .status,
    200,
  );
  const response = await send(agent, 'post', '/orders', {
    requestKey: randomUUID(),
    items: [{ dishId: 'bissap', quantity: 1 }],
    service: 'onsite',
    arrivalAt: new Date(Date.now() + 3600000).toISOString(),
    points: 15,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(response.body.order.total, 0);
  assert.equal(response.body.order.payment_status, 'paid');
  assert.equal(response.body.order.status, 'confirmed');
  assert.equal(response.body.order.payments.length, 0);
});

test('le client refuse une référence marchande hors du contrat avant le réseau', async () => {
  let network = 0;
  const client = createEasyPayClient(
    {
      paymentMode: 'easypay-sandbox',
      easypayToken: 'fake-test-key',
      easypayCorrelationId: 'fake-test-cid',
    },
    async () => {
      network++;
      return new Response('{}');
    },
  );
  for (const reference of ['abc', '12345678901234567', 'avec-tiret'])
    await assert.rejects(
      () => client.initiate({ reference, amount: 9000, phone: '+243810000001' }),
      /6 à 16/,
    );
  assert.equal(network, 0);
});
