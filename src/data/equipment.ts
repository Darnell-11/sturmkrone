// Ausrüstung als Daten: was an welchem Platz (Socket) der Figur sitzt und woraus es besteht.
// Neue Teile: hier eintragen. Hüllen („shell“) entstehen aus dem Körper (vroid.ts, garmentOffset), starre Teile („rigid“)
// baut animeHats.ts, Hüte ebenfalls. Das Aussehen einer Figur (CharacterLook) wird mit loadoutFromLook übersetzt.
import type { GarmentCtx, GarmentKind, TopUnder } from '../entities/character/vroid';
import type { CharacterLook, Hat } from './characterParts';
import type { Rarity } from './trinkets';
import { GEAR_CATALOG } from './gear';

export const SOCKETS = ['head', 'chest', 'legs', 'feet', 'hands', 'mainHand', 'offHand'] as const;
export type SocketId = (typeof SOCKETS)[number];

export const SOCKET_LABEL: Record<SocketId, string> = {
  head: 'Kopf', chest: 'Oberkörper', legs: 'Beine', feet: 'Füße', hands: 'Hände', mainHand: 'Haupthand', offHand: 'Nebenhand',
};

/** Woher ein Teil seine Farbe nimmt: ein Farbfeld der Figur oder eine feste Farbe (#RRGGBB) */
export type TintSource = 'outfit' | 'accent' | 'pants' | 'shoes' | 'coat' | 'hat' | 'belt' | 'skin' | 'hair';
/** Farben des Stücks selbst: Hauptfarbe und Zierfarbe (färbbar im Editor, Standard aus der Palette des Stücks) */
export type ItemTint = 'item' | 'item2';
export type Tint = TintSource | ItemTint | `#${string}`;

/** Starre Teile: Schärpenknoten, Schnalle, Schulterstücke … (Bausteine in entities/character/gear/rigid.ts) */
export type RigidKind = string;

/** Oberfläche eines Stücks: bestimmt Glanz, Feinrelief und wie das Licht darauf spielt */
export type Finish = 'stoff' | 'seide' | 'leder' | 'stahl' | 'dunkelstahl' | 'gold' | 'haut' | 'haar';
export type PatternId = 'platten' | 'kette' | 'schuppen' | 'brokat' | 'nieten' | 'steppung' | 'streifen';
/** Nummern der Muster im Shader (render/toon.ts, GEAR_FRAG_GLSL) */
export const PATTERN_NO: Record<PatternId, number> = { platten: 1, kette: 2, schuppen: 3, brokat: 4, nieten: 5, steppung: 6, streifen: 7 };

/** Verzierung einer Hülle: Oberfläche, Borte am Saum, Muster */
export interface ShellLook {
  finish?: Finish;
  /** Farbe der Borte (am Saum, Ärmelrand, Kragen, Mantelöffnung) */
  trim?: Tint;
  /** Breite der Borte in Metern (Standard 0,014) */
  trimW?: number;
  /** 0 schlicht, 1 mit feiner Zierlinie, 2 Zickzack */
  trimStyle?: 0 | 1 | 2;
  pattern?: PatternId;
  patColor?: Tint;
  /** Größe einer Masche, Lamelle oder Raute in Metern */
  patSize?: number;
}

/** Rolle eines Modells (Materialname im .glb) → Oberfläche und Farbe */
export interface GlbRoleSpec { finish: Finish; tint: Tint }

