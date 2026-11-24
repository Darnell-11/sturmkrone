import { describe, expect, it } from 'vitest';
import {
  BERNSTEIN_OWNERS, BORDER_FORTS, BORDERS, CITADELS, FACTION_IDS, FACTIONS, MARINE_ALLY_AT, SECTORS, STANDING_MAX, STANDING_MIN,
  borderDistance, clampStanding, marineStance, sectorAt, sectorIndexAt, START_MARINE_STANDING,
} from '../src/data/factions';
import { BERNSTEINSEE, ISLAND_REACH, REGIONS, regionAt, seaLevelAt } from '../src/data/regions';
import { factionShipLook } from '../src/data/ships';
import { WORLD_CORE_RADIUS, WORLD_RADIUS, EDGE_WALL } from '../src/data/world';
import { createSave } from '../src/core/save/types';
import { MIGRATIONS, migrateSave } from '../src/core/save/migrations';
import { BATTLE, battleSite, borderAxes, borderCoords, compassWord, nextDelay, sideSize } from '../src/naval/battleRules';
import {
  REP, applyOutcome, attackedSide, battleOutcome, blueprintDiscount, cleanReputation, emptyReputation, harborDiscount, hasService, honorTitle, isHostile,
  isPeaceful, judgeBattle, newStats, repTier,
} from '../src/data/reputation';
import { ThreatTable } from '../src/combat/threat';
import { beginOccupation, dispatchFleet, fleetDue, isOccupied, loseIsland, phase, remaining, repelFleet } from '../src/raid/occupation';

const ALL = REGIONS.flatMap((r) => r.islands);

describe('Kuchenstücke', () => {
  it('teilen die Scheibe in fünf Sektoren zu je 72° ohne Lücke', () => {
    expect(SECTORS).toHaveLength(5);
    SECTORS.forEach((s, i) => {
      expect(s.sectorIndex).toBe(i);
      expect(s.toDeg - s.fromDeg).toBe(72);
      if (i) expect(s.fromDeg).toBe(SECTORS[i - 1].toDeg);
    });
    expect(SECTORS[0].fromDeg).toBe(-36);
    expect(SECTORS[4].toDeg).toBe(324);
    // jede Macht außer der Marine hat genau ein Kuchenstück
    expect(new Set(SECTORS.map((s) => s.factionId)).size).toBe(5);
    expect(FACTIONS.marine.sector).toBeNull();
  });

  it('ordnen jeden Punkt nach Winkel zu (0° = Norden, im Uhrzeigersinn)', () => {
    expect(sectorIndexAt(0, 100)).toBe(0);
    expect(sectorIndexAt(1000, 1000)).toBe(1);     // 45°
    expect(sectorIndexAt(1000, -300)).toBe(1);     // ~106,7°: noch Deutschland
    expect(sectorIndexAt(1000, -400)).toBe(2);     // ~111,8°: bei 108° beginnt Kurogane
    expect(sectorAt(1000, -1000).factionId).toBe('kurogane');   // 135°
    expect(sectorAt(-1000, -1000).factionId).toBe('niederlande'); // 225°
    expect(sectorAt(-1000, 300).factionId).toBe('frankreich');    // ~287°
    expect(sectorAt(-1000, 1000).factionId).toBe('frankreich');   // 315° = −45°: hinter der Grenze bei −36°
    expect(sectorAt(-500, 1000).factionId).toBe('england');       // −26,6°
  });

  it('stimmen mit den Meeren aus data/regions.ts überein (jede Ringinsel liegt im Kuchenstück ihrer Region)', () => {
    for (const s of SECTORS) {
      const reg = REGIONS.find((r) => r.id === s.regionId)!;
      expect(reg.arc, s.regionId).toEqual([s.fromDeg, s.toDeg]);
      for (const i of reg.islands) {
        expect(sectorIndexAt(i.x, i.z), i.id).toBe(s.sectorIndex);
        expect(i.sectorIndex, i.id).toBe(s.sectorIndex);
      }
    }
  });
});

