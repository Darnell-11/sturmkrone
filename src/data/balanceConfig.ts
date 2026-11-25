// Balance-Fundament: die eine Quelle für Rüstungs- und Widerstandskurve, Soft-Caps für Prozent-Boni, Gefahrenstufen der Karte,
// die fünf Qualitätsstufen der Ausrüstung und ihr Power-Budget. Reine Daten und Rechnung (ohne three.js, JSON-tauglich): ein Server
// kann dieselben Formeln benutzen. Nirgends sonst stehen Schadens-, Rüstungs- oder Preiskurven: Läden, Beute, Inventar und Kompendium
// lesen alles von hier (Items leiten ihre Werte aus `slotBudget` ab, `tests/balance.test.ts` prüft die Rechnung).

import { PLAYABLE_RADIUS } from './world';

export type Tier = 1 | 2 | 3 | 4 | 5;
/** Gefahrenstufe von Gegnern, Zonen und Rängen: dieselbe Skala wie die Qualitätsstufe der Ausrüstung */
export type DangerTier = Tier;
export const TIERS: readonly Tier[] = [1, 2, 3, 4, 5];
export const clampTier = (n: number): Tier => (Math.max(1, Math.min(5, Math.round(n))) as Tier);

// ---------- Rüstung und Widerstand ----------

/** Härte der Kurve je Angreifer-Stufe: `armor / (armor + ARMOR_K · Angreiferstufe)` */
export const ARMOR_K = 55;
/** Elementarer Widerstand im Verhältnis zur Rüstung (dieselbe Kurve, etwas weniger Wert je Punkt) */
export const RESIST_RATIO = 0.8;
/** Obergrenze der Schadensminderung insgesamt (Rüstung, Prozent-Boni, Stärkungen): nie Unverwundbarkeit */
export const MAX_REDUCTION = 0.85;

/**
 * Asymptotische Minderung 0 … <1: viel Rüstung schützt spürbar, ergibt aber nie 100 %. Ein stärkerer Angreifer (höhere Stufe)
 * durchschlägt dieselbe Rüstung leichter.
 */
export function mitigation(armor: number, attackerTier: number): number {
  const a = Math.max(0, Number.isFinite(armor) ? armor : 0);
  const k = ARMOR_K * Math.max(1, attackerTier);
  return a / (a + k);
}

/** Elementarer Widerstand (aus der Rüstung) gegen einen Angreifer dieser Stufe */
export const resistOf = (armor: number) => armor * RESIST_RATIO;

/** Der Schaden, der nach Rüstung (oder Widerstand) und Prozent-Minderung übrig bleibt, als Faktor 0 … 1 */
export function damageFactor(rating: number, attackerTier: number, pctReduce = 0): number {
  const pct = Math.min(MAX_REDUCTION, Math.max(0, pctReduce));
  const f = (1 - mitigation(rating, attackerTier)) * (1 - pct);
  return Math.max(1 - MAX_REDUCTION, f);
}

// ---------- Soft-Cap für gestapelte Prozent-Boni ----------

/**
 * Sanfter Deckel: bis zum Knie (Standard: halbe Obergrenze) zählt der Wert voll, darüber schmiegt er sich der Obergrenze an
 * (stetig und ohne Knick). Synergien lohnen sich, aber Offiziers-Perks, Item-Boni und Fraktions-Buffs explodieren nie zu absurden Faktoren.
 */
export function softCap(x: number, cap: number, knee = cap * 0.5): number {
  if (!(x > 0)) return 0;
  if (x <= knee) return x;
  const span = cap - knee;
  return knee + span * (1 - Math.exp(-(x - knee) / span));
}

/** Summe mehrerer Prozent-Boni, dann durch den Soft-Cap */
export const stackBonus = (parts: readonly number[], cap: number, knee?: number): number => softCap(parts.reduce((a, b) => a + (b > 0 ? b : 0), 0), cap, knee);

/** Obergrenzen der gestapelten Boni (Anteil; 0,6 = +60 % höchstens) */
export const BONUS_CAP = {
  atk: 0.75,
  crit: 0.6,
  /** Prozent-Schadensminderung aus Sets, Köpfen, Stärkungen (zusätzlich zur Rüstung) */
  reduce: 0.5,
  faji: 1.0,
  gold: 0.6,
  /** Enterkraft: Truppen, Offiziers-Perks, Fraktions-Buffs */
  boarding: 1.0,
} as const;

// ---------- Stufen, Ränge, Gefahr ----------

