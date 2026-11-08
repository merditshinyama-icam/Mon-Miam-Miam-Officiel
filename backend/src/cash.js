import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { roles } from './auth.js';
import { requireCondition, audit } from './domain.js';
import { settleOrder } from './settlements.js';
import { orderDetails } from './orders.js';

export async function requestCash(tx, order, actor) {
  requireCondition(
    order.status === 'awaiting_payment' && order.payment_status !== 'paid',
    409,
    'Cette commande ne peut plus être payée.',
  );
  const {
    rows: [pending],
  } = await tx.query("SELECT * FROM payments WHERE order_id=$1 AND status='pending' FOR UPDATE", [
    order.id,
  ]);
  if (pending) {
    requireCondition(
      pending.mode === 'cash',
      409,
      'Une tentative Mobile Money est encore en attente. Faites vérifier son statut avant de changer de moyen de paiement.',
    );
    return pending;
  }
  const {
    rows: [payment],
  } = await tx.query(
    `INSERT INTO payments(id,order_id,mode,phone,operator,amount,currency)
   VALUES($1,$2,'cash','','cash',$3,'CDF') RETURNING *`,
    [randomUUID(), order.id, order.total],
  );
  await tx.query(
    "UPDATE orders SET payment_method='cash',is_simulated=FALSE,updated_at=NOW() WHERE id=$1",
    [order.id],
  );
  await audit(tx, actor, 'cash_payment_requested', payment.id);
  return payment;
}

export function cashRouter(db) {
  const router = Router();
  router.post('/:id/cash', roles('student'), async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body || {});
    await db.transaction(async (tx) => {
      const {
        rows: [order],
      } = await tx.query(
        'SELECT * FROM orders WHERE id=$1 AND user_id=$2 AND restaurant_id=$3 FOR UPDATE',
        [req.params.id, req.user.id, req.restaurant.id],
      );
      requireCondition(order, 404, 'Commande introuvable.');
      await requestCash(tx, order, req.user.id);
    });
    res.json({ order: await orderDetails(db, req.params.id) });
  });
  router.post('/:id/cash/confirm', roles('employee', 'manager', 'admin'), async (req, res) => {
    const body = z
      .object({ received: z.literal(true), amount: z.number().int().min(0) })
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
      requireCondition(
        body.amount === order.total,
        409,
        'Le montant reçu doit correspondre exactement au total de la commande.',
      );
      const {
        rows: [payment],
      } = await tx.query(
        "SELECT * FROM payments WHERE order_id=$1 AND mode='cash' AND status IN ('pending','paid') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        [order.id],
      );
      requireCondition(payment, 409, 'Le client doit d’abord choisir le paiement en espèces.');
      if (payment.status === 'paid' && order.payment_status === 'paid') return;
      requireCondition(
        order.status === 'awaiting_payment' && order.payment_status !== 'paid',
        409,
        'Cette commande ne peut plus être encaissée.',
      );
      await tx.query(
        "UPDATE payments SET status='paid',confirmed_by=$1,confirmed_at=NOW() WHERE id=$2",
        [req.user.id, payment.id],
      );
      await settleOrder(tx, order.id, 'cash', false, req.user.id);
      await audit(tx, req.user.id, 'cash_received', payment.id);
    });
    res.json({ order: await orderDetails(db, req.params.id) });
  });
  return router;
}
