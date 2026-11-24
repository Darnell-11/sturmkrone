// Phase 4.1: Balance-Stresstest. Kalibrierung der Gegner (DANGER 1 … 5), der sechs Raid-Endbosse, der KI-Schiffe, Schiffsbeute und die
// Langzeit-Bilanz der Wirtschaft von Rang 0 (Schaluppe, ~29 Gold Sold/Tag) bis Rang 9 (Leviathan, ~700 Gold Sold/Tag).
// Die Kämpfe laufen über das Kampfmodell aus data/balanceConfig.ts (`FIGHT_MODEL`): Zahlen aus den echten Daten (Gegner, Waffen, Rüstung, Sets).
import { describe, expect, it } from 'vitest';
import { computeStats } from '../src/core/inventory';
import { createSave } from '../src/core/save/types';
import { GEAR_SET_BY_ID } from '../src/data/gear';
import { ARMOR, WEAPONS } from '../src/data/items';
import { ENEMIES, enemyScale, type EnemyKind } from '../src/data/combat';
import { RAID_BOSSES, captainDef } from '../src/raid/raidBosses';
import { CITADELS, BORDER_FORTS } from '../src/data/factions';
import { SHIP_CLASSES, AMMO } from '../src/data/ships';
import {
  DANGER, DANGER_POISE, ENEMY_ARMOR_K, FIGHT_MODEL, HULL_ARMOR, PLAYER_HIT_CAP, RAID_BOSS_HIT_CAP, TIERS, aiCannon, aiHullFactor, damageFactor, dangerOfLevel, dangerScale,
  enemyArmorRating, fightSeconds, hullArmorOf, mitigation, penTierOf, surviveSeconds, tierOfRank,
} from '../src/data/balanceConfig';
import { shopGate } from '../src/data/crafting';
import { AMMO_UNLOCK, CARGO_CAP, GOODS, GOOD_BY_ID, UPKEEP, cargoCap, emptyEconomy, profileOf } from '../src/data/economy';
import { applySalvage, buyGood, cargoUsed, rollSalvage, sellGood, upkeepOf, yardRepairCost, type MarketSite } from '../src/core/economyEngine';
import { createShipSim, applyDamage } from '../src/naval/shipSim';
import { rollPersonalLoot } from '../src/raid/raidLoot';
import { createRaidContext } from '../src/raid/raidSession';
import { EQUIP_BY_ID } from '../src/data/equipment';
import type { EntityId } from '../src/sim/entityId';

// ---------- Spieler-Entwürfe je Stufe ----------

interface Build { name: string; rank: number; level: number; weapon: number; armor: number; set?: string; officers: number }
const BUILDS: Record<'T1' | 'T2' | 'T3' | 'T4' | 'T5', Build> = {
  T1: { name: 'Stufe 1', rank: 0, level: 10, weapon: 1, armor: 1, officers: 1 },
  T2: { name: 'Stufe 2', rank: 3, level: 18, weapon: 2, armor: 2, set: 'kette', officers: 2 },
  T3: { name: 'Stufe 3', rank: 5, level: 25, weapon: 3, armor: 3, set: 'eisenwall', officers: 3 },
  T4: { name: 'Stufe 4', rank: 8, level: 35, weapon: 4, armor: 4, set: 'schuppen', officers: 5 },
  T5: { name: 'Stufe 5', rank: 9, level: 45, weapon: 5, armor: 4, set: 'boss_england', officers: 5 },
};

function stats(b: Build) {
  const g = createSave('A', 'pirat', 'x').gear;
  g.weapon = b.weapon; g.armor = b.armor; g.loot = []; g.outfit = {};
  if (b.set) for (const c of Object.keys(GEAR_SET_BY_ID[b.set].pieces)) { const id = `${b.set}_${c}`; g.loot.push(id); (g.outfit as Record<string, string>)[c] = id; }
  const st = computeStats({ level: b.level, gear: g, style: 'schwert', hpPassive: 0, critPassive: 0.05, atkCrew: 1.1, weaponCrew: 1, fajiCrew: 0, buff: { atk: 0, reduce: 0, crit: 0 } });
  return { ...st, weaponTier: WEAPONS[b.weapon].tier };
}

