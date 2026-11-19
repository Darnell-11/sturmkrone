// Ausrüstungs-Katalog: Sets von der einfachen Arbeitskluft bis zur legendären Rüstung. Jedes Set besteht aus bis zu sieben
// Stücken (Kopf, Schultern, Oberkörper, Umhang, Hände, Beine, Füße). Die Stücke setzen sich aus Hüllen (Stoff, Leder, Stahl
// mit Borten und Mustern) und starren Teilen zusammen; Farben sind färbbar (Palette: Haupt- und Zierfarbe).
// Neues Set: unten in SETS eintragen – Werte, Preise, Namen und Beschreibungen entstehen daraus.
import type { EquipDef, EquipPart, GearBonus, GearCat, ShellLook, Tint } from './equipment';
import type { TopUnder } from '../entities/character/vroid';
import type { Hat } from './characterParts';
import type { Rarity } from './rarity';

type Finish = NonNullable<ShellLook['finish']>;
const L = (finish: Finish, o: Omit<ShellLook, 'finish'> = {}): ShellLook => ({ finish, ...o });
const sh = (garment: Extract<EquipPart, { type: 'shell' }>['garment'], tint: Tint, look?: ShellLook): EquipPart => ({ type: 'shell', garment, tint, look });
const cape = (len: 'kurz' | 'lang' | 'schlepp', tint: Tint, look?: ShellLook): EquipPart => ({ type: 'cape', len, tint, look });
const rigid = (build: string, tint?: Tint, tint2?: Tint): EquipPart => ({ type: 'rigid', build, tint, tint2 });
const helm = (hat: string, tint: Tint = 'item', tint2: Tint = 'item2'): EquipPart => ({ type: 'hat', hat: hat as Hat, tint, tint2 });
const boots = (look: ShellLook, tint: Tint = 'item'): EquipPart[] => [{ type: 'base', slot: 'shoes' }, sh('stiefel', tint, look)];
const LINEN = '#EDE6D6';

/** Ein Stück eines Sets */
interface Piece {
  n: string;
  parts: EquipPart[];
  top?: TopUnder;
  coat?: 'kurz' | 'lang';
  slimUnder?: boolean;
  /** Zusatzwert des Stücks (zusätzlich zur Grundverteilung) */
  extra?: GearBonus;
  d?: string;
}

export interface GearSet {
  id: string;
  n: string;
  rarity: Rarity;
  level: number;
  /** Hauptfarbe und Zierfarbe ab Werk */
  palette: [string, string];
  /** Kurzbeschreibung des Stils */
  d: string;
  pieces: Partial<Record<GearCat, Piece>>;
  /** Setbonus ab 3 und ab allen Stücken */
  bonus3: GearBonus;
  bonusAll: GearBonus;
  /** Nur aus Raids: fällt nie aus zufälliger Beute, taucht in keinem Laden auf und wird nur von Endbossen getragen (raid/raidLoot.ts) */
  raid?: boolean;
}

/** Modell aus Blender (public/models/gear/<name>.glb): Rollen im Modell → Oberfläche und Farbe */
const glb = (model: string, roles: Record<string, [Finish, Tint]>, o: { mode?: 'skinned' | 'bone' | 'foot'; bone?: string; maskAs?: Extract<EquipPart, { type: 'shell' }>['garment']; hidesHair?: boolean; trimsHair?: boolean } = {}): EquipPart => ({
  type: 'glb', model, mode: o.mode ?? 'skinned', bone: o.bone, maskAs: o.maskAs, hidesHair: o.hidesHair, trimsHair: o.trimsHair,
  roles: Object.fromEntries(Object.entries(roles).map(([k, [finish, tint]]) => [k, { finish, tint }])),
});
const held = (model: string, hand: 'r' | 'l', roles: Record<string, [Finish, Tint]>): EquipPart => ({
  type: 'held', model, hand, roles: Object.fromEntries(Object.entries(roles).map(([k, [finish, tint]]) => [k, { finish, tint }])),
});


/** Waffen und Köpfe der Raid-Endbosse (public/models/bosses/, tools/blender/build_bosse.py): alle Rollen mit Standardfarben, `item` und `item2` kommen aus der Palette des Sets */
const bossHeld = (model: string, hand: 'r' | 'l', o: Partial<Record<string, [Finish, Tint]>> = {}): EquipPart => held(`bosses/${model}`, hand, {
  steel: ['stahl', '#C9D2DA'], gold: ['gold', 'item2'], leather: ['leder', '#2E1C10'], dark: ['dunkelstahl', '#33343C'], cloth: ['stoff', 'item'], glow: ['glut', '#8FD8FF'], main: ['stahl', '#C9D2DA'], ...o,
} as Record<string, [Finish, Tint]>);
const bossHead = (model: string, roles: Record<string, [Finish, Tint]>): EquipPart => glb(`bosses/${model}`, roles, { mode: 'bone', bone: 'J_Bip_C_Head', trimsHair: true });
const BOSS_LV = 42;
/** Kabuto mit Mondzier: gemeinsames Teil der Schuppenwache und der Mondwacht-Ronin */
const KABUTO_MOND = glb('helm_kabuto2', { dark: ['dunkelstahl', 'item'], gold: ['gold', 'item2'], main: ['leder', '#7A1F2E'] }, { mode: 'bone', bone: 'J_Bip_C_Head', trimsHair: true });

