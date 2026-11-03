import { AppError, requireCondition } from './domain.js';

export const isEasyPay = (mode) => ['easypay-sandbox', 'easypay-live'].includes(mode);

// Only fixed categories may leave the adapter. Provider messages can contain
// credentials, phone numbers or URLs and must never be returned verbatim.
export const EASYPAY_REJECTIONS = Object.freeze({
  phone_prefix:
    'EasyPay ne reconnaît pas le préfixe de ce numéro Mobile Money. Le restaurant doit faire confirmer sa prise en charge par EasyPay. Aucun paiement confirmé ; ne multipliez pas les tentatives.',
  credentials:
    'EasyPay refuse les identifiants marchands. Le responsable doit vérifier la clé et le Correlation ID de production.',
  merchant:
    'EasyPay refuse la configuration du compte marchand. Le responsable doit vérifier son activation et le service Mobile Money en production.',
  phone:
    'EasyPay refuse le numéro Mobile Money. Vérifiez le numéro et son activation auprès de l’opérateur.',
  amount:
    'EasyPay refuse le montant ou la devise. Le responsable doit vérifier les limites et l’activation des paiements en CDF.',
  reference:
    'EasyPay refuse la référence de cette demande. Contactez le restaurant avant de réessayer.',
});
function rejectionReason(message) {
  if (typeof message !== 'string') return undefined;
  const text = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/prefix.*(?:not found|unknown|unsupported|invalide|introuvable|non reconnu)/.test(text))
    return 'phone_prefix';
  if (
    /token|publishable|api.?key|cle|credential|identifiant|correlation|\bcid\b|unauth|authent|expired|expir/.test(
      text,
    )
  )
    return 'credentials';
  if (/merchant|marchand|account|compte|activat|permission|production|sandbox/.test(text))
    return 'merchant';
  if (/phone|telephone|numero|msisdn|mobile number/.test(text)) return 'phone';
  if (/amount|montant|currency|devise|minimum|maximum/.test(text)) return 'amount';
  if (/reference|order_ref|duplicate|doublon/.test(text)) return 'reference';
  return undefined;
}

export function safeEasyPayDiagnostic(result, secrets = []) {
  let message = ['message', 'error', 'errors', 'description']
    .map((key) => result?.[key])
    .filter((value) => value !== undefined)
    .map((value) => (typeof value === 'string' ? value : JSON.stringify(value)))
    .join(' | ');
  for (const secret of secrets.filter(Boolean)) {
    for (const value of [secret, encodeURIComponent(secret)])
      message = message.split(value).join('[masqué]');
  }
  message = message
    .replace(/https?:\/\/[^\s"<>]+/gi, '[URL masquée]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[clé masquée]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[e-mail masqué]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[numéro masqué]')
    .replace(/[A-Za-z0-9+/=_-]{40,}/g, '[identifiant masqué]')
    .replace(/[\r\n\t]/g, ' ')
    .slice(0, 500);
  return {
    code: result?.code === 0 || result?.code === '0' ? 0 : 'unknown',
    message: message || 'Aucun motif dans les champs documentés.',
    referencePresent: typeof result?.reference === 'string' && result.reference.length > 0,
  };
}
export function createEasyPayClient(config, transport = fetch) {
  const mode = config.paymentMode === 'easypay-live' ? 'v1' : 'sandbox';
  const token = config.easypayToken?.trim();
  const cid = config.easypayCorrelationId?.trim();
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
      const localPhone = String(phone || '')
        .replace(/[\s().-]/g, '')
        .replace(/^(?:\+243|00243|243|0)/, '');
      requireCondition(/^[1-9]\d{8}$/.test(localPhone), 400, 'Numéro Mobile Money RDC invalide.');
      const result = await post(
        'mobile-money/payment',
        {
          order_ref: reference,
          currency: 'CDF',
          amount,
          customer_phone: localPhone,
          customer_name: name,
          description: `Commande Mon Miam Miam ${reference}`,
        },
        true,
      );
      if (result.code === 0 || result.code === '0') {
        const diagnostic = safeEasyPayDiagnostic(result, [token, cid, phone, localPhone]);
        const reason = rejectionReason(diagnostic.message);
        // Private operator logs only: bounded, redacted fields, never the full payload.
        console.warn('EASYPAY_INITIALIZATION_REJECTED', JSON.stringify(diagnostic));
        return reason ? { rejected: true, reason } : { rejected: true };
      }
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
