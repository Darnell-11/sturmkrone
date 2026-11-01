import type { IslandShape } from './ocean';

/** Begehbare Insel: Strandplateau, Hügel und Hindernisse (Palmen, Türme). */
export interface WalkIsland extends IslandShape {
  /** Höhe des Strandplateaus */
  beachY: number;
  /** Hügel: Radius und Höhenfaktor */
  hillR: number;
  hillScale: number;
  hillY: number;
  /** Runde Hindernisse in Weltkoordinaten */
  blockers: { x: number; z: number; r: number }[];
}

export class IslandGround {
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
      if (d < i.hillR) y = Math.max(y, i.hillY + Math.sqrt(i.hillR * i.hillR - d * d) * i.hillScale);
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