/** Rang (Index in FAME_THRESHOLDS, 0 … 9) → Stufe der Ausrüstung, die er sinnvoll tragen kann */
export const RANK_TIER: readonly Tier[] = [1, 1, 2, 2, 3, 3, 3, 4, 4, 5];
export const tierOfRank = (rank: number): Tier => RANK_TIER[Math.max(0, Math.min(RANK_TIER.length - 1, Math.floor(rank)))];

export interface TierDef {
  tier: Tier;
  /** Kurzer Name der Stufe, mit Rang-Namen („Admirals-Grad“) */
  name: string;
  grade: string;
  /** Rang-Bereich (Index in FAME_THRESHOLDS) */
  rankMin: number;
  rankMax: number;
  /** Mindest-Ansehen beim Hafen einer Macht, um die Stufe zu kaufen (0 = keins nötig; null = nie im Laden) */
  repMin: number | null;
  /** Wo es die Stufe gibt: Laden, Beute oder Schmieden */
  source: 'laden' | 'ruf-laden' | 'beute' | 'siegel';
  /** Kurz für Kompendium und Tooltips */
  sourceText: string;
  /** Zielwert: so viel Schaden fängt ein voller Satz dieser Stufe gegen einen Angreifer GLEICHER Stufe ab */
  targetMitigation: number;
}

export const TIER_DEFS: Record<Tier, TierDef> = {
  1: { tier: 1, name: 'Verwittert', grade: 'Einfach', rankMin: 0, rankMax: 1, repMin: 0, source: 'laden', sourceText: 'Hafenmarkt, Plünderung', targetMitigation: 0.30 },
  2: { tier: 2, name: 'Solide', grade: 'Gehärtet', rankMin: 2, rankMax: 3, repMin: 0, source: 'laden', sourceText: 'Hafen- und Schmiedeware', targetMitigation: 0.35 },
  3: { tier: 3, name: 'Meisterhaft', grade: 'Offiziers-Grad', rankMin: 4, rankMax: 6, repMin: 20, source: 'ruf-laden', sourceText: 'Ausrüster einer Macht (Ansehen „Freundlich“ nötig)', targetMitigation: 0.40 },
  4: { tier: 4, name: 'Kriegsherr', grade: 'Admirals-Grad', rankMin: 7, rankMax: 8, repMin: null, source: 'beute', sourceText: 'Beute aus Grenzfestungen, Ereignisflotten und Aufträgen', targetMitigation: 0.42 },
  5: { tier: 5, name: 'Relikt', grade: 'Legendär', rankMin: 9, rankMax: 9, repMin: null, source: 'siegel', sourceText: 'Endboss-Beute, schmiedbar mit Boss-Siegeln', targetMitigation: 0.45 },
};

/** Kosten-Faktor je Stufe: Gold-Preis eines Stücks mit Gewicht 1 */
export const TIER_PRICE: Record<Tier, number> = { 1: 150, 2: 600, 3: 2000, 4: 6000, 5: 0 };

/** Voller Satz (alle neun Plätze) einer Stufe: Rüstungswert, folgt aus dem Zielwert der Minderung gegen Angreifer gleicher Stufe */
export const armorFull = (t: Tier): number => {
  const m = TIER_DEFS[t].targetMitigation;
  return Math.round((ARMOR_K * t * m) / (1 - m));
};
/** Voller Satz: Lebenspunkte aus der Ausrüstung */
export const HP_FULL: Record<Tier, number> = { 1: 210, 2: 490, 3: 880, 4: 1450, 5: 2100 };
/** Waffen: Schadenszuschlag je Stufe (die Waffe ersetzt die ältere, summiert sich nie mit ihr) */
export const WEAPON_DMG: Record<Tier, number> = { 1: 6, 2: 14, 3: 25, 4: 40, 5: 60 };

/** Plätze mit ihrem Anteil am Budget einer Stufe (Summe aller neun Plätze = 1) */
export type SlotKey = 'head' | 'shoulder' | 'chest' | 'cloak' | 'hands' | 'legs' | 'feet' | 'mainhand' | 'offhand';
const SLOT_WEIGHT: Record<SlotKey, number> = { chest: 1, legs: 0.75, head: 0.65, shoulder: 0.55, feet: 0.45, hands: 0.4, cloak: 0.3, mainhand: 0.7, offhand: 0.4 };
const SLOT_SUM = Object.values(SLOT_WEIGHT).reduce((a, b) => a + b, 0);
export const slotShare = (slot: SlotKey): number => SLOT_WEIGHT[slot] / SLOT_SUM;
/** Gewicht des Platzes (Preisanteil, Chest = 1) */
export const slotWeight = (slot: SlotKey): number => SLOT_WEIGHT[slot];

