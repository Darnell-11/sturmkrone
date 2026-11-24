// Inventar: Verbrauchsgüter (Heilung, Buffs), Kopfbedeckungen und die Optik der Rüstungsstufen.
// Alle Werte der Ausrüstung an einer Stelle: Waffen- und Rüstungsstufen (Schmied), Kopfbedeckungen, Schienen, Stiefel und Schilde, Verbrauchsgüter
// und die Preise der Läden. Talismane stehen in data/trinkets.ts, Rüstungssets in data/gear.ts, Seltenheiten in data/rarity.ts.
import type { Coat, Hat, Outfit } from './characterParts';
import type { Rarity } from './rarity';
import type { RepairMaterial } from '../sim/intents';
import { WEAPON_DMG, slotBudget, type SlotKey, type Tier } from './balanceConfig';

/** Werte eines Stücks als Satz („+36 Leben · Rüstung 5 · +3 % Volltreffer“) */
export const statText = (s: { hp?: number; armor?: number; crit?: number }): string =>
  [s.hp ? `+${s.hp} Leben` : '', s.armor ? `Rüstung ${s.armor}` : '', s.crit ? `+${Math.round(s.crit * 100)} % Volltreffer` : ''].filter(Boolean).join(' · ');

/** Plätze für einzeln gekaufte Ausrüstungsstücke (seit Spielstand 11) */
export type GearSlot = 'hands' | 'legs' | 'feet' | 'offhand';
export const GEAR_SLOTS: GearSlot[] = ['hands', 'legs', 'feet', 'offhand'];
export type SlotId = 'head' | 'armor' | 'weapon' | 'trinket' | GearSlot | 'shoulder' | 'chest' | 'cloak' | 'mainhand';

export const SLOT_LABEL: Record<SlotId, string> = {
  head: 'Kopf', armor: 'Rüstung', weapon: 'Waffe', trinket: 'Zubehör', hands: 'Hände', legs: 'Beine', feet: 'Füße', offhand: 'Nebenhand',
  shoulder: 'Schultern', chest: 'Oberkörper', cloak: 'Umhang', mainhand: 'Haupthand',
};

/** Verbrauchsgut: heilt, stärkt für eine Weile oder füllt Faji auf */
export interface ConsumableDef {
  id: string;
  n: string;
  /** Qualitätsstufe 1 … 5 (data/balanceConfig.ts) */
  tier: Tier;
  /** Kurzzeichen im Feld */
  icon: string;
  d: string;
  rarity: Rarity;
  /** Anteil der Lebenspunkte, der sofort heilt */
  heal?: number;
  /** Anteil des Faji-Vorrats, der sofort zurückkommt */
  faji?: number;
  /** Schiffsbedarf: bessert auf See Segel (und Rumpf) aus; wirkt nur an Bord (Taste G oder Schnellleiste) */
  repair?: RepairMaterial;
  /** Zeitlich begrenzte Stärkung: Angriff, Schadensminderung und Volltreffer-Chance (Anteile), Dauer in Sekunden */
  buff?: { atk?: number; reduce?: number; crit?: number; dur: number };
  /** Abklingzeit in Sekunden, bevor dieses Gut wieder benutzt werden darf */
  cd: number;
  price: number;
  /** Höchstzahl im Beutel */
  max: number;
  color: string;
}

