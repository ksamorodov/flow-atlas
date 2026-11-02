import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApiHandler } from './api.ts';
import { createStaticHandler } from './static.ts';
import type { ApiOptions } from './api.ts';
import type { RootConfig } from './security/roots.ts';

export interface StartOptions extends ApiOptions { host?: string; port?: number }
export function configuredRootsFromEnv(env: NodeJS.ProcessEnv = process.env): RootConfig[] {
  const raw = env.FLOW_ATLAS_ROOTS;
  if (!raw) return [{ id: 'synthetic', label: 'Synthetic fixture', path: new URL('./fixtures/synthetic/', import.meta.url).pathname }];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new TypeError('FLOW_ATLAS_ROOTS must be a JSON array');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('Invalid configured root');
    const root = entry as Record<string, unknown>;
    if (typeof root.id !== 'string' || typeof root.label !== 'string' || typeof root.path !== 'string' || !resolve(root.path)) throw new TypeError('Invalid configured root');
    return { id: root.id, label: root.label, path: resolve(root.path) };
  });
}

export function startServer(options: StartOptions = {}): ReturnType<typeof createServer> {
  const host = options.host ?? '127.0.0.1';
  if (host !== '127.0.0.1') throw new TypeError('Flow Atlas must bind to 127.0.0.1');
  const port = options.port ?? 4317;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new TypeError('Invalid port');
  const handler = createApiHandler(options);
  const staticHandler = createStaticHandler();
  const server = createServer(async (incoming, outgoing) => {
    try {
      const address = server.address();
      const boundPort = address && typeof address !== 'string' ? address.port : port;
      const authority = incoming.headers.host;
      if (authority !== `127.0.0.1:${boundPort}` && authority !== `localhost:${boundPort}`) {
        outgoing.writeHead(421, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        outgoing.end('{"error":"Invalid host"}');
        return;
      }
      if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//')) {
        outgoing.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        outgoing.end('{"error":"Invalid request target"}');
        return;
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) if (typeof value === 'string') headers.set(key, value);
      const url = `http://${authority}${incoming.url}`;
      const bodyIterator = incoming[Symbol.asyncIterator]();
      const body = incoming.method === 'GET' || incoming.method === 'HEAD' ? undefined : new globalThis.ReadableStream<Uint8Array>({
        async pull(controller) {
          const result = await bodyIterator.next();
          if (result.done) controller.close();
          else controller.enqueue(new Uint8Array(result.value));
        },
        cancel() { incoming.destroy(); },
      });
      const request = new Request(url, { method: incoming.method, headers, ...(body ? { body, duplex: 'half' as const } : {}) });
      const response = new URL(url).pathname.startsWith('/api/') ? await handler(request) : await staticHandler(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    } catch {
      outgoing.writeHead(500, { 'content-type': 'application/json; charset=utf-8' }); outgoing.end('{"error":"Request failed"}');
    }
  });
  server.listen(port, host);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer({ roots: configuredRootsFromEnv() });
}