describe('Inselbesitz', () => {
  it('lässt Ankerglück unabhängig und gibt allen anderen Inseln einen Besitzer', () => {
    const home = ALL.find((i) => i.id === 'ankerglueck')!;
    expect(home.factionId).toBeNull();
    for (const i of ALL) if (i.id !== 'ankerglueck') expect(i.factionId, i.id).toBeTruthy();
  });

  it('gibt den Glutring ganz Kurogane und Nordwacht ganz Deutschland', () => {
    for (const i of REGIONS.find((r) => r.id === 'glut')!.islands) expect(i.factionId, i.id).toBe(i.marine ? 'marine' : 'kurogane');
    for (const i of REGIONS.find((r) => r.id === 'nord')!.islands) expect(i.factionId, i.id).toBe(i.marine ? 'marine' : i.kind === 'citadel' ? 'deutschland' : 'deutschland');
    expect(REGIONS.find((r) => r.id === 'glut')!.islands.some((i) => i.id === 'glutberg')).toBe(true);
    expect(ALL.find((i) => i.id === 'festungnordwacht')!.factionId).toBe('deutschland');
  });

  it('verteilt die Bernsteinsee gleichmäßig auf England, Niederlande und Frankreich (je vier), nie auf Deutschland oder Kurogane', () => {
    const owners = Object.values(BERNSTEIN_OWNERS);
    for (const f of ['england', 'niederlande', 'frankreich']) expect(owners.filter((o) => o === f), f).toHaveLength(4);
    expect(owners.includes('deutschland' as never)).toBe(false);
    expect(owners.includes('kurogane' as never)).toBe(false);
    const ids = BERNSTEINSEE.islands.filter((i) => i.id !== 'ankerglueck').map((i) => i.id).sort();
    expect(Object.keys(BERNSTEIN_OWNERS).sort()).toEqual(ids);
  });

  it('merkt Kolonien: Besitzer ≠ Macht des Kuchenstücks', () => {
    const ex = ALL.filter((i) => i.exclave).map((i) => i.id).sort();
    expect(ex).toEqual(['bernsteinbucht', 'faehrholm', 'kraehenfels', 'leuchtfeuer', 'palmenkueste', 'rabenriff']);
    for (const i of ALL) if (!i.exclave && i.factionId && i.factionId !== 'marine') expect(sectorAt(i.x, i.z).factionId, i.id).toBe(i.factionId);
  });
});

describe('Marine: Grenzfestungen und Hauptquartier', () => {
  it('setzt je eine Festung exakt auf jede der fünf Grenzlinien', () => {
    expect(BORDERS).toHaveLength(5);
    expect(BORDER_FORTS).toHaveLength(5);
    for (const f of BORDER_FORTS) {
      const isl = ALL.find((i) => i.id === f.id)!;
      expect(isl.kind).toBe('marinefort');
      expect(isl.marine).toBe('border');
      expect(isl.factionId).toBe('marine');
      expect(borderDistance(isl.x, isl.z).borderIndex).toBe(f.borderIndex);
      // Mittelpunkt liegt auf der Linie (nur Rundung auf ganze Meter)
      expect(borderDistance(isl.x, isl.z).dist, f.id).toBeLessThan(1);
    }
    expect(new Set(BORDER_FORTS.map((f) => f.borderIndex)).size).toBe(5);
  });

  it('trennt jede Grenzlinie zwei verschiedene Mächte', () => {
    for (const b of BORDERS) expect(b.between[0]).not.toBe(b.between[1]);
  });

  it('setzt sechs Endgame-Inseln an den äußeren Rand: je eine im Kuchenstück der Macht, dazu das Hauptquartier', () => {
    expect(CITADELS).toHaveLength(6);
    const power = CITADELS.filter((c) => c.factionId !== 'marine');
    expect(power.map((c) => c.factionId).sort()).toEqual(['deutschland', 'england', 'frankreich', 'kurogane', 'niederlande']);
    for (const c of power) {
      const isl = ALL.find((i) => i.id === c.id)!;
      expect(isl.kind).toBe('citadel');
      expect(sectorAt(isl.x, isl.z).factionId).toBe(c.factionId);
      expect(isl.r).toBeGreaterThanOrEqual(300);
      expect(Math.hypot(isl.x, isl.z)).toBeGreaterThan(WORLD_CORE_RADIUS);
    }
    const hq = ALL.find((i) => i.id === 'weisswacht')!;
    expect(hq.marine).toBe('hq');
    expect(hq.factionId).toBe('marine');
    expect(Math.hypot(hq.x, hq.z)).toBeGreaterThan(Math.hypot(...[ALL.find((i) => i.id === 'albion')!].map((i) => [i.x, i.z] as [number, number])[0]));
  });

  it('hält alle neuen Inseln vor dem erweiterten Weltrand', () => {
    expect(WORLD_RADIUS).toBeGreaterThan(WORLD_CORE_RADIUS);
    expect(EDGE_WALL).toBe(WORLD_RADIUS - 70);
    for (const i of ALL) expect(Math.hypot(i.x, i.z) + i.r * ISLAND_REACH, i.id).toBeLessThan(WORLD_RADIUS - 60);
  });

  it('liegt hinter den Grenzfestungen im stärksten Meer (bis +4)', () => {
    const c = ALL.find((i) => i.id === 'albion')!;
    expect(seaLevelAt(c.x, c.z)).toBeGreaterThan(seaLevelAt(0, 3000) - 1);
    expect(seaLevelAt(c.x, c.z)).toBe(regionAt(c.x, c.z).level! + 4);
  });
});