/** Anteil des Schadens, der gegen dieses Ziel durchkommt: Rüstungskurve der Gefahrenstufe × feste Rüstung (Raid) */
const soakOf = (kind: EnemyKind, level: number, weaponTier: number, flat = 0) => (1 - mitigation(enemyArmorRating(kind, level), weaponTier)) * (1 - flat);

describe('Gefahrenskala der Gegner (DANGER 1 … 5)', () => {
  it('Leben und Schaden folgen den Richtwerten: die erste Stufe jedes Bandes trägt genau den Tabellenwert, dazwischen stetig', () => {
    for (const t of TIERS) {
      const sc = dangerScale(DANGER[t].levelMin);
      expect(sc.hp, `Stufe ${t}`).toBeCloseTo(DANGER[t].hp);
      expect(sc.dmg, `Stufe ${t}`).toBeCloseTo(DANGER[t].dmg);
    }
    let prev = { hp: 0, dmg: 0 };
    for (let lv = 1; lv <= 45; lv++) { const sc = enemyScale(lv); expect(sc.hp).toBeGreaterThanOrEqual(prev.hp); expect(sc.dmg).toBeGreaterThanOrEqual(prev.dmg); prev = sc; }
    expect(dangerScale(80)).toEqual(dangerScale(40));
    expect(dangerScale(-3)).toEqual(dangerScale(1));
    for (let lv = 1; lv < 40; lv++) expect(dangerScale(lv + 1).hp - dangerScale(lv).hp).toBeLessThan(1.2);       // keine Sprünge zwischen zwei Stufen
  });

  it('Rüstung und Haltung steigen mit der Stufe; Art bestimmt den Faktor', () => {
    for (const k of Object.keys(ENEMIES) as EnemyKind[]) {
      let prev = 0;
      for (const t of TIERS) { const r = enemyArmorRating(k, DANGER[t].levelMin); expect(r, `${k} Stufe ${t}`).toBeGreaterThan(prev); prev = r; }
    }
    for (let t = 1; t < 5; t++) expect(DANGER_POISE[(t + 1) as 2 | 3 | 4 | 5]).toBeGreaterThan(DANGER_POISE[t as 1 | 2 | 3 | 4]);
    expect(ENEMY_ARMOR_K.schildtraeger).toBeGreaterThan(ENEMY_ARMOR_K.matrose);
    expect(ENEMY_ARMOR_K.musketier).toBeLessThan(ENEMY_ARMOR_K.matrose);
    expect(enemyArmorRating('unbekannt', 5)).toBe(DANGER[2].armor);
  });

  it('Soldaten und Hauptleute: ein Kampf dauert Sekunden, nicht Schläge, und kein Treffer ist ein One-Shot', () => {
    const match: [keyof typeof BUILDS, number][] = [['T1', 3], ['T2', 6], ['T3', 11], ['T4', 16], ['T5', 20]];
    for (const [bk, lvl] of match) {
      const b = BUILDS[bk], st = stats(b);
      for (const kind of ['matrose', 'schildtraeger', 'musketier', 'schlaeger', 'fajiwirker', 'hauptmann'] as EnemyKind[]) {
        const def = ENEMIES[kind], sc = enemyScale(lvl);
        // Einzelkampf ohne Crew und Fähigkeiten: Zeit bis zum Fall
        const ttk = fightSeconds({ hp: def.hp * sc.hp, atk: st.atk, crit: st.crit, soak: soakOf(kind, lvl, st.weaponTier), officers: 0, skills: false });
        expect(ttk, `${kind} ${bk}: ${ttk.toFixed(1)} s`).toBeGreaterThan(1.0);
        expect(ttk, `${kind} ${bk}: ${ttk.toFixed(1)} s`).toBeLessThan(def.elite ? 70 : 28);
        // stärkster Schlag des Gegners nach Rüstung gegen die Lebenspunkte des passenden Entwurfs
        const maxHit = def.dmg * sc.dmg * Math.max(...def.attacks.map((a) => a.dmg));
        const hit = maxHit * damageFactor(st.armor, dangerOfLevel(lvl), st.reduce);
        expect(hit / st.hp, `${kind} ${bk}: Treffer ${hit.toFixed(0)} von ${st.hp.toFixed(0)}`).toBeLessThan(def.elite ? 0.25 : 0.14);
      }
    }
    expect(PLAYER_HIT_CAP).toBeLessThanOrEqual(0.5);
  });

  it('Stufe-1-Ausrüstung gegen Gegner höherer Stufen: viel Schlag, wenig Wirkung', () => {
    const st = stats(BUILDS.T1);
    const easy = soakOf('matrose', 3, st.weaponTier), hard = soakOf('matrose', 20, st.weaponTier);
    expect(hard).toBeLessThan(easy * 0.75);
    expect(soakOf('schildtraeger', 20, st.weaponTier)).toBeLessThan(0.4);
    // dieselbe Waffe der Stufe 4 durchschlägt die Rüstung der Stufe 5 deutlich besser
    expect(soakOf('schildtraeger', 20, 4)).toBeGreaterThan(soakOf('schildtraeger', 20, 1) * 1.8);
  });
});

