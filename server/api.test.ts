import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler } from './api.ts';

const handler = createApiHandler({ roots: [{ id: 'synthetic', label: 'Synthetic', path: new URL('./fixtures/synthetic/', import.meta.url).pathname }] });

test('API enumerates safe roots and refuses foreign origins and arbitrary path bodies', async () => {
  const roots = await handler(new Request('http://127.0.0.1/api/roots'));
  assert.equal(roots.status, 200);
  assert.equal((await roots.text()).includes('fixtures'), false);
  const foreign = await handler(new Request('http://127.0.0.1/api/discover', { method: 'POST', headers: { origin: 'https://attacker.invalid', 'content-type': 'application/json' }, body: '{"rootId":"synthetic"}' }));
  assert.equal(foreign.status, 403);
  const path = await handler(new Request('http://127.0.0.1/api/discover', { method: 'POST', headers: { origin: 'http://127.0.0.1', 'content-type': 'application/json' }, body: '{"rootId":"/etc"}' }));
  assert.equal(path.status, 400);
});

test('API rejects oversized, malformed, and wrong-content-type requests', async () => {
  for (const request of [
    new Request('http://127.0.0.1/api/discover', { method: 'POST', headers: { origin: 'http://127.0.0.1', 'content-type': 'text/plain' }, body: '{}' }),
    new Request('http://127.0.0.1/api/discover', { method: 'POST', headers: { origin: 'http://127.0.0.1', 'content-type': 'application/json' }, body: '{' }),
  ]) assert.ok((await handler(request)).status >= 400);
  const tooLarge = createApiHandler({ maxRequestBytes: 8 });
  const response = await tooLarge(new Request('http://127.0.0.1/api/discover', { method: 'POST', headers: { origin: 'http://127.0.0.1', 'content-type': 'application/json' }, body: '{"rootId":"synthetic"}' }));
  assert.equal(response.status, 413);
});

test('API exposes only narrow routes, enforces exact request shape, and caps graph responses', async () => {
  assert.equal((await handler(new Request('http://127.0.0.1/api/file?path=/etc/passwd'))).status, 404);
  const extra = await handler(new Request('http://127.0.0.1/api/discover', { method: 'POST', headers: { origin: 'http://127.0.0.1', 'content-type': 'application/json' }, body: '{"rootId":"synthetic","path":"/etc/passwd"}' }));
  assert.equal(extra.status, 400);
  const bounded = createApiHandler({ roots: [{ id: 'synthetic', label: 'Synthetic', path: new URL('./fixtures/synthetic/', import.meta.url).pathname }], maxResponseBytes: 16 });
  assert.equal((await bounded(new Request('http://127.0.0.1/api/discover', { method: 'POST', headers: { origin: 'http://127.0.0.1', 'content-type': 'application/json' }, body: '{"rootId":"synthetic"}' }))).status, 413);
});
