// Phase 4.91 – 3-Akt-Regie der Formen I – X, Geistes-Faji und Ultimates (an Land und auf See), Kräfte am Steuer bis 650 m mit Zielerfassung
// und Ultimate am Ziel, Klassen-Vorschau „Auf See“ als echtes Seegefecht, server-autoritative Synchronisation aller Kampf-Entitäten (Schiffe,
// Ereignis- und Schlachtschiffe, Inselgegner, Kommandanten, Bosse mit Phase, Haltung, Aggro, Warnflächen und Sperrzeiten).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { FORM_TIERS, SEA_CINE_SCALE, decisiveHit, formCinema, formTier, geistCinema, hitReach, projectileTime } from '../src/graphics/formCinema';
import { AnimeImpactRig } from '../src/graphics/animeImpactRig';
import { CataclysmFx } from '../src/combat/cataclysmFx';
import { CataclysmDirector, type CataclysmHost } from '../src/world/cataclysmDirector';
import { createFighter } from '../src/combat/actionCombatEngine';
import { ULTIMATES, ULTIMATE_ORDER } from '../src/data/cataclysms';
import { ULTIMATE_CINEMATICS } from '../src/graphics/ultimateCinematics';
import { CIRCLE_ULTS, SEA_ART, SEA_GEIST, SEA_ULT, helmTravel, pickHelmTarget, seaUltAnchor, type HelmCandidate } from '../src/data/seaArts';
import type { NavalSystem } from '../src/naval/naval';
import { ARENA, ARENA_DEMO, arenaLabel, arenaTargets, aspectPull, freeWindowHeight, landCameraPose, seaCameraPose, type ArenaCam } from '../src/data/showcaseArena';
import { ROMAN } from '../src/data/classShowcase';
import { TOUCH_SEA, TOUCH_SEA_PAGE2, TOUCH_SEA_PAGE3 } from '../src/data/touchLayout';
import { HELM_GEIST_ACTIONS } from '../src/data/actions';
import {
  ACT_KINDS, MMO, cleanAct, cleanEntSpawn, cleanFoeHit, cleanIntent, cleanServerMsg, isWorldKey, netKey, newPlayerState, newProfile,
  type EntSpawnNet, type PlayerProfile, type PlayerState, type ServerMsg,
} from '../src/net/mmoProtocol';
import { MmoAuthority, type ZoneOracle } from '../src/net/mmoAuthority';
import { SharedEntityRegistry } from '../src/net/worldEntitySync';
import { MmoClient } from '../src/net/mmoClient';
import type { MmoTransport } from '../src/net/mmoTransport';
import { safeZoneAt, stanceOf } from '../src/net/partyRules';
import type { DiplomacyState } from '../src/data/nations';
import { SharedEntities, type SharedHost } from '../src/world/sharedEntities';

const src = (p: string) => readFileSync(`src/${p}`, 'utf8');

// ---------------------------------------------------------------------------------------------------------------
// 1. 3-Akt-Regie: Formen, Geistes-Faji, Ultimates (an Land und auf See)
// ---------------------------------------------------------------------------------------------------------------

