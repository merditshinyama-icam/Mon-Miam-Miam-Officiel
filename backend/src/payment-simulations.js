import { Router } from 'express';
import { z } from 'zod';
import { roles } from './auth.js';
import { randomUUID } from 'node:crypto';
import { settleOrder } from './settlements.js';
import { addPoints, audit, balance, requireCondition, settings } from './domain.js';

// Le propriétaire de la commande est verrouillé par la route appelante.
// Une seule récompense est possible, y compris après actualisation ou double clic.
export async function recordPaymentSimulation(db, order, outcome, actor) {
  const {
    rows: [previous],
  } = await db.query('SELECT * FROM payment_simulations WHERE order_id=$1 FOR UPDATE', [order.id]);
  if (previous?.outcome === outcome && outcome !== 'paid') return previous;
  requireCondition(
    previous?.outcome !== 'paid' || outcome === 'paid',
    409,
    'La simulation réussie est déjà enregistrée.',
  );
  const rules = await settings(db, order.restaurant_id);
  const earned =
    outcome === 'paid' ? Math.floor((order.subtotal - order.discount) / rules.earnEvery) : 0;
  if (earned)
    await addPoints(db, order.user_id, earned, `demo:payment:${order.id}`, rules.pointValidityDays);
  if (outcome === 'paid') {
    const {
      rows: [existing],
    } = await db.query(
      "SELECT id FROM payments WHERE order_id=$1 AND mode='demo' AND status='paid'",
      [order.id],
    );
    if (!existing)
      await db.query(
        "INSERT INTO payments(id,order_id,mode,phone,operator,status,amount,currency) VALUES($1,$2,'demo','','simulation','paid',$3,'CDF')",
        [randomUUID(), order.id, order.total],
      );
    await settleOrder(db, order.id, 'simulation', true, actor);
    await db.query('UPDATE orders SET points_earned=$1 WHERE id=$2', [
      previous?.points_earned ?? earned,
      order.id,
    ]);
  }
  if (previous?.outcome === 'paid') return previous;
  const {
    rows: [simulation],
  } = await db.query(
    `INSERT INTO payment_simulations(order_id,outcome,points_earned) VALUES($1,$2,$3)
     ON CONFLICT(order_id) DO UPDATE SET outcome=EXCLUDED.outcome,points_earned=EXCLUDED.points_earned,updated_at=NOW()
     RETURNING *`,
    [order.id, outcome, earned],
  );
  await audit(db, actor, `payment_simulation_${outcome}`, order.id);
  return simulation;
}

export function paymentSimulationsRouter(db, config) {
  const router = Router();
  const enabled = config.demoPreview || (config.paymentMode === 'demo' && !config.production);
  async function ownedOrder(tx, req, lock = false) {
    const {
      rows: [order],
    } = await tx.query(
      `SELECT * FROM orders WHERE id=$1 AND user_id=$2 AND restaurant_id=$3${lock ? ' FOR UPDATE' : ''}`,
      [req.params.id, req.user.id, req.restaurant.id],
    );
    requireCondition(order, 404, 'Commande introuvable.');
    return order;
  }
  router.get('/:id/simulation', roles('student'), async (req, res) => {
    requireCondition(enabled, 404, 'Simulation indisponible.');
    const order = await ownedOrder(db, req);
    const {
      rows: [simulation],
    } = await db.query('SELECT * FROM payment_simulations WHERE order_id=$1', [order.id]);
    const { rows: items } = await db.query(
      'SELECT name,price,quantity FROM order_items WHERE order_id=$1 ORDER BY name',
      [order.id],
    );
    res.json({
      simulation: simulation || null,
      order: {
        id: order.id,
        total: order.total,
        payment_status: order.payment_status,
        status: order.status,
        is_simulated: order.is_simulated,
        items,
      },
      balance: await balance(db, req.user.id),
    });
  });
  router.post('/:id/simulation', roles('student'), async (req, res) => {
    requireCondition(enabled, 404, 'Simulation indisponible.');
    const { outcome } = z
      .object({ outcome: z.enum(['paid', 'failed']) })
      .strict()
      .parse(req.body);
    const simulation = await db.transaction(async (tx) => {
      const order = await ownedOrder(tx, req, true);
      requireCondition(order.status !== 'cancelled', 409, 'Cette commande est annulée.');
      requireCondition(
        order.payment_status !== 'paid' || (order.is_simulated && outcome === 'paid'),
        409,
        'Cette commande est déjà payée.',
      );
      // La commande suit le parcours normal ; les transactions réelles
      // EasyPay sont conservées et aucun appel fournisseur n'est effectué.
      return recordPaymentSimulation(tx, order, outcome, req.user.id);
    });
    res.json({ simulation });
  });
  return router;
}
