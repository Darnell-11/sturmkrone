// Phase 4.9 – geteilte Gegner in der Seewelt (Client-Seite von `net/worldEntitySync.ts`) und Kampf-Übertragung (CombatActionBroadcast).
//
// - **Teilen:** Gegner, die dieser Client auf offener See erzeugt (Patrouillen, Kriegsschiffe, Händler), meldet er beim Shard an und steuert sie
//   weiter selbst (KI, Lenkung, Kanonen). 8× je Sekunde gehen Lage und Leben an den Shard; Schaden, den er selbst austeilt, zählt als Bedrohung.
// - **Kopien:** Gegner anderer Spieler erscheinen hier als Schiffe ohne KI (gleiche Klasse, gleiches Aussehen), weich bewegt nach dem
//   Schnappschuss. Treffer auf sie (Kanonen, Rammstöße, Kräfte, Ultimates – alles über `Ship.damage`) gehen über `Ship.netHit` an den Shard.
// - **Aggro:** der Shard nennt das Ziel (höchste Bedrohung); ist es ein Mitspieler, greift die KI des Besitzers dessen Schiff an, und Treffer
//   gehen über den Shard an ihn.
// - **Untergang:** der Besitzer meldet ihn; alle Beteiligten und ihre Gruppen im Einsatzgebiet bekommen den Abschuss, beim Versenker beginnt
//   sofort die Gruppen-Beute.
// - **Kampf-Aktionen:** eigene Breitseiten und Bugschüsse (und die der eigenen geteilten Gegner) gehen zur Darstellung an alle in der Nähe;
//   fremde zeigt diese Seite mit Mündungsfeuer, Kugeln und Einschlägen (ohne Wirkung).
// Je Logikschritt entsteht nichts Neues außer bei Ereignissen (neuer Gegner, Abschuss); Berichte nutzen vorab angelegte Einträge.
import type { Ship } from '../entities/ship/ship';
import type { EnemyShip, NavalSystem, SharedLink } from '../naval/naval';
import type { MmoClient, ClientEnt } from '../net/mmoClient';
import { MMO, type ActNet, type EntKillNet, type EntLookNet, type EntNet, type EntSpawnNet, type EntStateNet } from '../net/mmoProtocol';
import { SHIP_CLASSES, type AmmoId, type NavalRole, type ShipLook } from '../data/ships';
import type { ShipEvolution, EvoTier } from '../data/shipEvolution';

/** Was die geteilten Gegner von der Seewelt und dem Spiel brauchen */
export interface SharedHost {
  naval(): NavalSystem | null;
  client(): MmoClient | null;
  /** geteilt wird nur in der geteilten Welt (kein Raid, kein Prolog, keine private Instanz) */
  active(): boolean;
  ownShip(): Ship;
  /** eigener Ort (Schiff bzw. Figur) */
  me(out: { x: number; z: number }): void;
  /** Schiff eines Mitspielers in 3D (Aggro-Ziel, Darstellung seiner Breitseiten); null = nicht in 3D */
  peerShip(id: string): Ship | null;
  /** Ort eines Mitspielers für die Darstellung seiner Kampf-Aktionen (Figur an Land/an Deck bzw. Schiff); false = nicht in Sicht */
  peerAt(id: string, out: { x: number; y: number; z: number; yaw: number }): boolean;
  /** Effekte einer Kampf-Aktion (Formen, Geistes-Faji, Heilung, Ultimate, Standard-Angriff) an einem Ort */
  playAct(a: ActNet, x: number, y: number, z: number, yaw: number): void;
  /** eigenes Schiff von einem geteilten Gegner getroffen */
  hitMe(name: string, dmg: number, pen: number): void;
  /** Abschuss eines geteilten Gegners (Gutschrift; `owner` = man hat ihn selbst gesteuert und die Belohnung schon bekommen) */
  kill(k: EntKillNet, owner: boolean): void;
  /** Schiffsaussehen aus dem Netz */
  lookOf(l: EntLookNet): ShipLook;
}

