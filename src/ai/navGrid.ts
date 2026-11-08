import { coastK, type WalkIsland } from '../world/islandGround';

/**
 * Begehbarkeits-Netz (NavMesh als Raster) einer Insel für Gegner und Crew.
 *  - Zellen 0,6 m; gesperrt sind Meer (außerhalb der Küstenlinie) und alle runden Hindernisse (Häuser, Felsen, Bäume, Kisten)
 *  - Freiraum je Zelle (Abstand zum nächsten Hindernis in Metern, Chamfer-Distanztransformation):
 *    jede Figur plant mit ihrem eigenen Radius, große Gegner nehmen keine engen Gassen
 *  - A*-Suche (8 Nachbarn, keine Ecken schneiden) mit vorab angelegten Puffern – keine Speicheranforderung je Suche
 *  - Weg wird mit Sichtlinien geglättet (String Pulling), die Figur läuft direkte Linien statt Zickzack
 */
export class NavGrid {
  readonly cell = 0.6;
  readonly ox: number;
  readonly oz: number;
  readonly w: number;
  readonly h: number;
  /** Freiraum in Metern (0 = gesperrt) */
  readonly clear: Float32Array;
  // A*-Puffer (Marke statt Löschen: seen[i] === search heißt „in dieser Suche angefasst“)
  private g: Float32Array;
  private f: Float32Array;
  private parent: Int32Array;
  private seen: Uint32Array;
  private closed: Uint32Array;
  private heap: Int32Array;
  private heapN = 0;
  private search = 0;
  private tmp: Int32Array;

  constructor(readonly island: WalkIsland) {
    let cmax = 0;
    for (let i = 0; i < 64; i++) cmax = Math.max(cmax, coastK(island.coast, (i / 64) * Math.PI * 2));
    const R = island.r * cmax * 1.06 + 2;
    this.ox = island.x - R;
    this.oz = island.z - R;
    this.w = this.h = Math.ceil((R * 2) / this.cell);
    const n = this.w * this.h;
    this.clear = new Float32Array(n);
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new Int32Array(n);
    this.tmp = new Int32Array(512);
    this.rasterize();
  }