export interface SlotBudget { hp: number; armor: number; price: number }
/** Power-Budget eines Stücks: Lebenspunkte, Rüstungswert und Preis folgen allein aus Stufe und Platz */
export function slotBudget(tier: Tier, slot: SlotKey): SlotBudget {
  const sh = slotShare(slot);
  return {
    hp: Math.round(HP_FULL[tier] * sh),
    armor: Math.round(armorFull(tier) * sh * 10) / 10,
    price: TIER_PRICE[tier] ? Math.round((TIER_PRICE[tier] * SLOT_WEIGHT[slot]) / 10) * 10 : 0,
  };
}

// ---------- Gefahrenstufen der Karte ----------

export interface DangerDef {
  tier: DangerTier;
  name: string;
  /** Richtwerte für einen Gegner dieser Stufe (Faktor auf den Grundgegner): Leben, Schaden, Panzerung (Rüstungswert wie bei Spielern) */
  hp: number;
  dmg: number;
  armor: number;
  /** Gegnerstufen dieses Bandes (Enemy.level, einschließlich) */
  levelMin: number;
  levelMax: number;
  /** Bereich als Anteil des spielbaren Radius (vom Mittelpunkt); in Metern: `DANGER_BANDS_M` */
  zoneFrom: number;
  zoneTo: number;
}

/**
 * Gefahrenbänder in Metern seit 4.5C: Ring 1 = Stufe 1, Ring 2 = Stufe 2, Ring 3 = Stufe 3, Ring 4 = Stufe 4 bis zu den Königsinseln (11 600 m),
 * danach Stufe 5 (Königsinseln, Marine-Hauptquartier und Ring 5, die Kaiser-Stufe) bis zur Sturm-Barriere.
 */
export const DANGER_BANDS_M: Record<DangerTier, [number, number]> = { 1: [0, 2800], 2: [2800, 6600], 3: [6600, 10200], 4: [10200, 11600], 5: [11600, PLAYABLE_RADIUS] };
const zf = (t: DangerTier) => DANGER_BANDS_M[t][0] / PLAYABLE_RADIUS;
const zt = (t: DangerTier) => (t === 5 ? 1 : DANGER_BANDS_M[t][1] / PLAYABLE_RADIUS);

export const DANGER: Record<DangerTier, DangerDef> = {
  1: { tier: 1, name: 'Heimatgewässer', hp: 1.0, dmg: 1.0, armor: 20, levelMin: 1, levelMax: 4, zoneFrom: zf(1), zoneTo: zt(1) },
  2: { tier: 2, name: 'Küstenmeere', hp: 1.8, dmg: 1.5, armor: 50, levelMin: 5, levelMax: 8, zoneFrom: zf(2), zoneTo: zt(2) },
  3: { tier: 3, name: 'Offene See', hp: 3.0, dmg: 2.2, armor: 95, levelMin: 9, levelMax: 13, zoneFrom: zf(3), zoneTo: zt(3) },
  4: { tier: 4, name: 'Kriegsgewässer', hp: 4.8, dmg: 3.2, armor: 150, levelMin: 14, levelMax: 17, zoneFrom: zf(4), zoneTo: zt(4) },
  5: { tier: 5, name: 'Festungsgürtel', hp: 7.5, dmg: 4.5, armor: 215, levelMin: 18, levelMax: 999, zoneFrom: zf(5), zoneTo: zt(5) },
};

/** Gefahrenstufe eines Gegners nach seiner Stufe */
export function dangerOfLevel(level: number): DangerTier {
  for (const t of TIERS) if (level <= DANGER[t].levelMax) return t;
  return 5;
}

/** Gefahrenstufe eines Ortes: Abstand vom Mittelpunkt (Ankerglück ≈ 0) im Verhältnis zum spielbaren Radius */
export function dangerOfDistance(dist: number, worldRadius: number = PLAYABLE_RADIUS): DangerTier {
  const f = Math.max(0, dist) / Math.max(1, worldRadius);
  for (const t of TIERS) if (f < DANGER[t].zoneTo) return t;
  return 5;
}

/** Wie stark ein Spieler dieses Rangs in einer Zone dieser Gefahr ist: −2 … +2 (0 = passend); für Warnungen und Richtwerte */
export const rankFit = (rank: number, zone: DangerTier): number => tierOfRank(rank) - zone;

// ---------- Beute und Siegel ----------

