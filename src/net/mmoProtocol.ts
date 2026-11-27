// Phase 4.8A – MMO-Protokoll: typisierte Pakete zwischen Spiel und Netz (rein: kein DOM, kein three.js).
//
// Das Spiel spricht nie direkt mit einem Netz, sondern schickt **Absichten** (`ClientIntent`) und bekommt **Nachrichten** (`ServerMsg`) zurück:
// Schnappschüsse der Welt im Interessenbereich (`snap`), Gruppen-Ereignisse (`party`), Chat (`chat`), Betrachten, Heilung, Segen, geteilten
// Fortschritt und Hinweise. Dieselben Pakete laufen über den lokalen Shard (`LocalShardMmoTransport`, BroadcastChannel zwischen Tabs) und
// über einen echten WebSocket-Server (`WebSocketMmoTransport`, `VITE_MMO_SERVER_URL`), dessen Logik `MmoAuthority` ist – das Spiel merkt den
// Unterschied nicht. Alles, was von außen kommt, läuft durch `cleanIntent` (Server) bzw. `cleanServerMsg` (Client): fremde Werte werden
// verworfen, Zahlen begrenzt, Texte gesäubert.
import type { PartyStance } from './partyRules';
import { PARTY_STANCES } from './partyRules';

export const MMO_PROTOCOL = 1;

/** Zahlen der MMO-Schicht (Interessenbereich, Takte, Gruppen, Chat, Reichweiten) */
export const MMO = {
  /** Interessenbereich (m): an Land / auf See */
  aoiLand: 600, aoiSea: 2400,
  /** Schnappschüsse an jeden Client (Hz), Zustand vom Client (Hz), Gruppen-Werte (Hz) */
  snapshotHz: 18, stateHz: 15, vitalsHz: 4,
  /** Interpolations-Verzug (s, ≈ zwei Schnappschüsse) und Ringpuffer-Länge */
  interpDelay: 0.12, bufferSize: 8,
  /** Gruppengröße und Einladung (s) */
  partyMin: 2, partyMax: 5, inviteTime: 30,
  /** Kriegsausbruch in einer Gruppe: Schutzfrist (s), höchstens bis zum Ende des laufenden Gefechts */
  warGrace: 30, warGraceMax: 120,
  /** Sagen-Reichweite (m) an Land / auf See */
  sayLand: 80, saySea: 350,
  chatMax: 200, chatLog: 120,
  /** Spam-Schutz: höchstens so viele Nachrichten je Fenster (s) */
  chatBurst: 6, chatWindow: 6,
  /** Herzschlag (s), Abbruch ohne Lebenszeichen (s), Wiederverbinden (s) */
  heartbeat: 5, timeout: 15, reconnectMin: 1, reconnectMax: 15,
  /** Heilung und Sturmhorn (m), geteilter Fortschritt (m), Mitfahrt (m), PvP-Schussweite (m) */
  healRange: 40, hornRange: 40, shareLand: 600, shareSea: 2400, rideRange: 160, hitRange: 650,
  /** Taste R antwortet nur auf ein frisches Flüstern (s) */
  replyWindow: 20,
  /** vorab angelegte Figuren und höchstens so viele Mitspieler-Schiffe in 3D */
  rigPool: 8, shipPool: 8,
  /** Figuren werden bis hierhin gezeichnet (m, höchstens die Figuren-Sichtweite der Grafikstufe); Schiffe entstehen in 3D ab `shipShow` und
   *  bleiben bis `shipHide` (wie die übrigen Live-Schiffe der Welt, 1 500 / 1 900 m) – der Interessenbereich (2 400 m) gilt für Netz und Karte */
  rigShow: 160, shipShow: 1500, shipHide: 1900,
  nameMax: 32,
} as const;

export type MmoDomain = 'land' | 'sea';
export type ChatChannel = 'sagen' | 'gruppe' | 'fluestern' | 'welt' | 'system';
export const CHAT_CHANNELS: readonly ChatChannel[] = ['sagen', 'gruppe', 'fluestern', 'welt', 'system'];
export type ShareKind = 'kill' | 'sink' | 'merit';

