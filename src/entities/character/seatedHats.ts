// 4.6G.3: Die acht Standard-Hüte als geformte Netze um den gemessenen Hutsitz (hatFit.ts) statt Kugel- und Zylinder-Klumpen auf den Haarspitzen.
//
// Raum: Sitz des Huts – Bandmitte im Ursprung, Bandebene y = 0, vorn = −Z, +X = Seite +X des Kopfraums. Der Aufrufer setzt die Gruppe an
// (seat.cx, seat.y, seat.cz) und dreht sie um x um seat.tilt. Jeder Hut liegt vollständig außerhalb des Kronen-Ellipsoids (a, h, b), in das
// squeezeUnderHat das Haar drückt, und hat eine haarfarbene Innenkappe, damit unter Krempe und Band nie Kopfhaut durchscheint.
// Oberflächen über finishMat (geteilte Figuren-Programme, kein neues Shader-Programm), je Material ein Netz (Bag).
import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from 'three';
import { Bag, ball, finishMat, plate, put, ring, shade, smoothOutline, tube, xf } from './gear/kit';
import type { HatSeat, SeatedHat } from './hatFit';

export interface HatColors {
  /** Hutfarbe (Filz, Stoff, Öltuch, Stahl) */
  main: string;
  /** Zierfarbe (Bänder, Borten) */
  accent: string;
  /** Haarfarbe (Innenkappe) */
  hair: string;
}

const TAU = Math.PI * 2;

/**
 * Ringförmige Fläche um den Sitz: Zeilen (k = Vielfaches der Band-Halbachsen, y), je Zeile `seg` Punkte rundum (φ = 0 vorn, π/2 = +X).
 * `mod(φ, zeile)` verschiebt k und y je Punkt (Falten, Spitzen, Krempen). Indiziert, rundum geschlossen (keine Naht in den Normalen).
 */
export function hatShell(rows: [number, number][], A: number, B: number, seg = 48, mod?: (phi: number, row: number) => [number, number]): BufferGeometry {
  const pos: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < seg; j++) {
      const phi = (j / seg) * TAU;
      const [dk, dy] = mod ? mod(phi, i) : [0, 0];
      const k = rows[i][0] + dk;
      pos.push(A * k * Math.sin(phi), rows[i][1] + dy, -B * k * Math.cos(phi));
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = (i + 1) * seg + j, c = i * seg + ((j + 1) % seg), d = (i + 1) * seg + ((j + 1) % seg);
    idx.push(a, b, c, c, b, d);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Kuppel als Superellipse (n > 2: kantiger als eine Halbkugel, liegt immer außerhalb des Kronen-Ellipsoids) von y0 bis zur Höhe H */
function domeRows(H: number, n: number, y0: number, steps = 12, k0 = 1): [number, number][] {
  const rows: [number, number][] = [[k0, y0]];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    const c = Math.pow(Math.cos(a), 2 / n), s = Math.pow(Math.sin(a), 2 / n);
    rows.push([k0 * Math.max(0, c), Math.max(y0, H * s)]);
  }
  return rows;
}

/** geschlossene Linie um den Sitz (für Borten, Kordeln): Punkte bei k, y(φ) */
function loop(A: number, B: number, k: (phi: number) => number, y: (phi: number) => number, n = 64, from = 0, to = TAU): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const closed = Math.abs(to - from - TAU) < 1e-6;
  const N = closed ? n : n + 1;
  for (let i = 0; i < N; i++) {
    const phi = from + ((to - from) * i) / n;
    pts.push([A * k(phi) * Math.sin(phi), y(phi), -B * k(phi) * Math.cos(phi)]);
  }
  if (closed) pts.push(pts[0]);
  return pts;
}

/** Punkt auf dem Sitz bei φ, k, y */
const at = (A: number, B: number, phi: number, k: number, y: number): [number, number, number] => [A * k * Math.sin(phi), y, -B * k * Math.cos(phi)];

