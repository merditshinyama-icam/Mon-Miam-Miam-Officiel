import multer from 'multer';
import sharp from 'sharp';
import { Router } from 'express';
import { z } from 'zod';
import { randomUUID, randomBytes } from 'node:crypto';
import { roles, requireAuth, passwordSchema, emailSchema, phoneSchema } from './auth.js';
import { requireCondition, settings, balance, audit, AppError } from './domain.js';
import { hashPassword } from './security.js';

const periodSchema = z.enum(['day', 'week', 'month']);
const periodStart =
  "(date_trunc($2::text, NOW() AT TIME ZONE 'Africa/Kinshasa') AT TIME ZONE 'Africa/Kinshasa')";
const dishSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(3).max(250),
    category: z.enum(['Plats', 'Boissons', 'Snacks']),
    price: z.number().int().min(100).max(10000000),
    image: z
      .enum([
        '/assets/moambe.webp',
        '/assets/poisson.webp',
        '/assets/bissap.webp',
        '/assets/samossas.webp',
        '/assets/moambe.svg',
        '/assets/poisson.svg',
        '/assets/bissap.svg',
        '/assets/samossas.svg',
      ])
      .optional(),
    available: z.boolean(),
  })
  .strict();
export function managementRouter(db) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 8 },
  });
  async function parseDish(req, existing) {
    const raw = req.is('multipart/form-data')
      ? { ...req.body, price: Number(req.body.price), available: req.body.available === 'true' }
      : req.body;
    const b = dishSchema.parse(raw);
    b.image = b.image || existing?.image || '/assets/moambe.webp';
    if (req.file) {
      try {
        const image = sharp(req.file.buffer, { limitInputPixels: 16000000, animated: false });
        const meta = await image.metadata();
        requireCondition(
          ['jpeg', 'png', 'webp'].includes(meta.format),
          400,
          'Choisissez une image JPEG, PNG ou WebP.',
        );
        const buffer = await image
          .rotate()
          .resize(1000, 750, { fit: 'cover', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        b.image = `data:image/webp;base64,${buffer.toString('base64')}`;
      } catch (e) {
        if (e instanceof AppError) throw e;
        throw new AppError(400, 'Image illisible ou dimensions trop grandes.');
      }
    }
    return b;
  }
  router.get('/loyalty', roles('student'), async (req, res) => {
    const { rows: lots } = await db.query(
      'SELECT source,earned,remaining,created_at,expires_at FROM point_lots WHERE user_id=$1 ORDER BY created_at DESC',
      [req.user.id],
    );
    const { rows: referrals } = await db.query(
      'SELECT name,referral_rewarded,created_at FROM users WHERE referrer_id=$1 ORDER BY created_at DESC',
      [req.user.id],
    );
    const { rows: adjustments } = await db.query(
      'SELECT id,delta,reason,created_at FROM point_adjustments WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 100',
      [req.user.id],
    );
    res.json({
      adjustments,
      balance: await balance(db, req.user.id),
      lots,
      referrals,
      code: req.user.referral_code,
      rules: await settings(db, req.restaurant.id),
    });
  });
  router.get('/ranking', requireAuth, async (req, res) => {
    const period = periodSchema.parse(req.query.period || 'week');
    const { rows } = await db.query(
      `SELECT u.id,u.name,u.public_ranking,COUNT(*)::integer AS count FROM orders o JOIN users u ON u.id=o.user_id
      WHERE o.restaurant_id=$1 AND o.status IN ('served','delivered') AND o.created_at >= ${periodStart}
      GROUP BY u.id,u.name,u.public_ranking ORDER BY count DESC,MIN(o.created_at),u.id LIMIT 10`,
      [req.restaurant.id, period],
    );
    res.json({
      ranking: rows.map((row, index) => ({
        rank: index + 1,
        name: row.public_ranking ? row.name : `Étudiant · ${row.id.slice(0, 4)}`,
        count: row.count,
      })),
      period,
    });
  });
  router.get('/stats', roles('employee', 'manager', 'admin'), async (req, res) => {
    const period =
      req.user.role === 'employee' ? 'week' : periodSchema.parse(req.query.period || 'week');
    const {
      rows: [stats],
    } = await db.query(
      `SELECT COUNT(*)::integer AS orders,
      COALESCE(SUM(total) FILTER(WHERE payment_status='paid'),0)::bigint AS revenue,
      COUNT(*) FILTER(WHERE status IN ('served','delivered'))::integer AS completed,
      COUNT(*) FILTER(WHERE status IN ('confirmed','preparing','ready','delivering'))::integer AS active,
      COALESCE(SUM(points_earned),0)::integer AS points FROM orders WHERE restaurant_id=$1 AND created_at>=${periodStart}`,
      [req.restaurant.id, period],
    );
    const { rows: popular } = await db.query(
      `SELECT i.name,SUM(i.quantity)::integer AS quantity FROM order_items i JOIN orders o ON o.id=i.order_id
      WHERE o.restaurant_id=$1 AND o.payment_status='paid' AND o.created_at>=${periodStart} GROUP BY i.name ORDER BY quantity DESC LIMIT 5`,
      [req.restaurant.id, period],
    );
    const {
      rows: [loyalty],
    } = await db.query(
      `SELECT
      COALESCE(SUM(points_spent) FILTER(WHERE payment_status='paid'),0)::integer AS redeemed,
      COALESCE(SUM(discount) FILTER(WHERE payment_status='paid'),0)::bigint AS discounts
      FROM orders WHERE restaurant_id=$1 AND created_at>=${periodStart}`,
      [req.restaurant.id, period],
    );
    const {
      rows: [referrals],
    } = await db.query(
      `SELECT COUNT(*)::integer AS invited,
      COUNT(*) FILTER(WHERE referral_rewarded=TRUE)::integer AS rewarded
      FROM users WHERE restaurant_id=$1 AND referrer_id IS NOT NULL AND created_at>=${periodStart}`,
      [req.restaurant.id, period],
    );
    const {
      rows: [expired],
    } = await db.query(
      `SELECT COALESCE(SUM(p.remaining),0)::integer AS points
      FROM point_lots p JOIN users u ON u.id=p.user_id WHERE u.restaurant_id=$1 AND p.expires_at<=NOW()
      AND p.expires_at>=${periodStart}`,
      [req.restaurant.id, period],
    );
    res.json({
      stats: { ...stats, revenue: Number(stats.revenue) },
      popular,
      period,
      loyalty: { ...loyalty, discounts: Number(loyalty.discounts), expired: expired.points },
      referrals,
    });
  });
  router.get('/complaints', requireAuth, async (req, res) => {
    const student = req.user.role === 'student';
    const { rows } = await db.query(
      `SELECT c.*,u.name FROM complaints c JOIN users u ON u.id=c.user_id JOIN orders o ON o.id=c.order_id
      WHERE o.restaurant_id=$1 ${student ? 'AND c.user_id=$2' : ''} ORDER BY c.created_at DESC LIMIT 100`,
      student ? [req.restaurant.id, req.user.id] : [req.restaurant.id],
    );
    res.json({
      complaints: rows.map(({ draft, ...rest }) => (student ? rest : { ...rest, draft })),
    });
  });
  router.post('/complaints', roles('student'), async (req, res) => {
    const body = z
      .object({ orderId: z.uuid(), message: z.string().trim().min(10).max(2000) })
      .strict()
      .parse(req.body);
    const {
      rows: [order],
    } = await db.query('SELECT id FROM orders WHERE id=$1 AND user_id=$2', [
      body.orderId,
      req.user.id,
    ]);
    requireCondition(order, 404, 'Commande introuvable.');
    const {
      rows: [complaint],
    } = await db.query(
      'INSERT INTO complaints(id,order_id,user_id,message) VALUES($1,$2,$3,$4) RETURNING *',
      [randomUUID(), order.id, req.user.id, body.message],
    );
    res.status(201).json({ complaint });
  });
  router.post('/complaints/:id/draft', roles('employee', 'manager', 'admin'), async (req, res) => {
    const { draft } = z
      .object({ draft: z.string().trim().min(10).max(2000) })
      .strict()
      .parse(req.body);
    const reviewRole = req.user.role === 'employee' ? 'manager' : 'admin';
    await db.transaction(async (tx) => {
      const {
        rows: [complaint],
      } = await tx.query(
        `SELECT c.* FROM complaints c JOIN orders o ON o.id=c.order_id
        WHERE c.id=$1 AND o.restaurant_id=$2 FOR UPDATE OF c`,
        [req.params.id, req.restaurant.id],
      );
      requireCondition(
        complaint && complaint.status !== 'resolved',
        409,
        'Cette réclamation a déjà été traitée.',
      );
      requireCondition(
        !(
          complaint.status === 'pending' &&
          complaint.review_role === 'admin' &&
          req.user.role !== 'admin'
        ),
        403,
        'Cette proposition attend la décision de l’administrateur.',
      );
      await tx.query("UPDATE complaints SET draft=$1,status='pending',review_role=$2 WHERE id=$3", [
        draft,
        reviewRole,
        complaint.id,
      ]);
      await audit(tx, req.user.id, `complaint_proposed_to_${reviewRole}`, complaint.id);
    });
    res.json({
      message:
        reviewRole === 'admin'
          ? 'Proposition envoyée à l’administrateur pour validation.'
          : 'Proposition envoyée au gérant pour validation.',
    });
  });
  router.post('/complaints/:id/decision', roles('manager', 'admin'), async (req, res) => {
    const { approve, draft } = z
      .object({ approve: z.boolean(), draft: z.string().trim().min(10).max(2000).optional() })
      .strict()
      .refine(
        (body) => body.approve || body.draft === undefined,
        'Une demande de révision ne publie pas de réponse.',
      )
      .parse(req.body);
    await db.transaction(async (tx) => {
      const {
        rows: [complaint],
      } = await tx.query(
        `SELECT c.* FROM complaints c JOIN orders o ON o.id=c.order_id
        WHERE c.id=$1 AND o.restaurant_id=$2 FOR UPDATE OF c`,
        [req.params.id, req.restaurant.id],
      );
      requireCondition(
        complaint && complaint.status !== 'resolved',
        409,
        'Aucune proposition à valider.',
      );
      requireCondition(
        !(
          complaint.status === 'pending' &&
          complaint.review_role === 'admin' &&
          req.user.role !== 'admin'
        ),
        403,
        'Cette proposition attend la décision de l’administrateur.',
      );
      requireCondition(
        complaint.status === 'pending' || (approve && draft !== undefined),
        409,
        'Saisissez une réponse à publier.',
      );
      const response = draft ?? complaint.draft;
      requireCondition(
        !approve || response?.trim().length >= 10,
        400,
        'La réponse doit contenir au moins 10 caractères.',
      );
      await tx.query('UPDATE complaints SET status=$1,draft=$2,response=$3 WHERE id=$4', [
        approve ? 'resolved' : 'revise',
        response,
        approve ? response : null,
        complaint.id,
      ]);
      await audit(
        tx,
        req.user.id,
        approve ? 'complaint_approved' : 'complaint_rejected',
        req.params.id,
      );
    });
    res.json({ message: approve ? 'Réponse publiée.' : 'Proposition renvoyée à l’équipe.' });
  });
  router.patch(
    '/dishes/:id/availability',
    roles('employee', 'manager', 'admin'),
    async (req, res) => {
      const { available } = z.object({ available: z.boolean() }).strict().parse(req.body);
      const { rows } = await db.query(
        'UPDATE dishes SET available=$1 WHERE id=$2 AND restaurant_id=$3 AND archived=FALSE RETURNING *',
        [available, req.params.id, req.restaurant.id],
      );
      requireCondition(rows[0], 404, 'Plat introuvable.');
      res.json({ dish: rows[0] });
    },
  );
  router.post('/dishes', roles('admin'), upload.single('photo'), async (req, res) => {
    const b = await parseDish(req);
    const { rows } = await db.query(
      'INSERT INTO dishes(id,restaurant_id,name,description,category,price,image,available) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [
        randomUUID(),
        req.restaurant.id,
        b.name,
        b.description,
        b.category,
        b.price,
        b.image,
        b.available,
      ],
    );
    res.status(201).json({ dish: rows[0] });
  });
  router.put('/dishes/:id', roles('admin'), upload.single('photo'), async (req, res) => {
    const {
      rows: [existing],
    } = await db.query(
      'SELECT image FROM dishes WHERE id=$1 AND restaurant_id=$2 AND archived=FALSE',
      [req.params.id, req.restaurant.id],
    );
    requireCondition(existing, 404, 'Plat introuvable.');
    const b = await parseDish(req, existing);
    const { rows } = await db.query(
      'UPDATE dishes SET name=$1,description=$2,category=$3,price=$4,image=$5,available=$6 WHERE id=$7 AND restaurant_id=$8 AND archived=FALSE RETURNING *',
      [
        b.name,
        b.description,
        b.category,
        b.price,
        b.image,
        b.available,
        req.params.id,
        req.restaurant.id,
      ],
    );
    requireCondition(rows[0], 404, 'Plat introuvable.');
    res.json({ dish: rows[0] });
  });
  router.delete('/dishes/:id', roles('admin'), async (req, res) => {
    const { rows } = await db.query(
      'UPDATE dishes SET archived=TRUE,available=FALSE WHERE id=$1 AND restaurant_id=$2 RETURNING id',
      [req.params.id, req.restaurant.id],
    );
    requireCondition(rows[0], 404, 'Plat introuvable.');
    res.status(204).end();
  });
  router.put('/featured-dish', roles('employee', 'manager', 'admin'), async (req, res) => {
    const { dishId } = z
      .object({ dishId: z.string().min(1).max(80).nullable() })
      .strict()
      .parse(req.body);
    await db.transaction(async (tx) => {
      if (dishId) {
        const {
          rows: [dish],
        } = await tx.query(
          'SELECT id FROM dishes WHERE id=$1 AND restaurant_id=$2 AND archived=FALSE AND available=TRUE',
          [dishId, req.restaurant.id],
        );
        requireCondition(dish, 404, 'Choisissez un article disponible de votre restaurant.');
      }
      await tx.query('UPDATE restaurants SET featured_dish_id=$1 WHERE id=$2', [
        dishId,
        req.restaurant.id,
      ]);
      await audit(tx, req.user.id, 'featured_dish_changed', dishId || req.restaurant.id);
    });
    res.json({ featuredDishId: dishId });
  });
  router.get('/staff', roles('manager', 'admin'), async (req, res) => {
    const { rows } = await db.query(
      "SELECT id,name,email,phone,role,active,removed_at FROM users WHERE restaurant_id=$1 AND (role='employee' OR ($2=TRUE AND role='manager')) AND (removed_at IS NULL OR $3=TRUE) ORDER BY role,name",
      [
        req.restaurant.id,
        req.user.role === 'admin',
        req.user.role === 'admin' && req.query.includeRemoved === 'true',
      ],
    );
    res.json({ staff: rows });
  });
  router.post('/staff', roles('manager', 'admin'), async (req, res) => {
    const b = z
      .object({
        name: z.string().trim().min(2).max(80),
        email: emailSchema,
        phone: phoneSchema,
        password: passwordSchema,
        role: z.enum(['employee', 'manager']).default('employee'),
      })
      .strict()
      .parse(req.body);
    requireCondition(
      req.user.role === 'admin' || b.role === 'employee',
      403,
      'Seul l’administrateur peut créer un gérant.',
    );
    const hash = await hashPassword(b.password);
    const user = await db.transaction(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO users(id,restaurant_id,name,email,phone,password_hash,role,referral_code)
        VALUES($1,$2,$3,$4,$5,$6,$8,$7) RETURNING id,name,email,phone,role,active`,
        [
          randomUUID(),
          req.restaurant.id,
          b.name,
          b.email,
          b.phone,
          hash,
          `STAFF-${randomBytes(6).toString('hex')}`,
          b.role,
        ],
      );
      await audit(tx, req.user.id, 'employee_created', rows[0].id);
      return rows[0];
    });
    res.status(201).json({ user });
  });
  router.patch('/staff/:id', roles('admin'), async (req, res) => {
    const b = z
      .object({
        name: z.string().trim().min(2).max(80),
        phone: phoneSchema,
        active: z.boolean(),
        role: z.enum(['employee', 'manager']).optional(),
      })
      .strict()
      .parse(req.body);
    await db.transaction(async (tx) => {
      const { rows } = await tx.query(
        "UPDATE users SET name=$1,phone=$2,active=$3,role=COALESCE($6,role) WHERE id=$4 AND restaurant_id=$5 AND removed_at IS NULL AND role IN ('employee','manager') RETURNING id",
        [b.name, b.phone, b.active, req.params.id, req.restaurant.id, b.role ?? null],
      );
      requireCondition(rows[0], 404, 'Employé introuvable.');
      if (!b.active || b.role)
        await tx.query('DELETE FROM sessions WHERE user_id=$1', [req.params.id]);
      await audit(tx, req.user.id, 'employee_updated', req.params.id);
    });
    res.json({ message: 'Employé mis à jour.' });
  });
  router.delete('/staff/:id', roles('admin'), async (req, res) => {
    await db.transaction(async (tx) => {
      const {
        rows: [staff],
      } = await tx.query(
        "UPDATE users SET active=FALSE,removed_at=COALESCE(removed_at,NOW()) WHERE id=$1 AND restaurant_id=$2 AND role IN ('employee','manager') RETURNING id",
        [req.params.id, req.restaurant.id],
      );
      requireCondition(staff, 404, 'Membre introuvable.');
      await tx.query('DELETE FROM sessions WHERE user_id=$1', [staff.id]);
      await tx.query('DELETE FROM password_resets WHERE user_id=$1', [staff.id]);
      await audit(tx, req.user.id, 'staff_removed', staff.id);
    });
    res.status(204).end();
  });
  router.post('/staff/:id/restore', roles('admin'), async (req, res) => {
    const {
      rows: [staff],
    } = await db.query(
      "UPDATE users SET removed_at=NULL,active=FALSE WHERE id=$1 AND restaurant_id=$2 AND role IN ('employee','manager') AND removed_at IS NOT NULL RETURNING id",
      [req.params.id, req.restaurant.id],
    );
    requireCondition(staff, 404, 'Membre retiré introuvable.');
    await audit(db, req.user.id, 'staff_restored', staff.id);
    res.json({ message: 'Compte restauré et désactivé. Vous pouvez ensuite le réactiver.' });
  });
  router.put('/settings', roles('admin'), async (req, res) => {
    const b = z
      .object({
        deliveryFee: z.number().int().min(0).max(100000),
        earnEvery: z.number().int().min(1).max(10000000),
        redeemPoints: z.number().int().min(1).max(10000),
        redeemValue: z.number().int().min(1).max(1000000),
        referralBonus: z.number().int().min(1).max(10000),
        pointValidityDays: z.number().int().min(1).max(3650),
        openingHours: z.string().trim().min(3).max(150),
        location: z.string().trim().min(3).max(150),
      })
      .strict()
      .parse(req.body);
    await db.transaction(async (tx) => {
      await tx.query('UPDATE restaurants SET settings=$1 WHERE id=$2', [
        JSON.stringify(b),
        req.restaurant.id,
      ]);
      await audit(tx, req.user.id, 'settings_updated', req.restaurant.id);
    });
    res.json({ settings: b });
  });
  return router;
}
