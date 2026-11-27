// Phase 4.8A – autoritativer Shard (rein: kein DOM, kein three.js). Dieselbe Klasse läuft im lokalen Shard (ein Browser-Tab leitet, die
// anderen sprechen über BroadcastChannel mit ihm) und später auf einem echten WebSocket-Server – sie bekommt nur Absichten (`ClientIntent`)
// und verschickt Nachrichten (`ServerMsg`) über `out(empfänger, nachricht)`.
//
// Was hier entschieden wird (nie im Client):
// - **Interessenbereich:** jeder Client bekommt 18× je Sekunde einen Schnappschuss der Spieler in seiner Nähe (600 m an Land, 2 400 m auf See);
//   Steckbriefe nur, wenn sie neu sind oder sich geändert haben. Wiederverwendete Einträge je Empfänger (keine Speicheranforderung je Takt).
// - **Gruppen (2 – 5):** Einladung mit 30-s-Frist, Annehmen/Ablehnen, Verlassen (die Krone geht an das nächste Mitglied, unter zwei löst sich
//   die Gruppe auf), Entfernen, Anführer ernennen – zugelassen nur, wenn die Welt-KI zwischen allen Nationen keinen Krieg meldet.
// - **Kriegsausbruch:** erklärt die Welt-KI Krieg zwischen Nationen einer bestehenden Gruppe, beginnt eine 30-s-Schutzfrist (verlängert bis zum
//   Ende eines laufenden Gefechts, höchstens 120 s), danach verlassen verfeindete Mitglieder die Gruppe.
// - **Chat:** Sagen (Umkreis), Gruppe, Flüstern (Name oder Kennung), Welt; Spam-Schutz.
// - **Heilung, Sturmhorn, geteilter Fortschritt, Mitfahrt, Spieler gegen Spieler:** geprüft nach Gruppe, Diplomatie, Reichweite und Schutzzonen.
// - **4.9 geteilte Gegner:** Kennung, Besitzer, Leben, Aggro, Übergabe und Gutschrift (`net/worldEntitySync.ts`), Schnappschüsse 8× je Sekunde;
//   **Kampf-Aktionen** (Breitseiten, Formen, Geistes-Faji, Heilungen, Ultimates) gehen zur Darstellung an alle in der Nähe.
import {
  MMO, aoiRadius, copyState, newPlayerState, sayRadius, shareRadius,
  type ActNet, type ChatChannel, type ChatMessage, type ClientIntent, type EntNet, type EntSpawnNet, type FoeHitNet, type LootItemNet, type RollChoice, type PartyEvent, type PartyView, type PlayerProfile,
  type PlayerState, type ServerMsg, type ShareKind, type SnapEntry, type VitalEntry,
} from './mmoProtocol';
import { SharedEntityRegistry, type EntPeer, type SharedEnt } from './worldEntitySync';
import { alliedStance, groupAllowed, partyConflicts, pvpBlock, rideValid, type PartyStance } from './partyRules';
import { botChoice, chooseRoll, createRoll, lootRadius, needBlock, passOpen, resolveRoll, rollReady, rollsFor, splitEven, type RollEntry, type RollSession } from './groupLoot';
import { pvpLandDamage } from '../data/balanceConfig';

/** Haltung zweier Teams nach der Welt-KI ('' = ungebunden) */
export interface DiplomacyOracle { stance(teamA: string, teamB: string): PartyStance }
/** Schutzzone an einem Ort ('' = keine, sonst ihr Name) */
export interface ZoneOracle { safeAt(x: number, z: number): string }
export type Outbox = (to: string, msg: ServerMsg) => void;

/** Rückmeldungen an die Stellvertreter (Bots) des lokalen Shards */
export interface AuthorityHooks {
  invited?(botId: string, party: string, from: string, t: number): void;
  whispered?(botId: string, from: string, text: string, t: number): void;
  said?(botId: string, from: string, text: string, t: number): void;
  healed?(botId: string, frac: number): void;
  horned?(botId: string, heal: number, will: number): void;
  hit?(botId: string, from: string, dmg: number): void;
  partyChanged?(party: PartyView | null, ids: readonly string[]): void;
}

interface WarnRec { since: number; until: number; ids: string[]; a: string; b: string; fight: boolean; sent: number }
interface PartyRec {
  id: string; leader: string; members: string[]; warn: WarnRec | null; vitals: VitalEntry[]; vpool: VitalEntry[]; vmsg: { k: 'vitals'; list: VitalEntry[] };
  /** 4.8B: nächster Empfänger für gewöhnliche Stücke (reihum) */
  rr: number;
}
interface InviteRec { party: string; from: string; to: string; until: number }

interface Peer {
  id: string;
  profile: PlayerProfile;
  pv: number;
  readonly state: PlayerState;
  joined: number;
  seen: number;
  party: PartyRec | null;
  /** vorgemerkte Gruppen-Kennung, solange man noch allein einlädt */
  reserve: string;
  /** Versionen der Steckbriefe, die dieser Empfänger schon kennt */
  readonly known: Map<string, number>;
  readonly snap: { k: 'snap'; t: number; seq: number; list: SnapEntry[] };
  readonly pool: SnapEntry[];
  readonly chatT: number[];
  /** Schiff, auf dem die Mitfahrt erlaubt ist ('' = keines) */
  rideOk: string;
  bot: boolean;
  hitNoteT: number;
  /** 4.9: Schnappschuss der geteilten Gegner (wiederverwendete Einträge) und Zeitstempel der letzten Kampf-Aktionen (Spam-Schutz) */
  readonly ents: { k: 'ents'; t: number; list: EntNet[] };
  readonly entPool: EntNet[];
  readonly actT: number[];
}

const dist = (a: PlayerState, b: PlayerState) => Math.hypot(a.x - b.x, a.z - b.z);
const lower = (s: string) => s.toLocaleLowerCase('de-DE');

export class MmoAuthority {
  readonly peers = new Map<string, Peer>();
  /** dieselben Spieler als Liste (Durchlauf je Takt ohne Iterator) */
  readonly list: Peer[] = [];
  readonly parties = new Map<string, PartyRec>();
  private invites: InviteRec[] = [];
  private seq = 0;
  private partySeq = 0;
  private snapAcc = 0;
  private vitalsAcc = 0;
  private warAcc = 0;
  private lastT = Number.NaN;
  private readonly conf: string[] = [];
  private readonly order: string[] = [];
  private readonly drop: string[] = [];
  hooks: AuthorityHooks = {};
  /** Zahlen für Prüfungen */
  readonly stats = { snaps: 0, chats: 0, invites: 0, parties: 0, removedByWar: 0, loot: 0, rolls: 0, rollsDone: 0, landHits: 0 };
  /** 4.8B: offene Würfel-Sitzungen (autoritativ: nur hier wird gewürfelt) */
  readonly rolls: RollSession[] = [];
  private rollSeq = 0;
  /** Würfel des Shards (Prüfungen setzen einen festen Zufall) */
  rng: () => number = Math.random;
  private readonly shares: number[] = [];
  private readonly repShares: number[] = [];
  private readonly near: Peer[] = [];
  /** 4.9: geteilte Gegner der offenen Welt (autoritativ: Kennung, Besitzer, Leben, Aggro, Gutschrift) */
  readonly entities = new SharedEntityRegistry();
  private entAcc = 0;
  private readonly entPeers: EntPeer[] = [];
  private readonly entNear: SharedEnt[] = [];
  private readonly credits: string[] = [];

