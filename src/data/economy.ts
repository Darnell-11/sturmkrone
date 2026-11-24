// Ökonomie: Handelswaren, Marktprofile der Inseln und Sektoren, Unterhalt (Sold und Proviant), Frachtraum je Schiffsklasse, Zölle und
// Hafen-Tarife. Reine, JSON-taugliche Daten und Typen (ohne three.js); die Rechnung steht in core/economyEngine.ts. Der Zustand
// (`EconomyState`) liegt im Spielstand unter `progress.economy` (Version 16) und ist so gebaut, dass ein Server später dieselben Märkte
// für mehrere Spieler führen kann (4.7): jeder Markt ist ein eigenes Objekt je Insel-Schlüssel, Zeit ist die Spielzeit in Sekunden.
import type { AmmoId } from './ships';

// ---------- Waren ----------

export type GoodId =
  | 'kanonenstahl' | 'werkzeuge' | 'schwefel' | 'obsidian' | 'schmiedekohle'
  | 'gewuerze' | 'stoffe' | 'luxusgueter' | 'tuch' | 'tee' | 'marineausruestung' | 'wein' | 'seide' | 'fechtklingen'
  | 'schiesspulver' | 'waffenkisten' | 'medizin';

export type GoodCat = 'rohstoff' | 'ware' | 'luxus' | 'kriegsware';

export interface GoodDef {
  id: GoodId;
  n: string;
  icon: string;
  cat: GoodCat;
  /** Grundpreis in Gold je Einheit */
  base: number;
  /** Platzbedarf im Frachtraum je Einheit */
  vol: number;
  /** Kriegs- und Schmuggelware: Spitzenpreise an Kriegsschauplätzen, zieht Kontrollen und Kopfgeldjäger an */
  war?: boolean;
  d: string;
}

export const GOODS: GoodDef[] = [
  { id: 'kanonenstahl', n: 'Kanonenstahl', icon: '⚙', cat: 'rohstoff', base: 60, vol: 2, d: 'Barren für Rohre und Beschläge; ohne ihn kein Geschütz.' },
  { id: 'werkzeuge', n: 'Werkzeuge', icon: '🔨', cat: 'rohstoff', base: 45, vol: 1, d: 'Hämmer, Zangen und Sägen für Werften und Schmieden.' },
  { id: 'schwefel', n: 'Schwefel', icon: '🜏', cat: 'rohstoff', base: 35, vol: 1, d: 'Gelb, stinkend und gefragt: Zutat für Pulver und Feuer.' },
  { id: 'obsidian', n: 'Obsidian', icon: '◆', cat: 'rohstoff', base: 55, vol: 1.5, d: 'Vulkanglas für Klingen und Zierrat.' },
  { id: 'schmiedekohle', n: 'Schmiedekohle', icon: '▪', cat: 'rohstoff', base: 25, vol: 1.5, d: 'Heiße Kohle: ohne sie erkalten die Essen.' },
  { id: 'gewuerze', n: 'Gewürze', icon: '🌶', cat: 'ware', base: 70, vol: 0.5, d: 'Pfeffer, Muskat und Zimt: wenig Platz, viel Gold.' },
  { id: 'stoffe', n: 'Stoffe', icon: '🧶', cat: 'ware', base: 40, vol: 1, d: 'Ballen Leinen und Wolle.' },
  { id: 'tuch', n: 'Tuch', icon: '🧵', cat: 'ware', base: 38, vol: 1, d: 'Festes Segel- und Uniformtuch.' },
  { id: 'tee', n: 'Tee', icon: '🍵', cat: 'ware', base: 50, vol: 0.5, d: 'Getrocknete Blätter in Kisten: gefragt in kalten Häfen.' },
  { id: 'wein', n: 'Wein', icon: '🍷', cat: 'ware', base: 55, vol: 1.5, d: 'Fässer vom Festland; der Kapitän trinkt nur vom Besten.' },
  { id: 'seide', n: 'Seide', icon: '🎀', cat: 'ware', base: 90, vol: 0.5, d: 'Schwer zu bekommen und leicht zu verstauen.' },
  { id: 'marineausruestung', n: 'Marine-Ausrüstung', icon: '⚓', cat: 'ware', base: 85, vol: 2, d: 'Uniformen, Tauwerk und Beschläge nach Marinenorm.' },
  { id: 'fechtklingen', n: 'Fechtklingen', icon: '🗡', cat: 'ware', base: 95, vol: 1, d: 'Schlanke Degen aus den Hofwerkstätten.' },
  { id: 'luxusgueter', n: 'Luxusgüter', icon: '💎', cat: 'luxus', base: 160, vol: 0.5, d: 'Schmuck, Porzellan und Parfüm: der teuerste Platz im Laderaum.' },
  { id: 'schiesspulver', n: 'Schießpulver', icon: '💥', cat: 'kriegsware', base: 65, vol: 1.5, war: true, d: 'Trocken halten! Kriegsware: an Fronten teuer, bei Kontrollen verboten.' },
  { id: 'waffenkisten', n: 'Waffenkisten', icon: '📦', cat: 'kriegsware', base: 120, vol: 2, war: true, d: 'Säbel, Musketen und Pistolen: Schmuggelware an jeder Front.' },
  { id: 'medizin', n: 'Medizin', icon: '⚕', cat: 'kriegsware', base: 75, vol: 0.5, war: true, d: 'Kräuter, Verbände und Tinkturen: dort am teuersten, wo gekämpft wird.' },
];

