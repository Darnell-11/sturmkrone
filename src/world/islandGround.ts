import type { IslandShape } from './ocean';
import { BRIDGE_CLEARANCE, BRIDGE_STEP, frameCoords, frameHeight, makeFrame, setFrame, spanLength, type Anchor, type BridgeDef, type BridgeFrame } from './docking';
import { clamp01 } from '../core/mathUtil';

/** Ein Hügel: Mitte (Welt), Radius und Höhenfaktor (Kuppe = Halbkugel, in der Höhe gestaucht) */
export interface Hill { x: number; z: number; r: number; h: number }

/**
 * Ebene Standfläche unter einem Bau (Welt): rechteckig (hw, hd, yaw) mit weichem Übergang `blend` ins Gelände. Das Gelände steigt oder
 * fällt zur Standfläche hin; innerhalb ist es genau auf Höhe `y` (Mittel der Grundfläche vor dem Einebnen). Kein Haus versinkt mehr im Hang
 * und keines hängt in der Luft; Wege, Zäune und Pflanzen davor folgen dem eingeebneten Gelände.
 */
export interface Pad { x: number; z: number; hw: number; hd: number; yaw: number; blend: number; y: number; r2: number; round?: boolean }

/** Hügelform 0 … 1 (t = Abstand / Radius): weich auslaufend statt Halbkugel – keine Kante am Hügelfuß */
export function hillProfile(t: number): number {
  return t >= 1 ? 0 : Math.pow(1 - t * t, 1.6);
}

/**
 * Begehbare Insel. Sichtbares Gelände und Laufhöhe kommen aus genau diesen Werten (keine Abweichung mehr):
 * flaches Strandplateau bis zur Küstenlinie, danach fällt der Strand gleichmäßig bis 1,25 × Küstenradius ins Meer.
 */
export interface WalkIsland extends IslandShape {
  /** Höhe des Strandplateaus und Fuß der Hügel */
  beachY: number;
  hillY: number;
  /** Küstenlinie: Radius × (1 + Σ a·sin(f·Winkel + p)) */
  coast: { a: number; f: number; p: number }[];
  hills: Hill[];
  /** Breite der Strandböschung als Anteil des Küstenradius (shelfOf) */
  shelf: number;
  /** Hindernisse in Weltkoordinaten: rund (r) oder gedrehter Quader (hw, hd, yaw; r = umschließender Radius) */
  blockers: Blocker[];
  /** Sanftes Bodenrelief (Meter Ausschlag) und Startwert: Wiesen rollen, Sand liegt in Dünen; an der Wasserlinie läuft es auf 0 aus */
  reliefAmp?: number;
  reliefSeed?: number;
  /** Straßen und Wege (Weltkoordinaten): Bewohner spazieren darauf statt quer durch Häuser */
  walkways?: { pts: [number, number][]; w: number }[];
  /** Dicke der Wiesendecke über dem Grundgelände (Inselkoordinaten): wer auf der Wiese steht, steht auf ihr, nicht 15 bis 19 cm darin */
  lift?: (lx: number, lz: number) => number;
  /** Eingeebnete Standflächen (Welt) unter Bauten; Gelände-Mesh wird nach dem Aufbau der Insel nachgeführt */
  pads?: Pad[];
  /** Standfläche anmelden: Mitte (Welt), Breite, Tiefe, Drehung, Übergangsbreite; gibt die Höhe der Fläche zurück (setzt die Welt) */
  addPad?: (x: number, z: number, w: number, d: number, yaw: number, blend?: number, round?: boolean) => number;
}

function vnoise(x: number, z: number, seed: number): number {
  const h = (i: number, j: number) => {
    let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1274126177);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x), j = Math.floor(z);
  let fx = x - i, fz = z - j;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  return (h(i, j) * (1 - fx) + h(i + 1, j) * fx) * (1 - fz) + (h(i, j + 1) * (1 - fx) + h(i + 1, j + 1) * fx) * fz;
}

/** Bodenrelief an einem Punkt in Inselkoordinaten (−amp … +amp): große Wellen, mittlere Hügelchen, kleine Buckel */
export function reliefAt(i: WalkIsland, lx: number, lz: number): number {
  const amp = i.reliefAmp ?? 0;
  if (amp <= 0) return 0;
  const sd = i.reliefSeed ?? 1;
  const n = (vnoise(lx / 44, lz / 44, sd) - 0.5) + (vnoise(lx / 15, lz / 15, sd + 3) - 0.5) * 0.55 + (vnoise(lx / 5.2, lz / 5.2, sd + 7) - 0.5) * 0.16;
  return n * 2 * amp;
}

/**
 * Breite der Strandböschung als Anteil des Küstenradius. Bis 2.9.27 überall 25 % – bei kleinen Inseln 7–25 m, beim Festland
 * aber über 70 m: Das Wasser begann erst 30 m hinter der Küste, Stege lagen auf dem Trockenen und Schiffe kamen nicht nah
 * genug heran, um anzulegen. Jetzt höchstens 22 m (kleine Inseln bleiben wie bisher).
 */
export function shelfOf(r: number): number { return Math.min(0.25, 22 / r); }
/** Die Wasserlinie liegt auf der Böschung bei diesem Anteil ihrer Breite (Plateau 1,3 m, Böschung 3 m hinab) */
export const WATERLINE = 1.3 / 3;

/** Kollider eines festen Objekts: Kreis oder gedrehtes Rechteck (Häuser, Mauern, Zäune, Stände, Karren) */
export interface Blocker { x: number; z: number; r: number; hw?: number; hd?: number; yaw?: number }

/**
 * Rechteck-Kollider für ein Objekt bei (x, z) mit Drehung yaw (wie rotation.y). Breite w entlang der lokalen x-Achse,
 * Tiefe d entlang z; ox/oz verschieben die Mitte im Objektraum (z. B. Kistenstapel mit Fass daneben).
 */
export function boxBlocker(x: number, z: number, w: number, d: number, yaw: number, ox = 0, oz = 0): Blocker {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: x + ox * c + oz * s, z: z - ox * s + oz * c, r: Math.hypot(w, d) / 2, hw: w / 2, hd: d / 2, yaw };
}

