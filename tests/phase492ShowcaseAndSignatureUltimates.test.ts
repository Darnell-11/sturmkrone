// Phase 4.92 – „Klassenvorschau“ auf dem Startbildschirm, Signatur-Ultimates (Meteoriten-Kataklysmus, Himmelsspalter mit Schiffsteilung) mit
// Impact-Bildern an Land und auf See, verankerte Ultimates vom Steuer, Formen am Steuer wie zu Fuß, Flotten-Segen; letzte Sync-Lücken aus 4.91:
// Belagerungs-Raids (gemeinsame Instanz, Bereich), Wachschiffe der Kaiser-Seesperre (feste Plätze) und der Tiefsee-Leviathan (Art `beast`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { CreationFlow, previewCreation } from '../src/data/creationFlow';
import { ARENA, LEGEND_LABEL, arenaLabel, freeWindowHeight } from '../src/data/showcaseArena';
import { SKYFALL_TIMES, SKYFALL_ULTIMATE, T5_SHIP_SPLIT, ULTIMATES, canSplitShip } from '../src/data/cataclysms';
import { ULTIMATE_CINEMATICS } from '../src/graphics/ultimateCinematics';
import { AnimeImpactRig } from '../src/graphics/animeImpactRig';
import { CataclysmFx } from '../src/combat/cataclysmFx';
import { CataclysmDirector, type CataclysmHost } from '../src/world/cataclysmDirector';
import { ActionCombatEngine, createFighter } from '../src/combat/actionCombatEngine';
import { ACTION_STYLES } from '../src/data/actionStyles';
import { PRIEST_FLEET_BLESS, seaUltAnchor } from '../src/data/seaArts';
import { dangerOfLevel } from '../src/data/balanceConfig';
import type { NavalSystem } from '../src/naval/naval';
import { KAISER, guardDown, guardSlotsOpen, kaiserGuardKey, kaiserGuardSlot, newKaiserBattle } from '../src/data/kaiserBattle';
import { RAID_SHARE_TTL, parseRaidShare, raidEntityKey, raidInstanceOf, raidScope, raidShareFits, raidShareRef } from '../src/raid/raidShare';
import { buildRaidLayout, hashString } from '../src/raid/raidLayout';
import {
  ACT_KINDS, MMO, cleanAct, cleanEnt, cleanEntSpawn, cleanId, cleanIntent, cleanState, isWorldKey, netKey, newPlayerState, newProfile,
  type EntSpawnNet, type PlayerProfile, type PlayerState, type ServerMsg,
} from '../src/net/mmoProtocol';
import { MmoAuthority, type ZoneOracle } from '../src/net/mmoAuthority';
import { SharedEntityRegistry, sameScope } from '../src/net/worldEntitySync';
import { MmoClient } from '../src/net/mmoClient';
import type { MmoTransport } from '../src/net/mmoTransport';
import { safeZoneAt, stanceOf } from '../src/net/partyRules';
import type { DiplomacyState } from '../src/data/nations';
import { BEAST_KEY, SharedEntities, type SharedHost } from '../src/world/sharedEntities';

const src = (p: string) => readFileSync(`src/${p}`, 'utf8');

// ---------------------------------------------------------------------------------------------------------------
// 1. „Klassenvorschau“ auf dem Startbildschirm
// ---------------------------------------------------------------------------------------------------------------

