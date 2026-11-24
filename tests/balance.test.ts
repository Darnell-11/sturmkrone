// Balance-Fundament (data/balanceConfig.ts), 5-Stufen-Ausrüstung, Kauf-Tore und Boss-Siegel-Schmiede (data/crafting.ts).
import { describe, expect, it } from 'vitest';
import {
  ARMOR_K, BONUS_CAP, BOSS_DROP_CHANCE, DANGER, HP_FULL, MAX_REDUCTION, RANK_TIER, SEAL_DROP, TIERS, TIER_DEFS, WEAPON_DMG,
  armorFull, craftCost, damageFactor, dangerOfDistance, dangerOfLevel, mitigation, slotBudget, slotShare, softCap, stackBonus, tierOfRank, type SlotKey, type Tier,
} from '../src/data/balanceConfig';
import { BOSS_SLOTS, UPGRADE_RECIPE, WEAPON_RECIPE, craftCheck, payRecipe, payWeapon, recipeOf, sealTotal, sealsOf, shopGate, weaponCraftCheck, type SealPurse } from '../src/data/crafting';
import { ARMOR, CONSUMABLES, GEAR, HEADS, WEAPONS } from '../src/data/items';
import { GEAR_CATALOG, GEAR_SET_BY_ID, SETS, tierOfSet } from '../src/data/gear';
import { FAME_THRESHOLDS } from '../src/data/ranks';
import { BORDER_FORTS, CITADELS } from '../src/data/factions';
import { PLAYABLE_RADIUS, WORLD_RADIUS } from '../src/data/world';
import { catalog } from '../src/data/catalog';
import { BOSS_PIECES, bossSetId } from '../src/raid/raidLoot';
import { computeStats, type StatInput } from '../src/core/inventory';
import { createSave, SAVE_VERSION } from '../src/core/save/types';
import type { EntityId } from '../src/sim/entityId';
import { migrateSave } from '../src/core/save/migrations';
import { boardingStrength, createShipSim } from '../src/naval/shipSim';

const SLOTS: SlotKey[] = ['head', 'shoulder', 'chest', 'cloak', 'hands', 'legs', 'feet', 'mainhand', 'offhand'];

describe('Rüstungs- und Widerstandskurve', () => {
  it('asymptotisch: steigt mit der Rüstung, erreicht nie 100 %, fällt gegen stärkere Angreifer', () => {
    expect(mitigation(0, 1)).toBe(0);
    let prev = 0;
    for (const a of [1, 10, 50, 200, 1000, 1e5, 1e9]) {
      const m = mitigation(a, 3);
      expect(m).toBeGreaterThan(prev);
      expect(m).toBeLessThan(1);
      prev = m;
    }
    for (const a of [20, 100, 400]) for (let t = 1; t < 5; t++) expect(mitigation(a, t + 1)).toBeLessThan(mitigation(a, t));
    expect(mitigation(ARMOR_K, 1)).toBeCloseTo(0.5);        // Rüstung = K · Stufe → genau die Hälfte
    expect(mitigation(NaN, 2)).toBe(0);
    expect(mitigation(-50, 2)).toBe(0);
  });

  it('der Schaden sinkt nie unter den Mindestanteil, egal wie viel Rüstung und Prozent-Boni', () => {
    expect(damageFactor(1e9, 1, 5)).toBeCloseTo(1 - MAX_REDUCTION);
    expect(damageFactor(0, 1, 0)).toBe(1);
    expect(damageFactor(100, 3, 0.3)).toBeCloseTo((1 - mitigation(100, 3)) * 0.7);
  });

  it('ein voller Satz jeder Stufe fängt gegen Angreifer gleicher Stufe das Zielmaß ab, aber nie alles', () => {
    for (const t of TIERS) {
      const m = mitigation(armorFull(t), t);
      expect(m).toBeGreaterThan(TIER_DEFS[t].targetMitigation - 0.01);
      expect(m).toBeLessThan(TIER_DEFS[t].targetMitigation + 0.01);
      expect(m).toBeLessThan(0.5);
    }
    // höhere Stufen sind absolut stärker …
    for (const t of [1, 2, 3, 4] as Tier[]) expect(armorFull((t + 1) as Tier)).toBeGreaterThan(armorFull(t));
    // … und Stufe-1-Rüstung hilft gegen einen Stufe-5-Gegner kaum
    expect(mitigation(armorFull(1), 5)).toBeLessThan(0.1);
  });
});

