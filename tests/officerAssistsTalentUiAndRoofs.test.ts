// Phase 4.6H: neue Frisur „Mehrlagig“ (Mann und Frau), entspannter Hutsitz samt Ausrüstungshelmen, Offiziers-Kombo-Assists, gemeinsames
// Talent-Menü für N und K (ein Punktetopf, Übernahme der alten Faji-Punkte), begehbare Dächer und Zinnen, Himmelssturz mit Abstand zum Deck.
import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CHAIN_LAYOUT, CLOTH } from '../src/data/characterRig';
import { SpringChains } from '../src/entities/character/rig/springChain';
import { buildLayeredHair, maneRest, type HeadShape } from '../src/entities/character/layeredHair';
import {
  HAT_FIT, HAT_RELAX, HAT_SEAT_STYLE, SKIRT, SKULL_KEEP, bandYAt, fitSeatInside, seatFromSkull, skirtFromRings, skirtFromTriangles, squeezeUnderHat, toSeat, type HatSeat,
} from '../src/entities/character/hatFit';
import { HELM_SKIRTS } from '../src/entities/character/gear/rigid';
import {
  ASSIST_BY_ID, OFFICER_ASSISTS, assistBlock, assistBurst, assistCdFrac, assistCenter, assistDamage, newAssistState, pickOfficer, salvoPoint, stepAssists, type AssistOfficer,
} from '../src/combat/officerAssists';
import { ACTION_GROUPS, ASSIST_ACTIONS, DEFAULT_KEYS, DEFAULT_PAD, PAD_CHORDS, PAD_CHORD_LABEL } from '../src/data/actions';
import { emptyTalents, freePoints, grantBonus, mergeFajiPoints, poolTotal, spentRegular, talentTotal, techRespecCost, techSpentOf } from '../src/core/talentRules';
import { createSave, SAVE_VERSION } from '../src/core/save/types';
import { migrateSave } from '../src/core/save/migrations';
import { TALENT_CATS, newTalentUi, talentScreenHtml } from '../src/ui/talentScreen';
import { KAISER_IDS } from '../src/data/kaiserIslands';
import { ROOF, buildRoofField, placeRoof, roofHeight, roofMinOver, type GeoLike, type Roof } from '../src/world/roofFields';
import { IslandGround, shelfOf, type WalkIsland } from '../src/world/islandGround';
import { SKYFALL_OFFSETS, SKYFALL_SHIP_CLEAR, fleetClearance, hullClearance, skyfallShift, type ShipFootprint } from '../src/combat/skyfallClearance';

// ---------- Kopf: Ellipsoid-Schädel im Kopfraum (Gesicht nach −Z), Nacken und Rücken ----------

const EYE = 0.06, CY = EYE + 0.035, RY = 0.115, AX = 0.078, BZ = 0.095, ZC = 0.005, TOP = CY + RY;
/** Hautradius um die Achse (0, ZC) bei Winkel th (0 = Gesicht) und Höhe y; unter der Kopfmitte läuft er zum Hals hin aus */
const skullR = (th: number, y: number): number => {
  const t = (y - CY) / RY;
  const k = Math.sqrt(Math.max(0.36, 1 - t * t));
  return 1 / Math.hypot(Math.sin(th) / (AX * k), Math.cos(th) / (BZ * k));
};
const HEAD: HeadShape = {
  r: skullR, zc: ZC, top: TOP, eyeY: EYE, y0: EYE - 0.2,
  // Rücken: Nacken dicht an der Achse, ab den Schultern weiter hinten (Schulterblätter)
  back: (y: number) => ZC + 0.052 + Math.max(0, EYE - 0.16 - y) * 0.35,
};
const D = Math.PI / 180;
/** „Außen“ wie in layeredHair.ts: über der Kopfmitte radial, darunter waagrecht von der Achse weg */
const outward = (x: number, y: number, z: number) => new Vector3(x, Math.max(0, y - CY), z - ZC).normalize();

