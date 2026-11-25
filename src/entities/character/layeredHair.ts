// Phase 4.6H – die Frisur „Mehrlagig“, von Grund auf neu: prozedural um den gemessenen Schädel jeder Grundfigur gebaut.
//
// Bis 4.6G.3 war „Mehrlagig“ ein Blender-Modell, gebaut um die männliche Grundfigur und für die Frau starr umgerechnet: verdrehte Flächen,
// Lücken am Schädel und ein anderes Material als die Grundfrisur. Jetzt entsteht die Frisur im Spiel aus dem Schädel-Feld der jeweiligen
// Grundfigur (Kopfraum: y oben, Gesicht nach −Z):
//  - eine geschlossene, dunkle Haar-Basiskappe knapp über der Kopfhaut (vom Haaransatz bis zum Scheitel, ohne Lücke);
//  - weich gebogene, spitz zulaufende Strähnen-Körper (Linsen-Querschnitt, geschlossen, Normalen geprüft nach außen, `computeVertexNormals`),
//    die vom Scheitel an der Kopfform entlang fallen (Kollision mit Schädel, Nacken und Rücken);
//  - Mann: dynamisch gestufter, windzerzauster Schnitt mit vollem Pony über den Brauen, markanten Schläfensträhnen und zweistufigem Nackenhaar;
//  - Frau: gestufter Schnitt mit weich fallendem Pony, gesichtsrahmenden Seitensträhnen (Hime-Locks) und fließenden, mehrstufigen
//    Rückensträhnen an eigenen Federketten (`mane`, Gelenke auf der Bahn der Strähnen: `maneRest`) – sanfte Bewegung.
// Material: dasselbe Anime-Seidenglanz-Material wie die Grundfrisur (gleiche Instanz, gleiches Programm); die Texturkoordinaten zeigen auf
// deckende Streifen der Haartextur (`hairAtlas`), die Kappe auf ihre dunkelste Stelle.
// Rein: ohne Szene, ohne Zufall (fester Startwert); liefert Punktdaten im Kopfraum.
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

export type HairCutId = 'male' | 'female';

/** Kopf im Kopfraum (gemessen an der Grundfigur) */
export interface HeadShape {
  /** Hautradius um die senkrechte Achse durch (0, zc) bei Winkel th (0 = Gesicht, −Z; +π/2 = Seite +X) und Höhe y */
  r(th: number, y: number): number;
  zc: number;
  /** Scheitel, Augenhöhe, unterste Höhe des Felds (darunter gilt der Wert am Rand) */
  top: number;
  eyeY: number;
  y0: number;
  /** Rücken: hinterste Hautlage (z) bei Höhe y nahe der Wirbelsäule (Nacken, Schulterblätter); fehlt sie, gilt der Nacken */
  back?: (y: number) => number;
}

/** Deckende Streifen der Haartextur (u, v0 … v1) und die dunkelste deckende Stelle (für die Kappe) */
export interface HairAtlas { strips: { u: number; v0: number; v1: number }[]; dark: { u: number; v: number } }
export const DEFAULT_ATLAS: HairAtlas = { strips: [{ u: 0.5, v0: 0.35, v1: 0.65 }], dark: { u: 0.5, v: 0.5 } };

/** Abstimmung der Frisur (m) */
export const LAYERED = {
  /** Kappe: Abstand über der Haut, Ringe (Breite, Höhe) */
  capOff: 0.0045,
  capA: 48,
  capE: 14,
  /** Querschnitt der Strähnen (Punkte je Ring) */
  ring: 6,
  /** Schrittweite der Strähnenbahn */
  ds: 0.005,
  /** Spitze ragt über den letzten Ring hinaus */
  tip: 0.008,
  /** Abstand der Strähnen zur Haut mindestens (über der Kappe) */
  lay: 0.006,
  /** Neigung der Strähnen-Normalen zur Kopfwölbung (0 = rein geometrisch): weiche statt weißer Kanten im Randlicht */
  normalBend: 0.9,
  /** Rückensträhnen: Abstand zur Rückenhaut für Kragen, Mantel und Umhang (unter dem Nacken voll) */
  clothClear: 0.045,
} as const;

