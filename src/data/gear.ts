// Ausrüstungs-Katalog: Sets von der einfachen Arbeitskluft bis zur legendären Rüstung. Jedes Set besteht aus bis zu sieben
// Stücken (Kopf, Schultern, Oberkörper, Umhang, Hände, Beine, Füße). Die Stücke setzen sich aus Hüllen (Stoff, Leder, Stahl
// mit Borten und Mustern) und starren Teilen zusammen; Farben sind färbbar (Palette: Haupt- und Zierfarbe).
// Neues Set: unten in SETS eintragen – Werte, Preise, Namen und Beschreibungen entstehen daraus.
import type { EquipDef, EquipPart, GearBonus, GearCat, ShellLook, Tint } from './equipment';
import type { TopUnder } from '../entities/character/vroid';
import type { Hat } from './characterParts';
import type { Rarity } from './trinkets';

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
}

/** Modell aus Blender (public/models/gear/<name>.glb): Rollen im Modell → Oberfläche und Farbe */
const glb = (model: string, roles: Record<string, [Finish, Tint]>, o: { mode?: 'skinned' | 'bone' | 'foot'; bone?: string; maskAs?: Extract<EquipPart, { type: 'shell' }>['garment']; hidesHair?: boolean; trimsHair?: boolean } = {}): EquipPart => ({
  type: 'glb', model, mode: o.mode ?? 'skinned', bone: o.bone, maskAs: o.maskAs, hidesHair: o.hidesHair, trimsHair: o.trimsHair,
  roles: Object.fromEntries(Object.entries(roles).map(([k, [finish, tint]]) => [k, { finish, tint }])),
});
const held = (model: string, hand: 'r' | 'l', roles: Record<string, [Finish, Tint]>): EquipPart => ({
  type: 'held', model, hand, roles: Object.fromEntries(Object.entries(roles).map(([k, [finish, tint]]) => [k, { finish, tint }])),
});

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
      head: { n: 'Jägerhaube', parts: [helm('helm_kapuze', '#3E6B3A', '#6A5A3A')] },
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
      head: { n: 'Hörnerhelm', parts: [helm('helm_hoerner', '#7A7F86', '#CDBA8A')] },
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
      head: { n: 'Eisenwall-Helm', parts: [helm('helm_ritter', 'item', 'item2')] },
      chest: { n: 'Eisenwall-Plattenpanzer', top: 'jacke', parts: [sh('jacke', '#2E2428', L('leder', { pattern: 'steppung', patSize: 0.02 })), sh('kuerass', 'item', L('stahl', { pattern: 'platten', patSize: 0.034, trim: 'item2', trimW: 0.012, trimStyle: 1 })), sh('kragen', 'item', L('stahl', { trim: 'item2', trimW: 0.008 }))] },
      legs: { n: 'Eisenwall-Beinzeug', parts: [sh('hose', '#2E2428'), sh('kilt', 'item', L('stahl', { pattern: 'platten', patSize: 0.034, trim: 'item2', trimW: 0.012 })), sh('beinschiene', 'item', L('stahl', { trim: 'item2', trimW: 0.008 })), sh('guertel', '#2A1E1A', L('leder', { pattern: 'nieten', patColor: '#C9A13B', patSize: 0.03 })), rigid('schnalle')] },
      feet: { n: 'Eisenwall-Stiefel', parts: boots(L('stahl', { trim: 'item2', trimW: 0.010, pattern: 'platten', patSize: 0.03 }), 'item') },
      hands: { n: 'Eisenwall-Panzerhandschuhe', parts: [sh('handschuhe', 'item', L('stahl', { trim: 'item2', trimW: 0.006 })), sh('armschiene', 'item', L('stahl', { pattern: 'platten', patSize: 0.03, trim: 'item2', trimW: 0.008 }))] },
      shoulder: { n: 'Eisenwall-Schulterdorne', parts: [rigid('schulter_stachel', 'item', '#C9A13B')] },
      cloak: { n: 'Eisenwall-Umhang', parts: [cape('lang', 'item2', L('stoff', { trim: '#E3B04B', trimW: 0.018, trimStyle: 1 }))] },
    },
    bonus3: { reduce: 0.05, hp: 120 }, bonusAll: { reduce: 0.10, hp: 220 },
  },
  {
    id: 'seekoenig', n: 'Seekönig', rarity: 'episch', level: 32, palette: ['#7A1F2E', '#E3B04B'], d: 'Brokatmantel, Goldkrone und eine Schleppe, die über die Planken fegt – die Kleidung eines, der Meere besitzt.',
    pieces: {
      head: { n: 'Königskrone', parts: [helm('helm_krone', 'item2', '#3FD0E0')] },
      chest: { n: 'Brokatmantel des Seekönigs', top: 'eng', coat: 'lang', slimUnder: true, parts: [sh('hemd', LINEN), sh('mantelLang', 'item', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.022, trim: 'item2', trimW: 0.022, trimStyle: 1 })), sh('kragen', 'item', L('seide', { trim: 'item2', trimW: 0.012 }))] },
      legs: { n: 'Prunkhose mit Schärpe', parts: [sh('hose', '#1E1A20', L('seide', { trim: 'item2', trimW: 0.010 })), sh('kilt', 'item', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.022, trim: 'item2', trimW: 0.016, trimStyle: 1 })), sh('guertel', 'item2', L('gold')), rigid('schnalle')] },
      feet: { n: 'Königsstiefel', parts: boots(L('leder', { trim: 'item2', trimW: 0.022, trimStyle: 1 }), '#1E1A20') },
      hands: { n: 'Königshandschuhe', parts: [sh('handschuhe', '#1E1A20', L('seide', { trim: 'item2', trimW: 0.010 })), sh('armschiene', 'item2', L('gold', { trim: 'item', trimW: 0.006 }))] },
      shoulder: { n: 'Goldene Prunkschultern', parts: [rigid('schulter_gold', 'item', 'item2')] },
      cloak: { n: 'Schleppe des Seekönigs', parts: [cape('schlepp', 'item', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.026, trim: 'item2', trimW: 0.03, trimStyle: 1 }))] },
    },
    bonus3: { gold: 0.15, hp: 100 }, bonusAll: { gold: 0.3, atk: 0.08, crit: 0.04 },
  },
  {
    id: 'schuppen', n: 'Schuppenwache', rarity: 'episch', level: 35, palette: ['#3A4A5A', '#C9A13B'], d: 'Dunkle Schuppenpanzer und ein Kabuto mit Mondzier, geschmiedet in den Werften des Ostens.',
    pieces: {
      head: { n: 'Mondzier-Kabuto', parts: [helm('helm_samurai', 'item', 'item2')] },
      chest: { n: 'Schuppenpanzer', top: 'tunika', parts: [sh('tunika', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.018, patColor: 'item2', trim: 'item2', trimW: 0.012, trimStyle: 1 })), sh('kragen', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.018, patColor: 'item2', trim: 'item2', trimW: 0.008 }))] },
      legs: { n: 'Schuppenschurz', parts: [sh('hose', '#22262C'), sh('kilt', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.018, patColor: 'item2', trim: 'item2', trimW: 0.012 })), sh('beinschiene', 'item', L('dunkelstahl', { trim: 'item2', trimW: 0.008 })), sh('guertel', 'item2', L('seide')), rigid('guertel_schwerttasche', '#2A2018', 'item2')] },
      feet: { n: 'Schuppenstiefel', parts: boots(L('dunkelstahl', { pattern: 'schuppen', patSize: 0.016, patColor: 'item2', trim: 'item2', trimW: 0.008 }), 'item') },
      hands: { n: 'Schuppenhandschuhe', parts: [sh('handschuhe', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.012, patColor: 'item2' })), sh('armschiene', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.014, patColor: 'item2', trim: 'item2', trimW: 0.008 }))] },
      shoulder: { n: 'Schuppenschulterplatten', parts: [rigid('schulter_platte', 'item', 'item2')] },
      cloak: { n: 'Banner-Umhang', parts: [cape('kurz', '#7A1F2E', L('stoff', { trim: 'item2', trimW: 0.02, trimStyle: 1 }))] },
    },
    bonus3: { atk: 0.05, reduce: 0.03 }, bonusAll: { atk: 0.1, reduce: 0.07, crit: 0.03 },
  },
  {
    id: 'nebel', n: 'Nebelwandler', rarity: 'episch', level: 38, palette: ['#2F4A44', '#8FD0B8'], d: 'Schwere Stoffe in Graugrün, Kapuze tief im Gesicht: sie gehen lautlos durch den Nebel.',
    pieces: {
      head: { n: 'Nebelkapuze', parts: [helm('helm_kapuze', 'item', 'item2')] },
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
      head: { n: 'Drachenhelm', parts: [helm('helm_drache', 'item', 'item2')] },
      chest: { n: 'Drachenschuppenpanzer', top: 'jacke', parts: [sh('jacke', '#1E1416', L('leder', { pattern: 'steppung', patSize: 0.02 })), sh('kuerass', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.02, patColor: 'item2', trim: 'item2', trimW: 0.014, trimStyle: 1 })), sh('kragen', 'item2', L('gold', { trim: 'item', trimW: 0.008 }))] },
      legs: { n: 'Drachenschuppenschurz', parts: [sh('hose', '#1E1416'), sh('kilt', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.02, patColor: 'item2', trim: 'item2', trimW: 0.016, trimStyle: 1 })), sh('beinschiene', 'item', L('dunkelstahl', { trim: 'item2', trimW: 0.010 })), sh('guertel', 'item2', L('gold')), rigid('schnalle')] },
      feet: { n: 'Drachenklauenstiefel', parts: boots(L('dunkelstahl', { pattern: 'schuppen', patSize: 0.018, patColor: 'item2', trim: 'item2', trimW: 0.012, trimStyle: 1 }), 'item') },
      hands: { n: 'Drachenpranken', parts: [sh('handschuhe', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.012, patColor: 'item2', trim: 'item2', trimW: 0.006 })), sh('armschiene', 'item', L('dunkelstahl', { pattern: 'schuppen', patSize: 0.016, patColor: 'item2', trim: 'item2', trimW: 0.010, trimStyle: 1 }))] },
      shoulder: { n: 'Drachenschwingen-Schultern', parts: [rigid('schulter_drache', 'item', 'item2')] },
      cloak: { n: 'Drachenhaut-Umhang', parts: [cape('lang', 'item', L('seide', { pattern: 'schuppen', patSize: 0.03, patColor: 'item2', trim: 'item2', trimW: 0.028, trimStyle: 2 }))] },
    },
    bonus3: { atk: 0.08, hp: 150 }, bonusAll: { atk: 0.16, hp: 320, reduce: 0.06, crit: 0.05 },
  },
  {
    id: 'sturmkrone', n: 'Sturmgeborene', rarity: 'legendaer', level: 60, palette: ['#E8EDF4', '#E3B04B'], d: 'Weißes Silber, gerahmt von Gold: die Rüstung derer, die die Sturmkrone tragen dürfen.',
    pieces: {
      head: { n: 'Sturmkrone', parts: [helm('helm_sturmkrone', 'item2', '#7FD8FF')] },
      chest: { n: 'Sturmgeborener Brustpanzer', top: 'jacke', parts: [sh('jacke', '#2A3A5A', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.02 })), sh('kuerass', 'item', L('stahl', { pattern: 'platten', patSize: 0.036, trim: 'item2', trimW: 0.016, trimStyle: 1 })), sh('kragen', 'item', L('stahl', { trim: 'item2', trimW: 0.010 }))] },
      legs: { n: 'Sturmgeborene Beinplatten', parts: [sh('hose', '#2A3A5A', L('seide')), sh('kilt', 'item', L('stahl', { pattern: 'platten', patSize: 0.036, trim: 'item2', trimW: 0.016, trimStyle: 1 })), sh('beinschiene', 'item', L('stahl', { trim: 'item2', trimW: 0.010 })), sh('guertel', 'item2', L('gold')), rigid('schnalle')] },
      feet: { n: 'Sturmgeborene Stiefel', parts: boots(L('stahl', { trim: 'item2', trimW: 0.014, trimStyle: 1, pattern: 'platten', patSize: 0.03 }), 'item') },
      hands: { n: 'Sturmgeborene Handschuhe', parts: [sh('handschuhe', 'item', L('stahl', { trim: 'item2', trimW: 0.008 })), sh('armschiene', 'item', L('stahl', { pattern: 'platten', patSize: 0.03, trim: 'item2', trimW: 0.012, trimStyle: 1 }))] },
      shoulder: { n: 'Sturmschwingen', parts: [rigid('schulter_fluegel', 'item', 'item2')] },
      cloak: { n: 'Sturmmantel', parts: [cape('schlepp', '#2A3A5A', L('seide', { pattern: 'brokat', patColor: 'item2', patSize: 0.028, trim: 'item2', trimW: 0.034, trimStyle: 1 }))] },
    },
    bonus3: { atk: 0.1, faji: 0.15 }, bonusAll: { atk: 0.2, faji: 0.3, hp: 300, crit: 0.08, reduce: 0.08 },
  },
  {
    id: 'abgrund', n: 'Abgrundwächter', rarity: 'legendaer', level: 55, palette: ['#2A2038', '#B070FF'], d: 'Schwarzer Stahl, durchzogen von violettem Licht – gefunden dort, wo kein Licht mehr hinfällt.',
    pieces: {
      head: { n: 'Abgrundhelm', parts: [helm('helm_fluegel', 'item', 'item2')] },
      chest: { n: 'Abgrundpanzer', top: 'jacke', parts: [sh('jacke', '#17121F', L('seide')), sh('kuerass', 'item', L('dunkelstahl', { pattern: 'platten', patSize: 0.034, trim: 'item2', trimW: 0.012, trimStyle: 1 })), sh('kragen', 'item', L('dunkelstahl', { trim: 'item2', trimW: 0.008 }))] },
      legs: { n: 'Abgrundschurz', parts: [sh('hose', '#17121F', L('seide')), sh('kilt', 'item', L('dunkelstahl', { pattern: 'platten', patSize: 0.034, trim: 'item2', trimW: 0.012 })), sh('beinschiene', 'item', L('dunkelstahl', { trim: 'item2', trimW: 0.008 })), sh('guertel', 'item2', L('dunkelstahl')), rigid('schnalle')] },
      feet: { n: 'Abgrundstiefel', parts: boots(L('dunkelstahl', { trim: 'item2', trimW: 0.012, pattern: 'platten', patSize: 0.03 }), 'item') },
      hands: { n: 'Abgrundhandschuhe', parts: [sh('handschuhe', 'item', L('dunkelstahl', { trim: 'item2', trimW: 0.006 })), sh('armschiene', 'item', L('dunkelstahl', { pattern: 'platten', patSize: 0.03, trim: 'item2', trimW: 0.010, trimStyle: 1 }))] },
      shoulder: { n: 'Kristallschultern des Abgrunds', parts: [rigid('schulter_kristall', 'item', 'item2')] },
      cloak: { n: 'Abgrundmantel', parts: [cape('lang', '#17121F', L('seide', { trim: 'item2', trimW: 0.024, trimStyle: 2 }))] },
    },
    bonus3: { crit: 0.05, faji: 0.15 }, bonusAll: { crit: 0.12, faji: 0.3, atk: 0.12, hp: 200 },
  },
];