describe('Soft-Cap für gestapelte Boni', () => {
  it('bis zum Knie linear, darüber stetig und sanft, nie über der Obergrenze', () => {
    expect(softCap(0.2, 0.8)).toBe(0.2);
    expect(softCap(0.4, 0.8)).toBe(0.4);
    expect(softCap(-1, 0.8)).toBe(0);
    expect(softCap(NaN, 0.8)).toBe(0);
    const eps = 1e-6;
    expect(Math.abs(softCap(0.4 + eps, 0.8) - softCap(0.4 - eps, 0.8))).toBeLessThan(3e-6);       // stetig am Knie
    const slopeBelow = (softCap(0.4, 0.8) - softCap(0.4 - 1e-4, 0.8)) / 1e-4;
    const slopeAbove = (softCap(0.4 + 1e-4, 0.8) - softCap(0.4, 0.8)) / 1e-4;
    expect(Math.abs(slopeBelow - slopeAbove)).toBeLessThan(1e-3);                                   // kein Knick
    let prev = 0;
    for (const x of [0.5, 1, 2, 5, 20, 1000]) { const v = softCap(x, 0.8); expect(v).toBeGreaterThanOrEqual(prev); expect(v).toBeLessThanOrEqual(0.8); prev = v; }
    expect(softCap(1, 0.8)).toBeGreaterThan(softCap(0.5, 0.8));
    // Synergien lohnen sich, aber mit abnehmendem Ertrag
    expect(softCap(0.9, 0.8) - softCap(0.8, 0.8)).toBeLessThan(0.1);
  });

  it('stackBonus ignoriert negative Teile und deckelt die Summe', () => {
    expect(stackBonus([0.1, 0.2, -5], 0.8)).toBeCloseTo(0.3);
    expect(stackBonus([0.5, 0.5, 0.5, 0.5], 0.8)).toBeLessThan(0.8);
    expect(stackBonus([], 0.8)).toBe(0);
  });

  it('Inventar-Werte stapeln über den Deckel (Angriff, Volltreffer, Schadensminderung, Gold)', () => {
    const g = createSave('A', 'pirat', 'x').gear;
    const base: StatInput = { level: 5, gear: g, style: 'schwert', hpPassive: 0, critPassive: 0, atkCrew: 1, weaponCrew: 1, fajiCrew: 0, buff: { atk: 0, reduce: 0, crit: 0 } };
    const huge = computeStats({ ...base, critPassive: 9, buff: { atk: 9, reduce: 9, crit: 9 } });
    const none = computeStats(base);
    expect(huge.atk / none.atk).toBeLessThanOrEqual(1 + BONUS_CAP.atk + 1e-9);
    expect(huge.crit).toBeLessThanOrEqual(0.1 + BONUS_CAP.crit + 1e-9);
    expect(huge.reduce).toBeLessThanOrEqual(BONUS_CAP.reduce + 1e-9);
  });

  it('Enterkraft: Truppen voll = unverändert, weitere Boni (Offiziere, Fraktionen) laufen in den weichen Deckel', () => {
    const sim = createShipSim('ship-test' as EntityId, 300, 300, 6, 12);
    const plain = boardingStrength(sim.crew);
    expect(plain.damage).toBeGreaterThanOrEqual(1);
    const stacked = boardingStrength(sim.crew, undefined, 50);
    expect(stacked.damage).toBeLessThan(1 + BONUS_CAP.boarding + 0.21);
    expect(stacked.hp).toBeLessThan(1 + BONUS_CAP.boarding + 0.21);
    expect(boardingStrength(sim.crew, undefined, 0.2).damage).toBeGreaterThanOrEqual(plain.damage);
  });
});

