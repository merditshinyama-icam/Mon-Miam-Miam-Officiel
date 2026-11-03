import { bootstrapAdmin } from './bootstrap-admin.js';
import { openDatabase } from './database.js';
import { createApp } from './app.js';
import { seedCatalog } from './seed.js';

if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL)
  throw new Error('DATABASE_URL est obligatoire en production.');
const db = await openDatabase();
await seedCatalog(db);
await bootstrapAdmin(db);
const app = createApp(db);
const host = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, host, () =>
  console.log(
    `Mon Miam Miam · http://${host}:${port} · ${db.engine} · paiement ${process.env.PAYMENT_MODE || 'demo'}`,
  ),
);
async function close() {
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