export const GOOD_BY_ID: Record<string, GoodDef> = Object.fromEntries(GOODS.map((g) => [g.id, g]));
export const GOOD_IDS = GOODS.map((g) => g.id);
export const isGoodId = (id: unknown): id is GoodId => typeof id === 'string' && id in GOOD_BY_ID;

// ---------- Marktprofile ----------

/** Was ein Markt im Überschuss herstellt (billig) und was er dringend braucht (teuer) */
export interface MarketProfile { produce: GoodId[]; demand: GoodId[] }

/**
 * Profile: die Regionen Nordwacht und Glutring haben eigene Spezialitäten, sonst bestimmt die Macht des Sektors (data/factions.ts)
 * das Profil. Eine Insel nimmt Region UND Macht zusammen (Überschuss und Bedarf werden vereinigt; was erzeugt wird, wird nicht verlangt).
 */
export const PROFILES: Record<string, MarketProfile> = {
  nordwacht: { produce: ['kanonenstahl', 'werkzeuge'], demand: ['gewuerze', 'wein', 'tee'] },
  glutring: { produce: ['schwefel', 'obsidian', 'schmiedekohle'], demand: ['medizin', 'tuch', 'wein', 'werkzeuge'] },
  niederlande: { produce: ['gewuerze', 'stoffe', 'luxusgueter'], demand: ['kanonenstahl', 'schiesspulver', 'waffenkisten'] },
  england: { produce: ['tuch', 'tee', 'marineausruestung'], demand: ['gewuerze', 'schmiedekohle', 'wein', 'werkzeuge'] },
  frankreich: { produce: ['wein', 'seide', 'fechtklingen'], demand: ['tee', 'kanonenstahl', 'schwefel', 'obsidian'] },
  deutschland: { produce: ['schiesspulver', 'werkzeuge', 'waffenkisten'], demand: ['seide', 'gewuerze', 'medizin', 'marineausruestung'] },
  kurogane: { produce: ['medizin', 'seide'], demand: ['schiesspulver', 'luxusgueter', 'stoffe', 'fechtklingen'] },
  marine: { produce: ['marineausruestung', 'waffenkisten', 'schiesspulver'], demand: ['wein', 'tee', 'medizin'] },
  /** Freihafen Ankerglück: alles zu Grundpreisen, ein ehrlicher Markt */
  ankerglueck: { produce: [], demand: [] },
};

/** Schlüssel der Profile, die für eine Insel gelten (Region zuerst, dann Macht); leer = freier Hafen */
export function profileKeys(i: { id: string; region?: string; factionId?: string | null }): string[] {
  const out: string[] = [];
  if (i.region && PROFILES[i.region] && (i.region === 'nordwacht' || i.region === 'glutring')) out.push(i.region);
  if (i.factionId && PROFILES[i.factionId]) out.push(i.factionId);
  if (!out.length && i.id === 'ankerglueck') out.push('ankerglueck');
  return out;
}

/** Überschuss und Bedarf einer Insel */
export function profileOf(i: { id: string; region?: string; factionId?: string | null }): MarketProfile {
  const produce = new Set<GoodId>(), demand = new Set<GoodId>();
  for (const k of profileKeys(i)) { for (const g of PROFILES[k].produce) produce.add(g); for (const g of PROFILES[k].demand) demand.add(g); }
  for (const g of produce) demand.delete(g);
  return { produce: [...produce], demand: [...demand] };
}

// ---------- Markt-Zahlen ----------

