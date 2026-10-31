import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';
import { seedDemo } from '../src/seed.js';
import { DEFAULT_SETTINGS } from '../src/domain.js';

const demoPassword = 'Demonstration2026!',
  ownerPassword = 'NouveauRestaurant2026!';
const headers = { 'X-Requested-With': 'MonMiamMiam', Origin: 'http://localhost:5173' };
const slug = 'restaurant-recette';
const ownerBody = {
  restaurantName: 'Restaurant Recette',
  slug,
  location: 'Kinshasa · Avenue de recette 10',
  openingHours: 'Tous les jours · 10 h – 18 h',
  name: 'Propriétaire Recette',
  email: 'admin@demo.miam.test',
  phone: '+243810000004',
  password: ownerPassword,
};
let db, app, owner, defaultAdmin, customer, manager, restaurantId, dishId, foreignOrder, dataDir;
const call = (agent, method, url, body, tenant = slug) => {
  let r = agent[method](`/api${url}`).set({
    ...headers,
    ...(tenant ? { 'X-Restaurant-Slug': tenant } : {}),
  });
  return body ? r.send(body) : r;
};
before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'mmm-restaurants-'));
  db = await openDatabase({ memory: true });
  await seedDemo(db, demoPassword);
  app = createApp(db, {
    production: false,
    origin: headers.Origin,
    paymentMode: 'demo',
    dataDir,
    mailTestRecipient: null,
  });
  owner = request.agent(app);
  defaultAdmin = request.agent(app);
  await call(
    defaultAdmin,
    'post',
    '/auth/login',
    { email: 'admin@demo.miam.test', password: demoPassword },
    '',
  );
  const defaultCustomer = request.agent(app);
  await call(
    defaultCustomer,
    'post',
    '/auth/login',
    { email: 'student@demo.miam.test', password: demoPassword },
    '',
  );
  foreignOrder = (
    await call(
      defaultCustomer,
      'post',
      '/orders',
      {
        requestKey: randomUUID(),
        items: [{ dishId: 'moambe', quantity: 1 }],
        service: 'onsite',
        arrivalAt: new Date(Date.now() + 3600000).toISOString(),
        points: 0,
      },
      '',
    )
  ).body.order.id;
});
after(async () => {
  await db?.close();
  if (dataDir && path.resolve(dataDir).startsWith(path.join(os.tmpdir(), 'mmm-restaurants-')))
    await rm(dataDir, { recursive: true, force: true });
});
test('créer un restaurant crée son administrateur et un espace vide séparé', async () => {
  const res = await call(owner, 'post', '/restaurants', ownerBody, '');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.user.role, 'admin');
  assert.equal(res.body.restaurant.slug, slug);
  assert.equal(res.body.path, `/r/${slug}`);
  restaurantId = res.body.restaurant.id;
  assert.equal(res.body.user.restaurant_id, restaurantId);
  const catalog = await call(owner, 'get', '/catalog');
  assert.equal(catalog.body.dishes.length, 0);
  assert.equal(catalog.body.settings.location, ownerBody.location);
  assert.equal(
    JSON.stringify(catalog.body).includes(ownerBody.email),
    false,
    'L’e-mail personnel du propriétaire ne doit pas devenir public.',
  );
  assert.equal((await call(defaultAdmin, 'get', '/catalog', null, '')).body.dishes.length, 4);
});
test('un identifiant déjà utilisé refuse la création sans ajouter de compte', async () => {
  const before = (await db.query('SELECT COUNT(*)::integer AS count FROM users')).rows[0].count;
  assert.equal(
    (
      await call(
        request.agent(app),
        'post',
        '/restaurants',
        { ...ownerBody, email: 'autre@example.test' },
        '',
      )
    ).status,
    409,
  );
  assert.equal(
    (await db.query('SELECT COUNT(*)::integer AS count FROM users')).rows[0].count,
    before,
  );
});
test('une session et une connexion ne donnent pas accès à un autre restaurant', async () => {
  assert.equal((await call(owner, 'get', '/auth/me')).status, 200);
  assert.equal((await call(owner, 'get', '/auth/me', null, '')).status, 401);
  assert.equal((await call(defaultAdmin, 'get', '/staff')).status, 401);
  assert.equal((await call(owner, 'get', `/orders/${foreignOrder}`)).status, 404);
  assert.equal(
    (
      await call(request.agent(app), 'post', '/auth/login', {
        email: ownerBody.email,
        password: demoPassword,
      })
    ).status,
    401,
  );
  assert.equal((await call(request.agent(app), 'get', '/catalog', null, 'inconnu')).status, 404);
});
test('l’administrateur peut créer un gérant qui ne peut pas créer un autre gérant', async () => {
  const body = {
    name: 'Gérant Recette',
    email: 'gerant@example.test',
    phone: '+243810000005',
    password: demoPassword,
    role: 'manager',
  };
  const res = await call(owner, 'post', '/staff', body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.user.role, 'manager');
  manager = request.agent(app);
  assert.equal(
    (await call(manager, 'post', '/auth/login', { email: body.email, password: demoPassword }))
      .status,
    200,
  );
  assert.equal(
    (await call(manager, 'post', '/staff', { ...body, email: 'second-gerant@example.test' }))
      .status,
    403,
  );
  assert.equal((await call(manager, 'get', '/staff')).body.staff.length, 0);
  assert.equal((await call(owner, 'get', '/staff')).body.staff[0].role, 'manager');
});
test('le catalogue et les paramètres de chaque restaurant restent séparés', async () => {
  const dish = {
    name: 'Plat du nouveau restaurant',
    description: 'Une recette de test locale.',
    category: 'Plats',
    price: 9000,
    image: '/assets/moambe.svg',
    available: true,
  };
  const res = await call(owner, 'post', '/dishes', dish);
  assert.equal(res.status, 201);
  dishId = res.body.dish.id;
  assert.equal(
    (await call(owner, 'patch', '/dishes/moambe/availability', { available: false })).status,
    404,
  );
  assert.equal(
    (
      await call(owner, 'put', '/settings', {
        ...DEFAULT_SETTINGS,
        deliveryFee: 5000,
        earnEvery: 4500,
      })
    ).status,
    200,
  );
  assert.equal((await call(owner, 'get', '/catalog')).body.settings.deliveryFee, 5000);
  assert.equal(
    (await call(defaultAdmin, 'get', '/catalog', null, '')).body.settings.deliveryFee,
    2000,
  );
  assert.equal((await call(defaultAdmin, 'get', '/catalog', null, '')).body.dishes.length, 4);
});
test('les étudiants sont créés dans le restaurant choisi et ne peuvent pas prendre un rôle administratif', async () => {
  customer = request.agent(app);
  const body = {
    name: 'Client du nouveau restaurant',
    email: 'student@demo.miam.test',
    phone: '+243810000006',
    password: demoPassword,
  };
  assert.equal(
    (await call(customer, 'post', '/auth/register', { ...body, role: 'admin' })).status,
    400,
  );
  const res = await call(customer, 'post', '/auth/register', body);
  assert.equal(res.status, 201);
  assert.equal(res.body.user.restaurant_id, restaurantId);
  assert.equal((await call(customer, 'put', '/branding', {})).status, 403);
  assert.equal(
    (
      await call(request.agent(app), 'post', '/auth/register', {
        ...body,
        email: 'parrain@example.test',
        referralCode: 'MIAM-STUDENT',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(customer, 'post', '/orders', {
        requestKey: randomUUID(),
        items: [{ dishId: 'moambe', quantity: 1 }],
        service: 'delivery',
        address: 'Adresse fictive de livraison',
        points: 0,
      })
    ).status,
    409,
  );
});
test('nom, textes et images personnalisent uniquement le restaurant du propriétaire', async () => {
  const body = {
    name: 'La Table Recette',
    authTitle: 'Bienvenue à notre table.',
    authSubtitle: 'Les saveurs de notre quartier.',
    heroTitle: 'Une belle pause vous attend.',
    defaultTheme: 'forest',
    contactEmail: 'contact@example.test',
    contactPhone: '+243810000007',
  };
  assert.equal((await call(manager, 'put', '/branding', body)).status, 403);
  assert.equal((await call(owner, 'put', '/branding', body)).status, 200);
  const png = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#cfbd97' } })
    .png()
    .toBuffer();
  for (const slot of ['logo', 'authImage', 'coverImage']) {
    const res = await owner
      .post(`/api/branding/images/${slot}`)
      .set({ ...headers, 'X-Restaurant-Slug': slug })
      .attach('image', png, 'recette.png');
    assert.equal(res.status, 200);
    assert.match(res.body.restaurant.branding[slot], /^data:image\/webp;base64,/);
  }
  const catalog = (await call(owner, 'get', '/catalog')).body;
  assert.equal(catalog.restaurant.name, body.name);
  assert.equal(catalog.restaurant.branding.authTitle, body.authTitle);
  const newClient = await call(request.agent(app), 'post', '/auth/register', {
    name: 'Client après personnalisation',
    email: 'nouveau-client@example.test',
    phone: '+243810000008',
    password: demoPassword,
  });
  assert.equal(newClient.status, 201);
  assert.equal(newClient.body.user.theme, 'forest');
  assert.equal(
    (await call(defaultAdmin, 'get', '/catalog', null, '')).body.restaurant.name,
    'Mon Miam Miam',
  );
  assert.equal(
    (
      await owner
        .post('/api/branding/images/logo')
        .set({ ...headers, 'X-Restaurant-Slug': slug })
        .attach('image', Buffer.from('not a photo'), 'faux.png')
    ).status,
    400,
  );
});
test('la commande, le service et la fidélité utilisent les paramètres du nouveau restaurant', async () => {
  const res = await call(customer, 'post', '/orders', {
    requestKey: randomUUID(),
    items: [{ dishId, quantity: 1 }],
    service: 'onsite',
    arrivalAt: new Date(Date.now() + 3600000).toISOString(),
    points: 0,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const id = res.body.order.id;
  const payment = await call(customer, 'post', `/orders/${id}/payments`, {
    phone: '+243810000006',
    operator: 'm-pesa',
  });
  await call(customer, 'post', `/orders/${id}/payments/${payment.body.payment.id}/simulate`, {
    outcome: 'paid',
  });
  for (const status of ['preparing', 'ready', 'served'])
    assert.equal((await call(manager, 'patch', `/orders/${id}/status`, { status })).status, 200);
  assert.equal((await call(customer, 'get', '/loyalty')).body.balance, 2);
  assert.equal((await call(defaultAdmin, 'get', '/orders', null, '')).body.orders.length, 1);
  assert.equal((await call(owner, 'get', '/orders')).body.orders.length, 1);
});
test('la récupération garde le lien du restaurant et ne modifie pas le compte homonyme du site initial', async () => {
  assert.equal(
    (await call(request.agent(app), 'post', '/auth/forgot-password', { email: ownerBody.email }))
      .status,
    200,
  );
  const [file] = await readdir(path.join(dataDir, 'outbox'));
  const mail = JSON.parse(await readFile(path.join(dataDir, 'outbox', file), 'utf8'));
  assert.match(mail.url, new RegExp(`/r/${slug}/reset`));
  const secret = new URL(mail.url).searchParams.get('token');
  assert.equal(
    (
      await call(
        request.agent(app),
        'post',
        '/auth/reset-password',
        { token: secret, password: 'AutreMotDePasse2026' },
        '',
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(request.agent(app), 'post', '/auth/reset-password', {
        token: secret,
        password: 'AutreMotDePasse2026',
      })
    ).status,
    200,
  );
  assert.equal((await call(defaultAdmin, 'get', '/auth/me', null, '')).status, 200);
});
