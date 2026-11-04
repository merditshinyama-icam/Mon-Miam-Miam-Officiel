import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');
if (!existsSync('node_modules/express'))
  throw new Error('Dépendances absentes. Ouvrez un terminal ici et lancez npm ci.');
if (!existsSync('frontend/dist/index.html')) {
  const build = spawnSync(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'build', '--config', 'frontend/vite.config.js'],
    { stdio: 'inherit' },
  );
  if (build.status !== 0) process.exit(build.status || 1);
}
if (process.env.NODE_ENV !== 'production') {
  const { openDatabase } = await import('../backend/src/database.js');
  const { seedDemo, seedCatalog, seedDemoAnnouncements } = await import('../backend/src/seed.js');
  const db = await openDatabase();
  try {
    await seedCatalog(db);
    const {
      rows: [{ count }],
    } = await db.query("SELECT COUNT(*)::integer AS count FROM users WHERE role='admin'");
    if (!count) {
      const password =
        process.env.DEMO_PASSWORD || `Miam1-${randomBytes(12).toString('base64url')}`;
      await seedDemo(db, password);
      const directory = path.resolve(process.env.DATA_DIR || 'data');
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'ACCES_DEMO_LOCAL.txt'),
        `Mon Miam Miam · comptes de démonstration locaux\n\nÉtudiant : student@demo.miam.test\nEmployé : employee@demo.miam.test\nGérant : manager@demo.miam.test\nAdministrateur : admin@demo.miam.test\n\nMot de passe des quatre comptes : ${password}\n\nDonnées fictives, aucun paiement réel. Ne pas publier ce fichier.\n`,
      );
      console.log(
        'Comptes de démonstration créés. Leurs accès se trouvent dans data/ACCES_DEMO_LOCAL.txt.',
      );
    }
    await seedDemoAnnouncements(db);
  } finally {
    await db.close();
  }
}
console.log('Ouvrez http://localhost:3001 dans votre navigateur. Ctrl+C pour arrêter.');
await import('../backend/src/index.js');