/** Wahrscheinlichkeit, dass ein Endboss-Stück bei einem Sieg fällt (je nach Platz); dazu garantiert ein Siegel (Bad-Luck-Schutz) */
export const BOSS_DROP_CHANCE: Record<'mainhand' | 'head' | 'chest' | 'shoulder' | 'cloak' | 'offhand', number> = {
  mainhand: 0.08, head: 0.08, chest: 0.10, shoulder: 0.12, offhand: 0.12, cloak: 0.15,
};
/** Siegel, die ein Sieg garantiert (erster Sieg über den Boss mehr) und Relikt-Splitter als seltenes Material */
export const SEAL_DROP = { first: 2, repeat: 1, shardsMin: 1, shardsMax: 3 } as const;
/** Kosten eines Boss-Stücks beim Schmieden: Siegel dieser Macht, Splitter, Gold (Anteil der Stufe-4-Preise), Mindest-Ehre bei der Macht */
export function craftCost(slot: keyof typeof BOSS_DROP_CHANCE): { seals: number; shards: number; gold: number; honor: number } {
  const w = SLOT_WEIGHT[slot];
  return { seals: Math.max(2, Math.round(w * 6)), shards: Math.max(2, Math.round(w * 5)), gold: Math.round((6000 * w * 2) / 100) * 100, honor: 60 };
}

// ---------- Gegner-Kalibrierung (Phase 4.1) ----------

/** Haltung (Poise) wächst mit der Gefahrenstufe: stärkere Gegner lassen sich schwerer aus dem Takt bringen */
export const DANGER_POISE: Record<DangerTier, number> = { 1: 1, 2: 1.1, 3: 1.25, 4: 1.4, 5: 1.6 };

/**
 * Leben- und Schaden-Faktor eines Gegners dieser Stufe (`Enemy.level`): stetig zwischen den Ankerpunkten der Gefahrenstufen (die erste
 * Gegnerstufe jedes Bandes trägt genau den Richtwert aus `DANGER`); über Stufe 18 wächst er langsam weiter (bis Stufe 40).
 */
export function dangerScale(level: number): { hp: number; dmg: number } {
  const lv = Math.max(1, Math.min(40, level));
  const anchors = TIERS.map((t) => ({ lv: DANGER[t].levelMin, hp: DANGER[t].hp, dmg: DANGER[t].dmg }));
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    if (lv <= b.lv) { const k = (lv - a.lv) / (b.lv - a.lv); return { hp: a.hp + (b.hp - a.hp) * k, dmg: a.dmg + (b.dmg - a.dmg) * k }; }
  }
  const last = anchors[anchors.length - 1];
  return { hp: last.hp + 0.35 * (lv - last.lv), dmg: last.dmg + 0.1 * (lv - last.lv) };
}

/** Panzerungsfaktor je Gegnerart (mal `DANGER.armor` der Stufe): Schildträger und Legenden zäh, Schützen und Wirker kaum gepanzert */
export const ENEMY_ARMOR_K: Record<string, number> = { matrose: 0.5, schildtraeger: 1.3, musketier: 0.3, schlaeger: 1.0, fajiwirker: 0.3, hauptmann: 1.1, legende: 1.3 };

/** Rüstungswert eines Gegners (wie bei Spielern: `mitigation(Wert, Angreiferstufe)`); `kind` ohne Eintrag zählt 1,0 */
export function enemyArmorRating(kind: string, level: number): number {
  return DANGER[dangerOfLevel(level)].armor * (ENEMY_ARMOR_K[kind] ?? 1);
}

/** Kein einzelner Treffer nimmt einem Raid-Endboss mehr als diesen Anteil seiner Lebenspunkte (Anti-One-Shot) */
export const RAID_BOSS_HIT_CAP = 0.08;
/** … und der Spielfigur nie mehr als diesen Anteil ihrer Lebenspunkte: man stirbt nie durch einen einzigen Treffer */
export const PLAYER_HIT_CAP = 0.4;
/** Kaiser der fünf Kaiser-Zitadellen (4.5D): noch strenger als die Raid-Endbosse – ein Treffer nimmt höchstens 5 % seiner Lebenspunkte */
export const KAISER_BOSS_HIT_CAP = 0.05;
/**
 * Kataklysmus-Ultimates (Phase 4.6B) zählen gegen Endbosse wie EIN Treffer: Raid-Endbosse höchstens `RAID_BOSS_HIT_CAP` (bzw. ihr `hitCap`, Kaiser
 * `KAISER_BOSS_HIT_CAP`) für das ganze Ultimate, alle übrigen Bosse (Legenden, Insel-Kommandanten) höchstens dieser Anteil – nie ein Sieg mit einem Schlag.
 */
export const ULTIMATE_BOSS_CAP = 0.2;

// ---------- Talente (Phase 4.6E) ----------

