import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';
import type { ShipClass, ShipLook } from '../../data/ships';

/**
 * Rumpf der zweiten Schiffsfassung. Die Draufsicht (Breite je Länge, Deckssprung, Vorsteven) kommt aus denselben Funktionen wie
 * in der ersten Fassung, damit Deck, Reling, Kastelle und Kollision unverändert passen; neu ist die Form des Querschnitts:
 *  - Bauch mit rundem Boden, größte Breite unter der Wasserlinie-Höhe des Decks, oben eingezogen (Tumblehome, am Heck stärker)
 *  - am Bug nach außen gestellte Wand (Flare), die den Schlag der Wellen abweist
 *  - Berghölzer (Wales) als echte Stufen mit Kanten: Kettenbergholz, Hauptbergholz, oberes Bergholz und Schandeckel
 *  - Farbbänder: Kupferboden mit Grünspan an der Wasserlinie, Rumpffarbe, Schmuckband zwischen den Geschützreihen, dunkle Berghölzer
 *  - Planken-UV (waagerecht), damit die helle Plankentextur Fugen und Maserung zeigt
 */
export interface HullFns {
  widthAt(t: number): number;
  sheerAt(t: number, L: number): number;
  rakeAt(t: number, L: number): number;
}

interface P { x: number; f: number; below: boolean }

/** Wales: Bereich in Anteilen der Deckshöhe und Ausladung (Anteil der halben Breite) */
const WALES = [
  { a: 0.215, b: 0.265, off: 0.013 },   // Kettenbergholz
  { a: 0.5, b: 0.585, off: 0.024 },     // Hauptbergholz
  { a: 0.8, b: 0.855, off: 0.02 },      // oberes Bergholz
  { a: 0.965, b: 1.0, off: 0.03 },      // Schandeckel
];

