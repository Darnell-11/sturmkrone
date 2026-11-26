// Phase 4.7D.1 – Prolog-Feinschliff und dreistufiger Einstieg:
//  - die sieben Admirals-Flaggschiffe zeigen mit Bug und Galionsfigur frontal auf „Die Schwarze Krone“ (Gewitterfront, Szene 2; Schlachtreihe
//    und Sieben-Farben-Strahl, Szenen 4 – 6), der Strahl wird von den vorderen Decks aus gebündelt;
//  - butterweiche Regie-Kamera (Verläufe ohne Knick, gedämpfte Blickrichtung, stetiger Sichtfeld-Stoß, weiche Wasser-Untergrenze);
//  - Einstieg VS-Face-Off (Marine gesperrt / Piraten spielbar) → Aussehens-Editor ohne Klassen- und Waffenwahl → Klassen-, Formen- &
//    Ultimate-Showcase → „Abenteuer starten“.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CatmullRomCurve3, Vector3 } from 'three';
import { ADMIRALS, FLEET, SCHWARZBART, SHOTS } from '../src/data/prologue';
import { bowDeck, bowError, crownBearing, fleetFacing, frameToWorld, headingToward, type StageFrame } from '../src/world/prologueGeo';
import { CINE_DAMP, CineDamp, SHOT_ARC_DIVISIONS, easeSlope, punchOffset, shotEase, smoothDamp, smoothMax } from '../src/graphics/cineSmooth';
import { SHIP_CLASSES } from '../src/data/ships';
import {
  ADMIRAL_FIGURES, BACK_SCALE, CREATION_STEPS, CreationFlow, FACE_OFF_CAM, FACE_OFF_SIDES, MARINE_LOCK_TEXT, PIRATE_CAPTAINS, PIRATE_FIGURES,
  RECRUITS, RECRUIT_SCALE, creationOfSpec, faceOffBuildOrder, pickSide,
} from '../src/data/creationFlow';
import { ROMAN, SHOWCASE_GROUPS, SHOWCASE_SLOW, SPEC_STRENGTHS, previewLength, previewScript, showcaseOf } from '../src/data/classShowcase';
import { SPECS, SPEC_IDS, ULT_NODE, classBase, classOfCreation, classSpec, type RoleTag } from '../src/data/classes';
import { ULTIMATE_CINEMATICS, cineTotal } from '../src/graphics/ultimateCinematics';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const SLOTS = ADMIRALS.map((a) => a.slot);
const ROLES: readonly RoleTag[] = ['DPS', 'Tank-DPS', 'Assassinen-DPS', 'Kombo-DPS', 'Midrange-DPS', 'Elementar-DPS', 'DPS/Heal'];

/** Stadt-Rahmen und Lage der Krone wie im Prolog: die Krone 2 600 m hinter Grünmarkt (bevorzugte Richtung `crownBearing`) */
function stage(townH = 0.6): { town: StageFrame; crown: { x: number; z: number; heading: number } } {
  const town: StageFrame = { x: 3200, z: -1800, h: townH };
  const a = crownBearing(town);
  const cx = town.x + Math.sin(a) * 2600, cz = town.z + Math.cos(a) * 2600;
  // Kurs der Krone wie `sea.h` in prologueLive: vom Ort aus weg von der Stadt
  return { town, crown: { x: cx, z: cz, heading: Math.atan2(town.x - cx, town.z - cz) + Math.PI } };
}