export const SETS: GearSet[] = [
  // =========================== GEWÖHNLICH ===========================
  {
    id: 'hafen', n: 'Hafenarbeiter', rarity: 'gewoehnlich', level: 1, palette: ['#8A6A44', '#D8C8A0'], d: 'Robuste Kluft aus Segeltuch und Leder – wer am Kai arbeitet, trägt sie jeden Tag.',
    pieces: {
      head: { n: 'Hafenmütze', parts: [helm('muetze', 'item')] },
      chest: { n: 'Arbeitsweste', top: 'eng', parts: [sh('hemd', LINEN), sh('weste', 'item', L('leder', { trim: 'item2', trimW: 0.010, pattern: 'nieten', patColor: 'item2', patSize: 0.03 }))] },
      legs: { n: 'Segeltuchhose', parts: [sh('hose', '#6A5A48', L('stoff', { pattern: 'steppung', patSize: 0.02 })), sh('guertel', '#4A3322', L('leder')), rigid('schnalle')] },
      feet: { n: 'Hafenstiefel', parts: boots(L('leder', { trim: 'item2', trimW: 0.010 }), '#5A3A22') },
      hands: { n: 'Arbeitshandschuhe', parts: [sh('handschuhe', '#7A5A38', L('leder', { trim: 'item2', trimW: 0.008 }))] },
    },
    bonus3: { hp: 40 }, bonusAll: { gold: 0.05, hp: 60 },
  },
  {
    id: 'kueste', n: 'Küstenwache', rarity: 'gewoehnlich', level: 6, palette: ['#4A6A8A', '#C8D0D8'], d: 'Gesteppter Waffenrock und ein schlichter Eisenhut für die Streife am Strand.',
    pieces: {
      head: { n: 'Wachkappe', parts: [helm('helm_kappe', '#8A939C', 'item2')] },
      chest: { n: 'Gesteppter Waffenrock', top: 'tunika', parts: [sh('tunika', 'item', L('stoff', { pattern: 'steppung', patSize: 0.024, trim: 'item2', trimW: 0.014, trimStyle: 1 }))] },
      legs: { n: 'Wachrock und Hose', parts: [sh('hose', '#3A4250'), sh('kilt', 'item', L('leder', { trim: 'item2', trimW: 0.012 })), sh('guertel', '#3A2A1E', L('leder')), rigid('schnalle')] },
      feet: { n: 'Streifenstiefel', parts: boots(L('leder', { trim: 'item2', trimW: 0.012 }), '#2A2420') },
      hands: { n: 'Wachhandschuhe', parts: [sh('handschuhe', '#3A3026', L('leder', { trim: 'item2', trimW: 0.010 })), sh('armschiene', '#6A4526', L('leder', { trim: 'item2', trimW: 0.008 }))] },
      shoulder: { n: 'Lederne Schulterklappen', parts: [rigid('schulter_leder', '#6A4526', 'item2')] },
    },
    bonus3: { hp: 60, reduce: 0.02 }, bonusAll: { reduce: 0.04, hp: 80 },
  },
  // =========================== SELTEN ===========================
  {
    id: 'kette', n: 'Kettenjäger', rarity: 'selten', level: 12, palette: ['#8A9298', '#3E6B3A'], d: 'Kettenhemd unter grünem Jägermantel: leise, zäh und schnell im Unterholz.',
    pieces: {
      head: { n: 'Jägerhaube', parts: [glb('helm_kapuze2', { main: ['stoff', '#3E5A36'], trim: ['leder', '#6A5A3A'] }, { mode: 'bone', bone: 'J_Bip_C_Head' })] },
      chest: { n: 'Kettenhemd', top: 'tunika', parts: [sh('tunika', 'item', L('stahl', { pattern: 'kette', patSize: 0.0065, trim: '#3A2A1E', trimW: 0.010 })), sh('kragen', 'item', L('stahl', { pattern: 'kette', patSize: 0.0065 }))] },
      legs: { n: 'Kettenschurz', parts: [sh('hose', '#3A3F36'), sh('kilt', 'item', L('stahl', { pattern: 'kette', patSize: 0.0065, trim: 'item2', trimW: 0.012 })), sh('guertel', '#4A3322', L('leder')), rigid('guertel_taschen', '#5A3A22', 'item2'), rigid('schnalle')] },
      feet: { n: 'Jägerstiefel', parts: boots(L('leder', { trim: 'item2', trimW: 0.012, trimStyle: 1 }), '#4A3322') },
      hands: { n: 'Kettenhandschuhe', parts: [sh('handschuhe', 'item', L('stahl', { pattern: 'kette', patSize: 0.0055 })), sh('armschiene', '#5A3A22', L('leder', { trim: 'item2', trimW: 0.008, pattern: 'nieten', patColor: '#C9A13B', patSize: 0.03 }))] },
      shoulder: { n: 'Jäger-Schulterklappen', parts: [rigid('schulter_leder', '#5A3A22', '#C9A13B')] },
      cloak: { n: 'Jägerumhang', parts: [cape('kurz', 'item2', L('stoff', { trim: '#2A3A28', trimW: 0.02, trimStyle: 2 }))] },
    },
    bonus3: { crit: 0.03, hp: 60 }, bonusAll: { crit: 0.06, atk: 0.04 },
  },
  {
    id: 'sturmleder', n: 'Sturmleder', rarity: 'selten', level: 15, palette: ['#6A4A32', '#B8A070'], d: 'Genietetes Leder, Pelz an den Schultern und ein Helm mit Hörnern – wetterfest bis in die Knochen.',
    pieces: {
      head: { n: 'Hörnerhelm', parts: [glb('helm_hoerner2', { steel: ['stahl', '#8A8F96'], gold: ['gold', '#CDBA8A'], trim: ['stoff', '#E8E0D0'], cloth: ['stoff', '#6A5848'] }, { mode: 'bone', bone: 'J_Bip_C_Head', trimsHair: true })] },
      chest: { n: 'Genietetes Lederwams', top: 'jacke', parts: [sh('jacke', 'item', L('leder', { pattern: 'nieten', patColor: 'item2', patSize: 0.028, trim: 'item2', trimW: 0.012, trimStyle: 1 }))] },
      legs: { n: 'Pelzbesetzter Rock', parts: [sh('hose', '#3A2E24'), sh('kilt', 'item', L('leder', { trim: 'item2', trimW: 0.016, trimStyle: 2 })), sh('guertel', '#2A2018', L('leder', { pattern: 'nieten', patColor: 'item2', patSize: 0.03 })), rigid('guertel_ketten', undefined, 'item2'), rigid('schnalle')] },
      feet: { n: 'Pelzstiefel', parts: boots(L('leder', { trim: '#E8E0D0', trimW: 0.03, trimStyle: 2 }), 'item') },
      hands: { n: 'Genietete Armschienen', parts: [sh('handschuhe', '#5A3E28', L('leder')), sh('armschiene', 'item', L('leder', { pattern: 'nieten', patColor: 'item2', patSize: 0.026, trim: 'item2', trimW: 0.008 }))] },
      shoulder: { n: 'Pelzschultern', parts: [rigid('schulter_fell', '#6A5848', 'item2')] },
      cloak: { n: 'Wolfspelzumhang', parts: [cape('lang', '#5A4838', L('stoff', { trim: '#E8E0D0', trimW: 0.035, trimStyle: 2 }))] },
    },
    bonus3: { atk: 0.04, hp: 80 }, bonusAll: { atk: 0.08, reduce: 0.03 },
  },
  {
    id: 'marine', n: 'Marinegarde', rarity: 'selten', level: 18, palette: ['#1B3A6B', '#E3B04B'], d: 'Paradeuniform der Garde: Gold auf Nachtblau, makellos gebügelt.',
    pieces: {
      head: { n: 'Gardistenhut', parts: [{ type: 'hat', hat: 'zweispitz' as Hat, tint: 'item', tint2: 'item2' }] },
      chest: { n: 'Gardeuniform', top: 'uniform', parts: [sh('uniform', 'item', L('stoff', { trim: 'item2', trimW: 0.012, trimStyle: 1, pattern: 'streifen', patColor: 'item2', patSize: 0.03 })), sh('kragen', 'item', L('stoff', { trim: 'item2', trimW: 0.010 }))] },
      legs: { n: 'Paradehose', parts: [sh('hose', '#F2F0EA', L('stoff', { trim: '#1B3A6B', trimW: 0.012 })), sh('guertel', '#1E1A20', L('leder')), rigid('schnalle')] },
      feet: { n: 'Paradestiefel', parts: boots(L('leder', { trim: 'item2', trimW: 0.016, trimStyle: 1 }), '#17151A') },
      hands: { n: 'Paradehandschuhe', parts: [sh('handschuhe', '#F4F1E8', L('seide', { trim: 'item2', trimW: 0.008 }))] },
      shoulder: { n: 'Epauletten', parts: [rigid('schulter_gold', 'item', 'item2')] },
      cloak: { n: 'Gardemantel', parts: [cape('kurz', 'item', L('seide', { trim: 'item2', trimW: 0.022, trimStyle: 1 }))] },
    },
    bonus3: { faji: 0.1, hp: 60 }, bonusAll: { faji: 0.2, reduce: 0.04, gold: 0.05 },
  },
  // =========================== MODELLE AUS BLENDER ===========================
  {
    id: 'kapitaen', n: 'Piratenkapitän', rarity: 'selten', level: 14, palette: ['#6A1E24', '#E3B04B'], d: 'Langer Gehrock mit Kragen und Schulterklappen, Dreispitz, Stulpenstiefel und ein verziertes Entermesser: ein Kapitän, wie man ihn auf jedem Meer erkennt.',
    pieces: {
      head: { n: 'Kapitänsdreispitz', parts: [glb('dreispitz', { dark: ['stoff', '#1A1618'], trim: ['gold', 'item2'], leather: ['leder', '#3A2A1E'], gold: ['gold', 'item2'], cloth: ['stoff', '#F2F0EA'] }, { mode: 'bone', bone: 'J_Bip_C_Head', trimsHair: true })] },
      chest: { n: 'Kapitäns-Gehrock', coat: 'lang', parts: [glb('gehrock', { main: ['stoff', 'item'], trim: ['seide', 'item2'], gold: ['gold', 'item2'], cloth: ['stoff', '#E8E2D2'] })] },   // keine Maske: der Zuschnitt des Modells deckt anders als die Hülle „Mantel“, die Maske risse Löcher in Weste und Haut
      legs: { n: 'Kapitänshose', parts: [glb('stoffhose_stiefel', { main: ['stoff', '#2A2A36'], trim: ['leder', '#2E1C10'], leather: ['leder', '#2E1C10'] }, { maskAs: 'hose' }), rigid('schnalle')] },
      feet: { n: 'Piraten-Stulpenstiefel', parts: [glb('stulpenstiefel', { main: ['leder', '#4A2E1C'], trim: ['leder', '#6A4426'], leather: ['leder', '#2E1C10'], dark: ['leder', '#1A1410'], gold: ['gold', '#E3B04B'] }, { maskAs: 'stiefel' })] },
      mainhand: { n: 'Verziertes Entermesser', parts: [held('entermesser', 'r', { steel: ['stahl', '#C9D2DA'], gold: ['gold', 'item2'], leather: ['leder', '#2E1C10'], main: ['stahl', '#C9D2DA'] })] },
      offhand: { n: 'Parierdolch', parts: [held('parierdolch', 'l', { steel: ['stahl', '#C9D2DA'], gold: ['gold', 'item2'], leather: ['leder', '#2E1C10'], main: ['stahl', '#C9D2DA'] })] },
    },
    bonus3: { atk: 0.04, crit: 0.03 }, bonusAll: { atk: 0.08, crit: 0.06, gold: 0.1 },
  },
  {
    id: 'strand', n: 'Strandläufer', rarity: 'gewoehnlich', level: 3, palette: ['#C9B48A', '#6A8A9A'], d: 'Leichte Leinenhose mit Faltenwurf und offene Riemen-Sandalen – für alle, die lieber barfuß am Wasser sind als an Deck.',
    pieces: {
      legs: { n: 'Leinenhose', parts: [glb('stoffhose', { main: ['stoff', 'item'], trim: ['stoff', 'item2'], leather: ['leder', '#5A3A22'] })] },
      feet: { n: 'Riemen-Sandalen', parts: [glb('sandalen', { leather: ['leder', '#4A3220'], main: ['leder', '#6A4526'], skin: ['haut', 'skin'], gold: ['gold', '#E3B04B'] }, { mode: 'foot' })] },
    },
    bonus3: { hp: 20 }, bonusAll: { hp: 40, gold: 0.03 },
  },
  // =========================== EPISCH ===========================
  {
    id: 'eisenwall', n: 'Eisenwall', rarity: 'episch', level: 28, palette: ['#A3ACB6', '#C8302A'], d: 'Schwere Plattenrüstung mit Stachelschultern – wer sie trägt, wird zur Mauer.',
    pieces: {
      head: { n: 'Eisenwall-Helm', parts: [glb('helm_ritter2', { steel: ['stahl', 'item'], gold: ['gold', '#C9A13B'], trim: ['seide', 'item2'] }, { mode: 'bone', bone: 'J_Bip_C_Head', trimsHair: true })] },
      chest: { n: 'Eisenwall-Plattenpanzer', top: 'jacke', parts: [sh('jacke', '#2E2428', L('leder', { pattern: 'steppung', patSize: 0.02 })), sh('kuerass', 'item', L('stahl', { pattern: 'platten', patSize: 0.034, trim: 'item2', trimW: 0.012, trimStyle: 1 })), sh('kragen', 'item', L('stahl', { trim: 'item2', trimW: 0.008 }))] },
      legs: { n: 'Eisenwall-Beinzeug', parts: [sh('hose', '#2E2428'), sh('kilt', 'item', L('stahl', { pattern: 'platten', patSize: 0.034, trim: 'item2', trimW: 0.012 })), sh('beinschiene', 'item', L('stahl', { trim: 'item2', trimW: 0.008 })), sh('guertel', '#2A1E1A', L('leder', { pattern: 'nieten', patColor: '#C9A13B', patSize: 0.03 })), rigid('schnalle')] },
      feet: { n: 'Eisenwall-Stiefel', parts: boots(L('stahl', { trim: 'item2', trimW: 0.010, pattern: 'platten', patSize: 0.03 }), 'item') },
      hands: { n: 'Eisenwall-Panzerhandschuhe', parts: [sh('handschuhe', 'item', L('stahl', { trim: 'item2', trimW: 0.006 })), sh('armschiene', 'item', L('stahl', { pattern: 'platten', patSize: 0.03, trim: 'item2', trimW: 0.008 }))] },
      shoulder: { n: 'Eisenwall-Schulterlamellen', parts: [glb('schulter_lamellen2', { steel: ['stahl', 'item'], main: ['dunkelstahl', '#3A3F48'], gold: ['gold', '#C9A13B'] })] },
      cloak: { n: 'Eisenwall-Umhang', parts: [cape('lang', 'item2', L('stoff', { trim: '#E3B04B', trimW: 0.018, trimStyle: 1 }))] },
    },
    bonus3: { reduce: 0.05, hp: 120 }, bonusAll: { reduce: 0.10, hp: 220 },
  },
  {
    id: 'seekoenig', n: 'Seekönig', rarity: 'episch', level: 32, palette: ['#7A1F2E', '#E3B04B'], d: 'Brokatmantel, Goldkrone und eine Schleppe, die über die Planken fegt – die Kleidung eines, der Meere besitzt.',
    pieces: {
      head: { n: 'Königskrone', parts: [glb('helm_krone2', { gold: ['gold', 'item2'], trim: ['gold', '#F0D890'], glow: ['glut', '#3FD0E0'], cloth: ['stoff', '#F4F0E6'], main: ['seide', 'item'] }, { mode: 'bone', bone: 'J_Bip_C_Head', trimsHair: true })] },
      chest: { n: 'Brokatmantel des Seekönigs', top: 'eng', coat: 'lang', slimUnder: true, parts: [sh('hemd', LINEN), sh('mantelLang', 'item', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.022, trim: 'item2', trimW: 0.022, trimStyle: 1 })), sh('kragen', 'item', L('seide', { trim: 'item2', trimW: 0.012 }))] },
      legs: { n: 'Prunkhose mit Schärpe', parts: [sh('hose', '#1E1A20', L('seide', { trim: 'item2', trimW: 0.010 })), sh('kilt', 'item', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.022, trim: 'item2', trimW: 0.016, trimStyle: 1 })), sh('guertel', 'item2', L('gold')), rigid('schnalle')] },
      feet: { n: 'Königsstiefel', parts: boots(L('leder', { trim: 'item2', trimW: 0.022, trimStyle: 1 }), '#1E1A20') },
      hands: { n: 'Königshandschuhe', parts: [sh('handschuhe', '#1E1A20', L('seide', { trim: 'item2', trimW: 0.010 })), sh('armschiene', 'item2', L('gold', { trim: 'item', trimW: 0.006 }))] },
      shoulder: { n: 'Goldene Prunkschultern', parts: [glb('schulter_lamellen2', { steel: ['gold', 'item2'], main: ['seide', 'item'], gold: ['gold', '#F0D890'] })] },
      cloak: { n: 'Schleppe des Seekönigs', parts: [cape('schlepp', 'item', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.026, trim: 'item2', trimW: 0.03, trimStyle: 1 }))] },
    },
    bonus3: { gold: 0.15, hp: 100 }, bonusAll: { gold: 0.3, atk: 0.08, crit: 0.04 },
  },
  {
    id: 'schuppen', n: 'Schuppenwache', rarity: 'episch', level: 35, palette: ['#3A4A5A', '#C9A13B'], d: 'Dunkle Schuppenpanzer und ein Kabuto mit Mondzier, geschmiedet in den Werften des Ostens.',
    pieces: {
      head: { n: 'Mondzier-Kabuto', parts: [KABUTO_MOND] },
      chest: { n: 'Schuppenpanzer', top: 'tunika', parts: [sh('tunika', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.018, patColor: 'item2', trim: 'item2', trimW: 0.012, trimStyle: 1 })), sh('kragen', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.018, patColor: 'item2', trim: 'item2', trimW: 0.008 }))] },
      legs: { n: 'Schuppenschurz', parts: [sh('hose', '#22262C'), sh('kilt', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.018, patColor: 'item2', trim: 'item2', trimW: 0.012 })), sh('beinschiene', 'item', L('dunkelstahl', { trim: 'item2', trimW: 0.008 })), sh('guertel', 'item2', L('seide')), rigid('guertel_schwerttasche', '#2A2018', 'item2')] },
      feet: { n: 'Schuppenstiefel', parts: boots(L('dunkelstahl', { pattern: 'schuppen', patSize: 0.016, patColor: 'item2', trim: 'item2', trimW: 0.008 }), 'item') },
      hands: { n: 'Schuppenhandschuhe', parts: [sh('handschuhe', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.012, patColor: 'item2' })), sh('armschiene', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.014, patColor: 'item2', trim: 'item2', trimW: 0.008 }))] },
      shoulder: { n: 'Schuppenschulterplatten', parts: [glb('schulter_lamellen2', { steel: ['dunkelstahl', 'item'], main: ['leder', '#7A1F2E'], gold: ['gold', 'item2'] })] },
      cloak: { n: 'Banner-Umhang', parts: [cape('kurz', '#7A1F2E', L('stoff', { trim: 'item2', trimW: 0.02, trimStyle: 1 }))] },
    },
    bonus3: { atk: 0.05, reduce: 0.03 }, bonusAll: { atk: 0.1, reduce: 0.07, crit: 0.03 },
  },
  {
    id: 'nebel', n: 'Nebelwandler', rarity: 'episch', level: 38, palette: ['#2F4A44', '#8FD0B8'], d: 'Schwere Stoffe in Graugrün, Kapuze tief im Gesicht: sie gehen lautlos durch den Nebel.',
    pieces: {
      head: { n: 'Nebelkapuze', parts: [glb('helm_kapuze2', { main: ['stoff', 'item'], trim: ['leder', 'item2'] }, { mode: 'bone', bone: 'J_Bip_C_Head' })] },
      chest: { n: 'Nebelmantel', top: 'tunika', coat: 'lang', parts: [sh('tunika', '#26302E', L('stoff', { pattern: 'steppung', patSize: 0.022 })), sh('mantelLang', 'item', L('stoff', { trim: 'item2', trimW: 0.016, trimStyle: 2 })), sh('kragen', 'item', L('stoff', { trim: 'item2', trimW: 0.010 }))] },
      legs: { n: 'Wanderhose', parts: [sh('hose', '#26302E', L('stoff', { pattern: 'steppung', patSize: 0.02 })), sh('guertel', '#3A3026', L('leder')), rigid('guertel_taschen', '#3A3026', 'item2'), rigid('schnalle')] },
      feet: { n: 'Nebelstiefel', parts: boots(L('leder', { trim: 'item2', trimW: 0.014, trimStyle: 2 }), '#2A2824') },
      hands: { n: 'Wandererhandschuhe', parts: [sh('handschuhe', '#2A2824', L('leder', { trim: 'item2', trimW: 0.008 })), sh('armschiene', '#3A3026', L('leder', { pattern: 'nieten', patColor: 'item2', patSize: 0.03 }))] },
      shoulder: { n: 'Moosbesetzte Schulter', parts: [rigid('schulter_fell', 'item', 'item2')] },
      cloak: { n: 'Nebelumhang', parts: [cape('lang', 'item', L('stoff', { trim: 'item2', trimW: 0.028, trimStyle: 2 }))] },
    },
    bonus3: { faji: 0.12, crit: 0.03 }, bonusAll: { faji: 0.25, crit: 0.06, reduce: 0.04 },
  },
  // =========================== LEGENDÄR ===========================
  {
    id: 'drache', n: 'Drachenpanzer', rarity: 'legendaer', level: 50, palette: ['#4A1E22', '#F0A830'], d: 'Aus den Schuppen eines Meereswyrms geschmiedet. Die Hörner glühen noch.',
    pieces: {
      head: { n: 'Drachenhelm', parts: [glb('helm_drache2', { main: ['dunkelstahl', 'item'], steel: ['stahl', '#9AA2AA'], gold: ['gold', 'item2'], glow: ['glut', 'item2'] }, { mode: 'bone', bone: 'J_Bip_C_Head', trimsHair: true })] },
      chest: { n: 'Drachenschuppenpanzer', top: 'jacke', parts: [sh('jacke', '#1E1416', L('leder', { pattern: 'steppung', patSize: 0.02 })), sh('kuerass', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.02, patColor: 'item2', trim: 'item2', trimW: 0.014, trimStyle: 1 })), sh('kragen', 'item2', L('gold', { trim: 'item', trimW: 0.008 }))] },
      legs: { n: 'Drachenschuppenschurz', parts: [sh('hose', '#1E1416'), sh('kilt', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.02, patColor: 'item2', trim: 'item2', trimW: 0.016, trimStyle: 1 })), sh('beinschiene', 'item', L('dunkelstahl', { trim: 'item2', trimW: 0.010 })), sh('guertel', 'item2', L('gold')), rigid('schnalle')] },
      feet: { n: 'Drachenklauenstiefel', parts: boots(L('dunkelstahl', { pattern: 'schuppen', patSize: 0.018, patColor: 'item2', trim: 'item2', trimW: 0.012, trimStyle: 1 }), 'item') },
      hands: { n: 'Drachenpranken', parts: [sh('handschuhe', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.012, patColor: 'item2', trim: 'item2', trimW: 0.006 })), sh('armschiene', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.016, patColor: 'item2', trim: 'item2', trimW: 0.010, trimStyle: 1 }))] },
      shoulder: { n: 'Drachenschwingen-Schultern', parts: [glb('schulter_drache3', { main: ['dunkelstahl', 'item'], steel: ['dunkelstahl', '#2A2024'], gold: ['gold', 'item2'], glow: ['glut', 'item2'] })] },
      cloak: { n: 'Drachenhaut-Umhang', parts: [cape('lang', 'item', L('seide', { pattern: 'schuppen', patSize: 0.03, patColor: 'item2', trim: 'item2', trimW: 0.028, trimStyle: 2 }))] },
    },
    bonus3: { atk: 0.08, hp: 150 }, bonusAll: { atk: 0.16, hp: 320, reduce: 0.06, crit: 0.05 },
  },
  {
    id: 'sturmkrone', n: 'Sturmgeborene', rarity: 'legendaer', level: 60, palette: ['#E8EDF4', '#E3B04B'], d: 'Weißes Silber, gerahmt von Gold: die Rüstung derer, die die Sturmkrone tragen dürfen.',
    pieces: {
      head: { n: 'Sturmkrone', parts: [glb('helm_krone2', { gold: ['gold', 'item2'], trim: ['stahl', 'item'], glow: ['glut', '#7FD8FF'], cloth: ['stoff', '#F4F8FF'], main: ['seide', '#2A3A5A'] }, { mode: 'bone', bone: 'J_Bip_C_Head', trimsHair: true })] },
      chest: { n: 'Sturmgeborener Brustpanzer', top: 'jacke', parts: [sh('jacke', '#2A3A5A', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.02 })), sh('kuerass', 'item', L('stahl', { pattern: 'platten', patSize: 0.036, trim: 'item2', trimW: 0.016, trimStyle: 1 })), sh('kragen', 'item', L('stahl', { trim: 'item2', trimW: 0.010 }))] },
      legs: { n: 'Sturmgeborene Beinplatten', parts: [sh('hose', '#2A3A5A', L('seide')), sh('kilt', 'item', L('stahl', { pattern: 'platten', patSize: 0.036, trim: 'item2', trimW: 0.016, trimStyle: 1 })), sh('beinschiene', 'item', L('stahl', { trim: 'item2', trimW: 0.010 })), sh('guertel', 'item2', L('gold')), rigid('schnalle')] },
      feet: { n: 'Sturmgeborene Stiefel', parts: boots(L('stahl', { trim: 'item2', trimW: 0.014, trimStyle: 1, pattern: 'platten', patSize: 0.03 }), 'item') },
      hands: { n: 'Sturmgeborene Handschuhe', parts: [sh('handschuhe', 'item', L('stahl', { trim: 'item2', trimW: 0.008 })), sh('armschiene', 'item', L('stahl', { pattern: 'platten', patSize: 0.03, trim: 'item2', trimW: 0.012, trimStyle: 1 }))] },
      shoulder: { n: 'Sturmschwingen', parts: [glb('schulter_fluegel3', { steel: ['stahl', 'item'], main: ['gold', 'item2'], gold: ['gold', 'item2'], cloth: ['seide', '#F4F8FF'], glow: ['glut', '#7FD8FF'] })] },
      cloak: { n: 'Sturmmantel', parts: [cape('schlepp', '#2A3A5A', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.028, trim: 'item2', trimW: 0.034, trimStyle: 1 }))] },
    },
    bonus3: { atk: 0.1, faji: 0.15 }, bonusAll: { atk: 0.2, faji: 0.3, hp: 300, crit: 0.08, reduce: 0.08 },
  },
  {
    id: 'abgrund', n: 'Abgrundwächter', rarity: 'legendaer', level: 55, palette: ['#2A2038', '#B070FF'], d: 'Schwarzer Stahl, durchzogen von violettem Licht – gefunden dort, wo kein Licht mehr hinfällt.',
    pieces: {
      head: { n: 'Abgrundreif', parts: [glb('helm_engel2', { gold: ['dunkelstahl', 'item'], glow: ['glut', 'item2'], trim: ['seide', '#17121F'], cloth: ['seide', '#2A2038'], steel: ['dunkelstahl', 'item'] }, { mode: 'bone', bone: 'J_Bip_C_Head' })] },
      chest: { n: 'Abgrundpanzer', top: 'jacke', parts: [sh('jacke', '#17121F', L('seide')), sh('kuerass', 'item', L('dunkelstahl', { pattern: 'platten', patSize: 0.034, trim: 'item2', trimW: 0.012, trimStyle: 1 })), sh('kragen', 'item', L('dunkelstahl', { trim: 'item2', trimW: 0.008 }))] },
      legs: { n: 'Abgrundschurz', parts: [sh('hose', '#17121F', L('seide')), sh('kilt', 'item', L('dunkelstahl', { pattern: 'platten', patSize: 0.034, trim: 'item2', trimW: 0.012 })), sh('beinschiene', 'item', L('dunkelstahl', { trim: 'item2', trimW: 0.008 })), sh('guertel', 'item2', L('dunkelstahl')), rigid('schnalle')] },
      feet: { n: 'Abgrundstiefel', parts: boots(L('dunkelstahl', { trim: 'item2', trimW: 0.012, pattern: 'platten', patSize: 0.03 }), 'item') },
      hands: { n: 'Abgrundhandschuhe', parts: [sh('handschuhe', 'item', L('dunkelstahl', { trim: 'item2', trimW: 0.006 })), sh('armschiene', 'item', L('dunkelstahl', { pattern: 'platten', patSize: 0.03, trim: 'item2', trimW: 0.010, trimStyle: 1 }))] },
      shoulder: { n: 'Kristallschultern des Abgrunds', parts: [glb('schulter_drache3', { main: ['dunkelstahl', 'item'], steel: ['dunkelstahl', '#1A1426'], gold: ['dunkelstahl', 'item2'], glow: ['glut', 'item2'] })] },
      cloak: { n: 'Abgrundmantel', parts: [cape('lang', '#17121F', L('seide', { trim: 'item2', trimW: 0.024, trimStyle: 2 }))] },
    },
    bonus3: { crit: 0.05, faji: 0.15 }, bonusAll: { crit: 0.12, faji: 0.3, atk: 0.12, hp: 200 },
  },  // =========================== NEUE SETS: MODELLE AUS BLENDER (Helme, Schultern) ===========================
  {
    id: 'ritter', n: 'Turnierritter', rarity: 'selten', level: 20, palette: ['#B9C2CC', '#B8282A'], d: 'Blank polierter Stahl, ein Federbusch in Rot und Schulterlamellen wie Dachziegel: so reiten Ritter zum Turnier.',
    pieces: {
      head: { n: 'Turnierhelm mit Federbusch', parts: [glb('helm_ritter2', { steel: ['stahl', 'item'], gold: ['gold', '#E3B04B'], trim: ['seide', 'item2'] }, { mode: 'bone', bone: 'J_Bip_C_Head', trimsHair: true })] },
      chest: { n: 'Turnierpanzer', top: 'jacke', parts: [sh('jacke', '#2A2F3A', L('seide', { pattern: 'brokat', patColor: '#4A5668', patSize: 0.02 })), sh('kuerass', 'item', L('stahl', { pattern: 'platten', patSize: 0.034, trim: '#E3B04B', trimW: 0.012, trimStyle: 1 })), sh('kragen', 'item', L('stahl', { trim: '#E3B04B', trimW: 0.008 }))] },
      legs: { n: 'Turnierbeinzeug', parts: [sh('hose', '#2A2F3A', L('seide')), sh('kilt', 'item2', L('seide', { trim: '#E3B04B', trimW: 0.016, trimStyle: 1, pattern: 'streifen', patColor: '#E3B04B', patSize: 0.03 })), sh('beinschiene', 'item', L('stahl', { trim: '#E3B04B', trimW: 0.008 })), sh('guertel', '#3A2A1E', L('leder', { pattern: 'nieten', patColor: '#E3B04B', patSize: 0.03 })), rigid('schnalle')] },
      feet: { n: 'Turnierstiefel', parts: boots(L('stahl', { trim: '#E3B04B', trimW: 0.012, trimStyle: 1, pattern: 'platten', patSize: 0.03 }), 'item') },
      hands: { n: 'Turnierhandschuhe', parts: [sh('handschuhe', 'item', L('stahl', { trim: '#E3B04B', trimW: 0.006 })), sh('armschiene', 'item', L('stahl', { pattern: 'platten', patSize: 0.03, trim: '#E3B04B', trimW: 0.008 }))] },
      shoulder: { n: 'Schulterlamellen', parts: [glb('schulter_lamellen2', { steel: ['stahl', 'item'], main: ['leder', '#3A2A22'], gold: ['gold', '#E3B04B'] })] },
      cloak: { n: 'Turnierdecke', parts: [cape('lang', 'item2', L('stoff', { trim: '#E3B04B', trimW: 0.018, trimStyle: 1, pattern: 'streifen', patColor: '#7A1A1C', patSize: 0.05 }))] },
    },
    bonus3: { reduce: 0.03, hp: 70 }, bonusAll: { reduce: 0.06, atk: 0.05, hp: 120 },
  },
  {
    id: 'schatten', n: 'Schattenläufer', rarity: 'selten', level: 26, palette: ['#2A2D36', '#8AA0C0'], d: 'Tiefe Kapuze, schwarzes Leder und ein kurzer Umhang: wer sie trägt, wird nur gesehen, wenn es zu spät ist.',
    pieces: {
      head: { n: 'Schattenkapuze', parts: [glb('helm_kapuze2', { main: ['stoff', 'item'], trim: ['leder', 'item2'] }, { mode: 'bone', bone: 'J_Bip_C_Head', trimsHair: false })] },
      chest: { n: 'Schattenwams', top: 'jacke', parts: [sh('jacke', 'item', L('leder', { pattern: 'steppung', patSize: 0.022, trim: 'item2', trimW: 0.010, trimStyle: 1 })), sh('kragen', 'item', L('leder', { trim: 'item2', trimW: 0.008 }))] },
      legs: { n: 'Schattenhose', parts: [sh('hose', '#1E2026', L('leder', { pattern: 'steppung', patSize: 0.02 })), sh('guertel', '#2A2018', L('leder', { pattern: 'nieten', patColor: '#8AA0C0', patSize: 0.03 })), rigid('guertel_taschen', '#2A2018', 'item2'), rigid('schnalle')] },
      feet: { n: 'Schleichstiefel', parts: boots(L('leder', { trim: 'item2', trimW: 0.010, trimStyle: 1 }), '#1E2026') },
      hands: { n: 'Schattenhandschuhe', parts: [sh('handschuhe', '#1E2026', L('leder', { trim: 'item2', trimW: 0.006 })), sh('armschiene', '#2A2D36', L('leder', { pattern: 'nieten', patColor: '#8AA0C0', patSize: 0.026, trim: 'item2', trimW: 0.008 }))] },
      cloak: { n: 'Schattenumhang', parts: [cape('kurz', '#1E2026', L('stoff', { trim: 'item2', trimW: 0.014, trimStyle: 2 }))] },
    },
    bonus3: { crit: 0.04, hp: 60 }, bonusAll: { crit: 0.09, atk: 0.05, reduce: 0.02 },
  },
  {
    id: 'ronin', n: 'Mondwacht-Ronin', rarity: 'episch', level: 36, palette: ['#22262E', '#C9A13B'], d: 'Schwarzlackierter Kabuto, wehender Haori und Schulterlamellen mit Goldrand: die Wache des Mondes kennt keinen Herrn mehr.',
    pieces: {
      head: { n: 'Ronin-Kabuto', parts: [KABUTO_MOND] },
      chest: { n: 'Haori und Rüstrock', top: 'tunika', coat: 'lang', parts: [sh('tunika', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.018, patColor: 'item2', trim: 'item2', trimW: 0.012, trimStyle: 1 })), sh('mantelLang', '#7A1F2E', L('seide', { pattern: 'streifen', patColor: 'item2', patSize: 0.05, trim: 'item2', trimW: 0.02, trimStyle: 1 })), sh('kragen', 'item', L('dunkelstahl', { trim: 'item2', trimW: 0.008 }))] },
      legs: { n: 'Hakama', parts: [sh('hose', '#1A1C22', L('seide', { pattern: 'steppung', patSize: 0.024 })), sh('guertel', 'item2', L('seide')), rigid('guertel_schwerttasche', '#2A2018', 'item2')] },
      feet: { n: 'Lackstiefel', parts: boots(L('dunkelstahl', { trim: 'item2', trimW: 0.008, pattern: 'schuppen', patSize: 0.016, patColor: 'item2' }), 'item') },
      hands: { n: 'Kote', parts: [sh('handschuhe', '#1A1C22', L('leder', { trim: 'item2', trimW: 0.006 })), sh('armschiene', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.014, patColor: 'item2', trim: 'item2', trimW: 0.008 }))] },
      shoulder: { n: 'Sode-Lamellen', parts: [glb('schulter_lamellen2', { steel: ['dunkelstahl', 'item'], main: ['leder', '#7A1F2E'], gold: ['gold', 'item2'] })] },
    },
    bonus3: { atk: 0.05, crit: 0.03 }, bonusAll: { atk: 0.1, crit: 0.06, reduce: 0.04 },
  },
  {
    id: 'wyrm', n: 'Wyrmjäger', rarity: 'episch', level: 42, palette: ['#2C3A34', '#F08A2A'], d: 'Aus den Hörnern und Schuppen erlegter Wyrme gefertigt; in den Augen des Helms glimmt noch das Feuer.',
    pieces: {
      head: { n: 'Wyrmhelm', parts: [glb('helm_drache2', { main: ['dunkelstahl', 'item'], steel: ['stahl', '#9AA2AA'], gold: ['gold', 'item2'], glow: ['glut', 'item2'] }, { mode: 'bone', bone: 'J_Bip_C_Head', trimsHair: true })] },
      chest: { n: 'Wyrmschuppenpanzer', top: 'jacke', parts: [sh('jacke', '#1A1E1C', L('leder', { pattern: 'steppung', patSize: 0.02 })), sh('kuerass', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.02, patColor: 'item2', trim: 'item2', trimW: 0.014, trimStyle: 1 })), sh('kragen', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.018, patColor: 'item2', trim: 'item2', trimW: 0.008 }))] },
      legs: { n: 'Wyrmschurz', parts: [sh('hose', '#1A1E1C'), sh('kilt', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.02, patColor: 'item2', trim: 'item2', trimW: 0.014, trimStyle: 1 })), sh('beinschiene', 'item', L('dunkelstahl', { trim: 'item2', trimW: 0.008 })), sh('guertel', 'item2', L('gold')), rigid('schnalle')] },
      feet: { n: 'Wyrmstiefel', parts: boots(L('dunkelstahl', { pattern: 'schuppen', patSize: 0.016, patColor: 'item2', trim: 'item2', trimW: 0.01, trimStyle: 1 }), 'item') },
      hands: { n: 'Wyrmklauen', parts: [sh('handschuhe', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.012, patColor: 'item2', trim: 'item2', trimW: 0.006 })), sh('armschiene', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.016, patColor: 'item2', trim: 'item2', trimW: 0.01, trimStyle: 1 }))] },
      shoulder: { n: 'Dornenschultern', parts: [glb('schulter_drache3', { main: ['dunkelstahl', 'item'], steel: ['stahl', '#9AA2AA'], gold: ['gold', 'item2'], glow: ['glut', 'item2'] })] },
      cloak: { n: 'Wyrmhautumhang', parts: [cape('lang', '#1A1E1C', L('seide', { pattern: 'schuppen', patSize: 0.03, patColor: 'item2', trim: 'item2', trimW: 0.026, trimStyle: 2 }))] },
    },
    bonus3: { atk: 0.07, hp: 130 }, bonusAll: { atk: 0.14, hp: 260, reduce: 0.05, crit: 0.04 },
  },
  {
    id: 'gezeiten', n: 'Gezeitenkönig', rarity: 'legendaer', level: 58, palette: ['#1D6A78', '#EAD8A0'], d: 'Perlenkrone, Meerglasbrokat und Schultern wie Wellenkämme – der Herrscher der Flut trägt, was das Meer ihm schenkt.',
    pieces: {
      head: { n: 'Perlenkrone der Gezeiten', parts: [glb('helm_krone2', { gold: ['gold', 'item2'], trim: ['gold', '#E8F4F0'], glow: ['glut', '#7FF0FF'], cloth: ['stoff', '#F4F8F4'], main: ['seide', '#17435A'] }, { mode: 'bone', bone: 'J_Bip_C_Head', trimsHair: true })] },
      chest: { n: 'Meerglasmantel', top: 'eng', coat: 'lang', slimUnder: true, parts: [sh('hemd', '#E8F0EE'), sh('mantelLang', 'item', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.022, trim: 'item2', trimW: 0.022, trimStyle: 1 })), sh('kragen', 'item', L('seide', { trim: 'item2', trimW: 0.012 }))] },
      legs: { n: 'Gezeitenhose', parts: [sh('hose', '#12394A', L('seide', { trim: 'item2', trimW: 0.010 })), sh('kilt', 'item', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.022, trim: 'item2', trimW: 0.016, trimStyle: 1 })), sh('guertel', 'item2', L('gold')), rigid('schnalle')] },
      feet: { n: 'Korallenstiefel', parts: boots(L('leder', { trim: 'item2', trimW: 0.022, trimStyle: 1 }), '#12394A') },
      hands: { n: 'Perlenhandschuhe', parts: [sh('handschuhe', '#E8F0EE', L('seide', { trim: 'item2', trimW: 0.010 })), sh('armschiene', 'item2', L('gold', { trim: 'item', trimW: 0.006 }))] },
      shoulder: { n: 'Wellenkammschultern', parts: [glb('schulter_fluegel3', { steel: ['gold', 'item2'], main: ['seide', 'item'], gold: ['gold', '#F4EAC8'], cloth: ['seide', '#E8F4F0'], glow: ['glut', '#7FF0FF'] })] },
      cloak: { n: 'Flutschleppe', parts: [cape('schlepp', 'item', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.026, trim: 'item2', trimW: 0.03, trimStyle: 1 }))] },
    },
    bonus3: { gold: 0.15, faji: 0.15 }, bonusAll: { gold: 0.3, faji: 0.3, atk: 0.1, hp: 260, reduce: 0.06 },
  },
  {
    id: 'himmel', n: 'Himmelsrichter', rarity: 'legendaer', level: 62, palette: ['#F2F0E8', '#E3B04B'], d: 'Weißes Gold und ein Flügelreif: wer in den Himmel blickt und nicht blinzelt, hat sie vielleicht schon gesehen.',
    pieces: {
      head: { n: 'Flügelreif', parts: [glb('helm_engel2', { gold: ['gold', 'item2'], glow: ['glut', '#8FE8FF'], trim: ['seide', '#E8EDF4'], cloth: ['seide', '#F8F8F4'], steel: ['stahl', 'item'] }, { mode: 'bone', bone: 'J_Bip_C_Head', trimsHair: false })] },
      chest: { n: 'Richterpanzer', top: 'jacke', parts: [sh('jacke', '#E8EDF4', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.02 })), sh('kuerass', 'item', L('stahl', { pattern: 'platten', patSize: 0.036, trim: 'item2', trimW: 0.016, trimStyle: 1 })), sh('kragen', 'item', L('gold', { trim: 'item', trimW: 0.008 }))] },
      legs: { n: 'Richterbeinplatten', parts: [sh('hose', '#E8EDF4', L('seide')), sh('kilt', 'item', L('stahl', { pattern: 'platten', patSize: 0.036, trim: 'item2', trimW: 0.016, trimStyle: 1 })), sh('beinschiene', 'item', L('stahl', { trim: 'item2', trimW: 0.010 })), sh('guertel', 'item2', L('gold')), rigid('schnalle')] },
      feet: { n: 'Richterstiefel', parts: boots(L('stahl', { trim: 'item2', trimW: 0.014, trimStyle: 1, pattern: 'platten', patSize: 0.03 }), 'item') },
      hands: { n: 'Richterhandschuhe', parts: [sh('handschuhe', 'item', L('stahl', { trim: 'item2', trimW: 0.008 })), sh('armschiene', 'item', L('stahl', { pattern: 'platten', patSize: 0.03, trim: 'item2', trimW: 0.012, trimStyle: 1 }))] },
      shoulder: { n: 'Federschwingen', parts: [glb('schulter_fluegel3', { steel: ['stahl', 'item'], main: ['gold', 'item2'], gold: ['gold', 'item2'], cloth: ['seide', '#F8F8F4'], glow: ['glut', '#8FE8FF'] })] },
      cloak: { n: 'Mantel des Richters', parts: [cape('schlepp', '#F4F2EA', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.028, trim: 'item2', trimW: 0.034, trimStyle: 1 }))] },
    },
    bonus3: { atk: 0.1, faji: 0.15 }, bonusAll: { atk: 0.2, faji: 0.3, hp: 300, crit: 0.08, reduce: 0.08 },
  },

  // =========================== RAID-BOSSE (nur aus Belagerungen) ===========================
  {
    id: 'boss_england', raid: true, n: 'Admiral der Royal Navy', rarity: 'legendaer', level: BOSS_LV, palette: ['#14284A', '#E3B04B'], d: 'Der Rock des Lord-Admirals Blackwood: Nachtblau, Gold und ein Zweispitz, unter dem schon ganze Flotten verloren gingen. Dazu Säbel und Pistole.',
    pieces: {
      head: { n: 'Zweispitz des Lord-Admirals', parts: [bossHead('blackwood_head', { main: ['stoff', 'item'], trim: ['gold', 'item2'], gold: ['gold', 'item2'], cloth: ['seide', '#F4F0E6'], glow: ['glut', '#8FD8FF'], steel: ['stahl', '#C9D2DA'], dark: ['dunkelstahl', '#33343C'], leather: ['leder', '#2E1C10'] })] },
      chest: { n: 'Admiralsrock', top: 'uniform', parts: [sh('uniform', 'item', L('stoff', { trim: 'item2', trimW: 0.014, trimStyle: 1, pattern: 'streifen', patColor: 'item2', patSize: 0.03 })), sh('kragen', 'item', L('stoff', { trim: 'item2', trimW: 0.012 }))] },
      shoulder: { n: 'Admiralsepauletten', parts: [rigid('schulter_gold', 'item', 'item2')] },
      cloak: { n: 'Mantel der Admiralität', parts: [cape('lang', 'item', L('seide', { trim: 'item2', trimW: 0.03, trimStyle: 1 }))] },
      mainhand: { n: 'Säbel des Lord-Admirals', parts: [bossHeld('blackwood_saebel', 'r', { cloth: ['stoff', '#1B2A55'], glow: ['glut', '#6FB8FF'] })] },
      offhand: { n: 'Steinschlosspistole des Admirals', parts: [bossHeld('blackwood_pistole', 'l', { leather: ['leder', '#4A2E1C'], glow: ['glut', '#FFB347'] })] },
    },
    bonus3: { atk: 0.08, hp: 200 }, bonusAll: { atk: 0.2, crit: 0.08, hp: 500, reduce: 0.06 },
  },
  {
    id: 'boss_niederlande', raid: true, n: 'Generalgouverneur der Kompanie', rarity: 'legendaer', level: BOSS_LV, palette: ['#E8761E', '#1B2E5C'], d: 'Orange, Weiß und Dunkelblau: der Prunkharnisch Van Der Bergs samt Morion mit Federn und seiner schweren Hellebarde.',
    pieces: {
      head: { n: 'Morion des Gouverneurs', parts: [bossHead('vanderberg_head', { steel: ['stahl', '#B8C0C8'], gold: ['gold', 'item2'], cloth: ['seide', 'item'], main: ['stahl', '#B8C0C8'], dark: ['dunkelstahl', '#33343C'], leather: ['leder', '#2E1C10'], trim: ['gold', 'item2'], glow: ['glut', '#FFB347'] })] },
      chest: { n: 'Prunkharnisch der Kompanie', top: 'jacke', parts: [sh('jacke', 'item', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.02, trim: 'item2', trimW: 0.014 })), sh('kuerass', '#B8C0C8', L('stahl', { pattern: 'platten', patSize: 0.036, trim: 'item', trimW: 0.012, trimStyle: 1 })), sh('kragen', 'item2', L('stoff', { trim: 'item', trimW: 0.01 }))] },
      shoulder: { n: 'Kontor-Schulterplatten', parts: [rigid('schulter_leder', '#B8C0C8', 'item')] },
      cloak: { n: 'Orangener Kompaniemantel', parts: [cape('kurz', 'item', L('seide', { trim: 'item2', trimW: 0.025, trimStyle: 2 }))] },
      mainhand: { n: 'Hellebarde des Gouverneurs', parts: [bossHeld('vanderberg_hellebarde', 'r', { cloth: ['stoff', '#E8761E'], leather: ['leder', '#4A2E1C'] })] },
    },
    bonus3: { hp: 260, reduce: 0.03 }, bonusAll: { hp: 600, reduce: 0.1, gold: 0.15 },
  },
  {
    id: 'boss_deutschland', raid: true, n: 'Großkomtur der Preußischen Marine', rarity: 'legendaer', level: BOSS_LV, palette: ['#26262C', '#D4A82A'], d: 'Schwarz, Gold und Stahl: Topfhelm mit Adlerschwingen und der gewaltige Zweihänder des Großkomturs von Eisenstein.',
    pieces: {
      head: { n: 'Eisenhelm des Großkomturs', parts: [bossHead('eisenstein_head', { steel: ['stahl', '#8A8F98'], gold: ['gold', 'item2'], dark: ['dunkelstahl', '#2A2A30'], cloth: ['stoff', '#15151A'], main: ['stahl', '#8A8F98'], leather: ['leder', '#2E1C10'], trim: ['gold', 'item2'], glow: ['glut', '#FFD27A'] })] },
      chest: { n: 'Komturs-Plattenpanzer', top: 'jacke', parts: [sh('jacke', 'item', L('stoff', { trim: 'item2', trimW: 0.012 })), sh('kuerass', '#6E7078', L('stahl', { pattern: 'platten', patSize: 0.034, trim: 'item2', trimW: 0.016, trimStyle: 1 })), sh('kragen', 'item2', L('gold', { trim: 'item', trimW: 0.008 }))] },
      shoulder: { n: 'Adlerschultern', parts: [glb('schulter_lamellen2', { steel: ['dunkelstahl', '#34353C'], main: ['stahl', '#8A8F98'], gold: ['gold', 'item2'] })] },
      cloak: { n: 'Schwarzer Ordensmantel', parts: [cape('lang', 'item', L('stoff', { trim: 'item2', trimW: 0.035, trimStyle: 1 }))] },
      mainhand: { n: 'Zweihänder des Großkomturs', parts: [bossHeld('eisenstein_zweihaender', 'r', { steel: ['stahl', '#9AA0AA'], leather: ['leder', '#1E1812'], glow: ['glut', '#FFB347'] })] },
    },
    bonus3: { atk: 0.07, reduce: 0.04 }, bonusAll: { atk: 0.16, reduce: 0.12, hp: 700 },
  },
  {
    id: 'boss_frankreich', raid: true, n: 'Marquis der Armada Royale', rarity: 'legendaer', level: BOSS_LV, palette: ['#2A4BA6', '#D8B23A'], d: 'Königsblau, Weiß und Gold: Kavalierhut mit Lilienbrosche und das Hofdegen-Rapier des Marquis-Amirals De Valois.',
    pieces: {
      head: { n: 'Federhut des Marquis', parts: [bossHead('devalois_head', { main: ['seide', 'item'], gold: ['gold', 'item2'], cloth: ['seide', '#F6F3EA'], glow: ['glut', '#7FB0FF'], steel: ['stahl', '#C9D2DA'], dark: ['dunkelstahl', '#33343C'], leather: ['leder', '#2E1C10'], trim: ['gold', 'item2'] })] },
      chest: { n: 'Hofrock des Marquis', top: 'uniform', parts: [sh('uniform', '#F3F0E6', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.02, trim: 'item', trimW: 0.016, trimStyle: 1 })), sh('kragen', 'item', L('seide', { trim: 'item2', trimW: 0.01 }))] },
      shoulder: { n: 'Goldene Epauletten', parts: [rigid('schulter_gold', 'item', 'item2')] },
      cloak: { n: 'Königsblauer Mantel', parts: [cape('schlepp', 'item', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.026, trim: 'item2', trimW: 0.03, trimStyle: 1 }))] },
      mainhand: { n: 'Hofdegen des Marquis', parts: [bossHeld('devalois_rapier', 'r', { cloth: ['seide', '#2A4BA6'], glow: ['glut', '#7FB0FF'] })] },
    },
    bonus3: { crit: 0.05, atk: 0.05 }, bonusAll: { crit: 0.14, atk: 0.12, faji: 0.15, hp: 400 },
  },
  {
    id: 'boss_kurogane', raid: true, n: 'Schattenfürst von Kurogane', rarity: 'legendaer', level: BOSS_LV, palette: ['#0E0E12', '#B01818'], d: 'Obsidianschwarz mit blutroter Schnur: Kabuto mit Mondsichel und Dämonenmaske, dazu Katana und Wakizashi des Schattenfürsten.',
    pieces: {
      head: { n: 'Kabuto des Schattenfürsten', parts: [bossHead('kurogane_head', { dark: ['dunkelstahl', '#15151B'], steel: ['stahl', '#4A4A54'], steel2: ['dunkelstahl', '#2A2A30'], gold: ['gold', '#C9A13B'], cloth: ['stoff', 'item2'], glow: ['glut', '#FF3A2A'], main: ['dunkelstahl', '#15151B'], leather: ['leder', '#2A1A1A'], trim: ['gold', '#C9A13B'] })] },
      chest: { n: 'Lackharnisch der Nacht', top: 'jacke', parts: [sh('jacke', 'item', L('leder', { pattern: 'schuppen', patColor: 'item2', patSize: 0.03, trim: 'item2', trimW: 0.014, trimStyle: 1 })), sh('kuerass', '#1A1A20', L('stahl', { pattern: 'platten', patSize: 0.034, trim: 'item2', trimW: 0.012 }))] },
      shoulder: { n: 'Schuppenschultern der Nacht', parts: [glb('schulter_lamellen2', { steel: ['dunkelstahl', '#15151B'], main: ['leder', '#7A1F2E'], gold: ['gold', 'item2'] })] },
      cloak: { n: 'Schattenumhang des Fürsten', parts: [cape('lang', 'item', L('seide', { trim: 'item2', trimW: 0.03, trimStyle: 2 }))] },
      mainhand: { n: 'Katana des Schattenfürsten', parts: [bossHeld('kurogane_katana', 'r', { steel: ['stahl', '#C9D2DA'], dark: ['dunkelstahl', '#1A1A20'], cloth: ['stoff', '#B01818'], glow: ['glut', '#FF3A2A'] })] },
      offhand: { n: 'Wakizashi des Schattenfürsten', parts: [bossHeld('kurogane_wakizashi', 'l', { steel: ['stahl', '#C9D2DA'], dark: ['dunkelstahl', '#1A1A20'], cloth: ['stoff', '#15151B'], glow: ['glut', '#FF3A2A'] })] },
    },
    bonus3: { crit: 0.06, atk: 0.06 }, bonusAll: { crit: 0.16, atk: 0.16, hp: 350 },
  },
  {
    id: 'boss_marine', raid: true, n: 'Großadmiral der Marine', rarity: 'legendaer', level: BOSS_LV, palette: ['#1B3A6B', '#E3B04B'], d: 'Weiß und Marineblau mit Gold: Mütze mit Anker, Admiralsmantel und die Kanonenfaust des Obersten Gefängniswärters Valken.',
    pieces: {
      head: { n: 'Admiralsmütze des Wärters', parts: [bossHead('valken_head', { main: ['stoff', 'item'], cloth: ['stoff', '#F2F0EA'], gold: ['gold', 'item2'], dark: ['dunkelstahl', '#1A1A20'], steel: ['stahl', '#C9D2DA'], leather: ['leder', '#2E1C10'], glow: ['glut', '#8FD8FF'], trim: ['gold', 'item2'] })] },
      chest: { n: 'Großadmiralsuniform', top: 'uniform', parts: [sh('uniform', '#F2F0EA', L('stoff', { trim: 'item', trimW: 0.016, trimStyle: 1, pattern: 'streifen', patColor: 'item2', patSize: 0.03 })), sh('kragen', 'item', L('stoff', { trim: 'item2', trimW: 0.012 }))] },
      shoulder: { n: 'Admiralsepauletten des Wärters', parts: [rigid('schulter_gold', 'item', 'item2')] },
      cloak: { n: 'Admiralsmantel', parts: [cape('lang', 'item', L('stoff', { trim: 'item2', trimW: 0.03, trimStyle: 1 }))] },
      mainhand: { n: 'Kanonenfaust der Gerechtigkeit', parts: [bossHeld('valken_kanone', 'r', { steel: ['stahl', '#9AA3B0'], dark: ['dunkelstahl', '#26262C'], glow: ['glut', '#FF7A3C'] })] },
    },
    bonus3: { hp: 300, atk: 0.06 }, bonusAll: { hp: 800, atk: 0.14, reduce: 0.1, gold: 0.1 },
  },
];