/** Proviant liegt weiter in gear.potions (aus Version 1.0), alle anderen in gear.items */
export const CONSUMABLES: ConsumableDef[] = [
  { id: 'proviant', tier: 1, n: 'Proviant', icon: '🍖', d: 'Heilt 40 % deiner Lebenspunkte.', rarity: 'gewoehnlich', heal: 0.4, cd: 6, price: 25, max: 10, color: '#C79A3A' },
  { id: 'festmahl', tier: 2, n: 'Festmahl', icon: '🍲', d: 'Heilt 80 % deiner Lebenspunkte.', rarity: 'selten', heal: 0.8, cd: 14, price: 90, max: 5, color: '#C2573A' },
  { id: 'kraftsaft', tier: 2, n: 'Kraftsaft', icon: '⚔', d: '+25 % Angriff für 60 Sekunden.', rarity: 'selten', buff: { atk: 0.25, dur: 60 }, cd: 20, price: 70, max: 5, color: '#E0663A' },
  { id: 'eisenhaut', tier: 2, n: 'Eisenhaut-Trank', icon: '🛡', d: '25 % weniger Schaden für 45 Sekunden.', rarity: 'selten', buff: { reduce: 0.25, dur: 45 }, cd: 20, price: 70, max: 5, color: '#8AA0B8' },
  { id: 'falkenauge', tier: 3, n: 'Falkenauge', icon: '👁', d: '+15 % Volltreffer-Chance für 60 Sekunden.', rarity: 'selten', buff: { crit: 0.15, dur: 60 }, cd: 20, price: 80, max: 5, color: '#E3B04B' },
  { id: 'segeltuch', tier: 1, n: 'Segeltuch', icon: '🧵', d: 'Flickt auf See 40 % der Segel-HP (Taste G; die Crew braucht ein paar Sekunden).', rarity: 'gewoehnlich', repair: 'segeltuch', cd: 0, price: 45, max: 8, color: '#E8DCC0' },
  { id: 'planken', tier: 1, n: 'Holzplanken', icon: '🪵', d: 'Flickt auf See 12 % Rumpf und 15 % Segel-HP (Taste G).', rarity: 'gewoehnlich', repair: 'planken', cd: 0, price: 35, max: 8, color: '#A57A4A' },
  { id: 'fajiessenz', tier: 3, n: 'Faji-Essenz', icon: '✦', d: 'Füllt 60 % deines Faji auf.', rarity: 'episch', faji: 0.6, cd: 15, price: 110, max: 5, color: '#8A6AC0' },
];

export const CONSUMABLE_BY_ID: Record<string, ConsumableDef> = Object.fromEntries(CONSUMABLES.map((c) => [c.id, c]));

/** Proviant (Taste H, Markt): liegt im Spielstand in gear.potions; Preis, Heilung und Höchstzahl stehen nur hier */
export const PROVIANT = CONSUMABLE_BY_ID.proviant as ConsumableDef & { heal: number };
/** Symbol der Kopfbedeckungen und Talismane im Inventar */
export const HEAD_ICON = '🎩';
export const TRINKET_ICON = '📿';

/** Pause zwischen zwei beliebigen Gütern der Leiste (verhindert Leertrinken im Kampf) */
export const GLOBAL_ITEM_CD = 1.2;

/** Kopfbedeckung: Werte (aus dem Power-Budget der Stufe) und das Aussehen am Modell */
export interface HeadDef {
  id: string;
  n: string;
  hat: Hat;
  color: string;
  d: string;
  rarity: Rarity;
  tier: Tier;
  hp: number;
  /** Rüstungswert (Kurve: data/balanceConfig.ts `mitigation`) */
  armor: number;
  crit?: number;
  price: number;
  rank: number;
}

/** Stück aus Stufe und Platz: Leben, Rüstung und Preis stammen aus dem Budget, Beschreibung folgt daraus */
function piece<T extends { tier: Tier; crit?: number }>(slot: SlotKey, o: T) {
  const b = slotBudget(o.tier, slot);
  return { hp: b.hp, armor: b.armor, price: b.price, d: statText({ hp: b.hp, armor: b.armor, crit: o.crit }) };
}
const RARITY_OF_TIER: Record<Tier, Rarity> = { 1: 'gewoehnlich', 2: 'selten', 3: 'episch', 4: 'episch', 5: 'legendaer' };
const head = (id: string, n: string, hat: Hat, color: string, tier: Tier, rank: number, crit?: number): HeadDef => ({ id, n, hat, color, tier, rank, crit, rarity: RARITY_OF_TIER[tier], ...piece('head', { tier, crit }) });

export const HEADS: HeadDef[] = [
  head('kopftuch', 'Seidenkopftuch', 'bandana', '#A8322A', 1, 0),
  head('wollmuetze', 'Wollmütze', 'muetze', '#3A5A7A', 1, 0),
  head('kapitaenshut', 'Kapitänshut', 'dreispitz', '#1E1A20', 2, 2, 0.03),
  head('eisenhelm', 'Eisenhelm', 'helm', '#8A939C', 2, 3),
  head('fliegerbrille', 'Fliegerbrille', 'brille', '#C79A3A', 3, 4, 0.08),
  head('admiralshut', 'Admiralshut', 'zweispitz', '#14284A', 3, 6, 0.05),
];