  private rasterize() {
    const { w, h, cell, island } = this;
    const INF = 1e9;
    const d = this.clear;
    // 1. Land innerhalb der Küste (die Figuren dürfen bis 104 % der Küste laufen, geplant wird bis 101 %)
    for (let j = 0; j < h; j++) {
      const z = this.oz + (j + 0.5) * cell;
      for (let i = 0; i < w; i++) {
        const x = this.ox + (i + 0.5) * cell;
        const dx = x - island.x, dz = z - island.z;
        const r = Math.hypot(dx, dz);
        const edge = island.r * coastK(island.coast, Math.atan2(dz, dx)) * 1.01;
        d[j * w + i] = r < edge ? INF : 0;
      }
    }
    // 2. Hindernisse einbrennen
    for (const b of island.blockers) {
      const i0 = Math.max(0, Math.floor((b.x - b.r - this.ox) / cell)), i1 = Math.min(w - 1, Math.floor((b.x + b.r - this.ox) / cell));
      const j0 = Math.max(0, Math.floor((b.z - b.r - this.oz) / cell)), j1 = Math.min(h - 1, Math.floor((b.z + b.r - this.oz) / cell));
      for (let j = j0; j <= j1; j++) {
        const z = this.oz + (j + 0.5) * cell;
        for (let i = i0; i <= i1; i++) {
          const x = this.ox + (i + 0.5) * cell;
          if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) d[j * w + i] = 0;
        }
      }
    }
    // 3. Abstand zum nächsten gesperrten Feld (zwei Durchgänge, Gewichte 1 und √2)
    const D = Math.SQRT2;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (d[k] === 0) continue;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + 1);
      if (j > 0) {
        v = Math.min(v, d[k - w] + 1);
        if (i > 0) v = Math.min(v, d[k - w - 1] + D);
        if (i < w - 1) v = Math.min(v, d[k - w + 1] + D);
      }
      if (i === 0 || j === 0 || i === w - 1 || j === h - 1) v = Math.min(v, 1);
      d[k] = v;
    }
    for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i;
      if (d[k] === 0) continue;
      let v = d[k];
      if (i < w - 1) v = Math.min(v, d[k + 1] + 1);
      if (j < h - 1) {
        v = Math.min(v, d[k + w] + 1);
        if (i < w - 1) v = Math.min(v, d[k + w + 1] + D);
        if (i > 0) v = Math.min(v, d[k + w - 1] + D);
      }
      d[k] = v;
    }
    // in Meter: Abstand Zellmitte zu Hindernis-Zellrand
    for (let k = 0; k < d.length; k++) if (d[k] > 0) d[k] = (d[k] - 0.5) * cell;
  }

  private ci(x: number) { return Math.floor((x - this.ox) / this.cell); }
  private cj(z: number) { return Math.floor((z - this.oz) / this.cell); }

  /** Freiraum an einem Punkt (Meter; 0 außerhalb) */
  clearAt(x: number, z: number) {
    const i = this.ci(x), j = this.cj(z);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return 0;
    return this.clear[j * this.w + i];
  }

  /** Freie Sichtlinie / freier Gang für eine Figur mit diesem Radius? */
  lineClear(ax: number, az: number, bx: number, bz: number, radius: number) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    const need = radius * 0.9;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (this.clearAt(ax + dx * t, az + dz * t) < need) return false;
    }
    return true;
  }

  /** Nächstes begehbares Feld (Spiralsuche) – Zellindex oder −1 */
  private nearestCell(x: number, z: number, need: number, maxRing = 8) {
    const i0 = this.ci(x), j0 = this.cj(z);
    for (let r = 0; r <= maxRing; r++) {
      let best = -1, bd = Infinity;
      for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        const k = j * this.w + i;
        if (this.clear[k] < need) continue;
        const dd = (i - i0) ** 2 + (j - j0) ** 2;
        if (dd < bd) { bd = dd; best = k; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Begehbaren Punkt in der Nähe in out schreiben (z. B. Spawn oder Patrouillenziel) */
  snap(x: number, z: number, radius: number, out: { x: number; z: number }) {
    const k = this.nearestCell(x, z, radius * 0.9, 12);
    if (k < 0) { out.x = x; out.z = z; return false; }
    out.x = this.ox + ((k % this.w) + 0.5) * this.cell;
    out.z = this.oz + (Math.floor(k / this.w) + 0.5) * this.cell;
    return true;
  }

  // ---------- A* ----------

  private push(k: number) {
    const hp = this.heap, f = this.f;
    let i = this.heapN++;
    hp[i] = k;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[hp[p]] <= f[k]) break;
      hp[i] = hp[p]; hp[p] = k; i = p;
    }
  }

  private pop() {
    const hp = this.heap, f = this.f;
    const top = hp[0];
    const last = hp[--this.heapN];
    let i = 0;
    const n = this.heapN;
    if (n > 0) {
      hp[0] = last;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < n && f[hp[l]] < f[hp[m]]) m = l;
        if (r < n && f[hp[r]] < f[hp[m]]) m = r;
        if (m === i) break;
        hp[i] = hp[m]; hp[m] = last; i = m;
      }
    }
    return top;
  }

  /**
   * Weg von (sx, sz) nach (tx, tz) für eine Figur mit Radius r. Ergebnis (geglättete Wegpunkte ohne Start) in out.
   * Ist das Ziel unerreichbar, führt der Weg zum erreichbaren Feld, das dem Ziel am nächsten liegt.
   */
  findPath(sx: number, sz: number, tx: number, tz: number, radius: number, out: NavPath, maxNodes = 5000): boolean {
    out.n = 0; out.i = 0;
    const need = radius * 0.9;
    const s = this.nearestCell(sx, sz, need, 4);
    let t = this.nearestCell(tx, tz, need, 8);
    if (s < 0 || t < 0) return false;
    const w = this.w;
    const tI = t % w, tJ = Math.floor(t / w);
    const hOf = (k: number) => { const dx = Math.abs((k % w) - tI), dz = Math.abs(Math.floor(k / w) - tJ); return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)); };
    const id = ++this.search;
    const { g, f, parent, seen, closed, clear } = this;
    this.heapN = 0;
    g[s] = 0; f[s] = hOf(s); parent[s] = -1; seen[s] = id;
    this.push(s);
    let best = s, bestH = f[s], nodes = 0;
    let found = false;
    while (this.heapN > 0 && nodes++ < maxNodes) {
      const k = this.pop();
      if (closed[k] === id) continue;
      closed[k] = id;
      if (k === t) { found = true; break; }
      const h = f[k] - g[k];
      if (h < bestH) { bestH = h; best = k; }
      const i = k % w, j = (k - i) / w;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= this.h) continue;
        const nk = nj * w + ni;
        if (clear[nk] < need || closed[nk] === id) continue;
        // diagonal nur, wenn beide Nachbarn frei sind (keine Ecken schneiden)
        if (di && dj && (clear[j * w + ni] < need || clear[nj * w + i] < need)) continue;
        const ng = g[k] + (di && dj ? Math.SQRT2 : 1);
        if (seen[nk] === id && ng >= g[nk]) continue;
        seen[nk] = id; g[nk] = ng; parent[nk] = k;
        f[nk] = ng + hOf(nk);
        this.push(nk);
      }
    }
    if (!found) t = best;
    // Zellkette rückwärts einsammeln
    const chain = this.chain(t);
    if (chain < 1) return found;
    // Glätten: vom aktuellen Anker aus den weitesten noch sichtbaren Punkt nehmen
    const cx = (k: number) => this.ox + ((k % w) + 0.5) * this.cell;
    const cz = (k: number) => this.oz + (Math.floor(k / w) + 0.5) * this.cell;
    let ax = sx, az = sz, a = 0;
    const last = chain - 1;
    while (a < last && out.n < NavPath.MAX) {
      let pick = a + 1;
      for (let b = last; b > a + 1; b--) {
        if (this.lineClear(ax, az, cx(this.tmp[b]), cz(this.tmp[b]), radius)) { pick = b; break; }
      }
      ax = cx(this.tmp[pick]); az = cz(this.tmp[pick]);
      out.push(ax, az);
      a = pick;
    }
    // genaues Ziel als letzter Punkt, wenn erreichbar
    if (found && out.n < NavPath.MAX && this.lineClear(ax, az, tx, tz, radius)) out.push(tx, tz);
    return found;
  }

  /** Zellkette Start→Ziel in tmp (Länge zurück); lange Ketten werden ausgedünnt */
  private chain(t: number) {
    let n = 0;
    for (let k = t; k >= 0; k = this.parent[k]) n++;
    const step = Math.max(1, Math.ceil(n / this.tmp.length));
    let m = Math.ceil(n / step);
    const len = m;
    let idx = 0;
    for (let k = t; k >= 0; k = this.parent[k], idx++) {
      if (idx % step === 0 && m > 0) this.tmp[--m] = k;
    }
    return len;
  }
}