/** Steckbrief eines Spielers (ändert sich selten: Stufe, Team, Ausrüstung) */
export interface PlayerProfile {
  id: string;
  name: string;
  level: number;
  /** Grundklasse und Spezialisierung ('' = noch offen), Rolle („Kombo-DPS“, „DPS/Heal“ …) und Anzeige „Schwertkämpfer · Säbel“ */
  base: string;
  spec: string;
  role: string;
  classLabel: string;
  /** Team (Nation) – '' = ungebunden (vor dem Rat der Gesandten) */
  team: string;
  /** Ausrüstungs-Stufe 1 … 5 und Schiff (Klasse 0 … 6, Name) */
  gearTier: number;
  shipTier: number;
  shipName: string;
  gender: 'm' | 'w';
  /** Startwert der Figur (Platz im Figuren-Pool) */
  look: number;
  /** Stellvertreter des lokalen Shards */
  bot: boolean;
}

/** Zustand eines Spielers (15 Hz vom Client) */
export interface PlayerState {
  x: number; y: number; z: number; yaw: number;
  dom: MmoDomain;
  /** Tempo (m/s) – Gehen/Laufen der Figur bzw. Fahrt des Schiffs */
  spd: number;
  /** Schiff: Kurs, Rumpf (für Spieler gegen Spieler) */
  hdg: number; hull: number; mhull: number;
  hp: number; mhp: number; will: number; mwill: number;
  /** fährt an Bord des Schiffs dieses Spielers mit ('' = nein); Lage relativ zum Deck */
  ride: string; rx: number; ry: number; rz: number;
  /** im Gefecht (verlängert die Schutzfrist bei Kriegsausbruch) */
  combat: boolean;
  /** Ort für das Gruppenfenster („Ankerglück“, „Bernsteinsee“) */
  zone: string;
}

/** Eintrag eines Schnappschusses: Zustand plus Kennung und Version des Steckbriefs */
export interface SnapEntry extends PlayerState { id: string; pv: number }

export interface PartyMember { id: string; name: string; level: number; spec: string; role: string; team: string; bot: boolean }
export interface PartyView { id: string; leader: string; members: PartyMember[] }
export interface VitalEntry { id: string; hp: number; mhp: number; will: number; mwill: number; x: number; z: number; dom: MmoDomain; zone: string; ride: string }
export interface ChatMessage { ch: ChatChannel; from: string; name: string; to: string; toName: string; text: string; t: number }

export type PartyEvent =
  | { e: 'invite'; party: string; from: string; name: string; level: number; team: string; left: number }
  | { e: 'sent'; to: string; name: string }
  | { e: 'declined'; by: string; name: string; why: string }
  | { e: 'expired'; party: string; name: string }
  | { e: 'state'; party: PartyView | null }
  | { e: 'warn'; left: number; a: string; b: string; ids: string[]; fight: boolean }
  | { e: 'calm' }
  | { e: 'removed'; why: string };

export interface HelloIntent { k: 'hello'; v: number; profile: PlayerProfile; state: PlayerState }

export type ClientIntent =
  | HelloIntent
  | { k: 'state'; s: PlayerState }
  | { k: 'profile'; profile: PlayerProfile }
  | { k: 'chat'; ch: Exclude<ChatChannel, 'system'>; text: string; to: string }
  | { k: 'invite'; to: string }
  | { k: 'reply'; party: string; accept: boolean }
  | { k: 'leave' }
  | { k: 'kick'; id: string }
  | { k: 'promote'; id: string }
  | { k: 'inspect'; id: string }
  | { k: 'heal'; to: string; frac: number }
  | { k: 'horn'; x: number; z: number; heal: number; will: number }
  | { k: 'share'; what: ShareKind; ref: string; amount: number; x: number; z: number }
  | { k: 'ride'; ship: string; rx: number; ry: number; rz: number }
  | { k: 'unride' }
  | { k: 'hit'; to: string; dmg: number }
  | { k: 'ping'; t: number }
  | { k: 'bye' };

export interface InspectInfo { profile: PlayerProfile; stance: PartyStance; zone: string; dist: number; party: boolean }

