import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { openDatabase } from '../src/database.js';
import { seedDemo } from '../src/seed.js';

const student = 'mon-miam-miam-kinshasa';
const gourmet = '694096c7-070b-4650-9ec3-115ceae45b3a';
const photosUrl = new URL('../sql/010_restaurant_menu_photos.sql', import.meta.url);

async function applyMenus(db) {
  const sql = await readFile(new URL('../sql/009_restaurant_menus.sql', import.meta.url), 'utf8');
  const split = sql.indexOf('DO $menus$');
  await db.query(sql.slice(0, split));
  await db.query(sql.slice(split));
}

test('les photos des 30 plats sont locales, créditées et sans effet sur les autres données', async () => {
  const db = await openDatabase({ memory: true });
  try {
    await seedDemo(db, 'Prototype2026!');
    await db.query("INSERT INTO restaurants(id,name,slug) VALUES($1,'La table étoilée','la-table-etoilee'),('autre','Mon Miam Miam','autre')", [gourmet]);
    await db.query("INSERT INTO dishes(id,restaurant_id,name,description,category,price,image) VALUES('plat-autre','autre','Plat privé','Conservé','Plats',12345,'/assets/moambe.webp')");
    await applyMenus(db);
    const before = (await db.query('SELECT id,restaurant_id,name,description,category,price,available,archived FROM dishes ORDER BY id')).rows;
    const sql = await readFile(photosUrl, 'utf8');
    await db.query(sql);
    assert.deepEqual((await db.query('SELECT id,restaurant_id,name,description,category,price,available,archived FROM dishes ORDER BY id')).rows, before);
    const dishes = (await db.query("SELECT id,image FROM dishes WHERE restaurant_id IN ($1,$2) AND category='Plats'", [student, gourmet])).rows;
    assert.equal(dishes.length, 30);
    assert.equal(new Set(dishes.map(dish => dish.image)).size, 28);
    const publicCredits = await readFile(new URL('../../frontend/public/credits-images.txt', import.meta.url), 'utf8');
    const repoCredits = await readFile(new URL('../../docs/CREDITS_IMAGES.md', import.meta.url), 'utf8');
    for (const dish of dishes) {
      assert.match(dish.image, /^\/assets\/menu-[a-z-]+\.webp$/);
      assert.ok((await stat(new URL(`../../frontend/public${dish.image}`, import.meta.url))).size > 1000);
      assert.ok(publicCredits.includes(dish.image.split('/').at(-1)));
      assert.ok(repoCredits.includes(dish.image.split('/').at(-1)));
    }
    assert.equal((await db.query("SELECT image FROM dishes WHERE id='plat-autre'")).rows[0].image, '/assets/moambe.webp');
    assert.equal((await db.query("SELECT image FROM dishes WHERE id='bissap'")).rows[0].image, '/assets/bissap.webp');
    // Une modification du gérant après la migration reste intacte, même s'il
    // revient ensuite à une ancienne illustration proposée par le site.
    await db.query("UPDATE dishes SET image='/assets/moambe.webp' WHERE id='moambe'");
    await db.query(sql);
    assert.equal((await db.query("SELECT image FROM dishes WHERE id='moambe'")).rows[0].image, '/assets/moambe.webp');
  } finally { await db.close(); }
});

test('les photos déjà importées par un gérant ne sont pas remplacées', async () => {
  const db = await openDatabase({ memory: true });
  try {
    await seedDemo(db, 'Prototype2026!');
    await db.query("UPDATE dishes SET image='/api/images/photo-personnelle' WHERE id='moambe'");
    await applyMenus(db);
    await db.query(await readFile(photosUrl, 'utf8'));
    assert.equal((await db.query("SELECT image FROM dishes WHERE id='moambe'")).rows[0].image, '/api/images/photo-personnelle');
    assert.match((await db.query("SELECT image FROM dishes WHERE id='poisson'")).rows[0].image, /menu-poisson/);
  } finally { await db.close(); }
});
