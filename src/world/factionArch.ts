import { CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { FactionId } from '../data/factions';
import { factionBannerTexture } from '../render/heraldry';
import { toon } from '../render/toon';
import type { GlowSpec } from '../render/glow';
import type { Built } from './architecture';
import { archGroup, hasArch } from './envModels';
import { factionMats } from './factionMats';

/**
 * Bausteine der Weltmächte als `Built` (Modell aus public/models/factions/ in der Farbwelt der Macht, dazu Kollisions-Gitter).
 * Die Modelle liefert tools/blender/build_fraktionen.py; fehlt eine Datei, gibt es `null` (die Aufrufer greifen dann auf Eigenbau zurück).
 * Vorne ist +z, Boden bei y = 0 (wie in architecture.ts).
 */
type Collide = { boxes: Built['boxes']; circles: Built['circles']; glows?: GlowSpec[] };

const COLLIDE: Record<string, Collide> = {
  bastion_stern: { boxes: [[12.0, 8.4, 0, 0.4], [7.0, 4.2, 0, 6.2]], circles: [[1.6, 0, 7.4]] },
  kontor_giebel: { boxes: [[9.4, 7.4]], circles: [] },
  kran_rad: { boxes: [[4.0, 4.0]], circles: [] },
  bastion_granit: { boxes: [[13.6, 9.6]], circles: [[2.9, -6.3, -4.3]] },
  pavillon_barock: { boxes: [[12.6, 8.6]], circles: [] },
  dach_kuro: { boxes: [[15.2, 15.2]], circles: [] },
  tor_kuro: { boxes: [[1.9, 1.9, -2.9, 0], [1.9, 1.9, 2.9, 0]], circles: [] },
  haus_kuro: { boxes: [[8.6, 6.6]], circles: [] },
  wachturm_marine: { boxes: [], circles: [[3.4]], glows: [{ kind: 'lamp', x: 0, y: 18.6, z: 0, gy: null, size: 4.5, pool: 9 }] },
  zellenblock_marine: { boxes: [[14.6, 9.6]], circles: [] },
};

/**
 * Baustein `model` (Dateiname ohne .glb) für die Macht `id`; null, wenn das Modell nicht geladen ist. `k` skaliert Modell, Kollisions-Gitter
 * und Lichter gleichmäßig (die Festungsinseln der Endgame-Mächte bauen ihre Bastionen und Hallen größer, damit sie gewaltig wirken).
 */
export function factionBuilt(id: FactionId, model: string, k = 1): Built | null {
  if (!hasArch(model)) return null;
  const g = archGroup(model, factionMats(id));
  if (!g) return null;
  const c = COLLIDE[model] ?? { boxes: [], circles: [] };
  if (k !== 1) g.scale.setScalar(k);
  return {
    g,
    boxes: c.boxes.map(([w, d, ox = 0, oz = 0, by = 0]) => [w * k, d * k, ox * k, oz * k, by] as [number, number, number, number, number]),
    circles: c.circles.map(([r, ox = 0, oz = 0]) => [r * k, ox * k, oz * k] as [number, number, number]),
    glows: c.glows?.map((gl) => ({ ...gl, x: gl.x * k, y: gl.y * k, z: gl.z * k, gy: gl.gy == null ? gl.gy : gl.gy * k, size: gl.size === undefined ? undefined : gl.size * k, pool: gl.pool === undefined ? undefined : gl.pool * k })),
  };
}

/**
 * Wappen-Banner der Macht auf einem Mast: das Blender-Modell, sonst ein Mast mit gemaltem Tuch (render/heraldry.ts).
 * `k` skaliert (Festungen tragen größere Banner).
 */
export function factionBanner(id: FactionId, k = 1): Built {
  const model = factionBuilt(id, `banner_${id}`);
  const b: Built = model ?? { g: fallbackBanner(id), boxes: [], circles: [] };
  b.circles = [[0.55 * k]];
  if (k !== 1) b.g.scale.setScalar(k);
  return b;
}

function fallbackBanner(id: FactionId): Group {
  const g = new Group();
  const pole = new Mesh(new CylinderGeometry(0.07, 0.1, 9, 6), toon('#4A3220'));
  pole.position.y = 4.5;
  // Tuch: hochkant, gemalt (geteilte Textur, bleibt beim Abbau der Insel erhalten)
  const cloth = new Mesh(new PlaneGeometry(2.0, 4.2), new MeshBasicMaterial({ map: factionBannerTexture(id), side: DoubleSide }));
  cloth.position.set(0, 6.6, 0);
  cloth.userData.noOutline = true;
  g.add(pole, cloth);
  return g;
}