/** Punkt im Rechteck-Kollider (mit Rand m)? */
export function inBox(b: Blocker, x: number, z: number, m = 0) {
  const c = Math.cos(b.yaw ?? 0), s = Math.sin(b.yaw ?? 0);
  const dx = x - b.x, dz = z - b.z;
  return Math.abs(dx * c - dz * s) <= (b.hw ?? 0) + m && Math.abs(dx * s + dz * c) <= (b.hd ?? 0) + m;
}

/** Küstenfaktor in einer Richtung (Winkel wie atan2(z, x)) */
export function coastK(c: WalkIsland['coast'], a: number): number {
  let k = 1;
  for (const w of c) k += w.a * Math.sin(w.f * a + w.p);
  return k;
}

/** Größter Küstenfaktor (für grobe Abstandsprüfungen) */
export function coastMax(c: WalkIsland['coast']): number {
  let m = 0;
  for (let i = 0; i < 64; i++) m = Math.max(m, coastK(c, (i / 64) * Math.PI * 2));
  return m;
}

/**
 * Würfelt die Form einer Insel aus: rund, langgezogen, gelappt oder sichelförmig, mit 1–3 Hügeln.
 * rnd liefert Zufall aus dem Inselnamen; simple = Stadt, Häfen, Leuchttürme, Vulkane (Bauten um die Mitte).
 */
export function makeIslandShape(r: number, hill: number, rnd: () => number, simple: boolean): { coast: WalkIsland['coast']; hills: { x: number; z: number; r: number; h: number }[] } {
  const p = () => rnd() * Math.PI * 2;
  const coast: WalkIsland['coast'] = [
    { a: 0.035, f: 3, p: p() }, { a: 0.02, f: 7, p: p() }, { a: 0.01, f: 13, p: p() },
  ];
  if (simple) return { coast, hills: [{ x: 0, z: 0, r: r * 0.75, h: hill }] };
  const type = rnd();
  if (type < 0.3) coast.push({ a: 0.16 + rnd() * 0.12, f: 2, p: p() });                       // langgezogen
  else if (type < 0.55) coast.push({ a: 0.1 + rnd() * 0.06, f: 3, p: p() }, { a: 0.05, f: 5, p: p() }); // gelappt mit Buchten
  else if (type < 0.75) coast.push({ a: 0.16 + rnd() * 0.08, f: 1, p: p() }, { a: 0.08, f: 2, p: p() }); // sichelförmig, eine Seite weit
  else coast.push({ a: 0.05 + rnd() * 0.04, f: 4, p: p() });                                   // fast rund, viele kleine Buchten
  // Hügel: dort, wo die Insel am weitesten reicht, damit sie die Form betonen
  const n = 1 + Math.floor(rnd() * 3);
  const hills: { x: number; z: number; r: number; h: number }[] = [];
  const angles = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2).sort((a1, a2) => coastK(coast, a2) - coastK(coast, a1));
  for (let i = 0; i < n; i++) {
    const a = i === 0 ? angles[0] + (rnd() - 0.5) * 0.6 : angles[Math.floor(rnd() * 12)] + (rnd() - 0.5) * 0.8;
    const edge = r * coastK(coast, a);
    const d = edge * (i === 0 ? 0.15 + rnd() * 0.25 : 0.35 + rnd() * 0.25);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    let hr = r * (i === 0 ? 0.42 + rnd() * 0.2 : 0.2 + rnd() * 0.16);
    // so lange verkleinern, bis der Hügel ganz auf dem Strandplateau liegt
    for (let t = 0; t < 12; t++) {
      let ok = true;
      for (let k = 0; k < 24 && ok; k++) {
        const b = (k / 24) * Math.PI * 2;
        const px = cx + Math.cos(b) * hr, pz = cz + Math.sin(b) * hr;
        if (Math.hypot(px, pz) > r * coastK(coast, Math.atan2(pz, px)) * 0.9) ok = false;
      }
      if (ok) break;
      hr *= 0.88;
    }
    hills.push({ x: cx, z: cz, r: hr, h: hill * (i === 0 ? 0.8 + rnd() * 0.7 : 0.6 + rnd() * 0.9) });
  }
  return { coast, hills };
}

/**
 * Vorgegebene Hügel (Inselkoordinaten) an die Küste anpassen: jeder Hügel wird so weit verkleinert,
 * bis er ganz auf dem Strandplateau liegt (sonst ragte sein Fuß über die Wasserlinie hinaus).
 */
export function fitHills(r: number, coast: WalkIsland['coast'], hills: Hill[]): Hill[] {
  return hills.map((h) => {
    let hr = h.r;
    for (let t = 0; t < 24; t++) {
      let ok = true;
      for (let k = 0; k < 24 && ok; k++) {
        const b = (k / 24) * Math.PI * 2;
        const px = h.x + Math.cos(b) * hr, pz = h.z + Math.sin(b) * hr;
        if (Math.hypot(px, pz) > r * coastK(coast, Math.atan2(pz, px)) * 0.92) ok = false;
      }
      if (ok) break;
      hr *= 0.92;
    }
    return { ...h, r: hr };
  });
}

/** Steg als Strecke a → b mit halber Breite hw; y = Höhe der Bohlen (Oberkante). Begehbar bis zur Spitze, Schiffe legen seitlich an. */
export interface Pier { ax: number; az: number; bx: number; bz: number; hw: number; y: number; /** Kennung (vergibt die Welt nach dem Aufbau: `pier-<n>`) */ id?: string }

/**
 * Etwas Begehbares: Insel, Schiffsdeck oder ihr Verbund (`CompositeGround`). Der Höhenhinweis `y` (Höhe des Läufers) ist optional:
 * Wo mehrere Flächen übereinanderliegen (Gangway über dem Steg), entscheidet er, auf welcher der Läufer steht.
 */
export interface Ground {
  height(x: number, z: number, y?: number): number;
  constrain(x: number, z: number, radius?: number, y?: number): { x: number; z: number };
  /** Nur im Verbund: Lage auf einer Leiter (Anteil t, 0 = Fuß) und ihre Raumlänge, für Läufer, die klettern */
  ladderAt?(id: string, t: number, out: { x: number; y: number; z: number }): boolean;
  ladderLength?(id: string): number;
}