describe('Gefahrenstufen und Ränge', () => {
  it('fünf Stufen, Richtwerte steigen streng, Gegnerstufen lückenlos', () => {
    expect(TIERS).toEqual([1, 2, 3, 4, 5]);
    for (const t of [1, 2, 3, 4] as Tier[]) {
      const a = DANGER[t], b = DANGER[(t + 1) as Tier];
      expect(b.hp).toBeGreaterThan(a.hp);
      expect(b.dmg).toBeGreaterThan(a.dmg);
      expect(b.armor).toBeGreaterThan(a.armor);
      expect(b.levelMin).toBe(a.levelMax + 1);
      expect(b.zoneFrom).toBe(a.zoneTo);
    }
    expect(DANGER[1].levelMin).toBe(1);
    expect(DANGER[1].zoneFrom).toBe(0);
    expect(DANGER[5].zoneTo).toBe(1);
  });

  it('Gegnerstufe → Gefahrenstufe an den Bandgrenzen', () => {
    expect(dangerOfLevel(1)).toBe(1); expect(dangerOfLevel(4)).toBe(1); expect(dangerOfLevel(5)).toBe(2);
    expect(dangerOfLevel(8)).toBe(2); expect(dangerOfLevel(9)).toBe(3); expect(dangerOfLevel(13)).toBe(3);
    expect(dangerOfLevel(14)).toBe(4); expect(dangerOfLevel(17)).toBe(4); expect(dangerOfLevel(18)).toBe(5); expect(dangerOfLevel(60)).toBe(5);
  });

  it('Zonen (seit 4.3B in Metern, vier Ringe): Ankerglück = 1, Grenzfestungen in Ring 2, äußere Raid-Festungen = 5', () => {
    expect(dangerOfDistance(0)).toBe(1);
    expect(dangerOfDistance(2199)).toBe(1);
    expect(dangerOfDistance(2500)).toBe(2);
    expect(dangerOfDistance(4500)).toBe(3);
    expect(dangerOfDistance(7000)).toBe(4);
    for (const f of BORDER_FORTS) expect(dangerOfDistance(f.radius), f.id).toBe(2);
    for (const c of CITADELS) expect(dangerOfDistance(c.dist), c.id).toBe(5);
    expect(dangerOfDistance(WORLD_RADIUS * 3)).toBe(5);
    expect(dangerOfDistance(PLAYABLE_RADIUS * 0.5, PLAYABLE_RADIUS)).toBe(3);
    for (const c of CITADELS) expect(dangerOfLevel(c.level), c.id).toBeGreaterThanOrEqual(4);
  });

  it('zehn Ruhm-Ränge passen auf die Stufen: 0–1, 2–3, 4–6, 7–8, 9', () => {
    expect(RANK_TIER.length).toBe(FAME_THRESHOLDS.length);
    for (const t of TIERS) for (let r = TIER_DEFS[t].rankMin; r <= TIER_DEFS[t].rankMax; r++) expect(tierOfRank(r), `Rang ${r}`).toBe(t);
    expect(tierOfRank(-3)).toBe(1);
    expect(tierOfRank(99)).toBe(5);
  });
});

