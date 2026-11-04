import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openDatabase } from './database.js';
import { hashPassword } from './security.js';
import { DEFAULT_SETTINGS, RESTAURANT, addPoints } from './domain.js';

export async function seedCatalog(db) {
  await db.query(
    'INSERT INTO restaurants(id,name,settings,slug) VALUES($1,$2,$3,$1) ON CONFLICT(id) DO NOTHING',
    [RESTAURANT, 'Mon Miam Miam', JSON.stringify(DEFAULT_SETTINGS)],
  );
  const dishes = [
    [
      'moambe',
      'Poulet à la moambé',
      'Riz parfumé, pondu et sauce maison.',
      'Plats',
      9000,
      'moambe.webp',
    ],
    [
      'poisson',
      'Poisson braisé',
      'Banane plantain et légumes frais.',
      'Plats',
      10000,
      'poisson.webp',
    ],
    [
      'bissap',
      'Jus de bissap',
      'Frais, maison, juste ce qu’il faut.',
      'Boissons',
      3000,
      'bissap.webp',
    ],
    [
      'samossas',
      'Samossas croustillants',
      'La petite pause à partager.',
      'Snacks',
      4000,
      'samossas.webp',
    ],
  ];
  for (const [id, name, description, category, price, image] of dishes) {
    await db.query(
      'INSERT INTO dishes(id,restaurant_id,name,description,category,price,image) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING',
      [id, RESTAURANT, name, description, category, price, `/assets/${image}`],
    );
  }
}
export async function seedDemo(db, password) {
  if (!password || password.length < 10 || !/[A-Z]/.test(password) || !/\d/.test(password))
    throw new Error(
      'DEMO_PASSWORD doit contenir au moins 10 caractères, une majuscule et un chiffre.',
    );
  await seedCatalog(db);
  for (const [role, name] of [
    ['student', 'Alex · Démonstration'],
    ['employee', 'Cuisine · Démonstration'],
    ['manager', 'Gérance · Démonstration'],
    ['admin', 'Direction · Démonstration'],
  ]) {
    const id = randomUUID();
    const result = await db.query(
      `INSERT INTO users(id,restaurant_id,email,name,phone,password_hash,role,referral_code)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(restaurant_id,email) DO NOTHING RETURNING id`,
      [
        id,
        RESTAURANT,
        `${role}@demo.miam.test`,
        name,
        '+243810000000',
        await hashPassword(password),
        role,
        `MIAM-${role.toUpperCase()}`,
      ],
    );
    if (role === 'student' && result.rows.length) await addPoints(db, id, 45, `demo:${id}`, 365);
  }
}
// Illustrative posters are limited to a local installation with demo accounts.
export async function seedDemoAnnouncements(db) {
  if (process.env.NODE_ENV === 'production') return;
  const {
    rows: [demo],
  } = await db.query(
    "SELECT id FROM users WHERE restaurant_id=$1 AND role='admin' AND email='admin@demo.miam.test'",
    [RESTAURANT],
  );
  if (!demo) return;
  const {
    rows: [existing],
  } = await db.query(
    'SELECT COUNT(*)::integer AS total FROM announcements WHERE restaurant_id=$1',
    [RESTAURANT],
  );
  if (existing.total) return;
  for (const [id, kind, title, description, image, capacity] of [
    [
      'demo-campus-event',
      'event',
      'La grande table du campus',
      'Une pause conviviale autour des saveurs de Kinshasa. Inscription gratuite réservée aux étudiants. Exemple de démonstration, aucun rendez-vous réel.',
      'moambe.webp',
      30,
    ],
    [
      'demo-campus-promotion',
      'promotion',
      'La pause bissap',
      'Découvrez notre bissap maison à 3 000 CDF, dans la limite du stock disponible. Prix du menu, sans remise supplémentaire. Affiche de démonstration.',
      'bissap.webp',
      null,
    ],
    [
      'demo-campus-game',
      'game',
      'Le quiz des saveurs',
      'Un quiz gratuit animé sur place par le restaurant. Récompense illustrative : 5 points au gagnant, attribués par la direction après vérification. Exemple de démonstration.',
      'samossas.webp',
      20,
    ],
  ]) {
    await db.query(
      `INSERT INTO announcements(id,restaurant_id,kind,title,description,image,starts_at,ends_at,published,capacity)
      VALUES($1,$2,$3,$4,$5,$6,NOW()-INTERVAL '1 hour',NOW()+INTERVAL '7 days',TRUE,$7) ON CONFLICT(id) DO NOTHING`,
      [id, RESTAURANT, kind, title, description, `/assets/${image}`, capacity],
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Le peuplement de démonstration est interdit en production.');
  const db = await openDatabase();
  try {
    await seedDemo(db, process.env.DEMO_PASSWORD);
    console.log('Quatre comptes de démonstration prêts. Voir README.md.');
  } finally {
    await db.close();
  }
}