export type EquipPart =
  /** Modell aus Blender (entities/character/gear/glbGear.ts): am Körper („skinned“, Gewichte von der Haut) oder an einem Knochen („bone“) */
  | { type: 'glb'; model: string; mode: 'skinned' | 'bone' | 'foot'; bone?: string; roles: Record<string, GlbRoleSpec>; /** deckt die Haut wie diese Hülle (Maske) */ maskAs?: GarmentKind; /** Frisur: Haare der Grundfigur ausblenden */ hidesHair?: boolean; /** Hut: Haare unter dem Rand ausblenden */ trimsHair?: boolean }
  /** Waffe aus einem Modell in der Hand (Griff am Ursprung, Klinge entlang +Y) */
  | { type: 'held'; model: string; hand: 'r' | 'l'; roles: Record<string, GlbRoleSpec> }
  /** Hülle aus dem Körper: bewegt sich mit und verdeckt, was unter ihr liegt */
  | { type: 'shell'; garment: GarmentKind; tint: Tint; look?: ShellLook }
  /** Umhang hinter dem Rücken (eigenes Netz am Skelett) */
  | { type: 'cape'; len: 'kurz' | 'lang' | 'schlepp'; tint: Tint; look?: ShellLook }
  /** sichtbares Kleidungsteil der Grundfigur (Hemd, Schuhe) */
  | { type: 'base'; slot: 'top' | 'shoes' }
  /** starres Teil auf einem Haut-Anker (tint: Farbe, wo das Teil eine hat) */
  | { type: 'rigid'; build: RigidKind; tint?: Tint; tint2?: Tint }
  /** Kopfbedeckung */
  | { type: 'hat'; hat: Hat; tint?: Tint; tint2?: Tint };

/** Ausrüstungs-Plätze für Beute und Inventar (feiner als die Sockets: Schultern und Umhang sitzen am Oberkörper) */
export type GearCat = 'head' | 'shoulder' | 'chest' | 'cloak' | 'hands' | 'legs' | 'feet' | 'mainhand' | 'offhand';
export const GEAR_CATS: GearCat[] = ['head', 'shoulder', 'chest', 'cloak', 'hands', 'legs', 'feet', 'mainhand', 'offhand'];
export const CAT_LABEL: Record<GearCat, string> = { head: 'Kopf', shoulder: 'Schultern', chest: 'Oberkörper', cloak: 'Umhang', hands: 'Hände', legs: 'Beine', feet: 'Füße', mainhand: 'Haupthand', offhand: 'Nebenhand' };
/** Socket je Platz */
export const CAT_SOCKET: Record<GearCat, SocketId> = { head: 'head', shoulder: 'chest', chest: 'chest', cloak: 'chest', hands: 'hands', legs: 'legs', feet: 'feet', mainhand: 'mainHand', offhand: 'offHand' };

/** Werte eines Stücks (Anteile 0 … 1 außer hp) */
export interface GearBonus { hp?: number; reduce?: number; crit?: number; atk?: number; faji?: number; gold?: number }

export interface EquipDef {
  id: string;
  /** Anzeigename */
  n: string;
  socket: SocketId;
  /** Platz im Inventar (Standard: nach Socket). Beute-Stücke ersetzen alles andere auf demselben Platz. */
  cat?: GearCat;
  /** ersetzt, was auf diesem Platz sonst getragen wird (Beute-Ausrüstung) */
  replace?: boolean;
  /** Teil eines Sets (data/gear.ts) */
  set?: string;
  rarity?: Rarity;
  /** Mindeststufe */
  level?: number;
  d?: string;
  bonus?: GearBonus;
  price?: number;
  /** Hauptfarbe und Zierfarbe ab Werk */
  palette?: [string, string];
  parts: EquipPart[];
  /** eigenes Oberteil: Gürtel, Halstuch und Mantel richten ihren Abstand danach */
  top?: TopUnder;
  /** Mantel dieser Länge: das Halstuch legt sich über seinen Kragen */
  coat?: 'kurz' | 'lang';
  /** braucht darunter ein eng anliegendes Hemd (das weite Hemd der Grundfigur würde durchstechen) */
  slimUnder?: boolean;
  /** belegt weitere Sockets mit */
  alsoOccupies?: SocketId[];
  /** entfällt unter einem Mantel (eine Brustplatte passt nicht darunter) */
  notUnderCoat?: boolean;
}

