// Inventar: Verbrauchsgüter (Heilung, Buffs), Kopfbedeckungen und die Optik der Rüstungsstufen.
// Alle Werte der Ausrüstung an einer Stelle: Waffen- und Rüstungsstufen (Schmied), Kopfbedeckungen, Schienen, Stiefel und Schilde, Verbrauchsgüter
// und die Preise der Läden. Talismane stehen in data/trinkets.ts, Rüstungssets in data/gear.ts, Seltenheiten in data/rarity.ts.
import type { Coat, Hat, Outfit } from './characterParts';
import type { Rarity } from './rarity';
import type { RepairMaterial } from '../sim/intents';

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
  { id: 'proviant', n: 'Proviant', icon: '🍖', d: 'Heilt 40 % deiner Lebenspunkte.', rarity: 'gewoehnlich', heal: 0.4, cd: 6, price: 25, max: 10, color: '#C79A3A' },
  { id: 'festmahl', n: 'Festmahl', icon: '🍲', d: 'Heilt 80 % deiner Lebenspunkte.', rarity: 'selten', heal: 0.8, cd: 14, price: 90, max: 5, color: '#C2573A' },
  { id: 'kraftsaft', n: 'Kraftsaft', icon: '⚔', d: '+25 % Angriff für 60 Sekunden.', rarity: 'selten', buff: { atk: 0.25, dur: 60 }, cd: 20, price: 70, max: 5, color: '#E0663A' },
  { id: 'eisenhaut', n: 'Eisenhaut-Trank', icon: '🛡', d: '25 % weniger Schaden für 45 Sekunden.', rarity: 'selten', buff: { reduce: 0.25, dur: 45 }, cd: 20, price: 70, max: 5, color: '#8AA0B8' },
  { id: 'falkenauge', n: 'Falkenauge', icon: '👁', d: '+15 % Volltreffer-Chance für 60 Sekunden.', rarity: 'selten', buff: { crit: 0.15, dur: 60 }, cd: 20, price: 80, max: 5, color: '#E3B04B' },
  { id: 'segeltuch', n: 'Segeltuch', icon: '🧵', d: 'Flickt auf See 40 % der Segel-HP (Taste G; die Crew braucht ein paar Sekunden).', rarity: 'gewoehnlich', repair: 'segeltuch', cd: 0, price: 45, max: 8, color: '#E8DCC0' },
  { id: 'planken', n: 'Holzplanken', icon: '🪵', d: 'Flickt auf See 12 % Rumpf und 15 % Segel-HP (Taste G).', rarity: 'gewoehnlich', repair: 'planken', cd: 0, price: 35, max: 8, color: '#A57A4A' },
  { id: 'fajiessenz', n: 'Faji-Essenz', icon: '✦', d: 'Füllt 60 % deines Faji auf.', rarity: 'episch', faji: 0.6, cd: 15, price: 110, max: 5, color: '#8A6AC0' },
];

export const CONSUMABLE_BY_ID: Record<string, ConsumableDef> = Object.fromEntries(CONSUMABLES.map((c) => [c.id, c]));

/** Proviant (Taste H, Markt): liegt im Spielstand in gear.potions; Preis, Heilung und Höchstzahl stehen nur hier */
export const PROVIANT = CONSUMABLE_BY_ID.proviant as ConsumableDef & { heal: number };
/** Symbol der Kopfbedeckungen und Talismane im Inventar */
export const HEAD_ICON = '🎩';
export const TRINKET_ICON = '📿';

/** Pause zwischen zwei beliebigen Gütern der Leiste (verhindert Leertrinken im Kampf) */
export const GLOBAL_ITEM_CD = 1.2;

/** Kopfbedeckung: Werte und das Aussehen am Modell */
export interface HeadDef {
  id: string;
  n: string;
  hat: Hat;
  color: string;
  d: string;
  rarity: Rarity;
  hp: number;
  reduce?: number;
  crit?: number;
  price: number;
  rank: number;
}

export const HEADS: HeadDef[] = [
  { id: 'kopftuch', n: 'Seidenkopftuch', hat: 'bandana', color: '#A8322A', d: '+20 Leben', rarity: 'gewoehnlich', hp: 20, price: 120, rank: 0 },
  { id: 'wollmuetze', n: 'Wollmütze', hat: 'muetze', color: '#3A5A7A', d: '+30 Leben', rarity: 'gewoehnlich', hp: 30, price: 200, rank: 0 },
  { id: 'kapitaenshut', n: 'Kapitänshut', hat: 'dreispitz', color: '#1E1A20', d: '+45 Leben, +3 % Volltreffer', rarity: 'selten', hp: 45, crit: 0.03, price: 480, rank: 2 },
  { id: 'eisenhelm', n: 'Eisenhelm', hat: 'helm', color: '#8A939C', d: '+80 Leben, 6 % weniger Schaden', rarity: 'selten', hp: 80, reduce: 0.06, price: 900, rank: 3 },
  { id: 'fliegerbrille', n: 'Fliegerbrille', hat: 'brille', color: '#C79A3A', d: '+30 Leben, +8 % Volltreffer', rarity: 'episch', hp: 30, crit: 0.08, price: 1500, rank: 4 },
  { id: 'admiralshut', n: 'Admiralshut', hat: 'zweispitz', color: '#14284A', d: '+120 Leben, +5 % Volltreffer, 5 % weniger Schaden', rarity: 'legendaer', hp: 120, crit: 0.05, reduce: 0.05, price: 2600, rank: 6 },
];

