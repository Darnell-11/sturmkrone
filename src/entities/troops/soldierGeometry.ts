// Soldaten der Massentruppen (Phase 4.4A): EIN geteiltes Netz je Truppentyp und Uniform, gezeichnet als InstancedMesh (troopRender.ts). Statt Zylindern
// und Kisten: verjüngte Gliedmaßen in zwei Abschnitten, geformter Oberkörper (Drehkörper), Kragen, Gürtel mit Schnalle, Stiefel mit Stulpen,
// Schulterpolster bzw. Schulterplatten, Rockschöße (wehen im Wind: Attribut aWind), ein modelliertes Gesicht (Kinn, Wangen, Brauenbogen,
// Nasenrücken, Augen mit Glanzpunkt, Ohren, Haar) und Kopfbedeckungen je Truppe und Macht: Dreispitz, Admirals-Zweispitz, Kurogane-Kabuto mit
// Hörnerkrone, Morion. Alle Teile hängen an festen Gelenkpunkten (`SOLDIER_JOINTS`): Hüfte, Brust, Hals, Kopf, Schultern, Ellbogen, Hände, Knie,
// Füße, Waffenplatz – dieselben, an denen die Aufstellung, das Wippen und der Ausfallschritt der Formation ansetzen; die Hand der Waffe liegt exakt
// dort, wo sie vorher lag. Reines Geometrie-Modul (three.js, keine Materialien): testbar ohne Grafikkarte.
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, LatheGeometry, Object3D, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TROOPS, type TroopType } from '../../data/troops';

/** Uniform einer Weltmacht (Verteidiger, Wachen): Rock, Hose, Kopfbedeckung, Zierfarbe */
export interface SoldierPalette { id: string; cloth: string; pants: string; hat: string; trim: string }

type V3 = readonly [number, number, number];

/** Gelenkpunkte eines Soldaten (Meter, Blick nach +z, Füße bei y = 0). Rechte Seite: x > 0. */
export const SOLDIER_JOINTS = {
  hip: [0, 0.9, 0] as V3,
  chest: [0, 1.22, 0] as V3,
  neck: [0, 1.47, 0] as V3,
  head: [0, 1.595, 0.01] as V3,
  shoulderR: [0.225, 1.37, -0.01] as V3,
  elbowR: [0.275, 1.12, 0.08] as V3,
  /** Hand der Waffe (unverändert gegenüber der alten Form: 0,29 | 0,88 | 0,28) */
  handR: [0.29, 0.88, 0.28] as V3,
  kneeR: [0.1, 0.5, 0.012] as V3,
  footR: [0.1, 0.04, 0.03] as V3,
  /** Waffenplatz: Griff in der rechten Hand */
  weapon: [0.3, 0.9, 0.18] as V3,
} as const;

const mirror = (p: V3, s: number): [number, number, number] => [p[0] * s, p[1], p[2]];

// ---------- Vorlagen (einmal je Sitzung, geteilt) ----------

let pool: { sph: BufferGeometry; sphLo: BufferGeometry; box: BufferGeometry } | null = null;
function templates() {
  return (pool ??= { sph: new SphereGeometry(1, 10, 7), sphLo: new SphereGeometry(1, 6, 4), box: new BoxGeometry(1, 1, 1) });
}

const _o = new Object3D();
const _q = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _d = new Vector3();

/** Eckpunktfarbe und Windgewicht setzen, UV entfernen (alle Teile haben dieselben Attribute: zusammenfassbar) */
function finish(g: BufferGeometry, col: string, wind: ((y: number) => number) | null = null): BufferGeometry {
  // mit Indizes (geteilte Eckpunkte): rund ein Viertel der Eckpunkte gegenüber einzelnen Dreiecken
  const ng = g;
  ng.deleteAttribute('uv');
  const n = ng.attributes.position.count, c = new Color(col);
  const arr = new Float32Array(n * 3), w = new Float32Array(n);
  const pa = ng.attributes.position;
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; w[i] = wind ? wind(pa.getY(i)) : 0; }
  ng.setAttribute('color', new BufferAttribute(arr, 3));
  ng.setAttribute('aWind', new BufferAttribute(w, 1));
  return ng;
}

