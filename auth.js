import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { AppError, RESTAURANT, THEMES, publicUser, requireCondition, audit } from './domain.js';
import { hashPassword, verifyPassword, token, digest, cookieToken } from './security.js';

export const passwordSchema = z
  .string()
  .min(10, '10 caractères minimum.')
  .max(128)
  .regex(/[A-Z]/, 'Une majuscule est nécessaire.')
  .regex(/\d/, 'Un chiffre est nécessaire.');
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .transform((v) => (/^0\d{9}$/.test(v) ? `+243${v.slice(1)}` : v))
  .pipe(z.string().regex(/^\+243\d{9}$/, 'Utilisez le format +243 suivi de 9 chiffres.'));
export const emailSchema = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const nameSchema = z.string().trim().min(2).max(80);
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Trop de tentatives. Réessayez dans 15 minutes.' },
});
const cookieOptions = (production) => ({
  httpOnly: true,
  secure: production,
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
});

export async function startSession(db, config, res, user) {
  const secret = token();
  await db.query(
    `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')`,
    [digest(secret), user.id],
  );
  res.cookie('mmm_session', secret, cookieOptions(config.production));
  return publicUser(user);
}
export function authRouter(db, config) {
  const router = Router();
  const dummyHash = hashPassword(token());
  router.post('/register', authLimit, async (req, res) => {
    const body = z
      .object({
        name: nameSchema,
        email: emailSchema,
        phone: phoneSchema,
        password: passwordSchema,
        referralCode: z.string().trim().max(40).optional(),
        deliveryAddress: z.string().trim().max(400).default(''),
      })
      .strict()
      .parse(req.body);
    const hash = await hashPassword(body.password);
    const user = await db.transaction(async (tx) => {
      let referrer = null;
      if (body.referralCode) {
        const { rows } = await tx.query(
          'SELECT id FROM users WHERE referral_code=$1 AND active=TRUE AND role=$2 AND restaurant_id=$3',
          [body.referralCode.toUpperCase(), 'student', req.restaurant.id],
        );
        requireCondition(rows[0], 400, 'Code de parrainage inconnu.');
        referrer = rows[0].id;
      }
      const { rows } = await tx.query(
        `INSERT INTO users(id,restaurant_id,email,name,phone,password_hash,role,referral_code,referrer_id)
        VALUES($1,$2,$3,$4,$5,$6,'student',$7,$8) RETURNING *`,
        [
          randomUUID(),
          req.restaurant.id,
          body.email,
          body.name,
          body.phone,
          hash,
          `MIAM-${randomBytes(5).toString('hex').toUpperCase()}`,
          referrer,
        ],
      );
      return rows[0];
    });
    await db.query('UPDATE users SET delivery_address=$1 WHERE id=$2', [
      body.deliveryAddress,
      user.id,
    ]);
    user.delivery_address = body.deliveryAddress;
    if (req.restaurant.branding.defaultTheme) {
      await db.query('UPDATE users SET theme=$1 WHERE id=$2', [
        req.restaurant.branding.defaultTheme,
        user.id,
      ]);
      user.theme = req.restaurant.branding.defaultTheme;
    }
    res.status(201).json({ user: await startSession(db, config, res, user) });
  });
  router.post('/login', authLimit, async (req, res) => {
    const body = z
      .object({ email: emailSchema, password: z.string().min(1).max(128) })
      .strict()
      .parse(req.body);
    const {
      rows: [user],
    } = await db.query('SELECT * FROM users WHERE email=$1 AND restaurant_id=$2', [
      body.email,
      req.restaurant.id,
    ]);
    // Also perform a password hash for unknown accounts to avoid a fast account-existence check.
    const hash = user?.password_hash || (await dummyHash);
    const valid = await verifyPassword(body.password, hash);
    requireCondition(user?.active && valid, 401, 'Adresse e-mail ou mot de passe incorrect.');
    res.json({ user: await startSession(db, config, res, user) });
  });
  router.post('/logout', async (req, res) => {
    const secret = cookieToken(req);
    if (secret) await db.query('DELETE FROM sessions WHERE token_hash=$1', [digest(secret)]);
    res.clearCookie('mmm_session', cookieOptions(config.production));
    res.status(204).end();
  });
  router.get('/me', requireAuth, async (req, res) => res.json({ user: publicUser(req.user) }));
  router.patch('/me', requireAuth, async (req, res) => {
    const body = z
      .object({
        name: nameSchema,
        phone: phoneSchema,
        theme: z.enum(THEMES),
        dark: z.boolean(),
        public_ranking: z.boolean(),
        deliveryAddress: z.string().trim().max(400).optional(),
      })
      .strict()
      .parse(req.body);
    const {
      rows: [user],
    } = await db.query(
      'UPDATE users SET name=$1,phone=$2,theme=$3,dark=$4,public_ranking=$5,delivery_address=COALESCE($7,delivery_address) WHERE id=$6 RETURNING *',
      [
        body.name,
        body.phone,
        body.theme,
        body.dark,
        body.public_ranking,
        req.user.id,
        body.deliveryAddress ?? null,
      ],
    );
    res.json({ user: publicUser(user) });
  });
  router.post('/me/photo', requireAuth, upload.single('photo'), async (req, res) => {
    requireCondition(req.file, 400, 'Choisissez une image JPEG, PNG ou WebP.');
    let photo;
    try {
      const input = sharp(req.file.buffer, { limitInputPixels: 16000000, animated: false });
      const metadata = await input.metadata();
      requireCondition(
        ['jpeg', 'png', 'webp'].includes(metadata.format),
        400,
        'Format non accepté. Choisissez JPEG, PNG ou WebP.',
      );
      const output = await input
        .rotate()
        .resize(256, 256, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();
      photo = `data:image/webp;base64,${output.toString('base64')}`;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(400, 'Image illisible ou dimensions trop grandes.');
    }
    await db.query('UPDATE users SET photo=$1 WHERE id=$2', [photo, req.user.id]);
    res.json({ photo });
  });
  router.delete('/me/photo', requireAuth, async (req, res) => {
    await db.query('UPDATE users SET photo=NULL WHERE id=$1', [req.user.id]);
    res.status(204).end();
  });
  router.post('/forgot-password', authLimit, async (req, res) => {
    const { email } = z.object({ email: emailSchema }).strict().parse(req.body);
    requireCondition(
      !config.production || config.mailer,
      503,
      'La récupération par e-mail n’est pas encore configurée. Contactez la direction.',
    );
    const {
      rows: [user],
    } = await db.query('SELECT id FROM users WHERE email=$1 AND active=TRUE AND restaurant_id=$2', [
      email,
      req.restaurant.id,
    ]);
    if (user && (!config.mailTestRecipient || email === config.mailTestRecipient)) {
      const secret = token();
      await db.transaction(async (tx) => {
        await tx.query('DELETE FROM password_resets WHERE user_id=$1', [user.id]);
        await tx.query(
          `INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 minutes')`,
          [digest(secret), user.id],
        );
      });
      const url = `${config.origin}${req.restaurant.id === RESTAURANT ? '' : `/r/${req.restaurant.slug}`}/reset?token=${secret}`;
      if (config.mailer) {
        try {
          await config.mailer({ to: email, url });
        } catch {
          await db.query('DELETE FROM password_resets WHERE token_hash=$1', [digest(secret)]);
          console.error('Envoi de récupération indisponible.');
        }
      } else {
        const directory = path.join(config.dataDir, 'outbox');
        await mkdir(directory, { recursive: true });
        await writeFile(
          path.join(directory, `${randomUUID()}.json`),
          JSON.stringify(
            {
              to: email,
              subject: 'Réinitialisation Mon Miam Miam',
              url,
              expiresInMinutes: 30,
            },
            null,
            2,
          ),
        );
      }
    }
    res.json({
      message: config.mailer
        ? 'Si ce compte existe, vous recevrez un lien valable 30 minutes. Vérifiez aussi les courriers indésirables.'
        : 'Si ce compte existe, un lien valable 30 minutes est préparé. En local, consultez data/outbox.',
    });
  });
  router.post('/reset-password', authLimit, async (req, res) => {
    const body = z
      .object({ token: z.string().length(64), password: passwordSchema })
      .strict()
      .parse(req.body);
    const hash = await hashPassword(body.password);
    await db.transaction(async (tx) => {
      const {
        rows: [reset],
      } = await tx.query(
        'DELETE FROM password_resets WHERE token_hash=$1 AND expires_at>NOW() AND user_id IN (SELECT id FROM users WHERE restaurant_id=$2) RETURNING user_id',
        [digest(body.token), req.restaurant.id],
      );
      requireCondition(reset, 400, 'Lien expiré ou déjà utilisé.');
      await tx.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, reset.user_id]);
      await tx.query('DELETE FROM sessions WHERE user_id=$1', [reset.user_id]);
      await audit(tx, reset.user_id, 'password_reset', reset.user_id);
    });
    res.json({ message: 'Mot de passe modifié. Vous pouvez vous connecter.' });
  });
  return router;
}
export async function loadUser(db, req, _res, next) {
  try {
    const secret = cookieToken(req);
    if (secret && /^[a-f0-9]{64}$/.test(secret)) {
      const { rows } = await db.query(
        `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE AND u.restaurant_id=$2`,
        [digest(secret), req.restaurant.id],
      );
      req.user = rows[0];
    }
    next();
  } catch (error) {
    next(error);
  }
}
export function requireAuth(req, _res, next) {
  if (!req.user) return next(new AppError(401, 'Connectez-vous pour continuer.'));
  next();
}
export const roles =
  (...allowed) =>
  (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'Connectez-vous pour continuer.'));
    if (!allowed.includes(req.user.role))
      return next(new AppError(403, 'Cette action n’est pas autorisée pour votre compte.'));
    next();
  };