const LINEN = '#EDE6D6';
const GLOVE = '#5A3A22';
const HAT_NAMES: Partial<Record<Exclude<Hat, 'keiner'>, string>> = {
  dreispitz: 'Dreispitz', zweispitz: 'Zweispitz', bandana: 'Kopftuch', muetze: 'Wollmütze', marine: 'Marinemütze',
  kochmuetze: 'Kochmütze', suedwester: 'Südwester', helm: 'Helm', brille: 'Fliegerbrille',
};

export const EQUIPMENT: EquipDef[] = [
  // ---------- Oberkörper ----------
  { id: 'hemd', n: 'Hemd', socket: 'chest', parts: [{ type: 'base', slot: 'top' }] },
  { id: 'uniform', n: 'Uniformrock', socket: 'chest', top: 'uniform', parts: [{ type: 'shell', garment: 'uniform', tint: 'outfit' }] },
  { id: 'ringelhemd', n: 'Ringelhemd', socket: 'chest', top: 'ringel', parts: [{ type: 'shell', garment: 'ringel', tint: 'outfit' }] },
  { id: 'tunika', n: 'Tunika', socket: 'chest', top: 'tunika', parts: [{ type: 'shell', garment: 'tunika', tint: 'outfit' }] },
  { id: 'jacke', n: 'Jacke', socket: 'chest', top: 'jacke', parts: [{ type: 'shell', garment: 'jacke', tint: 'outfit' }] },
  // „Weste und Hemd“: die Weste trägt die gewählte Farbe, darunter ein helles Leinenhemd
  { id: 'weste', n: 'Weste', socket: 'chest', top: 'eng', parts: [{ type: 'shell', garment: 'hemd', tint: LINEN }, { type: 'shell', garment: 'weste', tint: 'outfit' }] },
  { id: 'mantel_kurz', n: 'Kurzer Mantel', socket: 'chest', coat: 'kurz', slimUnder: true, parts: [{ type: 'shell', garment: 'mantelKurz', tint: 'coat' }] },
  { id: 'mantel_lang', n: 'Langer Mantel', socket: 'chest', coat: 'lang', slimUnder: true, parts: [{ type: 'shell', garment: 'mantelLang', tint: 'coat' }] },
  { id: 'mantel_kapitaen', n: 'Kapitänsmantel', socket: 'chest', coat: 'lang', slimUnder: true, parts: [{ type: 'shell', garment: 'mantelLang', tint: 'coat' }, { type: 'rigid', build: 'schulterstuecke' }] },
  { id: 'halstuch', n: 'Halstuch', socket: 'chest', parts: [{ type: 'shell', garment: 'schal', tint: 'accent' }] },
  { id: 'kuerass', n: 'Brustplatte', socket: 'chest', notUnderCoat: true, parts: [{ type: 'shell', garment: 'kuerass', tint: '#9AA3AD' }] },
  { id: 'schulterplatten', n: 'Schulterplatten', socket: 'chest', parts: [{ type: 'rigid', build: 'schulterplatten', tint: '#9AA3AD' }] },
  // ---------- Beine ----------
  { id: 'hose', n: 'Hose', socket: 'legs', parts: [{ type: 'shell', garment: 'hose', tint: 'pants' }] },
  { id: 'schaerpe', n: 'Schärpe', socket: 'legs', parts: [{ type: 'shell', garment: 'guertel', tint: 'belt' }, { type: 'rigid', build: 'knoten' }] },
  { id: 'koppel', n: 'Koppel', socket: 'legs', parts: [{ type: 'shell', garment: 'guertel', tint: 'belt' }, { type: 'rigid', build: 'schnalle' }] },
  { id: 'beinschienen_leder', n: 'Lederne Beinschienen', socket: 'legs', parts: [{ type: 'shell', garment: 'beinschiene', tint: '#6A4526' }] },
  { id: 'beinschienen_stahl', n: 'Stählerne Beinschienen', socket: 'legs', parts: [{ type: 'shell', garment: 'beinschiene', tint: '#9AA3AD' }] },
  // ---------- Füße ----------
  { id: 'schuhe', n: 'Schuhe', socket: 'feet', parts: [{ type: 'base', slot: 'shoes' }] },
  // Sandalen zeigen die Schuhe der Grundfigur: ihr Fuß ist unter dem Schuh nicht ausgearbeitet (barfuß sähe er falsch aus)
  { id: 'sandalen', n: 'Sandalen', socket: 'feet', parts: [{ type: 'base', slot: 'shoes' }] },
  { id: 'stiefel', n: 'Stiefel', socket: 'feet', parts: [{ type: 'base', slot: 'shoes' }, { type: 'shell', garment: 'stiefel', tint: 'shoes' }] },
  // ---------- Hände ----------
  { id: 'faeustlinge', n: 'Fäustlinge', socket: 'hands', parts: [{ type: 'shell', garment: 'handschuhe', tint: GLOVE }] },
  { id: 'armschienen_leder', n: 'Lederne Armschienen', socket: 'hands', parts: [{ type: 'shell', garment: 'armschiene', tint: '#6A4526' }] },
  { id: 'armschienen_stahl', n: 'Stählerne Armschienen', socket: 'hands', parts: [{ type: 'shell', garment: 'armschiene', tint: '#9AA3AD' }] },
  // ---------- Kopf ----------
  ...(Object.keys(HAT_NAMES) as Exclude<Hat, 'keiner'>[]).map((hat): EquipDef => ({ id: hat, n: HAT_NAMES[hat]!, socket: 'head', parts: [{ type: 'hat', hat }] })),
];