/** Vorlage verschoben, gedreht (Euler, Standard XYZ; 'YXZ' = erst neigen, dann drehen) und skaliert */
function put(src: BufferGeometry, col: string, p: V3, r: V3 = [0, 0, 0], s: V3 | number = 1, order: 'XYZ' | 'YXZ' = 'XYZ'): BufferGeometry {
  const g = src.clone();
  _o.position.set(p[0], p[1], p[2]);
  _o.rotation.set(r[0], r[1], r[2], order);
  if (typeof s === 'number') _o.scale.setScalar(s); else _o.scale.set(s[0], s[1], s[2]);
  _o.updateMatrix();
  g.applyMatrix4(_o.matrix);
  return finish(g, col);
}

/** Verjüngtes Glied von a nach b (Radius ra bei a, rb bei b) */
function limb(a: V3, b: V3, ra: number, rb: number, col: string, seg = 9, squash = 1): BufferGeometry {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length();
  const g = new CylinderGeometry(rb, ra, len, seg, 1, false);
  if (squash !== 1) g.scale(1, 1, squash);
  _q.setFromUnitVectors(_up, _d.normalize());
  _o.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  _o.quaternion.copy(_q);
  _o.scale.set(1, 1, 1);
  _o.updateMatrix();
  g.applyMatrix4(_o.matrix);
  return finish(g, col);
}

/** Drehkörper aus (Radius, Höhe)-Punkten, Tiefe gestaucht (Oberkörper, Rockschöße, Helme) */
function lathe(pts: readonly [number, number][], col: string, seg: number, sx: number, sz: number, p: V3 = [0, 0, 0], wind: ((y: number) => number) | null = null, phiLen = Math.PI * 2, phiStart = 0): BufferGeometry {
  // Profil immer von unten nach oben (sonst zeigen die Flächen nach innen und werden weggeschnitten: Hutkronen, Schilde, Rockschöße)
  const up = pts[0][1] > pts[pts.length - 1][1] ? [...pts].reverse() : pts;
  const g = new LatheGeometry(up.map(([r, y]) => new Vector2(r, y)), seg, phiStart, phiLen);
  g.scale(sx, 1, sz);
  g.translate(p[0], p[1], p[2]);
  return finish(g, col, wind);
}

function ring(r: number, tube: number, col: string, p: V3, rot: V3 = [Math.PI / 2, 0, 0], s: V3 = [1, 1, 1], arc = Math.PI * 2): BufferGeometry {
  const g = new TorusGeometry(r, tube, 5, 12, arc);
  _o.position.set(p[0], p[1], p[2]); _o.rotation.set(rot[0], rot[1], rot[2]); _o.scale.set(s[0], s[1], s[2]); _o.updateMatrix();
  g.applyMatrix4(_o.matrix);
  return finish(g, col);
}

function cone(r: number, h: number, col: string, p: V3, rot: V3 = [0, 0, 0], seg = 6): BufferGeometry {
  const g = new ConeGeometry(r, h, seg, 1);
  _o.position.set(p[0], p[1], p[2]); _o.rotation.set(rot[0], rot[1], rot[2]); _o.scale.set(1, 1, 1); _o.updateMatrix();
  g.applyMatrix4(_o.matrix);
  return finish(g, col);
}

// ---------- Farben ----------

const SKIN = '#E0B08A';
const SKIN_SH = '#C9946E';
const STEEL = '#B9BEC8';
const DARK_STEEL = '#4A4C54';
const WOOD = '#6A4A2A';
const LEATHER = '#3A2A1E';
const LEATHER_L = '#5A3E28';
const HAIR = ['#2A1E16', '#4A3220', '#1A1A1E'];
const EYE_W = '#F2EEE6';
const EYE_I = '#1E2430';

/** Kopfbedeckung je Truppe und Macht */
export type SoldierHat = 'dreispitz' | 'zweispitz' | 'kabuto' | 'morion' | 'kappe';
export function hatFor(typ: TroopType, pal?: SoldierPalette): SoldierHat {
  if (pal?.id === 'kurogane') return 'kabuto';
  if (typ === 'musketier') return pal?.id === 'deutschland' ? 'morion' : 'dreispitz';
  if (typ === 'schlaeger') return 'morion';
  return pal?.id === 'england' || pal?.id === 'marine' || pal?.id === 'frankreich' ? 'zweispitz' : 'kappe';
}

