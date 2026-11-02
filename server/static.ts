import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const mimeTypes: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function securityHeaders(contentType: string) {
  return {
    'content-type': `${contentType}; charset=utf-8`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  };
}

export function createStaticHandler(): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    const pathname = new URL(request.url).pathname;
    const relative = pathname === '/' || pathname === '/index.html' ? 'index.html'
      : /^\/assets\/[A-Za-z0-9_-]+\.(?:js|css|svg|woff2)$/.test(pathname) ? pathname.slice(1) : null;
    if (!relative) return new Response('Not found', { status: 404, headers: securityHeaders('text/plain') });
    try {
      const candidate = resolve(dist, relative);
      const [realDist, realCandidate] = await Promise.all([realpath(dist), realpath(candidate)]);
      if (realCandidate !== realDist && !realCandidate.startsWith(`${realDist}${sep}`)) throw new Error('Outside distribution');
      if (!(await stat(realCandidate)).isFile()) throw new Error('Not a file');
      const contentType = relative === 'index.html' ? 'text/html' : mimeTypes[extname(relative)] ?? 'application/octet-stream';
      const bytes = await readFile(realCandidate);
      return new Response(request.method === 'HEAD' ? null : bytes, { status: 200, headers: securityHeaders(contentType) });
    } catch {
      return new Response('Not found', { status: 404, headers: securityHeaders('text/plain') });
    }
  };
}
