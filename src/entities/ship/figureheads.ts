import { BufferAttribute, BufferGeometry, Group, Mesh, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { preload } from '../../core/preload';
import { FIGUREHEAD_DEFS, FIGUREHEAD_MODELS, type FigureheadModelId } from '../../data/figureheads';
import { markShared } from '../../render/dispose';
import { toon } from '../../render/toon';
import { FLAGSHIP_FINISH } from '../../graphics/pbrMaterialForge';

/**
 * Galionsfiguren aus Blender: laden (Rollen → Geometrie, mit Ambient-Occlusion als Eckpunktfarbe) und mit hochwertigen PBR-Oberflächen
 * bekleiden: dunkles Mahagoni, Blattgold (metallisch 0,85, rau 0,28), patinierte Bronze, Bein, dunkle Hohlräume und Edelstein-Augen, die bei
 * großen Schiffen glimmen. Die Oberflächen laufen über das Toon-Material des Spiels (`toon()` mit Metall und Rauheit: Spiegelung des Himmels,
 * Schatten-Kaskaden und Konturen bleiben einheitlich); alle Materialien und Geometrien sind geteilt (`markShared`).
 */
const BASE = `${import.meta.env.BASE_URL}models/figureheads/`;
const models = new Map<FigureheadModelId, Map<string, BufferGeometry>>();

export async function loadFigureheads(ids: readonly FigureheadModelId[] = FIGUREHEAD_MODELS): Promise<void> {
  await Promise.all(ids.map(async (id) => {
    if (models.has(id)) return;
    try {
      const g = await preload.loadGltf(`${BASE}${id}.glb`);
      g.scene.updateMatrixWorld(true);
      const by = new Map<string, BufferGeometry[]>();
      g.scene.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const role = ((Array.isArray(m.material) ? m.material[0] : m.material) as Material).name.replace(/\.\d+$/, '') || 'gold';
        const geo = m.geometry.clone();
        geo.applyMatrix4(m.matrixWorld);
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') geo.deleteAttribute(k);
        // Ambient-Occlusion als Eckpunktfarbe; fehlt sie, bleibt das Teil hell (Weiß)
        if (!geo.getAttribute('color')) {
          const n = geo.getAttribute('position').count;
          geo.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).fill(1), 3));
        }
        const l = by.get(role);
        if (l) l.push(geo); else by.set(role, [geo]);
      });
      const roles = new Map<string, BufferGeometry>();
      for (const [role, list] of by) {
        // getrennte Netze verschmelzen; Attribute müssen übereinstimmen (alle tragen Position, Normale, UV, Farbe als Float)
        for (const geo of list) { const c = geo.getAttribute('color'); if (c.itemSize === 4) { const a = new Float32Array(c.count * 3); for (let i = 0; i < c.count; i++) { a[i * 3] = c.getX(i); a[i * 3 + 1] = c.getY(i); a[i * 3 + 2] = c.getZ(i); } geo.setAttribute('color', new BufferAttribute(a, 3)); } }
        const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
        if (geo) roles.set(role, markShared(geo));
      }
      models.set(id, roles);
    } catch (e) {
      console.warn(`Galionsfigur ${id} nicht geladen`, e);
    }
  }));
}

// ---------- PBR-Oberflächen (geteilt) ----------
let mats: Record<'wood' | 'gold' | 'bronze' | 'bone' | 'dark' | 'gem' | 'gemGlow' | 'ebony' | 'iron', Material> | null = null;
function materials() {
  if (mats) return mats;
  const ao = { vertexColors: true as const };
  mats = {
    // geschnitztes dunkles Mahagoni, leicht seidig
    wood: markShared(toon({ color: '#7A4426', roughness: 0.55, metalness: 0.04, spec: 0.4, ...ao })),
    // angelaufenes Blattgold
    gold: markShared(toon({ color: '#FFB93A', spec: 1, metalness: 0.85, roughness: 0.28, ...ao })),
    // patinierte Bronze: grünspanblau, matter
    bronze: markShared(toon({ color: '#4E9580', spec: 0.9, metalness: 0.7, roughness: 0.46, ...ao })),
    bone: markShared(toon({ color: '#D9CFB6', roughness: 0.55, metalness: 0, spec: 0.3, ...ao })),
    dark: markShared(toon({ color: '#17110E', roughness: 0.8, metalness: 0, ...ao })),
    // Edelstein-Augen: glatt, leicht selbstleuchtend; große Schiffe tragen die glimmende Fassung
    gem: markShared(toon({ color: '#B3161C', emissive: '#4A0508', roughness: 0.08, metalness: 0.2, spec: 1 })),
    gemGlow: markShared(toon({ color: '#E0222A', emissive: '#FF3A2A', roughness: 0.06, metalness: 0.2, spec: 1 })),
    // 4.7D: rabenschwarzer Lack und dunkles Schmiedeeisen (gekröntes Seeungeheuer der Schwarzen Krone, graphics/pbrMaterialForge.ts)
    ebony: markShared(toon({ color: FLAGSHIP_FINISH.ebony.color, roughness: FLAGSHIP_FINISH.ebony.roughness, metalness: FLAGSHIP_FINISH.ebony.metalness, spec: FLAGSHIP_FINISH.ebony.spec, forge: FLAGSHIP_FINISH.ebony.forge, ...ao })),
    iron: markShared(toon({ color: FLAGSHIP_FINISH.iron.color, roughness: FLAGSHIP_FINISH.iron.roughness, metalness: FLAGSHIP_FINISH.iron.metalness, spec: FLAGSHIP_FINISH.iron.spec, forge: FLAGSHIP_FINISH.iron.forge, ...ao })),
  };
  return mats;
}

/** 4.7D: glimmende Amethyst-Augen des gekrönten Seeungeheuers (Schwarzbarts Willenskraft) */
let kronGemMat: Material | null = null;
function kronGem(): Material {
  const f = FLAGSHIP_FINISH.gem;
  return (kronGemMat ??= markShared(toon({ color: f.color, emissive: f.emissive, roughness: f.roughness, metalness: f.metalness, spec: f.spec })));
}

/**
 * Figur als Gruppe von Einzelnetzen (je Rolle eins; der Schiffsbau verschmilzt sie je Material mit dem Rumpf): Fuß am Ursprung, Blick nach +Z.
 * `L`: Schiffslänge, bestimmt, ob die Edelstein-Augen glimmen. null, wenn das Modell fehlt (Aufrufer nimmt dann den Ersatz aus Grundformen).
 */
export function buildFigurehead(id: FigureheadModelId, scale: number, L: number): Group | null {
  const roles = models.get(id);
  if (!roles) return null;
  const m = materials();
  const g = new Group();
  for (const [role, geo] of roles) {
    const mat = role === 'gem' ? (id === 'crowned_kraken' ? kronGem() : L >= FIGUREHEAD_DEFS[id].gemGlowFrom ? m.gemGlow : m.gem) : (m as Record<string, Material>)[role] ?? m.gold;
    const mesh = new Mesh(geo, mat);
    mesh.castShadow = role !== 'gem';
    mesh.userData.figurehead = id;
    g.add(mesh);
  }
  g.scale.setScalar(scale);
  g.userData.figurehead = id;
  return g;
}
