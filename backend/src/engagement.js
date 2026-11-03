import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { roles } from './auth.js';
import { AppError, requireCondition, audit, balance, settings, addPoints } from './domain.js';

const announcementSchema = z
  .object({
    kind: z.enum(['promotion', 'event', 'game']),
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().min(10).max(2000),
    image: z
      .enum([
        '/assets/moambe.webp',
        '/assets/poisson.webp',
        '/assets/bissap.webp',
        '/assets/samossas.webp',
      ])
      .optional(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    published: z.boolean(),
    capacity: z.number().int().min(1).max(10000).nullable(),
  })
  .strict()
  .refine((b) => new Date(b.endsAt) > new Date(b.startsAt), 'La fin doit suivre le début.')
  .refine(
    (b) => b.kind !== 'promotion' || b.capacity === null,
    'Une promotion ne limite pas les inscriptions.',
  );

export function engagementRouter(db) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 9 },
  });
  async function parseAnnouncement(req, existing) {
    const raw = req.is('multipart/form-data')
      ? {
          ...req.body,
          published: req.body.published === 'true',
          capacity: req.body.capacity ? Number(req.body.capacity) : null,
        }
      : req.body;
    const b = announcementSchema.parse(raw);
    b.image = b.image || existing?.image || '/assets/moambe.webp';
    if (req.file) {
      try {
        const image = sharp(req.file.buffer, { limitInputPixels: 16000000, animated: false });
        const meta = await image.metadata();
        requireCondition(
          ['jpeg', 'png', 'webp'].includes(meta.format),
          400,
          'Choisissez une affiche JPEG, PNG ou WebP.',
        );
        const buffer = await image
          .rotate()
          .resize(1200, 1500, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        b.image = `data:image/webp;base64,${buffer.toString('base64')}`;
      } catch (e) {
        if (e instanceof AppError) throw e;
        throw new AppError(400, 'Affiche illisible ou dimensions trop grandes.');
      }
    }
    return b;
  }
  router.get('/announcements', async (req, res) => {
    const { rows } = await db.query(
      `SELECT a.id,a.kind,a.title,a.description,a.image,a.starts_at,a.ends_at,a.capacity,
      (SELECT COUNT(*)::integer FROM participations p WHERE p.announcement_id=a.id) AS participants,
      EXISTS(SELECT 1 FROM participations p WHERE p.announcement_id=a.id AND p.user_id=$2) AS joined
      FROM announcements a WHERE a.restaurant_id=$1 AND a.published=TRUE AND a.archived=FALSE
      AND a.ends_at>NOW() ORDER BY a.starts_at,a.id LIMIT 100`,
      [req.restaurant.id, req.user?.id || null],
    );
    res.json({ announcements: rows });
  });
  router.get('/announcements/manage', roles('admin'), async (req, res) => {
    const { rows } = await db.query(
      `SELECT a.*,
      (SELECT COUNT(*)::integer FROM participations p WHERE p.announcement_id=a.id) AS participants
      FROM announcements a WHERE a.restaurant_id=$1 AND a.archived=FALSE ORDER BY a.created_at DESC LIMIT 100`,
      [req.restaurant.id],
    );
    res.json({ announcements: rows });
  });
  router.post('/announcements', roles('admin'), upload.single('photo'), async (req, res) => {
    const b = await parseAnnouncement(req);
    const announcement = await db.transaction(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO announcements(id,restaurant_id,kind,title,description,image,starts_at,ends_at,published,capacity)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          randomUUID(),
          req.restaurant.id,
          b.kind,
          b.title,
          b.description,
          b.image,
          b.startsAt,
          b.endsAt,
          b.published,
          b.capacity,
        ],
      );
      await audit(tx, req.user.id, 'announcement_created', rows[0].id);
      return rows[0];
    });
    res.status(201).json({ announcement });
  });
  router.put('/announcements/:id', roles('admin'), upload.single('photo'), async (req, res) => {
    const {
      rows: [existing],
    } = await db.query(
      'SELECT * FROM announcements WHERE id=$1 AND restaurant_id=$2 AND archived=FALSE',
      [req.params.id, req.restaurant.id],
    );
    requireCondition(existing, 404, 'Affiche introuvable.');
    const b = await parseAnnouncement(req, existing);
    const announcement = await db.transaction(async (tx) => {
      const {
        rows: [current],
      } = await tx.query(
        'SELECT * FROM announcements WHERE id=$1 AND restaurant_id=$2 AND archived=FALSE FOR UPDATE',
        [req.params.id, req.restaurant.id],
      );
      requireCondition(current, 404, 'Affiche introuvable.');
      const {
        rows: [count],
      } = await tx.query(
        'SELECT COUNT(*)::integer AS total FROM participations WHERE announcement_id=$1',
        [current.id],
      );
      requireCondition(
        !count.total ||
          (b.kind === current.kind && (b.capacity === null || b.capacity >= count.total)),
        409,
        'Conservez le type et une capacité suffisante pour les inscrits.',
      );
      const { rows } = await tx.query(
        `UPDATE announcements SET kind=$1,title=$2,description=$3,image=$4,starts_at=$5,ends_at=$6,published=$7,capacity=$8 WHERE id=$9 RETURNING *`,
        [
          b.kind,
          b.title,
          b.description,
          b.image,
          b.startsAt,
          b.endsAt,
          b.published,
          b.capacity,
          current.id,
        ],
      );
      await audit(tx, req.user.id, 'announcement_updated', current.id);
      return rows[0];
    });
    res.json({ announcement });
  });
  router.delete('/announcements/:id', roles('admin'), async (req, res) => {
    await db.transaction(async (tx) => {
      const { rows } = await tx.query(
        'UPDATE announcements SET archived=TRUE,published=FALSE WHERE id=$1 AND restaurant_id=$2 RETURNING id',
        [req.params.id, req.restaurant.id],
      );
      requireCondition(rows[0], 404, 'Affiche introuvable.');
      await audit(tx, req.user.id, 'announcement_archived', rows[0].id);
    });
    res.status(204).end();
  });
  router.post('/announcements/:id/participation', roles('student'), async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body || {});
    await db.transaction(async (tx) => {
      const {
        rows: [a],
      } = await tx.query(
        'SELECT * FROM announcements WHERE id=$1 AND restaurant_id=$2 FOR UPDATE',
        [req.params.id, req.restaurant.id],
      );
      requireCondition(a && a.published && !a.archived, 404, 'Événement introuvable.');
      requireCondition(
        a.kind !== 'promotion' && new Date(a.ends_at) > new Date(),
        409,
        'Les inscriptions sont fermées.',
      );
      const {
        rows: [count],
      } = await tx.query(
        `SELECT COUNT(*)::integer AS total, COUNT(*) FILTER(WHERE user_id=$2)::integer AS joined FROM participations WHERE announcement_id=$1`,
        [a.id, req.user.id],
      );
      if (count.joined) return;
      requireCondition(
        a.capacity === null || count.total < a.capacity,
        409,
        'Toutes les places sont prises.',
      );
      await tx.query('INSERT INTO participations(announcement_id,user_id) VALUES($1,$2)', [
        a.id,
        req.user.id,
      ]);
    });
    res.json({ message: 'Votre inscription est confirmée.' });
  });
  router.delete('/announcements/:id/participation', roles('student'), async (req, res) => {
    await db.transaction(async (tx) => {
      const {
        rows: [a],
      } = await tx.query(
        'SELECT id FROM announcements WHERE id=$1 AND restaurant_id=$2 FOR UPDATE',
        [req.params.id, req.restaurant.id],
      );
      requireCondition(a, 404, 'Événement introuvable.');
      await tx.query('DELETE FROM participations WHERE announcement_id=$1 AND user_id=$2', [
        a.id,
        req.user.id,
      ]);
    });
    res.status(204).end();
  });
  router.get('/announcements/:id/participants', roles('admin'), async (req, res) => {
    const {
      rows: [a],
    } = await db.query('SELECT id FROM announcements WHERE id=$1 AND restaurant_id=$2', [
      req.params.id,
      req.restaurant.id,
    ]);
    requireCondition(a, 404, 'Événement introuvable.');
    const { rows } = await db.query(
      `SELECT u.name,u.email,p.created_at FROM participations p JOIN users u ON u.id=p.user_id WHERE p.announcement_id=$1 ORDER BY p.created_at,u.id LIMIT 10000`,
      [a.id],
    );
    res.json({ participants: rows });
  });
  router.get('/students', roles('admin'), async (req, res) => {
    const q = z.string().trim().min(2).max(80).parse(req.query.q);
    const { rows } = await db.query(
      `SELECT u.id,u.name,u.email,
      (SELECT COALESCE(SUM(remaining),0)::integer FROM point_lots p WHERE p.user_id=u.id AND expires_at>NOW()) AS balance
      FROM users u WHERE u.restaurant_id=$1 AND u.role='student' AND u.active=TRUE
      AND (strpos(lower(u.name),lower($2))>0 OR strpos(lower(u.email),lower($2))>0) ORDER BY u.name,u.id LIMIT 30`,
      [req.restaurant.id, q],
    );
    res.json({ students: rows });
  });
  router.get('/point-adjustments', roles('admin'), async (req, res) => {
    const userId = z.uuid().parse(req.query.userId);
    const { rows } = await db.query(
      `SELECT a.id,a.delta,a.reason,a.created_at,u.name AS actor FROM point_adjustments a JOIN users u ON u.id=a.actor_id WHERE a.restaurant_id=$1 AND a.user_id=$2 ORDER BY a.created_at DESC,a.id LIMIT 100`,
      [req.restaurant.id, userId],
    );
    res.json({ adjustments: rows });
  });
  router.post('/point-adjustments', roles('admin'), async (req, res) => {
    const b = z
      .object({
        userId: z.uuid(),
        requestKey: z.uuid(),
        delta: z
          .number()
          .int()
          .min(-10000)
          .max(10000)
          .refine((v) => v !== 0),
        reason: z.string().trim().min(10).max(500),
      })
      .strict()
      .parse(req.body);
    const result = await db.transaction(async (tx) => {
      const {
        rows: [student],
      } = await tx.query(
        "SELECT id FROM users WHERE id=$1 AND restaurant_id=$2 AND role='student' AND active=TRUE FOR UPDATE",
        [b.userId, req.restaurant.id],
      );
      requireCondition(student, 404, 'Étudiant introuvable.');
      const {
        rows: [previous],
      } = await tx.query('SELECT * FROM point_adjustments WHERE actor_id=$1 AND request_key=$2', [
        req.user.id,
        b.requestKey,
      ]);
      if (previous) {
        requireCondition(
          previous.user_id === b.userId &&
            previous.delta === b.delta &&
            previous.reason === b.reason,
          409,
          'Cette demande a déjà servi à une autre correction.',
        );
        return { adjustment: previous, balance: await balance(tx, b.userId) };
      }
      const id = randomUUID();
      if (b.delta > 0) {
        const rules = await settings(tx, req.restaurant.id);
        await addPoints(tx, b.userId, b.delta, `adjustment:${id}`, rules.pointValidityDays);
      } else {
        const { rows: lots } = await tx.query(
          'SELECT id,remaining FROM point_lots WHERE user_id=$1 AND remaining>0 AND expires_at>NOW() ORDER BY expires_at,id FOR UPDATE',
          [b.userId],
        );
        requireCondition(
          lots.reduce((n, l) => n + l.remaining, 0) >= -b.delta,
          409,
          'Points disponibles insuffisants. Les points réservés ne sont pas modifiés.',
        );
        let rest = -b.delta;
        for (const lot of lots) {
          if (!rest) break;
          const amount = Math.min(rest, lot.remaining);
          rest -= amount;
          await tx.query('UPDATE point_lots SET remaining=remaining-$1 WHERE id=$2', [
            amount,
            lot.id,
          ]);
        }
      }
      const {
        rows: [adjustment],
      } = await tx.query(
        'INSERT INTO point_adjustments(id,restaurant_id,user_id,actor_id,request_key,delta,reason) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [id, req.restaurant.id, b.userId, req.user.id, b.requestKey, b.delta, b.reason],
      );
      await audit(tx, req.user.id, 'points_adjusted', id);
      return { adjustment, balance: await balance(tx, b.userId) };
    });
    res.json(result);
  });
  return router;
}
