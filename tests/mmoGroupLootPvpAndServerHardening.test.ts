// Phase 4.8B – Gruppen-Beute mit Würfeln („Bedarf / Gier / Passen“), Aussehen über das Netz, Land-PvP zwischen Nationen im Krieg,
// 1 – 5-Spieler-Skalierung von Kaisern und Weltbossen und ein gehärteter Relay-Server (`/health`, Diplomatie im Server-Speicher,
// autoritative Würfel). Der Server läuft im letzten Block als echter Prozess auf einem eigenen, freien Port (nie 8787).
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  APP_BOOL_KEYS, APP_COLOR_KEYS, APP_ENUM_KEYS, MMO, cleanAppearance, cleanIntent, cleanLootItem, cleanProfile, cleanServerMsg, newPlayerState, newProfile,
  type LootItemNet, type PlayerProfile, type PlayerState, type ServerMsg,
} from '../src/net/mmoProtocol';
import {
  NOT_FOR_CLASS, SHIP_TOO_SMALL, affinityOf, botChoice, chooseRoll, createRoll, gradeOf, needBlock, passOpen, resolveRoll, rollChatLines, rollReady, rollsFor, splitEven,
  type RollEntry,
} from '../src/net/groupLoot';
import { MmoAuthority, type ZoneOracle } from '../src/net/mmoAuthority';
import { safeZoneAt, stanceOf } from '../src/net/partyRules';
import { GROUP_RAID, PVP_LAND, groupBonusRarities, groupElites, groupLootK, groupScale, pvpLandDamage } from '../src/data/balanceConfig';
import { defaultLook } from '../src/data/characterParts';
import type { DiplomacyState } from '../src/data/nations';

// ---------------------------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------------------------

/** fester Zufall: liefert die Werte der Reihe nach (danach 0,5) */
const seq = (vals: number[]) => { let i = 0; return () => (i < vals.length ? vals[i++] : 0.5); };

const ZONES = [{ id: 'ankerglueck', name: 'Ankerglück', x: 0, z: 160, r: 78 + 350 }];
const zones: ZoneOracle = { safeAt: (x, z) => safeZoneAt(ZONES, x, z)?.name ?? '' };

function profile(id: string, name: string, team = '', o: Partial<PlayerProfile> = {}): PlayerProfile {
  const p = newProfile(id);
  p.name = name; p.team = team; p.level = 40; p.base = 'schwert'; p.spec = 'saebel'; p.role = 'Kombo-DPS';
  return Object.assign(p, o);
}
function state(x: number, z: number, o: Partial<PlayerState> = {}): PlayerState {
  const s = newPlayerState();
  s.x = x; s.z = z; s.mhp = 1000; s.hp = 1000;
  return Object.assign(s, o);
}