/**
 * Obergrenzen der Talent-Boni (data/talentTrees.ts): jede Summe läuft asymptotisch über `softCap` gegen diese Werte (Anteile; Sekunden,
 * Meter oder Stück, wo die Einheit es sagt). `total` deckelt das Produkt aller Schadensfaktoren eines einzelnen Treffers (Grundschaden,
 * Technik/Finisher/Meteor/Ultimate, Kosmos) – so bleibt ein voll ausgebauter Baum spürbar, aber nie ein Sieg mit einem Schlag: die
 * Anti-One-Shot-Grenzen der Bosse (`RAID_BOSS_HIT_CAP`, `KAISER_BOSS_HIT_CAP`, `ULTIMATE_BOSS_CAP`) wirken danach unverändert.
 */
export const TALENT_CAP = {
  dmg: 0.6, crit: 0.25, critDmg: 0.6, posture: 0.6, pen: 2, finisher: 0.5, skillDmg: 0.5, airDmg: 0.4, meteor: 0.6, ult: 0.5,
  cosmicDmg: 0.25, total: 1.0,
  /** Schadensminderung (Haltung im Angriff plus Rüstung aus Talenten) und Lebenspunkte */
  reduce: 0.3, hp: 0.35,
  combo: 0.3, heavy: 0.3, lunge: 2.5, reach: 0.35, arc: 0.4, launch: 0.6, fling: 0.8, knock: 0.6, cd: 0.35, dashCost: 0.5,
  perfect: 0.12, chase: 1.2, jumps: 1, airDashes: 1, statusDur: 0.8, vortex: 0.6,
  will: 0.8, awaken: 8, aura: 0.6, ultReach: 0.5, multiKill: 12, aftershock: 2,
  stormBurst: 2.5, heavyWave: 1.2, gravity: 4, meteorRain: 3,
  // Kapitän
  cannon: 0.4, reload: 0.3, sail: 0.2, turn: 0.3, hull: 0.3, range: 0.25, boarding: 0.5, merit: 0.6, bastion: 0.6, troopPrice: 0.35,
  tribute: 0.6, buy: 0.2, sell: 0.2, cargo: 0.4, upkeep: 0.4, loot: 0.4, smuggle: 0.5,
} as const;

/**
 * Wachstum der Grundwerte (Leben, Angriff) mit der Stufe: bis Stufe 40 wie bisher linear, darüber asymptotisch – Stufe 100 entspricht einer
 * „wirksamen“ Stufe von gut 64. So bleibt der Weg bis 100 spürbar, ohne die Gegner (deren Skalierung bei Stufe 40 endet) zu entwerten.
 */
export const LEVEL_GROWTH = { linearTo: 40, extra: 35, span: 50 } as const;
export const effectiveLevel = (level: number): number => {
  const l = Math.max(1, level);
  if (l <= LEVEL_GROWTH.linearTo) return l;
  return LEVEL_GROWTH.linearTo + LEVEL_GROWTH.extra * (1 - Math.exp(-(l - LEVEL_GROWTH.linearTo) / LEVEL_GROWTH.span));
};

// ---------- Seegefecht (Phase 4.1) ----------

/** Rumpf-Panzerung je Schiffsklasse (Schaluppe … Leviathan); wirkt wie Rüstung gegen den Durchschlag des Angreifers (`penTier`) */
export const HULL_ARMOR: readonly number[] = [8, 20, 38, 60, 85, 115, 150];
/** Rumpf-Panzerung einer Klasse, mit der Panzerung der Rumpf-Ausbaustufe (`HULL_ARMOR_K`, Stufe 3 = Grundwert) */
export const hullArmorOf = (classIndex: number, hullTier = 3): number =>
  HULL_ARMOR[Math.max(0, Math.min(HULL_ARMOR.length - 1, Math.floor(classIndex)))] * evoK(HULL_ARMOR_K, hullTier);

/** Kanonen-Durchschlag (Stufe 1 … 5) einer Klasse: Stufe des Klassen-Rangs (`RANK_TIER`) plus Versatz der Kanonen-Ausbaustufe (`CANNON_PEN`) */
export function penTierOf(classRank: number, cannonTier = 3): Tier {
  return clampTier(tierOfRank(classRank) + CANNON_PEN[clampTier(cannonTier) - 1]);
}

/** Kugel-Schaden eines KI-Schiffs je Kanone und Nachladezeit (s) nach Gegnerstufe (Gefahrenstufe) */
export function aiCannon(level: number, legend = false): { dmg: number; reload: number } {
  const sc = dangerScale(level);
  const t = dangerOfLevel(level);
  return { dmg: 9 * sc.dmg * (legend ? 1.5 : 1), reload: 3.6 - 0.35 * (t - 1) };
}

