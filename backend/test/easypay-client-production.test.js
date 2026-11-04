import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEasyPayClient,
  EASYPAY_REJECTIONS,
  safeEasyPayDiagnostic,
} from '../src/easypay-client.js';

const config = {
  paymentMode: 'easypay-live',
  easypayToken: ' fake-key ',
  easypayCorrelationId: ' fake-cid ',
};
const payment = {
  reference: 'ABC123',
  amount: 9000,
  phone: '+243810000001',
  name: 'Client de test',
};

test('production : initialisation et verification utilisent v1 sans repli sandbox', async () => {
  const calls = [];
  const client = createEasyPayClient(config, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ code: 1, reference: 'EP-production-test' }));
  });
  await client.initiate(payment);
  await client.check('EP-production-test');
  assert.deepEqual(
    calls.map(({ url }) => url.pathname),
    ['/v1/mobile-money/payment', '/v1/payment/EP-production-test/checking-payment'],
  );
  assert.equal(calls[0].url.searchParams.get('token'), 'fake-key');
  assert.equal(calls[0].url.searchParams.get('cid'), 'fake-cid');
  assert.equal(calls[1].url.search, '');
  assert.equal(calls[0].options.redirect, 'error');
});

test('formats RDC : le fournisseur recoit neuf chiffres sans zero ni indicatif', async () => {
  for (const phone of [
    '0810000001',
    '+243 810 000 001',
    '00243810000001',
    '243810000001',
    '810000001',
  ]) {
    const client = createEasyPayClient(config, async (_url, options) => {
      assert.equal(JSON.parse(options.body).customer_phone, '810000001');
      return new Response(JSON.stringify({ code: 1, reference: 'EP-test' }));
    });
    await client.initiate({ ...payment, phone });
  }
});

test('un numero incomplet est refuse avant tout appel fournisseur', async () => {
  let calls = 0;
  const client = createEasyPayClient(config, async () => {
    calls++;
  });
  await assert.rejects(client.initiate({ ...payment, phone: '0974' }), /invalide/);
  assert.equal(calls, 0);
});

test('refus explicites : categorie utile sans divulguer la reponse du fournisseur', async () => {
  for (const [message, reason] of [
    ['Prefix not found.', 'phone_prefix'],
    ['Invalid token fake-key', 'credentials'],
    ['Correlation ID incorrect: fake-cid', 'credentials'],
    ['Merchant not activated', 'merchant'],
    ['Invalid customer_phone 810000001', 'phone'],
    ['Invalid currency CDF', 'amount'],
    ['Duplicate order_ref ABC123', 'reference'],
  ]) {
    const client = createEasyPayClient(
      config,
      async () => new Response(JSON.stringify({ code: 0, message })),
    );
    const result = await client.initiate(payment);
    assert.deepEqual(result, { rejected: true, reason });
    assert.ok(EASYPAY_REJECTIONS[reason]);
    assert.doesNotMatch(JSON.stringify(result), /fake-key|fake-cid|810000001|ABC123/);
  }
});

test('un refus inconnu reste generique et ne provoque aucun reessai automatique', async () => {
  let calls = 0;
  const client = createEasyPayClient(config, async () => {
    calls++;
    return new Response(
      JSON.stringify({ code: '0', message: 'https://example.test/?secret=private' }),
    );
  });
  assert.deepEqual(await client.initiate(payment), { rejected: true });
  assert.equal(calls, 1);
});

test('diagnostic prive : motifs structures lisibles et donnees sensibles masquees', () => {
  const result = safeEasyPayDiagnostic(
    {
      code: 0,
      reference: 'private-reference',
      errors: {
        cause: 'Provider unavailable',
        token: 'secret-key-value',
        phone: '+243810000001',
        url: 'https://provider.test/?cid=secret-cid',
        email: 'test@example.test',
      },
    },
    ['secret-key-value', 'secret-cid', '+243810000001'],
  );
  assert.match(result.message, /Provider unavailable/);
  assert.doesNotMatch(
    result.message,
    /secret-key-value|secret-cid|243810000001|provider.test|test@example.test|private-reference/,
  );
  assert.equal(result.referencePresent, true);
  assert.ok(result.message.length <= 500);
});
