// Cloudflare Pages does not upload folders named "node_modules", but `expo export -p web`
// puts font files under dist/assets/node_modules/... . Without this step the fonts 404
// (Pages serves index.html instead) and the site falls back to a system font.
// This moves dist/assets/node_modules to dist/assets/vendor and rewrites every reference.
//
// It also injects the Cloudflare Web Analytics beacon into index.html. Expo's "single"
// web output (app.json web.output) uses a built-in HTML template and ignores app/+html.tsx,
// so a post-build injection is the only place the tag can go for every deploy.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';

injectCloudflareBeacon(dist);

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

// Insert the Cloudflare Web Analytics beacon just before </head> in index.html.
// Idempotent: re-running the script does not add a second copy.
function injectCloudflareBeacon(outDir) {
  const CF_TOKEN = 'ec307be9fdde492eac623e33156c0a88';
  const beacon =
    `<!-- Cloudflare Web Analytics -->`
    + `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" `
    + `data-cf-beacon='{"token": "${CF_TOKEN}"}'></script>`
    + `<!-- End Cloudflare Web Analytics -->`;
  const htmlPath = join(outDir, 'index.html');
  if (!existsSync(htmlPath)) {
    console.log('fix-pages-assets: index.html not found, skipping Cloudflare beacon');
    return;
  }
  const html = readFileSync(htmlPath, 'utf8');
  if (html.includes('static.cloudflareinsights.com/beacon.min.js')) {
    console.log('fix-pages-assets: Cloudflare beacon already present');
    return;
  }
  if (!html.includes('</head>')) {
    console.log('fix-pages-assets: no </head> in index.html, skipping Cloudflare beacon');
    return;
  }
  writeFileSync(htmlPath, html.replace('</head>', `${beacon}</head>`));
  console.log('fix-pages-assets: injected Cloudflare Web Analytics beacon');
}
