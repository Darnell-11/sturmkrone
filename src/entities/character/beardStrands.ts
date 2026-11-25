// 4.6G.2: Bärte aus geformten Strähnen statt aus verschobener Gesichtshaut (die gab kantige schwarze Polygon-Blöcke).
//
// Grundlage ist ein Radius-Feld des Gesichts um eine senkrechte Achse durch den Kopf (Kopfraum der Grundfigur, Gesicht schaut nach −Z):
// je Winkel θ (0 = vorn, + = Richtung +X) und Höhe y der äußerste Hautpunkt. Jede Strähne ist eine Kurve in (θ, y), die auf dieser Fläche
// entlangläuft – unter dem Kinn hängt sie über die Hüllkurve weiter nach unten statt zum Hals einzurollen. Ihr Querschnitt ist eine flache,
// geschlossene Raute (Kante, Grat, Kante, Unterseite), Breite und Höhe verjüngen sich weich zur Spitze. Stoppeln sind winzige Dreiecke.
//
// Rein bis auf BufferGeometry (keine Szene, kein Material): `strandLayout` liefert die Strähnen als Daten (Tests), `buildBeardGeometry` das Netz.
import { BufferAttribute, BufferGeometry, CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, Vector3 } from 'three';
import { markShared } from '../../render/dispose';

/** Bartformen mit Strähnen (keiner = kein Netz) */
export type BeardKind = 'stoppeln' | 'kinnbart' | 'schnurrbart' | 'vollbart' | 'koteletten';
export const BEARD_KINDS: readonly BeardKind[] = ['stoppeln', 'kinnbart', 'schnurrbart', 'vollbart', 'koteletten'];

/** Radius-Feld der Gesichtshaut (Kopfraum) */
export interface FaceField {
  /** Achse bei x = 0, z = zc */
  zc: number;
  th0: number; th1: number; nTh: number;
  y0: number; y1: number; nY: number;
  /** äußerster Hautabstand zur Achse je Zelle (Zeile = y, Spalte = θ) */
  r: Float32Array;
  /** wie r, aber nach unten nie kleiner als darüber (bis HANG m): Strähnen hängen unter dem Kinn weiter, statt zum Hals einzurollen */
  hang: Float32Array;
}

/** Gemessene Gesichtsmarken (Kopfraum) */
export interface FaceMarks {
  eyeY: number;
  mouthY: number;
  /** tiefster Gesichtspunkt vorn */
  chinY: number;
  /** Ohrläppchen (x > 0) */
  ear: { x: number; y: number; z: number };
  /** Kieferlinie: tiefste Gesichtshaut je Winkel (Funktion von θ) */
  jawY: (th: number) => number;
}

/** wie weit die Hüllkurve unter einer Stelle nachwirkt (m) */
const HANG = 0.06;
/** Bogenmaß → Meter auf der Gesichtsrundung (für Breiten quer zur Strähne) */
const ARC = 0.075;

/** Eine Strähne in (θ, y): quadratische Kurve Wurzel → Kontrollpunkt → Spitze; Breite und Höhe an der Wurzel (m) */
export interface Strand { a: [number, number]; c: [number, number]; b: [number, number]; w: number; h: number; lift: number }

