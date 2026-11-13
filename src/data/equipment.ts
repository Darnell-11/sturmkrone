// Ausrüstung als Daten: was an welchem Platz (Socket) der Figur sitzt und woraus es besteht.
// Neue Teile: hier eintragen. Hüllen („shell“) entstehen aus dem Körper (vroid.ts, garmentOffset), starre Teile („rigid“)
// baut animeHats.ts, Hüte ebenfalls. Das Aussehen einer Figur (CharacterLook) wird mit loadoutFromLook übersetzt.
import type { GarmentCtx, GarmentKind, TopUnder } from '../entities/character/vroid';
import type { CharacterLook, Hat } from './characterParts';

export const SOCKETS = ['head', 'chest', 'legs', 'feet', 'hands', 'mainHand', 'offHand'] as const;
export type SocketId = (typeof SOCKETS)[number];

export const SOCKET_LABEL: Record<SocketId, string> = {
  head: 'Kopf', chest: 'Oberkörper', legs: 'Beine', feet: 'Füße', hands: 'Hände', mainHand: 'Haupthand', offHand: 'Nebenhand',
};

/** Woher ein Teil seine Farbe nimmt: ein Farbfeld der Figur oder eine feste Farbe (#RRGGBB) */
export type TintSource = 'outfit' | 'accent' | 'pants' | 'shoes' | 'coat' | 'hat' | 'belt';
export type Tint = TintSource | `#${string}`;

export type RigidKind = 'knoten' | 'schnalle' | 'schulterstuecke' | 'schulterplatten';

export type EquipPart =
  /** Hülle aus dem Körper: bewegt sich mit und verdeckt, was unter ihr liegt */
  | { type: 'shell'; garment: GarmentKind; tint: Tint }
  /** sichtbares Kleidungsteil der Grundfigur (Hemd, Schuhe) */
  | { type: 'base'; slot: 'top' | 'shoes' }
  /** starres Teil auf einem Haut-Anker (tint: Farbe, wo das Teil eine hat) */
  | { type: 'rigid'; build: RigidKind; tint?: Tint }
  /** Kopfbedeckung */
  | { type: 'hat'; hat: Hat };

export interface EquipDef {
  id: string;
  /** Anzeigename */
  n: string;
  socket: SocketId;
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
const HAT_NAMES: Record<Exclude<Hat, 'keiner'>, string> = {
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
  ...(Object.keys(HAT_NAMES) as Exclude<Hat, 'keiner'>[]).map((hat): EquipDef => ({ id: hat, n: HAT_NAMES[hat], socket: 'head', parts: [{ type: 'hat', hat }] })),
];

export const EQUIP_BY_ID: Record<string, EquipDef> = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e]));

/** Was eine Figur trägt: je Socket mehrere Lagen (Hemd + Mantel), dazu ihre Farbfelder */
export interface Loadout {
  items: Record<SocketId, string[]>;
  colors: Record<TintSource, string>;
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
    if (d.socket === 'feet') items.feet = [id]; else if (!items[d.socket].includes(id)) items[d.socket].push(id);
  }
  return {
    items,
    colors: {
      outfit: look.outfitColor, accent: look.accentColor, pants: look.pantsColor, shoes: look.shoesColor, coat: look.coatColor, hat: look.hatColor,
      belt: marine ? '#2A2420' : look.accentColor,
    },
  };
}

/** Reihenfolge der Hüllen im gemeinsamen Netz (fest, damit gleiche Ausrüstung dieselbe Geometrie teilt) */
const SHELL_ORDER: GarmentKind[] = ['hose', 'ringel', 'tunika', 'jacke', 'uniform', 'hemd', 'weste', 'kuerass', 'guertel', 'schal', 'handschuhe', 'stiefel', 'beinschiene', 'mantelKurz', 'mantelLang', 'armschiene'];

export interface ResolvedLoadout {
  /** Hüllen von innen nach außen mit ihrer Farbe */
  shells: { kind: GarmentKind; color: string }[];
  /** Zusammenhang für die Abstände (was liegt unter Gürtel, Tuch und Mantel) */
  ctx: GarmentCtx;
  /** welche Kleidung der Grundfigur sichtbar bleibt */
  base: { top: boolean; shoes: boolean };
  rigid: { build: RigidKind; color: string }[];
  hat: Hat;
}

/** Ausrüstung in Bauanweisungen auflösen (unbekannte Einträge werden übersprungen) */
export function resolveLoadout(l: Loadout): ResolvedLoadout {
  const defs = SOCKETS.flatMap((s) => l.items[s] ?? []).map((id) => EQUIP_BY_ID[id]).filter((d): d is EquipDef => !!d);
  const color = (t: Tint) => (t.startsWith('#') ? t : l.colors[t as TintSource]);
  const shells = new Map<GarmentKind, string>();
  const rigid: { build: RigidKind; color: string }[] = [];
  const base = { top: false, shoes: false };
  let hat: Hat = 'keiner';
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
    for (const p of d.parts) {
      if (p.type === 'shell') shells.set(p.garment, color(p.tint));
      else if (p.type === 'base') base[p.slot] = true;
      else if (p.type === 'rigid') rigid.push({ build: p.build, color: p.tint ? color(p.tint) : l.colors.belt });
      else hat = p.hat;
    }
  }
  // unter einem Mantel tritt ein enges Hemd an die Stelle des weiten Hemds der Grundfigur
  if (slim && under === 'grund') { under = 'eng'; if (base.top) shells.set('hemd', l.colors.outfit); }
  if (under !== 'grund') base.top = false;
  return {
    shells: SHELL_ORDER.filter((k) => shells.has(k)).map((kind) => ({ kind, color: shells.get(kind)! })),
    ctx: { under, coat, boots: shells.has('stiefel') },
    base, rigid, hat,
  };
}
