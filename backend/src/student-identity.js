import { randomUUID, randomBytes } from 'node:crypto';
import { requireCondition, audit } from './domain.js';
export const identityId = (user) => user.student_identity_id || user.id;

// A session authenticates the original identity; each restaurant keeps a separate
// membership for its orders, points and referral rules. No legacy accounts merge.
export async function studentInRestaurant(db, identity, restaurantId) {
  if (identity.restaurant_id === restaurantId) return identity;
  const find = async (tx) =>
    (
      await tx.query('SELECT * FROM users WHERE student_identity_id=$1 AND restaurant_id=$2', [
        identity.id,
        restaurantId,
      ])
    ).rows[0];
  const existing = await find(db);
  if (existing) return existing;
  return db.transaction(async (tx) => {
    const existing = await find(tx);
    if (existing) return existing;
    const { rows: conflicts } = await tx.query(
      'SELECT id FROM users WHERE restaurant_id=$1 AND email=$2',
      [restaurantId, identity.email],
    );
    requireCondition(
      !conflicts.length,
      409,
      'Un ancien compte utilise déjà cette adresse dans ce restaurant. Connectez-vous avec ses identifiants ou contactez le responsable pour rapprocher vos comptes.',
    );
    const {
      rows: [user],
    } = await tx.query(
      `INSERT INTO users(id,restaurant_id,email,name,phone,password_hash,role,
       referral_code,student_identity_id,photo,theme,dark,public_ranking,delivery_address)
       VALUES($1,$2,$3,$4,$5,$6,'student',$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        randomUUID(),
        restaurantId,
        identity.email,
        identity.name,
        identity.phone,
        identity.password_hash,
        `MIAM-${randomBytes(10).toString('hex').toUpperCase()}`,
        identity.id,
        identity.photo,
        identity.theme,
        identity.dark,
        identity.public_ranking,
        identity.delivery_address,
      ],
    );
    await audit(tx, identity.id, 'student_restaurant_joined', restaurantId);
    return user;
  });
}
