// Faji: alle Fähigkeiten, Zweige, Synergien. Neue Fähigkeit = neuer Eintrag hier (die Wirkung wählt eine "shape").

export type Branch = 'geist' | 'koerper' | 'effekt' | 'klinge';
export type Element = 'geist' | 'koerper' | 'klinge' | 'feuer' | 'eis' | 'blitz' | 'sturm' | 'erde' | 'schatten' | 'licht' | 'schwerkraft' | 'gift' | 'flut' | 'meteor';
export type Status = 'burn' | 'freeze' | 'stun' | 'poison' | 'fear' | 'slow' | 'launch';
export type Shape =
  | 'nova'        // Welle um dich herum
  | 'cone'        // Fächer nach vorn
  | 'line'        // Linie/Geschoss nach vorn, durchschlagend
  | 'bolt'        // einzelnes Geschoss
  | 'chain'       // springt von Gegner zu Gegner
  | 'dash'        // Sprint nach vorn mit Treffern
  | 'blink'       // Sprung hinter einen Gegner
  | 'rain'        // mehrere Einschläge im Umkreis
  | 'pull'        // zieht Gegner zusammen
  | 'cloud'       // Fläche mit Schaden über Zeit
  | 'spikes'      // Stacheln in einer Linie
  | 'barrage'     // viele schnelle Schläge nach vorn
  | 'buff'        // Stärkung (eigener Wert in buff)
  | 'heal';

export interface Passives {
  dmgFist: number; dmgBlade: number; dmgAll: number; dmgSkill: number; reduce: number; speed: number;
  rollCd: number; crit: number; dodge: number; fajiMax: number; fajiRegen: number; cdr: number; fame: number;
  reach: number; lifesteal: number; fearWeak: number; riposte: number; secondWind: number; rage: number; hpMax: number; poise: number;
}

export interface ActiveDef {
  cost: number;
  cd: number;
  shape: Shape;
  el: Element;
  /** Schadensmultiplikator auf den Angriffswert */
  dmg: (l: number) => number;
  radius?: number;
  range?: number;
  count?: number;
  status?: Status;
  /** Dauer von Status/Buff in s */
  dur?: number;
  buff?: Partial<Passives> & { invuln?: boolean; giant?: boolean };
  heal?: number;
  /** Wirkt auch auf See (Variante in Meilenstein 5) */
  sea?: 'salvo' | 'freeze' | 'strike' | 'wind' | 'wave' | 'repair' | 'ceasefire' | 'reload' | 'cleave' | 'meteor' | 'still';
  /** Ultimate: Cut-in-Banner */
  ult?: boolean;
}

