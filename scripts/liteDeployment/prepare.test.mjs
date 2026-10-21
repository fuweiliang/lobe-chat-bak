import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { prepareLiteDeployment } from './prepare.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)]);

test('preparing the real route layout preserves retained handlers and is repeatable', () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'lobehub-lite-'));
  try {
    const sources = walk(path.join(root, 'src/app')).filter((file) => file.endsWith('/route.ts'));
    for (const file of sources) {
      const target = path.join(fixture, path.relative(root, file));
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(file));
    }
    const before = readFileSync(path.join(fixture, 'src/app/(backend)/api/auth/[...all]/route.ts'), 'utf8');
    const result = prepareLiteDeployment(fixture);
    const active = walk(path.join(fixture, 'src/app')).filter((file) => file.endsWith('/route.ts'));
    assert.equal(active.length, 7);
    assert.equal(result.originalRouteCount, sources.length);
    assert.equal(readFileSync(path.join(fixture, 'src/app/(backend)/api/auth/[...all]/route.liteSource.ts'), 'utf8'), before);
    assert.ok(!active.some((file) => file.includes('/api/workflows/') || file.includes('/market/')));
    const api = readFileSync(path.join(fixture, 'src/app/(lite)/api/[[...litePath]]/route.ts'), 'utf8');
    assert.ok(api.indexOf('auth/check-user') < api.indexOf('auth/[...all]'));
    assert.match(readFileSync(path.join(fixture, 'src/app/(lite)/trpc/[[...litePath]]/route.ts'), 'utf8'), /trpc\/async/);
    prepareLiteDeployment(fixture);
    assert.equal(walk(path.join(fixture, 'src/app')).filter((file) => file.endsWith('/route.ts')).length, 7);
    assert.equal(readFileSync(path.join(fixture, 'src/app/(backend)/api/auth/[...all]/route.liteSource.ts'), 'utf8'), before);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