export const HEAD_BY_ID: Record<string, HeadDef> = Object.fromEntries(HEADS.map((h) => [h.id, h]));

/** Ausrüstungsstück für Hände, Beine, Füße oder Nebenhand: Werte (aus dem Power-Budget der Stufe) und das Aussehen am Modell */
export interface GearDef {
  id: string;
  n: string;
  slot: GearSlot;
  icon: string;
  /** Teil aus data/equipment.ts, das die Figur dafür trägt */
  equip?: string;
  /** Füße: Farbe der Stiefel */
  shoesColor?: string;
  /** Nebenhand: Farbe des Schilds */
  shield?: string;
  d: string;
  rarity: Rarity;
  tier: Tier;
  hp: number;
  armor: number;
  crit?: number;
  price: number;
  rank: number;
}

const gearPiece = (id: string, n: string, slot: GearSlot, icon: string, tier: Tier, rank: number, o: { equip?: string; shoesColor?: string; shield?: string; crit?: number } = {}): GearDef =>
  ({ id, n, slot, icon, tier, rank, rarity: RARITY_OF_TIER[tier], ...o, ...piece(slot, { tier, crit: o.crit }) });

export const GEAR: GearDef[] = [
  gearPiece('armschienen_leder', 'Lederne Armschienen', 'hands', '🧤', 1, 0, { equip: 'armschienen_leder' }),
  gearPiece('armschienen_stahl', 'Stählerne Armschienen', 'hands', '🧤', 2, 3, { equip: 'armschienen_stahl' }),
  gearPiece('beinschienen_leder', 'Lederne Beinschienen', 'legs', '🦿', 1, 0, { equip: 'beinschienen_leder' }),
  gearPiece('beinschienen_stahl', 'Stählerne Beinschienen', 'legs', '🦿', 2, 3, { equip: 'beinschienen_stahl' }),
  gearPiece('seestiefel', 'Seestiefel', 'feet', '🥾', 1, 0, { equip: 'stiefel', shoesColor: '#2A2420' }),
  gearPiece('kapitaensstiefel', 'Kapitänsstiefel', 'feet', '🥾', 2, 2, { equip: 'stiefel', shoesColor: '#5A1F1A', crit: 0.02 }),
  gearPiece('holzschild', 'Holzschild', 'offhand', '🛡', 1, 1, { shield: '#7A4A22' }),
  gearPiece('eisenschild', 'Eisenschild', 'offhand', '🛡', 2, 3, { shield: '#6E7781' }),
];

export const GEAR_BY_ID: Record<string, GearDef> = Object.fromEntries(GEAR.map((x) => [x.id, x]));

/**
 * Optik der Rüstungsstufen (Index = Stufe in ARMOR): überschreibt Oberteil und Mantel der Figur; Stufe 0 zeigt das
 * eigene Aussehen. extra: zusätzliche Teile aus data/equipment.ts (Brustplatte, Schulterplatten).
 */
export const ARMOR_LOOK: ({ outfit?: Outfit; outfitColor?: string; coat?: Coat; coatColor?: string; extra?: string[] } | null)[] = [
  null,
  { outfit: 'weste', outfitColor: '#7A5230' },
  { outfit: 'jacke', outfitColor: '#8A939C', extra: ['kuerass'] },
  { outfit: 'jacke', outfitColor: '#2F7A8A', coat: 'kurz', coatColor: '#1F4E5A', extra: ['schulterplatten'] },
  { outfit: 'uniform', outfitColor: '#5A3A8A', coat: 'kapitaen', coatColor: '#E3B04B' },
];

/** Plätze der Schnellleiste (Tasten 1–4) */
export const BAR_SLOTS = 4;

// ---------- Waffen und Rüstungen (Stufen, gekauft beim Schmied) ----------

