// Phase 4.2: Schiffs-Evolution (Rumpf, Segel, Kanonen je Stufe 1 … 5) für alle sieben Klassen: Zustand und Spielstand 17, Werte der Stufen,
// Stückpforten, Rammsporn (Kegel, Geschwindigkeit, Schaden, Eigenschaden), Deck-Drehbassen, Werft-Material, Sold und Inzahlungnahme.
import { describe, expect, it } from 'vitest';
import {
  CANNON_DMG_K, CANNON_PORTS_K, EVO_COST, EVO_MATERIAL, EVO_UPKEEP_MAX, HULL_ARMOR, HULL_ARMOR_K, HULL_HP_K, RAM, RAM_MIN_TIER, SAIL_HP_K, SAIL_SPEED_K, SWIVEL,
  SWIVEL_MIN_TIER, hullArmorOf, mitigation, penTierOf, dangerOfLevel,
} from '../src/data/balanceConfig';
import {
  EVO_BRANCHES, activePorts, applyShipPurchase, cleanEvolution, evoCost, evoEffectText, evoMaterial, evoStats, evoValue, evolutionOf, evolutionOfTier, legacyUpToEvo,
  neutralEvolution, newShipEvolution, portIndices, shipEvolutionTier, starterEvolution, tierOf, tradeInRefund, type EvoBranch, type EvoTier, type ShipEvolution,
} from '../src/data/shipEvolution';
import { AMMO, SHIP_CLASSES } from '../src/data/ships';
import { GOOD_BY_ID, emptyEconomy } from '../src/data/economy';
import { RAM_AMMO, hasSwivels, ramContact, ramDamage, swivelCooldown, swivelDamage, swivelTarget, type Kin } from '../src/naval/ramming';
import { applyDamage, createShipSim, poolHeads } from '../src/naval/shipSim';
import { takeCargo, upkeepOf, buyGood } from '../src/core/economyEngine';
import { createSave, defaultShip, SAVE_VERSION } from '../src/core/save/types';
import { migrateSave } from '../src/core/save/migrations';
import type { EntityId } from '../src/sim/entityId';

const TIERS_ALL: EvoTier[] = [1, 2, 3, 4, 5];
const CLASSES = SHIP_CLASSES.map((c, i) => ({ c, i }));

describe('Zustand, Startregel und Gesamtstufe', () => {
  it('drei Zweige 1 … 5, Gesamtstufe = gerundetes Mittel', () => {
    expect(EVO_BRANCHES).toEqual(['hull', 'sail', 'cannon']);
    expect(shipEvolutionTier({ hullTier: 1, sailTier: 1, cannonTier: 1 })).toBe(1);
    expect(shipEvolutionTier({ hullTier: 5, sailTier: 5, cannonTier: 5 })).toBe(5);
    expect(shipEvolutionTier({ hullTier: 5, sailTier: 1, cannonTier: 1 })).toBe(2);      // 7/3 = 2,33 → 2
    expect(shipEvolutionTier({ hullTier: 5, sailTier: 5, cannonTier: 1 })).toBe(4);      // 11/3 = 3,67 → 4
    expect(shipEvolutionTier({ hullTier: 3, sailTier: 3, cannonTier: 4 })).toBe(3);      // 3,33 → 3
    expect(shipEvolutionTier({ hullTier: 2, sailTier: 2, cannonTier: 3 })).toBe(2);      // 2,33 → 2
    expect(shipEvolutionTier({ hullTier: 2, sailTier: 3, cannonTier: 3 })).toBe(3);      // 2,67 → 3
  });

  it('neu gekaufte Schiffe beginnen strikt auf 1/1/1, das Startschiff auf 2/2/2, Begleiter auf den neutralen Grundwerten (3)', () => {
    expect(newShipEvolution()).toEqual({ hullTier: 1, sailTier: 1, cannonTier: 1 });
    expect(starterEvolution()).toEqual({ hullTier: 2, sailTier: 2, cannonTier: 2 });
    expect(neutralEvolution()).toEqual({ hullTier: 3, sailTier: 3, cannonTier: 3 });
    const s = createSave('A', 'pirat', 'x');
    expect(s.ship.evo['0']).toEqual(starterEvolution());
    expect(evolutionOf(s.ship, 0)).toEqual(starterEvolution());
    for (const { i } of CLASSES.slice(1)) expect(evolutionOf(s.ship, i), `Klasse ${i} ohne Eintrag`).toEqual(newShipEvolution());
  });

  it('Kauf jeder Klasse: Stufe 1/1/1, kein Eintrag wird vergessen', () => {
    for (const { i } of CLASSES.slice(1)) {
      const ship = defaultShip('pirat');
      ship.evo['0'] = evolutionOfTier(5);
      applyShipPurchase(ship, i);
      expect(ship.owned).toContain(i);
      expect(ship.evo[String(i)], `Klasse ${i}`).toEqual(newShipEvolution());
    }
  });

  it('säubert fremde Daten und übersteht JSON', () => {
    expect(cleanEvolution({ hullTier: 9, sailTier: -2, cannonTier: 'x' })).toEqual({ hullTier: 5, sailTier: 1, cannonTier: 1 });
    expect(cleanEvolution(null)).toEqual(newShipEvolution());
    expect(cleanEvolution({ hullTier: 3.6 }, evolutionOfTier(2))).toEqual({ hullTier: 4, sailTier: 2, cannonTier: 2 });
    const e: ShipEvolution = { hullTier: 4, sailTier: 2, cannonTier: 5 };
    expect(JSON.parse(JSON.stringify(e))).toEqual(e);
    expect(evolutionOf({ evo: { '3': { hullTier: 99 } as unknown as ShipEvolution } }, 3).hullTier).toBe(5);
  });
});

