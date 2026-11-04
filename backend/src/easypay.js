import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { randomUUID, randomBytes } from 'node:crypto';
import { AppError, requireCondition, audit, RESTAURANT } from './domain.js';
import { isEasyPay, EASYPAY_REJECTIONS } from './easypay-client.js';

export const publicPayment = (p) => ({
  id: p.id,
  status: p.status,
  mode: p.mode,
  created_at: p.created_at,
  provider_state: p.provider_state,
  checked_at: p.checked_at,
  ...(p.operator === 'easypay-portal' &&
  p.status === 'pending' &&
  isEasyPay(p.mode) &&
  /^[a-zA-Z0-9_+=/.-]{1,250}$/.test(p.provider_reference || '')
    ? {
        checkout_url: `https://www.e-com-easypay.com/${p.mode === 'easypay-live' ? 'v1' : 'sandbox'}/payment/initialization?reference=${encodeURIComponent(p.provider_reference)}`,
      }
    : {}),
});
export const effectivePaymentMode = (config, restaurantId) =>
  isEasyPay(config.paymentMode) && restaurantId !== config.easypayRestaurantId
    ? 'disabled'
    : config.paymentMode;

export async function initiateEasyPay(db, config, req, body) {
  requireCondition(
    effectivePaymentMode(config, req.restaurant.id) === config.paymentMode,
    503,
    'Les paiements ne sont pas configurés pour ce restaurant.',
  );
  config.easypay.configured();
  const attempt = await db.transaction(async (tx) => {
    const {
      rows: [order],
    } = await tx.query(
      'SELECT * FROM orders WHERE id=$1 AND user_id=$2 AND restaurant_id=$3 FOR UPDATE',
      [req.params.id, req.user.id, req.restaurant.id],
    );
    requireCondition(order, 404, 'Commande introuvable.');
    requireCondition(
      order.status === 'awaiting_payment' && order.payment_status !== 'paid',
      409,
      'Cette commande ne peut plus être payée.',
    );
    const {
      rows: [pending],
    } = await tx.query("SELECT * FROM payments WHERE order_id=$1 AND status='pending'", [order.id]);
    if (pending) return { payment: pending, created: false };
    const id = randomUUID();
    const {
      rows: [payment],
    } = await tx.query(
      "INSERT INTO payments(id,order_id,mode,phone,operator,provider_order_ref,amount,currency,provider_state) VALUES($1,$2,$3,$4,$5,$6,$7,'CDF','initiating') RETURNING *",
      [
        id,
        order.id,
        config.paymentMode,
        body.phone || req.user.phone || '',
        body.flow === 'portal' ? 'easypay-portal' : body.operator,
        randomBytes(8).toString('hex'),
        order.total,
      ],
    );
    await audit(tx, req.user.id, 'easypay_payment_requested', id);
    return { payment, created: true };
  });
  if (!attempt.created) return publicPayment(attempt.payment);
  const p = attempt.payment;
  let result;
  try {
    const details = {
      reference: p.provider_order_ref,
      amount: p.amount,
      phone: p.phone,
      name: req.user.name,
    };
    if (body.flow === 'portal') {
      const base = req.restaurant.id === RESTAURANT ? '' : `/r/${req.restaurant.slug}`;
      result = await config.easypay.initiatePortal({
        ...details,
        returnUrl: new URL(`${base}/payment/${p.order_id}`, config.origin).href,
      });
    } else result = await config.easypay.initiate(details);
  } catch (error) {
    await db.query(
      "UPDATE payments SET provider_state='uncertain' WHERE id=$1 AND provider_reference IS NULL",
      [p.id],
    );
    // Keep pending: retrying after a timeout could debit the wallet twice.
    throw error;
  }
  if (result.rejected) {
    await db.transaction(async (tx) => {
      await tx.query("UPDATE payments SET status='failed',provider_state='rejected' WHERE id=$1", [
        p.id,
      ]);
      await tx.query(
        "UPDATE orders SET payment_status='failed',updated_at=NOW() WHERE id=$1 AND status='awaiting_payment'",
        [p.order_id],
      );
      const reason = Object.hasOwn(EASYPAY_REJECTIONS, result.reason) ? result.reason : 'unknown';
      await audit(tx, req.user.id, `easypay_rejected_${reason}`, p.id);
    });
    throw new AppError(
      422,
      (Object.hasOwn(EASYPAY_REJECTIONS, result.reason) && EASYPAY_REJECTIONS[result.reason]) ||
        'EasyPay a refusé l’initialisation sans motif reconnu. Contactez le restaurant pour vérifier la configuration marchande avant de réessayer.',
    );
  }
  const {
    rows: [payment],
  } = await db.query(
    "UPDATE payments SET provider_reference=$1,provider_state='waiting' WHERE id=$2 RETURNING *",
    [result.reference, p.id],
  );
  return publicPayment(payment);
}