/** Wegpunkte einer Figur (fester Speicher) */
export class NavPath {
  static readonly MAX = 48;
  readonly pts = new Float32Array(NavPath.MAX * 2);
  n = 0;
  i = 0;
  push(x: number, z: number) { this.pts[this.n * 2] = x; this.pts[this.n * 2 + 1] = z; this.n++; }
}

// ---------- Netze je Insel (die zwei zuletzt benutzten bleiben im Speicher) ----------
const cache: NavGrid[] = [];
const blockerCount = new WeakMap<NavGrid, number>();

export function navForIsland(isl: WalkIsland): NavGrid {
  let n = cache.find((c) => c.island === isl);
  // neu bauen, wenn inzwischen Hindernisse dazugekommen sind (Insel-Ausstattung wird nachgeladen)
  if (n && blockerCount.get(n) !== isl.blockers.length) { cache.splice(cache.indexOf(n), 1); n = undefined; }
  if (!n) {
    n = new NavGrid(isl);
    blockerCount.set(n, isl.blockers.length);
    cache.unshift(n);
    if (cache.length > 2) cache.length = 2;
  } else if (cache[0] !== n) { cache.splice(cache.indexOf(n), 1); cache.unshift(n); }
  return n;
}

/**
 * Lenkt eine Figur zu einem Ziel: bei freier Sicht direkt, sonst über den A*-Weg (alle 0,5 s oder bei
 * deutlich verschobenem Ziel neu geplant). Ergebnis: Richtung (Einheitsvektor) in out, Restweg als Rückgabe.
 */
