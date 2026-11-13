// Inventar: Verbrauchsgüter (Heilung, Buffs), Kopfbedeckungen und die Optik der Rüstungsstufen.
// Waffen, Rüstungen und Talismane stehen weiter in data/regions.ts bzw. data/trinkets.ts – hier nur, was das Inventar zusätzlich braucht.
import type { Coat, Hat, Outfit } from './characterParts';
import type { Rarity } from './trinkets';

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
  { id: 'fajiessenz', n: 'Faji-Essenz', icon: '✦', d: 'Füllt 60 % deines Faji auf.', rarity: 'episch', faji: 0.6, cd: 15, price: 110, max: 5, color: '#8A6AC0' },
];

export const CONSUMABLE_BY_ID: Record<string, ConsumableDef> = Object.fromEntries(CONSUMABLES.map((c) => [c.id, c]));

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
