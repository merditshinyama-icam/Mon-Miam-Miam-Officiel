import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { openDatabase } from '../src/database.js';
import { seedDemo } from '../src/seed.js';

const migration = new URL('../sql/009_restaurant_menus.sql', import.meta.url);
const studentRestaurant = 'mon-miam-miam-kinshasa';
const gourmetRestaurant = '694096c7-070b-4650-9ec3-115ceae45b3a';

async function applyMenu(db, sql) {
  // Le chargeur normal utilise exec pour un fichier SQL complet. L'interface
  // query de PGlite accepte ici une seule instruction préparée à la fois.
  const body = sql.indexOf('DO $menus$');
  await db.query(sql.slice(0, body));
  await db.query(sql.slice(body));
}

test('les deux cartes ajoutent 10 et 20 plats sans modifier commandes, boissons ou autres restaurants', async () => {
  const db = await openDatabase({ memory: true });
  try {
    await seedDemo(db, 'Prototype2026!');
    await db.query("INSERT INTO restaurants(id,name,slug) VALUES($1,'La table étoilée','la-table-etoilee'),('autre','Autre restaurant','autre')", [gourmetRestaurant]);
    await db.query("INSERT INTO dishes(id,restaurant_id,name,description,category,price,image) VALUES('autre-plat','autre','Plat conservé','Recette privée','Plats',12345,'/assets/moambe.webp')");
    await db.query("INSERT INTO orders(id,restaurant_id,user_id,request_key,service,subtotal,discount,delivery_fee,total) SELECT 'commande-conservee',$1,id,'avant-carte','onsite',9000,0,0,9000 FROM users WHERE role='student' AND restaurant_id=$1 LIMIT 1", [studentRestaurant]);
    await db.query("INSERT INTO order_items(order_id,dish_id,name,price,quantity) VALUES('commande-conservee','moambe','Poulet à la moambé',9000,1)");
    const before = await db.query("SELECT * FROM order_items WHERE order_id='commande-conservee'");
    const sql = await readFile(migration, 'utf8');
    await applyMenu(db, sql);
    const { rows: counts } = await db.query("SELECT restaurant_id,COUNT(*)::integer AS count FROM dishes WHERE category='Plats' AND archived=FALSE GROUP BY restaurant_id");
    assert.equal(counts.find((r) => r.restaurant_id === studentRestaurant).count, 10);
    assert.equal(counts.find((r) => r.restaurant_id === gourmetRestaurant).count, 20);
    assert.equal(counts.find((r) => r.restaurant_id === 'autre').count, 1);
    assert.deepEqual((await db.query("SELECT * FROM order_items WHERE order_id='commande-conservee'")).rows, before.rows);
    assert.equal((await db.query("SELECT total FROM orders WHERE id='commande-conservee'")).rows[0].total, 9000);
    assert.equal((await db.query("SELECT COUNT(*)::integer AS count FROM dishes WHERE id IN ('bissap','samossas') AND available=TRUE AND archived=FALSE")).rows[0].count, 2);
    const { rows: added } = await db.query("SELECT * FROM dishes WHERE id LIKE 'menu-20261106-%'");
    assert.equal(added.length, 28);
    for (const dish of added) {
      assert.ok(Number.isInteger(dish.price) && dish.price > 0);
      assert.equal(dish.category, 'Plats');
      assert.equal(dish.available, true);
      await access(new URL(`../../frontend/public${dish.image}`, import.meta.url));
    }
    // Les migrations sont relues à chaque démarrage : elles ne doivent ni dupliquer
    // les plats ni annuler une modification ultérieure faite par le restaurant.
    await db.query('UPDATE dishes SET price=13000,available=FALSE WHERE id=$1', [added[0].id]);
    await applyMenu(db, sql);
    assert.equal((await db.query("SELECT COUNT(*)::integer AS count FROM dishes WHERE id LIKE 'menu-20261106-%'")).rows[0].count, 28);
    assert.deepEqual((await db.query('SELECT price,available FROM dishes WHERE id=$1', [added[0].id])).rows[0], { price: 13000, available: false });
    assert.equal((await db.query('SELECT COUNT(*)::integer AS count FROM app_data_migrations')).rows[0].count, 2);
  } finally {
    await db.close();
  }
});

test('une base vide ou un établissement homonyme ne reçoit pas une carte réservée aux identifiants ciblés', async () => {
  const db = await openDatabase({ memory: true });
  try {
    const sql = await readFile(migration, 'utf8');
    await db.query("INSERT INTO restaurants(id,name,slug) VALUES('homonyme','La table étoilée','la-table-etoilee')");
    await applyMenu(db, sql);
    assert.equal((await db.query('SELECT COUNT(*)::integer AS count FROM dishes')).rows[0].count, 0);
    assert.equal((await db.query('SELECT COUNT(*)::integer AS count FROM app_data_migrations')).rows[0].count, 0);
  } finally {
    await db.close();
  }
});