export class NavAgent {
  readonly path = new NavPath();
  private repath = 0;
  private gx = NaN;
  private gz = NaN;
  private direct = true;
  /** Hängt die Figur fest (kaum Fortschritt trotz Bewegung)? */
  private stuckT = 0;
  private lx = 0;
  private lz = 0;

  steer(nav: NavGrid | null, x: number, z: number, gx: number, gz: number, radius: number, dt: number, out: { x: number; z: number }): number {
    const dist = Math.hypot(gx - x, gz - z);
    out.x = 0; out.z = 0;
    if (dist < 0.05) return 0;
    this.repath -= dt;
    // Feststecken erkennen: kaum bewegt seit der letzten Planung
    const moved = Math.hypot(x - this.lx, z - this.lz);
    this.lx = x; this.lz = z;
    this.stuckT = moved < 0.2 * dt ? this.stuckT + dt : Math.max(0, this.stuckT - dt);
    if (!nav) { out.x = (gx - x) / dist; out.z = (gz - z) / dist; return dist; }
    const goalMoved = Math.hypot(gx - this.gx, gz - this.gz) > Math.max(1.2, dist * 0.15);
    if (this.repath <= 0 || goalMoved || this.stuckT > 0.6) {
      this.repath = 0.45 + Math.random() * 0.2;
      this.gx = gx; this.gz = gz;
      this.stuckT = 0;
      this.direct = nav.lineClear(x, z, gx, gz, radius);
      if (!this.direct) nav.findPath(x, z, gx, gz, radius, this.path);
    }
    if (this.direct || this.path.n === 0) { out.x = (gx - x) / dist; out.z = (gz - z) / dist; return dist; }
    const p = this.path;
    // nächsten Wegpunkt überspringen, sobald er erreicht oder der übernächste schon frei sichtbar ist
    while (p.i < p.n) {
      const wx = p.pts[p.i * 2], wz = p.pts[p.i * 2 + 1];
      const d = Math.hypot(wx - x, wz - z);
      if (d < 0.45 + radius * 0.5) { p.i++; continue; }
      if (p.i + 1 < p.n && d < 2.5 && nav.lineClear(x, z, p.pts[p.i * 2 + 2], p.pts[p.i * 2 + 3], radius)) { p.i++; continue; }
      break;
    }
    if (p.i >= p.n) { out.x = (gx - x) / dist; out.z = (gz - z) / dist; return dist; }
    const wx = p.pts[p.i * 2] - x, wz = p.pts[p.i * 2 + 1] - z;
    const wd = Math.hypot(wx, wz) || 1;
    out.x = wx / wd; out.z = wz / wd;
    let rest = wd;
    for (let k = p.i; k + 1 < p.n; k++) rest += Math.hypot(p.pts[k * 2 + 2] - p.pts[k * 2], p.pts[k * 2 + 3] - p.pts[k * 2 + 1]);
    return rest;
  }

  /** Plan verwerfen (z. B. nach Rückstoß oder Zielwechsel) */
  reset() { this.repath = 0; this.path.n = 0; this.path.i = 0; }
}