describe('4.6H „Mehrlagig“: neu gebaute Strähnen um den Schädel (Mann und Frau)', () => {
  const cuts = { male: buildLayeredHair('male', HEAD), female: buildLayeredHair('female', HEAD) };

  it('geschlossene Kappe und Strähnen-Körper: endliche Lage, Einheits-Normalen nach außen, Umlaufsinn passend', () => {
    for (const [cut, lh] of Object.entries(cuts)) {
      const pos = lh.geo.attributes.position, nor = lh.geo.attributes.normal, idx = lh.geo.index!;
      expect(lh.capVerts, cut).toBeGreaterThan(400);
      expect(lh.strands, cut).toBeGreaterThan(40);
      expect(lh.tris, cut).toBeLessThan(14000);
      let capOut = 0, agreeN = 0;
      // Normalen aus der reinen Geometrie (vor dem Neigen zur Kopfwölbung): die geneigten dürfen nie umklappen
      const raw = lh.geo.clone();
      raw.computeVertexNormals();
      const rn = raw.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        expect(Number.isFinite(x + y + z), `${cut} Punkt ${i}`).toBe(true);
        const n = new Vector3(nor.getX(i), nor.getY(i), nor.getZ(i));
        expect(Math.abs(n.length() - 1), `${cut} Normale ${i}`).toBeLessThan(0.02);
        if (i < lh.capVerts) { if (n.dot(new Vector3(x, y - CY, z - ZC).normalize()) > 0) capOut++; }
        else if (n.dot(new Vector3(rn.getX(i), rn.getY(i), rn.getZ(i))) > -0.2 || n.dot(outward(x, y, z)) > 0) agreeN++;
      }
      expect(capOut / lh.capVerts, `${cut}: Kappe nach außen`).toBeGreaterThan(0.99);
      expect(agreeN / (pos.count - lh.capVerts), `${cut}: geneigte Normalen klappen nicht um`).toBeGreaterThan(0.99);
      // jede Strähne ist ein geschlossener Körper mit Flächen nach außen: positives Volumen (Umlaufsinn nach außen)
      const parent = new Int32Array(pos.count).map((_, i) => i);
      const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
      for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t);
        if (a < lh.capVerts) continue;
        for (let k = 1; k < 3; k++) { const ra = find(a), rb = find(idx.getX(t + k)); if (ra !== rb) parent[rb] = ra; }
      }
      const vol = new Map<number, number>();
      const P0 = new Vector3(), P1 = new Vector3(), P2 = new Vector3();
      for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t);
        if (a < lh.capVerts) continue;
        P0.fromBufferAttribute(pos, a); P1.fromBufferAttribute(pos, idx.getX(t + 1)); P2.fromBufferAttribute(pos, idx.getX(t + 2));
        const r = find(a);
        vol.set(r, (vol.get(r) ?? 0) + P0.dot(P1.clone().cross(P2)) / 6);
      }
      let positive = 0;
      for (const v of vol.values()) if (v > 0) positive++;
      expect(vol.size, `${cut}: Strähnen`).toBe(lh.strands);
      expect(positive, `${cut}: Strähnen mit Flächen nach außen`).toBe(lh.strands);
      // Umlaufsinn jedes Dreiecks passt zu den Eckpunkt-Normalen (keine gestülpten Flächen)
      const A = new Vector3(), B = new Vector3(), C = new Vector3();
      let agree = 0;
      for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
        A.fromBufferAttribute(pos, a); B.fromBufferAttribute(pos, b); C.fromBufferAttribute(pos, c);
        const f = B.clone().sub(A).cross(C.clone().sub(A));
        const n = new Vector3(rn.getX(a) + rn.getX(b) + rn.getX(c), rn.getY(a) + rn.getY(b) + rn.getY(c), rn.getZ(a) + rn.getZ(b) + rn.getZ(c));
        if (f.dot(n) >= 0) agree++;
      }
      expect(agree / (idx.count / 3), `${cut}: Umlaufsinn`).toBeGreaterThan(0.99);
    }
  });

  it('nichts im Schädel, keine Lücke: Strähnen liegen über der Kopfhaut, die Kappe deckt vom Haaransatz bis zum Scheitel', () => {
    for (const [cut, lh] of Object.entries(cuts)) {
      const pos = lh.geo.attributes.position;
      let ok = 0, n = 0, capTop = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (i < lh.capVerts) { capTop = Math.max(capTop, y); expect(Math.hypot(x, z - ZC) + 1e-4, `${cut}: Kappe über der Haut`).toBeGreaterThanOrEqual(y > TOP - 0.002 ? 0 : skullR(Math.atan2(x, -(z - ZC)), y) * 0.999); continue; }
        if (y < HEAD.y0 || y > TOP) continue;
        n++;
        if (Math.hypot(x, z - ZC) >= skullR(Math.atan2(x, -(z - ZC)), y) - 0.002) ok++;
      }
      expect(ok / n, `${cut}: Strähnen außerhalb der Haut`).toBeGreaterThan(0.99);
      expect(capTop, `${cut}: Kappe bis zum Scheitel`).toBeGreaterThan(TOP - 0.004);
    }
  });

  it('Schnitte: Mann mit Stacheln und Pony bis zu den Brauen, Frau mit langen Rückensträhnen an eigenen Federketten', () => {
    const box = (cut: 'male' | 'female') => {
      const p = cuts[cut].geo.attributes.position;
      let minY = Infinity, maxY = -Infinity, maxX = 0, frontLow = Infinity;
      for (let i = cuts[cut].capVerts; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y); maxX = Math.max(maxX, Math.abs(x));
        if (z < ZC - 0.06 && Math.abs(x) < 0.03) frontLow = Math.min(frontLow, y);
      }
      return { minY, maxY, maxX, frontLow };
    };
    const m = box('male'), f = box('female');
    // Mann: Spitzen frei über dem Scheitel, Pony endet knapp über den Augen, Nacken höchstens gut 20 cm unter den Augen
    expect(m.maxY).toBeGreaterThan(TOP + 0.01);
    expect(m.maxY).toBeLessThan(TOP + 0.13);
    expect(m.frontLow).toBeGreaterThan(EYE - 0.005);
    expect(m.frontLow).toBeLessThan(EYE + 0.045);
    expect(m.minY).toBeGreaterThan(EYE - 0.21);
    expect(m.maxX).toBeLessThan(0.2);
    // Frau: Rückensträhnen bis zur Rückenmitte, glatter Kopf (keine Stacheln)
    expect(f.minY).toBeLessThan(EYE - 0.35);
    expect(f.minY).toBeGreaterThan(EYE - 0.5);
    expect(f.maxY).toBeLessThan(TOP + 0.03);
    // nur die Rückensträhnen der Frau hängen an Ketten – und zwar genau die mit Wurzel am Hinterkopf (126° … 234°)
    const cm = cuts.male.chain.reduce((a, b) => a + b, 0), cf = cuts.female;
    expect(cm).toBe(0);
    let n = 0;
    for (let i = 0; i < cf.chain.length; i++) if (cf.chain[i]) { n++; expect(cf.strandAz[i]).toBeGreaterThanOrEqual(126 * D - 1e-6); expect(cf.strandAz[i]).toBeLessThanOrEqual(234 * D + 1e-6); }
    expect(n).toBeGreaterThan(800);
  });

  it('Federketten der Rückensträhnen liegen im Haar: Wurzel im Nacken, abwärts bis zur tiefsten Spitze, hinter dem Kopf, links nach rechts geordnet', () => {
    const M = CHAIN_LAYOUT.mane;
    const rest = maneRest(HEAD, M)!;
    expect(rest).not.toBeNull();
    expect(rest.length).toBe(M.chains * (M.links + 1) * 3);
    const at = (c: number, i: number) => { const o = (c * (M.links + 1) + i) * 3; return { x: rest[o], y: rest[o + 1], z: rest[o + 2] }; };
    for (let c = 0; c < M.chains; c++) {
      expect(at(c, 0).y).toBeCloseTo(EYE + M.root, 6);
      for (let i = 1; i <= M.links; i++) expect(at(c, i).y, `Kette ${c} Glied ${i}`).toBeLessThan(at(c, i - 1).y - 0.05);
      expect(at(c, M.links).y, `Kette ${c} reicht bis zur Rückenmitte`).toBeLessThan(EYE - 0.3);
      for (let i = 0; i <= M.links; i++) expect(at(c, i).z, `Kette ${c} hinter dem Kopf`).toBeGreaterThan(ZC + 0.03);
    }
    expect(at(0, 0).x).toBeGreaterThan(at(M.chains - 1, 0).x + 0.06);
  });

  it('sanfte Bewegung: wenig Trägheit, Gelenkgrenze unter der des Grundhaars – beim Laufen höchstens 0,55 rad, nach dem Anhalten rasch ruhig', () => {
    const T = CLOTH.mane;
    expect(T.inertia).toBeLessThanOrEqual(0.3);
    expect(T.maxBend).toBeLessThanOrEqual(0.6);
    expect(T.maxBend).toBeLessThan(CLOTH.hair.maxBend);
    const M = CHAIN_LAYOUT.mane;
    const rest = maneRest(HEAD, M)!;
    const c = new SpringChains(M.chains, M.links, T);
    for (let k = 0; k < rest.length / 3; k++) c.setRest(Math.floor(k / (M.links + 1)), k % (M.links + 1), rest[k * 3], rest[k * 3 + 1], rest[k * 3 + 2]);
    c.finishRest();
    const frame = (z: number) => new Matrix4().makeTranslation(0, 1.6, z).elements;
    let z = 0, bend = 0;
    for (let i = 0; i < 120; i++) { z -= 6 / 60; c.step(frame(z), 1 / 60); bend = Math.max(bend, c.maxBendSeen); }
    expect(bend).toBeLessThanOrEqual(T.maxBend + 0.02);
    // anhalten: nach einer Sekunde liegen die Spitzen wieder fast in der Ruhelage
    for (let i = 0; i < 60; i++) c.step(frame(z), 1 / 60);
    const tip = (M.chains >> 1) * (M.links + 1) + M.links;
    const dev = Math.hypot(c.pos[tip * 3] - rest[tip * 3], c.pos[tip * 3 + 1] - (rest[tip * 3 + 1] + 1.6), c.pos[tip * 3 + 2] - (rest[tip * 3 + 2] + z));
    expect(dev).toBeLessThan(0.03);
    expect(c.resets).toBe(0);
  });
});

