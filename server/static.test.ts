import assert from 'node:assert/strict';
import test from 'node:test';
import { createStaticHandler } from './static.ts';

test('static server serves the bundled UI with a restrictive policy', async () => {
  const handler = createStaticHandler();
  const page = await handler(new Request('http://127.0.0.1:4317/'));
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'self'/);
  const html = await page.text();
  assert.match(html, /\/assets\/index-[\w-]+\.js/);
  const assetPath = html.match(/(?:src|href)="(\/assets\/[^\"]+)"/)?.[1];
  assert.ok(assetPath);
  const bundle = await handler(new Request(`http://127.0.0.1:4317${assetPath}`));
  assert.equal(bundle.status, 200);
  assert.match(bundle.headers.get('content-type') ?? '', /javascript/);
  assert.doesNotMatch(await bundle.text(), /sourceMappingURL|\/Users\//);
});

test('static server does not expose source paths beyond the explicit asset allowlist', async () => {
  const handler = createStaticHandler();
  for (const path of ['/src/shared/graph.test.ts', '/server/index.ts', '/package.json', '/src/%2e%2e/server/index.ts']) {
    const response = await handler(new Request(`http://127.0.0.1:4317${path}`));
    assert.equal(response.status, 404, path);
  }
  assert.equal((await handler(new Request('http://127.0.0.1:4317/src/main.ts'))).status, 404);
});
