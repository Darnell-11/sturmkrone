// Phase 4.8A – MMO-Client (rein: kein DOM, kein three.js). Spricht nur über `MmoTransport`: schickt den eigenen Zustand (15 Hz), Chat und
// Gruppen-Absichten, nimmt Schnappschüsse (Ringpuffer je Mitspieler, Interpolation mit Verzug), Gruppen-Ereignisse, Gruppen-Werte, Chat und
// Hinweise entgegen. Die Seewelt (`world/mmoLive.ts`) und die Oberfläche lesen nur, was hier steht. Je Schnappschuss entsteht nichts Neues,
// nur bei Ereignissen (neuer Mitspieler, Chatzeile, Gruppenwechsel).
import {
  MMO, MMO_PROTOCOL, copyState, newPlayerState, newProfile,
  type ActNet, type ClientIntent, type EntKillNet, type EntNet, type EntSpawnNet, type EntStateNet, type InspectInfo, type LootItemNet, type PartyView, type RollChoice, type RollView,
  type PlayerProfile, type PlayerState, type ServerMsg, type ShareKind, type VitalEntry,
} from './mmoProtocol';
import type { MmoTransport } from './mmoTransport';
import { SnapshotBuffer, newInterpOut, type InterpOut } from './snapshotBuffer';
import { CHAT_HELP, ChatLog, parseChatLine, stickyLabel, type ChatLine, type StickyChannel } from '../social/chat';

/** Ein Mitspieler im Interessenbereich (oder zuletzt dort gesehen) */
export interface RemotePlayer {
  id: string;
  profile: PlayerProfile;
  pv: number;
  readonly buf: SnapshotBuffer;
  /** jüngster Zustand (Bereich, Mitfahrt, Leben, Gefecht, Ort) */
  readonly last: PlayerState;
  /** interpolierte Lage (je Bild) */
  readonly view: InterpOut;
  seq: number;
  /** im jüngsten Schnappschuss enthalten */
  live: boolean;
  seenAt: number;
}

export interface PendingInvite { party: string; from: string; name: string; level: number; team: string; until: number; total: number }

/**
 * 4.9: ein geteilter Gegner beim Client: jüngster Stand aus dem Schnappschuss plus die vorige Probe für eine weiche Bewegung
 * (`ClientEnt.view` = Lage zur Darstellung, je Bild über `sampleEnt`)
 */
export interface ClientEnt extends EntNet {
  /** vorige Probe (Lage, Kurs) und die Shard-Zeiten beider Proben */
  px: number; pz: number; ph: number; t0: number; t1: number;
  /** zuletzt im Schnappschuss (Client-Uhr) */
  seenAt: number;
  readonly view: { x: number; z: number; hdg: number };
}
export interface PartyWarn { until: number; a: string; b: string; ids: string[]; fight: boolean }

export interface MmoClientHooks {
  onChat?(line: ChatLine): void;
  onNotice?(text: string, tone: 'info' | 'warn' | 'error'): void;
  onParty?(party: PartyView | null, prev: PartyView | null): void;
  onInvite?(inv: PendingInvite | null): void;
  onWarn?(w: PartyWarn | null): void;
  onInspect?(info: InspectInfo): void;
  onHeal?(name: string, frac: number): void;
  onHorn?(name: string, heal: number, will: number): void;
  onShare?(from: string, name: string, what: ShareKind, ref: string, amount: number): void;
  onHit?(from: string, name: string, dmg: number, land: boolean): void;
  /** 4.8B: Anteil an Gold und Ruf eines Gruppen-Funds */
  onLootShare?(m: Extract<ServerMsg, { k: 'lootShare' }>): void;
  /** 4.8B: Stück fürs eigene Inventar (reihum, gewonnen, allein, alle passten) */
  onLootGet?(m: Extract<ServerMsg, { k: 'lootGet' }>): void;
  /** 4.8B: Würfel-Karten haben sich geändert (neue Sitzung, Ende) */
  onRolls?(): void;
  onRide?(ok: boolean, ship: string, text: string): void;
  /** /anbord bzw. /vonbord: die Welt entscheidet, ob und wo (Deck-Platz) */
  onRideRequest?(): void;
  onUnrideRequest?(): void;
  /** 4.9: geteilte Gegner – Kennung vergeben, Treffer eines Mitspielers (beim Besitzer), Abschuss mit Gutschrift, Übernahme, verschwunden */
  onEntClaimed?(key: string, id: string): void;
  onEntHit?(id: string, from: string, dmg: number, ammo: string, zone: 'hull' | 'sail', pen: number): void;
  onEntKill?(kill: EntKillNet): void;
  onEntOwn?(e: EntNet): void;
  onEntGone?(id: string): void;
  /** 4.9: ein geteilter Gegner trifft das eigene Schiff */
  onEntHitMe?(id: string, name: string, dmg: number, pen: number): void;
  /** 4.9: Kampf-Aktion eines Mitspielers zur Darstellung */
  onAct?(from: string, a: ActNet): void;
}

