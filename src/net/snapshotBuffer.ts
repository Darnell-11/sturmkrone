// Phase 4.8A – Schnappschuss-Interpolation ohne Speicheranforderung: ein Ringpuffer je Mitspieler (Float64Array), gefüllt mit den
// 15 – 20 Hz-Schnappschüssen, abgefragt je Bild mit etwas Verzug (`MMO.interpDelay`). Zwischen zwei Proben wird linear interpoliert (Winkel
// über den kürzeren Bogen), über die letzte Probe hinaus höchstens kurz fortgeschrieben – fehlt ein Paket, ruckelt nichts.
import { MMO } from './mmoProtocol';

/** Felder je Probe: Zeit, Lage, Blick, Kurs, Tempo, Deck-Lage (Mitfahrt) */
const F = 10;
const T = 0, X = 1, Y = 2, Z = 3, YAW = 4, HDG = 5, SPD = 6, RX = 7, RY = 8, RZ = 9;
/** längste Fortschreibung über die letzte Probe hinaus (s) */
const EXTRAP = 0.25;

export interface InterpOut { x: number; y: number; z: number; yaw: number; hdg: number; spd: number; rx: number; ry: number; rz: number }

export function newInterpOut(): InterpOut { return { x: 0, y: 0, z: 0, yaw: 0, hdg: 0, spd: 0, rx: 0, ry: 0, rz: 0 }; }

const wrap = (a: number) => {
  let v = (a + Math.PI) % (Math.PI * 2);
  if (v < 0) v += Math.PI * 2;
  return v - Math.PI;
};

export class SnapshotBuffer {
  private readonly d: Float64Array;
  private head = -1;
  private n = 0;

  constructor(readonly size: number = MMO.bufferSize) { this.d = new Float64Array(size * F); }

  get count(): number { return this.n; }
  /** Zeit der jüngsten Probe (−∞ ohne Proben) */
  get latest(): number { return this.n ? this.d[this.head * F + T] : Number.NEGATIVE_INFINITY; }

  clear() { this.head = -1; this.n = 0; }

  /** Probe anhängen (ältere oder gleich alte Zeiten werden verworfen: Pakete in falscher Reihenfolge) */
  push(t: number, x: number, y: number, z: number, yaw: number, hdg: number, spd: number, rx = 0, ry = 0, rz = 0): boolean {
    if (this.n && t <= this.latest) return false;
    this.head = (this.head + 1) % this.size;
    const o = this.head * F, d = this.d;
    d[o + T] = t; d[o + X] = x; d[o + Y] = y; d[o + Z] = z; d[o + YAW] = yaw; d[o + HDG] = hdg; d[o + SPD] = spd; d[o + RX] = rx; d[o + RY] = ry; d[o + RZ] = rz;
    if (this.n < this.size) this.n++;
    return true;
  }

  /** Index (Ring) der k-ältesten Probe (0 = älteste) */
  private at(k: number): number { return ((this.head - this.n + 1 + k) % this.size + this.size) % this.size; }

  /**
   * Zustand zur Zeit `t` in `out` schreiben. Vor der ältesten Probe: älteste; zwischen zwei Proben: interpoliert; nach der jüngsten: mit dem
   * letzten Tempo höchstens `EXTRAP` s fortgeschrieben. false = keine Probe vorhanden.
   */
  sample(t: number, out: InterpOut): boolean {
    const n = this.n, d = this.d;
    if (!n) return false;
    let a = this.at(0) * F;
    if (n === 1 || t <= d[a + T]) { this.copy(a, out); return true; }
    for (let k = 1; k < n; k++) {
      const b = this.at(k) * F;
      if (t <= d[b + T]) {
        const span = d[b + T] - d[a + T];
        const u = span > 1e-6 ? (t - d[a + T]) / span : 1;
        out.x = d[a + X] + (d[b + X] - d[a + X]) * u;
        out.y = d[a + Y] + (d[b + Y] - d[a + Y]) * u;
        out.z = d[a + Z] + (d[b + Z] - d[a + Z]) * u;
        out.yaw = d[a + YAW] + wrap(d[b + YAW] - d[a + YAW]) * u;
        out.hdg = d[a + HDG] + wrap(d[b + HDG] - d[a + HDG]) * u;
        out.spd = d[a + SPD] + (d[b + SPD] - d[a + SPD]) * u;
        out.rx = d[a + RX] + (d[b + RX] - d[a + RX]) * u;
        out.ry = d[a + RY] + (d[b + RY] - d[a + RY]) * u;
        out.rz = d[a + RZ] + (d[b + RZ] - d[a + RZ]) * u;
        return true;
      }
      a = b;
    }
    // nach der jüngsten Probe: Geschwindigkeit aus den letzten beiden Proben, kurz fortschreiben
    const last = this.at(n - 1) * F, prev = this.at(n - 2) * F;
    this.copy(last, out);
    const span = d[last + T] - d[prev + T];
    const ex = Math.min(EXTRAP, t - d[last + T]);
    if (span > 1e-6 && ex > 0) {
      out.x += ((d[last + X] - d[prev + X]) / span) * ex;
      out.z += ((d[last + Z] - d[prev + Z]) / span) * ex;
    }
    return true;
  }

  private copy(o: number, out: InterpOut) {
    const d = this.d;
    out.x = d[o + X]; out.y = d[o + Y]; out.z = d[o + Z]; out.yaw = d[o + YAW]; out.hdg = d[o + HDG]; out.spd = d[o + SPD];
    out.rx = d[o + RX]; out.ry = d[o + RY]; out.rz = d[o + RZ];
  }
}