/** Feld aus Hautpunkten (Kopfraum) aufbauen: je Zelle der äußerste Radius, Lücken aus den Nachbarn, leicht geglättet */
export function buildFaceField(pts: ArrayLike<number>, zc: number, y0: number, y1: number, th0 = -2.0, th1 = 2.0, nTh = 96, nY = 72): FaceField {
  const r = new Float32Array(nTh * nY);
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2] - zc;
    if (y < y0 || y > y1) continue;
    const th = Math.atan2(x, -z);
    if (th < th0 || th > th1) continue;
    const ci = Math.min(nTh - 1, Math.round(((th - th0) / (th1 - th0)) * (nTh - 1)));
    const ri = Math.min(nY - 1, Math.round(((y - y0) / (y1 - y0)) * (nY - 1)));
    const d = Math.hypot(x, z);
    if (d > r[ri * nTh + ci]) r[ri * nTh + ci] = d;
  }
  // Lücken füllen (Nachbarmittel), dann zweimal leicht glätten – nie unter die gemessene Haut
  for (let pass = 0; pass < 8; pass++) {
    const nx = r.slice();
    let empty = 0;
    for (let y = 0; y < nY; y++) for (let t = 0; t < nTh; t++) {
      const k = y * nTh + t;
      if (r[k] > 0) continue;
      let s = 0, c = 0;
      for (const [dy, dt] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const yy = y + dy, tt = t + dt;
        if (yy < 0 || yy >= nY || tt < 0 || tt >= nTh) continue;
        const v = r[yy * nTh + tt];
        if (v > 0) { s += v; c++; }
      }
      if (c) nx[k] = s / c; else empty++;
    }
    r.set(nx);
    if (!empty) break;
  }
  for (let pass = 0; pass < 2; pass++) {
    const nx = r.slice();
    for (let y = 1; y < nY - 1; y++) for (let t = 1; t < nTh - 1; t++) {
      const k = y * nTh + t;
      const avg = (r[k - 1] + r[k + 1] + r[k - nTh] + r[k + nTh]) * 0.25;
      nx[k] = Math.max(r[k], r[k] * 0.5 + avg * 0.5);
    }
    r.set(nx);
  }
  // Hüllkurve nach unten: über HANG m hinweg nie kleiner als darüber
  const hang = r.slice();
  const span = Math.max(1, Math.round((HANG / Math.max(1e-4, y1 - y0)) * (nY - 1)));
  for (let t = 0; t < nTh; t++) for (let y = nY - 2; y >= 0; y--) {
    let m = r[y * nTh + t];
    for (let k = 1; k <= span && y + k < nY; k++) m = Math.max(m, r[(y + k) * nTh + t] * (1 - k / (span * 6)));
    hang[y * nTh + t] = m;
  }
  return { zc, th0, th1, nTh, y0, y1, nY, r, hang };
}

/** Radius an (θ, y), bilinear; hang = Hüllkurve statt Haut */
export function fieldRadius(f: FaceField, th: number, y: number, hang = true): number {
  const a = hang ? f.hang : f.r;
  const ft = Math.min(f.nTh - 1.001, Math.max(0, ((th - f.th0) / (f.th1 - f.th0)) * (f.nTh - 1)));
  const fy = Math.min(f.nY - 1.001, Math.max(0, ((y - f.y0) / (f.y1 - f.y0)) * (f.nY - 1)));
  const t0 = Math.floor(ft), y0 = Math.floor(fy), tt = ft - t0, ty = fy - y0;
  const v = (yy: number, t: number) => a[yy * f.nTh + t];
  return (v(y0, t0) * (1 - tt) + v(y0, t0 + 1) * tt) * (1 - ty) + (v(y0 + 1, t0) * (1 - tt) + v(y0 + 1, t0 + 1) * tt) * ty;
}

/**
 * Kieferlinie je Winkel aus dem Feld: von Mundhöhe abwärts die erste Höhe, an der die Haut deutlich zurückweicht (Unterseite von Kinn und
 * Kiefer, darunter der schmalere Hals). Sicherer als die Unterkante des Gesichtsnetzes (sie reicht unter dem Kinn bis an den Hals).
 */
export function jawFromField(f: FaceField, th: number, mouthY: number, floor: number): number {
  const ref = fieldRadius(f, th, mouthY, false);
  let y = mouthY - 0.004;
  for (; y > floor; y -= 0.0015) if (fieldRadius(f, th, y, false) < ref * 0.84) break;
  return Math.max(floor, y);
}

/**
 * Weg eines Brillenbügels an der Kopfseite (Kopfraum, Seite +X): für Tiefen z von vorn nach hinten die Breite der Haut auf Höhe y plus Abstand –
 * der Bügel liegt an Schläfe und Ohr an, statt gerade in den Kopf zu stechen oder seitlich abzustehen. Rückgabe [x, z] je Schritt.
 */
