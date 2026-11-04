import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createEasyPayClient } from '../src/easypay-client.js';
import { publicPayment } from '../src/easypay.js';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database.js';
import { seedDemo } from '../src/seed.js';
import { AppError } from '../src/domain.js';

for (const [mode, path] of [
  ['easypay-live', 'v1'],
  ['easypay-sandbox', 'sandbox'],
]) {
  test(`portail ${mode} : contrat documenté et URLs de retour sans secrets`, async () => {
    let seen;
    const client = createEasyPayClient(
      { paymentMode: mode, easypayToken: 'fake-key', easypayCorrelationId: 'fake-cid' },
      async (url, options) => {
        seen = { url, options, body: JSON.parse(options.body) };
        return new Response(JSON.stringify({ code: 1, reference: 'EP-portal/123=' }));
      },
    );
    assert.deepEqual(
      await client.initiatePortal({
        reference: 'ABC123',
        amount: 11000,
        name: 'Client',
        returnUrl: 'https://restaurant.example/r/campus/payment/ORDER',
      }),
      { reference: 'EP-portal/123=' },
    );
    assert.equal(seen.url.pathname, `/${path}/payment/initialization`);
    assert.equal(seen.url.searchParams.get('token'), 'fake-key');
    assert.equal(seen.options.method, 'POST');
    assert.deepEqual(seen.body.channels, [{ channel: 'MOBILE MONEY' }]);
    assert.equal(seen.body.amount, 11000);
    assert.equal(seen.body.currency, 'CDF');
    assert.equal(seen.body.customer_phone, undefined);
    for (const [field, outcome] of [
      ['success_url', 'success'],
      ['cancel_url', 'cancel'],
      ['error_url', 'error'],
    ]) {
      const back = new URL(seen.body[field]);
      assert.equal(back.origin, 'https://restaurant.example');
      assert.equal(back.pathname, '/r/campus/payment/ORDER');
      assert.equal(back.searchParams.get('easypay'), outcome);
    }
    assert.doesNotMatch(JSON.stringify(seen.body), /fake-key|fake-cid/);
  });
}

test('portail : aucune URL fournisseur libre ni référence invalide dans les réponses publiques', () => {
  const row = {
    id: 'P',
    mode: 'easypay-live',
    operator: 'easypay-portal',
    status: 'pending',
    provider_reference: 'EP-portal/123=',
    phone: 'private',
    provider_order_ref: 'private',
  };
  const payment = publicPayment(row);
  const url = new URL(payment.checkout_url);
  assert.equal(url.origin, 'https://www.e-com-easypay.com');
  assert.equal(url.searchParams.get('reference'), row.provider_reference);
  assert.equal(payment.phone, undefined);
  assert.equal(payment.provider_reference, undefined);
  assert.equal(publicPayment({ ...row, status: 'paid' }).checkout_url, undefined);
  assert.equal(
    publicPayment({ ...row, provider_reference: 'https://evil.example/?token=secret' })
      .checkout_url,
    undefined,
  );
});

let db,
  app,
  student,
  outsider,
  calls = 0,
  timeout = false;
const states = new Map();
const headers = { 'X-Requested-With': 'MonMiamMiam', Origin: 'http://localhost:3001' };
const send = (agent, method, path, body) => {
  const req = agent[method](`/api${path}`).set(headers);
  return body ? req.send(body) : req;
};
const provider = {
  configured() {},
  async initiatePortal(data) {
    calls++;
    if (timeout) throw new AppError(502, 'Réponse incertaine');
    const reference = `EP-${data.reference}`;
    states.set(reference, { ...data, status: 'PENDING' });
    return { reference };
  },
  async check(reference) {
    const data = states.get(reference);
    return {
      transaction: { order_ref: data.reference, reference, amount: data.amount, currency: 'CDF' },
      payment: { reference, status: data.status },
    };
  },
};
before(async () => {
  db = await openDatabase({ memory: true });
  await seedDemo(db, 'PortalTests2026!');
  app = createApp(db, { origin: headers.Origin, paymentMode: 'easypay-live', easypay: provider });
  student = request.agent(app);
  outsider = request.agent(app);
  assert.equal(
    (
      await send(student, 'post', '/auth/login', {
        email: 'student@demo.miam.test',
        password: 'PortalTests2026!',
      })
    ).status,
    200,
  );
});
after(async () => db?.close());
async function makeOrder() {
  const response = await send(student, 'post', '/orders', {
    requestKey: randomUUID(),
    items: [{ dishId: 'moambe', quantity: 1 }],
    service: 'onsite',
    arrivalAt: new Date(Date.now() + 3600000).toISOString(),
    points: 0,
  });
  assert.equal(response.status, 201);
  return response.body.order;
}

