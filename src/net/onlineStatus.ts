// 4.8.1 – Live-Anzeige „wer ist online?“ für den Startbildschirm (läuft die ganze Seite über, auch im Hauptmenü, ohne Spielstand):
// - **Server-Modus** (Adresse aus `serverChoice`): eine schlanke WebSocket-Verbindung meldet sich mit `watch` beim Relay-Server
//   (`server/mmoRelayServer.mjs`) und bekommt bei jeder Änderung sofort `online` (Zahl der verbundenen Kapitäne). Wiederverbinden mit
//   wachsender Pause, Lebenszeichen alle `MMO.watchPing` Sekunden.
// - **Lokal-Shard** (ohne Adresse, Standard auf GitHub Pages): die Tabs dieses Browsers rufen sich über einen eigenen BroadcastChannel zu;
//   gezählt wird jeder Tab, der sich in den letzten 3,5 s gemeldet hat (dieser eingeschlossen).
// Die Anzeige selbst ist rein (`onlineBadge`) und getestet; `OnlineStatus` meldet Änderungen an Abonnenten.
import { MMO, cleanServerMsg, decodePacket, encodePacket } from './mmoProtocol';
import type { ChannelLike, SocketLike, Timers } from './mmoTransport';
import type { ServerChoice } from './serverUrl';

export type OnlineMode = 'server' | 'local';
export type OnlineConn = 'connecting' | 'online' | 'offline';

export interface OnlineSnapshot {
  mode: OnlineMode;
  conn: OnlineConn;
  /** Kapitäne: auf dem Server alle verbundenen, lokal die aktiven Tabs */
  count: number;
  /** davon in der geteilten See (nur Server) */
  world: number;
  shard: string;
  /** Server-Adresse ('' = Lokal-Shard) */
  url: string;
}

export type BadgeTone = 'live' | 'local' | 'wait' | 'down';
export interface BadgeView { tone: BadgeTone; text: string; tip: string }

const plural = (n: number) => (n === 1 ? 'Kapitän' : 'Kapitäne');
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };

/** Text und Ton des Status-Badges (rein) */
export function onlineBadge(s: OnlineSnapshot): BadgeView {
  if (s.mode === 'local') {
    return {
      tone: 'local',
      text: `Lokal-Shard · ${s.count} aktiv`,
      tip: 'Alle Tabs dieses Browsers teilen eine See. Für echte Mitspieler im Netz den Spiel-Link mit ?⁠server=wss://… öffnen – dann landet jeder, der ihn bekommt, auf demselben Server.',
    };
  }
  const host = hostOf(s.url);
  if (s.conn === 'online') {
    return {
      tone: 'live',
      text: `Server online · ${s.count} ${plural(s.count)}`,
      tip: `Verbunden mit ${host}${s.shard ? ` („${s.shard}“)` : ''} · ${s.world} davon auf See. „Spiel teilen“ schickt den Link samt Server mit.`,
    };
  }
  if (s.conn === 'connecting') return { tone: 'wait', text: 'Server · verbinde …', tip: `Verbinde mit ${host} …` };
  return { tone: 'down', text: 'Server nicht erreichbar', tip: `${host} antwortet gerade nicht – neuer Versuch läuft. Mit ?⁠server=lokal spielst du im Lokal-Shard.` };
}

// ---------------------------------------------------------------------------------------------------------------
// Kennung des Tabs (dieselbe für Shard, Server und Zähler; bleibt beim Neuladen gleich)
// ---------------------------------------------------------------------------------------------------------------

let tab = '';
export function mmoTabId(): string {
  if (tab) return tab;
  const make = () => {
    const a = new Uint32Array(2);
    try { crypto.getRandomValues(a); } catch { a[0] = Math.floor(Math.random() * 2 ** 32); a[1] = Math.floor(Math.random() * 2 ** 32); }
    return `p:${a[0].toString(36)}${a[1].toString(36)}`.slice(0, 14);
  };
  try {
    const k = 'sk-mmo-id';
    let id = sessionStorage.getItem(k) ?? '';
    if (!/^p:[a-z0-9]{6,16}$/.test(id)) { id = make(); sessionStorage.setItem(k, id); }
    tab = id;
  } catch { tab = make(); }
  return tab;
}

// ---------------------------------------------------------------------------------------------------------------
// Zähler
// ---------------------------------------------------------------------------------------------------------------

export interface OnlineDeps {
  channel?: (name: string) => ChannelLike | null;
  socket?: (url: string) => SocketLike;
  /** Uhr in Sekunden */
  clock?: () => number;
  timers?: Timers;
}

/** Name des Zähl-Kanals der Tabs (getrennt vom Shard-Kanal, damit auch Tabs im Hauptmenü zählen) */
export const ONLINE_CHANNEL = 'sturmkrone-online-v1';
/** Ein Tab meldet sich jede Sekunde und gilt nach so langer Stille (s) als geschlossen */
export const TAB_LOST = 3.5;

const OPEN = 1;
const defaultChannel = (name: string): ChannelLike | null => {
  try { return typeof BroadcastChannel === 'function' ? (new BroadcastChannel(name) as unknown as ChannelLike) : null; } catch { return null; }
};
const realTimers: Timers = { every: (ms, fn) => { const h = setInterval(fn, ms); return () => clearInterval(h); } };