describe('Werte der Stufen für alle sieben Klassen', () => {
  it('Rumpf: 75 % → 145 % der Klassenbasis, Stufe 3 = Grundwert, Panzerung wächst mit', () => {
    expect(HULL_HP_K[0]).toBeCloseTo(0.75);
    expect(HULL_HP_K[4]).toBeCloseTo(1.45);
    expect(HULL_HP_K[2]).toBe(1);
    for (const { c, i } of CLASSES) {
      let prevHp = 0, prevArmor = 0;
      for (const t of TIERS_ALL) {
        const hp = Math.round(c.hp * evoStats(evolutionOfTier(t)).hullHpK);
        const armor = hullArmorOf(i, t);
        expect(hp, `${c.n} Stufe ${t}`).toBeGreaterThan(prevHp);
        expect(armor, `${c.n} Stufe ${t}`).toBeGreaterThan(prevArmor);
        prevHp = hp; prevArmor = armor;
      }
      expect(Math.round(c.hp * evoStats(evolutionOfTier(1)).hullHpK)).toBe(Math.round(c.hp * 0.75));
      expect(Math.round(c.hp * evoStats(evolutionOfTier(5)).hullHpK)).toBe(Math.round(c.hp * 1.45));
      expect(hullArmorOf(i, 3)).toBe(HULL_ARMOR[i]);
      expect(hullArmorOf(i)).toBe(HULL_ARMOR[i]);
      expect(hullArmorOf(i, 5)).toBeCloseTo(HULL_ARMOR[i] * HULL_ARMOR_K[4]);
    }
    // höhere Panzerung = weniger Schaden gegen denselben Durchschlag
    expect(mitigation(hullArmorOf(5, 5), 3)).toBeGreaterThan(mitigation(hullArmorOf(5, 1), 3));
  });

  it('Segel: Tempo 78 % → 122 %, Beschleunigung, Wendigkeit und Am-Wind-Winkel wachsen, Segel-HP wächst', () => {
    expect(SAIL_SPEED_K[0]).toBeCloseTo(0.78);
    expect(SAIL_SPEED_K[4]).toBeCloseTo(1.22);
    expect(SAIL_SPEED_K[2]).toBe(1);
    for (const { c } of CLASSES) {
      const speeds = TIERS_ALL.map((t) => c.spd * evoStats(evolutionOfTier(t)).speedK);
      for (let k = 1; k < speeds.length; k++) expect(speeds[k], c.n).toBeGreaterThan(speeds[k - 1]);
      expect(speeds[0] / c.spd).toBeCloseTo(0.78);
      expect(speeds[4] / c.spd).toBeCloseTo(1.22);
    }
    let prev = evoStats(evolutionOfTier(1));
    for (const t of [2, 3, 4, 5] as EvoTier[]) {
      const st = evoStats(evolutionOfTier(t));
      expect(st.accelK).toBeGreaterThan(prev.accelK);
      expect(st.turnK).toBeGreaterThan(prev.turnK);
      expect(st.sailHpK).toBeGreaterThan(prev.sailHpK);
      expect(st.upwindK, 'weniger Tempoverlust am Wind').toBeLessThan(prev.upwindK);
      prev = st;
    }
    expect(SAIL_HP_K[2]).toBe(1);
  });

  it('Kanonen: Stückpforten 50 % (Stufe 1), 75 % (Stufe 2), ab Stufe 3 alle; Schaden und Nachladen besser, Durchschlag steigt', () => {
    expect(CANNON_PORTS_K).toEqual([0.5, 0.75, 1, 1, 1]);
    for (const { c } of CLASSES) {
      const ports = TIERS_ALL.map((t) => activePorts(c.can, t));
      expect(ports[0], `${c.n} Stufe 1`).toBe(Math.max(1, Math.round(c.can * 0.5)));
      expect(ports[1], `${c.n} Stufe 2`).toBe(Math.max(1, Math.round(c.can * 0.75)));
      for (const t of [3, 4, 5]) expect(ports[t - 1], `${c.n} Stufe ${t}`).toBe(c.can);
      for (let k = 1; k < ports.length; k++) expect(ports[k]).toBeGreaterThanOrEqual(ports[k - 1]);
      expect(ports[0]).toBeGreaterThanOrEqual(1);
      expect(ports[0]).toBeLessThan(c.can + 1);
      // welche Pforten feuern: gleichmäßig verteilt, keine doppelt, alle gültig
      for (const t of TIERS_ALL) {
        const idx = portIndices(c.can, ports[t - 1]);
        expect(idx.length).toBe(ports[t - 1]);
        expect(new Set(idx).size).toBe(idx.length);
        for (const x of idx) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(c.can); }
      }
    }
    expect(activePorts(10, 1)).toBe(5);
    expect(activePorts(10, 2)).toBe(8);
    expect(activePorts(2, 1)).toBe(1);
    expect(activePorts(0, 3)).toBe(0);
    expect(portIndices(10, 5)).toEqual([1, 3, 5, 7, 9]);
    for (let k = 1; k < 5; k++) { expect(CANNON_DMG_K[k]).toBeGreaterThan(CANNON_DMG_K[k - 1]); }
    const reloads = TIERS_ALL.map((t) => evoStats(evolutionOfTier(t)).reloadK);
    for (let k = 1; k < reloads.length; k++) expect(reloads[k]).toBeLessThan(reloads[k - 1]);
    expect(reloads[0]).toBeGreaterThan(1.2);
    // Durchschlag: Stufe 1 schwächer, Stufe 5 stärker als die Klasse allein
    for (const { c } of CLASSES) {
      expect(penTierOf(c.rank, 1)).toBeLessThanOrEqual(penTierOf(c.rank, 3));
      expect(penTierOf(c.rank, 5)).toBeGreaterThanOrEqual(penTierOf(c.rank, 3));
    }
  });

  it('Rammsporn ab Rumpf-Stufe 4, Drehbassen ab Kanonen-Stufe 4', () => {
    expect(RAM_MIN_TIER).toBe(4);
    expect(SWIVEL_MIN_TIER).toBe(4);
    for (const t of TIERS_ALL) {
      expect(evoStats({ ...newShipEvolution(), hullTier: t }).ram).toBe(t >= 4);
      expect(evoStats({ ...newShipEvolution(), cannonTier: t }).swivel).toBe(t >= 4);
      expect(hasSwivels(t)).toBe(t >= 4);
    }
    expect(evoEffectText('hull', 4)).toMatch(/Rammsporn/);
    expect(evoEffectText('hull', 5)).toMatch(/panzerbrechend/);
    expect(evoEffectText('hull', 2)).not.toMatch(/Rammsporn \(/);
    expect(evoEffectText('cannon', 4)).toMatch(/Drehbassen/);
    expect(evoEffectText('cannon', 3)).not.toMatch(/Drehbassen/);
    expect(evoEffectText('sail', 5)).toMatch(/122 %/);
  });
});

