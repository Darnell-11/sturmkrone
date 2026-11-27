// Phase 4.8A – server-reife MMO-Schicht: Protokoll und Transporte (BroadcastChannel/WebSocket), Diplomatie der Welt-KI für Gruppen, Kriegsausbruch
// mit 30-s-Schutzfrist, Rechtsklick-Menü und Betrachten, 2 – 5-Spieler-Gruppen, Heilung über das Gruppenfenster, Mitfahrt an Deck, Schutzzonen,
// Chat mit /s, /p, /w, /welt und /r, Kapitäne des lokalen Shards, Interessenbereich, Schnappschuss-Interpolation und Leistung.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/data/regions';
import { FactionWarEngine, NationRegistry, warWorldFromDefs } from '../src/world/factionWarEngine';
import {
  MMO, MMO_PROTOCOL, aoiRadius, cleanIntent, cleanServerMsg, cleanText, decodePacket, encodePacket, newPlayerState, newProfile, sayRadius,
  type ClientIntent, type PlayerProfile, type PlayerState, type ServerMsg,
} from '../src/net/mmoProtocol';
import {
  RIDE_BOUNDS, alliedStance, groupAllowed, inviteBlock, partyConflicts, playerRelation, pvpBlock, rideSlot, rideToWorld, rideValid, safeZoneAt, stanceOf, worldToRide,
  type PartyStance,
} from '../src/net/partyRules';
import { MmoAuthority, type DiplomacyOracle, type ZoneOracle } from '../src/net/mmoAuthority';
import { SnapshotBuffer, newInterpOut } from '../src/net/snapshotBuffer';
import { LocalShardMmoTransport, WebSocketMmoTransport, createMmoTransport, type ChannelLike, type MmoTransport, type SocketLike, type Timers, type TransportStatus } from '../src/net/mmoTransport';
import { MmoClient } from '../src/net/mmoClient';
import { SHARD_BOTS, ShardBots, rosterCounts, type BotWorld } from '../src/net/shardBots';
import { CHAT_DEF, ChatLog, linePrefix, parseChatLine, resolveName, stickyLabel } from '../src/social/chat';
import { buildPlayerMenu, inspectView, type PlayerMenuCtx } from '../src/social/playerMenu';
import { safeZones } from '../src/social/safeZones';
import type { DiplomacyState } from '../src/data/nations';

// ---------------------------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------------------------

/** Diplomatie-Tabelle für Tests: Paare (alphabetisch) im Krieg bzw. im Bündnis, sonst neutral */
function diplomacy(war: string[][] = [['england', 'frankreich']], ally: string[][] = [['deutschland', 'niederlande']]) {
  const W = new Set(war.map((p) => [...p].sort().join('|')));
  const A = new Set(ally.map((p) => [...p].sort().join('|')));
  const state = (x: string, y: string): DiplomacyState => { const k = [x, y].sort().join('|'); return W.has(k) ? 'krieg' : A.has(k) ? 'allianz' : 'neutral'; };
  const oracle: DiplomacyOracle = { stance: (a, b) => stanceOf(a, b, state) };
  return { oracle, W, A };
}

const ZONES = [{ id: 'ankerglueck', name: 'Ankerglück', x: 0, z: 160, r: 78 + 350 }];
const zones: ZoneOracle = { safeAt: (x, z) => safeZoneAt(ZONES, x, z)?.name ?? '' };

function profile(id: string, name: string, team = '', o: Partial<PlayerProfile> = {}): PlayerProfile {
  const p = newProfile(id);
  p.name = name; p.team = team; p.level = 12; p.spec = 'saebel'; p.role = 'Kombo-DPS'; p.classLabel = 'Schwertkämpfer · Säbel';
  return Object.assign(p, o);
}

function state(x: number, z: number, o: Partial<PlayerState> = {}): PlayerState {
  const s = newPlayerState();
  s.x = x; s.z = z; s.mhp = 1000; s.hp = 1000;
  return Object.assign(s, o);
}

/** Shard mit Postfach je Empfänger (Kopien: Schnappschüsse werden wiederverwendet) */
function shard(war?: string[][], ally?: string[][]) {
  const { oracle } = diplomacy(war, ally);
  const inbox = new Map<string, ServerMsg[]>();
  const auth = new MmoAuthority(oracle, zones, (to, msg) => { const l = inbox.get(to) ?? []; l.push(structuredClone(msg)); inbox.set(to, l); }, (t) => t || 'Ungebunden');
  const box = (id: string) => inbox.get(id) ?? [];
  const take = (id: string) => { const l = box(id); inbox.set(id, []); return l; };
  const notices = (id: string) => box(id).filter((m) => m.k === 'notice').map((m) => (m as Extract<ServerMsg, { k: 'notice' }>).text);
  const chats = (id: string) => box(id).filter((m) => m.k === 'chat').map((m) => (m as Extract<ServerMsg, { k: 'chat' }>).msg);
  const party = (id: string) => [...box(id)].reverse().find((m) => m.k === 'party' && m.ev.e === 'state') as Extract<ServerMsg, { k: 'party' }> | undefined;
  const join = (id: string, name: string, team = '', x = 0, z = 0, o: Partial<PlayerState> = {}) => { auth.join(profile(id, name, team), state(x, z, o), 0); };
  return { auth, inbox, box, take, notices, chats, party, join };
}

/** Shard-Takt mit Lebenszeichen aller Menschen (sonst gehen sie nach 15 s Stille vom Shard) */
function tickAll(auth: MmoAuthority, t: number, bots?: ShardBots, dt = 0.05) {
  for (const p of auth.list) if (!p.bot) p.seen = t;
  bots?.tick(t, dt);
  auth.tick(t);
}