/** Eine Strähne */
export interface StrandSpec {
  /** Wurzel: Winkel um den Kopf (0 = Gesicht) und Erhebung (rad) über der Kopfmitte */
  az: number;
  el: number;
  /** Länge der Bahn (m), tiefste Spitze (m, Kopfraum; Pony auf Brauenhöhe) */
  len: number;
  tipY?: number;
  /** Breite, Dicke an der Wurzel (m), Abstand über der Kappe (Volumen) */
  w: number;
  th: number;
  lift: number;
  /** Anfangsrichtung: Aufrichten (0 = an der Kopfform, 1 = steil nach außen/oben), Trägheit der Richtung (0 … 0,95) */
  rise: number;
  stiff: number;
  /** Schwerkraft (Zug nach unten), seitliches Abdriften (Wind, Scheitel; + = Richtung wachsender Winkel), Abstehen der Spitze, Drall */
  grav: number;
  sweep: number;
  flare: number;
  twist: number;
  /** Ringe entlang der Strähne */
  seg: number;
  /** stumpfe Spitze (Hime-Lock): verjüngt erst im letzten Fünftel */
  blunt?: boolean;
  /** hängt an den Federketten der Rückensträhnen (`mane`, nur Frau) */
  chain?: boolean;
  /** Lenkung zum Gesicht hin (Schläfen, Hime-Locks): Zug nach −Z */
  face?: number;
}

/** Fester Zufall (Mulberry32) – gleiche Frisur bei jedem Start */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const D = Math.PI / 180;

