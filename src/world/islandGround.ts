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
  /** Hindernisse in Weltkoordinaten: rund (r) oder gedrehter Quader (hw, hd, yaw; r = umschließender Radius) */
  blockers: Blocker[];
}

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

/** Etwas Begehbares: Insel oder Schiffsdeck */
export interface Ground {
  height(x: number, z: number): number;
  constrain(x: number, z: number, radius?: number): { x: number; z: number };
}

/** Deck eines (beim Entern ruhig liegenden) Schiffs */
export class DeckGround implements Ground {
  constructor(private ship: { x: number; z: number; heading: number; cls: { L: number }; model: { deckY: number; group: { position: { y: number } }; halfWidth(z: number): number } }) {}

  private toLocal(x: number, z: number) {
    const dx = x - this.ship.x, dz = z - this.ship.z;
    const c = Math.cos(-this.ship.heading), s = Math.sin(-this.ship.heading);
    return { lx: dx * c + dz * s, lz: -dx * s + dz * c };
  }

  private toWorld(lx: number, lz: number) {
    const c = Math.cos(this.ship.heading), s = Math.sin(this.ship.heading);
    return { x: this.ship.x + lx * c + lz * s, z: this.ship.z - lx * s + lz * c };
  }

  height() { return this.ship.model.group.position.y + this.ship.model.deckY; }

  constrain(x: number, z: number, radius = 0.35) {
    const { lx, lz } = this.toLocal(x, z);
    const L = this.ship.cls.L;
    const cz = Math.max(-L / 2 + L * 0.28, Math.min(L / 2 - L * 0.12, lz));
    const hw = this.ship.model.halfWidth(cz) * 0.85 - radius;
    const cx = Math.max(-hw, Math.min(hw, lx));
    return this.toWorld(cx, cz);
  }

  /** Lokale Deckposition (z: Anteil der Länge) in Weltkoordinaten */
  /** Abstand zur Reling (für „Angeln“ an der Bordwand) */
  railDistance(x: number, z: number) {
    const { lx, lz } = this.toLocal(x, z);
    return this.ship.model.halfWidth(lz) * 0.95 - Math.abs(lx);
  }

  spot(fx: number, fz: number) {
    const L = this.ship.cls.L;
    const lz = -L / 2 + L * 0.28 + (fz * 0.5 + 0.5) * (L * 0.6);
    return this.toWorld(fx * this.ship.model.halfWidth(lz) * 0.7, lz);
  }
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
        const lim = e * 1.11 + W * 0.5 + 1.2;
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
      if (d > e * 1.25) continue;
      // Plateau bis zur Küste, dann gleichmäßig 3 m bis 1,25 × Küstenradius hinab (wie das Strand-Mesh)
      let y = d <= e ? i.beachY : i.beachY - ((d - e) / (e * 0.25)) * 3;
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
    const max = this.edge(isl, x, z) * 1.04;
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