export function templePath(f: FaceField, y: number, zFront: number, zBack: number, gap: number, steps = 8): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const z = zFront + (zBack - zFront) * (i / steps);
    // θ so, dass die Fläche bei dieser Tiefe liegt (z wächst mit θ auf der Seite +X)
    let lo = 0, hi = 1.9;
    for (let it = 0; it < 24; it++) {
      const mid = (lo + hi) / 2;
      const zz = f.zc - fieldRadius(f, mid, y, false) * Math.cos(mid);
      if (zz < z) lo = mid; else hi = mid;
    }
    const th = (lo + hi) / 2, r = fieldRadius(f, th, y, false);
    out.push([Math.sin(th) * r + gap, z]);
  }
  // nie nach innen knicken (Bügel laufen höchstens auseinander)
  for (let i = 1; i < out.length; i++) out[i][0] = Math.max(out[i][0], out[i - 1][0]);
  return out;
}

/** 4.6G.3: Winkel θ (Seite +X, θ ≥ 0), an dem die Haut auf Höhe y die Tiefe z erreicht – für Riemen an der Kopfseite */
export function thetaAtDepth(f: FaceField, y: number, z: number, side = 1): number {
  let lo = 0, hi = 1.95;
  for (let it = 0; it < 24; it++) {
    const mid = (lo + hi) / 2;
    if (f.zc - fieldRadius(f, side * mid, y, false) * Math.cos(mid) < z) lo = mid; else hi = mid;
  }
  return side * (lo + hi) / 2;
}

/** 4.6G.3: Winkel θ, an dem die Haut auf Höhe y seitlich bei x liegt (Vorderseite des Gesichts, |θ| < 1,4) */
export function thetaAtX(f: FaceField, y: number, x: number): number {
  const s = x < 0 ? -1 : 1, ax = Math.abs(x);
  let lo = 0, hi = 1.4;
  for (let it = 0; it < 24; it++) {
    const mid = (lo + hi) / 2;
    if (Math.sin(mid) * fieldRadius(f, s * mid, y, false) < ax) lo = mid; else hi = mid;
  }
  return s * (lo + hi) / 2;
}

/**
 * 4.6G.3: Riemen an der Haut entlang (Augenklappe, Fliegerbrille): Stützpunkte als (x, y) vorn im Gesicht bzw. (Tiefe z, y) an der Kopfseite,
 * je Punkt auf die Haut gelegt plus `gap`. Seite +X; für −X die Punkte mit negativem x angeben. Rückgabe im Kopfraum.
 */
export function skinStrap(f: FaceField, pts: { x?: number; z?: number; y: number; side?: number }[], gap: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const p of pts) {
    const th = p.z !== undefined ? thetaAtDepth(f, p.y, p.z, p.side ?? 1) : thetaAtX(f, p.y, p.x ?? 0);
    const r = fieldRadius(f, th, p.y, false) + gap;
    out.push([Math.sin(th) * r, p.y, f.zc - Math.cos(th) * r]);
  }
  return out;
}

/** Punkt auf der Fläche plus Abstand nach außen (Kopfraum); hang = Hüllkurve (Strähnen hängen unter dem Kinn), sonst die Haut selbst */
export function fieldPoint(f: FaceField, th: number, y: number, off: number, out: Vector3, hang = true): Vector3 {
  const r = fieldRadius(f, th, y, hang) + off;
  return out.set(Math.sin(th) * r, y, f.zc - Math.cos(th) * r);
}

const _p = new Vector3(), _q = new Vector3(), _t = new Vector3(), _s = new Vector3();

/** Flächennormale an (θ, y) aus den Nachbarpunkten (nach außen) */
export function fieldNormal(f: FaceField, th: number, y: number, out: Vector3, hang = true): Vector3 {
  const e = 0.004, et = e / ARC;
  fieldPoint(f, th + et, y, 0, _p, hang); fieldPoint(f, th - et, y, 0, _q, hang);
  _t.subVectors(_p, _q);
  fieldPoint(f, th, y + e, 0, _p, hang); fieldPoint(f, th, y - e, 0, _q, hang);
  _s.subVectors(_p, _q);
  out.crossVectors(_s, _t).normalize();
  // nach außen (von der Achse weg)
  if (out.x * Math.sin(th) - out.z * Math.cos(th) < 0) out.negate();
  return out;
}

