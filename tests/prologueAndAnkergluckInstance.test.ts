// Phase 4.7D – die filmreife 7-Szenen-Inszenierung des Prologs (PrologueDirector, Drehbuch, Partitur, Licht, Kamera, Grünmarkt, Schiffs- und
// Ozean-Spaltung, Ego-Sicht am Strand, Überspringen) und die aufgewertete Einführung „Ankerglück“ (Stufe 1 → 3: Schmiede mit Funkenflug,
// klassenbezogene Kombo, Sternbild-Klassenbaum, kleine Crew, Küstengefecht, Kurogane-Kriegsschiff vor dem Hafen) – dazu aus 4.7A die private
// Instanz, der Übergang in die geteilte Welt, „Prolog überspringen“ und die Spielstand-Migration.
import { describe, expect, it } from 'vitest';
import { CatmullRomCurve3, Vector3 } from 'three';
import {
  ADMIRALS, BEAM_RIDE, DECK_CREW, DECK_PLAY, DYNAMIC_SHOTS, EYELIDS, EYE_BLUR, FLAGSHIP, FLEET, GRADES, GRUENMARKT, PROLOGUE_LINES, PROLOGUE_RULES,
  PROLOGUE_SCENES, PROLOGUE_SCENE_IDS, PROLOGUE_SCRIPT, SCHWARZBART, SCHWARZBART_FACE, SCORE_CUE_IDS, SCORE_SYNC, SHARED_PRESENCE, SHIP_COACH, SHOTS,
  TUTORIAL, TUTORIAL_ACTS, TUTORIAL_NPC_IDS, TUTORIAL_QUESTS, admiralLook, combatCoach, linenLook, type GradeId, type TutorialAct, type TutorialQuestId,
} from '../src/data/prologue';
import { FILM_SECONDS, PrologueDirector, PrologueOut, simulatePrologue, type PrologueGeo } from '../src/story/prologueDirector';
import { HERO_INTRO, HERO_LOOP, SCORE_PARTS, compose, voiceCount, type Instr } from '../src/audio/prologueScore';
import { EXPRESSIONS } from '../src/data/characterRig';
import { FIGUREHEADS, FIGUREHEAD_DEFS, STORY_FIGUREHEADS, figureheadModel } from '../src/data/figureheads';
import { FLAGSHIP_FINISH } from '../src/graphics/pbrMaterialForge';
import { cutPlane } from '../src/entities/ship/shipSplit';
import { trenchCPU } from '../src/world/ocean';
import { frameToWorld, gmCoastZ, gmHeight } from '../src/world/prologueGeo';
import {
  TUTORIAL_END, beyondLeash, cleanInstance, dissolve, enterTutorial, isPrivate, isTutorialQuest, legacyInstance, newInstance, skipIntro, worldGates,
} from '../src/story/tutorialInstance';
import { QUESTS, QUEST_BY_ID, TOWN_NPCS } from '../src/data/quests';
import { QuestSystem } from '../src/story/questSystem';
import { createSave, defaultProgress, SAVE_VERSION } from '../src/core/save/types';
import { migrateSave } from '../src/core/save/migrations';
import { TUT_FLAGS, TutorialFlow, type TutorialHost, type TutorialProbe } from '../src/core/tutorialFlow';
import { PRESENCE_IN, PRESENCE_OUT, SharedPresence, localRoster, peerLoop, type PresenceHost } from '../src/world/sharedPresence';
import { CREW_BY_ID } from '../src/data/crew';

// ---------------------------------------------------------------------------------------------------------------
// Hilfen: der Prolog im Zeitraffer
// ---------------------------------------------------------------------------------------------------------------

type Ev = ReturnType<typeof simulatePrologue>[number];
const run = (reachAt = 16) => simulatePrologue(1 / 60, reachAt);
/** Szenenzeit eines Ereignisses (erstes passendes) */
const sceneT = (ev: Ev[], scene: number, type: string, id: string) => ev.find((e) => e.scene === scene && e.type === type && e.id === id)?.sceneT ?? Number.NaN;

/** Regie Schritt für Schritt mit Abfragen dazwischen (Balken, Zeitmaß, Musiklage) */
function stepper(reachAt = 16) {
  const d = new PrologueDirector();
  const out = new PrologueOut();
  const geo: PrologueGeo = { reached: false };
  const step = () => {
    geo.reached = d.scene === 'gegenangriff' && d.state.play && d.state.sceneT >= reachAt;
    d.step(1 / 60, geo, out);
  };
  /** bis zur Szenenzeit `t` der Szene `scene` laufen lassen */
  const until = (scene: string, t: number) => { for (let i = 0; i < 60 * 400 && !d.done && !(d.scene === scene && d.state.sceneT >= t); i++) step(); };
  return { d, step, until };
}

const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11; };
const warmth = (hex: string) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) & 255) - (n & 255); };

// ---------------------------------------------------------------------------------------------------------------
// Prolog: Regie der sieben Szenen
// ---------------------------------------------------------------------------------------------------------------

