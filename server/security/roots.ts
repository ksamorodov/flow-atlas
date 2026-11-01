import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export interface RootConfig { id: string; label: string; path: string }
export interface SafeRoot { id: string; label: string }
export interface RootOptions { roots?: RootConfig[] }

const defaultRoot: RootConfig = { id: 'synthetic', label: 'Synthetic fixture', path: new URL('../fixtures/synthetic/', import.meta.url).pathname };
function configured(options: RootOptions = {}): RootConfig[] { return options.roots ?? [defaultRoot]; }
function validId(id: string): boolean { return /^[a-zA-Z0-9_-]{1,64}$/.test(id); }
function inside(root: string, child: string): boolean {
  const rel = relative(root, child);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

export async function listRoots(options: RootOptions = {}): Promise<SafeRoot[]> {
  const output: SafeRoot[] = [];
  for (const root of configured(options)) {
    if (!validId(root.id) || !root.label || root.label.length > 80 || /[\\/:]/.test(root.label) || root.label === '.' || root.label === '..') continue;
    try { await realpath(resolve(root.path)); output.push({ id: root.id, label: root.label.replace(/[\r\n\0]/g, '').slice(0, 80) }); } catch { /* unavailable configured roots are not advertised */ }
  }
  return output.sort((a, b) => a.id.localeCompare(b.id));
}

export async function resolveRoot(id: string, options: RootOptions = {}): Promise<{ id: string; label: string; path: string }> {
  if (!validId(id)) throw new TypeError('Unknown root');
  const selected = configured(options).find((root) => root.id === id);
  if (!selected) throw new TypeError('Unknown root');
  const canonical = await realpath(resolve(selected.path));
  if (!isAbsolute(canonical)) throw new TypeError('Invalid configured root');
  return { id: selected.id, label: selected.label, path: canonical };
}

export { inside as isInsideRoot };
