import { Matrix4, Vector3, type Object3D } from 'three';
import type { Character } from '../entities/character/character';

/**
 * Orientierte Quader (OBB) für Treffer: Trefferzonen am Körper (Hurtboxen) und Angriffsvolumen.
 *  - Strecke gegen Quader (Slab-Test im Quaderraum, Strecke mit Radius = Klingendicke)
 *  - Quader gegen Quader (Trennachsen-Test mit 15 Achsen)
 */
export class OBB {
  readonly c = new Vector3();
  readonly ax = new Vector3(1, 0, 0);
  readonly ay = new Vector3(0, 1, 0);
  readonly az = new Vector3(0, 0, 1);
  /** halbe Kantenlängen entlang ax, ay, az */
  readonly e = new Vector3(0.5, 0.5, 0.5);

  /** Aufrechter Quader, um die y-Achse gedreht (yaw wie bei den Figuren: vorn = (sin, 0, cos)) */
  setUpright(x: number, y: number, z: number, yaw: number, hx: number, hy: number, hz: number) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    this.c.set(x, y, z);
    this.ax.set(c, 0, -s);
    this.ay.set(0, 1, 0);
    this.az.set(s, 0, c);
    this.e.set(hx, hy, hz);
    return this;
  }

  /** Quader entlang der Strecke a → b (Achse y), quer ausgerichtet nach „right“; pad verlängert beide Enden */
  setSegment(a: Vector3, b: Vector3, right: Vector3, hx: number, hz: number, pad = 0) {
    this.ay.subVectors(b, a);
    const len = this.ay.length();
    if (len < 1e-5) this.ay.set(0, 1, 0); else this.ay.multiplyScalar(1 / len);
    // right orthogonal zur Achse machen (Gram-Schmidt); bei paralleler Lage eine Ersatzachse
    this.ax.copy(right).addScaledVector(this.ay, -right.dot(this.ay));
    if (this.ax.lengthSq() < 1e-6) this.ax.set(this.ay.y, -this.ay.x, 0).addScaledVector(this.ay, 0);
    if (this.ax.lengthSq() < 1e-6) this.ax.set(1, 0, 0);
    this.ax.normalize();
    this.az.crossVectors(this.ax, this.ay).normalize();
    this.c.addVectors(a, b).multiplyScalar(0.5);
    this.e.set(hx, len / 2 + pad, hz);
    return this;
  }

  /**
   * Strecke p → q mit Radius r gegen den Quader. Rückgabe: Eintrittsanteil t (0 … 1) oder −1.
   * (Der Quader wird um r aufgebläht – Kanten minimal großzügiger als eine echte Kapsel.)
   */
  segment(p: Vector3, q: Vector3, r: number): number {
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 3; k++) {
      const axis = k === 0 ? this.ax : k === 1 ? this.ay : this.az;
      const ext = (k === 0 ? this.e.x : k === 1 ? this.e.y : this.e.z) + r;
      const s0 = (p.x - this.c.x) * axis.x + (p.y - this.c.y) * axis.y + (p.z - this.c.z) * axis.z;
      const d = (q.x - p.x) * axis.x + (q.y - p.y) * axis.y + (q.z - p.z) * axis.z;
      if (Math.abs(d) < 1e-9) {
        if (s0 < -ext || s0 > ext) return -1;
        continue;
      }
      let ta = (-ext - s0) / d, tb = (ext - s0) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
    return t0;
  }

  /** Überlappen sich zwei Quader? (Trennachsen-Satz, 15 Achsen) */
  overlaps(o: OBB): boolean {
    const A = [this.ax, this.ay, this.az], B = [o.ax, o.ay, o.az];
    const ea = [this.e.x, this.e.y, this.e.z], eb = [o.e.x, o.e.y, o.e.z];
    const R = R_TMP, AR = AR_TMP;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { R[i * 3 + j] = A[i].dot(B[j]); AR[i * 3 + j] = Math.abs(R[i * 3 + j]) + 1e-6; }
    const d = T_TMP.subVectors(o.c, this.c);
    const t = [d.dot(A[0]), d.dot(A[1]), d.dot(A[2])];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(t[i]) > ea[i] + eb[0] * AR[i * 3] + eb[1] * AR[i * 3 + 1] + eb[2] * AR[i * 3 + 2]) return false;
    }
    for (let j = 0; j < 3; j++) {
      const tb = t[0] * R[j] + t[1] * R[3 + j] + t[2] * R[6 + j];
      if (Math.abs(tb) > ea[0] * AR[j] + ea[1] * AR[3 + j] + ea[2] * AR[6 + j] + eb[j]) return false;
    }
    for (let i = 0; i < 3; i++) {
      const i1 = (i + 1) % 3, i2 = (i + 2) % 3;
      for (let j = 0; j < 3; j++) {
        const j1 = (j + 1) % 3, j2 = (j + 2) % 3;
        const ra = ea[i1] * AR[i2 * 3 + j] + ea[i2] * AR[i1 * 3 + j];
        const rb = eb[j1] * AR[i * 3 + j2] + eb[j2] * AR[i * 3 + j1];
        if (Math.abs(t[i2] * R[i1 * 3 + j] - t[i1] * R[i2 * 3 + j]) > ra + rb) return false;
      }
    }
    return true;
  }
}
const R_TMP = new Float64Array(9), AR_TMP = new Float64Array(9), T_TMP = new Vector3();

