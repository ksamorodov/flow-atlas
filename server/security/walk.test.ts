import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkFiles } from './walk.ts';

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'flow-atlas-walk-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('counts actual UTF-8 file bytes and accepts the exact byte boundary', async () => {
  await withRoot(async (root) => {
    await writeFile(join(root, 'application.yml'), 'éa');
    const [file] = await walkFiles(root, { maxBytes: 3 });
    assert.equal(file.content, 'éa');
    assert.equal(file.bytes, 3);
  });
});

test('rejects content larger than the remaining byte allowance', async () => {
  await withRoot(async (root) => {
    await writeFile(join(root, 'application.yml'), 'éé');
    await assert.rejects(walkFiles(root, { maxBytes: 3 }), /Scan byte limit exceeded/);
  });
});