describe('Power-Budget der Ausrüstung', () => {
  it('die neun Plätze teilen das Budget einer Stufe vollständig', () => {
    expect(SLOTS.reduce((a, s) => a + slotShare(s), 0)).toBeCloseTo(1);
    for (const t of TIERS) {
      const hp = SLOTS.reduce((a, s) => a + slotBudget(t, s).hp, 0);
      const ar = SLOTS.reduce((a, s) => a + slotBudget(t, s).armor, 0);
      expect(Math.abs(hp - HP_FULL[t])).toBeLessThanOrEqual(5);
      expect(Math.abs(ar - armorFull(t))).toBeLessThan(2);
    }
  });

  it('jeder Platz wird mit der Stufe stärker; Preise steigen, Stufe 5 hat keinen Ladenpreis', () => {
    for (const s of SLOTS) for (const t of [1, 2, 3] as Tier[]) {
      const a = slotBudget(t, s), b = slotBudget((t + 1) as Tier, s);
      expect(b.hp).toBeGreaterThan(a.hp);
      expect(b.armor).toBeGreaterThan(a.armor);
      if (t < 4) expect(b.price).toBeGreaterThan(a.price);
      expect(slotBudget(5, s).price).toBe(0);
    }
    for (const t of [1, 2, 3, 4] as Tier[]) expect(WEAPON_DMG[(t + 1) as Tier]).toBeGreaterThan(WEAPON_DMG[t]);
  });

  it('alle Waffen, Rüstungen, Köpfe, Schienen und Sets haben eine Stufe und bleiben im Budget', () => {
    for (const w of WEAPONS) { expect(TIERS).toContain(w.tier); expect(w.dmg).toBeLessThanOrEqual(WEAPON_DMG[w.tier]); }
    for (let i = 1; i < WEAPONS.length; i++) { expect(WEAPONS[i].tier).toBeGreaterThanOrEqual(WEAPONS[i - 1].tier); expect(WEAPONS[i].dmg).toBeGreaterThan(WEAPONS[i - 1].dmg); }
    ARMOR.forEach((a, i) => { const b = slotBudget(a.tier, 'chest'); expect(a.hp).toBeLessThanOrEqual(b.hp); expect(a.armor).toBeLessThanOrEqual(b.armor); if (i) expect(a.hp).toBeGreaterThan(ARMOR[i - 1].hp); });
    for (const h of HEADS) { const b = slotBudget(h.tier, 'head'); expect(h.hp).toBe(b.hp); expect(h.armor).toBe(b.armor); expect(h.price).toBe(b.price); }
    for (const g of GEAR) { const b = slotBudget(g.tier, g.slot); expect(g.hp).toBe(b.hp); expect(g.armor).toBe(b.armor); }
    for (const d of GEAR_CATALOG) {
      const b = slotBudget(d.tier!, d.cat!);
      expect(d.bonus!.hp, d.id).toBe(b.hp);
      expect(d.bonus!.armor, d.id).toBe(b.armor);
      expect(d.price, d.id).toBe(b.price);
    }
    for (const c of CONSUMABLES) expect(TIERS).toContain(c.tier);
  });

  it('Sets: Stufe 1 – 4 normal, Raid-Sets genau Stufe 5; jede Stufe ist vertreten', () => {
    for (const s of SETS) expect(tierOfSet(s), s.id).toBe(s.raid ? 5 : tierOfSet(s));
    for (const s of SETS.filter((x) => x.raid)) expect(tierOfSet(s)).toBe(5);
    for (const s of SETS.filter((x) => !x.raid)) expect(tierOfSet(s)).toBeLessThanOrEqual(4);
    const present = new Set([...SETS.map(tierOfSet), ...WEAPONS.map((w) => w.tier), ...ARMOR.map((a) => a.tier)]);
    for (const t of TIERS) expect(present.has(t), `Stufe ${t}`).toBe(true);
  });
});

describe('Kauf-Tore', () => {
  const ok = { playerRank: 9, standing: 100 };
  it('Stufe 5 und 4 sind nie käuflich, auch nicht mit maximalem Rang und Ansehen', () => {
    expect(shopGate({ tier: 5, ...ok })).toEqual({ ok: false, kind: 'siegel' });
    expect(shopGate({ tier: 4, ...ok })).toEqual({ ok: false, kind: 'beute' });
  });

  it('Stufe 3 braucht Rang UND Ansehen „Freundlich“, Stufe 1 – 2 nur den Rang', () => {
    expect(shopGate({ tier: 3, playerRank: 3, standing: 100 })).toEqual({ ok: false, kind: 'rank', needRank: 4 });
    expect(shopGate({ tier: 3, playerRank: 4, standing: 19 })).toEqual({ ok: false, kind: 'rep', needStanding: 20 });
    expect(shopGate({ tier: 3, playerRank: 4, standing: 20 })).toEqual({ ok: true });
    expect(shopGate({ tier: 2, playerRank: 1, standing: -100 })).toEqual({ ok: false, kind: 'rank', needRank: 2 });
    expect(shopGate({ tier: 2, playerRank: 2, standing: -100 })).toEqual({ ok: true });
    expect(shopGate({ tier: 1, rank: 1, playerRank: 0, standing: 0 })).toEqual({ ok: false, kind: 'rank', needRank: 1 });
    expect(shopGate({ tier: 1, playerRank: 0, standing: 0 })).toEqual({ ok: true });
  });

  it('ein Stück verlangt mindestens den Rang seiner Stufe, auch wenn seine eigene Angabe niedriger ist', () => {
    for (const h of HEADS) if (h.tier >= 2) expect(shopGate({ tier: h.tier, rank: h.rank, playerRank: TIER_DEFS[h.tier].rankMin - 1, standing: 100 }).ok, h.id).toBe(false);
    for (const w of WEAPONS) expect(w.rank, w.n).toBeGreaterThanOrEqual(w.tier === 1 ? 0 : TIER_DEFS[w.tier].rankMin);
    for (const a of ARMOR) expect(a.rank, a.n).toBeGreaterThanOrEqual(a.tier === 1 ? 0 : TIER_DEFS[a.tier].rankMin);
  });

  it('Raid-Sets und Stufe-5-Waffe stehen in keinem Laden: ihre Tore sind „Siegel“', () => {
    for (const s of SETS.filter((x) => x.raid)) expect(shopGate({ tier: tierOfSet(s), ...ok })).toEqual({ ok: false, kind: 'siegel' });
    expect(shopGate({ tier: WEAPONS[WEAPONS.length - 1].tier, ...ok }).ok).toBe(false);
  });
});