describe('Rammsporn: Bug-Kegel, Geschwindigkeit, Schaden', () => {
  const ship = (x: number, z: number, heading: number, speed: number, L = 30, W = 8): Kin => ({ x, z, heading, course: heading, speed, L, W });

  it('trifft nur im Bug-Kegel (Skalarprodukt > 0,75), mit Bugspitze in der Hülle des Ziels und über 3,5 m/s Annäherung', () => {
    // Angreifer fährt nach +Z (heading 0), Ziel liegt direkt voraus
    const a = ship(0, 0, 0, 12);
    const b = ship(0, 22, Math.PI, 0);                          // Bug des Ziels zeigt ihm entgegen, steht still
    const hit = ramContact(a, b);
    expect(hit.hit).toBe(true);
    expect(hit.dot).toBeCloseTo(1);
    expect(hit.relSpeed).toBeCloseTo(12);
    expect(hit.z).toBeCloseTo(15);                               // Bugspitze bei L/2
    // zu langsam: genau an der Grenze nicht, knapp darüber ja
    expect(ramContact(ship(0, 0, 0, 3.5), b).hit).toBe(false);
    expect(ramContact(ship(0, 0, 0, 3.6), b).hit).toBe(true);
    expect(ramContact(ship(0, 0, 0, 0), b).hit).toBe(false);
    // Ziel läuft vorweg mit gleicher Geschwindigkeit: keine Annäherung
    expect(ramContact(ship(0, 0, 0, 12), ship(0, 22, 0, 12)).hit).toBe(false);
    expect(ramContact(ship(0, 0, 0, 12), ship(0, 22, 0, 6)).relSpeed).toBeCloseTo(6);
    // wer selbst stillsteht, rammt nicht, auch wenn ein anderes Schiff auf ihn zufährt
    expect(ramContact(b, a).hit).toBe(false);
    expect(ramContact(b, a).relSpeed).toBeGreaterThan(RAM.minSpeed);
    expect(ramContact(b, a).ownSpeed).toBeLessThanOrEqual(0);
    // Ziel hinter dem Angreifer, Ziel seitlich
    expect(ramContact(a, ship(0, -22, 0, 0)).hit).toBe(false);
    expect(ramContact(a, ship(26, 0, 0, 0)).hit).toBe(false);
    // Winkelgrenze: Ziel unter 41,4° zur Bugachse (cos = 0,75) liegt am Rand; 50° ist außerhalb, 30° innerhalb (Ziel groß genug, damit die Bugspitze trifft)
    const at = (deg: number, dist: number) => ({ x: Math.sin((deg * Math.PI) / 180) * dist, z: Math.cos((deg * Math.PI) / 180) * dist });
    const big = (p: { x: number; z: number }) => ship(p.x, p.z, Math.PI, 0, 60, 30);
    expect(ramContact(a, big(at(30, 24))).dot).toBeGreaterThan(RAM.cone);
    expect(ramContact(a, big(at(50, 24))).dot).toBeLessThan(RAM.cone);
    expect(ramContact(a, big(at(50, 24))).hit).toBe(false);
    // Bugspitze weit weg von der Hülle: kein Treffer, auch bei Tempo
    expect(ramContact(a, ship(0, 80, Math.PI, 0)).hit).toBe(false);
  });

  it('Schaden wächst mit der Geschwindigkeit über der Grenze, ist gedeckelt und folgt dem Rumpf des Rammers', () => {
    const d = (v: number, hull = 780, tier = 4) => ramDamage(v, hull, tier);
    expect(d(3.5).target).toBe(0);
    expect(d(3).target).toBe(0);
    expect(d(8).target).toBeGreaterThan(0);
    expect(d(16).target).toBeGreaterThan(d(8).target);
    expect(d(30).target).toBeGreaterThan(d(16).target);
    expect(d(500).target).toBeCloseTo(780 * RAM.maxK);
    expect(d(500).target).toBeLessThan(780 * 0.5);
    expect(d(20, 1100).target).toBeGreaterThan(d(20, 200).target * 4);
    for (const { c } of CLASSES) expect(ramDamage(25, c.hp * 1.45, 5).target).toBeLessThanOrEqual(c.hp * 1.45 * RAM.maxK + 1e-9);
  });

  it('mit Sporn (Stufe 4/5): voller Schaden, nur 30 % des Eigenschadens eines Schiffs ohne Sporn (−70 %); ohne Sporn Streifstoß und hoher Eigenschaden', () => {
    for (const t of TIERS_ALL) {
      const r = ramDamage(20, 500, t), plain = ramDamage(20, 500, 1);
      expect(r.ram).toBe(t >= 4);
      if (t >= 4) {
        expect(r.target).toBeGreaterThan(plain.target * 3);
        expect(r.self / plain.self, `Stufe ${t}`).toBeCloseTo(0.3);
        expect(r.self).toBeLessThan(r.target * 0.3);
      } else {
        expect(r.target).toBeCloseTo(r.self * (RAM.glancing / RAM.selfPlain));
        expect(r.self, `Stufe ${t}: leidet selbst`).toBeGreaterThan(r.target);       // der Eigenschaden übersteigt, was man dem Ziel antut
        expect(r.self).toBeGreaterThan(0);
      }
    }
    // Stufe 5 ist panzerbrechend, Stufe 4 durchschlägt wie Stufe 3, ohne Sporn nur Stufe 1
    expect(ramDamage(20, 500, 5).pen).toBe(Infinity);
    expect(ramDamage(20, 500, 4).pen).toBe(RAM.penTier);
    expect(ramDamage(20, 500, 3).pen).toBe(1);
    expect(1 - mitigation(hullArmorOf(6, 3), ramDamage(20, 500, 5).pen)).toBe(1);               // Panzerung wirkungslos
    expect(1 - mitigation(hullArmorOf(6, 3), ramDamage(20, 500, 4).pen)).toBeLessThan(1);
  });

  it('echter Zusammenstoß aller Klassen: Rammer mit Sporn nimmt weniger Schaden als das Ziel, Crew-Schock trifft die Besatzung', () => {
    for (const { c, i } of CLASSES) {
      const dmg = ramDamage(18, c.hp * 1.45, 5);
      const target = createShipSim(`t${i}` as EntityId, c.hp, c.hp, c.crew);
      const before = target.hull, heads0 = poolHeads(target.crew, 'matrosen');
      const r = applyDamage(target, dmg.target * (1 - mitigation(0, dmg.pen)), RAM_AMMO, 'hull');
      expect(r.hull, c.n).toBeGreaterThan(0);
      expect(target.hull).toBeLessThan(before);
      expect(r.crewHeads, `${c.n}: Crew-Schock`).toBeGreaterThan(0);
      expect(poolHeads(target.crew, 'matrosen')).toBeLessThan(heads0);
      expect(dmg.self).toBeLessThan(dmg.target);
    }
    expect(RAM_AMMO.crew).toBeGreaterThan(AMMO.kugel.crew);
  });

  it('der Rammer mit Sporn überlebt mehr Stöße als ein Schiff ohne Sporn', () => {
    const hull = 400;
    const stosse = (tier: number) => { let h = hull, n = 0; while (h > 0 && n < 200) { h -= ramDamage(20, hull, tier).self; n++; } return n; };
    expect(stosse(4)).toBeGreaterThan(stosse(3) * 2.5);
    expect(stosse(1)).toBeLessThan(10);
  });
});