/** Schnitt aus dem Kopf: Strähnen beider Schnitte (deterministisch), Längen relativ zur Augenhöhe */
export function cutStrands(cut: HairCutId, h: HeadShape): StrandSpec[] {
  const rnd = seeded(cut === 'male' ? 0x4d4c48 : 0x46454d);
  const R = (a: number, b: number) => a + (b - a) * rnd();
  const out: StrandSpec[] = [];
  const eye = h.eyeY;
  if (cut === 'male') {
    // Deckhaar: windzerzauste Stacheln vom Wirbel (leicht hinter dem Scheitel), nach außen aufgerichtet, Spitzen frei über dem Kopf
    for (let i = 0; i < 16; i++) {
      const az = (i / 16) * Math.PI * 2 + 0.2 + R(-0.12, 0.12);
      out.push({ az, el: R(62, 80) * D, len: R(0.085, 0.12), w: R(0.046, 0.056), th: 0.014, lift: R(0.004, 0.008), rise: R(0.36, 0.56), stiff: 0.84, grav: 0.5, sweep: 0.22 + R(-0.25, 0.25), flare: 0.3, twist: R(-0.5, 0.5), seg: 10 });
    }
    // zweite Lage zwischen den Stacheln, flacher, deckt die Kappe
    for (let i = 0; i < 12; i++) {
      const az = ((i + 0.5) / 12) * Math.PI * 2 + 0.2;
      out.push({ az, el: R(44, 56) * D, len: R(0.08, 0.11), w: 0.05, th: 0.013, lift: 0.003, rise: R(0.25, 0.4), stiff: 0.75, grav: 0.55, sweep: 0.18 + R(-0.15, 0.15), flare: 0.3, twist: R(-0.3, 0.3), seg: 9 });
    }
    // voller Pony über den Brauen: zwei Lagen, Spitzen auf Brauenhöhe, leicht zur Seite gekämmt
    for (let layer = 0; layer < 2; layer++) {
      const n = layer ? 6 : 7;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5 * layer) / 6 - 0.5;
        out.push({ az: u * 100 * D, el: (58 - layer * 5) * D, len: 0.14, tipY: eye + 0.016 + Math.abs(u) * 0.022 + R(-0.004, 0.004) + layer * 0.006, w: 0.046 - Math.abs(u) * 0.008, th: 0.012, lift: 0.004 + layer * 0.004, rise: 0.15, stiff: 0.55, grav: 0.85, sweep: 0.3, flare: 0.12, twist: 0.25, seg: 10, face: 0.18 });
      }
    }
    // markante Schläfensträhnen vor den Ohren bis zur Wange, zum Gesicht geschwungen
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
      out.push({ az: s * (64 + k * 12) * D, el: (40 - k * 4) * D, len: 0.17, tipY: eye - 0.045 - k * 0.012, w: 0.044 - k * 0.006, th: 0.012, lift: 0.005, rise: 0.12, stiff: 0.5, grav: 1, sweep: -s * 0.06, flare: 0.05, twist: s * 0.3, seg: 11, face: 0.3 });
    }
    // über den Ohren: Seitenlage
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      out.push({ az: s * (96 + k * 16) * D, el: R(34, 42) * D, len: 0.11, tipY: eye - 0.012, w: 0.05, th: 0.013, lift: 0.004, rise: 0.25, stiff: 0.6, grav: 0.9, sweep: s * 0.05, flare: 0.25, twist: s * 0.25, seg: 9 });
    }
    // Nacken, zweistufig: obere Lage kürzer, untere lang mit nach außen weisenden Spitzen
    for (let i = 0; i < 9; i++) {
      const az = (124 + (236 - 124) * (i / 8)) * D;
      out.push({ az, el: R(30, 38) * D, len: 0.16, tipY: eye - 0.07 + R(-0.008, 0.008), w: 0.05, th: 0.013, lift: 0.006, rise: 0.2, stiff: 0.55, grav: 1, sweep: R(-0.1, 0.1), flare: 0.4, twist: R(-0.3, 0.3), seg: 10 });
    }
    for (let i = 0; i < 9; i++) {
      const az = (118 + (242 - 118) * ((i + 0.5) / 9)) * D;
      out.push({ az, el: R(8, 16) * D, len: 0.2, tipY: eye - 0.135 + R(-0.01, 0.01), w: 0.046, th: 0.012, lift: 0.003, rise: 0.1, stiff: 0.45, grav: 1, sweep: R(-0.12, 0.12), flare: 0.55, twist: R(-0.3, 0.3), seg: 11 });
    }
  } else {
    // Deckhaar: glatt anliegend, fällt weich nach hinten und zur Seite
    for (let i = 0; i < 14; i++) {
      const az = (i / 14) * Math.PI * 2 + 0.1;
      out.push({ az, el: R(66, 80) * D, len: R(0.12, 0.16), w: 0.056, th: 0.013, lift: 0.003, rise: 0.12, stiff: 0.55, grav: 0.7, sweep: R(-0.08, 0.08), flare: 0.15, twist: R(-0.25, 0.25), seg: 10 });
    }
    // weich fallender Pony: Mitte etwas länger, Spitzen leicht nach innen
    for (let i = 0; i < 7; i++) {
      const u = i / 6 - 0.5;
      out.push({ az: u * 92 * D, el: 60 * D, len: 0.14, tipY: eye + 0.012 + Math.abs(u) * 0.03 + R(-0.003, 0.003), w: 0.048 - Math.abs(u) * 0.01, th: 0.011, lift: 0.004, rise: 0.1, stiff: 0.6, grav: 0.8, sweep: u * 0.12, flare: 0.05, twist: 0.15, seg: 10, face: 0.12 });
    }
    // Hime-Locks: gesichtsrahmende Seitensträhnen, gerade bis zum Kinn, stumpf geschnitten
    for (const s of [-1, 1]) {
      out.push({ az: s * 66 * D, el: 36 * D, len: 0.22, tipY: eye - 0.105, w: 0.05, th: 0.012, lift: 0.004, rise: 0.05, stiff: 0.4, grav: 1, sweep: 0, flare: 0.02, twist: 0, seg: 12, blunt: true, face: 0.25 });
      out.push({ az: s * 80 * D, el: 34 * D, len: 0.2, tipY: eye - 0.085, w: 0.036, th: 0.011, lift: 0.006, rise: 0.05, stiff: 0.4, grav: 1, sweep: 0, flare: 0.04, twist: s * 0.15, seg: 11, blunt: true, face: 0.18 });
    }
    // Seiten über den Ohren
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      out.push({ az: s * (98 + k * 14) * D, el: R(36, 44) * D, len: 0.16, tipY: eye - 0.06, w: 0.05, th: 0.012, lift: 0.004, rise: 0.1, stiff: 0.5, grav: 1, sweep: s * 0.04, flare: 0.12, twist: s * 0.2, seg: 11 });
    }
    // Rücken, drei Stufen: Nacken, Schulter, Rückenmitte – an den Haar-Federketten
    const tiers: [number, number, number, number][] = [[9, eye - 0.085, 34, 0.006], [9, eye - 0.25, 22, 0.004], [8, eye - 0.4, 12, 0.002]];
    tiers.forEach(([n, tipY, el, lift], t) => {
      for (let i = 0; i < n; i++) {
        const az = (126 + (234 - 126) * ((i + (t % 2) * 0.5) / n)) * D;
        out.push({ az, el: R(el - 3, el + 3) * D, len: 0.12 + t * 0.2, tipY: tipY + R(-0.012, 0.012), w: 0.054 - t * 0.003, th: 0.012, lift: lift + t * 0.003, rise: 0.06, stiff: 0.4, grav: 1, sweep: R(-0.06, 0.06), flare: 0.18 - t * 0.04, twist: R(-0.2, 0.2), seg: 11 + t * 4, chain: true });
      }
    });
  }
  return out;
}

// ---------- Kopf-Hilfen ----------

const thOf = (h: HeadShape, x: number, z: number) => Math.atan2(x, -(z - h.zc));
/** Haut-Radius in Richtung (x, z) auf Höhe y (unter dem Feld: Randwert, über dem Scheitel: 0) */
function skin(h: HeadShape, x: number, y: number, z: number): number {
  if (y > h.top) return 0;
  return h.r(thOf(h, x, z), Math.max(h.y0, y));
}

/** Mitte, von der aus Wurzeln gesetzt werden (etwa Ohrhöhe, Schädelmitte) */
const centerY = (h: HeadShape) => h.eyeY + 0.035;