/** Faktor auf den Rumpf eines KI-Schiffs nach Gegnerstufe: erfahrene Crews halten mehr aus (aus dem Leben-Richtwert, gedämpft) */
export const aiHullFactor = (level: number): number => 1 + (dangerScale(level).hp - 1) * 0.28;

/**
 * Kugelschaden des Spielerschiffs je Kanone (vor Rüstung): wächst mit der Stufe der Spielfigur, der Schiffsklasse und der Kanonen-Ausbaustufe
 * (`CANNON_DMG_K`). Offiziere und Talismane kommen im Spiel als Faktor dazu (`Game.applyPower`).
 */
export const playerCannonDmg = (level: number, classTier: number, cannonTier = 3): number =>
  (12 + Math.max(1, level) * 1.4) * (1 + Math.max(0, classTier) * 0.06) * evoK(CANNON_DMG_K, cannonTier);

// ---------- Weltbosse auf See (Phase 4.3C) ----------

/**
 * Leben-Faktor der Weltbosse über dem Rumpf eines KI-Schiffs gleicher Klasse und Stufe (`aiHullFactor`): ein Weltboss hält so viel aus wie
 * zwei Elite-Schiffe seiner Klasse. Die drei Bosse (data/seaEvents.ts) tragen dazu ihren eigenen `hullK`.
 */
export const WORLD_BOSS_HULL_K = 2;
/** Kein einzelner Treffer (Kugel, Rammstoß, Faji) nimmt einem Weltboss mehr als diesen Anteil seines Rumpfs (Anti-One-Shot) */
export const WORLD_BOSS_HIT_CAP = 0.04;
/** … und keine Salve eines Weltbosses (alles, was binnen `WORLD_BOSS_VOLLEY_S` trifft) nimmt dem Spielerschiff mehr als diesen Anteil seines Rumpfs */
export const WORLD_BOSS_PLAYER_HIT_CAP = 0.18;
export const WORLD_BOSS_VOLLEY_S = 1.5;

/** Rumpf eines Weltbosses: Klassen-Rumpf × `aiHullFactor(Stufe)` × `WORLD_BOSS_HULL_K` × eigener Faktor */
export const worldBossHull = (classHp: number, level: number, hullK: number): number => Math.round(classHp * aiHullFactor(level) * WORLD_BOSS_HULL_K * hullK);

/** Ein Treffer auf einen Weltboss nach dem Anti-One-Shot-Deckel */
export const capBossHit = (dmg: number, maxHp: number): number => Math.min(Math.max(0, Number.isFinite(dmg) ? dmg : 0), maxHp * WORLD_BOSS_HIT_CAP);

/** Laufende Salve eines Weltbosses gegen ein Schiff: Beginn (Spielzeit, s) und schon angerichteter Schaden */
export interface VolleyWindow { t: number; sum: number }

/**
 * Anti-One-Shot für das Spielerschiff: wie viel dieser Treffer noch anrichten darf. Alles, was binnen `WORLD_BOSS_VOLLEY_S` vom selben Boss kommt,
 * zählt als eine Salve, und eine Salve nimmt nie mehr als `WORLD_BOSS_PLAYER_HIT_CAP` des Rumpfs. Schreibt das Fenster fort (`win`).
 */
export function capVolley(win: VolleyWindow, now: number, dmg: number, maxHull: number): number {
  if (now - win.t > WORLD_BOSS_VOLLEY_S) { win.t = now; win.sum = 0; }
  const allowed = Math.max(0, maxHull * WORLD_BOSS_PLAYER_HIT_CAP - win.sum);
  const d = Math.min(Math.max(0, Number.isFinite(dmg) ? dmg : 0), allowed);
  win.sum += d;
  return d;
}

/**
 * Grobes Modell eines Seegefechts des Spielers gegen einen Weltboss (Kalibrierung und `tests/worldEvents.test.ts`): Nachladezeit der Kanonen (wie
 * `SeaWorld.reloadTime`), Anteil der Kugeln, die treffen, und Anteil der Nachladefenster, in denen die Breitseite wirklich auf das Ziel zeigt.
 */
export const NAVAL_FIGHT_MODEL = { reload: 1.9, hitRate: 0.55, uptime: 0.5 } as const;

/** Schaden je Sekunde des Spielerschiffs gegen ein Ziel mit Rumpf-Panzerung `armor` */
export function playerNavalDps(o: { level: number; classTier: number; rank: number; cannonTier: number; ports: number }, armor: number): number {
  const balls = Math.max(1, Math.round(o.ports * evoK(CANNON_PORTS_K, o.cannonTier)));
  const raw = (playerCannonDmg(o.level, o.classTier, o.cannonTier) * balls * NAVAL_FIGHT_MODEL.hitRate * NAVAL_FIGHT_MODEL.uptime) / (NAVAL_FIGHT_MODEL.reload * evoK(CANNON_RELOAD_K, o.cannonTier));
  return raw * (1 - mitigation(armor, penTierOf(o.rank, o.cannonTier)));
}

