// Entfernt die Meshopt-Kompression aus Modellen (EXT_meshopt_compression → unkomprimiert), damit das Spiel ohne WebAssembly auskommt.
// Hintergrund: Eingebundene Seiten mit strenger Sicherheitsrichtlinie (z. B. wildhunt.com.de/sturmkrone: script-src ohne 'wasm-unsafe-eval')
// verbieten WebAssembly; die KayKit-Animationsdateien waren die einzigen Modelle mit Meshopt. Aufruf: node scripts/decode-meshopt.mjs [Ordner …]
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const dirs = process.argv.length > 2 ? process.argv.slice(2) : ['assets/characters/kaykit'];
const root = new URL('../public/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let n = 0;
for (const d of dirs) {
  const dir = join(root, d);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.glb'))) {
    const p = join(dir, f);
    const doc = await io.read(p);
    const ext = doc.getRoot().listExtensionsUsed().filter((e) => e.extensionName === 'EXT_meshopt_compression');
    if (!ext.length) continue;
    const before = statSync(p).size;
    ext.forEach((e) => e.dispose());
    await io.write(p, doc);
    console.log(`${d}/${f}: ${Math.round(before / 1024)} KB -> ${Math.round(statSync(p).size / 1024)} KB`);
    n++;
  }
}
console.log(n, 'Dateien ohne Meshopt');