// Frisur aus einem Modell (Aussehen, nicht Beute): wird über look.hairModel gewählt; ein Helm auf dem Kopf ersetzt sie
EQUIPMENT.push({
  id: 'frisur_mehrlagig', n: 'Mehrlagige Frisur', socket: 'head',
  parts: [{ type: 'glb', model: 'frisur_mehrlagig', mode: 'bone', bone: 'J_Bip_C_Head', hidesHair: true, roles: { hair: { finish: 'haar', tint: 'hair' } } }],
});
EQUIPMENT.push(...GEAR_CATALOG);
export const EQUIP_BY_ID: Record<string, EquipDef> = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e]));

/** Platz eines Stücks */
export const catOf = (d: EquipDef): GearCat => d.cat ?? (d.socket === 'head' ? 'head' : d.socket === 'hands' ? 'hands' : d.socket === 'legs' ? 'legs' : d.socket === 'feet' ? 'feet' : d.socket === 'mainHand' ? 'mainhand' : d.socket === 'offHand' ? 'offhand' : 'chest');

/** Was eine Figur trägt: je Socket mehrere Lagen (Hemd + Mantel), dazu ihre Farbfelder */
export interface Loadout {
  items: Record<SocketId, string[]>;
  colors: Record<TintSource, string>;
  /** eigene Farben je Stück (Hauptfarbe, Zierfarbe); sonst gilt die Palette des Stücks */
  dye?: Record<string, [string, string]>;
}