/** Achterdeck mit Treppen (Schiffskoordinaten, Höhen relativ zum Hauptdeck) */
export interface QuarterDeck {
  z0: number; z1: number; top: number; stairX: number[]; stairW: number; stairLen: number; flare?: number;
  /** Halbe Breite der Kajütentür in der Vorderwand des Achterkastells (Tür bei x = 0) */
  doorHalf?: number;
  /** Innenraum der Kapitänskajüte unter dem Achterdeck: hintere und vordere Innenkante (z) */
  cabin?: { zA: number; zB: number };
}

/** Vordeck mit zwei geraden Treppen an der Rückwand (z0 = Rückkante, z1 = Spitze) */
export interface ForeDeck { z0: number; z1: number; top: number; stairX: number[]; stairW: number; stairLen: number }

/** Dünne feste Wand im Schiffsraum (Mitte, halbe Ausdehnung) */
interface DeckWall {
  cx: number; cz: number; hx: number; hz: number;
  /** Möbel der Kajüte: nur im Innenraum fest */
  cabin?: boolean;
  /** Vorderwand mit Treppenlücken: immer fest */
  edge?: boolean;
  /** Wand über der Kajütentür: fest nur auf dem Achterdeck (oben), damit man dort nicht durch die Türlücke fällt */
  door?: boolean;
}

/**
 * Deck eines Schiffs: Hauptdeck, Achterdeck (nur über die Treppen erreichbar) und die Treppenrampen. Höhe und Kollision folgen
 * dem Modell: Die Vorderwand des Achterkastells ist eine feste Wand mit Öffnungen genau an den Treppen, die Treppen haben
 * seitlich Wangen. Man läuft also wirklich hinauf und hinunter, ohne Sprung oder Verschiebung.
 */
export class DeckGround implements Ground {
  private walls: DeckWall[] = [];
  /** Wo steht die Figur: 0 Hauptdeck, 1 Achterdeck (oben), 2 Kapitänskajüte (unter dem Achterdeck, durch die Tür); −1 = noch unbekannt */
  private zone = -1;

  constructor(private ship: { entityId?: string; x: number; z: number; heading: number; cls: { L: number }; model: { deckY: number; group: { position: { y: number }; matrixWorld: { elements: ArrayLike<number> }; updateMatrixWorld(force?: boolean): void }; halfWidth(z: number): number; quarter?: QuarterDeck; fore?: ForeDeck | null; blockers?: DeckWall[]; cabinRoof?: { visible: boolean } } }) {
    ship.model.group.updateMatrixWorld(true);
    // feste Aufbauten (Masten, Luke, Fässer, Möbel, Vorderkastell) sind Hindernisse
    for (const b of ship.model.blockers ?? []) this.walls.push(b);
    const q = ship.model.quarter;
    if (!q) return;
    const big = ship.cls.L;
    // Öffnungen in der Vorderwand: die Treppen und die Kajütentür (ohne die Tür blieb die Kajüte vom Hauptdeck aus unerreichbar;
    // auf dem Achterdeck schließt die Türwand unten die Lücke wieder gegen den Absturz)
    const gaps = [...q.stairX.map((x) => [x - q.stairW / 2, x + q.stairW / 2]), ...(q.cabin ? [[-(q.doorHalf ?? 0.6), q.doorHalf ?? 0.6]] : [])].sort((a, b) => a[0] - b[0]);
    // Vorderwand des Achterkastells mit Öffnungen an den Treppen
    let cur = -big;
    for (const g of gaps) { if (g[0] > cur) this.walls.push({ cx: (cur + g[0]) / 2, cz: q.z1, hx: (g[0] - cur) / 2, hz: 0.07, edge: true }); cur = g[1]; }
    if (big > cur) this.walls.push({ cx: (cur + big) / 2, cz: q.z1, hx: (big - cur) / 2, hz: 0.07, edge: true });
    // Türlücke: auf dem Achterdeck zu (Absturzkante), vom Hauptdeck aus offen
    if (q.cabin) this.walls.push({ cx: 0, cz: q.z1, hx: q.doorHalf ?? 0.6, hz: 0.07, door: true });
    // Wangen der Treppen (bei geschwungenen Treppen als Kette kurzer Stücke entlang der Kurve)
    const fl = q.flare ?? 0;
    for (const sx of q.stairX) {
      for (const e of [-1, 1]) {
        if (fl <= 0) { this.walls.push({ cx: sx + e * (q.stairW / 2 + 0.04), cz: q.z1 + q.stairLen / 2, hx: 0.06, hz: q.stairLen / 2 }); continue; }
        const S = 18;
        let prev: { x: number; z: number } | null = null;
        for (let j = 0; j <= S; j++) {
          const t = j / S, N = this.stairN(sx, t), o = e * (q.stairW / 2 + 0.04);
          const pt = { x: this.stairCx(sx, t) + N.nx * o, z: q.z1 + q.stairLen * (1 - t) + N.nz * o };
          if (prev) this.walls.push({ cx: (pt.x + prev.x) / 2, cz: (pt.z + prev.z) / 2, hx: Math.abs(pt.x - prev.x) / 2 + 0.06, hz: Math.abs(pt.z - prev.z) / 2 + 0.06 });
          prev = pt;
        }
      }
    }
  }

  /** Mittellinie einer Treppe bei t (0 unten … 1 oben); geschwungene Treppen schwingen unten nach außen */
  private stairCx(sx: number, t: number) {
    const f = this.ship.model.quarter?.flare ?? 0;
    return sx + Math.sign(sx) * f * (1 - t) * (1 - t);
  }

  /** Querrichtung (x/z) senkrecht zur Lauflinie bei t; nx ist zugleich der Kosinus der Schräge */
  private stairN(sx: number, t: number) {
    const q = this.ship.model.quarter!;
    const f = q.flare ?? 0;
    const dx = -2 * Math.sign(sx) * f * (1 - t), dz = -q.stairLen, l = Math.hypot(dx, dz);
    return { nx: -dz / l, nz: dx / l };
  }

  private toLocal(x: number, z: number) {
    const dx = x - this.ship.x, dz = z - this.ship.z;
    const c = Math.cos(-this.ship.heading), s = Math.sin(-this.ship.heading);
    return { lx: dx * c + dz * s, lz: -dx * s + dz * c };
  }

  private toWorld(lx: number, lz: number) {
    const c = Math.cos(this.ship.heading), s = Math.sin(this.ship.heading);
    return { x: this.ship.x + lx * c + lz * s, z: this.ship.z - lx * s + lz * c };
  }

