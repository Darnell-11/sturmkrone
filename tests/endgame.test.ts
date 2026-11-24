// Endgame-Raids: Bedrohungstabelle, Endbosse (zwei Phasen, Warnflächen, Fähigkeiten), Hauptmänner mit Aura, Verbände, persönliche Beute,
// Insel-Besatzung mit Rückeroberung und der abwärtskompatible Spielstand (Version 13).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ThreatTable, THREAT } from '../src/combat/threat';
import { CITADELS, FACTION_IDS, type FactionId } from '../src/data/factions';
import { GEAR_SET_BY_ID, SETS, gearForNpc } from '../src/data/gear';
import { EQUIP_BY_ID } from '../src/data/equipment';
import { rollLootGear } from '../src/core/gearBag';
import { createSave, SAVE_VERSION } from '../src/core/save/types';
import { migrateSave, MIGRATIONS } from '../src/core/save/migrations';
import { AURAS, CAPTAINS, RAID_BOSSES, allBossAttacks, captainDef } from '../src/raid/raidBosses';
import { buildRaidLayout } from '../src/raid/raidLayout';
import { createRaidContext, RaidInstanceSession } from '../src/raid/raidSession';
import { BOSS_PIECES, bossSetId, contributionOf, ornamentId, rollPersonalLoot, rollRaidLoot, sailId } from '../src/raid/raidLoot';
import {
  OCCUPATION, beginOccupation, cleanConquest, cleanUnlocks, clockText, dispatchFleet, fleetDue, fleetProgress, fleetShips, isLost, isOccupied, loseIsland,
  newRecord, payTribute, phase, remaining, repelFleet, tributeAmount, tributeDue, viewOf,
} from '../src/raid/occupation';
import { raidAccess } from '../src/raid/raidRules';
import { BOSS_DROP_CHANCE, SEAL_DROP } from '../src/data/balanceConfig';
import { TroopSquad, type TroopFoe, type TroopWorld } from '../src/entities/troops/squad';

const POWERS = FACTION_IDS as readonly FactionId[];
const V = '2.9.92';

// ---------- Bedrohungstabelle ----------

describe('ThreatTable (Aggro nach Art der Schlachtzüge)', () => {
  it('wählt den Angreifer mit der meisten Bedrohung', () => {
    const t = new ThreatTable();
    t.add('foot-1', 100);
    t.add('ally-1', 40);
    expect(t.pick()).toBe('foot-1');
    expect(t.ranked().map((r) => r.id)).toEqual(['foot-1', 'ally-1']);
  });

  it('wechselt das Ziel erst bei 110 % (Nahkampf) bzw. 130 % (Fernkampf)', () => {
    const t = new ThreatTable();
    t.add('tank', 100);
    expect(t.pick()).toBe('tank');
    t.add('melee', 105);
    expect(t.pick()).toBe('tank');
    t.add('melee', 6);        // 111 > 110
    expect(t.pick()).toBe('melee');
    const r = new ThreatTable();
    r.add('tank', 100);
    r.pick();
    r.add('mage', 120, { ranged: true });
    expect(r.pick()).toBe('tank');   // 120 < 130
    r.add('mage', 12, { ranged: true });
    expect(r.pick()).toBe('mage');   // 132 > 130
    expect(THREAT.meleeOvertake).toBe(1.1);
    expect(THREAT.rangedOvertake).toBe(1.3);
  });

  it('Spott zieht das Ziel für kurze Zeit und läuft dann ab', () => {
    const t = new ThreatTable();
    t.add('dd', 500);
    t.add('tank', 10);
    t.pick();
    t.taunt('tank', 2);
    expect(t.pick()).toBe('tank');
    t.update(2.1);
    expect(t.taunted).toBeNull();
    // der Spötter steht nun mit Aufschlag an der Spitze: er bleibt Ziel
    expect(t.get('tank')).toBeGreaterThan(500);
  });

  it('Gefallene fallen aus der Tabelle, ungültige Ziele werden übergangen, Bedrohung verblasst', () => {
    const t = new ThreatTable();
    t.add('a', 300); t.add('b', 100);
    expect(t.pick((id) => id !== 'a')).toBe('b');
    t.forget('a');
    expect(t.has('a')).toBe(false);
    for (let i = 0; i < 800; i++) t.update(0.5);
    expect(t.size).toBe(0);
    expect(t.pick()).toBeNull();
  });

  it('Nähe und Heilung erzeugen Bedrohung, JSON-Schnappschuss', () => {
    const t = new ThreatTable();
    t.touch('foot-1', 3, 1);
    t.touch('far', 99, 1);
    expect(t.has('far')).toBe(false);
    t.addHeal('healer', 200);
    expect(t.get('healer')).toBe(100);
    const j = JSON.parse(JSON.stringify(t.toJSON()));
    expect(j.entries[0].id).toBe('healer');
  });
});