export type ServerMsg =
  | { k: 'welcome'; id: string; shard: string; t: number }
  | { k: 'snap'; t: number; seq: number; list: SnapEntry[] }
  | { k: 'profiles'; list: (PlayerProfile & { pv: number })[] }
  | { k: 'gone'; id: string }
  | { k: 'party'; ev: PartyEvent }
  | { k: 'vitals'; list: VitalEntry[] }
  | { k: 'chat'; msg: ChatMessage }
  | { k: 'inspect'; info: InspectInfo }
  | { k: 'heal'; from: string; name: string; frac: number }
  | { k: 'horn'; from: string; name: string; heal: number; will: number }
  | { k: 'share'; from: string; name: string; what: ShareKind; ref: string; amount: number }
  | { k: 'hit'; from: string; name: string; dmg: number }
  | { k: 'ride'; ok: boolean; ship: string; text: string }
  | { k: 'notice'; text: string; tone: 'info' | 'warn' | 'error' }
  | { k: 'pong'; t: number; st: number };

// ---------------------------------------------------------------------------------------------------------------
// Interessenbereich und Reichweiten
// ---------------------------------------------------------------------------------------------------------------

/** Sichtweite zwischen zwei Spielern: Schiffe (oder ein Betrachter auf See) bis 2 400 m, Figuren an Land bis 600 m */
export const aoiRadius = (viewer: MmoDomain, other: MmoDomain): number => (viewer === 'sea' || other === 'sea' ? MMO.aoiSea : MMO.aoiLand);
/** Sagen-Reichweite nach dem Ort des Sprechers */
export const sayRadius = (dom: MmoDomain): number => (dom === 'sea' ? MMO.saySea : MMO.sayLand);
/** Reichweite des geteilten Fortschritts */
export const shareRadius = (dom: MmoDomain): number => (dom === 'sea' ? MMO.shareSea : MMO.shareLand);

// ---------------------------------------------------------------------------------------------------------------
// Neue, leere Werte
// ---------------------------------------------------------------------------------------------------------------

export function newPlayerState(): PlayerState {
  return { x: 0, y: 0, z: 0, yaw: 0, dom: 'land', spd: 0, hdg: 0, hull: 0, mhull: 0, hp: 1, mhp: 1, will: 0, mwill: 100, ride: '', rx: 0, ry: 0, rz: 0, combat: false, zone: '' };
}

export function newProfile(id = ''): PlayerProfile {
  return { id, name: 'Kapitän', level: 1, base: '', spec: '', role: '', classLabel: '', team: '', gearTier: 1, shipTier: 0, shipName: '', gender: 'm', look: 0, bot: false };
}

export function copyState(src: PlayerState, dst: PlayerState): PlayerState {
  dst.x = src.x; dst.y = src.y; dst.z = src.z; dst.yaw = src.yaw; dst.dom = src.dom; dst.spd = src.spd;
  dst.hdg = src.hdg; dst.hull = src.hull; dst.mhull = src.mhull; dst.hp = src.hp; dst.mhp = src.mhp; dst.will = src.will; dst.mwill = src.mwill;
  dst.ride = src.ride; dst.rx = src.rx; dst.ry = src.ry; dst.rz = src.rz; dst.combat = src.combat; dst.zone = src.zone;
  return dst;
}

// ---------------------------------------------------------------------------------------------------------------
// Säubern (alles, was über ein Netz kommt)
// ---------------------------------------------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const str = (v: unknown, max: number, d = ''): string => (typeof v === 'string' ? v.slice(0, max) : d);
const bool = (v: unknown): boolean => v === true;
const W = 40000;

/** Text für den Chat säubern: Steuerzeichen raus, Leerraum zusammenfassen, Länge begrenzen */
export function cleanText(v: unknown, max: number = MMO.chatMax): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Kennung (Spieler, Gruppe): kurze, harmlose Zeichenkette */
export function cleanId(v: unknown): string {
  return typeof v === 'string' && /^[\w:.-]{1,48}$/.test(v) ? v : '';
}

