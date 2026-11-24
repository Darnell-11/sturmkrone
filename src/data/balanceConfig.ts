// Balance-Fundament: die eine Quelle für Rüstungs- und Widerstandskurve, Soft-Caps für Prozent-Boni, Gefahrenstufen der Karte,
// die fünf Qualitätsstufen der Ausrüstung und ihr Power-Budget. Reine Daten und Rechnung (ohne three.js, JSON-tauglich): ein Server
// kann dieselben Formeln benutzen. Nirgends sonst stehen Schadens-, Rüstungs- oder Preiskurven: Läden, Beute, Inventar und Kompendium
// lesen alles von hier (Items leiten ihre Werte aus `slotBudget` ab, `tests/balance.test.ts` prüft die Rechnung).

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
  /** Bereich als Anteil des Weltradius (vom Mittelpunkt) */
  zoneFrom: number;
  zoneTo: number;
}

export const DANGER: Record<DangerTier, DangerDef> = {
  1: { tier: 1, name: 'Heimatgewässer', hp: 1.0, dmg: 1.0, armor: 20, levelMin: 1, levelMax: 4, zoneFrom: 0, zoneTo: 0.12 },
  2: { tier: 2, name: 'Küstenmeere', hp: 1.8, dmg: 1.5, armor: 50, levelMin: 5, levelMax: 8, zoneFrom: 0.12, zoneTo: 0.32 },
  3: { tier: 3, name: 'Offene See', hp: 3.0, dmg: 2.2, armor: 95, levelMin: 9, levelMax: 13, zoneFrom: 0.32, zoneTo: 0.56 },
  4: { tier: 4, name: 'Kriegsgewässer', hp: 4.8, dmg: 3.2, armor: 150, levelMin: 14, levelMax: 17, zoneFrom: 0.56, zoneTo: 0.80 },
  5: { tier: 5, name: 'Festungsgürtel', hp: 7.5, dmg: 4.5, armor: 215, levelMin: 18, levelMax: 999, zoneFrom: 0.80, zoneTo: 1.0 },
};

/** Gefahrenstufe eines Gegners nach seiner Stufe */
export function dangerOfLevel(level: number): DangerTier {
  for (const t of TIERS) if (level <= DANGER[t].levelMax) return t;
  return 5;
}

/** Gefahrenstufe eines Ortes: Abstand vom Mittelpunkt (Ankerglück ≈ 0) im Verhältnis zum Weltradius */
export function dangerOfDistance(dist: number, worldRadius: number): DangerTier {
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