  /** Höhe über dem Hauptdeck an einer Schiffsposition: Achterdeck und Vordeck oben, Treppen als Rampe, sonst 0 */
  private level(lx: number, lz: number): number {
    const q = this.ship.model.quarter;
    const f = this.ship.model.fore;
    if (f) {
      if (lz >= f.z0) return f.top;
      if (lz > f.z0 - f.stairLen) for (const sx of f.stairX) if (Math.abs(lx - sx) <= f.stairW / 2 + 0.08) return f.top * (1 - (f.z0 - lz) / f.stairLen);
    }
    if (!q) return 0;
    if (lz <= q.z1) return lz >= q.z0 - 0.5 ? (this.zone === 2 ? 0 : q.top) : 0;
    if (lz < q.z1 + q.stairLen) {
      const t = 1 - (lz - q.z1) / q.stairLen;
      for (const sx of q.stairX) if (Math.abs(lx - this.stairCx(sx, t)) * this.stairN(sx, t).nx <= q.stairW / 2 + 0.08) return q.top * (1 - (lz - q.z1) / q.stairLen);
    }
    return 0;
  }

  /**
   * Höhe des Decks an einer Weltposition. Folgt der Neigung des Schiffs (Nicken und Rollen im Seegang), nicht nur dem Auf und Ab:
   * sonst schwebt man im Sturm über dem Deck oder steckt in den Planken, besonders auf den Treppen. Ohne Position: Höhe des Hauptdecks.
   */
  height(x?: number, z?: number) {
    const m = this.ship.model.group.matrixWorld.elements;
    if (x === undefined || z === undefined) return m[5] * this.ship.model.deckY + m[13];
    const { lx, lz } = this.toLocal(x, z);
    const ly = this.ship.model.deckY + this.level(lx, lz);
    return m[1] * lx + m[5] * ly + m[9] * lz + m[13];
  }

  /** In der Kapitänskajüte? (Dach und Reling oben werden dann ausgeblendet, die Kamera rückt näher) */
  get inCabin() { return this.zone === 2; }

  /** Zone wechseln: über die Treppe aufs Achterdeck, durch die Tür in die Kajüte, vorn wieder hinaus aufs Hauptdeck */
  private updateZone(lx: number, lz: number, q: QuarterDeck) {
    const z1 = q.z1;
    const before = this.zone;
    if (this.zone < 0) this.zone = lz <= z1 ? 1 : 0;
    else if (lz > z1 + 0.04) this.zone = 0;
    else if (this.zone === 0 && lz <= z1 - 0.02) this.zone = Math.abs(lx) < (q.doorHalf ?? 0.6) ? 2 : 1;
    if (before !== this.zone) { const roof = this.ship.model.cabinRoof; if (roof) roof.visible = this.zone !== 2; }
  }

  /** Gilt die Wand gerade? Möbel nur in der Kajüte, Aufbauten des Achterdecks nicht darunter, die Wand über der Tür nur oben */
  private active(w: DeckWall): boolean {
    if (w.edge) return true;
    if (w.door) return this.zone === 1;
    if (w.cabin) return this.zone === 2;
    const q = this.ship.model.quarter;
    if (this.zone === 2 && q && w.cz <= q.z1 && w.cz >= q.z0 - 0.5) return false;
    return true;
  }

  /** Kreis (r) aus einer Wand herausschieben, auf der Seite, auf der er gerade ist (die Wände sind dünn, die Schritte klein) */
  private pushWall(w: DeckWall, lx: number, lz: number, r: number) {
    const nx = Math.max(w.cx - w.hx, Math.min(w.cx + w.hx, lx));
    const nz = Math.max(w.cz - w.hz, Math.min(w.cz + w.hz, lz));
    let dx = lx - nx, dz = lz - nz;
    const d = Math.hypot(dx, dz);
    if (d >= r) return { lx, lz };
    if (d > 1e-5) return { lx: nx + (dx / d) * r, lz: nz + (dz / d) * r };
    // Mittelpunkt in der Wand: entlang der kürzesten Achse hinaus
    dx = lx - w.cx; dz = lz - w.cz;
    if (Math.abs(dx) / (w.hx + 1e-6) > Math.abs(dz) / (w.hz + 1e-6)) return { lx: w.cx + Math.sign(dx || 1) * (w.hx + r), lz };
    return { lx, lz: w.cz + Math.sign(dz || 1) * (w.hz + r) };
  }

  constrain(x: number, z: number, radius = 0.35) {
    const { lx, lz } = this.toLocal(x, z);
    const L = this.ship.cls.L;
    const q = this.ship.model.quarter;
    if (q?.cabin) this.updateZone(lx, lz, q);
    const cab = this.zone === 2 && !!q?.cabin;
    const zMin = cab ? q!.cabin!.zA + radius : q ? q.z0 + 0.35 + radius : -L / 2 + L * 0.28;
    // bis ganz nach vorn in die Bugspitze (dort wird das Deck schmal)
    const cz = Math.max(zMin, Math.min(L / 2 * 0.93, lz));
    const top = !!q && cz <= q.z1;
    const hw = Math.max(0.3, cab ? this.ship.model.halfWidth(cz) * 0.9 - 0.18 - radius : this.ship.model.halfWidth(cz) * (top ? 0.86 : 0.85) - radius);
    let px = Math.max(-hw, Math.min(hw, lx)), pz = cz;
    for (let it = 0; it < 2; it++) for (const w of this.walls) { if (!this.active(w)) continue; const o = this.pushWall(w, px, pz, radius); px = o.lx; pz = o.lz; }
    // in der Kajüte nie hinter die Heckwand (auch nicht, wenn ein Möbelstück den Punkt herausschiebt)
    if (cab) pz = Math.max(pz, q!.cabin!.zA + radius);
    return this.toWorld(px, pz);
  }

  /** Lokale Deckposition (z: Anteil der Länge) in Weltkoordinaten */
  /** Abstand zur Reling (für „Angeln“ an der Bordwand) */
  railDistance(x: number, z: number) {
    const { lx, lz } = this.toLocal(x, z);
    return this.ship.model.halfWidth(lz) * 0.95 - Math.abs(lx);
  }