function head(parts: BufferGeometry[], hairCol: string) {
  const T = templates();
  const [hx, hy, hz] = SOLDIER_JOINTS.head;
  // Schädel, kräftiger Unterkiefer mit Kinn, Wangenknochen
  parts.push(put(T.sph, SKIN, [hx, hy + 0.012, hz - 0.006], [0, 0, 0], [0.112, 0.124, 0.118]));
  parts.push(put(T.sph, SKIN, [hx, hy - 0.058, hz + 0.03], [0, 0, 0], [0.082, 0.062, 0.078]));
  parts.push(put(T.sphLo, SKIN, [hx, hy - 0.092, hz + 0.07], [0, 0, 0], [0.03, 0.022, 0.024]));
  for (const s of [-1, 1]) parts.push(put(T.sphLo, SKIN, [hx + s * 0.062, hy - 0.012, hz + 0.07], [0, 0, 0], [0.034, 0.03, 0.03]));
  // Brauenbogen und Brauen
  parts.push(put(T.sph, SKIN_SH, [hx, hy + 0.034, hz + 0.088], [0, 0, 0], [0.088, 0.02, 0.03]));
  for (const s of [-1, 1]) parts.push(put(T.box, hairCol, [hx + s * 0.04, hy + 0.044, hz + 0.111], [0, 0, s * -0.22], [0.04, 0.009, 0.008]));
  // Augen: Weiß, Iris, Glanzpunkt (klein, aber im Nahbereich lesbar)
  for (const s of [-1, 1]) {
    parts.push(put(T.sphLo, EYE_W, [hx + s * 0.04, hy + 0.012, hz + 0.094], [0, 0, 0], [0.016, 0.012, 0.01]));
    parts.push(put(T.sphLo, EYE_I, [hx + s * 0.04, hy + 0.011, hz + 0.103], [0, 0, 0], [0.008, 0.009, 0.004]));
    parts.push(put(T.sphLo, '#FFFFFF', [hx + s * 0.036, hy + 0.016, hz + 0.107], [0, 0, 0], 0.0028));
  }
  // Nasenrücken und Nasenspitze, Mund
  parts.push(put(T.box, SKIN, [hx, hy - 0.004, hz + 0.108], [-0.32, 0, 0], [0.018, 0.05, 0.022]));
  parts.push(put(T.sphLo, SKIN_SH, [hx, hy - 0.028, hz + 0.118], [0, 0, 0], [0.016, 0.013, 0.014]));
  parts.push(put(T.box, '#7A3A30', [hx, hy - 0.06, hz + 0.1], [0, 0, 0], [0.036, 0.006, 0.006]));
  // Ohren
  for (const s of [-1, 1]) parts.push(put(T.sphLo, SKIN_SH, [hx + s * 0.112, hy, hz - 0.005], [0, 0, 0], [0.014, 0.028, 0.02]));
  // Haar: Hinterkopf und Koteletten (der Hut deckt den Scheitel)
  parts.push(put(T.sph, hairCol, [hx, hy + 0.03, hz - 0.03], [0.25, 0, 0], [0.118, 0.11, 0.11]));
  for (const s of [-1, 1]) parts.push(put(T.box, hairCol, [hx + s * 0.104, hy - 0.012, hz + 0.022], [0, 0, 0], [0.008, 0.036, 0.018]));
  // Hals
  parts.push(limb([0, 1.44, 0], [0, 1.53, 0.005], 0.055, 0.048, SKIN));
}

