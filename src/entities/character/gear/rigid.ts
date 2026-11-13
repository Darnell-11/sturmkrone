// Starre Ausrüstungsteile: Schulterpanzer, Gürteltaschen, Helme. Jedes Teil ist eine kleine Funktion, die aus Farben ein
// Netz baut. Die Figur hängt sie an Haut-Anker (Schultern), Sockets (Gürtel) oder die gemessene Kappe um die Frisur (Helme).
//
// Rahmen der Schulterteile: x zeigt von der Halsmitte nach außen, y nach oben, z nach vorn. Der Aufrufer stellt die
// Gruppe an die Schulter und spiegelt sie für die andere Seite.
import { CylinderGeometry, Group, type Material } from 'three';
import type { CapShell } from '../vroid';
import type { Finish } from '../../../data/equipment';
import { Bag, ball, box, cone, cyl, dome, finishMat, gem, glowMat, plate, ring, rng, shade, smoothOutline, tube, xf } from './kit';

/** Eine Schulterseite: Hauptfarbe und Zierfarbe */
export type ShoulderBuilder = (c: string, c2: string) => Group;

const PI = Math.PI;

/**
 * Wölbung über dem Schultergelenk: eine kleine Kuppel und darunter n gewölbte Bänder (Lamellen), jedes weiter außen und
 * tiefer und stärker geneigt – wie dachziegelartig übereinanderliegende Platten. Unter jedem Band eine Zierkante.
 */
function lames(bag: Bag, steel: Material, trim: Material, n: number, size = 1, rivets = false) {
  const S = size;
  bag.add(dome(0.054 * S, 0.042 * S, 0.072 * S, 0, PI * 0.5, 0, PI * 2, 22), steel, { p: [0.012 * S, 0.012 * S, 0], r: [0, 0, -0.18] });
  const th0 = 0.42, th1 = 1.3;
  for (let i = 0; i < n; i++) {
    const k = i + 1;
    const rx = (0.066 + 0.006 * i) * S, ry = 0.056 * S, rz = (0.086 - 0.002 * i) * S;
    const cx = (0.016 + 0.022 * k) * S, cy = (0.012 - 0.014 * k) * S, tilt = -(0.22 + 0.2 * k);
    bag.add(xf(dome(rx, ry, rz, th0, th1, 0, PI * 2, 24), { r: [0, 0, tilt] }, { p: [cx, cy, 0] }), steel);
    // Zierkante am unteren Rand des Bandes
    bag.add(xf(ring(1, 0.0048 * S, 32), { s: [rx * Math.sin(th1), rz * Math.sin(th1), 1] }, { r: [PI / 2, 0, 0] }, { p: [0, ry * Math.cos(th1), 0] }, { r: [0, 0, tilt] }, { p: [cx, cy, 0] }), trim);
    if (rivets) for (const z of [-0.55, -0.2, 0.2, 0.55]) bag.add(xf(ball(0.0055 * S, 6), { p: [rx * Math.sin(0.8), ry * Math.cos(0.8), z * rz * Math.sin(0.8)] }, { r: [0, 0, tilt] }, { p: [cx, cy, 0] }), trim);
  }
  // Zierkante um die Kuppel
  bag.add(xf(ring(1, 0.0052 * S, 30), { s: [0.054 * S, 0.072 * S, 1] }, { r: [PI / 2, 0, 0] }, { r: [0, 0, -0.18] }, { p: [0.012 * S, 0.012 * S, 0] }), trim);
}