/** Kokarde: dunkle, gefältelte Rosette mit goldenem Knopf, Blick nach außen bei `phi` (0 = vorn) */
function cockade(bag: Bag, dark: ReturnType<typeof finishMat>, gold: ReturnType<typeof finishMat>, p: [number, number, number], phi: number, r = 0.016) {
  const ros = hatShell([[0, 0.0045], [0.5, 0.004], [1, 0]], r, r, 20, (f) => [0.08 * Math.cos(f * 10), 0]);
  // flach nach vorn kippen, dann zur Seite der Wand drehen, dann an den Ort
  xf(ros, { r: [-Math.PI / 2, 0, 0] }, { r: [0, -phi, 0] }, { p });
  bag.add(ros, dark);
  bag.add(ball(r * 0.32, 10), gold, { p: [p[0] + Math.sin(phi) * 0.0045, p[1], p[2] - Math.cos(phi) * 0.0045] });
}

/** Innenkappe in Haarfarbe: liegt zwischen Schädel und Hut, reicht vorn etwas unter das Band (keine kahle Stirn) */
function innerCap(bag: Bag, s: HatSeat, hair: string) {
  const A = s.sa + 0.004, B = s.sb + 0.004;
  const H = s.sh + 0.004;
  const rows = domeRows(H, 2.2, -0.016, 10);
  bag.add(hatShell(rows, A, B, 40), finishMat('stoff', shade(hair, -0.35)));
}

/**
 * Baut einen Standard-Hut um den Sitz. Gibt die Gruppe im Sitzraum zurück (Aufrufer setzt Lage und Neigung).
 */
