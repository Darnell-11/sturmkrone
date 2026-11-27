// Phase 4.8A – Transporte der MMO-Schicht. Das Spiel kennt nur `MmoTransport` (Absichten senden, Nachrichten empfangen); dahinter steckt
// entweder ein echter, autoritativer WebSocket-Server (`WebSocketMmoTransport`, `VITE_MMO_SERVER_URL`: Wiederverbinden mit wachsender
// Pause, Herzschlag, Latenz, Server-Uhr für die Schnappschuss-Interpolation) oder der lokale Shard (`LocalShardMmoTransport`, Standard ohne
// Server): mehrere geöffnete Browser-Tabs teilen über `BroadcastChannel` eine Welt in Echtzeit. Der älteste Tab leitet den Shard (er rechnet
// `MmoAuthority` und die MMO-Kapitäne), die anderen schicken ihm ihre Absichten; schließt er, übernimmt der nächste.
//
// Zustellung über `onMessage`: eine Nachricht gilt nur während des Aufrufs (Schnappschüsse werden wiederverwendet – wer etwas behalten will,
// kopiert es).
import { MMO, MMO_PROTOCOL, cleanIntent, cleanServerMsg, decodePacket, encodePacket, type ClientIntent, type HelloIntent, type ServerMsg } from './mmoProtocol';
import { MmoAuthority, type DiplomacyOracle, type ZoneOracle } from './mmoAuthority';
import { ShardBots, type BotWorld } from './shardBots';

export type TransportStatus = 'offline' | 'connecting' | 'online' | 'reconnecting';

export interface MmoTransport {
  readonly kind: 'local' | 'websocket';
  readonly status: TransportStatus;
  /** Rundlauf in ms (lokal leitend: 0) */
  readonly latency: number;
  /** lokaler Shard: dieser Tab leitet ihn */
  readonly host: boolean;
  onMessage: ((m: ServerMsg) => void) | null;
  onStatus: ((s: TransportStatus) => void) | null;
  connect(hello: HelloIntent): void;
  send(i: ClientIntent): void;
  /** Uhr des Shards bzw. Servers (s) – Grundlage der Interpolation */
  now(): number;
  close(): void;
}

/** Zeitgeber (austauschbar für Tests) */
export interface Timers { every(ms: number, fn: () => void): () => void }
const realTimers: Timers = { every: (ms, fn) => { const h = setInterval(fn, ms); return () => clearInterval(h); } };
/** gemeinsame Uhr aller Tabs desselben Rechners (s) */
const wallClock = () => Date.now() / 1000;
/** Beim Schließen bzw. Verlassen des Tabs abmelden (die anderen Tabs bzw. der Server erfahren es sofort, nicht erst nach der Zeitüberschreitung) */
const onPageHide = (fn: () => void): (() => void) => {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
  window.addEventListener('pagehide', fn);
  return () => window.removeEventListener('pagehide', fn);
};

// ---------------------------------------------------------------------------------------------------------------
// Lokaler Shard (BroadcastChannel)
// ---------------------------------------------------------------------------------------------------------------

export interface ChannelLike { postMessage(m: unknown): void; onmessage: ((ev: { data: unknown }) => void) | null; close(): void }

export interface LocalShardOptions {
  /** Kennung dieses Tabs (bleibt beim Neuladen gleich: sessionStorage) */
  id: string;
  /** Name des Kanals (alle Tabs mit demselben Namen teilen eine Welt) */
  name?: string;
  diplomacy: DiplomacyOracle;
  zones: ZoneOracle;
  nationName?: (team: string) => string;
  /** Welt für die MMO-Kapitäne (null = keine Kapitäne) */
  botWorld?: BotWorld | null;
  /** Kanal anlegen (Standard: BroadcastChannel, sofern vorhanden; null = nur dieser Tab) */
  channel?: (name: string) => ChannelLike | null;
  clock?: () => number;
  timers?: Timers;
  seed?: number;
}

type Envelope =
  | { t: 'beacon'; from: string; since: number }
  | { t: 'intent'; from: string; data: unknown }
  | { t: 'msg'; to: string; data: unknown }
  | { t: 'rehello'; from: string }
  | { t: 'bye'; from: string };

const defaultChannel = (name: string): ChannelLike | null => {
  try { return typeof BroadcastChannel === 'function' ? (new BroadcastChannel(name) as unknown as ChannelLike) : null; } catch { return null; }
};

/** Leitung: die Tabs hören sich so lange (s), bevor einer sich selbst zum Leiter wählt; ein Leiter gilt nach so langer Stille (s) als weg */
const LISTEN = 1.1;
const LOST = 3.5;

