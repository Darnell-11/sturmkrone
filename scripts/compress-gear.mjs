// Verkleinert die Modelle aus Blender in place (Draco-Geometrie, doppelte Daten entfernen): public/models/gear, world, ships, env, architecture, light.
// Aufruf: node scripts/compress-gear.mjs [ordner ...]   (ohne Angabe alle sechs; nach jedem neuen Export aus Blender; Skripte dafür: tools/blender/)
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const DIRS = process.argv.length > 2 ? process.argv.slice(2) : ['gear', 'world', 'ships', 'env', 'architecture', 'light'];
const dirOf = (d) => new URL(`../public/models/${d}/`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
let before = 0, after = 0;
for (const d of DIRS) {
  const dir = dirOf(d);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.glb'))) {
    const p = join(dir, f);
    before += statSync(p).size;
    const doc = await io.read(p);
    await doc.transform(dedup(), prune(), draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
    await io.write(p, doc);
    after += statSync(p).size;
    console.log(`${d}/${f}`, (statSync(p).size / 1024).toFixed(0), 'KB');
  }
}
console.log(`gesamt ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