export function buildSeatedHat(hat: SeatedHat, s: HatSeat, c: HatColors): Group {
  const bag = new Bag();
  const A = s.a, B = s.b, H = s.h;
  // Filz, Wolle und Tuch matt (kein Plastikglanz); Metall und Leder behalten ihren Glanz
  const felt = finishMat('stoff', c.main, { rim: 0.55 });
  const gold = finishMat('gold', '#E3B04B');
  const dark = finishMat('stoff', '#1E1A20');
  innerCap(bag, s, c.hair);
  switch (hat) {
    case 'dreispitz': {
      // Krone: kantige Kuppel; Krempe: an drei Seiten hochgeschlagen, drei Spitzen (eine über der Stirn), Wände nach außen geschwungen
      bag.add(hatShell(domeRows(H * 1.01, 3, -0.004, 12, 1.01), A, B, 48), felt);
      // hohe, steil aufgeschlagene Wände (gut zwei Drittel der Krone), schmale Spitzen
      const W = 0.046, Hw = Math.max(0.066, H * 0.72);
      const corner = (phi: number) => {
        const p = ((phi % (TAU / 3)) + TAU / 3) % (TAU / 3) - Math.PI / 3;
        return Math.min(1.75, 1 / Math.cos(p));
      };
      const tip = (phi: number) => (corner(phi) - 1) / 0.75; // 0 an der Wand, 1 in der Spitze
      const Ravg = (A + B) / 2;
      const rows: [number, number][] = [[1.01, -0.004], [1.01, -0.004], [1.01, -0.004], [1.01, -0.004], [1.01, -0.004], [1.01, -0.004]];
      const brim = hatShell(rows, A, B, 96, (phi, i) => {
        const u = i / (rows.length - 1);
        const out = (W / Ravg) * corner(phi) * Math.pow(u, 0.6);
        // Wand steigt geschwungen auf (erst kurz nach außen, dann steil nach oben), in den Spitzen flacher
        const up = Hw * (1 - 0.6 * tip(phi)) * Math.pow(u, 1.7) - 0.004 * u;
        return [out, up];
      });
      bag.add(brim, felt);
      // goldene Borte an der Oberkante der Krempe
      const edge = loop(A, B, (phi) => 1.01 + (W / Ravg) * corner(phi), (phi) => Hw * (1 - 0.6 * tip(phi)) - 0.008, 144);
      // Spitzen bleiben scharf: die Borte folgt der Kante
      bag.add(tube(edge, 0.0024, 220, 6), gold);
      // Kokarde an der vorderen linken Wand
      const phiC = -Math.PI / 3;
      const pc = at(A, B, phiC, 1.01 + (W / Ravg) * 0.86 + 0.004 / Ravg, Hw * 0.55);
      cockade(bag, dark, gold, pc, phiC);
      break;
    }
    case 'zweispitz': {
      // Zweispitz quer getragen: flache Krone, zwei hohe, halbmondförmige Krempen vorn und hinten, die sich an den Seiten zu Spitzen treffen
      bag.add(hatShell(domeRows(H * 1.01, 2.3, -0.004, 10, 1.01), A, B, 40), felt);
      const L = A + 0.078, Hf = Math.max(0.12, H + 0.03);
      for (const side of [-1, 1]) {
        const pos: number[] = [];
        const NU = 28, NV = 7;
        for (let i = 0; i <= NU; i++) {
          const u = (i / NU) * 2 - 1;
          const x = u * L;
          const base = Math.abs(x) < A ? B * 1.02 * Math.sqrt(Math.max(0, 1 - (x / A) ** 2)) : 0;
          const top = Hf * Math.pow(Math.max(0, 1 - u * u), 0.5);
          for (let j = 0; j <= NV; j++) {
            const v = j / NV;
            const z = side * (base + 0.006) * (1 - 0.42 * v * v) + side * 0.004 * Math.sin(v * Math.PI);
            pos.push(x, -0.006 + v * top, z);
          }
        }
        const idx: number[] = [];
        for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
          const a = i * (NV + 1) + j, b = a + 1, cc = a + NV + 1, d = cc + 1;
          idx.push(a, cc, b, b, cc, d);
        }
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        bag.add(g, felt);
        // Goldborte entlang der Oberkante
        const edge: [number, number, number][] = [];
        for (let i = 0; i <= 40; i++) {
          const u = (i / 40) * 2 - 1, x = u * L * 0.985;
          const base = Math.abs(x) < A ? B * 1.02 * Math.sqrt(Math.max(0, 1 - (x / A) ** 2)) : 0;
          edge.push([x, -0.006 + Hf * Math.pow(Math.max(0, 1 - u * u), 0.5) * 0.985, side * ((base + 0.006) * 0.58 + 0.0005)]);
        }
        bag.add(tube(edge, 0.0022, 80, 5), gold);
      }
      // Kokarde mit goldener Schlaufe auf der vorderen Krempe (rechts der Mitte)
      const kx = L * 0.32, ky = Hf * 0.42;
      const ku = kx / L, kTop = Hf * Math.pow(Math.max(0, 1 - ku * ku), 0.5), kv = Math.min(1, (ky + 0.006) / Math.max(1e-3, kTop));
      const kBase = Math.abs(kx) < A ? B * 1.02 * Math.sqrt(Math.max(0, 1 - (kx / A) ** 2)) : 0;
      const kz = -((kBase + 0.006) * (1 - 0.42 * kv * kv) + 0.004 * Math.sin(kv * Math.PI)) - 0.005;
      cockade(bag, dark, gold, [kx, ky, kz], 0, 0.018);
      bag.add(tube([[kx, ky + 0.016, kz - 0.001], [kx, ky + 0.032, kz + 0.002], [kx, ky + 0.048, kz + 0.006]], 0.0028, 8, 5), gold);
      break;
    }
    case 'marine': {
      // Schirmmütze: dunkles Band, ausgestellter Deckel in Hutfarbe, glänzender Lederschirm, goldene Kordel und Emblem
      const band = finishMat('stoff', '#1E1A20');
      bag.add(hatShell([[1.005, -0.008], [1.01, 0.012], [1.015, 0.032]], A, B, 48), band);
      // Deckel vorn höher und weiter ausgestellt (versteifte Front)
      const crown = hatShell([[1.015, 0.032], [1.09, 0.048], [1.16, H * 0.78], [1.18, H * 0.9], [1.14, H * 0.97], [0.95, H + 0.003], [0.55, H + 0.008], [0, H + 0.009]], A, B, 48,
        (phi, i) => [i >= 2 && i <= 4 ? 0.03 * Math.cos(phi) : 0, i >= 3 ? 0.008 * Math.cos(phi) : 0]);
      bag.add(crown, felt);
      // Paspel am Deckelrand
      bag.add(tube(loop(A, B, (phi) => 1.18 + 0.03 * Math.cos(phi), (phi) => H * 0.9 + 0.008 * Math.cos(phi), 72), 0.0018, 120, 5), gold);
      // Schirm: halber Kranz vorn, nach vorn und leicht nach unten gewölbt
      const visorRows: [number, number][] = [[1.0, -0.005], [1.2, -0.011], [1.4, -0.024]];
      const leather = finishMat('leder', '#121214');
      const pos: number[] = [];
      const NS = 24;
      for (let i = 0; i < visorRows.length; i++) for (let j = 0; j <= NS; j++) {
        const phi = -1.25 + (2.5 * j) / NS;
        const w = Math.pow(Math.cos((phi / 1.25) * (Math.PI / 2)), 0.6);
        const k = 1.005 + (visorRows[i][0] - 1.005) * w;
        pos.push(A * k * Math.sin(phi), visorRows[i][1] * (0.4 + 0.6 * w), -B * k * Math.cos(phi));
      }
      const idx: number[] = [];
      for (let i = 0; i < visorRows.length - 1; i++) for (let j = 0; j < NS; j++) {
        const a = i * (NS + 1) + j, b = (i + 1) * (NS + 1) + j;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      const vg = new BufferGeometry();
      vg.setAttribute('position', new Float32BufferAttribute(pos, 3));
      vg.setIndex(idx);
      vg.computeVertexNormals();
      bag.add(vg, leather);
      // Kinnkordel über dem Schirm mit zwei Knöpfen
      const cord = loop(A, B, () => 1.03, (phi) => 0.006 + 0.002 * Math.cos(phi), 20, -1.1, 1.1);
      bag.add(tube(cord, 0.0016, 40, 5), gold);
      for (const phi of [-1.1, 1.1]) bag.add(ball(0.0045, 8), gold, { p: at(A, B, phi, 1.035, 0.007) });
      // Emblem: goldenes Wappenschild mit Anker vor dem Deckel
      const shield = smoothOutline([[-0.012, 0.012], [0.012, 0.012], [0.012, -0.004], [0, -0.016], [-0.012, -0.004]], 1);
      bag.add(plate(shield, 0.0026, 0.0008), gold, { p: [0, 0.05, -B * 1.11 - 0.002], r: [0.25, 0, 0] });
      bag.add(plate([[-0.0015, 0.008], [0.0015, 0.008], [0.0015, -0.008], [-0.0015, -0.008]], 0.002, 0.0004), dark, { p: [0, 0.05, -B * 1.11 - 0.0045], r: [0.25, 0, 0] });
      bag.add(ring(0.0045, 0.0011, 12, Math.PI), dark, { p: [0, 0.0445, -B * 1.11 - 0.0048], r: [0.25, 0, Math.PI] });
      break;
    }
    case 'kochmuetze': {
      // Band und hoher, gefältelter Bausch, der oben überquillt
      bag.add(hatShell([[1.005, -0.008], [1.02, 0.02], [1.035, 0.048]], A, B, 48), felt);
      const top = Math.max(H + 0.055, 0.15);
      const rows: [number, number][] = [[1.035, 0.048], [1.16, 0.075], [1.28, top * 0.62], [1.32, top * 0.8], [1.24, top * 0.93], [0.95, top * 0.99], [0.5, top * 1.01], [0, top * 1.015]];
      bag.add(hatShell(rows, A, B, 72, (phi, i) => [i >= 1 && i <= 5 ? 0.045 * Math.pow(Math.abs(Math.sin(phi * 7)), 0.6) * (i === 1 ? 0.4 : 1) : 0, 0]), felt);
      bag.add(tube(loop(A, B, () => 1.04, () => 0.047, 72), 0.0028, 120, 5), finishMat('stoff', shade(c.main, -0.08)));
      break;
    }
    case 'muetze': {
      // Wollmütze: gerippte Kuppel, darunter ein umgeschlagener, gerippter Bund
      // Strickrippen: weiche, deutliche Längsrippen, oben zur Spitze hin auslaufend; kleiner Knauf obenauf
      const rib = (phi: number) => 0.05 * Math.pow(0.5 + 0.5 * Math.cos(phi * 30), 2);
      bag.add(hatShell(domeRows(H + 0.008, 2.15, -0.004, 12, 1.012), A, B, 120, (phi, i) => [i < 12 ? rib(phi) * (1 - i / 12) * 0.28 : 0, 0]), felt);
      const cuff = finishMat('stoff', shade(c.main, -0.12), { rim: 0.55 });
      bag.add(hatShell([[1.035, -0.014], [1.08, -0.01], [1.085, 0.008], [1.078, 0.026], [1.035, 0.031]], A, B, 144, (phi) => [rib(phi * 1.6) * 0.3, 0]), cuff);
      bag.add(ball(0.012, 10), cuff, { p: [0, H + 0.014, 0], s: [1, 0.7, 1] });
      break;
    }
    case 'suedwester': {
      // Öltuch: Kuppel aus sechs Bahnen mit Nähten, Krempe vorn schmal, hinten breit und abfallend, Rand nach unten gerollt
      // Öltuch: gleiches Stoff-Programm wie die übrigen Hüte (Seide brachte zwei neue Shader-Programme), etwas kräftigeres Randlicht
      const oil = finishMat('stoff', c.main, { rim: 1.1 });
      bag.add(hatShell(domeRows(H + 0.006, 2.25, -0.004, 12, 1.01), A, B, 72, (phi, i) => [i < 12 ? 0.006 * Math.pow(Math.max(0, Math.cos(phi * 6)), 24) : 0, 0]), oil);
      const wid = (phi: number) => 0.032 + 0.045 * (1 - Math.cos(phi)) / 2;
      const drop = (phi: number) => 0.01 + 0.022 * (1 - Math.cos(phi)) / 2;
      const R = (A + B) / 2;
      const rows: [number, number][] = [[1.01, -0.003], [1.01, -0.003], [1.01, -0.003], [1.01, -0.003], [1.01, -0.003]];
      bag.add(hatShell(rows, A, B, 72, (phi, i) => {
        const u = i / (rows.length - 1);
        return [(wid(phi) / R) * Math.min(1, u * 1.12), -drop(phi) * u * u - (i === rows.length - 1 ? 0.007 : 0)];
      }), oil);
      bag.add(tube(loop(A, B, (phi) => 1.01 + wid(phi) / R, (phi) => -0.003 - drop(phi) - 0.007, 96), 0.0026, 160, 5), oil);
      break;
    }
    case 'bandana': {
      // Kopftuch: straff um den Kopf, feine Zugfalten, gerollter Saum über der Stirn, Knoten hinten mit zwei Zipfeln
      const cloth = finishMat('stoff', c.main, { rim: 0.55 });
      // Zugfalten laufen vom Knoten hinten nach vorn aus (stark hinten, glatt über der Stirn)
      bag.add(hatShell(domeRows(H + 0.004, 2.05, -0.008, 12, 1.004), A, B, 96, (phi, i) => [i > 0 && i < 10 ? 0.022 * Math.pow(Math.abs(Math.sin(phi * 7 + i * 0.35)), 3) * (0.25 + 0.75 * (1 - Math.cos(phi)) / 2) : 0, 0]), cloth);
      bag.add(tube(loop(A, B, () => 1.03, () => -0.006, 72), 0.0045, 120, 6), cloth);
      const kn = at(A, B, Math.PI, 1.04, 0.004);
      bag.add(ball(0.016, 10), cloth, { p: kn, s: [1.15, 0.85, 0.8] });
      for (const sx of [-1, 1]) {
        const p0: [number, number, number] = [kn[0] + sx * 0.008, kn[1] - 0.004, kn[2] + 0.004];
        bag.add(tube([p0, [p0[0] + sx * 0.012, p0[1] - 0.03, p0[2] + 0.012], [p0[0] + sx * 0.02, p0[1] - 0.066, p0[2] + 0.018]], 0.0062, 14, 6, true), cloth);
      }
      break;
    }
    case 'helm': {
      // Sturmhaube aus Stahl: Kuppel, Kamm von vorn nach hinten, vorn und hinten hochgezogene Krempe mit Rollrand, Messingnieten, Emblem
      const steel = finishMat('stahl', c.main === '#9AA0A8' || !c.main ? '#9AA0A8' : c.main);
      const brass = finishMat('gold', '#C9A13B');
      bag.add(hatShell(domeRows(H + 0.008, 2.3, -0.004, 12, 1.015), A, B, 56), steel);
      const R = (A + B) / 2;
      const rim = (phi: number) => 0.02 + 0.012 * Math.cos(phi) ** 2;
      const lift = (phi: number) => 0.016 * Math.cos(phi) ** 2;
      const rows: [number, number][] = [[1.015, -0.004], [1.015, -0.004], [1.015, -0.004], [1.015, -0.004]];
      bag.add(hatShell(rows, A, B, 64, (phi, i) => {
        const u = i / (rows.length - 1);
        return [(rim(phi) / R) * u, lift(phi) * u * u];
      }), steel);
      bag.add(tube(loop(A, B, (phi) => 1.015 + rim(phi) / R, (phi) => -0.004 + lift(phi), 96), 0.003, 160, 6), steel);
      // Kamm: Platte längs über die Kuppel
      const crest: [number, number][] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, a = (t - 0.5) * Math.PI * 0.86;
        crest.push([Math.sin(a) * B * 1.0, Math.cos(a) * (H + 0.008) * 0.98 + 0.024 * Math.cos(a) ** 3]);
      }
      for (let i = 16; i >= 0; i--) {
        const t = i / 16, a = (t - 0.5) * Math.PI * 0.86;
        crest.push([Math.sin(a) * B * 1.0, Math.cos(a) * (H + 0.008) * 0.9]);
      }
      const cg = plate(crest, 0.005, 0.0012);
      put(cg, { r: [0, Math.PI / 2, 0] });
      bag.add(cg, steel);
      for (let i = 0; i < 12; i++) {
        const phi = (i / 12) * TAU + 0.26;
        bag.add(ball(0.0034, 6), brass, { p: at(A, B, phi, 1.03, 0.012) });
      }
      const shield = smoothOutline([[-0.011, 0.011], [0.011, 0.011], [0.011, -0.004], [0, -0.015], [-0.011, -0.004]], 1);
      bag.add(plate(shield, 0.0025, 0.0007), brass, { p: [0, 0.034, -B * 1.03 - 0.0035], r: [0.3, 0, 0] });
      break;
    }
  }
  const g = bag.build();
  // kein Schattenwurf: ein harter Hutschatten färbt das ganze Anime-Gesicht grau
  g.traverse((o) => { (o as Mesh).castShadow = false; });
  g.name = `hut:${hat}`;
  return g;
}
