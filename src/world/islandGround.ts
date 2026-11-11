import type { IslandShape } from './ocean';

/** Ein Hügel: Mitte (Welt), Radius und Höhenfaktor (Kuppe = Halbkugel, in der Höhe gestaucht) */
export interface Hill { x: number; z: number; r: number; h: number }

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

/** Etwas Begehbares: Insel oder Schiffsdeck */
export interface Ground {
  height(x: number, z: number): number;
  constrain(x: number, z: number, radius?: number): { x: number; z: number };
}

/** Achterdeck mit Treppen (Schiffskoordinaten, Höhen relativ zum Hauptdeck) */
export interface QuarterDeck { z0: number; z1: number; top: number; stairX: number[]; stairW: number; stairLen: number; flare?: number }

/** Vordeck mit zwei geraden Treppen an der Rückwand (z0 = Rückkante, z1 = Spitze) */
export interface ForeDeck { z0: number; z1: number; top: number; stairX: number[]; stairW: number; stairLen: number }

/** Dünne feste Wand im Schiffsraum (Mitte, halbe Ausdehnung) */
interface DeckWall { cx: number; cz: number; hx: number; hz: number }

/**
 * Deck eines Schiffs: Hauptdeck, Achterdeck (nur über die Treppen erreichbar) und die Treppenrampen. Höhe und Kollision folgen
 * dem Modell: Die Vorderwand des Achterkastells ist eine feste Wand mit Öffnungen genau an den Treppen, die Treppen haben
 * seitlich Wangen. Man läuft also wirklich hinauf und hinunter, ohne Sprung oder Verschiebung.
 */
export class DeckGround implements Ground {
  private walls: DeckWall[] = [];

  constructor(private ship: { x: number; z: number; heading: number; cls: { L: number }; model: { deckY: number; group: { position: { y: number }; matrixWorld: { elements: ArrayLike<number> }; updateMatrixWorld(force?: boolean): void }; halfWidth(z: number): number; quarter?: QuarterDeck; fore?: ForeDeck | null; blockers?: DeckWall[] } }) {
    ship.model.group.updateMatrixWorld(true);
    // feste Aufbauten (Masten, Luke, Fässer, Möbel, Vorderkastell) sind Hindernisse
    for (const b of ship.model.blockers ?? []) this.walls.push(b);
    const q = ship.model.quarter;
    if (!q) return;
    const big = ship.cls.L;
    const gaps = q.stairX.map((x) => [x - q.stairW / 2, x + q.stairW / 2]).sort((a, b) => a[0] - b[0]);
    // Vorderwand des Achterkastells mit Öffnungen an den Treppen
    let cur = -big;
    for (const g of gaps) { if (g[0] > cur) this.walls.push({ cx: (cur + g[0]) / 2, cz: q.z1, hx: (g[0] - cur) / 2, hz: 0.07 }); cur = g[1]; }
    if (big > cur) this.walls.push({ cx: (cur + big) / 2, cz: q.z1, hx: (big - cur) / 2, hz: 0.07 });
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
    if (lz <= q.z1) return lz >= q.z0 - 0.5 ? q.top : 0;
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
    const zMin = q ? q.z0 + 0.35 + radius : -L / 2 + L * 0.28;
    // bis ganz nach vorn in die Bugspitze (dort wird das Deck schmal)
    const cz = Math.max(zMin, Math.min(L / 2 * 0.93, lz));
    const top = !!q && cz <= q.z1;
    const hw = Math.max(0.3, this.ship.model.halfWidth(cz) * (top ? 0.86 : 0.85) - radius);
    let px = Math.max(-hw, Math.min(hw, lx)), pz = cz;
    for (let it = 0; it < 2; it++) for (const w of this.walls) { const o = this.pushWall(w, px, pz, radius); px = o.lx; pz = o.lz; }
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
    return lz <= q.z1 && lz >= q.z0 - 0.5;
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

  /** Punkt in Schiffskoordinaten in die Welt */
  world(lx: number, lz: number) { return this.toWorld(lx, lz); }
}

export class IslandGround implements Ground {
  readonly islands: WalkIsland[] = [];

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
    }
    return { x, z, hit };
  }

  /** Punkt aus einer Insel hinausschieben (Schiffe laufen nicht auf) */
  pushOut(i: WalkIsland, x: number, z: number, margin: number): { x: number; z: number } {
    const a = Math.atan2(z - i.z, x - i.x);
    const e = i.r * coastK(i.coast, a) + margin;
    return { x: i.x + Math.cos(a) * e, z: i.z + Math.sin(a) * e };
  }

  /** Bodenhöhe an einem Punkt (−∞ wenn kein Land) – identisch mit dem sichtbaren Gelände */
  height(x: number, z: number): number {
    let best = -Infinity;
    for (const i of this.islands) {
      const d = Math.hypot(x - i.x, z - i.z);
      if (d > i.r * 1.9) continue;
      const e = this.edge(i, x, z);
      if (d > e * (1 + i.shelf)) continue;
      // Plateau bis zur Küste, dann gleichmäßig 3 m über die Böschung hinab (wie das Strand-Mesh)
      let y = d <= e ? i.beachY : i.beachY - ((d - e) / (e * i.shelf)) * 3;
      for (const h of i.hills) {
        const dh = Math.hypot(x - h.x, z - h.z);
        if (dh < h.r) y = Math.max(y, i.hillY + hillProfile(dh / h.r) * h.r * h.h);
      }
      best = Math.max(best, y);
    }
    return best;
  }

  /** Bewegung auf der Insel halten und um Hindernisse herumschieben */
  constrain(x: number, z: number, radius = 0.35): { x: number; z: number } {
    const isl = this.islandAt(x, z, 4);
    if (!isl) return { x, z };
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
    if (d > max) { x = isl.x + (dx / d) * max; z = isl.z + (dz / d) * max; }
    return { x, z };
  }

  /** Nächster Strandpunkt einer Insel zu einer Position (zum Anlanden) */
  shorePoint(isl: WalkIsland, fromX: number, fromZ: number) {
    const a = Math.atan2(fromZ - isl.z, fromX - isl.x);
    const e = isl.r * coastK(isl.coast, a) * 0.9;
    return { x: isl.x + Math.cos(a) * e, z: isl.z + Math.sin(a) * e, angle: a };
  }
}