  private readonly diplo: DiplomacyOracle;
  private readonly zones: ZoneOracle;
  private readonly out: Outbox;
  private readonly nationName: (team: string) => string;
  readonly shard: string;

  // ohne Parameter-Eigenschaften: der Relay-Server (`server/mmoRelayServer.mjs`) lädt diese Datei in Node mit reinem Typen-Abstreifen
  constructor(diplo: DiplomacyOracle, zones: ZoneOracle, out: Outbox, nationName: (team: string) => string = (t) => t || 'Ungebunden', shard = 'Bernsteinsee 1') {
    this.diplo = diplo; this.zones = zones; this.out = out; this.nationName = nationName; this.shard = shard;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Spieler kommen und gehen
  // ---------------------------------------------------------------------------------------------------------------

  /** Spieler betritt den Shard (bzw. meldet sich nach einem Wechsel der Shard-Leitung neu) */
  join(profile: PlayerProfile, state: PlayerState, t: number): void {
    const old = this.peers.get(profile.id);
    if (old) {
      old.profile = { ...profile }; old.pv++; copyState(state, old.state); old.seen = t;
      if (!old.bot) this.out(old.id, { k: 'welcome', id: old.id, shard: this.shard, t });
      return;
    }
    const p: Peer = {
      id: profile.id, profile: { ...profile }, pv: 1, state: copyState(state, newPlayerState()), joined: t, seen: t, party: null, reserve: '',
      known: new Map(), snap: { k: 'snap', t: 0, seq: 0, list: [] }, pool: [], chatT: [], rideOk: '', bot: profile.bot, hitNoteT: -99,
      ents: { k: 'ents', t: 0, list: [] }, entPool: [], actT: [],
    };
    p.state.ride = '';
    this.peers.set(p.id, p);
    this.list.push(p);
    if (!p.bot) this.out(p.id, { k: 'welcome', id: p.id, shard: this.shard, t });
  }

  /** Spieler verlässt den Shard (Tab zu, Verbindung weg, Zeitüberschreitung) */
  leave(id: string, t: number): void {
    const p = this.peers.get(id);
    if (!p) return;
    for (const s of this.rolls) passOpen(s, id);
    // 4.9: seine geteilten Gegner übernimmt beim nächsten Takt der nächste Spieler in Reichweite
    this.entities.forget(id);
    if (p.party) this.removeMember(p, '', t, true);
    for (let k = this.invites.length - 1; k >= 0; k--) {
      const iv = this.invites[k];
      if (iv.from !== id && iv.to !== id) continue;
      this.invites.splice(k, 1);
      const other = this.peers.get(iv.from === id ? iv.to : iv.from);
      if (other && !other.bot) this.out(other.id, { k: 'party', ev: { e: 'expired', party: iv.party, name: p.profile.name } });
    }
    this.peers.delete(id);
    const li = this.list.indexOf(p);
    if (li >= 0) this.list.splice(li, 1);
    for (const o of this.list) {
      if (o.known.delete(id) && !o.bot) this.out(o.id, { k: 'gone', id });
      if (o.rideOk === id) { o.rideOk = ''; o.state.ride = ''; if (!o.bot) this.out(o.id, { k: 'ride', ok: false, ship: id, text: 'Das Schiff des Anführers hat die See verlassen.' }); }
    }
  }

  /** Eine Absicht eines Clients (bereits durch `cleanIntent`) */
  handle(from: string, i: ClientIntent, t: number): void {
    if (i.k === 'hello') { this.join({ ...i.profile, id: from }, i.state, t); return; }
    const p = this.peers.get(from);
    if (!p) return;
    p.seen = t;
    switch (i.k) {
      case 'state': this.setState(p, i.s); break;
      case 'profile': p.profile = { ...i.profile, id: p.id, bot: p.bot }; p.pv++; if (p.party) this.broadcastParty(p.party); break;
      case 'chat': this.chat(p, i.ch, i.text, i.to, t); break;
      case 'invite': this.invite(p, i.to, t); break;
      case 'reply': this.reply(p, i.party, i.accept, t); break;
      case 'leave': if (p.party) this.removeMember(p, '', t, true); else this.notice(p, 'Du bist in keiner Gruppe.'); break;
      case 'kick': this.kick(p, i.id, t); break;
      case 'promote': this.promote(p, i.id); break;
      case 'inspect': this.inspect(p, i.id); break;
      case 'heal': this.heal(p, i.to, i.frac); break;
      case 'horn': this.horn(p, i.x, i.z, i.heal, i.will); break;
      case 'share': this.share(p, i.what, i.ref, i.amount); break;
      case 'ride': this.ride(p, i.ship, i.rx, i.ry, i.rz); break;
      case 'unride': p.rideOk = ''; p.state.ride = ''; break;
      case 'hit': this.hit(p, i.to, i.dmg, i.land, t); break;
      case 'loot': this.loot(p, i.gold, i.rep, i.power, i.items, t); break;
      case 'roll': this.roll(p, i.id, i.choice, t); break;
      case 'eclaim': this.entClaim(p, i.e, t); break;
      case 'estate': for (const s of i.list) this.entities.report(p.id, s, t); break;
      case 'ehit': this.entHit(p, i.id, i.dmg, i.ammo, i.zone, i.pen, i.applied, i.foe); break;
      case 'edead': this.entDead(p, i.id, i.by, t); break;
      case 'erelease': this.entities.release(p.id, i.id, t); break;
      case 'ephit': this.entPlayerHit(p, i.id, i.to, i.dmg, i.pen); break;
      case 'act': this.act(p, i.a, t); break;
      case 'ping': if (!p.bot) this.out(p.id, { k: 'pong', t: i.t, st: t }); break;
      case 'bye': this.leave(p.id, t); break;
      // nur für den Relay-Server (Startbildschirm-Wächter, Diplomatie-Bericht): hier nichts zu tun
      case 'watch': case 'diplo': break;
    }
  }

  /** Zustand übernehmen; eine Mitfahrt gilt nur, wenn der Shard sie erlaubt hat */
  private setState(p: Peer, s: PlayerState) {
    copyState(s, p.state);
    if (p.state.ride && p.state.ride !== p.rideOk) p.state.ride = '';
  }

  /** Lebenszeichen ohne Paket (der leitende Tab hält seinen eigenen Kapitän, auch wenn die Spielschleife ruht: Hintergrund-Tab) */
  touch(id: string, t: number) { const p = this.peers.get(id); if (p) p.seen = t; }
  has(id: string): boolean { return this.peers.has(id); }

  /** Direkter Zugriff auf den Zustand eines Stellvertreters (lokaler Shard: Bots schreiben ihn je Takt ohne Pakete) */
  botState(id: string): PlayerState | null { const p = this.peers.get(id); return p?.bot ? p.state : null; }
  /** Mitfahrt eines Stellvertreters direkt erlauben (Bots steigen beim Anführer zu) */
  botRide(id: string, ship: string) { const p = this.peers.get(id); if (p?.bot) { p.rideOk = ship; p.state.ride = ship; } }

  // ---------------------------------------------------------------------------------------------------------------
  // Takt
  // ---------------------------------------------------------------------------------------------------------------

  /** Je Takt (Zeit in s): Einladungen, Zeitüberschreitungen, Kriegsausbruch, Schnappschüsse, Gruppen-Werte */
  tick(t: number): void {
    const dt = Number.isFinite(this.lastT) ? Math.min(0.5, Math.max(0, t - this.lastT)) : 0;
    this.lastT = t;
    for (let k = this.invites.length - 1; k >= 0; k--) {
      const iv = this.invites[k];
      if (t < iv.until) continue;
      this.invites.splice(k, 1);
      const a = this.peers.get(iv.from), b = this.peers.get(iv.to);
      if (a && !a.bot) this.out(a.id, { k: 'party', ev: { e: 'expired', party: iv.party, name: b?.profile.name ?? '' } });
      if (b && !b.bot) this.out(b.id, { k: 'party', ev: { e: 'expired', party: iv.party, name: a?.profile.name ?? '' } });
    }
    this.drop.length = 0;
    for (const p of this.list) if (!p.bot && t - p.seen > MMO.timeout) this.drop.push(p.id);
    for (const id of this.drop) this.leave(id, t);
    this.warAcc += dt;
    if (this.warAcc >= 0.5) { this.warAcc = 0; this.checkWars(t); }
    for (let k = this.rolls.length - 1; k >= 0; k--) if (rollReady(this.rolls[k], t)) this.finishRoll(this.rolls[k], t);
    this.snapAcc += dt;
    if (this.snapAcc >= 1 / MMO.snapshotHz) { this.snapAcc = Math.min(this.snapAcc - 1 / MMO.snapshotHz, 1 / MMO.snapshotHz); this.snapshots(t); }
    this.vitalsAcc += dt;
    if (this.vitalsAcc >= 1 / MMO.vitalsHz) { this.vitalsAcc = 0; this.sendVitals(); }
    this.entAcc += dt;
    if (this.entAcc >= 1 / MMO.entHz) { this.entAcc = 0; this.entTick(t); }
  }

  /** Schnappschüsse: je Empfänger die Spieler im Interessenbereich (wiederverwendete Einträge) */
  snapshots(t: number): void {
    this.seq++;
    for (const r of this.list) {
      if (r.bot) continue;
      const list = r.snap.list;
      list.length = 0;
      let fresh: (PlayerProfile & { pv: number })[] | null = null;
      for (const o of this.list) {
        if (o === r) continue;
        const rad = aoiRadius(r.state.dom, o.state.dom);
        const dx = o.state.x - r.state.x, dz = o.state.z - r.state.z;
        if (dx * dx + dz * dz > rad * rad) continue;
        if (r.known.get(o.id) !== o.pv) { (fresh ??= []).push({ ...o.profile, pv: o.pv }); r.known.set(o.id, o.pv); }
        let e = r.pool[list.length];
        if (!e) { e = Object.assign(newPlayerState(), { id: '', pv: 0 }); r.pool.push(e); }
        copyState(o.state, e);
        e.id = o.id; e.pv = o.pv;
        list.push(e);
      }
      // 4.8B: Steckbriefe tragen das Aussehen – in Teilpaketen, damit kein Paket die 64 KB überschreitet
      if (fresh) for (let a = 0; a < fresh.length; a += MMO.profilesPerPacket) this.out(r.id, { k: 'profiles', list: fresh.length <= MMO.profilesPerPacket ? fresh : fresh.slice(a, a + MMO.profilesPerPacket) });
      r.snap.t = t; r.snap.seq = this.seq;
      this.out(r.id, r.snap);
      this.stats.snaps++;
    }
  }

  /** Gruppen-Werte (Leben, Willenskraft, Ort) an alle Mitglieder – auch außerhalb des Interessenbereichs */
  private sendVitals() {
    for (const g of this.parties.values()) {
      const list = g.vitals;
      list.length = 0;
      for (const id of g.members) {
        const m = this.peers.get(id);
        if (!m) continue;
        let v = g.vpool[list.length];
        if (!v) { v = { id: '', hp: 0, mhp: 1, will: 0, mwill: 1, x: 0, z: 0, dom: 'land', zone: '', ride: '' }; g.vpool.push(v); }
        const s = m.state;
        v.id = m.id; v.hp = s.hp; v.mhp = s.mhp; v.will = s.will; v.mwill = s.mwill; v.x = s.x; v.z = s.z; v.dom = s.dom; v.zone = s.zone; v.ride = s.ride;
        list.push(v);
      }
      for (const id of g.members) { const m = this.peers.get(id); if (m && !m.bot) this.out(m.id, g.vmsg); }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Hilfen
  // ---------------------------------------------------------------------------------------------------------------

  stanceOf(a: Peer, b: Peer): PartyStance { return this.diplo.stance(a.profile.team, b.profile.team); }

  /** Spieler nach Kennung, vollem Namen (ohne Groß/klein) oder eindeutigem Namenswort */
  find(key: string): Peer | null {
    if (!key) return null;
    const direct = this.peers.get(key);
    if (direct) return direct;
    const k = lower(key.trim());
    for (const p of this.peers.values()) if (lower(p.profile.name) === k) return p;
    let hit: Peer | null = null, n = 0;
    for (const p of this.peers.values()) if (lower(p.profile.name).split(/\s+/).includes(k)) { hit = p; n++; }
    return n === 1 ? hit : null;
  }

  private notice(p: Peer, text: string, tone: 'info' | 'warn' | 'error' = 'info') { if (!p.bot) this.out(p.id, { k: 'notice', text, tone }); }

  private system(p: Peer, text: string, t = this.lastT) {
    if (!p.bot) this.out(p.id, { k: 'chat', msg: { ch: 'system', from: '', name: '', to: '', toName: '', text, t: Number.isFinite(t) ? t : 0 } });
  }

  private systemTo(g: PartyRec, text: string) { for (const id of g.members) { const m = this.peers.get(id); if (m) this.system(m, text); } }

  private toParty(g: PartyRec, msg: ServerMsg) { for (const id of g.members) { const m = this.peers.get(id); if (m && !m.bot) this.out(m.id, msg); } }

  private view(g: PartyRec): PartyView {
    return {
      id: g.id, leader: g.leader,
      members: g.members.map((id) => { const p = this.peers.get(id)!; return { id, name: p.profile.name, level: p.profile.level, spec: p.profile.spec, role: p.profile.role, team: p.profile.team, bot: p.bot }; }),
    };
  }

  private broadcastParty(g: PartyRec) {
    const v = this.view(g);
    this.toParty(g, { k: 'party', ev: { e: 'state', party: v } });
    this.hooks.partyChanged?.(v, g.members);
  }

  private partyEvent(p: Peer, ev: PartyEvent) { if (!p.bot) this.out(p.id, { k: 'party', ev }); }

  // ---------------------------------------------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------------------------------------------

  private chat(p: Peer, ch: Exclude<ChatChannel, 'system'>, text: string, to: string, t: number) {
    const w = p.chatT;
    while (w.length && t - w[0] > MMO.chatWindow) w.shift();
    if (w.length >= MMO.chatBurst && !p.bot) { this.notice(p, 'Langsamer, Kapitän – zu viele Nachrichten auf einmal.', 'warn'); return; }
    w.push(t);
    const msg: ChatMessage = { ch, from: p.id, name: p.profile.name, to: '', toName: '', text, t };
    const send = (o: Peer) => { if (!o.bot) this.out(o.id, { k: 'chat', msg }); };
    this.stats.chats++;
    switch (ch) {
      case 'sagen': {
        const r = sayRadius(p.state.dom);
        for (const o of this.list) {
          if (dist(o.state, p.state) > r) continue;
          send(o);
          if (o.bot && o !== p) this.hooks.said?.(o.id, p.id, text, t);
        }
        break;
      }
      case 'gruppe': {
        if (!p.party) { this.notice(p, 'Du bist in keiner Gruppe.', 'warn'); return; }
        for (const id of p.party.members) { const m = this.peers.get(id); if (m) send(m); }
        break;
      }
      case 'fluestern': {
        const target = this.find(to);
        if (!target) { this.notice(p, `Kein Kapitän namens „${to}“ ist gerade auf dieser See.`, 'warn'); return; }
        if (target === p) { this.notice(p, 'Du flüsterst dir selbst etwas zu …'); return; }
        msg.to = target.id; msg.toName = target.profile.name;
        send(target);
        send(p);
        if (target.bot) this.hooks.whispered?.(target.id, p.id, text, t);
        break;
      }
      case 'welt': for (const o of this.list) send(o); break;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Gruppen
  // ---------------------------------------------------------------------------------------------------------------

  /** Grund, warum `target` nicht zu den Nationen der Gruppe von `p` passt ('' = passt) */
  private warBlock(p: Peer, target: Peer): string {
    const ids = p.party ? p.party.members : [p.id];
    for (const id of ids) {
      const m = this.peers.get(id);
      if (!m) continue;
      const s = this.stanceOf(m, target);
      if (!groupAllowed(s)) return `Einladung gesperrt (Kriegszustand): ${this.nationName(m.profile.team)} und ${this.nationName(target.profile.team)} liegen im Krieg.`;
    }
    return '';
  }

  private invite(p: Peer, key: string, t: number) {
    const target = this.find(key);
    if (!target) { this.notice(p, `Kein Kapitän namens „${key}“ ist gerade auf dieser See.`, 'warn'); return; }
    if (target === p) { this.notice(p, 'Du kannst dich nicht selbst einladen.'); return; }
    const g = p.party;
    if (g && g.leader !== p.id) { this.notice(p, 'Nur der Anführer kann einladen.', 'warn'); return; }
    if (g && g.members.length >= MMO.partyMax) { this.notice(p, `Die Gruppe ist voll (${MMO.partyMax}/${MMO.partyMax}).`, 'warn'); return; }
    if (target.party) { this.notice(p, target.party === g ? `${target.profile.name} ist schon in deiner Gruppe.` : `${target.profile.name} ist bereits in einer Gruppe.`, 'warn'); return; }
    const block = this.warBlock(p, target);
    if (block) { this.notice(p, block, 'error'); return; }
    const party = g?.id ?? (p.reserve ||= `g${++this.partySeq}`);
    if (this.invites.some((iv) => iv.party === party && iv.to === target.id)) { this.notice(p, `Die Einladung an ${target.profile.name} läuft bereits.`); return; }
    this.invites.push({ party, from: p.id, to: target.id, until: t + MMO.inviteTime });
    this.stats.invites++;
    this.partyEvent(target, { e: 'invite', party, from: p.id, name: p.profile.name, level: p.profile.level, team: p.profile.team, left: MMO.inviteTime });
    this.partyEvent(p, { e: 'sent', to: target.id, name: target.profile.name });
    if (target.bot) this.hooks.invited?.(target.id, party, p.id, t);
  }

  private reply(p: Peer, party: string, accept: boolean, t: number) {
    const k = this.invites.findIndex((iv) => iv.to === p.id && iv.party === party);
    if (k < 0) { this.notice(p, 'Die Einladung ist abgelaufen.', 'warn'); return; }
    const iv = this.invites[k];
    this.invites.splice(k, 1);
    const inviter = this.peers.get(iv.from);
    if (!inviter) { this.notice(p, 'Der Einladende ist nicht mehr auf dieser See.', 'warn'); return; }
    if (!accept) { this.partyEvent(inviter, { e: 'declined', by: p.id, name: p.profile.name, why: 'hat die Einladung abgelehnt' }); return; }
    if (p.party) { this.notice(p, 'Du bist bereits in einer Gruppe.', 'warn'); return; }
    let g = inviter.party;
    if (g && g.id !== party) { this.notice(p, 'Die Einladung ist abgelaufen.', 'warn'); return; }
    if (g && g.members.length >= MMO.partyMax) { this.notice(p, `Die Gruppe ist voll (${MMO.partyMax}/${MMO.partyMax}).`, 'warn'); return; }
    const block = this.warBlock(inviter, p);
    if (block) { this.notice(p, block, 'error'); this.partyEvent(inviter, { e: 'declined', by: p.id, name: p.profile.name, why: block }); return; }
    if (!g) {
      g = { id: party, leader: inviter.id, members: [inviter.id], warn: null, vitals: [], vpool: [], vmsg: { k: 'vitals', list: [] }, rr: 0 };
      g.vmsg.list = g.vitals;
      this.parties.set(g.id, g);
      inviter.party = g;
      inviter.reserve = '';
      this.stats.parties++;
    }
    g.members.push(p.id);
    p.party = g;
    this.broadcastParty(g);
    this.systemTo(g, `${p.profile.name} ist der Gruppe beigetreten (${g.members.length}/${MMO.partyMax}).`);
    void t;
  }

  /** Mitglied entfernen (verlassen, entfernt, Kriegsausbruch, Verbindung weg) */
  private removeMember(p: Peer, why: string, t: number, voluntary = false) {
    const g = p.party;
    if (!g) return;
    g.members = g.members.filter((id) => id !== p.id);
    p.party = null;
    // Mitfahrt endet: wer bei ihm mitfuhr, und seine eigene Mitfahrt in dieser Gruppe
    for (const o of this.list) if (o.rideOk === p.id) { o.rideOk = ''; o.state.ride = ''; if (!o.bot) this.out(o.id, { k: 'ride', ok: false, ship: p.id, text: `${p.profile.name} hat die Gruppe verlassen – du gehst von Bord.` }); }
    if (p.rideOk && g.members.includes(p.rideOk)) { p.rideOk = ''; p.state.ride = ''; if (!p.bot) this.out(p.id, { k: 'ride', ok: false, ship: '', text: 'Du gehst von Bord.' }); }
    this.partyEvent(p, { e: 'state', party: null });
    if (why) this.partyEvent(p, { e: 'removed', why });
    this.system(p, voluntary ? 'Du hast die Gruppe verlassen.' : why || 'Du bist nicht mehr in der Gruppe.', t);
    this.hooks.partyChanged?.(null, [p.id]);
    if (g.members.length < MMO.partyMin) {
      for (const id of g.members) {
        const m = this.peers.get(id);
        if (!m) continue;
        m.party = null;
        if (m.rideOk) { m.rideOk = ''; m.state.ride = ''; }
        this.partyEvent(m, { e: 'state', party: null });
        this.system(m, 'Die Gruppe hat sich aufgelöst.', t);
      }
      this.hooks.partyChanged?.(null, g.members);
      g.members = [];
      this.parties.delete(g.id);
      for (let k = this.invites.length - 1; k >= 0; k--) if (this.invites[k].party === g.id) this.invites.splice(k, 1);
      return;
    }
    if (g.leader === p.id) {
      g.leader = g.members[0];
      const nl = this.peers.get(g.leader);
      if (nl) this.systemTo(g, `Die Krone geht an ${nl.profile.name}.`);
    }
    this.systemTo(g, `${p.profile.name} ${voluntary ? 'hat die Gruppe verlassen' : 'ist nicht mehr in der Gruppe'}.`);
    this.broadcastParty(g);
  }

  private kick(p: Peer, id: string, t: number) {
    const g = p.party;
    if (!g) { this.notice(p, 'Du bist in keiner Gruppe.'); return; }
    if (g.leader !== p.id) { this.notice(p, 'Nur der Anführer kann Mitglieder entfernen.', 'warn'); return; }
    const m = this.find(id);
    if (!m || m.party !== g || m === p) { this.notice(p, 'Dieser Kapitän ist nicht in deiner Gruppe.', 'warn'); return; }
    this.removeMember(m, `${p.profile.name} hat dich aus der Gruppe entfernt.`, t);
  }

  private promote(p: Peer, id: string) {
    const g = p.party;
    if (!g) { this.notice(p, 'Du bist in keiner Gruppe.'); return; }
    if (g.leader !== p.id) { this.notice(p, 'Nur der Anführer kann die Krone weitergeben.', 'warn'); return; }
    const m = this.find(id);
    if (!m || m.party !== g || m === p) { this.notice(p, 'Dieser Kapitän ist nicht in deiner Gruppe.', 'warn'); return; }
    g.leader = m.id;
    this.broadcastParty(g);
    this.systemTo(g, `${m.profile.name} führt jetzt die Gruppe an.`);
  }

  /** Kriegsausbruch in bestehenden Gruppen (alle 0,5 s) */
  private checkWars(t: number) {
    for (const g of this.parties.values()) {
      const order = this.order;
      order.length = 0;
      order.push(g.leader);
      for (const id of g.members) if (id !== g.leader) order.push(id);
      const pair = partyConflicts(order, (id) => this.peers.get(id)?.profile.team ?? '', (a, b) => this.diplo.stance(a, b), this.conf);
      if (!pair) {
        if (g.warn) { g.warn = null; this.toParty(g, { k: 'party', ev: { e: 'calm' } }); this.systemTo(g, 'Waffenruhe: die Gruppe bleibt zusammen.'); }
        continue;
      }
      let fight = false;
      for (const id of order) if (this.peers.get(id)?.state.combat) fight = true;
      if (!g.warn) {
        g.warn = { since: t, until: t + MMO.warGrace, ids: [], a: pair.a, b: pair.b, fight, sent: -1 };
        this.systemTo(g, `Kriegsausbruch: ${this.nationName(pair.a)} und ${this.nationName(pair.b)} liegen im Krieg! In ${MMO.warGrace} s trennen sich verfeindete Mitglieder.`);
      }
      const w = g.warn;
      w.ids = this.conf.slice();
      w.fight = fight;
      const left = Math.max(0, w.until - t);
      const sec = Math.ceil(left) + (fight && left <= 0 ? 1000 : 0);
      if (sec !== w.sent) { w.sent = sec; this.toParty(g, { k: 'party', ev: { e: 'warn', left, a: w.a, b: w.b, ids: w.ids, fight } }); }
      if (t < w.until) continue;
      // ein laufendes Gefecht wird noch zu Ende gekämpft (höchstens bis `warGraceMax`)
      if (fight && t < w.since + MMO.warGraceMax) continue;
      const why = `Kriegsausbruch: ${this.nationName(w.a)} und ${this.nationName(w.b)} liegen im Krieg – eure Wege trennen sich.`;
      for (const id of w.ids) { const m = this.peers.get(id); if (m && m.party === g) { this.removeMember(m, why, t); this.stats.removedByWar++; } }
      // wer bleibt, ist wieder verträglich: Warnung aus (auch im Banner der Verbliebenen)
      if (this.parties.get(g.id) === g) { g.warn = null; this.toParty(g, { k: 'party', ev: { e: 'calm' } }); }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Betrachten, Heilung, Sturmhorn, Fortschritt, Mitfahrt, Spieler gegen Spieler
  // ---------------------------------------------------------------------------------------------------------------

  private inspect(p: Peer, id: string) {
    const o = this.find(id);
    if (!o) { this.notice(p, 'Dieser Kapitän ist nicht mehr auf dieser See.', 'warn'); return; }
    this.out(p.id, { k: 'inspect', info: { profile: { ...o.profile }, stance: this.stanceOf(p, o), zone: o.state.zone, dist: dist(p.state, o.state), party: !!p.party && p.party === o.party } });
  }

  /** Heilung (Priester-Formen, Lebensstrom, gezielt über das Gruppenfenster): Gruppe und Verbündete in Reichweite */
  private heal(p: Peer, to: string, frac: number) {
    const o = this.peers.get(to);
    if (!o || o === p || frac <= 0) return;
    const allowed = (!!p.party && p.party === o.party) || alliedStance(this.stanceOf(p, o));
    if (!allowed) { this.notice(p, 'Heilung wirkt nur auf deine Gruppe und Verbündete.', 'warn'); return; }
    if (dist(p.state, o.state) > MMO.healRange + 10) return;
    if (o.bot) this.hooks.healed?.(o.id, frac);
    else this.out(o.id, { k: 'heal', from: p.id, name: p.profile.name, frac });
  }

  /** Sturmhorn-Sammeln: Heilung und Willenskraft für Gruppe und Verbündete im Umkreis */
  private horn(p: Peer, x: number, z: number, heal: number, will: number) {
    if (Math.hypot(p.state.x - x, p.state.z - z) > 70) return;
    for (const o of this.list) {
      if (o === p) continue;
      if (!((!!p.party && p.party === o.party) || alliedStance(this.stanceOf(p, o)))) continue;
      if (Math.hypot(o.state.x - x, o.state.z - z) > MMO.hornRange) continue;
      if (o.bot) this.hooks.horned?.(o.id, heal, will);
      else this.out(o.id, { k: 'horn', from: p.id, name: p.profile.name, heal, will });
    }
  }

  /** Geteilter Fortschritt (Abschüsse, versenkte Schiffe, Kriegspunkte) an die Gruppe in der Nähe */
  private share(p: Peer, what: ShareKind, ref: string, amount: number) {
    const g = p.party;
    if (!g) return;
    const r = shareRadius(p.state.dom);
    for (const id of g.members) {
      const o = this.peers.get(id);
      if (!o || o === p || o.bot || dist(o.state, p.state) > r) continue;
      this.out(o.id, { k: 'share', from: p.id, name: p.profile.name, what, ref, amount });
    }
  }

  /** An Bord des Anführer-Schiffs mitfahren (relative Deck-Lage) */
  private ride(p: Peer, ship: string, rx: number, ry: number, rz: number) {
    const owner = this.peers.get(ship);
    const fail = (text: string) => { if (!p.bot) this.out(p.id, { k: 'ride', ok: false, ship, text }); };
    if (!owner || owner === p) { fail('Kein Schiff zum Mitfahren.'); return; }
    if (!p.party || p.party !== owner.party) { fail('Mitfahren geht nur in derselben Gruppe.'); return; }
    if (p.party.leader !== owner.id) { fail('Mitfahren geht nur auf dem Schiff des Anführers.'); return; }
    if (owner.state.dom !== 'sea' || owner.state.ride) { fail(`${owner.profile.name} ist gerade nicht an Bord seines Schiffs.`); return; }
    if (dist(p.state, owner.state) > MMO.rideRange) { fail(`Zu weit entfernt – höchstens ${MMO.rideRange} m bis zum Schiff des Anführers.`); return; }
    if (!rideValid(rx, ry, rz)) { fail('Dieser Platz liegt nicht an Deck.'); return; }
    p.rideOk = owner.id;
    p.state.ride = owner.id; p.state.rx = rx; p.state.ry = ry; p.state.rz = rz;
    if (!p.bot) this.out(p.id, { k: 'ride', ok: true, ship: owner.id, text: `Willkommen an Bord${owner.profile.shipName ? ` der ${owner.profile.shipName}` : ''}!` });
    if (!owner.bot) this.out(owner.id, { k: 'notice', text: `${p.profile.name} kommt an Bord.`, tone: 'info' });
  }

  /** Spieler gegen Spieler: nur bei Krieg, nie in der Gruppe, nie in einer Schutzzone */
  /**
   * Treffer gegen einen Mitspieler: auf See Kanonen (bis `MMO.hitRange`), zu Fuß (4.8B) nur, wenn beide an Land stehen (nicht an Deck),
   * bis `MMO.hitRangeLand`, und mit der PvP-Skalierung `pvpLandDamage` (Deckel je Treffer nach dem Leben des Ziels). Gruppe, Verbündete und
   * Schutzzonen sperren immer (`pvpBlock`).
   */
  private hit(p: Peer, to: string, dmg: number, land: boolean, t: number) {
    const o = this.peers.get(to);
    if (!o || o === p || dmg <= 0) return;
    const range = land ? MMO.hitRangeLand : MMO.hitRange;
    const block = pvpBlock({ stance: this.stanceOf(p, o), sameParty: !!p.party && p.party === o.party, safeA: this.zones.safeAt(p.state.x, p.state.z), safeB: this.zones.safeAt(o.state.x, o.state.z) })
      || (land && (p.state.dom !== 'land' || o.state.dom !== 'land' || p.state.ride || o.state.ride) ? 'Kampf zu Fuß nur an Land' : '')
      || (dist(p.state, o.state) > range ? 'Ziel außer Reichweite' : '');
    if (block) { if (t - p.hitNoteT > 3) { p.hitNoteT = t; this.notice(p, block, 'warn'); } return; }
    const final = land ? pvpLandDamage(dmg, o.state.mhp) : dmg;
    if (land) this.stats.landHits++;
    if (o.bot) this.hooks.hit?.(o.id, p.id, final);
    else this.out(o.id, { k: 'hit', from: p.id, name: p.profile.name, dmg: final, land });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 4.8B: Gruppen-Beute und Würfel-Sitzungen
  // ---------------------------------------------------------------------------------------------------------------

  /** Gruppenmitglieder im Einsatzgebiet des Finders (er selbst zuerst, dann in Gruppen-Reihenfolge); ohne Gruppe nur er */
  private lootCrew(p: Peer): Peer[] {
    const out = this.near;
    out.length = 0;
    out.push(p);
    const g = p.party;
    if (!g) return out;
    const r = lootRadius(p.state.dom);
    for (const id of g.members) {
      const o = this.peers.get(id);
      if (!o || o === p) continue;
      if (dist(o.state, p.state) <= r) out.push(o);
    }
    return out;
  }

  private lootChat(to: readonly Peer[], text: string, t: number) {
    const msg: ChatMessage = { ch: 'system', from: '', name: '', to: '', toName: '', text, t };
    for (const o of to) if (!o.bot) this.out(o.id, { k: 'chat', msg });
  }

  /**
   * Fund in der Gruppe: Gold und Ruf gleichmäßig an alle im Einsatzgebiet, gewöhnliche Stücke reihum, ab Blau eine Würfel-Sitzung.
   * Ohne Gruppe (oder allein im Gebiet) bekommt der Finder alles zurück.
   */
  private loot(p: Peer, gold: number, rep: number, power: string, items: readonly LootItemNet[], t: number) {
    this.stats.loot++;
    const crew = this.lootCrew(p).slice();
    const n = crew.length;
    if (gold > 0 || rep !== 0) {
      splitEven(gold, n, this.shares);
      splitEven(rep, n, this.repShares);
      for (let i = 0; i < n; i++) {
        const o = crew[i];
        if (!o.bot) this.out(o.id, { k: 'lootShare', from: p.id, name: p.profile.name, gold: this.shares[i], rep: this.repShares[i], power, n });
      }
    }
    const g = p.party;
    for (const item of items) {
      if (!g || n < 2) { if (!p.bot) this.out(p.id, { k: 'lootGet', item, how: 'allein', from: p.id, name: p.profile.name }); continue; }
      if (!rollsFor(item.grade)) {
        const o = crew[g.rr % n];
        g.rr = (g.rr + 1) % 1e6;
        if (!o.bot) this.out(o.id, { k: 'lootGet', item, how: 'reihum', from: p.id, name: p.profile.name });
        this.lootChat(crew, `[Beute]: ${o.profile.name} erhält [${item.name}] (reihum).`, t);
        continue;
      }
      if (this.rolls.filter((s) => s.party === g.id).length >= MMO.rollMaxPerParty) {
        if (!p.bot) this.out(p.id, { k: 'lootGet', item, how: 'allein', from: p.id, name: p.profile.name });
        continue;
      }
      this.startRoll(p, g, crew, item, t);
    }
  }

  private startRoll(p: Peer, g: PartyRec, crew: readonly Peer[], item: LootItemNet, t: number) {
    const entries: RollEntry[] = crew.map((o) => {
      const why = needBlock(item, { base: o.profile.base, role: o.profile.role, shipTier: o.profile.shipTier });
      return { id: o.id, name: o.profile.name, needOk: !why, needWhy: why, choice: '', roll: 0, bot: o.bot };
    });
    const s = createRoll(`w${++this.rollSeq}`, item, p.id, p.profile.name, g.id, t, entries);
    this.rolls.push(s);
    this.stats.rolls++;
    for (const e of entries) {
      if (e.bot) { e.choice = botChoice(e, item, this.rng); continue; }
      this.out(e.id, { k: 'rollStart', roll: { id: s.id, item, left: MMO.rollTime, total: MMO.rollTime, needOk: e.needOk, needWhy: e.needWhy, from: p.profile.name, n: entries.length } });
    }
  }

  /** Wahl eines Teilnehmers (doppelte, verspätete oder unerlaubte Wahl weist der Shard ab) */
  private roll(p: Peer, id: string, choice: RollChoice, t: number) {
    const s = this.rolls.find((x) => x.id === id);
    if (!s) { this.notice(p, 'Diese Würfel-Runde ist schon vorbei.'); return; }
    const err = chooseRoll(s, p.id, choice, t);
    if (err) { this.notice(p, err, 'warn'); return; }
    if (rollReady(s, t)) this.finishRoll(s, t);
  }

  private finishRoll(s: RollSession, t: number) {
    const k = this.rolls.indexOf(s);
    if (k >= 0) this.rolls.splice(k, 1);
    const res = resolveRoll(s, this.rng);
    this.stats.rollsDone++;
    const crew: Peer[] = [];
    for (const e of s.entries) { const o = this.peers.get(e.id); if (o) crew.push(o); }
    for (const line of res.lines) this.lootChat(crew, line, t);
    const text = res.lines.join(' ');
    for (const o of crew) if (!o.bot) this.out(o.id, { k: 'rollEnd', id: s.id, winner: res.winner, name: res.winnerName, choice: res.choice, text });
    // Gewinner (oder bei „alle passen“ der Finder) bekommt das Stück; ist er nicht mehr da, der Finder
    const winner = (res.winner && this.peers.get(res.winner)) || this.peers.get(s.from);
    if (winner && !winner.bot) this.out(winner.id, { k: 'lootGet', item: s.item, how: res.winner && winner.id === res.winner ? 'wurf' : 'verzicht', from: s.from, name: s.fromName });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 4.9: geteilte Gegner und Kampf-Aktionen
  // ---------------------------------------------------------------------------------------------------------------

  /** Spielerliste für das Register (wiederverwendete Einträge) */
  private entPeerList(): EntPeer[] {
    const out = this.entPeers;
    let n = 0;
    for (const p of this.list) {
      let e = out[n];
      if (!e) { e = { id: '', x: 0, z: 0, dom: 'land', bot: false, party: '', scope: '' }; out.push(e); }
      e.id = p.id; e.x = p.state.x; e.z = p.state.z; e.dom = p.state.dom; e.bot = p.bot; e.party = p.party?.id ?? ''; e.scope = p.state.sc ?? '';
      n++;
    }
    out.length = n;
    return out;
  }

  /** Eintrag eines Gegners für einen Schnappschuss kopieren (ohne Bedrohungstabelle und Verwaltung) */
  private static entCopy(e: SharedEnt, o: EntNet): EntNet {
    o.id = e.id; o.owner = e.owner; o.cat = e.cat; o.tier = e.tier; o.role = e.role; o.level = e.level; o.name = e.name; o.look = e.look;
    o.x = e.x; o.z = e.z; o.hdg = e.hdg; o.spd = e.spd; o.hp = e.hp; o.mhp = e.mhp; o.dis = e.dis; o.aggro = e.aggro; o.dead = e.dead;
    o.boss = e.boss; o.scale = e.scale; o.y = e.y; o.an = e.an; o.clip = e.clip; o.pose = e.pose; o.brk = e.brk; o.phase = e.phase; o.scope = e.scope ?? '';
    return o;
  }

  /** 4.91: leerer Schnappschuss-Eintrag (vorab angelegt, wiederverwendet) */
  private static entBlank(look: SharedEnt['look']): EntNet {
    return { id: '', owner: '', cat: 'ship', tier: 0, role: '', level: 1, name: '', look, x: 0, z: 0, hdg: 0, spd: 0, hp: 0, mhp: 1, dis: false, aggro: '', dead: false, boss: false, scale: 1, y: 0, an: 0, clip: '', pose: 1, brk: false, phase: 1, scope: '' };
  }

  /**
   * Anmeldung: neuer Gegner (der Anmeldende steuert ihn), 4.91 vorhandener mit demselben festen Schlüssel (der Anmeldende zeigt eine Kopie und
   * bekommt den Besitzer genannt) oder gesperrt, weil das Lager noch geräumt bzw. der Boss besiegt ist (`edenied` mit Wartezeit).
   */
  private entClaim(p: Peer, s: EntSpawnNet, t: number) {
    if (p.bot) return;
    const r = this.entities.claimKeyed(p.id, s, t);
    if (r.e) { this.out(p.id, { k: 'eclaimed', key: s.key, id: r.e.id, owner: r.e.owner }); return; }
    if (r.wait > 0) { this.out(p.id, { k: 'edenied', key: s.key, wait: r.wait }); return; }
    this.notice(p, 'Zu viele geteilte Gegner auf dieser See – dieser bleibt nur bei dir.', 'warn');
  }

  /** Treffer auf einen geteilten Gegner: Bedrohung zählen; nicht verrechnete Treffer gehen an den Besitzer */
  private entHit(p: Peer, id: string, dmg: number, ammo: string, zone: 'hull' | 'sail', pen: number, applied: boolean, foe?: FoeHitNet) {
    // 4.92: nur aus demselben Bereich (wer nicht in der Raid-Instanz ist, trifft ihre Gegner nicht – und umgekehrt)
    const e0 = this.entities.ents.get(id);
    if (e0 && (e0.scope ?? '') !== (p.state.sc ?? '')) return;
    const e = this.entities.hit(p.id, id, dmg);
    if (!e || applied || !e.owner || e.owner === p.id) return;
    // nur in Schussweite (Schutz gegen erfundene Treffer aus der Ferne; Landgegner: Faji-Geschosse und Kräfte bis `hitRangeLand` + 40 m)
    if (Math.hypot(p.state.x - e.x, p.state.z - e.z) > (e.cat === 'foe' ? MMO.hitRangeLand + 40 : MMO.hitRange + 200)) return;
    const o = this.peers.get(e.owner);
    if (!o || o.bot) return;
    this.entities.stats.forwarded++;
    this.out(o.id, foe ? { k: 'ehit', id, from: p.id, dmg, ammo, zone, pen, foe } : { k: 'ehit', id, from: p.id, dmg, ammo, zone, pen });
  }

  /** Untergang (vom Besitzer): Gutschrift an alle Beteiligten und ihre Gruppen im Einsatzgebiet; gewürfelt wird beim Versenker */
  private entDead(p: Peer, id: string, by: string, t: number) {
    const e = this.entities.dead(p.id, id, t);
    if (!e) return;
    const peers = this.entPeerList();
    const credit = this.entities.credit(e, peers, this.credits);
    const killer = this.peers.get(by) ?? p;
    const finder = credit.includes(killer.id) && !killer.bot ? killer.id : p.id;
    const kill = { id: e.id, cat: e.cat, name: e.name, role: e.role, level: e.level, tier: e.tier, x: e.x, z: e.z, by: killer.id, byName: killer.profile.name, finder, owner: p.id, credit: credit.slice(), boss: e.boss };
    for (const cid of credit) { const o = this.peers.get(cid); if (o && !o.bot) this.out(o.id, { k: 'ekill', kill }); }
    // der Besitzer erfährt den Abschluss immer (auch ohne eigene Gutschrift: er räumt seinen Gegner ab)
    if (!credit.includes(p.id)) this.out(p.id, { k: 'ekill', kill });
  }

  /** Ein geteilter Gegner trifft ein Mitspieler-Schiff (nur der Besitzer meldet, nur in Schussweite) */
  private entPlayerHit(p: Peer, id: string, to: string, dmg: number, pen: number) {
    const e = this.entities.ents.get(id);
    const o = this.peers.get(to);
    if (!e || e.dead || e.owner !== p.id || !o || o === p || dmg <= 0) return;
    if (Math.hypot(o.state.x - e.x, o.state.z - e.z) > (e.cat === 'foe' ? MMO.hitRangeLand : MMO.hitRange)) return;
    if (o.bot) { this.hooks.hit?.(o.id, e.id, dmg); return; }
    this.out(o.id, { k: 'ehitme', id, name: e.name, dmg, pen });
  }

  /** Kampf-Aktion zur Darstellung an alle in der Nähe (nicht an den Absender); höchstens `actPerSec` je Sekunde und Absender */
  private act(p: Peer, a: ActNet, t: number) {
    const w = p.actT;
    while (w.length && t - w[0] > 1) w.shift();
    if (w.length >= MMO.actPerSec) return;
    w.push(t);
    // ein Gegner feuert: nur sein Besitzer darf das melden
    if (a.ent) { const e = this.entities.ents.get(a.ent); if (!e || e.owner !== p.id) return; }
    const r = a.sea ? MMO.aoiSea : MMO.aoiLand;
    const msg: ServerMsg = { k: 'act', from: p.id, a };
    const sc = p.state.sc ?? '';
    for (const o of this.list) {
      if (o === p || o.bot) continue;
      // 4.92: Aktionen einer Raid-Instanz sehen nur ihre Teilnehmer (und umgekehrt)
      if ((o.state.sc ?? '') !== sc) continue;
      if (Math.hypot(o.state.x - a.x, o.state.z - a.z) > r) continue;
      this.out(o.id, msg);
    }
  }

  /** Takt der geteilten Gegner: Übergabe/Verwerfen, dann je Empfänger die Gegner im Interessenbereich */
  private entTick(t: number) {
    const peers = this.entPeerList();
    this.entities.tick(t, peers, (e, to) => {
      const o = this.peers.get(to);
      if (o && !o.bot) this.out(o.id, { k: 'eown', e: MmoAuthority.entCopy(e, MmoAuthority.entBlank(e.look)) });
    }, (e) => {
      for (const o of this.list) if (!o.bot && Math.hypot(o.state.x - e.x, o.state.z - e.z) <= MMO.entDrop) this.out(o.id, { k: 'egone', id: e.id });
    });
    if (!this.entities.list.length) return;
    for (const r of this.list) {
      if (r.bot) continue;
      const near = this.entities.near(r.state.x, r.state.z, MMO.aoiSea, this.entNear);
      const list = r.ents.list;
      list.length = 0;
      const sc = r.state.sc ?? '';
      for (let k = 0; k < near.length && list.length < MMO.entPerPacket; k++) {
        // 4.92: nur Gegner aus dem eigenen Bereich (offene Welt bzw. dieselbe Raid-Instanz)
        if ((near[k].scope ?? '') !== sc) continue;
        let o = r.entPool[list.length];
        if (!o) { o = MmoAuthority.entBlank(near[k].look); r.entPool.push(o); }
        list.push(MmoAuthority.entCopy(near[k], o));
      }
      if (!list.length) continue;
      r.ents.t = t;
      this.out(r.id, r.ents);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Abfragen (Prüfungen, Bots)
  // ---------------------------------------------------------------------------------------------------------------

  partyOf(id: string): PartyView | null { const g = this.peers.get(id)?.party; return g ? this.view(g) : null; }
  pendingInvites(id: string): number { return this.invites.filter((iv) => iv.to === id).length; }
  warnOf(id: string): { left: number; fight: boolean } | null {
    const w = this.peers.get(id)?.party?.warn;
    return w ? { left: Math.max(0, w.until - (Number.isFinite(this.lastT) ? this.lastT : 0)), fight: w.fight } : null;
  }
}