/** Das Aussehen einer Figur als Ausrüstung. Waffen kommen über den Kampfstil (Character.hold), nicht von hier. */
export function loadoutFromLook(look: CharacterLook): Loadout {
  const marine = look.outfit === 'uniform' || look.hat === 'marine' || look.hat === 'zweispitz';
  const chest: string[] = [look.outfit === 'matrose' ? 'ringelhemd' : look.outfit];
  if (look.coat !== 'keiner') chest.push(look.coat === 'kurz' ? 'mantel_kurz' : look.coat === 'lang' ? 'mantel_lang' : 'mantel_kapitaen');
  if (look.scarf) chest.push('halstuch');
  const items: Record<SocketId, string[]> = {
    head: look.hat && look.hat !== 'keiner' ? [look.hat] : [],
    chest,
    legs: ['hose', marine ? 'koppel' : 'schaerpe'],
    feet: [look.shoes],
    hands: look.gloves ? ['faeustlinge'] : [],
    mainHand: [],
    offHand: [],
  };
  // Ausrüstung aus dem Inventar: Schuhwerk ersetzt die Schuhe der Figur, alles andere kommt dazu
  for (const id of look.extra ?? []) {
    const d = EQUIP_BY_ID[id];
    if (!d) continue;
    if (d.replace) {
      // Beute-Ausrüstung ersetzt, was auf ihrem Platz getragen wird (Hemd, Mantel, Hose, Schärpe, Stiefel …)
      const cat = catOf(d);
      items[d.socket] = items[d.socket].filter((o) => { const od = EQUIP_BY_ID[o]; return !od || catOf(od) !== cat; });
      items[d.socket].push(id);
    } else if (d.socket === 'feet') items.feet = [id]; else if (!items[d.socket].includes(id)) items[d.socket].push(id);
  }
  // Frisur aus einem Modell (Editor, Reiter „Haare“): sitzt am Kopf und ersetzt das Haar der Grundfigur
  if (look.hairModel && EQUIP_BY_ID[look.hairModel]) items.head.unshift(look.hairModel);
  return {
    items,
    dye: look.dye,
    colors: {
      outfit: look.outfitColor, accent: look.accentColor, pants: look.pantsColor, shoes: look.shoesColor, coat: look.coatColor, hat: look.hatColor, skin: look.skin, hair: look.hairColor,
      belt: marine ? '#2A2420' : look.accentColor,
    },
  };
}

/** Reihenfolge der Hüllen im gemeinsamen Netz (fest, damit gleiche Ausrüstung dieselbe Geometrie teilt) */
const SHELL_ORDER: GarmentKind[] = ['hose', 'ringel', 'tunika', 'jacke', 'uniform', 'hemd', 'weste', 'kilt', 'kuerass', 'guertel', 'schal', 'kragen', 'handschuhe', 'stiefel', 'beinschiene', 'mantelKurz', 'mantelLang', 'armschiene'];

/** Verzierung mit aufgelösten Farben */
export interface ShellSpec {
  finish: Finish;
  trim: string | null; trimW: number; trimStyle: number;
  pattern: number; patColor: string; patSize: number;
}
const PLAIN_SPEC: ShellSpec = { finish: 'stoff', trim: null, trimW: 0, trimStyle: 0, pattern: 0, patColor: '#ffffff', patSize: 0.01 };

export interface ResolvedLoadout {
  /** Hüllen von innen nach außen mit ihrer Farbe und Verzierung */
  shells: { kind: GarmentKind; color: string; spec: ShellSpec }[];
  cape: { len: 'kurz' | 'lang' | 'schlepp'; color: string; spec: ShellSpec } | null;
  /** Zusammenhang für die Abstände (was liegt unter Gürtel, Tuch und Mantel) */
  ctx: GarmentCtx;
  /** welche Kleidung der Grundfigur sichtbar bleibt */
  base: { top: boolean; shoes: boolean };
  rigid: { build: RigidKind; color: string; color2: string }[];
  /** Modelle aus Blender mit aufgelösten Farben */
  glb: { model: string; mode: 'skinned' | 'bone' | 'foot'; bone?: string; look: Record<string, { finish: Finish; color: string }>; maskAs?: GarmentKind; hidesHair?: boolean; trimsHair?: boolean }[];
  held: { model: string; hand: 'r' | 'l'; look: Record<string, { finish: Finish; color: string }> }[];
  hat: Hat;
  /** Farben des Helms, wenn er eigene hat (sonst die Hutfarbe der Figur) */
  hatColor: string | null;
  hatAccent: string | null;
}

