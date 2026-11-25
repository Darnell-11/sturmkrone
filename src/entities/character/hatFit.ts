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
}

/**
 * Sitz aus dem Schädel: r(θ, y) = Abstand der Kopfhaut zur senkrechten Achse durch (0, zc) (θ = 0 vorn, π/2 = Seite +X, π = hinten),
 * top = Scheitel, eyeY = Augenhöhe.
 */
export function seatFromSkull(r: (th: number, y: number) => number, zc: number, top: number, eyeY: number, hat: SeatedHat): HatSeat {
  const st = HAT_SEAT_STYLE[hat];
  const yF = eyeY + HAT_FIT.front - st.drop, yB = eyeY + HAT_FIT.back - st.drop;
  const zF = zc - r(0, yF), zB = zc + r(Math.PI, yB);
  const y = (yF + yB) / 2, cz = (zF + zB) / 2;
  const tilt = Math.atan2(yF - yB, zB - zF);
  const sa = Math.max(r(Math.PI / 2, y), r(-Math.PI / 2, y));
  const sb = (zB - zF) / 2;
  const sh = top - y;
  const pad = HAT_FIT.pad + st.ease;
  return { cx: 0, y, cz, tilt, a: sa + pad, b: sb + pad, h: sh + HAT_FIT.crownPad, sa, sb, sh };
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
 * darunter unverändert, dazwischen über `HAT_FIT.blend` weich. Gibt true zurück, wenn sich der Punkt bewegt hat.
 */
export function squeezeUnderHat(s: HatSeat, p: { x: number; y: number; z: number }): boolean {
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

/** Höhe der Bandebene im Kopfraum an der Tiefe z (vorn höher, hinten tiefer) */
export function bandYAt(s: HatSeat, z: number): number { return s.y - Math.tan(s.tilt) * (z - s.cz); }