  /** Auf dem Achterdeck (oben)? */
  onQuarter(x: number, z: number) {
    const q = this.ship.model.quarter;
    if (!q) return false;
    const { lz } = this.toLocal(x, z);
    return this.zone !== 2 && lz <= q.z1 && lz >= q.z0 - 0.5;
  }

  /** Abstand eines Weltpunkts zum Steuerplatz (Schiffskoordinate z, x = 0) in der Ebene */
  distTo(x: number, z: number, lx0: number, lz0: number) {
    const { lx, lz } = this.toLocal(x, z);
    return Math.hypot(lx - lx0, lz - lz0);
  }

  spot(fx: number, fz: number) {
    const L = this.ship.cls.L;
    const q = this.ship.model.quarter;
    const zStart = q ? q.z1 + q.stairLen + 0.8 : -L / 2 + L * 0.28;
    // vor dem Treppenfuß des Vordecks enden
    const zEnd = this.ship.model.fore ? this.ship.model.fore.z0 - this.ship.model.fore.stairLen - 0.8 : L / 2 - L * 0.12;
    const lz = zStart + (fz * 0.5 + 0.5) * Math.max(2, zEnd - zStart);
    return this.toWorld(fx * this.ship.model.halfWidth(lz) * 0.7, lz);
  }

  /** Kennung des Schiffs (leer, wenn es keine hat) */
  get shipId(): string { return this.ship.entityId ?? ''; }

  /** Liegt ein Weltpunkt im Rumpfgrundriss (Bordwand innen, Bug- und Hecklinie)? Entscheidet im Verbund, ob das Deck zuständig ist */
  inHull(x: number, z: number): boolean {
    const dx = x - this.ship.x, dz = z - this.ship.z;
    const c = Math.cos(-this.ship.heading), s = Math.sin(-this.ship.heading);
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    const half = this.ship.cls.L / 2 * 0.97;
    return Math.abs(lz) <= half && Math.abs(lx) <= this.ship.model.halfWidth(lz);
  }

  /** Halbe begehbare Breite des Hauptdecks bei Schiffs-z (wie `constrain`, für Radius `r`) */
  walkHalf(lz: number, r = 0.35): number { return Math.max(0.3, this.ship.model.halfWidth(lz) * 0.85 - r); }

  /**
   * Ankerpunkt am Deck ohne Allokation: Schiffskoordinaten (lx, lz) und Höhe `dy` über dem Hauptdeck → Welt (x, y, z). Folgt der Lage
   * der Schiffsmatrix (Nicken und Rollen), die Brücke liegt also jederzeit bündig an der bewegten Bordwand.
   */
  anchorInto(lx: number, lz: number, dy: number, out: { x: number; y: number; z: number }) {
    const h = this.ship.heading, c = Math.cos(h), s = Math.sin(h);
    out.x = this.ship.x + lx * c + lz * s;
    out.z = this.ship.z - lx * s + lz * c;
    const m = this.ship.model.group.matrixWorld.elements;
    const ly = this.ship.model.deckY + dy;
    out.y = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
    return out;
  }

  /** Punkt in Schiffskoordinaten in die Welt */
  world(lx: number, lz: number) { return this.toWorld(lx, lz); }
}

export class IslandGround implements Ground {
  readonly islands: WalkIsland[] = [];
  /** Stege (Weltkoordinaten): begehbar auch über dem Wasser, die Bohlen liegen auf pier.y */
  piers: Pier[] = [];
  /** Feste Hindernisse nur für Schiffe (Seetor und Mauern der Raid-Instanz): gedrehte Quader in Weltkoordinaten; leer = nichts zu prüfen */
  shipBlockers: Blocker[] = [];

  /** Nächster Steg zu einem Punkt: Parameter t (0 … 1 entlang), Abstand quer zur Mitte (lat) und Länge */
  pierNear(x: number, z: number, margin: number): { p: Pier; t: number; lat: number; len: number; cx: number; cz: number } | null {
    let best: { p: Pier; t: number; lat: number; len: number; cx: number; cz: number } | null = null;
    for (const p of this.piers) {
      const vx = p.bx - p.ax, vz = p.bz - p.az;
      const len = Math.hypot(vx, vz) || 1;
      const t = ((x - p.ax) * vx + (z - p.az) * vz) / (len * len);
      if (t < -margin / len || t > 1 + margin / len) continue;
      const tc = clamp01(t);
      const cx = p.ax + vx * tc, cz = p.az + vz * tc;
      const lat = Math.hypot(x - cx, z - cz);
      if (lat > p.hw + margin) continue;
      if (!best || lat < best.lat) best = { p, t: tc, lat, len, cx, cz };
    }
    return best;
  }

  add(i: WalkIsland) { this.islands.push(i); }

  /** Küstenradius einer Insel in Richtung eines Punktes */
  edge(i: WalkIsland, x: number, z: number): number { return i.r * coastK(i.coast, Math.atan2(z - i.z, x - i.x)); }

  /** Insel, auf oder an der ein Punkt liegt (folgt der echten Küstenlinie) */
  islandAt(x: number, z: number, margin = 0): WalkIsland | null {
    for (const i of this.islands) {
      const d = Math.hypot(x - i.x, z - i.z);
      if (d > i.r * 1.5 + margin) continue;
      if (d < this.edge(i, x, z) + margin) return i;
    }
    return null;
  }

