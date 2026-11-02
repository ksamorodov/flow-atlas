import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { isInsideRoot } from './roots.ts';

export interface WalkOptions { maxDepth?: number; maxFiles?: number; maxBytes?: number; maxEntries?: number; maxMillis?: number }
export interface ScannedFile { path: string; content: string; bytes: number }
const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'build', 'dist', 'out', 'coverage', '.next', '.gradle']);
const SAFE_FILE = /\.(java|kt|xml|gradle(?:\.kts)?|properties|ya?ml)$/i;
const SENSITIVE_FILE = /(^|[._-])(secrets?|credentials?|passwords?|passwds?|tokens?|private|id_rsa|\.env)([._-]|$)/i;

export async function walkFiles(root: string, options: WalkOptions = {}): Promise<ScannedFile[]> {
  const maxDepth = options.maxDepth ?? 12, maxFiles = options.maxFiles ?? 2_000;
  const maxBytes = options.maxBytes ?? 8_000_000, maxEntries = options.maxEntries ?? 20_000;
  const deadline = Date.now() + (options.maxMillis ?? 10_000);
  const canonicalRoot = await realpath(root);
  const files: ScannedFile[] = [];
  let entries = 0, totalBytes = 0;
  async function visit(dir: string, depth: number): Promise<void> {
    if (Date.now() > deadline) throw new RangeError('Scan time limit exceeded');
    if (depth > maxDepth) throw new RangeError('Scan depth limit exceeded');
    const names: string[] = [];
    const directory = await opendir(dir);
    for await (const entry of directory) {
      if (Date.now() > deadline) throw new RangeError('Scan time limit exceeded');
      entries += 1;
      if (entries > maxEntries) throw new RangeError('Scan entry limit exceeded');
      names.push(entry.name);
    }
    names.sort();
    for (const name of names.sort()) {
      if (Date.now() > deadline) throw new RangeError('Scan time limit exceeded');
      if (SKIP_DIRS.has(name.toLowerCase()) || SENSITIVE_FILE.test(name)) continue;
      const path = join(dir, name);
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) { await visit(path, depth + 1); continue; }
      if (!stat.isFile() || !SAFE_FILE.test(name)) continue;
      if (files.length >= maxFiles) throw new RangeError('Scan file limit exceeded');
      const canonical = await realpath(path);
      if (!isInsideRoot(canonicalRoot, canonical)) continue;
      const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev) continue;
        const allowance = maxBytes - totalBytes;
        const chunks: Buffer[] = [];
        let bytes = 0;
        while (true) {
          const buffer = Buffer.alloc(Math.min(64 * 1024, allowance - bytes + 1));
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, bytes);
          if (bytesRead === 0) break;
          bytes += bytesRead;
          if (bytes > allowance) throw new RangeError('Scan byte limit exceeded');
          chunks.push(buffer.subarray(0, bytesRead));
        }
        totalBytes += bytes;
        files.push({ path: relative(canonicalRoot, canonical).split(sep).join('/'), content: Buffer.concat(chunks).toString('utf8'), bytes });
      } finally { await handle.close(); }
    }
  }
  await visit(canonicalRoot, 0);
  return files;
}