test('portail : persistance, reprise et confirmation uniquement après vérification serveur', async () => {
  const order = await makeOrder();
  const started = await send(student, 'post', `/orders/${order.id}/payments`, { flow: 'portal' });
  assert.equal(started.status, 201);
  const payment = started.body.payment;
  assert.equal(payment.status, 'pending');
  assert.equal(new URL(payment.checkout_url).origin, 'https://www.e-com-easypay.com');
  const beforeCalls = calls;
  const again = await send(student, 'post', `/orders/${order.id}/payments`, { flow: 'portal' });
  assert.equal(again.body.payment.id, payment.id);
  assert.equal(calls, beforeCalls);
  const detail = await send(student, 'get', `/orders/${order.id}?easypay=success`);
  assert.equal(detail.body.order.payment_status, 'pending');
  assert.equal(detail.body.order.payments[0].checkout_url, payment.checkout_url);
  const reference = new URL(payment.checkout_url).searchParams.get('reference');
  const data = states.get(reference);
  assert.equal(new URL(data.returnUrl).pathname, `/payment/${order.id}`);
  // Un faux SUCCESS IPN ne vaut pas confirmation si le fournisseur répond PENDING.
  const ipn = () =>
    request(app)
      .post('/api/payments/easypay/ipn')
      .send({
        transaction: { order_ref: data.reference, reference },
        payment: { reference, status: 'SUCCESS' },
      });
  assert.equal((await ipn()).status, 200);
  assert.equal(
    (await send(student, 'get', `/orders/${order.id}`)).body.order.payment_status,
    'pending',
  );
  data.status = 'SUCCESS';
  assert.equal((await ipn()).status, 200);
  assert.equal(
    (await send(student, 'get', `/orders/${order.id}`)).body.order.payment_status,
    'paid',
  );
});

test('portail : une annulation retournée par le fournisseur reste un échec sans acquittement', async () => {
  const order = await makeOrder();
  const started = await send(student, 'post', `/orders/${order.id}/payments`, { flow: 'portal' });
  const payment = started.body.payment;
  const reference = new URL(payment.checkout_url).searchParams.get('reference');
  states.get(reference).status = 'CANCELED';
  assert.equal(
    (await send(student, 'post', `/orders/${order.id}/payments/${payment.id}/check`)).body.order
      .payment_status,
    'failed',
  );
  assert.equal(
    (await send(student, 'get', `/orders/${order.id}`)).body.order.payment_status,
    'failed',
  );
});

test('portail : timeout sans double initialisation et paramètres imposés côté serveur', async () => {
  const order = await makeOrder();
  assert.equal(
    (await send(outsider, 'post', `/orders/${order.id}/payments`, { flow: 'portal' })).status,
    401,
  );
  assert.equal(
    (
      await send(student, 'post', `/orders/${order.id}/payments`, {
        flow: 'portal',
        amount: 1,
        success_url: 'https://evil.example',
      })
    ).status,
    400,
  );
  timeout = true;
  const started = await send(student, 'post', `/orders/${order.id}/payments`, { flow: 'portal' });
  timeout = false;
  assert.equal(started.status, 502);
  const beforeCalls = calls;
  const again = await send(student, 'post', `/orders/${order.id}/payments`, { flow: 'portal' });
  assert.equal(again.body.payment.provider_state, 'uncertain');
  assert.equal(again.body.payment.checkout_url, undefined);
  assert.equal(calls, beforeCalls);
});
