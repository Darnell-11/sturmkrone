// Baut public/libs/draco/draco-js-worker.js: Draco-Decoder (reines JavaScript, ohne WebAssembly) und der Worker-Code von three.js in EINER Datei.
// Warum: Seiten mit strenger Sicherheitsrichtlinie (z. B. wildhunt.com.de/sturmkrone: worker-src 'self', script-src ohne 'wasm-unsafe-eval')
// verbieten Blob-Worker und WebAssembly; der Standard-DRACOLoader braucht beides. Diese Datei läuft als normaler Worker von derselben Adresse.
// Aufruf nach einem Update von three: node scripts/build-draco-worker.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../node_modules/three/examples/jsm/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const decoder = readFileSync(dir + 'libs/draco/draco_decoder.js', 'utf8');
const loader = readFileSync(dir + 'loaders/DRACOLoader.js', 'utf8');
const a = loader.indexOf('function DRACOWorker()');
if (a < 0) throw new Error('DRACOWorker nicht gefunden');
const exp = loader.indexOf('\nexport ', a);
// DRACOWorker steht am Ende der Datei vor dem Export: Rumpf zwischen der ersten "{" und der letzten schließenden "}" der Funktion
const fn = loader.slice(a, exp > 0 ? exp : undefined);
const inner = fn.slice(fn.indexOf('{') + 1, fn.lastIndexOf('}'));
const out = ['/* draco decoder (JS) */', decoder, '', '/* worker */', inner].join('\n');
const target = new URL('../public/libs/draco/draco-js-worker.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
writeFileSync(target, out);
console.log('geschrieben:', target, Math.round(out.length / 1024), 'KB');