/** einfacher, fester Zufall (gleiche Strähnen für jede Figur) */
function rnd(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/**
 * Strähnen einer Bartform in (θ, y). Maße aus den Gesichtsmarken: Schnurrbart auf der Oberlippe von der Mitte nach außen, Kinnbart vom
 * Unterlippen-Grübchen zur Spitze unter dem Kinn, Koteletten vor den Ohren, Vollbart vom Wangenansatz über die Kieferlinie bis unter das Kinn.
 * Jede Form hat zwei Lagen: eine breite, flache Grundlage (geschlossene Masse, keine Haut in den Lücken) und schmalere, höhere Decksträhnen,
 * um eine halbe Breite versetzt und unterschiedlich lang (gezackte Spitzen wie gezeichnet).
 */
export function strandLayout(kind: BeardKind, m: FaceMarks, zc: number): Strand[] {
  const out: Strand[] = [];
  const R = rnd(kind.length * 131 + 7);
  const thE = Math.atan2(m.ear.x, -(m.ear.z - zc));
  const my = m.mouthY, cy = m.chinY;
  const mustache = (spread: number, h: number) => {
    for (const layer of [0, 1]) for (const s of [-1, 1]) {
      const n = layer ? 6 : 7;
      for (let i = 0; i < n; i++) {
        const k = (i + (layer ? 0.5 : 0)) / (n - (layer ? 0 : 1));
        const u0 = s * (0.002 + k * 0.019), u1 = s * (0.011 + k * (0.02 + spread));
        const y0 = my + 0.0132 - k * 0.0025, y1 = my + 0.0042 - k * 0.0045 - (layer ? 0.0008 : 0);
        out.push({
          a: [u0 / ARC, y0], c: [((u0 + u1) / 2) / ARC, (y0 + y1) / 2 + 0.0018], b: [u1 / ARC, y1 + (R() - 0.5) * 0.0012],
          w: (layer ? 0.0062 : 0.0088) * (1 - k * 0.25), h: (layer ? h : h * 0.55) * (1 - k * 0.3), lift: layer ? 0.0013 : 0.0008,
        });
      }
    }
  };
  const chin = (len: number, spread: number, h: number) => {
    // Grübchen unter der Unterlippe (schmaler Keil)
    for (const u of [-0.003, 0, 0.003]) out.push({ a: [u / ARC, my - 0.012], c: [(u * 0.9) / ARC, my - 0.018], b: [(u * 0.5) / ARC, my - 0.025], w: 0.0052, h: h * 0.6, lift: 0.0008 });
    // Kinnbüschel: Wurzeln quer über das Kinn, die Spitzen laufen unter dem Kinn zu einer Spitze zusammen
    for (const layer of [0, 1]) {
      const n = layer ? 8 : 9;
      for (let i = 0; i < n; i++) {
        const k = (i + (layer ? 0.5 : 0)) / (n - (layer ? 0 : 1)) - 0.5;
        const u0 = k * spread, j = (R() - 0.5) * 0.003;
        const y0 = my - 0.016 - Math.abs(k) * 0.01;
        const tipY = cy - len * (1 - Math.abs(k) * 0.9) - (layer ? 0.002 : 0) + j;
        out.push({
          a: [u0 / ARC, y0], c: [(u0 * 0.92) / ARC, cy + 0.003], b: [(u0 * 0.22) / ARC, tipY],
          w: (layer ? 0.0068 : 0.0098) * (1 - Math.abs(k) * 0.4), h: layer ? h : h * 0.55, lift: layer ? 0.0016 : 0.001,
        });
      }
    }
  };
  const sideburns = (bottom: number, h: number) => {
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
      const th = s * (thE - 0.2 - i * 0.036);
      const y0 = m.eyeY - 0.004 - i * 0.0015;
      out.push({ a: [th, y0], c: [th - s * 0.02, (y0 + bottom) / 2], b: [th - s * 0.045, bottom - i * 0.0015 + (R() - 0.5) * 0.003], w: i % 2 ? 0.0075 : 0.0105, h: i % 2 ? h : h * 0.6, lift: 0.0009 });
    }
  };
  switch (kind) {
    case 'schnurrbart': mustache(0.004, 0.0028); break;
    case 'kinnbart': chin(0.022, 0.036, 0.0036); break;
    case 'koteletten': sideburns(m.ear.y - 0.012, 0.0022); break;
    case 'vollbart': {
      mustache(0.0015, 0.0028);
      sideburns(m.ear.y - 0.004, 0.0026);
      // Kieferbart: Grundlage und Decksträhnen von der Wangenlinie über die Kieferlinie hinab, vorn etwas länger (bis unter das Kinn)
      for (const layer of [0, 1]) for (const s of [-1, 1]) {
        const n = 15;
        for (let i = 0; i < n; i++) {
          const k = (i + (layer ? 0.5 : 0)) / n;
          const th = s * (0.1 + k * (thE - 0.32));
          const side = Math.abs(th) / Math.max(0.3, thE);
          // Wangenlinie: an der Seite auf Höhe der Koteletten, vorn am Mundwinkel; mitten vor dem Mund erst unter der Unterlippe
          const u = Math.abs(th) * ARC;
          const lip = u < 0.03 ? smoothstep(0.03, 0.018, u) : 0;
          const y0 = my + 0.006 + side * (m.ear.y - my + 0.006) - lip * 0.02;
          const jaw = m.jawY(th);
          const len = 0.004 + (1 - side) * 0.011 + (layer ? (R() - 0.3) * 0.005 : 0);
          const y1 = Math.min(y0 - 0.02, jaw - len);
          out.push({
            a: [th, y0], c: [th * 0.97, (y0 + jaw) / 2], b: [th * (0.86 - layer * 0.03), y1],
            w: (layer ? 0.0078 : 0.0115) * (1 - side * 0.15), h: layer ? 0.0036 : 0.0016, lift: layer ? 0.0017 : 0.001,
          });
        }
      }
      chin(0.022, 0.042, 0.0038);
      break;
    }
    case 'stoppeln': break;
  }
  return out;
}