interface OwnRec { id: string; e: EnemyShip; lastHp: number; fwd: number; lastBy: string }
interface MirrorRec { id: string; e: EnemyShip; predicted: number }

const _me = { x: 0, z: 0 };
const _at = { x: 0, y: 0, z: 0, yaw: 0 };
const ROLES: readonly string[] = ['patrouille', 'jaeger', 'haendler', 'legende'];

/** Ausbaustufe 1 … 5 */
const tierOf = (v: number): EvoTier => Math.max(1, Math.min(5, Math.round(v))) as EvoTier;

export class SharedEntities {
  private seq = 0;
  /** Anmeldungen, auf deren Kennung wir warten (Schlüssel → Schiff) */
  private readonly pending = new Map<string, EnemyShip>();
  private readonly own = new Map<string, OwnRec>();
  private readonly ownList: OwnRec[] = [];
  private readonly mirrors = new Map<string, MirrorRec>();
  private readonly mirrorList: MirrorRec[] = [];
  private readonly building = new Set<string>();
  /** Übernahmen, deren Kopie erst noch entsteht */
  private readonly adoptOnBuild = new Set<string>();
  private reportT = 0;
  private readonly states: EntStateNet[] = [];
  /** Zahlen für Prüfungen */
  readonly stats = { claimed: 0, owned: 0, mirrors: 0, built: 0, forwarded: 0, applied: 0, kills: 0, credited: 0, actsSent: 0, actsShown: 0, released: 0, adopted: 0, hitsMe: 0, demoted: 0 };

  constructor(private readonly host: SharedHost) {}

  /** Kennung des eigenen Clients ('' ohne Verbindung) */
  private get me(): string { return this.host.client()?.id ?? ''; }