export class LocalShardMmoTransport implements MmoTransport {
  readonly kind = 'local' as const;
  status: TransportStatus = 'offline';
  latency = 0;
  onMessage: ((m: ServerMsg) => void) | null = null;
  onStatus: ((s: TransportStatus) => void) | null = null;
  /** Kanal zwischen den Tabs (null = nur dieser Tab) */
  private ch: ChannelLike | null;
  private readonly clock: () => number;
  private readonly since: number;
  private readonly others = new Map<string, { since: number; seen: number }>();
  private hostId = '';
  private auth: MmoAuthority | null = null;
  private bots: ShardBots | null = null;
  private hello: HelloIntent | null = null;
  private stop: (() => void) | null = null;
  private beaconT = Number.NEGATIVE_INFINITY;
  private lastTick = Number.NaN;
  private connectedAt = 0;
  private busy = false;
  private readonly queue: ClientIntent[] = [];
  private pingT = 0;
  private unhook: (() => void) | null = null;
  /** Zahlen für Prüfungen */
  readonly stats = { sent: 0, received: 0, hosted: 0 };

  constructor(private readonly opts: LocalShardOptions) {
    this.clock = opts.clock ?? wallClock;
    this.since = this.clock();
    this.ch = (opts.channel ?? defaultChannel)(opts.name ?? 'sturmkrone-mmo-v1');
    if (this.ch) this.ch.onmessage = (ev) => this.onEnvelope(ev.data);
  }

  get host(): boolean { return !!this.hostId && this.hostId === this.opts.id; }
  get authority(): MmoAuthority | null { return this.auth; }
  get shardBots(): ShardBots | null { return this.bots; }
  get tabs(): number { return this.others.size + 1; }
  now(): number { return this.clock(); }

  connect(hello: HelloIntent) {
    this.hello = { ...hello, profile: { ...hello.profile, id: this.opts.id } };
    this.connectedAt = this.clock();
    this.setStatus('connecting');
    this.beacon();
    if (!this.ch) this.elect();
    this.stop?.();
    this.stop = (this.opts.timers ?? realTimers).every(50, () => this.pump());
    this.unhook?.();
    this.unhook = onPageHide(() => this.close());
  }

  send(i: ClientIntent) {
    if (!this.hello) return;
    if (i.k === 'hello') this.hello = { ...i, profile: { ...i.profile, id: this.opts.id } };
    this.stats.sent++;
    if (this.host && this.auth) {
      if (this.busy) { this.queue.push(i.k === 'state' ? { k: 'state', s: { ...i.s } } : i); return; }
      this.busy = true;
      try { this.auth.handle(this.opts.id, i, this.clock()); } finally { this.busy = false; }
      this.drain();
      return;
    }
    if (this.hostId && this.ch) this.post({ t: 'intent', from: this.opts.id, data: i });
  }

  close() {
    if (this.ch) this.post({ t: 'bye', from: this.opts.id });
    this.unhook?.(); this.unhook = null;
    this.stop?.(); this.stop = null;
    this.dropAuthority();
    this.ch?.close(); this.ch = null;
    this.hello = null;
    this.setStatus('offline');
  }

  /** Je Takt (50 ms): Leitung prüfen, als Leiter Shard und Kapitäne rechnen */
  pump() {
    const t = this.clock();
    if (t - this.beaconT >= 1) this.beacon();
    for (const [id, o] of this.others) if (t - o.seen > LOST) { this.others.delete(id); if (this.auth) this.auth.leave(id, t); }
    if (this.ch && t - this.connectedAt >= LISTEN) this.elect();
    else if (!this.ch) this.elect();
    if (this.host && this.auth) {
      const dt = Number.isFinite(this.lastTick) ? Math.min(0.5, t - this.lastTick) : 0;
      this.lastTick = t;
      this.busy = true;
      try {
        // der eigene Kapitän bleibt, solange dieser Tab lebt (auch ohne Spielschleife); fehlt er (z. B. nach einem Wechsel), meldet er sich neu
        if (this.hello && !this.auth.has(this.opts.id)) this.auth.handle(this.opts.id, this.hello, t);
        this.auth.touch(this.opts.id, t);
        this.bots?.tick(t, dt);
        this.auth.tick(t);
      } finally { this.busy = false; }
      this.drain();
    } else if (this.hostId && this.ch && this.status === 'online' && t - this.pingT >= MMO.heartbeat) {
      this.pingT = t;
      this.post({ t: 'intent', from: this.opts.id, data: { k: 'ping', t: performance.now() } });
    }
  }

