import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { openDatabase } from './database.js';
import { seedCatalog } from './seed.js';
import { emailSchema, passwordSchema, phoneSchema } from './auth.js';
import { hashPassword } from './security.js';
import { RESTAURANT } from './domain.js';

const email = emailSchema.parse(process.env.ADMIN_EMAIL);
const password = passwordSchema.parse(process.env.ADMIN_PASSWORD);
const phone = phoneSchema.parse(process.env.ADMIN_PHONE);
const name = z.string().min(2).max(80).parse(process.env.ADMIN_NAME);
const db = await openDatabase();
try {
  await seedCatalog(db);
  await db.query(
    `INSERT INTO users(id,restaurant_id,email,name,phone,password_hash,role,referral_code)
    VALUES($1,$2,$3,$4,$5,$6,'admin',$7)`,
    [
      randomUUID(),
      RESTAURANT,
      email,
      name,
      phone,
      await hashPassword(password),
      `ADMIN-${randomBytes(6).toString('hex')}`,
    ],
  );
  console.log('Compte administrateur créé. Aucun mot de passe existant modifié.');
} finally {
  await db.close();
}
