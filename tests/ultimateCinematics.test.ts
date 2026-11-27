// Phase 4.6I – Kino-Regie der Ultimates: maßgeschneiderte 3-Akt-Choreografie (Vorbereitung & Aufladung → bedrohlicher Aufbau & Perspektiv-
// Schwenk → Einschlag, Doppel-Impact-Frame & Zerstörungs-Follow) für alle 15 Ultimates, Zeitmaß gegen die Engine, Sichtlinien-Schutz der
// Kamera, Rückkehr in die freie Steuerung, Zero-GC ohne neue Shader und die Welt-Regie, die den entscheidenden Treffer genau ans Ende von
// Akt 2 legt.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, NormalBlending, Scene, Vector3, type InstancedMesh, type MeshBasicMaterial } from 'three';
import { bruteForceHit, buildSightGrid, sightGridHit, sightGridOf, sightGridStats } from '../src/graphics/sightGrid';
import { SKYFALL_TIMES, SKYFALL_ULTIMATE, ULTIMATES, ULTIMATE_ORDER, ULT_CHARGE, ULT_FREE_AFTER, decisiveAt } from '../src/data/cataclysms';
import type { ActionMove, CataclysmKind, UltimateSpec } from '../src/data/actionKit';
import {
  ACT_LABEL, CINE, CINEMATIC_ORDER, ULTIMATE_CINEMATICS, UltimateCinematics, cineEase, cineTiming, cineTotal, kickDirection, makeAnchors, makeCam,
  reachTarget, type CineAnchors, type CineSight, type UltimateCinematic,
} from '../src/graphics/ultimateCinematics';
import { AnimeImpactRig, type ImpactMode } from '../src/graphics/animeImpactRig';
import { CINE_ARM, SpringArm, type CameraWorld } from '../src/graphics/cameraRig';
import { CataclysmFx, FX_PRIMS, PRIM_LOOK } from '../src/combat/cataclysmFx';
import { CATACLYSM_DUR, CataclysmDirector, type CataclysmHost } from '../src/world/cataclysmDirector';
import { createFighter } from '../src/combat/actionCombatEngine';
import type { NavalSystem } from '../src/naval/naval';

const DT = 1 / 60;
/** alle 15 Ultimates: die 14 der Stile und der Himmelssturz */
const ALL: ActionMove[] = [...ULTIMATE_ORDER.map((id) => ULTIMATES[id]!), SKYFALL_ULTIMATE];
const specOf = (kind: CataclysmKind): UltimateSpec => ALL.find((m) => m.ultimate!.kind === kind)!.ultimate!;
const moveOf = (kind: CataclysmKind): ActionMove => ALL.find((m) => m.ultimate!.kind === kind)!;
const IMPACT_TYPES: CataclysmKind[] = ['sevenSeas', 'iaiWorldBreak', 'thunderJudgment'];

/** Bezugspunkte einer Figur bei (0, 0, 0) mit Blick +Z, Gefahr 25 m voraus in der Luft, Treffer 30 m voraus */
function anchors(): CineAnchors {
  const a = makeAnchors();
  a.yaw = 0;
  const set = (p: { x: number; y: number; z: number }, x: number, y: number, z: number) => { p.x = x; p.y = y; p.z = z; };
  set(a.origin, 0, 0, 0); set(a.feet, 0, 0, 0); set(a.head, 0, 1.64, 0.02); set(a.chest, 0, 1.22, 0.02);
  set(a.hand, -0.25, 1.05, 0.3); set(a.hip, 0.18, 0.95, 0.05); set(a.threat, 0, 12, 25); set(a.impact, 0, 2.5, 30);
  set(a.path, 0, 1.2, 15); set(a.sky, 0, 30, 18);
  return a;
}

interface SimLog {
  phases: string[]; impactAt: number; returnAt: number; idleAt: number; modes: ImpactMode[]; holdScales: number[]; act3Scales: number[];
  gameAtReturn: number; prepScale: number; buildScale: number; barsMin: number; camKBuild: number; glowPrepEnd: number;
}

/**
 * Regie wie im Spiel durchspielen: je Bild laufen die Logikschritte mit dem Zeitmaß des letzten Bilds, die Welt meldet den entscheidenden
 * Treffer `g2` Spielsekunden nach dem Beginn von Akt 2 (dann Impact-Bilder), danach zeichnet das Spiel die Impact-Bilder.
 */
function simulate(kind: CataclysmKind, worldReports = true, frameDt = DT): SimLog {
  const cine = new UltimateCinematics();
  const rig = new AnimeImpactRig();
  const spec = specOf(kind);
  const def = cine.start(kind, spec);
  const g2 = decisiveAt(spec);
  const log: SimLog = { phases: [cine.phase], impactAt: -1, returnAt: -1, idleAt: -1, modes: [], holdScales: [], act3Scales: [], gameAtReturn: -1, prepScale: cine.timeScale, buildScale: -1, barsMin: 1, camKBuild: 0, glowPrepEnd: 0 };
  let real = 0, scale = cine.timeScale, gameBuild = 0, reported = false;
  for (let i = 0; i < 400 && cine.active; i++) {
    // Logik dieses Bilds (Zeitmaß des vorigen Bilds)
    const step = frameDt * scale;
    if (cine.phase === 'build' || cine.phase === 'impact' || cine.phase === 'return') gameBuild += step;
    if (worldReports && !reported && cine.phase === 'build' && gameBuild >= g2 - 1e-9) {
      reported = true;
      if (cine.impact()) rig.impact(def.frames);
    }
    // Zeichnen: Regie in Echtzeit, dann die Impact-Bilder
    real += frameDt;
    const before = cine.phase;
    if (before === 'prep') log.glowPrepEnd = cine.glow;
    cine.update(frameDt, rig.framesLeft);
    if (cine.forced) { cine.forced = false; rig.impact(def.frames); }
    if (cine.phase !== log.phases[log.phases.length - 1]) {
      log.phases.push(cine.phase);
      if (cine.phase === 'return') { log.returnAt = real; log.gameAtReturn = gameBuild; }
    }
    if (cine.phase === 'impact' && log.impactAt < 0) log.impactAt = real - frameDt;
    if (cine.phase === 'build') { log.buildScale = cine.timeScale; log.camKBuild = cine.camK; }
    if (cine.inActs && cine.clock > CINE.barsIn) log.barsMin = Math.min(log.barsMin, cine.barsK);
    if (cine.phase === 'impact') { if (rig.framesLeft > 0) log.holdScales.push(cine.timeScale); else log.act3Scales.push(cine.timeScale); }
    const m = rig.frame();
    if (m !== 'none') log.modes.push(m);
    scale = cine.timeScale;
    if (!cine.active) log.idleAt = real;
  }
  if (log.idleAt < 0 && !cine.active) log.idleAt = real;
  return log;
}