export interface SkillDef {
  id: string;
  b: Branch;
  /** Reihe im Baum 1 … 5 */
  t: 1 | 2 | 3 | 4 | 5;
  /** Spalte im Baum (0 … 4) */
  x: number;
  max: number;
  /** Benötigte Punkte im Zweig */
  req: number;
  /** Mindest-Spielerstufe */
  lv?: number;
  /** Vorher gelernte Fähigkeiten (Verbindungen im Baum) */
  needs?: string[];
  /** Erst nach dem Faji-Erwachen dieses Zweigs */
  awaken?: boolean;
  n: string;
  d: (l: number) => string;
  passive?: (l: number) => Partial<Passives>;
  act?: ActiveDef;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

export const BRANCHES: Record<Branch, { n: string; col: string; d: string; el: Element }> = {
  koerper: { n: 'Körper-Faji', col: '#FF8A3A', el: 'koerper', d: 'Faji stärkt den Körper direkt – härtere Schläge, zähere Haut, gewaltige Bodenschläge.' },
  klinge: { n: 'Schwertkunst', col: '#9FD8FF', el: 'klinge', d: 'Klingentechniken: fliegende Hiebe, Wirbel und Schnitte, die selbst Schiffe spalten.' },
  effekt: { n: 'Effekt-Faji', col: '#C77DFF', el: 'feuer', d: 'Formt Faji zu Elementen: Feuer, Eis, Blitz, Sturm, Erde, Schatten, Licht, Schwerkraft, Gift, Flut und Meteore.' },
  geist: { n: 'Geistiges Faji', col: '#FFD166', el: 'geist', d: 'Aura und Willenskraft: schüchtert ein, lähmt, lässt Schwache umfallen und stärkt die Crew.' },
};

export const ELEMENT_COLORS: Record<Element, string> = {
  geist: '#FFD166', koerper: '#FF8A3A', klinge: '#9FD8FF', feuer: '#FF6A2A', eis: '#8FE8FF', blitz: '#F0F06A', sturm: '#9FF0C8',
  erde: '#C9A26B', schatten: '#8A6AD8', licht: '#FFF4C8', schwerkraft: '#B06AFF', gift: '#8AD84A', flut: '#4FB0F5', meteor: '#FF9A3A',
};

export const SKILLS: SkillDef[] = [
  // ---------- Körper-Faji ----------
  { id: 'eisenfaust', b: 'koerper', t: 1, x: 0, max: 3, req: 0, n: 'Eisenfaust', d: (l) => `Faustschaden +${20 * l} %, jeder andere Nahkampf +${8 * l} %`, passive: (l) => ({ dmgFist: 0.2 * l, dmgBlade: 0.08 * l }) },
  { id: 'eisenhaut', b: 'koerper', t: 1, x: 1, max: 3, req: 0, n: 'Eisenhaut', d: (l) => `Erlittener Schaden −${8 * l} %`, passive: (l) => ({ reduce: 0.08 * l }) },
  { id: 'sprint', b: 'koerper', t: 1, x: 2, max: 2, req: 0, n: 'Federschritt', d: (l) => `+${10 * l} % Lauftempo, Rolle lädt ${20 * l} % schneller`, passive: (l) => ({ speed: 0.1 * l, rollCd: 0.2 * l }) },
  { id: 'vitalitaet', b: 'koerper', t: 1, x: 3, max: 3, req: 0, n: 'Lebenskraft', d: (l) => `Max. Leben +${12 * l} %`, passive: (l) => ({ hpMax: 0.12 * l }) },
  { id: 'bergbrecher', b: 'koerper', t: 1, x: 4, max: 3, req: 0, n: 'Bergbrecher', d: (l) => `Bodenschlag mit ${pct(1.4 + 0.25 * l)} Schaden im Umkreis, betäubt 1,2 s`, act: { cost: 25, cd: 6, shape: 'nova', el: 'koerper', dmg: (l) => 1.4 + 0.25 * l, radius: 5, status: 'stun', dur: 1.2 } },
  { id: 'stahlleib', b: 'koerper', t: 2, x: 1, max: 3, req: 2, needs: ['eisenhaut'], n: 'Stahlleib', d: (l) => `${4 + l} s lang 65 % weniger Schaden und kein Rückstoß`, act: { cost: 35, cd: 16, shape: 'buff', el: 'koerper', dmg: () => 0, dur: 5, buff: { reduce: 0.65, poise: 1 } } },
  { id: 'hundert', b: 'koerper', t: 2, x: 0, max: 3, req: 2, needs: ['eisenfaust'], n: 'Hundert Fäuste', d: (l) => `Schlaghagel nach vorn, 13 Treffer zu je ${pct(0.3 + 0.05 * l)}`, act: { cost: 30, cd: 8, shape: 'barrage', el: 'koerper', dmg: (l) => 0.3 + 0.05 * l, count: 13, range: 3.2 } },
  { id: 'atem', b: 'koerper', t: 2, x: 3, max: 1, req: 3, needs: ['vitalitaet'], n: 'Zweiter Atem', d: () => 'Einmal pro Kampf: fällst du unter 25 % Leben, heilst du 35 %', passive: () => ({ secondWind: 0.35 }) },
  { id: 'erdstoss', b: 'koerper', t: 2, x: 4, max: 3, req: 3, needs: ['bergbrecher'], n: 'Erdstoß', d: (l) => `Stampfer, der eine Schockwelle nach vorn schickt (${pct(1.6 + 0.3 * l)}) und Gegner hochschleudert`, act: { cost: 30, cd: 9, shape: 'spikes', el: 'erde', dmg: (l) => 1.6 + 0.3 * l, range: 10, status: 'launch' } },
  { id: 'konter', b: 'koerper', t: 2, x: 2, max: 2, req: 2, needs: ['sprint'], n: 'Gegenschlag', d: (l) => `Perfekte Paraden lösen eine Druckwelle aus (${pct(0.8 * l)})`, passive: (l) => ({ riposte: 0.8 * l }) },
  { id: 'titan', b: 'koerper', t: 3, x: 1, max: 2, req: 5, lv: 10, needs: ['stahlleib'], n: 'Titanform', d: (l) => `${8 + l} s riesig: +60 % Nahkampfschaden, 33 % weniger Schaden, sofort 30 % Heilung`, act: { cost: 60, cd: 40, shape: 'buff', el: 'koerper', dmg: () => 0, dur: 9, heal: 0.3, buff: { dmgAll: 0.6, reduce: 0.33, giant: true }, ult: true } },
  { id: 'meteorfaust', b: 'koerper', t: 3, x: 0, max: 2, req: 6, needs: ['hundert'], n: 'Meteorfaust', d: (l) => `Sprung und Einschlag aus der Luft (${pct(3 + 0.5 * l)}), riesiger Krater`, act: { cost: 45, cd: 18, shape: 'nova', el: 'meteor', dmg: (l) => 3 + 0.5 * l, radius: 7, status: 'launch', ult: true } },
  { id: 'felsenhaut', b: 'koerper', t: 3, x: 3, max: 2, req: 6, needs: ['atem'], n: 'Felsenpanzer', d: (l) => `Haltung +${50 * l} %: du taumelst kaum noch`, passive: (l) => ({ poise: 0.5 * l, reduce: 0.05 * l }) },
  { id: 'urgewalt', b: 'koerper', t: 4, x: 2, max: 1, req: 9, lv: 15, awaken: true, needs: ['titan'], n: 'Urgewalt', d: () => 'Erwacht: Ein einziger Schlag, der die Insel erbeben lässt (700 %)', act: { cost: 90, cd: 60, shape: 'nova', el: 'koerper', dmg: () => 7, radius: 12, status: 'stun', dur: 3, ult: true, sea: 'cleave' } },

  // ---------- Schwertkunst ----------
  { id: 'schaerfe', b: 'klinge', t: 1, x: 0, max: 3, req: 0, n: 'Klingenschärfe', d: (l) => `Klingenschaden +${12 * l} %`, passive: (l) => ({ dmgBlade: 0.12 * l }) },
  { id: 'riposte', b: 'klinge', t: 1, x: 1, max: 2, req: 0, n: 'Riposte', d: (l) => `${18 * l} % Chance, Angriffe abzuwehren und sofort zu kontern`, passive: (l) => ({ dodge: 0.09 * l, riposte: 0.4 * l }) },
  { id: 'meister', b: 'klinge', t: 1, x: 2, max: 2, req: 0, n: 'Klingenmeister', d: (l) => `+${(0.3 * l).toFixed(1).replace('.', ',')} m Reichweite, +${6 * l} % Krit`, passive: (l) => ({ reach: 0.3 * l, crit: 0.06 * l }) },
  { id: 'sichelwind', b: 'klinge', t: 1, x: 3, max: 3, req: 0, n: 'Sichelwind', d: (l) => `Fliegender Klingenhieb in einer Linie (${pct(1.3 + 0.25 * l)}) – trifft auch Schiffe`, act: { cost: 20, cd: 4, shape: 'line', el: 'klinge', dmg: (l) => 1.3 + 0.25 * l, range: 18, sea: 'cleave' } },
  { id: 'iai', b: 'klinge', t: 1, x: 4, max: 3, req: 0, n: 'Blitzziehen', d: (l) => `Blitzschneller Schnitt im Vorbeigehen (${pct(1.5 + 0.3 * l)})`, act: { cost: 18, cd: 5, shape: 'dash', el: 'klinge', dmg: (l) => 1.5 + 0.3 * l, range: 8 } },
  { id: 'wirbel', b: 'klinge', t: 2, x: 0, max: 3, req: 2, needs: ['schaerfe'], n: 'Wirbelklinge', d: (l) => `2 s Wirbel, trifft alles um dich (8 × ${pct(0.45 + 0.08 * l)})`, act: { cost: 30, cd: 9, shape: 'nova', el: 'klinge', dmg: (l) => 0.45 + 0.08 * l, radius: 4, count: 8 } },
  { id: 'tausend', b: 'klinge', t: 2, x: 4, max: 3, req: 2, needs: ['iai'], n: 'Tausend Schnitte', d: (l) => `Durch alle Gegner auf dem Weg hindurchschneiden (${pct(1.2 + 0.2 * l)})`, act: { cost: 35, cd: 10, shape: 'dash', el: 'klinge', dmg: (l) => 1.2 + 0.2 * l, range: 14, count: 3 } },
  { id: 'blutrausch', b: 'klinge', t: 2, x: 1, max: 1, req: 3, needs: ['riposte'], n: 'Blutrausch', d: () => 'Jeder besiegte Gegner: +8 % Angriffstempo im Kampf (bis +40 %)', passive: () => ({ rage: 0.08 }) },
  { id: 'kreuzschnitt', b: 'klinge', t: 2, x: 2, max: 3, req: 3, needs: ['meister'], n: 'Kreuzschnitt', d: (l) => `Zwei gekreuzte Klingenwellen (je ${pct(1.1 + 0.2 * l)})`, act: { cost: 28, cd: 7, shape: 'cone', el: 'klinge', dmg: (l) => 1.1 + 0.2 * l, range: 9, count: 2 } },
  { id: 'mondsichel', b: 'klinge', t: 2, x: 3, max: 3, req: 3, needs: ['sichelwind'], n: 'Mondsichel', d: (l) => `Riesige Sichel, die zurückkehrt (${pct(1.4 + 0.25 * l)} hin und zurück)`, act: { cost: 32, cd: 9, shape: 'line', el: 'licht', dmg: (l) => 1.4 + 0.25 * l, range: 16, count: 2, sea: 'cleave' } },
  { id: 'himmel', b: 'klinge', t: 3, x: 3, max: 2, req: 5, lv: 10, needs: ['mondsichel'], n: 'Himmelsspalter', d: (l) => `Gewaltiger Hieb über 18 m (${pct(3.2 + 0.4 * l)}) – spaltet sogar Schiffe`, act: { cost: 60, cd: 30, shape: 'line', el: 'klinge', dmg: (l) => 3.2 + 0.4 * l, range: 22, radius: 2.5, ult: true, sea: 'cleave' } },
  { id: 'schattenklinge', b: 'klinge', t: 3, x: 1, max: 2, req: 6, needs: ['blutrausch'], n: 'Schattenschritt-Klinge', d: (l) => `Teleport zu ${2 + l} Gegnern hintereinander, je ein Schnitt (${pct(1.8)})`, act: { cost: 45, cd: 16, shape: 'blink', el: 'schatten', dmg: () => 1.8, count: 3 } },
  { id: 'klingensturm', b: 'klinge', t: 3, x: 0, max: 2, req: 6, needs: ['wirbel'], n: 'Klingensturm', d: (l) => `Ein Ring kreisender Klingen begleitet dich ${5 + l} s`, act: { cost: 40, cd: 20, shape: 'cloud', el: 'klinge', dmg: (l) => 0.5 + 0.1 * l, radius: 3.5, dur: 6 } },
  { id: 'letzterschnitt', b: 'klinge', t: 4, x: 2, max: 1, req: 9, lv: 15, awaken: true, needs: ['himmel'], n: 'Letzter Schnitt', d: () => 'Erwacht: Die Zeit steht still – ein Schnitt durch alles im Blick (900 %)', act: { cost: 90, cd: 60, shape: 'cone', el: 'klinge', dmg: () => 9, range: 20, ult: true, sea: 'cleave' } },

  // ---------- Effekt-Faji ----------
  { id: 'fluss', b: 'effekt', t: 1, x: 0, max: 3, req: 0, n: 'Faji-Fluss', d: (l) => `Fähigkeitsschaden +${12 * l} %`, passive: (l) => ({ dmgSkill: 0.12 * l }) },
  { id: 'formel', b: 'effekt', t: 1, x: 4, max: 3, req: 0, n: 'Schnelle Formeln', d: (l) => `Abklingzeiten −${8 * l} %`, passive: (l) => ({ cdr: 0.08 * l }) },
  { id: 'flamme', b: 'effekt', t: 1, x: 1, max: 3, req: 0, n: 'Feuerring', d: () => 'Flammenwelle um dich, setzt Gegner in Brand. Auf See: Feuerkugel-Salve', act: { cost: 25, cd: 7, shape: 'nova', el: 'feuer', dmg: (l) => 1.0 + 0.2 * l, radius: 5, status: 'burn', dur: 4, sea: 'salvo' } },
  { id: 'frost', b: 'effekt', t: 1, x: 2, max: 3, req: 0, n: 'Eisdornen', d: (l) => `Gegner vor dir erstarren ${(2.6 + 0.3 * l).toFixed(1).replace('.', ',')} s. Auf See: friert Schiffe ein`, act: { cost: 25, cd: 8, shape: 'cone', el: 'eis', dmg: (l) => 0.8 + 0.15 * l, range: 8, status: 'freeze', dur: 2.8, sea: 'freeze' } },
  { id: 'blitz', b: 'effekt', t: 1, x: 3, max: 3, req: 0, n: 'Kettenblitz', d: (l) => `Springt über bis zu ${4 + l} Gegner. Auf See: Blitzeinschlag`, act: { cost: 25, cd: 7, shape: 'chain', el: 'blitz', dmg: (l) => 1.2 + 0.2 * l, count: 5, range: 14, status: 'stun', dur: 0.6, sea: 'strike' } },
  { id: 'sturm', b: 'effekt', t: 2, x: 4, max: 3, req: 2, needs: ['formel'], n: 'Wirbeldash', d: () => 'Du rast nach vorn und schleuderst Gegner weg. Auf See: Rückenwind und Druckwelle', act: { cost: 20, cd: 6, shape: 'dash', el: 'sturm', dmg: (l) => 0.9 + 0.2 * l, range: 10, status: 'launch', sea: 'wind' } },
  { id: 'erde', b: 'effekt', t: 2, x: 1, max: 3, req: 2, needs: ['flamme'], n: 'Erdstacheln', d: () => 'Stacheln brechen in einer Linie hervor und betäuben', act: { cost: 30, cd: 8, shape: 'spikes', el: 'erde', dmg: (l) => 1.4 + 0.25 * l, range: 12, status: 'stun', dur: 1.2 } },
  { id: 'schatten', b: 'effekt', t: 2, x: 2, max: 3, req: 2, needs: ['frost'], n: 'Schattensprung', d: (l) => `Sprung hinter den nächsten Gegner, kritischer Treffer (${pct(2.2 + 0.3 * (l - 1))})`, act: { cost: 25, cd: 7, shape: 'blink', el: 'schatten', dmg: (l) => 2.2 + 0.3 * (l - 1), count: 1 } },
  { id: 'licht', b: 'effekt', t: 2, x: 3, max: 3, req: 2, needs: ['blitz'], n: 'Heilwelle', d: (l) => `Heilt dich um ${30 + 5 * l} % und deine Crew. Auf See: repariert das Schiff`, act: { cost: 35, cd: 14, shape: 'heal', el: 'licht', dmg: () => 0, heal: 0.35, sea: 'repair' } },
  { id: 'sog', b: 'effekt', t: 2, x: 0, max: 3, req: 3, needs: ['fluss'], n: 'Schwerkraftsog', d: () => 'Zieht Gegner zusammen und lähmt sie kurz', act: { cost: 35, cd: 12, shape: 'pull', el: 'schwerkraft', dmg: (l) => 0.8 + 0.2 * l, radius: 10, status: 'stun', dur: 1.5 } },
  { id: 'gift', b: 'effekt', t: 3, x: 2, max: 3, req: 3, needs: ['schatten'], n: 'Giftwolke', d: () => 'Wolke vor dir, Schaden über Zeit', act: { cost: 30, cd: 10, shape: 'cloud', el: 'gift', dmg: (l) => 0.35 + 0.08 * l, radius: 4, dur: 6, status: 'poison' } },
  { id: 'feuersaeule', b: 'effekt', t: 3, x: 1, max: 3, req: 4, needs: ['erde'], n: 'Feuersäulen', d: (l) => `${3 + l} Flammensäulen brechen um dich aus dem Boden`, act: { cost: 32, cd: 10, shape: 'rain', el: 'feuer', dmg: (l) => 1.1 + 0.2 * l, count: 5, radius: 9, status: 'burn', dur: 3 } },
  { id: 'eissplitter', b: 'effekt', t: 3, x: 3, max: 3, req: 4, needs: ['licht'], n: 'Eissplitter', d: (l) => `Fächer aus ${5 + l} Eisspeeren, verlangsamt`, act: { cost: 22, cd: 6, shape: 'bolt', el: 'eis', dmg: (l) => 0.7 + 0.12 * l, count: 6, range: 20, status: 'slow', dur: 3 } },
  { id: 'flut', b: 'effekt', t: 4, x: 4, max: 3, req: 5, needs: ['sturm'], n: 'Flutwelle', d: () => 'Gewaltiger Rückstoß nach vorn. Auf See: Welle trifft alle Schiffe in der Nähe', act: { cost: 45, cd: 14, shape: 'cone', el: 'flut', dmg: (l) => 1.8 + 0.3 * l, range: 12, status: 'launch', sea: 'wave' } },
  { id: 'donner', b: 'effekt', t: 4, x: 3, max: 2, req: 6, needs: ['eissplitter'], n: 'Donnerkeil', d: (l) => `${4 + 2 * l} Blitze schlagen um dich ein`, act: { cost: 50, cd: 18, shape: 'rain', el: 'blitz', dmg: (l) => 1.6 + 0.3 * l, count: 8, radius: 12, status: 'stun', dur: 0.8, sea: 'strike' } },
  { id: 'schwarzloch', b: 'effekt', t: 4, x: 0, max: 2, req: 6, needs: ['sog'], n: 'Schwarzes Loch', d: () => 'Ein Wirbel, der alles einsaugt und zerquetscht', act: { cost: 55, cd: 22, shape: 'pull', el: 'schwerkraft', dmg: (l) => 2.2 + 0.4 * l, radius: 14, status: 'stun', dur: 2.5, ult: true } },
  { id: 'meteor', b: 'effekt', t: 4, x: 2, max: 2, req: 6, lv: 12, needs: ['gift'], n: 'Meteorregen', d: (l) => `${6 + l} Meteore – an Land wie auf See`, act: { cost: 70, cd: 35, shape: 'rain', el: 'meteor', dmg: (l) => 2.2 + 0.3 * l, count: 7, radius: 14, status: 'burn', dur: 3, ult: true, sea: 'meteor' } },
  { id: 'phoenix', b: 'effekt', t: 4, x: 1, max: 2, req: 7, needs: ['feuersaeule'], n: 'Phönixflügel', d: () => 'Flammenflügel: Feuerdash, der eine brennende Spur hinterlässt', act: { cost: 40, cd: 14, shape: 'dash', el: 'feuer', dmg: (l) => 1.8 + 0.3 * l, range: 14, status: 'burn', dur: 4 } },
  { id: 'elementar', b: 'effekt', t: 5, x: 2, max: 1, req: 9, lv: 15, awaken: true, needs: ['meteor'], n: 'Elementarsturm', d: () => 'Erwacht: Feuer, Eis und Blitz zugleich – Weltuntergang im Kleinen', act: { cost: 95, cd: 60, shape: 'rain', el: 'meteor', dmg: () => 3.5, count: 14, radius: 16, status: 'burn', dur: 5, ult: true, sea: 'meteor' } },

  // ---------- Geistiges Faji ----------
  { id: 'furcht', b: 'geist', t: 1, x: 0, max: 2, req: 0, n: 'Aura der Furcht', d: (l) => `Gegner unter deiner Stufe machen ${12 * l} % weniger Schaden`, passive: (l) => ({ fearWeak: 0.12 * l }) },
  { id: 'blick', b: 'geist', t: 1, x: 1, max: 3, req: 0, n: 'Scharfer Blick', d: (l) => `Krit-Chance +${6 * l} %`, passive: (l) => ({ crit: 0.06 * l }) },
  { id: 'vorahnung', b: 'geist', t: 1, x: 2, max: 2, req: 0, n: 'Vorahnung', d: (l) => `${12 * l} % Chance, Angriffen automatisch auszuweichen`, passive: (l) => ({ dodge: 0.12 * l }) },
  { id: 'quelle', b: 'geist', t: 1, x: 3, max: 3, req: 0, n: 'Faji-Quelle', d: (l) => `Max. Faji +${25 * l}, Faji-Regeneration +${20 * l} %`, passive: (l) => ({ fajiMax: 25 * l, fajiRegen: 0.2 * l }) },
  { id: 'schrei', b: 'geist', t: 1, x: 4, max: 3, req: 0, n: 'Kampfschrei', d: (l) => `Gegner um dich taumeln, Schwache fliehen ${2 + l} s`, act: { cost: 20, cd: 10, shape: 'nova', el: 'geist', dmg: () => 0.3, radius: 7, status: 'fear', dur: 3 } },
  { id: 'herrscher', b: 'geist', t: 2, x: 0, max: 3, req: 2, needs: ['furcht'], n: 'Herrscherwelle', d: () => 'Schwache Gegner fallen ohnmächtig um, alle anderen sind gelähmt. Auf See: Feindschiffe stellen das Feuer ein', act: { cost: 40, cd: 15, shape: 'nova', el: 'geist', dmg: () => 0.5, radius: 10, status: 'stun', dur: 2.5, sea: 'ceasefire' } },
  { id: 'kampfgeist', b: 'geist', t: 2, x: 3, max: 3, req: 2, needs: ['quelle'], n: 'Kampfgeist', d: (l) => `Du und deine Crew: +30 % Schaden für ${7 + l} s. Auf See: schnelleres Nachladen`, act: { cost: 35, cd: 20, shape: 'buff', el: 'geist', dmg: () => 0, dur: 8, buff: { dmgAll: 0.3 }, sea: 'reload' } },
  { id: 'ruf', b: 'geist', t: 2, x: 1, max: 2, req: 3, needs: ['blick'], n: 'Legendärer Ruf', d: (l) => `+${15 * l} % Ruhm aus allen Quellen`, passive: (l) => ({ fame: 0.15 * l }) },
  { id: 'gedankenblick', b: 'geist', t: 2, x: 2, max: 2, req: 3, needs: ['vorahnung'], n: 'Gedankenblick', d: (l) => `Perfekte Parade gelingt viel leichter (+${40 * l} % Zeitfenster)`, passive: (l) => ({ riposte: 0.2 * l }) },
  { id: 'aurastoss', b: 'geist', t: 2, x: 4, max: 3, req: 3, needs: ['schrei'], n: 'Aurastoß', d: (l) => `Unsichtbare Faust aus Willenskraft (${pct(1.6 + 0.3 * l)}) auf ein Ziel`, act: { cost: 22, cd: 6, shape: 'bolt', el: 'geist', dmg: (l) => 1.6 + 0.3 * l, count: 1, range: 18, status: 'stun', dur: 0.8 } },
  { id: 'koenig', b: 'geist', t: 3, x: 0, max: 2, req: 5, lv: 12, needs: ['herrscher'], n: 'Königsdruck', d: () => 'Riesige Aura: Schwache sofort k.o., alle anderen 3,5 s gelähmt. Auf See: alle Schiffe in 160 m erstarren', act: { cost: 80, cd: 45, shape: 'nova', el: 'geist', dmg: () => 1.0, radius: 16, status: 'stun', dur: 3.5, ult: true, sea: 'still' } },
  { id: 'unbeugsam', b: 'geist', t: 3, x: 3, max: 2, req: 6, needs: ['kampfgeist'], n: 'Unbeugsam', d: (l) => `${2 + l} s lang unverwundbar`, act: { cost: 50, cd: 35, shape: 'buff', el: 'licht', dmg: () => 0, dur: 3, buff: { invuln: true } } },
  { id: 'seelenband', b: 'geist', t: 3, x: 1, max: 2, req: 6, needs: ['ruf'], n: 'Seelenband', d: (l) => `${5 * l} % des Schadens heilen dich`, passive: (l) => ({ lifesteal: 0.05 * l }) },
  { id: 'willenskraft', b: 'geist', t: 3, x: 2, max: 3, req: 6, needs: ['gedankenblick'], n: 'Eiserner Wille', d: (l) => `Max. Leben +${10 * l} %, Faji-Regeneration +${10 * l} %`, passive: (l) => ({ hpMax: 0.1 * l, fajiRegen: 0.1 * l }) },
  { id: 'erwachter', b: 'geist', t: 4, x: 2, max: 1, req: 9, lv: 15, awaken: true, needs: ['koenig'], n: 'Erwachter Wille', d: () => 'Erwacht: Deine Aura lässt die Meere schweigen – alle Feinde in 25 m knien nieder', act: { cost: 90, cd: 60, shape: 'nova', el: 'geist', dmg: () => 2.5, radius: 25, status: 'stun', dur: 5, ult: true, sea: 'still' } },
];

export const SK: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/** Synergien zwischen Zweigen: beide Fähigkeiten gelernt → zusätzlicher Effekt */
export interface SynergyDef { id: string; n: string; needs: [string, string]; d: string; effect: 'burnBlade' | 'rockSkin' | 'stormRoll' | 'frostParry' | 'shadowCrit' | 'lightLeech' | 'quakeFist' | 'auraBlade' }

export const SYNERGIES: SynergyDef[] = [
  { id: 'brennklinge', n: 'Brennende Hiebe', needs: ['schaerfe', 'flamme'], d: 'Klingenangriffe setzen Gegner in Brand.', effect: 'burnBlade' },
  { id: 'felsenhaut', n: 'Felsenhaut', needs: ['eisenhaut', 'erde'], d: '+15 % weniger Schaden, Treffer auf dich lassen Steinsplitter fliegen.', effect: 'rockSkin' },
  { id: 'sturmschritt', n: 'Sturmschritt', needs: ['sprint', 'sturm'], d: 'Deine Rolle hinterlässt einen schneidenden Windwirbel.', effect: 'stormRoll' },
  { id: 'frostparade', n: 'Frostparade', needs: ['riposte', 'frost'], d: 'Perfekte Paraden frieren den Angreifer ein.', effect: 'frostParry' },
  { id: 'schattenstich', n: 'Schattenstich', needs: ['blick', 'schatten'], d: 'Kritische Treffer verursachen +40 % Schaden.', effect: 'shadowCrit' },
  { id: 'lichtband', n: 'Lichtband', needs: ['licht', 'seelenband'], d: 'Lebensraub verdoppelt.', effect: 'lightLeech' },
  { id: 'bebenfaust', n: 'Bebenfaust', needs: ['eisenfaust', 'bergbrecher'], d: 'Jeder dritte Faustschlag löst ein kleines Beben aus.', effect: 'quakeFist' },
  { id: 'aurenklinge', n: 'Aurenklinge', needs: ['meister', 'kampfgeist'], d: 'Kombo-Finisher senden eine Aura-Welle aus.', effect: 'auraBlade' },
];

export const EMPTY_PASSIVES: Passives = {
  dmgFist: 0, dmgBlade: 0, dmgAll: 0, dmgSkill: 0, reduce: 0, speed: 0, rollCd: 0, crit: 0, dodge: 0, fajiMax: 0, fajiRegen: 0, cdr: 0, fame: 0,
  reach: 0, lifesteal: 0, fearWeak: 0, riposte: 0, secondWind: 0, rage: 0, hpMax: 0, poise: 0,
};

/** Summe aller passiven Boni aus gelernten Fähigkeiten und Synergien */
export function computePassives(learned: Record<string, number>): { p: Passives; synergies: SynergyDef[] } {
  const p: Passives = { ...EMPTY_PASSIVES };
  for (const [id, lv] of Object.entries(learned)) {
    const s = SK[id];
    if (!s || !s.passive || lv <= 0) continue;
    for (const [k, v] of Object.entries(s.passive(lv))) (p as any)[k] += v;
  }
  const synergies = SYNERGIES.filter((sy) => (learned[sy.needs[0]] ?? 0) > 0 && (learned[sy.needs[1]] ?? 0) > 0);
  if (synergies.some((s) => s.effect === 'rockSkin')) p.reduce += 0.15;
  return { p, synergies };
}

export function branchPoints(learned: Record<string, number>, b: Branch) {
  return SKILLS.filter((s) => s.b === b).reduce((a, s) => a + (learned[s.id] ?? 0), 0);
}

export type LearnBlock = null | 'max' | 'points' | 'branch' | 'level' | 'needs' | 'awaken';

/** Warum (noch) nicht lernbar? null = lernbar */
export function learnBlock(s: SkillDef, learned: Record<string, number>, sp: number, level: number, awakened: Branch[]): LearnBlock {
  if ((learned[s.id] ?? 0) >= s.max) return 'max';
  if (s.awaken && !awakened.includes(s.b)) return 'awaken';
  if (s.lv && level < s.lv) return 'level';
  if (branchPoints(learned, s.b) < s.req) return 'branch';
  if (s.needs?.some((n) => (learned[n] ?? 0) <= 0)) return 'needs';
  if (sp <= 0) return 'points';
  return null;
}

/** Hintere Wortteile, an denen lange Namen für die runden Knöpfe getrennt werden („Ketten-\nblitz“) */
const SECOND_WORDS = ['faust', 'haut', 'schritt', 'kraft', 'brecher', 'leib', 'schlag', 'form', 'panzer', 'schärfe', 'meister', 'wind', 'ziehen', 'klinge', 'rausch', 'schnitt', 'sichel', 'spalter', 'sturm', 'ring', 'dornen', 'blitz', 'dash', 'stacheln', 'sprung', 'welle', 'sog', 'wolke', 'säulen', 'splitter', 'keil', 'regen', 'flügel', 'schrei', 'geist', 'blick', 'stoß', 'druck', 'band', 'parade', 'stich', 'ahnung', 'gewalt', 'fluss', 'quelle', 'ruf', 'wille'];

/** Kurzform eines Fähigkeitsnamens für kleine Knöpfe: höchstens zwei Zeilen */
export function shortLabel(name: string): string {
  if (name.includes(' ')) return name.replace(' ', '\n');
  const dash = name.indexOf('-');
  if (dash > 0) return `${name.slice(0, dash + 1)}\n${name.slice(dash + 1)}`;
  if (name.length <= 8) return name;
  const low = name.toLowerCase();
  const hit = SECOND_WORDS.filter((w) => low.endsWith(w) && name.length - w.length >= 3).sort((a, b) => b.length - a.length)[0];
  const cut = hit ? name.length - hit.length : Math.ceil(name.length / 2);
  return `${name.slice(0, cut)}-\n${name.slice(cut)}`;
}
