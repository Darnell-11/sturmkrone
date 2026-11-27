// 4.8.1 – Live-Online-Anzeige auf dem Startbildschirm, `?server=`-Erkennung und der WebSocket-Relay-Server (`npm run mmo-server`):
// Badge-Texte, Server-Adresse aus URL/Speicher/Build, Tab-Zähler des Lokal-Shards, Wächter-Verbindung zum Server, neue Paketarten und
// ein echter Server-Prozess mit Handschlag, Online-Zahl, Schnappschüssen, Chat-Kanälen und Gruppen samt Diplomatie-Prüfung.
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanDiploPairs, cleanIntent, cleanServerMsg, encodePacket, type ServerMsg } from '../src/net/mmoProtocol';
import { ONLINE_CHANNEL, OnlineStatus, TAB_LOST, onlineBadge, type OnlineSnapshot } from '../src/net/onlineStatus';
import { SERVER_STORE_KEY, parseServerParam, resolveServerUrl, shareLink, validServerUrl, type KeyStore } from '../src/net/serverUrl';
import type { ChannelLike, SocketLike, Timers } from '../src/net/mmoTransport';

// ---------------------------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------------------------

function memStore(init: Record<string, string> = {}): KeyStore & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
}

/** BroadcastChannel-Attrappe: alle Kanäle mit demselben Namen hören einander (nicht sich selbst) */
function channelBus() {
  const subs = new Map<string, Set<ChannelLike>>();
  return (name: string): ChannelLike => {
    const set = subs.get(name) ?? new Set();
    subs.set(name, set);
    const ch: ChannelLike = {
      onmessage: null,
      postMessage: (m) => { for (const o of set) if (o !== ch) o.onmessage?.({ data: structuredClone(m) }); },
      close: () => { set.delete(ch); },
    };
    set.add(ch);
    return ch;
  };
}

const manualTimers = (): Timers & { fns: (() => void)[] } => {
  const fns: (() => void)[] = [];
  return { fns, every: (_ms, fn) => { fns.push(fn); return () => { const i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); }; } };
};

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send(d: string) { this.sent.push(d); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.({}); }
  push(m: ServerMsg) { this.onmessage?.({ data: encodePacket(m) }); }
  drop() { this.readyState = 3; this.onclose?.({}); }
}

const snap = (p: Partial<OnlineSnapshot>): OnlineSnapshot => ({ mode: 'server', conn: 'online', count: 1, world: 0, shard: 'Bernsteinsee 1', url: 'wss://see.example.org', ...p });

// ---------------------------------------------------------------------------------------------------------------
// Server-Adresse (?server=)
// ---------------------------------------------------------------------------------------------------------------

