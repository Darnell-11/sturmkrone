import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, LatheGeometry, Mesh, MeshBasicMaterial, Object3D, PointLight, SphereGeometry, TorusGeometry, Vector2, Vector3, type Scene } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { markShared } from './dispose';
import { lampFx } from './lampMaterials';
import { flickerOf } from './glow';
import { clamp01 } from '../core/mathUtil';

/**
 * Laternen an den Hüften aller Figuren (Kapitän, Bewohner, Crew, Gegner).
 *  - Sichtbar: Schiffslaterne an einer Gürtelhalterung (ein Netz, ein Zeichenaufruf je Figur): Kuppeldach mit Kamin, gewölbtes Glas, sechs Käfigdrähte,
 *    Messingbänder, Ölbehälter mit Füßen; Eckpunktfarben tragen Altern (Ruß unten, Rost auf dem Eisen), ein Wert je Punkt (`aMat`) wählt im Shader
 *    Leder, Eisen, Messing oder Glas. Das Glas glüht erst abends und nachts (`lampShared.set`), tagsüber ist es dunkles Bernsteinglas.
 *  - Licht: Echte Punktlichter kosten jedes beleuchtete Pixel etwas, deshalb gibt es nur wenige feste Lichter (`LampPool`),
 *    die jedes Bild den nächsten Laternen-Trägern folgen. Alle anderen Laternen leuchten sichtbar, ohne die Umgebung zu erhellen.
 */

type RGB = [number, number, number];
const K_LEATHER = 0, K_IRON = 1, K_BRASS = 2, K_GLASS = 3;
const LEATHER: RGB = [0.27, 0.16, 0.09];
const IRON: RGB = [0.17, 0.15, 0.14];
const BRASS: RGB = [0.82, 0.58, 0.2];
const RUST: RGB = [0.36, 0.19, 0.09];

/** Länge des Haken-Arms nach außen (Meter vor der Skalierung): so weit hängt die Laterne neben dem Befestigungspunkt */
export const LAMP_ARM = 0.05;
/** Höhe der Flamme in der Laterne (Meter vor der Skalierung, unter dem Befestigungspunkt) */
const FLAME_Y = -0.289;

/** Zahlenrauschen 0 … 1 aus drei Koordinaten (nur beim Bauen, deterministisch) */
const hsh = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

function lathe(pts: [number, number][], seg: number): BufferGeometry {
  return new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg);
}

/**
 * Laterne an einer Gürtelhalterung, Ursprung = Befestigungspunkt AM Körper (Gürtelhöhe), der Körper liegt in +x, nach außen geht −x,
 * alles hängt nach unten (Meter, vor der Skalierung): Lederschlaufe mit Messingplatte am Gürtel, ein Haken-Arm nach außen, Öse, fünf Kettenglieder,
 * dann der Henkel der Laterne mit Scharnieren am Dach. Alles hängt zusammen (vorher stand eine starre Schnur im Leeren, die Laterne schwebte neben dem Bein).
 */
function lampGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const add = (g: BufferGeometry, kind: number, col: RGB, x = 0, y = 0, z = 0, pre?: (n: BufferGeometry) => void) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    if (pre) pre(n);
    n.translate(x, y, z);
    const pos = n.attributes.position;
    const count = pos.count;
    const c = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      // Altern: unten dunkler (Ruß und Schmutz), kleine Schwankung je Punkt, Eisen rostet fleckig
      const t = Math.min(1, Math.max(0, (py + 0.37) / 0.3));
      let f = (0.78 + 0.22 * t * t * (3 - 2 * t)) * (0.92 + 0.16 * hsh(px * 91, py * 77, pz * 53));
      let r = col[0], g = col[1], b = col[2];
      if (kind === K_IRON) {
        const rust = Math.min(1, Math.max(0, (hsh(Math.round(px * 260), Math.round(py * 260), Math.round(pz * 260)) - 0.78) * 4.5)) * 0.75;
        r += (RUST[0] - r) * rust; g += (RUST[1] - g) * rust; b += (RUST[2] - b) * rust;
      } else if (kind === K_BRASS) {
        // blank geriebene Kanten, matte Stellen dazwischen
        f *= 0.93 + 0.14 * hsh(Math.round(px * 90), Math.round(py * 90), Math.round(pz * 90));
      }
      c[i * 3] = r * f; c[i * 3 + 1] = g * f; c[i * 3 + 2] = b * f;
    }
    n.setAttribute('color', new Float32BufferAttribute(c, 3));
    n.setAttribute('aMat', new Float32BufferAttribute(new Float32Array(count).fill(kind), 1));
    parts.push(n);
  };
  const flatX = (n: BufferGeometry) => n.rotateX(Math.PI / 2);
  const OX = -LAMP_ARM;

  // Gürtelhalterung: Lederschlaufe am Gürtel, Messingplatte darauf, Haken-Arm nach außen (−x), Öse am Ende, Kette
  add(new BoxGeometry(0.008, 0.085, 0.026), K_LEATHER, LEATHER, 0.0, -0.035, 0);
  add(new BoxGeometry(0.007, 0.032, 0.038), K_BRASS, BRASS, -0.0075, -0.02, 0);
  for (const dz of [-0.013, 0.013]) add(new SphereGeometry(0.0042, 6, 5), K_BRASS, BRASS, -0.0115, -0.02, dz);
  add(new CylinderGeometry(0.0055, 0.0055, LAMP_ARM - 0.006, 7), K_IRON, IRON, -(LAMP_ARM + 0.006) / 2, -0.02, 0, (n) => n.rotateZ(Math.PI / 2));
  add(new TorusGeometry(0.0115, 0.0032, 6, 12), K_IRON, IRON, OX, -0.0325, 0, (n) => n.rotateY(Math.PI / 2));
  for (let k = 0; k < 5; k++) add(new TorusGeometry(0.0105, 0.003, 5, 10), K_IRON, IRON, OX, -0.0565 - k * 0.0235, 0, (n) => n.rotateY(k % 2 ? 0 : Math.PI / 2));
  // Ring am Scheitel des Henkels, Henkel mit zwei Scharnieraugen am Dach
  add(new TorusGeometry(0.0105, 0.003, 5, 10), K_IRON, IRON, OX, -0.1745, 0, (n) => n.rotateY(Math.PI / 2));
  add(new TorusGeometry(0.034, 0.0036, 6, 18, Math.PI), K_IRON, IRON, OX, -0.208, 0);
  for (const s of [-1, 1]) add(new SphereGeometry(0.0065, 7, 6), K_BRASS, BRASS, OX + s * 0.034, -0.208, 0);

  // Kuppeldach mit Randwulst, Kaminhals und Hut, Messingknauf
  add(lathe([[0.041, -0.236], [0.0462, -0.2345], [0.0485, -0.232], [0.0462, -0.2255], [0.041, -0.2165], [0.0345, -0.2085], [0.0275, -0.2025], [0.0215, -0.1985], [0.0165, -0.196], [0.0165, -0.1905], [0.0215, -0.188], [0.0238, -0.1845], [0.0195, -0.1815], [0.0098, -0.1796], [0, -0.1788]], 14), K_IRON, IRON, OX, 0, 0);
  add(new TorusGeometry(0.0455, 0.0038, 6, 16), K_BRASS, BRASS, OX, -0.2335, 0, flatX);
  add(new SphereGeometry(0.005, 6, 5), K_BRASS, BRASS, OX, -0.1782, 0);

  // Glas: leicht gewölbter Zylinder, oben und unten von Messingbändern gefasst, mit Käfigdrähten (sechs) und einem Schutzring
  add(lathe([[0.0285, -0.3215], [0.0302, -0.304], [0.0314, -0.283], [0.0304, -0.262], [0.0286, -0.2435]], 14), K_GLASS, [1, 1, 1], OX, 0, 0);
  add(new TorusGeometry(0.0298, 0.0034, 6, 16), K_BRASS, BRASS, OX, -0.2428, 0, flatX);
  add(new TorusGeometry(0.0302, 0.0034, 6, 16), K_BRASS, BRASS, OX, -0.3215, 0, flatX);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    add(new CylinderGeometry(0.0026, 0.0026, 0.0885, 5), K_IRON, IRON, OX + Math.cos(a) * 0.0335, -0.2805, Math.sin(a) * 0.0335);
  }
  add(new TorusGeometry(0.0324, 0.0022, 5, 16), K_IRON, IRON, OX, -0.279, 0, flatX);

  // Ölbehälter aus Messing: gewölbter Bauch mit Wulstring, drei kleine Füße
  add(lathe([[0.0, -0.352], [0.021, -0.352], [0.027, -0.349], [0.0335, -0.343], [0.0385, -0.3355], [0.039, -0.33], [0.0365, -0.3255], [0.0315, -0.3225], [0.0, -0.3225]], 14), K_BRASS, BRASS, OX, 0, 0);
  add(new TorusGeometry(0.0386, 0.003, 5, 16), K_BRASS, BRASS, OX, -0.3345, 0, flatX);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    add(new SphereGeometry(0.0062, 6, 5), K_IRON, IRON, OX + Math.cos(a) * 0.026, -0.3535, Math.sin(a) * 0.026);
  }

  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

let geo: BufferGeometry | null = null;