/**
 * „Außen“ an einem Punkt (nicht normiert): über der Kopfmitte von ihr weg, darunter waagrecht von der Kopfachse weg. Hängendes Haar unter
 * dem Kopf hätte sonst eine Außenrichtung fast parallel zu seiner Bahn (nach unten) – die Querschnitte kippten (verdrehte, eingeschnürte
 * Strähnen im Nacken) und die Normalen zeigten nach unten.
 */
function outward(h: HeadShape, x: number, y: number, z: number, out: Vector3): Vector3 {
  return out.set(x, Math.max(0, y - centerY(h)), z - h.zc);
}

/**
 * Rücken zum Auflegen (Kopfraum): hinterste Haut von oben nach unten als laufendes Maximum – hängendes Haar folgt dem Rücken nur nach
 * hinten (über Schulterblätter), nie zurück in die Hohlkreuz-Kurve. Je Kopf einmal, 1 cm Schritt, dazwischen linear.
 */
const BACK_TOP = 0.08, BACK_LEN = 0.56, BACK_STEP = 0.01;
const drapeCache = new WeakMap<HeadShape, Float32Array>();
function drapeZ(h: HeadShape, y: number): number {
  const back = h.back!;
  let d = drapeCache.get(h);
  if (!d) {
    const n = Math.round(BACK_LEN / BACK_STEP) + 1;
    d = new Float32Array(n);
    let m = -Infinity;
    for (let i = 0; i < n; i++) { m = Math.max(m, back(h.eyeY - BACK_TOP - i * BACK_STEP)); d[i] = m; }
    drapeCache.set(h, d);
  }
  const f = Math.min(d.length - 1, Math.max(0, (h.eyeY - BACK_TOP - y) / BACK_STEP));
  const i0 = Math.min(d.length - 2, Math.floor(f));
  return d[i0] + (d[i0 + 1] - d[i0]) * (f - i0);
}

/** Punkt auf der Kopfhaut in Richtung (az, el) von der Mitte aus, plus Abstand `off` nach außen */
function surfacePoint(h: HeadShape, az: number, el: number, off: number, out: Vector3): Vector3 {
  const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = -Math.cos(az) * Math.cos(el);
  const cy = centerY(h);
  let t = 0.01;
  for (; t < 0.3; t += 0.0015) {
    const x = dx * t, y = cy + dy * t, z = h.zc + dz * t;
    if (y > h.top || Math.hypot(x, z - h.zc) > skin(h, x, y, z)) break;
  }
  return out.set(dx * (t + off), cy + dy * (t + off), h.zc + dz * (t + off));
}

/** Haaransatz je Winkel (Erhebung, rad): vorn an der Stirn, seitlich über den Ohren, hinten im Nacken */
export function hairlineEl(az: number): number {
  const f = (1 - Math.cos(az)) / 2;
  return (22 - 58 * Math.pow(f, 1.2)) * D;
}

// ---------- Bau ----------

export interface LayeredHairGeometry {
  /** Lage, Normale, UV, Dreiecke im Kopfraum */
  geo: BufferGeometry;
  /** je Punkt: 1 = hängt an den Federketten der Rückensträhnen */
  chain: Uint8Array;
  /** je Punkt: Wurzel-Winkel seiner Strähne um den Kopf (rad, 0 = Gesicht; Kappe 0) – wählt die Ketten, nicht die Lage des Punkts */
  strandAz: Float32Array;
  /** Strähnen (ohne Kappe) und Dreiecke */
  strands: number;
  tris: number;
  /** Punkte der Kappe: [0, capVerts) */
  capVerts: number;
}

const _p = new Vector3(), _d = new Vector3(), _t = new Vector3(), _n = new Vector3(), _b = new Vector3(), _v = new Vector3();