function shard(war: string[][] = [['england', 'frankreich']], ally: string[][] = [['deutschland', 'niederlande']]) {
  const W = new Set(war.map((p) => [...p].sort().join('|'))), A = new Set(ally.map((p) => [...p].sort().join('|')));
  const st = (x: string, y: string): DiplomacyState => { const k = [x, y].sort().join('|'); return W.has(k) ? 'krieg' : A.has(k) ? 'allianz' : 'neutral'; };
  const inbox = new Map<string, ServerMsg[]>();
  const auth = new MmoAuthority({ stance: (a, b) => stanceOf(a, b, st) }, zones, (to, msg) => { const l = inbox.get(to) ?? []; l.push(structuredClone(msg)); inbox.set(to, l); });
  const box = (id: string) => inbox.get(id) ?? [];
  const of = <K extends ServerMsg['k']>(id: string, k: K) => box(id).filter((m): m is Extract<ServerMsg, { k: K }> => m.k === k);
  const join = (id: string, name: string, team = '', x = 600, z = 600, o: Partial<PlayerProfile> = {}, so: Partial<PlayerState> = {}) => auth.join(profile(id, name, team, o), state(x, z, so), 0);
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

const item = (o: Partial<LootItemNet> = {}): LootItemNet => ({ uid: 'p:anna-1', ref: 'sturmklinge', kind: 'gear', grade: 'blau', name: 'Sturmklinge', cat: 'Brust', aff: 'alle', ship: 0, value: 300, tier: 3, ...o });
const entry = (id: string, name: string, o: Partial<RollEntry> = {}): RollEntry => ({ id, name, needOk: true, needWhy: '', choice: '', roll: 0, bot: false, ...o });

// ---------------------------------------------------------------------------------------------------------------
// Verteilung: Gold, Ruf, reihum, Würfel ab Blau
// ---------------------------------------------------------------------------------------------------------------

describe('Gruppen-Beute: Gold-Split, Ruf und reihum', () => {
  it('teilt fair in ganzen Zahlen (Summe exakt, Rest an die Ersten), auch negativen Ruf', () => {
    expect(splitEven(100, 3)).toEqual([34, 33, 33]);
    expect(splitEven(7, 5).reduce((a, b) => a + b, 0)).toBe(7);
    expect(splitEven(-5, 2)).toEqual([-3, -2]);
    expect(splitEven(10, 1)).toEqual([10]);
    expect(splitEven(10, 0)).toEqual([]);
  });

  it('Gold und Ruf gehen an alle Gruppenmitglieder im Einsatzgebiet (250 m an Land), nicht an Entfernte', () => {
    const s = shard();
    s.join('p:a', 'Anna', 'deutschland', 600, 600);
    s.join('p:b', 'Bert', 'deutschland', 700, 600);
    s.join('p:c', 'Cara', 'deutschland', 800, 600);
    s.join('p:d', 'Dora', 'deutschland', 600, 1200);
    s.form(['p:a', 'p:b', 'p:c', 'p:d']);
    s.auth.handle('p:a', { k: 'loot', gold: 100, rep: 9, power: 'deutschland', items: [] }, 2);
    const share = (id: string) => s.of(id, 'lootShare').at(-1);
    expect([share('p:a')?.gold, share('p:b')?.gold, share('p:c')?.gold]).toEqual([34, 33, 33]);
    expect([share('p:a')?.rep, share('p:b')?.rep, share('p:c')?.rep]).toEqual([3, 3, 3]);
    expect(share('p:b')).toMatchObject({ n: 3, name: 'Anna', power: 'deutschland' });
    expect(share('p:d')).toBeUndefined();
  });

  it('auf See reicht das Einsatzgebiet 1 200 m', () => {
    const s = shard();
    s.join('p:a', 'Anna', 'deutschland', 0, 3000, {}, { dom: 'sea' });
    s.join('p:b', 'Bert', 'deutschland', 1100, 3000, {}, { dom: 'sea' });
    s.join('p:c', 'Cara', 'deutschland', 1300, 3000, {}, { dom: 'sea' });
    s.form(['p:a', 'p:b', 'p:c']);
    s.auth.handle('p:a', { k: 'loot', gold: 90, rep: 0, power: '', items: [] }, 2);
    expect(s.of('p:b', 'lootShare').at(-1)?.gold).toBe(45);
    expect(s.of('p:c', 'lootShare')).toHaveLength(0);
  });

  it('gewöhnliche Stücke (Grau/Weiß/Grün) wandern reihum ins Inventar – ohne Würfel, mit Chat-Zeile', () => {
    const s = shard();
    s.join('p:a', 'Anna', 'deutschland'); s.join('p:b', 'Bert', 'deutschland', 650);
    s.form(['p:a', 'p:b']);
    for (let i = 0; i < 4; i++) s.auth.handle('p:a', { k: 'loot', gold: 0, rep: 0, power: '', items: [item({ uid: `p:a-${i}`, grade: i % 2 ? 'weiss' : 'gruen', name: `Stück ${i}` })] }, 2);
    expect(s.of('p:a', 'lootGet').map((m) => m.item.name)).toEqual(['Stück 0', 'Stück 2']);
    expect(s.of('p:b', 'lootGet').map((m) => m.item.name)).toEqual(['Stück 1', 'Stück 3']);
    expect(s.of('p:b', 'lootGet')[0].how).toBe('reihum');
    expect(s.of('p:a', 'rollStart')).toHaveLength(0);
    expect(s.of('p:b', 'chat').some((m) => m.msg.ch === 'system' && m.msg.text === '[Beute]: Bert erhält [Stück 1] (reihum).')).toBe(true);
  });

  it('ohne Gruppe bekommt der Finder alles zurück', () => {
    const s = shard();
    s.join('p:a', 'Anna', 'deutschland');
    s.auth.handle('p:a', { k: 'loot', gold: 50, rep: 0, power: '', items: [item()] }, 2);
    expect(s.of('p:a', 'lootShare')[0].gold).toBe(50);
    expect(s.of('p:a', 'lootGet')[0]).toMatchObject({ how: 'allein' });
    expect(s.of('p:a', 'rollStart')).toHaveLength(0);
  });
});

describe('Würfel-Sitzungen (Bedarf / Gier / Passen)', () => {
  it('ab Blau (Selten) wird gewürfelt, darunter nicht', () => {
    expect(['grau', 'weiss', 'gruen'].map((g) => rollsFor(g as LootItemNet['grade']))).toEqual([false, false, false]);
    expect(['blau', 'violett', 'gold', 'kosmos'].map((g) => rollsFor(g as LootItemNet['grade']))).toEqual([true, true, true, true]);
    expect(gradeOf('selten', 'gear')).toBe('blau');
    expect(gradeOf('legendaer', 'trinket')).toBe('gold');
    expect(gradeOf('gewoehnlich', 'consumable')).toBe('weiss');
    expect(gradeOf('gewoehnlich', 'gear')).toBe('gruen');
    expect(gradeOf('episch', 'gear', { endgame: true })).toBe('kosmos');
  });

  it('ein blaues Stück startet bei allen eine Karte mit 30 s Frist und eigener Bedarf-Erlaubnis', () => {
    const s = shard();
    s.join('p:a', 'Anna', 'deutschland', 600, 600, { base: 'schwert' });
    s.join('p:b', 'Bert', 'deutschland', 620, 600, { base: 'faji' });
    s.form(['p:a', 'p:b']);
    s.auth.handle('p:a', { k: 'loot', gold: 0, rep: 0, power: '', items: [item({ aff: 'faji', name: 'Nebelperle', kind: 'trinket' })] }, 2);
    const a = s.of('p:a', 'rollStart')[0].roll, b = s.of('p:b', 'rollStart')[0].roll;
    expect(a).toMatchObject({ total: MMO.rollTime, left: 30, needOk: false, needWhy: NOT_FOR_CLASS, n: 2, from: 'Anna' });
    expect(b.needOk).toBe(true);
    expect(s.auth.rolls).toHaveLength(1);
  });

  it('Bedarf nur für passende Klasse bzw. Schiffsstufe', () => {
    const sw = { base: 'schwert', role: 'Kombo-DPS', shipTier: 1 }, fj = { base: 'faji', role: 'DPS/Heal', shipTier: 4 }, fs = { base: 'faust', role: 'DPS', shipTier: 0 };
    expect(needBlock({ aff: 'alle', ship: 0 }, fs)).toBe('');
    expect(needBlock({ aff: 'nahkampf', ship: 0 }, fs)).toBe('');
    expect(needBlock({ aff: 'nahkampf', ship: 0 }, fj)).toBe(NOT_FOR_CLASS);
    expect(needBlock({ aff: 'schwert', ship: 0 }, fs)).toBe(NOT_FOR_CLASS);
    expect(needBlock({ aff: 'schwert', ship: 0 }, sw)).toBe('');
    expect(needBlock({ aff: 'faji', ship: 0 }, sw)).toBe(NOT_FOR_CLASS);
    expect(needBlock({ aff: 'schiff', ship: 3 }, sw)).toBe(SHIP_TOO_SMALL);
    expect(needBlock({ aff: 'schiff', ship: 3 }, fj)).toBe('');
    // Eignung aus den Werten: Waffen in der Hand nur für Schwertkämpfer, sonst Schwerpunkt
    expect(affinityOf({ atk: 0.15, crit: 0.08 }, '')).toBe('nahkampf');
    expect(affinityOf({ faji: 0.25, hp: 0.1 }, '')).toBe('faji');
    expect(affinityOf({ cannon: 0.3, speed: 0.15, faji: 0.2 }, '')).toBe('schiff');
    expect(affinityOf({ hp: 120, armor: 30 }, 'chest')).toBe('alle');
    expect(affinityOf({ atk: 10 }, 'mainhand')).toBe('schwert');
    // Rüstung: kleine Zusatzwerte (unter 5 %) machen kein Klassen-Stück
    expect(affinityOf({ hp: 61, armor: 7, faji: 0.02, gold: 0.01 }, 'head')).toBe('alle');
    expect(affinityOf({ hp: 50, faji: 0.08 }, 'head')).toBe('faji');
    expect(affinityOf({ hp: 50, crit: 0.06 }, 'legs')).toBe('nahkampf');
  });

  it('Bedarf schlägt Gier – mit Chat-Protokoll im gewünschten Wortlaut', () => {
    const s = createRoll('w1', item(), 'p:a', 'Anna', 'g1', 0, [entry('p:a', 'Anna'), entry('p:b', 'Bert')]);
    expect(chooseRoll(s, 'p:a', 'gier', 1)).toBe('');
    expect(chooseRoll(s, 'p:b', 'bedarf', 1)).toBe('');
    expect(rollReady(s, 1)).toBe(true);
    const r = resolveRoll(s, seq([0.93, 0.6]));
    expect(r).toMatchObject({ winner: 'p:b', winnerName: 'Bert', choice: 'bedarf' });
    expect(r.lines).toEqual(['[Beute]: Anna würfelt Gier: 94 (1–100) · Bert würfelt Bedarf: 61 (1–100) → Bert (Bedarf) gewinnt [Sturmklinge]!']);
  });

  it('Bedarf wird abgewiesen, wenn die Klasse nicht passt; doppelte und verspätete Wahl ebenso', () => {
    const s = createRoll('w2', item({ aff: 'faji' }), 'p:a', 'Anna', 'g1', 0, [entry('p:a', 'Anna', { needOk: false, needWhy: NOT_FOR_CLASS }), entry('p:b', 'Bert')]);
    expect(chooseRoll(s, 'p:a', 'bedarf', 1)).toBe(NOT_FOR_CLASS);
    expect(chooseRoll(s, 'p:a', 'gier', 1)).toBe('');
    expect(chooseRoll(s, 'p:a', 'passen', 2)).toBe('Du hast schon gewählt.');
    expect(chooseRoll(s, 'p:x', 'gier', 2)).toBe('Du würfelst bei diesem Stück nicht mit.');
    expect(chooseRoll(s, 'p:b', 'gier', 40)).toBe('Die Würfel sind schon gefallen.');
  });

  it('Gleichstand an der Spitze wird gestochen', () => {
    const s = createRoll('w3', item(), 'p:a', 'Anna', 'g1', 0, [entry('p:a', 'Anna'), entry('p:b', 'Bert'), entry('p:c', 'Cara')]);
    chooseRoll(s, 'p:a', 'gier', 1); chooseRoll(s, 'p:b', 'gier', 1); chooseRoll(s, 'p:c', 'gier', 1);
    // Anna 51, Bert 51, Cara 11 → Stechen Anna/Bert: 21 gegen 91
    const r = resolveRoll(s, seq([0.5, 0.5, 0.1, 0.2, 0.9]));
    expect(r.ties).toHaveLength(1);
    expect(r.ties[0].map((x) => x.roll)).toEqual([21, 91]);
    expect(r.winner).toBe('p:b');
    expect(r.lines.join(' ')).toContain('Stechen: Anna 21, Bert 91');
  });

  it('nach 30 s passen alle, die nicht gewählt haben; Verbindungsabbruch = Passen; alle passen → der Finder behält es', () => {
    const s = shard();
    s.join('p:a', 'Anna', 'deutschland'); s.join('p:b', 'Bert', 'deutschland', 620); s.join('p:c', 'Cara', 'deutschland', 640);
    s.form(['p:a', 'p:b', 'p:c']);
    s.auth.rng = seq([0.4]);
    s.auth.handle('p:a', { k: 'loot', gold: 0, rep: 0, power: '', items: [item()] }, 10);
    s.auth.handle('p:b', { k: 'roll', id: s.of('p:b', 'rollStart')[0].roll.id, choice: 'gier' }, 11);
    // Cara geht offline: sie passt automatisch
    s.auth.leave('p:c', 12);
    // Lebenszeichen der Menschen (sonst gehen sie nach 15 s Stille vom Shard)
    const tick = (t: number) => { for (const p of s.auth.list) p.seen = t; s.auth.tick(t); };
    tick(20);
    expect(s.auth.rolls).toHaveLength(1);
    tick(10 + MMO.rollTime + 0.01);
    expect(s.auth.rolls).toHaveLength(0);
    const end = s.of('p:a', 'rollEnd')[0];
    expect(end.winner).toBe('p:b');
    expect(end.text).toContain('Anna passt');
    expect(end.text).toContain('Cara passt');
    expect(s.of('p:b', 'lootGet')[0]).toMatchObject({ how: 'wurf' });

    const t = createRoll('w9', item(), 'p:a', 'Anna', 'g', 0, [entry('p:a', 'Anna'), entry('p:b', 'Bert')]);
    passOpen(t);
    const r = resolveRoll(t, Math.random);
    expect(r.winner).toBe('');
    expect(r.lines[0]).toBe('[Beute]: Anna passt · Bert passt → Alle passen – [Sturmklinge] bleibt bei Anna.');
  });

  it('der Shard weist doppelte Würfe ab und schickt Ende + Gewinn genau einmal', () => {
    const s = shard();
    s.join('p:a', 'Anna', 'deutschland'); s.join('p:b', 'Bert', 'deutschland', 620);
    s.form(['p:a', 'p:b']);
    s.auth.rng = seq([0.2, 0.9]);
    s.auth.handle('p:a', { k: 'loot', gold: 0, rep: 0, power: '', items: [item({ grade: 'gold', name: 'Krone der Tiefe' })] }, 2);
    const id = s.of('p:a', 'rollStart')[0].roll.id;
    s.auth.handle('p:a', { k: 'roll', id, choice: 'gier' }, 3);
    s.auth.handle('p:a', { k: 'roll', id, choice: 'bedarf' }, 3);
    expect(s.of('p:a', 'notice').at(-1)?.text).toBe('Du hast schon gewählt.');
    s.auth.handle('p:b', { k: 'roll', id, choice: 'gier' }, 4);
    s.auth.handle('p:b', { k: 'roll', id, choice: 'gier' }, 4);
    expect(s.of('p:b', 'notice').at(-1)?.text).toBe('Diese Würfel-Runde ist schon vorbei.');
    expect(s.of('p:a', 'rollEnd')).toHaveLength(1);
    expect([...s.of('p:a', 'lootGet'), ...s.of('p:b', 'lootGet')]).toHaveLength(1);
    expect(s.of('p:b', 'lootGet')[0].item.name).toBe('Krone der Tiefe');
    expect(s.of('p:a', 'chat').at(-1)?.msg.text).toBe('[Beute]: Anna würfelt Gier: 21 (1–100) · Bert würfelt Gier: 91 (1–100) → Bert (Gier) gewinnt [Krone der Tiefe]!');
  });

  it('lange Protokolle (5 Kapitäne, langer Name) werden auf Chat-Zeilen verteilt', () => {
    const names = ['Kapitänin Seraphine', 'Admiral Thorwald', 'Lotsin Mirabell', 'Steuermann Quirin', 'Maat Wendelin'];
    const s = createRoll('w5', item({ name: 'Mythischer Sternenmantel des ewigen Sturms' }), 'p:0', names[0], 'g', 0, names.map((n, i) => entry(`p:${i}`, n)));
    for (let i = 0; i < 5; i++) chooseRoll(s, `p:${i}`, i % 2 ? 'gier' : 'bedarf', 1);
    const r = resolveRoll(s, seq([0.1, 0.2, 0.3, 0.4, 0.95]));
    expect(r.lines.length).toBeGreaterThan(1);
    for (const l of r.lines) { expect(l.length).toBeLessThanOrEqual(MMO.chatMax); expect(l.startsWith('[Beute]: ')).toBe(true); }
    expect(r.lines.at(-1)).toContain('gewinnt [Mythischer Sternenmantel des ewigen Sturms]!');
    expect(rollChatLines(s, r)).toEqual(r.lines);
  });

  it('Stellvertreter des lokalen Shards wählen selbst (nie Bedarf ohne Erlaubnis)', () => {
    for (let i = 0; i < 40; i++) expect(botChoice(entry('b', 'B', { needOk: false }), item({ grade: 'gold' }), () => i / 40)).not.toBe('bedarf');
    expect(botChoice(entry('b', 'B'), item({ grade: 'gold' }), () => 0.1)).toBe('bedarf');
  });

  it('Protokoll: Beute- und Würfel-Pakete laufen durch die Säuberung', () => {
    expect(cleanIntent({ k: 'roll', id: 'w1', choice: 'bedarf' })).toEqual({ k: 'roll', id: 'w1', choice: 'bedarf' });
    expect(cleanIntent({ k: 'roll', id: 'w1', choice: 'alles' })).toBeNull();
    expect(cleanIntent({ k: 'loot', gold: 0, rep: 0, items: [] })).toBeNull();
    const l = cleanIntent({ k: 'loot', gold: 12.6, rep: 500, power: 'Deutsch!', items: [item(), { uid: 'x', ref: '../boese', kind: 'gear', grade: 'blau' }] });
    expect(l).toMatchObject({ k: 'loot', gold: 13, rep: 100, power: '', items: [item()] });
    expect(cleanLootItem({ ...item(), grade: 'regenbogen' })).toBeNull();
    expect(cleanLootItem({ ...item(), name: 'A\u0000B', aff: 'alle-und-mehr' })).toMatchObject({ name: 'A B', aff: 'alle' });
    const rs = cleanServerMsg({ k: 'rollStart', roll: { id: 'w1', item: item(), left: 99, total: 30, needOk: true, needWhy: '', from: 'Anna', n: 9 } });
    expect(rs).toMatchObject({ k: 'rollStart', roll: { left: 30, n: MMO.partyMax } });
    expect(cleanServerMsg({ k: 'lootGet', item: item(), how: 'geklaut' })).toMatchObject({ how: 'allein' });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Aussehen über das Netz
// ---------------------------------------------------------------------------------------------------------------

describe('Aussehen-Sync', () => {
  const look = { ...defaultLook('pirat', 'female'), hair: 'zopf', hairModel: 'frisur_mehrlagig', hairColor: '#C76BA8', beard: 'keiner', hat: 'dreispitz', coat: 'lang', coatColor: '#14284A', body: 'kraeftig', height: 1.04 };

  it('jedes Feld von CharacterLook ist abgedeckt (Auswahl, Farbe, Schalter, Größe)', () => {
    const covered = new Set([...APP_ENUM_KEYS, ...APP_COLOR_KEYS, ...APP_BOOL_KEYS, 'height', 'extra', 'dye']);
    for (const k of Object.keys(defaultLook('pirat', 'female'))) expect(covered.has(k), k).toBe(true);
  });

  it('säubert Form und Grenzen, behält Frisur „Mehrlagig“, Haarfarbe, Hut, Mantel, Ausrüstung und Waffe', () => {
    const app = cleanAppearance({ look: { ...look, height: 3, evil: '<script>', skin: 'rot' }, extra: ['ritter_head', '../x', 'kaiser_chest'], dye: [['ritter_head', '#112233', '#445566'], ['x', 'blau', '#000000']], style: 'saebel', blade: '#E8C777', glow: true })!;
    expect(app.look).toMatchObject({ gender: 'female', hair: 'zopf', hairModel: 'frisur_mehrlagig', hairColor: '#c76ba8', hat: 'dreispitz', coat: 'lang', body: 'kraeftig', height: 1.1 });
    expect(app.look.evil).toBeUndefined();
    expect(app.look.skin).toBeUndefined();
    expect(app.extra).toEqual(['ritter_head', 'kaiser_chest']);
    expect(app.dye).toEqual([['ritter_head', '#112233', '#445566']]);
    expect(app).toMatchObject({ style: 'saebel', blade: '#e8c777', glow: true });
    expect(cleanAppearance(null)).toBeNull();
  });

  it('der Steckbrief trägt das Aussehen über den Shard zu den Nachbarn (Teilpakete ≤ 24 Steckbriefe)', () => {
    const s = shard();
    const app = cleanAppearance({ look, extra: ['ritter_head'], dye: [], style: 'langklinge', blade: '#c9d2da', glow: false });
    s.join('p:a', 'Anna', 'deutschland', 600, 600, { app });
    for (let i = 0; i < 30; i++) s.join(`p:n${i}`, `Nachbar ${i}`, 'deutschland', 600 + i, 600);
    s.join('p:b', 'Bert', 'deutschland', 620, 600);
    s.auth.snapshots(1);
    const packs = s.of('p:b', 'profiles');
    expect(packs.length).toBeGreaterThan(1);
    expect(Math.max(...packs.map((p) => p.list.length))).toBeLessThanOrEqual(MMO.profilesPerPacket);
    const anna = packs.flatMap((p) => p.list).find((p) => p.id === 'p:a')!;
    expect(anna.app?.look.hairModel).toBe('frisur_mehrlagig');
    expect(anna.app?.style).toBe('langklinge');
    expect(cleanProfile(anna)?.app?.extra).toEqual(['ritter_head']);
  });

  it('die Welt legt das Aussehen auf Pool-Figuren (geprüft mit sanitizeLook, Waffe auf dem Rücken, höchstens eine Figur je 0,2 s)', () => {
    const live = readFileSync('src/world/mmoLive.ts', 'utf8');
    expect(live).toMatch(/export const APPLY_GAP = 0\.2;/);
    expect(live).toMatch(/this\.host\.dress\(slot\.char, r\.profile\.app, slot\.base\)/);
    expect(live).not.toMatch(/new Character\(/);
    const sea = readFileSync('src/world/seaWorld.ts', 'utf8');
    expect(sea).toMatch(/look = sanitizeLook\(\{ \.\.\.app\.look \}, 'pirat'\);/);
    expect(sea).toMatch(/char\.sheathe\(true, 0\.3, false\);/);
    const game = readFileSync('src/core/game.ts', 'utf8');
    expect(game).toMatch(/prof\.app = this\.mmoAppearance\(\);/);
    expect(game).toMatch(/k\.look !== lookV/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Land-PvP
// ---------------------------------------------------------------------------------------------------------------

describe('Open-World-Land-PvP', () => {
  it('PvP-Skalierung: Bruchteil des Gegner-Schadens, Deckel je Treffer nach dem Leben des Ziels', () => {
    expect(pvpLandDamage(100, 5000)).toBe(Math.round(100 * PVP_LAND.scale));
    expect(pvpLandDamage(100000, 2000)).toBe(Math.round(2000 * PVP_LAND.hitCap));
    expect(pvpLandDamage(0, 1000)).toBe(0);
    expect(pvpLandDamage(1, 1000)).toBe(PVP_LAND.minDmg);
  });

  it('zu Fuß nur bei Krieg, außerhalb der Schutzzonen, an Land, in Reichweite – skaliert vom Shard', () => {
    const s = shard();
    s.join('p:en', 'Archie', 'england', 1000, 1000);
    s.join('p:fr', 'Gaspard', 'frankreich', 1010, 1000);
    s.auth.handle('p:en', { k: 'hit', to: 'p:fr', dmg: 5000, land: true }, 1);
    const h = s.of('p:fr', 'hit')[0];
    expect(h).toMatchObject({ land: true, from: 'p:en' });
    expect(h.dmg).toBe(pvpLandDamage(5000, 1000));
    expect(h.dmg).toBeLessThanOrEqual(1000 * PVP_LAND.hitCap);
    expect(s.auth.stats.landHits).toBe(1);
  });

  it('gesperrt: Schutzzone, Gruppe, Verbündete, kein Krieg, an Deck/auf See, zu weit', () => {
    const s = shard();
    const tryHit = (a: string, b: string) => { const before = s.of(b, 'hit').length; s.auth.handle(a, { k: 'hit', to: b, dmg: 100, land: true }, 1); return s.of(b, 'hit').length > before; };
    // Schutzzone Ankerglück
    s.join('p:en1', 'A1', 'england', 0, 160); s.join('p:fr1', 'F1', 'frankreich', 10, 160);
    expect(tryHit('p:en1', 'p:fr1')).toBe(false);
    expect(s.of('p:en1', 'notice').at(-1)?.text).toContain('Schutzzone Ankerglück');
    // Verbündete und keine Feinde
    s.join('p:de', 'D', 'deutschland', 2000, 2000); s.join('p:nl', 'N', 'niederlande', 2005, 2000); s.join('p:ku', 'K', 'kurogane', 2010, 2000);
    expect(tryHit('p:de', 'p:nl')).toBe(false);
    expect(tryHit('p:de', 'p:ku')).toBe(false);
    // auf See bzw. an Deck: nicht zu Fuß
    s.join('p:en2', 'A2', 'england', 3000, 3000, {}, { dom: 'sea' }); s.join('p:fr2', 'F2', 'frankreich', 3010, 3000);
    expect(tryHit('p:en2', 'p:fr2')).toBe(false);
    expect(s.of('p:en2', 'notice').at(-1)?.text).toBe('Kampf zu Fuß nur an Land');
    // zu weit (34 m)
    s.join('p:en3', 'A3', 'england', 4000, 4000); s.join('p:fr3', 'F3', 'frankreich', 4000 + MMO.hitRangeLand + 5, 4000);
    expect(tryHit('p:en3', 'p:fr3')).toBe(false);
    // dieselbe Gruppe ist nie treffbar (Gruppen gibt es nicht im Krieg – hier England mit England)
    s.join('p:en4', 'A4', 'england', 5000, 5000); s.join('p:en5', 'A5', 'england', 5005, 5000);
    s.form(['p:en4', 'p:en5']);
    expect(tryHit('p:en4', 'p:en5')).toBe(false);
  });

  it('die Welt macht nur verfeindete Kapitäne zu Fuß treffbar und schickt Treffer als „land“ an den Shard', () => {
    const live = readFileSync('src/world/mmoLive.ts', 'utf8');
    expect(live).toMatch(/t\.harm = rel\.harm && !onDeck && r\.last\.dom === 'land'/);
    const combat = readFileSync('src/combat/combat.ts', 'utf8');
    expect(combat).toMatch(/this\.onPeerHit\?\.\(obj\.id, raw\)/);
    expect(combat).toMatch(/this\.onPeerHit\?\.\(pf\.id, raw\)/);
    const sea = readFileSync('src/world/seaWorld.ts', 'utf8');
    expect(sea).toMatch(/this\.combat\.onPeerHit = \(id, raw\) => this\.onPeerHit\?\.\(id, raw, true\)/);
    expect(sea).toMatch(/c\.strikePlayer\(dmg, dx, dz,/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 1 – 5-Spieler-Skalierung
// ---------------------------------------------------------------------------------------------------------------

describe('Gruppen-Skalierung von Ring-5-Kaisern und Weltbossen', () => {
  it('1,0× solo bis 3,6× bei fünf Kapitänen, stetig steigend; Elite-Wellen ab drei', () => {
    expect(groupScale(1)).toBe(1);
    expect(groupScale(5)).toBe(3.6);
    for (let n = 1; n < 5; n++) expect(groupScale(n + 1)).toBeGreaterThan(groupScale(n));
    expect(groupScale(0)).toBe(1);
    expect(groupScale(9)).toBe(3.6);
    expect([1, 2, 3, 4, 5].map(groupElites)).toEqual([0, 0, 1, 1, 2]);
    expect(groupLootK(1)).toBe(1);
    expect(GROUP_RAID.scale).toHaveLength(5);
  });

  it('Solo keine Bonus-Beute; größere Gruppen mehr Stücke und mehr Episch/Legendär', () => {
    expect(groupBonusRarities(1, Math.random)).toEqual([]);
    let r = 1;
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    const share = (n: number) => { let hi = 0, all = 0; for (let i = 0; i < 4000; i++) for (const x of groupBonusRarities(n, rnd)) { all++; if (x !== 'selten') hi++; } return { hi: hi / all, per: all / 4000 }; };
    const two = share(2), five = share(5);
    expect(two.per).toBe(1);
    expect(five.per).toBe(3);
    expect(five.hi).toBeGreaterThan(two.hi + 0.1);
  });

  it('Kaiser, Offiziere, Garde und Weltbosse nutzen die Skalierung (eigene Kopien der Werte)', () => {
    const k = readFileSync('src/world/kaiserLive.ts', 'utf8');
    expect(k).toMatch(/const d = scaleDef\(kaiserBossDef\(l\.id\), groupScale\(grp\)\);/);
    expect(k).toMatch(/groupElites\(grp\)/);
    expect(k).toMatch(/return \{ \.\.\.d, hp: Math\.round\(d\.hp \* k\), poise: Math\.round\(d\.poise \* k\) \};/);
    const w = readFileSync('src/world/worldEventsLive.ts', 'utf8');
    expect((w.match(/groupScale\(this\.host\.groupSize\?\.\(\) \?\? 1\)/g) ?? []).length).toBe(2);
    const g = readFileSync('src/core/game.ts', 'utf8');
    expect(g).toMatch(/this\.world\.groupSize = \(\) => this\.partyPresent\(\);/);
    expect((g.match(/this\.groupBonusLoot\(/g) ?? []).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Relay-Server: /health, Diplomatie-Übergabe, autoritative Würfel (eigener Port)
// ---------------------------------------------------------------------------------------------------------------

interface Client { ws: WebSocket; msgs: ServerMsg[]; send(o: unknown): void }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 4000) { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw new Error('Zeitüberschreitung'); await sleep(20); } }

describe('Relay-Server: Produktionsreife', () => {
  let proc: ChildProcess;
  let port = 0;
  const clients: Client[] = [];
  const connect = async (): Promise<Client> => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const c: Client = { ws, msgs: [], send: (o) => ws.send(JSON.stringify(o)) };
    ws.onmessage = (e) => { const m = cleanServerMsg(JSON.parse(String(e.data))); if (m) c.msgs.push(m); };
    await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('kein Handschlag')); });
    clients.push(c);
    return c;
  };
  const hello = (c: Client, id: string, name: string, team: string, o: Partial<PlayerProfile> = {}) => c.send({ k: 'hello', v: 1, profile: profile(id, name, team, o), state: state(2000, 2000) });
  const of = <K extends ServerMsg['k']>(c: Client, k: K) => c.msgs.filter((m): m is Extract<ServerMsg, { k: K }> => m.k === k);
  const health = async () => (await (await fetch(`http://127.0.0.1:${port}/health`)).json()) as Record<string, unknown>;

  beforeAll(async () => {
    expect(readFileSync('.env.example', 'utf8')).toMatch(/^PORT=8787$/m);
    expect(readFileSync('.env.example', 'utf8')).toMatch(/^ALLOWED_ORIGINS=\*$/m);
    expect(readFileSync('Dockerfile', 'utf8')).toMatch(/CMD \["node", "server\/mmoRelayServer\.mjs"\]/);
    proc = spawn(process.execPath, ['server/mmoRelayServer.mjs'], { env: { ...process.env, PORT: '0', HOST: '127.0.0.1', ALLOWED_ORIGINS: '*' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout!.on('data', (d) => { out += String(d); });
    proc.stderr!.on('data', (d) => { out += String(d); });
    await until(() => /ws:\/\/localhost:(\d+)/.test(out), 15000).catch(() => { throw new Error(`Server startet nicht:\n${out}`); });
    port = Number(/ws:\/\/localhost:(\d+)/.exec(out)![1]);
    expect(port).not.toBe(8787);
  }, 20000);

  afterAll(() => { for (const c of clients) try { c.ws.close(); } catch { /* zu */ } proc?.kill(); });

  it('GET /health liefert status, onlineCount, activeParties, activeRolls und uptime', async () => {
    const r = await fetch(`http://127.0.0.1:${port}/health`);
    expect(r.status).toBe(200);
    const j = await r.json() as Record<string, unknown>;
    expect(j).toMatchObject({ status: 'ok', onlineCount: 0, activeParties: 0, activeRolls: 0 });
    expect(typeof j.uptime).toBe('number');
    expect((await fetch(`http://127.0.0.1:${port}/gibtsnicht`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${port}/health`, { method: 'POST' })).status).toBe(405);
  });

  it('Diplomatie im Server-Speicher: nur der Leiter meldet, der Stand überlebt seinen Abgang, der Nächste übernimmt', async () => {
    const a = await connect(); hello(a, 'p:leit0001', 'Leiterin', 'england');
    await until(() => of(a, 'welcome').length > 0);
    const b = await connect(); hello(b, 'p:frnz0001', 'Bastien', 'frankreich');
    const c = await connect(); hello(c, 'p:frnz0002', 'Céline', 'frankreich');
    await until(() => of(c, 'welcome').length > 0);
    // Bericht eines Nicht-Leiters zählt nicht: England–Frankreich bleibt Rivalität (Einladung möglich)
    b.send({ k: 'diplo', pairs: [{ a: 'england', b: 'frankreich', s: 'krieg' }] });
    await sleep(80);
    a.send({ k: 'invite', to: 'Céline' });
    await until(() => of(c, 'party').some((m) => m.ev.e === 'invite'));
    c.send({ k: 'reply', party: (of(c, 'party').find((m) => m.ev.e === 'invite')!.ev as { party: string }).party, accept: false });
    // der Leiter meldet Krieg: jetzt gesperrt
    a.send({ k: 'diplo', pairs: [{ a: 'england', b: 'frankreich', s: 'krieg' }] });
    await sleep(80);
    a.send({ k: 'invite', to: 'Bastien' });
    await until(() => of(a, 'notice').some((m) => m.text.includes('Krieg')));
    expect((await health()).diplomacy).toMatchObject({ source: 'kapitaen', pairs: 1 });
    // der Leiter geht: der Kriegszustand bleibt im Server-Speicher
    a.ws.close();
    await until(() => of(b, 'gone').some((m) => m.id === 'p:leit0001'));
    const d = await connect(); hello(d, 'p:engl0002', 'Edmund', 'england');
    await until(() => of(d, 'welcome').length > 0);
    b.send({ k: 'invite', to: 'Edmund' });
    await until(() => of(b, 'notice').some((m) => m.text.includes('Krieg')));
    // Bastien ist jetzt Leiter: seine Meldung (Frieden) gilt
    b.send({ k: 'diplo', pairs: [{ a: 'england', b: 'frankreich', s: 'neutral' }] });
    await sleep(80);
    b.send({ k: 'invite', to: 'Edmund' });
    await until(() => of(d, 'party').some((m) => m.ev.e === 'invite'));
  });

  it('autoritative Würfel über das Netz: Karten für beide, doppelte Wahl abgewiesen, Gewinn genau einmal; /health zählt mit', async () => {
    const e = await connect(); hello(e, 'p:wurf0001', 'Erik', 'deutschland', { base: 'schwert' });
    const f = await connect(); hello(f, 'p:wurf0002', 'Frida', 'deutschland', { base: 'faji', app: cleanAppearance({ look: { gender: 'female', hair: 'zopf', hairModel: 'frisur_mehrlagig' }, extra: [], dye: [], style: 'effekt', blade: '#9fe8ff', glow: true }) });
    await until(() => of(f, 'welcome').length > 0 && of(e, 'welcome').length > 0);
    e.send({ k: 'invite', to: 'Frida' });
    await until(() => of(f, 'party').some((m) => m.ev.e === 'invite'));
    f.send({ k: 'reply', party: (of(f, 'party').find((m) => m.ev.e === 'invite')!.ev as { party: string }).party, accept: true });
    await until(() => of(e, 'party').some((m) => m.ev.e === 'state' && (m.ev.party?.members.length ?? 0) === 2));
    // Aussehen kommt beim Nachbarn an
    await until(() => of(e, 'profiles').some((m) => m.list.some((p) => p.id === 'p:wurf0002' && p.app?.look.hairModel === 'frisur_mehrlagig')));
    e.send({ k: 'loot', gold: 0, rep: 0, power: '', items: [item({ uid: 'p:wurf0001-1', aff: 'faji', name: 'Geisterlaterne', kind: 'trinket', grade: 'violett' })] });
    await until(() => of(e, 'rollStart').length > 0 && of(f, 'rollStart').length > 0);
    expect(of(e, 'rollStart')[0].roll).toMatchObject({ needOk: false, needWhy: NOT_FOR_CLASS });
    expect(of(f, 'rollStart')[0].roll.needOk).toBe(true);
    expect((await health()).activeRolls).toBe(1);
    expect((await health()).activeParties).toBeGreaterThanOrEqual(1);
    const id = of(e, 'rollStart')[0].roll.id;
    e.send({ k: 'roll', id, choice: 'bedarf' });
    await until(() => of(e, 'notice').some((m) => m.text === NOT_FOR_CLASS));
    f.send({ k: 'roll', id, choice: 'bedarf' });
    f.send({ k: 'roll', id, choice: 'gier' });
    await until(() => of(f, 'notice').some((m) => m.text === 'Du hast schon gewählt.'));
    e.send({ k: 'roll', id, choice: 'passen' });
    await until(() => of(e, 'rollEnd').length > 0 && of(f, 'lootGet').length > 0);
    expect(of(e, 'rollEnd')[0]).toMatchObject({ winner: 'p:wurf0002', choice: 'bedarf' });
    expect(of(f, 'lootGet')[0]).toMatchObject({ how: 'wurf', item: { name: 'Geisterlaterne' } });
    expect(of(e, 'lootGet')).toHaveLength(0);
    expect(of(e, 'chat').some((m) => m.msg.text.includes('Frida (Bedarf) gewinnt [Geisterlaterne]!'))).toBe(true);
    expect((await health()).activeRolls).toBe(0);
  });

  it('Müll und Flut kosten den Server nichts', async () => {
    const g = await connect();
    for (let i = 0; i < 30; i++) g.ws.send('{"k":"loot","items":[{"uid":"../x"}]}');
    g.ws.send('x'.repeat(1000));
    await sleep(100);
    expect((await health()).status).toBe('ok');
  });
});