describe('3-Akt-Regie der Formen I – X und der Geistes-Faji', () => {
  it('drei Stufen: I – IV knapp (weiche Tusche), V – VII stärker, VIII – X monumental (invertiertes Impact-Bild), Form X mit drei Bildern', () => {
    expect([1, 2, 3, 4].map(formTier)).toEqual([1, 1, 1, 1]);
    expect([5, 6, 7].map(formTier)).toEqual([2, 2, 2]);
    expect([8, 9, 10].map(formTier)).toEqual([3, 3, 3]);
    for (let s = 1; s <= 10; s++) {
      const c = formCinema(s);
      // Akt 1: Himmel, Säule, Wirbel, Kamera; Akt 2: Hit-Stop + Impact-Bilder; Akt 3: Druckwellen, Risse, Nachbeben
      expect(c.darken, `Form ${s}`).toBeGreaterThan(0);
      expect(c.pillar).toBeGreaterThan(0);
      expect(c.swirls).toBeGreaterThanOrEqual(1);
      expect(c.focus).toBeGreaterThan(0);
      expect(c.hitstop).toBeGreaterThan(0);
      expect(c.frames).toBeGreaterThanOrEqual(2);
      expect(c.shock).toBeGreaterThan(0);
      expect(c.rings).toBeGreaterThanOrEqual(2);
      expect(c.cracks).toBeGreaterThanOrEqual(3);
      expect(c.after).toBeGreaterThan(0);
    }
    expect(formCinema(1).soft).toBe(true);
    expect(formCinema(7).soft).toBe(true);
    expect(formCinema(8).soft).toBe(false);
    expect(formCinema(10).frames).toBe(3);
    // die Wucht wächst mit der Form
    for (let s = 2; s <= 10; s++) expect(formCinema(s).shock).toBeGreaterThanOrEqual(formCinema(s - 1).shock * (formTier(s) === formTier(s - 1) ? 1 : 1.2));
    expect(FORM_TIERS[3].darken).toBeGreaterThan(FORM_TIERS[1].darken);
    expect(formCinema(0)).toBe(formCinema(1));
    expect(formCinema(99)).toBe(formCinema(10));
  });

  it('Geistes-Faji: Wille und Königsdruck als Einschlag, Lebensstrom-Fokus ohne Hit-Stop und Impact-Bild (Heilung)', () => {
    expect(geistCinema(1).tier).toBe(2);
    expect(geistCinema(2).hitstop).toBe(0);
    expect(geistCinema(2).frames).toBe(0);
    expect(geistCinema(3).tier).toBe(3);
    expect(geistCinema(4).frames).toBe(3);
    expect(geistCinema(4).shock).toBeGreaterThan(geistCinema(3).shock);
  });

  it('Treffermoment = stärkster Treffer der Form; Geschosse schlagen nach ihrer Flugzeit am Ziel ein', () => {
    expect(decisiveHit([{ dmg: 0.4 }, { dmg: 1.2 }, { dmg: 0.7 }])).toBe(1);
    expect(decisiveHit([{ dmg: 0.5 }, { dmg: 0.5 }])).toBe(1);
    expect(decisiveHit([])).toBe(-1);
    expect(hitReach({ shape: 'line', range: 16 })).toBeCloseTo(8.8, 6);
    expect(hitReach({ shape: 'circle', range: 7, offset: 2 })).toBe(2);
    expect(projectileTime(40, 40)).toBeCloseTo(1, 6);
    expect(projectileTime(900, 10)).toBe(1.6);
  });

  it('weiche Impact-Bilder beginnen mit Tusche; ein schwächeres Impact löst ein laufendes stärkeres nie ab', () => {
    const rig = new AnimeImpactRig();
    rig.impact(2, true);
    expect(rig.frame()).toBe('ink');
    rig.reset();
    rig.impact(3);
    rig.impact(2, true);
    expect(rig.framesLeft).toBe(3);
    expect(rig.frame()).toBe('invert');
    rig.impact(4);
    expect(rig.framesLeft).toBe(4);
  });

  it('die Kataklysmus-Regie zeigt Akt 1 (Aufladung, dunkler Himmel, Kamera) und Akt 2 + 3 (Hit-Stop, Druckwellen, Risse), auch zeitversetzt', () => {
    const fx = new CataclysmFx(new Scene());
    const stops: number[] = [], focus: number[] = [];
    let dark = 0;
    const host: CataclysmHost = {
      fx, combatFx: null, naval: null, debris: null, isLand: () => true, groundY: () => 0, waterY: () => 0, setTrench: () => {}, setRift: () => {}, shake: () => {},
      darken: (k) => { dark = Math.max(dark, k); }, focus: (k) => focus.push(k), formStop: (c) => stops.push(c.tier),
    };
    const d = new CataclysmDirector(host);
    d.formCharge(formCinema(9), 0, 0, 0, '#FF7A3A', '#FFE08A');
    for (let i = 0; i < 12; i++) d.update(1 / 60, 1 / 60);
    expect(dark).toBeGreaterThan(0.2);
    expect(focus).toEqual([1]);
    d.formImpact(formCinema(9), 0, 0, 4, 0, '#FF7A3A', '#FFE08A', 'feuer');
    expect(stops).toEqual([3]);
    // Geschoss: der Treffermoment fällt nach der Flugzeit
    d.queueFormImpact(0.3, formCinema(5), 0, 0, 20, 0, '#5AC8FF', '#BFEFFF', 'wasser', SEA_CINE_SCALE);
    for (let i = 0; i < 10; i++) d.update(1 / 60, 1 / 60);
    expect(stops).toEqual([3]);
    for (let i = 0; i < 20; i++) d.update(1 / 60, 1 / 60);
    expect(stops).toEqual([3, 2]);
    expect(d.stats.formCharges).toBe(1);
    expect(d.stats.formImpacts).toBe(2);
  });

  it('alle 15 Klassen-Ultimates haben weiterhin ihre 3-Akt-Choreografie und Impact-Bilder (nichts aus 4.6 verloren)', () => {
    expect(ULTIMATE_ORDER.length).toBe(15);
    for (const id of ULTIMATE_ORDER) {
      const u = ULTIMATES[id];
      expect(u?.ultimate, id).toBeTruthy();
      const cine = ULTIMATE_CINEMATICS[u!.ultimate!.kind];
      expect(cine.dur, id).toHaveLength(3);
      expect(cine.shots, id).toHaveLength(3);
      expect(cine.frames, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('verdrahtet: Figur meldet Start und Treffermoment, die Welt zeigt Akt 1 – 3 an Land, an Deck und am Steuer', () => {
    const foot = src('entities/player/playerFoot.ts');
    expect(foot).toMatch(/this\.deps\.onSkill\?\.\(e\.a, this\.engine\.moveAt\(f\.moveIdx\), f\)/);
    expect(foot).toMatch(/e\.b === decisiveHit\(mv\.hits\)\) this\.deps\.onFormHit/);
    const sw = src('world/seaWorld.ts');
    for (const s of ['onSkill: (slot, mv, f) => this.formAct1(slot, mv, f)', 'onFormHit: (slot, mv, h, f) => this.formAct2(slot, mv, h, f)', 'this.geistCine(kind, f)',
      'this.cataclysm.formImpact(cc, hx, ty, hz, yaw, st.color, st.accent, el, SEA_CINE_SCALE)', 'formStop: (c) => w.formStop(c)', 'this.animeRig.impact(c.frames, c.soft)']) expect(sw, s).toContain(s);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Kräfte am Steuer: 650 m, Zielerfassung, Ultimate am Ziel
// ---------------------------------------------------------------------------------------------------------------

describe('Kräfte am Steuer: bis 650 m, an die Zielerfassung gekoppelt, Ultimate am angewählten Schiff', () => {
  it('Reichweite 650 m, Flugzeit höchstens gut 2 s, die Donnerlanze trifft ebenso weit', () => {
    expect(SEA_ART.range).toBe(650);
    expect(SEA_ULT.range).toBe(650);
    expect(helmTravel(650)).toBeLessThanOrEqual(SEA_ART.maxTravel);
    expect(helmTravel(650)).toBeGreaterThan(1.5);
    expect(helmTravel(10)).toBeCloseTo(0.12, 6);
    expect(SEA_GEIST.find((g) => g.effect === 'thunder')!.range).toBe(650);
  });

  it('Zielerfassung: das angewählte Schiff zählt immer (in Reichweite), außer Reichweite kostet es nichts (`lockFar`); sonst das nächste voraus', () => {
    const ship = (x: number, z: number): HelmCandidate => ({ ship: { x, z, alive: true, sinking: 0 } });
    const near = ship(-60, -10), front = ship(5, 300), far = ship(0, 900), mine = { ...ship(0, 50), fleetId: 'f1' };
    const p = { x: 0, z: 0, heading: 0 }, res = { far: 0 }, list = [near, front, far, mine];
    const pick = (aim: HelmCandidate | null) => pickHelmTarget(p, aim, list, 650, 0.85, () => true, res);
    // ohne Anwahl: voraus vor seitlich-nah, die eigene Flotte nie
    expect(pick(null)).toBe(front);
    expect(pick(near)).toBe(near);
    expect(pick(far)).toBeNull();
    expect(res.far).toBeCloseTo(900, 6);
    expect(src('naval/naval.ts')).toContain('pickHelmTarget(p, this.aimTarget, this.enemies, range, cone, (e) => this.playerMayHarm(e), this.lockRes)');
  });

  it('Ultimate am Ziel: gerichtete beginnen vor dem Ziel, Kreis- und Mittelpunkt-Ultimates liegen über der Flotte; im natürlichen Bereich nichts', () => {
    const cut = ULTIMATES.zweihaender!.ultimate!;
    const a = seaUltAnchor(cut.kind, cut, 0, 0, 0, 600)!;
    expect(a).toBeTruthy();
    expect(a.yaw).toBeCloseTo(0, 6);
    expect(600 - a.z).toBeCloseTo(Math.min(cut.reach * 0.45, 480), 6);
    const sun = ULTIMATES.sonne!.ultimate!;
    expect(CIRCLE_ULTS).toContain(sun.kind);
    const b = seaUltAnchor(sun.kind, sun, 0, 0, 0, 500, 30, 520)!;
    expect([b.x, b.z]).toEqual([30, 520]);
    const hole = ULTIMATES.schwarzloch!.ultimate!;
    const c = seaUltAnchor(hole.kind, hole, 0, 0, 0, 400, 0, 410)!;
    expect(c.cz).toBe(410);
    expect(c.z + hole.center).toBeCloseTo(410, 6);
    expect(seaUltAnchor(cut.kind, cut, 0, 0, 0, 40)).toBeNull();
    expect(seaUltAnchor(cut.kind, cut, 0, 0, 0, 700)).toBeNull();
  });

  it('die Kataklysmus-Regie legt die Wirkung an den Ankerpunkt: ein Schiff in 600 m wird getroffen, ohne Anker nicht', () => {
    const run = (anchored: boolean) => {
      const fx = new CataclysmFx(new Scene());
      const hits: string[] = [];
      const target = { ship: { x: 0, z: 600, heading: Math.PI / 2, cls: { L: 30, W: 7 }, model: { deckY: 2.5 }, sinking: 0, maxHull: 1000, hull: 1000, fire: 0, frozen: 0, shoveX: 0, shoveZ: 0, punchHoles() {}, blowMasts() {}, char() {} } };
      const nav = {
        cataclysmShips(x: number, z: number, r: number, out: unknown[]) { out.length = 0; if (Math.hypot(target.ship.x - x, target.ship.z - z) - 15 <= r) out.push(target); return out.length; },
        cataclysmFriendly: () => false,
        cataclysmSplit: () => { hits.push('split'); target.ship.sinking = 0.01; return 'split'; },
        cataclysmHit: () => { hits.push('hit'); return 1; }, cataclysmPull: () => {}, cataclysmBlast: () => true,
      };
      const host: CataclysmHost = { fx, combatFx: null, naval: nav as unknown as NavalSystem, debris: null, isLand: () => false, groundY: () => 0, waterY: () => 0, setTrench: () => {}, setRift: () => {}, shake: () => {}, darken: () => {} };
      const d = new CataclysmDirector(host);
      const spec = ULTIMATES.zweihaender!.ultimate!;
      const f = createFighter('p', 'zweihaender', 0, 3, 0, 0);
      const anchor = anchored ? seaUltAnchor(spec.kind, spec, 0, 0, target.ship.x, target.ship.z) : null;
      d.strike(spec, f, 0, 0, 0, anchor);
      for (let i = 0; i < 120; i++) d.update(1 / 60, 1 / 60);
      return { hits: hits.length, anchored: d.stats.anchored, bridges: d.stats.bridges };
    };
    const yes = run(true), no = run(false);
    expect(yes.anchored).toBe(1);
    expect(yes.bridges).toBe(1);
    expect(yes.hits).toBeGreaterThan(0);
    expect(no.hits).toBe(0);
  });

  it('verdrahtet: Formen, Geist und Ultimate am Steuer fragen die Zielerfassung, das Ultimate entsteht am Ziel und der Kapitän geht danach ans Ruder', () => {
    const sw = src('world/seaWorld.ts');
    for (const s of ['nav.pickArtTarget(SEA_ART.range, SEA_ART.cone)', 'nav.pickArtTarget(SEA_ULT.range, SEA_ART.cone)', 'Ziel außer Reichweite', 'this.seaUltAnchorFor(spec, f)',
      // 4.93A: der Kampfmodus geht mit (nur ein Wirken vom Steuerrad trifft Schiffe, zu Fuß allein Gegner zu Fuß)
      'this.cataclysm.strike(spec, f, this.ultSX, this.ultSZ, anchor ? 0 : this.skyShiftFor(spec, f), anchor, mode)', "const anchor = mode === 'helm' ? this.seaUltAnchorFor(spec, f) : null", 'this.stepHelmReturn(dt)', 'this.toHelm()']) expect(sw, s).toContain(s);
  });

  it('Handy am Steuer: volle Klassen-Leiste (fünf Plätze: Formen 1 – 5, Formen 6 – 10, Geistes-Faji; Ultimate) neben Kanonen, Schub, Ziel und Flicken – kein Knopf überlappt', () => {
    const acts = TOUCH_SEA.map((b) => b.action);
    for (const a of ['attack', 'fireLeft', 'fireRight', 'dodge', 'heavy', 'repair', 'targetNext', 'art1', 'art2', 'art3', 'art4', 'art5', 'formPage', 'awaken']) expect(acts, a).toContain(a);
    // die alten Faji-Techniken (seit 4.7B nicht mehr erlernbar) belegen keinen Platz mehr
    for (const a of ['skill1', 'skill2', 'skill3']) expect(acts, a).not.toContain(a);
    expect(new Set(acts).size).toBe(acts.length);
    for (let i = 0; i < TOUCH_SEA.length; i++) for (let j = i + 1; j < TOUCH_SEA.length; j++) {
      const a = TOUCH_SEA[i], b = TOUCH_SEA[j];
      const d = Math.hypot(a.right + a.size / 2 - (b.right + b.size / 2), a.bottom + a.size / 2 - (b.bottom + b.size / 2));
      expect(d, `${a.action} / ${b.action}`).toBeGreaterThanOrEqual((a.size + b.size) / 2 + 4);
    }
    for (const b of TOUCH_SEA) {
      const r = b.right + b.size, t = b.bottom + b.size;
      expect(b.size, b.action).toBeGreaterThanOrEqual(40);
      expect(t, b.action).toBeLessThanOrEqual(320);
      // unter der Kontextplakette (Hochformat: ab 264 px über dem Rand, mittig) – höher nur am rechten Rand
      if (r > 104) expect(t, `${b.action} unter der Plakette`).toBeLessThanOrEqual(258);
      // rechts vom Steuerkompass unten links (bis 130 px vom linken Rand eines 390 px breiten Handys, 87 – 199 px hoch)
      if (r > 258) expect(t, `${b.action} neben dem Kompass`).toBeLessThanOrEqual(84);
    }
    // Seite 2: Formen 6 – 10, Seite 3: Geistes-Faji – auf denselben Plätzen
    expect(TOUCH_SEA_PAGE2.map((b) => b.action)).toEqual(['art6', 'art7', 'art8', 'art9', 'art10']);
    expect(TOUCH_SEA_PAGE3.map((b) => b.action)).toEqual([...HELM_GEIST_ACTIONS]);
    for (const [k, p] of [...TOUCH_SEA_PAGE2.map((b, i) => [i, b] as const), ...TOUCH_SEA_PAGE3.map((b, i) => [i, b] as const)]) {
      const base = TOUCH_SEA.find((b) => b.action === `art${k + 1}`)!;
      expect([p.right, p.bottom, p.size], p.action).toEqual([base.right, base.bottom, base.size]);
    }
    const game = src('core/game.ts');
    expect(game).toContain('const SEA_TOUCH = [...TOUCH_SEA, ...TOUCH_SEA_PAGE2, ...TOUCH_SEA_PAGE3];');
    expect(game).not.toContain('setLayout(TOUCH_SEA)');
    expect(game).toContain("const pages = this.world.mode === 'sail' && this.input.lastDevice === 'touch' ? 3 : 2;");
    expect(game).toContain('const shown = !!k && (page === 1 ? i >= 5 : page === 0 && i < 5);');
    expect(game).toContain("const on = (v.geistRank[i] ?? 0) > 0 && (!helmTouch || page === 2), a = helmTouch ? HELM_GEIST_ACTIONS[i] : `geist${i + 1}`;");
    expect(game).toContain('if (!v && helmTouch) for (const a of SEA_CLASS_TOUCH) this.touch.show(a, false);');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Klassen-Vorschau „Auf See“: echtes Seegefecht am Steuer
// ---------------------------------------------------------------------------------------------------------------

describe('Klassen-Vorschau in der echten Welt: an Land vor den Übungspuppen, auf See am Steuer gegen ein Zielschiff mit Begleitern', () => {
  it('Zielschiff querab in 140 m, zwei Begleiter in Kiellinie vor und hinter ihm', () => {
    const t = arenaTargets(1000, 2000, 0);
    expect(t).toHaveLength(3);
    expect(t[0].target).toBe(true);
    expect(Math.hypot(t[0].x - 1000, t[0].z - 2000)).toBeCloseTo(ARENA.targetDist, 6);
    expect(t[0].x).toBeGreaterThan(1000);
    for (const e of t.slice(1)) {
      expect(e.target).toBe(false);
      const d = Math.hypot(e.x - 1000, e.z - 2000);
      expect(d).toBeGreaterThan(130);
      expect(d).toBeLessThan(200);
    }
    expect(t[1].z).toBeGreaterThan(2000);
    expect(t[2].z).toBeLessThan(2000);
  });

  it('weite Seegefechts-Kamera: hinter dem eigenen Schiff, gegenüber dem Ziel, erhöht; Blick zwischen Schiff und Ziel; im Hochformat weiter weg', () => {
    const c: ArenaCam = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 0 };
    seaCameraPose(0, 0, 50, 140, 0, 1.6, c);
    expect(c.px).toBeLessThan(0);
    expect(c.py).toBeGreaterThan(14);
    expect(c.lx).toBeGreaterThan(0);
    expect(c.lx).toBeLessThan(140);
    const wide = Math.hypot(c.px, c.pz);
    seaCameraPose(0, 0, 50, 140, 0, 0.46, c);
    expect(Math.hypot(c.px, c.pz)).toBeGreaterThan(wide);
    expect(aspectPull(1.6)).toBe(1);
    expect(aspectPull(0.46)).toBeGreaterThan(1.9);
    landCameraPose(0, 0, 0, 6, 0, 1.4, c);
    expect(Math.abs(c.pz)).toBeGreaterThan(5);
    expect(c.lx).toBeCloseTo(3, 6);
  });

  it('Handy: decken die Knöpfe mehr als ein Viertel des Fensters ab, zielt die Kamera in den freien Teil darüber (PC bleibt unverändert)', () => {
    // PC: 828 px hohes Fenster, Knöpfe ab 775 (rund 14 %) – die Kamera nutzt das ganze Fenster
    expect(freeWindowHeight(62, 828, 775)).toBe(828);
    // Handy (390 × 844): Fenster 142 – 488, drei Knopfreihen ab 336 – frei sind 336 − 142 − 6 = 188 px
    expect(freeWindowHeight(142, 346, 336)).toBe(188);
    // zu wenig Platz über den Knöpfen: lieber das ganze Fenster als ein Streifen unter 70 px
    expect(freeWindowHeight(100, 140, 160)).toBe(140);
    expect(freeWindowHeight(100, 300, Number.NaN)).toBe(300);
    const css = src('ui/css/creation.css');
    expect(css).toMatch(/@media \(max-width: 600px\) \{\s*\.sc-play \{ left: 8px; right: 8px; transform: none;/);
    expect(css).toMatch(/\.sc-play \.sc-forms-bar \{ order: 4; flex: 1 1 100%; display: flex; \}/);
    expect(src('ui/classShowcase.ts')).toContain('freeWindowHeight(r.top, r.height, play.top)');
  });

  it('Vorführung ohne Klick: Standardangriff, Formen I, V, X und Ultimate; Anzeige auf Deutsch', () => {
    expect(ARENA_DEMO.map((p) => p.kind)).toEqual(['attack', 'form', 'form', 'form', 'ult']);
    expect(ARENA_DEMO.filter((p) => p.kind === 'form').map((p) => p.slot)).toEqual([1, 5, 10]);
    expect(arenaLabel({ kind: 'form', slot: 8 }, 'Wirbelsturm-Klingen', '', true)).toBe('Form VIII: Wirbelsturm-Klingen (auf See)');
    expect(arenaLabel({ kind: 'attack', slot: 0 }, '', '', true)).toBe('Standardangriff: Breitseite');
    expect(arenaLabel({ kind: 'ult', slot: 0 }, '', 'Sieben-Meere-Zäsur')).toBe('Level-60-Ultimate: Sieben-Meere-Zäsur');
  });

  it('Knöpfe für Standardangriff, alle zehn Formen, Geistes-Faji und Ultimate; echte Engine an Land, echte Kräfte am Steuer; passive Zielschiffe', () => {
    const ui = src('ui/classShowcase.ts');
    expect(ui).toContain('data-a="attack"');
    expect(ui).toContain('data-a="ult"');
    expect(ui).toContain('ROMAN.map((r, i) => `<button class="mini sc-fb" data-form="${i + 1}"');
    expect(ui).toContain('data-geist="${g}"');
    expect(ROMAN).toHaveLength(10);
    const sw = src('world/seaWorld.ts');
    for (const s of ['input.inject(ART_ACTIONS[n - 1])', 'this.castHelmArt(n, nav, s)', 'this.castHelmGeist(n, nav, s)', 'this.helmUltimate()', "input.inject('awaken')", 'nav.queueShowcase(', 'seaCameraPose(', 'cam.setViewOffset(']) expect(sw, s).toContain(s);
    const naval = src('naval/naval.ts');
    expect(naval).toMatch(/if \(e\.showcase\) \{ e\.state = 'patrol'; s\.speed = 0;/);
    expect(naval).toMatch(/stage: true, showcase: true, provoked: true/);
    const game = src('core/game.ts');
    expect(game).toMatch(/this\.world\.startArena\(r\.look, c0\.style, c0\.action, false\)/);
    expect(game).toMatch(/this\.world\.update\(dt, this\.input\)/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Server-autoritative Synchronisation aller Kampf-Entitäten
// ---------------------------------------------------------------------------------------------------------------

const ZONES = [{ id: 'ankerglueck', name: 'Ankerglück', x: 0, z: 160, r: 428 }];
const zones: ZoneOracle = { safeAt: (x, z) => safeZoneAt(ZONES, x, z)?.name ?? '' };
function profile(id: string, name: string): PlayerProfile { const p = newProfile(id); p.name = name; p.team = 'deutschland'; p.level = 40; return p; }
function state(x: number, z: number, dom: 'land' | 'sea' = 'land'): PlayerState { const s = newPlayerState(); s.x = x; s.z = z; s.dom = dom; s.mhp = 1000; s.hp = 1000; return s; }
function shard() {
  const st = (): DiplomacyState => 'neutral';
  const inbox = new Map<string, ServerMsg[]>();
  const auth = new MmoAuthority({ stance: (a, b) => stanceOf(a, b, st) }, zones, (to, msg) => { const l = inbox.get(to) ?? []; l.push(structuredClone(msg)); inbox.set(to, l); });
  auth.tick(0);
  const of = <K extends ServerMsg['k']>(id: string, k: K) => (inbox.get(id) ?? []).filter((m): m is Extract<ServerMsg, { k: K }> => m.k === k);
  const join = (id: string, name: string, x = 3000, z = 3000) => auth.join(profile(id, name), state(x, z), 0);
  const form = (ids: string[], t = 1) => {
    const [lead, ...rest] = ids;
    for (const id of rest) {
      auth.handle(lead, { k: 'invite', to: id }, t);
      const inv = [...(inbox.get(id) ?? [])].reverse().find((m) => m.k === 'party' && m.ev.e === 'invite');
      if (inv && inv.k === 'party' && inv.ev.e === 'invite') auth.handle(id, { k: 'reply', party: inv.ev.party, accept: true }, t);
    }
  };
  return { auth, of, join, form };
}
const LAND0 = { y: 0, an: 0, clip: '', pose: 1, brk: false, phase: 1 };
const foe = (o: Partial<EntSpawnNet> = {}): EntSpawnNet => ({
  key: 'isl:schmugglerbucht:0', cat: 'foe', tier: 0, role: 'hauptmann', level: 20, name: 'Hauptmann Rotbart', x: 3010, z: 3010, y: 2, hdg: 0, hp: 900, mhp: 900,
  boss: false, scale: 1.1, respawn: 300, look: { hull: '#000000', stripe: '#000000', sail: '#000000', flag: 'totenkopf', flagColor: '#000000', figurehead: 'keine', power: 'kurogane', evo: [3, 3, 3] }, ...o,
});

describe('WorldEntitySync 4.91: feste Schlüssel, Zusammenführung, Sperrzeiten', () => {
  it('feste Schlüssel (Lager, Bezirke, Kaiser, Raids) erkennt das Protokoll; lange Schlüssel werden eindeutig gekürzt', () => {
    for (const k of ['isl:a:0', 'mega:sturmzinne:hafen.1.2.0', 'kaiser:k1:thron.5.6.0', 'raid:abc:keep.1.1.0']) expect(isWorldKey(k), k).toBe(true);
    for (const k of ['p:anna.12', 'p:bodo.f3']) expect(isWorldKey(k), k).toBe(false);
    const long = `mega:${'x'.repeat(40)}:bezirk.12345.-6789.3`;
    expect(netKey(long).length).toBeLessThanOrEqual(48);
    expect(netKey(long)).toBe(netKey(long));
    expect(netKey(long)).not.toBe(netKey(`${long}9`));
    expect(netKey('isl:a:0')).toBe('isl:a:0');
  });

  it('Register: zweite Anmeldung desselben Lagers liefert den vorhandenen Gegner, nach dem Tod bleibt der Schlüssel bis zur Wiederkehr gesperrt', () => {
    const r = new SharedEntityRegistry();
    const a = r.claimKeyed('p:anna', foe(), 1);
    expect(a.fresh).toBe(true);
    const b = r.claimKeyed('p:bodo', foe(), 2);
    expect(b.fresh).toBe(false);
    expect(b.e).toBe(a.e);
    expect(b.e!.owner).toBe('p:anna');
    expect(r.stats.merged).toBe(1);
    // Schlüssel eines Clients werden nie zusammengeführt
    const c1 = r.claimKeyed('p:anna', foe({ key: 'p:anna.f1' }), 3), c2 = r.claimKeyed('p:bodo', foe({ key: 'p:anna.f1' }), 3);
    expect(c1.e).not.toBe(c2.e);
    expect(r.dead('p:anna', a.e!.id, 10)).toBeTruthy();
    const denied = r.claimKeyed('p:cara', foe(), 100);
    expect(denied.e).toBeNull();
    expect(denied.wait).toBe(210);
    r.tick(400, [], () => {}, () => {});
    expect(r.locked.size).toBe(0);
    expect(r.claimKeyed('p:cara', foe(), 401).fresh).toBe(true);
  });

  it('Landgegner wandern beim schweigenden Besitzer nur zu Spielern auf derselben Insel, Schiffe weiter bis 1 500 m', () => {
    const r = new SharedEntityRegistry();
    const f = r.claimKeyed('p:anna', foe(), 0).e!;
    const sh = r.claimKeyed('p:anna', foe({ key: 'p:anna.3', cat: 'ship' }), 0).e!;
    const peers = [{ id: 'p:anna', x: 3000, z: 3000, dom: 'land', bot: false, party: '' }, { id: 'p:bodo', x: 3010 + 900, z: 3010, dom: 'land', bot: false, party: '' }];
    const moved: string[] = [];
    r.tick(10, peers, (e, to) => moved.push(`${e.cat}:${to}`), () => {});
    expect(moved).toEqual(['ship:p:bodo']);
    expect(f.owner).toBe('p:anna');
    peers[1].x = 3060;
    r.tick(20, peers, (e, to) => moved.push(`${e.cat}:${to}`), () => {});
    expect(moved).toContain('foe:p:bodo');
    void sh;
  });

  it('Shard: Bodo stellt dasselbe Lager auf → er bekommt Annas Gegner (eclaimed mit Besitzer); geräumt → edenied mit Wartezeit; Boss länger', () => {
    const s = shard();
    s.join('p:anna', 'Anna'); s.join('p:bodo', 'Bodo', 3020, 3000);
    s.auth.handle('p:anna', { k: 'eclaim', e: foe() }, 1);
    s.auth.handle('p:bodo', { k: 'eclaim', e: foe() }, 1.2);
    const a = s.of('p:anna', 'eclaimed')[0], b = s.of('p:bodo', 'eclaimed')[0];
    expect(a).toMatchObject({ key: 'isl:schmugglerbucht:0', owner: 'p:anna' });
    expect(b).toMatchObject({ key: 'isl:schmugglerbucht:0', id: a.id, owner: 'p:anna' });
    s.auth.handle('p:anna', { k: 'edead', id: a.id, by: 'p:anna' }, 5);
    s.auth.handle('p:bodo', { k: 'eclaim', e: foe() }, 30);
    expect(s.of('p:bodo', 'edenied').at(-1)).toMatchObject({ key: 'isl:schmugglerbucht:0', wait: 275 });
    // Boss: längere Sperre (vom Client gemeldet, beim Shard begrenzt)
    s.auth.handle('p:anna', { k: 'eclaim', e: foe({ key: 'kaiser:k1:thron.1.1.0', boss: true, respawn: MMO.entRespawnBoss, role: 'legende' }) }, 40);
    const k = s.of('p:anna', 'eclaimed').at(-1)!;
    s.auth.handle('p:anna', { k: 'edead', id: k.id, by: 'p:anna' }, 50);
    s.auth.handle('p:bodo', { k: 'eclaim', e: foe({ key: 'kaiser:k1:thron.1.1.0', boss: true, respawn: MMO.entRespawnBoss }) }, 60);
    expect(s.of('p:bodo', 'edenied').at(-1)!.wait).toBe(MMO.entRespawnBoss - 10);
  });

  it('Landgegner im Schnappschuss: Höhe, Bewegung, Angriffs-Clip, Haltung, Bruch und Boss-Phase (die Phase fällt nie zurück)', () => {
    const s = shard();
    s.join('p:anna', 'Anna'); s.join('p:bodo', 'Bodo', 3020, 3000);
    s.auth.handle('p:anna', { k: 'eclaim', e: foe({ boss: true }) }, 1);
    const id = s.of('p:anna', 'eclaimed')[0].id;
    s.auth.handle('p:anna', { k: 'estate', list: [{ id, x: 3012, z: 3011, hdg: 1, spd: 2, hp: 500, mhp: 900, dis: false, y: 2.4, an: 4, clip: 'Melee_2H_Attack_Chop', pose: 0.3, brk: true, phase: 2 }] }, 1.1);
    s.auth.tick(1.3);
    const snap = s.of('p:bodo', 'ents').at(-1)!.list[0];
    expect(snap).toMatchObject({ id, cat: 'foe', role: 'hauptmann', boss: true, y: 2.4, an: 4, clip: 'Melee_2H_Attack_Chop', pose: 0.3, brk: true, phase: 2, hp: 500 });
    s.auth.handle('p:anna', { k: 'estate', list: [{ id, x: 3012, z: 3011, hdg: 1, spd: 0, hp: 480, mhp: 900, dis: false, ...LAND0 }] }, 1.4);
    s.auth.tick(1.6);
    expect(s.of('p:bodo', 'ents').at(-1)!.list[0].phase).toBe(2);
  });

  it('Treffer auf Landgegner gehen mit Haltung, Rückstoß und Richtung an den Besitzer (nur in Reichweite); Aggro wechselt zum Treffenden', () => {
    const s = shard();
    s.join('p:anna', 'Anna'); s.join('p:bodo', 'Bodo', 3020, 3000);
    s.auth.handle('p:anna', { k: 'eclaim', e: foe() }, 1);
    const id = s.of('p:anna', 'eclaimed')[0].id;
    s.auth.handle('p:bodo', { k: 'ehit', id, dmg: 120, ammo: 'land', zone: 'hull', pen: 4, applied: false, foe: { poise: 30, knock: 6, launch: 0, dx: 1, dz: 0, st: 'burn', sd: 3, heavy: true, fin: false, brk: true } }, 2);
    const fwd = s.of('p:anna', 'ehit');
    expect(fwd).toHaveLength(1);
    expect(fwd[0]).toMatchObject({ id, from: 'p:bodo', dmg: 120, pen: 4, foe: { poise: 30, knock: 6, dx: 1, dz: 0, st: 'burn', heavy: true, brk: true } });
    s.auth.tick(2.2);
    expect(s.of('p:anna', 'ents').at(-1)!.list[0].aggro).toBe('p:bodo');
    // weit weg: verworfen
    s.join('p:fern', 'Fern', 3400, 3400);
    s.auth.handle('p:fern', { k: 'ehit', id, dmg: 99, ammo: 'land', zone: 'hull', pen: 3, applied: false, foe: { poise: 0, knock: 0, launch: 0, dx: 0, dz: 1, st: '', sd: 0, heavy: false, fin: false, brk: false } }, 2.4);
    expect(s.of('p:anna', 'ehit')).toHaveLength(1);
  });

  it('Hiebe und Warnflächen des Besitzer-Gegners treffen Mitspieler über den Shard (Land-Reichweite); Warnflächen sehen alle in der Nähe', () => {
    const s = shard();
    s.join('p:anna', 'Anna'); s.join('p:bodo', 'Bodo', 3020, 3000);
    s.auth.handle('p:anna', { k: 'eclaim', e: foe() }, 1);
    const id = s.of('p:anna', 'eclaimed')[0].id;
    s.auth.handle('p:anna', { k: 'ephit', id, to: 'p:bodo', dmg: 80, pen: 3 }, 2);
    expect(s.of('p:bodo', 'ehitme')).toHaveLength(1);
    const tele = { t: 'tele' as const, ent: id, x: 3015, y: 2, z: 3010, yaw: 0.5, side: 0, n: 12, style: '', el: '', slot: 3, tx: 14, ty: 3, tz: 0, sea: false };
    s.auth.handle('p:anna', { k: 'act', a: tele }, 3);
    expect(s.of('p:bodo', 'act').at(-1)!.a).toMatchObject({ t: 'tele', ent: id, slot: 3, tx: 14, ty: 3, n: 12 });
    // nur der Besitzer darf Warnflächen seines Gegners melden
    s.auth.handle('p:bodo', { k: 'act', a: { ...tele, x: 1 } }, 4);
    expect(s.of('p:anna', 'act').filter((m) => m.a.t === 'tele')).toHaveLength(0);
  });

  it('Abschuss eines Landgegners: Gutschrift an Beteiligte und Gruppe im Einsatzgebiet, Art und Boss in der Meldung, Versenker würfelt', () => {
    const s = shard();
    s.join('p:anna', 'Anna'); s.join('p:bodo', 'Bodo', 3020, 3000); s.join('p:cara', 'Cara', 3040, 3020);
    s.form(['p:anna', 'p:bodo', 'p:cara']);
    s.auth.handle('p:anna', { k: 'eclaim', e: foe({ boss: true, role: 'legende' }) }, 1);
    const id = s.of('p:anna', 'eclaimed')[0].id;
    s.auth.handle('p:bodo', { k: 'ehit', id, dmg: 900, ammo: 'land', zone: 'hull', pen: 4, applied: false, foe: { poise: 0, knock: 0, launch: 0, dx: 0, dz: 1, st: '', sd: 0, heavy: false, fin: false, brk: false } }, 2);
    s.auth.handle('p:anna', { k: 'edead', id, by: 'p:bodo' }, 3);
    for (const who of ['p:anna', 'p:bodo', 'p:cara']) {
      const k = s.of(who, 'ekill');
      expect(k, who).toHaveLength(1);
      expect(k[0].kill).toMatchObject({ id, cat: 'foe', role: 'legende', boss: true, by: 'p:bodo', finder: 'p:bodo', owner: 'p:anna' });
    }
  });

  it('Protokoll: Landgegner, Sperren, Treffer und Warnflächen werden gesäubert', () => {
    const e = cleanEntSpawn({ ...foe(), respawn: 5, scale: 99, cat: 'irgendwas' })!;
    expect(e.cat).toBe('ship');
    expect(e.respawn).toBe(MMO.entRespawnMin);
    expect(e.scale).toBe(4);
    expect(cleanEntSpawn(foe())!.cat).toBe('foe');
    const h = cleanFoeHit({ poise: 9999, dx: 3, dz: 4, st: 'BRENNEN', sd: 99 })!;
    expect(h.poise).toBe(500);
    expect(Math.hypot(h.dx, h.dz)).toBeCloseTo(1, 6);
    expect(h.st).toBe('');
    expect(h.sd).toBe(20);
    expect(ACT_KINDS).toContain('tele');
    expect(cleanAct({ t: 'tele', ent: 'e1', slot: 2, tx: 9, ty: 1.2, n: 20 })).toMatchObject({ t: 'tele', slot: 2, tx: 9, n: 20 });
    expect(cleanServerMsg({ k: 'edenied', key: 'isl:a:0', wait: 99999 })).toMatchObject({ k: 'edenied', key: 'isl:a:0', wait: MMO.entRespawnMax });
    expect(cleanServerMsg({ k: 'eclaimed', key: 'isl:a:0', id: 'e3', owner: 'p:anna' })).toMatchObject({ owner: 'p:anna' });
    const hit = cleanIntent({ k: 'ehit', id: 'e1', dmg: 10, foe: { knock: 999 } });
    expect(hit && hit.k === 'ehit' && hit.foe?.knock).toBe(40);
  });
});

/** Attrappe eines Landgegners (nur, was `SharedEntities` braucht) */
function fakeFoe(o: Record<string, unknown> = {}) {
  return {
    shared: null as null | { id: string; owner: boolean; dead: boolean; hit: ((h: { dmg: number; poise: number; knock: number; dirX: number; dirZ: number; heavy: boolean }) => void) | null; peer: string; px: number; py: number; pz: number; lastBy: string },
    netKey: 'isl:schmugglerbucht:0', alive: true, x: 3010, z: 3010, y: 2, yaw: 0, hp: 900, maxHp: 900, vx: 0, vz: 0, phase: 1, hasPosture: true, breakFrac: 1, brokenT: 0, poise: 100,
    def: { poise: 100, scale: 1, label: 'Hauptmann', boss: false }, kind: 'hauptmann', level: 20, name: 'Hauptmann Rotbart', power: 'kurogane', state: 'idle', mirrorAn: 0, mirrorClip: '',
    netAnim: 2, netClip: '', died: 0, mirrorDie() { this.state = 'dead'; this.alive = false; this.died++; }, ...o,
  };
}

describe('SharedEntities 4.91: Landgegner beim Besitzer und als Kopie', () => {
  function rig() {
    const sent: { k: string; [k: string]: unknown }[] = [];
    let now = 10;
    const tr = { status: 'online', kind: 'local', host: true, now: () => now, send: (m: { k: string }) => sent.push(m), connect: () => {}, close: () => {}, onMessage: null } as unknown as MmoTransport;
    const c = new MmoClient(tr, 'p:bodo', () => profile('p:bodo', 'Bodo'), (o) => o, {}, () => 0);
    const foeA = fakeFoe();
    const cb = { enemies: [foeA] as unknown[], removed: [] as unknown[], teles: 0, phases: 0, applied: 0,
      removeEnemy(e: unknown) { this.removed.push(e); this.enemies.splice(this.enemies.indexOf(e), 1); },
      applyNetFoeHit(e: { hp: number }, dmg: number) { e.hp -= dmg; this.applied++; return dmg; },
      bossPhase() { this.phases++; }, showTelegraph() { this.teles++; } };
    const denied: number[] = [];
    const nav = { enemies: [], isTeamShip: () => false };
    const se = new SharedEntities({
      naval: () => nav, client: () => c, active: () => true, ownShip: () => ({}), me: (o: { x: number; z: number }) => { o.x = 3000; o.z = 3000; },
      peerShip: () => null, peerAt: (_id: string, out: { x: number; y: number; z: number; yaw: number }) => { out.x = 3020; out.y = 2; out.z = 3001; out.yaw = 0; return true; },
      playAct: () => {}, hitMe: () => {}, kill: () => {}, lookOf: () => ({}),
      combat: () => cb, foesShared: () => true, spawnFoe: () => { const f = fakeFoe({ netKey: '' }); cb.enemies.push(f); return f; },
      foeHitMe: () => {}, foeDenied: (_e: unknown, wait: number) => denied.push(wait),
    } as unknown as SharedHost);
    return { sent, c, cb, se, foeA, denied, tick: (t: number) => { now = t; } };
  }
  const base = { cat: 'foe' as const, tier: 0, role: 'hauptmann', level: 20, name: 'Hauptmann', look: foe().look, hdg: 0, spd: 0, mhp: 900, dis: false, aggro: '', dead: false, boss: true, scale: 1, ...LAND0 };

  it('eigenes Lager mit fester Kennung anmelden; vom Shard zusammengeführt → der eigene Gegner wird zur Kopie, Treffer gehen roh an den Shard', () => {
    const { sent, c, se, foeA } = rig();
    se.update(1 / 60);
    const claim = sent.find((m) => m.k === 'eclaim') as { k: string; e: EntSpawnNet } | undefined;
    expect(claim?.e).toMatchObject({ key: 'isl:schmugglerbucht:0', cat: 'foe', role: 'hauptmann', respawn: MMO.entRespawn });
    se.claimed('isl:schmugglerbucht:0', 'e7', 'p:anna');
    expect(se.stats.foeMerged).toBe(1);
    expect(foeA.shared!.owner).toBe(false);
    sent.length = 0;
    foeA.shared!.hit!({ dmg: 55, poise: 12, knock: 4, dirX: 0, dirZ: 1, heavy: true });
    expect(sent).toEqual([expect.objectContaining({ k: 'ehit', id: 'e7', dmg: 55, applied: false, foe: expect.objectContaining({ poise: 12, knock: 4, dz: 1, heavy: true }) })]);
    // Schnappschuss des Besitzers: Lage, Leben, Bewegung, Phase → Brüllen und Banner; tot → die Kopie fällt (ohne Beute)
    c.handle({ k: 'ents', t: 9.0, list: [{ id: 'e7', owner: 'p:anna', x: 3011, z: 3012, hp: 600, ...base, an: 4, clip: 'Melee_2H_Attack_Chop', phase: 2 }] });
    se.update(1 / 60);
    expect(foeA.hp).toBe(600);
    expect(foeA.mirrorAn).toBe(4);
    expect(foeA.mirrorClip).toBe('Melee_2H_Attack_Chop');
    expect(se.stats.phaseShown).toBe(1);
    c.handle({ k: 'ents', t: 9.2, list: [{ id: 'e7', owner: 'p:anna', x: 3011, z: 3012, hp: 0, ...base, dead: true, phase: 2 }] });
    se.update(1 / 60);
    expect(foeA.died).toBe(1);
  });

  it('eigener Landgegner: eigener Schaden zählt als Bedrohung, Tod geht an den Shard, Ziel der Aggro-Tabelle ist die Figur des Mitspielers', () => {
    const { sent, c, se, foeA } = rig();
    se.update(1 / 60);
    se.claimed('isl:schmugglerbucht:0', 'e8', 'p:bodo');
    expect(se.stats.foesOwned).toBe(1);
    c.handle({ k: 'ents', t: 9.0, list: [{ id: 'e8', owner: 'p:bodo', x: 3010, z: 3010, hp: 900, ...base, aggro: 'p:cara' }] });
    se.update(1 / 60);
    expect(foeA.shared!.peer).toBe('p:cara');
    expect(foeA.shared!.px).toBe(3020);
    sent.length = 0;
    foeA.hp = 700;
    se.update(1 / 60);
    expect(sent.find((m) => m.k === 'ehit')).toMatchObject({ id: 'e8', dmg: 200, applied: true });
    // Treffer eines Mitspielers: Besitzer verrechnet (Rüstung, Haltung), Beute würfelt der Mitspieler
    se.netHit('e8', 'p:cara', 150, 'land', 'hull', 4, { poise: 10, knock: 3, launch: 0, dx: 1, dz: 0, st: '', sd: 0, heavy: false, fin: false, brk: false });
    expect(foeA.hp).toBe(550);
    expect(foeA.shared!.lastBy).toBe('p:cara');
    foeA.alive = false;
    se.update(1 / 60);
    expect(sent.find((m) => m.k === 'edead')).toMatchObject({ id: 'e8', by: 'p:cara' });
  });

  it('wiederholte Übergabe stellt nichts doppelt auf; ein Gegner fern der eigenen Insel wird gleich wieder abgegeben', () => {
    const { sent, c, cb, se } = rig();
    se.update(1 / 60);
    se.claimed('isl:schmugglerbucht:0', 'e8', 'p:bodo');
    const n0 = cb.enemies.length;
    c.handle({ k: 'ents', t: 9.0, list: [{ id: 'e8', owner: 'p:bodo', x: 3010, z: 3010, hp: 900, ...base }, { id: 'e20', owner: 'p:bodo', x: 9000, z: 9000, hp: 900, ...base }] });
    se.owned({ id: 'e8', owner: 'p:bodo', x: 3010, z: 3010, hp: 900, ...base });
    se.owned({ id: 'e8', owner: 'p:bodo', x: 3010, z: 3010, hp: 900, ...base });
    expect(cb.enemies.length).toBe(n0);
    expect(se.stats.foesOwned).toBe(1);
    sent.length = 0;
    se.owned({ id: 'e20', owner: 'p:bodo', x: 9000, z: 9000, hp: 900, ...base });
    expect(sent).toEqual([expect.objectContaining({ k: 'erelease', id: 'e20' })]);
    expect(cb.enemies.length).toBe(n0);
  });

  it('geräumtes Lager: Sperre vom Shard → der Gegner wird abgebaut; Warnflächen des Besitzers erscheinen bei der Kopie', () => {
    const { se, denied, c, cb } = rig();
    se.update(1 / 60);
    se.denied('isl:schmugglerbucht:0', 180);
    expect(denied).toEqual([180]);
    expect(se.stats.foeDenied).toBe(1);
    // fremder Gegner in der Nähe: Kopie wird gebaut, Warnfläche gezeigt
    c.handle({ k: 'ents', t: 9.0, list: [{ id: 'e9', owner: 'p:anna', x: 3005, z: 3004, hp: 800, ...base }] });
    se.update(1 / 60);
    expect(se.stats.foeBuilt).toBe(1);
    se.remoteAct('p:anna', { t: 'tele', ent: 'e9', x: 3005, y: 2, z: 3010, yaw: 0, side: 0, n: 10, style: '', el: '', slot: 1, tx: 6, ty: 0, tz: 0, sea: false });
    expect(cb.teles).toBe(1);
  });
});

describe('Verdrahtung der vollständigen Synchronisation (Inseln, Bezirke, Kaiser, Ereignisse, Schlachten)', () => {
  it('Lager tragen feste Schlüssel, Bezirke und Kaiser-Garden ebenso; Ereignis- und Schlachtschiffe sind geteilt; Health-Endpunkt zählt mit', () => {
    const sw = src('world/seaWorld.ts');
    expect(sw).toMatch(/e\.netKey = `isl:\$\{id\}:\$\{i\+\+\}`/);
    expect(sw).toContain('this.combat.onPeerStrike = (e, peer, dmg) => this.sharedEnts?.peerHitFoe(e, peer, dmg)');
    expect(sw).toContain('this.combat.onTelegraph = (e, shape, x, z, yaw, size, width, delay) => this.sharedEnts?.sendTele(e, shape, x, z, yaw, size, width, delay)');
    const combat = src('combat/combat.ts');
    expect(combat).toMatch(/if \(\/\^\(mega\|kaiser\):\/\.test\(tag\)\) e\.netKey =/);
    expect(combat).toContain('this.strikePeers(e, e.strength * atk.dmg');
    expect(combat).toContain("if (e.def.raid !== 'boss' && !e.shared?.lastBy) for (const d of rollLoot");
    const se = src('world/sharedEntities.ts');
    expect(se).toContain("return !!e.ev || !!e.battle || e.role === 'patrouille'");
    const enemy = src('entities/enemy.ts');
    expect(enemy).toContain('if (this.shared && !this.shared.owner) { this.updateMirror(dt, w); return; }');
    const game = src('core/game.ts');
    expect(game).toContain("if (k.cat === 'foe') { this.sharedFoeKill(k, owner, me); return; }");
    expect(game).toContain("if (!e.shared?.id) this.mmo?.share('kill', e.kind, 1, e.x, e.z);");
    const server = readFileSync('server/mmoRelayServer.mjs', 'utf8');
    expect(server).toContain('sharedEntities: authority.entities.list.length');
    expect(server).toContain('lockedKeys: authority.entities.locked.size');
  });
});