/** Bahn einer Strähne (Kopfraum), höchstens `max` Punkte, gleichmäßig nachgetastet auf seg + 1 Punkte */
function strandPath(h: HeadShape, s: StrandSpec): Vector3[] {
  const L = LAYERED;
  const cy = centerY(h);
  const root = surfacePoint(h, s.az, s.el, L.capOff + L.lay * 0.5 + s.lift, new Vector3());
  // Anfangsrichtung: am Meridian abwärts, mit `rise` nach außen-oben aufgerichtet
  const radial = new Vector3(root.x, root.y - cy, root.z - h.zc).normalize();
  const downM = new Vector3(Math.sin(s.az) * Math.sin(s.el), -Math.cos(s.el), -Math.cos(s.az) * Math.sin(s.el)).normalize();
  const up = new Vector3(radial.x, Math.max(0.35, radial.y) + 0.4, radial.z).normalize();
  const dir = downM.clone().multiplyScalar(1 - s.rise).addScaledVector(up, s.rise).normalize();
  const pts: Vector3[] = [root.clone()];
  const p = root.clone();
  let len = 0;
  const steps = Math.ceil(s.len / L.ds) + 2;
  for (let k = 0; k < steps && len < s.len; k++) {
    const sNorm = len / s.len;
    // Ziel-Richtung: an der Kopfform abwärts (Meridian), unter dem Haaransatz frei nach unten; Abdriften, Abstehen, Zug zum Gesicht
    const az = thOf(h, p.x, p.z);
    const hr = Math.hypot(p.x, p.z - h.zc);
    const el = Math.atan2(p.y - cy, hr);
    const under = Math.max(0, Math.min(1, (hairlineEl(az) - el) / (25 * D)));
    _d.set(Math.sin(az) * Math.sin(el), -Math.cos(el), -Math.cos(az) * Math.sin(el)).multiplyScalar(1 - under);
    _d.y -= under;
    _d.multiplyScalar(s.grav);
    // Abdriften: tangential um den Kopf
    _t.set(Math.cos(az), 0, Math.sin(az)).multiplyScalar(s.sweep * (0.4 + sNorm));
    _d.add(_t);
    // Abstehen der Spitze: waagrecht nach außen
    if (hr > 1e-4) _d.x += (p.x / hr) * s.flare * sNorm * sNorm, _d.z += ((p.z - h.zc) / hr) * s.flare * sNorm * sNorm;
    if (s.face) _d.z -= s.face * (0.3 + sNorm);
    if (_d.lengthSq() < 1e-8) _d.set(0, -1, 0);
    _d.normalize();
    dir.multiplyScalar(s.stiff).addScaledVector(_d, 1 - s.stiff).normalize();
    p.addScaledVector(dir, L.ds);
    // Kollision: nie in Schädel, Nacken oder Rücken (Abstand wächst mit der Lage)
    const need = skin(h, p.x, p.y, p.z) + L.capOff + L.lay * (0.6 + 0.4 * sNorm) + s.lift * (1 - sNorm * 0.5);
    const hr2 = Math.hypot(p.x, p.z - h.zc);
    if (p.y <= h.top + 0.002 && hr2 < need) {
      const k2 = hr2 > 1e-5 ? need / hr2 : 1;
      if (hr2 > 1e-5) { p.x *= k2; p.z = h.zc + (p.z - h.zc) * k2; } else p.z = h.zc + need;
    }
    if (h.back && p.y < h.eyeY - 0.1 && p.z > h.zc) {
      // über Kragen, Mantel und Umhang (nicht auf der Haut): Abstand wächst vom Nacken bis zu den Schultern; liegt die Strähne auf, folgt
      // ihre Richtung dem Rücken (weicher Bogen statt Knick)
      const bzAt = (y: number) => drapeZ(h, y) + L.lay + s.lift + L.clothClear * Math.min(1, Math.max(0, (h.eyeY - 0.1 - y) / 0.07));
      const bz = bzAt(p.y);
      if (p.z < bz) {
        p.z = bz;
        const tz = (bzAt(p.y - L.ds) - bz) / L.ds;
        if (dir.z < tz) { dir.z = tz; dir.normalize(); }
      }
    }
    pts.push(p.clone());
    len += L.ds;
    if (s.tipY !== undefined && p.y <= s.tipY) break;
  }
  return resample(pts, s.seg);
}

function resample(ps: Vector3[], n: number): Vector3[] {
  if (ps.length < 2) return [ps[0].clone(), ps[0].clone().add(new Vector3(0, -0.01, 0))];
  const acc = [0];
  for (let i = 1; i < ps.length; i++) acc.push(acc[i - 1] + ps[i].distanceTo(ps[i - 1]));
  const total = acc[acc.length - 1] || 1e-6;
  const out: Vector3[] = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const t = (total * k) / n;
    while (j < acc.length - 2 && acc[j + 1] < t) j++;
    const f = Math.min(1, Math.max(0, (t - acc[j]) / Math.max(1e-9, acc[j + 1] - acc[j])));
    out.push(ps[j].clone().lerp(ps[j + 1], f));
  }
  return out;
}

/**
 * Frisur bauen: Kappe und Strähnen im Kopfraum. `atlas` wählt die Texturkoordinaten (deckende Streifen der Haartextur, dunkle Stelle für die
 * Kappe). Normalen: je Strähne der Umlaufsinn geprüft (Flächen zeigen von der Strähnen-Achse weg), danach `computeVertexNormals`.
 */