describe('Ansehen bei der Marine', () => {
  it('kennt drei Haltungen: verbündet ab 20, neutral von 0 bis 19, feindlich darunter', () => {
    expect(marineStance(MARINE_ALLY_AT)).toBe('verbuendet');
    expect(marineStance(100)).toBe('verbuendet');
    expect(marineStance(19)).toBe('neutral');
    expect(marineStance(0)).toBe('neutral');
    expect(marineStance(-1)).toBe('feindlich');
    expect(marineStance(-100)).toBe('feindlich');
  });

  it('klemmt das Ansehen auf −100 … 100 und lässt Piraten als Gesetzlose, Marine-Anwärter als Freunde starten', () => {
    expect(clampStanding(500)).toBe(STANDING_MAX);
    expect(clampStanding(-500)).toBe(STANDING_MIN);
    expect(marineStance(START_MARINE_STANDING.pirat)).toBe('feindlich');
    expect(marineStance(START_MARINE_STANDING.marine)).toBe('verbuendet');
    expect(createSave('A', 'pirat', 'x').progress.standing.marine).toBe(START_MARINE_STANDING.pirat);
    expect(createSave('A', 'marine', 'x').progress.standing.marine).toBe(START_MARINE_STANDING.marine);
  });

  it('migriert Spielstände von Version 11: Ansehen aus dem Lager der Spielfigur', () => {
    const old = { ...createSave('Fynn', 'pirat', 'x'), version: 11 } as Record<string, any>;
    delete old.progress.standing;
    expect(MIGRATIONS[11](old).progress.standing.marine).toBe(-40);
    const marine = { ...createSave('Ada', 'marine', 'x'), version: 11 } as Record<string, any>;
    delete marine.progress.standing;
    const r = migrateSave(marine, 'x');
    expect(r.ok && r.data.progress.standing.marine).toBe(60);
  });
});

