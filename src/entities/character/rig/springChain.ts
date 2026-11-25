// Phase 4.6F: Feder-Ketten (Spring-Chain) für Mantelschöße, Umhänge, Haarsträhnen, Schalenden und Schärpenbänder.
// Reine Rechnung ohne three.js und ohne Speicheranforderung je Schritt: alle Zustände liegen in vorab angelegten Float32Arrays.
// Jede Kette hängt mit ihrem ersten Punkt (Wurzel) fest an einem Rahmen (Knochen der Figur, als 4×4-Matrix spaltenweise wie three.js),
// die übrigen Punkte schwingen frei (Verlet): Schwerkraft, Wind und Fahrtwind (Luftwiderstand gegen die eigene Geschwindigkeit),
// Trägheit gegenüber der Bewegung der Figur, Rückzug in die Ruheform, feste Gliedlängen, Stöße und Kollision gegen Kapseln (Beine,
// Rumpf), Kugeln (Kopf) und den Boden (Deck, Rampe). Sprünge des Rahmens über `teleport` Meter je Schritt (Sturm-Schritt) versetzen die
// Kette mit und geben ihr einen Schwung entgegen der Reise, statt sie quer durch die Welt zu ziehen.
import type { ChainTuning } from '../../../data/characterRig';

const G = 9.81;
/** fester innerer Takt: größere Zeitschritte werden geteilt (höchstens MAX_SUB Teilschritte, darüber: Ruheform) */
const SUB_DT = 1 / 60;
const MAX_SUB = 4;

export interface ChainColliders {
  /** Kapseln: je 7 Werte (ax, ay, az, bx, by, bz, r), Anzahl in `nCaps` */
  caps: Float32Array;
  nCaps: number;
  /** Kugeln: je 4 Werte (x, y, z, r), Anzahl in `nSph` */
  sph: Float32Array;
  nSph: number;
  /** Bodenhöhe (Welt), −Infinity = kein Boden */
  floorY: number;
}

export function makeColliders(maxCaps = 8, maxSph = 4): ChainColliders {
  return { caps: new Float32Array(maxCaps * 7), nCaps: 0, sph: new Float32Array(maxSph * 4), nSph: 0, floorY: -Infinity };
}

/** Kapsel eintragen (gibt false zurück, wenn kein Platz mehr ist) */
export function addCapsule(c: ChainColliders, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): boolean {
  if ((c.nCaps + 1) * 7 > c.caps.length) return false;
  const o = c.nCaps * 7, a = c.caps;
  a[o] = ax; a[o + 1] = ay; a[o + 2] = az; a[o + 3] = bx; a[o + 4] = by; a[o + 5] = bz; a[o + 6] = r;
  c.nCaps++;
  return true;
}

export function addSphere(c: ChainColliders, x: number, y: number, z: number, r: number): boolean {
  if ((c.nSph + 1) * 4 > c.sph.length) return false;
  const o = c.nSph * 4, a = c.sph;
  a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = r;
  c.nSph++;
  return true;
}