const lower = (s: string) => s.toLocaleLowerCase('de-DE');

export class MmoClient {
  readonly remotes = new Map<string, RemotePlayer>();
  /** dieselben Mitspieler als Liste (Durchlauf je Bild ohne Iterator) */
  readonly list: RemotePlayer[] = [];
  /** bekannte Steckbriefe (auch außerhalb des Interessenbereichs: Gruppe, Chat) */
  readonly profiles = new Map<string, PlayerProfile>();
  party: PartyView | null = null;
  readonly vitals = new Map<string, VitalEntry>();
  invite: PendingInvite | null = null;
  warn: PartyWarn | null = null;
  readonly chat = new ChatLog();
  sticky: StickyChannel = { ch: 'sagen' };
  lastWhisper: { id: string; name: string; at: number } | null = null;
  shard = '';
  private stateT = 0;
  /** Zeit des letzten Schnappschusses (bleiben sie aus, meldet sich der Client neu: Zeitüberschreitung, Wechsel der Shard-Leitung) */
  private lastSnapAt = Number.NaN;
  private rejoinAt = 0;
  private readonly intent: { k: 'state'; s: PlayerState } = { k: 'state', s: newPlayerState() };
  private names: string[] = [];
  private namesDirty = true;
  private welcomed = false;
  /** Zahl der verbundenen Kapitäne laut Relay-Server (0 = unbekannt bzw. lokaler Shard) */
  onlineCount = 0;
  /** 4.8B: offene Würfel-Karten (Uhr des Clients; `choice` = eigene Wahl, '' = noch offen) */
  readonly rolls: (RollView & { until: number; choice: RollChoice | '' })[] = [];
  /** Zahlen für Prüfungen */
  readonly stats = { snaps: 0, chat: 0, states: 0, ents: 0, acts: 0, kills: 0 };
  /** 4.9: geteilte Gegner im Interessenbereich (Kennung → Stand) und als Liste */
  readonly ents = new Map<string, ClientEnt>();
  readonly entList: ClientEnt[] = [];
  private readonly estate: { k: 'estate'; list: EntStateNet[] } = { k: 'estate', list: [] };

  constructor(
    readonly transport: MmoTransport,
    readonly id: string,
    private readonly profileOf: () => PlayerProfile,
    private readonly stateOf: (out: PlayerState) => PlayerState,
    public hooks: MmoClientHooks = {},
    private readonly clock: () => number = () => performance.now() / 1000,
  ) {}

  get online(): boolean { return this.transport.status === 'online'; }

  start() {
    this.transport.onMessage = (m) => this.handle(m);
    const profile = { ...this.profileOf(), id: this.id };
    this.transport.connect({ k: 'hello', v: MMO_PROTOCOL, profile, state: this.stateOf(newPlayerState()) });
  }

  stop() {
    this.transport.onMessage = null;
    this.transport.close();
    this.remotes.clear(); this.list.length = 0; this.party = null; this.vitals.clear(); this.invite = null; this.warn = null; this.welcomed = false; this.rolls.length = 0;
    this.ents.clear(); this.entList.length = 0;
  }

