import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';
import { seedDemo } from '../src/seed.js';
import { addPoints, RESTAURANT } from '../src/domain.js';
import { digest } from '../src/security.js';
import { hashPassword } from '../src/security.js';
let db, app, admin, student, restaurantId, studentId, membershipId;
const password = 'Prototype2026!';
const ownerBody = {
  restaurantName: 'Table du campus',
  slug: 'table-campus',
  location: 'Kinshasa',
  openingHours: '11 h - 19 h',
  name: 'Propriétaire de test',
  email: 'owner-global@example.test',
  phone: '+243810000000',
  password,
};
const send = (agent, method, url, body, slug = '') => {
  let req = agent[method](`/api${url}`).set({
    'X-Requested-With': 'MonMiamMiam',
    Origin: 'http://localhost:5173',
    ...(slug ? { 'X-Restaurant-Slug': slug } : {}),
  });
  return body ? req.send(body) : req;
};
before(async () => {
  db = await openDatabase({ memory: true });
  await seedDemo(db, password);
  app = createApp(db, { production: false, origin: 'http://localhost:5173', paymentMode: 'demo' });
  admin = request.agent(app);
  student = request.agent(app);
  const created = await send(admin, 'post', '/restaurants', ownerBody);
  assert.equal(created.status, 201);
  restaurantId = created.body.restaurant.id;
  const login = await send(student, 'post', '/auth/login', {
    email: 'student@demo.miam.test',
    password,
  });
  assert.equal(login.status, 200);
  studentId = login.body.user.id;
});
after(async () => await db?.close());