export type Zone = 'kopf' | 'rumpf' | 'beine';
/** Schadensfaktor je Trefferzone */
export const ZONE_MULT: Record<Zone, number> = { kopf: 1.25, rumpf: 1, beine: 0.85 };

const vA = new Vector3(), vB = new Vector3(), vC = new Vector3(), vUp = new Vector3(), vR = new Vector3();

/**
 * Knochen und Waffen stehen dort, wo die Figur zuletzt gezeichnet wurde (weich interpoliert). Für Treffer zählt die
 * Logik: Punkte werden in den Figurenraum zurückgerechnet und mit Position und Drehung des Logikschritts neu gesetzt
 * (wichtig, wenn die Zielhilfe die Figur beim Angriff schlagartig dreht).
 */
export class LogicFrame {
  private inv = new Matrix4();
  private sx = 1; private sy = 1; private sz = 1;
  private s = 0; private c = 1;
  private x = 0; private y = 0; private z = 0;
  set(holder: Object3D, x: number, y: number, z: number, yaw: number) {
    holder.updateMatrixWorld(true);
    this.inv.copy(holder.matrixWorld).invert();
    this.sx = holder.scale.x; this.sy = holder.scale.y; this.sz = holder.scale.z;
    this.s = Math.sin(yaw); this.c = Math.cos(yaw);
    this.x = x; this.y = y; this.z = z;
    return this;
  }
  /** Weltlage eines Objekts der Figur → Logik-Weltlage */
  apply(o: Object3D, out: Vector3) {
    o.getWorldPosition(out).applyMatrix4(this.inv);
    const lx = out.x * this.sx, ly = out.y * this.sy, lz = out.z * this.sz;
    return out.set(this.x + lx * this.c + lz * this.s, this.y + ly, this.z - lx * this.s + lz * this.c);
  }
}
const FRAME = new LogicFrame();

/** Drei Trefferzonen einer Figur: Kopf, Rumpf, Beine – folgen den Knochen (auch liegend, in der Luft, geduckt) */
export class Hurtbox {
  readonly head = new OBB();
  readonly torso = new OBB();
  readonly legs = new OBB();
  /** Zeitpunkt der letzten Berechnung (pro Logikschritt nur einmal) */
  stamp = -1;
  /** Schwerpunkt (für Grobauswahl) */
  readonly center = new Vector3();

  /**
   * Aus den Knochen einer Figur. Die Knochen stehen dort, wo die Figur zuletzt gezeichnet wurde; der Versatz
   * zur aktuellen Logik-Position (x, y, z) wird dazugerechnet.
   */
  fromCharacter(ch: Character, x: number, y: number, z: number, yaw: number, scale: number) {
    const b = ch.bones;
    const hips = b.hips, head = b.head, fl = b.footl, fr = b.footr;
    if (!hips || !head || !fl || !fr) return this.fromUpright(x, y, z, yaw, scale);
    FRAME.set(ch.holder, x, y, z, yaw);
    const pHips = FRAME.apply(hips, vA);
    const pHead = FRAME.apply(head, vB);
    vR.set(Math.cos(yaw), 0, -Math.sin(yaw));
    vUp.subVectors(pHead, pHips);
    const torsoLen = vUp.length() || 1;
    vUp.multiplyScalar(1 / torsoLen);
    // Rumpf: etwas unter der Hüfte bis zum Halsansatz
    vC.copy(pHips).addScaledVector(vUp, -0.08 * scale);
    this.torso.setSegment(vC, pHead, vR, 0.25 * scale, 0.18 * scale);
    // Kopf: vom Kopfknochen ein Stück weiter in Rumpfrichtung
    vC.copy(pHead).addScaledVector(vUp, 0.3 * scale);
    this.head.setSegment(pHead, vC, vR, 0.16 * scale, 0.16 * scale, 0.02 * scale);
    // Beine: Hüfte bis Fußmitte (Breite folgt der Schrittweite)
    const pl = FRAME.apply(fl, vC);
    const px = pl.x, py = pl.y, pz = pl.z;
    const pr = FRAME.apply(fr, vC);
    const spread = Math.hypot(px - pr.x, py - pr.y, pz - pr.z);
    vC.set((px + pr.x) / 2, (py + pr.y) / 2 - 0.08 * scale, (pz + pr.z) / 2);
    this.legs.setSegment(vC, pHips, vR, Math.max(0.2 * scale, spread / 2 + 0.1 * scale), Math.max(0.17 * scale, spread / 2 + 0.08 * scale));
    this.center.copy(this.torso.c);
    return this;
  }

