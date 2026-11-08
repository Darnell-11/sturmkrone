// Bereitet die CC0-Figuren aus VRoid Studio (VRM 0.x) für das Spiel auf.
// Aufruf: node scripts/build-vroid.mjs <Quelle.vrm> <Ziel.glb>
// Quelle: https://opengameart.org/content/vroid-studio-cc0-models (HairSample_Male / HairSample_Female, CC0, VRoid Project)
//
// - Teile mit gleichem Material zusammenfassen (die Haare bestehen sonst aus über 100 Einzelteilen)
// - Normalen-, Matcap- und Vorschaubilder entfernen (der Anime-Shader des Spiels braucht nur die Farben)
// - Texturen auf Webgröße bringen und als WebP speichern
// - Körper und Haare behutsam vereinfachen (das Gesicht mit seinen Mimiken bleibt unangetastet)
// - Geometrie mit Draco komprimieren (das Spiel lädt mit DRACOLoader, Decoder unter public/libs/draco)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, join, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('Aufruf: node scripts/build-vroid.mjs <Quelle.vrm> <Ziel.glb>'); process.exit(1); }

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const doc = await io.read(src);
const root = doc.getRoot();

for (const mat of root.listMaterials()) {
  mat.setNormalTexture(null);
  mat.setOcclusionTexture(null);
  mat.setMetallicRoughnessTexture(null);
  mat.setEmissiveTexture(null);
}

await MeshoptSimplifier.ready;
await doc.transform(
  dedup(),
  join({ keepNamed: true }),
  weld(),
  // Gesicht nicht vereinfachen (Mimik-Formen), Körper und Haare schon
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.6, error: 0.002, lockBorder: true }),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
  draco(),
);

const prims = root.listMeshes().map((m) => `${m.getName()}:${m.listPrimitives().length}`).join(', ');
const tex = root.listTextures().length;
await io.write(out, doc);
console.log(`fertig: ${out} · Teile ${prims} · Texturen ${tex}`);
