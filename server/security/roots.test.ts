import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listRoots, resolveRoot } from './roots.ts';
import { walkFiles } from './walk.ts';

test('root lookup only accepts configured opaque ids and exposes no paths', async () => {
  const roots = await listRoots({ roots: [{ id: 'opaque', label: 'Demo', path: new URL('../fixtures/synthetic/', import.meta.url).pathname }] });
  assert.deepEqual(roots, [{ id: 'opaque', label: 'Demo' }]);
  await assert.rejects(resolveRoot('../etc/passwd', { roots: [] }));
  const unsafeLabel = await listRoots({ roots: [{ id: 'path', label: '/private/fixture', path: new URL('../fixtures/synthetic/', import.meta.url).pathname }] });
  assert.deepEqual(unsafeLabel, []);
});

test('rejects symlinked files while walking an allowed root', async () => {
  const base = await mkdtemp(join(tmpdir(), 'atlas-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'atlas-out-'));
  try {
    await writeFile(join(outside, 'Secret.java'), 'secret');
    await mkdir(join(base, 'linkdir'));
    await symlink(join(outside, 'Secret.java'), join(base, 'linkdir', 'Secret.java'));
    const { walkFiles } = await import('./walk.ts');
    const files = await walkFiles(base);
    assert.deepEqual(files, []);
  } finally { await rm(base, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('walk bounds bytes and directory entries, including irrelevant filenames', async () => {
  const base = await mkdtemp(join(tmpdir(), 'atlas-bounds-'));
  try {
    await writeFile(join(base, 'source.java'), 'package fixture;');
    await writeFile(join(base, 'ignored.txt'), 'ignored');
    await assert.rejects(walkFiles(base, { maxBytes: 2 }), /byte limit/);
    await assert.rejects(walkFiles(base, { maxEntries: 1 }), /entry limit/);
  } finally { await rm(base, { recursive: true, force: true }); }
});
