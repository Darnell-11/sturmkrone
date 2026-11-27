// Phase 4.9 – Feinschliff und geteilte Welt: kanonische Gegner (WorldEntitySync) mit Kampf-Übertragung im 2-gegen-1-Seegefecht samt
// Gruppen-Beute, Aussehen über das Netz, Kräfte und Ultimates am Steuerrad, Ultimate-Spektakel an Land, Faji-Einführung ohne Nahkampf-Kombo,
// Vorschau „An Land / Auf See“, Wasserlauf-Rettung bei Ausdauer 0, Überspringen ohne alte Ilse-Quest, Bug ohne Vorsegel, Szene 5 in zwei
// Zeitlupen-Stufen, Markierungen der Gruppe und neue Klänge.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACT_KINDS, MMO, cleanAct, cleanAppearance, cleanEnt, cleanEntSpawn, cleanIntent, cleanServerMsg, newPlayerState, newProfile,
  type ActNet, type EntSpawnNet, type PlayerProfile, type PlayerState, type ServerMsg,
} from '../src/net/mmoProtocol';
import { MmoAuthority, type ZoneOracle } from '../src/net/mmoAuthority';
import { SharedEntityRegistry, type EntPeer } from '../src/net/worldEntitySync';
import { SharedEntities, type SharedHost } from '../src/world/sharedEntities';
import { MmoClient } from '../src/net/mmoClient';
import type { MmoTransport } from '../src/net/mmoTransport';
import { safeZoneAt, stanceOf } from '../src/net/partyRules';
import type { DiplomacyState } from '../src/data/nations';
import { SEA_ART, SEA_GEIST, seaArtCd, seaArtDamage, seaFamily, seaGeistDamage } from '../src/data/seaArts';
import { ACTION_STYLES } from '../src/data/actionStyles';
import { ACTION_IDS, ART_ACTIONS, DEFAULT_KEYS, HELM_GEIST_ACTIONS } from '../src/data/actions';
import { SALVO_ELEMENT, SCENE5, SCORE_SYNC, PROLOGUE_SCRIPT, DYNAMIC_SHOTS, TUTORIAL, combatCoach } from '../src/data/prologue';
import { salvoDone } from '../src/core/tutorialFlow';
import { WATER_RESCUE, pierLandEnd, rescueKind } from '../src/data/waterWalk';
import { QUESTS, QUEST_BY_ID, RETIRED_QUESTS, retireQuests } from '../src/data/quests';
import { BOW_RIG, BOW_STAY_SAG, bowRig, bowRigInput, stayClearance } from '../src/entities/ship/bowRig';
import { FIGUREHEAD_MODELS, figureheadBounds } from '../src/data/figureheads';
import { SHIP_CLASSES } from '../src/data/ships';
import { shipVisual } from '../src/data/shipVisuals';
import { PARTY_COLORS, PARTY_MARK, partyEmblem, partyRingRadius, plateLine, plateScale } from '../src/data/partyMarks';
import { SPECS } from '../src/data/classes';
import { ELEMENT_VOICE, STYLE_VOICE, elementVoice, formVoiceLayer } from '../src/audio/classVoices';
import { ULTIMATE_CINEMATICS } from '../src/graphics/ultimateCinematics';
import { defaultLook } from '../src/data/characterParts';

// ---------------------------------------------------------------------------------------------------------------
// Hilfen: Shard mit Postfächern (wie in den 4.8-Tests)
// ---------------------------------------------------------------------------------------------------------------

const ZONES = [{ id: 'ankerglueck', name: 'Ankerglück', x: 0, z: 160, r: 428 }];
const zones: ZoneOracle = { safeAt: (x, z) => safeZoneAt(ZONES, x, z)?.name ?? '' };

function profile(id: string, name: string, team = 'deutschland', o: Partial<PlayerProfile> = {}): PlayerProfile {
  const p = newProfile(id);
  p.name = name; p.team = team; p.level = 40; p.base = 'schwert'; p.spec = 'saebel'; p.role = 'Kombo-DPS';
  return Object.assign(p, o);
}
function state(x: number, z: number, o: Partial<PlayerState> = {}): PlayerState {
  const s = newPlayerState();
  s.x = x; s.z = z; s.dom = 'sea'; s.mhp = 1000; s.hp = 1000;
  return Object.assign(s, o);
}

function shard() {
  const st = (): DiplomacyState => 'neutral';
  const inbox = new Map<string, ServerMsg[]>();
  const auth = new MmoAuthority({ stance: (a, b) => stanceOf(a, b, st) }, zones, (to, msg) => { const l = inbox.get(to) ?? []; l.push(structuredClone(msg)); inbox.set(to, l); });
  // erster Takt setzt die Uhr (ohne ihn zählen die folgenden Takte keine Zeit)
  auth.tick(0);
  const box = (id: string) => inbox.get(id) ?? [];
  const of = <K extends ServerMsg['k']>(id: string, k: K) => box(id).filter((m): m is Extract<ServerMsg, { k: K }> => m.k === k);
  const join = (id: string, name: string, x = 3000, z = 3000) => auth.join(profile(id, name), state(x, z), 0);
  const form = (ids: string[], t = 1) => {
    const [lead, ...rest] = ids;
    for (const id of rest) {
      auth.handle(lead, { k: 'invite', to: id }, t);
      const inv = [...box(id)].reverse().find((m) => m.k === 'party' && m.ev.e === 'invite');
      if (inv && inv.k === 'party' && inv.ev.e === 'invite') auth.handle(id, { k: 'reply', party: inv.ev.party, accept: true }, t);
    }
  };
  return { auth, box, of, join, form };
}

