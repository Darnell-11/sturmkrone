import type { CharacterLook, Hat } from './characterParts';
import { FACTIONS, type FactionId } from './factions';
import { gearFromSet } from './gear';

/**
 * Uniformen der Weltmächte für Soldaten und Offiziere (Daten in data/factions.ts, `uniform`): Rock, Hose, Hut, Stiefel und – wo die Macht
 * es vorsieht – ein Beute-Set (Marinegarde, Mondwacht-Ronin, Küstenwache) für Brust, Schultern und Helm. Ändert den Look an Ort und Stelle
 * und liefert die Ausrüstungs-IDs für `look.extra`.
 *   England: rot-marineblau, Dreispitz · Niederlande: orange-weiß-dunkelblau · Deutschland: preußischblau-schwarz-weiß-gold
 *   Frankreich: königsblau-weiß-gold · Kurogane: obsidianschwarz und blutrot mit Kabuto, Maske und Doppelklingen · Marine: weiß und marineblau mit Gold
 */
export function applyFactionUniform(look: CharacterLook, id: FactionId, rank: 'normal' | 'elite' | 'boss', rnd: () => number = Math.random): string[] {
  const u = FACTIONS[id].uniform;
  const officer = rank !== 'normal';
  look.outfit = 'uniform';
  look.outfitColor = u.outfitColor;
  look.accentColor = u.accentColor;
  look.pantsColor = u.pantsColor;
  look.shoes = 'stiefel';
  look.shoesColor = u.shoesColor;
  look.coat = officer ? 'kapitaen' : rnd() < 0.6 ? 'kurz' : 'keiner';
  look.coatColor = officer ? u.officerCoat : u.coatColor;
  look.hat = (officer ? u.officerHat : u.hat) as Hat;
  look.hatColor = officer ? u.officerCoat : u.hatColor;
  if (u.hatAccent) look.hatAccent = u.hatAccent;
  look.eyepatch = false;
  look.scar = id === 'kurogane' ? rnd() < 0.5 : false;
  // Kurogane: Maske (Schal vor dem Gesicht), Handschuhe für den Klingenkampf
  if (u.masks) { look.scarf = true; look.gloves = true; look.beard = 'keiner'; }
  look.extra = [];
  for (const set of u.gear ?? []) look.extra.push(...gearFromSet(set, rank, rnd));
  return look.extra;
}
