import { Router } from 'express';
import { z } from 'zod';
import { roles, requireAuth } from './auth.js';
import { requireCondition } from './domain.js';

const filters = z.object({
  period: z.enum(['day', 'week', 'month', 'all']).default('month'),
  source: z.enum(['all', 'real', 'simulation']).default('all'),
});
const range = (alias) =>
  `($2='all' OR ${alias}.issued_at >= (date_trunc(CASE WHEN $2='all' THEN 'day' ELSE $2 END,NOW() AT TIME ZONE 'Africa/Kinshasa') AT TIME ZONE 'Africa/Kinshasa'))`;
const source = (alias) => `($3='all' OR ${alias}.is_simulated=($3='simulation'))`;
const numberFields = new Set([
  'paid_orders',
  'customers',
  'total',
  'real_revenue',
  'simulated_revenue',
  'cash_received',
  'average_ticket',
  'discounts',
  'purchases',
  'fulfilled',
  'spent',
  'points_earned',
  'balance',
  'quantity',
  'amount',
  'orders',
  'real_amount',
  'simulated_amount',
]);
const numeric = (row) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, numberFields.has(k) ? Number(v) : v]));
const invoiceFilters = filters.extend({
  q: z.string().trim().max(100).default(''),
  customer: z.string().max(100).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
const invoiceWhere = `i.restaurant_id=$1 AND ${range('i')} AND ${source('i')}
 AND ($4='' OR i.customer_name ILIKE $4 ESCAPE '!' OR i.customer_email ILIKE $4 ESCAPE '!' OR i.number ILIKE $4 ESCAPE '!') AND ($5='' OR i.user_id=$5)`;
function args(restaurant, f) {
  return [
    restaurant,
    f.period,
    f.source,
    f.q ? '%' + f.q.replace(/[!%_]/g, (c) => '!' + c) + '%' : '',
    f.customer,
  ];
}
const csvCell = (value) => {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};
export function decisionRouter(db) {
  const router = Router();
  router.get('/analytics', roles('manager', 'admin'), async (req, res) => {
    const f = filters.parse(req.query),
      params = [req.restaurant.id, f.period, f.source];
    const where = `i.restaurant_id=$1 AND ${range('i')} AND ${source('i')}`;
    const {
      rows: [summary],
    } = await db.query(
      `SELECT COUNT(*)::integer AS paid_orders,COUNT(DISTINCT i.user_id)::integer AS customers,
   COALESCE(SUM(i.total),0)::bigint AS total,COALESCE(SUM(i.total) FILTER(WHERE NOT i.is_simulated),0)::bigint AS real_revenue,
   COALESCE(SUM(i.total) FILTER(WHERE i.is_simulated),0)::bigint AS simulated_revenue,
   COALESCE(SUM(i.total) FILTER(WHERE i.payment_method='cash' AND NOT i.is_simulated),0)::bigint AS cash_received,
   COALESCE(ROUND(AVG(i.total)),0)::bigint AS average_ticket,COALESCE(SUM(i.discount),0)::bigint AS discounts
   FROM invoices i WHERE ${where}`,
      params,
    );
    const { rows: customers } = await db.query(
      `SELECT i.user_id,u.name,u.email,COUNT(*)::integer AS purchases,
   COUNT(*) FILTER(WHERE o.status IN ('served','delivered'))::integer AS fulfilled,
   SUM(i.total)::bigint AS spent,ROUND(AVG(i.total))::bigint AS average_ticket,MAX(i.issued_at) AS last_purchase,
   SUM(o.points_earned)::integer AS points_earned,
   (SELECT COALESCE(SUM(p.remaining),0)::integer FROM point_lots p WHERE p.user_id=i.user_id AND p.expires_at>NOW()) AS balance
   FROM invoices i JOIN users u ON u.id=i.user_id JOIN orders o ON o.id=i.order_id WHERE ${where}
   GROUP BY i.user_id,u.name,u.email ORDER BY fulfilled DESC,purchases DESC,spent DESC,i.user_id LIMIT 20`,
      params,
    );
    const { rows: retention } = await db.query(
      `SELECT COUNT(*)::integer AS returning_customers FROM
   (SELECT i.user_id FROM invoices i WHERE ${where} GROUP BY i.user_id HAVING COUNT(*)>=2) c`,
      params,
    );
    const { rows: popular } = await db.query(
      `SELECT item->>'name' AS name,SUM((item->>'quantity')::integer)::integer AS quantity,
   SUM((item->>'quantity')::integer*(item->>'price')::integer)::bigint AS amount
   FROM invoices i CROSS JOIN LATERAL jsonb_array_elements(i.items) item WHERE ${where}
   GROUP BY item->>'name' ORDER BY quantity DESC,name LIMIT 10`,
      params,
    );
    const { rows: trend } = await db.query(
      `SELECT (i.issued_at AT TIME ZONE 'Africa/Kinshasa')::date AS day,
   COUNT(*)::integer AS orders,SUM(i.total)::bigint AS amount,
   COALESCE(SUM(i.total) FILTER(WHERE NOT i.is_simulated),0)::bigint AS real_amount,
   COALESCE(SUM(i.total) FILTER(WHERE i.is_simulated),0)::bigint AS simulated_amount
   FROM invoices i WHERE ${where} AND i.issued_at>=NOW()-INTERVAL '90 days'
   GROUP BY day ORDER BY day`,
      params,
    );
    const { rows: methods } = await db.query(
      `SELECT CASE WHEN i.is_simulated THEN 'simulation' ELSE i.payment_method END AS method,
   COUNT(*)::integer AS orders,SUM(i.total)::bigint AS amount FROM invoices i WHERE ${where} GROUP BY method ORDER BY amount DESC`,
      params,
    );
    const orderRange = `($2='all' OR created_at >= (date_trunc(CASE WHEN $2='all' THEN 'day' ELSE $2 END,NOW() AT TIME ZONE 'Africa/Kinshasa') AT TIME ZONE 'Africa/Kinshasa'))`;
    const {
      rows: [operations],
    } = await db.query(
      `SELECT COUNT(*)::integer AS received,
   COUNT(*) FILTER(WHERE payment_status='paid')::integer AS paid,
   COUNT(*) FILTER(WHERE status='cancelled')::integer AS cancelled,
   COUNT(*) FILTER(WHERE status='awaiting_payment')::integer AS awaiting,
   COUNT(*) FILTER(WHERE status IN ('confirmed','preparing','ready','delivering'))::integer AS active,
   COUNT(*) FILTER(WHERE status IN ('served','delivered'))::integer AS fulfilled
   FROM orders WHERE restaurant_id=$1 AND ${orderRange} AND ($3='all' OR is_simulated=($3='simulation'))`,
      params,
    );
    res.json({
      period: f.period,
      source: f.source,
      summary: { ...numeric(summary), returning_customers: retention[0].returning_customers },
      operations,
      customers: customers.map(numeric),
      popular: popular.map(numeric),
      trend: trend.map(numeric),
      methods: methods.map(numeric),
    });
  });
  router.get('/invoices', roles('manager', 'admin'), async (req, res) => {
    const f = invoiceFilters.parse(req.query),
      values = args(req.restaurant.id, f);
    const {
      rows: [count],
    } = await db.query(
      `SELECT COUNT(*)::integer AS total FROM invoices i WHERE ${invoiceWhere}`,
      values,
    );
    const { rows } = await db.query(
      `SELECT i.order_id,i.number,i.customer_name,i.customer_email,i.user_id,i.total,i.payment_method,i.is_simulated,i.issued_at
   FROM invoices i WHERE ${invoiceWhere} ORDER BY i.issued_at DESC,i.order_id LIMIT 25 OFFSET $6`,
      [...values, (f.page - 1) * 25],
    );
    res.json({ invoices: rows, total: count.total, page: f.page, pageSize: 25 });
  });
  router.get('/invoices/export', roles('manager', 'admin'), async (req, res) => {
    const f = invoiceFilters.parse(req.query);
    const { rows } = await db.query(
      `SELECT i.* FROM invoices i WHERE ${invoiceWhere} ORDER BY i.issued_at DESC,i.order_id LIMIT 10001`,
      args(req.restaurant.id, f),
    );
    requireCondition(
      rows.length <= 10000,
      422,
      'La sélection dépasse 10 000 factures. Réduisez la période avant l’export.',
    );
    const lines = [
      [
        'Facture',
        'Date UTC',
        'Client',
        'E-mail',
        'Moyen',
        'Simulation',
        'Articles CDF',
        'Remise CDF',
        'Livraison CDF',
        'Total CDF',
      ],
      ...rows.map((i) => [
        i.number,
        new Date(i.issued_at).toISOString(),
        i.customer_name,
        i.customer_email,
        i.payment_method,
        i.is_simulated ? 'Oui' : 'Non',
        i.subtotal,
        i.discount,
        i.delivery_fee,
        i.total,
      ]),
    ];
    res.json({
      filename: `factures-${f.period}-${f.source}.csv`,
      csv: '\uFEFF' + lines.map((line) => line.map(csvCell).join(';')).join('\r\n'),
    });
  });
  router.get('/invoices/:id', requireAuth, async (req, res) => {
    const {
      rows: [invoice],
    } = await db.query(
      `SELECT * FROM invoices WHERE order_id=$1 AND restaurant_id=$2
   AND ($3 OR user_id=$4)`,
      [
        req.params.id,
        req.restaurant.id,
        ['employee', 'manager', 'admin'].includes(req.user.role),
        req.user.id,
      ],
    );
    requireCondition(invoice, 404, 'Facture introuvable.');
    res.json({ invoice });
  });
  return router;
}