  /**
   * Schiff aus allen Inseln heraushalten: Bug, Mitte und Heck werden geprüft (vorher nur die Mitte – lange Schiffe
   * lagen mit dem Bug auf dem Strand). Der Strand reicht als Böschung noch gut 10 % über die Küstenlinie hinaus.
   */
  pushShip(x: number, z: number, heading: number, L: number, W: number): { x: number; z: number; hit: boolean } {
    let hit = false;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    for (const k of [0.44, 0, -0.44]) {
      const px = x + fx * L * k, pz = z + fz * L * k;
      for (const i of this.islands) {
        const d = Math.hypot(px - i.x, pz - i.z);
        if (d > i.r * 1.9 + W) continue;
        const a = Math.atan2(pz - i.z, px - i.x);
        const e = i.r * coastK(i.coast, a);
        // knapp vor der Wasserlinie halten (vorher fest 11 % des Radius: beim Festland 30–37 m vor dem Strand)
        const lim = e * (1 + i.shelf * WATERLINE) + W * 0.5 + 1.2;
        if (d >= lim) continue;
        x += Math.cos(a) * (lim - d);
        z += Math.sin(a) * (lim - d);
        hit = true;
      }
      // Seetor und Mauern: aus dem Quader auf der Seite mit der kleinsten Eindringtiefe herausschieben
      for (const b of this.shipBlockers) {
        const dx = px - b.x, dz = pz - b.z;
        if (dx * dx + dz * dz > (b.r + W + 2) ** 2) continue;
        const c = Math.cos(b.yaw ?? 0), s = Math.sin(b.yaw ?? 0);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const hw = (b.hw ?? 0) + W * 0.5 + 1, hd = (b.hd ?? 0) + W * 0.5 + 1;
        if (Math.abs(lx) >= hw || Math.abs(lz) >= hd) continue;
        let nx = lx, nz = lz;
        if (hw - Math.abs(lx) < hd - Math.abs(lz)) nx = (lx < 0 ? -1 : 1) * hw; else nz = (lz < 0 ? -1 : 1) * hd;
        x += b.x + nx * c + nz * s - px;
        z += b.z - nx * s + nz * c - pz;
        hit = true;
      }
    }
    return { x, z, hit };
  }

  /**
   * Abstand (m) eines Schiffspunkts zur Kontaktgrenze der nächsten Insel, genau so, wie `pushShip` sie sieht (Küste samt Strandböschung plus halbe Breite):
   * positiv = frei, null oder negativ = Grundberührung. Es gibt keine Tiefenkarte; die Böschung der Insel ist die einzige „flache“ Zone. Inseln
   * weiter als `reach` entfernt zählen nicht (Ergebnis höchstens `reach`), damit die KI-Fühler schnell bleiben. Keine Zuweisungen.
   */
  shipClearance(x: number, z: number, W: number, reach = 400): number {
    let best = reach;
    for (const i of this.islands) {
      const d = Math.hypot(x - i.x, z - i.z);
      if (d > i.r * 1.9 + W + reach) continue;
      const a = Math.atan2(z - i.z, x - i.x);
      const lim = i.r * coastK(i.coast, a) * (1 + i.shelf * WATERLINE) + W * 0.5 + 1.2;
      const c = d - lim;
      if (c < best) best = c;
    }
    return best;
  }

  /** Punkt aus einer Insel hinausschieben (Schiffe laufen nicht auf) */
  pushOut(i: WalkIsland, x: number, z: number, margin: number): { x: number; z: number } {
    const a = Math.atan2(z - i.z, x - i.x);
    const e = i.r * coastK(i.coast, a) + margin;
    return { x: i.x + Math.cos(a) * e, z: i.z + Math.sin(a) * e };
  }

  /** Höhe einer einzelnen Insel (Weltkoordinaten); −∞ außerhalb. Gleiche Rechnung für Gelände-Mesh und Laufhöhe. */
  islandHeight(i: WalkIsland, x: number, z: number, withLift = true, withPads = true): number {
    const d = Math.hypot(x - i.x, z - i.z);
    if (d > i.r * 1.9) return -Infinity;
    const e = this.edge(i, x, z);
    if (d > e * (1 + i.shelf)) return -Infinity;
    // Plateau bis zur Küste, dann gleichmäßig 3 m über die Böschung hinab (wie das Strand-Mesh)
    let y = d <= e ? i.beachY : i.beachY - ((d - e) / (e * i.shelf)) * 3;
    for (const h of i.hills) {
      const dh = Math.hypot(x - h.x, z - h.z);
      if (dh < h.r) y = Math.max(y, i.hillY + hillProfile(dh / h.r) * h.r * h.h);
    }
    // Relief: überall im Inland, zur Wasserlinie hin auslaufend (Stege, Strand und Brandung bleiben, wie sie sind)
    if (d < e) {
      const t = d / e;
      const fade = 1 - clamp01((t - 0.78) / 0.2);
      y += reliefAt(i, x - i.x, z - i.z) * fade * fade * (3 - 2 * fade) ;
    }
    if (withPads && i.pads && d < e) {
      // von hinten nach vorn: früher angemeldete Flächen gewinnen (ein Haus behält seinen Boden, wenn später ein Nachbar einebnet)
      for (let k = i.pads.length - 1; k >= 0; k--) {
        const p = i.pads[k];
        const dx = x - p.x, dz = z - p.z;
        if (dx * dx + dz * dz > p.r2) continue;
        let sd: number;
        if (p.round) sd = Math.max(0, Math.hypot(dx, dz) - p.hw);
        else {
          const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
          const lx = Math.abs(dx * c - dz * sn) - p.hw, lz = Math.abs(dx * sn + dz * c) - p.hd;
          sd = Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
        }
        if (sd >= p.blend) continue;
        const t = 1 - sd / p.blend, w = t * t * (3 - 2 * t);
        y += (p.y - y) * w;
      }
    }
    if (withLift && i.lift) y += i.lift(x - i.x, z - i.z);
    return y;
  }

  /** Bodenhöhe an einem Punkt (−∞ wenn kein Land) – identisch mit dem sichtbaren Gelände */
  height(x: number, z: number): number {
    let best = -Infinity;
    for (const i of this.islands) {
      const y = this.islandHeight(i, x, z);
      if (y > best) best = y;
    }
    // Stege: Bohlen auf ihrer Höhe (auch dort, wo kein Land mehr ist)
    if (this.piers.length) {
      const pn = this.pierNear(x, z, 0);
      if (pn && pn.lat <= pn.p.hw) best = Math.max(best, pn.p.y);
    }
    return best;
  }