// ---------- Werte, Preise, Texte ----------

const BASE_HP: Record<Rarity, number> = { gewoehnlich: 18, selten: 42, episch: 90, legendaer: 160 };
const BASE_RED: Record<Rarity, number> = { gewoehnlich: 0.004, selten: 0.014, episch: 0.028, legendaer: 0.05 };
const BASE_PRICE: Record<Rarity, number> = { gewoehnlich: 90, selten: 380, episch: 1100, legendaer: 3200 };
/** Anteil der Grundwerte je Platz */
const WEIGHT: Record<GearCat, number> = { chest: 1, legs: 0.75, head: 0.65, shoulder: 0.55, feet: 0.45, hands: 0.4, cloak: 0.3, mainhand: 0.7, offhand: 0.4 };
/** Schwere Stoffe und Platten geben mehr Schutz, Hüllen aus Stoff mehr Faji/Volltreffer */
const NAMES: Record<string, string> = { hp: 'Leben', reduce: 'weniger Schaden', crit: 'Volltreffer', atk: 'Angriff', faji: 'Faji-Erholung', gold: 'Gold' };

export function describeBonus(b: GearBonus): string {
  const out: string[] = [];
  if (b.hp) out.push(`+${Math.round(b.hp)} Leben`);
  if (b.atk) out.push(`+${Math.round(b.atk * 100)} % Angriff`);
  if (b.crit) out.push(`+${Math.round(b.crit * 100)} % Volltreffer`);
  if (b.reduce) out.push(`${Math.round(b.reduce * 100)} % weniger Schaden`);
  if (b.faji) out.push(`+${Math.round(b.faji * 100)} % Faji-Erholung`);
  if (b.gold) out.push(`+${Math.round(b.gold * 100)} % Gold`);
  return out.join(', ');
}
void NAMES;

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
export function gearForNpc(level: number, kind: 'normal' | 'elite' | 'boss', marine: boolean, rnd: () => number = Math.random): string[] {
  const pool = SETS.filter((s) => s.level <= level + 6 && s.level >= level - 24 && (kind === 'boss' ? s.rarity !== 'gewoehnlich' : true));
  const sets = pool.length ? pool : SETS.slice(0, 2);
  const marineSet = SETS.find((s) => s.id === 'marine');
  let set = sets[Math.floor(rnd() * sets.length)];
  if (marine && marineSet && level >= marineSet.level - 6 && rnd() < 0.7) set = marineSet;
  const cats = Object.keys(set.pieces) as GearCat[];
  const want = kind === 'boss' ? cats.length : kind === 'elite' ? Math.min(cats.length, 4 + Math.floor(rnd() * 3)) : rnd() < 0.5 ? 0 : 1 + Math.floor(rnd() * 3);
  // Köpfe und Rümpfe zuerst: die fallen im Kampf am meisten auf
  const order = [...cats].sort((a, b) => (b === 'chest' ? 3 : b === 'head' ? 2 : b === 'shoulder' ? 1 : 0) - (a === 'chest' ? 3 : a === 'head' ? 2 : a === 'shoulder' ? 1 : 0) + (rnd() - 0.5) * 1.5);
  return order.slice(0, want).map((c) => `${set.id}_${c}`);
}
