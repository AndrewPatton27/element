// Cloudflare Pages does not upload folders named "node_modules", but `expo export -p web`
// puts font files under dist/assets/node_modules/... . Without this step the fonts 404
// (Pages serves index.html instead) and the site falls back to a system font.
// This moves dist/assets/node_modules to dist/assets/vendor and rewrites every reference.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const from = join(dist, 'assets', 'node_modules');
const to = join(dist, 'assets', 'vendor');

if (!existsSync(from)) {
  console.log('fix-pages-assets: nothing to move');
  process.exit(0);
}
// Copy then delete (a rename can fail with EPERM on Windows right after the build writes the files).
cpSync(from, to, { recursive: true });
rmSync(from, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

let files = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(js|html|json|css|map)$/.test(name)) continue;
    const text = readFileSync(p, 'utf8');
    const next = text.replaceAll('/assets/node_modules/', '/assets/vendor/');
    if (next !== text) { writeFileSync(p, next); files++; }
  }
};
walk(dist);
console.log(`fix-pages-assets: moved assets/node_modules -> assets/vendor, rewrote ${files} file(s)`);