  /** Bewegung auf der Insel halten und um Hindernisse herumschieben */
  constrain(x: number, z: number, radius = 0.35): { x: number; z: number } {
    const isl = this.islandAt(x, z, 4);
    // Wer auf einem Steg steht, bleibt auf den Bohlen (quer begrenzt, an der Spitze gestoppt)
    const pn = this.piers.length ? this.pierNear(x, z, 1.0) : null;
    if (!isl) {
      if (!pn) return { x, z };
      return this.clampToPier(pn, x, z, radius);
    }
    // bis zu drei Durchgänge: wer aus einem Objekt geschoben wird, kann im Nachbarobjekt landen (Haus mit Kisten davor)
    for (let pass = 0; pass < 3; pass++) {
    const x0 = x, z0 = z;
    for (const b of isl.blockers) {
      const dx = x - b.x, dz = z - b.z;
      if (b.hw !== undefined) {
        // Rechteck: nächsten Randpunkt suchen und um den Figurenradius herausschieben
        if (dx * dx + dz * dz > (b.r + radius) ** 2) continue;
        const c = Math.cos(b.yaw ?? 0), s = Math.sin(b.yaw ?? 0);
        let lx = dx * c - dz * s, lz = dx * s + dz * c;
        const hw = b.hw, hd = b.hd ?? 0;
        const qx = Math.max(-hw, Math.min(hw, lx)), qz = Math.max(-hd, Math.min(hd, lz));
        const ex = lx - qx, ez = lz - qz, e = Math.hypot(ex, ez);
        if (e >= radius) continue;
        if (e > 1e-4) { lx = qx + (ex / e) * radius; lz = qz + (ez / e) * radius; }
        else if (hw - Math.abs(lx) < hd - Math.abs(lz)) lx = (lx < 0 ? -1 : 1) * (hw + radius);
        else lz = (lz < 0 ? -1 : 1) * (hd + radius);
        x = b.x + lx * c + lz * s; z = b.z - lx * s + lz * c;
        continue;
      }
      const d = Math.hypot(dx, dz);
      const min = b.r + radius;
      if (d < min && d > 0.0001) { x = b.x + (dx / d) * min; z = b.z + (dz / d) * min; }
    }
    if (x === x0 && z === z0) break;
    }
    // bis an die Wasserlinie, nicht weiter (vorher bis 102 % des Radius – dort lag der Boden schon tief unter dem Strand)
    const dx = x - isl.x, dz = z - isl.z;
    const d = Math.hypot(dx, dz);
    const max = this.edge(isl, x, z) * (1 + isl.shelf * 0.16);
    if (d > max) {
      // jenseits der Wasserlinie nur auf einem Steg weitergehen
      const pn2 = this.piers.length ? this.pierNear(x, z, 1.0) : null;
      if (pn2) return this.clampToPier(pn2, x, z, radius);
      x = isl.x + (dx / d) * max; z = isl.z + (dz / d) * max;
    }
    return { x, z };
  }

  /** Punkt auf die Bohlen eines Stegs setzen: quer höchstens bis zum Rand, längs bis zur Spitze */
  private clampToPier(pn: { p: Pier; t: number; lat: number; len: number; cx: number; cz: number }, x: number, z: number, radius: number): { x: number; z: number } {
    const p = pn.p;
    const vx = (p.bx - p.ax) / pn.len, vz = (p.bz - p.az) / pn.len;
    // Längs- und Querkoordinate
    let u = (x - p.ax) * vx + (z - p.az) * vz;
    let l = (x - p.ax) * -vz + (z - p.az) * vx;
    const lim = Math.max(0.2, p.hw - Math.min(radius, 0.5) * 0.6);
    l = Math.max(-lim, Math.min(lim, l));
    u = Math.min(pn.len - 0.35, u);
    return { x: p.ax + vx * u - vz * l, z: p.az + vz * u + vx * l };
  }

  /** Nächster Strandpunkt einer Insel zu einer Position (zum Anlanden) */
  shorePoint(isl: WalkIsland, fromX: number, fromZ: number) {
    const a = Math.atan2(fromZ - isl.z, fromX - isl.x);
    const e = isl.r * coastK(isl.coast, a) * 0.9;
    return { x: isl.x + Math.cos(a) * e, z: isl.z + Math.sin(a) * e, angle: a };
  }
}

/** Laufende Brücke im Verbund: Beschreibung (Daten), aktuelle Lage und ob man darauf geht (Leitern: nur Klettern) */
export interface BridgeRt { def: BridgeDef; f: BridgeFrame; walk: boolean; ok: boolean }

const _a = { x: 0, y: 0, z: 0 };
const _b = { x: 0, y: 0, z: 0 };
const _sl = { s: 0, l: 0 };

/**
 * Gemeinsamer Boden: Insel mit Stegen (`IslandGround`), bis zu zwei aktive Schiffsdecks (eigenes und geentertes Schiff) und die aktiven
 * Brücken dazwischen (Gangway, Enterplanken, Leitern, Watweg zum Ufer). Eine gemeinsame `constrain`/`height`-Pipeline:
 *  1. Läufer MIT Höhenhinweis `y`: steht er auf einer Brücke (Grundriss im Streifen und Höhe innerhalb der Stufenhöhe), gilt die Brücke;
 *     sonst das Deck, in dessen Rumpf er steht, sonst Insel/Steg. Unter einer Brücke ist die Fläche gesperrt, solange die lichte Höhe
 *     unter `BRIDGE_CLEARANCE` liegt (man geht nicht quer in die Rampe).
 *  2. Aufrufer OHNE Hinweis (Gegner, Kamera, Effekte): das Deck, in dessen Rumpf der Punkt liegt, sonst Insel/Steg.
 * Brücken hängen an Ankern (fest in der Welt oder am Deck eines Schiffs); `update()` rechnet ihre Lage je Logikbild neu, ohne Allokation:
 * die bewegte Deckshöhe an der Bordwand (aus der Schiffsmatrix) und die feste Steg-/Uferhöhe ergeben die Neigung, die Brücke liegt bündig.
 */
export class CompositeGround implements Ground {
  readonly bridges: BridgeRt[] = [];
  private decks: DeckGround[] = [];

  constructor(readonly island: IslandGround) {}

  // ---------- Verwaltung ----------

  /** Aktive Decks setzen (höchstens zwei: eigenes Schiff und geentertes Schiff) */
  setDecks(...d: (DeckGround | null | undefined)[]) {
    this.decks.length = 0;
    for (const x of d) if (x && this.decks.length < 2) this.decks.push(x);
  }
  get deckCount() { return this.decks.length; }
  deckOf(shipId: string): DeckGround | null { for (const d of this.decks) if (d.shipId === shipId) return d; return null; }