  private drain() {
    while (this.queue.length && this.auth && !this.busy) {
      const i = this.queue.shift()!;
      this.busy = true;
      try { this.auth.handle(this.opts.id, i, this.clock()); } finally { this.busy = false; }
    }
  }

  private beacon() { this.beaconT = this.clock(); if (this.ch) this.post({ t: 'beacon', from: this.opts.id, since: this.since }); }

  private post(e: Envelope) { try { this.ch?.postMessage(e); } catch { /* Kanal geschlossen */ } }

  /** Leiter wählen: der älteste lebende Tab (bei Gleichstand die kleinere Kennung) */
  private elect() {
    let best = this.opts.id, bs = this.since;
    for (const [id, o] of this.others) if (o.since < bs || (o.since === bs && id < best)) { best = id; bs = o.since; }
    if (best === this.hostId) return;
    const was = this.host;
    this.hostId = best;
    if (this.host) this.becomeHost();
    else {
      if (was) this.dropAuthority();
      if (this.hello) this.post({ t: 'intent', from: this.opts.id, data: this.hello });
    }
  }

  private becomeHost() {
    const o = this.opts;
    const auth = new MmoAuthority(o.diplomacy, o.zones, (to, msg) => this.deliver(to, msg), o.nationName);
    this.auth = auth;
    this.lastTick = Number.NaN;
    this.stats.hosted++;
    if (o.botWorld) { this.bots = new ShardBots(auth, o.botWorld, o.seed); this.bots.spawn(this.clock()); }
    if (this.hello) auth.handle(o.id, this.hello, this.clock());
    if (this.ch) this.post({ t: 'rehello', from: o.id });
  }

  private dropAuthority() { this.auth = null; this.bots = null; this.queue.length = 0; }

  /** Nachricht des Shards: an diesen Tab direkt, an andere über den Kanal */
  private deliver(to: string, msg: ServerMsg) {
    if (to === this.opts.id) { this.receive(msg); return; }
    if (this.ch) this.post({ t: 'msg', to, data: msg });
  }

  private receive(msg: ServerMsg) {
    this.stats.received++;
    if (msg.k === 'welcome') this.setStatus('online');
    if (msg.k === 'pong') this.latency = Math.max(0, Math.round(performance.now() - msg.t));
    this.onMessage?.(msg);
  }

  private onEnvelope(raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const e = raw as Envelope;
    const t = this.clock();
    switch (e.t) {
      case 'beacon':
        if (typeof e.from === 'string' && e.from !== this.opts.id && typeof e.since === 'number') this.others.set(e.from, { since: e.since, seen: t });
        break;
      case 'intent': {
        if (!this.host || !this.auth || typeof e.from !== 'string') return;
        const i = cleanIntent(e.data);
        if (!i) return;
        const o = this.others.get(e.from);
        if (o) o.seen = t; else this.others.set(e.from, { since: t, seen: t });
        // Absicht eines Tabs, den der Shard nicht (mehr) kennt: er soll sich neu melden
        if (i.k !== 'hello' && !this.auth.has(e.from)) { this.post({ t: 'rehello', from: this.opts.id }); return; }
        this.busy = true;
        try { this.auth.handle(e.from, i, t); } finally { this.busy = false; }
        this.drain();
        break;
      }
      case 'msg': {
        if (e.to !== this.opts.id) return;
        const m = cleanServerMsg(e.data);
        if (m) this.receive(m);
        break;
      }
      case 'rehello':
        if (typeof e.from === 'string' && e.from !== this.opts.id) {
          const o = this.others.get(e.from);
          if (o) o.seen = t;
          if (this.hostId === e.from && this.hello) this.post({ t: 'intent', from: this.opts.id, data: this.hello });
        }
        break;
      case 'bye':
        if (typeof e.from === 'string') { this.others.delete(e.from); if (this.auth) this.auth.leave(e.from, t); if (this.hostId === e.from) this.elect(); }
        break;
    }
  }

  private setStatus(s: TransportStatus) { if (s === this.status) return; this.status = s; this.onStatus?.(s); }
}

// ---------------------------------------------------------------------------------------------------------------
// WebSocket (autoritativer Server)
// ---------------------------------------------------------------------------------------------------------------

export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface WebSocketOptions {
  url: string;
  socket?: (url: string) => SocketLike;
  clock?: () => number;
  timers?: Timers;
}

const OPEN = 1;