  /** Ohne Knochen (Spielfigur aus Sicht der Gegner, Puppen): stehende Figur */
  fromUpright(x: number, y: number, z: number, yaw: number, scale: number) {
    this.legs.setUpright(x, y + 0.45 * scale, z, yaw, 0.22 * scale, 0.45 * scale, 0.17 * scale);
    this.torso.setUpright(x, y + 1.2 * scale, z, yaw, 0.26 * scale, 0.32 * scale, 0.18 * scale);
    this.head.setUpright(x, y + 1.7 * scale, z, yaw, 0.16 * scale, 0.17 * scale, 0.16 * scale);
    this.center.copy(this.torso.c);
    return this;
  }

  /** Früheste getroffene Zone entlang p → q (Radius r); Treffpunkt in hit */
  sweep(p: Vector3, q: Vector3, r: number, hit: Vector3): { zone: Zone; t: number } | null {
    let best: Zone | null = null, bt = 2;
    const th = this.head.segment(p, q, r);
    if (th >= 0 && th < bt) { bt = th; best = 'kopf'; }
    const tt = this.torso.segment(p, q, r);
    if (tt >= 0 && tt < bt) { bt = tt; best = 'rumpf'; }
    const tl = this.legs.segment(p, q, r);
    if (tl >= 0 && tl < bt) { bt = tl; best = 'beine'; }
    if (!best) return null;
    hit.lerpVectors(p, q, bt);
    return SWEEP_RES.zone = best, SWEEP_RES.t = bt, SWEEP_RES;
  }

  /** Überlappt ein Angriffsvolumen irgendeine Zone? (Rumpf zuerst, dann Kopf, dann Beine) */
  overlap(v: OBB): Zone | null {
    if (v.overlaps(this.torso)) return 'rumpf';
    if (v.overlaps(this.head)) return 'kopf';
    if (v.overlaps(this.legs)) return 'beine';
    return null;
  }
}
const SWEEP_RES: { zone: Zone; t: number } = { zone: 'rumpf', t: 0 };

/**
 * Angriffsvolumen vor einer Figur: Tiefe = Reichweite, Breite aus dem Öffnungswinkel, Höhe 0 … 2,2 m.
 * Rundumschläge (Winkel > 180°) bekommen einen Quader um die Figur.
 */
export function attackVolume(out: OBB, x: number, y: number, z: number, yaw: number, range: number, arc: number, scale = 1) {
  const h = 1.1 * scale;
  if (arc > Math.PI) return out.setUpright(x, y + h, z, yaw, range, h, range);
  const half = Math.max(0.55, Math.sin(Math.min(arc / 2, Math.PI / 2)) * range);
  const s = Math.sin(yaw), c = Math.cos(yaw);
  // hinterer Rand knapp hinter der Figur (Körpermitte zählt mit), vorderer Rand bei der Reichweite
  const back = -0.3, depth = (range - back) / 2;
  const mid = back + depth;
  return out.setUpright(x + s * mid, y + h, z + c * mid, yaw, half, h, depth);
}

// ---------- Waffen der Figuren: Klingen (Schweif-Markierungen) oder Gliedmaßen ----------

export interface WeaponSeg { a: Object3D; b: Object3D; ext: number; r: number }
const segCache = new WeakMap<Character, { key: string; segs: WeaponSeg[] }>();

/**
 * Strecken, die beim Schlag treffen: Klingen von trailBase bis trailTip; ohne Klinge Unterarm→Hand und
 * Unterschenkel→Fuß (Faustkampf, Tritte). Wird je Figur gemerkt und bei Waffenwechsel neu gesucht.
 */
export function weaponSegments(ch: Character): WeaponSeg[] {
  const held = `${ch.bones.handslotl?.children.length ?? 0}/${ch.bones.handslotr?.children.length ?? 0}/${ch.bones.handslotr?.children[0]?.uuid ?? ''}/${ch.bones.handslotl?.children[0]?.uuid ?? ''}`;
  const c = segCache.get(ch);
  if (c && c.key === held) return c.segs;
  const segs: WeaponSeg[] = [];
  ch.holder.traverse((o) => {
    if (o.name !== 'trailTip') return;
    const base = o.parent?.getObjectByName('trailBase');
    if (base) segs.push({ a: base, b: o, ext: 0, r: 0.1 });
  });
  // keine Klinge (nur kurze Handschuh-Markierungen): Faustkampf – Unterarme und Unterschenkel (Tritte) zählen
  if (!segs.length || segs.every((g) => g.a.getWorldPosition(vA).distanceTo(g.b.getWorldPosition(vB)) < 0.3)) {
    segs.length = 0;
    const b = ch.bones;
    for (const s of ['l', 'r']) {
      if (b[`lowerarm${s}`] && b[`hand${s}`]) segs.push({ a: b[`lowerarm${s}`], b: b[`hand${s}`], ext: 0.14, r: 0.15 });
    }
    for (const s of ['l', 'r']) {
      if (b[`lowerleg${s}`] && b[`foot${s}`]) segs.push({ a: b[`lowerleg${s}`], b: b[`foot${s}`], ext: 0.18, r: 0.15 });
    }
  }
  segCache.set(ch, { key: held, segs });
  return segs;
}