  /** Brücke eintragen (ersetzt eine mit gleicher Kennung); `walk` = begehbar (Gangway, Planke, Watweg) */
  addBridge(def: BridgeDef, walk = def.kind !== 'ladder'): BridgeRt {
    this.removeBridge(def.id);
    const rt: BridgeRt = { def, f: makeFrame(), walk, ok: false };
    this.bridges.push(rt);
    this.resolve(rt);
    return rt;
  }
  removeBridge(id: string) {
    const i = this.bridges.findIndex((b) => b.def.id === id);
    if (i >= 0) this.bridges.splice(i, 1);
  }
  clearBridges() { this.bridges.length = 0; }
  bridge(id: string): BridgeRt | null { for (const b of this.bridges) if (b.def.id === id) return b; return null; }

  /** Anker in Weltkoordinaten; false, wenn das Deck nicht (mehr) aktiv ist */
  private anchor(a: Anchor, out: { x: number; y: number; z: number }): boolean {
    if (a.ref === 'world') { out.x = a.x; out.y = a.y; out.z = a.z; return true; }
    const d = this.deckOf(a.shipId);
    if (!d) return false;
    d.anchorInto(a.lx, a.lz, a.dy, out);
    return true;
  }

  private resolve(b: BridgeRt) {
    b.ok = this.anchor(b.def.a, _a) && this.anchor(b.def.b, _b);
    if (b.ok) setFrame(b.f, _a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
  }

  /** Je Logikbild: Lage aller Brücken aus den Ankern (feste Steghöhe ↔ bewegte Deckshöhe) neu berechnen */
  update() { for (const b of this.bridges) this.resolve(b); }

  /** Lage auf einer Leiter (Anteil t, 0 = unten/Anfang) – für Kletter-Läufer */
  ladderAt(id: string, t: number, out: { x: number; y: number; z: number }): boolean {
    const b = this.bridge(id);
    if (!b || !b.ok) return false;
    const k = clamp01(t);
    out.x = b.f.ax + (b.f.bx - b.f.ax) * k;
    out.z = b.f.az + (b.f.bz - b.f.az) * k;
    out.y = b.f.ay + (b.f.by - b.f.ay) * k;
    return true;
  }
  ladderLength(id: string): number { const b = this.bridge(id); return b && b.ok ? spanLength(b.f) : 0; }

  // ---------- Boden ----------

  /** Höhe des Watwegs: Gelände unter Wasser, mindestens 0,5 m unter der Wasserlinie */
  private wadeH(x: number, z: number): number {
    const h = this.island.height(x, z);
    return Number.isFinite(h) ? Math.max(-0.5, h) : -0.5;
  }

  private bridgeH(b: BridgeRt, s: number, x: number, z: number): number {
    return b.def.kind === 'wade' ? this.wadeH(x, z) : frameHeight(b.f, s);
  }

  /** Brücke, auf der ein Läufer mit Höhe y an (x, z) steht (nächste in der Höhe); füllt `_sl` mit s und l */
  private pickBridge(x: number, z: number, y: number): BridgeRt | null {
    let best: BridgeRt | null = null, bd = Infinity, bs = 0, bl = 0;
    for (const b of this.bridges) {
      if (!b.walk || !b.ok || b.def.out < 0.98) continue;
      frameCoords(b.f, x, z, _sl);
      if (_sl.s < 0 || _sl.s > b.f.len || Math.abs(_sl.l) > b.def.hw + 0.12) continue;
      const dy = Math.abs(this.bridgeH(b, _sl.s, x, z) - y);
      const lim = b.def.kind === 'wade' ? 1.3 : BRIDGE_STEP;
      if (dy <= lim && dy < bd) { bd = dy; best = b; bs = _sl.s; bl = _sl.l; }
    }
    _sl.s = bs; _sl.l = bl;
    return best;
  }

  private deckAt(x: number, z: number): DeckGround | null {
    for (const d of this.decks) if (d.inHull(x, z)) return d;
    return null;
  }

  /** Deck, in dessen Rumpfgrundriss ein Punkt liegt (null auf Insel, Steg und Brücke) */
  deckAtPoint(x: number, z: number): DeckGround | null { return this.decks.length ? this.deckAt(x, z) : null; }

  /** Steht ein Läufer mit Höhe y auf einer begehbaren Brücke? */
  onBridge(x: number, z: number, y: number): boolean { return this.bridges.length > 0 && this.pickBridge(x, z, y) !== null; }

  height(x: number, z: number, y?: number): number {
    if (y !== undefined && this.bridges.length) {
      const b = this.pickBridge(x, z, y);
      if (b) return this.bridgeH(b, _sl.s, x, z);
    }
    const d = this.decks.length ? this.deckAt(x, z) : null;
    return d ? d.height(x, z) : this.island.height(x, z);
  }

  constrain(x: number, z: number, radius = 0.35, y?: number): { x: number; z: number } {
    if (y !== undefined && this.bridges.length) {
      const b = this.pickBridge(x, z, y);
      if (b) {
        const s = _sl.s;
        let l = _sl.l;
        const f = b.f, def = b.def;
        // Geländer nur zwischen den freien Enden; Enden über Deck/Steg lassen seitlich frei
        if (s >= def.freeA && s <= f.len - def.freeB) {
          const lim = Math.max(0.25, def.hw - Math.min(radius, 0.45) * 0.7);
          l = Math.max(-lim, Math.min(lim, l));
        }
        return { x: f.ax + f.ux * s - f.uz * l, z: f.az + f.uz * s + f.ux * l };
      }
      // unter einer Rampe: gesperrt, solange die lichte Höhe zu klein ist (nicht quer in die Gangway laufen)
      for (const bb of this.bridges) {
        if (!bb.walk || !bb.ok || bb.def.kind === 'wade') continue;
        frameCoords(bb.f, x, z, _sl);
        if (_sl.s < 0 || _sl.s > bb.f.len || Math.abs(_sl.l) > bb.def.hw + radius) continue;
        const clear = frameHeight(bb.f, _sl.s) - y;
        if (clear > BRIDGE_STEP && clear < BRIDGE_CLEARANCE) {
          const edge = (bb.def.hw + radius + 0.03) * (_sl.l >= 0 ? 1 : -1);
          x = bb.f.ax + bb.f.ux * _sl.s - bb.f.uz * edge;
          z = bb.f.az + bb.f.uz * _sl.s + bb.f.ux * edge;
          break;
        }
      }
    }
    const d = this.decks.length ? this.deckAt(x, z) : null;
    return d ? d.constrain(x, z, radius) : this.island.constrain(x, z, radius);
  }
}
