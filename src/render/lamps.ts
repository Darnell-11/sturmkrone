import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, PointLight, SphereGeometry, Vector3, type Object3D, type Scene } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { markShared } from './dispose';

/**
 * Laternen an den Hüften aller Figuren (Kapitän, Bewohner, Crew, Gegner).
 *  - Sichtbar: kleine Eisenlaterne an einer Schnur mit leuchtendem Glas (ein Netz mit Vertexfarben, ein Zeichenaufruf je Figur).
 *    Das Glas glüht erst abends und nachts (`lampShared.set`), tagsüber ist es nur mattes Bernsteinglas.
 *  - Licht: Echte Punktlichter kosten jedes beleuchtete Pixel etwas, deshalb gibt es nur wenige feste Lichter (`LampPool`),
 *    die jedes Bild den nächsten Laternen-Trägern folgen. Alle anderen Laternen leuchten sichtbar, ohne die Umgebung zu erhellen.
 */

const IRON: [number, number, number] = [0.12, 0.09, 0.07];
const CORD: [number, number, number] = [0.42, 0.3, 0.18];
const GLASS: [number, number, number] = [3.4, 2.1, 0.9];

/** Laterne, Aufhängepunkt im Ursprung, hängt nach unten (Meter) */
function lampGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const add = (g: BufferGeometry, col: [number, number, number], x = 0, y = 0, z = 0) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    n.translate(x, y, z);
    const count = n.attributes.position.count;
    const c = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; }
    n.setAttribute('color', new Float32BufferAttribute(c, 3));
    parts.push(n);
  };
  add(new CylinderGeometry(0.006, 0.006, 0.16, 4), CORD, 0, -0.08, 0);
  add(new ConeGeometry(0.04, 0.03, 8), IRON, 0, -0.175, 0);
  add(new SphereGeometry(0.036, 10, 8), GLASS, 0, -0.23, 0);
  add(new CylinderGeometry(0.03, 0.036, 0.02, 8), IRON, 0, -0.282, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    add(new BoxGeometry(0.008, 0.1, 0.008), IRON, Math.cos(a) * 0.034, -0.23, Math.sin(a) * 0.034);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

let geo: BufferGeometry | null = null;
const mat = markShared(new MeshBasicMaterial({ vertexColors: true }));
const WARM = new Color(1.0, 0.62, 0.28);

export const lampShared = {
  /** Abend und Nacht 0 … 1 (steuert Glühen und Licht) */
  night: 0,
  /** Tag/Nacht setzen: Glas glüht ab der Dämmerung */
  set(night: number) {
    this.night = Math.max(0, Math.min(1, (night - 0.12) / 0.55));
    mat.color.setScalar(0.3 + 0.7 * this.night);
  },
};

/** Fertige Laterne mit Schlaufe an der Hüfte; `height` in Metern (Welt) */
export function createLamp(height = 1): Mesh {
  geo ??= markShared(lampGeometry());
  const m = new Mesh(geo, mat);
  m.userData.noOutline = true;
  m.userData.lamp = true;
  m.scale.setScalar(height);
  m.castShadow = false;
  m.frustumCulled = false; // hängt an einem Skelett: die Hülle des Netzes folgt den Knochen nicht
  return m;
}

/** Wenige echte Lichter, die den nächsten Laternen-Trägern folgen */
export class LampPool {
  readonly lights: PointLight[] = [];
  private active = 0;
  private tmp = new Vector3();
  private t = 0;

  constructor(scene: Scene, readonly max = 4) {
    for (let i = 0; i < max; i++) {
      const l = new PointLight(WARM, 0, 16, 1.5);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
  }

  /** Anzahl genutzter Lichter nach Grafikstufe (0 = keine; Lichtzahl ändert sich nur beim Stufenwechsel) */
  setCount(n: number) {
    this.active = Math.max(0, Math.min(this.max, n));
    this.lights.forEach((l, i) => { l.visible = i < this.active; });
  }

  /**
   * Jedes Bild: die nächsten Träger (Position der Laterne) wählen und die Lichter dorthin setzen.
   * `lamps`: Laternen-Objekte der sichtbaren Figuren; `focus`: Kamera- oder Spielerposition.
   */
  update(dt: number, focus: Vector3, lamps: Iterable<Object3D>) {
    this.t += dt;
    const night = lampShared.night;
    if (this.active === 0) return;
    // nächste Träger bestimmen (ohne Zuteilungen je Bild: kleine Auswahl der N besten)
    const best: { o: Object3D; d: number }[] = [];
    for (const o of lamps) {
      const h = o.parent;
      if (!h) continue;
      o.getWorldPosition(this.tmp);
      const d = (this.tmp.x - focus.x) ** 2 + (this.tmp.y - focus.y) ** 2 + (this.tmp.z - focus.z) ** 2;
      if (d > 45 * 45) continue;
      if (best.length < this.active) { best.push({ o, d }); best.sort((a, b) => a.d - b.d); }
      else if (d < best[best.length - 1].d) { best[best.length - 1] = { o, d }; best.sort((a, b) => a.d - b.d); }
    }
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const b = best[i];
      if (!b || night <= 0.001) { l.intensity += (0 - l.intensity) * Math.min(1, dt * 8); continue; }
      b.o.getWorldPosition(l.position);
      l.position.y -= 0.23 * (b.o.scale.y || 1);
      // Licht etwas von der Figur weg nach außen setzen: sonst blendet es die Haut und Kleidung des Trägers aus (Abstandsabfall)
      const hd = b.o.userData.holder as Object3D | undefined;
      if (hd) {
        hd.getWorldPosition(this.tmp);
        const ox = l.position.x - this.tmp.x, oz = l.position.z - this.tmp.z, ol = Math.hypot(ox, oz) || 1;
        l.position.x += (ox / ol) * 0.55;
        l.position.z += (oz / ol) * 0.55;
        l.position.y += 0.1;
      }
      // sanftes Flackern, je Licht eigene Phase
      const fl = 1 + 0.06 * Math.sin(this.t * 9.1 + i * 2.3) + 0.04 * Math.sin(this.t * 17.3 + i);
      const want = 2.8 * night * fl;
      l.intensity += (want - l.intensity) * Math.min(1, dt * 10);
    }
  }

  /** Alle Lichter aus (Menü, Ladebild) */
  off() { for (const l of this.lights) l.intensity = 0; }
}