// ---------- Werte, Preise, Texte ----------

const BASE_HP: Record<Rarity, number> = { gewoehnlich: 18, selten: 42, episch: 90, legendaer: 160 };
const BASE_RED: Record<Rarity, number> = { gewoehnlich: 0.004, selten: 0.014, episch: 0.028, legendaer: 0.05 };
const BASE_PRICE: Record<Rarity, number> = { gewoehnlich: 90, selten: 380, episch: 1100, legendaer: 3200 };
/** Anteil der Grundwerte je Platz */
const WEIGHT: Record<GearCat, number> = { chest: 1, legs: 0.75, head: 0.65, shoulder: 0.55, feet: 0.45, hands: 0.4, cloak: 0.3, mainhand: 0.7, offhand: 0.4 };
/** Anzeigezeilen eines Bonus: Name, Wert („+40“, „6 %“) und der Satz („+40 Leben“, „6 % weniger Schaden“) */
const BONUS_ROWS: { k: keyof GearBonus; label: string; value: (v: number) => string; text: (v: number) => string }[] = [
  { k: 'hp', label: 'Leben', value: (v) => `+${Math.round(v)}`, text: (v) => `+${Math.round(v)} Leben` },
  { k: 'atk', label: 'Angriff', value: (v) => `+${Math.round(v * 100)} %`, text: (v) => `+${Math.round(v * 100)} % Angriff` },
  { k: 'crit', label: 'Volltreffer', value: (v) => `+${Math.round(v * 100)} %`, text: (v) => `+${Math.round(v * 100)} % Volltreffer` },
  { k: 'reduce', label: 'Schadensminderung', value: (v) => `${Math.round(v * 100)} %`, text: (v) => `${Math.round(v * 100)} % weniger Schaden` },
  { k: 'faji', label: 'Faji-Erholung', value: (v) => `+${Math.round(v * 100)} %`, text: (v) => `+${Math.round(v * 100)} % Faji-Erholung` },
  { k: 'gold', label: 'Goldbonus', value: (v) => `+${Math.round(v * 100)} %`, text: (v) => `+${Math.round(v * 100)} % Gold` },
];