describe('Heraldik und Serialisierung', () => {
  it('gibt jeder Macht einen eigenen Rumpf, ein eigenes Segeltuch und Muster (auf See sofort zu unterscheiden)', () => {
    const looks = FACTION_IDS.map((id) => factionShipLook(id));
    expect(new Set(looks.map((l) => `${l.hull}|${l.sail}`)).size).toBe(6);
    expect(new Set(FACTION_IDS.map((id) => FACTIONS[id].ship.pattern)).size).toBe(6);
    expect(new Set(FACTION_IDS.map((id) => FACTIONS[id].ship.emblem)).size).toBe(6);
    for (const l of looks) expect(l.power).toBeTruthy();
    // England dunkelbraun/gold mit weißen Segeln, Kurogane pechschwarz mit blutroten Segeln, Marine weiß mit blauem Streifen
    expect(factionShipLook('england')).toMatchObject({ hull: '#5A3A1E', stripe: '#E3B04B', sail: '#FBF7EA' });
    expect(factionShipLook('kurogane')).toMatchObject({ hull: '#0C0A0E', sail: '#8E1010' });
    expect(factionShipLook('marine')).toMatchObject({ hull: '#F2F4F6', stripe: '#16306A' });
  });

  it('bleibt strikt JSON-serialisierbar (factionId, islandId, sectorIndex) für Welt-Shards', () => {
    const roundTrip = <T,>(v: T) => JSON.parse(JSON.stringify(v)) as T;
    expect(roundTrip(FACTIONS)).toEqual(FACTIONS);
    expect(roundTrip(SECTORS)).toEqual(SECTORS);
    expect(roundTrip(BORDERS)).toEqual(BORDERS);
    expect(roundTrip(BORDER_FORTS)).toEqual(BORDER_FORTS);
    expect(roundTrip(CITADELS)).toEqual(CITADELS);
    expect(roundTrip(BERNSTEIN_OWNERS)).toEqual(BERNSTEIN_OWNERS);
    const ownership = ALL.map((i) => ({ islandId: i.id, factionId: i.factionId ?? null, sectorIndex: i.sectorIndex }));
    expect(roundTrip(ownership)).toEqual(ownership);
    expect(ownership.every((o) => typeof o.islandId === 'string' && typeof o.sectorIndex === 'number')).toBe(true);
    expect(roundTrip(factionShipLook('niederlande'))).toEqual(factionShipLook('niederlande'));
  });
});


// ---------- Sektor-Patrouillen und Seeschlachten an den Grenzen ----------