// ---------- Kampfmodell (Kalibrierung und Test) ----------

/**
 * Grobes Modell eines Bosskampfs, mit dem Bossleben, Rüstung und Spielerwerte abgeglichen werden (`tests/economyBalance.test.ts`):
 * Treffer je Sekunde und Anteil der Zeit, in der wirklich getroffen wird (Ausweichen, Warnflächen, Wege), Volltreffer-Faktor, Beitrag der
 * Offiziere (je Offizier ein Teil des Spielerschadens), Fähigkeiten, und wie viele Boss-Angriffe ein erfahrener Spieler abbekommt.
 */
export const FIGHT_MODEL = {
  hitsPerSec: 1.7, uptime: 0.55, critMult: 1.6, comboMult: 1.08,
  allyPerOfficer: 0.22, skillBonus: 0.2,
  /** Mittlere Zeit zwischen zwei Boss-Angriffen (s) und Anteil, der einen erfahrenen / einen drauflosschlagenden Spieler trifft */
  attackInterval: 2.2, hitSkilled: 0.4, hitMasher: 0.9,
  /** Mittlerer Schadensfaktor der Boss-Angriffe (`EnemyAttack.dmg`) */
  attackDmg: 1.15,
} as const;

/** Schaden je Sekunde der Spielfigur gegen ein ungepanzertes Ziel (ohne Offiziere und Fähigkeiten) */
export const playerDps = (atk: number, crit: number): number => atk * FIGHT_MODEL.comboMult * FIGHT_MODEL.hitsPerSec * FIGHT_MODEL.uptime * (1 + crit * (FIGHT_MODEL.critMult - 1));

/** Kampfdauer (s) gegen ein Ziel mit `hp` Lebenspunkten, Rüstung (Anteil, der durchkommt: `soak`) und der Crew an der Seite */
export function fightSeconds(o: { hp: number; atk: number; crit: number; soak: number; officers: number; skills?: boolean }): number {
  const dps = playerDps(o.atk, o.crit) * o.soak * (1 + o.officers * FIGHT_MODEL.allyPerOfficer) * (1 + (o.skills === false ? 0 : FIGHT_MODEL.skillBonus));
  return o.hp / Math.max(1e-6, dps);
}

/** Wie lange hält die Spielfigur gegen einen Gegner, der je Treffer `hit` Schaden macht? `hitRate` = Anteil der Angriffe, die sie abbekommt */
export function surviveSeconds(o: { hp: number; hit: number; hitRate: number; factor: number }): number {
  const perSec = (o.hit * FIGHT_MODEL.attackDmg * o.hitRate * o.factor) / FIGHT_MODEL.attackInterval;
  return o.hp / Math.max(1e-6, perSec);
}

// ---------- Schiffs-Evolution (Phase 4.2): Rumpf, Segel, Kanonen je Ausbaustufe 1 … 5 ----------
//
// Jedes Schiff hat drei unabhängige Zweige (Rumpf, Segel, Kanonen) mit je einer Ausbaustufe 1 … 5. Stufe 3 entspricht den alten Grundwerten der
// Klasse; neu gekaufte Schiffe beginnen auf Stufe 1 (schwach), Stufe 4 und 5 geben Rammsporn und Deck-Drehbassen. Alle Faktoren stehen hier;
// der Zustand (`ShipEvolution`) und seine Regeln stehen in data/shipEvolution.ts, Rammen und Drehbassen in naval/ramming.ts.

/** Faktor einer Tabelle für Stufe 1 … 5 (ungültige Stufen werden eingegrenzt) */
export const evoK = (table: readonly number[], tier: number): number => table[Math.max(1, Math.min(5, Math.round(tier))) - 1];

