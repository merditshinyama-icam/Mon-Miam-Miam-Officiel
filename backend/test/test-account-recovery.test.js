import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database.js';
import { seedCatalog, seedDemo } from '../src/seed.js';
import { verifyPassword } from '../src/security.js';
import { restoreTestAccounts } from '../../scripts/restore-test-accounts.mjs';

test('restauration opérateur : quatre rôles, mot de passe vérifiable et opération unique', async () => {
  const db = await openDatabase({ memory: true });
  try {
    await seedCatalog(db);
    assert.deepEqual(await restoreTestAccounts(db, 'TestAccounts2026!'), {
      skipped: false,
      created: 4,
      restored: 0,
    });
    const { rows } = await db.query('SELECT id,email,role,password_hash FROM users ORDER BY role');
    assert.equal(rows.length, 4);
    for (const user of rows) {
      assert.equal(user.email, `${user.role}@demo.miam.test`);
      assert.equal(await verifyPassword('TestAccounts2026!', user.password_hash), true);
    }
    assert.deepEqual(await restoreTestAccounts(db, 'AnotherPassword2026!'), {
      skipped: true,
      created: 0,
      restored: 0,
    });
    const again = await db.query('SELECT password_hash FROM users WHERE id=$1', [rows[0].id]);
    assert.equal(again.rows[0].password_hash, rows[0].password_hash);
  } finally {
    await db.close();
  }
});

test('restauration : identites conservees et anciennes sessions invalidees', async () => {
  const db = await openDatabase({ memory: true });
  try {
    await seedDemo(db, 'OriginalTests2026!');
    const before = await db.query('SELECT id,email FROM users ORDER BY email');
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('old-session',$1,NOW()+INTERVAL '1 day')",
      [before.rows[0].id],
    );
    assert.deepEqual(await restoreTestAccounts(db, 'RestoredTests2026!'), {
      skipped: false,
      created: 0,
      restored: 4,
    });
    assert.deepEqual(
      (await db.query('SELECT id,email FROM users ORDER BY email')).rows,
      before.rows,
    );
    assert.equal((await db.query('SELECT * FROM sessions')).rows.length, 0);
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id=$1', [
      before.rows[0].id,
    ]);
    assert.equal(await verifyPassword('RestoredTests2026!', rows[0].password_hash), true);
  } finally {
    await db.close();
  }
});

test('un role inattendu annule toute operation et ne promeut aucun compte', async () => {
  const db = await openDatabase({ memory: true });
  try {
    await seedDemo(db, 'OriginalTests2026!');
    await db.query("UPDATE users SET role='student' WHERE email='admin@demo.miam.test'");
    const before = await db.query('SELECT id,role,password_hash FROM users ORDER BY id');
    await assert.rejects(restoreTestAccounts(db, 'RestoredTests2026!'), /sans promotion/);
    assert.deepEqual(
      (await db.query('SELECT id,role,password_hash FROM users ORDER BY id')).rows,
      before.rows,
    );
    assert.equal(
      (await db.query("SELECT * FROM audit_log WHERE action='test_accounts_restored'")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
