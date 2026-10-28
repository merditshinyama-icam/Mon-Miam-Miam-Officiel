import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { randomUUID, randomBytes } from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
import {
  DEFAULT_SETTINGS,
  RESTAURANT,
  THEMES,
  requireCondition,
  audit,
  AppError,
} from './domain.js';
import { emailSchema, phoneSchema, passwordSchema, roles, startSession } from './auth.js';
import { hashPassword } from './security.js';

const slugSchema = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Utilisez des lettres minuscules, chiffres et tirets.');
const text = (max = 150) => z.string().trim().min(2).max(max);
const brandingSchema = z
  .object({
    name: text(80),
    authTitle: text(120),
    authSubtitle: text(200),
    heroTitle: text(120),
    defaultTheme: z.enum(THEMES),
    contactEmail: z.union([z.literal(''), emailSchema]),
    contactPhone: z.union([z.literal(''), phoneSchema]),
  })
  .strict();
export const restaurantPath = (restaurant) =>
  restaurant.id === RESTAURANT ? '' : `/r/${restaurant.slug}`;
export const publicRestaurant = ({ id, name, slug, branding }) => ({ id, name, slug, branding });
export async function resolveRestaurant(db, req, _res, next) {
  try {
    const slug = req.headers['x-restaurant-slug'];
    if (slug) slugSchema.parse(slug);
    const {
      rows: [restaurant],
    } = await db.query(
      slug ? 'SELECT * FROM restaurants WHERE slug=$1' : 'SELECT * FROM restaurants WHERE id=$1',
      [slug || RESTAURANT],
    );
    requireCondition(restaurant, 404, 'Restaurant introuvable. Vérifiez le lien utilisé.');
    req.restaurant = restaurant;
    next();
  } catch (error) {
    next(error);
  }
}
export function restaurantsRouter(db, config) {
  const router = Router();
  router.get('/restaurants', async (_req, res) => {
    const { rows } = await db.query(
      `SELECT id,name,slug,settings->>'location' AS location,
       settings->>'openingHours' AS opening_hours,branding->>'logo' AS logo,
       branding->>'coverImage' AS cover FROM restaurants ORDER BY LOWER(name),id`,
    );
    res.json({ restaurants: rows.map((r) => ({ ...r, path: restaurantPath(r) })) });
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  });
  router.post(
    '/restaurants',
    rateLimit({
      windowMs: 3600000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Trop de créations de restaurants. Réessayez plus tard.' },
    }),
    async (req, res) => {
      const body = z
        .object({
          restaurantName: text(80),
          slug: slugSchema,
          location: text(),
          openingHours: text(),
          name: text(80),
          email: emailSchema,
          phone: phoneSchema,
          password: passwordSchema,
        })
        .strict()
        .parse(req.body);
      const hash = await hashPassword(body.password);
      const result = await db.transaction(async (tx) => {
        const restaurantId = randomUUID();
        const {
          rows: [restaurant],
        } = await tx.query(
          'INSERT INTO restaurants(id,name,slug,settings,branding) VALUES($1,$2,$3,$4,$5) RETURNING *',
          [
            restaurantId,
            body.restaurantName,
            body.slug,
            JSON.stringify({
              ...DEFAULT_SETTINGS,
              location: body.location,
              openingHours: body.openingHours,
            }),
            JSON.stringify({
              authTitle: 'Les bons repas.\nLes bons moments.',
              authSubtitle: 'Votre pause étudiante, tout simplement.',
              heroTitle: 'Bien manger,\nbien étudier.',
              defaultTheme: 'official',
              contactEmail: '',
              contactPhone: '',
            }),
          ],
        );
        const {
          rows: [user],
        } = await tx.query(
          `INSERT INTO users(id,restaurant_id,email,name,phone,password_hash,role,referral_code)
        VALUES($1,$2,$3,$4,$5,$6,'admin',$7) RETURNING *`,
          [
            randomUUID(),
            restaurantId,
            body.email,
            body.name,
            body.phone,
            hash,
            `ADMIN-${randomBytes(6).toString('hex')}`,
          ],
        );
        await audit(tx, user.id, 'restaurant_created', restaurantId);
        return { restaurant, user };
      });
      const user = await startSession(db, config, res, result.user);
      res.status(201).json({
        restaurant: publicRestaurant(result.restaurant),
        user,
        path: restaurantPath(result.restaurant),
      });
    },
  );
  router.put('/branding', roles('admin'), async (req, res) => {
    const { name, ...branding } = brandingSchema.parse(req.body);
    const restaurant = await db.transaction(async (tx) => {
      const {
        rows: [updated],
      } = await tx.query(
        'UPDATE restaurants SET name=$1,branding=branding || $2::jsonb WHERE id=$3 RETURNING *',
        [name, JSON.stringify(branding), req.restaurant.id],
      );
      await audit(tx, req.user.id, 'restaurant_branding_updated', updated.id);
      return updated;
    });
    res.json({ restaurant: publicRestaurant(restaurant) });
  });
  router.post(
    '/branding/images/:slot',
    roles('admin'),
    upload.single('image'),
    async (req, res) => {
      const slot = z.enum(['logo', 'authImage', 'coverImage']).parse(req.params.slot);
      requireCondition(req.file, 400, 'Choisissez une image JPEG, PNG ou WebP.');
      let image;
      try {
        const input = sharp(req.file.buffer, { limitInputPixels: 16000000, animated: false });
        const meta = await input.metadata();
        requireCondition(
          ['jpeg', 'png', 'webp'].includes(meta.format),
          400,
          'Format non accepté. Choisissez JPEG, PNG ou WebP.',
        );
        const buffer = await input
          .rotate()
          .resize(slot === 'logo' ? 256 : 1200, slot === 'logo' ? 256 : 900, {
            fit: slot === 'logo' ? 'contain' : 'cover',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 80 })
          .toBuffer();
        image = `data:image/webp;base64,${buffer.toString('base64')}`;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(400, 'Image illisible ou dimensions trop grandes.');
      }
      const {
        rows: [restaurant],
      } = await db.query(
        'UPDATE restaurants SET branding=branding || $1::jsonb WHERE id=$2 RETURNING *',
        [JSON.stringify({ [slot]: image }), req.restaurant.id],
      );
      res.json({ restaurant: publicRestaurant(restaurant) });
    },
  );
  router.delete('/branding/images/:slot', roles('admin'), async (req, res) => {
    const slot = z.enum(['logo', 'authImage', 'coverImage']).parse(req.params.slot);
    const {
      rows: [restaurant],
    } = await db.query('UPDATE restaurants SET branding=branding-$1 WHERE id=$2 RETURNING *', [
      slot,
      req.restaurant.id,
    ]);
    res.json({ restaurant: publicRestaurant(restaurant) });
  });
  return router;
}