export function bonusRows(b: GearBonus): { label: string; value: string; text: string }[] {
  return BONUS_ROWS.filter((r) => b[r.k]).map((r) => ({ label: r.label, value: r.value(b[r.k]!), text: r.text(b[r.k]!) }));
}

export function describeBonus(b: GearBonus): string {
  return bonusRows(b).map((r) => r.text).join(', ');
}

/** Grundwerte eines Stücks aus Seltenheit, Stufe und Platz; das Set gibt dem Stück seinen Schwerpunkt */
function bonusFor(set: GearSet, cat: GearCat): GearBonus {
  const w = WEIGHT[cat];
  const lv = 1 + set.level / 40;
  const b: GearBonus = { hp: Math.round(BASE_HP[set.rarity] * w * lv), reduce: Math.round(BASE_RED[set.rarity] * w * 1000) / 1000 };
  // Schwerpunkt aus dem Setbonus: Volltreffer, Angriff, Faji oder Gold fließen in Kopf, Hände, Schultern und Umhang
  const focus = set.bonusAll;
  const share = cat === 'head' || cat === 'hands' || cat === 'cloak' || cat === 'shoulder' ? 0.12 : 0.06;
  if (focus.crit) b.crit = Math.round(focus.crit * share * 100) / 100;
  if (focus.atk) b.atk = Math.round(focus.atk * share * 100) / 100;
  if (focus.faji) b.faji = Math.round(focus.faji * share * 100) / 100;
  if (focus.gold) b.gold = Math.round(focus.gold * share * 100) / 100;
  for (const k of ['crit', 'atk', 'faji', 'gold'] as const) if (!b[k]) delete b[k];
  return b;
}