/**
 * 4.6G.3: Abstand der Bartstoppeln (Drei-Tage-Bart) über der Haut (m). Sie liegen auf der echten Haut (`hang = false`), nicht auf der
 * Hüllkurve, die unter dem Kinn nach unten hängt – dort schwebten die Stoppeln vorher in der Luft vor Kinn und Hals.
 */
export const STUBBLE_LIFT = 0.0015;
/** Stoppeln unter der Kieferlinie: nur ein schmaler Streifen (m), wo die Haut noch zum Kinn gehört */
export const STUBBLE_UNDER_JAW = 0.005;

/** Querschnitt-Punkte je Ring einer Strähne (Kante, Grat, Kante, Unterseite) und Ringe entlang */
const RING = 4, SEG = 9;
/** Anteil der eigenen Strähnen-Normale (Rest: Gesichtsfläche) */
const BEARD_RELIEF = 0.4;
function smoothstep(a: number, b: number, x: number) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

/**
 * Netz eines Barts im Kopfraum. Strähnen als geschlossene, flache Rauten-Röhren; Stoppeln als dichtes Feld winziger Dreiecke auf der Haut
 * (Wangen, Kiefer, Kinn, Oberlippe, nicht auf den Lippen). Normalen weich (computeVertexNormals).
 */