export const HEAD_BY_ID: Record<string, HeadDef> = Object.fromEntries(HEADS.map((h) => [h.id, h]));

/** Ausrüstungsstück für Hände, Beine, Füße oder Nebenhand: Werte und das Aussehen am Modell */
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
  hp: number;
  reduce?: number;
  crit?: number;
  price: number;
  rank: number;
}

export const GEAR: GearDef[] = [
  { id: 'armschienen_leder', n: 'Lederne Armschienen', slot: 'hands', icon: '🧤', equip: 'armschienen_leder', d: '+25 Leben', rarity: 'gewoehnlich', hp: 25, price: 150, rank: 0 },
  { id: 'armschienen_stahl', n: 'Stählerne Armschienen', slot: 'hands', icon: '🧤', equip: 'armschienen_stahl', d: '+50 Leben, 4 % weniger Schaden', rarity: 'selten', hp: 50, reduce: 0.04, price: 750, rank: 3 },
  { id: 'beinschienen_leder', n: 'Lederne Beinschienen', slot: 'legs', icon: '🦿', equip: 'beinschienen_leder', d: '+25 Leben', rarity: 'gewoehnlich', hp: 25, price: 160, rank: 0 },
  { id: 'beinschienen_stahl', n: 'Stählerne Beinschienen', slot: 'legs', icon: '🦿', equip: 'beinschienen_stahl', d: '+60 Leben, 4 % weniger Schaden', rarity: 'selten', hp: 60, reduce: 0.04, price: 800, rank: 3 },
  { id: 'seestiefel', n: 'Seestiefel', slot: 'feet', icon: '🥾', equip: 'stiefel', shoesColor: '#2A2420', d: '+20 Leben', rarity: 'gewoehnlich', hp: 20, price: 140, rank: 0 },
  { id: 'kapitaensstiefel', n: 'Kapitänsstiefel', slot: 'feet', icon: '🥾', equip: 'stiefel', shoesColor: '#5A1F1A', d: '+40 Leben, +2 % Volltreffer', rarity: 'selten', hp: 40, crit: 0.02, price: 600, rank: 2 },
  { id: 'holzschild', n: 'Holzschild', slot: 'offhand', icon: '🛡', shield: '#7A4A22', d: '+30 Leben, 3 % weniger Schaden', rarity: 'gewoehnlich', hp: 30, reduce: 0.03, price: 300, rank: 1 },
  { id: 'eisenschild', n: 'Eisenschild', slot: 'offhand', icon: '🛡', shield: '#6E7781', d: '+60 Leben, 7 % weniger Schaden', rarity: 'selten', hp: 60, reduce: 0.07, price: 1100, rank: 3 },
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

export interface WeaponDef { n: string; dmg: number; price: number; rank: number; col: string; glow?: boolean }
export const WEAPONS: WeaponDef[] = [
  { n: 'Rostiger Säbel', dmg: 0, price: 0, rank: 0, col: '#8C8C8C' },
  { n: 'Stahlklinge', dmg: 6, price: 220, rank: 0, col: '#C9D2DA' },
  { n: 'Damastklinge', dmg: 14, price: 750, rank: 2, col: '#9FB4C8' },
  { n: 'Sturmklinge', dmg: 25, price: 1900, rank: 4, col: '#7FD6FF', glow: true },
  { n: 'Gezeitenklinge', dmg: 40, price: 4800, rank: 6, col: '#FFD166', glow: true },
  { n: 'Himmelsschneide', dmg: 60, price: 11000, rank: 8, col: '#FF8AD8', glow: true },
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

export interface ArmorDef { n: string; icon: string; hp: number; price: number; rank: number }
export const ARMOR: ArmorDef[] = [
  { n: 'Leinenhemd', icon: '👕', hp: 0, price: 0, rank: 0 },
  { n: 'Lederweste', icon: '🦺', hp: 40, price: 200, rank: 0 },
  { n: 'Kettenhemd', icon: '⛓', hp: 95, price: 700, rank: 2 },
  { n: 'Gezeitenpanzer', icon: '🛡', hp: 170, price: 2300, rank: 5 },
  { n: 'Faji-Harnisch', icon: '✨', hp: 280, price: 6500, rank: 7 },
];

// ---------- Preise der Läden ----------

/** Faji-Punkt im Schrein: Preis steigt mit jedem Kauf */
export const SHRINE_PRICE = (bought: number) => 300 + bought * 250;
/** Übernachten in der Taverne */
export const REST_PRICE = 20;