function hat(parts: BufferGeometry[], kind: SoldierHat, col: string, trim: string) {
  const T = templates();
  const top = SOLDIER_JOINTS.head[1] + 0.09;
  switch (kind) {
    case 'dreispitz': {
      // Krone und drei hochgeschlagene Krempen (eine Spitze nach vorn), goldene Borte
      parts.push(lathe([[0, 0.085], [0.1, 0.08], [0.11, 0.02], [0.118, 0]], col, 12, 1, 1, [0, top - 0.01, 0]));
      for (let k = 0; k < 3; k++) {
        // Krempe: dünne Platte, nach außen gedreht und hochgeschlagen (oben leicht nach außen geneigt), Borte an der Oberkante
        const a = (k / 3) * Math.PI * 2 + Math.PI / 3;
        const cx = Math.sin(a) * 0.105, cz = Math.cos(a) * 0.105;
        parts.push(put(T.box, col, [cx, top + 0.028, cz], [0.38, a, 0], [0.22, 0.08, 0.014], 'YXZ'));
        parts.push(put(T.box, trim, [cx * 1.12, top + 0.066, cz * 1.12], [0.38, a, 0], [0.21, 0.012, 0.02], 'YXZ'));
      }
      parts.push(put(T.sphLo, trim, [0.06, top + 0.05, 0.1], [0, 0, 0], 0.018));
      return;
    }
    case 'zweispitz': {
      // Admirals-Zweispitz: Halbmond quer, Borte, Kokarde
      parts.push(put(T.sph, col, [0, top + 0.035, -0.005], [0, 0, 0], [0.2, 0.085, 0.05]));
      parts.push(ring(0.17, 0.008, trim, [0, top + 0.02, -0.005], [0, 0, 0], [1.15, 0.5, 1], Math.PI));
      parts.push(put(T.sphLo, trim, [0.0, top + 0.06, 0.045], [0, 0, 0], [0.028, 0.028, 0.01]));
      parts.push(put(T.sphLo, '#F4F1E6', [0.0, top + 0.06, 0.052], [0, 0, 0], [0.012, 0.012, 0.006]));
      return;
    }
    case 'kabuto': {
      // Samurai-Helm: Glocke, Schirm, gestaffelter Nackenschutz, Hörnerkrone (Kuwagata) mit Stirnscheibe
      parts.push(lathe([[0, 0.12], [0.06, 0.115], [0.11, 0.08], [0.128, 0.02], [0.13, 0]], col, 14, 1, 1.02, [0, top - 0.035, -0.005]));
      parts.push(put(T.box, col, [0, top - 0.03, 0.12], [-0.35, 0, 0], [0.2, 0.012, 0.06]));
      for (let k = 0; k < 3; k++) parts.push(lathe([[0.13 + k * 0.022, 0], [0.15 + k * 0.024, -0.035]], k === 1 ? trim : col, 14, 1, 1, [0, top - 0.04 - k * 0.032, -0.02], null, Math.PI * 1.3, Math.PI * 0.35));
      for (const s of [-1, 1]) {
        parts.push(put(T.box, trim, [s * 0.055, top + 0.07, 0.115], [0.15, 0, s * -0.42], [0.016, 0.16, 0.008]));
        parts.push(put(T.box, trim, [s * 0.1, top + 0.15, 0.118], [0.15, 0, s * -0.9], [0.014, 0.07, 0.008]));
      }
      parts.push(ring(0.026, 0.009, trim, [0, top + 0.01, 0.128], [0, 0, 0], [1, 1, 1]));
      return;
    }
    case 'morion': {
      // Morion: hohe Glocke mit Kamm, nach vorn und hinten hochgezogene Krempe
      parts.push(lathe([[0, 0.12], [0.05, 0.115], [0.1, 0.07], [0.12, 0.0]], col, 14, 1, 1.1, [0, top - 0.04, -0.005]));
      parts.push(put(T.box, col, [0, top + 0.11, -0.005], [0, 0, 0], [0.012, 0.07, 0.22]));
      parts.push(ring(0.15, 0.018, col, [0, top - 0.04, -0.005], [Math.PI / 2, 0, 0], [1, 1.35, 0.6]));
      parts.push(ring(0.125, 0.006, trim, [0, top - 0.035, -0.005], [Math.PI / 2, 0, 0], [1, 1.2, 1]));
      return;
    }
    default: {
      // Feldmütze mit Schirm
      parts.push(lathe([[0, 0.07], [0.105, 0.066], [0.118, 0.02], [0.12, 0]], col, 12, 1, 1.05, [0, top - 0.035, -0.01]));
      parts.push(put(T.box, LEATHER, [0, top - 0.035, 0.11], [-0.25, 0, 0], [0.16, 0.012, 0.07]));
      parts.push(ring(0.12, 0.008, trim, [0, top - 0.03, -0.01], [Math.PI / 2, 0, 0], [1, 1.05, 1]));
    }
  }
}