/** Waffenstufe: `tier` 1 … 5, der Schadenszuschlag kommt aus WEAPON_DMG (Stufe 5 ist nur schmiedbar: data/crafting.ts) */
export interface WeaponDef { n: string; tier: Tier; dmg: number; price: number; rank: number; col: string; glow?: boolean }
const W = (n: string, tier: Tier, price: number, rank: number, col: string, glow?: boolean, dmg: number = WEAPON_DMG[tier]): WeaponDef => ({ n, tier, dmg, price, rank, col, glow });
export const WEAPONS: WeaponDef[] = [
  W('Rostiger Säbel', 1, 0, 0, '#8C8C8C', false, 0),
  W('Stahlklinge', 1, 220, 0, '#C9D2DA'),
  W('Damastklinge', 2, 750, 2, '#9FB4C8'),
  W('Sturmklinge', 3, 1900, 4, '#7FD6FF', true),
  W('Gezeitenklinge', 4, 4800, 7, '#FFD166', true),
  W('Himmelsschneide', 5, 11000, 9, '#FF8AD8', true),
];

/**
 * Waffenlinien je Kampfstil: gleiche Stufen, Preise und Schadenswerte wie WEAPONS,
 * aber eigene Namen, eigenes Symbol, eigenes Aussehen und ein kleiner Stilbonus.
 */
export interface WeaponLine { title: string; icon: string; names: string[]; stat: (w: WeaponDef, tier: number) => string; flavor: string }
export const WEAPON_LINES: Record<'faust' | 'schwert' | 'effekt', WeaponLine> = {
  schwert: {
    title: 'Klingen',
    icon: '🗡',
    names: WEAPONS.map((w) => w.n),
    stat: (w) => `+${w.dmg} Schaden${w.glow ? ' · leuchtet' : ''}`,
    flavor: 'Grete schmiedet dir jede Klingenform – Säbel, Langklinge, Zweihänder oder Doppelklingen.',
  },
  faust: {
    title: 'Kampfhandschuhe',
    icon: '🥊',
    names: ['Lederwickel', 'Eisenknöchel', 'Stahlfäuste', 'Sturmfäuste', 'Gezeitenfäuste', 'Himmelsfäuste'],
    stat: (w, t) => `+${w.dmg} Schlagkraft · +${t * 2} % Volltreffer${w.glow ? ' · leuchtet' : ''}`,
    flavor: 'Beschlagene Handschuhe: jeder Schlag sitzt härter, Volltreffer werden häufiger.',
  },
  effekt: {
    title: 'Faji-Foki',
    icon: '🔮',
    names: ['Holzamulett', 'Bernsteinfokus', 'Runenstein', 'Sturmkristall', 'Gezeitenperle', 'Himmelsauge'],
    stat: (w, t) => `+${w.dmg} Faji-Kraft · +${t * 5} % Faji-Erholung${w.glow ? ' · leuchtet' : ''}`,
    flavor: 'Ein Fokus bündelt dein Faji: stärkere Geschosse, schneller wieder bereit.',
  },
};

/** Körperrüstung (Platz Oberkörper): Stufe und Werte aus dem Power-Budget */
export interface ArmorDef { n: string; icon: string; tier: Tier; hp: number; armor: number; price: number; rank: number }
const A = (n: string, icon: string, tier: Tier, rank: number, price: number, starter = false): ArmorDef => { const b = slotBudget(tier, 'chest'); return { n, icon, tier, rank, price, hp: starter ? 0 : b.hp, armor: starter ? 0 : b.armor }; };
export const ARMOR: ArmorDef[] = [
  A('Leinenhemd', '👕', 1, 0, 0, true),
  A('Lederweste', '🦺', 1, 0, 200),
  A('Kettenhemd', '⛓', 2, 2, 700),
  A('Gezeitenpanzer', '🛡', 3, 5, 2300),
  A('Faji-Harnisch', '✨', 4, 7, 6500),
];

// ---------- Preise der Läden ----------

/** Faji-Punkt im Schrein: Preis steigt mit jedem Kauf */
export const SHRINE_PRICE = (bought: number) => 300 + bought * 250;
/** Übernachten in der Taverne */
export const REST_PRICE = 20;