/** Alle Stücke aller Sets als Ausrüstungsdaten (wird in data/equipment.ts eingehängt) */
export const GEAR_CATALOG: EquipDef[] = SETS.flatMap((set) =>
  (Object.entries(set.pieces) as [GearCat, Piece][]).map(([cat, p]): EquipDef => {
    const bonus = bonusFor(set, cat);
    if (p.extra) for (const [k, v] of Object.entries(p.extra)) (bonus as Record<string, number>)[k] = ((bonus as Record<string, number>)[k] ?? 0) + v;
    const socket = cat === 'head' ? 'head' : cat === 'hands' ? 'hands' : cat === 'legs' ? 'legs' : cat === 'feet' ? 'feet' : cat === 'mainhand' ? 'mainHand' : cat === 'offhand' ? 'offHand' : 'chest';
    return {
      id: `${set.id}_${cat}`, n: p.n, socket, cat, replace: true, set: set.id, rarity: set.rarity, level: set.level,
      // Waffen aus Modellen wirken nur beim Schwertkämpfer mit Säbel (sonst bleibt die Waffe des Kampfstils)
      d: p.d ?? (describeBonus(bonus) + (cat === 'mainhand' ? ' · ersetzt den Säbel' : cat === 'offhand' ? ' · mit Säbel in der Linken' : '')), bonus, palette: set.palette,
      price: Math.round(BASE_PRICE[set.rarity] * WEIGHT[cat] * (1 + set.level / 30) / 10) * 10,
      parts: p.parts, top: p.top, coat: p.coat, slimUnder: p.slimUnder,
    };
  }));