export function buildBeardGeometry(kind: BeardKind, f: FaceField, m: FaceMarks): BufferGeometry | null {
  const pos: number[] = [], idx: number[] = [];
  /** Flächennormale je Punkt (Gesicht darunter): die Bart-Normalen werden zu ihr hin geglättet – eine zusammenhängende Masse statt Streifen */
  const fn: number[] = [];
  const P = new Vector3(), N = new Vector3(), T = new Vector3(), B = new Vector3(), Q = new Vector3(), Pn = new Vector3();
  if (kind === 'stoppeln') {
    const R = rnd(4242);
    const thE = Math.atan2(m.ear.x, -(m.ear.z - f.zc));
    const step = 0.0021;
    for (let y = m.ear.y + 0.004; y > m.chinY - 0.004; y -= step) {
      for (let th = -thE + 0.22; th < thE - 0.22; th += step / ARC) {
        const tj = th + (R() - 0.5) * (step / ARC) * 0.9, yj = y + (R() - 0.5) * step * 0.9;
        const side = Math.abs(tj) / thE;
        // Wangenlinie (wie beim Vollbart), Lippen und Mundwinkel frei, unter der Kieferlinie nur ein schmaler Streifen
        const top = m.mouthY + 0.008 + side * (m.ear.y - m.mouthY);
        if (yj > top) continue;
        if (Math.abs(tj) * ARC < 0.026 && yj > m.mouthY - 0.012 && yj < m.mouthY + 0.007) continue;
        if (yj < m.jawY(tj) - STUBBLE_UNDER_JAW) continue;
        if (R() < 0.18) continue;
        // 4.6G.3: auf der Haut selbst (+1,5 mm), nicht auf der Hüllkurve
        fieldPoint(f, tj, yj, STUBBLE_LIFT, P, false);
        fieldNormal(f, tj, yj, N, false);
        // kurzer Strich nach unten auf der Fläche, leicht verdreht
        const a = (R() - 0.5) * 0.9;
        T.set(Math.cos(tj) * Math.sin(a), -Math.cos(a), Math.sin(tj) * Math.sin(a));
        T.addScaledVector(N, -T.dot(N)).normalize();
        B.crossVectors(N, T).normalize();
        const len = 0.0016 + R() * 0.0008, w = 0.00042;
        const i0 = pos.length / 3;
        Q.copy(P).addScaledVector(B, -w); pos.push(Q.x, Q.y, Q.z);
        Q.copy(P).addScaledVector(B, w); pos.push(Q.x, Q.y, Q.z);
        // Spitze: entlang der Haut, wieder auf denselben Abstand gelegt (auf gewölbter Haut stünde sie sonst ab oder stäche hinein)
        Q.copy(P).addScaledVector(T, len);
        const qr = Math.hypot(Q.x, Q.z - f.zc), qth = Math.atan2(Q.x, -(Q.z - f.zc));
        const want = fieldRadius(f, qth, Q.y, false) + STUBBLE_LIFT + 0.0002;
        if (qr > 1e-6) { Q.x *= want / qr; Q.z = f.zc + (Q.z - f.zc) * (want / qr); }
        pos.push(Q.x, Q.y, Q.z);
        // Umlaufsinn nach außen (B = N × T: −B, +B, Spitze zeigte sonst zur Haut und wurde weggeschnitten)
        idx.push(i0, i0 + 2, i0 + 1);
        for (let q = 0; q < 3; q++) fn.push(N.x, N.y, N.z);
      }
    }
  } else {
    for (const s of strandLayout(kind, m, f.zc)) {
      const base = pos.length / 3;
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG, u = 1 - t;
        const th = u * u * s.a[0] + 2 * u * t * s.c[0] + t * t * s.b[0];
        const y = u * u * s.a[1] + 2 * u * t * s.c[1] + t * t * s.b[1];
        // Breite und Höhe verjüngen sich weich zur Spitze (die letzten Ringe laufen spitz zu)
        const taper = Math.pow(u, 0.75);
        const w = s.w * (0.18 + 0.82 * taper) * 0.5 * (i === SEG ? 0.15 : 1);
        const h = s.h * (0.25 + 0.75 * taper) * (i === SEG ? 0.3 : 1);
        fieldPoint(f, th, y, s.lift, P);
        fieldNormal(f, th, y, N);
        // Richtung entlang der Strähne (vorwärts in der Kurve)
        const t2 = Math.min(1, t + 0.05), t1 = Math.max(0, t - 0.05), u2 = 1 - t2, u1 = 1 - t1;
        fieldPoint(f, u2 * u2 * s.a[0] + 2 * u2 * t2 * s.c[0] + t2 * t2 * s.b[0], u2 * u2 * s.a[1] + 2 * u2 * t2 * s.c[1] + t2 * t2 * s.b[1], s.lift, Pn);
        fieldPoint(f, u1 * u1 * s.a[0] + 2 * u1 * t1 * s.c[0] + t1 * t1 * s.b[0], u1 * u1 * s.a[1] + 2 * u1 * t1 * s.c[1] + t1 * t1 * s.b[1], s.lift, Q);
        T.subVectors(Pn, Q);
        if (T.lengthSq() < 1e-12) T.set(0, -1, 0);
        T.normalize();
        B.crossVectors(N, T).normalize();
        // Kante, Grat (außen), Kante, Unterseite (knapp über der Haut)
        Q.copy(P).addScaledVector(B, -w); pos.push(Q.x, Q.y, Q.z);
        Q.copy(P).addScaledVector(N, h); pos.push(Q.x, Q.y, Q.z);
        Q.copy(P).addScaledVector(B, w); pos.push(Q.x, Q.y, Q.z);
        Q.copy(P).addScaledVector(N, -Math.min(h * 0.35, s.lift * 0.8)); pos.push(Q.x, Q.y, Q.z);
        for (let q = 0; q < RING; q++) fn.push(N.x, N.y, N.z);
      }
      for (let i = 0; i < SEG; i++) for (let e = 0; e < RING; e++) {
        const a = base + i * RING + e, b = base + i * RING + ((e + 1) % RING), c = a + RING, d = b + RING;
        idx.push(a, c, b, b, c, d);
      }
      // Wurzel schließen
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  if (!idx.length) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Normalen zur Gesichtsfläche hin glätten: die Strähnen behalten ein leichtes Relief, schattieren aber wie eine Bartmasse
  const nr = g.attributes.normal as BufferAttribute;
  for (let i = 0; i < nr.count; i++) {
    const x = nr.getX(i) * BEARD_RELIEF + fn[i * 3] * (1 - BEARD_RELIEF), y = nr.getY(i) * BEARD_RELIEF + fn[i * 3 + 1] * (1 - BEARD_RELIEF), z = nr.getZ(i) * BEARD_RELIEF + fn[i * 3 + 2] * (1 - BEARD_RELIEF);
    const l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(i, x / l, y / l, z / l);
  }
  g.computeBoundingSphere();
  return g;
}

let strandTex: CanvasTexture | null = null;
/**
 * Feine Haar-Textur der Bärte (512 × 512, kachelbar) im Format der PBR-Schmiede: R = Verdeckung (dunkle Fugen zwischen den Haaren),
 * G = Rauheit, B = 0, A = Höhe. Rund 96 senkrechte, leicht gewellte Haare je Kachel. Geteilt, nie freigeben.
 */
export function beardStrandTexture(): CanvasTexture | null {
  if (strandTex) return strandTex;
  if (typeof document === 'undefined') return null;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(S, S);
  const H = new Float32Array(S * S);
  const R = rnd(9001);
  for (let k = 0; k < 96; k++) {
    const cx = R() * S, w = 1.6 + R() * 2.4, amp = 0.5 + R() * 0.5;
    const f1 = 1 + Math.floor(R() * 3), ph = R() * Math.PI * 2, wav = 1.5 + R() * 3;
    // Haare enden und beginnen (Lücken entlang der Richtung), kachelbar über ganzzahlige Frequenzen
    const gapF = 1 + Math.floor(R() * 3), gapPh = R() * Math.PI * 2;
    for (let y = 0; y < S; y++) {
      const v = y / S;
      const x0 = cx + Math.sin(v * Math.PI * 2 * f1 + ph) * wav;
      const on = 0.55 + 0.45 * Math.sin(v * Math.PI * 2 * gapF + gapPh);
      for (let dx = -Math.ceil(w) - 1; dx <= Math.ceil(w) + 1; dx++) {
        const x = Math.round(x0) + dx;
        const d = (x - x0) / w;
        if (Math.abs(d) >= 1) continue;
        const xx = ((x % S) + S) % S;
        const hgt = amp * on * (1 - d * d);
        if (hgt > H[y * S + xx]) H[y * S + xx] = hgt;
      }
    }
  }
  for (let i = 0; i < S * S; i++) {
    const h = Math.min(1, H[i]);
    img.data[i * 4] = Math.round((0.6 + 0.4 * h) * 255);
    img.data[i * 4 + 1] = Math.round((0.62 - 0.25 * h) * 255);
    img.data[i * 4 + 2] = 0;
    // Alpha nie sehr klein: der Canvas speichert vormultipliziert (sonst verlöre R/G an Genauigkeit)
    img.data[i * 4 + 3] = Math.round((0.22 + 0.78 * h) * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.premultiplyAlpha = false;
  t.name = 'beardStrands';
  strandTex = markShared(t);
  return strandTex;
}