export function buildLayeredHair(cut: HairCutId, h: HeadShape, atlas: HairAtlas = DEFAULT_ATLAS): LayeredHairGeometry {
  const L = LAYERED;
  const P: number[] = [], UV: number[] = [], I: number[] = [], CH: number[] = [], AZ: number[] = [];
  // ---------- Kappe: Gitter vom Haaransatz bis kurz unter den Scheitel, oben ein Fächer zum Scheitelpunkt ----------
  const A = L.capA, E = L.capE;
  const cu = atlas.dark.u, cv = atlas.dark.v;
  for (let i = 0; i <= E; i++) for (let j = 0; j < A; j++) {
    const az = (j / A) * Math.PI * 2;
    const e0 = hairlineEl(az) - 6 * D;
    const el = e0 + (88 * D - e0) * (i / E);
    surfacePoint(h, az, el, L.capOff, _p);
    P.push(_p.x, _p.y, _p.z);
    UV.push(cu + (j / A) * 0.004, cv + (i / E) * 0.004);
    CH.push(0); AZ.push(0);
  }
  const apex = P.length / 3;
  surfacePoint(h, 0, 90 * D, L.capOff, _p);
  P.push(_p.x, _p.y, _p.z); UV.push(cu, cv); CH.push(0); AZ.push(0);
  const capStart = I.length;
  for (let i = 0; i < E; i++) for (let j = 0; j < A; j++) {
    const a = i * A + j, b = i * A + ((j + 1) % A), c = (i + 1) * A + ((j + 1) % A), d = (i + 1) * A + j;
    I.push(a, b, c, a, c, d);
  }
  for (let j = 0; j < A; j++) I.push(E * A + j, E * A + ((j + 1) % A), apex);
  orient(P, I, capStart, I.length, (cx, cy, cz, out) => out.set(cx, cy - centerY(h), cz - h.zc));
  const capVerts = P.length / 3;
  // ---------- Strähnen ----------
  const specs = cutStrands(cut, h);
  const R = L.ring;
  specs.forEach((s, si) => {
    const ps = strandPath(h, s);
    const n = ps.length - 1;
    const strip = atlas.strips[si % atlas.strips.length];
    const base = P.length / 3;
    for (let i = 0; i <= n; i++) {
      const p = ps[i];
      _t.copy(ps[Math.min(n, i + 1)]).sub(ps[Math.max(0, i - 1)]).normalize();
      // außen = weg von der Kopfmitte (unter ihr: weg von der Kopfachse), senkrecht zur Bahn
      outward(h, p.x, i === 0 ? centerY(h) : p.y, p.z, _n);
      _n.addScaledVector(_t, -_n.dot(_t));
      if (_n.lengthSq() < 1e-10) _n.set(0, 0, 1);
      _n.normalize();
      _b.crossVectors(_t, _n).normalize();
      const sN = i / n;
      const k = s.blunt ? Math.min(1, (1 - sN) * 5) ** 0.6 * Math.min(1, 0.6 + sN * 5) : Math.pow(1 - sN, 0.75) * Math.min(1, 0.55 + sN * 5);
      const ww = s.w * 0.5 * Math.max(0.04, k), tt = s.th * 0.5 * Math.max(0.25, k);
      for (let q = 0; q < R; q++) {
        const a = (2 * Math.PI * q) / R + s.twist * sN;
        const up = Math.sin(a);
        _v.copy(p).addScaledVector(_b, ww * Math.cos(a)).addScaledVector(_n, tt * (up > 0 ? up : up * 0.55));
        P.push(_v.x, _v.y, _v.z);
        UV.push(strip.u + (q / R) * 0.006, strip.v0 + (strip.v1 - strip.v0) * sN);
        CH.push(s.chain ? 1 : 0); AZ.push(s.az);
      }
    }
    const tipI = P.length / 3;
    _t.copy(ps[n]).sub(ps[n - 1]).normalize();
    _v.copy(ps[n]).addScaledVector(_t, s.blunt ? L.tip * 0.25 : L.tip);
    P.push(_v.x, _v.y, _v.z); UV.push(strip.u + 0.003, strip.v1); CH.push(s.chain ? 1 : 0); AZ.push(s.az);
    const rootI = P.length / 3;
    P.push(ps[0].x, ps[0].y, ps[0].z); UV.push(strip.u + 0.003, strip.v0); CH.push(s.chain ? 1 : 0); AZ.push(s.az);
    const t0 = I.length;
    for (let i = 0; i < n; i++) for (let q = 0; q < R; q++) {
      const q2 = (q + 1) % R;
      const a = base + i * R + q, b = base + i * R + q2, c = base + (i + 1) * R + q2, d = base + (i + 1) * R + q;
      I.push(a, b, c, a, c, d);
    }
    for (let q = 0; q < R; q++) I.push(base + n * R + q, base + n * R + ((q + 1) % R), tipI);
    for (let q = 0; q < R; q++) I.push(base + ((q + 1) % R), base + q, rootI);
    // Umlaufsinn: Flächen zeigen von der Bahn der Strähne weg (Mittelpunkt des nächsten Bahnpunkts)
    orient(P, I, t0, I.length, (cx, cy, cz, out) => { const k2 = nearestOnPath(ps, cx, cy, cz); return out.set(cx - k2.x, cy - k2.y, cz - k2.z); });
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(UV), 2));
  geo.setIndex(new BufferAttribute(P.length / 3 > 65535 ? new Uint32Array(I) : new Uint16Array(I), 1));
  geo.computeVertexNormals();
  // Normalen leicht zur Kopfwölbung neigen (weg von der Kopfmitte): die Strähnen bleiben rund, aber ihre Ränder leuchten nicht mehr als
  // weiße Kanten im Randlicht auf – das Haar wirkt wie eine zusammenhängende Seidenfläche (wie die Grundfrisur)
  const nor = geo.attributes.normal as BufferAttribute, pos = geo.attributes.position as BufferAttribute;
  const cy = centerY(h);
  for (let i = 0; i < nor.count; i++) {
    if (i < capVerts) _v.set(pos.getX(i), pos.getY(i) - cy, pos.getZ(i) - h.zc).normalize();
    else outward(h, pos.getX(i), pos.getY(i), pos.getZ(i), _v).normalize();
    _n.set(nor.getX(i), nor.getY(i), nor.getZ(i)).addScaledVector(_v, i < capVerts ? 0 : L.normalBend).normalize();
    nor.setXYZ(i, _n.x, _n.y, _n.z);
  }
  geo.computeBoundingSphere();
  return { geo, chain: Uint8Array.from(CH), strandAz: Float32Array.from(AZ), strands: specs.length, tris: I.length / 3, capVerts };
}