/** Ausrüstung in Bauanweisungen auflösen (unbekannte Einträge werden übersprungen) */
export function resolveLoadout(l: Loadout): ResolvedLoadout {
  const defs = SOCKETS.flatMap((s) => l.items[s] ?? []).map((id) => EQUIP_BY_ID[id]).filter((d): d is EquipDef => !!d);
  // Farben eines Stücks: Hauptfarbe 'item' und Zierfarbe 'item2' kommen aus der Färbung oder der Palette des Stücks
  let pal: [string, string] = ['#8A8F98', '#E3B04B'];
  const color = (t: Tint) => (t === 'item' ? pal[0] : t === 'item2' ? pal[1] : t.startsWith('#') ? t : l.colors[t as TintSource]);
  const specOf = (lk: ShellLook | undefined): ShellSpec => (lk ? {
    finish: lk.finish ?? 'stoff',
    trim: lk.trim ? color(lk.trim) : null,
    trimW: lk.trim ? lk.trimW ?? 0.014 : 0,
    trimStyle: lk.trimStyle ?? 0,
    pattern: lk.pattern ? PATTERN_NO[lk.pattern] : 0,
    patColor: color(lk.patColor ?? lk.trim ?? '#ffffff'),
    patSize: lk.patSize ?? 0.01,
  } : PLAIN_SPEC);
  const shells = new Map<GarmentKind, { color: string; spec: ShellSpec }>();
  let cape: ResolvedLoadout['cape'] = null;
  const rigid: { build: RigidKind; color: string; color2: string }[] = [];
  const glb: ResolvedLoadout['glb'] = [];
  const held: ResolvedLoadout['held'] = [];
  const roleLook = (r: Record<string, GlbRoleSpec>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { finish: v.finish, color: color(v.tint) }]));
  const base = { top: false, shoes: false };
  let hat: Hat = 'keiner';
  let hatColor: string | null = null, hatAccent: string | null = null;
  let under: TopUnder = 'grund';
  let coat: GarmentCtx['coat'] = 'keiner';
  let slim = false;
  for (const d of defs) {
    if (d.top) under = d.top;
    if (d.coat) coat = d.coat;
    if (d.slimUnder) slim = true;
  }
  for (const d of defs) {
    if (d.notUnderCoat && coat !== 'keiner') continue;
    pal = l.dye?.[d.id] ?? d.palette ?? ['#8A8F98', '#E3B04B'];
    for (const p of d.parts) {
      if (p.type === 'shell') shells.set(p.garment, { color: color(p.tint), spec: specOf(p.look) });
      else if (p.type === 'cape') cape = { len: p.len, color: color(p.tint), spec: specOf(p.look) };
      else if (p.type === 'base') base[p.slot] = true;
      else if (p.type === 'glb') glb.push({ model: p.model, mode: p.mode, bone: p.bone, look: roleLook(p.roles), maskAs: p.maskAs, hidesHair: p.hidesHair, trimsHair: p.trimsHair });
      else if (p.type === 'held') held.push({ model: p.model, hand: p.hand, look: roleLook(p.roles) });
      else if (p.type === 'rigid') rigid.push({ build: p.build, color: p.tint ? color(p.tint) : l.colors.belt, color2: p.tint2 ? color(p.tint2) : '#E3B04B' });
      else { hat = p.hat; hatColor = p.tint ? color(p.tint) : null; hatAccent = p.tint2 ? color(p.tint2) : null; }
    }
  }
  // unter einem Mantel tritt ein enges Hemd an die Stelle des weiten Hemds der Grundfigur
  if (slim && under === 'grund') { under = 'eng'; if (base.top) shells.set('hemd', { color: l.colors.outfit, spec: PLAIN_SPEC }); }
  if (under !== 'grund') base.top = false;
  return {
    shells: SHELL_ORDER.filter((k) => shells.has(k)).map((kind) => ({ kind, ...shells.get(kind)! })),
    cape,
    ctx: { under, coat, boots: shells.has('stiefel') },
    base, rigid, glb, held, hat, hatColor, hatAccent,
  };
}
