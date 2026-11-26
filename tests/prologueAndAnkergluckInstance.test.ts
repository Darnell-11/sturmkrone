// Phase 4.7A – Gewitter-Prolog (Regie, sieben Admirale, Vereintes Urteil), private Instanz „Ankerglück“ (Stufe 1 → 3, Auftragskette t1 – t5),
// Übergang privat → geteilt (Mitspieler), „Prolog überspringen“ und Spielstand 24.
import { describe, expect, it } from 'vitest';
import {
  ADMIRALS, DECK_LINES, JUDGMENT_NAME, PROLOGUE, PROLOGUE_LINES, SCHWARZBART, SHARED_PRESENCE, SHIP_COACH, TUTORIAL, TUTORIAL_ACTS,
  TUTORIAL_NPC_IDS, TUTORIAL_QUESTS, linenLook, type TutorialAct, type TutorialQuestId,
} from '../src/data/prologue';
import {
  PrologueOut, newPrologueState, phaseDuration, prologueBars, prologueIntensity, prologuePlayable, skipPrologue, stepPrologue,
  type PrologueEventType, type PrologueGeo, type PrologueState,
} from '../src/story/prologueDirector';
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
// Hilfen: Prolog-Regie im Zeitraffer
// ---------------------------------------------------------------------------------------------------------------

interface Rec { t: number; phase: string; type: PrologueEventType; text: string; id: number; kind: string; lx: number; lz: number; r: number }

const deckGeo = (): PrologueGeo => ({ lx: 0, lz: 18, startLz: 18, goalLz: -12, halfW: 5 });

/** Prolog laufen lassen; `walk` bewegt die Figur je Schritt (Deck), Ergebnis: alle Ereignisse in Reihenfolge */
function runPrologue(seed: number, walk: (st: PrologueState, g: PrologueGeo) => void = () => {}, maxT = 400, dt = 1 / 60): { st: PrologueState; ev: Rec[] } {
  const st = newPrologueState(seed);
  const out = new PrologueOut();
  const g = deckGeo();
  const ev: Rec[] = [];
  for (let i = 0; i < maxT / dt && st.phase !== 'done'; i++) {
    if (st.phase === 'deck') walk(st, g);
    const n = stepPrologue(st, dt, g, out);
    for (let k = 0; k < n; k++) { const e = out.events[k]; ev.push({ t: st.t, phase: st.phase, type: e.type, text: e.text, id: e.id, kind: e.kind, lx: e.lx, lz: e.lz, r: e.r }); }
  }
  return { st, ev };
}

const phasesOf = (ev: Rec[]) => ev.filter((e) => e.type === 'phase').map((e) => e.text);

// ---------------------------------------------------------------------------------------------------------------
// Prolog
// ---------------------------------------------------------------------------------------------------------------

