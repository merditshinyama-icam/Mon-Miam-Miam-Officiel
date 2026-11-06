import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';
import { seedDemo } from '../src/seed.js';
import { addPoints } from '../src/domain.js';

const password = 'Demonstration2026!';
let db, app, student, employee, manager, admin, studentId, orderId, paymentId, dataDir;
const headers = { 'X-Requested-With': 'MonMiamMiam', Origin: 'http://localhost:5173' };
const send = (agent, method, url, body) => {
  let req = agent[method](`/api${url}`).set(headers);
  return body ? req.send(body) : req;
};
const orderBody = (overrides = {}) => ({
  requestKey: randomUUID(),
  items: [
    { dishId: 'moambe', quantity: 1 },
    { dishId: 'bissap', quantity: 1 },
  ],
  service: 'onsite',
  arrivalAt: new Date(Date.now() + 3600000).toISOString(),
  points: 0,
  ...overrides,
});
before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'mmm-tests-'));
  db = await openDatabase({ memory: true });
  await seedDemo(db, password);
  app = createApp(db, {
    production: false,
    origin: 'http://localhost:5173',
    paymentMode: 'demo',
    dataDir,
    mailTestRecipient: null, // Isolated test of the generic reset mechanism.
  });
  [student, employee, manager, admin] = ['student', 'employee', 'manager', 'admin'].map(() =>
    request.agent(app),
  );
  for (const [agent, role] of [
    [student, 'student'],
    [employee, 'employee'],
    [manager, 'manager'],
    [admin, 'admin'],
  ]) {
    const response = await send(agent, 'post', '/auth/login', {
      email: `${role}@demo.miam.test`,
      password,
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    if (role === 'student') studentId = response.body.user.id;
  }
});
after(async () => {
  await db?.close();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test('le menu est public et le profil nécessite une session', async () => {
  assert.equal((await request(app).get('/api/catalog')).body.dishes.length, 4);
  assert.equal((await request(app).get('/api/auth/me')).status, 401);
});

test('le bouton parrainage fournit un code stable utilisable à l’inscription', async () => {
  const first = await send(student, 'post', '/referral/generate');
  assert.equal(first.status, 200);
  assert.match(first.body.code, /^MIAM-/);
  const repeated = await Promise.all([
    send(student, 'post', '/referral/generate'),
    send(student, 'post', '/referral/generate'),
  ]);
  for (const result of repeated) {
    assert.equal(result.status, 200);
    assert.equal(result.body.code, first.body.code);
  }
  const email = `${randomUUID()}@example.test`;
  const signup = await send(request.agent(app), 'post', '/auth/register', {
    name: 'Filleul du bouton',
    email,
    phone: '+243810000003',
    password,
    referralCode: first.body.code,
  });
  assert.equal(signup.status, 201, JSON.stringify(signup.body));
  const {
    rows: [user],
  } = await db.query('SELECT referrer_id,referral_code FROM users WHERE email=$1', [email]);
  assert.equal(user.referrer_id, studentId);
  assert.notEqual(user.referral_code, first.body.code);
  assert.equal((await send(employee, 'post', '/referral/generate')).status, 403);
  assert.equal((await send(request(app), 'post', '/referral/generate')).status, 401);
});
test('la session utilise un cookie HttpOnly et la réponse ne contient pas le mot de passe', async () => {
  const res = await send(request.agent(app), 'post', '/auth/login', {
    email: 'student@demo.miam.test',
    password,
  });
  assert.match(res.headers['set-cookie'][0], /HttpOnly/);
  assert.match(res.headers['set-cookie'][0], /SameSite=Lax/);
  assert.equal(res.body.user.password_hash, undefined);
});
test('les rôles et les demandes intersites sont bloqués par le serveur', async () => {
  assert.equal((await send(student, 'get', '/stats')).status, 403);
  assert.equal((await send(employee, 'put', '/settings', {})).status, 403);
  assert.equal((await send(manager, 'post', '/dishes', {})).status, 403);
  assert.equal((await request(app).post('/api/auth/login').send({})).status, 403);
  assert.equal(
    (
      await request(app)
        .post('/api/auth/login')
        .set({ ...headers, Origin: 'https://evil.example' })
        .send({})
    ).status,
    403,
  );
});
test('un e-mail personnel est admis, un rôle fourni lors de l’inscription est refusé', async () => {
  const body = {
    name: 'Nouveau Client',
    email: 'personnel@example.net',
    phone: '+243810000001',
    password,
  };
  assert.equal(
    (await send(request.agent(app), 'post', '/auth/register', { ...body, role: 'admin' })).status,
    400,
  );
  const res = await send(request.agent(app), 'post', '/auth/register', body);
  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, 'student');
});
test('thème, mode sombre et photo sont persistants et les fichiers non image sont refusés', async () => {
  const body = {
    name: 'Alex Test',
    phone: '+243810000000',
    theme: 'forest',
    dark: true,
    public_ranking: false,
  };
  assert.equal((await send(student, 'patch', '/auth/me', body)).status, 200);
  let user = (await send(student, 'get', '/auth/me')).body.user;
  assert.equal(user.theme, 'forest');
  assert.equal(user.dark, true);
  const image = await sharp({
    create: { width: 32, height: 32, channels: 3, background: '#cfbd97' },
  })
    .png()
    .toBuffer();
  let res = await student
    .post('/api/auth/me/photo')
    .set(headers)
    .attach('photo', image, 'photo.png');
  assert.equal(res.status, 200);
  assert.match(res.body.photo, /^data:image\/webp;base64,/);
  assert.equal(
    (
      await student
        .post('/api/auth/me/photo')
        .set(headers)
        .attach('photo', Buffer.from('not an image'), 'photo.png')
    ).status,
    400,
  );
  assert.equal((await send(student, 'delete', '/auth/me/photo')).status, 204);
});
test('une commande valide calcule ses prix côté serveur et réserve les points', async () => {
  const res = await send(
    student,
    'post',
    '/orders',
    orderBody({
      points: 15,
      service: 'delivery',
      address: 'Kinshasa, avenue de la Paix, numéro 10',
    }),
  );
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const order = res.body.order;
  orderId = order.id;
  assert.equal(order.subtotal, 12000);
  assert.equal(order.total, 11000);
  assert.equal(order.discount, 3000);
  assert.equal(order.status, 'awaiting_payment');
  assert.equal((await send(student, 'get', '/loyalty')).body.balance, 30);
});
test('les doublons simultanés créent une seule commande et une seule réservation', async () => {
  const body = orderBody({ points: 15 });
  const results = await Promise.all([
    send(student, 'post', '/orders', body),
    send(student, 'post', '/orders', body),
  ]);
  assert.equal(results[0].status, 201);
  assert.equal(results[1].status, 201);
  assert.equal(results[0].body.order.id, results[1].body.order.id);
  assert.equal((await send(student, 'get', '/loyalty')).body.balance, 15);
  const id = results[0].body.order.id;
  assert.equal((await send(student, 'post', `/orders/${id}/cancel`)).status, 200);
  assert.equal((await send(student, 'post', `/orders/${id}/cancel`)).status, 200);
  assert.equal((await send(student, 'get', '/loyalty')).body.balance, 30);
});
test('deux commandes concurrentes ne peuvent pas dépenser les mêmes points', async () => {
  const body = () => orderBody({ items: [{ dishId: 'moambe', quantity: 1 }], points: 30 });
  const responses = await Promise.all([
    send(student, 'post', '/orders', body()),
    send(student, 'post', '/orders', body()),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await send(student, 'get', '/loyalty')).body.balance, 0);
  const created = responses.find((r) => r.status === 201).body.order;
  await send(student, 'post', `/orders/${created.id}/cancel`);
  assert.equal((await send(student, 'get', '/loyalty')).body.balance, 30);
});
test('modifier un prix du menu conserve le prix de la commande existante', async () => {
  const dish = (await send(admin, 'get', '/catalog')).body.dishes.find((d) => d.id === 'moambe');
  const { id, ...body } = dish;
  assert.equal((await send(admin, 'put', `/dishes/${id}`, { ...body, price: 9500 })).status, 200);
  const order = (await send(student, 'get', `/orders/${orderId}`)).body.order;
  assert.equal(order.items.find((i) => i.dish_id === id).price, 9000);
  await send(admin, 'put', `/dishes/${id}`, body);
});
test('le serveur refuse une falsification de prix, un article épuisé et un solde insuffisant', async () => {
  assert.equal((await send(student, 'post', '/orders', { ...orderBody(), total: 1 })).status, 400);
  assert.equal((await send(student, 'post', '/orders', orderBody({ points: 60 }))).status, 409);
  assert.equal(
    (
      await send(
        student,
        'post',
        '/orders',
        orderBody({ items: [{ dishId: 'moambe', quantity: 1 }], points: 60 }),
      )
    ).status,
    400,
  );
  await send(employee, 'patch', '/dishes/moambe/availability', { available: false });
  assert.equal((await send(student, 'post', '/orders', orderBody())).status, 409);
  await send(employee, 'patch', '/dishes/moambe/availability', { available: true });
});
test('un autre étudiant ne peut ni lire ni payer la commande', async () => {
  const other = request.agent(app);
  await send(other, 'post', '/auth/login', { email: 'personnel@example.net', password });
  assert.equal((await send(other, 'get', `/orders/${orderId}`)).status, 404);
  assert.equal(
    (
      await send(other, 'post', `/orders/${orderId}/payments`, {
        phone: '+243810000001',
        operator: 'm-pesa',
      })
    ).status,
    404,
  );
});
test('initier un paiement ne confirme pas la commande ; un échec permet une nouvelle tentative', async () => {
  assert.equal(
    (await send(employee, 'patch', `/orders/${orderId}/status`, { status: 'preparing' })).status,
    409,
  );
  let res = await send(student, 'post', `/orders/${orderId}/payments`, {
    phone: '+243810000000',
    operator: 'm-pesa',
  });
  assert.equal(res.status, 201);
  const first = res.body.payment.id;
  res = await send(student, 'get', `/orders/${orderId}`);
  assert.equal(res.body.order.payment_status, 'pending');
  await send(student, 'post', `/orders/${orderId}/payments/${first}/simulate`, {
    outcome: 'failed',
  });
  res = await send(student, 'post', `/orders/${orderId}/payments`, {
    phone: '+243810000000',
    operator: 'airtel',
  });
  paymentId = res.body.payment.id;
  assert.notEqual(paymentId, first);
});
test('confirmer deux fois un paiement ne crée pas deux effets et le service suit ses étapes', async () => {
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await send(student, 'post', `/orders/${orderId}/payments/${paymentId}/simulate`, {
          outcome: 'paid',
        })
      ).status,
      200,
    );
  assert.equal((await send(student, 'get', '/loyalty')).body.balance, 33);
  assert.equal((await send(student, 'post', `/orders/${orderId}/cancel`)).status, 409);
  assert.equal(
    (await send(employee, 'patch', `/orders/${orderId}/status`, { status: 'delivered' })).status,
    409,
  );
  for (const status of ['preparing', 'ready', 'delivering', 'delivered', 'delivered'])
    assert.equal(
      (await send(employee, 'patch', `/orders/${orderId}/status`, { status })).status,
      200,
    );
  assert.equal((await send(student, 'get', '/loyalty')).body.balance, 33);
});
test('un avis n’est possible qu’après service, un seul avis par commande', async () => {
  const pending = (await send(student, 'post', '/orders', orderBody())).body.order.id;
  assert.equal(
    (
      await send(student, 'post', `/orders/${pending}/review`, {
        rating: 5,
        message: 'Très bon repas',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await send(student, 'post', `/orders/${orderId}/review`, {
        rating: 5,
        message: 'Très bon repas',
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await send(student, 'post', `/orders/${orderId}/review`, {
        rating: 5,
        message: 'Très bon repas',
      })
    ).status,
    409,
  );
});
test('une réponse employé reste privée jusqu’à la validation du gérant', async () => {
  let res = await send(student, 'post', '/complaints', {
    orderId,
    message: 'La boisson avait un problème.',
  });
  assert.equal(res.status, 201);
  const id = res.body.complaint.id;
  assert.equal(
    (
      await send(employee, 'post', `/complaints/${id}/draft`, {
        draft: 'Nous proposons de remplacer votre boisson.',
      })
    ).status,
    200,
  );
  res = await send(student, 'get', '/complaints');
  assert.equal(res.body.complaints[0].draft, undefined);
  assert.equal(res.body.complaints[0].response, null);
  assert.equal(
    (await send(employee, 'post', `/complaints/${id}/decision`, { approve: true })).status,
    403,
  );
  assert.equal(
    (await send(manager, 'post', `/complaints/${id}/decision`, { approve: true })).status,
    200,
  );
  res = await send(student, 'get', '/complaints');
  assert.match(res.body.complaints[0].response, /remplacer/);
});
test('le gérant peut publier directement une réponse saisie', async () => {
  const created = await send(student, 'post', '/complaints', {
    orderId,
    message: 'Vérification de la réponse directe du gérant.',
  });
  const id = created.body.complaint.id;
  const draft = 'Votre réclamation est prise en charge par la gérance.';
  assert.equal(
    (await send(manager, 'post', `/complaints/${id}/decision`, { approve: true, draft })).status,
    200,
  );
  const result = await send(student, 'get', '/complaints');
  assert.equal(result.body.complaints.find((c) => c.id === id).response, draft);
  assert.equal(result.body.complaints.find((c) => c.id === id).status, 'resolved');
});
test('une proposition du gérant attend l’administrateur et ne peut pas être contournée', async () => {
  const created = await send(student, 'post', '/complaints', {
    orderId,
    message: 'Vérification de la transmission à la direction.',
  });
  const id = created.body.complaint.id;
  assert.equal(
    (
      await send(manager, 'post', `/complaints/${id}/draft`, {
        draft: 'Nous sollicitons la validation de la direction.',
      })
    ).status,
    200,
  );
  const pending = (await send(manager, 'get', '/complaints')).body.complaints.find(
    (c) => c.id === id,
  );
  assert.equal(pending.review_role, 'admin');
  assert.equal(
    (await send(manager, 'post', `/complaints/${id}/decision`, { approve: true })).status,
    403,
  );
  assert.equal(
    (
      await send(manager, 'post', `/complaints/${id}/decision`, {
        approve: true,
        draft: 'Une autre réponse pour contourner le circuit.',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await send(employee, 'post', `/complaints/${id}/draft`, {
        draft: 'Remplacement du brouillon pour contourner la validation.',
      })
    ).status,
    403,
  );
  assert.equal(
    (await send(student, 'get', '/complaints')).body.complaints.find((c) => c.id === id).response,
    null,
  );
  assert.equal(
    (await send(admin, 'post', `/complaints/${id}/decision`, { approve: true })).status,
    200,
  );
  assert.equal(
    (await send(student, 'get', '/complaints')).body.complaints.find((c) => c.id === id).status,
    'resolved',
  );
});
test('l’administrateur peut rédiger et publier directement une réponse', async () => {
  const created = await send(student, 'post', '/complaints', {
    orderId,
    message: 'Vérification de la réponse directe de l’administrateur.',
  });
  const id = created.body.complaint.id;
  assert.equal(
    (
      await send(admin, 'post', `/complaints/${id}/decision`, {
        approve: true,
        draft: 'La direction a traité votre réclamation.',
      })
    ).status,
    200,
  );
});
test('les points expirés ne sont pas disponibles et le classement n’expose pas d’e-mail', async () => {
  await addPoints(db, studentId, 15, 'expired-test', 365);
  await db.query(
    "UPDATE point_lots SET expires_at=NOW()-INTERVAL '1 day' WHERE source='expired-test'",
  );
  assert.equal((await send(student, 'get', '/loyalty')).body.balance, 33);
  const res = await send(student, 'get', '/ranking?period=week');
  assert.equal(res.status, 200);
  assert.equal(res.body.ranking[0].count, 1);
  assert.match(res.body.ranking[0].name, /Étudiant/);
  assert.equal(res.body.ranking[0].email, undefined);
});
test('une commande couverte par les points évite le paiement et le parrainage récompense une seule fois', async () => {
  const { code } = (await send(student, 'get', '/loyalty')).body;
  const child = request.agent(app);
  const register = await send(child, 'post', '/auth/register', {
    name: 'Filleul Test',
    email: 'filleul@example.net',
    phone: '+243810000002',
    password,
    referralCode: code,
  });
  assert.equal(register.status, 201);
  await addPoints(db, register.body.user.id, 30, 'test-child', 365);
  for (let i = 0; i < 2; i++) {
    const res = await send(
      child,
      'post',
      '/orders',
      orderBody({ items: [{ dishId: 'bissap', quantity: 1 }], points: 15 }),
    );
    assert.equal(res.status, 201);
    assert.equal(res.body.order.total, 0);
    assert.equal(res.body.order.payment_status, 'paid');
    for (const status of ['preparing', 'ready', 'served'])
      assert.equal(
        (await send(employee, 'patch', `/orders/${res.body.order.id}/status`, { status })).status,
        200,
      );
  }
  assert.equal((await send(student, 'get', '/loyalty')).body.balance, 38);
});
test('désactiver un employé invalide sa session et le gérant ne peut pas promouvoir un compte', async () => {
  const body = {
    name: 'Employé Temporaire',
    email: 'temp@example.net',
    phone: '+243810000003',
    password,
  };
  assert.equal((await send(manager, 'post', '/staff', { ...body, role: 'admin' })).status, 400);
  const res = await send(manager, 'post', '/staff', body);
  assert.equal(res.status, 201);
  const temp = request.agent(app);
  await send(temp, 'post', '/auth/login', { email: body.email, password });
  await send(admin, 'patch', `/staff/${res.body.user.id}`, {
    name: body.name,
    phone: body.phone,
    active: false,
  });
  assert.equal((await send(temp, 'get', '/auth/me')).status, 401);
});
test('le lien de récupération local est unique et invalide les sessions existantes', async () => {
  const oldSession = request.agent(app);
  await send(oldSession, 'post', '/auth/login', { email: 'personnel@example.net', password });
  assert.equal((await send(oldSession, 'get', '/auth/me')).status, 200);
  const res = await send(request(app), 'post', '/auth/forgot-password', {
    email: 'personnel@example.net',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.token, undefined);
  const [file] = await readdir(path.join(dataDir, 'outbox'));
  const mail = JSON.parse(await readFile(path.join(dataDir, 'outbox', file), 'utf8'));
  const secret = new URL(mail.url).searchParams.get('token');
  assert.equal(
    (
      await send(request(app), 'post', '/auth/reset-password', {
        token: secret,
        password: 'NouveauMotDePasse2026',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await send(request(app), 'post', '/auth/reset-password', {
        token: secret,
        password: 'NouveauMotDePasse2026',
      })
    ).status,
    400,
  );
  assert.equal((await send(oldSession, 'get', '/auth/me')).status, 401);
});
test('les actions de simulation sont absentes si le mode démonstration est désactivé', async () => {
  const disabled = createApp(db, {
    production: false,
    origin: 'http://localhost:5173',
    paymentMode: 'disabled',
  });
  const agent = request.agent(disabled);
  await send(agent, 'post', '/auth/login', { email: 'student@demo.miam.test', password });
  assert.equal(
    (
      await send(agent, 'post', `/orders/${orderId}/payments/${paymentId}/simulate`, {
        outcome: 'paid',
      })
    ).status,
    404,
  );
  assert.throws(() => createApp(db, { production: true, paymentMode: 'demo' }), /interdits/);
});

test('import photo article : conversion, conservation et contrôle des droits', async () => {
  const photo = await sharp({
    create: { width: 40, height: 30, channels: 3, background: '#cc6633' },
  })
    .png()
    .toBuffer();
  const body = {
    name: 'Boisson importée',
    description: 'Une boisson de recette',
    category: 'Boissons',
    price: 2500,
    available: true,
  };
  const create = await admin
    .post('/api/dishes')
    .set(headers)
    .field({ ...body, available: 'true', price: '2500' })
    .attach('photo', photo, 'boisson.png');
  assert.equal(create.status, 201, JSON.stringify(create.body));
  assert.match(create.body.dish.image, /^data:image\/webp;base64,/);
  const id = create.body.dish.id;
  const updated = await send(admin, 'put', `/dishes/${id}`, { ...body, name: 'Boisson renommée' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.dish.image, create.body.dish.image);
  const forbidden = await manager
    .post('/api/dishes')
    .set(headers)
    .field({ ...body, available: 'true', price: '2500' })
    .attach('photo', photo, 'boisson.png');
  assert.equal(forbidden.status, 403);
  const invalid = await admin
    .post('/api/dishes')
    .set(headers)
    .field({ ...body, available: 'true', price: '2500' })
    .attach('photo', Buffer.from('<svg></svg>'), 'photo.png');
  assert.equal(invalid.status, 400);
  assert.equal(
    (await send(admin, 'post', '/dishes', { ...body, image: 'https://example.com/x.png' })).status,
    400,
  );
  await send(admin, 'delete', `/dishes/${id}`);
});

test('un import refusé ne crée pas d’article et respecte la limite de 3 Mo', async () => {
  const before = (await request(app).get('/api/catalog')).body.dishes.length;
  const response = await admin
    .post('/api/dishes')
    .set(headers)
    .field({
      name: 'Trop grande',
      description: 'Image de recette',
      category: 'Plats',
      price: '2000',
      available: 'true',
    })
    .attach('photo', Buffer.alloc(3 * 1024 * 1024 + 1), 'photo.png');
  assert.equal(response.status, 400);
  assert.equal((await request(app).get('/api/catalog')).body.dishes.length, before);
});
