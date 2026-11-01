import { discover, type DiscoverOptions } from './scanner/index.ts';
import { listRoots } from './security/roots.ts';

export interface ApiOptions extends DiscoverOptions { maxRequestBytes?: number; maxResponseBytes?: number }
const MAX_REQUEST = 4_096;
const MAX_RESPONSE = 2_000_000;
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const originUrl = new URL(origin), requestUrl = new URL(request.url);
    return originUrl.origin === requestUrl.origin && (requestUrl.hostname === '127.0.0.1' || requestUrl.hostname === 'localhost' || requestUrl.hostname === '[::1]');
  } catch { return false; }
}

export function createApiHandler(options: ApiOptions = {}): (request: Request) => Promise<Response> {
  const maxRequestBytes = options.maxRequestBytes ?? MAX_REQUEST;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE;
  let activeScans = 0;
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === '/api/roots' && request.method === 'GET') {
      return json({ roots: await listRoots(options) });
    }
    if (url.pathname !== '/api/discover') return json({ error: 'Not found' }, 404);
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return json({ error: 'Unsupported media type' }, 415);
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > maxRequestBytes) return json({ error: 'Request too large' }, 413);
    if (!request.body) return json({ error: 'Invalid request' }, 400);
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxRequestBytes) { await reader.cancel(); return json({ error: 'Request too large' }, 413); }
        chunks.push(value);
      }
    } catch { return json({ error: 'Invalid request' }, 400); }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof (body as { rootId?: unknown }).rootId !== 'string') return json({ error: 'Expected { rootId }' }, 400);
    if (activeScans >= 2) return json({ error: 'Discovery busy' }, 503);
    activeScans += 1;
    try {
      const graph = await discover((body as { rootId: string }).rootId, options);
      const text = JSON.stringify(graph);
      if (new TextEncoder().encode(text).byteLength > maxResponseBytes) return json({ error: 'Scan result too large' }, 413);
      return new Response(text, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
    } catch (error) {
      const status = error instanceof RangeError ? 413 : error instanceof TypeError ? 400 : 500;
      return json({ error: status === 413 ? 'Scan limit exceeded' : status === 400 ? 'Unknown root' : 'Discovery failed' }, status);
    } finally { activeScans -= 1; }
  };
}