describe('4.7D PrologueDirector: sieben Szenen, Takt für Takt', () => {
  it('sieben Szenen in fester Reihenfolge, danach fertig – Grünmarkt bis Erwachen am Strand; nur Szene 4 ist spielbar', () => {
    const ev = run();
    expect(ev.filter((e) => e.type === 'scene').map((e) => e.id)).toEqual([...PROLOGUE_SCENE_IDS]);
    expect(PROLOGUE_SCENES.map((s) => s.nr)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(ev[ev.length - 1].type).toBe('done');
    expect(PROLOGUE_SCENES.filter((s) => s.film).map((s) => s.id)).toEqual(['gruenmarkt', 'sturmfront', 'vernichtung', 'urteil', 'schwur', 'erwachen']);
    expect(FILM_SECONDS).toBeGreaterThan(110);
    expect(FILM_SECONDS).toBeLessThan(160);
    expect(ev.filter((e) => e.type === 'play').map((e) => e.scene)).toEqual([4]);
  });

  it('Szene 1: Klavier, Schwarzbarts fünf Sätze mit Pausen, Trommel-Einsatz, Winddreh, Crescendo – dann genau 1,2 s absolute Stille', () => {
    const ev = run();
    const lines = ev.filter((e) => e.scene === 1 && e.type === 'line');
    expect(lines.map((e) => e.id)).toEqual(['leben1', 'leben2', 'menschen', 'wind', 'haefen']);
    expect(PROLOGUE_LINES.leben1.text).toBe('Das Leben …');
    expect(PROLOGUE_LINES.leben2.text).toBe('Das Leben kann so schön und ruhig sein …');
    expect(PROLOGUE_LINES.menschen.text).toBe('So viele Menschen, die wir lieben und kennen …');
    expect(PROLOGUE_LINES.wind.text).toBe('Doch wenn der Wind sich dreht …');
    expect(PROLOGUE_LINES.haefen.text).toBe('… sind auch die sichersten und ruhigsten Häfen …');
    // jede Zeile ist verklungen, bevor die nächste kommt (bedeutungsvolle Pausen)
    for (let i = 1; i < lines.length; i++) expect(lines[i].sceneT).toBeGreaterThanOrEqual(lines[i - 1].sceneT + PROLOGUE_LINES[lines[i - 1].id].hold + 0.3);
    // Klavier ab dem Start, Trommel-Einsatz mit dem zweiten Satz, Winddreh mit dem vierten, Stopp nach dem letzten
    expect(sceneT(ev, 1, 'music', 'hafen')).toBeCloseTo(SCORE_SYNC.hafenStart, 5);
    expect(sceneT(ev, 1, 'line', 'leben2')).toBeCloseTo(SCORE_SYNC.drumsIn, 5);
    expect(sceneT(ev, 1, 'line', 'wind')).toBeCloseTo(SCORE_SYNC.windTurn, 5);
    expect(sceneT(ev, 1, 'line', 'haefen')).toBeCloseTo(SCORE_SYNC.crescendo, 5);
    expect(sceneT(ev, 1, 'music', 'stop')).toBeCloseTo(SCORE_SYNC.stop, 5);
    expect(sceneT(ev, 1, 'amb', 'stille')).toBeCloseTo(SCORE_SYNC.stop, 5);
    expect(PROLOGUE_SCENES[0].dur).toBeCloseTo(SCORE_SYNC.stop + SCORE_SYNC.silence, 5);
    // die Stille: keine Musik, kein Umgebungsklang – bis die Sturmfront beginnt
    const s = stepper();
    s.until('gruenmarkt', SCORE_SYNC.stop - 0.1);
    expect(s.d.musicAudible).toBe(true);
    s.until('gruenmarkt', SCORE_SYNC.stop + 0.05);
    expect(s.d.musicAudible).toBe(false);
    expect(s.d.state.silent).toBe(true);
    s.until('gruenmarkt', SCORE_SYNC.stop + SCORE_SYNC.silence - 0.05);
    expect(s.d.scene).toBe('gruenmarkt');
    expect(s.d.musicAudible).toBe(false);
    for (let i = 0; i < 12; i++) s.step();
    expect(s.d.scene).toBe('sturmfront');
    expect(s.d.state.silent).toBe(false);
  });

  it('Szene 2: Vertigo-Anstieg, die sieben Silhouetten leuchten nacheinander auf, Blitze – genau auf „Tod“ bricht der Endkampf-Soundtrack los', () => {
    const ev = run();
    expect(ev.filter((e) => e.scene === 2 && e.type === 'fx' && e.id === 'silhouette').map((e) => e.v)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(ev.filter((e) => e.scene === 2 && e.type === 'fx' && e.id === 'blitz').length).toBeGreaterThanOrEqual(4);
    expect(ev.find((e) => e.scene === 2 && e.type === 'shot')?.id).toBe('s2_vertigo');
    // Wort für Wort: „… dem“ · „Tod“ · „geweiht!“ – Einsatz, Donnerblitz und Schnitt liegen exakt auf „Tod“
    const tod = PROLOGUE_LINES.tod;
    expect(tod.words?.map((w) => w[0])).toEqual(['… dem', 'Tod', 'geweiht!']);
    expect(SCORE_SYNC.todLine + tod.words![1][1]).toBeCloseTo(SCORE_SYNC.todWord, 5);
    expect(sceneT(ev, 2, 'line', 'tod')).toBeCloseTo(SCORE_SYNC.todLine, 5);
    expect(sceneT(ev, 2, 'music', 'untergang')).toBeCloseTo(SCORE_SYNC.todWord, 5);
    expect(sceneT(ev, 2, 'fx', 'todBlitz')).toBeCloseTo(SCORE_SYNC.todWord, 5);
    expect(sceneT(ev, 2, 'shot', 's2_drohung')).toBeCloseTo(SCORE_SYNC.todWord, 5);
    // vorher läuft keine Musik (die Stille aus Szene 1 trägt bis zum Wort)
    expect(ev.some((e) => e.scene === 2 && e.type === 'music' && e.sceneT < SCORE_SYNC.todWord)).toBe(false);
    // der Schlag liegt im Satz selbst ganz vorn (Puffer 0,05 s): Chor, Trommeln, Blech und Sub-Bass zugleich
    const hit = new Set(compose('untergang').notes.filter((n) => n.t < 0.1).map((n) => n.i));
    for (const i of ['choir', 'taiko', 'lowBrass', 'sub', 'timpani'] as Instr[]) expect(hit.has(i), i).toBe(true);
  });

  it('Szene 3: Raid-Montage – Salven, sieben Elementar-Angriffe, Brände, Landkampf, Einstürze, sieben Farbstrahlen, Verwüstung, Fade-Out und harter Schnitt', () => {
    const ev = run();
    const fx = ev.filter((e) => e.scene === 3 && e.type === 'fx');
    expect(fx.filter((e) => e.id === 'salve').length).toBeGreaterThanOrEqual(4);
    expect(fx.filter((e) => e.id === 'element').map((e) => e.v)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const id of ['brand', 'landkampf', 'einsturz', 'strahlen', 'verwuestung']) expect(fx.some((e) => e.id === id), id).toBe(true);
    expect(ev.filter((e) => e.scene === 3 && e.type === 'shot').map((e) => e.id)).toEqual(['s3_salve', 's3_pier', 's3_strasse', 's3_luft', 's3_ruinen']);
    const fade = ev.find((e) => e.scene === 3 && e.type === 'music' && e.id === 'untergang');
    expect(fade?.v).toBe(0);
    expect(fade!.sceneT).toBeGreaterThan(18);
    const black = ev.find((e) => e.scene === 3 && e.type === 'black');
    expect(black?.v).toBe(1);
    expect(black!.d).toBeLessThan(0.1);
  });

  it('Szene 4: Schnitt auf die Schwarze Krone, Schrei, Orchester, dann spielbar – Balken fahren zurück, „An die Kanonen!“, Ziel erreicht → Szene 5', () => {
    const ev = run(16);
    expect(sceneT(ev, 4, 'line', 'durchkommen')).toBeCloseTo(SCORE_SYNC.scream, 5);
    expect(PROLOGUE_LINES.durchkommen.text).toBe('WIR LASSEN SIE NICHT DAMIT DURCHKOMMEN!');
    expect(PROLOGUE_LINES.durchkommen.shout).toBe(true);
    expect(sceneT(ev, 4, 'music', 'gegenangriff')).toBeCloseTo(SCORE_SYNC.heroIn, 5);
    expect(SCORE_SYNC.heroIn).toBeGreaterThan(SCORE_SYNC.scream);
    expect(sceneT(ev, 4, 'line', 'kanonen')).toBeGreaterThan(DECK_PLAY.from);
    expect(PROLOGUE_LINES.kanonen.text).toBe('AN DIE KANONEN!');
    expect(ev.some((e) => e.scene === 4 && e.type === 'ready')).toBe(true);
    expect(ev.some((e) => e.type === 'auto')).toBe(false);
    // Balken: im Film voll, auf dem Deck weg, in Szene 5 wieder da
    const s = stepper(16);
    s.until('gegenangriff', 2);
    expect(s.d.bars).toBe(1);
    expect(s.d.playable).toBe(false);
    s.until('gegenangriff', DECK_PLAY.from + 1.2);
    expect(s.d.bars).toBe(0);
    expect(s.d.playable).toBe(true);
    s.until('gegenangriff', 16.2);
    expect(s.d.playable).toBe(false);
    s.until('urteil', 1);
    expect(s.d.bars).toBe(1);
  });

  it('wer nie an die Kanone kommt, bekommt den Hinweis und steht nach der Zeitgrenze trotzdem dort – der Prolog lässt sich nicht verlieren', () => {
    const ev = run(1e9);
    expect(ev.find((e) => e.type === 'hint')?.id).toBe('hinweis');
    const auto = ev.find((e) => e.type === 'auto');
    expect(auto?.sceneT).toBeCloseTo(DECK_PLAY.from + DECK_PLAY.autoAfter, 1);
    expect(ev.filter((e) => e.type === 'scene').map((e) => e.id)).toContain('urteil');
    expect(ev[ev.length - 1].type).toBe('done');
  });

  it('Szene 5: Aufladung der sieben Auren, Kern (Dolly-Zoom), Strahl-Ritt, Spaltung, Vogelperspektive in Zeitlupe, Engelsgesang, Sturz ins Wasser', () => {
    const ev = run();
    const order = ev.filter((e) => e.scene === 5 && (e.type === 'fx' || e.type === 'shot')).map((e) => e.id);
    for (const [a, b] of [['aufladung', 's5_kern'], ['s5_kern', 'strahl'], ['strahl', 'spaltung'], ['s5_ritt', 'spaltung'], ['spaltung', 's5_oben'], ['s5_oben', 'sturz'], ['sturz', 'eintauchen']]) {
      expect(order.indexOf(a), `${a} vor ${b}`).toBeLessThan(order.indexOf(b));
    }
    expect(sceneT(ev, 5, 'fx', 'strahl')).toBeCloseTo(SCORE_SYNC.beam, 5);
    expect(sceneT(ev, 5, 'shot', 's5_ritt')).toBeCloseTo(SCORE_SYNC.beam, 5);
    expect(sceneT(ev, 5, 'music', 'engel')).toBeCloseTo(SCORE_SYNC.engel, 5);
    expect(ev.find((e) => e.scene === 5 && e.type === 'music' && e.id === 'gegenangriff')?.v).toBe(0);
    for (const g of ['spektrum', 'tiefe']) expect(ev.some((e) => e.scene === 5 && e.type === 'grade' && e.id === g), g).toBe(true);
    // Zeitlupe im Sturz, danach wieder Echtzeit
    const s = stepper();
    s.until('urteil', 7.9);
    expect(s.d.timeScale).toBe(1);
    s.until('urteil', 10);
    expect(s.d.timeScale).toBeLessThan(0.4);
    s.until('urteil', 18.8);
    expect(s.d.timeScale).toBeGreaterThan(0.99);
  });

  it('Szene 6: Schwur in drei Sätzen, Druckwelle mit Trommeln und Chor, sieben Schnitte auf die zurückweichenden Admirale, warmer Engelsgesang', () => {
    const ev = run();
    expect(ev.filter((e) => e.scene === 6 && e.type === 'line').map((e) => e.id)).toEqual(['kommen1', 'kommen2', 'aufhalten']);
    expect(PROLOGUE_LINES.kommen1.text).toBe('Es wird jemand kommen …');
    expect(PROLOGUE_LINES.kommen2.text).toBe('… jemand kommen …');
    expect(PROLOGUE_LINES.aufhalten.text).toBe('ES WIRD JEMAND KOMMEN, DER EUCH AUFHÄLT!');
    expect(sceneT(ev, 6, 'fx', 'druckwelle')).toBeCloseTo(SCORE_SYNC.oath, 5);
    expect(sceneT(ev, 6, 'line', 'aufhalten')).toBeCloseTo(SCORE_SYNC.oath, 5);
    expect(sceneT(ev, 6, 'music', 'schwur')).toBeCloseTo(SCORE_SYNC.oathIn, 5);
    const cuts = ev.filter((e) => e.scene === 6 && e.type === 'shot' && e.id === 's6_admiral');
    expect(cuts.map((e) => e.v)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < cuts.length; i++) expect(cuts[i].sceneT - cuts[i - 1].sceneT).toBeCloseTo(SCORE_SYNC.reactGap, 5);
    expect(ev.filter((e) => e.scene === 6 && e.type === 'fx' && e.id === 'zurueck').map((e) => e.v)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(sceneT(ev, 6, 'music', 'hoffnung')).toBeCloseTo(SCORE_SYNC.hoffnung, 5);
    expect(ev.some((e) => e.scene === 6 && e.type === 'grade' && e.id === 'hoffnung')).toBe(true);
    // der Engelsgesang verklingt mit der Schwarzblende
    const out = ev.find((e) => e.scene === 6 && e.type === 'music' && e.id === 'hoffnung' && e.v === 0);
    expect(out?.sceneT).toBeCloseTo(ev.find((e) => e.scene === 6 && e.type === 'black')!.sceneT, 5);
    // die sieben Schläge der Partitur liegen auf den sieben Schnitten
    const hits = compose('schwur').notes.filter((n) => n.i === 'lowBrass' && n.d < 0.5).map((n) => +(n.t + SCORE_SYNC.oathIn).toFixed(3));
    expect(hits).toEqual(cuts.map((e) => +e.sceneT.toFixed(3)));
  });

  it('Szene 7: Ego-Sicht am Strand – Lider öffnen sich blinzelnd, die Unschärfe weicht, nur Meeresrauschen, dann Aufstehen und Steuerung', () => {
    const ev = run();
    expect(ev.filter((e) => e.scene === 7 && e.type === 'shot').map((e) => e.id)).toEqual(['s7_pov', 's7_auf']);
    expect(ev.find((e) => e.scene === 7 && e.type === 'amb')?.id).toBe('strand');
    expect(ev.some((e) => e.scene === 7 && e.type === 'music')).toBe(false);
    expect(ev.some((e) => e.scene === 7 && e.type === 'fx' && e.id === 'aufstehen')).toBe(true);
    expect(EYELIDS[0][1]).toBe(1);
    expect(EYELIDS[EYELIDS.length - 1][1]).toBe(0);
    let blinks = 0;
    for (let i = 1; i < EYELIDS.length; i++) if (EYELIDS[i][1] > 0.8 && EYELIDS[i - 1][1] < 0.5) blinks++;
    expect(blinks).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < EYE_BLUR.length; i++) expect(EYE_BLUR[i][1]).toBeLessThanOrEqual(EYE_BLUR[i - 1][1]);
    expect(EYE_BLUR[0][1]).toBeGreaterThan(5);
    expect(EYE_BLUR[EYE_BLUR.length - 1][1]).toBe(0);
    // völlige musikalische Stille am Strand
    const s = stepper();
    s.until('erwachen', 0.5);
    expect(s.d.musicAudible).toBe(false);
    s.until('erwachen', 6);
    expect(s.d.musicAudible).toBe(false);
    expect(DYNAMIC_SHOTS).toContain('s7_pov');
  });

  it('gleicher Ablauf bei jedem Durchlauf, alle Taktschläge sortiert, jede Einstellung, Zeile, Stimmung und jedes Stück vorhanden', () => {
    const a = run(), b = run();
    expect(a.map((e) => `${e.scene}:${e.type}:${e.id}:${e.v}`)).toEqual(b.map((e) => `${e.scene}:${e.type}:${e.id}:${e.v}`));
    for (const id of PROLOGUE_SCENE_IDS) {
      const beats = PROLOGUE_SCRIPT[id];
      for (let i = 1; i < beats.length; i++) expect(beats[i].at, `${id} #${i}`).toBeGreaterThanOrEqual(beats[i - 1].at);
      for (const bt of beats) {
        if (bt.kind === 'shot') expect(bt.id in SHOTS || (DYNAMIC_SHOTS as readonly string[]).includes(bt.id), bt.id).toBe(true);
        if (bt.kind === 'line') expect(PROLOGUE_LINES[bt.id], bt.id).toBeTruthy();
        if (bt.kind === 'grade') expect(GRADES[bt.id as GradeId], bt.id).toBeTruthy();
        if (bt.kind === 'music' && bt.id !== 'stop') expect(SCORE_CUE_IDS as readonly string[]).toContain(bt.id);
      }
    }
    // jedes Stück erklingt
    for (const c of SCORE_CUE_IDS) expect(a.some((e) => e.type === 'music' && e.id === c && e.v > 0), c).toBe(true);
  });

  it('Überspringen beendet sofort (fertig, keine Musik, keine Balken, keine Schwarzblende, kein Zeitlupen-Rest)', () => {
    const s = stepper();
    s.until('urteil', 9);
    expect(s.d.timeScale).toBeLessThan(1);
    const out = new PrologueOut();
    s.d.skip(out);
    expect(s.d.done).toBe(true);
    expect(out.events.slice(0, out.n).map((e) => e.type)).toEqual(['done']);
    expect(s.d.musicAudible).toBe(false);
    expect(s.d.bars).toBe(0);
    expect(s.d.timeScale).toBe(1);
    expect(s.d.blackout).toBe(0);
    // ein zweites Überspringen ändert nichts
    s.d.skip(out);
    expect(out.n).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Prolog: Partitur, Licht, Kamera, Bühne
// ---------------------------------------------------------------------------------------------------------------

describe('4.7D Soundtrack, Licht, Kamera und Bühne', () => {
  it('Satz 1: das Klavier wird leiser und fadet bis zum Winddreh ganz aus, Trommeln ab dem zweiten Satz immer schneller und lauter, harter Schluss', () => {
    const mv = compose('hafen');
    const t0 = SCORE_SYNC.hafenStart;
    expect(mv.len).toBeCloseTo(SCORE_SYNC.stop - t0, 5);
    expect(mv.hardEnd).toBe(true);
    const piano = mv.notes.filter((n) => n.i === 'piano');
    expect(piano.length).toBeGreaterThan(40);
    expect(Math.max(...piano.map((n) => n.t))).toBeLessThan(SCORE_SYNC.pianoGone - t0);
    const vol = (a: number, b: number) => { const l = piano.filter((n) => n.t >= a && n.t < b); return l.reduce((s, n) => s + n.v, 0) / Math.max(1, l.length); };
    expect(vol(0, SCORE_SYNC.drumsIn - t0)).toBeGreaterThan(vol(SCORE_SYNC.windTurn - t0, SCORE_SYNC.pianoGone - t0) * 1.5);
    const drums = mv.notes.filter((n) => n.i === 'taiko').sort((a, b) => a.t - b.t);
    expect(drums[0].t).toBeCloseTo(SCORE_SYNC.drumsIn - t0, 5);
    const gap = (a: number) => { const l = drums.filter((n) => n.t >= a); return l.length > 1 ? l[1].t - l[0].t : 99; };
    expect(gap(SCORE_SYNC.crescendo - t0 + 2)).toBeLessThan(gap(SCORE_SYNC.drumsIn - t0) / 4);
    expect(drums[drums.length - 1].v).toBeGreaterThan(drums[0].v * 3);
    // nichts klingt über den harten Stopp hinaus
    for (const n of mv.notes) expect(n.t).toBeLessThan(mv.len);
  });

  it('alle Sätze: Endkampf, Heldentrack mit nahtloser Schleife, Engelsgesang, Schwur, Hoffnung – deterministisch und in vertretbarem Rechenaufwand', () => {
    expect(SCORE_PARTS).toEqual(['hafen', 'untergang', 'gegenangriff', 'gegenangriff_loop', 'engel', 'schwur', 'hoffnung']);
    const has = (id: Parameters<typeof compose>[0], ...is: Instr[]) => { const s = new Set(compose(id).notes.map((n) => n.i)); return is.every((i) => s.has(i)); };
    expect(has('untergang', 'taiko', 'lowBrass', 'choir', 'sub', 'thunder', 'timpani', 'horn')).toBe(true);
    expect(has('gegenangriff_loop', 'horn', 'trumpet', 'spiccato', 'taiko', 'choir')).toBe(true);
    expect(has('engel', 'angel', 'celesta', 'strings')).toBe(true);
    expect(has('schwur', 'choir', 'taiko', 'timpani', 'lowBrass')).toBe(true);
    expect(has('hoffnung', 'angel', 'choir', 'celesta')).toBe(true);
    const loop = compose('gegenangriff_loop');
    expect(loop.loop).toBeCloseTo(HERO_LOOP, 5);
    expect(loop.len).toBeGreaterThan(HERO_LOOP);
    expect(compose('gegenangriff').len).toBeCloseTo(HERO_INTRO, 5);
    // die Schwur-Partitur reicht bis über den letzten Admirals-Schnitt hinaus
    expect(compose('schwur').len + SCORE_SYNC.oathIn).toBeGreaterThan(SCORE_SYNC.reactFrom + 6 * SCORE_SYNC.reactGap + 1);
    let voices = 0;
    for (const id of SCORE_PARTS) voices += voiceCount(compose(id));
    expect(voices).toBeLessThan(4000);
    expect(JSON.stringify(compose('hafen'))).toBe(JSON.stringify(compose('hafen')));
  });

  it('Licht-Dramaturgie: goldene Abendstunde → eiskaltes Gewitterblau → Brand → Spektrum → Unterwasser-Licht → Hoffnung', () => {
    expect(GRADES.gold.time).toBeGreaterThan(18);
    expect(GRADES.gold.time).toBeLessThan(19);
    expect(warmth(GRADES.gold.horizon)).toBeGreaterThan(80);
    expect(warmth(GRADES.sturm.horizon)).toBeLessThan(0);
    expect(warmth(GRADES.sturm.light)).toBeLessThan(0);
    expect(lum(GRADES.sturm.zenith)).toBeLessThan(lum(GRADES.gold.zenith));
    expect(warmth(GRADES.brand.light)).toBeGreaterThan(80);
    expect(GRADES.tiefe.fogShape).toBe(1);
    expect(GRADES.tiefe.fogFar).toBeLessThan(100);
    expect(lum(GRADES.hoffnung.horizon)).toBeGreaterThan(lum(GRADES.tiefe.horizon));
    expect(GRADES.aus.k).toBe(0);
    for (const [id, g] of Object.entries(GRADES)) { expect(g.k, id).toBeGreaterThanOrEqual(0); expect(g.k, id).toBeLessThanOrEqual(1); }
  });

  it('Kamera: Catmull-Rom-Fahrten in festen Rahmen, Vertigo-Dolly-Zoom, Strahl-Ritt; die Stadt-Fahrten bleiben über dem Gelände', () => {
    for (const [id, s] of Object.entries(SHOTS)) {
      expect(s.path.length, id).toBeGreaterThanOrEqual(2);
      const c = new CatmullRomCurve3(s.path.map((p) => new Vector3(...p)), false, 'centripetal');
      const p = c.getPointAt(0.5);
      expect(Number.isFinite(p.x + p.y + p.z), id).toBe(true);
      expect(s.dur, id).toBeGreaterThan(0.5);
      if (s.frame !== 'stadt') continue;
      for (let i = 0; i <= 40; i++) { const q = c.getPointAt(i / 40); expect(q.y - Math.max(0, gmHeight(q.x, q.z)), `${id} bei ${i}/40`).toBeGreaterThan(1); }
    }
    // Vertigo: die Kamera entfernt sich vom Motiv (die Dächer), das Sichtfeld wird eng – das Motiv bleibt, die Front wächst
    const v = SHOTS.s2_vertigo, m = v.dolly!;
    const dist = (q: readonly number[]) => Math.hypot(q[0] - m[0], q[1] - m[1], q[2] - m[2]);
    expect(dist(v.path[v.path.length - 1])).toBeGreaterThan(dist(v.path[0]) * 3);
    expect(v.fov[0]).toBeGreaterThan(v.fov[1] * 2);
    // der Kern zieht im Dolly-Zoom zusammen (Sichtfeld halbiert sich)
    expect(SHOTS.s5_kern.fov[0]).toBeGreaterThanOrEqual(SHOTS.s5_kern.fov[1] * 2);
    expect(BEAM_RIDE.speed).toBeGreaterThan(150);
    expect(BEAM_RIDE.behind).toBeGreaterThan(5);
    // Rahmen: lokales +z zeigt nach (sin h, cos h), lokales +x nach (cos h, −sin h)
    const out = { x: 0, y: 0, z: 0 };
    frameToWorld({ x: 10, z: 20, h: Math.PI / 2 }, 0, 3, 5, out);
    expect(out.x).toBeCloseTo(15, 5);
    expect(out.z).toBeCloseTo(20, 5);
    expect(out.y).toBe(3);
    frameToWorld({ x: 0, z: 0, h: Math.PI / 2 }, 4, 0, 0, out);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(-4, 5);
  });

  it('Grünmarkt: Uferterrasse an der Kaimauer, Hügel landeinwärts (keine Gruben), Häuser auf ebenen Bauplätzen, Laternen, Stege, Boote, Bewohner', () => {
    expect(gmCoastZ(0)).toBeCloseTo(0, 5);
    expect(gmHeight(0, -10)).toBeGreaterThan(1.2);
    expect(gmHeight(0, 30)).toBeLessThan(0);
    expect(gmHeight(0, -62)).toBeGreaterThan(gmHeight(0, -10) + 6);
    // das Gelände ist überall stetig und ohne Gruben: nie tiefer als der Meeresgrund, nie höher als Terrasse plus Hügel
    let lo = 1e9, hi = -1e9, jump = 0;
    for (let x = -130; x <= 130; x += 2) for (let z = -165; z <= 12; z += 2) {
      const h = gmHeight(x, z);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
      jump = Math.max(jump, Math.abs(gmHeight(x + 2, z) - h), Math.abs(gmHeight(x, z + 2) - h));
    }
    expect(lo).toBeGreaterThanOrEqual(-5);
    expect(hi).toBeLessThanOrEqual(GRUENMARKT.plateau + GRUENMARKT.hill + 0.6);
    expect(jump).toBeLessThan(2);
    // jedes Haus steht an Land; die hinteren Reihen am Hang auf ebenem Grund
    for (const [t, x, z] of GRUENMARKT.houses) {
      expect(gmHeight(x, z), `${t} ${x},${z}`).toBeGreaterThan(0.8);
      if (z < -20) for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) expect(Math.abs(gmHeight(x + dx, z + dz) - gmHeight(x, z)), `${t} ${x},${z}`).toBeLessThan(0.05);
    }
    const kapelle = GRUENMARKT.houses.find((h) => h[0] === 'kapelle')!;
    expect(gmHeight(kapelle[1], kapelle[2])).toBeGreaterThan(8);
    expect(GRUENMARKT.houses.filter((h) => h[0] === 'fachwerkhaus').length).toBeGreaterThanOrEqual(6);
    expect(GRUENMARKT.props.filter((p) => p[0] === 'laterne').length).toBeGreaterThanOrEqual(6);
    expect(GRUENMARKT.piers.length).toBeGreaterThanOrEqual(3);
    expect(GRUENMARKT.boats.length).toBeGreaterThanOrEqual(5);
    expect(GRUENMARKT.folk.length).toBeGreaterThanOrEqual(8);
    for (const i of GRUENMARKT.burn) expect(GRUENMARKT.houses[i], `Brand ${i}`).toBeTruthy();
    for (const pair of GRUENMARKT.collapse) for (const i of pair) expect(GRUENMARKT.houses[i]).toBeTruthy();
  });

  it('Schiffsteilung und Ozean-Spaltung: der Strahl teilt die Schwarze Krone der Länge nach, der Graben reicht bis auf den Meeresgrund', () => {
    const n = cutPlane('length');
    expect([n.nx, n.ny, n.nz]).toEqual([1, 0, 0]);
    const t = { ax: 0, az: 0, bx: 0, bz: 600, hw: BEAM_RIDE.half, depth: BEAM_RIDE.depth, soft: 6 };
    expect(trenchCPU(0, 300, t)).toBeCloseTo(-BEAM_RIDE.depth, 3);
    expect(trenchCPU(BEAM_RIDE.half + 30, 300, t)).toBeCloseTo(0, 3);
    // Wälle am Rand: das verdrängte Wasser türmt sich auf
    let wall = 0;
    for (let x = BEAM_RIDE.half; x < BEAM_RIDE.half + 12; x += 0.5) wall = Math.max(wall, trenchCPU(x, 300, t));
    expect(wall).toBeGreaterThan(3);
    // der Graben ist tiefer als der Tiefgang jedes Schiffs (die Hälften sinken bis auf den Grund)
    expect(BEAM_RIDE.depth).toBeGreaterThan(25);
    expect(BEAM_RIDE.half * 2).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Prolog: Figuren, Schiffe, Regeln
// ---------------------------------------------------------------------------------------------------------------

describe('4.7D Schwarzbart, „Die Schwarze Krone“ und die sieben Admirale', () => {
  it('Schwarzbart: 1,65 ×, schwerer dunkler Kapitänsmantel, dichter Vollbart, glühende Willenskraft-Augen, Schrei und Schwur als Mimik', () => {
    expect(SCHWARZBART.name).toBe('Kapitän Schwarzbart');
    expect(SCHWARZBART.scale).toBe(1.65);
    expect(SCHWARZBART.look.coat).toBe('kapitaen');
    expect(lum(SCHWARZBART.look.coatColor!)).toBeLessThan(30);
    expect(SCHWARZBART.look.beard).toBe('vollbart');
    expect(SCHWARZBART.build).toBe('koloss');
    expect(SCHWARZBART.eyeGlow).toMatch(/^#[0-9A-F]{6}$/i);
    for (const f of Object.values(SCHWARZBART_FACE)) expect(EXPRESSIONS[f], f).toBeTruthy();
    expect(EXPRESSIONS.schrei.glow).toBe(1);
    expect(EXPRESSIONS.schrei.w.mouthA).toBeGreaterThan(0.7);
    expect(EXPRESSIONS.schwur.glow).toBe(1);
  });

  it('Die Schwarze Krone: rabenschwarzer Rumpf, pechschwarze Segel, gekröntes Seeungeheuer, Kronen-Steuerrad, Eisen und Gold – nicht in der Werft', () => {
    expect(FLAGSHIP.name).toBe('Die Schwarze Krone');
    expect(FLAGSHIP.tier).toBe(6);
    expect(FLAGSHIP.look.regal).toBe('krone');
    expect(FLAGSHIP.look.figurehead).toBe('crowned_kraken');
    expect(figureheadModel(FLAGSHIP.look.figurehead)).toBe('crowned_kraken');
    expect(lum(FLAGSHIP.look.hull)).toBeLessThan(20);
    expect(lum(FLAGSHIP.look.sail!)).toBeLessThan(20);
    expect(FIGUREHEAD_DEFS.crowned_kraken.name).toBe('Gekröntes Seeungeheuer');
    expect(STORY_FIGUREHEADS).toContain('crowned_kraken');
    expect(Object.keys(FIGUREHEADS)).not.toContain('crowned_kraken');
    expect(FLAGSHIP_FINISH.ebony.metalness).toBeLessThan(0.2);
    expect(FLAGSHIP_FINISH.iron.metalness).toBeGreaterThan(0.6);
    expect(FLAGSHIP_FINISH.gold.metalness).toBeGreaterThan(0.8);
    expect(FLAGSHIP_FINISH.gun.metalness).toBeGreaterThan(0.8);
    expect(FLAGSHIP_FINISH.gem.emissive).toBeTruthy();
  });

  it('die sieben Admirale leuchten in sieben Spektren durch den Nebel, ihre Flaggschiffe sind riesige dunkle Schattenhüllen', () => {
    expect(ADMIRALS.map((a) => a.spectrum)).toEqual(['Purpurrot', 'Abgrund-Violett', 'Sonnengold', 'Gletscher-Cyan', 'Sturm-Smaragd', 'Obsidian-Magenta', 'Strahlendes Weißgold']);
    expect(new Set(ADMIRALS.map((a) => a.color)).size).toBe(7);
    expect([...ADMIRALS.map((a) => a.slot)].sort((a, b) => a - b)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(ADMIRALS.find((a) => a.slot === 0)?.id).toBe('sturmwall');
    for (const a of ADMIRALS) { const l = admiralLook(a); expect(l.stripe).toBe(a.color); expect(lum(l.hull)).toBeLessThan(40); expect(lum(l.sail!)).toBeLessThan(50); }
    expect(FLEET.scale).toBeGreaterThan(1.2);
    expect(FLEET.admiralTier).toBeGreaterThan(FLEET.frigateTier);
  });

  it('Regeln des Prologs: kein brennendes Deck, keine Marine-Soldaten an Bord, keine eigenen Truppen – der Schiffsjunge in Leinen inmitten der Crew', () => {
    expect(PROLOGUE_RULES).toEqual({ shipFire: false, marinesOnDeck: 0, ownTroops: 0, playerClothes: 'leinen' });
    // in der Sturmjagd weder Feuer noch Entern noch Marine an Deck
    for (const bt of PROLOGUE_SCRIPT.gegenangriff) expect(['feuer', 'brand', 'entern', 'marine', 'truppen'], bt.id).not.toContain(bt.id);
    // die freie Kanone liegt mittschiffs, jede andere ist mit Piraten besetzt
    expect(DECK_CREW.perGun).toBeGreaterThanOrEqual(2);
    expect(Math.abs(DECK_CREW.freeGunAt)).toBeLessThan(0.3);
    const look = linenLook({ hair: 'kurz', eyeColor: '#123456', coat: 'kapitaen', hat: 'dreispitz', glasses: 'flieger' } as never) as Record<string, unknown>;
    expect(look.outfit).toBe('hemd');
    expect(look.shoes).toBe('schuhe');
    expect(look.coat).toBe('keiner');
    expect(look.hat).toBe('keiner');
    expect(look.glasses).toBe('keine');
    expect(look.hair).toBe('kurz');
    expect(look.eyeColor).toBe('#123456');
    // alle Zeilen deutsch, vorhanden und lang genug sichtbar
    for (const [id, l] of Object.entries(PROLOGUE_LINES)) { expect(l.text.length, id).toBeGreaterThan(3); expect(l.hold, id).toBeGreaterThan(1); expect(l.who.length, id).toBeGreaterThan(2); }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Private Instanz
// ---------------------------------------------------------------------------------------------------------------

describe('4.7A Private Instanz „Ankerglück“ und Übergang in die geteilte Welt', () => {
  it('neues Spiel: Prolog (Bühne, kein Verkehr) → Einführung (privat, Leine, keine Mitspieler) → geteilte Welt (Verkehr und Mitspieler)', () => {
    const s = newInstance();
    expect(s.mode).toBe('prolog');
    expect(isPrivate(s)).toBe(true);
    expect(worldGates(s)).toEqual({ traffic: false, presence: false, leash: false, stage: true });
    enterTutorial(s);
    expect(s.mode).toBe('tutorial');
    expect(worldGates(s)).toEqual({ traffic: false, presence: false, leash: true, stage: false });
    dissolve(s, 1234);
    expect(s.mode).toBe('shared');
    expect(isPrivate(s)).toBe(false);
    expect(s.sharedAt).toBe(1234);
    expect(s.ship).toBe(true);
    expect(s.raid).toBe('repelled');
    expect(worldGates(s)).toEqual({ traffic: true, presence: true, leash: false, stage: false });
    // ein zweites Auflösen ändert nichts mehr
    dissolve(s, 9999);
    expect(s.sharedAt).toBe(1234);
  });

  it('Leine der Einführung um Ankerglück', () => {
    expect(beyondLeash(TUTORIAL.leash - 1, 0, 0, 0)).toBe(false);
    expect(beyondLeash(TUTORIAL.leash + 1, 0, 0, 0)).toBe(true);
  });

  it('Säubern beim Laden: kaputt oder fehlend → offene Welt; ein unterbrochener Überfall beginnt neu', () => {
    expect(cleanInstance(undefined).mode).toBe('shared');
    expect(cleanInstance('quatsch').mode).toBe('shared');
    expect(cleanInstance({ mode: 'irgendwas' }).mode).toBe('shared');
    const t = cleanInstance({ v: 1, mode: 'tutorial', skipped: false, ship: true, sharedAt: -1, raid: 'running' });
    expect(t.mode).toBe('tutorial');
    expect(t.ship).toBe(true);
    expect(t.raid).toBe('none');
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });

  it('Auftragsdaten t1 – t5: Hauptgeschichte, Reihenfolge, Bewohner vorhanden, Handlungen gültig, Lohn am Ende', () => {
    const ids = QUESTS.map((q) => q.id);
    expect(ids.slice(0, 5)).toEqual([...TUTORIAL_QUESTS]);
    for (let i = 0; i < TUTORIAL_QUESTS.length; i++) {
      const q = QUEST_BY_ID[TUTORIAL_QUESTS[i]];
      expect(q.main).toBe(true);
      expect(isTutorialQuest(q.id)).toBe(true);
      if (i > 0) { expect(q.auto).toBe(true); expect(q.after).toBe(TUTORIAL_QUESTS[i - 1]); }
      for (const st of q.steps) {
        if (st.type === 'talk') expect(TOWN_NPCS.some((n) => n.id === st.npc), st.npc).toBe(true);
        if (st.type === 'act') expect(TUTORIAL_ACTS).toContain(st.act);
      }
    }
    for (const id of Object.values(TUTORIAL_NPC_IDS)) expect(TOWN_NPCS.some((n) => n.id === id), id).toBe(true);
    expect(QUEST_BY_ID.t1.noOffer).toBe(true);
    expect(QUEST_BY_ID.t5.reward.gold).toBe(TUTORIAL.thanksGold);
    expect(CREW_BY_ID[TUTORIAL.starterCrew]).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Einführung 4.7D: Texte und Lehrtafeln
// ---------------------------------------------------------------------------------------------------------------

describe('4.7D Einführung: Hinnerk, Bodos Schmiede, Konrads Lehrtafel, Ilses Schaluppe, Gerstenkorns Kristall', () => {
  it('Texte: Hinnerk begrüßt und schickt zu Bodo, Bodo schmiedet mit Funken, Klassen-Kombo, Sternbild, kleine Crew, Küstengefecht, Stufe 3 und Geistes-Faji (Q)', () => {
    const stepText = (q: string, act: string) => QUEST_BY_ID[q].steps.find((s) => s.type === 'act' && s.act === act)?.text ?? '';
    expect(QUEST_BY_ID.t1.outro).toMatch(/Bodo/);
    expect(QUEST_BY_ID.t1.outro).toMatch(/Hinnerk schickt dich/);
    expect(QUEST_BY_ID.t2.outro).toMatch(/Funken/);
    expect(stepText('t3', 'combo')).toMatch(/Klassen-Kombo/);
    expect(stepText('t3', 'talent')).toMatch(/Sternbild-Klassenbaum/);
    expect(stepText('t4', 'hire')).toMatch(/kleine Crew/);
    expect(QUEST_BY_ID.t4.steps.find((s) => s.type === 'sink')?.text).toMatch(/Küstengefecht/);
    expect(stepText('t5', 'faji')).toMatch(/Stufe 3/);
    expect(stepText('t5', 'faji')).toMatch(/Priester/);
    expect(stepText('t5', 'art')).toMatch(/Geistes-Faji \(Q\)/);
    expect(QUEST_BY_ID.t5.intro).toMatch(/Kurogane/);
  });

  it('Lehrtafel des Schiffs: alle Anzeigen (Segel, Kompass & Karte, Rumpf, Segeltuch, Breitseiten, Crew & Moral); Kombo-Tafel je Klasse', () => {
    expect(SHIP_COACH.map((c) => c.title)).toEqual(['Segel', 'Kompass & Karte', 'Rumpf', 'Segeltuch', 'Breitseiten', 'Crew & Moral']);
    for (const c of SHIP_COACH) expect(c.text.length, c.title).toBeGreaterThan(40);
    const melee = combatCoach('Sturmklinge', ['Querhieb', 'Rückhand', 'Wirbel'], false);
    expect(melee.map((c) => c.title)).toEqual(['Deine Kombo · Sturmklinge', 'Sturm-Schritt', 'Ziel erfassen', 'Sternbild-Klassenbaum']);
    expect(melee[0].text).toContain('Querhieb → Rückhand → Wirbel');
    expect(melee[0].text).not.toContain('Abstand');
    const ranged = combatCoach('Flammenwirker', ['Funke', 'Glut'], true);
    expect(ranged[0].text).toContain('Abstand');
    expect(combatCoach('Faust', [], false)[0].text).toContain('Leicht-Kette');
    expect(TUTORIAL.forgeBlows).toBeGreaterThanOrEqual(3);
    expect(TUTORIAL.raidShipLead).toBeGreaterThan(1);
    expect(TUTORIAL.raidSalvos).toBeGreaterThanOrEqual(2);
    expect(TUTORIAL.starterHands).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Vollständige Auftragskette mit dem echten Auftragssystem
// ---------------------------------------------------------------------------------------------------------------

class FakeTutorial implements TutorialHost {
  readonly progress = defaultProgress('pirat');
  readonly qs = new QuestSystem(this.progress, 'pirat', { completed: (q) => this.done(q.id), advanced: () => {} });
  readonly flags: Record<string, boolean> = {};
  probeV: TutorialProbe = { hits: 0, dashing: false, targeted: false, artSkills: 0, atHelm: false };
  lvl = 1;
  spentV = 0;
  shipGranted = false;
  hireOffers = 0;
  hired = false;
  coached = false;
  scouts: { live: boolean }[] = [];
  fajiOffers = 0;
  faji = false;
  raids: boolean[] = [];
  raidAlive = 0;
  dissolved = false;
  weapon = false;
  log: string[] = [];

  constructor() { this.qs.accept('t1'); }
  /** wie Game.startAutoChapters: der nächste Einführungs-Auftrag beginnt von selbst */
  private done(id: string) {
    this.log.push(`done:${id}`);
    for (const q of QUESTS) if (q.auto && q.after === id && !this.qs.isActive(q.id) && !this.qs.isDone(q.id)) this.qs.accept(q.id);
  }
  step(id: TutorialQuestId) { return this.qs.step(id); }
  isDone(id: TutorialQuestId) { return this.qs.isDone(id); }
  act(a: TutorialAct) { this.log.push(`act:${a}`); this.qs.event({ type: 'act', act: a }); }
  probe() { return this.probeV; }
  spent() { return this.spentV; }
  level() { return this.lvl; }
  setLevel(n: number) { this.lvl = Math.max(this.lvl, n); this.log.push(`level:${n}`); }
  giveWeapon() { this.weapon = true; this.log.push('weapon'); }
  grantShip() { this.shipGranted = true; this.log.push('ship'); }
  offerHire() { this.hireOffers++; }
  crewHired() { return this.hired; }
  coachShip() { this.coached = true; this.log.push('coach'); }
  spawnScout() { const s = { live: true }; this.scouts.push(s); this.log.push('scout'); return s; }
  scoutLive(h: object) { return (h as { live: boolean }).live; }
  offerFaji() { this.fajiOffers++; }
  fajiEquipped() { return this.faji; }
  spawnRaid(extra: boolean) { this.raids.push(extra); const n = extra ? TUTORIAL.raidExtra.length : TUTORIAL.raid.length; this.raidAlive += n; this.log.push(extra ? 'raid:extra' : 'raid'); return n; }
  raidLeft() { return this.raidAlive; }
  dissolve() { this.dissolved = true; this.log.push('dissolve'); }
  shared() { return this.dissolved; }
  flag(k: string) { return !!this.flags[k]; }
  setFlag(k: string) { this.flags[k] = true; }
  say() {}
  talk(npc: string) { this.qs.event({ type: 'talk', npc }); }
}

/** 4.7D: das Spiel mit allen Inszenierungen (Schmiede, Lehrtafel, Klassenbaum, Kriegsschiff) */
class StagedTutorial extends FakeTutorial {
  forgeDone: (() => void) | null = null;
  coachCombatN = 0;
  treeN = 0;
  assaultN = 0;
  forge(done: () => void) { this.log.push('forge'); this.forgeDone = done; }
  coachCombat() { this.coachCombatN++; this.log.push('coachCombat'); }
  openTree() { this.treeN++; this.log.push('tree'); }
  assault() { this.assaultN++; this.log.push('assault'); }
}

const tick = (f: TutorialFlow, n = 3) => { for (let i = 0; i < n; i++) f.update(1 / 60); };
const seconds = (f: TutorialFlow, s: number) => { for (let i = 0; i < Math.round(s * 60); i++) f.update(1 / 60); };

describe('4.7A/4.7D Einführung: vollständige Auftragskette Stufe 1 → 3', () => {
  it('Pier → Hammerschmied → Waffenmeister (Kette, Sturm-Schritt, Ziel, Stufe 2, Talent) → Schaluppe, Crew, Steuer, Spähboot → Überfall, Kristall (Stufe 3), Kunst → Dank → geteilte Welt', () => {
    const h = new FakeTutorial();
    const f = new TutorialFlow(h);
    tick(f);
    expect(f.current()?.id).toBe('t1');
    // 1. gestrandeter Fischer am Pier
    h.talk('hinnerk');
    tick(f);
    expect(h.qs.isDone('t1')).toBe(true);
    // 2. Hammerschmied: erste Waffe nach dem Gespräch (ohne Schmiede-Inszenierung sofort)
    expect(f.current()?.id).toBe('t2');
    expect(h.weapon).toBe(false);
    h.talk('bodo');
    tick(f);
    expect(h.weapon).toBe(true);
    expect(h.flags[TUT_FLAGS.weapon]).toBe(true);
    // 3. Waffenmeister
    expect(f.current()?.id).toBe('t3');
    h.talk('konrad');
    tick(f);
    expect(f.current()?.step).toMatchObject({ type: 'act', act: 'combo' });
    h.probeV.hits = TUTORIAL.comboHits - 1; tick(f);
    expect(f.current()?.step).toMatchObject({ act: 'combo' });
    h.probeV.hits = TUTORIAL.comboHits; tick(f);
    expect(f.current()?.step).toMatchObject({ act: 'dash' });
    h.probeV.dashing = true; tick(f); h.probeV.dashing = false;
    expect(f.current()?.step).toMatchObject({ act: 'target' });
    expect(h.lvl).toBe(1);
    h.probeV.targeted = true; tick(f);
    // Stufe 2 genau beim Talent-Schritt; der Punkt zählt erst, wenn er ausgegeben wird
    expect(f.current()?.step).toMatchObject({ act: 'talent' });
    expect(h.lvl).toBe(TUTORIAL.level2);
    tick(f, 10);
    expect(f.current()?.step).toMatchObject({ act: 'talent' });
    h.spentV = 1; tick(f);
    expect(h.qs.isDone('t3')).toBe(true);
    // 4. Hafenmeisterin: Schaluppe, Crew, Steuer (Lehrtafel), Spähboot
    expect(f.current()?.id).toBe('t4');
    expect(h.shipGranted).toBe(false);
    h.talk('ilse');
    tick(f);
    expect(h.shipGranted).toBe(true);
    expect(h.hireOffers).toBe(1);
    tick(f, 20);
    expect(h.hireOffers).toBe(1); // nur einmal angeboten
    h.hired = true; tick(f);
    expect(f.current()?.step).toMatchObject({ act: 'helm' });
    expect(h.coached).toBe(false);
    h.probeV.atHelm = true; tick(f);
    expect(h.coached).toBe(true);
    expect(f.current()?.step.type).toBe('sink');
    tick(f, 60);
    expect(h.scouts.length).toBe(1);
    // das Boot treibt ab (abgebaut): ein neues läuft aus
    h.scouts[0].live = false;
    seconds(f, TUTORIAL.scoutRespawn + 1);
    expect(h.scouts.length).toBe(2);
    h.qs.event({ type: 'sink' });
    tick(f);
    expect(h.qs.isDone('t4')).toBe(true);
    // 5. Bürgermeister: Stoßtrupp (ohne Kriegsschiff sofort), Kristall (Stufe 3), Kunst, Abwehr, Dank
    expect(f.current()?.id).toBe('t5');
    h.talk('gerstenkorn');
    tick(f);
    expect(h.raids).toEqual([false]);
    expect(h.lvl).toBe(TUTORIAL.level3);
    expect(h.fajiOffers).toBe(1);
    h.faji = true; tick(f);
    expect(f.current()?.step).toMatchObject({ act: 'art' });
    h.probeV.artSkills = 1; tick(f);
    expect(f.current()?.step).toMatchObject({ act: 'raid' });
    tick(f, 10);
    expect(f.current()?.step).toMatchObject({ act: 'raid' });
    h.raidAlive = 0; tick(f);
    expect(f.current()?.step).toMatchObject({ type: 'talk', npc: 'gerstenkorn' });
    expect(h.dissolved).toBe(false);
    h.talk('gerstenkorn');
    tick(f);
    expect(h.qs.isDone('t5')).toBe(true);
    expect(h.dissolved).toBe(true);
    // Reihenfolge der Story-Momente
    const moments = h.log.filter((l) => !l.startsWith('act:') && !l.startsWith('done:'));
    expect(moments).toEqual(['weapon', `level:${TUTORIAL.level2}`, 'ship', 'coach', 'scout', 'scout', 'raid', `level:${TUTORIAL.level3}`, 'dissolve']);
    expect(h.raids).toEqual([false]);
  });

  it('4.7D inszeniert: Bodo schmiedet mit Funkenflug (Klinge erst danach), Konrads Lehrtafel einmal, Sternbild öffnet sich, Kriegsschiff beschießt den Hafen, dann landet der Trupp', () => {
    const h = new StagedTutorial();
    const f = new TutorialFlow(h);
    h.talk('hinnerk'); tick(f);
    // Schmiede: die Ausrüstung kommt erst, wenn das Schmiedestück fertig ist – und nur einmal
    h.talk('bodo'); tick(f);
    expect(h.log).toContain('forge');
    expect(h.weapon).toBe(false);
    tick(f, 30);
    expect(h.log.filter((l) => l === 'forge')).toHaveLength(1);
    h.forgeDone!();
    expect(h.weapon).toBe(true);
    // Waffenmeister: Lehrtafel zur eigenen Kombo beim ersten Kombo-Schritt, genau einmal
    h.talk('konrad'); tick(f);
    expect(f.current()?.step).toMatchObject({ act: 'combo' });
    expect(h.coachCombatN).toBe(1);
    tick(f, 30);
    expect(h.coachCombatN).toBe(1);
    expect(h.flags[TUT_FLAGS.fight]).toBe(true);
    h.probeV.hits = TUTORIAL.comboHits; tick(f);
    h.probeV.dashing = true; tick(f); h.probeV.dashing = false;
    h.probeV.targeted = true; tick(f);
    // Stufe 2: der Sternbild-Klassenbaum öffnet sich von selbst
    expect(f.current()?.step).toMatchObject({ act: 'talent' });
    expect(h.treeN).toBe(1);
    h.spentV = 1; tick(f);
    expect(h.qs.isDone('t3')).toBe(true);
    // Hafenmeisterin (wie gehabt)
    h.talk('ilse'); tick(f);
    h.hired = true; tick(f);
    h.probeV.atHelm = true; tick(f);
    // Küstengefecht: das Spähboot läuft aus und wird versenkt
    seconds(f, 1);
    expect(h.scouts.length).toBe(1);
    h.qs.event({ type: 'sink' }); tick(f);
    expect(h.qs.isDone('t4')).toBe(true);
    // Bürgermeister: erst das Kriegsschiff vor dem Hafen, der Trupp landet nach dem Beschuss
    h.talk('gerstenkorn'); tick(f);
    expect(h.assaultN).toBe(1);
    expect(h.lvl).toBe(TUTORIAL.level3);
    expect(h.raids).toEqual([]);
    // Kristall und neue Kraft schon vor der Landung: keine Nachzügler, der Überfall endet nicht vorzeitig
    h.faji = true; tick(f);
    h.probeV.artSkills = 1; tick(f);
    expect(f.current()?.step).toMatchObject({ act: 'raid' });
    seconds(f, TUTORIAL.raidShipLead - 1);
    expect(h.raids).toEqual([]);
    expect(f.current()?.step).toMatchObject({ act: 'raid' });
    seconds(f, 1.2);
    expect(h.raids).toEqual([false]);
    expect(h.raidAlive).toBe(TUTORIAL.raid.length);
    h.raidAlive = 0; tick(f);
    expect(f.current()?.step).toMatchObject({ type: 'talk', npc: 'gerstenkorn' });
    h.talk('gerstenkorn'); tick(f);
    expect(h.dissolved).toBe(true);
    expect(h.assaultN).toBe(1);
    const moments = h.log.filter((l) => !l.startsWith('act:') && !l.startsWith('done:'));
    expect(moments).toEqual(['forge', 'weapon', 'coachCombat', `level:${TUTORIAL.level2}`, 'tree', 'ship', 'coach', 'scout', 'assault', `level:${TUTORIAL.level3}`, 'raid', 'dissolve']);
  });

  it('fällt der Trupp, bevor die neue Kunst eingesetzt wurde, kommen genau zwei Nachzügler', () => {
    const h = new FakeTutorial();
    const f = new TutorialFlow(h);
    for (const id of ['t1', 't2', 't3', 't4']) { h.qs.event({ type: 'talk', npc: 'x' }); h.progress.quests = h.progress.quests.filter((q) => q.id !== id); h.progress.done.push(id); }
    h.qs.accept('t5');
    h.talk('gerstenkorn');
    tick(f);
    h.faji = true; tick(f);
    expect(f.current()?.step).toMatchObject({ act: 'art' });
    h.raidAlive = 0; tick(f, 30);
    expect(h.raids).toEqual([false, true]);
    expect(h.raidAlive).toBe(TUTORIAL.raidExtra.length);
    h.probeV.artSkills = 3; tick(f);
    h.raidAlive = 0; tick(f);
    expect(f.current()?.step).toMatchObject({ type: 'talk' });
    expect(h.raids).toEqual([false, true]);
  });

  it('ein geladener Stand mitten in der Einführung setzt fort, ohne Story-Momente doppelt auszulösen (Merker im Spielstand)', () => {
    const h = new StagedTutorial();
    let f = new TutorialFlow(h);
    h.talk('hinnerk'); tick(f);
    h.talk('bodo'); tick(f);
    h.forgeDone!();
    h.talk('konrad'); tick(f);
    h.probeV.hits = 9; tick(f); h.probeV.dashing = true; tick(f); h.probeV.targeted = true; tick(f);
    expect(h.log.filter((l) => l.startsWith('level:'))).toHaveLength(1);
    // „Neu laden“: neuer Ablauf, gleicher Stand
    f = new TutorialFlow(h);
    tick(f, 10);
    expect(h.log.filter((l) => l === 'weapon')).toHaveLength(1);
    expect(h.log.filter((l) => l === 'forge')).toHaveLength(1);
    expect(h.log.filter((l) => l === 'coachCombat')).toHaveLength(1);
    expect(h.log.filter((l) => l.startsWith('level:'))).toHaveLength(1);
    expect(f.current()?.step).toMatchObject({ act: 'talent' });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Geteilte Welt: Mitspieler
// ---------------------------------------------------------------------------------------------------------------

describe('4.7A Geteilte Welt: andere Kapitäne (lokale Stellvertreter hinter dem Feed)', () => {
  it('Liste: fünf Kapitäne in der Stadt, zwei auf See, jeder Name einmal, deterministisch', () => {
    const r = localRoster(5);
    expect(r).toHaveLength(SHARED_PRESENCE.townCaptains + SHARED_PRESENCE.seaShips);
    expect(r.filter((c) => !c.atSea)).toHaveLength(SHARED_PRESENCE.townCaptains);
    expect(r.filter((c) => c.atSea)).toHaveLength(SHARED_PRESENCE.seaShips);
    expect(new Set(r.map((c) => c.name)).size).toBe(r.length);
    expect(new Set(r.map((c) => c.id)).size).toBe(r.length);
    expect(localRoster(5)).toEqual(r);
    for (const c of r) { expect(c.title).toMatch(/^Kapitän · .+ \((DPS|Tank-DPS|Assassinen-DPS|Kombo-DPS|Midrange-DPS|Elementar-DPS|DPS\/Heal)\) · Stufe \d+$/); expect(c.greet.length).toBeGreaterThan(0); }
  });

  it('Runde der Schiffe: Wegpunkte im Kreis um die Insel', () => {
    const pts = peerLoop(100, 200, 300, 0.5);
    expect(pts).toHaveLength(12);
    for (let i = 0; i < 6; i++) expect(Math.hypot(pts[i * 2] - 100, pts[i * 2 + 1] - 200)).toBeCloseTo(300, 6);
  });

  it('nah an Ankerglück erscheinen alle Mitspieler nacheinander (nie alle in einem Bild), weit weg werden sie abgebaut', () => {
    let dist = PRESENCE_IN - 100;
    const town = new Set<object>(), ships = new Set<object>();
    let queued = 0;
    const host: PresenceHost = {
      home: () => ({ x: 0, z: 160, r: 78 }),
      playerDist: () => dist,
      addTownCaptain: () => { const o = {}; town.add(o); return o; },
      removeTownCaptain: (o) => { town.delete(o); },
      queueShip: (_c, _x, _z, _h, _l, _p, done) => { queued++; const o = {}; ships.add(o); done(o); },
      shipLive: (o) => ships.has(o),
      removeShip: (o) => { ships.delete(o); },
    };
    const p = new SharedPresence(host);
    p.update(1 / 60);
    expect(town.size + ships.size).toBe(1);
    for (let i = 0; i < 60 * 5; i++) p.update(1 / 60);
    expect(town.size).toBe(SHARED_PRESENCE.townCaptains);
    expect(ships.size).toBe(SHARED_PRESENCE.seaShips);
    expect(queued).toBe(SHARED_PRESENCE.seaShips);
    expect(p.counts()).toMatchObject({ town: SHARED_PRESENCE.townCaptains, sea: SHARED_PRESENCE.seaShips });
    dist = PRESENCE_OUT + 50;
    p.update(1 / 60);
    expect(town.size + ships.size).toBe(0);
    expect(p.counts()).toMatchObject({ town: 0, sea: 0 });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Überspringen und Spielstand
// ---------------------------------------------------------------------------------------------------------------

describe('4.7A „Prolog überspringen“ und Spielstand-Migration', () => {
  it('Überspringen: direkt in die geteilte Welt mit dem Endstand der Einführung', () => {
    const s = newInstance();
    skipIntro(s, 12);
    expect(s.mode).toBe('shared');
    expect(s.skipped).toBe(true);
    expect(s.ship).toBe(true);
    expect(TUTORIAL_END).toEqual({ level: TUTORIAL.level3, crew: TUTORIAL.starterCrew, gold: TUTORIAL.thanksGold });
  });

  it('neue Spielstände: aktuelle Version (4.7B: 25), beginnen im Prolog', () => {
    // 4.7E: seit 4.7E Version 27
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(25);
    const s = createSave('Fynn', 'pirat', '4.7.4');
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.progress.instance?.mode).toBe('prolog');
    const m = migrateSave(JSON.parse(JSON.stringify(s)), '4.7.4');
    expect(m.ok).toBe(true);
    if (m.ok) { expect(m.data.progress.instance?.mode).toBe('prolog'); expect(m.migratedFrom).toBeNull(); }
  });

  it('bestehende Stände (Version 23) starten direkt in der offenen MMO-Welt – ohne Fortschrittsverlust', () => {
    const old = createSave('Alt', 'marine', '4.6.11') as unknown as Record<string, any>;
    old.version = 23;
    delete old.progress.instance;
    old.player.level = 37; old.player.gold = 12345; old.player.fame = 4300;
    old.progress.quests = [{ id: 'k3', step: 1, count: 0 }];
    old.progress.done = ['k0', 'k1', 'k2'];
    old.crew.hired = ['nav', 'koch'];
    old.ship.tier = 3; old.ship.owned = [0, 1, 2, 3];
    old.world.boat = { x: 1200, z: -800, heading: 1 };
    const m = migrateSave(JSON.parse(JSON.stringify(old)), '4.7.4');
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const d = m.data;
    expect(m.migratedFrom).toBe(23);
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.progress.instance).toEqual(legacyInstance());
    expect(isPrivate(d.progress.instance!)).toBe(false);
    expect(d.player.level).toBe(37);
    expect(d.player.gold).toBe(12345);
    expect(d.player.fame).toBe(4300);
    expect(d.progress.quests).toEqual([{ id: 'k3', step: 1, count: 0 }]);
    expect(d.progress.done).toEqual(['k0', 'k1', 'k2']);
    expect(d.crew.hired).toEqual(['nav', 'koch']);
    expect(d.ship.tier).toBe(3);
    expect(d.world.boat).toEqual({ x: 1200, z: -800, heading: 1 });
  });

  it('ein Stand mitten in der Einführung bleibt privat; ein Stand ohne Feld gilt als offene Welt (nie ein ungewollter Prolog)', () => {
    const s = createSave('Mitte', 'pirat', '4.7.4') as unknown as Record<string, any>;
    s.progress.instance = { v: 1, mode: 'tutorial', skipped: false, ship: false, sharedAt: -1, raid: 'none' };
    s.progress.quests = [{ id: 't3', step: 2, count: 0 }];
    let m = migrateSave(JSON.parse(JSON.stringify(s)), '4.7.4');
    expect(m.ok && m.data.progress.instance?.mode).toBe('tutorial');
    delete s.progress.instance;
    m = migrateSave(JSON.parse(JSON.stringify(s)), '4.7.4');
    expect(m.ok && m.data.progress.instance?.mode).toBe('shared');
  });
});