export const MARKET = {
  /** Gleichgewichts-Vorrat (Einheiten): Überschuss-Güter, normale Güter, gefragte Güter */
  eqStock: { produce: 240, normal: 100, demand: 40 },
  /** Gleichgewichts-Preisfaktor gegen den Grundpreis */
  eqPrice: { produce: 0.65, normal: 1, demand: 1.45 },
  /** Preis ∝ (Vorrat / Gleichgewichts-Vorrat)^−Elastizität, begrenzt auf [min, max] */
  elasticity: 0.55,
  minK: 0.45,
  maxK: 2.6,
  /** Aufschlag beim Kaufen und Abschlag beim Verkaufen gegenüber dem Marktpreis (Spanne des Händlers) */
  spread: 0.05,
  /** Zeit (Sekunden Spielzeit), in der ein Markt etwa 63 % des Wegs zurück zum Gleichgewicht schafft (ein Ingame-Tag ≈ 24 Spielminuten) */
  tau: 1800,
  /** Kriegspreise: Aufschlag auf Kriegsware an Grenzen (Abstand in m), auf besetzten/belagerten Inseln und Festungen */
  warBorder: 0.6, warBorderDist: 700, warOccupied: 0.9, warFort: 0.4, warMax: 2.5,
} as const;

// ---------- Frachtraum ----------

/** Frachtraum (Platzeinheiten) je Schiffsklasse: Schaluppe … Leviathan (Reihenfolge von SHIP_CLASSES) */
export const CARGO_CAP: readonly number[] = [30, 60, 100, 160, 240, 340, 500];
export const cargoCap = (tier: number): number => CARGO_CAP[Math.max(0, Math.min(CARGO_CAP.length - 1, Math.floor(tier)))];
/** Faktor auf die Höchstzahl der Verbrauchsgüter im Beutel (Beutekapazität wächst mit dem Schiff) */
export const BAG_K: readonly number[] = [1, 1.2, 1.5, 1.8, 2.2, 2.6, 3];
export const bagMax = (base: number, tier: number): number => Math.max(base, Math.round(base * BAG_K[Math.max(0, Math.min(BAG_K.length - 1, Math.floor(tier)))]));

// ---------- Unterhalt ----------

export const UPKEEP = {
  /** Ein Zahltag alle so viele Sekunden Spielzeit; vier Zahltage = ein Ingame-Tag */
  period: 360,
  periodsPerDay: 4,
  /** Sold und Proviant je Kopf und Ingame-Tag */
  seaman: 1.2,
  trooper: 2.0,
  /** je Offizier und Tag */
  officer: 8,
  /** Wartung des Schiffs je Tag, Schaluppe … Leviathan */
  hull: [10, 25, 45, 80, 130, 210, 350] as readonly number[],
  /** Moral: ein ausgebliebener Sold, ein bezahlter Zahltag, Untergrenze; Offiziers-Treue sinkt je ausgebliebenem Sold */
  moraleMiss: 0.15, moralePaid: 0.1, moraleMin: 0.2, loyaltyMiss: 8,
  /** Wirkung auf die Crew: Effizienz = 0,55 + 0,45 · Moral */
  moraleBase: 0.55,
  /** Vorwarnung so viele Sekunden vor dem Zahltag, wenn das Gold nicht reicht */
  warnLead: 60,
  /** höchstens so viele versäumte Zahltage werden nachträglich abgerechnet (Zeitsprünge) */
  maxCatchUp: 4,
} as const;

// ---------- Zölle, Tarife, Hafensperre ----------

export const TARIFF = {
  /** Rabattstufen nach Ansehen (Anteil), wie data/reputation.ts REP.discounts */
  discounts: [[20, 0.05], [40, 0.1], [60, 0.15], [80, 0.2]] as readonly (readonly [number, number])[],
  /** Zusatzrabatt durch Ehre: bis zu dieser Höhe bei Ehre ≥ honorFull */
  honorMax: 0.05, honorFull: 100,
  /** Insgesamt höchstens −25 % */
  maxDiscount: 0.25,
  /** Schwarzmarkt-Zuschlag bei feindlichem Ansehen (< 0) */
  blackMarket: 0.35,
  /** Ab diesem Ansehen sperrt die Macht ihre Häfen ganz (Freihäfen ausgenommen) */
  closedBelow: -60,
} as const;

// ---------- Schmuggel, Kontrollen ----------

export const CONTRABAND = {
  /** Zusatz-Hitze je gehandelter Platzeinheit Kriegsware, wenn der Markt Kriegspreise zahlt (Faktor über 1,3) */
  heatPerUnit: 0.6,
  heatMax: 100,
  /** Hitze sinkt um so viel je Sekunde Spielzeit */
  heatDecay: 1 / 30,
  /** Kontrolle beim Anlegen in einem Hafen einer Macht: Grundchance + Hitze/150 (Marine ×1,5), höchstens */
  baseCheck: 0.05, checkMax: 0.85, marineK: 1.5,
  /** Strafe: Anteil des Warenwerts, Ansehen-Verlust, Kopfgeldjäger ab dieser Hitze */
  fine: 0.25, standingLoss: 6, huntersAt: 60,
} as const;

// ---------- Munition (Freischalten im Hafen) ----------