/** Reihe fester Zufallswerte (0 … 1), reihum */
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe('Sektor-Winkel und Grenzlinien', () => {
  it('führt Peilung (Norden 0°, im Uhrzeigersinn) und Linienachsen widerspruchsfrei: Punkte auf der Linie haben Abstand 0', () => {
    for (const b of BORDERS) {
      const { along, across } = borderAxes(b.borderIndex);
      expect(Math.hypot(along.x, along.z)).toBeCloseTo(1, 9);
      expect(along.x * across.x + along.z * across.z).toBeCloseTo(0, 9);
      const c = borderCoords(b.borderIndex, along.x * 3000, along.z * 3000);
      expect(c.along).toBeCloseTo(3000, 6);
      expect(c.across).toBeCloseTo(0, 6);
      expect(borderDistance(along.x * 3000, along.z * 3000).dist).toBeLessThan(1);
    }
  });

  it('trennt auf jeder Linie genau die beiden Mächte aus BORDERS: Seite 0 davor, Seite 1 dahinter', () => {
    for (const b of BORDERS) {
      const { along, across } = borderAxes(b.borderIndex);
      const at = (k: number) => sectorAt(along.x * 3600 + across.x * k, along.z * 3600 + across.z * k).factionId;
      expect(at(-120)).toBe(b.between[0]);
      expect(at(120)).toBe(b.between[1]);
      expect(b.between[0]).not.toBe(b.between[1]);
    }
  });

  it('wählt den Ort einer Seeschlacht auf der Linie, 640 bis 860 m vom Spieler entfernt', () => {
    for (const b of BORDERS) {
      const { along, across } = borderAxes(b.borderIndex);
      // Spieler 400 m neben der Linie, auf halber Länge des Schlachtbands
      const px = along.x * 3500 + across.x * 400, pz = along.z * 3500 + across.z * 400;
      for (const r of [0, 0.5, 0.99]) {
        const site = battleSite(px, pz, seq(r, 0.3));
        expect(site).not.toBeNull();
        if (!site) continue;
        expect(site.borderIndex).toBe(b.borderIndex);
        expect(borderCoords(b.borderIndex, site.x, site.z).across).toBeCloseTo(0, 6);
        const d = Math.hypot(site.x - px, site.z - pz);
        expect(d).toBeGreaterThanOrEqual(BATTLE.spawnMin - 0.01);
        expect(d).toBeLessThanOrEqual(BATTLE.spawnMax + 0.01);
        const along2 = borderCoords(b.borderIndex, site.x, site.z).along;
        expect(along2).toBeGreaterThanOrEqual(BATTLE.minAlong);
        expect(along2).toBeLessThanOrEqual(BATTLE.maxAlong);
        expect([site.a, site.b]).toEqual(b.between);
      }
    }
  });

  it('beginnt keine Schlacht fern der Grenze, in der Bernsteinsee oder am Weltrand', () => {
    expect(battleSite(0, 0)).toBeNull();
    const b0 = borderAxes(0);
    expect(battleSite(b0.along.x * 3500 + b0.across.x * 1500, b0.along.z * 3500 + b0.across.z * 1500)).toBeNull();
    expect(battleSite(b0.along.x * 800, b0.along.z * 800)).toBeNull();
    expect(battleSite(b0.along.x * (BATTLE.maxAlong + 900), b0.along.z * (BATTLE.maxAlong + 900))).toBeNull();
  });

  it('hält Abstand zur Grenzfestung (Riffe, Geschütze): nie näher als 320 m entlang der Linie', () => {
    for (const f of BORDER_FORTS) {
      const { along, across } = borderAxes(f.borderIndex);
      // Spieler genau bei der Festung: jeder Schlachtort läge 640 bis 860 m weiter entlang der Linie, also weit genug weg
      for (const r of [0, 0.3, 0.6, 0.99]) {
        const site = battleSite(along.x * f.radius + across.x * 200, along.z * f.radius + across.z * 200, seq(r, r));
        if (!site) continue;
        expect(Math.abs(borderCoords(f.borderIndex, site.x, site.z).along - f.radius)).toBeGreaterThanOrEqual(BATTLE.fortClear);
      }
      // wer nur wenig neben der Festung segelt, bekommt nie einen Ort in ihrem Schutzbereich zugewiesen
      for (const off of [-400, -200, 0, 200, 400]) {
        const site = battleSite(along.x * (f.radius + off), along.z * (f.radius + off), seq(0.5, 0.5));
        if (site) expect(Math.abs(borderCoords(f.borderIndex, site.x, site.z).along - f.radius)).toBeGreaterThanOrEqual(BATTLE.fortClear);
      }
    }
  });

  it('besetzt jede Seite mit 2 bis 3 Schiffen und wartet zwischen Schlachten 150 bis 240 s', () => {
    const sizes = new Set([sideSize(() => 0), sideSize(() => 0.49), sideSize(() => 0.5), sideSize(() => 0.99)]);
    expect([...sizes].sort()).toEqual([2, 3]);
    expect(nextDelay(false, () => 0)).toBe(150);
    expect(nextDelay(false, () => 1)).toBe(240);
    expect(nextDelay(true, () => 0)).toBe(30);
  });

  it('nennt die Himmelsrichtung wie der Kompass (Osten liegt bei −x)', () => {
    expect(compassWord(0, 0, 0, 500)).toBe('N');
    expect(compassWord(0, 0, 0, -500)).toBe('S');
    expect(compassWord(0, 0, -500, 0)).toBe('O');
    expect(compassWord(0, 0, 500, 0)).toBe('W');
    expect(compassWord(0, 0, -400, 400)).toBe('NO');
  });
});

