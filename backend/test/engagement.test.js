import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { openDatabase } from '../src/database.js';
import { seedDemo, seedCatalog, seedDemoAnnouncements } from '../src/seed.js';
import { createApp } from '../src/app.js';
import { balance, RESTAURANT } from '../src/domain.js';

let db, app, admin, manager, student, other, studentId, otherId, guest, eventId;
const password = 'Demonstration2026!';
const headers = { 'X-Requested-With': 'MonMiamMiam', Origin: 'http://localhost:5173' };
function send(agent, method, url, body, extra = {}) {
  const req = agent[method](`/api${url}`).set({ ...headers, ...extra });
  return body ? req.send(body) : req;
}
const poster = (overrides = {}) => ({
  kind: 'event',
  title: 'La table du campus',
  description: 'Un rendez-vous étudiant autour des saveurs de Kinshasa.',
  startsAt: new Date(Date.now() + 3600000).toISOString(),
  endsAt: new Date(Date.now() + 86400000).toISOString(),
  published: true,
  capacity: 1,
  ...overrides,
});
before(async () => {
  db = await openDatabase({ memory: true });
  await seedDemo(db, password);
  app = createApp(db, { production: false, origin: 'http://localhost:5173', paymentMode: 'demo' });
  [admin, manager, student, other, guest] = Array.from({ length: 5 }, () => request.agent(app));
  for (const [agent, role] of [
    [admin, 'admin'],
    [manager, 'manager'],
    [student, 'student'],
  ]) {
    const r = await send(agent, 'post', '/auth/login', {
      email: `${role}@demo.miam.test`,
      password,
    });
    assert.equal(r.status, 200);
    if (role === 'student') studentId = r.body.user.id;
  }
  const registered = await send(other, 'post', '/auth/register', {
    name: 'Autre Étudiant',
    email: 'autre@test.example',
    phone: '+243810000007',
    password,
  });
  assert.equal(registered.status, 201);
  otherId = registered.body.user.id;
});
after(async () => {
  await db?.close();
});

test('les affiches de démonstration nécessitent les comptes locaux et ne remplacent jamais les affiches existantes', async () => {
  const isolated = await openDatabase({ memory: true });
  try {
    await seedCatalog(isolated);
    await seedDemoAnnouncements(isolated);
    assert.equal(
      (await isolated.query('SELECT COUNT(*)::integer AS count FROM announcements')).rows[0].count,
      0,
    );
    await seedDemo(isolated, password);
    await seedDemoAnnouncements(isolated);
    assert.equal(
      (await isolated.query('SELECT COUNT(*)::integer AS count FROM announcements')).rows[0].count,
      3,
    );
    await isolated.query(
      "UPDATE announcements SET archived=TRUE,published=FALSE WHERE kind='event'",
    );
    await seedDemoAnnouncements(isolated);
    assert.equal(
      (await isolated.query('SELECT COUNT(*)::integer AS count FROM announcements')).rows[0].count,
      3,
    );
    assert.equal(
      (await isolated.query("SELECT archived FROM announcements WHERE kind='event'")).rows[0]
        .archived,
      true,
    );
  } finally {
    await isolated.close();
  }
});