describe('Deck-Drehbassen', () => {
  const me = { x: 0, z: 0, L: 30 };
  it('Reichweite höchstens 45 m (Hüllenabstand), nächstes Ziel zuerst, kein Ziel außerhalb', () => {
    expect(SWIVEL.range).toBe(45);
    const foe = (d: number, L = 30) => ({ x: d, z: 0, L });
    // Hüllenabstand = Mittelpunkt − (L1 + L2)/4 = Mittelpunkt − 15
    expect(swivelTarget(me, [foe(60)])).toBe(0);                     // 45 m
    expect(swivelTarget(me, [foe(60.5)])).toBe(-1);
    expect(swivelTarget(me, [foe(200)])).toBe(-1);
    expect(swivelTarget(me, [])).toBe(-1);
    expect(swivelTarget(me, [foe(55), foe(35), foe(50)])).toBe(1);
    expect(swivelTarget(me, [foe(10)])).toBe(0);                      // längsseits
    // jede Richtung zählt: die Drehbasse dreht frei
    expect(swivelTarget(me, [{ x: 0, z: -40, L: 20 }])).toBe(0);
    expect(swivelTarget(me, [{ x: -30, z: 30, L: 20 }])).toBe(0);
  });

  it('eigener Cooldown (Stufe 5 schneller), moderater Kartätschen-Schaden: viel Crew, etwas Tuch, wenig Rumpf', () => {
    expect(swivelCooldown(4)).toBe(SWIVEL.cooldown[0]);
    expect(swivelCooldown(5)).toBe(SWIVEL.cooldown[1]);
    expect(swivelCooldown(5)).toBeLessThan(swivelCooldown(4));
    expect(swivelCooldown(4)).toBeGreaterThan(2);
    for (const { c } of CLASSES) {
      const cannon = 30 * CANNON_DMG_K[3];
      const base = swivelDamage(cannon);
      expect(base).toBeCloseTo(cannon * SWIVEL.dmgK);
      expect(base).toBeLessThan(cannon * 0.3);                        // moderat: unter einem Drittel einer Kanonenkugel
      const sim = createShipSim('sw' as EntityId, c.hp, c.hp, c.crew);
      const kart = { ...applyDamage(sim, base, AMMO.kartaetsche, 'hull') };
      const sim2 = createShipSim('sw2' as EntityId, c.hp, c.hp, c.crew);
      const kugel = { ...applyDamage(sim2, base, AMMO.kugel, 'hull') };
      expect(kart.crewHeads, c.n).toBeGreaterThan(kugel.crewHeads);
      expect(kart.hull, c.n).toBeLessThan(kugel.hull);
      expect(kart.sail, c.n).toBeGreaterThan(0);
    }
  });
});