export function cleanProfile(raw: unknown): PlayerProfile | null {
  if (!isRec(raw)) return null;
  const id = cleanId(raw.id);
  if (!id) return null;
  return {
    id,
    name: cleanText(raw.name, MMO.nameMax) || 'Kapitän',
    level: Math.round(num(raw.level, 1, 1, 101)),
    base: str(raw.base, 12), spec: str(raw.spec, 16), role: str(raw.role, 20), classLabel: cleanText(raw.classLabel, 48),
    team: str(raw.team, 16),
    gearTier: Math.round(num(raw.gearTier, 1, 1, 6)),
    shipTier: Math.round(num(raw.shipTier, 0, 0, 6)),
    shipName: cleanText(raw.shipName, 32),
    gender: raw.gender === 'w' ? 'w' : 'm',
    look: Math.round(num(raw.look, 0, 0, 2 ** 31)),
    bot: bool(raw.bot),
  };
}

export function cleanState(raw: unknown, out: PlayerState = newPlayerState()): PlayerState | null {
  if (!isRec(raw)) return null;
  out.x = num(raw.x, 0, -W, W); out.y = num(raw.y, 0, -200, 400); out.z = num(raw.z, 0, -W, W);
  out.yaw = num(raw.yaw, 0, -100, 100); out.dom = raw.dom === 'sea' ? 'sea' : 'land'; out.spd = num(raw.spd, 0, 0, 80);
  out.hdg = num(raw.hdg, 0, -100, 100); out.hull = num(raw.hull, 0, 0, 1e6); out.mhull = num(raw.mhull, 0, 0, 1e6);
  out.mhp = num(raw.mhp, 1, 1, 1e7); out.hp = num(raw.hp, out.mhp, 0, out.mhp); out.mwill = num(raw.mwill, 100, 1, 1000); out.will = num(raw.will, 0, 0, out.mwill);
  out.ride = cleanId(raw.ride); out.rx = num(raw.rx, 0, -40, 40); out.ry = num(raw.ry, 0, -10, 20); out.rz = num(raw.rz, 0, -40, 40);
  out.combat = bool(raw.combat); out.zone = cleanText(raw.zone, 40);
  return out;
}

const SEND_CH: readonly string[] = ['sagen', 'gruppe', 'fluestern', 'welt'];
const SHARES: readonly string[] = ['kill', 'sink', 'merit'];

/** Absicht eines Clients prüfen (Server-Seite); null = verwerfen */
export function cleanIntent(raw: unknown): ClientIntent | null {
  if (!isRec(raw) || typeof raw.k !== 'string') return null;
  switch (raw.k) {
    case 'hello': {
      const profile = cleanProfile(raw.profile), state = cleanState(raw.state);
      return profile && state ? { k: 'hello', v: Math.round(num(raw.v, 0, 0, 1e6)), profile, state } : null;
    }
    case 'state': { const s = cleanState(raw.s); return s ? { k: 'state', s } : null; }
    case 'profile': { const p = cleanProfile(raw.profile); return p ? { k: 'profile', profile: p } : null; }
    case 'chat': {
      if (!SEND_CH.includes(raw.ch as string)) return null;
      const text = cleanText(raw.text);
      return text ? { k: 'chat', ch: raw.ch as Exclude<ChatChannel, 'system'>, text, to: cleanText(raw.to, MMO.nameMax + 16) } : null;
    }
    case 'invite': { const to = cleanText(raw.to, MMO.nameMax + 16); return to ? { k: 'invite', to } : null; }
    case 'reply': { const party = cleanId(raw.party); return party ? { k: 'reply', party, accept: bool(raw.accept) } : null; }
    case 'leave': return { k: 'leave' };
    case 'kick': case 'promote': case 'inspect': { const id = cleanId(raw.id); return id ? { k: raw.k, id } : null; }
    case 'heal': { const to = cleanId(raw.to); return to ? { k: 'heal', to, frac: num(raw.frac, 0, 0, 0.6) } : null; }
    case 'horn': return { k: 'horn', x: num(raw.x, 0, -W, W), z: num(raw.z, 0, -W, W), heal: num(raw.heal, 0, 0, 0.5), will: num(raw.will, 0, 0, 100) };
    case 'share': return SHARES.includes(raw.what as string)
      ? { k: 'share', what: raw.what as ShareKind, ref: cleanText(raw.ref, 32), amount: num(raw.amount, 1, 0, 1000), x: num(raw.x, 0, -W, W), z: num(raw.z, 0, -W, W) } : null;
    case 'ride': { const ship = cleanId(raw.ship); return ship ? { k: 'ride', ship, rx: num(raw.rx, 0, -40, 40), ry: num(raw.ry, 0, -10, 20), rz: num(raw.rz, 0, -40, 40) } : null; }
    case 'unride': return { k: 'unride' };
    case 'hit': { const to = cleanId(raw.to); return to ? { k: 'hit', to, dmg: num(raw.dmg, 0, 0, 5000) } : null; }
    case 'ping': return { k: 'ping', t: num(raw.t, 0, 0, 1e13) };
    case 'bye': return { k: 'bye' };
    default: return null;
  }
}