// 4.91: Felder der Landgegner (Höhe, Bewegung, Clip, Haltung, Bruch, Phase) in Berichten und Schnappschüssen
const LAND0 = { y: 0, an: 0, clip: '', pose: 1, brk: false, phase: 1 } as const;
const spawn = (o: Partial<EntSpawnNet> = {}): EntSpawnNet => ({
  key: 'p:anna.1', cat: 'ship', tier: 2, role: 'jaeger', level: 12, name: 'Kurogane-Kriegsschiff', x: 3040, z: 3170, y: 0, hdg: 1.57, hp: 420, mhp: 420, boss: false, scale: 1, respawn: 0,
  look: { hull: '#2a2a30', stripe: '#a8322a', sail: '#202024', flag: 'totenkopf', flagColor: '#1e1a20', figurehead: 'keine', power: 'kurogane', evo: [3, 3, 3] }, ...o,
});

// ---------------------------------------------------------------------------------------------------------------
// 1. Kanonische Gegner + Kampf-Übertragung im 2-gegen-1-Seegefecht + Gruppen-Beute
// ---------------------------------------------------------------------------------------------------------------

describe('WorldEntitySync: kanonische Gegner (Kennung, Besitzer, Lage, Leben, Aggro, Übergabe, Gutschrift)', () => {
  it('zwei Kapitäne in einer Gruppe sehen DASSELBE Schiff: Kennung vom Shard, Lage und Leben aus dem Bericht des Besitzers', () => {
    const s = shard();
    s.join('p:anna', 'Anna'); s.join('p:bodo', 'Bodo', 3070, 3000);
    s.form(['p:anna', 'p:bodo']);
    s.auth.handle('p:anna', { k: 'eclaim', e: spawn() }, 1);
    const claimed = s.of('p:anna', 'eclaimed');
    expect(claimed).toHaveLength(1);
    const id = claimed[0].id;
    expect(id).toMatch(/^e\d+$/);
    s.auth.handle('p:anna', { k: 'estate', list: [{ id, x: 3050, z: 3160, hdg: 1.6, spd: 6, hp: 400, mhp: 420, dis: false, ...LAND0 }] }, 1.1);
    s.auth.tick(1.3);
    for (const who of ['p:anna', 'p:bodo']) {
      const snap = s.of(who, 'ents').at(-1)!;
      expect(snap.list).toHaveLength(1);
      expect(snap.list[0]).toMatchObject({ id, owner: 'p:anna', x: 3050, z: 3160, hp: 400, mhp: 420, tier: 2, name: 'Kurogane-Kriegsschiff' });
    }
    // Fremde dürfen nichts melden
    expect(s.auth.entities.report('p:bodo', { id, x: 0, z: 0, hdg: 0, spd: 0, hp: 1, mhp: 420, dis: false, ...LAND0 }, 1.4)).toBe(false);
  });

  it('Treffer von Bodo gehen über den Shard an Anna (Besitzer), Bodo bekommt die Aggro, verrechnete Treffer zählen nur als Bedrohung', () => {
    const s = shard();
    s.join('p:anna', 'Anna'); s.join('p:bodo', 'Bodo', 3070, 3000);
    s.form(['p:anna', 'p:bodo']);
    s.auth.handle('p:anna', { k: 'eclaim', e: spawn() }, 1);
    const id = s.of('p:anna', 'eclaimed')[0].id;
    s.auth.handle('p:bodo', { k: 'ehit', id, dmg: 60, ammo: 'kugel', zone: 'hull', pen: 3, applied: false }, 2);
    const fwd = s.of('p:anna', 'ehit');
    expect(fwd).toHaveLength(1);
    expect(fwd[0]).toMatchObject({ id, from: 'p:bodo', dmg: 60, ammo: 'kugel', zone: 'hull', pen: 3 });
    expect(s.of('p:bodo', 'ehit')).toHaveLength(0);
    // Anna trifft selbst (schon verrechnet): keine Weiterleitung, aber Bedrohung
    s.auth.handle('p:anna', { k: 'ehit', id, dmg: 20, ammo: 'kugel', zone: 'hull', pen: 3, applied: true }, 2.1);
    expect(s.of('p:anna', 'ehit')).toHaveLength(1);
    s.auth.tick(2.3);
    expect(s.of('p:anna', 'ents').at(-1)!.list[0].aggro).toBe('p:bodo');
    // Treffer aus der Ferne (außer Schussweite) werden verworfen
    s.join('p:fern', 'Fern', 9000, 9000);
    s.auth.handle('p:fern', { k: 'ehit', id, dmg: 99, ammo: 'kugel', zone: 'hull', pen: 3, applied: false }, 2.4);
    expect(s.of('p:anna', 'ehit')).toHaveLength(1);
  });

  it('Untergang: Gutschrift an beide (Versenker Bodo würfelt), Gruppen-Beute startet sofort bei beiden', () => {
    const s = shard();
    s.join('p:anna', 'Anna'); s.join('p:bodo', 'Bodo', 3070, 3000);
    s.form(['p:anna', 'p:bodo']);
    s.auth.handle('p:anna', { k: 'eclaim', e: spawn() }, 1);
    const id = s.of('p:anna', 'eclaimed')[0].id;
    s.auth.handle('p:bodo', { k: 'ehit', id, dmg: 300, ammo: 'kugel', zone: 'hull', pen: 3, applied: false }, 2);
    s.auth.handle('p:anna', { k: 'edead', id, by: 'p:bodo' }, 3);
    for (const who of ['p:anna', 'p:bodo']) {
      const k = s.of(who, 'ekill');
      expect(k, who).toHaveLength(1);
      expect(k[0].kill).toMatchObject({ id, by: 'p:bodo', finder: 'p:bodo', owner: 'p:anna' });
      expect(new Set(k[0].kill.credit)).toEqual(new Set(['p:anna', 'p:bodo']));
    }
    // der Finder schickt die Beute: der Shard würfelt für die Gruppe (beide bekommen die Karte)
    s.auth.handle('p:bodo', { k: 'loot', gold: 0, rep: 0, power: '', items: [{ uid: 'p:bodo-1', ref: 'sturmklinge', kind: 'gear', grade: 'blau', name: 'Sturmklinge', cat: 'Brust', aff: 'alle', ship: 0, value: 300, tier: 3 }] }, 3.1);
    expect(s.of('p:anna', 'rollStart')).toHaveLength(1);
    expect(s.of('p:bodo', 'rollStart')).toHaveLength(1);
    // ein zweites Mal stirbt er nicht
    s.auth.handle('p:anna', { k: 'edead', id, by: 'p:anna' }, 3.2);
    expect(s.of('p:anna', 'ekill')).toHaveLength(1);
  });

  it('Gruppenmitglieder im Einsatzgebiet bekommen den Abschuss auch ohne eigenen Treffer, Fremde ohne Treffer nicht', () => {
    const s = shard();
    s.join('p:anna', 'Anna'); s.join('p:bodo', 'Bodo', 3070, 3000); s.join('p:cara', 'Cara', 3100, 3050); s.join('p:fremd', 'Fremd', 3080, 3020);
    s.form(['p:anna', 'p:bodo', 'p:cara']);
    s.auth.handle('p:anna', { k: 'eclaim', e: spawn() }, 1);
    const id = s.of('p:anna', 'eclaimed')[0].id;
    s.auth.handle('p:anna', { k: 'ehit', id, dmg: 400, ammo: 'kugel', zone: 'hull', pen: 3, applied: true }, 2);
    s.auth.handle('p:anna', { k: 'edead', id, by: 'p:anna' }, 3);
    expect(s.of('p:cara', 'ekill')).toHaveLength(1);
    expect(s.of('p:fremd', 'ekill')).toHaveLength(0);
  });

  it('Übergabe: verlässt der Besitzer den Shard, übernimmt der nächste Kapitän; ohne Kapitän in der Nähe verschwindet der Gegner', () => {
    const s = shard();
    s.join('p:anna', 'Anna'); s.join('p:bodo', 'Bodo', 3070, 3000);
    s.auth.handle('p:anna', { k: 'eclaim', e: spawn() }, 1);
    const id = s.of('p:anna', 'eclaimed')[0].id;
    s.auth.leave('p:anna', 2);
    s.auth.tick(2.2);
    const own = s.of('p:bodo', 'eown');
    expect(own).toHaveLength(1);
    expect(own[0].e.id).toBe(id);
    expect(s.auth.entities.ents.get(id)!.owner).toBe('p:bodo');
    // weit weg und allein: abgeben → niemand da → verschwindet
    s.auth.handle('p:bodo', { k: 'state', s: state(15000, 15000) }, 3);
    s.auth.handle('p:bodo', { k: 'erelease', id }, 3);
    s.auth.tick(3.3);
    expect(s.auth.entities.ents.has(id)).toBe(false);
  });

  it('Register: Grenzen je Besitzer, kein Hin und Her nach dem Abgeben, Tote verschwinden nach der Frist', () => {
    const r = new SharedEntityRegistry();
    for (let i = 0; i < MMO.entPerOwner + 3; i++) r.claim('p:a', spawn({ key: `p:a.${i}` }), 0);
    expect(r.countOf('p:a')).toBe(MMO.entPerOwner);
    expect(r.stats.rejected).toBe(3);
    const peers: EntPeer[] = [{ id: 'p:a', x: 3000, z: 3000, dom: 'sea', bot: false, party: '' }, { id: 'p:b', x: 3500, z: 3000, dom: 'sea', bot: false, party: '' }];
    const e = r.list[0];
    r.release('p:a', e.id, 10);
    let to = '';
    r.tick(10.2, peers, (_x, who) => { to = who; }, () => {});
    expect(to).toBe('p:b');
    r.dead('p:b', e.id, 11);
    r.tick(11 + MMO.entDeadKeep + 0.5, peers, () => {}, () => {});
    expect(r.ents.has(e.id)).toBe(false);
  });

  it('Kampf-Aktionen gehen an alle in der Nähe (nicht an den Absender), höchstens zwölf je Sekunde, Gegner-Aktionen nur vom Besitzer', () => {
    const s = shard();
    s.join('p:anna', 'Anna'); s.join('p:bodo', 'Bodo', 3070, 3000); s.join('p:fern', 'Fern', 12000, 12000);
    const a: ActNet = { t: 'broadside', ent: '', x: 3000, y: 0, z: 3000, yaw: 0, side: 1, n: 6, style: '', el: '', slot: 0, tx: 3040, ty: 0, tz: 3170, sea: true };
    s.auth.handle('p:anna', { k: 'act', a }, 1);
    expect(s.of('p:bodo', 'act')).toHaveLength(1);
    expect(s.of('p:bodo', 'act')[0]).toMatchObject({ from: 'p:anna', a: { t: 'broadside', side: 1, n: 6 } });
    expect(s.of('p:anna', 'act')).toHaveLength(0);
    expect(s.of('p:fern', 'act')).toHaveLength(0);
    for (let i = 0; i < 30; i++) s.auth.handle('p:anna', { k: 'act', a }, 1.5);
    expect(s.of('p:bodo', 'act').length).toBeLessThanOrEqual(MMO.actPerSec);
    // ein fremder Gegner „feuert“: verworfen
    s.auth.handle('p:anna', { k: 'eclaim', e: spawn() }, 3);
    const id = s.of('p:anna', 'eclaimed')[0].id;
    const before = s.of('p:anna', 'act').length;
    s.auth.handle('p:bodo', { k: 'act', a: { ...a, ent: id } }, 4);
    expect(s.of('p:anna', 'act').length).toBe(before);
  });

  it('ein geteilter Gegner trifft das Schiff eines Mitspielers nur über seinen Besitzer und in Schussweite', () => {
    const s = shard();
    s.join('p:anna', 'Anna'); s.join('p:bodo', 'Bodo', 3070, 3000);
    s.auth.handle('p:anna', { k: 'eclaim', e: spawn() }, 1);
    const id = s.of('p:anna', 'eclaimed')[0].id;
    s.auth.handle('p:anna', { k: 'ephit', id, to: 'p:bodo', dmg: 42, pen: 3 }, 2);
    expect(s.of('p:bodo', 'ehitme')).toHaveLength(1);
    expect(s.of('p:bodo', 'ehitme')[0]).toMatchObject({ id, dmg: 42, name: 'Kurogane-Kriegsschiff' });
    s.auth.handle('p:bodo', { k: 'ephit', id, to: 'p:anna', dmg: 42, pen: 3 }, 2.1);
    expect(s.of('p:anna', 'ehitme')).toHaveLength(0);
  });

  it('Protokoll: neue Pakete werden gesäubert (Grenzen, Kennungen, Farben, Arten)', () => {
    expect(cleanIntent({ k: 'eclaim', e: { ...spawn(), name: 'x'.repeat(200), hp: -5, look: { hull: 'rot', power: 'KUROGANE!' } } })).toMatchObject({ k: 'eclaim', e: { hp: 0, look: { hull: '#4a3426', power: '' } } });
    expect(cleanIntent({ k: 'ehit', id: 'e1', dmg: 1e9, ammo: '<x>', zone: 'deck', pen: 99, applied: 'ja' })).toEqual({ k: 'ehit', id: 'e1', dmg: 1e6, ammo: 'kugel', zone: 'hull', pen: 12, applied: false });
    expect(cleanIntent({ k: 'act', a: { t: 'zauber' } })).toBeNull();
    expect(cleanAct({ t: 'ult', x: 1e9, side: 5, style: 'sturmfaust', el: 'feuer!' })).toMatchObject({ t: 'ult', x: 40000, side: 0, style: 'sturmfaust', el: '' });
    // 4.91: dazu `tele` (Warnfläche eines Boss-Angriffs), 4.92: `bau` (Bauwerk einer gemeinsamen Belagerung)
    expect(ACT_KINDS).toEqual(['broadside', 'bow', 'swing', 'art', 'geist', 'heal', 'ult', 'tele', 'bau']);
    const ent = cleanEnt({ id: 'e7', owner: 'p:anna', x: 5, z: 6, hdg: 1, spd: 3, hp: 900, mhp: 400, dis: true, tier: 9, role: 'jaeger', level: 500, name: 'A', aggro: 'p:bodo', dead: 'x' });
    expect(ent).toMatchObject({ id: 'e7', hp: 400, tier: 6, level: 101, dis: true, dead: false, aggro: 'p:bodo' });
    expect(cleanServerMsg({ k: 'ents', t: 5, list: Array.from({ length: 80 }, (_, i) => ({ id: `e${i}`, mhp: 10 })) })).toMatchObject({ k: 'ents' });
    expect((cleanServerMsg({ k: 'ents', t: 5, list: Array.from({ length: 80 }, (_, i) => ({ id: `e${i}`, mhp: 10 })) }) as { list: unknown[] }).list).toHaveLength(MMO.entPerPacket);
    expect(cleanServerMsg({ k: 'ekill', kill: { id: 'e1', credit: ['p:a', '<b>', 'p:c'] } })).toMatchObject({ kill: { credit: ['p:a', 'p:c'] } });
    expect(cleanEntSpawn({ key: '' })).toBeNull();
  });

  it('Client: Schnappschüsse der Gegner werden weich zwischen zwei Proben bewegt (Kurs über die kurze Seite)', () => {
    const sent: unknown[] = [];
    const tr = { status: 'online', kind: 'local', host: true, now: () => 10, send: (m: unknown) => sent.push(m), connect: () => {}, close: () => {}, onMessage: null } as unknown as MmoTransport;
    const c = new MmoClient(tr, 'p:bodo', () => profile('p:bodo', 'Bodo'), (o) => o, {}, () => 0);
    const base = { owner: 'p:anna', cat: 'ship' as const, tier: 2, role: 'jaeger', level: 12, name: 'K', look: spawn().look, spd: 6, hp: 400, mhp: 420, dis: false, aggro: '', dead: false, boss: false, scale: 1, ...LAND0 };
    c.handle({ k: 'ents', t: 9.0, list: [{ id: 'e1', x: 0, z: 0, hdg: 3.0, ...base }] });
    c.handle({ k: 'ents', t: 9.125, list: [{ id: 'e1', x: 10, z: 0, hdg: -3.0, ...base }] });
    const e = c.ents.get('e1')!;
    const v = c.sampleEnt(e, 9.125 + MMO.interpDelay - 0.0625);
    expect(v.x).toBeCloseTo(5, 3);
    // 3,0 → −3,0 rad: über ±π (kurze Seite), nicht quer über 0
    expect(Math.abs(v.hdg)).toBeGreaterThan(3);
    c.claimEnt(spawn());
    c.hitEnt('e1', 50, false, 'kette', 'sail', 4);
    c.act({ t: 'bow', ent: '', x: 0, y: 0, z: 0, yaw: 0, side: 0, n: 1, style: '', el: '', slot: 0, tx: 0, ty: 0, tz: 180, sea: true });
    expect(sent.map((m) => (m as { k: string }).k)).toEqual(['eclaim', 'ehit', 'act']);
  });

  it('schweigt der Besitzer zu lange (Tab im Hintergrund), übergibt der Shard – sein eigenes Schiff wird zur Kopie statt zum Doppelgänger', () => {
    const sent: { k: string; id?: string; dmg?: number; applied?: boolean }[] = [];
    let now = 10;
    const tr = { status: 'online', kind: 'local', host: true, now: () => now, send: (m: { k: string }) => sent.push(m), connect: () => {}, close: () => {}, onMessage: null } as unknown as MmoTransport;
    const c = new MmoClient(tr, 'p:anna', () => profile('p:anna', 'Anna'), (o) => o, {}, () => 0);
    const ship = {
      alive: true, sinking: 0, disabled: false, hull: 400, maxHull: 420, x: 3040, z: 3170, heading: 1.57, speed: 5, prev: { x: 3040, z: 3170, heading: 1.57 },
      netHit: null as null | ((base: number, ammo: string, zone: 'hull' | 'sail', pen: number) => void),
      look: spawn().look, cls: SHIP_CLASSES[2], evo: { hullTier: 3, sailTier: 3, cannonTier: 3 }, model: { deckY: 3 },
    };
    const e = { ship, role: 'jaeger', level: 12, name: 'Kurogane-Kriegsschiff', provoked: true, shared: undefined as undefined | { id: string; owner: boolean; aggro: unknown; dead: boolean } };
    const nav = { enemies: [e], isTeamShip: () => false, showNumber: () => {}, disableMirror: () => {}, sinkMirror: () => {}, removeEventShip: () => {}, queueMirror: () => {} };
    const se = new SharedEntities({
      naval: () => nav, client: () => c, active: () => true, ownShip: () => ({}), me: (o: { x: number; z: number }) => { o.x = 3000; o.z = 3000; },
      peerShip: () => null, peerAt: () => false, playAct: () => {}, hitMe: () => {}, kill: () => {}, lookOf: () => ({}),
      combat: () => null, foesShared: () => false, spawnFoe: () => null, foeHitMe: () => {}, foeDenied: () => {},
    } as unknown as SharedHost);
    // anmelden und Kennung bekommen: Anna steuert (KI läuft, Berichte gehen raus)
    se.update(1 / 60);
    const claim = sent.find((m) => m.k === 'eclaim') as { k: string; e: EntSpawnNet } | undefined;
    expect(claim).toBeTruthy();
    se.claimed(claim!.e.key, 'e1');
    const base = { cat: 'ship' as const, tier: 2, role: 'jaeger', level: 12, name: 'K', look: spawn().look, hdg: 1.57, spd: 5, hp: 400, mhp: 420, dis: false, aggro: '', dead: false, boss: false, scale: 1, ...LAND0 };
    c.handle({ k: 'ents', t: 9.0, list: [{ id: 'e1', owner: 'p:anna', x: 3040, z: 3170, ...base }] });
    for (let i = 0; i < 10; i++) se.update(1 / 60);
    expect(se.stats.owned).toBe(1);
    expect(e.shared!.owner).toBe(true);
    expect(sent.some((m) => m.k === 'estate')).toBe(true);
    // Anna schwieg über `entStale`: der Shard hat Bodo zum Besitzer gemacht – Annas Schiff wird zur Kopie (gleiches Schiff, keine KI)
    now = 14;
    c.handle({ k: 'ents', t: 13.0, list: [{ id: 'e1', owner: 'p:bodo', x: 3060, z: 3180, ...base, hp: 380 }] });
    c.handle({ k: 'ents', t: 13.125, list: [{ id: 'e1', owner: 'p:bodo', x: 3062, z: 3181, ...base, hp: 380 }] });
    se.update(1 / 60);
    expect(se.stats.demoted).toBe(1);
    expect(se.stats.owned).toBe(0);
    expect(se.stats.mirrors).toBe(1);
    expect(e.shared!.owner).toBe(false);
    expect(se.mirrorOf('e1')).toBe(e);
    expect(se.ownedOf('e1')).toBeNull();
    // ab jetzt folgt es Bodos Schnappschüssen, Leben inklusive …
    se.update(1 / 60);
    expect(ship.x).toBeGreaterThan(3055);
    expect(ship.hull).toBe(380);
    // … und Annas Treffer gehen als Rohschaden an den Shard (nicht mehr lokal verrechnet)
    sent.length = 0;
    ship.netHit!(50, 'kugel', 'hull', 3);
    expect(sent).toEqual([expect.objectContaining({ k: 'ehit', id: 'e1', dmg: 50, applied: false })]);
    // keine Berichte mehr für einen Gegner, der Anna nicht gehört
    for (let i = 0; i < 20; i++) se.update(1 / 60);
    expect(sent.some((m) => m.k === 'estate')).toBe(false);
  });

  it('der Versenker bekommt immer ein Würfel-Stück: gibt es keine Ausrüstung dieser Seltenheit für die eigene Stufe, wird es ein Talisman', () => {
    const src = readFileSync('src/core/game.ts', 'utf8');
    const body = src.slice(src.indexOf('private lootItemFor('), src.indexOf('private lootShared('));
    expect(body).toContain("if (!g) return this.lootItemFor({ ...d, kind: 'trinket' });");
    const kill = src.slice(src.indexOf('private sharedKill('), src.indexOf('private sharedHitMe('));
    expect(kill).toMatch(/k\.finder === me[\s\S]*onLootPickup\(\{ rarity/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Aussehen beim Beitreten und bei jeder Änderung
// ---------------------------------------------------------------------------------------------------------------

describe('Aussehen über das Netz: beim Beitreten und nach jeder Änderung', () => {
  it('der Steckbrief mit Aussehen geht beim Beitreten an die Nachbarn und nach einer Änderung erneut (neue Version)', () => {
    const s = shard();
    const look = defaultLook('pirat');
    const app = cleanAppearance({ look: { ...look }, extra: [], dye: [], style: 'saebel', blade: '#c9d2da', glow: false });
    expect(app).not.toBeNull();
    s.auth.join(profile('p:anna', 'Anna', 'deutschland', { app }), state(3000, 3000), 0);
    s.join('p:bodo', 'Bodo', 3050, 3000);
    s.auth.tick(0.2);
    const first = s.of('p:bodo', 'profiles').flatMap((m) => m.list).find((p) => p.id === 'p:anna');
    expect(first?.app?.style).toBe('saebel');
    s.auth.handle('p:anna', { k: 'profile', profile: profile('p:anna', 'Anna', 'deutschland', { app: { ...app!, style: 'zweihaender' } }) }, 1);
    s.auth.tick(1.3);
    const again = s.of('p:bodo', 'profiles').flatMap((m) => m.list).filter((p) => p.id === 'p:anna');
    expect(again.length).toBe(2);
    expect(again[1].pv).toBeGreaterThan(again[0].pv);
    expect(again[1].app?.style).toBe('zweihaender');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Kräfte am Steuerrad, Ultimates auf See und an Land
// ---------------------------------------------------------------------------------------------------------------

describe('Kräfte am Steuerrad: Formen 1 – 10, Geistes-Faji, Ultimate über dem Meer', () => {
  it('alle 15 Kampfstile haben eine See-Familie, Schaden wächst mit der Form, Abklingzeiten haben eine Untergrenze', () => {
    for (const id of Object.keys(ACTION_STYLES)) expect(['faust', 'klinge', 'faji', 'priester']).toContain(seaFamily(id));
    expect(seaFamily('sturmfaust')).toBe('faust');
    expect(seaFamily('saebel')).toBe('klinge');
    expect(seaFamily('feuer')).toBe('faji');
    expect(seaFamily('priester')).toBe('priester');
    for (let s = 2; s <= 10; s++) expect(seaArtDamage(30, 20, s)).toBeGreaterThan(seaArtDamage(30, 20, s - 1));
    expect(seaArtCd(0.5)).toBe(SEA_ART.cdMin);
    expect(seaArtCd(8)).toBeCloseTo(8 * SEA_ART.cdK, 5);
    expect(SEA_GEIST.map((g) => g.effect)).toEqual(['will', 'heal', 'thunder', 'quake']);
    expect(seaGeistDamage(30, 20, 'thunder')).toBeGreaterThan(seaGeistDamage(30, 20, 'quake'));
    expect(seaGeistDamage(30, 20, 'heal')).toBe(0);
  });

  it('Tasten: Formen bleiben auf 1 – 5 / Umschalt + 1 – 5, Geistes-Faji am Steuer auf Umschalt + Q/R/T/G, Flottenbefehle auf 6/7/Z – keine Doppelbelegung auf See', () => {
    expect(HELM_GEIST_ACTIONS.map((a) => DEFAULT_KEYS[a][0])).toEqual(['Shift+KeyQ', 'Shift+KeyR', 'Shift+KeyT', 'Shift+KeyG']);
    expect(ART_ACTIONS.slice(0, 5).map((a) => DEFAULT_KEYS[a][0])).toEqual(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']);
    expect([DEFAULT_KEYS.fleetHold[0], DEFAULT_KEYS.fleetAttack[0], DEFAULT_KEYS.fleetRally[0]]).toEqual(['Digit6', 'Digit7', 'KeyZ']);
    const sea = ['fireLeft', 'fireRight', 'interact', 'repair', 'attack', 'dodge', 'awaken', 'fleetHold', 'fleetAttack', 'fleetRally', ...ART_ACTIONS, ...HELM_GEIST_ACTIONS] as const;
    const used = new Map<string, string>();
    for (const a of sea) for (const k of DEFAULT_KEYS[a]) { expect(used.get(k), `${a} und ${used.get(k)} auf ${k}`).toBeUndefined(); used.set(k, a); }
    for (const a of HELM_GEIST_ACTIONS) expect(ACTION_IDS).toContain(a);
  });

  it('Seewelt: Formen, Geistes-Faji und Ultimate am Steuer sind verdrahtet (Ziel, Schaden beim Eintreffen, Übertragung, Abklingzeiten im HUD)', () => {
    const src = readFileSync('src/world/seaWorld.ts', 'utf8');
    for (const s of ['castHelmArt(', 'castHelmGeist(', 'helmUltimate(', 'pickArtTarget(', 'nav.artHit(', "sendAct('art'", "sendAct('geist'", 'this.goDeck();', 'f.bufU = f.clock']) expect(src, s).toContain(s);
    expect(src).toMatch(/helm \? \(sk \? Math\.min\(1, this\.helmCd\[i\]/);
  });

  it('alle 15 Ultimates haben eine 3-Akt-Choreografie; an Land legt der entscheidende Treffer das Spektakel der See an (Himmel, Säulen, Ringe, Krater)', () => {
    expect(Object.keys(ULTIMATE_CINEMATICS).length).toBeGreaterThanOrEqual(15);
    const src = readFileSync('src/world/cataclysmDirector.ts', 'utf8');
    const decide = src.slice(src.indexOf('  private decide(c: Cast)'), src.indexOf('  private decide(c: Cast)') + 400);
    expect(decide).toContain('this.landSpectacle(c);');
    const land = src.slice(src.indexOf('  private landSpectacle(c: Cast)'), src.indexOf('  private decide(c: Cast)'));
    for (const s of ['darken?.(', 'vf.spiral(', "fx.emit('shock')", 'vf.surfaceHit(']) expect(land, s).toContain(s);
    // Formen und Faji-Geschosse: Lichtblitz, Druckwelle, Energiespur, mehrschichtiger Geschosskern
    for (const s of ['vf.pressureRing(mx, my, mz', 'vf.bolt(f.x + fwdX * 0.8', '  projTrail(']) expect(src, s).toContain(s);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Einführung, Vorschau, Wasserlauf, Überspringen
// ---------------------------------------------------------------------------------------------------------------

describe('Faji-Einführung bei Konrad ohne Nahkampf-Kombo', () => {
  it('Faji-Wirker üben eine Element-Salve (Geschosse + Trefferkette), Nahkämpfer weiter die Kombo', () => {
    expect(salvoDone(TUTORIAL.salvoShots, 0, TUTORIAL.salvoHits)).toBe(true);
    expect(salvoDone(TUTORIAL.salvoShots - 1, 0, 9)).toBe(false);
    expect(salvoDone(12, 10, 9)).toBe(false);
    expect(salvoDone(TUTORIAL.salvoShots, 0, TUTORIAL.salvoHits - 1)).toBe(false);
    const ranged = combatCoach('Feuer-Faji', ['Funke', 'Glut'], true, SALVO_ELEMENT.feuer);
    expect(ranged[0].title).toMatch(/Element-Salve/);
    expect(ranged[0].text).toMatch(/Feuer-Geschossen/);
    expect(ranged[0].text).toMatch(/Kombo im Nahkampf brauchst du als Faji-Wirker nicht/);
    const melee = combatCoach('Säbel', ['Querhieb'], false);
    expect(melee[0].title).toMatch(/Deine Kombo/);
    expect(QUEST_BY_ID.t3.steps.find((s) => s.type === 'act' && s.act === 'combo')?.text).toMatch(/Element-Salve/);
  });
});

describe('Klassen-Vorschau: Schalter „Vorschau: An Land / Auf See“', () => {
  it('Knopf in der Vorschau; 4.91: die Vorschau läuft in der echten Welt (an Land Übungsplatz, auf See am Steuer gegen ein Zielschiff)', () => {
    const ui = readFileSync('src/ui/classShowcase.ts', 'utf8');
    expect(ui).toContain('data-a="sea"');
    expect(ui).toContain("'Vorschau: Auf See' : 'Vorschau: An Land'");
    const sw = readFileSync('src/world/seaWorld.ts', 'utf8');
    for (const s of ['setArenaSea(sea: boolean', 'private arenaToSea()', 'private arenaToLand()', 'nav.queueShowcase(']) expect(sw, s).toContain(s);
  });
});

describe('Wasserlauf: Ausdauer 0 → Rettung an Deck bzw. an Land', () => {
  it('mit Schiff an Deck, ohne Schiff am nahen Steg, sonst am Strand; Grund-Ausdauer kehrt zurück', () => {
    expect(rescueKind({ shipReady: true, pierDist: 10 })).toBe('deck');
    expect(rescueKind({ shipReady: false, pierDist: 300 })).toBe('pier');
    expect(rescueKind({ shipReady: false, pierDist: WATER_RESCUE.pierRange + 1 })).toBe('shore');
    expect(WATER_RESCUE.stamina).toBeGreaterThan(0.3);
    expect(WATER_RESCUE.fade).toBeLessThan(1.5);
    // landseitiges Stegende: näher an der Inselmitte, ein Stück auf den Steg hinein, Blick zur Insel
    const out = { x: 0, z: 0, yaw: 0 };
    pierLandEnd({ ax: 0, az: 100, bx: 0, bz: 160 }, 0, 0, out);
    expect(out.z).toBeGreaterThan(100);
    expect(out.z).toBeLessThan(110);
    expect(Math.abs(out.yaw - Math.PI)).toBeLessThan(1e-6);
  });
});

describe('Prolog und Einführung überspringen: keine alte Ilse-Quest', () => {
  it('„Kapitel 0: Leinen los“ gibt es nicht mehr; der Rat folgt direkt auf die Einführung; alte Stände werden aufgeräumt', () => {
    expect(QUESTS.some((q) => q.id === 'k0')).toBe(false);
    expect(RETIRED_QUESTS).toContain('k0');
    expect(QUEST_BY_ID.rat.after).toBe('t5');
    expect(QUEST_BY_ID.k1.after).toBe('rat');
    const p = { quests: [{ id: 'k0' }, { id: 'rat' }], done: ['t5'], flags: { tracked: 'k0' } as Record<string, unknown> };
    expect(retireQuests(p)).toBe(true);
    expect(p.quests.map((q) => q.id)).toEqual(['rat']);
    expect(p.done).toContain('k0');
    expect(p.flags.tracked).toBeUndefined();
    expect(retireQuests(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 5. Bug ohne Vorsegel
// ---------------------------------------------------------------------------------------------------------------

describe('Bug: keine Vorsegel mehr, der Vorstag läuft über Galionsfigur und Kopfhöhe', () => {
  it('der Bauplan kennt keine Vorsegel mehr', () => {
    for (const c of SHIP_CLASSES) expect('jibs' in shipVisual(c, { hullTier: 5, sailTier: 5, cannonTier: 5 }).sail).toBe(false);
    const src = readFileSync('src/entities/ship/shipBuilder.ts', 'utf8');
    expect(src).not.toMatch(/jibMesh|bow\.jibs|Klüver \(Dreieckssegel am Bug\)/);
  });

  it('alle Klassen × alle Galionsfiguren (auch die Schwarze Krone): Vorstag samt Durchhang über der Umrisslinie, Bugspriet 25 – 42 % der Länge', () => {
    for (const c of SHIP_CLASSES) for (const f of [null, ...FIGUREHEAD_MODELS]) {
      const base = bowRigInput(c, null);
      const fig = f ? figureheadBounds(f, c.L, c.W, base.bowZ, base.bowTop) : null;
      const rig = bowRig({ ...base, figure: fig });
      const cl = stayClearance(rig, rig.stay.a, rig.stay.b, BOW_STAY_SAG(c.L / 15));
      expect(cl, `${c.id}/${f}`).toBeGreaterThanOrEqual(0);
      expect(rig.sprit.len / c.L).toBeGreaterThanOrEqual(BOW_RIG.lenK - 1e-9);
      expect(rig.sprit.len / c.L).toBeLessThanOrEqual(BOW_RIG.maxLenK + 1e-9);
      // die Nock liegt vor der Figur, das Stag endet auf ihr
      if (fig) expect(rig.stay.b.z).toBeGreaterThan(fig.front);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 6. Szene 5: zwei Zeitlupen-Stufen
// ---------------------------------------------------------------------------------------------------------------

describe('Prolog Szene 5: zweistufige Zeitlupe, Spaltung bis auf den Grund, Rumpfbruch von Bug bis Heck', () => {
  it('Stufe 1 (0,38×) mit dem Strahl, Stufe 2 (0,25×) mit dem Bruch, eigene Kamerafahrten, Echtzeit vor Szene 6', () => {
    expect(SCENE5.stage1).toBeGreaterThanOrEqual(0.25); expect(SCENE5.stage1).toBeLessThanOrEqual(0.38);
    expect(SCENE5.stage2).toBeGreaterThanOrEqual(0.25); expect(SCENE5.stage2).toBeLessThanOrEqual(0.38);
    const beats = PROLOGUE_SCRIPT.urteil;
    const time = beats.filter((b) => b.kind === 'time').map((b) => [b.at, b.v]);
    expect(time).toEqual([[SCORE_SYNC.beam + 0.05, SCENE5.stage1], [SCORE_SYNC.bow, SCENE5.stage2], [SCENE5.normal, 1]]);
    expect(beats.some((b) => b.kind === 'fx' && b.id === 'bruch' && b.at === SCORE_SYNC.bow)).toBe(true);
    expect(beats.some((b) => b.kind === 'shot' && b.id === 's5_spalt' && b.at === SCORE_SYNC.beam)).toBe(true);
    expect(beats.some((b) => b.kind === 'shot' && b.id === 's5_bruch' && b.at === SCORE_SYNC.bow)).toBe(true);
    for (const s of ['s5_spalt', 's5_bruch']) expect(DYNAMIC_SHOTS as readonly string[]).toContain(s);
    // nach dem Bruch kippen die Hälften auseinander, bevor die Szene endet
    expect(SCORE_SYNC.bow + SCENE5.crack).toBeLessThan(SCENE5.fall);
    const live = readFileSync('src/world/prologueLive.ts', 'utf8');
    for (const s of ['private startCrack()', 'private stepCrack(dt: number)', "case 'bruch': this.startCrack();", 'h.impact(3)', "vfx.burst('splinter'", "vfx.burst('spark'"]) expect(live, s).toContain(s);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 7. Markierungen der Gruppe
// ---------------------------------------------------------------------------------------------------------------

describe('Gruppenmitglieder: Namensschild, Ring, Kartenzeichen', () => {
  it('Farben gleich in Daten und tokens.css; Emblem je Spezialisierung, sonst Grundklasse', () => {
    const css = readFileSync('src/ui/css/tokens.css', 'utf8');
    expect(css).toContain(`--party-emerald: ${PARTY_COLORS.emerald}`);
    expect(css).toContain(`--party-turquoise: ${PARTY_COLORS.turquoise}`);
    expect(css).toContain(`--party-deep: ${PARTY_COLORS.deep}`);
    for (const id of Object.keys(SPECS)) expect(partyEmblem(id, '')).toBe(SPECS[id as keyof typeof SPECS].crest);
    expect(partyEmblem('', 'faust')).toBe('✊');
    expect(partyEmblem('', '')).toBe('✦');
  });

  it('Ring an Land fest, auf See nach der Schiffslänge; Schilder werden mit der Entfernung kleiner, nie unter dem Mindestmaß', () => {
    expect(partyRingRadius(false, 74)).toBe(PARTY_MARK.ringLand);
    expect(partyRingRadius(true, 74)).toBeCloseTo(74 * PARTY_MARK.ringShipK, 5);
    expect(plateScale(0)).toBe(1);
    expect(plateScale(1e6)).toBe(PARTY_MARK.plateMin);
    expect(plateLine(12, 'Kombo-DPS')).toBe('Stufe 12 · Kombo-DPS');
    // Minikarte/Kompass/Seekarte kennen das Zeichen, die Weltkarte zeichnet Gruppenmitglieder mit Namen
    expect(readFileSync('src/ui/minimap.ts', 'utf8')).toMatch(/case 'party':/);
    expect(readFileSync('src/ui/worldMapDraw.ts', 'utf8')).toContain("drawPoi(ctx, 0, 0, 'party', 1.25)");
    const css = readFileSync('src/ui/css/hud.css', 'utf8');
    expect(css).toMatch(/\.pplates \{[^}]*pointer-events: none !important/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 8. Klänge
// ---------------------------------------------------------------------------------------------------------------

describe('Web-Audio: Donner, Kanonen, Holz, pfeifende Kugeln, Klassen- und Element-Stimmen', () => {
  it('jede der 15 Spezialisierungen hat eine Stimme, jedes Element ebenso, hohe Formen eine tiefe Schicht', async () => {
    const { ANIME_SFX, audio } = await import('../src/audio/audio');
    for (const sp of Object.values(SPECS)) expect(ANIME_SFX, sp.style).toContain(STYLE_VOICE[sp.style]);
    for (const v of Object.values(ELEMENT_VOICE)) expect(ANIME_SFX).toContain(v);
    for (const n of ['fistQuake', 'bladeHiss', 'fireHiss', 'whipCrack', 'choirBell', 'ballWhistle', 'woodImpact'] as const) {
      expect(ANIME_SFX).toContain(n);
      expect(() => audio.play(n, 1, { x: 3, y: 0, z: 4 })).not.toThrow();
    }
    for (const n of ['thunder', 'thunderClap', 'boom', 'broadside'] as const) expect(() => audio.play(n, 1, { x: 1, y: 0, z: 1 })).not.toThrow();
    expect(elementVoice('feuer', 'feuer', 1)).toBe('fireHiss');
    expect(elementVoice('erdspalter', '', 3)).toBe('fistQuake');
    expect(elementVoice('priester', 'priester', 2)).toBe('choirBell');
    expect(formVoiceLayer(3)).toBeNull();
    expect(formVoiceLayer(7)).toBe('impactCrack');
    expect(formVoiceLayer(10)).toBe('quakeRumble');
  });

  it('Donner mit Sub-Bass 28 – 65 Hz, Knistern und mehrstufigem Hall; Kanone mit Pulverdruck und Rumpf-Resonanz', () => {
    const src = readFileSync('src/audio/audio.ts', 'utf8');
    const th = src.slice(src.indexOf('  private thunderVoice('), src.indexOf('  private thunderVoice(') + 1400);
    expect(th).toMatch(/this\.tone\(65, t, 2\.8, 'sine'[^)]*, 28,/);
    expect(th).toMatch(/'highpass'/);
    expect(th).toMatch(/stages: \[number, number, number, number\]\[\] = \[\[0, [^\]]+\], \[0\.35, [^\]]+\], \[0\.9, [^\]]+\], \[1\.7, /);
    const cannon = src.slice(src.indexOf('  private cannon('), src.indexOf('  private cannon(') + 900);
    expect(cannon).toMatch(/220 \* k, 'bandpass'/);
    expect(cannon).toMatch(/this\.tone\(70 \* k/);
  });
});

// Spiegel-Ziel der Zeichen aus der Klasse (kein Laufzeit-Test nötig): jede Kampf-Aktion ist eine bekannte Art
void ACT_KINDS;