describe('Werft: Kosten, Material, Inzahlungnahme, Sold', () => {
  it('Kosten wachsen mit Stufe und Klasse; Stufe 2 ist günstig', () => {
    expect(EVO_COST.length).toBe(5);
    for (const { i } of CLASSES) {
      for (let t = 3; t <= 5; t++) expect(evoCost(i, t), `Klasse ${i} Stufe ${t}`).toBeGreaterThan(evoCost(i, t - 1));
      if (i) expect(evoCost(i, 4)).toBeGreaterThan(evoCost(i - 1, 4));
    }
    expect(evoCost(0, 2)).toBe(300);
    expect(evoCost(6, 5)).toBeGreaterThan(evoCost(0, 5) * 3);
    expect(evoCost(0, 1)).toBe(evoCost(0, 2));           // Stufe 1 gibt es nicht zu kaufen: es zählt als Stufe 2
  });

  it('Stufe 3 – 5 verlangen Handelsware aus dem Frachtraum: Hartholz, Tuch/Seide, Kanonenstahl; die Menge wächst mit Stufe und Klasse', () => {
    for (const { i } of CLASSES) {
      expect(evoMaterial('hull', i, 2)).toBeNull();
      expect(evoMaterial('sail', i, 1)).toBeNull();
      expect(evoMaterial('cannon', i, 6)).toBeNull();
      for (const t of [3, 4, 5]) {
        expect(evoMaterial('hull', i, t)!.good).toBe('hartholz');
        expect(evoMaterial('cannon', i, t)!.good).toBe('kanonenstahl');
        expect(evoMaterial('sail', i, t)!.good).toBe(t >= 5 ? 'seide' : 'tuch');
      }
      for (const br of EVO_BRANCHES) { const n = [3, 4, 5].map((t) => evoMaterial(br, i, t)!.n); expect(n[1]).toBeGreaterThan(n[0]); expect(n[2]).toBeGreaterThan(n[1]); }
      if (i) expect(evoMaterial('hull', i, 5)!.n).toBeGreaterThan(evoMaterial('hull', i - 1, 5)!.n - 1);
    }
    expect(evoMaterial('hull', 0, 3)!.n).toBeGreaterThanOrEqual(2);
    expect(EVO_MATERIAL[2]).toBe(6);
    // das Material passt in den Frachtraum der jeweiligen Klasse (sonst wäre der Ausbau unmöglich)
    for (const { i } of CLASSES) for (const br of EVO_BRANCHES) { const m = evoMaterial(br, i, 5)!; expect(m.n * GOOD_BY_ID[m.good].vol, `Klasse ${i} ${br}`).toBeLessThan([30, 60, 100, 160, 240, 340, 500][i]); }
  });

  it('Material wird aus dem Frachtraum genommen, nie mehr als vorhanden', () => {
    const e = emptyEconomy();
    expect(takeCargo(e, 'hartholz', 1)).toBe(false);
    e.cargo.hartholz = { n: 10, cost: 400 };
    expect(takeCargo(e, 'hartholz', 11)).toBe(false);
    expect(e.cargo.hartholz!.n).toBe(10);
    expect(takeCargo(e, 'hartholz', 4)).toBe(true);
    expect(e.cargo.hartholz).toEqual({ n: 6, cost: 240 });
    expect(takeCargo(e, 'hartholz', 6)).toBe(true);
    expect(e.cargo.hartholz).toBeUndefined();
    expect(takeCargo(e, 'tuch', 0)).toBe(false);
    // die Waren gibt es zu kaufen: Hartholz im Nordwacht-Markt
    const site = { id: 'nw', name: 'Kiefernhafen', profile: { produce: ['hartholz' as const], demand: [] }, war: { borderDist: 5000, occupied: false, fort: false } };
    const e2 = emptyEconomy();
    expect(buyGood(e2, site, 0, 'hartholz', 5, 1e6, 0).ok).toBe(true);
    expect(e2.cargo.hartholz!.n).toBe(5);
  });

  it('Sold: +0 % auf Stufe 1 bis +35 % auf Stufe 5, nur auf die Wartung des Schiffs, stetig dazwischen', () => {
    const base = { tier: 3, seamen: 48, troops: 0, officers: 3 };
    const u = (evoTier?: number) => upkeepOf({ ...base, evoTier });
    expect(u(1).hull).toBeCloseTo(u(undefined).hull);
    expect(u(5).hull).toBeCloseTo(u(1).hull * (1 + EVO_UPKEEP_MAX));
    expect(u(5).hull / u(1).hull).toBeCloseTo(1.35);
    let prev = 0;
    for (const t of [1, 2, 3, 4, 5]) { expect(u(t).hull).toBeGreaterThan(prev); prev = u(t).hull; }
    // Sold der Besatzung bleibt gleich
    expect(u(5).seamen).toBe(u(1).seamen);
    expect(u(5).officers).toBe(u(1).officers);
    // moderat: auch der Leviathan voll ausgebaut bleibt unter 900 Gold am Tag
    expect(upkeepOf({ tier: 6, seamen: 104, troops: 100, officers: 5, evoTier: 5 }).daily).toBeLessThan(900);
    expect(upkeepOf({ tier: 6, seamen: 104, troops: 100, officers: 5, evoTier: 5 }).daily).toBeGreaterThan(upkeepOf({ tier: 6, seamen: 104, troops: 100, officers: 5, evoTier: 1 }).daily);
    expect(upkeepOf({ ...base, evoTier: 99 }).hull).toBeCloseTo(u(5).hull);
  });

  it('Inzahlungnahme: 50 % des Goldwerts der Ausbauten, das alte Schiff wird zurückgebaut und das Geld lässt sich nicht doppelt holen', () => {
    for (const { i } of CLASSES) {
      const e = evolutionOfTier(5);
      const value = (EVO_COST[1] + EVO_COST[2] + EVO_COST[3] + EVO_COST[4]) * 3 * (1 + i * 0.4);
      expect(evoValue(i, e)).toBeGreaterThan(value * 0.99 - 12);
      expect(evoValue(i, e)).toBeLessThan(value * 1.01 + 12);
      expect(tradeInRefund(i, e)).toBe(Math.round(evoValue(i, e) * 0.5));
      expect(tradeInRefund(i, newShipEvolution())).toBe(0);
    }
    expect(evoValue(0, starterEvolution())).toBe(3 * evoCost(0, 2));
    const ship = defaultShip('pirat');
    ship.evo['0'] = { hullTier: 5, sailTier: 3, cannonTier: 4 };
    const expected = tradeInRefund(0, ship.evo['0']);
    expect(expected).toBeGreaterThan(1000);
    const r1 = applyShipPurchase(ship, 1);
    expect(r1.refund).toBe(expected);
    expect(ship.evo['0']).toEqual(newShipEvolution());
    expect(ship.evo['1']).toEqual(newShipEvolution());
    ship.tier = 1;
    const r2 = applyShipPurchase(ship, 2);                            // das Brigg-Schiff hat nichts ausgebaut
    expect(r2.refund).toBe(0);
    ship.tier = 0;
    expect(applyShipPurchase(ship, 3).refund).toBe(0);                // Schaluppe war schon zurückgebaut: nichts mehr zu holen
    expect(ship.owned).toEqual([0, 1, 2, 3]);
    // Wiederkauf einer schon besessenen Klasse zählt nicht als neues Schiff, setzt sie aber nicht auf Stufe 1 zurück
    const again = defaultShip('pirat');
    again.owned.push(1);
    again.evo['1'] = evolutionOfTier(4);
    again.evo['0'] = evolutionOfTier(5);
    expect(evolutionOf(again, 1)).toEqual(evolutionOfTier(4));
  });

  it('Ausbau-Wirkung und Beschreibung stimmen für alle Zweige und Stufen', () => {
    for (const br of EVO_BRANCHES as readonly EvoBranch[]) for (const t of TIERS_ALL) expect(evoEffectText(br, t).length, `${br} ${t}`).toBeGreaterThan(10);
    for (const br of EVO_BRANCHES) expect(tierOf({ hullTier: 2, sailTier: 3, cannonTier: 4 }, br)).toBe({ hull: 2, sail: 3, cannon: 4 }[br]);
  });
});