// ---------------------------------------------------------------------------------------------------------------

// 4.93A: die Kino-Endgame-Ultimates (Himmelssturz, beide Faustkämpfer) laufen 3,4 – 4,2 s mit Impact-Frames nach Millisekunden – geprüft in
// tests/phase493aAudioDirectorAndBrawlerVfx.test.ts; die 3-Akt-Regeln hier gelten für die übrigen
const LEGACY_ORDER = CINEMATIC_ORDER.filter((k) => !ULTIMATE_CINEMATICS[k].kino);

describe('15 maßgeschneiderte 3-Akt-Choreografien', () => {
  it('jedes Ultimate hat seine eigene Choreografie: Titel wie das Ultimate, drei deutsche Akt-Beschreibungen, eigene Pose, Gefahr und Kamera', () => {
    // 4.7B: 16 Choreografien – das Erzengel-Himmelsgericht des Priesters kam dazu
    expect(CINEMATIC_ORDER).toHaveLength(16);
    expect(new Set(CINEMATIC_ORDER).size).toBe(16);
    expect(new Set(ALL.map((m) => m.ultimate!.kind))).toEqual(new Set(CINEMATIC_ORDER));
    const poses = new Set<string>(), shots = new Set<string>(), threats = new Set<string>();
    for (const kind of CINEMATIC_ORDER) {
      const d = ULTIMATE_CINEMATICS[kind];
      expect(d.kind).toBe(kind);
      expect(d.title, kind).toBe(moveOf(kind).label);
      expect(d.beats).toHaveLength(3);
      for (const b of d.beats) {
        expect(b.length, kind).toBeGreaterThan(20);
        expect(b, kind).not.toMatch(/\b(the|and|with|camera|shot)\b/i);
      }
      expect(d.pose.label.length, kind).toBeGreaterThan(4);
      expect(d.shots).toHaveLength(3);
      poses.add(d.pose.id);
      threats.add(d.threat);
      shots.add(JSON.stringify(d.shots));
      expect(d.frames, kind).toBeGreaterThanOrEqual(2);
      expect(d.frames, kind).toBeLessThanOrEqual(4);
    }
    // der Priester nutzt die Kranz-Pose und den Sonnenring des Sonnentanzes (eigene Bezeichnung und eigene Kamera)
    expect(poses.size).toBe(15);
    expect(threats.size).toBe(15);
    expect(shots.size).toBe(16);
    expect(ACT_LABEL.prep).toBe('Vorbereitung & Aufladung');
    expect(ACT_LABEL.build).toBe('Bedrohlicher Aufbau & Perspektiv-Schwenk');
    expect(ACT_LABEL.impact).toBe('Einschlag, Doppel-Impact-Frame & Zerstörungs-Follow');
  });

  it('die Vorgaben im Detail: Himmelssturz mit Mach-Kegeln, Iaijutsu mit Daumen am Griff und Klick an der Scheide, Säbel mit Armada im Halbkreis', () => {
    const sky = ULTIMATE_CINEMATICS.skyfall;
    expect(sky.pose.id).toBe('gravityCall');
    expect(sky.pose.reachR![4]).toBeGreaterThan(1.9); // Hand über dem Kopf
    expect(sky.sky).toBe('starSpiral');
    expect(sky.threat).toBe('colossus');
    // Untersicht: Kamera tief am Boden (unter Hüfthöhe), Blick hinauf über den Kopf
    expect(sky.shots[0].from.at).toBe('origin');
    expect(sky.shots[0].from.dy).toBeLessThanOrEqual(1.1);
    expect(sky.shots[0].to.ly).toBeGreaterThan(0.3);
    expect(sky.shots[1].from.look).toBe('threat');
    const iai = ULTIMATE_CINEMATICS.iaiWorldBreak;
    expect(iai.shots[0].from.at).toBe('hand');
    expect(iai.shots[0].to.dist).toBeLessThan(1); // extreme Nahaufnahme auf Griff und Daumen (die Klinge darf das Bild nicht füllen)
    expect(iai.shots[0].to.fov).toBeLessThanOrEqual(30);
    expect(iai.shots[2].from.at).toBe('hip'); // Scheide beim Einrasten
    expect(iai.shots[2].ease).toBe('hold');
    const sab = ULTIMATE_CINEMATICS.sevenSeas;
    expect(Math.abs(sab.shots[1].to.az - sab.shots[1].from.az)).toBeGreaterThan(2); // Halbkreis hinter dem Kapitän
    expect(ULTIMATE_CINEMATICS.horizonCut.aura).toBeTruthy(); // schwarz-smaragdgrüne Klinge
    expect(ULTIMATE_CINEMATICS.thunderJudgment.pose.lift).toBeGreaterThan(3); // Raketen-Aufstieg
    expect(ULTIMATE_CINEMATICS.blackHole.shots[1].from.fov).toBeGreaterThanOrEqual(66); // Weitwinkel-Sog
    expect(ULTIMATE_CINEMATICS.floodDragon.shots[1].from.dy).toBeLessThan(-4); // Untersicht vor der Welle
  });
});

