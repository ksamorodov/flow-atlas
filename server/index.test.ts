import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startServer } from './index.ts';

test('server rejects non-loopback bind addresses and hostile Host headers', async () => {
  assert.throws(() => startServer({ host: '0.0.0.0' }), /127\.0\.0\.1/);
  const server = startServer({ port: 0 });
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    // Fetch normalizes Host in Node; use HTTP directly to send an actual hostile authority.
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const outgoing = request(`http://127.0.0.1:${address.port}/api/roots`, {
        headers: { host: `attacker.invalid:${address.port}` },
      }, (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode));
      });
      outgoing.once('error', reject);
      outgoing.end();
    });
    assert.equal(status, 421);
    const origin = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${origin}/api/roots`)).status, 200);
    const scan = await fetch(`${origin}/api/discover`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: 'synthetic' }),
    });
    assert.equal(scan.status, 200);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
