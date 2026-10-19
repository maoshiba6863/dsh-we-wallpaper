import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hasSource = existsSync(resolve(root, 'src', 'client.js')) &&
  existsSync(resolve(root, 'scripts', 'build-client.mjs'));
if (hasSource) {
  const r = spawnSync(process.execPath, [resolve(root, 'scripts', 'build-client.mjs')], {
    cwd: root, stdio: 'inherit',
  });
  process.exit(r.status ?? 1);
}
console.error('prepare: no client source present (published package) — skipped build');