export class WebSocketMmoTransport implements MmoTransport {
  readonly kind = 'websocket' as const;
  readonly host = false;
  status: TransportStatus = 'offline';
  latency = 0;
  onMessage: ((m: ServerMsg) => void) | null = null;
  onStatus: ((s: TransportStatus) => void) | null = null;
  private ws: SocketLike | null = null;
  private hello: HelloIntent | null = null;
  private retry = 0;
  private reconnectAt = 0;
  private lastRx = 0;
  private lastPing = Number.NEGATIVE_INFINITY;
  /** Abstand Server-Uhr − eigene Uhr (s), geglättet */
  private offset = 0;
  private offsetSet = false;
  private stop: (() => void) | null = null;
  private readonly outbox: string[] = [];
  private readonly clock: () => number;
  private unhook: (() => void) | null = null;
  readonly stats = { opened: 0, reconnects: 0, received: 0, dropped: 0 };

  constructor(private readonly opts: WebSocketOptions) { this.clock = opts.clock ?? (() => performance.now() / 1000); }

  now(): number { return this.clock() + this.offset; }

  connect(hello: HelloIntent) {
    this.hello = hello;
    this.open();
    this.stop?.();
    this.stop = (this.opts.timers ?? realTimers).every(250, () => this.pulse());
    this.unhook?.();
    this.unhook = onPageHide(() => this.close());
  }

  send(i: ClientIntent) {
    if (i.k === 'hello') this.hello = i;
    const s = encodePacket(i);
    if (this.ws && this.ws.readyState === OPEN) { this.ws.send(s); return; }
    // ohne Verbindung: Wichtiges (Chat, Gruppe) bis zur Wiederverbindung aufheben, Zustand nicht (der nächste kommt gleich)
    if (i.k !== 'state' && i.k !== 'ping' && this.outbox.length < 50) this.outbox.push(s);
  }

  close() {
    this.setStatus('offline');
    this.unhook?.(); this.unhook = null;
    this.stop?.(); this.stop = null;
    const ws = this.ws;
    this.ws = null;
    this.hello = null;
    if (ws) { try { if (ws.readyState === OPEN) ws.send(encodePacket({ k: 'bye' })); ws.close(1000, 'bye'); } catch { /* schon zu */ } }
  }

  private open() {
    if (!this.hello) return;
    this.setStatus(this.stats.opened ? 'reconnecting' : 'connecting');
    let ws: SocketLike;
    try { ws = (this.opts.socket ?? ((u) => new WebSocket(u) as unknown as SocketLike))(this.opts.url); } catch { this.scheduleReconnect(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.stats.opened++;
      this.lastRx = this.clock();
      if (this.hello) ws.send(encodePacket({ ...this.hello, v: MMO_PROTOCOL }));
      for (const s of this.outbox.splice(0)) ws.send(s);
      this.setStatus('online');
    };
    ws.onmessage = (ev) => {
      this.lastRx = this.clock();
      const m = cleanServerMsg(decodePacket(ev.data));
      if (!m) { this.stats.dropped++; return; }
      this.stats.received++;
      if (m.k === 'pong') {
        const now = this.clock(), rtt = Math.max(0, now - m.t);
        this.latency = Math.round(this.latency * 0.7 + rtt * 1000 * 0.3);
        const off = m.st + rtt / 2 - now;
        this.offset = this.offsetSet ? this.offset * 0.8 + off * 0.2 : off;
        this.offsetSet = true;
      }
      this.onMessage?.(m);
    };
    ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.scheduleReconnect(); } };
    ws.onerror = () => { /* onclose folgt */ };
  }

  private scheduleReconnect() {
    if (!this.hello) return;
    const delay = Math.min(MMO.reconnectMax, MMO.reconnectMin * 2 ** this.retry);
    this.retry++;
    this.stats.reconnects++;
    this.reconnectAt = this.clock() + delay;
    this.setStatus('reconnecting');
  }

  /** alle 250 ms: Herzschlag, Zeitüberschreitung, Wiederverbinden */
  pulse() {
    const t = this.clock();
    if (!this.ws) { if (this.hello && t >= this.reconnectAt) this.open(); return; }
    if (this.ws.readyState !== OPEN) return;
    if (t - this.lastPing >= MMO.heartbeat) { this.lastPing = t; this.ws.send(encodePacket({ k: 'ping', t })); }
    if (t - this.lastRx > MMO.timeout) { const ws = this.ws; this.ws = null; try { ws.close(4000, 'Zeitüberschreitung'); } catch { /* egal */ } this.scheduleReconnect(); }
  }

  private setStatus(s: TransportStatus) { if (s === this.status) return; this.status = s; this.onStatus?.(s); }
}

/** Transport nach Umgebung: mit Server-Adresse WebSocket, sonst der lokale Shard */
export function createMmoTransport(url: string | undefined, local: LocalShardOptions): MmoTransport {
  const u = (url ?? '').trim();
  return u ? new WebSocketMmoTransport({ url: u }) : new LocalShardMmoTransport(local);
}