export const SHOULDERS: Record<string, ShoulderBuilder> = {
  /** Lederne Schulterklappen mit Nieten */
  schulter_leder(c, c2) {
    const bag = new Bag();
    const leather = finishMat('leder', c), dark = finishMat('leder', shade(c, -0.25)), brass = finishMat('gold', c2);
    for (let i = 0; i < 2; i++) {
      const rx = 0.062 + 0.01 * i, ry = 0.04 - 0.004 * i, rz = 0.082 - 0.006 * i;
      bag.add(dome(rx, ry, rz, 0, PI * 0.5, 0, PI * 2, 18), i ? dark : leather, { p: [0.014 + 0.026 * i, 0.003 - 0.018 * i, 0], r: [0, 0, -(0.3 + 0.24 * i)] });
    }
    for (const z of [-0.045, 0, 0.045]) bag.add(ball(0.0058, 6), brass, { p: [0.05 - Math.abs(z) * 0.18, 0.02 - Math.abs(z) * 0.12, z] });
    bag.add(ring(1, 0.004, 26), brass, { p: [0.014, 0.003, 0], r: [PI / 2, 0, -0.3], s: [0.062, 0.082, 1] });
    return bag.build();
  },

  /** Geschichtete Stahlplatten mit goldener Kante */
  schulter_platte(c, c2) {
    const bag = new Bag();
    lames(bag, finishMat('stahl', c), finishMat('gold', c2), 3, 1);
    bag.add(ball(0.009, 8), finishMat('gold', c2), { p: [0.03, 0.045, 0] });
    return bag.build();
  },

  /** Schwere Platten mit Stacheln */
  schulter_stachel(c, c2) {
    const bag = new Bag();
    const steel = finishMat('dunkelstahl', c), trim = finishMat('gold', c2);
    lames(bag, steel, trim, 2, 1.06, true);
    const spikes: [number, number, number, number][] = [[0.03, 0.05, 0, 0.07], [0.052, 0.036, 0.04, 0.05], [0.052, 0.036, -0.04, 0.05], [0.072, 0.02, 0, 0.04]];
    for (const [x, y, z, h] of spikes) bag.add(cone(0.011, h, 8), trim, { p: [x, y + h / 2, z], r: [z * 3, 0, -0.35] });
    return bag.build();
  },

  /** Goldene Schulterstücke mit Fransen, Marine-Pracht */
  schulter_gold(c, c2) {
    const bag = new Bag();
    const gold = finishMat('gold', c2), cloth = finishMat('stoff', c);
    bag.add(dome(0.058, 0.03, 0.07, 0, PI * 0.5, 0, PI * 2, 18), cloth, { p: [0.02, 0.006, 0], r: [0, 0, -0.35] });
    bag.add(cyl(0.05, 0.05, 0.007, 22), gold, { p: [0.026, 0.026, 0], r: [0, 0, -0.35] });
    bag.add(ring(1, 0.005, 26), gold, { p: [0.02, 0.01, 0], r: [PI / 2, 0, -0.35], s: [0.058, 0.07, 1] });
    for (let k = 0; k < 9; k++) {
      const a = (k / 8 - 0.5) * 1.9;
      bag.add(cyl(0.0032, 0.0032, 0.042, 5), gold, { p: [0.07 + Math.abs(a) * 0.004, -0.02, Math.sin(a) * 0.045], r: [0, 0, 0.12] });
    }
    bag.add(ball(0.012, 8), gold, { p: [0.026, 0.034, 0] });
    return bag.build();
  },

  /** Pelzumhang über der Schulter */
  schulter_fell(c, c2) {
    const bag = new Bag();
    const fur = finishMat('stoff', c, { rim: 1.1 }), tip = finishMat('stoff', shade(c, 0.35), { rim: 1.1 });
    const r = rng(7);
    bag.add(dome(0.072, 0.045, 0.092, 0, PI * 0.55, 0, PI * 2, 14), fur, { p: [0.022, 0, 0], r: [0, 0, -0.35] });
    for (let i = 0; i < 26; i++) {
      const a = r() * PI * 2, u = r();
      const x = 0.022 + Math.cos(a) * 0.07 * (0.35 + u * 0.7), z = Math.sin(a) * 0.09 * (0.35 + u * 0.7);
      const y = 0.012 + (1 - u) * 0.03 - Math.max(0, x - 0.05) * 0.5;
      bag.add(cone(0.014 + r() * 0.008, 0.045 + r() * 0.03, 5), r() > 0.6 ? tip : fur, { p: [x, y, z], r: [z * 2.2, 0, -(0.4 + x * 4)] });
    }
    bag.add(ring(1, 0.0045, 20), finishMat('gold', c2), { p: [0.02, 0, 0], r: [PI / 2, 0, -0.35], s: [0.07, 0.09, 1] });
    return bag.build();
  },

  /** Leuchtende Kristallsplitter auf einer Stahlschale */
  schulter_kristall(c, c2) {
    const bag = new Bag();
    const steel = finishMat('dunkelstahl', c), gold = finishMat('gold', c2), glow = glowMat(c2, 2.4);
    lames(bag, steel, gold, 2, 1);
    const shards: [number, number, number, number, number][] = [[0.03, 0.04, 0, 0.1, 0.1], [0.055, 0.03, 0.045, 0.075, 0.45], [0.055, 0.03, -0.045, 0.075, -0.45], [0.078, 0.008, 0.015, 0.055, 0.2]];
    for (const [x, y, z, h, tilt] of shards) bag.add(gem(0.017), glow, { p: [x, y + h / 2, z], r: [tilt, 0, -0.3 - Math.abs(tilt) * 0.3], s: [0.8, h / 0.034, 0.8] });
    return bag.build();
  },

  /** Platte mit aufragendem Federflügel */
  schulter_fluegel(c, c2) {
    const bag = new Bag();
    const steel = finishMat('stahl', c), gold = finishMat('gold', c2);
    lames(bag, steel, gold, 2, 1);
    for (let i = 0; i < 5; i++) {
      const k = i / 4;
      const len = 0.17 - k * 0.07, w = 0.021 - k * 0.003;
      // schmale Feder: Spitze oben, leicht nach hinten und außen gelehnt
      const outline = smoothOutline([[0, 0], [w, len * 0.35], [w * 0.7, len * 0.85], [0, len], [-w * 0.7, len * 0.85], [-w, len * 0.35]], 2);
      bag.add(plate(outline, 0.004, 0.001), i % 2 ? gold : steel, { p: [0.02 + k * 0.03, 0.03, 0.04 - k * 0.075], r: [0.2 + k * 0.35, 0, -0.45 - k * 0.5] });
    }
    return bag.build();
  },

  /** Drachenschulter: schwere Schale mit Kammfinne und Hörnern */
  schulter_drache(c, c2) {
    const bag = new Bag();
    const steel = finishMat('dunkelstahl', c), gold = finishMat('gold', c2), glow = glowMat(c2, 2);
    lames(bag, steel, gold, 3, 1.12, true);
    const fin = smoothOutline([[0, 0], [0.012, 0.07], [0.035, 0.125], [0.02, 0.1], [0.06, 0.17], [0.045, 0.09], [0.075, 0.04], [0.07, 0]], 2);
    bag.add(plate(fin, 0.008, 0.002), steel, { p: [0.01, 0.045, 0], r: [0, PI / 2, 0], s: 1.1 });
    bag.add(tube([[0.06, 0.03, 0.05], [0.09, 0.06, 0.07], [0.11, 0.11, 0.06]], 0.011, 14, 6, true), gold);
    bag.add(tube([[0.06, 0.03, -0.05], [0.09, 0.06, -0.07], [0.11, 0.11, -0.06]], 0.011, 14, 6, true), gold);
    bag.add(gem(0.012), glow, { p: [0.048, 0.034, 0], s: [1, 1.3, 1] });
    return bag.build();
  },
};