export async function reconcileEasyPay(db, config, paymentId) {
  const {
    rows: [payment],
  } = await db.query('SELECT * FROM payments WHERE id=$1', [paymentId]);
  requireCondition(payment && isEasyPay(payment.mode), 404, 'Paiement introuvable.');
  requireCondition(
    payment.mode === config.paymentMode,
    409,
    'Le mode de ce paiement ne correspond pas au mode EasyPay actif.',
  );
  requireCondition(
    payment.provider_reference,
    409,
    'La demande reste incertaine. Contactez le restaurant avant toute nouvelle tentative.',
  );
  const result = await config.easypay.check(payment.provider_reference);
  const txData = result?.transaction,
    payData = result?.payment;
  requireCondition(
    txData?.order_ref === payment.provider_order_ref &&
      txData?.reference === payment.provider_reference &&
      payData?.reference === payment.provider_reference,
    502,
    'La confirmation EasyPay ne correspond pas à cette tentative.',
  );
  for (const data of [txData, payData]) {
    if (data.amount !== undefined)
      requireCondition(
        Number(data.amount) === payment.amount,
        502,
        'Le montant confirmé est incohérent.',
      );
    if (data.currency !== undefined)
      requireCondition(data.currency === 'CDF', 502, 'La devise confirmée est incohérente.');
  }
  const status = payData.status;
  requireCondition(
    ['SUCCESS', 'CANCELED', 'DECLINED', 'PENDING', 'WAITING', 'PROCESSING'].includes(status),
    502,
    'Statut EasyPay non reconnu. Le paiement reste en attente.',
  );
  return db.transaction(async (tx) => {
    const {
      rows: [order],
    } = await tx.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [payment.order_id]);
    const {
      rows: [current],
    } = await tx.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE', [payment.id]);
    // A confirmed success is never downgraded by a delayed notification or check.
    if (current.status === 'paid') return publicPayment(current);
    const mapped =
      status === 'SUCCESS'
        ? 'paid'
        : ['CANCELED', 'DECLINED'].includes(status)
          ? 'failed'
          : 'pending';
    if (current.status === 'failed' && mapped === 'pending') return publicPayment(current);
    requireCondition(
      order.status !== 'cancelled' || mapped !== 'paid',
      409,
      'Confirmation tardive : intervention du restaurant nécessaire.',
    );
    const {
      rows: [updated],
    } = await tx.query(
      'UPDATE payments SET status=$1,provider_state=$2,checked_at=NOW() WHERE id=$3 RETURNING *',
      [mapped, status, current.id],
    );
    if (order.status === 'awaiting_payment') {
      // An older failed attempt must not overwrite a newer pending/paid attempt.
      const {
        rows: [other],
      } = await tx.query(
        "SELECT id FROM payments WHERE order_id=$1 AND id<>$2 AND status IN ('pending','paid')",
        [order.id, current.id],
      );
      if (mapped === 'paid' || !other)
        await tx.query(
          'UPDATE orders SET payment_status=$1,status=$2,updated_at=NOW() WHERE id=$3',
          [mapped, mapped === 'paid' ? 'confirmed' : 'awaiting_payment', order.id],
        );
    }
    if (current.status !== mapped) await audit(tx, null, `easypay_verified_${mapped}`, current.id);
    return publicPayment(updated);
  });
}

const notificationSchema = z.object({
  transaction: z.object({
    order_ref: z.string().min(1).max(100),
    reference: z.string().min(1).max(250),
  }),
  payment: z.object({ reference: z.string().min(1).max(250), status: z.string().max(30) }),
});
export function easyPayIpnRouter(db, config) {
  const router = Router();
  router.post(
    '/ipn',
    rateLimit({ windowMs: 60000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false }),
    async (req, res) => {
      requireCondition(isEasyPay(config.paymentMode), 503, 'EasyPay n’est pas activé.');
      const body = notificationSchema.parse(req.body);
      requireCondition(
        body.transaction.reference === body.payment.reference,
        400,
        'Références incohérentes.',
      );
      const {
        rows: [p],
      } = await db.query(
        'SELECT p.* FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.provider_order_ref=$1 AND o.restaurant_id=$2',
        [body.transaction.order_ref, config.easypayRestaurantId || RESTAURANT],
      );
      requireCondition(p && p.mode === config.paymentMode, 404, 'Paiement introuvable.');
      requireCondition(
        p.provider_reference,
        503,
        'Initialisation en cours ; notification non traitée.',
      );
      requireCondition(
        p.provider_reference === body.transaction.reference,
        400,
        'Référence incohérente.',
      );
      // The IPN is only a signal. Its status is never trusted; re-query the fixed provider endpoint over HTTPS.
      await reconcileEasyPay(db, config, p.id);
      res.json({ received: true });
    },
  );
  return router;
}
