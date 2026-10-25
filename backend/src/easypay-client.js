import { AppError, requireCondition } from './domain.js';

export const isEasyPay = (mode) => ['easypay-sandbox', 'easypay-live'].includes(mode);
export function createEasyPayClient(config, transport = fetch) {
  const mode = config.paymentMode === 'easypay-live' ? 'v1' : 'sandbox';
  const token = config.easypayToken;
  const cid = config.easypayCorrelationId;
  function configured() {
    requireCondition(
      token && cid,
      503,
      'Les identifiants EasyPay ne sont pas encore configurés. Aucun débit demandé.',
    );
    // Merchant credentials are opaque to this application. EasyPay decides whether
    // a supplied key is accepted; unverified JWT-looking claims are not local policy.
  }
  async function post(path, body, credentials = false) {
    const url = new URL(`https://www.e-com-easypay.com/${mode}/${path}`);
    if (credentials) {
      url.searchParams.set('cid', cid);
      url.searchParams.set('token', token);
    }
    let response;
    try {
      response = await transport(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body || {}),
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error('HTTP_ERROR');
      return await response.json();
    } catch {
      // Never include the requested URL, credentials, raw provider payload or transport error in logs/responses.
      throw new AppError(
        502,
        'EasyPay ne répond pas clairement. Ne relancez pas le paiement ; vérifiez son statut ou contactez le restaurant.',
      );
    }
  }
  return {
    configured,
    async initiate({ reference, amount, phone, name }) {
      configured();
      requireCondition(
        typeof reference === 'string' && /^[A-Za-z0-9]{6,16}$/.test(reference),
        400,
        'La référence marchande doit contenir de 6 à 16 caractères alphanumériques.',
      );
      const result = await post(
        'mobile-money/payment',
        {
          order_ref: reference,
          currency: 'CDF',
          amount,
          customer_phone: phone.replace(/^\+243/, ''),
          customer_name: name,
          description: `Commande Mon Miam Miam ${reference}`,
        },
        true,
      );
      if (result.code === 0 || result.code === '0') return { rejected: true };
      requireCondition(
        (result.code === 1 || result.code === '1') &&
          typeof result.reference === 'string' &&
          /^[a-zA-Z0-9_+=/.-]{1,250}$/.test(result.reference),
        502,
        'Réponse EasyPay incomplète. Ne relancez pas le paiement ; contactez le restaurant.',
      );
      return { reference: result.reference };
    },
    async check(reference) {
      requireCondition(
        typeof reference === 'string' && /^[a-zA-Z0-9_+=/.-]{1,250}$/.test(reference),
        400,
        'Référence invalide.',
      );
      return post(`payment/${encodeURIComponent(reference)}/checking-payment`);
    },
  };
}