describe('4.7A Gewitter-Prolog: Ablauf und Regie', () => {
  it('Phasen in fester Reihenfolge: Einleitung → Deck → Aufmarsch → Aufladen → Einschlag → über Bord → Schwarzblende → fertig', () => {
    const { st, ev } = runPrologue(7, (s, g) => { if (s.phaseT > 3) g.lz = Math.max(g.goalLz, g.lz - 0.12); });
    expect(st.phase).toBe('done');
    expect(phasesOf(ev)).toEqual(['intro', 'deck', 'assemble', 'charge', 'impact', 'overboard', 'blackout', 'done']);
    // Kino-Phasen dauern fest (die Regie und die Musik richten sich danach)
    expect(phaseDuration('assemble')).toBe(PROLOGUE.assemble);
    expect(phaseDuration('blackout')).toBe(PROLOGUE.blackout);
  });

  it('auf dem Deck: Schwarzbarts drei Schockwellen zerschmettern Marine-Schiffe, Kanoneneinschläge und brennende Trümmer mit Warnzeit', () => {
    const { ev } = runPrologue(11, (s, g) => { if (s.phaseT > 30) g.lz = Math.max(g.goalLz, g.lz - 0.2); });
    const shocks = ev.filter((e) => e.type === 'shock');
    expect(shocks.map((e) => e.id)).toEqual([0, 1, 2]);
    const hazards = ev.filter((e) => e.type === 'hazard');
    const dets = ev.filter((e) => e.type === 'detonate');
    expect(hazards.some((e) => e.kind === 'cannon')).toBe(true);
    expect(hazards.some((e) => e.kind === 'debris')).toBe(true);
    // jede Gefahr zündet höchstens einmal, nie vor ihrer Warnung, und liegt auf dem Deck (zwischen Achterdeck und Bug, innerhalb der Breite)
    for (const d of dets) {
      const h = hazards.find((x) => x.id === d.id)!;
      expect(h, `Gefahr ${d.id} ohne Warnung`).toBeTruthy();
      expect(d.t).toBeGreaterThan(h.t);
      expect(Math.abs(d.lx)).toBeLessThanOrEqual(PROLOGUE.side * 5 + 1e-9);
    }
    expect(new Set(dets.map((d) => d.id)).size).toBe(dets.length);
    // Untertitel der Schockwellen
    expect(ev.filter((e) => e.type === 'line' && e.text.startsWith('shock')).map((e) => e.text)).toEqual(['shock1', 'shock2', 'shock3']);
  });

  it('wer früh am Achterdeck ist, sieht alle drei Schockwellen kurz hintereinander – erst danach beginnt das Finale', () => {
    const { ev } = runPrologue(3, (s, g) => { g.lz = s.phaseT > 2 ? g.goalLz : g.lz; });
    const deckStart = ev.find((e) => e.type === 'phase' && e.text === 'deck')!.t;
    const assemble = ev.find((e) => e.type === 'phase' && e.text === 'assemble')!.t;
    const shocks = ev.filter((e) => e.type === 'shock');
    expect(shocks).toHaveLength(3);
    for (const s of shocks) expect(s.t).toBeLessThan(assemble);
    // deutlich früher als nach Zeitplan (7 / 16 / 26 s), Abstand ≈ shockGap
    expect(shocks[2].t - deckStart).toBeLessThan(PROLOGUE.shocks[2]);
    expect(shocks[1].t - shocks[0].t).toBeGreaterThanOrEqual(PROLOGUE.shockGap - 0.05);
    // am Ziel fallen keine neuen Gefahren mehr
    const arrive = ev.find((e) => e.type === 'line' && e.text === 'arrive')!.t;
    expect(ev.filter((e) => e.type === 'hazard' && e.t > arrive + 0.02)).toHaveLength(0);
  });

  it('die sieben Admirale erscheinen nacheinander, bündeln das Vereinte Admirals-Urteil, Schwarzbart fällt, die Figur fliegt über Bord, drei Herzschläge', () => {
    const { st, ev } = runPrologue(5, (_s, g) => { g.lz = g.goalLz; });
    const adm = ev.filter((e) => e.type === 'admiral');
    expect(adm.map((e) => e.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < adm.length; i++) expect(adm[i].t).toBeGreaterThan(adm[i - 1].t);
    const order = ['charge', 'judgment', 'fall', 'thrown'] as const;
    const at = order.map((t) => ev.find((e) => e.type === t)!.t);
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThan(at[i - 1]);
    expect(at[0]).toBeGreaterThan(adm[6].t);
    expect(ev.filter((e) => e.type === 'heartbeat').map((e) => e.id)).toEqual([1, 2, 3]);
    expect(ev.filter((e) => e.type === 'done')).toHaveLength(1);
    expect(st.reached).toBe(true);
    expect(st.auto).toBe(false);
  });

  it('wer nie ankommt, wird nach der Zeitgrenze ans Achterdeck gesetzt (`auto`) – der Prolog lässt sich nicht verlieren', () => {
    const { st, ev } = runPrologue(9);
    expect(st.phase).toBe('done');
    expect(st.auto).toBe(true);
    const deck = ev.find((e) => e.type === 'phase' && e.text === 'deck')!.t;
    const asm = ev.find((e) => e.type === 'phase' && e.text === 'assemble')!.t;
    expect(asm - deck).toBeGreaterThanOrEqual(PROLOGUE.autoAfter - 0.05);
    expect(ev.some((e) => e.type === 'line' && e.text === 'hint')).toBe(true);
    expect(PROLOGUE.hpFloor).toBeGreaterThan(0.4); // ein Treffer nimmt höchstens 40 %: die Figur fällt im Prolog nie
  });

  it('gleicher Startwert → gleiche Ereignisse (deterministisch, kein Math.random)', () => {
    const walk = (s: PrologueState, g: PrologueGeo) => { if (s.phaseT > 4) g.lz = Math.max(g.goalLz, g.lz - 0.1); };
    const a = runPrologue(42, walk).ev, b = runPrologue(42, walk).ev, c = runPrologue(43, walk).ev;
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(c));
  });

  it('nur das Deck ist spielbar; Kinobalken in allen Kino-Phasen, Musik zieht an (Admirale und Urteil voll), Schwarzblende ohne Musik', () => {
    const st = newPrologueState(1);
    const out = new PrologueOut();
    const g = deckGeo();
    const seen: Record<string, { bars: number; k: number; play: boolean }> = {};
    for (let i = 0; i < 60 * 400 && st.phase !== 'done'; i++) {
      if (st.phase === 'deck') g.lz = g.goalLz;
      stepPrologue(st, 1 / 60, g, out);
      if (!seen[st.phase] || st.phaseT > 1) seen[st.phase] = { bars: prologueBars(st), k: prologueIntensity(st), play: prologuePlayable(st) };
    }
    expect(seen.deck.play).toBe(true);
    for (const p of ['intro', 'assemble', 'charge', 'impact', 'overboard', 'blackout']) {
      expect(seen[p].play, p).toBe(false);
      expect(seen[p].bars, p).toBe(1);
    }
    expect(seen.charge.k).toBe(1);
    expect(seen.assemble.k).toBeGreaterThan(seen.intro.k);
    expect(seen.blackout.k).toBe(-1);
    expect(prologueBars(st)).toBe(0);
  });

  it('Überspringen beendet sofort (Phase „fertig“, keine offenen Gefahren)', () => {
    const st = newPrologueState(2);
    const out = new PrologueOut();
    const g = deckGeo();
    for (let i = 0; i < 60 * 12; i++) stepPrologue(st, 1 / 60, g, out);
    expect(st.phase).toBe('deck');
    skipPrologue(st, out);
    expect(st.phase).toBe('done');
    expect(st.pending.every((p) => !p.live)).toBe(true);
    expect(stepPrologue(st, 1 / 60, g, out)).toBe(0);
  });

  it('Daten: sieben verschiedene Admirale mit eigener Kraft und Farbe, Schwarzbart 1,65 ×, alle Zeilen deutsch und vorhanden', () => {
    expect(ADMIRALS).toHaveLength(7);
    expect(new Set(ADMIRALS.map((a) => a.id)).size).toBe(7);
    expect(new Set(ADMIRALS.map((a) => a.name)).size).toBe(7);
    expect(new Set(ADMIRALS.map((a) => a.color)).size).toBe(7);
    for (const a of ADMIRALS) expect(a.name).toMatch(/^(Groß)?[Aa]dmiral(in)? /);
    expect(JUDGMENT_NAME).toBe('Vereintes Admirals-Urteil');
    expect(SCHWARZBART.scale).toBeCloseTo(1.65, 5);
    for (const d of DECK_LINES) expect(PROLOGUE_LINES[d.id], d.id).toBeTruthy();
    for (const id of ['title', 'call', 'shock1', 'shock2', 'shock3', 'hint', 'arrive', 'admirals', 'charge', 'defiance', 'fall', 'dark']) expect(PROLOGUE_LINES[id], id).toBeTruthy();
    // eigene Welt: keine englischen Füllwörter in den Zeilen
    for (const l of Object.values(PROLOGUE_LINES)) expect(l.text).not.toMatch(/\b(the|and|you|captain)\b/i);
  });

  it('Leinenkleidung des Schiffsjungen: Hemd, Hose, einfache Schuhe – Gesicht und Haar bleiben', () => {
    const look = linenLook({ hair: 'kurz', eyeColor: '#123456', coat: 'kapitaen', hat: 'dreispitz', glasses: 'flieger' } as never) as Record<string, unknown>;
    expect(look.outfit).toBe('hemd');
    expect(look.shoes).toBe('schuhe');
    expect(look.coat).toBe('keiner');
    expect(look.hat).toBe('keiner');
    expect(look.glasses).toBe('keine');
    expect(look.hair).toBe('kurz');
    expect(look.eyeColor).toBe('#123456');
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
    expect(SHIP_COACH.map((c) => c.title)).toEqual(['Segel', 'Rumpf', 'Breitseiten', 'Crew-Moral']);
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

const tick = (f: TutorialFlow, n = 3) => { for (let i = 0; i < n; i++) f.update(1 / 60); };

describe('4.7A Einführung: vollständige Auftragskette Stufe 1 → 3', () => {
  it('Pier → Hammerschmied → Waffenmeister (Kette, Sturm-Schritt, Ziel, Stufe 2, Talent) → Schaluppe, Crew, Steuer, Spähboot → Überfall, Kristall (Stufe 3), Kunst → Dank → geteilte Welt', () => {
    const h = new FakeTutorial();
    const f = new TutorialFlow(h);
    tick(f);
    expect(f.current()?.id).toBe('t1');
    // 1. gestrandeter Fischer am Pier
    h.talk('hinnerk');
    tick(f);
    expect(h.qs.isDone('t1')).toBe(true);
    // 2. Hammerschmied: erste Waffe nach dem Gespräch
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
    for (let i = 0; i < 60 * (TUTORIAL.scoutRespawn + 1); i++) f.update(1 / 60);
    expect(h.scouts.length).toBe(2);
    h.qs.event({ type: 'sink' });
    tick(f);
    expect(h.qs.isDone('t4')).toBe(true);
    // 5. Bürgermeister: Stoßtrupp, Kristall (Stufe 3), Kunst, Abwehr, Dank
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
    const h = new FakeTutorial();
    let f = new TutorialFlow(h);
    h.talk('hinnerk'); tick(f);
    h.talk('bodo'); tick(f);
    h.talk('konrad'); tick(f);
    h.probeV.hits = 9; tick(f); h.probeV.dashing = true; tick(f); h.probeV.targeted = true; tick(f);
    expect(h.log.filter((l) => l.startsWith('level:'))).toHaveLength(1);
    // „Neu laden“: neuer Ablauf, gleicher Stand
    f = new TutorialFlow(h);
    tick(f, 10);
    expect(h.log.filter((l) => l === 'weapon')).toHaveLength(1);
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
    for (const c of r) { expect(c.title).toMatch(/^Kapitän · Stufe \d+$/); expect(c.greet.length).toBeGreaterThan(0); }
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
// Überspringen und Spielstand 24
// ---------------------------------------------------------------------------------------------------------------

describe('4.7A „Prolog überspringen“ und Spielstand-Migration (Version 24)', () => {
  it('Überspringen: direkt in die geteilte Welt mit dem Endstand der Einführung', () => {
    const s = newInstance();
    skipIntro(s, 12);
    expect(s.mode).toBe('shared');
    expect(s.skipped).toBe(true);
    expect(s.ship).toBe(true);
    expect(TUTORIAL_END).toEqual({ level: TUTORIAL.level3, crew: TUTORIAL.starterCrew, gold: TUTORIAL.thanksGold });
  });

  it('neue Spielstände: Version 24, beginnen im Prolog', () => {
    expect(SAVE_VERSION).toBe(24);
    const s = createSave('Fynn', 'pirat', '4.7.0');
    expect(s.version).toBe(24);
    expect(s.progress.instance?.mode).toBe('prolog');
    const m = migrateSave(JSON.parse(JSON.stringify(s)), '4.7.0');
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
    const m = migrateSave(JSON.parse(JSON.stringify(old)), '4.7.0');
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const d = m.data;
    expect(m.migratedFrom).toBe(23);
    expect(d.version).toBe(24);
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
    const s = createSave('Mitte', 'pirat', '4.7.0') as unknown as Record<string, any>;
    s.progress.instance = { v: 1, mode: 'tutorial', skipped: false, ship: false, sharedAt: -1, raid: 'none' };
    s.progress.quests = [{ id: 't3', step: 2, count: 0 }];
    let m = migrateSave(JSON.parse(JSON.stringify(s)), '4.7.0');
    expect(m.ok && m.data.progress.instance?.mode).toBe('tutorial');
    delete s.progress.instance;
    m = migrateSave(JSON.parse(JSON.stringify(s)), '4.7.0');
    expect(m.ok && m.data.progress.instance?.mode).toBe('shared');
  });
});