const cleanMember = (r: unknown): PartyMember | null => {
  if (!isRec(r)) return null;
  const id = cleanId(r.id);
  return id ? { id, name: cleanText(r.name, MMO.nameMax) || 'Kapitän', level: Math.round(num(r.level, 1, 1, 101)), spec: str(r.spec, 16), role: str(r.role, 20), team: str(r.team, 16), bot: bool(r.bot) } : null;
};

function cleanPartyEvent(r: unknown): PartyEvent | null {
  if (!isRec(r)) return null;
  switch (r.e) {
    case 'invite': { const party = cleanId(r.party), from = cleanId(r.from); return party && from ? { e: 'invite', party, from, name: cleanText(r.name, MMO.nameMax), level: Math.round(num(r.level, 1, 1, 101)), team: str(r.team, 16), left: num(r.left, MMO.inviteTime, 0, 120) } : null; }
    case 'sent': return { e: 'sent', to: cleanId(r.to), name: cleanText(r.name, MMO.nameMax) };
    case 'declined': return { e: 'declined', by: cleanId(r.by), name: cleanText(r.name, MMO.nameMax), why: cleanText(r.why, 120) };
    case 'expired': return { e: 'expired', party: cleanId(r.party), name: cleanText(r.name, MMO.nameMax) };
    case 'state': {
      if (r.party === null) return { e: 'state', party: null };
      const p = r.party;
      if (!isRec(p) || !Array.isArray(p.members)) return null;
      const members = p.members.slice(0, MMO.partyMax).map(cleanMember).filter((m): m is PartyMember => !!m);
      const id = cleanId(p.id), leader = cleanId(p.leader);
      return id && leader ? { e: 'state', party: { id, leader, members } } : null;
    }
    case 'warn': return { e: 'warn', left: num(r.left, 0, 0, 600), a: str(r.a, 16), b: str(r.b, 16), ids: Array.isArray(r.ids) ? r.ids.map(cleanId).filter(Boolean).slice(0, MMO.partyMax) : [], fight: bool(r.fight) };
    case 'calm': return { e: 'calm' };
    case 'removed': return { e: 'removed', why: cleanText(r.why, 160) };
    default: return null;
  }
}