describe('Fraktions-Ehre und Ansehen', () => {
  type Pid = (typeof FACTION_IDS)[number];
  const stats = (dmg: [number, number], sunk: [number, number], sides: [Pid, Pid] = ['england', 'frankreich']) => {
    const s = newStats(sides[0], sides[1], 200, 200);
    s.dmg = dmg; s.sunk = sunk;
    return s;
  };

  it('wertet eine Schlacht: nur eine Seite angegriffen = Partei ergriffen, beide = Doppelspiel, keine = unbeteiligt', () => {
    expect(judgeBattle(stats([0, 0], [0, 0])).kind).toBe('none');
    expect(judgeBattle(stats([10, 0], [0, 0])).kind).toBe('none');
    expect(attackedSide(stats([200 * REP.attackedFrac, 0], [0, 0]), 0)).toBe(true);
    expect(judgeBattle(stats([0, 0], [1, 0]))).toEqual({ kind: 'sided', backed: 1 });
    expect(judgeBattle(stats([0, 90], [0, 0]))).toEqual({ kind: 'sided', backed: 0 });
    expect(judgeBattle(stats([60, 60], [0, 0])).kind).toBe('both');
    expect(judgeBattle(stats([0, 0], [1, 1])).kind).toBe('both');
    // Streuschüsse (Kugeln, die am Ziel vorbeiflogen) machen noch kein Doppelspiel: die weniger getroffene Seite ist die unterstützte
    expect(judgeBattle(stats([300, 100], [1, 0]))).toEqual({ kind: 'sided', backed: 1 });
    expect(judgeBattle(stats([100, 300], [0, 1]))).toEqual({ kind: 'sided', backed: 0 });
    expect(judgeBattle(stats([300, 160], [1, 0])).kind).toBe('both');
  });

  it('Partei ergreifen: Ehre und Ansehen beim Verbündeten, Verstimmung bei der anderen Macht, mehr Versenkte mehr Lohn', () => {
    const one = battleOutcome(stats([0, 0], [1, 0]));
    expect(one.verdict).toEqual({ kind: 'sided', backed: 1 });
    expect(one.standing.frankreich).toBeGreaterThan(0);
    expect(one.honor.frankreich).toBeGreaterThan(0);
    expect(one.standing.england).toBeLessThan(0);
    expect(one.lootMult).toBe(1);
    expect(one.hunters).toEqual([]);
    expect(one.bounty).toEqual({});
    const two = battleOutcome(stats([0, 0], [2, 0]));
    expect(two.standing.frankreich!).toBeGreaterThan(one.standing.frankreich!);
    expect(two.standing.england!).toBeLessThan(one.standing.england!);
    expect(two.standing.frankreich!).toBeLessThanOrEqual(REP.sided.cap);
  });

  it('Hilfe gegen Kurogane gefällt auch der Marine', () => {
    const o = battleOutcome(stats([0, 0], [0, 2], ['deutschland', 'kurogane']));
    expect(o.verdict).toEqual({ kind: 'sided', backed: 0 });
    expect(o.standing.deutschland).toBeGreaterThan(0);
    expect(o.standing.marine).toBe(REP.sided.marineStanding);
    expect(o.honor.marine).toBe(REP.sided.marineHonor);
    expect(battleOutcome(stats([0, 0], [0, 2])).standing.marine).toBeUndefined();
  });

  it('Doppelspiel: maximaler Loot, Waren und Bauplan, aber Ansehensverlust, Kopfgeld und Jäger (auch die Marine)', () => {
    const o = battleOutcome(stats([90, 90], [1, 2]));
    expect(o.verdict.kind).toBe('both');
    expect(o.lootMult).toBe(REP.both.lootMult);
    expect(o.lootMult).toBeGreaterThan(2);
    expect(o.goods).toBe(REP.both.goods);
    expect(o.blueprint).toBe('bauplan_england');
    expect(o.standing.england).toBeLessThan(0);
    expect(o.standing.frankreich).toBeLessThan(0);
    expect(o.standing.marine).toBe(-REP.both.marinePenalty);
    expect(Math.abs(o.standing.frankreich!)).toBeGreaterThan(Math.abs(o.standing.england!));
    expect(o.bounty.england).toBe(REP.both.bounty + REP.both.bountyPerSunk);
    expect(o.bounty.frankreich).toBe(REP.both.bounty + 2 * REP.both.bountyPerSunk);
    expect(o.bounty.marine).toBeGreaterThan(0);
    expect(o.hunters).toEqual(expect.arrayContaining(['england', 'frankreich', 'marine']));
    expect(battleOutcome(stats([90, 90], [1, 1]), ['bauplan_england']).blueprint).toBe('bauplan_frankreich');
    expect(battleOutcome(stats([90, 90], [1, 1]), ['bauplan_england', 'bauplan_frankreich']).blueprint).toBeNull();
    const big = battleOutcome(stats([999, 999], [9, 9]));
    expect(Math.abs(big.standing.england!)).toBeLessThanOrEqual(REP.both.cap);
  });

  it('wendet Folgen auf den Spielstand an: Ehre wächst nur, Kopfgeld summiert sich, Pläne nie doppelt, Protokoll auf 8 begrenzt', () => {
    const rep = emptyReputation();
    const changes: Record<string, number> = {};
    const shift = (f: string, d: number) => { changes[f] = (changes[f] ?? 0) + d; };
    applyOutcome(rep, battleOutcome(stats([0, 0], [1, 0])), shift, 100, 'Partei');
    expect(rep.battles).toEqual({ joined: 1, sided: 1, both: 0 });
    expect(rep.honor.frankreich).toBeGreaterThan(0);
    const honor = rep.honor.frankreich!;
    applyOutcome(rep, battleOutcome(stats([0, 0], [0, 1])), shift, 200, 'Partei 2');
    expect(rep.honor.frankreich).toBe(honor);
    expect(rep.honor.england).toBeGreaterThan(0);
    applyOutcome(rep, battleOutcome(stats([90, 90], [1, 1]), rep.blueprints), shift, 300, 'Doppel');
    applyOutcome(rep, battleOutcome(stats([90, 90], [1, 1]), rep.blueprints), shift, 400, 'Doppel 2');
    expect(rep.battles).toEqual({ joined: 4, sided: 2, both: 2 });
    expect(rep.blueprints).toEqual(['bauplan_england', 'bauplan_frankreich']);
    expect(rep.bounty.england).toBe(2 * (REP.both.bounty + REP.both.bountyPerSunk));
    expect(changes.marine).toBe(-2 * REP.both.marinePenalty);
    for (let i = 0; i < 10; i++) applyOutcome(rep, battleOutcome(stats([0, 0], [1, 0])), shift, 500 + i, `T${i}`);
    expect(rep.log).toHaveLength(8);
    expect(rep.log[7].text).toBe('T9');
  });

  it('Stufen, friedliche Durchfahrt, Hafenrabatt, Dienststatus und Ehrentitel', () => {
    expect(repTier(-80).label).toBe('Erzfeind');
    expect(repTier(-10).label).toBe('Feindlich');
    expect(repTier(0).id).toBe('neutral');
    expect(repTier(20).id).toBe('freundlich');
    expect(repTier(70).id).toBe('ehrenbund');
    expect(isHostile(-1)).toBe(true);
    expect(isHostile(0)).toBe(false);
    expect(isPeaceful(REP.peaceAt - 1)).toBe(false);
    expect(isPeaceful(REP.peaceAt)).toBe(true);
    expect([0, 19, 20, 39, 40, 59, 60, 79, 80, 100].map(harborDiscount)).toEqual([0, 0, 0.05, 0.05, 0.1, 0.1, 0.15, 0.15, 0.2, 0.2]);
    expect(hasService(59)).toBe(false);
    expect(hasService(60)).toBe(true);
    expect(blueprintDiscount([])).toBe(0);
    expect(blueprintDiscount(['bauplan_england', 'bauplan_england'])).toBeCloseTo(REP.blueprintDiscount);
    expect(blueprintDiscount(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toBeCloseTo(REP.blueprintMax * REP.blueprintDiscount);
    expect(honorTitle(0)).toBe('Unbekannt');
    expect(honorTitle(900)).toBe('Ehrenmitglied');
  });

  it('säubert beschädigte Daten (Import, Migration)', () => {
    expect(cleanReputation(null)).toEqual(emptyReputation());
    const r = cleanReputation({ honor: { england: 12.7, foo: 5, frankreich: -3 }, bounty: { marine: '400', kurogane: NaN }, blueprints: ['bauplan_england', 7, 'bauplan_england'], battles: { joined: 3.9, sided: -1, both: 'x' }, log: [{ t: 5, text: 'a' }, 1, { text: 3 }] });
    expect(r.honor).toEqual({ england: 13 });
    expect(r.bounty).toEqual({ marine: 400 });
    expect(r.blueprints).toEqual(['bauplan_england']);
    expect(r.battles).toEqual({ joined: 3, sided: 0, both: 0 });
    expect(r.log).toEqual([{ t: 5, text: 'a' }]);
  });
});

describe('Spielstand Version 14 (Ruf und Ehre, abwärtskompatibel)', () => {
  const V = '2.9.93';
  it('ältere Spielstände laden weiter, behalten ihr Ansehen und bekommen leere Ehre-Felder', () => {
    const old = { ...createSave('Alt', 'pirat', V), version: 13 } as Record<string, any>;
    delete old.progress.reputation;
    old.progress.standing = { marine: 33, england: 12 };
    const r = migrateSave(old, V);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.version).toBe(15);
    expect(r.migratedFrom).toBe(13);
    expect(r.data.progress.reputation).toEqual(emptyReputation());
    expect(r.data.progress.standing).toEqual({ marine: 33, england: 12 });
  });

  it('Ehre, Kopfgeld und Baupläne überstehen Speichern und Laden; MIGRATIONS[13] hebt nur die Version', () => {
    const s = createSave('Neu', 'pirat', V);
    s.progress.reputation = { honor: { england: 40 }, bounty: { frankreich: 650 }, blueprints: ['bauplan_england'], battles: { joined: 2, sided: 1, both: 1 }, log: [{ t: 9, text: 'x' }] };
    const r = migrateSave(JSON.parse(JSON.stringify(s)), V);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.progress.reputation).toEqual(s.progress.reputation);
    expect(r.migratedFrom).toBeNull();
    const d = MIGRATIONS[13]({ version: 13, progress: { flags: { a: 1 }, standing: { marine: 5 } } });
    expect(d.version).toBe(14);
    expect(d.progress.flags.a).toBe(1);
    expect(d.progress.standing.marine).toBe(5);
    expect(d.progress.reputation.blueprints).toEqual([]);
  });
});