export class OnlineStatus {
  readonly mode: OnlineMode;
  private snap: OnlineSnapshot;
  private readonly subs = new Set<(s: OnlineSnapshot) => void>();
  private readonly clock: () => number;
  private stopTimer: (() => void) | null = null;
  // lokal
  private ch: ChannelLike | null = null;
  private readonly tabs = new Map<string, number>();
  private beaconT = Number.NEGATIVE_INFINITY;
  // Server
  private ws: SocketLike | null = null;
  private retry = 0;
  private reconnectAt = 0;
  private lastRx = 0;
  private pingT = Number.NEGATIVE_INFINITY;
  private unhook: (() => void) | null = null;
  readonly stats = { opened: 0, received: 0 };

  constructor(choice: Pick<ServerChoice, 'url'>, private readonly id: string, private readonly deps: OnlineDeps = {}) {
    this.mode = choice.url ? 'server' : 'local';
    this.clock = deps.clock ?? (() => Date.now() / 1000);
    this.snap = { mode: this.mode, conn: this.mode === 'local' ? 'online' : 'connecting', count: 1, world: 0, shard: '', url: choice.url };
  }

  get snapshot(): Readonly<OnlineSnapshot> { return this.snap; }

  /** Änderungen hören; ruft sofort einmal mit dem aktuellen Stand */
  subscribe(fn: (s: OnlineSnapshot) => void): () => void {
    this.subs.add(fn);
    fn(this.snap);
    return () => { this.subs.delete(fn); };
  }

  start() {
    if (this.stopTimer) return;
    if (this.mode === 'local') {
      this.ch = (this.deps.channel ?? defaultChannel)(ONLINE_CHANNEL);
      if (this.ch) this.ch.onmessage = (ev) => this.onTab(ev.data);
      this.beacon();
    } else this.open();
    this.stopTimer = (this.deps.timers ?? realTimers).every(500, () => this.pump());
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const bye = () => this.stop();
      window.addEventListener('pagehide', bye);
      this.unhook = () => window.removeEventListener('pagehide', bye);
    }
  }

  stop() {
    this.stopTimer?.(); this.stopTimer = null;
    this.unhook?.(); this.unhook = null;
    if (this.ch) { try { this.ch.postMessage({ t: 'bye', id: this.id }); } catch { /* zu */ } this.ch.close(); this.ch = null; }
    const ws = this.ws;
    this.ws = null;
    if (ws) { try { ws.close(1000, 'bye'); } catch { /* zu */ } }
  }

  /** alle 500 ms: Tabs zählen bzw. Lebenszeichen, Zeitüberschreitung, Wiederverbinden */
  pump() {
    const t = this.clock();
    if (this.mode === 'local') {
      if (t - this.beaconT >= 1) this.beacon();
      for (const [id, seen] of this.tabs) if (t - seen > TAB_LOST) this.tabs.delete(id);
      this.set({ count: this.tabs.size + 1 });
      return;
    }
    if (!this.ws) { if (t >= this.reconnectAt) this.open(); return; }
    if (this.ws.readyState !== OPEN) return;
    if (t - this.pingT >= MMO.watchPing) { this.pingT = t; this.ws.send(encodePacket({ k: 'ping', t })); }
    if (t - this.lastRx > MMO.watchPing * 3) this.drop();
  }

  private beacon() {
    this.beaconT = this.clock();
    try { this.ch?.postMessage({ t: 'here', id: this.id }); } catch { /* zu */ }
  }

  private onTab(raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const m = raw as { t?: unknown; id?: unknown };
    if (typeof m.id !== 'string' || m.id === this.id || m.id.length > 48) return;
    if (m.t === 'here') {
      const fresh = !this.tabs.has(m.id);
      this.tabs.set(m.id, this.clock());
      // ein neuer Tab soll sofort zählen – und auch uns sofort sehen
      if (fresh) { this.set({ count: this.tabs.size + 1 }); this.beacon(); }
    } else if (m.t === 'bye' && this.tabs.delete(m.id)) this.set({ count: this.tabs.size + 1 });
  }

  private open() {
    this.set({ conn: this.stats.opened ? 'offline' : 'connecting' });
    let ws: SocketLike;
    try { ws = (this.deps.socket ?? ((u) => new WebSocket(u) as unknown as SocketLike))(this.snap.url); } catch { this.schedule(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.stats.opened++;
      this.lastRx = this.clock();
      ws.send(encodePacket({ k: 'watch', id: this.id }));
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this.lastRx = this.clock();
      const m = cleanServerMsg(decodePacket(ev.data));
      if (!m) return;
      this.stats.received++;
      if (m.k === 'online') this.set({ conn: 'online', count: m.n, world: m.world, shard: m.shard });
    };
    ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.schedule(); } };
    ws.onerror = () => { /* onclose folgt */ };
  }

  private drop() {
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(4000, 'Zeitüberschreitung'); } catch { /* egal */ }
    this.schedule();
  }

  private schedule() {
    const delay = Math.min(MMO.reconnectMax, MMO.reconnectMin * 2 ** this.retry);
    this.retry++;
    this.reconnectAt = this.clock() + delay;
    this.set({ conn: 'offline' });
  }

  private set(p: Partial<OnlineSnapshot>) {
    const s = this.snap;
    let changed = false;
    for (const k of Object.keys(p) as (keyof OnlineSnapshot)[]) if (s[k] !== p[k]) { changed = true; break; }
    if (!changed) return;
    this.snap = { ...s, ...p };
    for (const fn of this.subs) fn(this.snap);
  }
}