/** Punkt im Raum eines Rahmens (spaltenweise 4×4) → Welt */
function xform(m: ArrayLike<number>, x: number, y: number, z: number, out: Float32Array, o: number) {
  out[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
}

/**
 * Eine Gruppe gleich gebauter Ketten am selben Rahmen (z. B. acht Mantelschöße an der Hüfte). Punkte je Kette = Glieder + 1; Punkt 0 ist die
 * Wurzel. Lage in Weltmaß (`pos`), Ruheform im Raum des Rahmens (`rest`, wird mit der Figur mitskaliert).
 */
export class SpringChains {
  readonly nodes: number;
  /** Weltlage aller Punkte (Kette c, Punkt i → (c · nodes + i) · 3) */
  readonly pos: Float32Array;
  private readonly prev: Float32Array;
  /** Ruheform im Raum des Rahmens */
  readonly rest: Float32Array;
  /** Gliedlängen im Raum des Rahmens (je Kette `links` Werte) */
  private readonly len: Float32Array;
  /** Zielpunkte der Ruheform in Welt (je Schritt neu) */
  private readonly tgt: Float32Array;
  /** Kette aktiv? (Haar-Sektoren ohne lange Strähnen, nicht getragene Teile) */
  readonly active: Uint8Array;
  readonly colliders: ChainColliders;
  /** Wind in Welt (m/s) */
  readonly wind = { x: 0, y: 0, z: 0 };
  /** Rahmen des letzten Schritts (Teleport und Trägheit) */
  private readonly lastAnchor = new Float32Array(16);
  private ready = false;
  /** größte Dehnung im letzten Schritt (Verhältnis zur Ruhelänge, für Prüfungen) */
  maxStretch = 1;
  /** Anzahl der zurückgesetzten Ketten (ungültige Werte) – sollte 0 bleiben */
  resets = 0;

  constructor(readonly chains: number, readonly links: number, readonly tune: ChainTuning, colliders?: ChainColliders) {
    this.nodes = links + 1;
    const n = chains * this.nodes * 3;
    this.pos = new Float32Array(n);
    this.prev = new Float32Array(n);
    this.rest = new Float32Array(n);
    this.tgt = new Float32Array(n);
    this.len = new Float32Array(chains * links);
    this.active = new Uint8Array(chains).fill(1);
    this.colliders = colliders ?? makeColliders();
  }

  /** Ruhelage eines Punkts im Raum des Rahmens */
  setRest(chain: number, node: number, x: number, y: number, z: number) {
    const o = (chain * this.nodes + node) * 3;
    this.rest[o] = x; this.rest[o + 1] = y; this.rest[o + 2] = z;
  }

  /** Nach allen setRest: Gliedlängen festhalten; Ketten ohne Länge ruhen */
  finishRest() {
    for (let c = 0; c < this.chains; c++) {
      let total = 0;
      for (let i = 1; i < this.nodes; i++) {
        const a = (c * this.nodes + i - 1) * 3, b = a + 3, r = this.rest;
        const l = Math.hypot(r[b] - r[a], r[b + 1] - r[a + 1], r[b + 2] - r[a + 2]);
        this.len[c * this.links + i - 1] = l;
        total += l;
      }
      if (total < 1e-4) this.active[c] = 0;
    }
    this.ready = false;
  }

  /** Alles auf die Ruheform am angegebenen Rahmen setzen (ohne Schwung) */
  snap(anchor: ArrayLike<number>) {
    const N = this.chains * this.nodes;
    for (let k = 0; k < N; k++) {
      const o = k * 3;
      xform(anchor, this.rest[o], this.rest[o + 1], this.rest[o + 2], this.pos, o);
      this.prev[o] = this.pos[o]; this.prev[o + 1] = this.pos[o + 1]; this.prev[o + 2] = this.pos[o + 2];
    }
    for (let i = 0; i < 16; i++) this.lastAnchor[i] = anchor[i];
    this.ready = true;
    // schon das erste Bild ohne Durchdringen (Ruheform kann in einem Bein oder im Boden liegen)
    for (let c = 0; c < this.chains; c++) if (this.active[c]) this.collide(c * this.nodes);
  }

  /** Bei nächster Gelegenheit neu aufsetzen (z. B. nach Aussehen-Wechsel) */
  reset() { this.ready = false; }

  /** Geschwindigkeit (m/s) auf alle freien Punkte geben, zur Spitze hin stärker */
  kick(vx: number, vy: number, vz: number, dt = SUB_DT) {
    const maxV = 14;
    const s = Math.hypot(vx, vy, vz);
    if (!(s > 0)) return;
    const k = s > maxV ? maxV / s : 1;
    for (let c = 0; c < this.chains; c++) {
      if (!this.active[c]) continue;
      for (let i = 1; i < this.nodes; i++) {
        const o = (c * this.nodes + i) * 3, f = Math.sqrt(i / this.links) * k * dt;
        this.prev[o] -= vx * f; this.prev[o + 1] -= vy * f; this.prev[o + 2] -= vz * f;
      }
    }
  }

  /** Druckwelle von einem Punkt: Stoß nach außen, mit dem Abstand abnehmend (bis `radius`) */
  blast(cx: number, cy: number, cz: number, radius: number, strength: number, dt = SUB_DT) {
    for (let c = 0; c < this.chains; c++) {
      if (!this.active[c]) continue;
      for (let i = 1; i < this.nodes; i++) {
        const o = (c * this.nodes + i) * 3;
        let dx = this.pos[o] - cx, dy = this.pos[o + 1] - cy, dz = this.pos[o + 2] - cz;
        const d = Math.hypot(dx, dy, dz);
        if (!(d < radius)) continue;
        const k = (1 - d / radius) * strength * Math.sqrt(i / this.links) * dt / Math.max(d, 1e-3);
        dx *= k; dy = dy * k + 0.25 * strength * dt * (1 - d / radius); dz *= k;
        this.prev[o] -= dx; this.prev[o + 1] -= dy; this.prev[o + 2] -= dz;
      }
    }
  }

  /**
   * Ein Schritt (dt in Sekunden; große Schritte werden in bis zu vier Teilschritte zerlegt, darüber springt die Kette in die Ruheform).
   * anchor: Weltmatrix des Rahmens (spaltenweise), z. B. `bone.matrixWorld.elements`.
   */
  step(anchor: ArrayLike<number>, dt: number) {
    if (!(dt > 0)) return;
    if (!this.ready || dt > SUB_DT * MAX_SUB + 1e-6 || !Number.isFinite(anchor[12] + anchor[13] + anchor[14])) { if (Number.isFinite(anchor[12] + anchor[13] + anchor[14])) this.snap(anchor); return; }
    const sub = Math.max(1, Math.ceil(dt / SUB_DT - 1e-6));
    const h = dt / sub;
    const T = this.tune, N = this.nodes, L = this.links, P = this.pos, Q = this.prev, R = this.rest, X = this.tgt;
    // Maßstab des Rahmens (Figurengröße): Länge der ersten Spalte
    const sc = Math.hypot(anchor[0], anchor[1], anchor[2]) || 1;
    // Teleport (Sturm-Schritt): Rahmen springt weiter als `teleport` – Kette mitversetzen, Schwung entgegen der Reise
    const jx = anchor[12] - this.lastAnchor[12], jy = anchor[13] - this.lastAnchor[13], jz = anchor[14] - this.lastAnchor[14];
    const jump = Math.hypot(jx, jy, jz);
    if (jump > 1.6) {
      for (let k = 0; k < this.chains * N; k++) { const o = k * 3; P[o] += jx; P[o + 1] += jy; P[o + 2] += jz; Q[o] += jx; Q[o + 1] += jy; Q[o + 2] += jz; }
      const kv = 5.5 / jump;
      this.kick(-jx * kv, 0.25 * 5.5, -jz * kv, h);
    } else {
      // Trägheit: ein Teil der Rahmenbewegung trägt die Kette mit (0 = starr mit dem Körper, 1 = bleibt in der Welt zurück)
      const carry = 1 - T.inertia;
      if (carry > 0) for (let c = 0; c < this.chains; c++) {
        if (!this.active[c]) continue;
        for (let i = 1; i < N; i++) { const o = (c * N + i) * 3; P[o] += jx * carry; P[o + 1] += jy * carry; P[o + 2] += jz * carry; Q[o] += jx * carry; Q[o + 1] += jy * carry; Q[o + 2] += jz * carry; }
      }
    }
    for (let i = 0; i < 16; i++) this.lastAnchor[i] = anchor[i];
    // Ziele der Ruheform in Welt
    for (let k = 0; k < this.chains * N; k++) { const o = k * 3; xform(anchor, R[o], R[o + 1], R[o + 2], X, o); }
    const damp = Math.pow(T.damping, h * 60);
    const wx = this.wind.x, wy = this.wind.y, wz = this.wind.z;
    const maxV = 14 * h;
    let stretch = 1;
    for (let s = 0; s < sub; s++) {
      for (let c = 0; c < this.chains; c++) {
        const base = c * N;
        // Wurzel fest am Rahmen
        { const o = base * 3; P[o] = X[o]; P[o + 1] = X[o + 1]; P[o + 2] = X[o + 2]; Q[o] = P[o]; Q[o + 1] = P[o + 1]; Q[o + 2] = P[o + 2]; }
        if (!this.active[c]) {
          for (let i = 1; i < N; i++) { const o = (base + i) * 3; P[o] = X[o]; P[o + 1] = X[o + 1]; P[o + 2] = X[o + 2]; Q[o] = P[o]; Q[o + 1] = P[o + 1]; Q[o + 2] = P[o + 2]; }
          continue;
        }
        for (let i = 1; i < N; i++) {
          const o = (base + i) * 3;
          let vx = (P[o] - Q[o]) * damp, vy = (P[o + 1] - Q[o + 1]) * damp, vz = (P[o + 2] - Q[o + 2]) * damp;
          // Tempo begrenzen (Stöße, Explosionen der Werte)
          const vl = Math.hypot(vx, vy, vz);
          if (vl > maxV) { const k = maxV / vl; vx *= k; vy *= k; vz *= k; }
          Q[o] = P[o]; Q[o + 1] = P[o + 1]; Q[o + 2] = P[o + 2];
          // Luft: Wind gegen die eigene Geschwindigkeit (Fahrtwind entsteht von selbst, weil der Rahmen die Wurzel mitnimmt)
          const ax = (wx - vx / h) * T.drag, ay = (wy - vy / h) * T.drag * 0.5 - G * T.gravity, az = (wz - vz / h) * T.drag;
          P[o] += vx + ax * h * h; P[o + 1] += vy + ay * h * h; P[o + 2] += vz + az * h * h;
          // zurück in die Ruheform (zur Spitze hin weicher)
          const st = T.stiffness * (1 - 0.55 * ((i - 1) / Math.max(1, L - 1))) * Math.min(1, h * 60);
          P[o] += (X[o] - P[o]) * st; P[o + 1] += (X[o + 1] - P[o + 1]) * st; P[o + 2] += (X[o + 2] - P[o + 2]) * st;
        }
        // feste Gliedlängen (von der Wurzel zur Spitze, nur das Kind wird verschoben), Gelenkgrenze (4.6G.3), danach Kollision, dann noch
        // einmal die Längen – Körper und Boden haben das letzte Wort vor der Gelenkgrenze
        this.lengths(base, c, sc);
        this.bend(base);
        for (let pass = 0; pass < 2; pass++) {
          this.lengths(base, c, sc);
          this.collide(base);
        }
        this.lengths(base, c, sc);
      }
    }
    // Ungültige Werte (NaN) setzen die Kette zurück; größte Dehnung und Auslenkung messen
    let bendSeen = 0;
    for (let c = 0; c < this.chains; c++) {
      const base = c * N;
      let bad = false;
      for (let i = 0; i < N && !bad; i++) { const o = (base + i) * 3; if (!Number.isFinite(P[o] + P[o + 1] + P[o + 2])) bad = true; }
      if (bad) {
        this.resets++;
        for (let i = 0; i < N; i++) { const o = (base + i) * 3; P[o] = X[o]; P[o + 1] = X[o + 1]; P[o + 2] = X[o + 2]; Q[o] = P[o]; Q[o + 1] = P[o + 1]; Q[o + 2] = P[o + 2]; }
        continue;
      }
      for (let i = 1; i < N; i++) {
        const l0 = this.len[c * L + i - 1] * sc;
        if (l0 < 1e-5) continue;
        const a = (base + i - 1) * 3, b = a + 3;
        const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2], dl = Math.hypot(dx, dy, dz);
        stretch = Math.max(stretch, dl / l0);
        const rx = X[b] - X[a], ry = X[b + 1] - X[a + 1], rz = X[b + 2] - X[a + 2], rl = Math.hypot(rx, ry, rz);
        if (dl > 1e-6 && rl > 1e-6) {
          const cs = (dx * rx + dy * ry + dz * rz) / (dl * rl);
          bendSeen = Math.max(bendSeen, Math.acos(cs > 1 ? 1 : cs < -1 ? -1 : cs));
        }
      }
    }
    this.maxStretch = stretch;
    this.maxBendSeen = bendSeen;
  }

  /** Gliedlängen halten (dehnbar bis `stretch`, zusammengeschoben höchstens auf 80 %) */
  private lengths(base: number, c: number, sc: number) {
    const P = this.pos, L = this.links, maxS = this.tune.stretch;
    // 4.6G.3: der Boden gilt auch hier (die steiferen Ketten ziehen sonst den Saum knapp unter das Deck)
    const floor = this.colliders.floorY + this.tune.radius;
    for (let i = 1; i < this.nodes; i++) {
      const l0 = this.len[c * L + i - 1] * sc;
      const a = (base + i - 1) * 3, b = a + 3;
      const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
      const d = Math.hypot(dx, dy, dz);
      if (d < 1e-6) { P[b + 1] = P[a + 1] - l0; continue; }
      const want = d > l0 * maxS ? l0 * maxS : d < l0 * 0.8 ? l0 * 0.8 : d;
      if (want === d) continue;
      const k = want / d;
      P[b] = P[a] + dx * k; P[b + 1] = P[a + 1] + dy * k; P[b + 2] = P[a + 2] + dz * k;
      if (P[b + 1] < floor) P[b + 1] = floor;
    }
  }

  /** größte Abweichung eines Glieds von seiner Ruherichtung im letzten Schritt (Bogenmaß, für Prüfungen) */
  maxBendSeen = 0;

  /**
   * 4.6G.3: Gelenkgrenze – jedes Glied schwenkt höchstens `maxBend` aus seiner Ruherichtung (Ziele der Ruheform in Welt). Länge bleibt, nur die
   * Richtung wird auf den Kegel zurückgedreht. Keine Speicheranforderung.
   */
  private bend(base: number) {
    const lim = this.tune.maxBend;
    if (!(lim > 0) || lim >= Math.PI) return;
    const P = this.pos, X = this.tgt, cMax = Math.cos(lim), sMax = Math.sin(lim);
    for (let i = 1; i < this.nodes; i++) {
      const a = (base + i - 1) * 3, b = a + 3;
      let dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
      let rx = X[b] - X[a], ry = X[b + 1] - X[a + 1], rz = X[b + 2] - X[a + 2];
      const dl = Math.hypot(dx, dy, dz), rl = Math.hypot(rx, ry, rz);
      if (dl < 1e-6 || rl < 1e-6) continue;
      dx /= dl; dy /= dl; dz /= dl; rx /= rl; ry /= rl; rz /= rl;
      const c = dx * rx + dy * ry + dz * rz;
      if (c >= cMax) continue;
      // Anteil quer zur Ruherichtung; bei genau entgegengesetzter Lage eine beliebige Querrichtung
      let px = dx - rx * c, py = dy - ry * c, pz = dz - rz * c;
      let pl = Math.hypot(px, py, pz);
      if (pl < 1e-6) { px = -ry; py = rx; pz = 0; pl = Math.hypot(px, py) || 1; if (pl < 1e-6) { px = 1; py = 0; pz = 0; pl = 1; } }
      px /= pl; py /= pl; pz /= pl;
      P[b] = P[a] + (rx * cMax + px * sMax) * dl;
      P[b + 1] = P[a + 1] + (ry * cMax + py * sMax) * dl;
      P[b + 2] = P[a + 2] + (rz * cMax + pz * sMax) * dl;
    }
  }

  /** Punkte aus Kapseln, Kugeln und dem Boden schieben (die Wurzel bleibt) */
  private collide(base: number) {
    const C = this.colliders, P = this.pos, r0 = this.tune.radius;
    for (let i = 1; i < this.nodes; i++) {
      const o = (base + i) * 3;
      let px = P[o], py = P[o + 1], pz = P[o + 2];
      // Boden zuerst (hebt ein Glied womöglich in ein Bein), dann Kapseln und Kugeln, zum Schluss noch einmal der Boden
      if (py < C.floorY + r0) py = C.floorY + r0;
      for (let k = 0; k < C.nCaps; k++) {
        const q = k * 7, A = C.caps;
        const ax = A[q], ay = A[q + 1], az = A[q + 2], bx = A[q + 3] - ax, by = A[q + 4] - ay, bz = A[q + 5] - az, r = A[q + 6] + r0;
        const bb = bx * bx + by * by + bz * bz;
        let t = bb > 1e-9 ? ((px - ax) * bx + (py - ay) * by + (pz - az) * bz) / bb : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + bx * t, cy = ay + by * t, cz = az + bz * t;
        const dx = px - cx, dy = py - cy, dz = pz - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2);
        if (d < 1e-6) { pz = cz - r; continue; }
        const k2 = r / d;
        px = cx + dx * k2; py = cy + dy * k2; pz = cz + dz * k2;
      }
      for (let k = 0; k < C.nSph; k++) {
        const q = k * 4, S = C.sph;
        const dx = px - S[q], dy = py - S[q + 1], dz = pz - S[q + 2], r = S[q + 3] + r0;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2);
        if (d < 1e-6) { py = S[q + 1] - r; continue; }
        const k2 = r / d;
        px = S[q] + dx * k2; py = S[q + 1] + dy * k2; pz = S[q + 2] + dz * k2;
      }
      if (py < C.floorY + r0) py = C.floorY + r0;
      P[o] = px; P[o + 1] = py; P[o + 2] = pz;
    }
  }
}