function profile(): P[] {
  const pts: P[] = [];
  // unter Wasser: Kiel, Bilge, runder Boden (Tiefgang-Vielfache)
  for (const [x, f] of [[0, -1.05], [0.12, -1.03], [0.3, -0.96], [0.5, -0.82], [0.7, -0.6], [0.86, -0.33], [0.95, -0.1]] as const) pts.push({ x, f, below: true });
  const base = (f: number) => (f < 0.35 ? 1 - 0.02 * Math.pow((0.35 - f) / 0.35, 2) : 1 - 0.095 * Math.pow((f - 0.35) / 0.65, 1.5));
  const offAt = (f: number) => { for (const w of WALES) if (f >= w.a && f <= w.b) return w.off; return 0; };
  const eps = 0.012;
  const levels: number[] = [0, 0.1];
  for (const w of WALES) levels.push(w.a - eps, w.a, w.b, w.b + eps);
  levels.push(0.7, 0.93, 1.0);
  const uniq = [...new Set(levels.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000))].sort((p, q) => p - q);
  for (const f of uniq) pts.push({ x: base(f) + offAt(f), f, below: false });
  // beide Seiten: erst die gespiegelte Backbordhälfte von oben zum Kiel, dann die Steuerbordhälfte hinauf (Drehsinn wie in der ersten Fassung)
  const port = pts.slice(1).reverse().map((p) => ({ ...p, x: -p.x }));
  return [...port, ...pts];
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function hullGeometry2(c: ShipClass, D: number, look: ShipLook, fn: HullFns): BufferGeometry {
  const sections = Math.round(30 + c.L * 0.35);
  const prof = profile();
  const draft = D / (1.4 + c.decks * 0.75);
  const hull = new Color(look.hull).multiplyScalar(1.1), stripe = new Color(look.stripe);
  const dark = new Color(look.hull).multiplyScalar(0.34).lerp(new Color('#1A1512'), 0.5);
  const copper = new Color('#8A4A2C'), weed = new Color('#3F5F4A'), gold = new Color('#E3B04B');
  const bulwark = new Color(look.hull).multiplyScalar(1.3);
  const pos: number[] = [], col: number[] = [], uv: number[] = [];

  const ring = (i: number) => {
    const t = (i / sections) * 2 - 1;
    const z = t * c.L / 2;
    const w = (i === sections ? 0.004 : Math.max(0.04, fn.widthAt(t))) * c.W / 2;
    const rise = fn.sheerAt(t, c.L), rk = fn.rakeAt(t, c.L);
    // Querschnitt je Länge: am Heck oben eingezogen, am Bug nach außen gestellt (Flare), mittschiffs die volle Bauchung
    const tuck = t < 0 ? 0.035 * smooth(0, -0.95, t) : 0;
    const flare = t > 0 ? 0.11 * smooth(0.15, 0.95, t) : 0;
    return prof.map((p) => {
      const py = p.below ? p.f * draft : p.f * D;
      const pyy = py < 0 ? py * (1 - Math.max(0, t - 0.85) * 1.6) : py;
      const fk = p.below ? 0 : p.f;
      const px = p.x * (1 - tuck * fk * fk + flare * fk);
      const topK = Math.min(1, Math.max(0, (py + 0.3) / (D + 0.3)));
      // Gegenhölzer: der Heckspiegel weicht unten nach vorn zurück, so ragt die Galerie darüber wie bei einer Galeone vor
      const hK = Math.min(1, Math.max(0, (py + draft) / (D + draft)));
      const counter = t < -0.78 ? smooth(0, 1, (-0.78 - t) / 0.22) * c.L * 0.04 * Math.pow(1 - hK, 1.5) : 0;
      return { v: new Vector3(px * w, pyy + (py > 0.5 ? rise : rise * Math.max(0, (py + 1.05) / (D + 1.05))), z + counter + rk * Math.pow(topK, 1.3)), f: p.f, below: p.below };
    });
  };

  const colorFor = (f: number, below: boolean, y: number): Color => {
    if (below) return copper;
    if (y < 0.02) return copper;
    if (y < 0.55) return weed.clone().lerp(hull, Math.min(1, y / 0.55));
    if (f >= 0.965) return gold;
    for (const w of WALES) if (f >= w.a - 0.002 && f <= w.b + 0.002) return dark;
    if (f > 0.585 && f < 0.8) return stripe;
    if (f >= 0.855) return bulwark;
    return hull;
  };

  const out = (a: ReturnType<typeof ring>[number], z0: number) => {
    pos.push(a.v.x, a.v.y, a.v.z);
    const cc = colorFor(a.f, a.below, a.v.y);
    // Verwitterung: sanfte Salzstreifen und Nachdunkeln am Wasser, ungleichmäßig, aber weniger hart als in der ersten Fassung
    const wv = (0.9 + 0.1 * Math.sin(a.v.z * 1.9 + a.v.y * 4.1) * Math.sin(a.v.z * 0.6 + 1.3)) * (a.v.y < 1.2 ? 0.86 + 0.14 * Math.max(0, a.v.y) / 1.2 : 1);
    col.push(cc.r * wv, cc.g * wv, cc.b * wv);
    uv.push(z0 * 0.25, a.v.y * 0.55);
  };

  for (let i = 0; i < sections; i++) {
    const a = ring(i), b = ring(i + 1);
    for (let k = 0; k < prof.length - 1; k++) {
      // Drehsinn wie in der ersten Fassung (Außenseite sichtbar)
      for (const [r, n] of [[a, k], [b, k + 1], [b, k], [a, k], [a, k + 1], [b, k + 1]] as const) out(r[n], r[n].v.z);
    }
  }
  // Heckspiegel: Fächer über das Profil, Rumpffarbe mit dunkler Unterkante (die Galerie sitzt darauf)
  const st = ring(0);
  for (let k = 1; k < st.length - 1; k++) for (const p of [st[0], st[k + 1], st[k]]) {
    pos.push(p.v.x, p.v.y, p.v.z);
    const cc = p.below ? copper : hull.clone().multiplyScalar(0.85);
    col.push(cc.r, cc.g, cc.b);
    uv.push(p.v.x * 0.25, p.v.y * 0.55);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