describe('Boss-Siegel-Schmiede', () => {
  const purse = (seals: number, shards: number): SealPurse => ({ seals: { england: seals }, shards });
  it('jedes Boss-Stück hat ein Rezept; teurere Plätze kosten mehr', () => {
    for (const f of ['england', 'niederlande', 'deutschland', 'frankreich', 'kurogane', 'marine'] as const) {
      const set = GEAR_SET_BY_ID[bossSetId(f)];
      for (const c of BOSS_PIECES) {
        if (!(set.pieces as Record<string, unknown>)[c]) continue;
        const r = recipeOf(`${set.id}_${c}`)!;
        expect(r, `${set.id}_${c}`).toBeTruthy();
        expect(r.factionId).toBe(f);
        expect(r.rank).toBe(9);
        expect(r.seals).toBeGreaterThanOrEqual(2);
      }
    }
    expect(recipeOf('kette_head')).toBeNull();
    expect(craftCost('chest').seals).toBeGreaterThan(craftCost('cloak').seals);
    expect(BOSS_SLOTS.sort()).toEqual([...BOSS_PIECES].sort());
  });

  it('Drop-Chancen liegen zwischen 8 und 15 %; Bad-Luck-Schutz: das Schmieden ist nach wenigen Siegen möglich', () => {
    for (const p of BOSS_PIECES) { expect(BOSS_DROP_CHANCE[p]).toBeGreaterThanOrEqual(0.08); expect(BOSS_DROP_CHANCE[p]).toBeLessThanOrEqual(0.15); }
    // mit den garantierten Siegen (2 beim ersten, danach 1 je Sieg) ist selbst das teuerste Stück in endlich vielen Siegen bezahlt
    const worst = Math.max(...BOSS_PIECES.map((p) => craftCost(p).seals));
    expect(SEAL_DROP.first + SEAL_DROP.repeat * 8).toBeGreaterThanOrEqual(worst);
  });

  it('prüft Rang, Ehre, Siegel, Splitter und Gold – in dieser Reihenfolge – und verhindert Doppelschmieden', () => {
    const r = recipeOf('boss_england_head')!;
    const base = { gold: 1e6, playerRank: 9, honor: 999, purse: purse(99, 99), owned: false };
    expect(craftCheck(r, base)).toEqual({ ok: true });
    expect(craftCheck(r, { ...base, owned: true }).ok).toBe(false);
    expect(craftCheck(r, { ...base, playerRank: 8 }).ok).toBe(false);
    expect(craftCheck(r, { ...base, honor: r.honor - 1 }).ok).toBe(false);
    expect(craftCheck(r, { ...base, purse: purse(r.seals - 1, 99) }).ok).toBe(false);
    expect(craftCheck(r, { ...base, purse: { seals: { frankreich: 99 }, shards: 99 } }).ok).toBe(false);     // Siegel einer anderen Macht zählen nicht
    expect(craftCheck(r, { ...base, purse: purse(99, r.shards - 1) }).ok).toBe(false);
    expect(craftCheck(r, { ...base, gold: r.gold - 1 }).ok).toBe(false);
    const p = purse(r.seals + 1, r.shards + 2);
    payRecipe(r, p);
    expect(sealsOf(p, 'england')).toBe(1);
    expect(p.shards).toBe(2);
  });

  it('Stufe-5-Waffe: Siegel beliebiger Mächte, häufigste zuerst', () => {
    const p: SealPurse = { seals: { england: 4, frankreich: 3 }, shards: 7 };
    const base = { gold: WEAPON_RECIPE.gold, playerRank: 9, purse: p, owned: false };
    expect(weaponCraftCheck(base)).toEqual({ ok: true });
    expect(weaponCraftCheck({ ...base, playerRank: 8 }).ok).toBe(false);
    expect(weaponCraftCheck({ ...base, gold: WEAPON_RECIPE.gold - 1 }).ok).toBe(false);
    expect(weaponCraftCheck({ ...base, owned: true }).ok).toBe(false);
    expect(weaponCraftCheck({ ...base, purse: { seals: { england: 2 }, shards: 99 } }).ok).toBe(false);
    payWeapon(p);
    expect(sealTotal(p)).toBe(7 - WEAPON_RECIPE.seals);
    expect(p.shards).toBe(7 - WEAPON_RECIPE.shards);
    expect(UPGRADE_RECIPE.rank).toBe(9);
  });
});