/** Lage der Federketten der Rückensträhnen (Grad-Spanne, Wurzel unter den Augen) */
export interface ManeLayout { chains: number; links: number; az0: number; az1: number; root: number }

/**
 * 4.6H: Ruhelage der Federketten `mane` für die Rückensträhnen der Frau (Kopfraum, Kette für Kette von der Wurzel zur Spitze, x y z
 * hintereinander): je Kette die nach dem Winkel gewichtete mittlere Bahn der Rückensträhnen in ihrer Nähe, auf `links + 1` gleich verteilten
 * Höhen von der Wurzel im Nacken bis zur tiefsten Spitze. So liegen die Gelenke im Haar (kein Hebel: die Strähnen schwingen um den Nacken,
 * nicht um einen Punkt neben dem Kopf). null, wenn keine Strähne tief genug reicht.
 */
export function maneRest(h: HeadShape, m: ManeLayout): Float32Array | null {
  const specs = cutStrands('female', h).filter((s) => s.chain);
  const paths = specs.map((s) => strandPath(h, s));
  const y0 = h.eyeY + m.root;
  if (!specs.length) return null;
  const C = m.chains, Lk = m.links;
  const out = new Float32Array(C * (Lk + 1) * 3);
  const step = C > 1 ? (m.az1 - m.az0) / (C - 1) : 0;
  const sig = Math.max(8, step * 0.6) * D;
  const near = (k: number, az: number) => { const d = Math.atan2(Math.sin(specs[k].az - az), Math.cos(specs[k].az - az)); return Math.exp(-(d * d) / (2 * sig * sig)); };
  for (let c = 0; c < C; c++) {
    const az = (m.az0 + step * c) * D;
    // Spitze dieser Kette: tiefste Spitze der Strähnen in ihrer Nähe (innerhalb von 1,5 σ)
    let tip = Infinity;
    for (let k = 0; k < specs.length; k++) if (near(k, az) > 0.32) tip = Math.min(tip, paths[k][paths[k].length - 1].y);
    if (!(tip < y0 - 0.06)) return null;
    let px = Math.sin(az) * 0.08, pz = h.zc - Math.cos(az) * 0.08;
    for (let i = 0; i <= Lk; i++) {
      const y = y0 + (tip - y0) * (i / Lk);
      let sx = 0, sz = 0, sw = 0;
      for (let k = 0; k < specs.length; k++) {
        const p = atHeight(paths[k], y);
        if (!p) continue;
        const w = near(k, az);
        sx += p.x * w; sz += p.z * w; sw += w;
      }
      // nur nahe Strähnen zählen; reicht keine so tief, geht die Kette senkrecht unter dem letzten Punkt weiter
      if (sw > 0.25) { px = sx / sw; pz = sz / sw; }
      const o = (c * (Lk + 1) + i) * 3;
      out[o] = px; out[o + 1] = y; out[o + 2] = pz;
    }
  }
  return out;
}

