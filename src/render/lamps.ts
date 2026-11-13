import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, PointLight, SphereGeometry, TorusGeometry, Vector3, type Object3D, type Scene } from 'three';
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
const GLASS: [number, number, number] = [2.6, 1.55, 0.6];
const FLAME: [number, number, number] = [5.0, 3.2, 1.2];
const BRASS: [number, number, number] = [0.55, 0.4, 0.14];

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
  // Schnur, Henkel, Dach mit Knauf, Glaszylinder mit heller Flamme, Messingband, Streben und Fuß
  add(new CylinderGeometry(0.006, 0.006, 0.13, 4), CORD, 0, -0.065, 0);
  const handle = new TorusGeometry(0.036, 0.0045, 4, 10, Math.PI);
  add(handle, IRON, 0, -0.17, 0);
  add(new ConeGeometry(0.046, 0.04, 8), IRON, 0, -0.205, 0);
  add(new CylinderGeometry(0.03, 0.046, 0.012, 8), IRON, 0, -0.232, 0);
  add(new SphereGeometry(0.009, 5, 4), BRASS, 0, -0.18, 0);
  add(new CylinderGeometry(0.029, 0.034, 0.088, 10, 1, true), GLASS, 0, -0.282, 0);
  add(new SphereGeometry(0.016, 6, 5), FLAME, 0, -0.285, 0);
  add(new CylinderGeometry(0.036, 0.036, 0.008, 10), BRASS, 0, -0.238, 0);
  add(new CylinderGeometry(0.03, 0.038, 0.018, 10), IRON, 0, -0.332, 0);
  add(new CylinderGeometry(0.02, 0.02, 0.01, 8), IRON, 0, -0.346, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    add(new BoxGeometry(0.0075, 0.1, 0.0075), IRON, Math.cos(a) * 0.033, -0.286, Math.sin(a) * 0.033);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

let geo: BufferGeometry | null = null;
const mat = markShared(new MeshBasicMaterial({ vertexColors: true }));
const WARM = new Color(1.0, 0.62, 0.28);
const FIRE_L = new Color(1.0, 0.5, 0.2);

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
  /** Zuteilung: welcher Träger gehört zu welchem Licht (bleibt, bis er zu weit weg ist – dann blendet das Licht aus und wechselt) */
  private target: (Object3D | null)[] = [];
  /** Auswahl der nächsten Träger ohne Zuteilungen je Bild */
  private bestO: (Object3D | null)[] = [];
  private bestD: number[] = [];

  constructor(scene: Scene, readonly max = 4) {
    for (let i = 0; i < max; i++) {
      const l = new PointLight(WARM, 0, 16, 1.5);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
      this.target.push(null);
      this.bestO.push(null);
      this.bestD.push(0);
    }
  }

  /** Anzahl genutzter Lichter nach Grafikstufe (0 = keine; Lichtzahl ändert sich nur beim Stufenwechsel) */
  setCount(n: number) {
    this.active = Math.max(0, Math.min(this.max, n));
    this.lights.forEach((l, i) => { l.visible = i < this.active; if (i >= this.active) { l.intensity = 0; this.target[i] = null; } });
  }

  /**
   * Jedes Bild: die nächsten Träger wählen; jedes Licht bleibt bei seinem Träger, solange er unter den nächsten ist.
   * Wechselt ein Träger, blendet das Licht erst aus und springt dann (kein Aufblitzen an der falschen Stelle).
   * `lamps`: Laternen-Objekte der sichtbaren Figuren; `focus`: Kamera- oder Spielerposition.
   */
  update(dt: number, focus: Vector3, lamps: Iterable<Object3D>) {
    this.t += dt;
    const night = lampShared.night;
    const n = this.active;
    if (n === 0) return;
    // die n nächsten Träger (Einfügesortierung in festen Feldern)
    let count = 0;
    for (const o of lamps) {
      if (!o.parent) continue;
      o.getWorldPosition(this.tmp);
      const d = (this.tmp.x - focus.x) ** 2 + (this.tmp.y - focus.y) ** 2 + (this.tmp.z - focus.z) ** 2;
      if (d > 45 * 45) continue;
      if (count === n && d >= this.bestD[n - 1]) continue;
      let i = count < n ? count : n - 1;
      while (i > 0 && this.bestD[i - 1] > d) { this.bestD[i] = this.bestD[i - 1]; this.bestO[i] = this.bestO[i - 1]; i--; }
      this.bestD[i] = d; this.bestO[i] = o;
      if (count < n) count++;
    }
    const inBest = (o: Object3D | null) => { if (!o) return false; for (let k = 0; k < count; k++) if (this.bestO[k] === o) return true; return false; };
    const taken = (o: Object3D) => { for (let k = 0; k < n; k++) if (this.target[k] === o) return true; return false; };
    for (let i = 0; i < n; i++) {
      const l = this.lights[i];
      let tg = this.target[i];
      // Träger weg (außer Reichweite, entfernt, ausgeblendet)? Licht ausblenden, danach neu zuteilen
      const gone = tg !== null && (!inBest(tg) || !tg.parent);
      if (tg === null || gone) {
        if (l.intensity > 0.05) { l.intensity += (0 - l.intensity) * Math.min(1, dt * 9); if (tg !== null) { this.place(l, tg); continue; } }
        tg = null;
        for (let k = 0; k < count; k++) { const c = this.bestO[k]!; if (!taken(c)) { tg = c; break; } }
        this.target[i] = tg;
        if (tg === null) { l.intensity = 0; continue; }
      }
      this.place(l, tg);
      // sanftes Flackern, je Licht eigene Phase
      const fl = 1 + 0.06 * Math.sin(this.t * 9.1 + i * 2.3) + 0.04 * Math.sin(this.t * 17.3 + i);
      // Feuer und Fackeln (feste Träger) brennen auch am Tag ein wenig und leuchten kräftiger und weiter als Laternen an Figuren
      const fire = tg.userData.fire === true;
      const k = (tg.userData.lightK as number | undefined) ?? 1;
      const fl2 = fire ? fl + 0.12 * Math.sin(this.t * 13.7 + i * 1.9) + 0.07 * Math.sin(this.t * 31 + i) : fl;
      const want = 2.8 * (fire ? Math.max(night, 0.22) : night) * k * fl2;
      l.color.copy(fire ? FIRE_L : WARM);
      l.distance = fire ? 28 : 16;
      l.intensity += (want - l.intensity) * Math.min(1, dt * 10);
    }
  }

  /** Licht an die Laterne setzen, etwas von der Figur weg nach außen (sonst blendet es Haut und Kleidung des Trägers aus) */
  private place(l: PointLight, o: Object3D) {
    o.getWorldPosition(l.position);
    if (o.userData.fixed) return;
    l.position.y -= 0.23 * (o.scale.y || 1);
    const hd = o.userData.holder as Object3D | undefined;
    if (hd) {
      hd.getWorldPosition(this.tmp);
      const ox = l.position.x - this.tmp.x, oz = l.position.z - this.tmp.z, ol = Math.hypot(ox, oz) || 1;
      l.position.x += (ox / ol) * 0.55;
      l.position.z += (oz / ol) * 0.55;
      l.position.y += 0.1;
    }
  }

  /** Alle Lichter aus (Menü, Ladebild) */
  off() { for (let i = 0; i < this.lights.length; i++) { this.lights[i].intensity = 0; this.target[i] = null; } }
}