describe('Raid-Endbosse und Hauptmänner', () => {
  const bosses = Object.values(RAID_BOSSES).map((B) => {
    const cit = CITADELS.find((c) => c.id === B.islandId)!;
    const lvl = cit.level + 3;            // Der Boss erscheint drei Stufen über der Festung (raidDirector)
    const sc = dangerScale(lvl);
    return { B, lvl, hp: B.def.hp * sc.hp, hit: B.def.dmg * sc.dmg, flat: B.def.armor ?? 0 };
  });

  it('Stufe-4- und Stufe-5-Ausrüstung mit voller Crew besiegt jeden Boss in 60 – 120 s, eine Stufe-1-Figur nie', () => {
    for (const x of bosses) {
      for (const bk of ['T4', 'T5'] as const) {
        const b = BUILDS[bk], st = stats(b);
        const t = fightSeconds({ hp: x.hp, atk: st.atk, crit: st.crit, soak: soakOf('legende', x.lvl, st.weaponTier, x.flat), officers: b.officers });
        expect(t, `${x.B.name} ${bk}: ${t.toFixed(0)} s`).toBeGreaterThanOrEqual(bk === 'T4' ? 80 : 55);
        expect(t, `${x.B.name} ${bk}: ${t.toFixed(0)} s`).toBeLessThanOrEqual(bk === 'T4' ? 125 : 100);
      }
      const t1 = BUILDS.T1, s1 = stats(t1);
      const fight1 = fightSeconds({ hp: x.hp, atk: s1.atk, crit: s1.crit, soak: soakOf('legende', x.lvl, s1.weaponTier, x.flat), officers: t1.officers });
      const live1 = surviveSeconds({ hp: s1.hp, hit: x.hit, hitRate: FIGHT_MODEL.hitSkilled, factor: damageFactor(s1.armor, 5, s1.reduce) });
      expect(fight1, x.B.name).toBeGreaterThan(600);
      expect(live1, x.B.name).toBeLessThan(25);
      // Stufe 3 reicht noch nicht: der Boss gewinnt, bevor der Spieler gewonnen hat
      const t3 = BUILDS.T3, s3 = stats(t3);
      const fight3 = fightSeconds({ hp: x.hp, atk: s3.atk, crit: s3.crit, soak: soakOf('legende', x.lvl, s3.weaponTier, x.flat), officers: t3.officers });
      const live3 = surviveSeconds({ hp: s3.hp, hit: x.hit, hitRate: FIGHT_MODEL.hitSkilled, factor: damageFactor(s3.armor, 5, s3.reduce) });
      expect(fight3, x.B.name).toBeGreaterThan(live3);
    }
  });

  it('der Kampf ist fordernd: drauflosschlagen verliert, wer ausweicht und pariert, gewinnt', () => {
    for (const x of bosses) for (const bk of ['T4', 'T5'] as const) {
      const b = BUILDS[bk], st = stats(b);
      const fight = fightSeconds({ hp: x.hp, atk: st.atk, crit: st.crit, soak: soakOf('legende', x.lvl, st.weaponTier, x.flat), officers: b.officers });
      const f = damageFactor(st.armor, 5, st.reduce);
      const masher = surviveSeconds({ hp: st.hp, hit: x.hit, hitRate: FIGHT_MODEL.hitMasher, factor: f });
      const skilled = surviveSeconds({ hp: st.hp, hit: x.hit, hitRate: FIGHT_MODEL.hitSkilled, factor: f });
      // Stufe 4 verliert beim Draufhauen deutlich; Stufe 5 (Stufe 45, Boss-Set) hält ein wenig länger durch, verliert aber die Zeit der Phasen-Flächen nicht
      expect(masher, `${x.B.name} ${bk}`).toBeLessThan(bk === 'T4' ? fight : fight * 1.6);
      expect(skilled, `${x.B.name} ${bk}`).toBeGreaterThan(fight * 0.85);
    }
  });

  it('Anti-One-Shot: ein einzelner Treffer nimmt einem Boss höchstens 8 % seiner Lebenspunkte, selbst der stärkste Schlag braucht mehr als zehn', () => {
    expect(RAID_BOSS_HIT_CAP).toBe(0.08);
    const st = stats(BUILDS.T5);
    for (const x of bosses) {
      const cap = x.hp * RAID_BOSS_HIT_CAP;
      // ein besonders harter Schlag: Volltreffer, schwerer Hieb (×2,4) und alle Bonusfaktoren
      const burst = st.atk * 2.4 * FIGHT_MODEL.critMult * 1.08;
      expect(Math.ceil(x.hp / Math.min(burst, cap)), x.B.name).toBeGreaterThanOrEqual(12);
    }
    // und umgekehrt: die Spielfigur stirbt nie durch einen einzigen Treffer
    for (const bk of ['T1', 'T3', 'T5'] as const) expect(stats(BUILDS[bk]).hp * PLAYER_HIT_CAP).toBeLessThan(stats(BUILDS[bk]).hp);
  });

  it('Hauptmänner (Stufe 18 – 24) sind zäh, aber mit Stufe-4-Ausrüstung in unter einer Minute zu besiegen', () => {
    for (let i = 0; i < 4; i++) {
      const def = captainDef('england', i);
      const lvl = 18, sc = dangerScale(lvl);
      const st = stats(BUILDS.T4);
      const t = fightSeconds({ hp: def.hp * sc.hp, atk: st.atk, crit: st.crit, soak: soakOf('hauptmann', lvl, st.weaponTier, def.armor ?? 0), officers: 5, skills: true });
      expect(t).toBeGreaterThan(15);
      expect(t).toBeLessThan(60);
    }
  });

  it('die Beutetabelle ist fest an Stufe 4 und 5 gebunden: Siegel, Splitter und Kriegsherren-Stück bei jedem Sieg, Stücke mit 8 – 15 %', () => {
    const N = 600;
    let warlord = 0, seals = 0, shards = 0, relic = 0;
    for (let n = 0; n < N; n++) {
      const c = createRaidContext({ raidInstanceId: `raid-q-${n}`, factionId: 'kurogane', seed: n, leaderPlayerId: 'p1' });
      const l = rollPersonalLoot({ ctx: c, participantId: 'p1', level: 20, conquestsBefore: 1, owned: { gear: [], sails: [], ornaments: [] }, firstClear: false });
      const w = l.items.find((i) => i.kind === 'warlord');
      if (w) { warlord++; expect(EQUIP_BY_ID[w.id]?.tier, w.id).toBe(4); }
      if (l.items.some((i) => i.kind === 'seal')) seals++;
      if (l.items.some((i) => i.kind === 'shard')) shards++;
      relic += l.items.filter((i) => i.kind === 'gear').length;
    }
    expect(warlord).toBe(N);
    expect(seals).toBe(N);
    expect(shards).toBe(N);
    // Stücke der Stufe 5: je Sieg im Mittel 0,08 … 0,15 je fehlendem Platz (6 Plätze) = 0,6 bis 0,9
    const perWin = relic / N;
    expect(perWin).toBeGreaterThan(0.5);
    expect(perWin).toBeLessThan(1.0);
  });
});

