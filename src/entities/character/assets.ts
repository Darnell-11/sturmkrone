import type { AnimationClip, Object3D, SkinnedMesh } from 'three';
import { preload } from '../../core/preload';
import { Vector3 } from 'three';
import { ANIM_FILES } from '../../data/animations';
import { loadVroid, type VroidBase } from './vroid';

const BASE = `${import.meta.env.BASE_URL}assets/characters/kaykit/`;

/** Skelett-Vorlage und alle Animationen, einmal geladen und von allen Figuren geteilt. */
export class CharacterAssets {
  /** Anime-Grundfiguren (VRoid, CC0); null = Ersatzfiguren aus Bausteinen */
  vroid: { male: VroidBase; female: VroidBase } | null = null;

  private constructor(
    readonly rig: Object3D,
    readonly boneIndex: Record<string, number>,
    readonly clips: Map<string, AnimationClip>,
  ) {}

  static async load(onProgress?: (done: number, total: number) => void): Promise<CharacterAssets> {
    const files = ['Mannequin_Medium', ...ANIM_FILES];
    let done = 0;
    // über die zentrale Pipeline (Draco/Meshopt/KTX2, Fortschritt nach Bytes)
    const results = await Promise.all(files.map(async (f) => {
      const g = await preload.loadGltf(`${BASE}${f}.glb`);
      onProgress?.(++done, files.length);
      return g;
    }));
    const rig = results[0].scene;
    let skinned: SkinnedMesh | null = null;
    rig.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh && !skinned) skinned = o as SkinnedMesh; });
    if (!skinned) throw new Error('Skelett-Vorlage ohne Skin');
    const boneIndex: Record<string, number> = {};
    (skinned as SkinnedMesh).skeleton.bones.forEach((b, i) => { boneIndex[b.name] = i; });
    const clips = new Map<string, AnimationClip>();
    for (const r of results.slice(1)) {
      for (const c of r.animations) {
        // Positionsspuren außer der Hüfte entfernen (Figuren mit anderen Maßen sollen nicht verzerren)
        c.tracks = c.tracks.filter((t) => (!t.name.endsWith('.position') || t.name.startsWith('hips.')) && !t.name.endsWith('.scale'));
        if (!clips.has(c.name)) clips.set(c.name, c);
      }
    }
    const assets = new CharacterAssets(rig, boneIndex, clips);
    assets.vroid = await loadVroid(rig, clips, new Vector3(0, 0.096, -0.058));
    return assets;
  }
}
