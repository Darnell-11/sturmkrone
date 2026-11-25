// 4.6G.3: Sitz der Standard-Hüte am Schädel statt auf den Haarspitzen, und das Haar darunter.
//
// Bis 4.6G.2 saßen Hüte auf der Oberkante der Frisur (98,5 % der Haarhöhe): bei den stacheligen Anime-Frisuren schwebten sie wie ein UFO
// über dem Kopf, und das Haar wurde schon 4 cm unter dem Hutrand nach innen gezogen – das ergab kahle Stellen über der Stirn.
// Jetzt misst die Grundfigur ihren Schädel (Radius-Feld der Kopfhaut, Kopfraum: Gesicht schaut nach −Z, hinten ist +Z) und jeder Hut
// greift mit seinem Band satt um Stirn und Hinterkopf: vorn knapp über den Brauen, hinten etwas tiefer (leicht nach hinten geneigt).
// Haar über dem Band wird sanft in die Krone gedrückt; was unter dem Band liegt (Pony, Schläfen, Nacken), bleibt unverändert.
//
// Rein (ohne three.js-Szene): `seatFromSkull` rechnet den Sitz aus einer Radius-Funktion, `squeezeUnderHat` verschiebt einen Haarpunkt.

/** Die acht Standard-Hüte, die am Schädel sitzen (Helme der Ausrüstung und Hüte aus Modellen behalten ihre Kappe) */
export const SEATED_HATS = ['dreispitz', 'zweispitz', 'marine', 'kochmuetze', 'muetze', 'suedwester', 'bandana', 'helm'] as const;
export type SeatedHat = (typeof SEATED_HATS)[number];
export const isSeatedHat = (hat: string | undefined | null): hat is SeatedHat => !!hat && (SEATED_HATS as readonly string[]).includes(hat);

/**
 * Maße des Hutsitzes (m, Kopfraum):
 * - `front`/`back`: Höhe der Bandmitte über den Augen vorn (Stirn, knapp über den Brauen) und hinten (Hinterkopf, tiefer)
 * - `pad`: so dick bleibt das Haar unter Band und Krone (gedrückt, nicht abgeschnitten)
 * - `blend`: unter dem Band läuft die Verschiebung über so viele Meter weich aus (Pony und Schläfen bleiben voll)
 */
export const HAT_FIT = { front: 0.066, back: 0.038, pad: 0.009, crownPad: 0.011, blend: 0.006 } as const;

/**
 * 4.6H: entspannter Sitz – jeder Hut und jeder Ausrüstungshelm sitzt 0,8 cm höher (Band UND Krone, der ganze Hut hebt sich am Socket `headTop`)
 * und sein innerer Kranz ist 3,5 % weiter. So wirken Hüte nicht mehr in den Kopf gepresst, und das Haar hat in der Krone Platz: keine einzelnen
 * Härchen mehr oben oder seitlich durch den Hut.
 */
export const HAT_RELAX = { lift: 0.008, widen: 1.035 } as const;

/** Je Hut: wie tief das Band sitzt (Zusatz zu front/back, m) und wie weit es übersteht (m) */
export const HAT_SEAT_STYLE: Record<SeatedHat, { drop: number; ease: number }> = {
  dreispitz: { drop: 0, ease: 0.003 }, zweispitz: { drop: 0, ease: 0.003 }, marine: { drop: 0.004, ease: 0.002 }, kochmuetze: { drop: 0, ease: 0.002 },
  muetze: { drop: 0.012, ease: 0.003 }, suedwester: { drop: 0.004, ease: 0.003 }, bandana: { drop: 0.006, ease: 0.001 }, helm: { drop: 0.002, ease: 0.004 },
};

/** Sitz eines Huts (Kopfraum). Bandebene: Mitte (cx, y, cz), um `tilt` um die x-Achse geneigt (hinten tiefer). */
export interface HatSeat {
  cx: number; y: number; cz: number;
  /** Neigung (rad): positiv = hinten tiefer (three.js: rotation.x = tilt) */
  tilt: number;
  /** Halbachsen des Bandes (außen über dem gedrückten Haar): a quer (x), b längs (z) */
  a: number; b: number;
  /** Höhe der Krone über der Bandmitte (Schädel plus gedrücktes Haar) */
  h: number;
  /** Schädel allein: Halbachsen auf Bandhöhe und Höhe des Scheitels über der Bandmitte (für die Innenkappe) */
  sa: number; sb: number; sh: number;
  /** 4.6H: Schürze unter dem Band (Wangen-, Nacken- und Stoffschutz eines Helms): Haar darunter bleibt innen */
  skirt?: HatSkirt;
}