// ---------- Endbosse und Hauptmänner ----------

describe('Die sechs Endbosse', () => {
  it('heißen wie vorgegeben und stehen auf den sechs Festungen', () => {
    expect(RAID_BOSSES.england.name).toBe('Lord-Admiral Blackwood');
    expect(RAID_BOSSES.niederlande.name).toBe('Generalgouverneur Van Der Berg');
    expect(RAID_BOSSES.deutschland.name).toBe('Großkomtur von Eisenstein');
    expect(RAID_BOSSES.frankreich.name).toBe('Marquis-Amiral De Valois');
    expect(RAID_BOSSES.kurogane.name).toBe('Schattenfürst Kurogane');
    expect(RAID_BOSSES.marine.name).toContain('Valken');
    for (const id of POWERS) {
      const b = RAID_BOSSES[id];
      const c = CITADELS.find((x) => x.factionId === id)!;
      expect(b.islandId, id).toBe(c.id);
      expect(c.boss, id).toContain(b.name.split(' ').slice(-1)[0]);
    }
  });

  it('haben genau zwei Kampfphasen mit eigenen Angriffen', () => {
    for (const id of POWERS) {
      const d = RAID_BOSSES[id].def;
      expect(d.raid, id).toBe('boss');
      expect(d.phases, id).toBe(2);
      expect(d.phaseAt![0], id).toBeCloseTo(0.5);
      expect(d.phaseAt![1], id).toBeLessThan(0);          // nie eine dritte Phase
      expect(d.phaseAttacks?.[2]?.length, id).toBeGreaterThanOrEqual(3);
      expect(d.phaseAttacks?.[3], id).toBeUndefined();
      expect(d.attacks.length, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('markieren jeden Angriff mit roten Boden-Warnflächen (Telegraph) – ohne Fläche kein Boss-Schaden', () => {
    for (const id of POWERS) {
      for (const a of allBossAttacks(RAID_BOSSES[id])) {
        expect(a.zones?.length, `${id}/${a.label}`).toBeGreaterThanOrEqual(1);
        for (const z of a.zones!) expect(z.size, `${id}/${a.label}`).toBeGreaterThan(0);
        expect(a.label, id).toBeTruthy();
      }
    }
  });

  it('besitzen die genannten Fähigkeiten', () => {
    const kinds = (f: FactionId) => new Set(allBossAttacks(RAID_BOSSES[f]).map((a) => a.mech?.kind).filter(Boolean));
    const ats = (f: FactionId) => new Set(allBossAttacks(RAID_BOSSES[f]).flatMap((a) => a.zones!.map((z) => z.at ?? 'self')));
    const props = (f: FactionId) => new Set(allBossAttacks(RAID_BOSSES[f]).flatMap((a) => a.zones!.map((z) => z.prop).filter(Boolean)));
    // England: Pistolensalven (Linienfächer), Artillerie-Signal (Streuflächen), Säbelkombo (zwei Kegel)
    expect(kinds('england').has('signal')).toBe(true);
    expect(ats('england').has('scatter')).toBe(true);
    expect(allBossAttacks(RAID_BOSSES.england).some((a) => a.label === 'Pistolensalve' && a.zones!.length >= 3 && a.zones!.every((z) => z.shape === 'line'))).toBe(true);
    expect(allBossAttacks(RAID_BOSSES.england).some((a) => a.label === 'Säbelkombo' && a.zones!.filter((z) => z.shape === 'cone').length === 2)).toBe(true);
    // Niederlande: Hellebarden-Schwünge, Söldner-Schildwall, Granaten-Fässer
    expect(allBossAttacks(RAID_BOSSES.niederlande).some((a) => a.mech?.kind === 'summon' && a.mech.shape === 'wall')).toBe(true);
    expect(props('niederlande').has('fass')).toBe(true);
    // Deutschland: unverwundbare Frontal-Deckung und Schockwellen-Stampfer (Ringe)
    expect(kinds('deutschland').has('guard')).toBe(true);
    expect(allBossAttacks(RAID_BOSSES.deutschland).some((a) => a.label === 'Schockwellen-Stampfer' && a.zones!.every((z) => z.shape === 'ring'))).toBe(true);
    // Frankreich: Ausfallschritte, Parier-Konter, Königsgarde
    expect(kinds('frankreich').has('lunge')).toBe(true);
    expect(kinds('frankreich').has('counter')).toBe(true);
    expect(allBossAttacks(RAID_BOSSES.frankreich).some((a) => a.mech?.kind === 'summon' && a.mech.label === 'Königsgarde')).toBe(true);
    // Kurogane: Doppelkatana-Schattenschnitt (gekreuzte Linien), dunkle Feuerwellen (Ringe), Teleport-Dash
    expect(kinds('kurogane').has('blink')).toBe(true);
    expect(allBossAttacks(RAID_BOSSES.kurogane).some((a) => a.label === 'Schattenschnitt' && a.zones!.length === 2)).toBe(true);
    expect(allBossAttacks(RAID_BOSSES.kurogane).some((a) => a.label === 'Dunkle Feuerwelle' && a.zones!.filter((z) => z.shape === 'ring').length >= 2)).toBe(true);
    expect(RAID_BOSSES.kurogane.def.weapon).toBe('doppel');
    // Marine: Kanonenfaust, Seestein-Ketten (Fesselung), Elite-Verstärkung
    expect(allBossAttacks(RAID_BOSSES.marine).some((a) => a.zones!.some((z) => z.bind && z.bind.dur > 0 && z.bind.slow > 0))).toBe(true);
    expect(allBossAttacks(RAID_BOSSES.marine).some((a) => a.mech?.kind === 'summon')).toBe(true);
    expect(props('marine').has('kette')).toBe(true);
  });

  it('Verstärkung der Bosse sind Verbände (instanziert), keine Einzelfiguren', () => {
    for (const id of POWERS) for (const a of allBossAttacks(RAID_BOSSES[id])) if (a.mech?.kind === 'summon') { expect(a.mech.what).toBe('squad'); expect(a.mech.heads ?? 8).toBeLessThanOrEqual(12); }
  });

  it('jeder Boss trägt sein eigenes Beute-Set mit Kopfbedeckung und Waffe aus Blender', () => {
    const seen = new Set<string>();
    for (const id of POWERS) {
      const d = RAID_BOSSES[id].def;
      expect(d.kit).toBe(bossSetId(id));
      expect(seen.has(d.kit!)).toBe(false); seen.add(d.kit!);
      const set = GEAR_SET_BY_ID[d.kit!];
      expect(set, id).toBeDefined();
      expect(set.raid).toBe(true);
      expect(set.rarity).toBe('legendaer');
      expect(set.pieces.head, `${id} Kopf`).toBeDefined();
      expect(set.pieces.mainhand, `${id} Waffe`).toBeDefined();
      for (const piece of Object.values(set.pieces)) for (const part of piece!.parts) {
        const m = (part as { model?: string }).model;
        if (m?.startsWith('bosses/')) expect(existsSync(join(__dirname, '..', 'public', 'models', `${m}.glb`)), m).toBe(true);
      }
    }
    expect(GEAR_SET_BY_ID.boss_kurogane.pieces.offhand).toBeDefined();   // Doppelklinge
    expect(GEAR_SET_BY_ID.boss_england.pieces.offhand).toBeDefined();    // Pistole
  });

  it('Boss-Sets fallen nie aus zufälliger Beute und werden von normalen Gegnern nicht getragen', () => {
    expect(SETS.filter((s) => s.raid).length).toBe(6);
    for (let i = 0; i < 300; i++) {
      for (const r of ['gewoehnlich', 'selten', 'episch', 'legendaer'] as const) {
        const d = rollLootGear(r, 80, [], Math.random);
        expect(d?.set?.startsWith('boss_') ?? false).toBe(false);
      }
      for (const id of gearForNpc(60, 'boss', false)) expect(id.startsWith('boss_')).toBe(false);
    }
  });
});

describe('Hauptmänner mit Aura', () => {
  it('vier je Macht, jeder mit eigener Aura, schwer gepanzert', () => {
    for (const id of POWERS) {
      expect(CAPTAINS[id].length).toBe(4);
      expect(new Set(CAPTAINS[id].map((c) => c.aura)).size).toBe(4);
      for (let i = 0; i < 4; i++) {
        const d = captainDef(id, i);
        expect(d.raid).toBe('captain');
        expect(d.armor).toBeGreaterThanOrEqual(0.25);
        expect(d.aura).toBeDefined();
        expect(d.hp).toBeGreaterThan(500);
      }
    }
    expect(Object.keys(AURAS).sort()).toEqual(['bollwerk', 'eilmarsch', 'feldscher', 'schlachtruf']);
    expect(AURAS.schlachtruf.dmg).toBeGreaterThan(1);
    expect(AURAS.bollwerk.taken).toBeLessThan(1);
    expect(AURAS.eilmarsch.speed).toBeGreaterThan(1);
    expect(AURAS.feldscher.regen).toBeGreaterThan(0);
  });
});

// ---------- Layout: Verbände und Hauptmänner ----------

describe('Raid-Layout: Verbände und Hauptmänner', () => {
  const lay = (id: FactionId) => buildRaidLayout(id, 4711, 1.3);
  const landOk = (l: ReturnType<typeof lay>, x: number, z: number) => Math.hypot(x, z) < l.r * 1.25;

  it('Route B: vier Hauptmänner, Route A: drei; Verbände in jedem Viertel, im Burghof und am Tor', () => {
    for (const id of POWERS) {
      const l = lay(id);
      const b = l.captains.filter((c) => c.route === 'B' || c.route === 'both');
      const a = l.captains.filter((c) => c.route === 'A' || c.route === 'both');
      expect(b.length, id).toBe(4);
      expect(a.length, id).toBe(3);
      expect(new Set(b.map((c) => c.index)).size, id).toBe(4);       // vier verschiedene Auren
      expect(new Set(a.map((c) => c.index)).size, id).toBe(3);
      for (const d of l.districts) expect(d.squads.length, `${id}/${d.districtId}`).toBeGreaterThanOrEqual(3);
      expect(l.castle.squads.length, id).toBe(6);
      expect(l.gateSquads.length, id).toBe(2);
      const headsB = l.districts.reduce((n, d) => n + d.squads.reduce((m, q) => m + q.heads, 0), 0) + l.castle.squads.reduce((m, q) => m + q.heads, 0);
      expect(headsB, id).toBeGreaterThan(150);                       // dichte Massen statt weniger Einzelner
      for (const q of [...l.castle.squads, ...l.gateSquads, ...l.districts.flatMap((d) => d.squads)]) { expect(q.heads).toBeLessThanOrEqual(12); expect(landOk(l, q.x, q.z), q.squadId).toBe(true); }
      for (const c of l.captains) expect(landOk(l, c.x, c.z), c.captainId).toBe(true);
    }
  });

  it('bleibt deterministisch und reine JSON-Daten', () => {
    expect(lay('deutschland')).toEqual(lay('deutschland'));
    const l = lay('kurogane');
    expect(JSON.parse(JSON.stringify(l))).toEqual(l);
  });

  it('die Zählung der Viertel enthält Verbände und Hauptmänner', () => {
    const l = lay('england');
    const ctx = createRaidContext({ raidInstanceId: 'r1', factionId: 'england', seed: 1, leaderPlayerId: 'p1' });
    const s = new RaidInstanceSession(ctx, l);
    for (const d of l.districts) {
      const expected = d.waves.reduce((n, w) => n + w.kinds.length, 0) + d.perches.length + d.squads.reduce((n, q) => n + q.heads, 0) + l.captains.filter((c) => c.post === d.districtId).length;
      expect(s.district(d.districtId)!.total, d.districtId).toBe(expected);
    }
  });

  it('Boss-Phasen laufen über die Sitzung (nie rückwärts)', () => {
    const l = lay('marine');
    const s = new RaidInstanceSession(createRaidContext({ raidInstanceId: 'r2', factionId: 'marine', seed: 2, leaderPlayerId: 'p1' }), l);
    const ev: string[] = [];
    s.on((e) => { if (e.type === 'boss') ev.push(`${e.what}:${e.phase}`); });
    s.bossAppeared('valken');
    s.bossPhaseChanged(2);
    s.bossPhaseChanged(1);
    s.bossPhaseChanged(2);
    expect(ev).toEqual(['appeared:1', 'phase:2']);
  });
});

// ---------- Verbände der Verteidiger ----------

describe('Verbände der Verteidiger (hostile TroopSquad)', () => {
  const world = (foes: TroopFoe[]): TroopWorld => ({
    enemies: () => foes,
    hit: () => {},
    ground: { height: () => 0, constrain: (x, z) => ({ x, z }) },
    nav: () => null,
  });
  const mk = (typ: 'schwert' | 'musketier' = 'schwert') => {
    const q = new TroopSquad(typ, 8, 17, 'horde');
    q.hostile = true; q.aggroR = 22; q.commandState = 'halten';
    q.place(0, 0, 0, world([]).ground);
    return q;
  };

  it('steht auf Posten, rückt erst bei Nähe vor und kehrt zurück', () => {
    const foe: TroopFoe & { x: number; z: number; alive: boolean } = { x: 60, z: 0, radius: 0.5, alive: true };
    const w = world([foe]);
    const q = mk();
    for (let i = 0; i < 120; i++) q.update(1 / 60, { x: 0, z: 0, yaw: 0 }, w, []);
    expect(Math.hypot(q.x, q.z)).toBeLessThan(1);             // Ziel außerhalb des Aggro-Radius: bleibt stehen
    foe.x = 15;
    for (let i = 0; i < 240; i++) q.update(1 / 60, { x: 0, z: 0, yaw: 0 }, w, []);
    expect(q.x).toBeGreaterThan(4);                           // rückt vor
    expect(q.engaged).toBe(true);
    foe.alive = false;
    for (let i = 0; i < 1800; i++) q.update(1 / 60, { x: 0, z: 0, yaw: 0 }, w, []);
    expect(Math.hypot(q.x, q.z)).toBeLessThan(2);             // zurück am Posten
  });

  it('Treffer alarmieren den Verband (doppelter Radius) und Auren wirken', () => {
    const q = mk();
    q.receive(10, 1, 0);
    expect(q.alertT).toBeGreaterThan(0);
    const hp = q.hp;
    q.auraTaken = 0.5;
    q.receive(40, 1, 0);
    expect(hp - q.hp).toBeCloseTo(20);
  });

  it('Verluste laufen über Köpfe der Entität, nicht über Einzelfiguren', () => {
    const q = mk();
    const heads = q.heads;
    q.receive(q.hp * 0.5, 1, 0);
    expect(q.heads).toBeLessThan(heads);
    expect(q.lostHeads).toBe(heads - q.heads);
    q.receive(q.hp * 10, 1, 0);
    expect(q.heads).toBe(0);
    expect(q.alive).toBe(false);
  });

  it('Wachen der Besatzung schreiten ihre Wegpunkte der Reihe nach ab', () => {
    const q = new TroopSquad('schwert', 4, 15, 'wache');
    q.aggroR = 18; q.commandState = 'halten';
    q.place(0, 0, 0, world([]).ground);
    q.patrol = [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 30 }];
    const w = world([]);
    let maxX = 0, maxZ = 0;
    for (let i = 0; i < 60 * 80; i++) { q.update(1 / 60, { x: 0, z: 0, yaw: 0 }, w, []); maxX = Math.max(maxX, q.x); maxZ = Math.max(maxZ, q.z); }
    expect(maxX).toBeGreaterThan(25);
    expect(maxZ).toBeGreaterThan(25);
  });
});

// ---------- Persönliche Beute ----------

describe('Persönliche Raid-Beute', () => {
  const ctx2 = () => {
    const c = createRaidContext({ raidInstanceId: 'raid-albion-xyz', factionId: 'england', seed: 5, leaderPlayerId: 'p1' });
    c.participants.push({ playerId: 'p2', flagshipId: null, escorts: 0, mercenaries: 0, leader: false, alive: true, slotId: null, structureDamage: 2000, shipsSunk: 2, kills: 14 });
    c.participants[0].kills = 30; c.participants[0].structureDamage = 9000;
    return c;
  };
  const none = { gear: [] as string[], sails: [] as string[], ornaments: [] as string[] };

  it('ist deterministisch je (Instanz, Teilnehmer, Boss)', () => {
    const c = ctx2();
    const a = rollPersonalLoot({ ctx: c, participantId: 'p1', level: 17, conquestsBefore: 0, owned: none, firstClear: true });
    const b = rollPersonalLoot({ ctx: c, participantId: 'p1', level: 17, conquestsBefore: 0, owned: none, firstClear: true });
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('jeder Teilnehmer bekommt seine eigene Beute (kein geteilter Wurf)', () => {
    const c = ctx2();
    const all = rollRaidLoot(c, { level: 17, conquestsBefore: 0, owned: none, firstClear: true });
    expect(all.map((l) => l.participantId)).toEqual(['p1', 'p2']);
    // p2 besitzt schon die Waffe: nur seine Beute ändert sich, die von p1 nicht
    const mh = `${bossSetId('england')}_mainhand`;
    const mixed = rollRaidLoot(c, { level: 17, conquestsBefore: 0, owned: none, firstClear: true, ownedBy: (id) => (id === 'p2' ? { ...none, gear: [mh] } : none) });
    expect(mixed[0]).toEqual(all[0]);
    expect(mixed[1].items.some((i) => i.id === mh)).toBe(false);
    // Gold und Erfahrung folgen dem Beitrag: der fleißigere Teilnehmer bekommt mehr
    const gold = (l: (typeof all)[number]) => l.items.find((i) => i.kind === 'gold' && i.fresh)!.amount!;
    expect(gold(all[0])).toBeGreaterThan(gold(all[1]));
    expect(contributionOf(c, 'p2')).toBeGreaterThanOrEqual(0.6);
    expect(contributionOf(c, 'nobody')).toBe(0);
  });

  it('Boss-Stücke fallen nur mit kleiner Chance (8 – 15 %), jeder Sieg gibt sicher Siegel und Splitter', () => {
    const N = 4000;
    const hits: Record<string, number> = {};
    let sealsFirst = 0, shardsMin = 99, shardsMax = 0;
    for (let n = 0; n < N; n++) {
      const c = createRaidContext({ raidInstanceId: `raid-x-${n}`, factionId: 'england', seed: n, leaderPlayerId: 'p1' });
      const l = rollPersonalLoot({ ctx: c, participantId: 'p1', level: 17, conquestsBefore: 0, owned: none, firstClear: true });
      for (const g of l.items.filter((i) => i.kind === 'gear')) hits[g.id] = (hits[g.id] ?? 0) + 1;
      const seal = l.items.find((i) => i.kind === 'seal')!;
      sealsFirst = seal.amount!;
      expect(seal.id).toBe('seal:england');
      const sh = l.items.find((i) => i.kind === 'shard')!.amount!;
      shardsMin = Math.min(shardsMin, sh); shardsMax = Math.max(shardsMax, sh);
    }
    expect(sealsFirst).toBe(SEAL_DROP.first);
    expect(shardsMin).toBe(SEAL_DROP.shardsMin);
    expect(shardsMax).toBe(SEAL_DROP.shardsMax);
    for (const p of BOSS_PIECES) {
      const id = `${bossSetId('england')}_${p}`;
      if (!EQUIP_BY_ID[id]) continue;
      const rate = (hits[id] ?? 0) / N;
      expect(rate, id).toBeGreaterThan(BOSS_DROP_CHANCE[p] - 0.025);
      expect(rate, id).toBeLessThan(BOSS_DROP_CHANCE[p] + 0.025);
      expect(BOSS_DROP_CHANCE[p], id).toBeGreaterThanOrEqual(0.08);
      expect(BOSS_DROP_CHANCE[p], id).toBeLessThanOrEqual(0.15);
    }
  });

  it('Segel bei der ersten Eroberung, Verzierung bei der zweiten, nie doppelt; Siegel jedes Mal', () => {
    const c = ctx2();
    const first = rollPersonalLoot({ ctx: c, participantId: 'p1', level: 17, conquestsBefore: 0, owned: none, firstClear: true });
    expect(first.items.some((i) => i.kind === 'sail' && i.id === sailId('england'))).toBe(true);
    expect(first.items.some((i) => i.kind === 'ornament')).toBe(false);
    const second = rollPersonalLoot({ ctx: c, participantId: 'p1', level: 17, conquestsBefore: 1, owned: { gear: [], sails: [sailId('england')], ornaments: [] }, firstClear: false });
    expect(second.items.some((i) => i.kind === 'ornament' && i.id === ornamentId('england'))).toBe(true);
    expect(second.items.some((i) => i.kind === 'sail')).toBe(false);
    expect(second.items.find((i) => i.kind === 'seal')!.amount).toBe(SEAL_DROP.repeat);
  });

  it('sind alle Teile des Sets erbeutet, fällt kein Stück mehr, Siegel und Splitter bleiben', () => {
    const c = ctx2();
    const all = BOSS_PIECES.map((p) => `${bossSetId('england')}_${p}`).filter((id) => EQUIP_BY_ID[id]);
    const l = rollPersonalLoot({ ctx: c, participantId: 'p1', level: 17, conquestsBefore: 4, owned: { gear: all, sails: [sailId('england')], ornaments: [ornamentId('england')] }, firstClear: false });
    expect(l.items.some((i) => i.kind === 'gear')).toBe(false);
    expect(l.items.some((i) => i.kind === 'seal')).toBe(true);
    expect(l.items.some((i) => i.kind === 'shard')).toBe(true);
  });

  it('jede Macht hat ein vollständiges Boss-Set mit den vorgesehenen Teilen', () => {
    for (const id of POWERS) {
      const set = GEAR_SET_BY_ID[bossSetId(id)];
      expect(Object.keys(set.pieces).length, id).toBeGreaterThanOrEqual(5);
      expect(EQUIP_BY_ID[`${set.id}_head`], id).toBeDefined();
    }
  });
});

// ---------- Besatzung ----------

describe('Insel-Besatzung', () => {
  const T0 = 1000;
  it('dauert 25 Minuten aktiver Spielzeit und endet in der Rückeroberung', () => {
    const r = beginOccupation(undefined, 'albion', 'england', T0);
    expect(OCCUPATION.minutes).toBe(25);
    expect(r.conquestCount).toBe(1);
    expect(r.occupiedUntil).toBe(T0 + 25 * 60);
    expect(isOccupied(r, T0 + 100)).toBe(true);
    expect(remaining(r, T0 + 60)).toBe(25 * 60 - 60);
    expect(phase(r, T0 + 60)).toBe('held');
    expect(phase(r, T0 + 25 * 60 - 299)).toBe('endgame');          // unter 5 Minuten
    expect(phase(r, T0 + 25 * 60 + 1)).toBe('free');
    expect(isLost(r, T0 + 25 * 60)).toBe(true);
  });

  it('schickt in den letzten 5 Minuten die Flotte, die über die Zeit hinweg anrückt', () => {
    let r = beginOccupation(undefined, 'albion', 'england', T0);
    expect(fleetDue(r, T0 + 600)).toBe(false);
    const t = T0 + 25 * 60 - 299;
    expect(fleetDue(r, t)).toBe(true);
    r = dispatchFleet(r, t);
    expect(r.counter).toBe('inbound');
    expect(fleetDue(r, t + 10)).toBe(false);                         // nur einmal
    expect(fleetProgress(r, t)).toBe(0);
    expect(fleetProgress(r, t + OCCUPATION.fleetTravel / 2)).toBeCloseTo(0.5);
    expect(fleetProgress(r, t + 999)).toBe(1);
    expect(fleetShips(r)).toBeGreaterThanOrEqual(3);
  });

  it('abgewehrte Flotte verlängert die Besatzung (bis zum Höchstwert) und bringt Ehre', () => {
    let r = beginOccupation(undefined, 'albion', 'england', T0);
    const t = T0 + 25 * 60 - 200;
    r = dispatchFleet(r, t);
    const before = r.occupiedUntil!;
    const res = repelFleet(r, t + 60);
    expect(res.rec.occupiedUntil).toBe(before + OCCUPATION.extension);
    expect(res.rec.counter).toBe('none');
    expect(res.rec.extensions).toBe(1);
    expect(res.extended).toBe(10 * 60);
    expect(res.fame).toBeGreaterThan(100);
    // nach der Verlängerung kommt die nächste, stärkere Flotte erst wieder im Endspurt
    expect(fleetDue(res.rec, t + 61)).toBe(false);
    expect(fleetDue(res.rec, res.rec.occupiedUntil! - 200)).toBe(true);
    expect(fleetShips(res.rec)).toBeGreaterThan(fleetShips(r) - 1);
    // Höchstzahl der Verlängerungen
    let x = res.rec;
    for (let i = 0; i < 10; i++) x = repelFleet(dispatchFleet(x, t), t).rec;
    expect(x.extensions).toBe(OCCUPATION.maxExtensions);
  });

  it('bei Rückeroberung bleiben Zählung und Freischaltungen – der Raid ist wieder frisch spielbar', () => {
    let r = beginOccupation(undefined, 'albion', 'england', T0);
    r = dispatchFleet(r, T0 + 1300);
    const lost = loseIsland(r);
    expect(lost.occupiedUntil).toBeNull();
    expect(lost.conquestCount).toBe(1);                              // geht nie verloren
    expect(lost.counter).toBe('none');
    expect(isOccupied(lost, T0 + 2000)).toBe(false);
    const again = beginOccupation(lost, 'albion', 'england', T0 + 5000);
    expect(again.conquestCount).toBe(2);
    expect(again.occupiedUntil).toBe(T0 + 5000 + 25 * 60);
    // ein besetztes Eiland ist kein Raid-Ziel, ein zurückerobertes schon
    expect(raidAccess('england', { marineStanding: 0, occupied: true }).allowed).toBe(false);
    expect(raidAccess('england', { marineStanding: 0, occupied: true }).safeBase).toBe(true);
    expect(raidAccess('england', { marineStanding: 0, occupied: false }).allowed).toBe(true);
  });

  it('Tribut kommt regelmäßig, nie gebündelt', () => {
    let r = beginOccupation(undefined, 'albion', 'england', T0);
    expect(tributeDue(r, T0 + 60)).toBe(false);
    expect(tributeDue(r, T0 + OCCUPATION.tributeEvery)).toBe(true);
    r = payTribute(r, T0 + OCCUPATION.tributeEvery + 5);
    expect(tributeDue(r, T0 + OCCUPATION.tributeEvery + 6)).toBe(false);
    const t = tributeAmount(17, 3);
    expect(t.gold).toBeGreaterThan(400);
    expect(t.proviant).toBeGreaterThanOrEqual(1);
  });

  it('Anzeige: Countdown und Ingame-Tage', () => {
    const r = beginOccupation(undefined, 'albion', 'england', T0);
    expect(clockText(24 * 60 + 10)).toBe('24:10');
    const v = viewOf(r, 'Albion', T0 + 30, 3);
    expect(v.text).toContain('24:30');
    expect(v.text).toContain('Ingame-Tage');
    expect(v.fleetLeft).toBe(3);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });

  it('säubert fremde und alte Daten', () => {
    const c = cleanConquest({ albion: { factionId: 'england', conquestCount: 2.7, occupiedUntil: 'x', counter: 'kaputt' }, kaputt: 5 });
    expect(c.albion.conquestCount).toBe(2);
    expect(c.albion.occupiedUntil).toBeNull();
    expect(c.albion.counter).toBe('none');
    expect(c.kaputt).toBeUndefined();
    expect(cleanUnlocks({ sails: ['sail:england', 3, 'sail:england'], ornaments: 'x' })).toEqual({ sails: ['sail:england'], ornaments: [], bossLoot: [], seals: {}, shards: 0 });
    expect(newRecord('x', 'england').occupiedUntil).toBeNull();
  });
});

// ---------- Spielstand ----------

describe('Spielstand Version 13 (abwärtskompatibel)', () => {
  it('ältere Spielstände laden weiter und bekommen leere Besatzungs-Felder', () => {
    expect(SAVE_VERSION).toBe(16);
    const old = { ...createSave('Alt', 'pirat', V), version: 12 } as Record<string, any>;
    delete old.progress.conquest;
    delete old.progress.unlocks;
    const r = migrateSave(old, V);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.version).toBe(SAVE_VERSION);
    expect(r.data.progress.conquest).toEqual({});
    expect(r.data.progress.unlocks).toEqual({ sails: [], ornaments: [], bossLoot: [], seals: {}, shards: 0 });
    expect(r.migratedFrom).toBe(12);
  });

  it('Besatzungs-Timer, Eroberungen, Segel und Boss-Beute überstehen Speichern und Laden', () => {
    const s = createSave('Neu', 'pirat', V);
    s.progress.conquest = { albion: beginOccupation(undefined, 'albion', 'england', 500) };
    s.progress.unlocks = { sails: ['sail:england'], ornaments: [], bossLoot: ['boss_england_mainhand'], seals: { england: 3 }, shards: 4 };
    const r = migrateSave(JSON.parse(JSON.stringify(s)), V);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.progress.conquest!.albion.occupiedUntil).toBe(500 + 25 * 60);
    expect(r.data.progress.conquest!.albion.conquestCount).toBe(1);
    expect(r.data.progress.unlocks!.sails).toEqual(['sail:england']);
    expect(r.data.progress.unlocks!.bossLoot).toEqual(['boss_england_mainhand']);
    expect(r.migratedFrom).toBeNull();
  });

  it('Migration 12 → 13 verändert nichts Vorhandenes', () => {
    const d = MIGRATIONS[12]({ version: 12, progress: { flags: { a: 1 }, standing: { marine: 5 }, conquest: { x: { islandId: 'x', factionId: 'kurogane', conquestCount: 3, occupiedUntil: 99 } } } });
    expect(d.version).toBe(13);
    expect(d.progress.flags.a).toBe(1);
    expect(d.progress.standing.marine).toBe(5);
    expect(d.progress.conquest.x.conquestCount).toBe(3);
    expect(d.progress.conquest.x.occupiedUntil).toBe(99);
  });
});