/** Licht für die Laternen-Körper (die Umgebung setzt es je Bild): Sonnen- oder Mondrichtung und -farbe, Umgebungslicht */
export const lampLight = {
  sunDir: { value: new Vector3(0.3, 1, 0.2).normalize() },
  sunCol: { value: new Color(0.8, 0.75, 0.65) },
  amb: { value: new Color(0.35, 0.4, 0.5) },
};

/**
 * Ein Material für Leder, Eisen, Messing und Glas (Wert `aMat` je Eckpunkt): einfaches Licht aus Sonne und Umgebung, Glanz auf Metall,
 * Randlicht, nachts warmer Schein der eigenen Flamme auf Dach, Käfig und Behälter; Glas glüht nachts von innen und flackert leise.
 */
const mat = markShared(new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
mat.onBeforeCompile = (shader) => {
  shader.uniforms.uSunDir = lampLight.sunDir;
  shader.uniforms.uSunCol = lampLight.sunCol;
  shader.uniforms.uAmb = lampLight.amb;
  shader.uniforms.uNight = lampFx.uNight;
  shader.uniforms.uTime = lampFx.uTime;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      attribute float aMat;
      varying float vMat;
      varying vec3 vWn;
      varying vec3 vWp;
      varying vec3 vLp;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vMat = aMat;
      vLp = position;
      vWn = normalize(mat3(modelMatrix) * normal);
      vWp = (modelMatrix * vec4(position, 1.0)).xyz;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform vec3 uSunDir;
      uniform vec3 uSunCol;
      uniform vec3 uAmb;
      uniform float uNight;
      uniform float uTime;
      varying float vMat;
      varying vec3 vWn;
      varying vec3 vWp;
      varying vec3 vLp;`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      {
        const vec3 FC = vec3(${(-LAMP_ARM).toFixed(4)}, ${FLAME_Y.toFixed(4)}, 0.0);
        vec3 n = normalize(vWn);
        if (!gl_FrontFacing) n = -n;
        vec3 v = normalize(cameraPosition - vWp);
        float ndv = clamp(dot(n, v), 0.0, 1.0);
        vec3 l = normalize(uSunDir);
        float w = dot(n, l) * 0.5 + 0.5;
        vec3 light = uAmb * (0.75 + 0.25 * n.y) + uSunCol * w * w;
        float df = distance(vLp, FC);
        float night = clamp(uNight, 0.0, 1.0);
        // nachts leuchtet die Flamme Dach, Käfig und Behälter von innen warm an
        vec3 inner = vec3(1.0, 0.52, 0.18) * night * 1.4 * (1.0 - smoothstep(0.02, 0.14, df));
        float metal = step(0.5, vMat) * (1.0 - step(2.5, vMat));
        float brass = step(1.5, vMat) * (1.0 - step(2.5, vMat));
        float glass = step(2.5, vMat);
        vec3 h = normalize(l + v);
        float sun = max(max(uSunCol.r, uSunCol.g), uSunCol.b);
        float sp = pow(max(dot(n, h), 0.0), mix(26.0, 54.0, brass)) * (0.3 + 0.7 * brass) * (0.25 + sun);
        vec3 spc = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.82, 0.5), brass);
        float rim = pow(1.0 - ndv, 3.0);
        vec3 col = diffuseColor.rgb * (light + inner) + spc * sp * metal + uAmb * rim * (0.2 + 0.5 * metal);
        // Glas: tags dunkles Bernsteinglas mit Glanz, nachts von innen glühend (Kern auf Flammenhöhe am hellsten, zum Rand kühler)
        float fl = 0.93 + 0.07 * sin(uTime * 7.3 + vWp.x * 3.1 + vWp.z * 2.3);
        float core = exp(-df * df * 420.0);
        vec3 gDay = vec3(0.4, 0.23, 0.08) * (0.4 + 0.55 * ndv) * (0.35 + 0.35 * min(light, vec3(1.6))) + vec3(0.9, 0.7, 0.35) * core * 0.12;
        vec3 gNight = (vec3(1.3, 0.56, 0.13) * (0.5 + 0.7 * ndv) + vec3(1.9, 1.05, 0.34) * core) * fl;
        vec3 g = mix(gDay, gNight, night) + vec3(1.0, 0.95, 0.85) * pow(max(dot(n, h), 0.0), 60.0) * sun * 0.6 * (1.0 - night);
        diffuseColor.rgb = mix(col, g, glass);
      }`);
};
mat.customProgramCacheKey = () => 'sk-lamp2';
const WARM = new Color(1.0, 0.62, 0.28);
const FIRE_L = new Color(1.0, 0.5, 0.2);