test('seul l’administrateur gère les affiches ; brouillons et affiches terminées restent privés', async () => {
  assert.equal((await send(manager, 'post', '/announcements', poster())).status, 403);
  assert.equal((await send(student, 'get', '/announcements/manage')).status, 403);
  assert.equal((await send(guest, 'get', '/announcements/manage')).status, 401);
  const draft = await send(admin, 'post', '/announcements', poster({ published: false }));
  assert.equal(draft.status, 201);
  const old = await send(
    admin,
    'post',
    '/announcements',
    poster({ startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-01-02T00:00:00Z' }),
  );
  assert.equal(old.status, 201);
  assert.equal((await send(guest, 'get', '/announcements')).body.announcements.length, 0);
  assert.equal((await send(admin, 'get', '/announcements/manage')).body.announcements.length, 2);
  assert.equal(
    (await send(student, 'post', `/announcements/${draft.body.announcement.id}/participation`))
      .status,
    404,
  );
  assert.equal(
    (await send(student, 'post', `/announcements/${old.body.announcement.id}/participation`))
      .status,
    409,
  );
});
test('les dates incohérentes, capacités de promotion et images distantes sont refusées', async () => {
  assert.equal(
    (await send(admin, 'post', '/announcements', poster({ endsAt: '2020-01-01T00:00:00Z' })))
      .status,
    400,
  );
  assert.equal(
    (await send(admin, 'post', '/announcements', poster({ kind: 'promotion' }))).status,
    400,
  );
  assert.equal(
    (
      await send(
        admin,
        'post',
        '/announcements',
        poster({ image: 'https://example.org/track.png' }),
      )
    ).status,
    400,
  );
  assert.equal((await send(admin, 'post', '/announcements', poster({ capacity: 0 }))).status, 400);
});
test('inscriptions idempotentes et concurrence : une place ne peut pas être attribuée deux fois', async () => {
  const created = await send(admin, 'post', '/announcements', poster());
  assert.equal(created.status, 201);
  eventId = created.body.announcement.id;
  const results = await Promise.all([
    send(student, 'post', `/announcements/${eventId}/participation`),
    send(other, 'post', `/announcements/${eventId}/participation`),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const { rows } = await db.query('SELECT user_id FROM participations WHERE announcement_id=$1', [
    eventId,
  ]);
  assert.equal(rows.length, 1);
  const winner = rows[0].user_id === studentId ? student : other;
  assert.equal((await send(winner, 'post', `/announcements/${eventId}/participation`)).status, 200);
  const publicList = (await send(guest, 'get', '/announcements')).body.announcements;
  assert.equal(publicList[0].participants, 1);
  assert.equal(publicList[0].joined, false);
  assert.equal((await send(winner, 'get', '/announcements')).body.announcements[0].joined, true);
  assert.equal((await send(guest, 'post', `/announcements/${eventId}/participation`)).status, 401);
  assert.equal(
    (await send(manager, 'post', `/announcements/${eventId}/participation`)).status,
    403,
  );
  assert.equal(
    (await send(winner, 'delete', `/announcements/${eventId}/participation`)).status,
    204,
  );
  assert.equal(
    (await send(student, 'post', `/announcements/${eventId}/participation`)).status,
    200,
  );
});
test('seul l’administrateur voit les inscrits et ne peut pas transformer un événement déjà réservé en promotion', async () => {
  assert.equal((await send(student, 'get', `/announcements/${eventId}/participants`)).status, 403);
  const list = await send(admin, 'get', `/announcements/${eventId}/participants`);
  assert.equal(list.body.participants.length, 1);
  assert.ok(list.body.participants[0].email);
  const update = await send(
    admin,
    'put',
    `/announcements/${eventId}`,
    poster({ kind: 'promotion', capacity: null }),
  );
  assert.equal(update.status, 409);
});
test('les affiches importées sont réencodées, conservées à la modification puis retirées sans effacer les inscrits', async () => {
  const img = await sharp({ create: { width: 40, height: 60, channels: 3, background: '#cfbd97' } })
    .png()
    .toBuffer();
  let req = admin.post('/api/announcements').set(headers);
  for (const [k, v] of Object.entries(poster({ capacity: null })))
    req = req.field(k, v === null ? '' : String(v));
  const created = await req.attach('photo', img, 'affiche.png');
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.match(created.body.announcement.image, /^data:image\/webp;base64,/);
  const id = created.body.announcement.id;
  const updated = await send(
    admin,
    'put',
    `/announcements/${id}`,
    poster({ capacity: null, title: 'Nouveau titre de l’affiche' }),
  );
  assert.equal(updated.body.announcement.image, created.body.announcement.image);
  let invalid = admin.post('/api/announcements').set(headers);
  for (const [k, v] of Object.entries(poster())) invalid = invalid.field(k, String(v));
  assert.equal((await invalid.attach('photo', Buffer.from('<svg/>'), 'affiche.png')).status, 400);
  assert.equal((await send(admin, 'delete', `/announcements/${eventId}`)).status, 204);
  assert.equal(
    (await send(student, 'post', `/announcements/${eventId}/participation`)).status,
    404,
  );
  assert.equal(
    (await send(admin, 'get', `/announcements/${eventId}/participants`)).body.participants.length,
    1,
  );
  assert.equal(
    (await send(student, 'delete', `/announcements/${eventId}/participation`)).status,
    204,
  );
});
test('les corrections nécessitent le rôle administrateur, un étudiant et une justification', async () => {
  const b = {
    userId: studentId,
    requestKey: randomUUID(),
    delta: 5,
    reason: 'Réclamation de points justifiée.',
  };
  assert.equal((await send(manager, 'post', '/point-adjustments', b)).status, 403);
  assert.equal((await send(student, 'get', '/students?q=Alex')).status, 403);
  assert.equal((await send(admin, 'post', '/point-adjustments', { ...b, delta: 0 })).status, 400);
  assert.equal(
    (await send(admin, 'post', '/point-adjustments', { ...b, reason: 'court' })).status,
    400,
  );
  assert.equal((await send(admin, 'get', '/students?q=A')).status, 400);
  const search = (await send(admin, 'get', '/students?q=Alex')).body.students;
  assert.equal(search[0].id, studentId);
  assert.equal(search[0].balance, 45);
  assert.equal(search[0].password_hash, undefined);
});
test('crédit et retrait justifiés : double soumission sans doublon, historique étudiant et audit', async () => {
  const b = {
    userId: studentId,
    requestKey: randomUUID(),
    delta: 10,
    reason: 'Points oubliés sur une commande servie.',
  };
  const [one, two] = await Promise.all([
    send(admin, 'post', '/point-adjustments', b),
    send(admin, 'post', '/point-adjustments', b),
  ]);
  assert.equal(one.status, 200);
  assert.equal(two.status, 200);
  assert.equal(one.body.adjustment.id, two.body.adjustment.id);
  assert.equal(await balance(db, studentId), 55);
  assert.equal((await send(admin, 'post', '/point-adjustments', { ...b, delta: 11 })).status, 409);
  const removal = await send(admin, 'post', '/point-adjustments', {
    ...b,
    requestKey: randomUUID(),
    delta: -7,
    reason: 'Correction d’un crédit attribué en trop.',
  });
  assert.equal(removal.status, 200);
  assert.equal(removal.body.balance, 48);
  const history = (await send(student, 'get', '/loyalty')).body.adjustments;
  assert.equal(history.length, 2);
  assert.ok(history.some((a) => a.delta === -7));
  assert.equal((await send(other, 'get', '/loyalty')).body.adjustments.length, 0);
  const {
    rows: [audit],
  } = await db.query(
    "SELECT COUNT(*)::integer AS count FROM audit_log WHERE action='points_adjusted'",
  );
  assert.equal(audit.count, 2);
});
test('un retrait excessif laisse le solde et le journal intacts ; les points réservés restent protégés', async () => {
  const order = await send(student, 'post', '/orders', {
    requestKey: randomUUID(),
    items: [{ dishId: 'moambe', quantity: 1 }],
    service: 'onsite',
    arrivalAt: new Date(Date.now() + 3600000).toISOString(),
    points: 15,
  });
  assert.equal(order.status, 201);
  assert.equal(await balance(db, studentId), 33);
  const b = {
    userId: studentId,
    requestKey: randomUUID(),
    delta: -34,
    reason: 'Essai de retrait supérieur au disponible.',
  };
  assert.equal((await send(admin, 'post', '/point-adjustments', b)).status, 409);
  assert.equal(await balance(db, studentId), 33);
  assert.equal(
    (await send(admin, 'get', `/point-adjustments?userId=${studentId}`)).body.adjustments.length,
    2,
  );
  assert.equal((await send(admin, 'post', '/point-adjustments', { ...b, delta: -33 })).status, 200);
  assert.equal(await balance(db, studentId), 0);
  const cancelled = await send(student, 'post', `/orders/${order.body.order.id}/cancel`);
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(await balance(db, studentId), 15);
});
test('aucune affiche, participation ni correction ne traverse les restaurants', async () => {
  await db.query(
    "INSERT INTO restaurants(id,name,slug) VALUES('other-campus','Autre campus','autre-campus')",
  );
  const foreignHeaders = { 'X-Restaurant-Slug': 'autre-campus' };
  const foreign = request.agent(app);
  const created = await send(foreign, 'post', '/restaurants', {});
  assert.equal(created.status, 400);
  const id = randomUUID();
  await db.query(
    `INSERT INTO users(id,restaurant_id,email,name,phone,password_hash,role,referral_code)
    SELECT $1,'other-campus','admin@other.test','Direction autre','+243810000008',password_hash,'admin',$2 FROM users WHERE role='admin' LIMIT 1`,
    [id, `TEST-${id}`],
  );
  assert.equal(
    (
      await send(
        foreign,
        'post',
        '/auth/login',
        { email: 'admin@other.test', password },
        foreignHeaders,
      )
    ).status,
    200,
  );
  assert.equal(
    (await send(foreign, 'get', '/announcements/manage', null, foreignHeaders)).body.announcements
      .length,
    0,
  );
  assert.equal(
    (await send(foreign, 'get', `/announcements/${eventId}/participants`, null, foreignHeaders))
      .status,
    404,
  );
  assert.equal(
    (await send(foreign, 'put', `/announcements/${eventId}`, poster(), foreignHeaders)).status,
    404,
  );
  assert.equal(
    (await send(foreign, 'get', '/students?q=Alex', null, foreignHeaders)).body.students.length,
    0,
  );
  assert.equal(
    (
      await send(
        foreign,
        'post',
        '/point-adjustments',
        {
          userId: studentId,
          requestKey: randomUUID(),
          delta: 100,
          reason: 'Correction hors de mon restaurant.',
        },
        foreignHeaders,
      )
    ).status,
    404,
  );
  assert.equal(await balance(db, studentId), 15);
});
