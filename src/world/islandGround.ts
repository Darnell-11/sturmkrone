import type { IslandShape } from './ocean';

/** Begehbare Insel: Strandplateau, Hügel und Hindernisse (Palmen, Türme). */
export interface WalkIsland extends IslandShape {
  /** Höhe des Strandplateaus */
  beachY: number;
  /** Hügel: Radius und Höhenfaktor */
  hillR: number;
  hillScale: number;
  hillY: number;
  /** Versatz der Hügelmitte gegenüber der Inselmitte (jede Insel hat ihre eigene Form) */
  hx?: number;
  hz?: number;
  /** Runde Hindernisse in Weltkoordinaten */
  blockers: { x: number; z: number; r: number }[];
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

  /** Insel, auf oder an der ein Punkt liegt */
  islandAt(x: number, z: number, margin = 0): WalkIsland | null {
    for (const i of this.islands) if (Math.hypot(x - i.x, z - i.z) < i.r + margin) return i;
    return null;
  }

  /** Bodenhöhe an einem Punkt (−∞ wenn kein Land) */
  height(x: number, z: number): number {
    let best = -Infinity;
    for (const i of this.islands) {
      const d = Math.hypot(x - i.x, z - i.z);
      if (d > i.r * 1.15) continue;
      // Strand fällt am Rand sanft ins Wasser ab
      let y = i.beachY - Math.max(0, d - i.r * 0.92) * 4;
      const dh = Math.hypot(x - i.x - (i.hx ?? 0), z - i.z - (i.hz ?? 0));
      if (dh < i.hillR) y = Math.max(y, i.hillY + Math.sqrt(i.hillR * i.hillR - dh * dh) * i.hillScale);
      best = Math.max(best, y);
    }
    return best;
  }

  /** Bewegung auf der Insel halten und um Hindernisse herumschieben */
  constrain(x: number, z: number, radius = 0.35): { x: number; z: number } {
    const isl = this.islandAt(x, z, 4);
    if (!isl) return { x, z };
    for (const b of isl.blockers) {
      const dx = x - b.x, dz = z - b.z;
      const d = Math.hypot(dx, dz);
      const min = b.r + radius;
      if (d < min && d > 0.0001) { x = b.x + (dx / d) * min; z = b.z + (dz / d) * min; }
    }
    const dx = x - isl.x, dz = z - isl.z;
    const d = Math.hypot(dx, dz);
    const max = isl.r * 1.02;
    if (d > max) { x = isl.x + (dx / d) * max; z = isl.z + (dz / d) * max; }
    return { x, z };
  }

  /** Nächster Strandpunkt einer Insel zu einer Position (zum Anlanden) */
  shorePoint(isl: WalkIsland, fromX: number, fromZ: number) {
    const a = Math.atan2(fromZ - isl.z, fromX - isl.x);
    return { x: isl.x + Math.cos(a) * isl.r * 0.88, z: isl.z + Math.sin(a) * isl.r * 0.88, angle: a };
  }
}