export const lampShared = {
  /** Abend und Nacht 0 … 1 (steuert Glühen und Licht) */
  night: 0,
  /** Tag/Nacht setzen: Glas glüht ab der Dämmerung */
  set(night: number) {
    this.night = clamp01((night - 0.12) / 0.55);
    lampFx.uNight.value = this.night;
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
  // Ankerpunkt auf Flammenhöhe für den Lichthof: die Laterne hängt LAMP_ARM neben dem Befestigungspunkt
  const anchor = new Object3D();
  anchor.position.set(-LAMP_ARM, FLAME_Y, 0);
  m.add(anchor);
  m.userData.glowAnchor = anchor;
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

  constructor(scene: Scene, readonly max = 6) {
    for (let i = 0; i < max; i++) {
      const l = new PointLight(WARM, 0, 16, 1.5);
      l.castShadow = false;
      l.shadow.mapSize.set(512, 512);
      l.shadow.camera.near = 0.3;
      l.shadow.bias = -0.0008;
      l.shadow.normalBias = 0.04;
      l.shadow.radius = 3;
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
   * Das erste Licht wirft Schatten (Würfel-Schattenkarte, 512²): es gehört immer dem nächsten Feuer oder der nächsten Lampe, damit
   * Kisten, Figuren und Geländer Schatten ins Feuerlicht werfen. Das Flag bleibt fest (ein Wechsel würde alle Materialien neu übersetzen);
   * am Tag friert die Karte ein (`autoUpdate` aus), kostet dann nichts.
   */
  setShadows(on: boolean) {
    this.shadowOn = on;
    for (let i = 0; i < this.lights.length; i++) this.lights[i].castShadow = on && i === 0;
  }
  private shadowOn = false;

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
      // Feuer und Fackeln haben Vorrang vor Laternen an Figuren (zählen, als wären sie näher)
      const d = ((this.tmp.x - focus.x) ** 2 + (this.tmp.y - focus.y) ** 2 + (this.tmp.z - focus.z) ** 2) * (o.userData.fire === true ? 0.5 : 1);
      if (d > 45 * 45) continue;
      if (count === n && d >= this.bestD[n - 1]) continue;
      let i = count < n ? count : n - 1;
      while (i > 0 && this.bestD[i - 1] > d) { this.bestD[i] = this.bestD[i - 1]; this.bestO[i] = this.bestO[i - 1]; i--; }
      this.bestD[i] = d; this.bestO[i] = o;
      if (count < n) count++;
    }
    const inBest = (o: Object3D | null) => { if (!o) return false; for (let k = 0; k < count; k++) if (this.bestO[k] === o) return true; return false; };
    const taken = (o: Object3D) => { for (let k = 0; k < n; k++) if (this.target[k] === o) return true; return false; };
    // Schattenlicht (Index 0) gehört dem nächsten Träger: Ziele samt Helligkeit tauschen, wenn ein anderer deutlich näher ist
    if (this.shadowOn && count > 0) {
      const near = this.bestO[0];
      const j = near ? this.target.indexOf(near) : -1;
      if (j > 0 && j < n) {
        const t0 = this.target[0];
        let d0 = Infinity;
        if (t0 && t0.parent) { t0.getWorldPosition(this.tmp); d0 = ((this.tmp.x - focus.x) ** 2 + (this.tmp.y - focus.y) ** 2 + (this.tmp.z - focus.z) ** 2) * (t0.userData.fire === true ? 0.5 : 1); }
        if (this.bestD[0] < d0 * 0.6) {
          this.target[0] = near; this.target[j] = t0;
          const li = this.lights[0].intensity; this.lights[0].intensity = this.lights[j].intensity; this.lights[j].intensity = li;
        }
      }
    }
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
      // Flackern im Takt der sichtbaren Flamme (gleiche Funktion und Phase wie das GlowSystem); Laternen ruhiger
      const seed = (tg.userData.seed as number | undefined) ?? i * 7.3;
      const fl = 1 + (flickerOf(this.t, seed) - 1) * 0.3;
      // Feuer und Fackeln (feste Träger) brennen auch am Tag ein wenig und leuchten kräftiger und weiter als Laternen an Figuren
      const fire = tg.userData.fire === true;
      const k = (tg.userData.lightK as number | undefined) ?? 1;
      const fl2 = fire ? 1 + (flickerOf(this.t, seed) - 1) * 1.15 : fl;
      const want = (fire ? 5.2 : 3.4) * (fire ? Math.max(night, 0.22) : night) * k * fl2;
      l.color.copy(fire ? FIRE_L : WARM);
      l.distance = fire ? 28 : 20;
      l.intensity += (want - l.intensity) * Math.min(1, dt * 10);
    }
    // Schattenkarte nur rechnen, solange das Licht leuchtet
    if (this.shadowOn) this.lights[0].shadow.autoUpdate = this.lights[0].intensity > 0.25 || !this.lights[0].shadow.map;
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