describe('Spielstand 14 → 15 und Kompendium', () => {
  it('begrenzt Stufen-Indizes, gibt für Eroberungen Siegel und Splitter und lässt Besitz unberührt', () => {
    const s = createSave('Alt', 'pirat', 'x');
    const old = { ...s, version: 14 } as Record<string, any>;
    old.gear = { ...old.gear, weapon: 99, armor: 42, weaponEq: 77, loot: ['kette_head'] };
    old.ship = { ...old.ship, up: { can: 9, hull: 2, sail: -4 } };
    delete old.ship.evo;
    old.progress = { ...old.progress, unlocks: { sails: ['sail:england'], ornaments: [], bossLoot: ['boss_england_head'] }, conquest: { albion: { islandId: 'albion', factionId: 'england', conquestCount: 3 } } };
    const r = migrateSave(old, 'x');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.version).toBe(SAVE_VERSION);
    expect(r.data.gear.weapon).toBe(WEAPONS.length - 1);
    expect(r.data.gear.armor).toBe(ARMOR.length - 1);
    expect(r.data.gear.weaponEq).toBeLessThanOrEqual(r.data.gear.weapon);
    // die alten Ausbaustufen (can 9→5, hull 2, sail −4→0) sind jetzt Evolution: Kanonen 5, Rumpf 5, Segel 3 (data/shipEvolution.ts legacyUpToEvo)
    expect((r.data.ship as unknown as { up?: unknown }).up).toBeUndefined();
    expect(r.data.ship.evo['0']).toEqual({ hullTier: 5, sailTier: 3, cannonTier: 5 });
    expect(r.data.gear.loot).toEqual(['kette_head']);
    expect(r.data.progress.unlocks!.bossLoot).toEqual(['boss_england_head']);
    expect(r.data.progress.unlocks!.seals).toEqual({ england: 3 });
    expect(r.data.progress.unlocks!.shards).toBe(6);
    expect(r.migratedFrom).toBe(14);
  });

  it('jedes Ausrüstungs-Stück im Kompendium nennt Stufe, Rang, Ruf und Fundort; Relikte zusätzlich das Rezept', () => {
    const list = catalog().filter((e) => ['waffen', 'ruestung', 'verbrauch'].includes(e.cat));
    expect(list.length).toBeGreaterThan(100);
    for (const e of list) {
      expect(e.tier, e.id).toBeDefined();
      expect(e.rankReq, e.id).toBeTruthy();
      expect(e.repReq, e.id).toBeTruthy();
      expect(e.origin, e.id).toBeTruthy();
      expect(e.stats.some((s) => s.label === 'Qualität'), e.id).toBe(true);
    }
    const boss = catalog().filter((e) => e.id.startsWith('set:boss_'));
    expect(boss.length).toBeGreaterThan(30);
    for (const e of boss) { expect(e.tier, e.id).toBe(5); expect(e.recipe, e.id).toMatch(/Boss-Siegel/); expect(e.repReq, e.id).toMatch(/Siegel/); }
    const relic = catalog().find((e) => e.id === `weapon:schwert:${WEAPONS.length - 1}`)!;
    expect(relic.tier).toBe(5);
    expect(relic.recipe).toBeTruthy();
    // Stufe 4 ist nie im Laden
    for (const e of list.filter((x) => x.tier === 4)) expect(e.repReq, e.id).toMatch(/Beute/);
  });
});