/** Nachricht des Servers prüfen (Client-Seite); null = verwerfen */
export function cleanServerMsg(raw: unknown): ServerMsg | null {
  if (!isRec(raw) || typeof raw.k !== 'string') return null;
  switch (raw.k) {
    case 'welcome': { const id = cleanId(raw.id); return id ? { k: 'welcome', id, shard: cleanText(raw.shard, 40), t: num(raw.t, 0, 0, 1e13) } : null; }
    case 'snap': {
      if (!Array.isArray(raw.list)) return null;
      const list: SnapEntry[] = [];
      for (const e of raw.list.slice(0, 256)) {
        if (!isRec(e)) continue;
        const id = cleanId(e.id);
        if (!id) continue;
        const s = cleanState(e);
        if (s) list.push(Object.assign(s, { id, pv: Math.round(num(e.pv, 0, 0, 1e9)) }));
      }
      return { k: 'snap', t: num(raw.t, 0, 0, 1e13), seq: Math.round(num(raw.seq, 0, 0, 1e12)), list };
    }
    case 'profiles': {
      if (!Array.isArray(raw.list)) return null;
      const list: (PlayerProfile & { pv: number })[] = [];
      for (const e of raw.list.slice(0, 256)) { const p = cleanProfile(e); if (p) list.push(Object.assign(p, { pv: Math.round(num((e as Rec).pv, 0, 0, 1e9)) })); }
      return { k: 'profiles', list };
    }
    case 'gone': { const id = cleanId(raw.id); return id ? { k: 'gone', id } : null; }
    case 'party': { const ev = cleanPartyEvent(raw.ev); return ev ? { k: 'party', ev } : null; }
    case 'vitals': {
      if (!Array.isArray(raw.list)) return null;
      const list: VitalEntry[] = [];
      for (const e of raw.list.slice(0, MMO.partyMax)) {
        if (!isRec(e)) continue;
        const id = cleanId(e.id);
        if (!id) continue;
        const mhp = num(e.mhp, 1, 1, 1e7), mwill = num(e.mwill, 100, 1, 1000);
        list.push({ id, mhp, hp: num(e.hp, mhp, 0, mhp), mwill, will: num(e.will, 0, 0, mwill), x: num(e.x, 0, -W, W), z: num(e.z, 0, -W, W), dom: e.dom === 'sea' ? 'sea' : 'land', zone: cleanText(e.zone, 40), ride: cleanId(e.ride) });
      }
      return { k: 'vitals', list };
    }
    case 'chat': {
      const m = raw.msg;
      if (!isRec(m) || !CHAT_CHANNELS.includes(m.ch as ChatChannel)) return null;
      const text = cleanText(m.text);
      return text ? { k: 'chat', msg: { ch: m.ch as ChatChannel, from: cleanId(m.from), name: cleanText(m.name, MMO.nameMax), to: cleanId(m.to), toName: cleanText(m.toName, MMO.nameMax), text, t: num(m.t, 0, 0, 1e13) } } : null;
    }
    case 'inspect': {
      const i = raw.info;
      if (!isRec(i)) return null;
      const profile = cleanProfile(i.profile);
      const stance = PARTY_STANCES.includes(i.stance as PartyStance) ? (i.stance as PartyStance) : 'neutral';
      return profile ? { k: 'inspect', info: { profile, stance, zone: cleanText(i.zone, 40), dist: num(i.dist, 0, 0, 1e6), party: bool(i.party) } } : null;
    }
    case 'heal': return { k: 'heal', from: cleanId(raw.from), name: cleanText(raw.name, MMO.nameMax), frac: num(raw.frac, 0, 0, 0.6) };
    case 'horn': return { k: 'horn', from: cleanId(raw.from), name: cleanText(raw.name, MMO.nameMax), heal: num(raw.heal, 0, 0, 0.5), will: num(raw.will, 0, 0, 100) };
    case 'share': return SHARES.includes(raw.what as string) ? { k: 'share', from: cleanId(raw.from), name: cleanText(raw.name, MMO.nameMax), what: raw.what as ShareKind, ref: cleanText(raw.ref, 32), amount: num(raw.amount, 1, 0, 1000) } : null;
    case 'hit': return { k: 'hit', from: cleanId(raw.from), name: cleanText(raw.name, MMO.nameMax), dmg: num(raw.dmg, 0, 0, 5000) };
    case 'ride': return { k: 'ride', ok: bool(raw.ok), ship: cleanId(raw.ship), text: cleanText(raw.text, 160) };
    case 'notice': return { k: 'notice', text: cleanText(raw.text, 200), tone: raw.tone === 'warn' || raw.tone === 'error' ? raw.tone : 'info' };
    case 'pong': return { k: 'pong', t: num(raw.t, 0, 0, 1e13), st: num(raw.st, 0, 0, 1e13) };
    default: return null;
  }
}

/** Paket → Text (WebSocket); höchstens 64 KB */
export function encodePacket(p: ClientIntent | ServerMsg): string {
  const s = JSON.stringify(p);
  return s.length <= 65536 ? s : JSON.stringify({ k: 'notice', text: 'Paket zu groß', tone: 'error' });
}

/** Text → rohes Objekt (noch ungeprüft); null bei kaputtem JSON oder Übergröße */
export function decodePacket(text: unknown): unknown {
  if (typeof text !== 'string' || text.length > 65536) return null;
  try { return JSON.parse(text) as unknown; } catch { return null; }
}