export const SHOULDER_KINDS = Object.keys(SHOULDERS);

// ---------- Gürtel ----------

/** Rahmen: Hüftsocket (Meter, +Z vorn, +X links). Taschen, Beutel, Scheiden sitzen starr an der Hüfte. */
export function buildBeltExtras(kind: string, c: string, c2: string): Group {
  const bag = new Bag();
  const leather = finishMat('leder', c), dark = finishMat('leder', shade(c, -0.3)), brass = finishMat('gold', c2);
  switch (kind) {
    case 'guertel_taschen':
      for (const s of [-1, 1]) {
        bag.add(box(0.07, 0.07, 0.04), leather, { p: [s * 0.17, -0.045, 0.045], r: [0, s * -0.3, s * 0.08] });
        bag.add(box(0.072, 0.03, 0.044), dark, { p: [s * 0.17, -0.014, 0.047], r: [0, s * -0.3, s * 0.08] });
        bag.add(ball(0.007, 6), brass, { p: [s * 0.172, -0.026, 0.07] });
      }
      bag.add(box(0.095, 0.045, 0.035), leather, { p: [0, -0.01, -0.13] });
      bag.add(box(0.098, 0.016, 0.038), dark, { p: [0, 0.008, -0.13] });
      break;
    case 'guertel_ketten':
      for (let i = 0; i < 4; i++) bag.add(ring(0.045 + i * 0.002, 0.0035, 18, PI * 0.9), brass, { p: [0.06, -0.01 - i * 0.012, 0.14 - i * 0.012], r: [PI * 0.5, 0.5, 0.5] });
      bag.add(ball(0.014, 8), brass, { p: [0.19, -0.02, 0.02] });
      break;
    case 'guertel_schwerttasche':
      bag.add(cyl(0.018, 0.012, 0.15, 8), dark, { p: [-0.18, -0.09, 0.02], r: [0, 0, 0.5] });
      bag.add(cyl(0.02, 0.02, 0.02, 8), brass, { p: [-0.172, -0.012, 0.02], r: [0, 0, 0.5] });
      break;
  }
  return bag.build();
}
export const BELT_KINDS = ['guertel_taschen', 'guertel_ketten', 'guertel_schwerttasche'];

