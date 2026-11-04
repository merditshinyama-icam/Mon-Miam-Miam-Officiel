import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTotals, DEFAULT_SETTINGS, nextStatuses } from '../src/domain.js';

test('CDF : remises sur les articles, frais de livraison distincts', () => {
  assert.deepEqual(
    calculateTotals(
      [
        { price: 9000, quantity: 1 },
        { price: 3000, quantity: 1 },
      ],
      'delivery',
      15,
      DEFAULT_SETTINGS,
    ),
    { subtotal: 12000, discount: 3000, deliveryFee: 2000, total: 11000 },
  );
});
test('les points ne peuvent pas dépasser les articles ni être fractionnés', () => {
  assert.throws(
    () => calculateTotals([{ price: 3000, quantity: 1 }], 'onsite', 30, DEFAULT_SETTINGS),
    /dépasse/,
  );
  assert.throws(
    () => calculateTotals([{ price: 9000, quantity: 1 }], 'onsite', 1, DEFAULT_SETTINGS),
    /lots/,
  );
});
test('sur place et livraison ont des fins de service distinctes', () => {
  assert.deepEqual(nextStatuses({ status: 'ready', service: 'onsite' }), ['served']);
  assert.deepEqual(nextStatuses({ status: 'ready', service: 'delivery' }), ['delivering']);
  assert.deepEqual(nextStatuses({ status: 'delivering', service: 'delivery' }), ['delivered']);
  assert.deepEqual(nextStatuses({ status: 'delivered' }), []);
});