/** Rumpf: Rumpfpunkte (Stufe 1 = 75 %, Stufe 5 = 145 % der Klassenbasis) und Rumpf-Panzerung */
export const HULL_HP_K: readonly number[] = [0.75, 0.875, 1, 1.225, 1.45];
export const HULL_ARMOR_K: readonly number[] = [0.7, 0.85, 1, 1.2, 1.4];
/** Segel: Segel-HP, Höchstgeschwindigkeit (78 % … 122 %), Beschleunigung, Wendegeschwindigkeit und der Anteil des Gegenwind-Tempoverlusts, der bleibt (kleiner = besser am Wind) */
export const SAIL_HP_K: readonly number[] = [0.7, 0.85, 1, 1.2, 1.4];
export const SAIL_SPEED_K: readonly number[] = [0.78, 0.89, 1, 1.11, 1.22];
export const SAIL_ACCEL_K: readonly number[] = [0.8, 0.9, 1, 1.12, 1.25];
export const SAIL_TURN_K: readonly number[] = [0.85, 0.92, 1, 1.08, 1.16];
export const SAIL_UPWIND_K: readonly number[] = [1, 0.85, 0.7, 0.55, 0.4];
/** Kanonen: Anteil der bestückten Stückpforten (Stufe 1 = 50 %, 2 = 75 %, ab 3 alle), Schaden, Nachladezeit-Faktor, Versatz des Durchschlags */
export const CANNON_PORTS_K: readonly number[] = [0.5, 0.75, 1, 1, 1];
export const CANNON_DMG_K: readonly number[] = [0.85, 0.92, 1, 1.1, 1.2];
export const CANNON_RELOAD_K: readonly number[] = [1.3, 1.12, 1, 0.95, 0.9];
export const CANNON_PEN: readonly number[] = [-1, 0, 0, 1, 2];

/** Ab dieser Stufe gibt es den Rammsporn (Rumpf) bzw. die Deck-Drehbassen (Kanonen) */
export const RAM_MIN_TIER = 4;
export const SWIVEL_MIN_TIER = 4;

/**
 * Rammsporn: Bug-Kegel (Skalarprodukt Bugrichtung/Richtung zum Ziel), Mindest-Annäherungsgeschwindigkeit (m/s), Schaden als Anteil der Rumpfpunkte
 * des Rammers je m/s über der Mindestgeschwindigkeit (höchstens `maxK`), Crew-Schock, Eigenschaden (Anteil des verursachten Basisschadens; mit Rammsporn
 * 30 % davon = −70 %), Streifschaden ohne Rammsporn, Pause je Paar (s) und Tempoverlust der Beteiligten.
 */
export const RAM = {
  cone: 0.75, minSpeed: 3.5, dmgPerHp: 0.35 / 26, maxK: 0.42, crewK: 1.2,
  selfPlain: 0.6, selfRam: 0.18, glancing: 0.3, cooldown: 4, rammerSlow: 0.55, targetSlow: 0.8,
  /** Abprall (Phase 4.2B): Rückstoß-Anteil beim Stoß, Stärke des Wegdrückens (Anteil der Annäherung, nach Massenanteil), Abklingen des Stoßes je Sekunde und Höchsttempo (m/s) */
  bounce: 0.35, shoveK: 0.9, shoveDecay: 2.4, maxShove: 8,
  /** Stufe 5: panzerbrechend (ignoriert die Rumpf-Panzerung); Stufe 4 durchschlägt wie Stufe 3 */
  pierceTier: 5, penTier: 3,
} as const;

/**
 * Deck-Drehbassen (ab Kanonen-Stufe 4): Reichweite 45 m, Pause zwischen den Salven, Schaden als Anteil des Kugelschadens der Kanonen (Kartätschen:
 * wenig Rumpf, viel Crew und etwas Segel); ab Stufe 5 etwas schneller.
 */
export const SWIVEL = { range: 45, cooldown: [3.6, 2.8], dmgK: 0.2, pen: 2 } as const;

/** Ausbau-Kosten (Gold) von Stufe t − 1 auf t für t = 2 … 5, mal Klassenfaktor `1 + Klasse · 0,4` und Hafen-Tarif; alle drei Zweige gleich */
export const EVO_COST: readonly number[] = [0, 300, 550, 950, 1600];
export const evoClassK = (classIndex: number): number => 1 + Math.max(0, classIndex) * 0.4;

/** Material aus dem Frachtraum für Stufe 3, 4, 5 (Stückzahl bei Klassenfaktor 1; `evoMaterialK` skaliert mit der Klasse) */
export const EVO_MATERIAL: readonly number[] = [0, 0, 6, 12, 20];
export const evoMaterialK = (classIndex: number): number => 0.5 + Math.max(0, classIndex) * 0.25;

/** Inzahlungnahme: so viel vom Goldwert der Ausbauten des alten Schiffs erstattet die Werft beim Kauf einer neuen Klasse */
export const EVO_TRADE_IN = 0.5;
/** Unterhalt: Zuschlag auf die Schiffswartung (nicht auf Sold) bei Gesamtstufe 5 (Stufe 1 = +0 %), linear dazwischen */
export const EVO_UPKEEP_MAX = 0.35;