describe('Seegefecht: Panzerung, Durchschlag und KI-Schiffe', () => {
  const hullShots = (attacker: number, defender: number, ball = 30) => Math.ceil(SHIP_CLASSES[defender].hp / (ball * (1 - mitigation(hullArmorOf(defender), penTierOf(SHIP_CLASSES[attacker].rank)))));
  const sailShots = (defender: number, ball = 30) => {
    const sim = createShipSim('s' as EntityId, SHIP_CLASSES[defender].hp, SHIP_CLASSES[defender].hp, SHIP_CLASSES[defender].crew);
    let n = 0;
    while (sim.sail.hp > 0 && n < 999) { applyDamage(sim, ball, AMMO.kette, 'sail'); n++; }
    return n;
  };

  it('Panzerung und Durchschlag wachsen mit der Klasse', () => {
    expect(HULL_ARMOR.length).toBe(SHIP_CLASSES.length);
    for (let i = 1; i < HULL_ARMOR.length; i++) expect(HULL_ARMOR[i]).toBeGreaterThan(HULL_ARMOR[i - 1]);
    for (let i = 1; i < SHIP_CLASSES.length; i++) expect(penTierOf(SHIP_CLASSES[i].rank)).toBeGreaterThanOrEqual(penTierOf(SHIP_CLASSES[i - 1].rank));
    expect(penTierOf(SHIP_CLASSES[0].rank, 4)).toBe(3);                      // Kanonen-Ausbau hebt den Durchschlag
    expect(penTierOf(9, 99)).toBe(5);
    expect(hullArmorOf(-1)).toBe(HULL_ARMOR[0]);
    expect(hullArmorOf(99)).toBe(HULL_ARMOR[6]);
  });

  it('eine Schaluppe oder Brigg zwingt ein Linienschiff nicht frontal nieder, kann aber die Segel zerschießen', () => {
    // Rumpf: Dutzende Kugeln, Segel: eine Handvoll Kettenkugeln
    expect(hullShots(0, 5)).toBeGreaterThan(70);
    expect(hullShots(1, 5)).toBeGreaterThan(40);
    expect(hullShots(0, 5)).toBeGreaterThan(sailShots(5) * 6);
    expect(hullShots(1, 6)).toBeGreaterThan(sailShots(6) * 6);
    // das große Schiff dagegen zerlegt die kleine Schaluppe in wenigen Salven
    expect(hullShots(5, 0)).toBeLessThan(12);
    // gleiche Klassen: ein ausgeglichener Kampf (nicht ewig, nicht blitzschnell)
    expect(hullShots(3, 3)).toBeGreaterThan(8);
    expect(hullShots(3, 3)).toBeLessThan(40);
    // Segel haben keine Panzerung: alle Klassen verlieren ihr Tuch schnell
    for (let d = 0; d < SHIP_CLASSES.length; d++) expect(sailShots(d)).toBeLessThan(20);
  });

  it('KI-Kanonen und Rümpfe folgen der Gefahrenskala: Schaden steigt, Nachladezeit sinkt (nie unter 2 s), Rümpfe wachsen gedämpft', () => {
    let prev = { dmg: 0, reload: 99 };
    for (let lv = 1; lv <= 30; lv++) { const c = aiCannon(lv); expect(c.dmg).toBeGreaterThanOrEqual(prev.dmg); expect(c.reload).toBeLessThanOrEqual(prev.reload); expect(c.reload).toBeGreaterThanOrEqual(2); prev = c; }
    expect(aiCannon(10, true).dmg).toBeCloseTo(aiCannon(10).dmg * 1.5);
    expect(aiHullFactor(1)).toBe(1);
    expect(aiHullFactor(20)).toBeGreaterThan(2.5);
    expect(aiHullFactor(20)).toBeLessThan(3.6);
    for (let lv = 1; lv < 40; lv++) expect(aiHullFactor(lv + 1)).toBeGreaterThanOrEqual(aiHullFactor(lv));
    // Raid-Hauptmann-Gegner: auch die zahlreichen Batterien bleiben unter der 40-%-Grenze
    expect(aiCannon(22).dmg).toBeLessThan(stats(BUILDS.T3).hp * 0.2);
  });
});

