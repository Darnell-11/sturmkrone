import { BufferGeometry, Group, Mesh, type ColorRepresentation, type Material } from 'three';
import { markShared } from '../render/dispose';
import { preload } from '../core/preload';
import { toon } from '../render/toon';
import { windify } from '../render/wind';

/**
 * Insel-Flora und Felsen aus Blender (tools/blender/build_env.py), Dateien in public/models/env/.
 * Materialname = Rolle (trunk, leaf, leaf2, leaf3, nut, drift, rock); die Farben setzt der Aufrufer je Biome-Palette.
 * Das Farbattribut der Datei (COLOR_0) trägt die Ambient-Occlusion je Eckpunkt: dunkler Kronenkern, helle Blattspitzen.
 * Die Modelle laufen als Vorlagen (Proto) durch die Instanz-Pipeline in vegetation.ts; fehlt eine Datei, bleibt die alte Eigenbau-Form.
 */
export const ENV_MODELS = [
  'palme_1', 'palme_2', 'palme_3', 'palme_4', 'laubbaum_1', 'laubbaum_2', 'laubbaum_3', 'busch_1', 'busch_2', 'farn_1', 'farn_2',
  'treibholz_1', 'treibholz_2', 'treibholz_3', 'fels_1', 'fels_2', 'fels_3', 'klippe_1', 'klippe_2',
  'palme_5', 'palme_6', 'laubbaum_4', 'laubbaum_5', 'laubbaum_6', 'birke_1', 'birke_2', 'kiefer_1', 'kiefer_2', 'kiefer_3', 'banane_1', 'banane_2', 'agave_1',
  'schilf_1', 'schilf_2', 'gras_1', 'gras_2', 'gras_3', 'blume_1', 'blume_2', 'blume_3', 'busch_3', 'busch_4', 'fels_4', 'fels_5',
  'kiesel_1', 'kiesel_2', 'kiesel_3', 'strandgras_1', 'strandgras_2', 'stumpf_1', 'stamm_1', 'pilz_1',
] as const;

const BASE = `${import.meta.env.BASE_URL}models/env/`;
const ARCH_BASE = `${import.meta.env.BASE_URL}models/architecture/`;
/** Bauten aus Blender (tools/blender/build_arch.py): Hütte, Steinhaus, Taverne, Steg-Modul, Torbogen */
export const ARCH_MODELS = ['haus_huette', 'haus_stein', 'haus_taverne', 'steg_modul', 'bogen', 'feuerstelle', 'feuerkorb', 'fackel', 'laternenpfahl',
  'kajuete_schreibtisch', 'kajuete_stuhl', 'kajuete_koje', 'kajuete_kartentisch', 'kajuete_regal', 'kajuete_truhe', 'kajuete_globus', 'kajuete_lampe', 'kajuete_teppich',
  'haus_fachwerk', 'haus_kolonial', 'lagerhaus', 'kapelle', 'marktstand', 'kran', 'turm_zinnen', 'mauer_zinnen', 'torhaus', 'bergfried', 'leuchtturm', 'brunnen'] as const;
/**
 * Bausteine der Weltmächte (tools/blender/build_fraktionen.py), Dateien in public/models/factions/: Wappen-Banner je Macht, Sternbastion (England),
 * Kontor mit Treppengiebel und Tretradkran (Niederlande), Granitbastion (Deutschland), Barockpavillon (Frankreich), Burgturm, Tor und Haus mit
 * geschwungenen Dächern (Kurogane), Wachturm und Zellenblock (Marine). Farben je Macht setzt world/factionMats.ts über die Rollen.
 */
export const FACTION_MODELS = ['banner_england', 'banner_niederlande', 'banner_deutschland', 'banner_frankreich', 'banner_kurogane', 'banner_marine',
  'bastion_stern', 'kontor_giebel', 'kran_rad', 'bastion_granit', 'pavillon_barock', 'dach_kuro', 'tor_kuro', 'haus_kuro', 'wachturm_marine', 'zellenblock_marine'] as const;
const FACTION_SET = new Set<string>(FACTION_MODELS);
const FACTION_BASE = `${import.meta.env.BASE_URL}models/factions/`;
/** Prunkmöbel der Kapitänskajüten (tools/blender/build_kajuete2.py) */
const KAJUETE2 = ['kajuete_himmelbett', 'kajuete_kronleuchter', 'kajuete_anrichte', 'kajuete_fensterbank', 'kajuete_waffenwand', 'kajuete_gemaelde', 'kajuete_ofen', 'kajuete_tafel'];
/** Kajütenmöbel liegen in public/models/ships/ (tools/blender/build_kajuete.py) */
const SHIP_FURNITURE_BASE = `${import.meta.env.BASE_URL}models/ships/`;
/** Davon liegen diese in public/models/light/ (tools/blender/build_light.py) */
const LIGHT_MODELS = new Set(['feuerstelle', 'feuerkorb', 'fackel', 'laternenpfahl']);
const LIGHT_BASE = `${import.meta.env.BASE_URL}models/light/`;
const arch = new Map<string, EnvPart[]>();
interface EnvPart { geo: BufferGeometry; role: string }
const models = new Map<string, EnvPart[]>();