describe('Startbildschirm: Knopf „Klassenvorschau“', () => {
  it('steht neben „Spielen“ (eine Reihe unter dem Online-Badge) und öffnet die Bühne über Game.openClassPreview', () => {
    const menus = src('ui/menus.ts');
    expect(menus).toMatch(/<div class="title-play-row">\s*\n\s*<button class="primary" data-a="play" data-focus>Spielen<\/button>\s*\n\s*<button class="secondary title-preview" data-a="preview"[^>]*>⚔ Klassenvorschau<\/button>/);
    expect(menus).toContain('preview: () => g.openClassPreview(),');
    const css = src('ui/css/screens.css');
    expect(css).toMatch(/\.title-menu \.title-play-row \{ display: flex;/);
    expect(css).toMatch(/\.title-play-row \.title-preview \{ flex: 1 1 0; min-width: 0; white-space: nowrap;/);
  });

  it('der Ablauf der Vorschau legt nie eine Klasse fest und beginnt kein Spiel; „Zurück“ beendet ihn (Hauptmenü)', () => {
    const st = previewCreation('feuer');
    expect(st).toMatchObject({ step: 'klasse', faction: 'pirat', spec: 'feuer', preview: true });
    const flow = new CreationFlow(st);
    expect(flow.preview('grossschwert')).toBe(true);
    expect(flow.state.spec).toBe('grossschwert');
    expect(flow.start()).toBeNull();
    expect(flow.step).toBe('klasse');
    expect(flow.back()).toBe(false);
    expect(flow.step).toBe('start');
    // der normale Einstieg bleibt, wie er war
    const normal = new CreationFlow();
    normal.pick('pirat'); normal.toClasses();
    expect(normal.start()).toMatchObject({ faction: 'pirat', spec: 'saebel' });
    expect(previewCreation('gibt-es-nicht' as never).spec).toBe('saebel');
  });

  it('ohne Spielstand: Game öffnet sie nur vom Startbildschirm, beginnt nie ein Spiel, speichert nichts und kehrt zum Hauptmenü zurück', () => {
    const game = src('core/game.ts');
    const open = game.slice(game.indexOf('  openClassPreview() {'), game.indexOf('  /** 4.92: läuft die Klassenvorschau vom Startbildschirm'));
    expect(open).toContain('if (this.save || this.creation || this.showcase) return;');
    expect(open).toContain('new CreationFlow(previewCreation())');
    expect(open).toContain('this.menus.showMain();');
    for (const bad of ['newGame', 'persist', 'saves.save', 'this.save =']) expect(open, bad).not.toContain(bad);
    // „Abenteuer starten“ ist in der Vorschau „Zurück zum Hauptmenü“; ein Druck darauf beginnt kein Spiel
    expect(game).toContain('if (!res || preview) return;');
    expect(game).toContain('if (preview) { flow.back(); this.closeClassPreview(); return; }');
    const ui = src('ui/classShowcase.ts');
    expect(ui).toContain("${o.preview ? '◀ Zurück zum Hauptmenü' : '◀ Zurück zum Aussehen'}");
    expect(ui).toContain(`data-a="\${o.preview ? 'menu' : 'start'}"`);
    expect(ui).toContain("if (a === 'back' || a === 'menu') this.o.onBack();");
    // das erzwungene Ultimate der Vorschau verschwindet beim Verlassen (kein Spielstand bekommt es)
    const sw = src('world/seaWorld.ts');
    expect(sw).toMatch(/private arenaReset\(\) \{\s*\n\s*const a = this\.arena;\s*\n\s*if \(this\.foot\) this\.foot\.engine\.forceUlt = null;/);
  });

  it('alle 15 Spezialisierungen, An Land / Auf See, Standardangriff, Form I – X, Geistes-Faji, Level-60- und legendäres Ultimate', () => {
    const ui = src('ui/classShowcase.ts');
    for (const s of ['data-a="sea"', 'data-a="attack"', 'data-form="${i + 1}"', 'data-geist="${g}"', 'data-a="ult"', 'data-a="legend"']) expect(ui, s).toContain(s);
    expect(arenaLabel({ kind: 'legend', slot: 0 })).toBe(`Legendär · Stufe 101: ${LEGEND_LABEL}`);
    expect(arenaLabel({ kind: 'legend', slot: 0 }, '', '', true)).toMatch(/vom Steuer\)$/);
    expect(src('ui/css/creation.css')).toMatch(/\.sc-play \[data-a='legend'\] \{ order: 6; \}/);
    // Handy: die Kamera zielt weiter in den freien Teil über den Knöpfen
    expect(freeWindowHeight(142, 346, 336)).toBe(188);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Signatur-Ultimates an Land und auf See
// ---------------------------------------------------------------------------------------------------------------

/** Attrappe eines Kriegsschiffs für die Regie (nur, was sie liest und schreibt) */
function dummyShip(x: number, z: number) {
  return { ship: { x, z, heading: Math.PI / 2, cls: { L: 30, W: 7 }, model: { deckY: 2.5 }, sinking: 0, maxHull: 1000, hull: 1000, fire: 0, frozen: 0, shoveX: 0, shoveZ: 0, speed: 0, alive: true, punchHoles() {}, blowMasts() {}, char() {} } };
}

/** Regie mit Attrappen-Meer: liefert, was mit den Schiffen geschah */
function runCast(kind: keyof typeof ULTIMATES | 'skyfall', opts: { anchored: boolean; land?: boolean; ships?: { x: number; z: number }[] }) {
  const fx = new CataclysmFx(new Scene());
  const ships = (opts.ships ?? [{ x: 0, z: 600 }]).map((p) => dummyShip(p.x, p.z));
  const log: string[] = [];
  const nav = {
    cataclysmShips(x: number, z: number, r: number, out: unknown[]) { out.length = 0; for (const s of ships) if (s.ship.sinking <= 0 && Math.hypot(s.ship.x - x, s.ship.z - z) - 15 <= r) out.push(s); return out.length; },
    cataclysmFriendly: () => false,
    cataclysmSplit: (e: ReturnType<typeof dummyShip>) => { log.push('split'); e.ship.sinking = 0.01; return 'split'; },
    cataclysmHit: () => { log.push('hit'); return 1; }, cataclysmPull: () => {}, cataclysmBlast: () => true,
  };
  let frames = 0;
  const host: CataclysmHost = {
    fx, combatFx: null, naval: nav as unknown as NavalSystem, debris: null, isLand: () => !!opts.land, groundY: () => 0, waterY: () => 0, setTrench: () => {}, setRift: () => {},
    shake: () => {}, darken: () => {}, impactFrames: (n: number) => { frames += n; },
  } as CataclysmHost;
  const d = new CataclysmDirector(host);
  const spec = kind === 'skyfall' ? SKYFALL_ULTIMATE.ultimate! : ULTIMATES[kind]!.ultimate!;
  const f = createFighter('p', kind === 'skyfall' ? 'feuer' : kind, 0, 3, 0, 0);
  const t = ships[0].ship;
  const anchor = opts.anchored ? seaUltAnchor(spec.kind, spec, 0, 0, t.x, t.z) : null;
  d.strike(spec, f, 0, 0, 0, anchor);
  for (let i = 0; i < 240; i++) d.update(1 / 60, 1 / 60);
  return { log, stats: d.stats, frames, anchor };
}

describe('Signatur-Ultimates: Meteoriten-Kataklysmus und Himmelsspalter', () => {
  it('Himmelssturz (legendäres Ultimate der Stufe 101): zwei Meteoriten mit Feuerschweif, Planet, vier Impact-Bilder, drei Akte', () => {
    const u = SKYFALL_ULTIMATE.ultimate!;
    expect(u.kind).toBe('skyfall');
    expect(u.frames).toBe(4);
    expect(SKYFALL_ULTIMATE.hits.filter((h) => h.vfx === 'meteor').length).toBeGreaterThanOrEqual(3);
    expect(SKYFALL_TIMES.meteor1).toBeLessThan(SKYFALL_TIMES.meteor2);
    expect(SKYFALL_TIMES.meteor2).toBeLessThan(SKYFALL_TIMES.planet);
    const c = ULTIMATE_CINEMATICS.skyfall;
    expect(c.beats).toHaveLength(3);
    expect(c.shots).toHaveLength(3);
    expect(c.frames).toBeGreaterThanOrEqual(3);
  });

  it('auf See vom Steuer: die Meteoriten schlagen am Anker über der feindlichen Flotte ein – Schiffe zerbrechen, Meteore und Planet fallen', () => {
    const r = runCast('skyfall', { anchored: true, ships: [{ x: 0, z: 520 }, { x: 30, z: 540 }] });
    expect(r.anchor).toBeTruthy();
    expect(r.stats.proxied).toBe(1);
    expect(r.stats.meteors).toBeGreaterThanOrEqual(2);
    expect(r.stats.planets).toBeGreaterThanOrEqual(1);
    expect(r.log.filter((x) => x === 'split').length).toBeGreaterThanOrEqual(1);
    expect(r.frames).toBeGreaterThanOrEqual(1);
  });

  it('an Land: der Himmelssturz reißt Krater (Land-Spektakel) – dieselbe Regie wie auf See', () => {
    const r = runCast('skyfall', { anchored: false, land: true, ships: [{ x: 4000, z: 4000 }] });
    expect(r.stats.meteors).toBeGreaterThanOrEqual(2);
    expect(r.stats.landSpectacles).toBe(1);
  });

  it('Himmelsspalter (Zweihänder): die Klingenwelle zerteilt das anvisierte Kriegsschiff in 600 m im Treffermoment; an Land reißt sie den Boden', () => {
    const sea = runCast('zweihaender', { anchored: true });
    expect(ULTIMATES.zweihaender!.ultimate!.splitShips).toBe('cross');
    expect(sea.log).toContain('split');
    expect(sea.stats.decisive).toBe(1);
    expect(sea.frames).toBe(ULTIMATES.zweihaender!.ultimate!.frames);
    const land = runCast('zweihaender', { anchored: false, land: true, ships: [{ x: 5000, z: 5000 }] });
    expect(land.stats.landSpectacles).toBe(1);
    expect(land.log).toHaveLength(0);
  });

  it('verankerte Ultimates rechnen vom Stellvertreter am Ziel: Sturmfaust, Klingen-Zyklon, Sonnentanz, Blutmond und Himmelsgericht treffen das Ziel in 600 m', () => {
    for (const k of ['sturmfaust', 'doppel', 'sonne', 'mond', 'priester'] as const) {
      const r = runCast(k, { anchored: true });
      expect(r.stats.proxied, k).toBe(1);
      expect(r.log.length, k).toBeGreaterThan(0);
    }
    const cd = src('world/cataclysmDirector.ts');
    expect(cd).toContain("proxy: createFighter('ult-anker', 'saebel')");
    expect(cd).toMatch(/p\.x = anchor\.x; p\.y = wy; p\.z = anchor\.z; p\.yaw = anchor\.yaw; p\.style = f\.style; p\.grounded = true;\s*\n\s*c\.f = p;/);
  });

  it('Schiffsteilung im Endgame: Stufe-5-Kriegsschiffe ab halbem Rumpf; die Zielschiffe der Vorschau liegen in Gefahrenstufe 3', () => {
    expect(T5_SHIP_SPLIT).toBe(0.5);
    expect(canSplitShip({ tier: 5, boss: false, hullFrac: 0.51, friendly: false }, 'cross')).toBe(false);
    expect(canSplitShip({ tier: 5, boss: false, hullFrac: 0.5, friendly: false }, 'cross')).toBe(true);
    expect(canSplitShip({ tier: 5, boss: true, hullFrac: 0.3, friendly: false }, 'cross')).toBe(false);
    const naval = src('naval/naval.ts');
    expect(naval).toContain('export const SHOWCASE_LEVEL = 12;');
    expect(dangerOfLevel(12)).toBeLessThanOrEqual(4);
    expect(naval).toMatch(/level: SHOWCASE_LEVEL, state: 'patrol'/);
  });

  it('Impact-Bilder: Ultimates mit harten Bildern (das erste invertiert), Formen I – VII nur weich; ein schwächeres löst kein stärkeres ab', () => {
    const rig = new AnimeImpactRig();
    rig.impact(4);
    expect(rig.framesLeft).toBe(4);
    rig.impact(2, true);
    expect(rig.framesLeft).toBe(4);
    for (const k of ['zweihaender', 'feuer', 'priester'] as const) expect(ULTIMATES[k]!.ultimate!.frames, k).toBeGreaterThanOrEqual(3);
  });

  it('Legendär-Knopf: die Engine nutzt für jede Klasse das erzwungene Ultimate (Himmelssturz), ohne Zwang das eigene', () => {
    const st = ACTION_STYLES.saebel;
    const of = (forceUlt: unknown) => ActionCombatEngine.prototype.ultimateOf.call({ forceUlt, tal: null } as unknown as ActionCombatEngine, st);
    expect(of(SKYFALL_ULTIMATE)).toBe(SKYFALL_ULTIMATE);
    expect(of(null)).toBe(st.ultimate);
    const sw = src('world/seaWorld.ts');
    expect(sw).toContain("foot.engine.forceUlt = kind === 'legend' ? SKYFALL_ULTIMATE : null;");
  });

  it('Formen und Geistes-Faji am Steuer zeigen dieselbe Regie wie zu Fuß (echte Treffer der Form am Ziel, Mündung am eigenen Schiff)', () => {
    const sw = src('world/seaWorld.ts');
    expect(sw).toContain('this.cataclysm.swingFx(h, p, sk.color || st.color, sk.vfx || el, !!sk.meteor, !!sk.heal);');
    expect(sw).toContain('this.helmFormMirror(sk, st.id, el, ox, oy - 1.3, oz, yaw, true);');
    expect(sw).toContain('this.helmFormMirror(sk, st.id, el, hx, this.env.heightAt(hx, hz), hz, yaw, false);');
    expect(sw).toMatch(/this\.cataclysm\.geistFx\(slot, gp, slot === 4 \? g\.range \* 0\.5 : slot === 3 \? 6 \* SEA_CINE_SCALE : 0\)/);
    expect(sw).toContain('this.cataclysm.geistFx(3, tp, 6 * SEA_CINE_SCALE);');
  });

  it('Priester: Flotten-Segen auf See – eigenes Schiff und jedes Flottenschiff im Umkreis um 35 % geheilt, Lichtsäule über jedem', () => {
    expect(PRIEST_FLEET_BLESS).toEqual({ heal: 0.35, radius: 420 });
    expect(ULTIMATES.priester!.heal).toBe(0.35);
    const sw = src('world/seaWorld.ts');
    expect(sw).toContain("if (spec.kind === 'himmelsgericht' && (this.mode === 'sail' || this.ownDeck || this.helmUlt.live)) this.fleetBlessing(PRIEST_FLEET_BLESS.heal, PRIEST_FLEET_BLESS.radius);");
    expect(sw).toContain("this.cataclysm.lightPillar(sh.x, y, sh.z, '#FFF4C8', '#6AF0B0', sh.cls.W * 0.4);");
    expect(ARENA.targetDist).toBe(140);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Sync: Belagerungs-Raids, Kaiser-Seesperre, Leviathan
// ---------------------------------------------------------------------------------------------------------------

const ZONES = [{ id: 'ankerglueck', name: 'Ankerglück', x: 0, z: 160, r: 428 }];
const zones: ZoneOracle = { safeAt: (x, z) => safeZoneAt(ZONES, x, z)?.name ?? '' };
function profile(id: string, name: string): PlayerProfile { const p = newProfile(id); p.name = name; p.team = 'deutschland'; p.level = 40; return p; }
function state(x: number, z: number, sc = '', dom: 'land' | 'sea' = 'land'): PlayerState { const s = newPlayerState(); s.x = x; s.z = z; s.dom = dom; s.mhp = 1000; s.hp = 1000; s.sc = sc; return s; }
function shard() {
  const st = (): DiplomacyState => 'neutral';
  const inbox = new Map<string, ServerMsg[]>();
  const auth = new MmoAuthority({ stance: (a, b) => stanceOf(a, b, st) }, zones, (to, msg) => { const l = inbox.get(to) ?? []; l.push(structuredClone(msg)); inbox.set(to, l); });
  auth.tick(0);
  const of = <K extends ServerMsg['k']>(id: string, k: K) => (inbox.get(id) ?? []).filter((m): m is Extract<ServerMsg, { k: K }> => m.k === k);
  const join = (id: string, name: string, x = 3000, z = 3000, sc = '') => auth.join(profile(id, name), state(x, z, sc), 0);
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
const LOOK = { hull: '#000000', stripe: '#000000', sail: '#000000', flag: 'totenkopf', flagColor: '#000000', figurehead: 'keine', power: 'kurogane', evo: [3, 3, 3] as [number, number, number] };
const spawn = (o: Partial<EntSpawnNet> = {}): EntSpawnNet => ({
  key: 'raid:rs.abc:boss', cat: 'foe', tier: 0, role: 'legende', level: 40, name: 'Admiral der Schwarzen Brandung', x: 3010, z: 3010, y: 2, hdg: 0, hp: 9000, mhp: 9000,
  boss: true, scale: 1.4, respawn: MMO.entRespawnBoss, look: LOOK, scope: 'rs.abc', ...o,
});

describe('Bereiche: Raid-Gegner nur für die Teilnehmer derselben Instanz', () => {
  it('Schnappschuss, Treffer, Aktionen, Übergabe und Gutschrift nur im selben Bereich', () => {
    const s = shard();
    s.join('p:anna', 'Anna', 3000, 3000, 'rs.abc'); s.join('p:bodo', 'Bodo', 3020, 3000, 'rs.abc'); s.join('p:cara', 'Cara', 3010, 3005, '');
    s.form(['p:anna', 'p:bodo', 'p:cara']);
    s.auth.handle('p:anna', { k: 'eclaim', e: spawn() }, 1);
    const id = s.of('p:anna', 'eclaimed')[0].id;
    s.auth.tick(1.2);
    expect(s.of('p:bodo', 'ents').at(-1)?.list.map((e) => e.id)).toContain(id);
    expect(s.of('p:bodo', 'ents').at(-1)?.list[0].scope).toBe('rs.abc');
    expect((s.of('p:cara', 'ents').at(-1)?.list ?? []).map((e) => e.id)).not.toContain(id);
    // Treffer aus der offenen Welt zählen nicht, aus der Instanz schon
    const foeHit = { poise: 0, knock: 0, launch: 0, dx: 0, dz: 1, st: '', sd: 0, heavy: false, fin: false, brk: false };
    s.auth.handle('p:cara', { k: 'ehit', id, dmg: 500, ammo: 'land', zone: 'hull', pen: 4, applied: false, foe: foeHit }, 2);
    expect(s.of('p:anna', 'ehit')).toHaveLength(0);
    s.auth.handle('p:bodo', { k: 'ehit', id, dmg: 500, ammo: 'land', zone: 'hull', pen: 4, applied: false, foe: foeHit }, 2.1);
    expect(s.of('p:anna', 'ehit')).toHaveLength(1);
    // Bauwerk-Aktion: Bodo sieht sie, Cara nicht
    const bau = { t: 'bau' as const, ent: '', x: 3000, y: 0, z: 3000, yaw: 0, side: 0, n: 0, style: '', el: 'seetor', slot: 0, tx: 0.4, ty: 0, tz: 0, sea: true };
    s.auth.handle('p:anna', { k: 'act', a: bau }, 3);
    expect(s.of('p:bodo', 'act').at(-1)?.a).toMatchObject({ t: 'bau', el: 'seetor', tx: 0.4 });
    expect(s.of('p:cara', 'act').filter((m) => m.a.t === 'bau')).toHaveLength(0);
    // Abschuss: Cara (offene Welt, aber in der Gruppe) bekommt den Raid-Boss nicht gutgeschrieben
    s.auth.handle('p:anna', { k: 'edead', id, by: 'p:bodo' }, 4);
    expect(s.of('p:anna', 'ekill')).toHaveLength(1);
    expect(s.of('p:bodo', 'ekill')).toHaveLength(1);
    expect(s.of('p:cara', 'ekill')).toHaveLength(0);
  });

  it('Übergabe beim schweigenden Besitzer nur an einen Teilnehmer derselben Instanz', () => {
    const r = new SharedEntityRegistry();
    const e = r.claimKeyed('p:anna', spawn(), 0).e!;
    const peers = [
      { id: 'p:anna', x: 3000, z: 3000, dom: 'land', bot: false, party: '', scope: 'rs.abc' },
      { id: 'p:cara', x: 3005, z: 3005, dom: 'land', bot: false, party: '', scope: '' },
      { id: 'p:bodo', x: 3060, z: 3060, dom: 'land', bot: false, party: '', scope: 'rs.abc' },
    ];
    const moved: string[] = [];
    r.tick(10, peers, (_x, to) => moved.push(to), () => {});
    expect(moved).toEqual(['p:bodo']);
    expect(e.owner).toBe('p:bodo');
    expect(sameScope({ scope: 'rs.abc' }, { scope: 'rs.abc' })).toBe(true);
    expect(sameScope({}, { scope: '' })).toBe(true);
    expect(sameScope({ scope: 'rs.abc' }, {})).toBe(false);
  });
});

describe('Gemeinsame Belagerung: Einladung, gleiche Instanz, gleiche Festung, Schlüssel je Platz', () => {
  it('Einladung (Startwert + Insel) → gleiche Instanz-Kennung und gleicher Bereich bei allen Teilnehmern', () => {
    const defId = 'kurogane_festung', seed = hashString(`${defId}:123456`);
    const ref = raidShareRef(defId, seed);
    expect(ref.length).toBeLessThanOrEqual(32);
    const got = parseRaidShare(ref)!;
    expect(got.seed).toBe(seed >>> 0);
    expect(raidShareFits(defId, got.defHash)).toBe(true);
    expect(raidShareFits('andere_insel', got.defHash)).toBe(false);
    const inst = raidInstanceOf(defId, got.seed);
    expect(inst).toBe(`raid-${defId}-${(seed >>> 0).toString(36)}`);
    expect(raidScope(inst)).toBe(raidScope(raidInstanceOf(defId, seed)));
    expect(cleanId(raidScope(inst))).toBe(raidScope(inst));
    expect(parseRaidShare('kaputt')).toBeNull();
    expect(RAID_SHARE_TTL).toBe(1200);
  });

  it('gleicher Startwert = gleiche Festung (Wachflotte, Viertel, Wellen, Hauptmänner); Schlüssel je Platz sind netzsicher', () => {
    const seed = hashString('kurogane:777');
    const a = buildRaidLayout('kurogane', seed, 0.8), b = buildRaidLayout('kurogane', seed, 0.8);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const sc = raidScope(raidInstanceOf('kurogane_festung', seed));
    for (const place of ['w.hafen.2.11', 'dach.markt.3', 'hm.burg1', 'boss', 'wache-4']) {
      const k = netKey(raidEntityKey(sc, place));
      expect(isWorldKey(k), place).toBe(true);
      expect(cleanId(k), place).toBe(k);
    }
    // lange Schlüssel: nur erlaubte Zeichen (vorher kürzte „~“ – der Shard verwarf solche Schlüssel)
    const long = netKey(`mega:${'ä'.repeat(30)}:bezirk.12345.-6789.3`);
    expect(cleanId(long)).toBe(long);
    expect(long.length).toBeLessThanOrEqual(48);
    const rd = src('raid/raidDirector.ts');
    for (const s of ["key: `w.${next.district}.${next.idx}.${i}`", "key: `dach.${id}.${pi}`", "key: `hm.${post}`", "raidEntityKey(sc, 'boss')", 'key: t.key });']) expect(rd, s).toContain(s);
  });

  it('Gegner, die ein Mitspieler schon besiegt hat, zählen als gefallen; Bauwerke übernehmen den Schaden (nie geheilt); Spiel lädt die Gruppe ein', () => {
    const rd = src('raid/raidDirector.ts');
    expect(rd).toContain('for (const t of this.tracked) if (t.e === e && !t.counted) { e.mirrorDie(); return; }');
    expect(rd).toContain('if (st.hp <= want + 0.5) return;');
    expect(rd).toContain('get netScope(): string { const c = this.session.state.ctx; return c.shared ? raidScope(c.raidInstanceId) : \'\'; }');
    const sw = src('world/seaWorld.ts');
    expect(sw).toContain('if (this.raid) { this.raid.foeTakenElsewhere(e); return; }');
    expect(sw).toContain("active: () => this.gates.presence && (!this.raid || this.netScope !== '') && !this.prologue && !this.title.active,");
    const game = src('core/game.ts');
    expect(game).toContain("if (ctx.shared && !offer) { const p = this.world.playerPos; this.mmo?.share('raid', raidShareRef(def.id, seed), 1, p.x, p.z); }");
    expect(game).toContain('out.sc = this.world.netScope;');
    expect(cleanIntent({ k: 'share', what: 'raid', ref: raidShareRef('x', 5), amount: 1, x: 0, z: 0 })).toMatchObject({ k: 'share', what: 'raid' });
    expect(ACT_KINDS).toContain('bau');
    expect(cleanAct({ t: 'bau', el: 'seetor', tx: 7 })).toMatchObject({ t: 'bau', el: 'seetor', tx: 7 });
  });
});

describe('Kaiser-Seesperre: feste Plätze der Wachflotte', () => {
  it('jeder Platz zählt einmal; die Seesperre stellt nur die übrigen Plätze auf; Schlüssel gleich für alle', () => {
    const st = newKaiserBattle('britannia');
    expect(guardSlotsOpen(st)).toHaveLength(KAISER.guards);
    guardDown(st, 3);
    guardDown(st, 3);
    expect(st.guardsDown).toBe(1);
    expect(st.fallen).toEqual([3]);
    expect(guardSlotsOpen(st)).not.toContain(3);
    const k = kaiserGuardKey('britannia', 3);
    expect(k).toBe('kaiser:britannia:wache:3');
    expect(kaiserGuardSlot(k)).toBe(3);
    expect(kaiserGuardSlot('kaiser:britannia:3')).toBe(-1);
    expect(isWorldKey(k)).toBe(true);
    const kl = src('world/kaiserLive.ts');
    expect(kl).toContain('const open = guardSlotsOpen(st), n = open.length;');
    expect(kl).toContain('guardDown(st, kaiserGuardSlot(gid));');
    expect(kl).toContain('guardSunkElsewhere(gid: string): boolean {');
  });

  it('Register: das zweite Wachschiff desselben Platzes ist dasselbe Schiff; versenkt bleibt es für alle versenkt', () => {
    const r = new SharedEntityRegistry();
    const k = kaiserGuardKey('britannia', 2);
    const ship = (o: Partial<EntSpawnNet> = {}) => spawn({ key: k, cat: 'ship', role: 'jaeger', tier: 5, scope: '', respawn: MMO.entRespawnBoss, boss: false, ...o });
    const a = r.claimKeyed('p:anna', ship(), 1), b = r.claimKeyed('p:bodo', ship(), 2);
    expect(b.fresh).toBe(false);
    expect(b.e).toBe(a.e);
    r.dead('p:anna', a.e!.id, 10);
    const c = r.claimKeyed('p:cara', ship(), 20);
    expect(c.e).toBeNull();
    expect(c.wait).toBe(MMO.entRespawnBoss - 10);
  });

  it('SharedEntities: Wachschiffe der Seesperre teilen in der offenen Welt, die des Raids nur in seiner Instanz', () => {
    const se = new SharedEntities({ scope: () => '' } as unknown as SharedHost);
    const kaiser = { raid: 'guard', guardId: 'kaiser:batavia:wache:1' } as never;
    const raid = { raid: 'guard', guardId: 'wache-2' } as never;
    expect(se.worldKeyOf(kaiser)).toBe('kaiser:batavia:wache:1');
    expect(se.worldKeyOf(raid)).toBe('');
    const inRaid = new SharedEntities({ scope: () => 'rs.abc' } as unknown as SharedHost);
    expect(inRaid.worldKeyOf(raid)).toBe('raid:rs.abc:wache-2');
    expect(inRaid.worldKeyOf(kaiser)).toBe('');
  });
});

/** Attrappe des Leviathans der Welt-Ereignisse (nur, was SharedEntities braucht) */
function fakeBeast(own: boolean) {
  const L = { active: true, alive: true, x: 9000, z: 9000, hp: 6000, maxHp: 6000, up: 1, phase: 1, heading: 0, slams: 0, remoteSlam() { this.slams++; } };
  return {
    leviathan: L, levOwnActive: own, levOwnEvent: own, levMirror: null as null | { x: number; z: number; hp: number; mhp: number; up: number; dead: boolean },
    levAggro: null, levAdopted: false, onLevHitOut: null as null | ((d: number, p: number) => number), onLevPeerHit: null as null | ((d: number) => void), onLevSlam: null as null | ((x: number, z: number) => void),
    applied: 0, levApplyHit(d: number) { L.hp -= d; this.applied++; return d; },
  };
}
function beastRig(me: string, own: boolean) {
  const sent: { k: string; [k: string]: unknown }[] = [];
  let now = 10;
  const tr = { status: 'online', kind: 'local', host: true, now: () => now, send: (m: { k: string }) => sent.push(m), connect: () => {}, close: () => {}, onMessage: null } as unknown as MmoTransport;
  const c = new MmoClient(tr, me, () => profile(me, me), (o) => o, {}, () => 0);
  const bl = fakeBeast(own);
  const se = new SharedEntities({
    naval: () => ({ enemies: [], isTeamShip: () => false }), client: () => c, active: () => true, ownShip: () => ({}), me: (o: { x: number; z: number }) => { o.x = 9050; o.z = 9050; },
    peerShip: () => null, peerAt: () => false, playAct: () => {}, hitMe: () => {}, kill: () => {}, lookOf: () => ({}),
    combat: () => null, foesShared: () => false, spawnFoe: () => null, foeHitMe: () => {}, foeDenied: () => {},
    scope: () => '', beast: () => bl,
  } as unknown as SharedHost);
  return { sent, c, bl, se, tick: (t: number) => { now = t; } };
}
const BEAST_BASE = { cat: 'beast' as const, tier: 6, role: 'leviathan', level: 60, name: 'Tiefsee-Leviathan', look: LOOK, hdg: 0, spd: 0, mhp: 6000, dis: false, aggro: '', dead: false, boss: true, scale: 1, y: 0, an: 0, clip: '', brk: false, scope: '' };

describe('Tiefsee-Leviathan: ein Ungeheuer für alle (Art `beast`)', () => {
  it('Protokoll und Register: Art `beast` mit festem Schlüssel, zweite Welt bekommt den vorhandenen Leviathan', () => {
    expect(isWorldKey(BEAST_KEY)).toBe(true);
    expect(cleanEntSpawn({ ...spawn({ key: BEAST_KEY, cat: 'beast' }) })!.cat).toBe('beast');
    expect(cleanEnt({ id: 'e1', cat: 'beast', mhp: 10, pose: 0.4 })).toMatchObject({ cat: 'beast', pose: 0.4 });
    const r = new SharedEntityRegistry();
    const beast = spawn({ key: BEAST_KEY, cat: 'beast', scope: '', role: 'leviathan' });
    const a = r.claimKeyed('p:anna', beast, 1), b = r.claimKeyed('p:bodo', beast, 2);
    expect(b.e).toBe(a.e);
  });

  it('Besitzer: anmelden, berichten (auftauchen, Phase), eigener Schaden als Bedrohung, Treffer von Mitspielern verrechnen, Tod melden, Warnringe senden', () => {
    const { sent, se, bl, c } = beastRig('p:anna', true);
    se.update(1 / 60);
    expect(sent.find((m) => m.k === 'eclaim')).toMatchObject({ e: expect.objectContaining({ key: BEAST_KEY, cat: 'beast', boss: true, respawn: MMO.entRespawnBoss }) });
    se.claimed(BEAST_KEY, 'e5', 'p:anna');
    expect(se.stats.beastClaims).toBe(1);
    sent.length = 0;
    bl.leviathan.hp = 5500;
    for (let i = 0; i < 10; i++) se.update(1 / 60);
    expect(sent.find((m) => m.k === 'ehit')).toMatchObject({ id: 'e5', dmg: 500, applied: true });
    const rep = sent.find((m) => m.k === 'estate') as { list: { id: string; pose: number; phase: number }[] } | undefined;
    expect(rep?.list.find((x) => x.id === 'e5')).toMatchObject({ pose: 1, phase: 1 });
    se.netHit('e5', 'p:bodo', 300, 'kugel', 'hull', 4);
    expect(bl.applied).toBe(1);
    expect(bl.leviathan.hp).toBe(5200);
    sent.length = 0;
    bl.onLevSlam!(9010, 9020);
    expect(sent.find((m) => m.k === 'act')).toMatchObject({ a: expect.objectContaining({ t: 'tele', ent: 'e5', slot: 9 }) });
    // der letzte Treffer kommt von Bodo (über den Shard verrechnet)
    se.netHit('e5', 'p:bodo', 5200, 'kugel', 'hull', 4);
    bl.leviathan.alive = false;
    se.update(1 / 60);
    expect(sent.find((m) => m.k === 'edead')).toMatchObject({ id: 'e5', by: 'p:bodo' });
    expect(se.beastLocalReward).toBe(true);
    void c;
  });

  it('Kopie: eigener Leviathan desselben Schlüssels wird zur Kopie (Lage, Leben, Tod aus dem Netz), Treffer gehen roh an den Besitzer, Warnringe erscheinen', () => {
    const { sent, se, bl, c } = beastRig('p:bodo', true);
    se.update(1 / 60);
    se.claimed(BEAST_KEY, 'e5', 'p:anna');
    expect(se.stats.beastMerged).toBe(1);
    c.handle({ k: 'ents', t: 9.0, list: [{ id: 'e5', owner: 'p:anna', x: 9100, z: 9120, hp: 4000, pose: 0.9, phase: 2, ...BEAST_BASE }] });
    se.update(1 / 60);
    expect(bl.levMirror).toMatchObject({ hp: 4000, mhp: 6000, up: 0.9, dead: false });
    sent.length = 0;
    expect(bl.onLevHitOut!(250, 4)).toBeGreaterThan(0);
    expect(sent.find((m) => m.k === 'ehit')).toMatchObject({ id: 'e5', dmg: 250, applied: false, pen: 4 });
    se.remoteAct('p:anna', { t: 'tele', ent: 'e5', x: 9105, y: 0, z: 9110, yaw: 0, side: 0, n: 18, style: '', el: '', slot: 9, tx: 16, ty: 0, tz: 0, sea: true });
    expect(bl.leviathan.slams).toBe(1);
    c.handle({ k: 'ents', t: 9.2, list: [{ id: 'e5', owner: 'p:anna', x: 9100, z: 9120, hp: 0, pose: 0, phase: 2, ...BEAST_BASE, dead: true }] });
    se.update(1 / 60);
    expect(bl.levMirror?.dead).toBe(true);
  });

  it('ohne eigenes Ereignis: ein Leviathan eines Mitspielers in Sicht erscheint als Kopie; Spiel und Seewelt verdrahtet', () => {
    const { se, bl, c } = beastRig('p:cara', false);
    bl.leviathan.active = false;
    c.handle({ k: 'ents', t: 9.0, list: [{ id: 'e9', owner: 'p:anna', x: 9200, z: 9100, hp: 3000, pose: 1, phase: 1, ...BEAST_BASE }] });
    se.update(1 / 60);
    se.update(1 / 60);
    expect(bl.levMirror).toMatchObject({ hp: 3000 });
    const live = src('world/worldEventsLive.ts');
    expect(live).toContain('if (this.levMirror) { this.mirrorLeviathan(dt, ev); return; }');
    expect(live).toContain("if (m.dead && ev && ev.phase !== 'beendet') this.director.end(ev, 'gesiegt', false);");
    const game = src('core/game.ts');
    expect(game).toContain("if (k.cat === 'beast') { this.sharedBeastKill(k, owner, me); return; }");
    expect(game).toContain('const viaEvent = owner && !!this.world.sharedEnts?.beastLocalReward;');
  });

  it('Spielerzustand trägt den Bereich (gesäubert), die Kopie des Zustands übernimmt ihn', () => {
    const s = cleanState({ x: 1, z: 2, sc: 'rs.abc' })!;
    expect(s.sc).toBe('rs.abc');
    expect(cleanState({ x: 1, z: 2, sc: 'böse Kennung!' })!.sc).toBe('');
  });
});