// ---------- Hüte und Helme ----------

describe('4.6H entspannter Hutsitz: 0,8 cm höher, Kranz 3,5 % weiter – auch für Ausrüstungshelme, nichts sticht durch', () => {
  it('jeder Standard-Hut: Band (und damit der ganze Hut am Socket headTop) 0,8 cm höher, Kranz 3,5 % weiter', () => {
    expect(HAT_RELAX.lift).toBeCloseTo(0.008, 6);
    expect(HAT_RELAX.widen).toBeCloseTo(1.035, 6);
    for (const hat of ['dreispitz', 'marine', 'muetze', 'helm'] as const) {
      const s = seatFromSkull(skullR, ZC, TOP, EYE, hat);
      const st = HAT_SEAT_STYLE[hat];
      const yF0 = EYE + HAT_FIT.front - st.drop, yB0 = EYE + HAT_FIT.back - st.drop;
      expect(s.y, hat).toBeCloseTo((yF0 + yB0) / 2 + HAT_RELAX.lift, 6);
      expect(s.a, hat).toBeCloseTo((s.sa + HAT_FIT.pad + st.ease) * HAT_RELAX.widen, 6);
      expect(s.b, hat).toBeCloseTo((s.sb + HAT_FIT.pad + st.ease) * HAT_RELAX.widen, 6);
      // Krone hebt sich mit dem Band: das gedrückte Haar hat oben 0,8 cm mehr Platz
      expect(s.y + s.h, hat).toBeCloseTo(TOP + HAT_FIT.crownPad + HAT_RELAX.lift, 6);
    }
  });

  it('Haar über dem Band liegt nach dem Drücken überall in der Krone (keine Härchen durch den Hut)', () => {
    const q = { x: 0, y: 0, z: 0 };
    for (const hat of ['dreispitz', 'zweispitz', 'marine', 'kochmuetze', 'muetze', 'suedwester', 'bandana', 'helm'] as const) {
      const s = seatFromSkull(skullR, ZC, TOP, EYE, hat);
      for (let i = 0; i < 600; i++) {
        const a = (i * 2.399) % (Math.PI * 2), el = (i % 30) * 0.05;
        const r = 0.1 + (i % 9) * 0.01;
        const p = { x: Math.sin(a) * Math.cos(el) * r, y: CY + Math.sin(el) * r, z: ZC - Math.cos(a) * Math.cos(el) * r };
        squeezeUnderHat(s, p);
        toSeat(s, p.x, p.y, p.z, q);
        if (q.y < 0) continue;
        expect(Math.hypot(q.x / s.a, q.y / s.h, q.z / s.b), `${hat} Punkt ${i}`).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  const helmSeat = (): HatSeat => seatFromSkull(skullR, ZC, TOP, EYE, 'helm');
  /** Haarpunkt unter dem Band: Richtung az (0 = Gesicht), Tiefe d unter der Bandebene, Halbmesser rr um die Helmmitte */
  const below = (s: HatSeat, az: number, d: number, rr: number) => {
    const x = s.cx + Math.sin(az) * rr, z = s.cz - Math.cos(az) * rr;
    return { x, y: bandYAt(s, z) - d, z };
  };

  it('Ausrüstungshelme mit Nacken- und Wangenschutz: Haar unter dem Band bleibt innerhalb der Schürze, vorn bleibt das Gesicht frei', () => {
    for (const [kind, spec] of Object.entries(HELM_SKIRTS)) {
      const base = helmSeat();
      const s: HatSeat = { ...base, skirt: skirtFromRings(base, spec!) };
      const R = (s.a + s.b) / 2 + 0.002;
      for (let k = 0; k < 24; k++) {
        const az = Math.PI * 0.42 + (k / 23) * Math.PI * 1.16;
        const off = Math.abs(Math.atan2(Math.sin(az), Math.cos(az)));
        for (const d of [0.012, 0.03, 0.05]) {
          const p = below(s, az, d, R + spec!.r1 + 0.04);
          const depth = s.y - p.y;
          if (depth > spec!.depth - 0.012) continue;
          squeezeUnderHat(s, p);
          const rho = Math.hypot(p.x - s.cx, p.z - s.cz);
          const lim = R + spec!.r0 + (spec!.r1 - spec!.r0) * Math.min(1, depth / spec!.depth);
          // in der Öffnung (vorn) gilt keine Schürze; an ihrem Rand läuft der Druck weich aus
          if (off > spec!.open + 0.3) expect(rho, `${kind} az ${(az / D).toFixed(0)}° Tiefe ${d}`).toBeLessThanOrEqual(lim - SKIRT.margin + 0.002);
        }
      }
      // Gesicht: Pony und Schläfenhaar vor der Öffnung bleiben, wo sie sind
      const face = below(s, 0, 0.02, R + 0.03), before = { ...face };
      squeezeUnderHat(s, face);
      expect(face, `${kind}: vorn frei`).toEqual(before);
      // unter der Unterkante der Schürze fällt das Haar frei
      const low = below(s, Math.PI, spec!.depth + 0.05, R + spec!.r1 + 0.04), lowBefore = { ...low };
      squeezeUnderHat(s, low);
      expect(low, `${kind}: unter der Schürze frei`).toEqual(lowBefore);
    }
  });

  it('Helme aus Blender: die Schürze kommt aus den Dreiecken des Modells (Wangenschutz, Nackenschutz)', () => {
    const s0 = helmSeat();
    // Modell: Zylinderband (Halbmesser 0,105 um die Helmmitte) vom Band 8 cm abwärts, vorn 140° offen
    const tris: number[] = [];
    const N = 36, rr = 0.105, y0 = s0.y + 0.004, y1 = s0.y - 0.08;
    for (let i = 0; i < N; i++) {
      const a0 = (70 + (220 * i) / N) * D, a1 = (70 + (220 * (i + 1)) / N) * D;
      const P = (a: number, y: number) => [s0.cx + Math.sin(a) * rr, y, s0.cz - Math.cos(a) * rr];
      tris.push(...P(a0, y0), ...P(a1, y0), ...P(a1, y1), ...P(a0, y0), ...P(a1, y1), ...P(a0, y1));
    }
    const skirt = skirtFromTriangles(s0, tris)!;
    expect(skirt).toBeDefined();
    expect(skirtFromTriangles(s0, [0, s0.y + 0.1, 0, 0.01, s0.y + 0.1, 0, 0, s0.y + 0.12, 0.01])).toBeUndefined();
    const s: HatSeat = { ...s0, skirt };
    for (const az of [100, 140, 180, 220, 260]) {
      const p = below(s, az * D, 0.03, 0.14);
      squeezeUnderHat(s, p);
      expect(Math.hypot(p.x - s.cx, p.z - s.cz), `az ${az}°`).toBeLessThanOrEqual(rr - SKIRT.margin + 0.003);
    }
    const face = below(s, 0, 0.03, 0.14), before = { ...face };
    squeezeUnderHat(s, face);
    expect(face).toEqual(before);
  });

  it('eingepasste Krone (Helm- und Hutmodelle) geht nie in den Schädel und behält ihre Schürze', () => {
    const base = helmSeat();
    const s = { ...base, skirt: skirtFromRings(base, HELM_SKIRTS.helm_kappe!) };
    // Modell, dessen Innenfläche deutlich in der Krone liegt: die Krone schrumpft, aber nie unter Schädel + 4 mm
    const pts: number[] = [];
    for (let i = 0; i < 400; i++) {
      const a = (i * 2.399) % (Math.PI * 2), el = 0.1 + (i % 10) * 0.14;
      const q = { x: Math.sin(a) * Math.cos(el) * s.a * 0.7, y: Math.sin(el) * s.h * 0.7, z: -Math.cos(a) * Math.cos(el) * s.b * 0.7 };
      const c = Math.cos(s.tilt), si = Math.sin(s.tilt);
      pts.push(q.x + s.cx, q.y * c - q.z * si + s.y, q.y * si + q.z * c + s.cz);
    }
    const f = fitSeatInside(s, pts);
    expect(f.a).toBeGreaterThanOrEqual(f.sa + SKULL_KEEP - 1e-9);
    expect(f.b).toBeGreaterThanOrEqual(f.sb + SKULL_KEEP - 1e-9);
    expect(f.h).toBeGreaterThanOrEqual(f.sh + SKULL_KEEP - 1e-9);
    expect(f.skirt).toBe(s.skirt);
    // Modell weit außen: Sitz bleibt
    expect(fitSeatInside(s, [s.cx, s.y + 0.3, s.cz])).toBe(s);
  });
});

// ---------- Offiziers-Kombo-Assists ----------

describe('4.6H Offiziers-Kombo-Assists: drei Befehle, konfliktfreie Tasten, Regeln rein', () => {
  const crew = (...ids: [string, AssistOfficer['role']][]): AssistOfficer[] => ids.map(([id, role]) => ({ id, role, alive: true }));

  it('drei Assists mit deutschen Namen, Tasten 8/9/0 ohne Doppelbelegung, Gamepad R3 + LB/RB/LT, eigene Gruppe in der Tastenbelegung', () => {
    expect(OFFICER_ASSISTS.map((a) => a.id)).toEqual(['sperrfeuer', 'orkan', 'sturmhorn']);
    expect(OFFICER_ASSISTS.map((a) => a.label)).toEqual(['Sperrfeuer-Salve', 'Orkan-Schildstoß', 'Sturmhorn-Sammeln']);
    expect(ASSIST_ACTIONS).toEqual(['assist1', 'assist2', 'assist3']);
    expect(ASSIST_ACTIONS.map((a) => DEFAULT_KEYS[a][0])).toEqual(['Digit8', 'Digit9', 'Digit0']);
    for (const [a, keys] of Object.entries(DEFAULT_KEYS)) {
      if ((ASSIST_ACTIONS as readonly string[]).includes(a)) continue;
      for (const k of ['Digit8', 'Digit9', 'Digit0']) expect(keys, `${a} belegt ${k}`).not.toContain(k);
    }
    const chords = Object.values(PAD_CHORDS);
    expect(new Set(chords).size).toBe(chords.length);
    for (const a of ASSIST_ACTIONS) { expect(DEFAULT_PAD[a]).toEqual([]); expect(PAD_CHORD_LABEL[a]).toMatch(/^R3 \+ (LB|RB|LT)$/); }
    expect(ACTION_GROUPS.find((g) => g.id === 'assists')?.actions).toEqual([...ASSIST_ACTIONS]);
    for (const a of OFFICER_ASSISTS) { expect(a.cd).toBeGreaterThanOrEqual(15); expect(a.desc.length).toBeGreaterThan(40); }
  });

  it('wer führt aus: bevorzugte Offiziere, dann passende Rolle, dann jeder (nie die Schiffskatze); niemand bereit = −1', () => {
    const S = ASSIST_BY_ID.sperrfeuer, O = ASSIST_BY_ID.orkan, H = ASSIST_BY_ID.sturmhorn;
    const team = crew(['helm', 'unterstuetzung'], ['ram', 'tank'], ['bruno', 'schaden']);
    expect(pickOfficer(S, team)).toBe(2);
    expect(pickOfficer(O, team)).toBe(1);
    expect(pickOfficer(H, team)).toBe(0);
    expect(pickOfficer(O, crew(['fremd', 'tank'], ['xy', 'schaden']))).toBe(0);
    expect(pickOfficer(S, crew(['katze', 'keine']))).toBe(-1);
    expect(pickOfficer(S, [{ id: 'bruno', role: 'schaden', alive: false }])).toBe(-1);
  });

  it('Sperren mit deutschen Meldungen, Abklingzeit zählt herunter', () => {
    const st = newAssistState();
    const team = crew(['bruno', 'schaden']);
    const on = { onFoot: true, busy: false };
    expect(assistBlock(st, 0, team, on)).toBeNull();
    expect(assistBlock(st, 0, team, { onFoot: false, busy: false })).toBe('Nur an Land mit deinem Landtrupp.');
    expect(assistBlock(st, 0, [], on)).toBe('Kein Offizier im Landtrupp.');
    expect(assistBlock(st, 0, [{ id: 'bruno', role: 'schaden', alive: false }], on)).toBe('Alle Offiziere sind außer Gefecht.');
    expect(assistBlock(st, 0, team, { onFoot: true, busy: true })).toBe('Gerade nicht möglich.');
    st.cd[0] = OFFICER_ASSISTS[0].cd;
    expect(assistBlock(st, 0, team, on)).toBe(`Noch ${OFFICER_ASSISTS[0].cd} s.`);
    expect(assistCdFrac(st, 0)).toBe(1);
    stepAssists(st, 10.2);
    expect(assistBlock(st, 0, team, on)).toBe(`Noch ${Math.ceil(OFFICER_ASSISTS[0].cd - 10.2)} s.`);
    stepAssists(st, 99);
    expect(st.cd[0]).toBe(0);
    expect(assistBlock(st, 0, team, on)).toBeNull();
  });

  it('Ziel: erfasstes Ziel in Reichweite, sonst die dichteste Gruppe vor der Figur, sonst ein Punkt voraus; Salve streut im Zielkreis', () => {
    const S = ASSIST_BY_ID.sperrfeuer, out = { x: 0, z: 0 };
    const fx = [6, 7, 6.5, -3, 30], fz = [8, 8.5, 9, -2, 30];
    assistCenter(S, 0, 0, 0, { x: 2, z: 5 }, fx, fz, fx.length, out);
    expect(out).toEqual({ x: 2, z: 5 });
    assistCenter(S, 0, 0, 0, { x: 40, z: 40 }, fx, fz, fx.length, out);
    expect([fx.slice(0, 3)].flat()).toContain(out.x);
    assistCenter(S, 0, 0, 0, null, [], [], 0, out);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.z).toBeCloseTo(S.ahead, 9);
    const seen = new Set<string>();
    for (let k = 0; k < S.hits; k++) {
      salvoPoint(S, 10, -4, k, out);
      expect(Math.hypot(out.x - 10, out.z + 4)).toBeLessThanOrEqual(S.radius * 0.78 + 1e-9);
      seen.add(`${out.x.toFixed(3)},${out.z.toFixed(3)}`);
    }
    expect(seen.size).toBe(S.hits);
  });

  it('Wirkung: Salve bricht Haltung und hält Hochgeschleuderte in der Luft, Orkan schleudert hoch und öffnet die Sturm-Verfolgung, Horn heilt, füllt Willen und stärkt Trupps', () => {
    const S = ASSIST_BY_ID.sperrfeuer, O = ASSIST_BY_ID.orkan, H = ASSIST_BY_ID.sturmhorn;
    expect(S.poise).toBeGreaterThan(20);
    expect(S.airHold).toBeGreaterThan(O.airHold);
    expect(S.juggle).toBeGreaterThan(4);
    expect(S.launch).toBe(0);
    expect(O.launch).toBeGreaterThan(8);
    expect(O.chase).toBe(true);
    expect(H.heal).toBeGreaterThan(0.15);
    expect(H.heal).toBeLessThanOrEqual(0.3);
    expect(H.will).toBeGreaterThanOrEqual(25);
    expect(H.rally && H.rally.dur).toBeGreaterThanOrEqual(8);
    expect(H.rally && H.rally.dmg).toBeGreaterThan(1);
    expect(H.rally && H.rally.taken).toBeLessThan(1);
    // Schaden: Angriffswert × Faktor, Treue bis +20 %; Gesamtschaden höchstens ein kleiner Zusatz (≤ 2 Angriffe je Einsatz)
    expect(assistDamage(S, 100)).toBe(30);
    expect(assistDamage(S, 100, 1)).toBe(36);
    for (const a of OFFICER_ASSISTS) expect(assistBurst(a), a.id).toBeLessThanOrEqual(2);
    // Salve kommt vor dem Ende des Orkan-Fluges an (erster Einschlag unter 0,8 s): die Kombo Orkan → Salve hält Gegner länger oben
    expect(S.windup + 0.45).toBeLessThan(0.8);
  });
});

// ---------- Ein Punktetopf für N und K ----------

describe('4.6H gemeinsames Talent-Menü: ein Punktetopf für Talente und Faji-Techniken, Übernahme alter Faji-Punkte', () => {
  it('Topf = Stufen + Siegel + Bonus; Faji-Techniken zahlen aus demselben Topf', () => {
    const t = emptyTalents();
    expect(t.fajiMerged).toBe(true);
    t.bonus = 5;
    expect(poolTotal(t, 10)).toBe(talentTotal(t, 10) + 5);
    expect(freePoints(t, 10, 3)).toBe(talentTotal(t, 10) + 5 - 3);
    expect(grantBonus(t, 2)).toBe(2);
    expect(t.bonus).toBe(7);
    expect(techSpentOf({ eisenfaust: 2, eisenhaut: 9, unbekannt: 3 })).toBe(2 + 3);
    const c = techRespecCost(t, 30, 4);
    expect(c.gold).toBeGreaterThan(0);
    expect(c.seals).toBe(0);
    expect(techRespecCost(t, 30, 0).gold).toBe(0);
  });

  it('Übernahme: freie und gebundene alte Faji-Punkte werden Bonuspunkte – es geht nichts verloren, nur einmal', () => {
    const t = emptyTalents();
    t.fajiMerged = false;
    const skills = { sp: 3, learned: { eisenfaust: 2, eisenhaut: 1 } };
    const before = talentTotal(t, 20);
    expect(mergeFajiPoints(t, skills)).toBe(6);
    expect(t.bonus).toBe(6);
    expect(skills.sp).toBe(0);
    expect(t.fajiMerged).toBe(true);
    // frei bleibt genau, was vorher frei war: alte Talentpunkte plus die drei freien Faji-Punkte; die Techniken sind bezahlt
    expect(freePoints(t, 20, techSpentOf(skills.learned))).toBe(before + 3);
    expect(mergeFajiPoints(t, skills)).toBe(0);
    skills.sp = 2;
    expect(mergeFajiPoints(t, skills)).toBe(2);
    expect(t.bonus).toBe(8);
  });

  it('Spielstand 23 aus 4.6G lädt ohne Verlust: Talentränge, Faji-Formen, Techniken, Frisur und Hut bleiben; Version bleibt 23', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(23);
    const s = createSave('Alt', 'pirat', '4.6.8') as Record<string, any>;
    expect(s.talents.bonus).toBe(1);
    expect(s.talents.fajiMerged).toBe(true);
    expect(s.skills.sp).toBe(0);
    s.player.level = 30;
    s.player.faji = { equipped: 'feuer', mastery: { feuer: 900 }, aura: 1 };
    s.player.look = { ...s.player.look, hairModel: 'frisur_mehrlagig', hat: 'dreispitz', gender: 'female' };
    s.skills = { learned: { eisenfaust: 2, eisenhaut: 1 }, slots: ['eisenfaust', null, null], sp: 4, awakened: [] };
    // Stand aus 4.6G: noch kein gemeinsamer Topf
    delete s.talents.bonus;
    delete s.talents.fajiMerged;
    s.talents.nodes = { 'feuer.glutstand': 2 };
    const r = migrateSave(JSON.parse(JSON.stringify(s)), '4.6.9');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.data, t = d.talents!;
    expect(d.version).toBe(SAVE_VERSION);
    expect(t.bonus).toBe(4 + 3);
    expect(t.fajiMerged).toBe(true);
    expect(d.skills.sp).toBe(0);
    expect(d.skills.learned).toEqual({ eisenfaust: 2, eisenhaut: 1 });
    expect(t.nodes['feuer.glutstand']).toBe(2);
    expect(d.player.faji).toMatchObject({ equipped: 'feuer', aura: 1 });
    expect(d.player.look.hairModel).toBe('frisur_mehrlagig');
    expect(d.player.look.hat).toBe('dreispitz');
    expect(freePoints(t, d.player.level, techSpentOf(d.skills.learned))).toBe(talentTotal(t, d.player.level) + 4 - spentRegular(t));
    // Rundlauf: kein zweites Mal gutgeschrieben
    const again = migrateSave(JSON.parse(JSON.stringify(d)), '4.6.9');
    expect(again.ok && again.data.talents!.bonus).toBe(7);
  });

  it('Fenster: fünf Reiter, Vorschau auf Apex-Ultimate und Evolutionen, Zurücksetzen, Fortschritt 0/5 … 5/5 zur Aufstiegs-Prüfung', () => {
    expect(TALENT_CATS.map((c) => c.label)).toEqual(['Waffen-Meisterschaften', 'Faustkampf', 'Faji-Künste', 'Kapitän & Flotte', 'Stufe 101: Kosmos-Pfad']);
    const t = emptyTalents();
    const w = { level: 40, kaiserSeals: 0 };
    const html = talentScreenHtml({ t, w, xp: 0, xpNeed: 1, gold: 900 }, newTalentUi('zweihaender'));
    for (const c of TALENT_CATS) expect(html).toContain(`data-id="${c.id}"`);
    expect(html).toContain('Apex-Ultimate');
    expect(html).toContain('zurücksetzen');
    expect(html).toContain('0/5 Kaiser-Inseln besiegt');
    t.kaiserDefeated = KAISER_IDS.slice(0, 3);
    expect(talentScreenHtml({ t, w, xp: 0, xpNeed: 1, gold: 900 }, newTalentUi('kosmos'))).toContain('3/5 Kaiser-Inseln besiegt');
    // K öffnet die Faji-Künste: dieselbe Oberfläche, Reiter „Faji-Künste“ gewählt
    const faji = talentScreenHtml({ t, w, xp: 0, xpNeed: 1, gold: 900, tech: { learned: {}, slots: [null, null, null], awakened: [] } }, newTalentUi('feuer', 'faji'));
    expect(faji).toMatch(/data-id="faji"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-id="faji"/);
    expect(faji).toContain('Techniken');
  });
});

// ---------- Dächer, Wehrgänge, Zinnen ----------

/** Dreiecke (je 9 Zahlen) als Punktdaten wie bei three.js */
function geo(tris: number[]): GeoLike {
  return { getAttribute: () => ({ count: tris.length / 3, getX: (i: number) => tris[i * 3], getY: (i: number) => tris[i * 3 + 1], getZ: (i: number) => tris[i * 3 + 2] }), index: null };
}
/** waagrechtes Rechteck (y), zwei Dreiecke */
const flat = (x0: number, x1: number, z0: number, z1: number, y: number) => [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1];
/** Dachschräge von (z0, y0) nach (z1, y1) über x0 … x1 */
const slope = (x0: number, x1: number, z0: number, y0: number, z1: number, y1: number) => [x0, y0, z0, x1, y0, z0, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z1];
/** senkrechte Wand (keine Grundfläche: zählt nicht) */
const wall = (x0: number, x1: number, z: number, y0: number, y1: number) => [x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z];

describe('4.6H begehbare Dächer, Wehrgänge und Zinnen', () => {
  // Haus 4 × 3 m, Traufe 2,4 m (Überstand), First 3,6 m, Schornstein bis 4,4 m
  const house = buildRoofField([
    { geo: geo([...wall(-2, 2, -1.5, 0, 2.5), ...wall(-2, 2, 1.5, 0, 2.5)]), role: 'stone' },
    { geo: geo([...slope(-2.2, 2.2, -1.8, 2.4, 0, 3.6), ...slope(-2.2, 2.2, 1.8, 2.4, 0, 3.6)]), role: 'roof' },
    { geo: geo(flat(0.8, 1.2, 0.4, 0.8, 4.4)), role: 'stone' },
    { geo: geo(flat(-3, 3, -3, 3, 9)), role: 'cloth' },
  ])!;
  const g0 = 1.0, yaw = 0.5, hx = 10, hz = 20;
  const roof = placeRoof(house, hx, g0, hz, yaw);
  const W = (lx: number, lz: number) => ({ x: hx + lx * roof.c + lz * roof.s, z: hz - lx * roof.s + lz * roof.c });

  it('Dachfeld: oberste Flächen je Zelle, Wände und Tuch zählen nicht; Schrägen glatt, Kanten (Schornstein) kantig', () => {
    expect(house.top).toBeCloseTo(4.4, 5);
    expect(house.low).toBeGreaterThan(2.3);
    const c = W(0, 0);
    // First: glatt gemittelt (bilinear über die Zellen beiderseits), höchstens 10 cm unter der Kante
    expect(Math.abs(roofHeight(roof, c.x, c.z) - (g0 + 3.6))).toBeLessThan(0.1);
    const e = W(0, -1.6);
    expect(roofHeight(roof, e.x, e.z)).toBeCloseTo(g0 + 2.4 + 1.2 * (0.2 / 1.8), 1);
    const ch = W(1.0, 0.6);
    expect(roofHeight(roof, ch.x, ch.z)).toBeCloseTo(g0 + 4.4, 5);
    const out = W(3, 0);
    expect(roofHeight(roof, out.x, out.z)).toBeNaN();
    expect(roof.eave).toBeCloseTo(g0 + house.low, 9);
  });

  const island = (): { g: IslandGround; isl: WalkIsland } => {
    const g = new IslandGround();
    const isl: WalkIsland = { x: 0, z: 0, r: 200, beachY: g0, hillY: g0, coast: [], hills: [], shelf: shelfOf(200), blockers: [] };
    g.add(isl);
    return { g, isl };
  };

  it('Boden mit Höhenhinweis: auf dem Dach das Dach, darunter der Boden; ohne Hinweis (Gegner, Kamera) immer der Boden', () => {
    const { g, isl } = island();
    const ground = g.height(hx, hz);
    isl.roofs = [{ ...roof, y: ground, eave: ground + house.low }];
    const r: Roof = isl.roofs[0];
    const top = roofHeight(r, hx, hz);
    expect(g.height(hx, hz)).toBe(ground);
    expect(g.height(hx, hz, top + 0.05)).toBeCloseTo(top, 6);
    expect(g.height(hx, hz, top - 0.4)).toBeCloseTo(top, 6);
    expect(g.height(hx, hz, ground + 0.05)).toBe(ground);
    // Kante höher als eine Stufe über den Füßen: zählt nicht (Figur steht darunter / prallt ab)
    expect(g.height(hx, hz, top - ROOF.step - 0.2)).toBe(ground);
  });

  it('Wände sperren unten, über der Traufe läuft man frei; Schornstein und höhere Dachteile sind oben die Wand', () => {
    const { g, isl } = island();
    const ground = g.height(hx, hz);
    const r: Roof = { ...roof, y: ground, eave: ground + house.low };
    isl.roofs = [r];
    const top = roofMinOver(r, hx, hz, 2, 1.5, yaw);
    expect(top).toBeGreaterThan(ground + 2.3);
    isl.blockers.push({ x: hx, z: hz, r: Math.hypot(2, 1.5), hw: 2, hd: 1.5, yaw, top });
    // vom Boden gegen die Wand: herausgeschoben
    const inWall = W(0, -1.2);
    const c = g.constrain(inWall.x, inWall.z, 0.35, ground);
    const lz = (c.x - hx) * roof.s + (c.z - hz) * roof.c;
    expect(lz).toBeLessThanOrEqual(-1.5 - 0.35 + 1e-3);
    // auf Traufhöhe über der Wand: frei (die Wand liegt unter den Füßen)
    const eaveP = W(0, -1.4), yE = roofHeight(r, eaveP.x, eaveP.z);
    const c2 = g.constrain(eaveP.x, eaveP.z, 0.35, yE);
    expect(Math.hypot(c2.x - eaveP.x, c2.z - eaveP.z)).toBeLessThan(1e-6);
    // auf dem Dach in den Schornstein: zurück auf begehbares Dach (Kante höchstens eine Stufe über den Füßen)
    const nearCh = W(1.0, 0.25), yR = roofHeight(r, nearCh.x, nearCh.z), into = W(1.0, 0.6);
    const c3 = g.constrain(into.x, into.z, 0.3, yR);
    expect(roofHeight(r, c3.x, c3.z)).toBeLessThanOrEqual(yR + ROOF.step + 1e-6);
    expect(Math.hypot(c3.x - into.x, c3.z - into.z)).toBeGreaterThan(0.05);
  });

  it('Zinnenmauer: Wehrgang begehbar, Zinnen sind Wände, Scharten eine Stufe; vom Boden aus bleibt die Mauer zu', () => {
    const merlons: number[] = [];
    for (const x0 of [-2.5, -0.5, 1.5]) merlons.push(...flat(x0, x0 + 1, 0.8, 1.2, 6.6));
    const crenels: number[] = [];
    for (const x0 of [-3, -1.5, 0.5, 2.5]) crenels.push(...flat(x0, x0 + 0.5, 0.8, 1.2, 5.9));
    const f = buildRoofField([{ geo: geo([...flat(-3, 3, -0.8, 0.8, 5.5), ...flat(-3, 3, -1.2, -0.8, 5.9)]), role: 'stone' }, { geo: geo([...merlons, ...crenels]), role: 'stone' }])!;
    const { g, isl } = island();
    const ground = g.height(-40, 30);
    const r = placeRoof(f, -40, ground, 30, 0);
    isl.roofs = [r];
    isl.blockers.push({ x: -40, z: 30, r: Math.hypot(3, 1.2), hw: 3, hd: 1.2, yaw: 0, top: roofMinOver(r, -40, 30, 3, 1.2, 0) });
    const walk = ground + 5.5;
    // Wehrgang: Stehen und Laufen in Längsrichtung (gleiche Höhe)
    for (const x of [-2.6, -1, 0, 1.2, 2.6]) expect(g.height(-40 + x, 30, walk), `x ${x}`).toBeCloseTo(walk, 6);
    // Zinne: wirkt als Wand – ein Schritt vom Wehrgang hinein endet wieder auf dem Wehrgang
    const c = g.constrain(-40, 30.88, 0.3, walk);
    expect(roofHeight(r, c.x, c.z)).toBeLessThanOrEqual(walk + ROOF.step + 1e-6);
    expect(c.z).toBeLessThan(30.8 + 1e-6);
    // Scharte (0,4 m höher): eine Stufe, betretbar
    expect(g.height(-40 + 0.75, 31.0, walk)).toBeCloseTo(ground + 5.9, 6);
    // vom Boden aus: die Mauer sperrt
    const c2 = g.constrain(-40, 30.5, 0.35, ground);
    expect(Math.abs(c2.z - 30)).toBeGreaterThanOrEqual(1.2 + 0.35 - 1e-3);
  });
});

// ---------- Himmelssturz ----------

describe('4.6H Himmelssturz: Einschläge mindestens 28 m vom eigenen Rumpf', () => {
  const flag: ShipFootprint = { x: 0, z: 0, heading: 0.3, L: 40, W: 11 };
  const escort: ShipFootprint = { x: 30, z: -10, heading: 0.3, L: 24, W: 7 };

  it('an Deck in jede Blickrichtung: alle drei Einschlagpunkte (zwei Meteore, Planet) ≥ 28 m vom Rumpf jedes eigenen Schiffs, Verschiebung minimal', () => {
    expect(SKYFALL_SHIP_CLEAR).toBe(28);
    for (let k = 0; k < 32; k++) {
      const yaw = (k / 32) * Math.PI * 2;
      for (const [px, pz] of [[0, 0], [4, 12], [-2, -15]]) {
        const ships = [flag, escort];
        const s = skyfallShift(px, pz, yaw, ships);
        const clear = (sh: number) => Math.min(...SKYFALL_OFFSETS.map((o) => fleetClearance(px + Math.sin(yaw) * (o + sh), pz + Math.cos(yaw) * (o + sh), ships)));
        expect(clear(s), `yaw ${yaw.toFixed(2)} (${px}, ${pz})`).toBeGreaterThanOrEqual(SKYFALL_SHIP_CLEAR - 1e-3);
        if (s > 0.01) expect(clear(s - 0.05)).toBeLessThan(SKYFALL_SHIP_CLEAR);
      }
    }
  });

  it('an Land oder auf freier See: keine Verschiebung; Abstand zum Rumpf als Rechteck', () => {
    expect(skyfallShift(0, 0, 0, [])).toBe(0);
    expect(skyfallShift(300, 300, 0, [flag])).toBe(0);
    expect(hullClearance(0, 0, flag)).toBe(0);
    const side = { x: Math.cos(0.3) * (5.5 + 10), z: -Math.sin(0.3) * (5.5 + 10) };
    expect(hullClearance(side.x, side.z, flag)).toBeCloseTo(10, 6);
  });
});