export async function loadEnvModels(names: readonly string[] = ENV_MODELS): Promise<void> {
  await Promise.all(names.map(async (name) => {
    if (models.has(name)) return;
    try {
      const g = await preload.loadGltf(`${BASE}${name}.glb`);
      g.scene.updateMatrixWorld(true);
      const parts: EnvPart[] = [];
      g.scene.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const role = ((Array.isArray(m.material) ? m.material[0] : m.material) as Material).name.replace(/\.\d+$/, '') || 'leaf';
        const geo = m.geometry.clone();
        geo.applyMatrix4(m.matrixWorld);
        parts.push({ geo, role });
      });
      models.set(name, parts);
    } catch (e) {
      console.warn(`Insel-Modell ${name} nicht geladen`, e);
    }
  }));
}

export const hasEnv = (name: string) => models.has(name);

export async function loadArchModels(names: readonly string[] = [...ARCH_MODELS, ...FACTION_MODELS, ...KAJUETE2]): Promise<void> {
  await Promise.all(names.map(async (name) => {
    if (arch.has(name)) return;
    try {
      const g = await preload.loadGltf(`${FACTION_SET.has(name) ? FACTION_BASE : LIGHT_MODELS.has(name) ? LIGHT_BASE : name.startsWith('kajuete_') ? SHIP_FURNITURE_BASE : ARCH_BASE}${name}.glb`);
      g.scene.updateMatrixWorld(true);
      const parts: EnvPart[] = [];
      g.scene.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const role = ((Array.isArray(m.material) ? m.material[0] : m.material) as Material).name.replace(/\.\d+$/, '') || 'wall';
        const geo = m.geometry.clone();
        geo.applyMatrix4(m.matrixWorld);
        parts.push({ geo: markShared(geo), role });
      });
      arch.set(name, parts);
    } catch (e) {
      console.warn(`Bau-Modell ${name} nicht geladen`, e);
    }
  }));
}

export const hasArch = (name: string) => arch.has(name);
/** Rohteile (Geometrie je Rolle) eines Baus, für Aufrufer, die selbst zusammenfassen (Kajüteneinrichtung) */
export const archParts = (name: string): readonly { geo: BufferGeometry; role: string }[] | undefined => arch.get(name);

/**
 * Ein Bau als Gruppe von Einzelnetzen (je Rolle eins). Die Geometrien sind geteilt: der Siedlungsaufbau fasst alle Netze je
 * Material zusammen (mergeByMaterial) und behält dabei das Farbattribut (Ambient-Occlusion), wenn das Material Eckpunktfarben nutzt.
 */
export function archGroup(name: string, material: (role: string) => Material | null): Group | null {
  const parts = arch.get(name);
  if (!parts) return null;
  const g = new Group();
  for (const p of parts) {
    const mat = material(p.role);
    if (mat) g.add(new Mesh(p.geo, mat));
  }
  return g;
}

/**
 * Eine Gruppe aus Einzelnetzen (je Rolle eins) mit Toon-Materialien. Die Geometrien sind Kopien: der Vorlagenbau
 * (protoFrom) gibt sie nach dem Verschmelzen frei. wind = Ausschlag an der Spitze in Metern (0 = kein Wind).
 */
export function envGroup(name: string, color: (role: string) => ColorRepresentation, wind = 0): Group | null {
  const parts = models.get(name);
  if (!parts) return null;
  const g = new Group();
  let top = 0.01;
  for (const p of parts) {
    const m = new Mesh(p.geo.clone(), toon(color(p.role)));
    // Stämme, Äste und Treibholz bekommen im Shader Borke (Rillen als Bump), Kokosnüsse bleiben glatt
    if (p.role === 'trunk' || p.role === 'drift') m.userData.bark = true;
    if (p.role === 'nut') m.userData.surf = 0;
    p.geo.computeBoundingBox();
    top = Math.max(top, p.geo.boundingBox!.max.y);
    g.add(m);
  }
  if (wind > 0) windify(g, wind, top + 0.4);
  return g;
}