/** Stufe und Freischalt-Preis der Spezialmunition (Kugeln gehören jedem Schiff); der Rang folgt aus der Stufe (data/balanceConfig.ts) */
export const AMMO_UNLOCK: Record<AmmoId, { tier: 1 | 2 | 3 | 4 | 5; price: number }> = {
  kugel: { tier: 1, price: 0 },
  kette: { tier: 2, price: 450 },
  kartaetsche: { tier: 2, price: 450 },
  brand: { tier: 3, price: 1600 },
};

// ---------- Zustand (Spielstand) ----------

export interface MarketState {
  /** Vorrat je Ware (Einheiten, Bruchteile erlaubt) */
  stock: Partial<Record<GoodId, number>>;
  /** Spielzeit der letzten Fortschreibung (s) */
  t: number;
}

/** Zuletzt gesehene Preise eines besuchten Hafens (Kontor-Übersicht) */
export interface LedgerEntry {
  name: string;
  /** Spielzeit des Besuchs (s) */
  t: number;
  /** Ankaufpreis des Händlers (was du bekommst) und Verkaufspreis (was du zahlst), je Ware */
  sell: Partial<Record<GoodId, number>>;
  buy: Partial<Record<GoodId, number>>;
}

export interface CargoEntry { n: number; /** gezahlter Gesamtpreis (für die Gewinnanzeige) */ cost: number }

export interface EconomyState {
  markets: Record<string, MarketState>;
  ledger: Record<string, LedgerEntry>;
  cargo: Partial<Record<GoodId, CargoEntry>>;
  /** Zahltag: Spielzeit, zu der der nächste Sold fällig wird; unbezahlter Rest; Moral 0,2 … 1 */
  nextPay: number;
  arrears: number;
  morale: number;
  /** schon gewarnt (dieser Zahltag) */
  warned: boolean;
  /** Fahndungsdruck 0 … 100 durch Schmuggel */
  heat: number;
  /** Freigeschaltete Spezialmunition */
  ammo: AmmoId[];
}

export const emptyEconomy = (now = 0): EconomyState => ({
  markets: {}, ledger: {}, cargo: {}, nextPay: now + UPKEEP.period, arrears: 0, morale: 1, warned: false, heat: 0, ammo: ['kugel'],
});

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

/** Fremde oder alte Daten säubern (Migration, Import) */
export function cleanEconomy(raw: unknown, now = 0): EconomyState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const e = emptyEconomy(now);
  if (o.markets && typeof o.markets === 'object') {
    for (const [id, m] of Object.entries(o.markets as Record<string, any>)) {
      if (!m || typeof m !== 'object') continue;
      const stock: MarketState['stock'] = {};
      if (m.stock && typeof m.stock === 'object') for (const [g, v] of Object.entries(m.stock)) if (isGoodId(g)) stock[g] = num(v, 0, 5000, 0);
      e.markets[id] = { stock, t: num(m.t, 0, 1e9, 0) };
    }
  }
  if (o.ledger && typeof o.ledger === 'object') {
    for (const [id, l] of Object.entries(o.ledger as Record<string, any>)) {
      if (!l || typeof l !== 'object') continue;
      const prices = (src: unknown) => { const out: Partial<Record<GoodId, number>> = {}; if (src && typeof src === 'object') for (const [g, v] of Object.entries(src)) if (isGoodId(g)) out[g] = num(v, 0, 1e6, 0); return out; };
      e.ledger[id] = { name: typeof l.name === 'string' ? l.name.slice(0, 40) : id, t: num(l.t, 0, 1e9, 0), sell: prices(l.sell), buy: prices(l.buy) };
    }
  }
  if (o.cargo && typeof o.cargo === 'object') {
    for (const [g, c] of Object.entries(o.cargo as Record<string, any>)) {
      if (!isGoodId(g) || !c || typeof c !== 'object') continue;
      const n = Math.floor(num(c.n, 0, 1e5, 0));
      if (n > 0) e.cargo[g] = { n, cost: num(c.cost, 0, 1e9, 0) };
    }
  }
  e.nextPay = num(o.nextPay, 0, 1e9, now + UPKEEP.period);
  e.arrears = num(o.arrears, 0, 1e9, 0);
  e.morale = num(o.morale, UPKEEP.moraleMin, 1, 1);
  e.warned = o.warned === true;
  e.heat = num(o.heat, 0, CONTRABAND.heatMax, 0);
  const ammo: AmmoId[] = ['kugel'];
  if (Array.isArray(o.ammo)) for (const a of o.ammo) if ((a === 'kette' || a === 'kartaetsche' || a === 'brand') && !ammo.includes(a)) ammo.push(a);
  e.ammo = ammo;
  return e;
}
