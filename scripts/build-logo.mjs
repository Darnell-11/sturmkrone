// Erzeugt aus dem Sturmkrone-Wappen (src/ui/logoSvg.ts) das App-Symbol `public/favicon.svg` und das Wappen im Ladebildschirm von index.html.
// Aufruf: `node scripts/build-logo.mjs` (danach `npm run icons` für die PNG-Symbole der App).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { crestSvg } from '../src/ui/logoSvg.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const inner = (svg) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

// App-Symbol: Wappen ohne Filter auf dunklem Mahagoni-Grund mit runden Ecken
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><clipPath id="r"><rect width="512" height="512" rx="112"/></clipPath><radialGradient id="bg" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#3a2013"/><stop offset="1" stop-color="#150a06"/></radialGradient></defs>
  <g clip-path="url(#r)">
    <rect width="512" height="512" fill="url(#bg)"/>
    <g transform="translate(34 34) scale(1.1925)">${inner(crestSvg({ flat: true, id: 'ico' }))}</g>
  </g>
</svg>
`;
writeFileSync(join(root, 'public', 'favicon.svg'), icon);

// Ladebildschirm: das Wappen steht fest in index.html, damit es vor allen Skripten da ist
const html = readFileSync(join(root, 'index.html'), 'utf8');
const crest = crestSvg({ flat: true, id: 'boot' });
const marked = /(<!-- wappen:start -->)[\s\S]*?(<!-- wappen:end -->)/;
if (!marked.test(html)) throw new Error('Marken <!-- wappen:start --> … <!-- wappen:end --> fehlen in index.html');
writeFileSync(join(root, 'index.html'), html.replace(marked, `$1\n      <div class="ld-crest">${crest.replace(/\n\s*/g, '')}</div>\n      $2`));
console.log('favicon.svg und index.html (Wappen) geschrieben');
