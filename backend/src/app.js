import { createEasyPayClient, isEasyPay } from './easypay-client.js';
import { easyPayIpnRouter, effectivePaymentMode } from './easypay.js';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { authRouter, loadUser } from './auth.js';
import { ordersRouter } from './orders.js';
import { paymentSimulationsRouter } from './payment-simulations.js';
import { cashRouter } from './cash.js';
import { decisionRouter } from './decision.js';
import { managementRouter } from './management.js';
import { engagementRouter } from './engagement.js';
import { createResetMailer } from './mail.js';
import { AppError, settings, RESTAURANT } from './domain.js';
import { resolveRestaurant, restaurantsRouter, publicRestaurant } from './restaurants.js';

export function createApp(db, options = {}) {
  const config = {
    production: process.env.NODE_ENV === 'production',
    origin: process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3001',
    paymentMode:
      process.env.PAYMENT_MODE || (process.env.NODE_ENV === 'production' ? 'disabled' : 'demo'),
    demoPreview: process.env.DEMO_PREVIEW === 'true',
    easypayToken: process.env.EASYPAY_TOKEN,
    easypayCorrelationId: process.env.EASYPAY_CORRELATION_ID,
    easypayRestaurantId: process.env.EASYPAY_RESTAURANT_ID || RESTAURANT,
    resendApiKey: process.env.RESEND_API_KEY,
    mailFrom: process.env.MAIL_FROM || 'merdi.tshinyama@2030.ulc-icam.com',
    mailReplyTo: process.env.MAIL_REPLY_TO || 'merdi.tshinyama@2030.ulc-icam.com',
    // Student demonstration: never broaden delivery when the variable is omitted.
    mailTestRecipient: process.env.MAIL_TEST_RECIPIENT || 'merdi.tshinyama@2030.ulc-icam.com',
    dataDir: path.resolve(process.env.DATA_DIR || 'data'),
    ...options,
  };
  if (config.resendApiKey && config.mailFrom && !config.mailer)
    config.mailer = createResetMailer(config);
  if (!['demo', 'disabled', 'easypay-sandbox', 'easypay-live'].includes(config.paymentMode))
    throw new Error('PAYMENT_MODE invalide.');
  if (isEasyPay(config.paymentMode))
    config.easypay = options.easypay || createEasyPayClient(config);
  if (config.production && config.paymentMode === 'demo')
    throw new Error(
      'Les paiements simulés sont interdits en production. Configurez PAYMENT_MODE=disabled.',
    );
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'script-src': ["'self'"],
          'upgrade-insecure-requests': config.production ? [] : null,
        },
      },
      strictTransportSecurity: config.production ? undefined : false,
    }),
  );
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 500,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Trop de requêtes. Réessayez dans une minute.' },
    }),
  );
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  // Provider callbacks have no browser session/custom CSRF header or tenant header.
  // Only this exact endpoint is exempt, and its claims are independently verified.
  app.use('/api/payments/easypay', express.json({ limit: '16kb' }), easyPayIpnRouter(db, config));
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    // Custom header triggers a CORS preflight for cross-site requests. No cross-origin CORS is enabled.
    if (req.headers['x-requested-with'] !== 'MonMiamMiam' || (origin && origin !== config.origin))
      return next(new AppError(403, 'Origine de la demande non autorisée.'));
    next();
  });
  app.use(express.json({ limit: '50kb' }));
  app.use('/api', (req, res, next) => resolveRestaurant(db, req, res, next));
  app.use('/api', (req, res, next) => loadUser(db, req, res, next));
  app.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', version: '0.2.0', paymentMode: config.paymentMode }),
  );
  app.get('/api/catalog', async (req, res) => {
    const { rows: dishes } = await db.query(
      "SELECT id,name,description,category,price,image,available FROM dishes WHERE restaurant_id=$1 AND archived=FALSE ORDER BY CASE category WHEN 'Plats' THEN 0 WHEN 'Boissons' THEN 1 ELSE 2 END,CASE id WHEN 'moambe' THEN 0 ELSE 1 END,name",
      [req.restaurant.id],
    );
    res.json({
      dishes,
      restaurant: publicRestaurant(req.restaurant),
      featuredDishId: req.restaurant.featured_dish_id,
      demoPreview: config.demoPreview,
      cashEnabled: true,
      emailRecoveryMode: config.mailer
        ? config.mailTestRecipient
          ? 'test'
          : 'configured'
        : config.production
          ? 'disabled'
          : 'local',
      settings: await settings(db, req.restaurant.id),
      paymentMode: effectivePaymentMode(config, req.restaurant.id),
    });
  });
  app.use('/api', restaurantsRouter(db, config));
  app.use('/api/auth', authRouter(db, config));
  app.use('/api/orders', ordersRouter(db, config));
  app.use('/api/orders', paymentSimulationsRouter(db, config));
  app.use('/api/orders', cashRouter(db));
  app.use('/api', managementRouter(db));
  app.use('/api', decisionRouter(db));
  app.use('/api', engagementRouter(db));
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'Ressource introuvable.')));
  const dist = path.resolve('frontend/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError)
      return res
        .status(400)
        .json({ message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' ') });
    if (error.code === '23505')
      return res
        .status(409)
        .json({ message: 'Cet élément existe déjà (adresse e-mail, avis ou référence).' });
    if (error.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({ message: 'La photo dépasse la limite de 3 Mo.' });
    if (error instanceof SyntaxError && error.status === 400)
      return res.status(400).json({ message: 'Données JSON invalides.' });
    const status = error.status || 500;
    if (status >= 500) console.error('Erreur API :', error.name, error.code || 'INTERNAL_ERROR');
    res.status(status).json({
      message:
        status < 500 || error instanceof AppError
          ? error.message
          : 'Une erreur est survenue. Réessayez.',
    });
  });
  return app;
}