/**
 * 4.6H: Schürze eines Helms unter dem Band – je Richtung um die Kopfachse (Sektor, 0 = Gesicht, wachsend zur Seite +X) und je Höhenstufe (ab
 * `y0` abwärts, Kopfraum) der innerste Halbmesser der Helmfläche waagrecht um (cx, cz), schon um `SKIRT.margin` nach innen gerückt.
 * Infinity = dort ist keine Fläche (Gesichtsöffnung, unter der Unterkante).
 */
export interface HatSkirt { n: number; m: number; y0: number; dy: number; r: Float32Array }
export const SKIRT = { sectors: 24, step: 0.01, depth: 0.2, margin: 0.004 } as const;

/** Schürze aus Ringen (Bausatz-Helme): Halbmesser `R + r0` am Band bis `R + r1` an der Unterkante `depth`, vorn offen bis `open` (rad) */
export interface SkirtRings { depth: number; open: number; r0: number; r1: number }
export function skirtFromRings(s: HatSeat, spec: SkirtRings): HatSkirt {
  const n = SKIRT.sectors, m = Math.ceil(spec.depth / SKIRT.step) + 1;
  const r = new Float32Array(n * m).fill(Infinity);
  // derselbe Kranz-Radius wie die Kappe der Bausatz-Helme (`seatShell` in animeHats.ts)
  const R = (s.a + s.b) / 2 + 0.002;
  for (let h = 0; h < m; h++) {
    const t = Math.min(1, (h * SKIRT.step) / spec.depth);
    const rr = R + spec.r0 + (spec.r1 - spec.r0) * t - SKIRT.margin;
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(az), Math.cos(az))) >= spec.open) r[h * n + i] = rr;
    }
  }
  return { n, m, y0: s.y, dy: SKIRT.step, r };
}

/**
 * Schürze aus einem Modell (Helme aus Blender): Dreiecke im Kopfraum (je 9 Zahlen), abgetastet im Abstand von höchstens 5 mm; zählt nur, was
 * unter der Bandebene liegt. Leere Stufen zwischen zwei belegten Stufen eines Sektors werden aufgefüllt. undefined, wenn unter dem Band nichts liegt.
 */
export function skirtFromTriangles(s: HatSeat, tris: ArrayLike<number>): HatSkirt | undefined {
  const n = SKIRT.sectors, m = Math.ceil(SKIRT.depth / SKIRT.step) + 1;
  const y0 = s.y + 0.005;
  const r = new Float32Array(n * m).fill(Infinity);
  const q = { x: 0, y: 0, z: 0 };
  let any = false;
  const put = (x: number, y: number, z: number) => {
    if (toSeat(s, x, y, z, q).y > 0.002) return;
    const h = Math.round((y0 - y) / SKIRT.step);
    if (h < 0 || h >= m) return;
    const dx = x - s.cx, dz = z - s.cz, rho = Math.hypot(dx, dz);
    if (rho < 0.03) return;
    const i = Math.round((Math.atan2(dx, -dz) / (Math.PI * 2)) * n + n) % n;
    const k = h * n + i, v = rho - SKIRT.margin;
    if (v < r[k]) { r[k] = v; any = true; }
  };
  for (let t = 0; t + 8 < tris.length; t += 9) {
    const ax = tris[t], ay = tris[t + 1], az = tris[t + 2], bx = tris[t + 3], by = tris[t + 4], bz = tris[t + 5], cx = tris[t + 6], cy = tris[t + 7], cz = tris[t + 8];
    if (Math.min(ay, by, cy) > s.y + 0.01 || Math.max(ay, by, cy) < y0 - SKIRT.depth - 0.01) continue;
    const e = Math.max(Math.hypot(ax - bx, ay - by, az - bz), Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(cx - ax, cy - ay, cz - az));
    const k = Math.min(24, Math.max(1, Math.ceil(e / 0.005)));
    for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++) {
      const u = i / k, v = j / k, w = 1 - u - v;
      put(ax * w + bx * u + cx * v, ay * w + by * u + cy * v, az * w + bz * u + cz * v);
    }
  }
  if (!any) return undefined;
  // Lücken je Sektor zwischen belegten Stufen schließen (große Dreiecke, dünne Bänder)
  for (let i = 0; i < n; i++) {
    let last = -1;
    for (let h = 0; h < m; h++) {
      const k = h * n + i;
      if (!Number.isFinite(r[k])) continue;
      if (last >= 0 && h - last > 1) for (let g = last + 1; g < h; g++) r[g * n + i] = Math.min(r[last * n + i], r[k]);
      last = h;
    }
  }
  return { n, m, y0, dy: SKIRT.step, r };
}