describe('KI-Schiffe und Spielstand 17', () => {
  it('KI-Schiffe tragen die Stufe ihrer Gefahrenstufe: stärkere Gegner haben Rammsporn und Drehbassen', () => {
    expect(evolutionOfTier(dangerOfLevel(1)).hullTier).toBe(1);
    expect(evoStats(evolutionOfTier(dangerOfLevel(20))).ram).toBe(true);
    expect(evoStats(evolutionOfTier(dangerOfLevel(8))).swivel).toBe(false);
    expect(evoStats(evolutionOfTier(dangerOfLevel(14))).swivel).toBe(true);
  });

  it('Migration 16 → 17: alte Ausbaustufen werden auf 1 … 5 abgebildet, kein Schiff wird schwächer, alle gekauften Klassen bekommen sie', () => {
    const map = (up: number) => legacyUpToEvo({ can: up, hull: up, sail: up });
    // alte Grundwerte = neue Stufe 3
    expect(map(0)).toEqual(neutralEvolution());
    for (let up = 0; up <= 5; up++) {
      const e = map(up);
      for (const k of [e.hullTier, e.sailTier, e.cannonTier]) { expect(k).toBeGreaterThanOrEqual(3); expect(k).toBeLessThanOrEqual(5); }
      // bis zu den alten Werten (Rumpf +15 %/Stufe bis +45 %, Segel +5 %/Stufe bis +20 %, Kanonen +12 %/Stufe bis +24 %) nie schwächer (nur der Kanonenschaden liegt bis zu 4 Punkte darunter, dafür kommen Durchschlag, Rammsporn-Möglichkeit und Drehbassen)
      if (up <= 3) expect(HULL_HP_K[e.hullTier - 1]).toBeGreaterThanOrEqual(1 + 0.15 * up - 0.001);
      if (up <= 4) expect(SAIL_SPEED_K[e.sailTier - 1]).toBeGreaterThanOrEqual(1 + 0.05 * up - 0.001);
      if (up <= 2) expect(CANNON_DMG_K[e.cannonTier - 1]).toBeGreaterThanOrEqual(1 + 0.12 * up - 0.045);
    }
    expect(map(5)).toEqual(evolutionOfTier(5));
    expect(legacyUpToEvo(undefined)).toEqual(neutralEvolution());
    expect(legacyUpToEvo({ can: 99, hull: -5, sail: 'x' })).toEqual({ hullTier: 3, sailTier: 3, cannonTier: 5 });
    // ganzer Spielstand
    const s = createSave('Alt', 'pirat', 'x');
    const old = JSON.parse(JSON.stringify({ ...s, version: 16 })) as Record<string, any>;
    delete old.ship.evo;
    old.ship = { ...old.ship, tier: 2, owned: [0, 1, 2], up: { can: 1, hull: 2, sail: 4 } };
    const r = migrateSave(old, 'x');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(17);
    expect(r.migratedFrom).toBe(16);
    expect((r.data.ship as unknown as { up?: unknown }).up).toBeUndefined();
    for (const c of ['0', '1', '2']) expect(r.data.ship.evo[c], `Klasse ${c}`).toEqual({ hullTier: 5, sailTier: 5, cannonTier: 4 });
    expect(JSON.parse(JSON.stringify(r.data.ship.evo))).toEqual(r.data.ship.evo);
    // eine zweite Migration ändert nichts (Idempotenz)
    const again = migrateSave(JSON.parse(JSON.stringify(r.data)), 'x');
    expect(again.ok && again.data.ship.evo).toEqual(r.data.ship.evo);
  });

  it('Spielstände mit schon vorhandenem Ausbau-Zustand bleiben unverändert; alte Saves ohne Klassenliste brechen nicht', () => {
    const s = createSave('Neu', 'marine', 'x');
    s.ship.evo['0'] = { hullTier: 4, sailTier: 1, cannonTier: 2 };
    const r = migrateSave(JSON.parse(JSON.stringify(s)), 'x');
    expect(r.ok && r.data.ship.evo['0']).toEqual({ hullTier: 4, sailTier: 1, cannonTier: 2 });
    const odd = JSON.parse(JSON.stringify({ ...s, version: 16 })) as Record<string, any>;
    odd.ship = { tier: 1, look: odd.ship.look, ammo: 'kugel', hull: 1, up: { can: 2, hull: 0, sail: 0 } };
    const r2 = migrateSave(odd, 'x');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(Object.keys(r2.data.ship.evo)).toContain('1');
  });
});