describe('Bedrohungs-Aggro (Schlachtzug-Regeln, Szenario)', () => {
  it('Tank hält die Aggro, Fernkämpfer überholt erst bei 130 %, Spott holt sie zurück, Tod entfernt aus der Tabelle', () => {
    const t = new ThreatTable();
    t.add('tank', 100);
    expect(t.pick()).toBe('tank');
    t.add('mage', 125, { ranged: true });
    expect(t.pick()).toBe('tank');
    t.add('mage', 10, { ranged: true });
    expect(t.pick()).toBe('mage');
    t.taunt('tank', 2);
    expect(t.pick()).toBe('tank');
    t.update(2.5);
    t.forget('tank');
    expect(t.pick()).toBe('mage');
    t.forget('mage');
    expect(t.pick()).toBeNull();
  });
});

describe('Besatzungs-Timer und Rückeroberung (Zustandsmaschine)', () => {
  it('25 Minuten Spielzeit, Flotte im Endspurt, Verlängerung bei Abwehr, Reset ohne Verlust von Zählung und Freischaltungen', () => {
    const T0 = 5000;
    let r = beginOccupation(undefined, 'glutinsel', 'kurogane', T0);
    expect(remaining(r, T0)).toBe(25 * 60);
    expect(phase(r, T0 + 600)).toBe('held');
    expect(fleetDue(r, T0 + 600)).toBe(false);
    const late = T0 + 25 * 60 - 250;
    expect(phase(r, late)).toBe('endgame');
    r = dispatchFleet(r, late);
    const until = r.occupiedUntil!;
    const repelled = repelFleet(r, late + 40);
    expect(repelled.rec.occupiedUntil!).toBeGreaterThan(until);
    const save = createSave('Test', 'pirat', '2.9.93');
    save.progress.unlocks = { sails: ['sail:kurogane'], ornaments: ['orn:kurogane'], bossLoot: ['boss_kurogane_hat'], seals: {}, shards: 0 };
    const lost = loseIsland(dispatchFleet(beginOccupation(undefined, 'glutinsel', 'kurogane', T0), late));
    save.progress.conquest = { glutinsel: lost };
    expect(isOccupied(lost, until + 10)).toBe(false);
    expect(lost.conquestCount).toBe(1);
    const back = migrateSave(JSON.parse(JSON.stringify(save)), '2.9.93');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.data.progress.unlocks).toEqual(save.progress.unlocks);
    expect(back.data.progress.conquest!.glutinsel.occupiedUntil).toBeNull();
    expect(back.data.progress.conquest!.glutinsel.conquestCount).toBe(1);
    expect(beginOccupation(lost, 'glutinsel', 'kurogane', T0 + 9000).conquestCount).toBe(2);
  });
});
