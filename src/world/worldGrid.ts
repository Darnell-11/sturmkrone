// Räumliches Raster der Welt (Phase 4.3A): reine, JSON-taugliche Daten ohne three.js.
//
// Die Karte ist in ein deterministisches 2D-Zellenraster (`CHUNK_SIZE` = 750 m, Schlüssel `"${cx},${cz}"`) geteilt. Jede Insel (und jeder Steg)
// trägt sich mit ihrem Umkreis in alle Zellen ein, die er berührt; eine Abfrage („was liegt nahe (x, z)?“) liest nur die Zellen unter ihrer
// Suchscheibe und prüft danach genau Scheibe gegen Scheibe. So fragen Schiffslenkung, `pushShip`, der Verbundboden und der WorldStreamer
// je Bild nur noch die 1 bis 3 Nachbarinseln statt der ganzen Weltkarte. Dasselbe Raster ist später die Grundlage der Interessenverwaltung
// des Mehrspielerbetriebs (Phase 4.7): wer welche Zellen sieht, bekommt deren Inhalt.

/** Kantenlänge einer Zelle in Metern */
export const CHUNK_SIZE = 750;

/** Zellennummer zu einer Weltkoordinate */
export function chunkCoord(v: number, size = CHUNK_SIZE): number { return Math.floor(v / size); }

/** Schlüssel einer Zelle: `"cx,cz"` (nur für Daten, Anzeige und Tests; die heiße Abfrage rechnet mit Zahlen) */
export function chunkKey(cx: number, cz: number): string { return `${cx},${cz}`; }

/** Schlüssel der Zelle, in der ein Weltpunkt liegt */
export function chunkKeyAt(x: number, z: number, size = CHUNK_SIZE): string { return chunkKey(chunkCoord(x, size), chunkCoord(z, size)); }

/** Schlüssel zurück in Zellennummern (NaN bei einem ungültigen Schlüssel) */
export function parseChunkKey(key: string): { cx: number; cz: number } {
  const i = key.indexOf(',');
  return { cx: i < 0 ? NaN : Number(key.slice(0, i)), cz: i < 0 ? NaN : Number(key.slice(i + 1)) };
}

/** Zahlenschlüssel einer Zelle (gültig für |cx|, |cz| < 32768 Zellen = rund 24 000 km) */
function numKey(cx: number, cz: number): number { return (cx + 32768) * 65536 + (cz + 32768); }

/** Eine Scheibe (Mittelpunkt, Radius) im Raster: Inseln mit ihrem Umkreis, Stege mit der halben Länge */
export interface Disc { x: number; z: number; r: number }

/** Das JSON-Abbild des Rasters: Scheiben und, zur Kontrolle und für Werkzeuge, welche Zelle welche Nummern führt */
export interface GridJSON {
  chunkSize: number;
  discs: [number, number, number][];
  chunks: Record<string, number[]>;
}

/**
 * Raster aus Scheiben. Nummern der Scheiben sind ihre Reihenfolge beim Eintragen (bei den Inseln der Index in `IslandGround.islands`).
 * Abfragen allokieren nichts: das Ergebnis geht in eine vom Aufrufer gelieferte Liste (je Aufrufer eine eigene, damit verschachtelte Abfragen
 * einander nicht überschreiben).
 */
export class SpatialGrid {
  private xs: number[] = [];
  private zs: number[] = [];
  private rs: number[] = [];
  private cells = new Map<number, number[]>();
  /** Zählmarken gegen doppelte Treffer (eine Scheibe steht in mehreren Zellen) */
  private stamp: number[] = [];
  private stampId = 0;
  /** Größter Radius aller Scheiben (Suchradius für „alles, dessen Mitte so nah liegt“) */
  maxR = 0;

  constructor(readonly size = CHUNK_SIZE) {}

  get count(): number { return this.xs.length; }