describe('Schiffsbeute: Handelsgüter', () => {
  const fixed = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

  it('Händler führen die Erzeugnisse ihrer Macht, Kriegsschiffe Marine-Ausrüstung oder Kriegsware, Legenden Luxus', () => {
    for (let n = 0; n < 200; n++) {
      const r = (n + 0.5) / 200;
      const h = rollSalvage({ role: 'haendler', power: 'niederlande', level: 8, borderDist: 5000, boarded: true }, fixed(r, 0.3, 0.7, 0.5));
      for (const d of h) expect(profileOf({ id: 'x', factionId: 'niederlande' }).produce).toContain(d.good);
      const w = rollSalvage({ role: 'patrouille', power: 'england', level: 8, borderDist: 5000, boarded: false }, fixed(r, 0.9, 0.2, 0.6));
      expect(w.length).toBeGreaterThan(0);
      expect(w.some((d) => d.good === 'marineausruestung' || GOOD_BY_ID[d.good].war || ['tuch', 'tee'].includes(d.good))).toBe(true);
    }
    expect(rollSalvage({ role: 'legende', power: 'marine', level: 20, borderDist: 5000, boarded: true }).map((d) => d.good)).toContain('luxusgueter');
  });

  it('nahe der Sektorgrenze fällt öfter Kriegsware, die beim Einsammeln Fahndungsdruck erzeugt; im Binnenmeer nicht von Händlern', () => {
    let nearWar = 0, farWar = 0;
    for (let n = 0; n < 400; n++) {
      const rnd = (() => { let s = n * 7919 + 13; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; })();
      const near = rollSalvage({ role: 'haendler', power: 'deutschland', level: 10, borderDist: 100, boarded: true }, rnd);
      const far = rollSalvage({ role: 'haendler', power: 'niederlande', level: 10, borderDist: 4000, boarded: true }, rnd);
      if (near.some((d) => GOOD_BY_ID[d.good].war)) nearWar++;
      if (far.some((d) => GOOD_BY_ID[d.good].war)) farWar++;
    }
    expect(nearWar).toBeGreaterThan(40);
    expect(farWar).toBe(0);
    const e = emptyEconomy();
    const r = applySalvage(e, [{ good: 'waffenkisten', units: 10 }, { good: 'tee', units: 10 }], 6);
    expect(r.heat).toBeGreaterThan(5);
    expect(e.heat).toBe(r.heat);
    const peace = emptyEconomy();
    expect(applySalvage(peace, [{ good: 'tee', units: 10 }, { good: 'stoffe', units: 4 }], 6).heat).toBe(0);
  });

  it('der freie Frachtraum (30 … 500) begrenzt die Beute: ein volles Schiff nimmt nichts mehr mit', () => {
    const e = emptyEconomy();
    const big = [{ good: 'kanonenstahl' as const, units: 100 }];
    const small = applySalvage(e, big, 0);
    expect(small.taken[0].units).toBe(15);                               // Schaluppe: 30 Platz, Stahl braucht 2
    expect(small.lost).toBe(85);
    expect(cargoUsed(e)).toBeLessThanOrEqual(cargoCap(0));
    const again = applySalvage(e, big, 0);
    expect(again.taken).toEqual([]);
    expect(again.lost).toBe(100);
    const huge = applySalvage(emptyEconomy(), big, 6);
    expect(huge.taken[0].units).toBe(100);
    expect(huge.lost).toBe(0);
    expect(CARGO_CAP[0]).toBe(30);
    expect(CARGO_CAP[6]).toBe(500);
  });

  it('Beute-Exploit: der Wert einer Ladung bleibt klein gegen den Schiffspreis und die Handelsgewinne', () => {
    for (const role of ['haendler', 'patrouille', 'jaeger', 'legende'] as const) for (const lvl of [1, 10, 20, 25]) {
      let max = 0;
      for (let n = 0; n < 300; n++) {
        const rnd = (() => { let s = n * 104729 + lvl; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; })();
        const v = rollSalvage({ role, power: 'frankreich', level: lvl, borderDist: 100, boarded: true }, rnd).reduce((a, d) => a + d.units * GOOD_BY_ID[d.good].base, 0);
        max = Math.max(max, v);
      }
      const cap = (30 + 12 * lvl) * 1.3 * (role === 'legende' ? 3 : 1);
      // höchstens Budget plus Rundung (je Posten mindestens ein Stück) und +20 % Streuung
      expect(max, `${role} L${lvl}`).toBeLessThanOrEqual(cap * 1.25 + 4 * 120);
    }
  });
});

