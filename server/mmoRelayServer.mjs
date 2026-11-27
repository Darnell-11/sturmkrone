#!/usr/bin/env node
// Sturmkrone 4.8.1 – schlanker MMO-Relay-Server (Node ≥ 22.18, ohne fremde Pakete): `npm run mmo-server`
//
// Spricht genau das Protokoll aus `src/net/mmoProtocol.ts` über WebSocket – und zwar mit DERSELBEN Spiellogik wie der lokale Shard im
// Browser: die Datei lädt `src/net/mmoAuthority.ts` direkt (Node streift die TypeScript-Typen selbst ab; ein kleiner Auflöser ergänzt die
// fehlenden `.ts`-Endungen). Der Server
// - nimmt Kapitäne an (`hello`), schickt jedem 18× je Sekunde einen Schnappschuss der Spieler in seinem Interessenbereich (`snap`),
//   Steckbriefe, Gruppen-Ereignisse (Einladen, Annehmen, Kriegsausbruch – geprüft gegen die Diplomatie der Welt-KI), Chat (`/s` Umkreis,
//   `/p` Gruppe, `/w` Flüstern, `/welt` alle), Heilung, Sturmhorn, Mitfahrt und Treffer;
// - zählt alle verbundenen Kapitäne – auch die, die nur im Hauptmenü stehen (`watch`) – und schickt bei jeder Änderung sofort `online`
//   an alle Clients;
// - übernimmt die Diplomatie der fünf Mächte von dem am längsten verbundenen Kapitän (`diplo`; vorher gelten die Startbeziehungen).
//
// Umgebung: PORT (Standard 8787), HOST (0.0.0.0), MMO_SHARD (Name der See), MMO_ORIGINS (erlaubte Seiten, durch Komma getrennt; leer = alle),
// MMO_MAX_CLIENTS (300). Für GitHub Pages (https) braucht der Server eine wss://-Adresse – z. B. hinter einem Hoster mit TLS (Render, Fly.io,
// Railway) oder einem Tunnel (`cloudflared tunnel --url http://localhost:8787`). Mitspieler öffnen dann `…/sturmkrone/?server=wss://…`.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------------------------------------------
// TypeScript der Spiel-Quellen laden: Importe ohne Endung (`./partyRules`) auf `.ts` auflösen
// ---------------------------------------------------------------------------------------------------------------

registerHooks({
  resolve(spec, ctx, next) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL?.endsWith('.ts') && !/\.[cm]?[jt]s$/.test(spec)) {
      const u = new URL(`${spec}.ts`, ctx.parentURL);
      if (existsSync(fileURLToPath(u))) return next(u.href, ctx);
    }
    return next(spec, ctx);
  },
});

const { MMO, MMO_PROTOCOL, cleanIntent, decodePacket, encodePacket } = await import('../src/net/mmoProtocol.ts');
const { MmoAuthority } = await import('../src/net/mmoAuthority.ts');
const { safeZoneAt, stanceOf } = await import('../src/net/partyRules.ts');
const { safeZones } = await import('../src/social/safeZones.ts');
const { START_RELATIONS, pairKey } = await import('../src/data/nations.ts');
const { FACTIONS } = await import('../src/data/factions.ts');

// ---------------------------------------------------------------------------------------------------------------
// WebSocket (RFC 6455) – nur das Nötige: Handschlag, Text-Rahmen, Fragmente, Ping/Pong, Schließen
// ---------------------------------------------------------------------------------------------------------------

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** größte Nachricht (Bytes): das Protokoll schickt höchstens 64 KB Text */
const MAX_MESSAGE = 128 * 1024;
/** wer so viel ungesendet aufstaut (langsame Leitung), wird getrennt */
const MAX_BACKLOG = 4 * 1024 * 1024;
/** Stille (s), nach der eine Verbindung als tot gilt (Kapitäne pingen alle 5 s, Wächter alle 10 s) */
const IDLE = 45;