const _h = new Vector3();
/** Punkt einer Bahn auf Höhe y (erste Kreuzung von der Wurzel aus), null, wenn sie diese Höhe nicht erreicht */
function atHeight(ps: Vector3[], y: number): Vector3 | null {
  for (let j = 0; j < ps.length - 1; j++) {
    const a = ps[j], b = ps[j + 1];
    if ((a.y - y) * (b.y - y) > 0) continue;
    const f = Math.abs(b.y - a.y) < 1e-9 ? 0 : (a.y - y) / (a.y - b.y);
    return _h.copy(a).lerp(b, f);
  }
  return null;
}

const _q = new Vector3();
function nearestOnPath(ps: Vector3[], x: number, y: number, z: number): Vector3 {
  let bd = Infinity;
  _v.set(x, y, z);
  for (let i = 0; i < ps.length - 1; i++) {
    const a = ps[i], b = ps[i + 1];
    _b.subVectors(b, a);
    const l2 = _b.lengthSq() || 1e-12;
    const t = Math.max(0, Math.min(1, _n.subVectors(_v, a).dot(_b) / l2));
    _t.copy(a).addScaledVector(_b, t);
    const d = _t.distanceToSquared(_v);
    if (d < bd) { bd = d; _q.copy(_t); }
  }
  return _q;
}

/**
 * Umlaufsinn eines Dreiecksbereichs [t0, t1) prüfen: zeigt die Mehrheit der Flächen-Normalen entgegen der Richtung „außen“ (`outward`), werden
 * alle Dreiecke umgedreht. So zeigen die Normalen nach `computeVertexNormals` nach außen.
 */
function orient(P: number[], I: number[], t0: number, t1: number, outward: (cx: number, cy: number, cz: number, out: Vector3) => Vector3) {
  let agree = 0, total = 0;
  const o = new Vector3(), e1 = new Vector3(), e2 = new Vector3();
  for (let t = t0; t < t1; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    e1.set(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]);
    e2.set(P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]);
    e1.cross(e2);
    if (e1.lengthSq() < 1e-16) continue;
    outward((P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3, o);
    total++;
    if (e1.dot(o) > 0) agree++;
  }
  if (total && agree < total / 2) for (let t = t0; t < t1; t += 3) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; }
}

/**
 * Deckende Streifen einer Haartextur: Spalten, in denen ein langer Lauf voll deckender Texel liegt (Alpha ≥ 0,94), und die dunkelste deckende
 * Stelle (Kappe). `img` = Bilddaten (RGBA). Ohne brauchbare Streifen die Bildmitte.
 */
export function hairAtlas(img: { width: number; height: number; data: ArrayLike<number> } | null): HairAtlas {
  if (!img || img.width < 8 || img.height < 8) return DEFAULT_ATLAS;
  const W = img.width, H = img.height, a = img.data;
  const strips: { u: number; v0: number; v1: number; len: number }[] = [];
  const cols = 48;
  for (let c = 0; c < cols; c++) {
    const x = Math.min(W - 1, Math.round(((c + 0.5) / cols) * W));
    let best = 0, bestS = 0, run = 0, start = 0;
    for (let y = 0; y < H; y++) {
      const ok = a[(y * W + x) * 4 + 3] >= 240;
      if (ok) { if (!run) start = y; run++; if (run > best) { best = run; bestS = start; } } else run = 0;
    }
    if (best / H > 0.08) strips.push({ u: (x + 0.5) / W, v0: (bestS + best * 0.1) / H, v1: (bestS + best * 0.9) / H, len: best });
  }
  strips.sort((p, q) => q.len - p.len);
  const top = strips.slice(0, 16).map((s) => ({ u: s.u, v0: s.v0, v1: Math.min(s.v1, s.v0 + 0.35) }));
  // dunkelste deckende Zelle (Kappe)
  let dark = DEFAULT_ATLAS.dark, dl = Infinity;
  const G = 24;
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    let sum = 0, n = 0, opaque = true;
    for (let k = 0; k < 9 && opaque; k++) {
      const x = Math.min(W - 1, Math.floor(((gx + 0.2 + (k % 3) * 0.3) / G) * W)), y = Math.min(H - 1, Math.floor(((gy + 0.2 + Math.floor(k / 3) * 0.3) / G) * H));
      const o = (y * W + x) * 4;
      if (a[o + 3] < 245) opaque = false;
      sum += a[o] + a[o + 1] + a[o + 2]; n++;
    }
    if (opaque && n && sum / n < dl) { dl = sum / n; dark = { u: (gx + 0.5) / G, v: (gy + 0.5) / G }; }
  }
  return { strips: top.length ? top : DEFAULT_ATLAS.strips, dark };
}
