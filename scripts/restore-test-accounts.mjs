import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openDatabase } from '../backend/src/database.js';
import { passwordSchema } from '../backend/src/auth.js';
import { hashPassword } from '../backend/src/security.js';
import { RESTAURANT, requireCondition } from '../backend/src/domain.js';

const operation = 'restore-four-demo-accounts-2026-10-27';
const accounts = [
  ['student', 'Étudiant · Démonstration'],
  ['employee', 'Employé · Démonstration'],
  ['manager', 'Gérant · Démonstration'],
  ['admin', 'Administrateur · Démonstration'],
];

// Operator-only recovery: no HTTP endpoint and no password in source or arguments.
// The owner enters TEST_ACCOUNTS_PASSWORD in Render and submits the deployment.
export async function restoreTestAccounts(db, password) {
  passwordSchema.parse(password);
  return db.transaction(async (tx) => {
    const prior = await tx.query(
      "SELECT id FROM audit_log WHERE action='test_accounts_restored' AND entity_id=$1",
      [operation],
    );
    if (prior.rows.length) return { skipped: true, created: 0, restored: 0 };
    const restaurant = await tx.query('SELECT id FROM restaurants WHERE id=$1', [RESTAURANT]);
    requireCondition(restaurant.rows.length, 409, 'Restaurant de référence absent.');
    let created = 0,
      restored = 0;
    for (const [role, name] of accounts) {
      const email = `${role}@demo.miam.test`;
      const {
        rows: [existing],
      } = await tx.query(
        'SELECT id,role FROM users WHERE restaurant_id=$1 AND email=$2 FOR UPDATE',
        [RESTAURANT, email],
      );
      requireCondition(
        !existing || existing.role === role,
        409,
        'Rôle existant différent : opération annulée sans promotion.',
      );
      const hash = await hashPassword(password);
      if (existing) {
        await tx.query('UPDATE users SET password_hash=$1,active=TRUE WHERE id=$2', [
          hash,
          existing.id,
        ]);
        await tx.query('DELETE FROM sessions WHERE user_id=$1', [existing.id]);
        await tx.query('DELETE FROM password_resets WHERE user_id=$1', [existing.id]);
        restored++;
      } else {
        await tx.query(
          `INSERT INTO users(id,restaurant_id,email,name,phone,password_hash,role,referral_code)
          VALUES($1,$2,$3,$4,'+243810000000',$5,$6,$7)`,
          [randomUUID(), RESTAURANT, email, name, hash, role, `TEST-${randomUUID()}`],
        );
        created++;
      }
    }
    await tx.query(
      "INSERT INTO audit_log(id,action,entity_id) VALUES($1,'test_accounts_restored',$2)",
      [randomUUID(), operation],
    );
    return { skipped: false, created, restored };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const password = process.env.TEST_ACCOUNTS_PASSWORD;
  if (password) {
    requireCondition(
      process.env.RENDER_SERVICE_ID === 'srv-dbdqagd9fdbs738a4gi0',
      403,
      'Opération réservée au service Render autorisé.',
    );
    requireCondition(process.env.DATABASE_URL, 503, 'Base PostgreSQL non configurée.');
    const db = await openDatabase();
    try {
      const result = await restoreTestAccounts(db, password);
      console.log('Comptes de test :', JSON.stringify(result));
    } finally {
      await db.close();
    }
  }
}