test('créateur : après déconnexion, la page générale retrouve son compte et son chemin', async () => {
  assert.equal((await send(admin, 'post', '/auth/logout')).status, 204);
  const login = await send(admin, 'post', '/auth/login', { email: ownerBody.email, password });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.path, '/r/table-campus');
  assert.equal(login.body.user.role, 'admin');
  assert.equal(
    (await send(admin, 'get', '/auth/me', null, 'table-campus')).body.user.restaurant_id,
    restaurantId,
  );
  assert.equal((await send(admin, 'get', '/auth/me')).status, 401);
  assert.equal((await send(admin, 'get', '/staff')).status, 401);
});
test('annuaire public : tous les restaurants, sans coordonnées privées ni identifiants', async () => {
  const response = await send(request(app), 'get', '/restaurants');
  assert.equal(response.status, 200);
  assert.equal(response.body.restaurants.length, 2);
  assert.equal(
    response.body.restaurants.find((r) => r.id === restaurantId).path,
    '/r/table-campus',
  );
  assert.equal(JSON.stringify(response.body).includes(ownerBody.email), false);
  assert.equal(JSON.stringify(response.body).includes('password'), false);
});
test('étudiant : la même session visite un autre restaurant et garde ses points séparés', async () => {
  const home = await send(student, 'get', '/loyalty');
  assert.equal(home.body.balance, 45);
  const me = await send(student, 'get', '/auth/me', null, 'table-campus');
  assert.equal(me.status, 200, JSON.stringify(me.body));
  membershipId = me.body.user.id;
  assert.notEqual(membershipId, studentId);
  assert.equal(me.body.user.student_identity_id, studentId);
  assert.equal(me.body.user.role, 'student');
  assert.equal((await send(student, 'get', '/loyalty', null, 'table-campus')).body.balance, 0);
  assert.equal((await send(student, 'get', '/loyalty')).body.balance, 45);
  assert.equal((await send(student, 'get', '/staff', null, 'table-campus')).status, 403);
});
test('visites simultanées : une seule adhésion et aucun doublon de compte', async () => {
  const other = await send(request.agent(app), 'post', '/restaurants', {
    ...ownerBody,
    slug: 'autre-table',
    restaurantName: 'Autre Table',
    email: 'second-owner@example.test',
  });
  assert.equal(other.status, 201);
  const results = await Promise.all([
    send(student, 'get', '/auth/me', null, 'autre-table'),
    send(student, 'get', '/auth/me', null, 'autre-table'),
  ]);
  assert.equal(results[0].status, 200);
  assert.equal(results[1].status, 200);
  assert.equal(results[0].body.user.id, results[1].body.user.id);
  const {
    rows: [count],
  } = await db.query(
    'SELECT COUNT(*)::integer AS n FROM users WHERE student_identity_id=$1 AND restaurant_id=$2',
    [studentId, other.body.restaurant.id],
  );
  assert.equal(count.n, 1);
});
test('identité partagée : profil et préférences restent identiques en changeant de restaurant', async () => {
  const changed = await send(
    student,
    'patch',
    '/auth/me',
    {
      name: 'Étudiant multi tables',
      phone: '+243810000001',
      theme: 'blue',
      dark: true,
      public_ranking: false,
      deliveryAddress: 'Adresse de test',
    },
    'table-campus',
  );
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.user.id, membershipId);
  const home = (await send(student, 'get', '/auth/me')).body.user;
  assert.equal(home.name, 'Étudiant multi tables');
  assert.equal(home.theme, 'blue');
  assert.equal(home.delivery_address, 'Adresse de test');
});
test('une deuxième inscription à la même identité ne crée pas un compte étudiant concurrent', async () => {
  const result = await send(
    request.agent(app),
    'post',
    '/auth/register',
    { name: 'Doublon', email: 'student@demo.miam.test', phone: '+243810000002', password },
    'table-campus',
  );
  assert.equal(result.status, 409);
});
test('commandes : les menus et les commandes du même étudiant restent propres au restaurant', async () => {
  const dish = await send(
    admin,
    'post',
    '/dishes',
    {
      name: 'Plat de Table Campus',
      description: 'Recette de test',
      category: 'Plats',
      price: 3000,
      available: true,
      image: '/assets/moambe.webp',
    },
    'table-campus',
  );
  assert.equal(dish.status, 201);
  const body = {
    requestKey: randomUUID(),
    items: [{ dishId: dish.body.dish.id, quantity: 1 }],
    service: 'onsite',
    arrivalAt: new Date(Date.now() + 3600000).toISOString(),
    points: 0,
  };
  const order = await send(student, 'post', '/orders', body, 'table-campus');
  assert.equal(order.status, 201, JSON.stringify(order.body));
  assert.equal(order.body.order.user_id, membershipId);
  assert.equal((await send(student, 'get', `/orders/${order.body.order.id}`)).status, 404);
  assert.equal(
    (await send(student, 'get', `/orders/${order.body.order.id}`, null, 'table-campus')).status,
    200,
  );
  const wrongMenu = await send(student, 'post', '/orders', { ...body, requestKey: randomUUID() });
  assert.notEqual(wrongMenu.status, 201);
});
test('parrainage : codes et filleuls ne se mélangent pas entre restaurants', async () => {
  const home = (await send(student, 'post', '/referral/generate')).body.code;
  const away = (await send(student, 'post', '/referral/generate', null, 'table-campus')).body.code;
  assert.notEqual(home, away);
  const refused = await send(
    request.agent(app),
    'post',
    '/auth/register',
    {
      name: 'Filleul erroné',
      email: 'wrong-referral@example.test',
      phone: '+243810000003',
      password,
      referralCode: home,
    },
    'table-campus',
  );
  assert.equal(refused.status, 400);
});
test('reconnexion étudiante depuis une autre table : mêmes identifiants et même adhésion', async () => {
  const agent = request.agent(app);
  const login = await send(
    agent,
    'post',
    '/auth/login',
    { email: 'student@demo.miam.test', password },
    'table-campus',
  );
  assert.equal(login.status, 200);
  const me = await send(agent, 'get', '/auth/me', null, 'table-campus');
  assert.equal(me.body.user.id, membershipId);
  assert.equal((await send(agent, 'get', '/auth/me')).body.user.id, studentId);
});
test('anciens comptes homonymes : aucune fusion ni prise de contrôle implicite', async () => {
  const original = await db.query('SELECT * FROM users WHERE id=$1', [studentId]);
  await db.query(
    `INSERT INTO users(id,restaurant_id,email,name,phone,password_hash,role,referral_code) VALUES($1,$2,$3,'Ancien étudiant','+243810000005',$4,'student',$5)`,
    [
      randomUUID(),
      restaurantId,
      'legacy@example.test',
      original.rows[0].password_hash,
      'LEGACY-LOCAL',
    ],
  );
  const reg = await send(request.agent(app), 'post', '/auth/register', {
    name: 'Autre identité',
    email: 'legacy@example.test',
    phone: '+243810000004',
    password,
  });
  assert.equal(reg.status, 409);
  // A staff account with the same email must not acquire the student's identity.
  const owner = await send(request.agent(app), 'post', '/auth/login', {
    email: ownerBody.email,
    password,
  });
  assert.equal(owner.body.user.role, 'admin');
});
test('comptes homonymes avec le même mot de passe : choix après validation, aucun rôle implicite', async () => {
  await send(request.agent(app), 'post', '/restaurants', {
    ...ownerBody,
    slug: 'owner-second',
    restaurantName: 'Deuxième établissement',
  });
  const agent = request.agent(app);
  const choices = await send(agent, 'post', '/auth/login', { email: ownerBody.email, password });
  assert.equal(choices.status, 200);
  assert.equal(choices.body.user, undefined);
  assert.equal(choices.body.accounts.length, 2);
  const option = choices.body.accounts.find((a) => a.path === '/r/table-campus');
  assert.ok(option);
  const login = await send(agent, 'post', '/auth/login', {
    email: ownerBody.email,
    password,
    accountId: option.id,
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.path, '/r/table-campus');
  assert.equal((await send(agent, 'get', '/staff', null, 'owner-second')).status, 401);
  const bad = await send(request.agent(app), 'post', '/auth/login', {
    email: ownerBody.email,
    password: 'incorrect',
  });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.accounts, undefined);
});
test('conflit ancien : aucune fusion de deux identités et déconnexion toujours possible', async () => {
  const homeId = randomUUID(),
    awayId = randomUUID();
  for (const [id, restaurant, hash] of [
    [homeId, RESTAURANT, await hashPassword(password)],
    [awayId, restaurantId, await hashPassword('OtherPrototype2026!')],
  ])
    await db.query(
      `INSERT INTO users(id,restaurant_id,email,name,phone,password_hash,role,referral_code)
     VALUES($1,$2,'collision@example.test','Compte historique','+243810000006',$3,'student',$1)`,
      [id, restaurant, hash],
    );
  const agent = request.agent(app);
  assert.equal(
    (await send(agent, 'post', '/auth/login', { email: 'collision@example.test', password }))
      .status,
    200,
  );
  const conflict = await send(agent, 'get', '/auth/me', null, 'table-campus');
  assert.equal(conflict.status, 409);
  assert.equal((await send(agent, 'post', '/auth/logout', null, 'table-campus')).status, 204);
  assert.equal(
    (
      await send(
        agent,
        'post',
        '/auth/login',
        { email: 'collision@example.test', password: 'OtherPrototype2026!' },
        'table-campus',
      )
    ).status,
    200,
  );
  assert.equal((await send(agent, 'get', '/auth/me', null, 'table-campus')).body.user.id, awayId);
  const { rows } = await db.query(
    "SELECT student_identity_id FROM users WHERE email='collision@example.test'",
  );
  assert.ok(rows.every((r) => r.student_identity_id === null));
});

