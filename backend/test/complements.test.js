import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { openDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';
import { seedDemo } from '../src/seed.js';
import { randomUUID } from 'node:crypto';
import { createResetMailer } from '../src/mail.js';
import { digest } from '../src/security.js';
let db, app, student, admin, employee, manager;
const password = 'Demonstration2026!';
const headers = { 'X-Requested-With': 'MonMiamMiam', Origin: 'http://localhost:5173' };
const send = (agent, method, url, body) => {
  const r = agent[method](`/api${url}`).set(headers);
  return body ? r.send(body) : r;
};
before(async () => {
  db = await openDatabase({ memory: true });
  await seedDemo(db, password);
  app = createApp(db, { production: false, origin: 'http://localhost:5173', paymentMode: 'demo' });
  [student, admin, employee, manager] = Array.from({ length: 4 }, () => request.agent(app));
  for (const [agent, role] of [
    [student, 'student'],
    [admin, 'admin'],
    [employee, 'employee'],
    [manager, 'manager'],
  ])
    assert.equal(
      (await send(agent, 'post', '/auth/login', { email: `${role}@demo.miam.test`, password }))
        .status,
      200,
    );
});
after(async () => {
  await db?.close();
});
test('envoi Resend : destination fixe, secret dans l’en-tête uniquement, aucun détail fournisseur révélé', async () => {
  let sent;
  const mailer = createResetMailer(
    {
      resendApiKey: 'fake-private',
      mailFrom: 'connexion@demo.example',
      mailReplyTo: 'contact@demo.example',
    },
    async (url, options) => {
      sent = { url, options };
      return new Response(JSON.stringify({ id: 'mail-test' }), { status: 200 });
    },
  );
  await mailer({ to: 'etudiant@example.net', url: 'https://miam.example/reset?token=FAKE' });
  assert.equal(sent.url, 'https://api.resend.com/emails');
  assert.equal(sent.options.headers.Authorization, 'Bearer fake-private');
  assert.equal(JSON.parse(sent.options.body).to[0], 'etudiant@example.net');
  assert.equal(JSON.parse(sent.options.body).reply_to, 'contact@demo.example');
  assert.equal(sent.options.body.includes('fake-private'), false);
  const refused = createResetMailer({ resendApiKey: 'secret', mailFrom: 'a@b.test' }, async () => {
    throw new Error('secret dans une erreur réseau');
  });
  await assert.rejects(
    () => refused({ to: 'a@b.test', url: 'https://miam.example/reset' }),
    (e) => !e.message.includes('secret') && e.status === 503,
  );
});
test('récupération en production avec transport configuré : lien transmis, jeton haché, réponse générique', async () => {
  const messages = [];
  const prod = createApp(db, {
    production: true,
    paymentMode: 'disabled',
    origin: 'https://miam.example',
    mailer: async (m) => messages.push(m),
  });
  const h = { 'X-Requested-With': 'MonMiamMiam', Origin: 'https://miam.example' };
  const known = await request(prod)
    .post('/api/auth/forgot-password')
    .set(h)
    .send({ email: 'student@demo.miam.test' });
  const unknown = await request(prod)
    .post('/api/auth/forgot-password')
    .set(h)
    .send({ email: 'absent@example.net' });
  assert.equal(known.status, 200);
  assert.deepEqual(known.body, unknown.body);
  assert.equal(messages.length, 1);
  const link = new URL(messages[0].url);
  assert.equal(link.origin, 'https://miam.example');
  const secret = link.searchParams.get('token');
  assert.equal(secret.length, 64);
  assert.equal(JSON.stringify(known.body).includes(secret), false);
  const {
    rows: [record],
  } = await db.query('SELECT token_hash FROM password_resets WHERE token_hash=$1', [
    digest(secret),
  ]);
  assert.equal(record.token_hash, digest(secret));
});
test('récupération de test limitée au destinataire autorisé avec réponse générique', async () => {
  const messages = [];
  const restricted = createApp(db, {
    production: true,
    paymentMode: 'disabled',
    origin: 'https://miam.example',
    mailTestRecipient: 'student@demo.miam.test',
    mailer: async (m) => messages.push(m),
  });
  const call = (email) =>
    request(restricted)
      .post('/api/auth/forgot-password')
      .set({ 'X-Requested-With': 'MonMiamMiam', Origin: 'https://miam.example' })
      .send({ email });
  const blocked = await call('admin@demo.miam.test');
  const allowed = await call('student@demo.miam.test');
  assert.equal(blocked.status, 200);
  assert.deepEqual(blocked.body, allowed.body);
  assert.deepEqual(
    messages.map((m) => m.to),
    ['student@demo.miam.test'],
  );
  assert.equal((await request(restricted).get('/api/catalog')).body.emailRecoveryMode, 'test');
});
test('aperçu de démonstration activable sans autoriser la simulation serveur d’un paiement réel', async () => {
  const preview = createApp(db, {
    production: true,
    paymentMode: 'disabled',
    origin: 'https://miam.example',
    demoPreview: true,
  });
  assert.equal((await request(preview).get('/api/catalog')).body.demoPreview, true);
  assert.equal((await send(student, 'put', '/featured-dish', { dishId: 'moambe' })).status, 403);
});
test('adresse de livraison enregistrée à l’inscription et au profil, privée dans le catalogue', async () => {
  const agent = request.agent(app);
  const registered = await send(agent, 'post', '/auth/register', {
    name: 'Adresse Étudiante',
    email: 'adresse@test.example',
    phone: '+243810000005',
    password,
    deliveryAddress: 'Kinshasa, avenue du Campus, numéro 10',
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.user.delivery_address, 'Kinshasa, avenue du Campus, numéro 10');
  const u = registered.body.user;
  assert.equal(
    (
      await send(agent, 'patch', '/auth/me', {
        name: u.name,
        phone: u.phone,
        theme: u.theme,
        dark: u.dark,
        public_ranking: false,
        deliveryAddress: 'Kinshasa, résidence des étudiants',
      })
    ).status,
    200,
  );
  assert.equal(
    (await send(agent, 'get', '/auth/me')).body.user.delivery_address,
    'Kinshasa, résidence des étudiants',
  );
  assert.equal(
    JSON.stringify((await request(app).get('/api/catalog')).body).includes(
      'résidence des étudiants',
    ),
    false,
  );
});
test('un employé sélectionne le plat du jour ; article épuisé et étudiant refusés', async () => {
  assert.equal((await send(student, 'put', '/featured-dish', { dishId: 'bissap' })).status, 403);
  assert.equal((await send(employee, 'put', '/featured-dish', { dishId: 'poisson' })).status, 200);
  assert.equal((await request(app).get('/api/catalog')).body.featuredDishId, 'poisson');
  await send(employee, 'patch', '/dishes/poisson/availability', { available: false });
  assert.equal((await send(employee, 'put', '/featured-dish', { dishId: 'poisson' })).status, 404);
  assert.equal(
    (await send(employee, 'put', '/featured-dish', { dishId: 'article-ailleurs' })).status,
    404,
  );
  assert.equal((await send(employee, 'put', '/featured-dish', { dishId: null })).status, 200);
});
test('suppression réversible d’un employé : session révoquée, liste masquée et restauration désactivée', async () => {
  const created = await send(admin, 'post', '/staff', {
    name: 'Agent Retiré',
    email: 'retire@test.example',
    phone: '+243810000004',
    password,
  });
  assert.equal(created.status, 201);
  const id = created.body.user.id,
    agent = request.agent(app);
  await send(agent, 'post', '/auth/login', { email: 'retire@test.example', password });
  assert.equal((await send(manager, 'delete', `/staff/${id}`)).status, 403);
  assert.equal((await send(admin, 'delete', `/staff/${id}`)).status, 204);
  assert.equal((await send(agent, 'get', '/auth/me')).status, 401);
  assert.equal(
    (await send(admin, 'get', '/staff')).body.staff.some((u) => u.id === id),
    false,
  );
  const removed = (await send(admin, 'get', '/staff?includeRemoved=true')).body.staff.find(
    (u) => u.id === id,
  );
  assert.ok(removed.removed_at);
  assert.equal((await send(admin, 'post', `/staff/${id}/restore`)).status, 200);
  const restored = (await send(admin, 'get', '/staff')).body.staff.find((u) => u.id === id);
  assert.equal(restored.active, false);
  assert.equal(restored.removed_at, null);
  const adminId = (await send(admin, 'get', '/auth/me')).body.user.id;
  assert.equal((await send(admin, 'delete', `/staff/${adminId}`)).status, 404);
});
test('statistiques fidélité et parrainage sur la période ; limitation hebdomadaire employé', async () => {
  const parent = (await send(student, 'get', '/auth/me')).body.user;
  const child = request.agent(app);
  await send(child, 'post', '/auth/register', {
    name: 'Filleul Statistiques',
    email: 'filleulstats@test.example',
    phone: '+243810000006',
    password,
    referralCode: parent.referral_code,
  });
  const id = (await send(child, 'get', '/auth/me')).body.user.id;
  await db.query('UPDATE users SET referral_rewarded=TRUE WHERE id=$1', [id]);
  const oid = randomUUID();
  await db.query(
    `INSERT INTO orders(id,restaurant_id,user_id,request_key,service,subtotal,discount,delivery_fee,total,points_spent,payment_status,status) VALUES($1,$2,$3,$4,'onsite',9000,3000,0,6000,15,'paid','served')`,
    [oid, parent.restaurant_id, parent.id, randomUUID()],
  );
  const stats = await send(admin, 'get', '/stats?period=day');
  assert.equal(stats.status, 200);
  assert.equal(stats.body.loyalty.redeemed, 15);
  assert.equal(stats.body.loyalty.discounts, 3000);
  assert.equal(stats.body.referrals.invited, 1);
  assert.equal(stats.body.referrals.rewarded, 1);
  assert.equal((await send(employee, 'get', '/stats?period=month')).body.period, 'week');
});