describe('Zeit: Akte, Zeitmaß und die Zeiten der Engine', () => {
  it('Akt-Dauern in den Grenzen, zusammen ≤ 1,2 s (knackig, ~0,95 – 1,15 s)', () => {
    for (const kind of LEGACY_ORDER) {
      const d = ULTIMATE_CINEMATICS[kind];
      expect(d.dur[0], kind).toBeGreaterThanOrEqual(CINE.prep[0]);
      expect(d.dur[0], kind).toBeLessThanOrEqual(CINE.prep[1]);
      expect(d.dur[1], kind).toBeGreaterThanOrEqual(CINE.build[0]);
      expect(d.dur[1], kind).toBeLessThanOrEqual(CINE.build[1]);
      expect(d.dur[2], kind).toBeGreaterThanOrEqual(CINE.impact[0]);
      expect(d.dur[2], kind).toBeLessThanOrEqual(CINE.impact[1]);
      expect(cineTotal(d), kind).toBeLessThanOrEqual(CINE.maxTotal);
      expect(cineTotal(d), kind).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('Aufladen der Engine füllt Akt 1, der entscheidende Treffer fällt ans Ende von Akt 2 – nie schneller als Echtzeit', () => {
    for (const kind of LEGACY_ORDER) {
      const d = ULTIMATE_CINEMATICS[kind], s = specOf(kind);
      const tm = cineTiming(d, s);
      expect(tm.s1 * d.dur[0], kind).toBeCloseTo(ULT_CHARGE, 9);
      expect(tm.g2, kind).toBeCloseTo(decisiveAt(s), 9);
      expect(tm.s2, kind).toBeLessThanOrEqual(1);
      expect(tm.s2, kind).toBeGreaterThan(0.6);
      expect(tm.s2 * d.dur[1], kind).toBeCloseTo(tm.g2, 9);
      expect(tm.strike, kind).toBe(IMPACT_TYPES.includes(kind) ? 'impact' : 'launch');
      // Einschlag und Treffer liegen am Anfang des Angriffs, die Zerstörung noch in der Sequenz
      expect(s.strikeAt, kind).toBeLessThanOrEqual(0.42);
    }
  });

  it('keine Eingabe während der Sequenz, direkt danach sind Dash und Sprung frei (Ansatzpunkt der Kette)', () => {
    for (const m of ALL) {
      const s = m.ultimate!;
      expect(m.cancel, m.id).toBeGreaterThanOrEqual(decisiveAt(s) + ULT_FREE_AFTER - 1e-9);
      expect(m.cancel, m.id).toBeLessThanOrEqual(m.dur);
      expect(s.strikeAt, m.id).toBeLessThan(m.dur);
    }
  });

  it('Himmelssturz (4.93A): der entscheidende Treffer fällt mit dem Koloss', () => {
    const s = SKYFALL_ULTIMATE.ultimate!;
    expect(s.lag).toBeCloseTo(SKYFALL_TIMES.colossus, 9);
    const meteors = SKYFALL_ULTIMATE.hits.filter((h) => h.vfx === 'meteor');
    expect(meteors.length).toBeGreaterThanOrEqual(3);
    for (const h of meteors) expect(h.t0).toBeGreaterThanOrEqual(s.strikeAt);
  });

});

describe('Ablauf: Vorbereitung → Aufbau → Doppel-Impact-Frame → Rückkehr', () => {
  it('alle 15: Akte in Reihenfolge, Treffer exakt am Ende von Akt 2, Standbild während der Impact-Bilder, Zeitlupe läuft in Akt 3 aus', () => {
    for (const kind of LEGACY_ORDER) {
      const d = ULTIMATE_CINEMATICS[kind];
      const log = simulate(kind);
      expect(log.phases, kind).toEqual(['prep', 'build', 'impact', 'return', 'idle']);
      // Treffermoment genau am Ende von Akt 2 (auf ein Bild genau plus ein Bild Takt der Logik)
      expect(Math.abs(log.impactAt - (d.dur[0] + d.dur[1])), kind).toBeLessThanOrEqual(2.5 * DT);
      // Doppel-Impact-Frame: erst invertiert, dann Tusche
      expect(log.modes.slice(0, 2), kind).toEqual(['invert', 'ink']);
      expect(log.modes.length, kind).toBe(d.frames);
      // Hit-Stop: solange Impact-Bilder ausstehen, steht die Spielzeit
      expect(log.holdScales.length, kind).toBeGreaterThan(0);
      expect(Math.max(...log.holdScales), kind).toBe(0);
      // Akt 3: Zeitlupe läuft von slow3[0] Richtung Echtzeit
      expect(log.act3Scales.length, kind).toBeGreaterThan(5);
      expect(log.act3Scales[0], kind).toBeLessThan(0.5);
      expect(log.act3Scales[log.act3Scales.length - 1], kind).toBeGreaterThan(0.8);
      // Zeitlupe in Akt 1, fast Echtzeit in Akt 2
      expect(log.prepScale, kind).toBeLessThan(0.4);
      expect(log.buildScale, kind).toBeGreaterThan(0.6);
      expect(log.camKBuild, kind).toBe(1);
      expect(log.glowPrepEnd, kind).toBeGreaterThan(0.6);
      // HUD ausgeblendet, Kinobalken stehen während aller drei Akte
      expect(log.barsMin, kind).toBeGreaterThan(0.99);
      // Gesamtdauer der drei Akte (plus Impact-Bilder) ≤ 1,2 s
      expect(log.returnAt, kind).toBeLessThanOrEqual(CINE.maxTotal + 2 * DT);
    }
  });

  it('Rückkehr zur freien Spielersteuerung: danach Kamera frei (camK 0), Echtzeit, keine Pose; die Engine nimmt Dash und Sprung wieder an', () => {
    for (const kind of LEGACY_ORDER) {
      const log = simulate(kind);
      expect(log.idleAt - log.returnAt, kind).toBeCloseTo(CINE.returnDur, 1);
      // Spielzeit seit Akt 2 am Ende von Akt 3 ≥ Ansatzpunkt der Kette: die Steuerung ist zurück, wenn die Kamera heimkehrt
      expect(log.gameAtReturn, kind).toBeGreaterThanOrEqual(moveOf(kind).cancel - 1e-6);
    }
    const cine = new UltimateCinematics();
    cine.start('horizonCut', specOf('horizonCut'));
    for (let i = 0; i < 200 && cine.active; i++) { if (cine.phase === 'build' && cine.t > 0.3) cine.impact(); cine.update(DT, 0); }
    expect(cine.active).toBe(false);
    expect(cine.phase).toBe('idle');
    expect(cine.camK).toBe(0);
    expect(cine.barsK).toBe(0);
    expect(cine.timeScale).toBe(1);
    expect(cine.poseK).toBe(0);
    expect(cine.clipU).toBe(-1);
    expect(cine.lift).toBe(0);
  });

  it('bleibt der Treffer der Welt aus, setzt die Regie ihn nach kurzer Wartezeit selbst (nie ein hängendes Kinobild)', () => {
    const log = simulate('skyfall', false);
    expect(log.phases).toEqual(['prep', 'build', 'impact', 'return', 'idle']);
    const d = ULTIMATE_CINEMATICS.skyfall;
    expect(log.impactAt).toBeGreaterThan(d.dur[0] + d.dur[1]);
    expect(log.impactAt).toBeLessThanOrEqual(d.dur[0] + d.dur[1] + CINE.overrun + 2 * DT);
    expect(log.modes[0]).toBe('invert');
  });

  it('ein früher Treffer schneidet früher, doppelte Meldungen zählen nicht; bei 30 fps gleicher Ablauf', () => {
    const cine = new UltimateCinematics();
    cine.start('glacier', specOf('glacier'));
    for (let i = 0; i < 25; i++) cine.update(DT, 0);
    expect(cine.phase).toBe('build');
    expect(cine.impact()).toBe(true);
    expect(cine.impact()).toBe(false);
    expect(cine.phase).toBe('impact');
    const slow = simulate('glacier', true, 1 / 30);
    expect(slow.phases).toEqual(['prep', 'build', 'impact', 'return', 'idle']);
    expect(slow.modes.slice(0, 2)).toEqual(['invert', 'ink']);
  });

  it('Pose: Clip-Stand läuft in Akt 1 nahtlos in den Angriffs-Abschnitt, Abheben klingt in Akt 2 aus, Hand-Ziele im Figurenraum', () => {
    for (const kind of CINEMATIC_ORDER) {
      const d = ULTIMATE_CINEMATICS[kind];
      if (!d.pose.clip) continue;
      const m = moveOf(kind);
      expect(d.pose.clip[1], kind).toBeCloseTo(m.clipFrom, 6);
      expect(d.pose.clip[0], kind).toBeLessThanOrEqual(d.pose.clip[1]);
    }
    const cine = new UltimateCinematics();
    cine.start('thunderJudgment', specOf('thunderJudgment'));
    let peak = 0;
    for (let i = 0; i < 12; i++) { cine.update(DT, 0); peak = Math.max(peak, cine.lift); }
    expect(cine.phase).toBe('prep');
    expect(cine.clipU).toBeGreaterThan(0);
    expect(cine.poseK).toBeGreaterThan(0.9);
    for (let i = 0; i < 8; i++) { cine.update(DT, 0); peak = Math.max(peak, cine.lift); }
    expect(peak).toBeGreaterThan(2.5);
    for (let i = 0; i < 30; i++) cine.update(DT, 0);
    expect(cine.lift).toBeLessThan(0.05);
    // Figurenraum: x links, z vorn – bei Blick nach +X liegt „vorn“ auf +X und „links“ auf −Z
    const out = { x: 0, y: 0, z: 0 };
    reachTarget([0, 1, 1, 0, 1, 1], 1, 0, 0, 0, Math.PI / 2, out);
    expect(out.x).toBeCloseTo(1, 6); expect(out.z).toBeCloseTo(0, 6); expect(out.y).toBeCloseTo(1, 6);
    reachTarget([1, 1, 0, 1, 1, 0], 1, 0, 0, 0, Math.PI / 2, out);
    expect(out.z).toBeCloseTo(-1, 6);
    const k = kickDirection(ULTIMATE_CINEMATICS.skyfall, 0, out);
    expect(Math.hypot(k.x, k.y, k.z)).toBeCloseTo(1, 6);
    expect(k.y).toBeLessThan(-0.8);
  });
});

describe('Kamera: Einstellungen, Perspektiv-Schwenk und Sichtlinien-Schutz', () => {
  it('jede Einstellung ist endlich, im Sichtfeld-Rahmen und nie näher als 0,38 m am Drehpunkt; pose() schreibt in das übergebene Objekt', () => {
    const a = anchors();
    const out = makeCam();
    for (const kind of CINEMATIC_ORDER) {
      const cine = new UltimateCinematics();
      const d = cine.start(kind, specOf(kind));
      for (let act = 0; act < 3; act++) for (let i = 0; i <= 10; i++) {
        const c = cine.keyPose(act, i / 10, a, out);
        expect(c).toBe(out);
        expect(Number.isFinite(c.px + c.py + c.pz + c.lx + c.ly + c.lz), `${kind} ${act}`).toBe(true);
        expect(c.fov).toBeGreaterThanOrEqual(CINE.fovMin);
        expect(c.fov).toBeLessThanOrEqual(CINE.fovMax);
        const key = i < 5 ? d.shots[act].from : d.shots[act].to;
        void key;
      }
      // pose() während der Akte: selbes Objekt, endlich
      for (let i = 0; i < 70 && cine.active; i++) {
        if (cine.phase === 'build' && cine.t > d.dur[1]) cine.impact();
        cine.update(DT, 0);
        expect(cine.pose(a, out)).toBe(out);
        expect(Number.isFinite(out.px + out.py + out.pz), kind).toBe(true);
      }
    }
  });

  it('Akt 2 ist ein echter Perspektiv-Schwenk: Blickrichtung oder Blickziel ändern sich deutlich', () => {
    const a = anchors();
    const p0 = makeCam(), p1 = makeCam();
    for (const kind of CINEMATIC_ORDER) {
      const cine = new UltimateCinematics();
      cine.start(kind, specOf(kind));
      // Akt 1 → Akt 2: neue Einstellung (Drehpunkt, Winkel oder Abstand)
      cine.keyPose(0, 1, a, p0);
      cine.keyPose(1, 0, a, p1);
      const jump = Math.hypot(p1.px - p0.px, p1.py - p0.py, p1.pz - p0.pz);
      // innerhalb von Akt 2: der Blick dreht sich oder das Ziel wandert
      cine.keyPose(1, 0, a, p0);
      cine.keyPose(1, 1, a, p1);
      const d0 = new Vector3(p0.lx - p0.px, p0.ly - p0.py, p0.lz - p0.pz).normalize();
      const d1 = new Vector3(p1.lx - p1.px, p1.ly - p1.py, p1.lz - p1.pz).normalize();
      const turn = Math.acos(Math.max(-1, Math.min(1, d0.dot(d1))));
      const moved = Math.hypot(p1.px - p0.px, p1.py - p0.py, p1.pz - p0.pz) + Math.hypot(p1.lx - p0.lx, p1.ly - p0.ly, p1.lz - p0.lz);
      expect(jump > 1.5 || turn > 0.2 || moved > 3, kind).toBe(true);
      expect(turn > 0.05 || moved > 1.5, kind).toBe(true);
    }
  });

  it('Sichtprüfung: verdeckt ein Mast die Einstellung, wählt die Regie eine freie Variante (gespiegelt, gedreht, angehoben)', () => {
    const a = anchors();
    // Mast als senkrechter Zylinder (Radius 0,35 m) genau auf der geplanten Sichtlinie (60 % vom Blickpunkt zur Kamera, Mitte von Akt 1)
    const mast = { x: 0, z: 0, r: 0.35 };
    {
      const probe = new UltimateCinematics();
      probe.start('skyfall', specOf('skyfall'));
      const c = probe.keyPose(0, 0.5, a, makeCam(), { yaw: 0, mirror: false, lift: 0, pull: 1, free: 1 });
      mast.x = c.lx + (c.px - c.lx) * 0.6; mast.z = c.lz + (c.pz - c.lz) * 0.6;
    }
    const hitsMast = (ax: number, az: number, bx: number, bz: number) => {
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
      const u = Math.max(0, Math.min(1, ((mast.x - ax) * dx + (mast.z - az) * dz) / Math.max(1e-9, L2)));
      return Math.hypot(ax + dx * u - mast.x, az + dz * u - mast.z) < mast.r ? u : -1;
    };
    let rays = 0;
    const sight: CineSight = { free: (ax, _ay, az, bx, _by, bz) => { rays++; const u = hitsMast(ax, az, bx, bz); return u < 0 ? 1 : u; } };
    const cine = new UltimateCinematics();
    cine.start('skyfall', specOf('skyfall')); // Akt 1: Untersicht von links vorn – genau hinter dem Mast
    const planned = cine.keyPose(0, 0.5, a, makeCam(), { yaw: 0, mirror: false, lift: 0, pull: 1, free: 1 });
    expect(hitsMast(planned.lx, planned.lz, planned.px, planned.pz)).toBeGreaterThanOrEqual(0);
    cine.resolve(0, a, sight);
    const fix = cine.fix[0];
    expect(fix.free).toBeGreaterThanOrEqual(CINE.freeOk);
    expect(fix.mirror || fix.yaw !== 0 || fix.lift > 0 || fix.pull < 1).toBe(true);
    for (const u of [0, 0.5, 1]) {
      const c = cine.keyPose(0, u, a, makeCam());
      expect(hitsMast(c.lx, c.lz, c.px, c.pz), `u=${u}`).toBe(-1);
    }
    expect(cine.resolvePending).toBe(false);
    expect(rays).toBeGreaterThan(3);
    expect(cine.stats.blocked).toBe(0);
  });

  it('nirgends frei (Mauer rundum): die Kamera rückt bis vor das Hindernis heran, aber nie unter 35 % (Nahblende der Figur)', () => {
    const a = anchors();
    const cine = new UltimateCinematics();
    cine.start('vacuumStorm', specOf('vacuumStorm'));
    cine.resolve(1, a, { free: () => 0.55 });
    expect(cine.fix[1].pull).toBeLessThan(1);
    expect(cine.fix[1].pull).toBeGreaterThanOrEqual(0.35);
    expect(cine.stats.blocked).toBe(1);
  });

  it('Spring-Arm der Kino-Kamera: Mauern und Gelände ziehen sie heran, nie unter Wasser oder in festes Material', () => {
    // Mauer hinter der Figur (z < −2), Wasser auf Höhe 0
    const world: CameraWorld = { floorAt: () => 0, solid: (_x, _y, z) => z < -2 };
    const arm = new SpringArm(CINE_ARM);
    const anchor = new Vector3(0, 1.6, 0), want = new Vector3(0, 2, -6), out = new Vector3();
    arm.solve(anchor, want, world, DT, out, true);
    expect(out.z).toBeGreaterThan(-2);
    expect(world.solid(out.x, out.y, out.z)).toBe(false);
    // Untersicht dicht über dem Wasser: die Kamera bleibt über der Wasserlinie
    arm.reset();
    arm.solve(new Vector3(0, 2.5, 30), new Vector3(0, -1, 20), world, DT, out, true);
    expect(out.y).toBeGreaterThanOrEqual(CINE_ARM.clearance - 1e-6);
    // Nahaufnahme an der Hand: 0,42 m bleiben erlaubt
    arm.reset();
    arm.solve(new Vector3(0, 1, 0), new Vector3(0.42, 1, 0), { floorAt: () => -10, solid: () => false }, DT, out, true);
    expect(out.x).toBeCloseTo(0.42, 3);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Welt-Regie: entscheidender Treffer, Zeichnen und gleichzeitiges Zerbrechen, Akt-1-Effekte
// ---------------------------------------------------------------------------------------------------------------

interface FakeShip {
  ship: {
    x: number; z: number; heading: number; cls: { L: number; W: number }; model: { deckY: number }; sinking: number; maxHull: number; hull: number; fire: number; frozen: number;
    shoveX: number; shoveZ: number; holes: number; masts: number; charK: number; glow: number;
    punchHoles(n: number): void; blowMasts(n?: number): void; char(k: number, glow?: number): void;
  };
}

function worldRig(hostPatch: Partial<CataclysmHost> = {}) {
  const fx = new CataclysmFx(new Scene());
  const ships: FakeShip[] = [];
  const rec = { splits: [] as string[], splitAt: [] as number[], decisive: [] as number[], impacts: 0, frame: 0 };
  const nav = {
    cataclysmShips(x: number, z: number, r: number, out: FakeShip[]) { out.length = 0; for (const e of ships) if (e.ship.sinking <= 0 && Math.hypot(e.ship.x - x, e.ship.z - z) - e.ship.cls.L * 0.5 <= r) out.push(e); return out.length; },
    cataclysmFriendly() { return false; },
    cataclysmSplit(e: FakeShip, cut: string) { rec.splits.push(cut); rec.splitAt.push(rec.frame); e.ship.sinking = 0.01; return 'split'; },
    cataclysmHit() { return 1; },
    cataclysmPull() { /* Sog */ },
    cataclysmBlast() { return true; },
  };
  const host: CataclysmHost = {
    fx, combatFx: null, naval: nav as unknown as NavalSystem, debris: null,
    isLand: () => false, groundY: () => 0, waterY: () => 0, setTrench: () => {}, setRift: () => {}, shake: () => {}, darken: () => {},
    impactFrames: (n) => { rec.impacts += n; },
    decisive: () => { rec.decisive.push(rec.frame); return true; },
    ...hostPatch,
  };
  const ship = (x: number, z: number, heading = Math.PI / 2) => {
    const e: FakeShip = { ship: {
      x, z, heading, cls: { L: 30, W: 7 }, model: { deckY: 2.5 }, sinking: 0, maxHull: 1000, hull: 1000, fire: 0, frozen: 0, shoveX: 0, shoveZ: 0, holes: 0, masts: 0, charK: 0, glow: 0,
      punchHoles(n: number) { this.holes += n; }, blowMasts(n = 2) { this.masts += n; }, char(k: number, glow = 0) { this.charK = Math.max(this.charK, k); this.glow = Math.max(this.glow, glow); },
    } };
    ships.push(e);
    return e;
  };
  return { fx, d: new CataclysmDirector(host), rec, ship, ships };
}

/** Ultimate in der Welt: Aufladen (Akt 1), Zeit bis zum Einschlag, Einschlag; Rückgabe: Bild des Einschlags */
function castWorld(kind: CataclysmKind, place: (r: ReturnType<typeof worldRig>) => void, pose = true, hostPatch: Partial<CataclysmHost> = {}) {
  const r = worldRig(hostPatch);
  place(r);
  const f = createFighter('cine', 'zweihaender');
  const spec = specOf(kind);
  const def = ULTIMATE_CINEMATICS[kind];
  if (pose) Object.assign(r.d.poseAt, { on: true, rx: -0.25, ry: 1.05, rz: 0.3, lx: 0.25, ly: 1.05, lz: 0.3, hx: 0, hy: 1.64, hz: 0 });
  r.d.beginCharge(spec, f, def.dur[0]);
  const n1 = Math.round(def.dur[0] / DT);
  for (let i = 0; i < n1; i++) { r.rec.frame++; r.d.update(spec.charge / n1, DT); }
  for (let i = 0; i < Math.round(spec.strikeAt / DT); i++) { r.rec.frame++; r.d.update(DT, DT); }
  const strikeFrame = r.rec.frame;
  r.d.strike(spec, f, 0, 0);
  for (let i = 0; i < Math.round((CATACLYSM_DUR[kind] + 0.5) / DT); i++) { r.rec.frame++; r.d.update(DT, DT); }
  for (let i = 0; i < 60 * 6; i++) r.d.update(DT, DT);
  return { ...r, strikeFrame, spec };
}

describe('Welt-Regie: der entscheidende Treffer liegt genau am Ende von Akt 2', () => {
  it('alle 15: genau eine Meldung, `lag` Spielzeit nach dem Einschlag (Klick, Zäsur und Hauptblitz sofort); der Pool räumt sich ganz auf', () => {
    for (const kind of CINEMATIC_ORDER) {
      const r = castWorld(kind, (x) => { x.ship(0, 30); });
      const s = r.spec;
      expect(r.rec.decisive, kind).toHaveLength(1);
      const after = (r.rec.decisive[0] - r.strikeFrame) * DT;
      expect(after, kind).toBeGreaterThanOrEqual(s.lag - 1e-9);
      expect(after, kind).toBeLessThanOrEqual(s.lag + DT + 1e-9);
      expect(r.d.stats.decisive, kind).toBe(1);
      expect(r.fx.alive, kind).toBe(0);
    }
  });

  it('Himmelsspalter: die Klingenwelle zeichnet das Kriegsschiff in Akt 2, Bug und Heck kippen erst im Treffermoment auseinander', () => {
    const r = castWorld('horizonCut', (x) => { x.ship(0, 40); });
    expect(r.d.stats.marked).toBeGreaterThanOrEqual(1);
    expect(r.rec.splits).toEqual(['cross']);
    expect(r.rec.splitAt[0]).toBe(r.rec.decisive[0]);
  });

  it('Klingen-Zyklon: die Säge fräst durch, die vier Sektionen brechen im Impact-Frame; Iaijutsu zerbricht alles beim Klick', () => {
    const cyc = castWorld('sawCyclone', (x) => { x.ship(0, 25, 0); });
    expect(cyc.rec.splits).toEqual(['length']);
    expect(cyc.rec.splitAt[0]).toBe(cyc.rec.decisive[0]);
    expect(cyc.ships[0].ship.masts).toBeGreaterThan(0);
    const iai = castWorld('iaiWorldBreak', (x) => { x.ship(0, 20, 0); });
    expect(iai.rec.decisive[0]).toBe(iai.strikeFrame);
    expect(iai.rec.splits).toContain('diagonal');
  });

  it('Schwarzes Loch, Tornado, Gletscher, Blutmond, Flutdrache: die Zerstörung fällt in den Treffermoment', () => {
    const cases: [CataclysmKind, string][] = [['blackHole', 'radial'], ['vacuumStorm', 'cross'], ['glacier', 'cross'], ['bloodMoon', 'cross'], ['floodDragon', 'capsize']];
    for (const [kind, cut] of cases) {
      const r = castWorld(kind, (x) => { x.ship(0, 30); });
      expect(r.rec.splits, kind).toContain(cut);
      expect(Math.min(...r.rec.splitAt), kind).toBe(r.rec.decisive[0]);
    }
  });

  it('mehrere Schiffe im Treffermoment: höchstens ein Schnitt je Bild, der erste genau im Treffermoment, die übrigen gleich danach', () => {
    for (const kind of ['blackHole', 'glacier', 'bloodMoon'] as CataclysmKind[]) {
      const r = castWorld(kind, (x) => { x.ship(0, 30); x.ship(8, 34); x.ship(-8, 28); });
      expect(r.rec.splits.length, kind).toBe(3);
      const at = [...r.rec.splitAt].sort((p, q) => p - q);
      expect(at[0], kind).toBe(r.rec.decisive[0]);
      for (let i = 1; i < at.length; i++) expect(at[i], kind).toBeGreaterThan(at[i - 1]);
      expect(at[at.length - 1] - at[0], kind).toBeLessThanOrEqual(3);
      expect(r.d.stats.queued, kind).toBeGreaterThanOrEqual(2);
    }
  });

  it('Erdspalter an Deck: der Graben beginnt hinter dem eigenen Schiff (es versinkt nicht samt Figur und Kamera darin)', () => {
    const starts: number[] = [];
    const setTrench = (ax: number, az: number, _bx: number, _bz: number, _hw: number, depth: number) => { if (depth > 0) starts.push(Math.hypot(ax, az)); };
    castWorld('oceanSplit', (x) => { x.ship(0, 45); }, true, { setTrench, trenchStart: () => 17 });
    expect(starts.length).toBeGreaterThan(10);
    for (const d of starts) expect(d).toBeCloseTo(17, 6);
    // ohne Haken (an Land, ältere Aufrufer): wie bisher 4 m vor der Figur
    starts.length = 0;
    castWorld('oceanSplit', (x) => { x.ship(0, 45); }, true, { setTrench });
    expect(starts.length).toBeGreaterThan(10);
    for (const d of starts) expect(d).toBeCloseTo(4, 6);
    // weiter als die halbe Reichweite rückt er nie (sonst bliebe vom Graben nichts)
    starts.length = 0;
    castWorld('oceanSplit', () => {}, true, { setTrench, trenchStart: () => 500 });
    for (const d of starts) expect(d).toBeCloseTo(specOf('oceanSplit').reach * 0.5, 6);
  });

  it('Himmelssturz (4.93A): fünf Vorhut-Meteoriten, Koloss und Kataklysmus aus den Blender-Netzen; Treffermoment beim Koloss', () => {
    const r = castWorld('skyfall', (x) => { x.ship(0, 60); });
    expect(r.d.kino.stats.shards).toBe(5);
    expect(r.d.kino.stats.colossi).toBe(1);
    expect(r.d.kino.stats.fountains).toBeGreaterThanOrEqual(1);
    expect(r.d.stats.meteors + r.d.stats.planets).toBe(0);
    expect((r.rec.decisive[0] - r.strikeFrame) * DT).toBeCloseTo(SKYFALL_TIMES.colossus, 1);
  });

  it('ohne Haken der Kino-Regie (ältere Aufrufer) zeigt die Welt die Impact-Bilder des Treffermoments selbst', () => {
    const r = worldRig();
    (r.d as unknown as { host: CataclysmHost }).host.decisive = undefined;
    const spec = specOf('glacier');
    r.d.strike(spec, createFighter('x', 'eis'), 0, 0);
    for (let i = 0; i < 40; i++) r.d.update(DT, DT);
    expect(r.rec.impacts).toBe(spec.frames);
  });

  it('Akt 1: jede Choreografie hat ihre Pose-Effekte (Hände, Klinge, Kranz, Sphäre), die Gefahr wandert für die Kamera', () => {
    for (const kind of CINEMATIC_ORDER) {
      const r = castWorld(kind, (x) => { x.ship(0, 30); });
      expect(r.d.stats.poseFx, kind).toBeGreaterThan(3);
      expect(r.d.stats.threats, kind).toBeGreaterThan(3);
    }
    // Blutmond: der Mond steht schon in Akt 1 am Himmel
    const r = worldRig();
    r.d.beginCharge(specOf('bloodMoon'), createFighter('m', 'mond'), 0.33);
    expect(r.fx.count('crater')).toBeGreaterThan(0);
    expect(r.fx.count('orb')).toBeGreaterThan(0);
  });

  it('Gefahr und Treffer für die Kamera: Wellenfront wandert nach vorn, der Treffer liegt auf dem gezeichneten Schiff', () => {
    const r = worldRig();
    r.ship(0, 50);
    const spec = specOf('horizonCut');
    const f = createFighter('h', 'zweihaender');
    r.d.beginCharge(spec, f, 0.32);
    r.d.strike(spec, f, 0, 0);
    const p = { x: 0, y: 0, z: 0 };
    r.d.update(DT, DT); const z0 = r.d.cineThreat(p).z;
    for (let i = 0; i < 6; i++) r.d.update(DT, DT);
    expect(r.d.cineThreat(p).z).toBeGreaterThan(z0 + 5);
    for (let i = 0; i < 20; i++) r.d.update(DT, DT);
    r.d.cineImpact(p);
    expect(p.z).toBeCloseTo(50, 3);
  });
});

describe('Zero-GC und keine neuen Shader', () => {
  it('der neue Mach-Kegel teilt das Programm aller additiven Kerne (Textur, Eckpunktfarbe, UV, keine Normalen)', () => {
    const fx = new CataclysmFx(new Scene());
    const key = (m: InstancedMesh) => {
      const mat = m.material as MeshBasicMaterial;
      const g = m.geometry;
      const opaque = mat.transparent === false && mat.blending === NormalBlending;
      return [mat.type, !!mat.map, mat.vertexColors, mat.side, mat.fog, opaque, mat.alphaTest > 0, !!g.attributes.normal, !!g.attributes.uv, g.attributes.color?.itemSize, !!m.instanceColor].join('|');
    };
    expect(FX_PRIMS).toContain('cone');
    expect(PRIM_LOOK.cone.blend).toBe('add');
    const cone = fx.meshesOf('cone')[0];
    expect(key(cone)).toBe(key(fx.meshesOf('ring')[0]));
    expect(cone.geometry.attributes.normal).toBeUndefined();
    const keys = new Set<string>();
    for (const p of FX_PRIMS) for (const m of fx.meshesOf(p)) keys.add(key(m));
    expect(keys.size).toBeLessThanOrEqual(2);
  });

  it('die Regie legt in ihren Bild-Methoden nichts Neues an (keine `new`, keine Felder/Literale), Ergebnisse in vorab angelegten Objekten', () => {
    const src = readFileSync(new URL('../src/graphics/ultimateCinematics.ts', import.meta.url), 'utf8');
    const cls = src.slice(src.indexOf('export class UltimateCinematics'), src.indexOf('const TRY_FIX'));
    const methods = cls.slice(cls.indexOf('  get active()'));
    expect(methods).not.toMatch(/\bnew\s+[A-Z]/);
    expect(methods).not.toMatch(/=\s*\[\s*\]/);
    // gleiche Objekte über viele Bilder
    const cine = new UltimateCinematics();
    const a = anchors(), out = makeCam();
    const cam0 = cine.cam, fix0 = cine.fix[1], timing0 = cine.timing;
    for (let n = 0; n < 3; n++) {
      cine.start(CINEMATIC_ORDER[n * 5], specOf(CINEMATIC_ORDER[n * 5]));
      for (let i = 0; i < 90 && cine.active; i++) { if (cine.phase === 'build' && cine.t > 0.35) cine.impact(); cine.update(DT, 0); cine.pose(a, out); }
    }
    expect(cine.cam).toBe(cam0);
    expect(cine.fix[1]).toBe(fix0);
    expect(cine.timing).toBe(timing0);
  });

  it('Verläufe bleiben in 0 … 1 und sind monoton (keine Rucker in den Kamerafahrten)', () => {
    for (const e of ['linear', 'inOut', 'out', 'in', 'snap', 'hold'] as const) {
      let prev = -1;
      for (let i = 0; i <= 50; i++) {
        const v = cineEase(e, i / 50);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = v;
      }
      expect(cineEase(e, 0)).toBeCloseTo(0, 9);
      expect(cineEase(e, 1)).toBeCloseTo(1, 9);
    }
  });

  it('HUD tritt während der Sequenz zurück (Kinobalken-Klasse), das Overlay fängt nie Zeiger ab', () => {
    const css = readFileSync(new URL('../src/ui/css/hud.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.anime-impact\.cine ~ \.hud[^{]*\{[^}]*opacity:\s*0/);
    expect(css).toMatch(/\.anime-impact \{[^}]*pointer-events:\s*none !important/);
    // große Banner („Schiff versenkt!“) treten zurück und warten bis nach der Sequenz
    expect(css).toMatch(/\.cbt-banner\.hush \{[^}]*visibility:\s*hidden/);
    const ov = readFileSync(new URL('../src/ui/combatOverlay.ts', import.meta.url), 'utf8');
    expect(ov).toMatch(/if \(this\.quietOn \|\| now < this\.bannerUntil\)/);
  });
});

describe('Sicht-Raster: schnelle Sichtprüfung gegen Schiffsmodelle', () => {
  /** kleine, feste Zufallsfolge */
  const rnd = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  /** Dreiecks-Suppe in Schiffsgröße (18 × 6 × 15 m): Planken, Stangen, Segel als lose Dreiecke */
  function soup(n: number, r: () => number): Float32Array {
    const f = new Float32Array(n * 9);
    for (let t = 0; t < n; t++) {
      const cx = (r() - 0.5) * 18, cy = r() * 15, cz = (r() - 0.5) * 6, s = 0.2 + r() * 1.6;
      for (let k = 0; k < 3; k++) { f[t * 9 + k * 3] = cx + (r() - 0.5) * s; f[t * 9 + k * 3 + 1] = cy + (r() - 0.5) * s; f[t * 9 + k * 3 + 2] = cz + (r() - 0.5) * s; }
    }
    return f;
  }

  it('gleiches Ergebnis wie die Prüfung aller Dreiecke (nächster Treffer, beidseitig, near/far), auch mit Index und Zeichenbereich', () => {
    const r = rnd(7);
    const pos = soup(3000, r);
    const g = buildSightGrid(pos, 3, 0, null, 0, 3000)!;
    expect(g.cells).toBeGreaterThan(20);
    expect(g.triCount).toBe(3000);
    let hits = 0;
    for (let i = 0; i < 600; i++) {
      const ox = (r() - 0.5) * 40, oy = r() * 20 - 2, oz = (r() - 0.5) * 30;
      const tx = (r() - 0.5) * 18, ty = r() * 15, tz = (r() - 0.5) * 6;
      const d = Math.hypot(tx - ox, ty - oy, tz - oz);
      const dx = (tx - ox) / d, dy = (ty - oy) / d, dz = (tz - oz) / d;
      const far = d * (0.4 + r() * 0.6);
      const a = sightGridHit(g, ox, oy, oz, dx, dy, dz, 0.05, far);
      const b = bruteForceHit(pos, 3, 0, null, 0, 3000, ox, oy, oz, dx, dy, dz, 0.05, far);
      if (b === Infinity) expect(a).toBe(Infinity); else { expect(a).toBeCloseTo(b, 9); hits++; }
    }
    expect(hits).toBeGreaterThan(100);
    // Index-Puffer, verschachtelter Abstand (Stride 4) und nur ein Teil der Dreiecke im Zeichenbereich
    const n = 800, inter = new Float32Array(n * 3 * 4), idx = new Uint32Array(n * 3);
    for (let v = 0; v < n * 3; v++) { inter[v * 4] = pos[v * 3]; inter[v * 4 + 1] = pos[v * 3 + 1]; inter[v * 4 + 2] = pos[v * 3 + 2]; inter[v * 4 + 3] = 9; }
    for (let t = 0; t < n; t++) { idx[t * 3] = t * 3 + 2; idx[t * 3 + 1] = t * 3; idx[t * 3 + 2] = t * 3 + 1; }
    const gi = buildSightGrid(inter, 4, 0, idx, 100, 500)!;
    for (let i = 0; i < 300; i++) {
      const ox = (r() - 0.5) * 40, oy = r() * 20 - 2, oz = (r() - 0.5) * 30;
      const dx = -ox, dy = 7 - oy, dz = -oz, L = Math.hypot(dx, dy, dz);
      const a = sightGridHit(gi, ox, oy, oz, dx / L, dy / L, dz / L, 0, L);
      const b = bruteForceHit(inter, 4, 0, idx, 100, 500, ox, oy, oz, dx / L, dy / L, dz / L, 0, L);
      if (b === Infinity) expect(a).toBe(Infinity); else expect(a).toBeCloseTo(b, 9);
    }
  });

  it('je Geometrie einmal gebaut (gepuffert), neue Puffer-Version baut neu, laufend veränderte Geometrie zählt nicht als Hindernis', () => {
    const r = rnd(11);
    const geo = new BufferGeometry();
    const attr = new BufferAttribute(soup(400, r), 3);
    geo.setAttribute('position', attr);
    const b0 = sightGridStats.builds;
    const g1 = sightGridOf(geo)!;
    expect(sightGridOf(geo)).toBe(g1);
    expect(sightGridStats.builds).toBe(b0 + 1);
    attr.needsUpdate = true;
    const g2 = sightGridOf(geo)!;
    expect(g2).not.toBe(g1);
    expect(sightGridStats.builds).toBe(b0 + 2);
    // ändert sich die Geometrie immer wieder (Stoff, Teilchen), gibt das Raster auf
    for (let i = 0; i < 4; i++) { attr.needsUpdate = true; sightGridOf(geo); }
    expect(sightGridOf(geo)).toBeNull();
    // gepackte Positionen (komprimierte Modelle) werden einmal als Gleitkomma gelesen
    const q = new BufferGeometry();
    q.setAttribute('position', new BufferAttribute(Int16Array.of(0, 0, 0, 32767, 0, 0, 0, 32767, 0), 3, true));
    const gq = sightGridOf(q)!;
    expect(sightGridHit(gq, 0.25, 0.25, -1, 0, 0, 1, 0, 5)).toBeCloseTo(1, 6);
    // leere Geometrie: kein Raster
    expect(sightGridOf(new BufferGeometry())).toBeNull();
  });

  it('die Kino-Sichtprüfung der Welt nutzt das Raster (keine Dreiecks-Schleife von three gegen ganze Schiffe)', () => {
    const src = readFileSync(new URL('../src/world/seaWorld.ts', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('private readonly cineSight: CineSight'), src.indexOf('/** Bezugspunkte der Kino-Regie'));
    expect(body).toContain('sightGridHit(');
    expect(body).not.toContain('intersectObject(');
  });
});

/** Typ-Prüfung: die Choreografien decken alle Arten ab (kein vergessener Eintrag) */
const _all: Record<CataclysmKind, UltimateCinematic> = ULTIMATE_CINEMATICS;
void _all;