/** Ein Soldat (~1,75 m), Farben als Eckpunktfarben; Typ und Macht bestimmen Kopfbedeckung, Schultern, Rock und Waffe */
export function buildSoldier(typ: TroopType, pal?: SoldierPalette): BufferGeometry {
  const T = templates();
  const d = pal ? { ...TROOPS[typ], cloth: pal.cloth, pants: pal.pants, hat: pal.hat } : TROOPS[typ];
  const trim = pal?.trim ?? '#C9A13B';
  const parts: BufferGeometry[] = [];
  const bulk = typ === 'schlaeger' ? 1.16 : 1;
  const J = SOLDIER_JOINTS;
  const hairCol = HAIR[(typ.length + (pal?.id.length ?? 0)) % HAIR.length];
  // Beine: Oberschenkel und Unterschenkel verjüngt, Stiefel mit Stulpe, Fuß und Sohle
  for (const s of [-1, 1]) {
    const hip: V3 = [s * 0.095, 0.88, 0], knee = mirror(J.kneeR, s), ankle: V3 = [s * 0.1, 0.12, 0.005];
    parts.push(limb(hip, knee, 0.08 * bulk, 0.058 * bulk, d.pants));
    parts.push(limb(knee, [s * 0.1, 0.36, 0.008], 0.056 * bulk, 0.05 * bulk, d.pants));
    parts.push(limb(ankle, [s * 0.1, 0.38, 0.008], 0.05 * bulk, 0.058 * bulk, LEATHER));
    parts.push(limb([s * 0.1, 0.36, 0.008], [s * 0.1, 0.45, 0.01], 0.068 * bulk, 0.084 * bulk, LEATHER_L, 10));
    parts.push(put(T.sph, LEATHER, [s * 0.1, 0.05, 0.045], [0, 0, 0], [0.052, 0.045, 0.105]));
    parts.push(put(T.box, '#1E1610', [s * 0.1, 0.012, 0.045], [0, 0, 0], [0.1, 0.024, 0.2]));
  }
  // Oberkörper: schmale Taille, breite Brust, Schultern rund (Drehkörper, Tiefe gestaucht)
  parts.push(lathe([[0, 0.86], [0.15, 0.86], [0.158, 0.93], [0.165, 1.02], [0.182, 1.13], [0.203, 1.25], [0.208, 1.34], [0.186, 1.41], [0.12, 1.46], [0.05, 1.48]], d.cloth, 14, bulk, 0.72 * bulk));
  // Rockschöße (wehen im Wind) bei Röcken; der Schläger trägt einen kurzen Waffenrock
  const tail = typ === 'schlaeger' ? 0.74 : 0.58;
  parts.push(lathe([[0.168, 0.9], [0.18, 0.8], [0.205, tail]], d.cloth, 14, bulk, 0.8 * bulk, [0, 0, 0], (y) => Math.max(0, (0.9 - y) / (0.9 - tail)) * 0.07));
  // Knopfleiste und Aufschläge
  if (typ !== 'schlaeger') for (let k = 0; k < 5; k++) parts.push(put(T.sphLo, trim, [0, 1.0 + k * 0.08, 0.15 - k * 0.002], [0, 0, 0], 0.012));
  // Kragen (Stehkragen) und Halstuch
  parts.push(lathe([[0.075, 1.45], [0.08, 1.5], [0.072, 1.52]], typ === 'schlaeger' ? LEATHER : trim, 12, 1, 0.95));
  parts.push(put(T.sphLo, '#EDE6D6', [0, 1.43, 0.085], [0, 0, 0], [0.05, 0.04, 0.025]));
  // Gürtel mit Metallschnalle
  parts.push(ring(0.162 * bulk, 0.022, LEATHER, [0, 0.9, 0], [Math.PI / 2, 0, 0], [1, 0.74, 1]));
  parts.push(put(T.box, trim, [0, 0.9, 0.122 * bulk], [0, 0, 0], [0.055, 0.045, 0.012]));
  parts.push(put(T.box, LEATHER, [0, 0.9, 0.128 * bulk], [0, 0, 0], [0.032, 0.022, 0.006]));
  // Schultern: Epauletten (Zierfarbe) bzw. Stahl-Schulterplatten beim Schläger
  for (const s of [-1, 1]) {
    if (typ === 'schlaeger') {
      parts.push(lathe([[0, 0.07], [0.07, 0.05], [0.1, 0]], DARK_STEEL, 10, 1, 0.9, [s * 0.23 * bulk, 1.36, 0]));
      parts.push(ring(0.095, 0.01, STEEL, [s * 0.23 * bulk, 1.36, 0], [Math.PI / 2, 0, 0], [1, 0.9, 1]));
    } else {
      parts.push(put(T.sph, trim, [s * 0.2, 1.42, 0], [0, 0, s * 0.2], [0.075, 0.025, 0.065]));
      for (let k = 0; k < 4; k++) parts.push(put(T.box, trim, [s * (0.245 + 0.004 * k), 1.395, -0.04 + k * 0.027], [0, 0, 0], [0.006, 0.045, 0.006]));
    }
  }
  // Arme: Oberarm und Unterarm verjüngt, Ärmelaufschlag, Hand (rechte Hand am Waffenplatz)
  for (const s of [-1, 1]) {
    const sh = mirror(J.shoulderR, s * bulk), el = mirror(J.elbowR, s * bulk), hand = mirror(J.handR, s);
    const wrist: V3 = [hand[0] * 0.99, hand[1] + 0.04, hand[2] - 0.04];
    parts.push(limb(sh, el, 0.055 * bulk, 0.046 * bulk, d.cloth));
    parts.push(limb(el, wrist, 0.046 * bulk, 0.038 * bulk, d.cloth));
    parts.push(limb([wrist[0], wrist[1] + 0.03, wrist[2] - 0.03], [wrist[0], wrist[1] - 0.005, wrist[2] + 0.005], 0.047, 0.05, typ === 'schlaeger' ? LEATHER_L : trim, 10));
    parts.push(put(T.sph, SKIN, hand, [0.3, 0, 0], [0.034, 0.045, 0.036]));
  }
  head(parts, hairCol);
  hat(parts, hatFor(typ, pal), d.hat, trim);
  // Waffen am Waffenplatz der rechten Hand
  const W = J.weapon;
  if (typ === 'schwert') {
    // Säbel: gebogene Klinge aus drei Abschnitten, Korb (Bügel), umwickelter Griff, Knauf
    const b0: V3 = [W[0], W[1] + 0.12, W[2] + 0.08];
    const b1: V3 = [W[0] + 0.005, W[1] + 0.36, W[2] + 0.3];
    const b2: V3 = [W[0] + 0.012, W[1] + 0.5, W[2] + 0.56];
    const b3: V3 = [W[0] + 0.02, W[1] + 0.55, W[2] + 0.8];
    parts.push(limb(b0, b1, 0.016, 0.015, STEEL, 4, 0.22));
    parts.push(limb(b1, b2, 0.015, 0.013, STEEL, 4, 0.22));
    parts.push(limb(b2, b3, 0.013, 0.002, STEEL, 4, 0.22));
    parts.push(ring(0.055, 0.007, trim, [W[0] + 0.01, W[1] + 0.02, W[2] + 0.02], [0.35, Math.PI / 2, 0], [1, 1, 1], Math.PI));
    parts.push(limb([W[0], W[1] - 0.06, W[2] - 0.05], [W[0], W[1] + 0.1, W[2] + 0.06], 0.017, 0.016, LEATHER, 8));
    parts.push(put(T.sphLo, trim, [W[0], W[1] - 0.075, W[2] - 0.065], [0, 0, 0], 0.024));
    // Rundschild am linken Arm: Scheibe, Rand, Buckel
    // gewölbte Scheibe (Drehkörper um die Hochachse), dann nach vorn gekippt
    parts.push(lathe([[0, 0.03], [0.24, 0.0], [0.3, -0.02]], pal ? d.cloth : '#8A3A2E', 18, 1, 1).rotateX(Math.PI / 2).translate(-0.37, 1.0, 0.3));
    parts.push(ring(0.3, 0.018, STEEL, [-0.37, 1.0, 0.28], [0, 0, 0], [1, 1, 1]));
    parts.push(put(T.sph, trim, [-0.37, 1.0, 0.33], [0, 0, 0], [0.07, 0.07, 0.04]));
  } else if (typ === 'musketier') {
    // Muskete: Kolben, Schaft, Lauf mit Ringen, Schloss, Bajonett; Bandelier quer über die Brust
    parts.push(put(T.box, WOOD, [W[0] - 0.18, W[1] + 0.16, W[2] + 0.04], [-0.52, 0, 0], [0.07, 0.15, 0.3]));
    parts.push(put(T.box, WOOD, [W[0] - 0.18, W[1] + 0.26, W[2] + 0.4], [-0.52, 0, 0], [0.05, 0.05, 0.62]));
    parts.push(limb([W[0] - 0.18, W[1] + 0.28, W[2] + 0.5], [W[0] - 0.18, W[1] + 0.62, W[2] + 1.1], 0.017, 0.015, DARK_STEEL, 8));
    for (let k = 0; k < 3; k++) { const t = 0.25 + k * 0.25; parts.push(ring(0.022, 0.006, trim, [W[0] - 0.18, W[1] + 0.28 + 0.34 * t, W[2] + 0.5 + 0.6 * t], [0.5 - Math.PI / 2, 0, 0])); }
    parts.push(put(T.box, DARK_STEEL, [W[0] - 0.15, W[1] + 0.22, W[2] + 0.26], [-0.52, 0, 0], [0.03, 0.04, 0.08]));
    parts.push(cone(0.01, 0.3, STEEL, [W[0] - 0.18, W[1] + 0.7, W[2] + 1.26], [1.05, 0, 0]));
    parts.push(put(T.box, trim, [0.0, 1.22, 0.0], [0, 0, 0.75], [0.05, 0.62, 0.24]));
  } else {
    // Streitkolben mit Dornen; Lederschurz
    parts.push(limb([W[0] + 0.04, W[1] - 0.18, W[2] - 0.12], [W[0] + 0.04, W[1] + 0.62, W[2] + 0.36], 0.026, 0.024, WOOD, 8));
    const hc: V3 = [W[0] + 0.04, W[1] + 0.7, W[2] + 0.41];
    parts.push(put(T.sph, DARK_STEEL, hc, [0, 0, 0], [0.1, 0.12, 0.1]));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      // Dorn: Kegel (Spitze +y) erst flach nach außen gelegt, dann um die Hochachse an seinen Platz gedreht
      parts.push(cone(0.022, 0.09, STEEL, [0, 0, 0]).rotateZ(-Math.PI / 2).rotateY(-a).translate(hc[0] + Math.cos(a) * 0.12, hc[1], hc[2] + Math.sin(a) * 0.12));
    }
    parts.push(lathe([[0.17, 0.88], [0.2, 0.62]], LEATHER, 12, 1, 0.8, [0, 0, 0], (y) => Math.max(0, (0.88 - y) / 0.26) * 0.06, Math.PI * 0.8, -Math.PI * 0.4));
  }
  const geo = mergeGeometries(parts, false) ?? new BufferGeometry();
  for (const p of parts) p.dispose();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

const _p = new Vector3();
/** Für Tests: steht der Punkt (Gelenk) innerhalb der Hülle des Netzes (mit Rand)? */
export function nearGeometry(geo: BufferGeometry, p: V3, tol: number): boolean {
  const pa = geo.attributes.position;
  _p.set(p[0], p[1], p[2]);
  for (let i = 0; i < pa.count; i++) {
    const dx = pa.getX(i) - _p.x, dy = pa.getY(i) - _p.y, dz = pa.getZ(i) - _p.z;
    if (dx * dx + dy * dy + dz * dz <= tol * tol) return true;
  }
  return false;
}