// ---------- Helme ----------
// Rahmen: Kopfraum der Figur. y nach oben, das Gesicht schaut nach −Z, hinten ist +Z. sh = um die Frisur gemessene Kappe.

/** Halbmesser des Schädels samt Helmpolster (m, Kopfraum) und Höhe der Kuppel über dem Rand */
export const HEAD_R = 0.116;
export const HELM_RISE = 0.12;

export interface HelmCtx { sh: CapShell; topY: number; c: string; c2: string }

/** Zeichnet die Teile des Helms außer der Kappe selbst, die der Aufrufer aus sh.geo anlegt */
export type HelmBuilder = (h: HelmCtx) => { bag: Bag; cap: { finish: Finish; color?: string } };

const side = (f: (s: number) => void) => { f(-1); f(1); };

export const HELMS: Record<string, HelmBuilder> = {
  /** Eisenkappe mit Nasenschutz und Nackenlamellen */
  helm_kappe({ sh, c, c2 }) {
    const bag = new Bag();
    const steel = finishMat('stahl', c), gold = finishMat('gold', c2);
    const R = HEAD_R;
    bag.add(ring(R + 0.006, 0.0075, 32), steel, { p: [sh.cx, sh.seatY + 0.004, sh.cz], r: [PI / 2, 0, 0] });
    bag.add(plate([[-0.009, 0.012], [0.009, 0.012], [0.007, -0.035], [0, -0.045], [-0.007, -0.035]], 0.004, 0.001), steel, { p: [0, sh.seatY - 0.012, -0.122], r: [-0.05, 0, 0] });
    for (let i = 0; i < 3; i++) bag.add(new CylinderGeometry(R + 0.006 + i * 0.006, R + 0.014 + i * 0.006, 0.026, 24, 1, true, -1.9, 3.8), steel, { p: [sh.cx, sh.seatY - 0.016 - i * 0.022, sh.cz] });
    bag.add(ball(0.0075, 6), gold, { p: [sh.cx, sh.seatY + 0.004, sh.cz - R - 0.012] });
    return { bag, cap: { finish: 'stahl', color: c } };
  },

  /** Offener Ritterhelm mit Wangenklappen, Kamm und Federbusch */
  helm_ritter({ sh, topY, c, c2 }) {
    const bag = new Bag();
    const steel = finishMat('stahl', c), gold = finishMat('gold', c2), plume = finishMat('stoff', c2, { rim: 1.1 });
    const R = HEAD_R;
    bag.add(ring(R + 0.007, 0.009, 32), gold, { p: [sh.cx, sh.seatY + 0.004, sh.cz], r: [PI / 2, 0, 0] });
    bag.add(plate([[-0.01, 0.01], [0.01, 0.01], [0.008, -0.04], [-0.008, -0.04]], 0.005, 0.0012), steel, { p: [0, sh.seatY - 0.012, -0.122], r: [-0.05, 0, 0] });
    // Kamm von vorn nach hinten über die Kuppel
    const crest = smoothOutline([[-R * 0.95, 0], [-R * 0.6, 0.03], [0, 0.044], [R * 0.6, 0.032], [R * 0.95, 0], [0, 0.006]], 2);
    bag.add(plate(crest, 0.007, 0.0015), steel, { p: [sh.cx, topY - 0.004, sh.cz], r: [0, PI / 2, 0] });
    // Federbusch hinten
    const r = rng(11);
    for (let i = 0; i < 9; i++) bag.add(cone(0.011, 0.07 + r() * 0.03, 5), plume, { p: [sh.cx + (r() - 0.5) * 0.02, topY + 0.01 - i * 0.003, sh.cz + 0.02 + i * 0.012], r: [0.7 + i * 0.12, 0, (r() - 0.5) * 0.3] });
    return { bag, cap: { finish: 'stahl', color: c } };
  },

  /** Hörnerhelm */
  helm_hoerner({ sh, c, c2 }) {
    const bag = new Bag();
    const steel = finishMat('dunkelstahl', c), horn = finishMat('leder', shade(c2, 0.2)), gold = finishMat('gold', c2);
    const R = HEAD_R;
    bag.add(ring(R + 0.006, 0.0085, 32), gold, { p: [sh.cx, sh.seatY + 0.004, sh.cz], r: [PI / 2, 0, 0] });
    bag.add(plate([[-0.009, 0.012], [0.009, 0.012], [0.007, -0.038], [-0.007, -0.038]], 0.004, 0.001), steel, { p: [0, sh.seatY - 0.012, -0.122], r: [-0.05, 0, 0] });
    side((s) => {
      bag.add(tube([[sh.cx + s * (R - 0.004), sh.seatY + 0.045, sh.cz], [sh.cx + s * (R + 0.05), sh.seatY + 0.06, sh.cz - 0.012], [sh.cx + s * (R + 0.095), sh.seatY + 0.13, sh.cz - 0.03], [sh.cx + s * (R + 0.075), sh.seatY + 0.215, sh.cz - 0.045]], 0.017, 22, 7, true), horn);
      bag.add(ring(0.02, 0.006, 14), gold, { p: [sh.cx + s * (R + 0.012), sh.seatY + 0.05, sh.cz], r: [0, PI / 2, 0] });
    });
    return { bag, cap: { finish: 'dunkelstahl', color: c } };
  },

  /** Flügelhelm */
  helm_fluegel({ sh, c, c2 }) {
    const bag = new Bag();
    const steel = finishMat('stahl', c), gold = finishMat('gold', c2);
    const R = HEAD_R;
    bag.add(ring(R + 0.006, 0.008, 32), gold, { p: [sh.cx, sh.seatY + 0.004, sh.cz], r: [PI / 2, 0, 0] });
    bag.add(plate([[-0.01, 0.012], [0.01, 0.012], [0.007, -0.07], [-0.007, -0.07]], 0.004, 0.001), steel, { p: [0, sh.seatY - 0.012, -0.122], r: [-0.05, 0, 0] });
    side((s) => {
      for (let i = 0; i < 4; i++) {
        const len = 0.12 - i * 0.022, w = 0.017;
        const outline = smoothOutline([[0, 0], [w, len * 0.3], [w * 0.8, len * 0.85], [0, len], [-w * 0.8, len * 0.85], [-w, len * 0.3]], 2);
        bag.add(plate(outline, 0.004, 0.001), i % 2 ? gold : steel, { p: [sh.cx + s * (R - 0.01), sh.seatY + 0.045 + i * 0.004, sh.cz + 0.01 + i * 0.014], r: [0.95 + i * 0.1, 0, -s * (0.55 + i * 0.16)] });
      }
    });
    return { bag, cap: { finish: 'stahl', color: c } };
  },

  /** Krone mit Zacken und Edelsteinen */
  helm_krone({ sh, c, c2 }) {
    const bag = new Bag();
    const gold = finishMat('gold', c), glow = glowMat(c2, 2);
    const R = HEAD_R;
    bag.add(cyl(R + 0.008, R + 0.012, 0.03, 36), gold, { p: [sh.cx, sh.seatY + 0.022, sh.cz] });
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2, big = i % 2 === 0;
      const x = sh.cx + Math.sin(a) * (R + 0.01), z = sh.cz + Math.cos(a) * (R + 0.01);
      bag.add(cone(0.013, big ? 0.075 : 0.05, 6), gold, { p: [x, sh.seatY + 0.037 + (big ? 0.0375 : 0.025), z], r: [Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12] });
      bag.add(gem(big ? 0.012 : 0.009), glow, { p: [x, sh.seatY + 0.037 + (big ? 0.08 : 0.055), z] });
    }
    bag.add(gem(0.015), glow, { p: [sh.cx, sh.seatY + 0.024, sh.cz - R - 0.014], s: [1, 1.3, 0.7] });
    return { bag, cap: { finish: 'seide', color: shade(c, -0.72) } };
  },

  /** Kapuze: weich, über die Frisur gezogen, hinten spitz, vorn offen */
  helm_kapuze({ sh, c, c2 }) {
    const bag = new Bag();
    const cloth = finishMat('stoff', c), edge = finishMat('stoff', c2);
    const R = HEAD_R;
    // Saum über der Stirn
    bag.add(ring(R + 0.006, 0.008, 30), edge, { p: [sh.cx, sh.seatY + 0.002, sh.cz], r: [PI / 2, 0, 0] });
    // Stoffbahn über Nacken und Schläfen, nach unten weiter (Zylinderausschnitt um +Z, vorn offen)
    bag.add(new CylinderGeometry(R + 0.012, R + 0.05, 0.1, 26, 1, true, -2.2, 4.4), cloth, { p: [sh.cx, sh.seatY - 0.05, sh.cz] });
    bag.add(new CylinderGeometry(R + 0.05, R + 0.075, 0.07, 26, 1, true, -1.9, 3.8), cloth, { p: [sh.cx, sh.seatY - 0.135, sh.cz + 0.01] });
    bag.add(cone(0.055, 0.15, 12), cloth, { p: [sh.cx, sh.seatY + 0.03, sh.cz + R + 0.07], r: [-1.2, 0, 0] });
    return { bag, cap: { finish: 'stoff', color: c } };
  },

  /** Kabuto: Kuppel, gestufter Nackenschutz, Halbmondzier */
  helm_samurai({ sh, topY, c, c2 }) {
    const bag = new Bag();
    const steel = finishMat('dunkelstahl', c), gold = finishMat('gold', c2), cord = finishMat('stoff', c2);
    const R = HEAD_R;
    bag.add(ring(R + 0.008, 0.009, 32), gold, { p: [sh.cx, sh.seatY + 0.006, sh.cz], r: [PI / 2, 0, 0] });
    // gestufter Nackenschutz: nur hinten und seitlich, nach vorn offen (Zylinderausschnitt um +Z)
    for (let i = 0; i < 4; i++) {
      const rt = R + 0.012 + i * 0.012, rb = rt + 0.014;
      const g = new CylinderGeometry(rt, rb, 0.03, 24, 1, true, -2.1, 4.2);
      bag.add(g, i % 2 ? cord : steel, { p: [sh.cx, sh.seatY - 0.02 - i * 0.027, sh.cz] });
    }
    side((s) => bag.add(plate(smoothOutline([[0, 0], [0.04, 0.012], [0.06, 0.035], [0.05, 0.015], [0.03, -0.012]], 2), 0.006, 0.0012), steel, { p: [sh.cx + s * (R + 0.01), sh.seatY + 0.01, sh.cz - 0.06], r: [0, s * 1.35, 0], s: [s, 1, 1] }));
    // Stirnzier als Halbmond
    const moon = smoothOutline([[-0.07, 0.0], [-0.075, 0.05], [-0.04, 0.095], [0, 0.11], [0.04, 0.095], [0.075, 0.05], [0.07, 0.0], [0.05, 0.05], [0.028, 0.07], [0, 0.074], [-0.028, 0.07], [-0.05, 0.05]], 2);
    bag.add(plate(moon, 0.006, 0.0015), gold, { p: [sh.cx, topY - 0.035, sh.cz - R - 0.012], r: [-0.18, 0, 0] });
    return { bag, cap: { finish: 'dunkelstahl', color: c } };
  },

  /** Drachenhelm: Hörner, Rückenkamm, glühende Augen */
  helm_drache({ sh, topY, c, c2 }) {
    const bag = new Bag();
    const steel = finishMat('dunkelstahl', c), gold = finishMat('gold', c2), glow = glowMat(c2, 2.6);
    const R = HEAD_R;
    bag.add(ring(R + 0.008, 0.009, 32), gold, { p: [sh.cx, sh.seatY + 0.005, sh.cz], r: [PI / 2, 0, 0] });
    bag.add(plate([[-0.01, 0.012], [0.01, 0.012], [0.008, -0.04], [0, -0.052], [-0.008, -0.04]], 0.005, 0.0012), steel, { p: [0, sh.seatY - 0.012, -0.122], r: [-0.05, 0, 0] });
    side((s) => {
      bag.add(tube([[sh.cx + s * (R - 0.01), sh.seatY + 0.05, sh.cz - 0.02], [sh.cx + s * (R + 0.04), sh.seatY + 0.075, sh.cz + 0.03], [sh.cx + s * (R + 0.075), sh.seatY + 0.135, sh.cz + 0.085], [sh.cx + s * (R + 0.07), sh.seatY + 0.2, sh.cz + 0.15]], 0.016, 22, 7, true), gold);
      bag.add(gem(0.0085), glow, { p: [sh.cx + s * 0.032, sh.seatY + 0.015, sh.cz - R + 0.012], s: [1, 0.6, 1] });
      bag.add(plate(smoothOutline([[0, 0], [0.012, -0.04], [0.04, -0.075], [0.02, -0.02]], 2), 0.005, 0.001), steel, { p: [sh.cx + s * (R + 0.004), sh.seatY - 0.01, sh.cz - 0.03], r: [0, s * 1.4, 0] });
    });
    const crest = smoothOutline([[-R * 0.9, 0], [-R * 0.55, 0.045], [-R * 0.1, 0.07], [R * 0.2, 0.09], [R * 0.6, 0.12], [R * 1.05, 0.15], [R * 0.9, 0.06], [R * 0.7, 0], [0, 0.006]], 2);
    bag.add(plate(crest, 0.007, 0.0015), gold, { p: [sh.cx, topY - 0.006, sh.cz], r: [0, PI / 2, 0] });
    return { bag, cap: { finish: 'dunkelstahl', color: c } };
  },

  /** Sturmkrone: schwebende Splitter um ein Goldband */
  helm_sturmkrone({ sh, c, c2 }) {
    const bag = new Bag();
    const gold = finishMat('gold', c), glow = glowMat(c2, 3);
    const R = HEAD_R;
    bag.add(ring(R + 0.01, 0.006, 36), gold, { p: [sh.cx, sh.seatY + 0.026, sh.cz], r: [PI / 2, 0, 0] });
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2, big = i % 3 === 0;
      const rr = R + 0.03 + (big ? 0.015 : 0);
      const x = sh.cx + Math.sin(a) * rr, z = sh.cz + Math.cos(a) * rr, h = big ? 0.14 : 0.085;
      bag.add(gem(0.017), glow, { p: [x, sh.seatY + 0.04 + h / 2, z], r: [Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35], s: [0.7, h / 0.034, 0.7] });
    }
    bag.add(gem(0.02), glow, { p: [sh.cx, sh.seatY + 0.03, sh.cz - R - 0.012], s: [0.9, 1.4, 0.6] });
    return { bag, cap: { finish: 'seide', color: shade(c, -0.7) } };
  },
};
export const HELM_KINDS = Object.keys(HELMS);