  clear(): void {
    this.xs.length = 0; this.zs.length = 0; this.rs.length = 0; this.stamp.length = 0;
    this.cells.clear();
    this.stampId = 0;
    this.maxR = 0;
  }

  /** Scheibe eintragen; liefert ihre Nummer */
  add(x: number, z: number, r: number): number {
    const i = this.xs.length;
    this.xs.push(x); this.zs.push(z); this.rs.push(r);
    this.stamp.push(0);
    if (r > this.maxR) this.maxR = r;
    const s = this.size;
    const cx0 = chunkCoord(x - r, s), cx1 = chunkCoord(x + r, s), cz0 = chunkCoord(z - r, s), cz1 = chunkCoord(z + r, s);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const k = numKey(cx, cz);
      const c = this.cells.get(k);
      if (c) c.push(i); else this.cells.set(k, [i]);
    }
    return i;
  }

  /**
   * Alle Scheiben, die die Suchscheibe (x, z, radius) berühren, in aufsteigender Nummer, ohne Doppelte, in `out` (die Länge wird gesetzt).
   * Gibt die Anzahl zurück. Genau: eine Scheibe zählt, wenn `Abstand ≤ ihr Radius + radius` gilt.
   */
  query(x: number, z: number, radius: number, out: number[]): number {
    const s = this.size;
    const id = ++this.stampId;
    let n = 0;
    const cx0 = chunkCoord(x - radius, s), cx1 = chunkCoord(x + radius, s), cz0 = chunkCoord(z - radius, s), cz1 = chunkCoord(z + radius, s);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const c = this.cells.get(numKey(cx, cz));
      if (!c) continue;
      for (let j = 0; j < c.length; j++) {
        const i = c[j];
        if (this.stamp[i] === id) continue;
        this.stamp[i] = id;
        const dx = x - this.xs[i], dz = z - this.zs[i], rr = this.rs[i] + radius;
        if (dx * dx + dz * dz <= rr * rr) out[n++] = i;
      }
    }
    out.length = n;
    // Zellenreihenfolge ist nicht aufsteigend: kleine Listen, darum Einfügesortierung ohne Zuweisung
    for (let a = 1; a < n; a++) { const v = out[a]; let b = a - 1; while (b >= 0 && out[b] > v) { out[b + 1] = out[b]; b--; } out[b + 1] = v; }
    return n;
  }

  /** Mitte und Radius einer Scheibe */
  discOf(i: number, out: Disc = { x: 0, z: 0, r: 0 }): Disc { out.x = this.xs[i]; out.z = this.zs[i]; out.r = this.rs[i]; return out; }

  /** Zellen, in denen eine Scheibe steht (Schlüssel, sortiert): für Daten und Tests */
  chunksOf(i: number): string[] {
    const s = this.size, x = this.xs[i], z = this.zs[i], r = this.rs[i];
    const out: string[] = [];
    for (let cx = chunkCoord(x - r, s); cx <= chunkCoord(x + r, s); cx++) for (let cz = chunkCoord(z - r, s); cz <= chunkCoord(z + r, s); cz++) out.push(chunkKey(cx, cz));
    return out;
  }

  toJSON(): GridJSON {
    const chunks: Record<string, number[]> = {};
    const keys: { cx: number; cz: number; list: number[] }[] = [];
    for (const [k, list] of this.cells) keys.push({ cx: Math.floor(k / 65536) - 32768, cz: (k % 65536) - 32768, list });
    keys.sort((a, b) => a.cx - b.cx || a.cz - b.cz);
    for (const e of keys) chunks[chunkKey(e.cx, e.cz)] = e.list.slice();
    return { chunkSize: this.size, discs: this.xs.map((x, i): [number, number, number] => [x, this.zs[i], this.rs[i]]), chunks };
  }

  static fromJSON(j: GridJSON): SpatialGrid {
    const g = new SpatialGrid(j.chunkSize);
    for (const [x, z, r] of j.discs) g.add(x, z, r);
    return g;
  }
}
