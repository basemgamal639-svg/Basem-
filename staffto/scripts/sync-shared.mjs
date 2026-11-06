// Copies base44/shared/shared.ts into each backend function directory as _shared.ts.
// Base44 bundles every function directory independently, so shared code is vendored per function.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = fs.readFileSync(path.join(root, 'base44/shared/shared.ts'), 'utf8');
const header = '// AUTO-COPIED from base44/shared/shared.ts by `npm run sync:shared`. Do not edit here.\n';
const fnDir = path.join(root, 'base44/functions');
let n = 0;
for (const name of fs.readdirSync(fnDir)) {
  const dir = path.join(fnDir, name);
  if (!fs.existsSync(path.join(dir, 'function.jsonc'))) continue;
  const entry = fs.readFileSync(path.join(dir, 'entry.ts'), 'utf8');
  if (!entry.includes('./_shared.ts')) continue;
  fs.writeFileSync(path.join(dir, '_shared.ts'), header + src);
  n++;
}
console.log(`synced _shared.ts into ${n} functions`);