export const GEAR_SET_BY_ID: Record<string, GearSet> = Object.fromEntries(SETS.map((s) => [s.id, s]));

/**
 * Ausrüstung für Gegner und Stadtleute: das Set richtet sich nach der Stufe, Eliten tragen mehr Teile, Bosse das ganze Set.
 * Marine bevorzugt die Marinegarde. Liefert Stück-IDs für look.extra.
 */
/** Welche Stücke eines Sets ein Gegner trägt: Bosse alle, Eliten vier bis sechs, Gewöhnliche null bis drei; Köpfe und Rümpfe zuerst (die fallen im Kampf am meisten auf) */
function pickPieces(set: GearSet, kind: 'normal' | 'elite' | 'boss', rnd: () => number): string[] {
  const cats = Object.keys(set.pieces) as GearCat[];
  const want = kind === 'boss' ? cats.length : kind === 'elite' ? Math.min(cats.length, 4 + Math.floor(rnd() * 3)) : rnd() < 0.5 ? 0 : 1 + Math.floor(rnd() * 3);
  const weight = (c: GearCat) => (c === 'chest' ? 3 : c === 'head' ? 2 : c === 'shoulder' ? 1 : 0);
  const order = [...cats].sort((a, b) => weight(b) - weight(a) + (rnd() - 0.5) * 1.5);
  return order.slice(0, want).map((c) => `${set.id}_${c}`);
}

/** Teile eines festen Sets (Uniformen der Weltmächte, data/factions.ts): Eliten tragen mehr, Bosse das ganze Set */
export function gearFromSet(setId: string, kind: 'normal' | 'elite' | 'boss', rnd: () => number = Math.random): string[] {
  const set = SETS.find((s) => s.id === setId);
  if (!set) return [];
  return pickPieces(set, kind, rnd);
}

export function gearForNpc(level: number, kind: 'normal' | 'elite' | 'boss', marine: boolean, rnd: () => number = Math.random): string[] {
  const pool = SETS.filter((s) => !s.raid && s.level <= level + 6 && s.level >= level - 24 && (kind === 'boss' ? s.rarity !== 'gewoehnlich' : true));
  const sets = pool.length ? pool : SETS.slice(0, 2);
  const marineSet = SETS.find((s) => s.id === 'marine');
  let set = sets[Math.floor(rnd() * sets.length)];
  if (marine && marineSet && level >= marineSet.level - 6 && rnd() < 0.7) set = marineSet;
  return pickPieces(set, kind, rnd);
}