export const acceptKey = (key) => createHash('sha1').update(key + WS_GUID).digest('base64');

/** Server-Rahmen (unmaskiert) */
export function encodeFrame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
  else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  head[0] = 0x80 | opcode;
  return Buffer.concat([head, payload]);
}

class WsConn {
  constructor(socket, onText, onClose) {
    this.socket = socket;
    this.onText = onText;
    this.onClose = onClose;
    this.buf = Buffer.alloc(0);
    this.frags = null;
    this.fragLen = 0;
    this.open = true;
    socket.setNoDelay(true);
    socket.on('data', (d) => this.feed(d));
    socket.on('close', () => this.gone());
    socket.on('error', () => this.gone());
  }

  feed(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    while (this.open) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) { this.close(1009, 'Nachricht zu groß'); return; }
        len = Number(big); off = 10;
      }
      if (len > MAX_MESSAGE) { this.close(1009, 'Nachricht zu groß'); return; }
      // Clients MÜSSEN maskieren (RFC 6455, 5.1)
      if (!masked) { this.close(1002, 'Rahmen ohne Maske'); return; }
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const payload = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) payload[i] = b[off + 4 + i] ^ mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      this.frame(fin, op, payload);
    }
  }

  frame(fin, op, payload) {
    if (op === 0x8) { this.close(1000, ''); return; }
    if (op === 0x9) { this.raw(0xa, payload); return; }
    if (op === 0xa) return;
    if (op === 0x1 || op === 0x2) {
      if (this.frags) { this.close(1002, 'Fragment erwartet'); return; }
      if (fin) { if (op === 0x1) this.onText(payload.toString('utf8')); return; }
      this.frags = [payload]; this.fragLen = payload.length; this.fragOp = op;
      return;
    }
    if (op === 0x0) {
      if (!this.frags) { this.close(1002, 'Fortsetzung ohne Anfang'); return; }
      this.frags.push(payload); this.fragLen += payload.length;
      if (this.fragLen > MAX_MESSAGE) { this.close(1009, 'Nachricht zu groß'); return; }
      if (!fin) return;
      const all = Buffer.concat(this.frags), wasText = this.fragOp === 0x1;
      this.frags = null; this.fragLen = 0;
      if (wasText) this.onText(all.toString('utf8'));
      return;
    }
    this.close(1002, 'Unbekannter Rahmen');
  }

  raw(op, payload) {
    if (!this.open) return;
    if (this.socket.writableLength > MAX_BACKLOG) { this.socket.destroy(); this.gone(); return; }
    this.socket.write(encodeFrame(op, payload));
  }

  send(text) { this.raw(0x1, Buffer.from(text, 'utf8')); }

  close(code = 1000, reason = '') {
    if (!this.open) return;
    const r = Buffer.from(reason, 'utf8').subarray(0, 120), p = Buffer.alloc(2 + r.length);
    p.writeUInt16BE(code, 0); r.copy(p, 2);
    try { this.socket.write(encodeFrame(0x8, p)); this.socket.end(); } catch { /* schon zu */ }
    const s = this.socket;
    setTimeout(() => s.destroy(), 1000).unref();
    this.gone();
  }

  gone() {
    if (!this.open) return;
    this.open = false;
    this.onClose();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Relay mit autoritativem Shard
// ---------------------------------------------------------------------------------------------------------------

/**
 * Server starten. Gibt `{ ready, close, stats, authority, online }` zurück; `ready` liefert den echten Port (auch bei `port: 0`).
 */
export function startRelay(opts = {}) {
  const env = process.env;
  const port = opts.port ?? (env.PORT !== undefined && env.PORT !== '' && Number.isFinite(Number(env.PORT)) ? Number(env.PORT) : MMO.relayPort);
  const host = opts.host ?? (env.HOST || '0.0.0.0');
  const shard = (opts.shard ?? env.MMO_SHARD ?? 'Bernsteinsee 1').slice(0, 40);
  const maxClients = opts.maxClients ?? (Number(env.MMO_MAX_CLIENTS) || 300);
  const origins = (opts.origins ?? env.MMO_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const log = opts.log ?? ((...a) => console.log(...a));
  const clock = () => performance.now() / 1000;

  /** alle offenen Verbindungen (Kapitäne in der Welt und Wächter im Hauptmenü) */
  const conns = new Set();
  /** Kapitäne in der Welt: Kennung → Verbindung */
  const players = new Map();
  const stats = { accepted: 0, rejected: 0, packets: 0, dropped: 0, broadcasts: 0 };

  // Diplomatie: der am längsten verbundene Kapitän mit Bericht gilt, sonst die Startbeziehungen
  const diploState = (x, y) => {
    let best = null;
    for (const c of players.values()) if (c.diplo && (!best || c.since < best.since)) best = c;
    const k = pairKey(x, y);
    return best?.diplo.get(k) ?? START_RELATIONS[k]?.state ?? 'neutral';
  };
  const zones = safeZones();
  const authority = new MmoAuthority(
    { stance: (a, b) => stanceOf(a, b, diploState) },
    { safeAt: (x, z) => safeZoneAt(zones, x, z)?.name ?? '' },
    (to, msg) => { const c = players.get(to); if (c) c.ws.send(encodePacket(msg)); },
    (t) => FACTIONS[t]?.name ?? 'Ungebunden',
    shard,
  );

  // Online-Zähler: jede Tab-Kennung einmal (ein Tab kann gleichzeitig Wächter und Kapitän sein)
  const ids = new Set();
  const online = { n: 0, world: 0 };
  const onlineMsg = () => encodePacket({ k: 'online', n: online.n, world: online.world, shard });
  const recount = () => {
    ids.clear();
    for (const c of conns) { if (c.watchId) ids.add(c.watchId); if (c.playerId) ids.add(c.playerId); }
    const world = authority.list.length;
    if (ids.size === online.n && world === online.world) return false;
    online.n = ids.size; online.world = world;
    const m = onlineMsg();
    stats.broadcasts++;
    for (const c of conns) if (c.watchId || c.playerId) c.ws.send(m);
    return true;
  };

  const dropPlayer = (c, t) => {
    if (!c.playerId) return;
    if (players.get(c.playerId) === c) { players.delete(c.playerId); authority.leave(c.playerId, t); }
    c.playerId = '';
  };

  function onPacket(c, text) {
    const t = clock();
    c.lastRx = t;
    // Spam-Schutz: höchstens 90 Pakete je Sekunde im Mittel (Zustand kommt 15× je Sekunde)
    c.budget = Math.min(180, c.budget + (t - c.budgetT) * 90);
    c.budgetT = t;
    if (c.budget < 1) { stats.dropped++; if (++c.flood > 400) c.ws.close(1008, 'Zu viele Pakete'); return; }
    c.budget -= 1;
    const i = cleanIntent(decodePacket(text));
    if (!i) { stats.dropped++; if (++c.bad > 60) c.ws.close(1008, 'Ungültige Pakete'); return; }
    stats.packets++;
    switch (i.k) {
      case 'watch':
        c.watchId = i.id;
        // ohne Änderung der Zahl (Tab war schon als Kapitän da) bekommt nur der neue Wächter den Stand
        if (!recount()) c.ws.send(onlineMsg());
        return;
      case 'diplo':
        c.diplo = new Map(i.pairs.map((p) => [pairKey(p.a, p.b), p.s]));
        return;
      case 'hello': {
        if (i.v !== MMO_PROTOCOL) {
          c.ws.send(encodePacket({ k: 'notice', text: 'Dein Spiel ist veraltet – bitte die Seite neu laden.', tone: 'error' }));
          c.ws.close(4002, 'Protokoll');
          return;
        }
        const id = i.profile.id;
        const other = players.get(id);
        // dieselbe Kennung auf einer neuen Leitung (Neuladen, Netzwechsel): die alte Verbindung räumt das Feld
        if (other && other !== c) { players.delete(id); other.playerId = ''; other.ws.close(4001, 'An anderer Stelle angemeldet'); }
        if (c.playerId && c.playerId !== id) dropPlayer(c, t);
        c.playerId = id;
        players.set(id, c);
        // Stellvertreter (Bots) gibt es nur im lokalen Shard: nie einem Client glauben
        authority.handle(id, { ...i, profile: { ...i.profile, id, bot: false } }, t);
        recount();
        return;
      }
      case 'ping':
        if (!c.playerId) { c.ws.send(encodePacket({ k: 'pong', t: i.t, st: t })); return; }
        break;
      case 'bye':
        dropPlayer(c, t);
        recount();
        return;
    }
    if (c.playerId) authority.handle(c.playerId, i, t);
  }

  const http = createServer((req, res) => {
    const body = JSON.stringify({ name: 'Sturmkrone MMO-Relay', ok: true, protocol: MMO_PROTOCOL, shard, online: online.n, world: online.world });
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  });

  http.on('upgrade', (req, socket, head) => {
    const reject = (code, text) => { stats.rejected++; socket.end(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`); };
    const key = req.headers['sec-websocket-key'];
    if (String(req.headers.upgrade).toLowerCase() !== 'websocket' || typeof key !== 'string' || req.headers['sec-websocket-version'] !== '13') { reject(400, 'Bad Request'); return; }
    if (origins.length && !origins.includes(String(req.headers.origin ?? ''))) { reject(403, 'Forbidden'); return; }
    if (conns.size >= maxClients) { reject(503, 'Service Unavailable'); return; }
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);
    const t = clock();
    const c = { ws: null, watchId: '', playerId: '', diplo: null, since: t, lastRx: t, budget: 180, budgetT: t, bad: 0, flood: 0 };
    c.ws = new WsConn(socket, (text) => onPacket(c, text), () => {
      conns.delete(c);
      dropPlayer(c, clock());
      recount();
    });
    conns.add(c);
    stats.accepted++;
    if (head?.length) c.ws.feed(head);
  });

  // Takt: 20 Hz (Schnappschüsse entstehen in `tick` mit 18 Hz), tote Leitungen trennen
  const timer = setInterval(() => {
    const t = clock();
    for (const c of conns) if (t - c.lastRx > IDLE) c.ws.close(4000, 'Zeitüberschreitung');
    authority.tick(t);
    recount();
  }, 50);

  const ready = new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(port, host, () => {
      const real = http.address().port;
      log(`Sturmkrone MMO-Relay läuft: ws://localhost:${real} (See „${shard}“, Protokoll ${MMO_PROTOCOL})`);
      resolve(real);
    });
  });

  const close = () => new Promise((resolve) => {
    clearInterval(timer);
    for (const c of [...conns]) c.ws.close(1001, 'Server fährt herunter');
    http.close(() => resolve());
    setTimeout(resolve, 1500).unref();
  });

  return { ready, close, stats, authority, online, conns };
}

// ---------------------------------------------------------------------------------------------------------------
// Direkt gestartet (`npm run mmo-server` bzw. `node server/mmoRelayServer.mjs`)
// ---------------------------------------------------------------------------------------------------------------

const direct = import.meta.main ?? (process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false);
if (direct) {
  const relay = startRelay();
  relay.ready.then((port) => {
    console.log(`Spiel lokal verbinden:  http://localhost:5173/?server=ws://localhost:${port}`);
    console.log('Für Mitspieler im Netz eine wss://-Adresse davorschalten (siehe Kopf dieser Datei) und den Link mit ?server=wss://… teilen.');
  }).catch((e) => { console.error(`Start fehlgeschlagen: ${e.message}`); process.exit(1); });
  const stop = () => { relay.close().then(() => process.exit(0)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
