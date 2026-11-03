import { randomUUID, randomBytes } from 'node:crypto';
import { emailSchema, passwordSchema, phoneSchema } from './auth.js';
import { hashPassword } from './security.js';
import { RESTAURANT } from './domain.js';

export async function bootstrapAdmin(db, env = process.env) {
  const keys = ['ADMIN_EMAIL', 'ADMIN_NAME', 'ADMIN_PHONE', 'ADMIN_PASSWORD'];
  if (!keys.some((key) => env[key])) return;
  const {
    rows: [existing],
  } = await db.query("SELECT id FROM users WHERE restaurant_id=$1 AND role='admin'", [RESTAURANT]);
  if (existing) return; // Never overwrite/promote accounts on restart.
  if (!keys.every((key) => env[key]))
    throw new Error('Configuration du premier administrateur incomplète.');
  const email = emailSchema.parse(env.ADMIN_EMAIL),
    phone = phoneSchema.parse(env.ADMIN_PHONE),
    password = passwordSchema.parse(env.ADMIN_PASSWORD),
    name = env.ADMIN_NAME.trim();
  if (name.length < 2 || name.length > 80)
    throw new Error('Nom du premier administrateur invalide.');
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const {
      rows: [admin],
    } = await tx.query("SELECT id FROM users WHERE restaurant_id=$1 AND role='admin'", [
      RESTAURANT,
    ]);
    if (admin) return;
    await tx.query(
      "INSERT INTO users(id,restaurant_id,email,name,phone,password_hash,role,referral_code) VALUES($1,$2,$3,$4,$5,$6,'admin',$7)",
      [
        randomUUID(),
        RESTAURANT,
        email,
        name,
        phone,
        hash,
        `ADMIN-${randomBytes(6).toString('hex')}`,
      ],
    );
  });
}
