import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const item of entries) {
    const name = path.join(directory, item.name);
    if (item.isDirectory()) result.push(...(await files(name)));
    else result.push(name);
  }
  return result;
}
test('toutes les illustrations locales référencées sont livrées avec le projet', async () => {
  const refs = new Set();
  for (const directory of ['frontend/src', 'backend/src', 'backend/sql']) {
    for (const file of await files(path.join(root, directory))) {
      const text = await readFile(file, 'utf8');
      for (const match of text.matchAll(
        /\/assets\/([a-zA-Z0-9_.-]+\.(?:webp|svg|png|jpg|jpeg))/g,
      )) {
        refs.add(match[1]);
      }
    }
  }
  assert.ok(refs.size >= 5, 'Le contrôle doit retrouver les images de démonstration.');
  for (const name of refs) {
    const info = await stat(path.join(root, 'frontend/public/assets', name));
    assert.ok(info.size > 0, `Illustration manquante ou vide : ${name}`);
  }
  const credits = await readFile(path.join(root, 'docs/CREDITS_IMAGES.md'), 'utf8');
  for (const name of [
    'moambe.webp',
    'poisson.webp',
    'bissap.webp',
    'samossas.webp',
    'restaurant.webp',
  ]) {
    assert.ok(credits.includes(name), `Crédit manquant : ${name}`);
  }
});