/** Gruppe aus `ids` bilden (erster lädt alle ein, alle nehmen an) */
function form(s: ReturnType<typeof shard>, ids: string[], t = 1) {
  const [lead, ...rest] = ids;
  for (const id of rest) {
    s.auth.handle(lead, { k: 'invite', to: id }, t);
    const inv = [...s.box(id)].reverse().find((m) => m.k === 'party' && m.ev.e === 'invite') as Extract<ServerMsg, { k: 'party' }> | undefined;
    if (!inv || inv.ev.e !== 'invite') continue;
    s.auth.handle(id, { k: 'reply', party: inv.ev.party, accept: true }, t);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Protokoll
// ---------------------------------------------------------------------------------------------------------------

describe('4.8A Protokoll: typisierte, gesäuberte Pakete', () => {
  it('Absichten werden geprüft: unbekannte Arten verworfen, Zahlen begrenzt, Chat-Text gesäubert', () => {
    expect(cleanIntent({ k: 'boom' })).toBeNull();
    expect(cleanIntent(null)).toBeNull();
    const chat = cleanIntent({ k: 'chat', ch: 'welt', text: '  Hallo\u0000\n  Welt   ' + 'x'.repeat(400), to: '' });
    expect(chat?.k).toBe('chat');
    if (chat?.k === 'chat') { expect(chat.text.startsWith('Hallo Welt')).toBe(true); expect(chat.text.length).toBe(MMO.chatMax); }
    expect(cleanIntent({ k: 'chat', ch: 'system', text: 'gefälscht', to: '' })).toBeNull();
    const heal = cleanIntent({ k: 'heal', to: 'p:abc', frac: 99 });
    expect(heal?.k === 'heal' && heal.frac).toBe(0.6);
    expect(cleanIntent({ k: 'heal', to: '<script>', frac: 0.2 })).toBeNull();
    const hello = cleanIntent({ k: 'hello', v: MMO_PROTOCOL, profile: { id: 'p:x', name: 'A'.repeat(80), level: 999 }, state: { x: 1e9, z: 5, dom: 'see' } });
    expect(hello?.k).toBe('hello');
    if (hello?.k === 'hello') { expect(hello.profile.name.length).toBeLessThanOrEqual(MMO.nameMax); expect(hello.profile.level).toBe(101); expect(hello.state.x).toBe(40000); expect(hello.state.dom).toBe('land'); }
  });

  it('Nachrichten des Servers werden geprüft; Paket-Text mit Größengrenze', () => {
    const snap = cleanServerMsg({ k: 'snap', t: 5, seq: 2, list: [{ id: 'p:a', x: 1, z: 2, dom: 'sea' }, { id: 'kaputt!', x: 0 }, 'quatsch'] });
    expect(snap?.k).toBe('snap');
    if (snap?.k === 'snap') { expect(snap.list.length).toBe(1); expect(snap.list[0].dom).toBe('sea'); }
    expect(cleanServerMsg({ k: 'chat', msg: { ch: 'welt', text: '   ' } })).toBeNull();
    expect(cleanServerMsg({ k: 'party', ev: { e: 'state', party: null } })).toEqual({ k: 'party', ev: { e: 'state', party: null } });
    const p: ClientIntent = { k: 'chat', ch: 'sagen', text: 'Ahoi', to: '' };
    expect(cleanIntent(decodePacket(encodePacket(p)))).toEqual(p);
    expect(decodePacket('{kaputt')).toBeNull();
    expect(decodePacket('x'.repeat(70000))).toBeNull();
    expect(cleanText('a\u2028b')).toBe('a b');
  });

  it('Interessenbereich 600 m an Land, 2 400 m auf See; Sagen 80 m / 350 m', () => {
    expect(aoiRadius('land', 'land')).toBe(600);
    expect(aoiRadius('land', 'sea')).toBe(2400);
    expect(aoiRadius('sea', 'land')).toBe(2400);
    expect(sayRadius('land')).toBe(80);
    expect(sayRadius('sea')).toBe(350);
    expect(MMO.snapshotHz).toBeGreaterThanOrEqual(15);
    expect(MMO.snapshotHz).toBeLessThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Diplomatie der Welt-KI
// ---------------------------------------------------------------------------------------------------------------

describe('4.8A Diplomatie: Gruppen nur bei gleicher Nation, Bündnis oder Neutral', () => {
  it('FactionWarEngine.partyStance folgt dem aktuellen Zustand der Welt-KI', () => {
    const reg = new NationRegistry();
    const w = warWorldFromDefs(REGIONS.flatMap((r) => r.islands), reg);
    const eng = new FactionWarEngine(reg, w.islands, w.obstacles, null, 11);
    const r = eng.relation('england', 'frankreich')!;
    r.state = 'krieg';
    expect(eng.partyStance('england', 'frankreich')).toBe('krieg');
    expect(groupAllowed(eng.partyStance('england', 'frankreich'))).toBe(false);
    r.state = 'allianz';
    expect(eng.partyStance('frankreich', 'england')).toBe('buendnis');
    r.state = 'neutral';
    expect(eng.partyStance('england', 'frankreich')).toBe('neutral');
    expect(eng.partyStance('england', 'england')).toBe('gleich');
    // ungebundene Neulinge (vor dem Rat der Gesandten) sind zu allen neutral – auch zu Nationen im Krieg
    r.state = 'krieg';
    expect(eng.partyStance(null, 'frankreich')).toBe('neutral');
    expect(eng.partyStance('england', '')).toBe('neutral');
  });

  it('Regeln: Krieg sperrt, alles andere erlaubt; verbündet = gleiche Nation oder Bündnis', () => {
    const all: PartyStance[] = ['gleich', 'buendnis', 'handelspakt', 'neutral', 'rivalitaet', 'krieg'];
    expect(all.filter(groupAllowed)).toEqual(['gleich', 'buendnis', 'handelspakt', 'neutral', 'rivalitaet']);
    expect(all.filter(alliedStance)).toEqual(['gleich', 'buendnis']);
    expect(inviteBlock('krieg')).toBe('Gesperrt (Kriegszustand)');
    expect(inviteBlock('neutral')).toBe('');
    expect(playerRelation('krieg', false)).toBe('hostile');
    expect(playerRelation('krieg', true)).toBe('friendly');
    expect(playerRelation('neutral', false)).toBe('neutral');
    expect(playerRelation('buendnis', false)).toBe('friendly');
  });

  it('Shard: Einladung erlaubt bei gleicher Nation, Bündnis und Neutral – autoritativ gesperrt bei Krieg', () => {
    const s = shard();
    s.join('p:en', 'Edwina', 'england');
    s.join('p:en2', 'Archie', 'england');
    s.join('p:fr', 'Aurélie', 'frankreich');
    s.join('p:de', 'Ragna', 'deutschland');
    s.join('p:nl', 'Femke', 'niederlande');
    s.join('p:neu', 'Lene', '');
    // Krieg England – Frankreich: gesperrt, keine Einladung beim Ziel
    s.auth.handle('p:en', { k: 'invite', to: 'p:fr' }, 1);
    expect(s.notices('p:en').some((t) => t.includes('Kriegszustand'))).toBe(true);
    expect(s.box('p:fr').some((m) => m.k === 'party' && m.ev.e === 'invite')).toBe(false);
    // gleiche Nation, Neutral (auch ungebunden), Bündnis
    s.auth.handle('p:en', { k: 'invite', to: 'p:en2' }, 1);
    expect(s.box('p:en2').some((m) => m.k === 'party' && m.ev.e === 'invite')).toBe(true);
    s.auth.handle('p:fr', { k: 'invite', to: 'p:neu' }, 1);
    expect(s.box('p:neu').some((m) => m.k === 'party' && m.ev.e === 'invite')).toBe(true);
    s.auth.handle('p:de', { k: 'invite', to: 'p:nl' }, 1);
    expect(s.box('p:nl').some((m) => m.k === 'party' && m.ev.e === 'invite')).toBe(true);
    // auch über einen Dritten: in einer Gruppe mit einem Engländer kann kein Franzose dazukommen
    form(s, ['p:neu', 'p:en']);
    expect(s.auth.partyOf('p:neu')?.members.length).toBe(2);
    s.auth.handle('p:neu', { k: 'invite', to: 'p:fr' }, 2);
    expect(s.notices('p:neu').some((t) => t.includes('Kriegszustand'))).toBe(true);
  });

  it('Kriegsausbruch in einer Gruppe: 30-s-Schutzfrist mit Warnung, dann trennen sich verfeindete Mitglieder', () => {
    const d = diplomacy([], []);
    const inbox = new Map<string, ServerMsg[]>();
    const auth = new MmoAuthority(d.oracle, zones, (to, m) => { const l = inbox.get(to) ?? []; l.push(structuredClone(m)); inbox.set(to, l); });
    auth.join(profile('p:en', 'Edwina', 'england'), state(0, 0), 0);
    auth.join(profile('p:fr', 'Aurélie', 'frankreich'), state(5, 0), 0);
    auth.join(profile('p:de', 'Ragna', 'deutschland'), state(9, 0), 0);
    auth.handle('p:en', { k: 'invite', to: 'p:fr' }, 1);
    auth.handle('p:fr', { k: 'reply', party: 'g1', accept: true }, 1);
    auth.handle('p:en', { k: 'invite', to: 'p:de' }, 1);
    auth.handle('p:de', { k: 'reply', party: 'g1', accept: true }, 1);
    expect(auth.partyOf('p:en')?.members.map((m) => m.id)).toEqual(['p:en', 'p:fr', 'p:de']);
    // die Welt-KI erklärt Krieg
    d.W.add('england|frankreich');
    for (let t = 2; t <= 10; t += 0.5) tickAll(auth, t);
    expect(inbox.get('p:fr')!.some((m) => m.k === 'party' && m.ev.e === 'warn' && m.ev.left > 20)).toBe(true);
    expect(auth.partyOf('p:fr')?.members.length).toBe(3);
    for (let t = 10.5; t <= 31; t += 0.5) tickAll(auth, t);
    expect(auth.partyOf('p:fr')?.members.length).toBe(3);
    for (let t = 31.5; t <= 33; t += 0.5) tickAll(auth, t);
    // Anführer bleibt, der Franzose geht, der Deutsche bleibt (verträgt sich mit beiden)
    expect(auth.partyOf('p:fr')).toBeNull();
    expect(auth.partyOf('p:en')?.members.map((m) => m.id)).toEqual(['p:en', 'p:de']);
    expect(inbox.get('p:fr')!.some((m) => m.k === 'party' && m.ev.e === 'removed' && m.ev.why.includes('Krieg'))).toBe(true);
    expect(auth.stats.removedByWar).toBe(1);
    // die Verbliebenen bekommen die Entwarnung (Banner aus)
    const enBox = inbox.get('p:en')!;
    const lastWarn = enBox.map((m, i) => ({ m, i })).filter(({ m }) => m.k === 'party' && (m.ev.e === 'warn' || m.ev.e === 'calm')).pop();
    expect(lastWarn?.m.k === 'party' && lastWarn.m.ev.e).toBe('calm');
    expect(auth.warnOf('p:en')).toBeNull();
  });

  it('Schutzfrist verlängert sich bis zum Ende des laufenden Gefechts (höchstens 120 s); Frieden hebt sie auf', () => {
    const d = diplomacy([], []);
    const auth = new MmoAuthority(d.oracle, zones, () => {});
    auth.join(profile('p:en', 'Edwina', 'england'), state(0, 0), 0);
    auth.join(profile('p:fr', 'Aurélie', 'frankreich'), state(5, 0, { combat: true }), 0);
    auth.handle('p:en', { k: 'invite', to: 'p:fr' }, 1);
    auth.handle('p:fr', { k: 'reply', party: 'g1', accept: true }, 1);
    d.W.add('england|frankreich');
    for (let t = 2; t <= 60; t += 0.5) { auth.handle('p:en', { k: 'ping', t }, t); auth.handle('p:fr', { k: 'ping', t }, t); auth.tick(t); }
    expect(auth.partyOf('p:en')?.members.length).toBe(2);
    expect(auth.warnOf('p:en')?.fight).toBe(true);
    const s = state(5, 0, { combat: false });
    auth.handle('p:fr', { k: 'state', s }, 60.5);
    for (let t = 61; t <= 62; t += 0.5) auth.tick(t);
    expect(auth.partyOf('p:en')).toBeNull();
    // Frieden vor Ablauf: Warnung weg, Gruppe bleibt
    const d2 = diplomacy([], []);
    const a2 = new MmoAuthority(d2.oracle, zones, () => {});
    a2.join(profile('p:en', 'Edwina', 'england'), state(0, 0), 0);
    a2.join(profile('p:fr', 'Aurélie', 'frankreich'), state(5, 0), 0);
    a2.handle('p:en', { k: 'invite', to: 'p:fr' }, 1);
    a2.handle('p:fr', { k: 'reply', party: 'g1', accept: true }, 1);
    d2.W.add('england|frankreich');
    for (let t = 2; t <= 12; t += 0.5) a2.tick(t);
    expect(a2.warnOf('p:en')).not.toBeNull();
    d2.W.clear();
    for (let t = 12.5; t <= 50; t += 0.5) { a2.handle('p:en', { k: 'ping', t }, t); a2.handle('p:fr', { k: 'ping', t }, t); a2.tick(t); }
    expect(a2.warnOf('p:en')).toBeNull();
    expect(a2.partyOf('p:en')?.members.length).toBe(2);
  });

  it('partyConflicts behält Anführer und Verträgliche in Beitrittsreihenfolge', () => {
    const team: Record<string, string> = { a: 'england', b: 'deutschland', c: 'frankreich', d: 'niederlande' };
    const { oracle } = diplomacy([['england', 'frankreich'], ['deutschland', 'frankreich']]);
    const out: string[] = [];
    const pair = partyConflicts(['a', 'b', 'c', 'd'], (id) => team[id], (x, y) => oracle.stance(x, y), out);
    expect(out).toEqual(['c']);
    expect(pair).toEqual({ a: 'england', b: 'frankreich' });
    expect(partyConflicts(['a', 'b'], (id) => team[id], (x, y) => oracle.stance(x, y), out)).toBeNull();
    expect(out).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Gruppen 2 – 5
// ---------------------------------------------------------------------------------------------------------------

describe('4.8A Gruppen: 2/5 bis 5/5, Einladung mit 30 s, Krone, Auflösung', () => {
  it('Lebenszyklus: bilden, wachsen bis 5/5, voll, Anführer geht (Krone wandert), unter zwei löst sich die Gruppe auf', () => {
    const s = shard([], []);
    for (const [i, n] of ['A', 'B', 'C', 'D', 'E', 'F'].entries()) s.join(`p:${n.toLowerCase()}`, `Kapitän ${n}`, '', i * 3, 0);
    form(s, ['p:a', 'p:b']);
    const st = s.party('p:b')?.ev;
    expect(st?.e === 'state' ? st.party?.members.length : 0).toBe(2);
    form(s, ['p:a', 'p:c', 'p:d', 'p:e']);
    expect(s.auth.partyOf('p:a')?.members.length).toBe(5);
    s.auth.handle('p:a', { k: 'invite', to: 'p:f' }, 2);
    expect(s.notices('p:a').some((t) => t.includes('voll (5/5)'))).toBe(true);
    // nur der Anführer lädt ein
    s.auth.handle('p:b', { k: 'invite', to: 'p:f' }, 2);
    expect(s.notices('p:b').some((t) => t.includes('Nur der Anführer'))).toBe(true);
    // Anführer verlässt die Gruppe: die Krone geht an das nächste Mitglied
    s.auth.handle('p:a', { k: 'leave' }, 3);
    expect(s.auth.partyOf('p:b')?.leader).toBe('p:b');
    expect(s.auth.partyOf('p:a')).toBeNull();
    expect(s.chats('p:c').some((m) => m.ch === 'system' && m.text.includes('Krone geht an Kapitän B'))).toBe(true);
    // ernennen und entfernen
    s.auth.handle('p:b', { k: 'promote', id: 'p:c' }, 4);
    expect(s.auth.partyOf('p:b')?.leader).toBe('p:c');
    s.auth.handle('p:c', { k: 'kick', id: 'p:d' }, 4);
    expect(s.auth.partyOf('p:d')).toBeNull();
    expect(s.box('p:d').some((m) => m.k === 'party' && m.ev.e === 'removed')).toBe(true);
    s.auth.handle('p:e', { k: 'leave' }, 5);
    s.auth.handle('p:b', { k: 'leave' }, 5);
    // C wäre allein: aufgelöst
    expect(s.auth.partyOf('p:c')).toBeNull();
    expect(s.auth.parties.size).toBe(0);
  });

  it('Einladung läuft nach 30 s ab; Ablehnen meldet es dem Einladenden; schon gruppiert = Hinweis', () => {
    const s = shard([], []);
    s.join('p:a', 'Anna'); s.join('p:b', 'Bodo'); s.join('p:c', 'Cora');
    s.auth.handle('p:a', { k: 'invite', to: 'Bodo' }, 1);
    const inv = s.box('p:b').find((m) => m.k === 'party' && m.ev.e === 'invite');
    expect(inv && inv.k === 'party' && inv.ev.e === 'invite' && inv.ev.left).toBe(MMO.inviteTime);
    tickAll(s.auth, 1); tickAll(s.auth, 30.9);
    expect(s.auth.pendingInvites('p:b')).toBe(1);
    tickAll(s.auth, 31.1);
    expect(s.auth.pendingInvites('p:b')).toBe(0);
    expect(s.box('p:b').some((m) => m.k === 'party' && m.ev.e === 'expired')).toBe(true);
    s.auth.handle('p:b', { k: 'reply', party: 'g1', accept: true }, 32);
    expect(s.notices('p:b').some((t) => t.includes('abgelaufen'))).toBe(true);
    s.auth.handle('p:a', { k: 'invite', to: 'p:c' }, 40);
    s.auth.handle('p:c', { k: 'reply', party: 'g1', accept: false }, 41);
    expect(s.box('p:a').some((m) => m.k === 'party' && m.ev.e === 'declined')).toBe(true);
    form(s, ['p:a', 'p:b'], 50);
    s.auth.handle('p:c', { k: 'invite', to: 'p:b' }, 51);
    expect(s.notices('p:c').some((t) => t.includes('bereits in einer Gruppe'))).toBe(true);
  });

  it('Gruppen-Werte (Leben, Willenskraft, Ort) gehen an alle Mitglieder – auch außerhalb des Interessenbereichs', () => {
    const s = shard([], []);
    s.join('p:a', 'Anna', '', 0, 0, { zone: 'Ankerglück' });
    s.join('p:b', 'Bodo', '', 5000, 5000, { dom: 'sea', zone: 'Bernsteinsee', hp: 400, mhp: 1000 });
    form(s, ['p:a', 'p:b']);
    s.take('p:a');
    for (let t = 1; t <= 2; t += 0.05) s.auth.tick(t);
    const v = s.box('p:a').filter((m) => m.k === 'vitals').pop() as Extract<ServerMsg, { k: 'vitals' }>;
    expect(v.list.find((e) => e.id === 'p:b')).toMatchObject({ hp: 400, mhp: 1000, zone: 'Bernsteinsee', dom: 'sea' });
    // der Schnappschuss enthält Bodo nicht (5 km entfernt)
    const snap = s.box('p:a').filter((m) => m.k === 'snap').pop() as Extract<ServerMsg, { k: 'snap' }>;
    expect(snap.list.some((e) => e.id === 'p:b')).toBe(false);
  });

  it('Heilung über das Gruppenfenster: Gruppe und Verbündete in Reichweite, nicht neutrale Fremde', () => {
    const s = shard([], [['deutschland', 'niederlande']]);
    s.join('p:pr', 'Priesterin', 'deutschland', 0, 0);
    s.join('p:nl', 'Femke', 'niederlande', 10, 0);
    s.join('p:fr', 'Aurélie', 'frankreich', 12, 0);
    s.join('p:en', 'Edwina', 'england', 14, 0);
    s.join('p:far', 'Weit', 'deutschland', 300, 0);
    s.auth.handle('p:pr', { k: 'heal', to: 'p:nl', frac: 0.2 }, 1);
    expect(s.box('p:nl').some((m) => m.k === 'heal' && m.frac === 0.2 && m.name === 'Priesterin')).toBe(true);
    s.auth.handle('p:pr', { k: 'heal', to: 'p:fr', frac: 0.2 }, 1);
    expect(s.box('p:fr').some((m) => m.k === 'heal')).toBe(false);
    expect(s.notices('p:pr').some((t) => t.includes('nur auf deine Gruppe und Verbündete'))).toBe(true);
    form(s, ['p:pr', 'p:en']);
    s.auth.handle('p:pr', { k: 'heal', to: 'p:en', frac: 0.15 }, 2);
    expect(s.box('p:en').some((m) => m.k === 'heal' && m.frac === 0.15)).toBe(true);
    s.auth.handle('p:pr', { k: 'heal', to: 'p:far', frac: 0.2 }, 2);
    expect(s.box('p:far').some((m) => m.k === 'heal')).toBe(false);
    // Sturmhorn: Gruppe und Verbündete im Umkreis
    s.auth.handle('p:pr', { k: 'horn', x: 0, z: 0, heal: 0.24, will: 35 }, 3);
    expect(s.box('p:nl').some((m) => m.k === 'horn' && m.will === 35)).toBe(true);
    expect(s.box('p:en').some((m) => m.k === 'horn')).toBe(true);
    expect(s.box('p:fr').some((m) => m.k === 'horn')).toBe(false);
  });

  it('Geteilter Abschuss- und Kriegs-Quest-Fortschritt geht an die Gruppe in der Nähe', () => {
    const s = shard([], []);
    s.join('p:a', 'Anna', '', 0, 0); s.join('p:b', 'Bodo', '', 200, 0); s.join('p:c', 'Cora', '', 2000, 0); s.join('p:x', 'Fremd', '', 10, 0);
    form(s, ['p:a', 'p:b', 'p:c']);
    s.auth.handle('p:a', { k: 'share', what: 'kill', ref: 'matrose', amount: 1, x: 0, z: 0 }, 2);
    s.auth.handle('p:a', { k: 'share', what: 'merit', ref: 'kiefernhafen', amount: 8, x: 0, z: 0 }, 2);
    expect(s.box('p:b').filter((m) => m.k === 'share').map((m) => (m as Extract<ServerMsg, { k: 'share' }>).what)).toEqual(['kill', 'merit']);
    expect(s.box('p:c').some((m) => m.k === 'share')).toBe(false);
    expect(s.box('p:x').some((m) => m.k === 'share')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------------------------------------------

describe('4.8A Chat: /s, /p, /w, /welt und /r', () => {
  it('Befehle und Namensauflösung (Namen mit Leerzeichen, eindeutige Namenswörter, Anführungszeichen)', () => {
    const names = ['Ragna Sturmhut', 'Tjark Nebelsegel', 'Lene Salzwind'];
    expect(parseChatLine('/s Ahoi zusammen', { ch: 'welt' })).toEqual({ kind: 'say', ch: 'sagen', text: 'Ahoi zusammen' });
    expect(parseChatLine('/p Wir segeln los', { ch: 'sagen' })).toEqual({ kind: 'say', ch: 'gruppe', text: 'Wir segeln los' });
    expect(parseChatLine('/1 Suche Gruppe', { ch: 'sagen' })).toEqual({ kind: 'say', ch: 'welt', text: 'Suche Gruppe' });
    expect(parseChatLine('/welt Konvoi im Süden', { ch: 'sagen' })).toEqual({ kind: 'say', ch: 'welt', text: 'Konvoi im Süden' });
    expect(parseChatLine('/w Ragna Sturmhut Hallo du', { ch: 'sagen' }, names)).toEqual({ kind: 'whisper', to: 'Ragna Sturmhut', text: 'Hallo du' });
    expect(parseChatLine('/w tjark Hallo', { ch: 'sagen' }, names)).toEqual({ kind: 'whisper', to: 'Tjark Nebelsegel', text: 'Hallo' });
    expect(parseChatLine('/w "Lene Salzwind" Moin', { ch: 'sagen' }, names)).toEqual({ kind: 'whisper', to: 'Lene Salzwind', text: 'Moin' });
    expect(parseChatLine('/r Danke!', { ch: 'sagen' })).toEqual({ kind: 'reply', text: 'Danke!' });
    expect(parseChatLine('/einladen Ragna', { ch: 'sagen' }, names)).toEqual({ kind: 'invite', who: 'Ragna Sturmhut' });
    expect(parseChatLine('/invite Lene Salzwind', { ch: 'sagen' }, names)).toEqual({ kind: 'invite', who: 'Lene Salzwind' });
    expect(parseChatLine('/verlassen', { ch: 'sagen' })).toEqual({ kind: 'leave' });
    expect(parseChatLine('/leave', { ch: 'sagen' })).toEqual({ kind: 'leave' });
    expect(parseChatLine('ohne Befehl', { ch: 'gruppe' })).toEqual({ kind: 'say', ch: 'gruppe', text: 'ohne Befehl' });
    expect(parseChatLine('ohne Befehl', { ch: 'fluestern', to: 'Ragna Sturmhut' })).toEqual({ kind: 'whisper', to: 'Ragna Sturmhut', text: 'ohne Befehl' });
    expect(parseChatLine('/xyz', { ch: 'sagen' }).kind).toBe('error');
    expect(resolveName('Ragna', ['Ragna Sturmhut', 'Ragna Eisblick']).name).toBe('Ragna');
    expect(stickyLabel({ ch: 'fluestern', to: 'Ragna' })).toBe('An Ragna:');
    expect(CHAT_DEF.sagen.color).toBe('#F4F1EA');
    expect(CHAT_DEF.gruppe.color).toBe('#8FD6FF');
    expect(CHAT_DEF.fluestern.color).toBe('#F27BE8');
    expect(CHAT_DEF.welt.color).toBe('#EBC35A');
  });

  it('Sagen erreicht 80 m an Land und 350 m auf See (auch rivalisierende Fraktionen), Welt den ganzen Shard', () => {
    const s = shard();
    s.join('p:a', 'Anna', 'england', 0, 0);
    s.join('p:b', 'Bodo', 'frankreich', 70, 0);
    s.join('p:c', 'Cora', '', 95, 0);
    s.join('p:s', 'Sven', '', 5000, 0, { dom: 'sea' });
    s.join('p:t', 'Tara', '', 5300, 0, { dom: 'sea' });
    s.join('p:u', 'Uwe', '', 5400, 0, { dom: 'sea' });
    s.auth.handle('p:a', { k: 'chat', ch: 'sagen', text: 'Hallo Hafen', to: '' }, 1);
    expect(s.chats('p:b').some((m) => m.text === 'Hallo Hafen')).toBe(true);
    expect(s.chats('p:c').some((m) => m.text === 'Hallo Hafen')).toBe(false);
    expect(s.chats('p:a').some((m) => m.text === 'Hallo Hafen')).toBe(true);
    s.auth.handle('p:s', { k: 'chat', ch: 'sagen', text: 'Schiff ahoi', to: '' }, 1);
    expect(s.chats('p:t').some((m) => m.text === 'Schiff ahoi')).toBe(true);
    expect(s.chats('p:u').some((m) => m.text === 'Schiff ahoi')).toBe(false);
    s.auth.handle('p:a', { k: 'chat', ch: 'welt', text: 'An alle', to: '' }, 2);
    for (const id of ['p:b', 'p:c', 'p:s', 'p:t', 'p:u']) expect(s.chats(id).some((m) => m.ch === 'welt' && m.text === 'An alle')).toBe(true);
  });

  it('Gruppe nur für die Gruppe; Flüstern nur an den Empfänger (Echo an den Sender); Spam-Schutz', () => {
    const s = shard([], []);
    s.join('p:a', 'Anna'); s.join('p:b', 'Bodo'); s.join('p:c', 'Cora Wellenbrand');
    s.auth.handle('p:a', { k: 'chat', ch: 'gruppe', text: 'allein', to: '' }, 1);
    expect(s.notices('p:a').some((t) => t.includes('keiner Gruppe'))).toBe(true);
    form(s, ['p:a', 'p:b']);
    s.auth.handle('p:a', { k: 'chat', ch: 'gruppe', text: 'Formation!', to: '' }, 2);
    expect(s.chats('p:b').some((m) => m.ch === 'gruppe' && m.text === 'Formation!')).toBe(true);
    expect(s.chats('p:c').some((m) => m.text === 'Formation!')).toBe(false);
    s.auth.handle('p:a', { k: 'chat', ch: 'fluestern', text: 'Psst', to: 'wellenbrand' }, 3);
    const w = s.chats('p:c').find((m) => m.ch === 'fluestern');
    expect(w).toMatchObject({ from: 'p:a', name: 'Anna', to: 'p:c', toName: 'Cora Wellenbrand', text: 'Psst' });
    expect(s.chats('p:a').some((m) => m.ch === 'fluestern' && m.to === 'p:c')).toBe(true);
    expect(s.chats('p:b').some((m) => m.ch === 'fluestern')).toBe(false);
    s.auth.handle('p:a', { k: 'chat', ch: 'fluestern', text: 'Hallo?', to: 'Niemand' }, 3);
    expect(s.notices('p:a').some((t) => t.includes('Kein Kapitän namens „Niemand“'))).toBe(true);
    for (let i = 0; i < 10; i++) s.auth.handle('p:b', { k: 'chat', ch: 'welt', text: `Spam ${i}`, to: '' }, 4 + i * 0.1);
    expect(s.chats('p:a').filter((m) => m.text.startsWith('Spam')).length).toBe(MMO.chatBurst);
    expect(s.notices('p:b').some((t) => t.includes('zu viele Nachrichten'))).toBe(true);
  });

  it('MmoClient: /r antwortet dem letzten Flüsterer; Taste R nur bei frischem Flüstern; /p ohne Gruppe bleibt lokal', () => {
    let now = 100;
    const sent: ClientIntent[] = [];
    const tr = fakeTransport(sent, () => now);
    const c = new MmoClient(tr, 'p:me', () => profile('p:me', 'Ich'), (o) => o, {}, () => now);
    c.start();
    c.handle({ k: 'welcome', id: 'p:me', shard: 'Test', t: now });
    c.handle({ k: 'chat', msg: { ch: 'fluestern', from: 'bot:ragna', name: 'Ragna Sturmhut', to: 'p:me', toName: 'Ich', text: 'Moin!', t: now } });
    expect(c.canQuickReply()).toBe(true);
    c.submit('/r Ahoi zurück');
    expect(sent.pop()).toEqual({ k: 'chat', ch: 'fluestern', text: 'Ahoi zurück', to: 'bot:ragna' });
    expect(c.sticky).toEqual({ ch: 'fluestern', to: 'Ragna Sturmhut' });
    now += MMO.replyWindow + 1;
    expect(c.canQuickReply()).toBe(false);
    c.submit('/w Ragna Noch was');
    expect(sent.pop()).toEqual({ k: 'chat', ch: 'fluestern', text: 'Noch was', to: 'bot:ragna' });
    const n = sent.length;
    c.submit('/p Hallo Gruppe');
    expect(sent.length).toBe(n);
    expect(c.chat.all().some((l) => l.ch === 'system' && l.text.includes('keiner Gruppe'))).toBe(true);
    c.submit('/einladen Ragna');
    expect(sent.pop()).toEqual({ k: 'invite', to: 'bot:ragna' });
    c.submit('/hilfe');
    expect(c.chat.all().filter((l) => l.ch === 'system').length).toBeGreaterThan(5);
  });

  it('Chat-Verlauf als Ringpuffer; Präfixe je Kanal', () => {
    const log = new ChatLog(3);
    for (let i = 0; i < 5; i++) log.push({ ch: 'welt', from: 'a', name: 'A', to: '', toName: '', text: `${i}`, t: i }, false);
    expect(log.all().map((l) => l.text)).toEqual(['2', '3', '4']);
    expect(log.since(4, []).map((l) => l.text)).toEqual(['4']);
    expect(linePrefix({ ch: 'welt', name: 'Ragna', toName: '', mine: false })).toBe('[Welt] Ragna: ');
    expect(linePrefix({ ch: 'gruppe', name: 'Ragna', toName: '', mine: false })).toBe('[Gruppe] Ragna: ');
    expect(linePrefix({ ch: 'fluestern', name: 'Ragna', toName: '', mine: false })).toBe('Ragna flüstert: ');
    expect(linePrefix({ ch: 'fluestern', name: 'Ich', toName: 'Ragna', mine: true })).toBe('An Ragna: ');
    expect(linePrefix({ ch: 'sagen', name: 'Ragna', toName: '', mine: false })).toBe('Ragna sagt: ');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Rechtsklick-Menü und Betrachten
// ---------------------------------------------------------------------------------------------------------------

describe('4.8A Rechtsklick-Menü und Betrachten', () => {
  const base: PlayerMenuCtx = { self: false, targetName: 'Ragna', stance: 'neutral', partySize: 0, leader: false, member: false, canTarget: true, rideable: false, riding: false };
  const ids = (c: PlayerMenuCtx) => buildPlayerMenu(c).map((i) => i.id);

  it('Einladen bei Gleicher Nation / Bündnis / Neutral aktiv, bei Krieg gesperrt mit Hinweis', () => {
    for (const st of ['gleich', 'buendnis', 'neutral', 'handelspakt'] as const) {
      const inv = buildPlayerMenu({ ...base, stance: st })[0];
      expect(inv).toMatchObject({ id: 'invite', label: 'In Gruppe einladen', enabled: true });
    }
    const war = buildPlayerMenu({ ...base, stance: 'krieg' })[0];
    expect(war.label).toBe('In Gruppe einladen — Gesperrt (Kriegszustand)');
    expect(war.enabled).toBe(false);
    expect(war.hint).toBe('Diplomatie: Krieg');
    expect(ids(base)).toEqual(['invite', 'whisper', 'inspect', 'target']);
    expect(buildPlayerMenu({ ...base, partySize: 5, leader: true })[0]).toMatchObject({ enabled: false, hint: 'Gruppe voll (5/5)' });
    expect(buildPlayerMenu({ ...base, partySize: 3, leader: false })[0]).toMatchObject({ enabled: false, hint: 'Nur der Anführer lädt ein' });
    expect(buildPlayerMenu({ ...base, canTarget: false }).find((i) => i.id === 'target')).toMatchObject({ enabled: false, hint: 'Außer Reichweite' });
  });

  it('Als Anführer: ernennen und entfernen; Mitfahren beim Anführer; eigener Charakter: Gruppe verlassen', () => {
    expect(ids({ ...base, partySize: 3, leader: true, member: true })).toEqual(['invite', 'whisper', 'inspect', 'target', 'promote', 'kick']);
    expect(buildPlayerMenu({ ...base, partySize: 3, leader: true, member: true }).find((i) => i.id === 'kick')?.danger).toBe(true);
    expect(ids({ ...base, partySize: 2, member: true, rideable: true })).toContain('ride');
    expect(ids({ ...base, partySize: 2, member: true, rideable: true, riding: true })).not.toContain('ride');
    expect(buildPlayerMenu({ ...base, self: true, partySize: 2 })).toEqual([expect.objectContaining({ id: 'leave', enabled: true })]);
    expect(buildPlayerMenu({ ...base, self: true, partySize: 0 })[0]).toMatchObject({ id: 'leave', enabled: false, hint: 'Du bist in keiner Gruppe' });
    expect(ids({ ...base, self: true, partySize: 2, riding: true })).toEqual(['leave', 'unride']);
  });

  it('Betrachten zeigt Name, Stufe, Klasse & Rolle, Team, Diplomatie, Ausrüstungs- und Schiffs-Stufe', () => {
    const s = shard();
    s.join('p:a', 'Anna', 'england', 0, 0);
    s.auth.join(profile('p:b', 'Maren Ashford', 'frankreich', { level: 22, spec: 'priester', role: 'DPS/Heal', classLabel: 'Faji-Wirker · Priester', gearTier: 3, shipTier: 3, shipName: 'Morgenlicht' }), state(30, 40, { zone: 'Ankerglück' }), 0);
    s.auth.handle('p:a', { k: 'inspect', id: 'p:b' }, 1);
    const msg = s.box('p:a').find((m) => m.k === 'inspect') as Extract<ServerMsg, { k: 'inspect' }>;
    expect(msg.info).toMatchObject({ stance: 'krieg', zone: 'Ankerglück', dist: 50, party: false });
    const v = inspectView(msg.info, (t) => ({ name: t === 'frankreich' ? 'Frankreich' : t, color: '#2F5FB0' }));
    expect(v).toMatchObject({
      name: 'Maren Ashford', levelText: 'Stufe 22', classText: 'Faji-Wirker · Priester', roleTag: 'DPS/Heal', teamName: 'Team Frankreich', teamColor: '#2F5FB0',
      stanceText: 'Diplomatie: Krieg', stanceTone: 'hostile', gearText: 'Ausrüstung: Stufe 3 · Meisterhaft', shipText: 'Schiff: Morgenlicht · Klasse 4',
    });
    expect(v.whereText).toBe('Ankerglück · 50 m entfernt');
  });

  it('Oberfläche: Rechtsklick auf Welt, Schiff, Zielfenster, Chat-Namen und Gruppenfenster öffnet das Menü', () => {
    const game = readFileSync('src/core/game.ts', 'utf8');
    expect(game).toMatch(/e\.button === 2\) this\.rightDown/);
    expect(game).toMatch(/private rightClickWorld\(x: number, y: number\)[\s\S]{0,400}peekAt\(x, y, innerWidth, innerHeight, \(t\) => t\.kind === 'player'/);
    expect(game).toMatch(/c\.kind === 'ship' \? \(\(c\.ref as EnemyShip \| null\)\?\.peer\?\.mmo/);
    expect(game).toMatch(/this\.targetFrame\.el\.addEventListener\('contextmenu'/);
    expect(game).toMatch(/this\.partyUi\.onMenu = \(id, x, y\) => this\.openPlayerMenu\(id, x, y\)/);
    expect(game).toMatch(/onName: \(id, name, x, y, menu\) => \{ if \(menu\) this\.openPlayerMenu/);
    const chat = readFileSync('src/ui/chatWindow.ts', 'utf8');
    // Texte der Mitspieler nur als Textknoten (kein HTML aus dem Netz)
    expect(chat).toMatch(/p\.append\(l\.text\)/);
    expect(chat).not.toMatch(/innerHTML = [^'"`]*l\.text/);
    // Taste R nur bei frischem Flüstern, keine anstehende Handlung, kein Eingabefeld
    expect(chat).toMatch(/e\.code === 'KeyR' && !e\.shiftKey && !this\.opts\.busyKey\(\)/);
    expect(chat).toMatch(/t\.tagName === 'INPUT' \|\| t\.tagName === 'TEXTAREA'/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Mitfahrt an Deck
// ---------------------------------------------------------------------------------------------------------------

describe('4.8A Gemeinsames Segeln: Mitfahrt an Deck des Anführer-Schiffs', () => {
  it('relative Deck-Lage → Welt und zurück (wie DeckGround.world), Plätze an Deck', () => {
    const ship = { x: 120, z: -40, heading: 0.7 };
    const w = rideToWorld(ship, 2.1, 1.5, 0.3, -4, { x: 0, y: 0, z: 0 });
    expect(w.y).toBeCloseTo(2.4, 6);
    const back = worldToRide(ship, w.x, w.z, { x: 0, z: 0 });
    expect(back.x).toBeCloseTo(1.5, 6);
    expect(back.z).toBeCloseTo(-4, 6);
    // Bug voraus: lokal +z liegt in Kursrichtung
    const fwd = rideToWorld({ x: 0, z: 0, heading: Math.PI / 2 }, 0, 0, 0, 10, { x: 0, y: 0, z: 0 });
    expect(fwd.x).toBeCloseTo(10, 6);
    for (let i = 0; i < 4; i++) {
      const sl = rideSlot(i, 18, 5.8, { x: 0, z: 0 });
      expect(rideValid(sl.x, 0, sl.z, 18, 5.8)).toBe(true);
    }
    expect(rideValid(20, 0, 0)).toBe(false);
    expect(rideValid(0, 0, RIDE_BOUNDS.z + 1)).toBe(false);
    expect(rideValid(Number.NaN, 0, 0)).toBe(false);
  });

  it('Shard: nur Gruppenmitglieder, nur beim Anführer, nur in Reichweite und an Deck; Fremd-Mitfahrt wird verworfen', () => {
    const s = shard([], []);
    s.join('p:lead', 'Anführerin', '', 0, 0, { dom: 'sea' });
    s.join('p:m', 'Matrose', '', 60, 0, { dom: 'sea' });
    s.join('p:x', 'Fremd', '', 40, 0, { dom: 'sea' });
    s.join('p:far', 'Weit', '', 900, 0, { dom: 'sea' });
    const ride = (id: string) => (s.box(id).filter((m) => m.k === 'ride').pop() as Extract<ServerMsg, { k: 'ride' }> | undefined);
    s.auth.handle('p:x', { k: 'ride', ship: 'p:lead', rx: 1, ry: 0, rz: -2 }, 1);
    expect(ride('p:x')).toMatchObject({ ok: false });
    form(s, ['p:lead', 'p:m', 'p:far']);
    s.auth.handle('p:far', { k: 'ride', ship: 'p:lead', rx: 1, ry: 0, rz: -2 }, 2);
    expect(ride('p:far')?.text).toContain('Zu weit');
    s.auth.handle('p:m', { k: 'ride', ship: 'p:lead', rx: 30, ry: 0, rz: -2 }, 2);
    expect(ride('p:m')?.text).toContain('nicht an Deck');
    s.auth.handle('p:lead', { k: 'ride', ship: 'p:m', rx: 1, ry: 0, rz: -2 }, 2);
    expect(ride('p:lead')?.text).toContain('Anführers');
    s.auth.handle('p:m', { k: 'ride', ship: 'p:lead', rx: 1.2, ry: 0, rz: -2.5 }, 3);
    expect(ride('p:m')).toMatchObject({ ok: true, ship: 'p:lead' });
    expect(s.notices('p:lead').some((t) => t.includes('kommt an Bord'))).toBe(true);
    // im Schnappschuss fährt der Matrose relativ zum Anführer-Schiff mit
    for (let t = 3; t < 3.2; t += 0.06) s.auth.tick(t);
    const snap = s.box('p:x').filter((m) => m.k === 'snap').pop() as Extract<ServerMsg, { k: 'snap' }>;
    expect(snap.list.find((e) => e.id === 'p:m')).toMatchObject({ ride: 'p:lead', rx: 1.2, rz: -2.5 });
    // ein Zustand, der eine nicht erlaubte Mitfahrt behauptet, wird verworfen
    s.auth.handle('p:x', { k: 'state', s: state(40, 0, { dom: 'sea', ride: 'p:lead', rx: 1, rz: 1 }) }, 4);
    expect(s.auth.peers.get('p:x')!.state.ride).toBe('');
    // verlässt der Anführer die Gruppe, gehen die Mitfahrer von Bord
    s.auth.handle('p:lead', { k: 'leave' }, 5);
    expect(ride('p:m')).toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Schutzzonen und Spieler gegen Spieler
// ---------------------------------------------------------------------------------------------------------------

describe('4.8A Starter-Schutzzonen: Ankerglück und die Hauptstadt-Häfen ohne Spieler-PvP', () => {
  it('Zonen: Ankerglück und die fünf Hauptstädte mit Hafenwasser', () => {
    const z = safeZones();
    expect(z.map((s) => s.id).sort()).toEqual(['adlerstein', 'albion', 'ankerglueck', 'oranjehaven', 'soleilmont', 'yamikura']);
    const ank = z.find((s) => s.id === 'ankerglueck')!;
    expect(ank.name).toBe('Ankerglück');
    expect(safeZoneAt(z, ank.x + ank.r - 1, ank.z)?.id).toBe('ankerglueck');
    expect(safeZoneAt(z, ank.x + ank.r + 1, ank.z)).toBeNull();
  });

  it('PvP nur bei Krieg, nie in der Gruppe, nie bei Verbündeten, nie in einer Schutzzone', () => {
    expect(pvpBlock({ stance: 'krieg', sameParty: false, safeA: '', safeB: '' })).toBe('');
    expect(pvpBlock({ stance: 'krieg', sameParty: false, safeA: 'Ankerglück', safeB: '' })).toContain('Schutzzone Ankerglück');
    expect(pvpBlock({ stance: 'krieg', sameParty: true, safeA: '', safeB: '' })).toContain('eigene Gruppe');
    expect(pvpBlock({ stance: 'buendnis', sameParty: false, safeA: '', safeB: '' })).toContain('Verbündete');
    expect(pvpBlock({ stance: 'neutral', sameParty: false, safeA: '', safeB: '' })).toContain('Kein Krieg');
    const s = shard();
    s.join('p:en', 'Edwina', 'england', 3000, 3000, { dom: 'sea' });
    s.join('p:fr', 'Aurélie', 'frankreich', 3200, 3000, { dom: 'sea' });
    s.join('p:fr2', 'Gaspard', 'frankreich', 0, 200, { dom: 'sea' });
    s.join('p:en2', 'Archie', 'england', 100, 200, { dom: 'sea' });
    s.auth.handle('p:en', { k: 'hit', to: 'p:fr', dmg: 40 }, 1);
    expect(s.box('p:fr').some((m) => m.k === 'hit' && m.dmg === 40)).toBe(true);
    s.auth.handle('p:en2', { k: 'hit', to: 'p:fr2', dmg: 40 }, 1);
    expect(s.box('p:fr2').some((m) => m.k === 'hit')).toBe(false);
    expect(s.notices('p:en2').some((t) => t.includes('Schutzzone Ankerglück'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Interessenbereich und Interpolation
// ---------------------------------------------------------------------------------------------------------------

describe('4.8A Interessenbereich und Schnappschuss-Interpolation', () => {
  it('Schnappschuss enthält nur Spieler im Interessenbereich; Steckbriefe nur beim ersten Mal', () => {
    const s = shard([], []);
    s.join('p:me', 'Ich', '', 0, 0);
    s.join('p:near', 'Nah', '', 590, 0);
    s.join('p:far', 'Fern', '', 610, 0);
    s.join('p:ship', 'Schiff', '', 2300, 0, { dom: 'sea' });
    s.join('p:gone', 'Weg', '', 2500, 0, { dom: 'sea' });
    for (let t = 0; t < 0.2; t += 0.06) s.auth.tick(t);
    const snap = s.box('p:me').filter((m) => m.k === 'snap').pop() as Extract<ServerMsg, { k: 'snap' }>;
    expect(snap.list.map((e) => e.id).sort()).toEqual(['p:near', 'p:ship']);
    const profiles = s.box('p:me').filter((m) => m.k === 'profiles');
    expect(profiles.length).toBe(1);
    expect((profiles[0] as Extract<ServerMsg, { k: 'profiles' }>).list.map((p) => p.name).sort()).toEqual(['Nah', 'Schiff']);
    // Stufenaufstieg: Steckbrief neu
    s.auth.handle('p:near', { k: 'profile', profile: profile('p:near', 'Nah', '', { level: 13 }) }, 1);
    for (let t = 1; t < 1.2; t += 0.06) s.auth.tick(t);
    expect(s.box('p:me').filter((m) => m.k === 'profiles').length).toBe(2);
  });

  it('Ringpuffer: Interpolation, kürzerer Bogen, verworfene alte Pakete, begrenzte Fortschreibung', () => {
    const b = new SnapshotBuffer(4);
    const o = newInterpOut();
    expect(b.sample(0, o)).toBe(false);
    b.push(1, 0, 0, 0, 3.0, 0, 2);
    b.push(2, 10, 0, 20, -3.0, 0, 4);
    expect(b.push(1.5, 99, 0, 99, 0, 0, 0)).toBe(false);
    b.sample(1.5, o);
    expect(o.x).toBeCloseTo(5, 6);
    expect(o.z).toBeCloseTo(10, 6);
    expect(Math.abs(o.yaw)).toBeGreaterThan(3.0);
    expect(o.spd).toBeCloseTo(3, 6);
    b.sample(5, o);
    expect(o.x).toBeCloseTo(10 + 10 * 0.25, 6);
    for (let i = 3; i < 10; i++) b.push(i, i, 0, 0, 0, 0, 0);
    expect(b.count).toBe(4);
    b.sample(0, o);
    expect(o.x).toBe(6);
  });

  it('MmoClient führt Mitspieler aus Schnappschüssen mit Verzug (15 – 20 Hz)', () => {
    let now = 50;
    const tr = fakeTransport([], () => now);
    const c = new MmoClient(tr, 'p:me', () => profile('p:me', 'Ich'), (o) => o, {}, () => now);
    c.start();
    c.handle({ k: 'profiles', list: [{ ...profile('p:a', 'Anna', 'england'), pv: 1 }] });
    for (let i = 0; i < 6; i++) {
      const e = Object.assign(state(i * 1, 0), { id: 'p:a', pv: 1, yaw: 0, spd: 18 });
      c.handle({ k: 'snap', t: 50 + i / 18, seq: i + 1, list: [e] });
    }
    const r = c.remotes.get('p:a')!;
    expect(r.profile.name).toBe('Anna');
    now = 50 + 5 / 18;
    const v = c.sample(r, now);
    expect(v.x).toBeGreaterThan(2.5);
    expect(v.x).toBeLessThan(5);
    c.handle({ k: 'snap', t: 51, seq: 7, list: [] });
    expect(r.live).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------------------------------------------

/** Kanal-Bus wie BroadcastChannel (an alle anderen, als Kopie, verzögert bis `flush`) */
class Bus {
  readonly chans: BusChan[] = [];
  readonly queue: (() => void)[] = [];
  flush() { for (let i = 0; i < 50 && this.queue.length; i++) { const q = this.queue.splice(0); for (const f of q) f(); } }
}
class BusChan implements ChannelLike {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(private readonly bus: Bus) { bus.chans.push(this); }
  postMessage(m: unknown) { const data = structuredClone(m); for (const c of this.bus.chans) if (c !== this) this.bus.queue.push(() => c.onmessage?.({ data })); }
  close() { const i = this.bus.chans.indexOf(this); if (i >= 0) this.bus.chans.splice(i, 1); }
}
function fakeTimers() {
  const fns: (() => void)[] = [];
  const timers: Timers = { every: (_ms, fn) => { fns.push(fn); return () => { const i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); }; } };
  return { timers, tick: () => { for (const f of [...fns]) f(); } };
}
function fakeTransport(sent: ClientIntent[], now: () => number): MmoTransport {
  return {
    kind: 'local', status: 'online' as TransportStatus, latency: 0, host: true, onMessage: null, onStatus: null,
    connect: () => {}, send: (i) => { sent.push(structuredClone(i)); }, now, close: () => {},
  };
}
const hello = (id: string, name: string, team = '', x = 0, z = 0) => ({ k: 'hello' as const, v: MMO_PROTOCOL, profile: profile(id, name, team), state: state(x, z) });

describe('4.8A Transporte: lokaler Shard über BroadcastChannel und WebSocket-Server', () => {
  it('Lokaler Shard: der älteste Tab leitet, Absichten und Chat laufen zwischen Tabs, beim Schließen übernimmt der nächste', () => {
    const bus = new Bus();
    let now = 1000;
    const clock = () => now;
    const { oracle } = diplomacy([], []);
    const mk = (id: string) => {
      const t = fakeTimers();
      const tr = new LocalShardMmoTransport({ id, channel: () => new BusChan(bus), clock, timers: t.timers, diplomacy: oracle, zones, botWorld: null });
      const got: ServerMsg[] = [];
      tr.onMessage = (m) => got.push(structuredClone(m));
      return { tr, t, got };
    };
    const A = mk('p:a');
    A.tr.connect(hello('p:a', 'Anna'));
    now += 0.4;
    const B = mk('p:b');
    B.tr.connect(hello('p:b', 'Bodo', '', 10, 0));
    for (let i = 0; i < 40; i++) { now += 0.05; A.t.tick(); B.t.tick(); bus.flush(); }
    expect(A.tr.host).toBe(true);
    expect(B.tr.host).toBe(false);
    expect(A.tr.status).toBe('online');
    expect(B.tr.status).toBe('online');
    expect(A.tr.authority?.peers.size).toBe(2);
    B.tr.send({ k: 'chat', ch: 'welt', text: 'Hallo aus Tab B', to: '' });
    bus.flush();
    expect(A.got.some((m) => m.k === 'chat' && m.msg.text === 'Hallo aus Tab B')).toBe(true);
    expect(B.got.some((m) => m.k === 'chat' && m.msg.text === 'Hallo aus Tab B')).toBe(true);
    // Schnappschüsse über den Kanal
    expect(B.got.some((m) => m.k === 'snap' && m.list.some((e) => e.id === 'p:a'))).toBe(true);
    // Gruppe über Tabs hinweg
    B.tr.send({ k: 'invite', to: 'Anna' });
    bus.flush();
    const inv = A.got.find((m) => m.k === 'party' && m.ev.e === 'invite');
    expect(inv).toBeTruthy();
    if (inv?.k === 'party' && inv.ev.e === 'invite') A.tr.send({ k: 'reply', party: inv.ev.party, accept: true });
    bus.flush();
    expect(B.got.some((m) => m.k === 'party' && m.ev.e === 'state' && m.ev.party?.members.length === 2)).toBe(true);
    // A schließt: B leitet jetzt selbst
    A.tr.close();
    bus.flush();
    for (let i = 0; i < 10; i++) { now += 0.05; B.t.tick(); bus.flush(); }
    expect(B.tr.host).toBe(true);
    expect(B.tr.authority?.peers.has('p:b')).toBe(true);
    B.tr.close();
  });

  it('Ohne BroadcastChannel leitet der einzige Tab sofort selbst (mit MMO-Kapitänen)', () => {
    let now = 10;
    const { oracle } = diplomacy();
    const t = fakeTimers();
    const tr = new LocalShardMmoTransport({ id: 'p:solo', channel: () => null, clock: () => now, timers: t.timers, diplomacy: oracle, zones, botWorld: botWorld() });
    const got: ServerMsg[] = [];
    tr.onMessage = (m) => got.push(structuredClone(m));
    tr.connect(hello('p:solo', 'Solo', 'england', 0, 200));
    expect(tr.host).toBe(true);
    expect(tr.status).toBe('online');
    for (let i = 0; i < 6; i++) { now += 0.06; t.tick(); }
    expect(tr.authority!.peers.size).toBe(1 + SHARD_BOTS.length);
    const snap = got.filter((m) => m.k === 'snap').pop() as Extract<ServerMsg, { k: 'snap' }>;
    expect(snap.list.length).toBeGreaterThan(4);
    tr.close();
    expect(tr.status).toBe('offline');
  });

  it('Ruhende Spielschleife (Hintergrund-Tab): der leitende Tab hält seinen Kapitän, ein Client ohne Schnappschüsse meldet sich neu', () => {
    let now = 10;
    const t = fakeTimers();
    const tr = new LocalShardMmoTransport({ id: 'p:bg', channel: () => null, clock: () => now, timers: t.timers, diplomacy: diplomacy().oracle, zones, botWorld: null });
    tr.connect(hello('p:bg', 'Hinten'));
    for (let i = 0; i < 30 * 20; i++) { now += 0.05; t.tick(); }
    expect(tr.authority!.has('p:bg')).toBe(true);
    // fliegt er doch heraus (Wechsel der Leitung), nimmt ihn der nächste Takt wieder auf
    tr.authority!.leave('p:bg', now);
    now += 0.05; t.tick();
    expect(tr.authority!.has('p:bg')).toBe(true);
    tr.close();
    let c2 = 100;
    const sent: ClientIntent[] = [];
    const cl = new MmoClient(fakeTransport(sent, () => c2), 'p:c', () => profile('p:c', 'Client'), (o) => o, {}, () => c2);
    cl.start();
    cl.handle({ k: 'snap', t: c2, seq: 1, list: [] });
    c2 += 5; cl.update(0.016);
    expect(sent.some((i) => i.k === 'hello')).toBe(false);
    c2 += 4; cl.update(0.016);
    expect(sent.filter((i) => i.k === 'hello').length).toBe(1);
  });

  it('WebSocket: Hallo beim Öffnen, Warteschlange, Herzschlag mit Latenz, Wiederverbinden mit wachsender Pause, Zeitüberschreitung', () => {
    let now = 0;
    const socks: FakeSocket[] = [];
    const t = fakeTimers();
    const tr = new WebSocketMmoTransport({ url: 'wss://shard.test/mmo', socket: () => { const s = new FakeSocket(); socks.push(s); return s; }, clock: () => now, timers: t.timers });
    const got: ServerMsg[] = [];
    tr.onMessage = (m) => got.push(m);
    tr.connect(hello('p:ws', 'Netz'));
    expect(tr.status).toBe('connecting');
    tr.send({ k: 'chat', ch: 'welt', text: 'vor dem Öffnen', to: '' });
    tr.send({ k: 'state', s: state(1, 2) });
    socks[0].open();
    expect(tr.status).toBe('online');
    expect(JSON.parse(socks[0].sent[0]).k).toBe('hello');
    expect(socks[0].sent.map((x) => JSON.parse(x).k)).toEqual(['hello', 'chat']);
    socks[0].recv({ k: 'welcome', id: 'p:ws', shard: 'Server 1', t: 100 });
    expect(got[0]).toMatchObject({ k: 'welcome', shard: 'Server 1' });
    now = 6; t.tick();
    const ping = JSON.parse(socks[0].sent.pop()!);
    expect(ping.k).toBe('ping');
    now = 6.08;
    socks[0].recv({ k: 'pong', t: ping.t, st: 500 });
    expect(tr.latency).toBeGreaterThan(0);
    expect(tr.now()).toBeGreaterThan(400);
    // Verbindung bricht ab: Wiederverbinden nach 1 s, dann 2 s
    socks[0].close();
    expect(tr.status).toBe('reconnecting');
    now = 6.5; t.tick();
    expect(socks.length).toBe(1);
    now = 7.2; t.tick();
    expect(socks.length).toBe(2);
    socks[1].close();
    now = 8.5; t.tick();
    expect(socks.length).toBe(2);
    now = 9.4; t.tick();
    expect(socks.length).toBe(3);
    socks[2].open();
    // Zeitüberschreitung ohne Lebenszeichen
    now = 9.4 + MMO.timeout + 1; t.tick();
    expect(tr.status).toBe('reconnecting');
    tr.close();
    expect(tr.status).toBe('offline');
    // Fabrik: ohne Adresse lokal, mit Adresse WebSocket
    const local = createMmoTransport('', { id: 'p:f', diplomacy: diplomacy().oracle, zones, channel: () => null, timers: fakeTimers().timers });
    expect(local.kind).toBe('local');
    expect(createMmoTransport('wss://x.test', { id: 'p:f', diplomacy: diplomacy().oracle, zones }).kind).toBe('websocket');
  });
});

class FakeSocket implements SocketLike {
  readyState = 0;
  readonly sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send(d: string) { this.sent.push(d); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({}); }
  open() { this.readyState = 1; this.onopen?.({}); }
  recv(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
}

// ---------------------------------------------------------------------------------------------------------------
// Kapitäne des lokalen Shards
// ---------------------------------------------------------------------------------------------------------------

function botWorld(): BotWorld {
  const pts: { x: number; z: number }[] = [];
  for (let i = 0; i < 12; i++) pts.push({ x: Math.sin(i) * 40, z: 160 + Math.cos(i) * 40 });
  return {
    home: () => ({ x: 0, z: 160, r: 78 }),
    townPoints: () => pts,
    constrain: (x, z, out) => { out.x = x; out.z = z; },
    seaFree: () => true,
    zoneAt: (_x, _z, sea) => (sea ? 'Bernsteinsee' : 'Ankerglück'),
  };
}

describe('4.8A MMO-Kapitäne verschiedener Nationen in der geteilten Welt', () => {
  it('Kapitäne aller fünf Mächte und Ungebundene, zu Fuß in Ankerglück und mit Schiffen vor dem Hafen', () => {
    const c = rosterCounts();
    expect(c.teams).toBe(6);
    expect(c.land).toBeLessThanOrEqual(MMO.rigPool);
    expect(c.sea).toBeGreaterThanOrEqual(4);
    const names = new Set(SHARD_BOTS.map((b) => b.name));
    expect(names.size).toBe(SHARD_BOTS.length);
    for (const b of SHARD_BOTS) expect(b.lines.length).toBeGreaterThan(0);
  });

  it('Kapitäne nehmen erlaubte Einladungen an, Beschäftigte lehnen ab, verfeindete werden gar nicht erst eingeladen', () => {
    const s = shard();
    const bots = new ShardBots(s.auth, botWorld(), 7);
    bots.spawn(0);
    s.join('p:me', 'Ich', 'england', 0, 170);
    s.auth.handle('p:me', { k: 'invite', to: 'Maren Ashford' }, 1);
    for (let t = 1; t < 5; t += 0.05) tickAll(s.auth, t, bots);
    expect(s.auth.partyOf('p:me')?.members.map((m) => m.name)).toEqual(['Ich', 'Maren Ashford']);
    s.auth.handle('p:me', { k: 'invite', to: 'Bent Teerhand' }, 5);
    for (let t = 5; t < 9; t += 0.05) tickAll(s.auth, t, bots);
    expect(s.box('p:me').some((m) => m.k === 'party' && m.ev.e === 'declined' && m.ev.name === 'Bent Teerhand')).toBe(true);
    s.auth.handle('p:me', { k: 'invite', to: 'Aurélie Brisant' }, 9);
    expect(s.notices('p:me').some((t) => t.includes('Kriegszustand'))).toBe(true);
    // in der Gruppe folgt die Kapitänin zu Fuß
    const st = s.auth.peers.get('p:me')!.state;
    st.x = 30; st.z = 200;
    for (let t = 9; t < 26; t += 0.05) tickAll(s.auth, t, bots);
    const m = s.auth.peers.get('bot:maren')!.state;
    expect(Math.hypot(m.x - 30, m.z - 200)).toBeLessThan(8);
    // geht der Mensch an Bord seines Schiffs (Anführer), fährt sie an Deck mit
    st.dom = 'sea'; st.x = 300; st.z = 600;
    for (let t = 26; t < 27; t += 0.05) tickAll(s.auth, t, bots);
    expect(m.ride).toBe('p:me');
    expect(m.dom).toBe('sea');
  });

  it('Flüstern beantworten sie; „lad mich ein“ bringt eine Einladung; Heilung wirkt auf ihr Leben', () => {
    const s = shard();
    const bots = new ShardBots(s.auth, botWorld(), 3);
    bots.spawn(0);
    s.join('p:me', 'Ich', '', 0, 170);
    s.auth.handle('p:me', { k: 'chat', ch: 'fluestern', text: 'Hallo!', to: 'Ragna Sturmhut' }, 1);
    s.auth.handle('p:me', { k: 'chat', ch: 'fluestern', text: 'Kannst du mich in die Gruppe einladen?', to: 'Femke' }, 1);
    for (let t = 1; t < 5; t += 0.05) tickAll(s.auth, t, bots);
    const ws = s.chats('p:me').filter((m) => m.ch === 'fluestern' && m.to === 'p:me');
    expect(ws.some((m) => m.name === 'Ragna Sturmhut')).toBe(true);
    expect(ws.some((m) => m.name === 'Femke van Dijkstra' && m.text.includes('Gruppe'))).toBe(true);
    expect(s.box('p:me').some((m) => m.k === 'party' && m.ev.e === 'invite' && m.ev.name === 'Femke van Dijkstra')).toBe(true);
    const femke = s.auth.peers.get('bot:femke')!.state;
    expect(femke.hp).toBeLessThan(femke.mhp);
    s.auth.handle('p:me', { k: 'invite', to: 'bot:lene' }, 5);
    for (let t = 5; t < 9; t += 0.05) tickAll(s.auth, t, bots);
    expect(s.auth.partyOf('p:me')?.members.map((m) => m.id)).toEqual(['p:me', 'bot:lene']);
    femke.x = 2; femke.z = 172;
    const before = femke.hp;
    s.auth.handle('p:me', { k: 'heal', to: 'bot:femke', frac: 0.2 }, 6);
    // neutral und nicht in der Gruppe: keine Heilung
    expect(femke.hp).toBe(before);
    const lene = s.auth.peers.get('bot:lene')!.state;
    lene.x = 3; lene.z = 171;
    const lb = lene.hp;
    s.auth.handle('p:me', { k: 'heal', to: 'bot:lene', frac: 0.2 }, 6);
    expect(lene.hp).toBeGreaterThan(lb);
  });

  it('Leistung: Shard-Takt mit zwölf Kapitänen und drei Menschen bleibt im Mittel unter 1 ms', () => {
    const auth = new MmoAuthority(diplomacy().oracle, zones, () => {});
    const b2 = new ShardBots(auth, botWorld(), 9);
    b2.spawn(0);
    for (const [id, x] of [['p:a', 0], ['p:b', 20], ['p:c', 400]] as const) auth.join(profile(id, id), state(x, 170), 0);
    let t = 0;
    for (let i = 0; i < 120; i++) { t += 0.05; tickAll(auth, t, b2); }
    const t0 = performance.now();
    const N = 600;
    for (let i = 0; i < N; i++) { t += 0.05; tickAll(auth, t, b2); }
    const mean = (performance.now() - t0) / N;
    expect(mean).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Einbindung ins Spiel (Quelltext)
// ---------------------------------------------------------------------------------------------------------------

describe('4.8A Einbindung: Mitspieler ohne neue Shader, Peer-Schiffe nach Schnappschüssen, kein Eigenbeschuss', () => {
  it('Mitspieler-Schiffe fahren nach dem Shard, Treffer gehen an den Shard, Freunde bleiben unverwundbar', () => {
    const naval = readFileSync('src/naval/naval.ts', 'utf8');
    expect(naval).toMatch(/if \(e\.peer\?\.mmo\) \{ e\.state = 'patrol'; return; \}/);
    expect(naval).toMatch(/playerMayHarm\(e: EnemyShip\): boolean \{ return e\.peer\?\.mmo \? !!e\.peer\.harm/);
    expect(naval).toMatch(/if \(peerEn\) this\.hooks\.peerHit\?\.\(peerEn, base\)/);
    expect(naval).toMatch(/cataclysmFriendly\(e\) \|\| e\.peer\?\.mmo\) return ''/);
  });

  it('Figuren-Pool vorab angelegt (keine neuen Programme), Interessenbereich und Zeichenabstand begrenzt', () => {
    const live = readFileSync('src/world/mmoLive.ts', 'utf8');
    expect(live).toMatch(/if \(this\.rigs\.length >= MMO\.rigPool\) return;/);
    expect(live).toMatch(/count >= MMO\.shipPool/);
    expect(live).toMatch(/const show = Math\.min\(MMO\.rigShow, this\.host\.figureDist\(\)\)/);
    expect(live).toMatch(/slot\?\.e \? MMO\.shipHide : MMO\.shipShow/);
    const sea2 = readFileSync('src/world/seaWorld.ts', 'utf8');
    // Figuren-Budget: sichtbare MMO-Kapitäne ersetzen anonyme Stadtbewohner
    expect(sea2).toMatch(/let swap = this\.mmoLive\?\.stats\.shown \?\? 0;/);
    expect(live).not.toMatch(/new (MeshStandardMaterial|ShaderMaterial|MeshBasicMaterial)\(/);
    const sea = readFileSync('src/world/seaWorld.ts', 'utf8');
    expect(sea).toMatch(/if \(this\.mmoLive\) \{ this\.mmoLive\.update\(dt\); this\.carryRider\(\); \}/);
    const game = readFileSync('src/core/game.ts', 'utf8');
    // 4.8.1: die Adresse kommt aus `serverChoice` (?server= > gemerkt > VITE_MMO_SERVER_URL)
    expect(game).toMatch(/serverChoice\(\)\.url/);
    expect(readFileSync('src/net/serverUrl.ts', 'utf8')).toMatch(/import\.meta\.env\?\.VITE_MMO_SERVER_URL/);
    expect(game).toMatch(/this\.mmoTick\(dt\);/);
  });
});