describe('4.7D.1 · Admirals-Flaggschiffe: Bug und Galionsfigur frontal auf die Schwarze Krone', () => {
  it('Szene 2 (Gewitterfront): alle sieben Bugs zeigen exakt auf die Krone – und damit zugleich zur Stadt und zur Kamera auf den Dächern', () => {
    for (const h of [0, 0.6, 2.1, -2.7]) {
      const { town, crown } = stage(h);
      const poses = fleetFacing(town, SLOTS, FLEET.silhouetteGap, FLEET.silhouetteZ, 26, crown.x, crown.z);
      expect(poses).toHaveLength(7);
      for (const p of poses) {
        expect(bowError(p.x, p.z, p.heading, crown.x, crown.z)).toBeLessThan(1e-6);
        // die Stadt (und die Kamera auf ihren Dächern) liegt vor dem Bug, nicht hinter dem Heck
        expect(bowError(p.x, p.z, p.heading, town.x, town.z)).toBeLessThan(0.35);
      }
      // Fächer: die äußeren Schiffe sind zur Mitte eingedreht, das Flaggschiff des Großadmirals (Platz 0) fährt gerade auf die Krone zu
      const mid = poses[SLOTS.indexOf(0)];
      expect(Math.abs(Math.sin(mid.heading - (town.h + Math.PI)))).toBeLessThan(1e-6);
    }
  });

  it('Szenen 4 – 6 (Schlachtreihe, Sieben-Farben-Strahl): Bugs frontal auf die Krone – die alte Aufstellung zeigte ihr das Heck', () => {
    const { crown } = stage();
    const f: StageFrame = { x: crown.x, z: crown.z, h: crown.heading };
    const poses = fleetFacing(f, SLOTS, FLEET.aheadGap, FLEET.aheadZ, 18, crown.x, crown.z);
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i];
      expect(bowError(p.x, p.z, p.heading, crown.x, crown.z)).toBeLessThan(1e-6);
      // vorher: gleicher Kurs wie die Krone (yaw 0 im Rahmen) – der Bug zeigte von ihr weg
      expect(bowError(p.x, p.z, crown.heading, crown.x, crown.z)).toBeGreaterThan(2.5);
      // die Schlachtreihe steht voraus (vor dem Bug der Krone)
      expect(bowError(crown.x, crown.z, crown.heading, p.x, p.z)).toBeLessThan(Math.PI / 2);
    }
  });

  it('Szene 4: die Reihe weicht im gleichen Tempo wie die Krone zurück – die Ausrichtung bleibt exakt', () => {
    const { crown } = stage();
    const f: StageFrame = { x: crown.x, z: crown.z, h: crown.heading };
    const poses = fleetFacing(f, SLOTS, FLEET.aheadGap, FLEET.aheadZ, 18, crown.x, crown.z);
    const dx = Math.sin(crown.heading) * 8.5 * 30, dz = Math.cos(crown.heading) * 8.5 * 30;
    for (const p of poses) expect(bowError(p.x + dx, p.z + dz, p.heading, crown.x + dx, crown.z + dz)).toBeLessThan(1e-6);
  });

  it('Szene 5: der Strahl wird von den VORDEREN Decks in den Kern gebündelt und schlägt von dort aus in die Krone', () => {
    const { crown } = stage();
    const f: StageFrame = { x: crown.x, z: crown.z, h: crown.heading };
    const poses = fleetFacing(f, SLOTS, FLEET.aheadGap, FLEET.aheadZ, 18, crown.x, crown.z);
    const cls = SHIP_CLASSES[FLEET.admiralTier];
    const deckY = 3;
    const conv = frameToWorld(f, 0, 0, FLEET.aheadZ - 46, { x: 0, y: 0, z: 0 });
    for (const p of poses) {
      const b = bowDeck(p.x, p.z, p.heading, cls.L, deckY, FLEET.scale, { x: 0, y: 0, z: 0 });
      const dCenter = Math.hypot(p.x - crown.x, p.z - crown.z), dBow = Math.hypot(b.x - crown.x, b.z - crown.z);
      // das Bugdeck liegt näher an der Krone als die Schiffsmitte (vorderes Deck), über der Wasserlinie
      expect(dBow).toBeLessThan(dCenter - cls.L * 0.3);
      expect(b.y).toBeGreaterThan(deckY * FLEET.scale);
      // der Kern liegt zwischen den Bugdecks und der Krone: die Auren strömen nach vorn, nie zurück über das eigene Schiff
      expect(Math.hypot(conv.x - crown.x, conv.z - crown.z)).toBeLessThan(dBow);
    }
    // der Strahl selbst läuft vom Kern zurück auf die Krone (gegen ihre Fahrtrichtung)
    const beam = Math.atan2(crown.x - conv.x, crown.z - conv.z);
    expect(Math.abs(Math.sin(beam - (crown.heading + Math.PI)))).toBeLessThan(1e-6);
  });

  it('headingToward und bowError sind Gegenstücke', () => {
    for (const [x, z, tx, tz] of [[0, 0, 10, 0], [5, 5, -3, 20], [100, -40, 100, -400]]) expect(bowError(x, z, headingToward(x, z, tx, tz), tx, tz)).toBeLessThan(1e-9);
  });

  it('die Regie nutzt die Ausrichtung überall (keine Admirals-Aufstellung mehr mit festem Kurs im Rahmen)', () => {
    const live = src('world/prologueLive.ts');
    expect(live).toMatch(/placeSilhouettes\(\) \{[\s\S]{0,400}fleetFacing\(this\.town/);
    expect(live).toMatch(/placeAhead\(\) \{[\s\S]{0,600}fleetFacing\(f, ADM_SLOTS/);
    expect(live).not.toMatch(/FLEET\.aheadZ \+ Math\.abs\(ADMIRALS\[i\]\.slot\) \* 18, 0\)/);
    expect(live).not.toMatch(/FLEET\.silhouetteZ \+ Math\.abs\(ADMIRALS\[i\]\.slot\) \* 26, Math\.PI\)/);
    // Aufladung und Schuss gehen von den Bugdecks aus
    expect(live.match(/bowDeck\(e\.ship\.x, e\.ship\.z, e\.ship\.heading/g)?.length).toBeGreaterThanOrEqual(2);
    // die Krone liegt hinter Grünmarkt
    expect(live).toMatch(/openSea\(a, 2600, crownBearing\(this\.town\)\)/);
  });
});

describe('4.7D.1 · butterweiche Regie-Kamera', () => {
  it('Verläufe beginnen bei 0, enden bei 1, steigen stetig und laufen ohne Ruck ein bzw. aus', () => {
    for (const e of ['linear', 'ease', 'in', 'out'] as const) {
      expect(shotEase(0, e)).toBeCloseTo(0, 9);
      expect(shotEase(1, e)).toBeCloseTo(1, 9);
      let prev = 0;
      for (let i = 1; i <= 400; i++) { const v = shotEase(i / 400, e); expect(v).toBeGreaterThanOrEqual(prev - 1e-12); expect(v - prev).toBeLessThan(0.02); prev = v; }
    }
    // Ein- und Auslauf: quintisch (Geschwindigkeit an beiden Enden 0)
    expect(easeSlope(0, 'ease')).toBeLessThan(0.01);
    expect(easeSlope(1, 'ease')).toBeLessThan(0.01);
    // „in“ endet am Schnitt sanfter als die alte Parabel (Steigung 2), „out“ setzt sanfter ein
    expect(easeSlope(1, 'in')).toBeLessThan(1.65);
    expect(easeSlope(0, 'out')).toBeLessThan(1.65);
    expect(easeSlope(1, 'out')).toBeLessThan(0.01);
  });

  it('jede Fahrt der Regie (SHOTS) gleitet bei 60 Bildern/s ohne Sprung – kein Bild springt mehr als das 2,5-Fache des Mittels', () => {
    for (const [id, def] of Object.entries(SHOTS)) {
      const v = (p: readonly number[]) => new Vector3(p[0], p[1], p[2]);
      const path = new CatmullRomCurve3(def.path.map(v), false, 'centripetal');
      path.arcLengthDivisions = SHOT_ARC_DIVISIONS;
      path.updateArcLengths();
      const n = Math.max(2, Math.round(def.dur * 60));
      const pts: Vector3[] = [];
      for (let i = 0; i <= n; i++) pts.push(path.getPointAt(shotEase(i / n, def.ease)));
      const steps = pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
      const mean = steps.reduce((s, x) => s + x, 0) / steps.length;
      if (mean < 1e-6) continue;
      // Geschwindigkeit ändert sich von Bild zu Bild nur wenig (kein Ruck): größter Sprung der Schrittweite relativ zum Mittel
      let jerk = 0;
      for (let i = 1; i < steps.length; i++) jerk = Math.max(jerk, Math.abs(steps[i] - steps[i - 1]) / mean);
      expect(Math.max(...steps) / mean, `${id}: Ausreißer`).toBeLessThan(2.5);
      expect(jerk, `${id}: Ruck`).toBeLessThan(0.25);
    }
  });

  it('kritisch gedämpfte Feder: läuft ohne Überschwingen ins Ziel, unabhängig von der Bildrate', () => {
    for (const fps of [30, 60, 144]) {
      const vel = { v: 0 };
      let x = 0, max = 0;
      for (let i = 0; i < fps * 2; i++) { x = smoothDamp(x, 1, vel, 0.12, 1 / fps); max = Math.max(max, x); }
      expect(max).toBeLessThanOrEqual(1 + 1e-9);
      expect(x).toBeGreaterThan(0.999);
    }
    // gleicher Stand nach 0,1 s bei 30 und 144 Bildern/s (±3 %)
    const at = (fps: number) => { const vel = { v: 0 }; let x = 0; for (let i = 0; i < Math.round(fps * 0.1); i++) x = smoothDamp(x, 1, vel, 0.12, 1 / fps); return x; };
    expect(Math.abs(at(30) - at(144))).toBeLessThan(0.03);
  });

  it('CineDamp: ein Schnitt übernimmt sofort, innerhalb einer Einstellung dreht der Blick weich (selbst ein 90°-Ruck verteilt sich über viele Bilder)', () => {
    const d = new CineDamp();
    d.cut();
    d.step(1 / 60, 0, 0, 1, 40);
    expect(d.dz).toBeCloseTo(1, 9);
    expect(d.fov).toBe(40);
    // plötzlicher 90°-Ruck des Ziels: die Kamera folgt weich
    let prevX = d.dx, prevZ = d.dz, maxDeg = 0, half = -1;
    for (let i = 0; i < 60; i++) {
      d.step(1 / 60, 1, 0, 0, 60);
      const deg = (Math.acos(Math.min(1, prevX * d.dx + prevZ * d.dz)) * 180) / Math.PI;
      maxDeg = Math.max(maxDeg, deg);
      if (half < 0 && d.dx > Math.SQRT1_2) half = i;
      prevX = d.dx; prevZ = d.dz;
    }
    expect(maxDeg).toBeLessThan(12);
    expect(half).toBeGreaterThanOrEqual(4);
    expect(d.dx).toBeGreaterThan(0.995);
    expect(d.fov).toBeGreaterThan(59);
    expect(Math.hypot(d.dx, d.dy, d.dz)).toBeCloseTo(1, 9);
    // neuer Schnitt: sofort am Ziel
    d.cut();
    d.step(1 / 60, 0, 1, 0, 30);
    expect(d.dy).toBeCloseTo(1, 9);
    expect(CINE_DAMP.dir).toBeLessThan(0.15);
  });

  it('Sichtfeld-Stoß ist eine stetige, gedämpfte Schwingung (vorher ein Sprung von 6,5° in einem Bild)', () => {
    const old = (p: number) => p * 9 * (p > 0.6 ? -1 : 1) * 0.6;
    let maxNew = 0, maxOld = 0, prevN = punchOffset(1), prevO = old(1);
    for (let p = 1; p >= 0; p -= 2.2 / 60) {
      maxNew = Math.max(maxNew, Math.abs(punchOffset(p) - prevN)); prevN = punchOffset(p);
      maxOld = Math.max(maxOld, Math.abs(old(p) - prevO)); prevO = old(p);
    }
    expect(maxOld).toBeGreaterThan(6);
    expect(maxNew).toBeLessThan(2.2);
    expect(punchOffset(1)).toBe(0);
    expect(punchOffset(0)).toBe(0);
    // erst eng (negativ), dann weit
    expect(Math.min(...Array.from({ length: 50 }, (_, i) => punchOffset(1 - i / 100)))).toBeLessThan(-1);
  });

  it('weiche Wasser-Untergrenze: nie unter der Grenze, ohne Knick', () => {
    for (let y = -3; y <= 3; y += 0.01) expect(smoothMax(y, 0, CINE_DAMP.waterSoft)).toBeGreaterThanOrEqual(Math.max(y, 0) - 1e-12);
    let maxSlope = 0, prevSlope = 0;
    for (let y = -2; y <= 2; y += 0.01) { const s = (smoothMax(y + 0.01, 0, 0.9) - smoothMax(y, 0, 0.9)) / 0.01; if (y > -2) maxSlope = Math.max(maxSlope, Math.abs(s - prevSlope)); prevSlope = s; }
    expect(maxSlope).toBeLessThan(0.05);
  });

  it('die Regie nutzt Glättung, stetigen Stoß, weiche Untergrenze und feine Bogenlängen', () => {
    const live = src('world/prologueLive.ts');
    expect(live).toMatch(/path\.arcLengthDivisions = SHOT_ARC_DIVISIONS/);
    expect(live).toMatch(/this\.damp\.cut\(\)/);
    expect(live).toMatch(/D\.step\(frameDt/);
    expect(live).toMatch(/punchOffset\(this\.fovPunch\)/);
    expect(live).toMatch(/smoothMax\(this\.camPos\.y, wy, CINE_DAMP\.waterSoft\)/);
    expect(live).not.toMatch(/this\.fovPunch > 0\.6 \? -1 : 1/);
  });
});

describe('4.7D.1 · Stufe A: VS-Face-Off Marine gegen Piraten', () => {
  it('die Marine ist gesperrt (Info-Meldung, startet nichts), die Piraten sind spielbar', () => {
    expect(FACE_OFF_SIDES.marine.locked).toBe(true);
    expect(FACE_OFF_SIDES.marine.lockText).toBe('Marine-Pfad — Kommt in einem späteren Story-Update');
    expect(MARINE_LOCK_TEXT).toBe(FACE_OFF_SIDES.marine.lockText);
    expect(FACE_OFF_SIDES.pirat.locked).toBe(false);
    const m = pickSide('marine');
    expect(m.ok).toBe(false);
    expect(m.faction).toBeNull();
    expect(m.message).toMatch(/Marine-Pfad|versiegelt/);
    expect(pickSide('pirat')).toEqual({ ok: true, faction: 'pirat', message: '' });
  });

  it('Aufstellung: Rekruten kompakt im Vordergrund, sieben Admirals-Silhouetten links, Schwarzbart + sechs Kapitäne rechts', () => {
    expect(RECRUIT_SCALE).toBeLessThan(1);
    expect(RECRUITS.marine.x).toBeLessThan(0);
    expect(RECRUITS.pirat.x).toBeGreaterThan(0);
    expect(ADMIRAL_FIGURES).toHaveLength(7);
    expect(ADMIRAL_FIGURES.map((f) => f.color)).toEqual(ADMIRALS.map((a) => a.color));
    for (const f of ADMIRAL_FIGURES) { expect(f.x).toBeLessThan(0); expect(f.z).toBeLessThan(RECRUITS.marine.z - 3); expect(f.back).toBe(true); expect(f.scale).toBeGreaterThan(RECRUIT_SCALE); }
    expect(PIRATE_FIGURES).toHaveLength(7);
    expect(PIRATE_CAPTAINS[0].name).toBe(SCHWARZBART.name);
    for (const f of PIRATE_FIGURES) { expect(f.x).toBeGreaterThan(0); expect(f.z).toBeLessThan(RECRUITS.pirat.z - 3); expect(f.back).toBe(true); }
    // Schwarzbart überragt alle
    expect(PIRATE_FIGURES[0].scale).toBe(Math.max(...PIRATE_FIGURES.map((f) => f.scale), ...ADMIRAL_FIGURES.map((f) => f.scale)));
    expect(BACK_SCALE).toBeGreaterThan(RECRUIT_SCALE);
    const ids = faceOffBuildOrder().map((f) => f.id);
    expect(new Set(ids).size).toBe(16);
    expect(ids.slice(0, 2)).toEqual([RECRUITS.marine.id, RECRUITS.pirat.id]);
    // eigene Namen, deutsch, keine Doppelungen
    const names = [...ADMIRAL_FIGURES, ...PIRATE_FIGURES].map((f) => f.name);
    expect(new Set(names).size).toBe(14);
    for (const n of names) expect(n).toMatch(/^(Admiral|Admiralin|Großadmiral|Kapitän|Kapitänin) /);
    expect(FACE_OFF_CAM.zoomDur).toBeLessThan(1.2);
  });

  it('die Bühne erbt das Studio des Editors (gleiche Lichter → keine neuen Shader-Programme) und hat keinen Szenen-Nebel', () => {
    for (const f of ['world/faceOffStage.ts', 'world/showcaseStage.ts']) {
      const s = src(f);
      expect(s).toMatch(/extends EditorStage/);
      expect(s).not.toMatch(/scene\.fog|new Fog|PointLight\(|DirectionalLight\(|ShaderMaterial/);
    }
    // Silhouetten über die Effekt-Kopien (gleiches Programm), nicht über eigene Materialien
    expect(src('world/faceOffStage.ts')).toMatch(/setTint\(/);
  });

  it('Oberfläche: Riss, VS-Emblem, Schloss mit Hinweis, Zoom mit Speedlines; volle Schichten lassen Zeiger durch', () => {
    const ui = src('ui/faceOffScreen.ts');
    expect(ui).toMatch(/fo-rift/);
    expect(ui).toMatch(/>VS</);
    expect(ui).toMatch(/fo-lock/);
    expect(ui).toMatch(/fo-speed/);
    const css = src('ui/css/creation.css');
    for (const cls of ['faceoff', 'showcase', 'creation-flash']) expect(css).toMatch(new RegExp(`\\.${cls} \\{[^}]*pointer-events: none !important`));
    expect(src('main.ts')).toMatch(/import '\.\/ui\/css\/creation\.css';/);
  });
});

describe('4.7D.1 · Ablauf: Face-Off → Aussehen (ohne Waffen) → Klassen-Showcase → Prolog', () => {
  it('Zustandsmaschine: nur die Piraten führen weiter, zurück führt Schritt für Schritt, Start liefert Klasse und Klinge', () => {
    expect(CREATION_STEPS).toEqual(['faceoff', 'aussehen', 'klasse']);
    const f = new CreationFlow();
    expect(f.step).toBe('faceoff');
    expect(f.toClasses()).toBe(false);
    expect(f.pick('marine').ok).toBe(false);
    expect(f.step).toBe('faceoff');
    expect(f.state.lockedClicks).toBe(1);
    expect(f.pick('pirat').ok).toBe(true);
    expect(f.step).toBe('aussehen');
    expect(f.state.faction).toBe('pirat');
    expect(f.start()).toBeNull();
    expect(f.toClasses()).toBe(true);
    expect(f.step).toBe('klasse');
    expect(f.preview('langschwert')).toBe(true);
    expect(f.back()).toBe(true);
    expect(f.step).toBe('aussehen');
    f.toClasses();
    f.preview('eis');
    const r = f.start();
    expect(r).toMatchObject({ faction: 'pirat', style: 'effekt', base: 'faji', spec: 'eis' });
    expect(f.step).toBe('start');
    // zurück bis zum Face-Off
    const g = new CreationFlow();
    g.pick('pirat');
    expect(g.back()).toBe(true);
    expect(g.step).toBe('faceoff');
    expect(g.state.faction).toBeNull();
    expect(g.back()).toBe(false);
  });

  it('jede der 15 Klassen ergibt bei der Erschaffung die richtige feste Klasse (Schwert: die Klinge; Faust/Faji: Pfad in der Einführung)', () => {
    for (const id of SPEC_IDS) {
      const c = creationOfSpec(id);
      const cls = classOfCreation(c.style, c.blade);
      expect(classBase(cls)).toBe(SPECS[id].base);
      if (SPECS[id].base === 'schwert') expect(classSpec(cls)).toBe(id);
      else expect(classSpec(cls)).toBeNull();
    }
  });

  it('Stufe B ist ein reiner Aussehens-Editor: keine Klassen-, Stil-, Waffen- oder Fraktionswahl, Knopf „Weiter zur Klassenwahl“', () => {
    const ed = src('ui/editor.ts');
    expect(ed).not.toMatch(/data-a="style"|data-a="blade"|data-a="faction"|classPicker|Klingenform/);
    expect(ed).toMatch(/Weiter zur Klassenwahl/);
    // Vorschau unbewaffnet, ohne Angriffs-Knöpfe
    expect(ed).toMatch(/this\.o\.isNew \? 'faust'/);
    expect(ed).toMatch(/o\.isNew \? '' : '<button class="mini" data-p="attack">/);
    // Aussehen bleibt vollständig: Körperbau, Geschlecht, Gesicht, Frisur, Bart, Hut, Kleidung, Mantel
    for (const k of ["'Statur'", "'Geschlecht'", "'Augenfarbe'", "'Frisur'", "'Bart'", "'Kopfbedeckung'", "'Oberteil'", "'Mantel'"]) expect(ed).toContain(k);
  });

  it('Game: „Neues Spiel“ öffnet den Face-Off; Editor → Showcase; „Abenteuer starten“ beginnt das Spiel (und damit den Prolog)', () => {
    expect(src('ui/menus.ts')).toMatch(/new: \(id\) => g\.openCreation\(\+id\)/);
    const game = src('core/game.ts');
    expect(game).toMatch(/if \(isNew && this\.creation\) \{ this\.stage = null; this\.openShowcase\(newSlot!, r\); return; \}/);
    expect(game).toMatch(/onStart: \(spec\) => \{[\s\S]{0,700}void this\.newGame\(slot, out\)/);
    expect(game).toMatch(/st\.zoomTo\(side\)/);
  });
});

describe('4.7D.1 · Stufe C: Klassen-, Formen- & Ultimate-Showcase', () => {
  it('zeigt alle spielbaren Klassen und Pfade: Faust (2), Schwert (4 Klingen), Faji (8 Elemente + Priester)', () => {
    expect(SHOWCASE_GROUPS.map((g) => g.label)).toEqual(['Faustkämpfer', 'Schwertkämpfer', 'Faji-Wirker']);
    expect(SHOWCASE_GROUPS.map((g) => g.specs.length)).toEqual([2, 4, 9]);
    expect(SHOWCASE_GROUPS.flatMap((g) => g.specs).sort()).toEqual([...SPEC_IDS].sort());
    expect(SHOWCASE_GROUPS[2].specs).toContain('priester');
  });

  it('jede Klasse: MMO-Rolle, Stärken, alle zehn Formen (I – X) mit Symbol und Kurzbeschreibung, Level-60-Ultimate mit 3-Akt-Choreografie', () => {
    for (const id of SPEC_IDS) {
      const e = showcaseOf(id);
      expect(ROLES).toContain(e.role);
      expect(e.roleInfo.length).toBeGreaterThan(5);
      expect(SPEC_STRENGTHS[id].length).toBeGreaterThanOrEqual(3);
      for (const s of e.strengths) expect(s.length).toBeGreaterThan(8);
      expect(e.forms).toHaveLength(10);
      expect(e.forms.map((f) => f.nr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(e.forms.map((f) => f.roman)).toEqual(ROMAN);
      for (const f of e.forms) { expect(f.icon.length).toBeGreaterThan(0); expect(f.label.length).toBeGreaterThan(1); expect(f.desc.length).toBeGreaterThan(10); expect(f.clip.length).toBeGreaterThan(2); }
      expect(ULTIMATE_CINEMATICS[e.ultimate.kind]).toBeDefined();
      expect(e.ultimate.beats).toHaveLength(3);
      expect(e.ultimate.node).toBe(ULT_NODE);
      expect(e.ultimate.dur).toBeCloseTo(cineTotal(ULTIMATE_CINEMATICS[e.ultimate.kind]), 9);
      expect(e.combo.length).toBeGreaterThanOrEqual(2);
    }
    // jede Spezialisierung hat ihr eigenes Ultimate
    expect(new Set(SPEC_IDS.map((id) => showcaseOf(id).ultimate.kind)).size).toBe(SPEC_IDS.length);
  });

  it('animierte Vorschau: Kombo, Formen I, V, X, dann das Ultimate in seinen drei Akten (gedehnt zum Lesen), danach Ruhe', () => {
    for (const id of SPEC_IDS) {
      const s = previewScript(id);
      expect(s.map((x) => x.part.kind)).toEqual(['combo', 'form', 'form', 'form', 'ult', 'rest']);
      expect(s.filter((x) => x.part.kind === 'form').map((x) => (x.part as { slot: number }).slot)).toEqual([1, 5, 10]);
      for (let i = 1; i < s.length; i++) expect(s[i].at).toBeGreaterThanOrEqual(s[i - 1].at + s[i - 1].dur - 1e-9);
      const ult = s.find((x) => x.part.kind === 'ult')!;
      expect(ult.dur).toBeCloseTo(showcaseOf(id).ultimate.dur * SHOWCASE_SLOW + 1.1, 9);
      expect(previewLength(id)).toBeLessThan(20);
    }
  });

  it('die Vorschau nutzt die echte Choreografie, Effekte der Effekt-Schmiede und Impact-Frames als Canvas-Filter', () => {
    const st = src('world/showcaseStage.ts');
    expect(st).toMatch(/this\.cine\.keyPose\(act, u, this\.anchors, this\.ccam\)/);
    expect(st).toMatch(/impactMode = this\.impactLeft === this\.impactTotal \? 'invert' : 'ink'/);
    const game = src('core/game.ts');
    expect(game).toMatch(/this\.impactOverlay\.apply\(sc \? sc\.impactMode : 'none'/);
    const ui = src('ui/classShowcase.ts');
    expect(ui).toMatch(/Worin diese Klasse glänzt/);
    expect(ui).toMatch(/Alle 10 Formen/);
    expect(ui).toMatch(/Level-60-Ultimate/);
    expect(ui).toMatch(/Abenteuer starten/);
  });
});