  /** Je Logikschritt: eigenen Zustand senden (15 Hz), Einladung ablaufen lassen, verschwundene Mitspieler vergessen */
  update(dt: number) {
    if (this.online) {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.stateT = Math.max(0, this.stateT + 1 / MMO.stateHz);
        this.stateOf(this.intent.s);
        this.transport.send(this.intent as ClientIntent);
        this.stats.states++;
      }
    }
    const now = this.clock();
    // 4.8B: Würfel-Karten, deren Ende nie ankam (Verbindung weg), räumen sich 5 s nach der Frist selbst ab
    for (let k = this.rolls.length - 1; k >= 0; k--) if (now > this.rolls[k].until + 5) { this.rolls.splice(k, 1); this.hooks.onRolls?.(); }
    if (this.online) {
      if (!Number.isFinite(this.lastSnapAt)) this.lastSnapAt = now;
      else if (now - this.lastSnapAt > 8 && now >= this.rejoinAt) {
        this.rejoinAt = now + 8;
        this.transport.send({ k: 'hello', v: MMO_PROTOCOL, profile: { ...this.profileOf(), id: this.id }, state: this.stateOf(newPlayerState()) });
      }
    }
    if (this.invite && now >= this.invite.until) { this.invite = null; this.hooks.onInvite?.(null); }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      if (!r.live && now - r.seenAt > 30) { this.list.splice(i, 1); this.remotes.delete(r.id); }
    }
    // 4.9: geteilte Gegner, die länger nicht im Schnappschuss standen (außer Reichweite, verschwunden), vergessen
    for (let i = this.entList.length - 1; i >= 0; i--) {
      const e = this.entList[i];
      if (now - e.seenAt > 4) { this.entList.splice(i, 1); this.ents.delete(e.id); this.hooks.onEntGone?.(e.id); }
    }
  }

  /** Steckbrief geändert (Stufe, Team, Klasse, Schiff) */
  pushProfile() { if (this.online) this.transport.send({ k: 'profile', profile: { ...this.profileOf(), id: this.id } }); }

  // ---------------------------------------------------------------------------------------------------------------
  // Empfang
  // ---------------------------------------------------------------------------------------------------------------

  handle(m: ServerMsg) {
    switch (m.k) {
      case 'welcome':
        this.shard = m.shard;
        if (!this.welcomed) { this.welcomed = true; this.system(`Verbunden mit der geteilten See „${m.shard}“. /hilfe zeigt die Chat-Befehle.`); }
        break;
      case 'snap': this.onSnap(m.t, m.seq, m.list); break;
      case 'profiles':
        for (const p of m.list) {
          const copy: PlayerProfile = { ...p };
          this.profiles.set(p.id, copy);
          const r = this.remotes.get(p.id);
          if (r) { r.profile = copy; r.pv = p.pv; }
          this.namesDirty = true;
        }
        break;
      case 'gone': {
        const r = this.remotes.get(m.id);
        if (r) { this.remotes.delete(m.id); const i = this.list.indexOf(r); if (i >= 0) this.list.splice(i, 1); }
        break;
      }
      case 'party': this.onParty(m.ev); break;
      case 'vitals':
        for (const v of m.list) {
          const o = this.vitals.get(v.id);
          if (o) Object.assign(o, v); else this.vitals.set(v.id, { ...v });
        }
        break;
      case 'chat': {
        const msg = m.msg;
        if (msg.from && msg.name && !this.profiles.has(msg.from)) { const p = newProfile(msg.from); p.name = msg.name; this.profiles.set(msg.from, p); this.namesDirty = true; }
        if (msg.ch === 'fluestern' && msg.to === this.id && msg.from !== this.id) this.lastWhisper = { id: msg.from, name: msg.name, at: this.clock() };
        const line = this.chat.push({ ...msg }, msg.from === this.id);
        this.stats.chat++;
        this.hooks.onChat?.(line);
        break;
      }
      case 'inspect': this.hooks.onInspect?.(m.info); break;
      case 'heal': this.hooks.onHeal?.(m.name, m.frac); break;
      case 'horn': this.hooks.onHorn?.(m.name, m.heal, m.will); break;
      case 'share': this.hooks.onShare?.(m.from, m.name, m.what, m.ref, m.amount); break;
      case 'hit': this.hooks.onHit?.(m.from, m.name, m.dmg, m.land); break;
      case 'lootShare': this.hooks.onLootShare?.(m); break;
      case 'lootGet': this.hooks.onLootGet?.(m); break;
      case 'rollStart': {
        const now = this.clock();
        this.rolls.push({ ...m.roll, until: now + m.roll.left, choice: '' });
        this.hooks.onRolls?.();
        break;
      }
      case 'rollEnd': {
        const k = this.rolls.findIndex((r) => r.id === m.id);
        if (k >= 0) this.rolls.splice(k, 1);
        this.hooks.onRolls?.();
        break;
      }
      case 'ride': this.hooks.onRide?.(m.ok, m.ship, m.text); break;
      case 'eclaimed': this.hooks.onEntClaimed?.(m.key, m.id); break;
      case 'ents': this.onEnts(m.t, m.list); break;
      case 'ehit': this.hooks.onEntHit?.(m.id, m.from, m.dmg, m.ammo, m.zone, m.pen); break;
      case 'ekill': this.stats.kills++; this.hooks.onEntKill?.(m.kill); break;
      case 'eown': this.onEnts(this.transport.now(), [m.e]); this.hooks.onEntOwn?.(m.e); break;
      case 'egone': {
        const e = this.ents.get(m.id);
        if (e) { this.ents.delete(m.id); const i = this.entList.indexOf(e); if (i >= 0) this.entList.splice(i, 1); }
        this.hooks.onEntGone?.(m.id);
        break;
      }
      case 'ehitme': this.hooks.onEntHitMe?.(m.id, m.name, m.dmg, m.pen); break;
      case 'act': this.stats.acts++; this.hooks.onAct?.(m.from, m.a); break;
      case 'notice': this.system(m.text); this.hooks.onNotice?.(m.text, m.tone); break;
      case 'pong': break;
      case 'online': this.onlineCount = m.n; break;
    }
  }

  private onSnap(t: number, seq: number, list: readonly (PlayerState & { id: string; pv: number })[]) {
    this.stats.snaps++;
    const now = this.clock();
    this.lastSnapAt = now;
    for (const e of list) {
      let r = this.remotes.get(e.id);
      if (!r) {
        const prof = this.profiles.get(e.id) ?? newProfile(e.id);
        r = { id: e.id, profile: prof, pv: 0, buf: new SnapshotBuffer(), last: newPlayerState(), view: newInterpOut(), seq: 0, live: true, seenAt: now };
        this.remotes.set(e.id, r);
        this.list.push(r);
      }
      // Bereichswechsel (Land ↔ See) oder Mitfahrt: die Lage springt – alte Proben verwerfen statt quer über die Karte zu gleiten
      if (r.last.dom !== e.dom || r.last.ride !== e.ride) r.buf.clear();
      r.buf.push(t, e.x, e.y, e.z, e.yaw, e.hdg, e.spd, e.rx, e.ry, e.rz);
      copyState(e, r.last);
      r.seq = seq; r.live = true; r.seenAt = now;
    }
    for (const r of this.list) if (r.seq !== seq) r.live = false;
  }

  /** 4.9: Schnappschuss der geteilten Gegner (Einträge werden wiederverwendet, die vorige Probe bleibt für die Interpolation) */
  private onEnts(t: number, list: readonly EntNet[]) {
    this.stats.ents++;
    const now = this.clock();
    for (const n of list) {
      let e = this.ents.get(n.id);
      if (!e) {
        e = { ...n, look: { ...n.look, evo: [n.look.evo[0], n.look.evo[1], n.look.evo[2]] }, px: n.x, pz: n.z, ph: n.hdg, t0: t - 1 / MMO.entHz, t1: t, seenAt: now, view: { x: n.x, z: n.z, hdg: n.hdg } };
        this.ents.set(n.id, e);
        this.entList.push(e);
        continue;
      }
      e.px = e.x; e.pz = e.z; e.ph = e.hdg; e.t0 = e.t1; e.t1 = t;
      e.x = n.x; e.z = n.z; e.hdg = n.hdg; e.spd = n.spd; e.hp = n.hp; e.mhp = n.mhp; e.dis = n.dis;
      e.owner = n.owner; e.aggro = n.aggro; e.dead = n.dead; e.tier = n.tier; e.role = n.role; e.level = n.level; e.name = n.name;
      e.seenAt = now;
    }
  }

  /** 4.9: Lage eines geteilten Gegners zur Darstellung (Shard-Uhr minus Verzug, zwischen den beiden letzten Proben, kurz darüber hinaus) */
  sampleEnt(e: ClientEnt, now = this.transport.now()): ClientEnt['view'] {
    const span = Math.max(1e-3, e.t1 - e.t0);
    const k = Math.min(1.5, Math.max(0, (now - MMO.interpDelay - e.t0) / span));
    e.view.x = e.px + (e.x - e.px) * k;
    e.view.z = e.pz + (e.z - e.pz) * k;
    let dh = e.hdg - e.ph;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    e.view.hdg = e.ph + dh * Math.min(1, k);
    return e.view;
  }

  private onParty(ev: Extract<ServerMsg, { k: 'party' }>['ev']) {
    const now = this.clock();
    switch (ev.e) {
      case 'invite':
        this.invite = { party: ev.party, from: ev.from, name: ev.name, level: ev.level, team: ev.team, until: now + ev.left, total: ev.left };
        this.system(`${ev.name} (Stufe ${ev.level}) lädt dich in eine Gruppe ein.`);
        this.hooks.onInvite?.(this.invite);
        break;
      case 'sent': this.system(`Einladung an ${ev.name} gesendet.`); break;
      case 'declined': this.system(`${ev.name} ${ev.why}.`); break;
      case 'expired':
        if (this.invite?.party === ev.party) { this.invite = null; this.hooks.onInvite?.(null); }
        this.system(ev.name ? `Die Einladung (${ev.name}) ist abgelaufen.` : 'Die Einladung ist abgelaufen.');
        break;
      case 'state': {
        const prev = this.party;
        this.party = ev.party;
        if (ev.party) {
          for (const mb of ev.party.members) if (!this.profiles.has(mb.id)) { const p = newProfile(mb.id); p.name = mb.name; p.level = mb.level; p.team = mb.team; p.spec = mb.spec; p.role = mb.role; p.bot = mb.bot; this.profiles.set(mb.id, p); }
          for (const id of [...this.vitals.keys()]) if (!ev.party.members.some((mb) => mb.id === id)) this.vitals.delete(id);
        } else {
          this.vitals.clear();
          if (this.warn) { this.warn = null; this.hooks.onWarn?.(null); }
          if (this.sticky.ch === 'gruppe') this.sticky = { ch: 'sagen' };
        }
        this.namesDirty = true;
        if (this.invite && ev.party?.members.some((mb) => mb.id === this.id)) { this.invite = null; this.hooks.onInvite?.(null); }
        this.hooks.onParty?.(ev.party, prev);
        break;
      }
      case 'warn': this.warn = { until: now + ev.left, a: ev.a, b: ev.b, ids: ev.ids, fight: ev.fight }; this.hooks.onWarn?.(this.warn); break;
      case 'calm': this.warn = null; this.hooks.onWarn?.(null); break;
      case 'removed': this.system(ev.why); this.hooks.onNotice?.(ev.why, 'warn'); break;
    }
  }

  /** Zeile ins Chat-Protokoll (nur lokal: Hinweise, Hilfe, Fehler) */
  system(text: string) {
    const line = this.chat.push({ ch: 'system', from: '', name: '', to: '', toName: '', text, t: this.clock() }, false);
    this.hooks.onChat?.(line);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------------------------------------------

  /** Bekannte Kapitäne (für Flüstern, Einladen, Betrachten) */
  knownNames(): readonly string[] {
    if (this.namesDirty) {
      this.namesDirty = false;
      const set = new Set<string>();
      for (const p of this.profiles.values()) if (p.id !== this.id && p.name) set.add(p.name);
      for (const r of this.list) if (r.profile.name) set.add(r.profile.name);
      this.names = [...set];
    }
    return this.names;
  }

  /** Kennung zu einem Namen (voller Name oder eindeutiges Namenswort); sonst der Name selbst (der Shard löst ihn auf) */
  resolveId(name: string): string {
    const k = lower(name.trim());
    if (!k) return '';
    for (const p of this.profiles.values()) if (lower(p.name) === k) return p.id;
    let hit = '', n = 0;
    for (const p of this.profiles.values()) if (lower(p.name).split(/\s+/).includes(k)) { hit = p.id; n++; }
    return n === 1 ? hit : name.trim();
  }

  nameOf(id: string): string { return this.profiles.get(id)?.name ?? this.remotes.get(id)?.profile.name ?? id; }

  /** Eine Zeile aus der Eingabe ausführen (Text, Slash-Befehle) */
  submit(line: string) {
    const cmd = parseChatLine(line, this.sticky, this.knownNames());
    switch (cmd.kind) {
      case 'none': return;
      case 'say':
        this.sticky = { ch: cmd.ch };
        if (cmd.ch === 'gruppe' && !this.party) { this.system('Du bist in keiner Gruppe.'); return; }
        this.transport.send({ k: 'chat', ch: cmd.ch, text: cmd.text, to: '' });
        return;
      case 'whisper':
        this.sticky = { ch: 'fluestern', to: cmd.to };
        this.transport.send({ k: 'chat', ch: 'fluestern', text: cmd.text, to: this.resolveId(cmd.to) });
        return;
      case 'reply': this.reply(cmd.text); return;
      case 'invite': this.inviteKey(cmd.who); return;
      case 'leave': this.leave(); return;
      case 'kick': this.transport.send({ k: 'kick', id: this.resolveId(cmd.who) }); return;
      case 'promote': this.transport.send({ k: 'promote', id: this.resolveId(cmd.who) }); return;
      case 'inspect': this.inspect(this.resolveId(cmd.who)); return;
      case 'ride': this.hooks.onRideRequest?.(); return;
      case 'unride': this.hooks.onUnrideRequest?.(); return;
      case 'help': for (const l of CHAT_HELP) this.system(l); return;
      case 'channel': this.sticky = cmd.sticky; this.system(`Kanal: ${stickyLabel(cmd.sticky)}`); return;
      case 'error': this.system(cmd.text); return;
    }
  }

  /** Antwort auf das letzte Flüstern (/r, Taste R) */
  reply(text: string) {
    const w = this.lastWhisper;
    if (!w) { this.system('Niemand hat dir geflüstert.'); return; }
    this.sticky = { ch: 'fluestern', to: w.name };
    if (text) this.transport.send({ k: 'chat', ch: 'fluestern', text, to: w.id });
  }

  /** Taste R antwortet nur auf ein frisches Flüstern */
  canQuickReply(): boolean { return !!this.lastWhisper && this.clock() - this.lastWhisper.at <= MMO.replyWindow; }

  // ---------------------------------------------------------------------------------------------------------------
  // Gruppe und Mitspieler
  // ---------------------------------------------------------------------------------------------------------------

  inviteKey(key: string) { const id = this.resolveId(key); if (id) this.transport.send({ k: 'invite', to: id }); }
  accept() { const i = this.invite; if (!i) return; this.invite = null; this.hooks.onInvite?.(null); this.transport.send({ k: 'reply', party: i.party, accept: true }); }
  decline() { const i = this.invite; if (!i) return; this.invite = null; this.hooks.onInvite?.(null); this.transport.send({ k: 'reply', party: i.party, accept: false }); }
  leave() { if (!this.party) { this.system('Du bist in keiner Gruppe.'); return; } this.transport.send({ k: 'leave' }); }
  kick(id: string) { this.transport.send({ k: 'kick', id }); }
  promote(id: string) { this.transport.send({ k: 'promote', id }); }
  inspect(id: string) { if (id) this.transport.send({ k: 'inspect', id }); }
  heal(to: string, frac: number) { this.transport.send({ k: 'heal', to, frac }); }
  horn(x: number, z: number, heal: number, will: number) { this.transport.send({ k: 'horn', x, z, heal, will }); }
  share(what: ShareKind, ref: string, amount: number, x: number, z: number) { if (this.party) this.transport.send({ k: 'share', what, ref, amount, x, z }); }
  ride(ship: string, rx: number, ry: number, rz: number) { this.transport.send({ k: 'ride', ship, rx, ry, rz }); }
  unride() { this.transport.send({ k: 'unride' }); }
  hit(to: string, dmg: number, land = false) { this.transport.send({ k: 'hit', to, dmg, land }); }
  /** 4.8B: Fund an den Shard (nur in einer Gruppe sinnvoll; ohne Gruppe kommt alles zurück) */
  loot(gold: number, rep: number, power: string, items: LootItemNet[]) { this.transport.send({ k: 'loot', gold, rep, power, items }); }
  /** 4.8B: Wahl in einer Würfel-Sitzung (die Karte merkt sie sich, der Shard entscheidet) */
  roll(id: string, choice: RollChoice) {
    const r = this.rolls.find((x) => x.id === id);
    if (!r || r.choice) return;
    if (choice === 'bedarf' && !r.needOk) { this.system(r.needWhy); return; }
    r.choice = choice;
    this.transport.send({ k: 'roll', id, choice });
    this.hooks.onRolls?.();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 4.9: geteilte Gegner und Kampf-Aktionen
  // ---------------------------------------------------------------------------------------------------------------

  /** Eigenen Gegner teilen (Antwort: `onEntClaimed`) */
  claimEnt(e: EntSpawnNet) { if (this.online) this.transport.send({ k: 'eclaim', e }); }
  /** Lage und Leben der eigenen geteilten Gegner (die Liste wird nur gelesen) */
  reportEnts(list: readonly EntStateNet[]) {
    if (!this.online || !list.length) return;
    this.estate.list = list as EntStateNet[];
    this.transport.send(this.estate);
  }
  /** Treffer auf einen geteilten Gegner (`applied` = schon beim Besitzer verrechnet) */
  hitEnt(id: string, dmg: number, applied: boolean, ammo = 'kugel', zone: 'hull' | 'sail' = 'hull', pen = 3) { if (this.online && dmg > 0) this.transport.send({ k: 'ehit', id, dmg, ammo, zone, pen, applied }); }
  /** Eigener geteilter Gegner ist untergegangen */
  entDead(id: string, by: string) { if (this.online) this.transport.send({ k: 'edead', id, by }); }
  /** Eigenen geteilten Gegner abgeben (zu weit weg) */
  releaseEnt(id: string) { if (this.online) this.transport.send({ k: 'erelease', id }); }
  /** Eigener geteilter Gegner trifft das Schiff eines Mitspielers */
  entPlayerHit(id: string, to: string, dmg: number, pen: number) { if (this.online && dmg > 0) this.transport.send({ k: 'ephit', id, to, dmg, pen }); }
  /** Kampf-Aktion zur Darstellung bei den Mitspielern */
  act(a: ActNet) { if (this.online) this.transport.send({ k: 'act', a }); }

  inParty(id: string): boolean { return !!this.party?.members.some((m) => m.id === id); }
  /** Uhr des Clients (s) – Grundlage der Würfel-Fristen */
  time(): number { return this.clock(); }
  get leader(): boolean { return this.party?.leader === this.id; }
  get partySize(): number { return this.party?.members.length ?? 0; }

  /** Lage eines Mitspielers zur Darstellung (Shard-Uhr minus Verzug) */
  sample(r: RemotePlayer, now = this.transport.now()): InterpOut {
    if (!r.buf.sample(now - MMO.interpDelay, r.view)) { r.view.x = r.last.x; r.view.y = r.last.y; r.view.z = r.last.z; r.view.yaw = r.last.yaw; r.view.hdg = r.last.hdg; r.view.spd = r.last.spd; r.view.rx = r.last.rx; r.view.ry = r.last.ry; r.view.rz = r.last.rz; }
    return r.view;
  }
}