describe('Server-Adresse aus der Browser-URL', () => {
  it('nimmt nur ws:// und wss:// mit Rechnername an', () => {
    expect(validServerUrl('wss://see.example.org')).toBe('wss://see.example.org');
    expect(validServerUrl(' ws://localhost:8787 ')).toBe('ws://localhost:8787');
    expect(validServerUrl('wss://see.example.org/mmo/')).toBe('wss://see.example.org/mmo/');
    for (const bad of ['', 'https://see.example.org', 'javascript:alert(1)', 'wss://', 'wss://nutzer:pw@see.example.org', 'see.example.org', 'x'.repeat(400), 42, null]) {
      expect(validServerUrl(bad)).toBe('');
    }
  });

  it('liest ?server= aus der Suche – Adresse, „lokal“ oder nichts', () => {
    expect(parseServerParam('?server=wss://see.example.org')).toBe('wss://see.example.org');
    expect(parseServerParam('?foo=1&server=' + encodeURIComponent('wss://see.example.org:9443/shard'))).toBe('wss://see.example.org:9443/shard');
    expect(parseServerParam('?server=lokal')).toBe('lokal');
    expect(parseServerParam('?server=AUS')).toBe('lokal');
    expect(parseServerParam('?server=http://boese.example')).toBeNull();
    expect(parseServerParam('')).toBeNull();
  });

  it('merkt sich die Adresse aus dem Link, danach gilt sie ohne Parameter weiter', () => {
    const store = memStore();
    expect(resolveServerUrl('?server=wss://see.example.org', store, '')).toEqual({ url: 'wss://see.example.org', source: 'url' });
    expect(store.data[SERVER_STORE_KEY]).toBe('wss://see.example.org');
    expect(resolveServerUrl('', store, 'wss://build.example.org')).toEqual({ url: 'wss://see.example.org', source: 'stored' });
  });

  it('Reihenfolge URL > Speicher > Build; „?server=lokal“ vergisst die gemerkte Adresse', () => {
    const store = memStore({ [SERVER_STORE_KEY]: 'wss://alt.example.org' });
    expect(resolveServerUrl('?server=wss://neu.example.org', store, 'wss://build.example.org').url).toBe('wss://neu.example.org');
    expect(resolveServerUrl('?server=lokal', store, 'wss://build.example.org')).toEqual({ url: '', source: 'none' });
    expect(store.data[SERVER_STORE_KEY]).toBeUndefined();
    expect(resolveServerUrl('', store, 'wss://build.example.org')).toEqual({ url: 'wss://build.example.org', source: 'env' });
    expect(resolveServerUrl('', store, undefined)).toEqual({ url: '', source: 'none' });
    // kaputter Speicher (privater Modus) bricht nichts
    const broken: KeyStore = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(resolveServerUrl('?server=wss://see.example.org', broken, '').url).toBe('wss://see.example.org');
    expect(resolveServerUrl('', broken, '').source).toBe('none');
    // ungültiger gespeicherter Wert wird ignoriert
    expect(resolveServerUrl('', memStore({ [SERVER_STORE_KEY]: 'http://x' }), '').source).toBe('none');
  });

  it('„Spiel teilen“ hängt den Server an den Link (Mitspieler landen ohne Einstellungen auf demselben Server)', () => {
    const link = shareLink('https://darnell-11.github.io/sturmkrone/', 'wss://see.example.org');
    expect(link).toBe('https://darnell-11.github.io/sturmkrone/?server=wss%3A%2F%2Fsee.example.org');
    expect(parseServerParam(new URL(link).search)).toBe('wss://see.example.org');
    expect(shareLink('https://darnell-11.github.io/sturmkrone/', '')).toBe('https://darnell-11.github.io/sturmkrone/');
  });

  it('das Spiel nutzt die gewählte Adresse für den Transport und den Teilen-Link', () => {
    const game = readFileSync('src/core/game.ts', 'utf8');
    expect(game).toMatch(/const url = serverChoice\(\)\.url;\s*\n[^\n]*\n\s*this\.mmoTransport = createMmoTransport\(url/);
    expect(readFileSync('src/core/install.ts', 'utf8')).toMatch(/shareLink\(base, serverChoice\(\)\.url\)/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------------------------------------------

describe('Online-Badge des Startbildschirms', () => {
  it('Server online: grüner Puls und „Server online · X Kapitäne“ (Einzahl bei 1)', () => {
    expect(onlineBadge(snap({ count: 7, world: 3 }))).toMatchObject({ tone: 'live', text: 'Server online · 7 Kapitäne' });
    expect(onlineBadge(snap({ count: 1 })).text).toBe('Server online · 1 Kapitän');
    expect(onlineBadge(snap({ count: 7, world: 3 })).tip).toContain('see.example.org');
  });

  it('ohne Server: Lokal-Shard mit Zahl der Tabs und Hinweis auf ?server=wss://', () => {
    const v = onlineBadge(snap({ mode: 'local', url: '', count: 3 }));
    expect(v.tone).toBe('local');
    expect(v.text).toBe('Lokal-Shard · 3 aktiv');
    // „?“ und „server=“ hält ein unsichtbarer Wortverbinder zusammen (kein Umbruch im Hinweis)
    expect(v.tip).toContain('?⁠server=wss://');
    expect(v.tip.replace('⁠', '')).toContain('?server=wss://');
  });

  it('Verbinden und Ausfall sind erkennbar', () => {
    expect(onlineBadge(snap({ conn: 'connecting' })).tone).toBe('wait');
    const down = onlineBadge(snap({ conn: 'offline' }));
    expect(down.tone).toBe('down');
    expect(down.text).toBe('Server nicht erreichbar');
    expect(down.tip.replace('⁠', '')).toContain('?server=lokal');
  });

  it('das Hauptmenü zeigt das Badge über „Spielen“ und führt es live nach', () => {
    const menus = readFileSync('src/ui/menus.ts', 'utf8');
    expect(menus).toMatch(/\$\{this\.onlineHtml\(\)\}\s*\n\s*<button class="primary" data-a="play"/);
    expect(menus).toMatch(/online\.subscribe\(\(\) => this\.paintOnline\(\)\)/);
    const css = readFileSync('src/ui/css/screens.css', 'utf8');
    // der Hinweis liegt über dem Badge und fängt keine Klicks (verdeckt keine Knöpfe)
    expect(css).toMatch(/\.online-tip \{[^}]*bottom: calc\(100% \+[^}]*pointer-events: none/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Zähler: Lokal-Shard (Tabs) und Server-Wächter
// ---------------------------------------------------------------------------------------------------------------

describe('Online-Zähler', () => {
  it('Lokal-Shard: zählt die offenen Tabs sofort und vergisst geschlossene', () => {
    let now = 100;
    const bus = channelBus();
    const tA = manualTimers(), tB = manualTimers(), tC = manualTimers();
    const mk = (id: string, timers: Timers) => new OnlineStatus({ url: '' }, id, { channel: bus, clock: () => now, timers });
    const a = mk('p:aaaaaa', tA), b = mk('p:bbbbbb', tB), c = mk('p:cccccc', tC);
    const seen: number[] = [];
    a.subscribe((s) => seen.push(s.count));
    expect(a.mode).toBe('local');
    a.start(); b.start();
    expect(a.snapshot.count).toBe(2);
    expect(b.snapshot.count).toBe(2);
    c.start();
    expect(a.snapshot.count).toBe(3);
    // B schließt sauber (pagehide): sofort abgemeldet
    b.stop();
    expect(a.snapshot.count).toBe(2);
    // C stürzt ab (keine Abmeldung): nach TAB_LOST vergessen
    tC.fns.length = 0;
    for (let k = 0; k < 10; k++) { now += 0.5; tA.fns.forEach((f) => f()); }
    expect(now - 100).toBeGreaterThan(TAB_LOST);
    expect(a.snapshot.count).toBe(1);
    expect(seen).toEqual([1, 2, 3, 2, 1]);
    expect(ONLINE_CHANNEL).not.toBe('sturmkrone-mmo-v1');
  });

  it('Server: meldet sich als Wächter, übernimmt die Zahl und verbindet neu', () => {
    let now = 0;
    const socks: FakeSocket[] = [];
    const timers = manualTimers();
    const o = new OnlineStatus({ url: 'wss://see.example.org' }, 'p:wachtab1', { socket: () => { const s = new FakeSocket(); socks.push(s); return s; }, clock: () => now, timers });
    expect(o.mode).toBe('server');
    o.start();
    expect(o.snapshot.conn).toBe('connecting');
    socks[0].open();
    expect(JSON.parse(socks[0].sent[0])).toEqual({ k: 'watch', id: 'p:wachtab1' });
    socks[0].push({ k: 'online', n: 12, world: 9, shard: 'Bernsteinsee 1' });
    expect(o.snapshot).toMatchObject({ conn: 'online', count: 12, world: 9 });
    expect(onlineBadge(o.snapshot as OnlineSnapshot).text).toBe('Server online · 12 Kapitäne');
    // Lebenszeichen
    now = 11; timers.fns.forEach((f) => f());
    expect(socks[0].sent.some((s) => JSON.parse(s).k === 'ping')).toBe(true);
    // Leitung weg: „nicht erreichbar“, neuer Versuch nach der Pause
    socks[0].drop();
    expect(o.snapshot.conn).toBe('offline');
    timers.fns.forEach((f) => f());
    expect(socks.length).toBe(1);
    now += 1.1; timers.fns.forEach((f) => f());
    expect(socks.length).toBe(2);
    socks[1].open();
    expect(JSON.parse(socks[1].sent[0]).k).toBe('watch');
    o.stop();
  });

  it('neue Paketarten laufen durch die Säuberung', () => {
    expect(cleanIntent({ k: 'watch', id: 'p:abc123' })).toEqual({ k: 'watch', id: 'p:abc123' });
    expect(cleanIntent({ k: 'watch', id: '<script>' })).toBeNull();
    expect(cleanServerMsg({ k: 'online', n: 5.4, world: -3, shard: 'See\u0000 1' })).toEqual({ k: 'online', n: 5, world: 0, shard: 'See 1' });
    const pairs = cleanDiploPairs([
      { a: 'england', b: 'frankreich', s: 'krieg' },
      { a: 'england', b: 'england', s: 'krieg' },
      { a: 'England!', b: 'x', s: 'krieg' },
      { a: 'deutschland', b: 'niederlande', s: 'erzfeind' },
      ...Array.from({ length: 50 }, () => ({ a: 'kurogane', b: 'marine', s: 'neutral' })),
    ]);
    expect(pairs[0]).toEqual({ a: 'england', b: 'frankreich', s: 'krieg' });
    expect(pairs.length).toBeLessThanOrEqual(32);
    expect(pairs.every((p) => p.a !== p.b && /^[a-z]+$/.test(p.a))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Relay-Server als echter Prozess (`npm run mmo-server`)
// ---------------------------------------------------------------------------------------------------------------

interface Client { ws: WebSocket; msgs: ServerMsg[]; send(o: unknown): void }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('Zeitüberschreitung'); await sleep(20); }
}

const state = (x: number, z = 0) => ({ x, y: 0, z, yaw: 0, dom: 'land', spd: 0, hdg: 0, hull: 0, mhull: 0, hp: 100, mhp: 100, will: 0, mwill: 100, ride: '', rx: 0, ry: 0, rz: 0, combat: false, zone: '' });
const profile = (id: string, name: string, team: string) => ({ id, name, level: 10, base: 'schwert', spec: '', role: '', classLabel: '', team, gearTier: 1, shipTier: 1, shipName: '', gender: 'w', look: 2, bot: true });

describe('Relay-Server (Prozess, WebSocket-Handschlag und Verteilung)', () => {
  let proc: ChildProcess;
  let port = 0;
  const clients: Client[] = [];
  const connect = async (): Promise<Client> => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const c: Client = { ws, msgs: [], send: (o) => ws.send(JSON.stringify(o)) };
    ws.onmessage = (e) => { const m = cleanServerMsg(JSON.parse(String(e.data))); if (m) c.msgs.push(m); };
    await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('kein Handschlag')); });
    clients.push(c);
    return c;
  };
  const lastOnline = (c: Client) => [...c.msgs].reverse().find((m): m is Extract<ServerMsg, { k: 'online' }> => m.k === 'online');
  const chats = (c: Client) => c.msgs.filter((m): m is Extract<ServerMsg, { k: 'chat' }> => m.k === 'chat').map((m) => m.msg);

  beforeAll(async () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['mmo-server']).toBe('node server/mmoRelayServer.mjs');
    proc = spawn(process.execPath, ['server/mmoRelayServer.mjs'], { env: { ...process.env, PORT: '0', HOST: '127.0.0.1', MMO_SHARD: 'Prüfsee' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout!.on('data', (d) => { out += String(d); });
    proc.stderr!.on('data', (d) => { out += String(d); });
    await until(() => /ws:\/\/localhost:(\d+)/.test(out), 15000).catch(() => { throw new Error(`Server startet nicht:\n${out}`); });
    port = Number(/ws:\/\/localhost:(\d+)/.exec(out)![1]);
  }, 20000);

  afterAll(() => {
    for (const c of clients) try { c.ws.close(); } catch { /* zu */ }
    proc?.kill();
  });

  it('antwortet per HTTP mit Status (für Hoster-Gesundheitsprüfungen)', async () => {
    const r = await fetch(`http://127.0.0.1:${port}/`);
    const j = await r.json() as { ok: boolean; protocol: number; shard: string };
    expect(j).toMatchObject({ ok: true, protocol: 1, shard: 'Prüfsee' });
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('Handschlag, Online-Zahl schon im Hauptmenü und bei jeder Änderung an alle', async () => {
    const watcher = await connect();
    watcher.send({ k: 'watch', id: 'p:menue01' });
    await until(() => lastOnline(watcher)?.n === 1);
    expect(lastOnline(watcher)).toMatchObject({ n: 1, world: 0, shard: 'Prüfsee' });

    const anna = await connect();
    anna.send({ k: 'hello', v: 1, profile: profile('p:anna0001', 'Anna', 'england'), state: state(0) });
    await until(() => lastOnline(watcher)?.n === 2 && lastOnline(watcher)?.world === 1);
    expect(anna.msgs.some((m) => m.k === 'welcome')).toBe(true);
    expect(lastOnline(anna)).toMatchObject({ n: 2, world: 1 });

    // derselbe Tab als Wächter UND Kapitän zählt einmal
    const tab = await connect();
    tab.send({ k: 'watch', id: 'p:bert0001' });
    await until(() => lastOnline(watcher)?.n === 3);
    const bert = await connect();
    bert.send({ k: 'hello', v: 1, profile: profile('p:bert0001', 'Bert', 'frankreich'), state: state(30) });
    await until(() => lastOnline(watcher)?.world === 2);
    expect(lastOnline(watcher)!.n).toBe(3);
  });

  it('Schnappschüsse und Steckbriefe gehen an die Nachbarn (Bots gibt es auf dem Server nicht)', async () => {
    const [, anna] = clients;
    await until(() => anna.msgs.some((m) => m.k === 'snap' && m.list.some((e) => e.id === 'p:bert0001')));
    const prof = anna.msgs.find((m): m is Extract<ServerMsg, { k: 'profiles' }> => m.k === 'profiles' && m.list.some((p) => p.id === 'p:bert0001'));
    expect(prof!.list.find((p) => p.id === 'p:bert0001')).toMatchObject({ name: 'Bert', bot: false });
  });

  it('Chat: /welt an alle, /s im Umkreis, /w nur an den Empfänger', async () => {
    const [, anna, , bert] = clients;
    const cara = await connect();
    cara.send({ k: 'hello', v: 1, profile: profile('p:cara0001', 'Cara', 'niederlande'), state: state(5000, 5000) });
    await until(() => cara.msgs.some((m) => m.k === 'welcome'));
    anna.send({ k: 'chat', ch: 'welt', text: 'Ahoi, ganze See!', to: '' });
    anna.send({ k: 'chat', ch: 'sagen', text: 'Nur für die Nähe', to: '' });
    anna.send({ k: 'chat', ch: 'fluestern', text: 'Psst, Cara', to: 'Cara' });
    await until(() => chats(cara).some((m) => m.ch === 'fluestern'));
    await sleep(150);
    expect(chats(bert).map((m) => m.text)).toEqual(expect.arrayContaining(['Ahoi, ganze See!', 'Nur für die Nähe']));
    expect(chats(bert).some((m) => m.text === 'Psst, Cara')).toBe(false);
    expect(chats(cara).map((m) => m.text)).toEqual(expect.arrayContaining(['Ahoi, ganze See!', 'Psst, Cara']));
    expect(chats(cara).some((m) => m.text === 'Nur für die Nähe')).toBe(false);
    expect(chats(anna).find((m) => m.ch === 'welt')).toMatchObject({ from: 'p:anna0001', name: 'Anna' });
  });

  it('Gruppen: Einladung erlaubt, solange die Welt-KI keinen Krieg meldet – sonst gesperrt', async () => {
    const [, anna, , bert] = clients;
    // Startbeziehung England–Frankreich = Rivalität: Einladung geht durch
    anna.send({ k: 'invite', to: 'Bert' });
    await until(() => bert.msgs.some((m) => m.k === 'party' && m.ev.e === 'invite'));
    const inv = bert.msgs.find((m): m is Extract<ServerMsg, { k: 'party' }> => m.k === 'party' && m.ev.e === 'invite')!;
    if (inv.ev.e !== 'invite') throw new Error('keine Einladung');
    bert.send({ k: 'reply', party: inv.ev.party, accept: true });
    await until(() => anna.msgs.some((m) => m.k === 'party' && m.ev.e === 'state' && (m.ev.party?.members.length ?? 0) === 2));
    bert.send({ k: 'chat', ch: 'gruppe', text: 'Gruppe steht', to: '' });
    await until(() => chats(anna).some((m) => m.ch === 'gruppe' && m.text === 'Gruppe steht'));
    expect(chats(clients[4]).some((m) => m.text === 'Gruppe steht')).toBe(false);

    // Welt-KI des am längsten verbundenen Kapitäns (Anna) meldet Krieg England–Niederlande: Cara darf nicht beitreten
    anna.send({ k: 'diplo', pairs: [{ a: 'england', b: 'niederlande', s: 'krieg' }] });
    await sleep(100);
    anna.send({ k: 'invite', to: 'Cara' });
    await until(() => anna.msgs.some((m) => m.k === 'notice' && m.text.includes('Krieg')));
    expect(clients[4].msgs.some((m) => m.k === 'party' && m.ev.e === 'invite')).toBe(false);
  });

  it('schließt Verbindungen sauber: Kapitän verschwindet bei den anderen, Zahl sinkt sofort', async () => {
    const [watcher, anna, , bert] = clients;
    const before = lastOnline(watcher)!.n;
    bert.ws.close();
    await until(() => anna.msgs.some((m) => m.k === 'gone' && m.id === 'p:bert0001'));
    await until(() => lastOnline(watcher)!.n === before - 1 || lastOnline(watcher)!.n === before);
    // der Wächter-Tab von Bert ist noch offen: Zahl bleibt, nur die Welt schrumpft
    expect(lastOnline(watcher)!.world).toBe(2);
    clients[2].ws.close();
    await until(() => lastOnline(watcher)!.n === before - 1);
  });

  it('weist Müll ab, ohne abzustürzen', async () => {
    const c = await connect();
    c.ws.send('kein json');
    c.ws.send(JSON.stringify({ k: 'hello', v: 999, profile: profile('p:alt00001', 'Alt', ''), state: state(0) }));
    await until(() => c.msgs.some((m) => m.k === 'notice' && m.tone === 'error'));
    const r = await fetch(`http://127.0.0.1:${port}/`);
    expect(r.ok).toBe(true);
  });
});