  /** Kopie zu einer Kennung (Prüfungen) */
  mirrorOf(id: string): EnemyShip | null { return this.mirrors.get(id)?.e ?? null; }
  /** eigener geteilter Gegner zu einer Kennung (Prüfungen) */
  ownedOf(id: string): EnemyShip | null { return this.own.get(id)?.e ?? null; }
  /** Kennung eines Schiffs ('' = nicht geteilt) */
  idOf(s: Ship): string {
    for (const r of this.ownList) if (r.e.ship === s) return r.id;
    for (const m of this.mirrorList) if (m.e.ship === s) return m.id;
    return '';
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Je Logikschritt
  // ---------------------------------------------------------------------------------------------------------------

  update(dt: number) {
    const nav = this.host.naval(), c = this.host.client();
    if (!nav || !c || !c.online || !this.host.active()) { if (this.ownList.length || this.mirrorList.length) this.clear(); return; }
    this.host.me(_me);
    this.claimNew(nav, c);
    this.stepOwned(nav, c, dt);
    this.stepMirrors(nav, c);
  }

  /** Darf dieser Gegner geteilt werden? Offene See, gewöhnliche Rollen; nie Flotte, Schlachten, Ereignisse, Raid, Bühne, Legenden, Jäger */
  private eligible(e: EnemyShip, nav: NavalSystem): boolean {
    if (e.shared || !e.ship.alive || e.ship.sinking > 0 || e.ship.disabled) return false;
    if (e.companion || e.fleetId || e.battle || e.ev || e.raid || e.station || e.stage || e.peer || e.legendId || e.training || e.hunter || e.captured || e.helper || e.ghost) return false;
    if (nav.isTeamShip(e)) return false;
    return e.role === 'patrouille' || e.role === 'jaeger' || e.role === 'haendler';
  }

  private claimNew(nav: NavalSystem, c: MmoClient) {
    for (const e of nav.enemies) {
      if (!this.eligible(e, nav)) continue;
      if (Math.hypot(e.ship.x - _me.x, e.ship.z - _me.z) > 900) continue;
      const key = `${c.id}.${++this.seq}`.slice(-48);
      const link: SharedLink = { id: '', key, owner: true, aggro: null, dead: false };
      e.shared = link;
      this.pending.set(key, e);
      c.claimEnt(this.spawnNet(e, key));
      this.stats.claimed++;
    }
  }

  private spawnNet(e: EnemyShip, key: string): EntSpawnNet {
    const s = e.ship, l = s.look;
    return {
      key, tier: Math.max(0, SHIP_CLASSES.indexOf(s.cls)), role: e.role, level: e.level, name: e.name ?? 'Kriegsschiff', x: s.x, z: s.z, hdg: s.heading, hp: s.hull, mhp: s.maxHull,
      look: { hull: l.hull, stripe: l.stripe, sail: l.sail, flag: l.flag, flagColor: l.flagColor, figurehead: l.figurehead ?? 'keine', power: l.power ?? '', evo: [s.evo.hullTier, s.evo.sailTier, s.evo.cannonTier] },
    };
  }

  /** Eigene geteilte Gegner: Bedrohung aus eigenem Schaden, Untergang, Abgabe, Aggro-Ziel, Berichte (8 Hz) */
  private stepOwned(nav: NavalSystem, c: MmoClient, dt: number) {
    for (let i = this.ownList.length - 1; i >= 0; i--) {
      const r = this.ownList[i], e = r.e, s = e.ship, link = e.shared;
      if (!link) { this.dropOwned(i); continue; }
      // nicht mehr in der Welt (zu weit weg abgebaut): abgeben, der Shard übergibt ihn jemandem in der Nähe
      if (!nav.enemies.includes(e)) {
        if (!link.dead) { c.releaseEnt(r.id); this.stats.released++; }
        this.dropOwned(i);
        continue;
      }
      // der Shard hat den Gegner einem anderen Spieler übergeben (hier kam zu lange kein Bericht: Tab im Hintergrund, langer Ladeschritt):
      // das eigene Schiff wird zur Kopie, sonst steuern zwei Clients denselben Gegner
      const ce = c.ents.get(r.id);
      if (ce && ce.owner && ce.owner !== c.id && !link.dead) { this.demote(i); continue; }
      // eigener Schaden (Kanonen, Rammen, Kräfte, Ultimates) = Rückgang des Rumpfs minus der Treffer von Mitspielern
      const drop = r.lastHp - s.hull;
      if (drop > 0.5) { const mine = drop - r.fwd; if (mine > 0.5) { c.hitEnt(r.id, mine, true); r.lastBy = c.id; } }
      r.fwd = 0;
      r.lastHp = s.hull;
      if (!link.dead && (!s.alive || s.sinking > 0)) {
        link.dead = true;
        c.entDead(r.id, r.lastBy || c.id);
      }
      // Ziel der Aggro-Tabelle (ein Mitspieler: sein Schiff in 3D)
      const ag = ce?.aggro ?? '';
      link.aggro = ag && ag !== c.id ? this.host.peerShip(ag) : null;
    }
    this.reportT -= dt;
    if (this.reportT > 0 || !this.ownList.length) return;
    this.reportT = 1 / MMO.entHz;
    let n = 0;
    for (const r of this.ownList) {
      const s = r.e.ship;
      if (r.e.shared?.dead) continue;
      let o = this.states[n];
      if (!o) { o = { id: '', x: 0, z: 0, hdg: 0, spd: 0, hp: 0, mhp: 1, dis: false }; this.states.push(o); }
      o.id = r.id; o.x = s.x; o.z = s.z; o.hdg = s.heading; o.spd = s.speed; o.hp = Math.max(0, s.hull); o.mhp = Math.max(1, s.maxHull); o.dis = s.disabled;
      n++;
    }
    this.states.length = n;
    c.reportEnts(this.states);
  }

  private dropOwned(i: number) {
    const r = this.ownList[i];
    this.ownList.splice(i, 1);
    this.own.delete(r.id);
    this.stats.owned = this.ownList.length;
  }

  /** Besitz verloren: dasselbe Schiff läuft als Kopie weiter (keine KI mehr, Lage aus dem Schnappschuss, Treffer über den Shard) */
  private demote(i: number) {
    const r = this.ownList[i], e = r.e;
    this.dropOwned(i);
    if (!e.shared) return;
    e.shared.owner = false;
    e.shared.aggro = null;
    this.asMirror(r.id, e);
    this.stats.demoted++;
  }

  /** Schiff als Kopie führen: Treffer gehen als Rohschaden an den Shard (und weiter an den Besitzer) */
  private asMirror(id: string, e: EnemyShip): MirrorRec {
    const rec: MirrorRec = { id, e, predicted: 0 };
    e.ship.netHit = (base, ammo, zone, pen) => {
      const cl = this.host.client();
      if (!cl) return;
      cl.hitEnt(id, base, false, ammo, zone, pen);
      rec.predicted += base;
      this.stats.forwarded++;
    };
    this.mirrors.set(id, rec);
    this.mirrorList.push(rec);
    this.stats.mirrors = this.mirrorList.length;
    return rec;
  }

  /** Kopien fremder geteilter Gegner: bauen, weich bewegen, Leben und Zustand aus dem Schnappschuss, abbauen */
  private stepMirrors(nav: NavalSystem, c: MmoClient) {
    const now = c.transport.now();
    for (const ce of c.entList) {
      if (ce.owner === c.id || this.own.has(ce.id)) continue;
      const m = this.mirrors.get(ce.id);
      const d = Math.hypot(ce.x - _me.x, ce.z - _me.z);
      if (!m) {
        if (!ce.dead && d <= MMO.shipShow && !this.building.has(ce.id)) this.buildMirror(nav, c, ce);
        continue;
      }
      const s = m.e.ship;
      if (!nav.enemies.includes(m.e)) { this.dropMirror(ce.id); continue; }
      const v = c.sampleEnt(ce, now);
      s.prev.x = s.x; s.prev.z = s.z; s.prev.heading = s.heading;
      s.x = v.x; s.z = v.z; s.heading = v.hdg; s.speed = ce.spd;
      if (ce.mhp > 0) s.maxHull = ce.mhp;
      // fremder Schaden schwebt als Zahl über dem Schiff (eigene Treffer zeigt der Treffer selbst schon an)
      const drop = s.hull - ce.hp;
      if (drop > 0.5 && !ce.dead) {
        const other = drop - m.predicted;
        m.predicted = Math.max(0, m.predicted - drop);
        if (other > 0.5) nav.showNumber(s.x, s.model.deckY + 3, s.z, Math.round(other));
      }
      if (!ce.dead) s.hull = Math.max(1, ce.hp);
      if (ce.dis && !s.disabled) nav.disableMirror(m.e);
      if (ce.dead && s.sinking <= 0) nav.sinkMirror(m.e);
    }
    // Kopien ohne Eintrag (verschwunden) oder weit weg abbauen
    for (let i = this.mirrorList.length - 1; i >= 0; i--) {
      const m = this.mirrorList[i];
      const ce = c.ents.get(m.id);
      const far = !ce || Math.hypot(m.e.ship.x - _me.x, m.e.ship.z - _me.z) > MMO.shipHide;
      if ((far && m.e.ship.sinking <= 0) || !nav.enemies.includes(m.e)) this.dropMirror(m.id);
    }
  }

  private buildMirror(nav: NavalSystem, c: MmoClient, ce: ClientEnt) {
    this.building.add(ce.id);
    const id = ce.id;
    const link: SharedLink = { id, key: '', owner: false, aggro: null, dead: false };
    const evo: ShipEvolution = { hullTier: tierOf(ce.look.evo[0]), sailTier: tierOf(ce.look.evo[1]), cannonTier: tierOf(ce.look.evo[2]) };
    const role = (ROLES.includes(ce.role) ? ce.role : 'patrouille') as NavalRole;
    nav.queueMirror(link, ce.tier, this.host.lookOf(ce.look), evo, ce.name, role, ce.level, ce.x, ce.z, ce.hdg, ce.hp, ce.mhp, (e) => {
      this.building.delete(id);
      const cur = c.ents.get(id);
      // inzwischen verschwunden, schon tot oder selbst übernommen: wieder abbauen bzw. übernehmen
      if (!cur || (cur.dead && !this.adoptOnBuild.has(id))) { nav.removeEventShip(e); return; }
      this.asMirror(id, e);
      this.stats.built++;
      if (this.adoptOnBuild.delete(id)) this.adopt(id, cur);
    });
  }

  private dropMirror(id: string) {
    const m = this.mirrors.get(id);
    if (!m) return;
    this.mirrors.delete(id);
    const i = this.mirrorList.indexOf(m);
    if (i >= 0) this.mirrorList.splice(i, 1);
    const nav = this.host.naval();
    if (nav && nav.enemies.includes(m.e)) nav.removeEventShip(m.e);
    this.stats.mirrors = this.mirrorList.length;
  }

  /** Alles abbauen bzw. abgeben (geteilte Welt verlassen, Raid, Verbindung weg) */
  clear() {
    const c = this.host.client();
    for (const r of this.ownList) { if (r.e.shared && !r.e.shared.dead && c?.online) c.releaseEnt(r.id); r.e.shared = undefined; }
    this.ownList.length = 0; this.own.clear();
    for (const e of this.pending.values()) e.shared = undefined;
    this.pending.clear();
    for (const m of [...this.mirrorList]) this.dropMirror(m.id);
    this.building.clear();
    this.adoptOnBuild.clear();
    this.stats.owned = 0;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Nachrichten des Shards
  // ---------------------------------------------------------------------------------------------------------------

  /** Kennung vergeben: der Gegner gehört ab jetzt zu den geteilten */
  claimed(key: string, id: string) {
    const e = this.pending.get(key);
    if (!e) return;
    this.pending.delete(key);
    if (!e.shared) return;
    e.shared.id = id;
    const r: OwnRec = { id, e, lastHp: e.ship.hull, fwd: 0, lastBy: '' };
    this.own.set(id, r);
    this.ownList.push(r);
    this.stats.owned = this.ownList.length;
  }

  /** Treffer eines Mitspielers auf einen eigenen Gegner verrechnen */
  netHit(id: string, from: string, dmg: number, ammo: string, zone: 'hull' | 'sail', pen: number) {
    const r = this.own.get(id), nav = this.host.naval();
    if (!r || !nav) return;
    const dealt = nav.applyNetHit(r.e, dmg, (ammo === 'kette' || ammo === 'kartaetsche' || ammo === 'brand' ? ammo : 'kugel') as AmmoId, zone, pen);
    r.fwd += dealt;
    r.lastBy = from;
    this.stats.applied++;
  }

  /** Abschuss mit Gutschrift */
  killed(k: EntKillNet) {
    this.stats.kills++;
    const me = this.me;
    const owner = k.owner === me;
    if (k.credit.includes(me)) { this.stats.credited++; this.host.kill(k, owner); }
  }

  /** Übernahme: dieser Client steuert den Gegner ab jetzt (aus der Kopie wird ein Schiff mit KI) */
  owned(e: EntNet) {
    const nav = this.host.naval(), c = this.host.client();
    if (!nav || !c || this.own.has(e.id)) return;
    const ce = c.ents.get(e.id);
    if (!this.mirrors.has(e.id)) {
      if (!ce) return;
      this.adoptOnBuild.add(e.id);
      if (!this.building.has(e.id)) this.buildMirror(nav, c, ce);
      return;
    }
    this.adopt(e.id, ce ?? null);
  }

  private adopt(id: string, ce: ClientEnt | null) {
    const m = this.mirrors.get(id);
    if (!m) return;
    this.mirrors.delete(id);
    const i = this.mirrorList.indexOf(m);
    if (i >= 0) this.mirrorList.splice(i, 1);
    const e = m.e;
    e.ship.netHit = null;
    if (e.shared) { e.shared.owner = true; e.shared.dead = false; }
    if (ce) { e.ship.hull = Math.max(1, ce.hp); e.ship.maxHull = Math.max(1, ce.mhp); }
    e.provoked = true;
    const r: OwnRec = { id, e, lastHp: e.ship.hull, fwd: 0, lastBy: '' };
    this.own.set(id, r);
    this.ownList.push(r);
    this.stats.adopted++;
    this.stats.owned = this.ownList.length;
    this.stats.mirrors = this.mirrorList.length;
  }

  /** Gegner verschwunden */
  gone(id: string) {
    // nur Kopien: eigene Gegner verwirft der Shard nie, solange man verbunden ist (ohne Verbindung räumt `clear` auf)
    const m = this.mirrors.get(id);
    if (m && m.e.ship.sinking <= 0) this.dropMirror(id);
  }

  /** Ein geteilter Gegner trifft das eigene Schiff */
  hitMe(_id: string, name: string, dmg: number, pen: number) {
    this.stats.hitsMe++;
    this.host.hitMe(name, dmg, pen);
  }

  /** Ein eigener Gegner trifft das Schiff eines Mitspielers */
  peerHit(e: EnemyShip, playerId: string, dmg: number) {
    const c = this.host.client(), id = e.shared?.id;
    if (!c || !id) return;
    c.entPlayerHit(id, playerId, dmg, e.ship.penTier ?? 3);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Kampf-Aktionen
  // ---------------------------------------------------------------------------------------------------------------

  private readonly act: ActNet = { t: 'broadside', ent: '', x: 0, y: 0, z: 0, yaw: 0, side: 0, n: 0, style: '', el: '', slot: 0, tx: 0, ty: 0, tz: 0, sea: true };

  /** Breitseite bzw. Bugschuss abgefeuert (eigenes Schiff oder eigener geteilter Gegner): an die Mitspieler */
  volley(ship: Ship, side: number, n: number, tx: number, tz: number, bow: boolean) {
    const c = this.host.client();
    if (!c || !c.online || !this.host.active()) return;
    let ent = '';
    if (ship !== this.host.ownShip()) {
      const r = this.ownList.find((o) => o.e.ship === ship);
      if (!r) return;
      ent = r.id;
    }
    const a = this.act;
    a.t = bow ? 'bow' : 'broadside'; a.ent = ent; a.x = ship.x; a.y = 0; a.z = ship.z; a.yaw = ship.heading; a.side = side; a.n = n;
    a.style = ''; a.el = ''; a.slot = 0; a.tx = tx; a.ty = 0; a.tz = tz; a.sea = true;
    c.act(a);
    this.stats.actsSent++;
  }

  /** Eigene Kampf-Aktion (Form, Geistes-Faji, Heilung, Ultimate, Standard-Angriff) an die Mitspieler */
  sendAct(t: ActNet['t'], x: number, y: number, z: number, yaw: number, style: string, el: string, slot: number, tx: number, ty: number, tz: number, sea: boolean) {
    const c = this.host.client();
    if (!c || !c.online || !this.host.active()) return;
    const a = this.act;
    a.t = t; a.ent = ''; a.x = x; a.y = y; a.z = z; a.yaw = yaw; a.side = 0; a.n = 0; a.style = style; a.el = el; a.slot = slot; a.tx = tx; a.ty = ty; a.tz = tz; a.sea = sea;
    c.act(a);
    this.stats.actsSent++;
  }

  /** Kampf-Aktion eines Mitspielers bzw. seines Gegners darstellen */
  remoteAct(from: string, a: ActNet) {
    const nav = this.host.naval();
    if (!nav) return;
    if (a.t === 'broadside' || a.t === 'bow') {
      const ship = a.ent ? this.mirrors.get(a.ent)?.e.ship ?? null : this.host.peerShip(from);
      if (!ship || !ship.alive) return;
      if (a.t === 'bow') nav.remoteBow(ship, a.tx, a.tz);
      else nav.remoteBroadside(ship, a.side, a.n, a.tx, a.tz);
      this.stats.actsShown++;
      return;
    }
    // Figur des Mitspielers (oder sein Schiff, wenn er am Steuer zaubert); sonst der gemeldete Ort
    const at = this.host.peerAt(from, _at) ? _at : null;
    this.host.playAct(a, at ? at.x : a.x, at ? at.y : a.y, at ? at.z : a.z, at ? at.yaw : a.yaw);
    this.stats.actsShown++;
  }
}