test('désactivation de l’identité : toutes ses adhésions perdent l’accès', async () => {
  await db.query('UPDATE users SET active=FALSE WHERE id=$1', [studentId]);
  assert.equal((await send(student, 'get', '/auth/me', null, 'table-campus')).status, 401);
  await db.query('UPDATE users SET active=TRUE WHERE id=$1', [studentId]);
  assert.equal((await send(student, 'get', '/auth/me', null, 'table-campus')).status, 200);
});

test('réinitialisation depuis une adhésion : identité unique et révocation des sessions', async () => {
  // Synthetic in-memory token only: no real e-mail and no real password changed.
  const secret = 'a'.repeat(64);
  await db.query(
    "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 minutes')",
    [digest(secret), membershipId],
  );
  const response = await send(
    request(app),
    'post',
    '/auth/reset-password',
    { token: secret, password: 'PrototypeChanged2026!' },
    'table-campus',
  );
  assert.equal(response.status, 200);
  assert.equal((await send(student, 'get', '/auth/me')).status, 401);
  const login = await send(request.agent(app), 'post', '/auth/login', {
    email: 'student@demo.miam.test',
    password: 'PrototypeChanged2026!',
  });
  assert.equal(login.status, 200);
  assert.equal(
    (
      await send(request.agent(app), 'post', '/auth/login', {
        email: 'student@demo.miam.test',
        password,
      })
    ).status,
    401,
  );
});
