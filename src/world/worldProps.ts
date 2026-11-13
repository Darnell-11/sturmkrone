import { BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { preload } from '../core/preload';
import { markShared } from '../render/dispose';

/**
 * Hero-Props aus Blender (tools/blender/build_worldprops.py): Kanone auf Lafette, Anker, Laterne, Fass, Kiste;
 * dazu aus build_ships.py die Hero-Details der Schiffe (Steuerrad, Drachen-Galionsfigur). Dateien liegen in public/models/world/
 * bzw. public/models/ships/, Materialname = Rolle (wood, darkwood, iron, bronze, brass, dark).
 * Die Geometrien sind geteilt (markShared): Schiffe stellen sie als InstancedMesh auf, Hafenbauten als Einzelnetze,
 * die ihr Aufbau ohnehin je Material zusammenfasst. Fehlt eine Datei, bauen die Aufrufer ihre Ersatzform.
 */
export const WORLD_PROPS = ['kanone', 'anker', 'laterne', 'fass', 'kiste'] as const;
/** Details für die bestehenden Schiffe: detailliertes Steuerrad und geschnitzte Drachen-Galionsfigur */
export const SHIP_PROPS = ['steuerrad', 'galionsfigur_drache'] as const;
export type PropId = (typeof WORLD_PROPS)[number] | (typeof SHIP_PROPS)[number];

const BASE = `${import.meta.env.BASE_URL}models/world/`;
const SHIP_BASE = `${import.meta.env.BASE_URL}models/ships/`;

/**
 * Welche Rollen eines Modells Kontur und Schatten bekommen: nur die großen Körper. Eisenbänder, Messing und Glas sind
 * klein; Kontur und Schattenpass (je Kaskade) kosteten dort mehr Zeichenaufrufe, als sie dem Bild bringen.
 */
const OUTLINE: Record<PropId, readonly string[]> = { kanone: ['bronze', 'darkwood'], steuerrad: ['wood'], galionsfigur_drache: ['paint'], anker: ['iron'], laterne: [], fass: ['wood'], kiste: ['wood'] };
const SHADOW: Record<PropId, readonly string[]> = { kanone: ['bronze', 'darkwood'], steuerrad: ['wood'], galionsfigur_drache: ['paint'], anker: [], laterne: [], fass: ['wood'], kiste: ['wood'] };
const models = new Map<PropId, Map<string, BufferGeometry>>();

export async function loadWorldProps(names: readonly PropId[] = [...WORLD_PROPS, ...SHIP_PROPS]): Promise<void> {
  await Promise.all(names.map(async (name) => {
    try {
      const g = await preload.loadGltf(`${(SHIP_PROPS as readonly string[]).includes(name) ? SHIP_BASE : BASE}${name}.glb`);
      g.scene.updateMatrixWorld(true);
      const by = new Map<string, BufferGeometry[]>();
      g.scene.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const role = ((Array.isArray(m.material) ? m.material[0] : m.material) as Material).name.replace(/\.\d+$/, '') || 'wood';
        const geo = m.geometry.clone();
        geo.applyMatrix4(m.matrixWorld);
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
        const l = by.get(role);
        if (l) l.push(geo); else by.set(role, [geo]);
      });
      const roles = new Map<string, BufferGeometry>();
      for (const [role, list] of by) {
        const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
        if (geo) roles.set(role, markShared(geo));
      }
      models.set(name, roles);
    } catch (e) {
      console.warn(`Welt-Modell ${name} nicht geladen`, e);
    }
  }));
}

export const hasProp = (id: PropId) => models.has(id);
/** Geometrie je Rolle (leer, wenn das Modell fehlt) */
export const propRoles = (id: PropId): ReadonlyMap<string, BufferGeometry> => models.get(id) ?? new Map();

/**
 * Sammelt Aufstellungen und erzeugt je Modell und Rolle ein InstancedMesh: egal wie viele Kanonen, Fässer oder Laternen
 * ein Schiff trägt, es bleibt ein Zeichenaufruf je Rolle.
 */
export class PropBatch {
  private lists = new Map<PropId, Matrix4[]>();

  add(id: PropId, m: Matrix4) {
    const l = this.lists.get(id);
    if (l) l.push(m); else this.lists.set(id, [m]);
  }

  get size() { let n = 0; for (const l of this.lists.values()) n += l.length; return n; }

  /** material(id, rolle) liefert das Spielmaterial für eine Rolle; null = Rolle weglassen */
  flush(group: Group, material: (id: PropId, role: string) => Material | null): InstancedMesh[] {
    const out: InstancedMesh[] = [];
    for (const [id, list] of this.lists) {
      for (const [role, geo] of propRoles(id)) {
        const mat = material(id, role);
        if (!mat) continue;
        const im = new InstancedMesh(geo, mat, list.length);
        for (let i = 0; i < list.length; i++) im.setMatrixAt(i, list[i]);
        im.instanceMatrix.needsUpdate = true;
        // Der Schiffsbau markiert Netze ohne Kontur sonst auch als „ohne Schatten“: hier ausdrücklich setzen
        im.userData.noOutline = !OUTLINE[id].includes(role);
        im.castShadow = SHADOW[id].includes(role);
        im.receiveShadow = true;
        im.userData.prop = id;
        group.add(im);
        out.push(im);
      }
    }
    this.lists.clear();
    return out;
  }
}

/**
 * Ein Prop als Gruppe von Einzelnetzen (je Rolle eins), für Bauten, deren Aufbau ohnehin alle Netze je Material zusammenfasst
 * (Häfen, Dörfer): dort ergibt das einen Zeichenaufruf je Material, ebenso wie bei Instanzen.
 */
export function propGroup(id: PropId, material: (role: string) => Material | null): Group {
    const g = new Group();
    for (const [role, geo] of propRoles(id)) {
      const mat = material(role);
      if (mat) g.add(new Mesh(geo, mat));
    }
    return g;
}

/** Matrix aus Ort, Drehung um Y und gleichmäßigem Maßstab (ohne neue Objekte in der Schleife zu halten) */
export function placeMatrix(x: number, y: number, z: number, yaw = 0, scale = 1, out: Matrix4 = new Matrix4()): Matrix4 {
  const c = Math.cos(yaw) * scale, s = Math.sin(yaw) * scale;
  return out.set(c, 0, s, x, 0, scale, 0, y, -s, 0, c, z, 0, 0, 0, 1);
}