/**
 * Sitz aus dem Schädel: r(θ, y) = Abstand der Kopfhaut zur senkrechten Achse durch (0, zc) (θ = 0 vorn, π/2 = Seite +X, π = hinten),
 * top = Scheitel, eyeY = Augenhöhe.
 */
export function seatFromSkull(r: (th: number, y: number) => number, zc: number, top: number, eyeY: number, hat: SeatedHat): HatSeat {
  const st = HAT_SEAT_STYLE[hat];
  // Band an der Haut gemessen (Stirn knapp über den Brauen, Hinterkopf tiefer), dann um `HAT_RELAX.lift` angehoben
  const yF0 = eyeY + HAT_FIT.front - st.drop, yB0 = eyeY + HAT_FIT.back - st.drop;
  const zF = zc - r(0, yF0), zB = zc + r(Math.PI, yB0);
  const y0 = (yF0 + yB0) / 2, cz = (zF + zB) / 2;
  const tilt = Math.atan2(yF0 - yB0, zB - zF);
  const sa = Math.max(r(Math.PI / 2, y0), r(-Math.PI / 2, y0));
  const sb = (zB - zF) / 2;
  const pad = HAT_FIT.pad + st.ease;
  const y = y0 + HAT_RELAX.lift;
  // Krone über dem Band wie bisher (die Krone hebt sich mit dem Band); Schädel allein bis zum Scheitel (Innenkappe)
  const sh = top - y;
  return { cx: 0, y, cz, tilt, a: (sa + pad) * HAT_RELAX.widen, b: (sb + pad) * HAT_RELAX.widen, h: sh + HAT_FIT.crownPad + HAT_RELAX.lift, sa, sb, sh };
}

/** Punkt (Kopfraum) → Raum des Hutsitzes (Bandmitte = Ursprung, Band in der Ebene y = 0, vorn = −Z) */
export function toSeat(s: HatSeat, x: number, y: number, z: number, out: { x: number; y: number; z: number }) {
  const dx = x - s.cx, dy = y - s.y, dz = z - s.cz;
  const c = Math.cos(s.tilt), si = Math.sin(s.tilt);
  // Drehung um x um −tilt
  out.x = dx; out.y = dy * c + dz * si; out.z = -dy * si + dz * c;
  return out;
}

/** Raum des Hutsitzes → Kopfraum */
export function fromSeat(s: HatSeat, x: number, y: number, z: number, out: { x: number; y: number; z: number }) {
  const c = Math.cos(s.tilt), si = Math.sin(s.tilt);
  out.x = x + s.cx; out.y = y * c - z * si + s.y; out.z = y * si + z * c + s.cz;
  return out;
}

const _q = { x: 0, y: 0, z: 0 };

/**
 * Haarpunkt unter einem Hut (Kopfraum, wird verändert): über der Bandebene in die Krone gedrückt (Ellipsoid mit den inneren Halbachsen),
 * darunter unverändert, dazwischen über `HAT_FIT.blend` weich. 4.6H: hat der Sitz eine Schürze (Helm), bleibt das Haar unter dem Band
 * innerhalb ihrer Fläche (waagrecht zur Kopfachse gedrückt). Gibt true zurück, wenn sich der Punkt bewegt hat.
 */
export function squeezeUnderHat(s: HatSeat, p: { x: number; y: number; z: number }): boolean {
  const crown = squeezeCrown(s, p);
  const skirt = s.skirt ? squeezeSkirt(s, s.skirt, p) : false;
  return crown || skirt;
}

/**
 * Haar unter der Schürze: liegt der Punkt (unter der Bandebene) weiter außen als die Helmfläche in seiner Richtung und Höhe, rückt er waagrecht
 * auf sie (zwischen Sektoren und Stufen gemischt; an Rändern der Öffnung und an der Unterkante weich auslaufend)
 */