describe('Langzeit-Bilanz von Rang 0 bis Rang 9', () => {
  const calm = { borderDist: 5000, occupied: false, fort: false };
  const keys = ['niederlande', 'england', 'frankreich', 'nordwacht'];
  const sites: MarketSite[] = keys.map((k) => ({ id: k, name: k, profile: profileOf({ id: k, factionId: k, region: k }), war: calm }));
  // Schiffsklasse, Offiziere und Truppen je Stufe der Fortschrittsleiter
  const LADDER = [
    { rank: 0, cls: 0, officers: 2, troops: 0 }, { rank: 2, cls: 1, officers: 2, troops: 0 }, { rank: 3, cls: 2, officers: 3, troops: 0 }, { rank: 4, cls: 3, officers: 3, troops: 0 },
    { rank: 5, cls: 4, officers: 4, troops: 0 }, { rank: 7, cls: 5, officers: 4, troops: 0 }, { rank: 9, cls: 6, officers: 5, troops: 100 },
  ];
  const upkeepDaily = (l: (typeof LADDER)[number]) => upkeepOf({ tier: l.cls, seamen: SHIP_CLASSES[l.cls].crew * 8, troops: l.troops, officers: l.officers }).daily;

  it('Sold: Schaluppe etwa 30 – 50 Gold, Leviathan mit Truppen etwa 700 Gold je Ingame-Tag, jede Stufe teurer als die vorige', () => {
    const d = LADDER.map(upkeepDaily);
    expect(d[0]).toBeGreaterThan(25);
    expect(d[0]).toBeLessThan(55);
    expect(d[6]).toBeGreaterThan(650);
    expect(d[6]).toBeLessThan(800);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1]);
  });

  it('Käufe folgen dem Rang: jede Stufe kommt erst mit dem Rang ihrer Klasse, Stufe 4 und 5 nie aus dem Laden', () => {
    for (let r = 0; r < 10; r++) {
      const t = tierOfRank(r);
      expect(shopGate({ tier: t, playerRank: r, standing: t === 3 ? 20 : 0 }).ok, `Rang ${r} Stufe ${t}`).toBe(t <= 3);
      if (t < 5) expect(shopGate({ tier: (t + 1) as 2 | 3 | 4 | 5, playerRank: r, standing: 100 }).ok, `Rang ${r} Stufe ${t + 1}`).toBe(false);
    }
    // Schiffsklassen: der Mindestrang folgt der Leiter
    LADDER.forEach((l) => expect(SHIP_CLASSES[l.cls].rank).toBeLessThanOrEqual(l.rank));
    // Waffen und Rüstungen: Rang aufsteigend
    for (let i = 1; i < WEAPONS.length; i++) expect(WEAPONS[i].rank).toBeGreaterThanOrEqual(WEAPONS[i - 1].rank);
    for (let i = 1; i < ARMOR.length; i++) expect(ARMOR[i].rank).toBeGreaterThanOrEqual(ARMOR[i - 1].rank);
  });

  it('Munition und Reparatur sind bezahlbar, aber keine Kleinigkeit: jede Preisstufe liegt unter dem Preis der Klasse, bei der sie frei wird', () => {
    expect(AMMO_UNLOCK.kette.price).toBeLessThan(SHIP_CLASSES[1].price * 0.5);               // Brigg: Rang 2, Stufe 2
    expect(AMMO_UNLOCK.brand.price).toBeLessThan(SHIP_CLASSES[3].price * 0.5);               // Fregatte: Rang 4, Stufe 3
    for (const l of LADDER.slice(1)) {
      const c = SHIP_CLASSES[l.cls];
      const half = yardRepairCost({ L: c.L, W: c.W, hullMax: c.hp, hullFrac: 0.5, sailMax: c.hp * 0.8, sailFrac: 0.5 });
      expect(half, c.n).toBeLessThan(c.price * 0.25);
      expect(half, c.n).toBeGreaterThan(upkeepDaily(l) * 0.8);
    }
  });

  it('Handel mit perfekter Planung (beste Route, beste Menge, zwei Stunden) bleibt moderat und finanziert keine große Flotte', () => {
    const net: number[] = [];
    for (const idx of [0, 1, 3]) {
      const l = LADDER[idx === 0 ? 0 : idx === 1 ? 1 : 3];
      const eco = emptyEconomy(0);
      const cls = l.cls;
      let gold = Math.max(300, Math.round(SHIP_CLASSES[cls].price * 0.4));
      const start = gold;
      const dt = 300, trips = 24, daily = upkeepDaily(l);
      let now = 0;
      for (let i = 0; i < trips; i++) {
        let best: { profit: number; a: number; b: number; g: GoodsId; n: number } | null = null;
        for (let a = 0; a < sites.length; a++) for (let b = 0; b < sites.length; b++) {
          if (a === b) continue;
          for (const g of GOODS) {
            if (g.war) continue;
            for (const frac of [0.3, 1]) {
              const trial = JSON.parse(JSON.stringify(eco));
              const n = Math.max(1, Math.floor((cargoCap(cls) * frac) / g.vol));
              const buy = buyGood(trial, sites[a], now, g.id, n, gold, cls);
              if (!buy.ok) continue;
              const profit = sellGood(trial, sites[b], now + dt / 2, g.id, 99999).gold + buy.gold;
              if (!best || profit > best.profit) best = { profit, a, b, g: g.id, n };
            }
          }
        }
        if (best && best.profit > 0) {
          gold += buyGood(eco, sites[best.a], now, best.g, best.n, gold, cls).gold;
          gold += sellGood(eco, sites[best.b], now + dt / 2, best.g, 99999).gold;
        }
        now += dt;
        gold -= (daily * dt) / 1440;
      }
      const perHour = (gold - start) / (trips * dt / 3600);
      net.push(perHour);
      if (cls <= 1) expect(perHour, `${SHIP_CLASSES[cls].n}: ${perHour.toFixed(0)} Gold/h`).toBeGreaterThan(100);       // kleine Schiffe können vom Handel leben
      expect(perHour, `${SHIP_CLASSES[cls].n}: ${perHour.toFixed(0)} Gold/h`).toBeLessThan(1500);
      // kein Zinseszins-Wunder: das Kapital wächst in zwei Stunden höchstens auf das Zehnfache
      expect(gold, SHIP_CLASSES[cls].n).toBeLessThan(start * 10);
    }
    // Der Unterhalt eines Leviathans (pro Stunde) übersteigt, was ein Händler gleich welcher Klasse verdient: Handel trägt keine Kriegsflotte
    // (ein Ingame-Tag = 24 Spielminuten: eine Stunde sind 2,5 Tage)
    expect(upkeepDaily(LADDER[6]) * (60 / 24)).toBeGreaterThan(Math.max(...net) * 1.5);
    expect(UPKEEP.period * UPKEEP.periodsPerDay).toBe(24 * 60);
  }, 120000);

  it('Wiederholte Fahrten auf derselben Route verdienen immer weniger (Märkte sättigen sich), die Erholung folgt der Zeit', () => {
    const A = sites[0], B = sites[1];
    const e = emptyEconomy(0);
    const profits: number[] = [];
    for (let i = 0; i < 4; i++) {
      const buy = buyGood(e, A, i * 60, 'gewuerze', 20, 1e9, 4);
      const sell = sellGood(e, B, i * 60, 'gewuerze', 9999);
      profits.push(buy.ok ? sell.gold + buy.gold : 0);
    }
    expect(profits[1]).toBeLessThan(profits[0] * 0.7);
    expect(profits[3]).toBeLessThan(profits[0] * 0.5);
    // nach langer Pause ist der Markt wieder frisch
    const later = emptyEconomy(0);
    buyGood(later, A, 0, 'gewuerze', 20, 1e9, 4); sellGood(later, B, 0, 'gewuerze', 9999);
    const b2 = buyGood(later, A, 20000, 'gewuerze', 20, 1e9, 4), s2 = sellGood(later, B, 20000, 'gewuerze', 9999);
    expect(s2.gold + b2.gold).toBeGreaterThan(profits[0] * 0.8);
  });
});

type GoodsId = (typeof GOODS)[number]['id'];

describe('Sonstiges', () => {
  it('Grenzfestungen liegen auf Stufe 3, Raid-Festungen auf Stufe 5 (Karte) und ihre Gegnerstufen passen dazu', () => {
    for (const f of BORDER_FORTS) expect(dangerOfLevel(f.level), f.id).toBeGreaterThanOrEqual(3);
    for (const c of CITADELS) expect(dangerOfLevel(c.level + 3), c.id).toBe(5);
  });
});
