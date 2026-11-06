import { isEasyPay } from './easypay-client.js';
import { recordPaymentSimulation } from './payment-simulations.js';
import {
  initiateEasyPay,
  reconcileEasyPay,
  effectivePaymentMode,
  publicPayment,
} from './easypay.js';
import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { roles, phoneSchema } from './auth.js';
import {
  requireCondition,
  settings,
  calculateTotals,
  reservePoints,
  releasePoints,
  nextStatuses,
  rewardFulfilledOrder,
  audit,
} from './domain.js';

export async function orderDetails(db, id) {
  const {
    rows: [order],
  } = await db.query('SELECT * FROM orders WHERE id=$1', [id]);
  requireCondition(order, 404, 'Commande introuvable.');
  const { rows: items } = await db.query(
    'SELECT * FROM order_items WHERE order_id=$1 ORDER BY name',
    [id],
  );
  const { rows: payments } = await db.query(
    'SELECT * FROM payments WHERE order_id=$1 ORDER BY created_at DESC',
    [id],
  );
  const {
    rows: [review],
  } = await db.query('SELECT rating,message FROM reviews WHERE order_id=$1', [id]);
  return { ...order, items, payments: payments.map(publicPayment), review: review || null };
}
export function ordersRouter(db, config) {
  const router = Router();
  router.get('/', roles('student', 'employee', 'manager', 'admin'), async (req, res) => {
    const isStudent = req.user.role === 'student';
    const { rows } = await db.query(
      `SELECT id FROM orders WHERE restaurant_id=$1 ${isStudent ? 'AND user_id=$2' : ''} ORDER BY created_at DESC LIMIT 100`,
      isStudent ? [req.restaurant.id, req.user.id] : [req.restaurant.id],
    );
    const orders = [];
    for (const { id } of rows) orders.push(await orderDetails(db, id));
    res.json({ orders });
  });
  router.get('/:id', roles('student', 'employee', 'manager', 'admin'), async (req, res) => {
    const order = await orderDetails(db, req.params.id);
    requireCondition(
      order.restaurant_id === req.restaurant.id &&
        (req.user.role !== 'student' || order.user_id === req.user.id),
      404,
      'Commande introuvable.',
    );
    res.json({ order });
  });
  router.post('/', roles('student'), async (req, res) => {
    const body = z
      .object({
        requestKey: z.uuid(),
        items: z
          .array(
            z
              .object({ dishId: z.string().max(80), quantity: z.number().int().min(1).max(20) })
              .strict(),
          )
          .min(1)
          .max(30),
        service: z.enum(['onsite', 'delivery']),
        arrivalAt: z.iso.datetime({ offset: true }).optional(),
        address: z.string().trim().max(400).optional(),
        points: z.number().int().min(0).max(100000).default(0),
      })
      .strict()
      .parse(req.body);
    requireCondition(
      new Set(body.items.map((i) => i.dishId)).size === body.items.length,
      400,
      'Un article est présent plusieurs fois.',
    );
    const order = await db.transaction(async (tx) => {
      await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
      const {
        rows: [existing],
      } = await tx.query('SELECT id FROM orders WHERE user_id=$1 AND request_key=$2', [
        req.user.id,
        body.requestKey,
      ]);
      if (existing) return orderDetails(tx, existing.id);
      if (body.service === 'onsite') {
        const arrival = Date.parse(body.arrivalAt);
        requireCondition(
          Number.isFinite(arrival) && arrival > Date.now() && arrival < Date.now() + 7 * 86400000,
          400,
          'Choisissez une arrivée à venir, dans les 7 prochains jours.',
        );
      } else
        requireCondition(
          body.address?.length >= 8,
          400,
          'Précisez votre adresse et un repère pour la livraison.',
        );
      const items = [];
      for (const item of body.items) {
        const {
          rows: [dish],
        } = await tx.query(
          'SELECT * FROM dishes WHERE id=$1 AND restaurant_id=$2 AND archived=FALSE FOR UPDATE',
          [item.dishId, req.restaurant.id],
        );
        requireCondition(
          dish && dish.available,
          409,
          'Un article n’est plus disponible. Actualisez votre panier.',
        );
        items.push({ ...dish, quantity: item.quantity });
      }
      const rules = await settings(tx, req.restaurant.id);
      const totals = calculateTotals(items, body.service, body.points, rules);
      requireCondition(
        totals.total === 0 || effectivePaymentMode(config, req.restaurant.id) !== 'disabled',
        503,
        'Le paiement est temporairement indisponible. Votre commande n’a pas été créée et vos points sont conservés.',
      );
      const id = randomUUID();
      await tx.query(
        `INSERT INTO orders(id,restaurant_id,user_id,request_key,service,arrival_at,address,subtotal,discount,delivery_fee,total,points_spent,payment_status,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          id,
          req.restaurant.id,
          req.user.id,
          body.requestKey,
          body.service,
          body.service === 'onsite' ? body.arrivalAt : null,
          body.service === 'delivery' ? body.address : null,
          totals.subtotal,
          totals.discount,
          totals.deliveryFee,
          totals.total,
          body.points,
          totals.total === 0 ? 'paid' : 'pending',
          totals.total === 0 ? 'confirmed' : 'awaiting_payment',
        ],
      );
      for (const item of items)
        await tx.query(
          'INSERT INTO order_items(order_id,dish_id,name,price,quantity) VALUES($1,$2,$3,$4,$5)',
          [id, item.id, item.name, item.price, item.quantity],
        );
      await reservePoints(tx, req.user.id, id, body.points);
      await audit(tx, req.user.id, 'order_created', id);
      return orderDetails(tx, id);
    });
    res.status(201).json({ order });
  });
  router.post('/:id/cancel', roles('student', 'manager', 'admin'), async (req, res) => {
    await db.transaction(async (tx) => {
      const {
        rows: [order],
      } = await tx.query('SELECT * FROM orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE', [
        req.params.id,
        req.restaurant.id,
      ]);
      requireCondition(
        order && (req.user.role !== 'student' || order.user_id === req.user.id),
        404,
        'Commande introuvable.',
      );
      if (order.status === 'cancelled') return;
      requireCondition(
        order.status === 'awaiting_payment' && order.payment_status !== 'paid',
        409,
        'Seule une commande non payée peut être annulée ici. Contactez le restaurant pour un remboursement.',
      );
      const {
        rows: [activePayment],
      } = await tx.query(
        "SELECT id FROM payments WHERE order_id=$1 AND mode IN ('easypay-sandbox','easypay-live') AND status='pending'",
        [order.id],
      );
      requireCondition(
        !activePayment,
        409,
        'Un paiement Mobile Money est en cours. Vérifiez son résultat avant d’annuler.',
      );
      await releasePoints(tx, order.id);
      await tx.query(
        "UPDATE orders SET status='cancelled',payment_status='cancelled',updated_at=NOW() WHERE id=$1",
        [order.id],
      );
      await tx.query("UPDATE payments SET status='failed' WHERE order_id=$1 AND status='pending'", [
        order.id,
      ]);
      await audit(tx, req.user.id, 'order_cancelled', order.id);
    });
    res.json({ order: await orderDetails(db, req.params.id) });
  });
  router.patch('/:id/status', roles('employee', 'manager', 'admin'), async (req, res) => {
    const { status } = z
      .object({ status: z.enum(['preparing', 'ready', 'delivering', 'served', 'delivered']) })
      .strict()
      .parse(req.body);
    await db.transaction(async (tx) => {
      const {
        rows: [order],
      } = await tx.query('SELECT * FROM orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE', [
        req.params.id,
        req.restaurant.id,
      ]);
      requireCondition(order, 404, 'Commande introuvable.');
      if (order.status === status) return;
      requireCondition(
        nextStatuses(order).includes(status) && order.payment_status === 'paid',
        409,
        'Cette étape est incompatible avec l’avancement de la commande.',
      );
      await tx.query('UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2', [
        status,
        order.id,
      ]);
      if (['served', 'delivered'].includes(status)) await rewardFulfilledOrder(tx, order);
      await audit(tx, req.user.id, `order_${status}`, order.id);
    });
    res.json({ order: await orderDetails(db, req.params.id) });
  });
  router.post('/:id/payments', roles('student'), async (req, res) => {
    const body = z
      .union([
        z.object({ flow: z.literal('portal') }).strict(),
        z.object({ phone: phoneSchema, operator: z.enum(['m-pesa', 'airtel', 'orange']) }).strict(),
      ])
      .parse(req.body);
    requireCondition(
      body.flow !== 'portal' || isEasyPay(config.paymentMode),
      409,
      'Le portail nécessite un mode EasyPay actif.',
    );
    if (isEasyPay(config.paymentMode)) {
      const payment = await initiateEasyPay(db, config, req, body);
      return res.status(201).json({ payment });
    }
    requireCondition(
      config.paymentMode === 'demo',
      503,
      'EasyPay réel n’est pas encore activé. Aucun débit n’a été demandé.',
    );
    const payment = await db.transaction(async (tx) => {
      const {
        rows: [order],
      } = await tx.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE', [
        req.params.id,
        req.user.id,
      ]);
      requireCondition(order, 404, 'Commande introuvable.');
      requireCondition(
        order.status === 'awaiting_payment' && order.payment_status !== 'paid',
        409,
        'Cette commande ne peut plus être payée.',
      );
      const {
        rows: [pending],
      } = await tx.query("SELECT * FROM payments WHERE order_id=$1 AND status='pending'", [
        order.id,
      ]);
      if (pending) return pending;
      const {
        rows: [created],
      } = await tx.query(
        "INSERT INTO payments(id,order_id,mode,phone,operator) VALUES($1,$2,'demo',$3,$4) RETURNING *",
        [randomUUID(), order.id, body.phone, body.operator],
      );
      await tx.query("UPDATE orders SET payment_status='pending',updated_at=NOW() WHERE id=$1", [
        order.id,
      ]);
      return created;
    });
    res.status(201).json({ payment });
  });
  router.post(
    '/:id/payments/:paymentId/check',
    roles('student', 'manager', 'admin'),
    async (req, res) => {
      requireCondition(isEasyPay(config.paymentMode), 404, 'Action indisponible.');
      const {
        rows: [payment],
      } = await db.query(
        'SELECT p.id FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=$1 AND o.id=$2 AND o.restaurant_id=$3 AND ($4 OR o.user_id=$5)',
        [
          req.params.paymentId,
          req.params.id,
          req.restaurant.id,
          req.user.role !== 'student',
          req.user.id,
        ],
      );
      requireCondition(payment, 404, 'Paiement introuvable.');
      await reconcileEasyPay(db, config, payment.id);
      res.json({ order: await orderDetails(db, req.params.id) });
    },
  );
  router.post('/:id/payments/:paymentId/simulate', roles('student'), async (req, res) => {
    requireCondition(
      config.paymentMode === 'demo' && !config.production,
      404,
      'Action indisponible.',
    );
    const { outcome } = z
      .object({ outcome: z.enum(['paid', 'failed']) })
      .strict()
      .parse(req.body);
    await db.transaction(async (tx) => {
      const {
        rows: [order],
      } = await tx.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE', [
        req.params.id,
        req.user.id,
      ]);
      requireCondition(order, 404, 'Commande introuvable.');
      const {
        rows: [payment],
      } = await tx.query(
        'SELECT * FROM payments WHERE id=$1 AND order_id=$2 AND mode=$3 FOR UPDATE',
        [req.params.paymentId, order.id, 'demo'],
      );
      requireCondition(payment, 404, 'Paiement introuvable.');
      if (payment.status === outcome) return;
      requireCondition(
        payment.status === 'pending' && order.status === 'awaiting_payment',
        409,
        'Cette tentative est déjà terminée.',
      );
      await tx.query('UPDATE payments SET status=$1 WHERE id=$2', [outcome, payment.id]);
      await tx.query('UPDATE orders SET payment_status=$1,status=$2,updated_at=NOW() WHERE id=$3', [
        outcome,
        outcome === 'paid' ? 'confirmed' : 'awaiting_payment',
        order.id,
      ]);
      await audit(tx, req.user.id, `demo_payment_${outcome}`, payment.id);
      await recordPaymentSimulation(tx, order, outcome, req.user.id);
    });
    res.json({ order: await orderDetails(db, req.params.id) });
  });
  router.post('/:id/review', roles('student'), async (req, res) => {
    const body = z
      .object({
        rating: z.number().int().min(1).max(5),
        message: z.string().trim().min(3).max(1000),
      })
      .strict()
      .parse(req.body);
    await db.transaction(async (tx) => {
      const {
        rows: [order],
      } = await tx.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2', [
        req.params.id,
        req.user.id,
      ]);
      requireCondition(order, 404, 'Commande introuvable.');
      requireCondition(
        ['served', 'delivered'].includes(order.status),
        409,
        'Vous pourrez laisser un avis après le service ou la livraison.',
      );
      await tx.query('INSERT INTO reviews(order_id,user_id,rating,message) VALUES($1,$2,$3,$4)', [
        order.id,
        req.user.id,
        body.rating,
        body.message,
      ]);
    });
    res.status(201).json({ message: 'Merci pour votre avis !' });
  });
  return router;
}