function squeezeSkirt(s: HatSeat, k: HatSkirt, p: { x: number; y: number; z: number }): boolean {
  if (toSeat(s, p.x, p.y, p.z, _q).y >= 0) return false;
  const fy = (k.y0 - p.y) / k.dy;
  if (fy < 0 || fy > k.m - 1) return false;
  const dx = p.x - s.cx, dz = p.z - s.cz, rho = Math.hypot(dx, dz);
  if (rho < 1e-5) return false;
  const fs = ((Math.atan2(dx, -dz) / (Math.PI * 2)) * k.n + k.n) % k.n;
  const s0 = Math.floor(fs), ts = fs - s0, h0 = Math.floor(fy), th = fy - h0;
  let wsum = 0, rsum = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
    const r = k.r[Math.min(k.m - 1, h0 + b) * k.n + ((s0 + a) % k.n)];
    if (!Number.isFinite(r)) continue;
    const w = (a ? ts : 1 - ts) * (b ? th : 1 - th);
    wsum += w; rsum += w * r;
  }
  if (wsum <= 1e-4) return false;
  const lim = rsum / wsum;
  if (rho <= lim) return false;
  const nr = rho + (lim - rho) * Math.min(1, wsum);
  p.x = s.cx + (dx * nr) / rho; p.z = s.cz + (dz * nr) / rho;
  return true;
}

function squeezeCrown(s: HatSeat, p: { x: number; y: number; z: number }): boolean {
  const q = toSeat(s, p.x, p.y, p.z, _q);
  if (q.y <= -HAT_FIT.blend) return false;
  // innen: knapp unter Band und Krone (1,5 mm Luft)
  const A = s.a - 0.0015, B = s.b - 0.0015, H = s.h - 0.0015;
  const yy = Math.max(0, q.y);
  const e = Math.hypot(q.x / A, yy / H, q.z / B);
  if (e <= 1) return false;
  const k = q.y >= 0 ? 1 : smooth01((q.y + HAT_FIT.blend) / HAT_FIT.blend);
  // auf die Ellipsoid-Hülle zur Mitte hin (über der Ebene); unter der Ebene nur waagerecht nach innen
  const f = 1 / e;
  const nx = q.x * f, nz = q.z * f, ny = q.y >= 0 ? q.y * f : q.y;
  q.x += (nx - q.x) * k; q.y += (ny - q.y) * k; q.z += (nz - q.z) * k;
  fromSeat(s, q.x, q.y, q.z, p);
  return true;
}

function smooth01(t: number) { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); }

/**
 * 4.6H: Krone eines Sitzes in einen Helm oder Hut aus einem Modell einpassen: je Richtung über dem Band die innerste Fläche des Modells
 * (Punkte im Kopfraum, `pts` = x, y, z hintereinander); liegt sie innerhalb der Krone (a, h, b), schrumpft die Krone gleichmäßig, bis das
 * gedrückte Haar überall innen liegt (höchstens um 18 %). Richtungen ohne Modellfläche (offene Krone, Visier) zählen nicht.
 */
export function fitSeatInside(s: HatSeat, pts: ArrayLike<number>): HatSeat {
  const NA = 24, NE = 6;
  const minE = new Float32Array(NA * NE).fill(Infinity);
  const q = { x: 0, y: 0, z: 0 };
  for (let i = 0; i + 2 < pts.length; i += 3) {
    toSeat(s, pts[i], pts[i + 1], pts[i + 2], q);
    if (q.y < 0.004) continue;
    const nx = q.x / s.a, ny = q.y / s.h, nz = q.z / s.b;
    const e = Math.hypot(nx, ny, nz);
    if (e > 1.6) continue;
    const az = Math.atan2(nx, -nz), el = Math.atan2(ny, Math.hypot(nx, nz));
    const ai = Math.min(NA - 1, Math.floor(((az + Math.PI) / (Math.PI * 2)) * NA)), ei = Math.min(NE - 1, Math.floor((el / (Math.PI / 2)) * NE));
    const k = ei * NA + ai;
    if (e < minE[k]) minE[k] = e;
  }
  let k = 1;
  for (const e of minE) if (e < Infinity) k = Math.min(k, e * 0.985);
  if (k >= 1) return s;
  k = Math.max(0.82, k);
  // nie in den Schädel: das gedrückte Haar bleibt mindestens `SKULL_KEEP` über der Kopfhaut (sonst schiene unter offenen Krempen die Stirn durch)
  return { ...s, a: Math.max(s.a * k, s.sa + SKULL_KEEP), b: Math.max(s.b * k, s.sb + SKULL_KEEP), h: Math.max(s.h * k, s.sh + SKULL_KEEP), skirt: s.skirt };
}

/** 4.6H: so dick bleibt das Haar unter einem eingepassten Modell-Hut mindestens über der Kopfhaut (m) */
export const SKULL_KEEP = 0.004;

/** Höhe der Bandebene im Kopfraum an der Tiefe z (vorn höher, hinten tiefer) */
export function bandYAt(s: HatSeat, z: number): number { return s.y - Math.tan(s.tilt) * (z - s.cz); }
