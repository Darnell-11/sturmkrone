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
// - **4.91 Landgegner:** Lager, Bezirke der Mega-Inseln, Kommandanten, Bosse und Kaiser-Garden laufen genauso: wer sie aufstellt, meldet sie
//   mit festem Schlüssel an (`Enemy.netKey`, z. B. „isl:<Insel>:<Platz>“); stellt ein zweiter Spieler dasselbe Lager auf, macht der Shard
//   daraus EINEN Gegner – beim Zweiten wird der eigene zur Kopie (keine KI, Lage, Bewegung, Leben, Haltung und Boss-Phase aus dem
//   Schnappschuss). Treffer auf Kopien gehen roh an den Besitzer (`FoeHitNet`), Warnflächen der Bosse zeigt jeder (`tele`), Hiebe und Flächen
//   treffen auch Mitspieler (über den Shard). Ein geräumtes Lager bleibt gesperrt, bis der Shard es wieder freigibt (`edenied`).
// - **4.92 Bereiche:** in einer gemeinsamen Belagerung (Raid-Instanz der Gruppe) tragen alle geteilten Gegner die Kennung der Instanz
//   (`scope`); Spieler außerhalb sehen sie nie, nur Teilnehmer übernehmen sie. Wachschiffe der Kaiser-Seesperre und des Raids haben feste
//   Schlüssel (Platz der Wachflotte), der Tiefsee-Leviathan den Schlüssel „wb:leviathan“ (Art `beast`: ein Ungeheuer für alle).
// Je Logikschritt entsteht nichts Neues außer bei Ereignissen (neuer Gegner, Abschuss); Berichte nutzen vorab angelegte Einträge.
import type { Ship } from '../entities/ship/ship';
import type { Enemy, FoeLink, HitInfo } from '../entities/enemy';
import type { CombatSystem } from '../combat/combat';
import type { EnemyShip, NavalSystem, SharedLink } from '../naval/naval';
import type { MmoClient, ClientEnt } from '../net/mmoClient';
import { MMO, netKey, type ActNet, type EntKillNet, type EntLookNet, type EntNet, type EntSpawnNet, type EntStateNet, type FoeHitNet } from '../net/mmoProtocol';
import { SHIP_CLASSES, type AmmoId, type NavalRole, type ShipLook } from '../data/ships';
import type { ShipEvolution, EvoTier } from '../data/shipEvolution';
import { raidEntityKey } from '../raid/raidShare';

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
  /** 4.91: Kampfsystem an Land (Landgegner) und ob Landgegner gerade geteilt werden (nicht beim Entern eines fremden Decks) */
  combat(): CombatSystem | null;
  foesShared(): boolean;
  /** 4.91: Kopie eines Landgegners bauen, den diese Welt nicht selbst aufgestellt hat (Art, Stufe, Name, Macht aus dem Schnappschuss) */
  spawnFoe(ce: ClientEnt): Enemy | null;
  /** 4.91: Hieb bzw. Fläche eines geteilten Landgegners trifft die eigene Figur (Ort des Gegners für die Richtung) */
  foeHitMe(name: string, dmg: number, x: number, z: number): void;
  /** 4.91: dieser Gegner ist beim Shard gesperrt (Lager geräumt, Boss besiegt): `wait` s bis zur Wiederkehr */
  foeDenied(e: Enemy, wait: number): void;
  /** 4.92: Bereich der Welt ('' = offene Welt, sonst die Kennung der gemeinsamen Raid-Instanz) */
  scope?(): string;
  /** 4.92: ein Wachschiff mit festem Schlüssel ist beim Shard gesperrt (schon versenkt) – es zählt als gefallen */
  shipDenied?(e: EnemyShip): void;
  /** 4.92: Leviathan der Welt-Ereignisse (geteilt als Ungeheuer `beast`) */
  beast?(): BeastLive | null;
  /** 4.92: Bauwerk einer gemeinsamen Belagerung (Lebensanteil 0 … 1) von einem Mitspieler gemeldet */
  raidStructure?(id: string, frac: number): void;
}

/** 4.92: was SharedEntities vom Leviathan der Welt-Ereignisse braucht (`WorldEventsLive`) */
export interface BeastLive {
  readonly leviathan: { active: boolean; alive: boolean; x: number; z: number; hp: number; maxHp: number; up: number; phase: number; heading: number; remoteSlam(x: number, z: number): void };
  readonly levOwnActive: boolean;
  readonly levOwnEvent: boolean;
  levMirror: { x: number; z: number; hp: number; mhp: number; up: number; dead: boolean } | null;
  levAggro: Ship | null;
  levAdopted: boolean;
  onLevHitOut: ((dmg: number, pen: number) => number) | null;
  onLevPeerHit: ((dmg: number) => void) | null;
  onLevSlam: ((x: number, z: number) => void) | null;
  levApplyHit(dmg: number, pen: number): number;
}

/** 4.92: fester Schlüssel des Tiefsee-Leviathans (ein Ungeheuer für alle in der offenen Welt) */
export const BEAST_KEY = 'wb:leviathan';

interface OwnRec { id: string; e: EnemyShip; lastHp: number; fwd: number; lastBy: string }
interface MirrorRec { id: string; e: EnemyShip; predicted: number }
/** 4.91: eigener bzw. kopierter Landgegner (`built` = aus dem Schnappschuss gebaut, nicht in dieser Welt aufgestellt) */
interface OwnFoe { id: string; e: Enemy; lastHp: number; fwd: number }
interface MirrorFoe { id: string; e: Enemy; predicted: number; phase: number; built: boolean }

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
  readonly stats = { claimed: 0, owned: 0, mirrors: 0, built: 0, forwarded: 0, applied: 0, kills: 0, credited: 0, actsSent: 0, actsShown: 0, released: 0, adopted: 0, hitsMe: 0, demoted: 0,
    foeClaimed: 0, foesOwned: 0, foeMirrors: 0, foeBuilt: 0, foeMerged: 0, foeDenied: 0, foeHits: 0, foeApplied: 0, foeDemoted: 0, foeAdopted: 0, teleSent: 0, teleShown: 0, peerStrikes: 0, foeHitsMe: 0, phaseShown: 0,
    shipDenied: 0, beastClaims: 0, beastMerged: 0, beastMirror: 0, beastApplied: 0, beastHits: 0, beastAdopted: 0, beastKills: 0, bauSent: 0, bauShown: 0 };
  /** 4.91: Landgegner – Anmeldungen (Schlüssel → Gegner), eigene, Kopien */
  private readonly pendingFoes = new Map<string, Enemy>();
  private readonly ownFoes = new Map<string, OwnFoe>();
  private readonly ownFoeList: OwnFoe[] = [];
  private readonly mirrorFoes = new Map<string, MirrorFoe>();
  private readonly mirrorFoeList: MirrorFoe[] = [];
  /** 4.92: der geteilte Leviathan (Kennung, Besitz, Treffer-Schätzung) – höchstens einer */
  private readonly beastRec = { id: '', key: '', pending: false, owner: false, dead: false, lastHp: 0, fwd: 0, lastBy: '', hooked: false };
  private readonly beastOut = { x: 0, z: 0, hp: 0, mhp: 1, up: 0, dead: false };
  /** 4.92: der eigene geteilte Leviathan fiel mit eigenem Ereignis (Lohn über das Ereignis, nicht noch einmal über den Abschuss) */
  beastLocalReward = false;

  constructor(private readonly host: SharedHost) {}

  /** 4.92: eigener Bereich ('' = offene Welt) */
  private get scope(): string { return this.host.scope?.() ?? ''; }
  /** 4.92: gehört ein Eintrag des Schnappschusses zum eigenen Bereich? */
  private mine(ce: { scope?: string }): boolean { return (ce.scope ?? '') === this.scope; }

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
    if (!nav || !c || !c.online || !this.host.active()) { if (this.ownList.length || this.mirrorList.length || this.ownFoeList.length || this.mirrorFoeList.length || this.pendingFoes.size || this.beastRec.key) this.clear(); return; }
    this.host.me(_me);
    this.claimNew(nav, c);
    this.stepOwned(nav, c);
    this.stepMirrors(nav, c);
    // 4.92: Tiefsee-Leviathan (offene Welt)
    this.stepBeast(c);
    // 4.91: Landgegner
    const cb = this.host.combat();
    if (cb && this.host.foesShared()) {
      this.claimNewFoes(cb, c);
      this.stepOwnedFoes(cb, c);
      this.stepMirrorFoes(cb, c);
    } else if (this.ownFoeList.length || this.mirrorFoeList.length || this.pendingFoes.size) this.clearFoes();
    this.report(c, dt);
  }

  /**
   * Darf dieser Gegner geteilt werden? Offene See: Patrouillen, Kriegsschiffe, Händler und – 4.91 – alle Schiffe der Welt-Ereignisse (Konvois,
   * Korsaren, Geisterflotten, Weltbosse als Schiffe) und der Seeschlachten an den Grenzen. Nie die eigene Flotte, Raid-Wachen, Bühne,
   * Mitspieler, persönliche Geschichte (Legenden, Kopfgeldjäger, Übungsschiff), Prisen, Helfer, Geisterschiffe der Nacht.
   */
  private eligible(e: EnemyShip, nav: NavalSystem): boolean {
    if (e.shared || !e.ship.alive || e.ship.sinking > 0 || e.ship.disabled) return false;
    // 4.92: Wachschiffe mit festem Platz – die Seesperre einer Kaiser-Zitadelle (offene Welt) und die Wachflotte einer gemeinsamen Belagerung
    if (e.raid === 'guard' && e.guardId) return this.worldKeyOf(e) !== '';
    if (e.companion || e.fleetId || e.raid || e.station || e.stage || e.peer || e.legendId || e.training || e.hunter || e.captured || e.helper || e.ghost || e.showcase) return false;
    if (nav.isTeamShip(e)) return false;
    return !!e.ev || !!e.battle || e.role === 'patrouille' || e.role === 'jaeger' || e.role === 'haendler';
  }

  /**
   * 4.92: fester Schlüssel eines Wachschiffs ('' = keiner): Kaiser-Seesperre „kaiser:<Zitadelle>:wache:<Platz>“ (offene Welt), Wachflotte einer
   * gemeinsamen Belagerung „raid:<Instanz>:<Platz>“ (nur in der Instanz)
   */
  worldKeyOf(e: EnemyShip): string {
    const g = e.guardId;
    if (!g || e.raid !== 'guard') return '';
    const sc = this.scope;
    if (g.startsWith('kaiser:')) return sc ? '' : netKey(g);
    return sc ? netKey(raidEntityKey(sc, g)) : '';
  }

  private claimNew(nav: NavalSystem, c: MmoClient) {
    for (const e of nav.enemies) {
      if (!this.eligible(e, nav)) continue;
      if (Math.hypot(e.ship.x - _me.x, e.ship.z - _me.z) > 900) continue;
      const wk = this.worldKeyOf(e);
      const key = wk || `${c.id}.${++this.seq}`.slice(-48);
      const link: SharedLink = { id: '', key, owner: true, aggro: null, dead: false };
      e.shared = link;
      this.pending.set(key, e);
      c.claimEnt(this.spawnNet(e, key, wk !== ''));
      this.stats.claimed++;
    }
  }

  private spawnNet(e: EnemyShip, key: string, world = false): EntSpawnNet {
    const s = e.ship, l = s.look;
    return {
      key, cat: 'ship', tier: Math.max(0, SHIP_CLASSES.indexOf(s.cls)), role: e.role, level: e.level, name: e.name ?? 'Kriegsschiff', x: s.x, z: s.z, y: 0, hdg: s.heading, hp: s.hull, mhp: s.maxHull,
      // 4.92: ein versenktes Wachschiff mit festem Platz bleibt für alle versenkt, bis die Seesperre neu aufzieht
      boss: e.role === 'legende', scale: 1, respawn: world ? MMO.entRespawnBoss : 0, scope: this.scope,
      look: { hull: l.hull, stripe: l.stripe, sail: l.sail, flag: l.flag, flagColor: l.flagColor, figurehead: l.figurehead ?? 'keine', power: l.power ?? '', evo: [s.evo.hullTier, s.evo.sailTier, s.evo.cannonTier] },
    };
  }

  /** Eigene geteilte Gegner: Bedrohung aus eigenem Schaden, Untergang, Abgabe, Aggro-Ziel, Berichte (8 Hz) */
  private stepOwned(nav: NavalSystem, c: MmoClient) {
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
  }

  /** Berichte der eigenen geteilten Gegner (Schiffe und Landgegner), 8× je Sekunde, vorab angelegte Einträge */
  private report(c: MmoClient, dt: number) {
    this.reportT -= dt;
    if (this.reportT > 0 || (!this.ownList.length && !this.ownFoeList.length && !(this.beastRec.id && this.beastRec.owner))) return;
    this.reportT = 1 / MMO.entHz;
    let n = 0;
    for (const r of this.ownList) {
      const s = r.e.ship;
      if (r.e.shared?.dead) continue;
      const o = this.stateAt(n++);
      o.id = r.id; o.x = s.x; o.z = s.z; o.hdg = s.heading; o.spd = s.speed; o.hp = Math.max(0, s.hull); o.mhp = Math.max(1, s.maxHull); o.dis = s.disabled;
      o.y = 0; o.an = 0; o.clip = ''; o.pose = 1; o.brk = false; o.phase = 1;
    }
    for (const r of this.ownFoeList) {
      const e = r.e;
      if (e.shared?.dead || !e.alive) continue;
      const o = this.stateAt(n++);
      o.id = r.id; o.x = e.x; o.z = e.z; o.hdg = e.yaw; o.spd = Math.hypot(e.vx, e.vz); o.hp = Math.max(0, e.hp); o.mhp = Math.max(1, e.maxHp); o.dis = false;
      o.y = e.y; o.an = e.netAnim; o.clip = e.netClip; o.pose = e.hasPosture ? e.breakFrac : 1; o.brk = e.brokenT > 0; o.phase = e.phase;
    }
    // 4.92: der eigene geteilte Leviathan
    const B = this.beastRec, bl = this.host.beast?.();
    if (B.id && B.owner && !B.dead && bl && bl.leviathan.active) {
      const L = bl.leviathan, o = this.stateAt(n++);
      o.id = B.id; o.x = L.x; o.z = L.z; o.hdg = L.heading; o.spd = 0; o.hp = Math.max(0, L.hp); o.mhp = Math.max(1, L.maxHp); o.dis = false;
      o.y = 0; o.an = 0; o.clip = ''; o.pose = L.up; o.brk = false; o.phase = L.phase;
    }
    this.states.length = n;
    if (n) c.reportEnts(this.states);
  }

  private stateAt(n: number): EntStateNet {
    let o = this.states[n];
    if (!o) { o = { id: '', x: 0, z: 0, hdg: 0, spd: 0, hp: 0, mhp: 1, dis: false, y: 0, an: 0, clip: '', pose: 1, brk: false, phase: 1 }; this.states[n] = o; }
    return o;
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
      // Landgegner führt `stepMirrorFoes`, den Leviathan `stepBeast`; 4.92: nur aus dem eigenen Bereich
      if (ce.cat !== 'ship' || ce.owner === c.id || this.own.has(ce.id) || !this.mine(ce)) continue;
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
    this.clearFoes();
    this.clearBeast();
  }


  // ---------------------------------------------------------------------------------------------------------------
  // 4.91: Landgegner (Lager, Bezirke, Kommandanten, Bosse, Kaiser-Garden)
  // ---------------------------------------------------------------------------------------------------------------

  /** Erscheinen eines Landgegners für den Shard (feste Schlüssel führt er zusammen) */
  private foeSpawn(e: Enemy, key: string): EntSpawnNet {
    const boss = !!(e.def.boss || e.def.raid === 'boss');
    return {
      key, cat: 'foe', tier: 0, role: e.kind, level: e.level, name: e.name ?? e.def.label, x: e.x, z: e.z, y: e.y, hdg: e.yaw, hp: e.hp, mhp: e.maxHp,
      boss, scale: e.def.scale, respawn: boss ? MMO.entRespawnBoss : MMO.entRespawn, scope: this.scope,
      look: { hull: '#000000', stripe: '#000000', sail: '#000000', flag: 'totenkopf', flagColor: '#000000', figurehead: 'keine', power: e.power ?? '', evo: [3, 3, 3] },
    };
  }

  private newFoeLink(key: string): FoeLink { return { id: '', key, owner: true, dead: false, hit: null, peer: '', px: 0, py: 0, pz: 0, lastBy: '' }; }

  /** neue Landgegner in der Nähe anmelden (eigene Aufstellung: Lager, Bezirke, Kaiser, Ereignisse) */
  private claimNewFoes(cb: CombatSystem, c: MmoClient) {
    for (const e of cb.enemies) {
      if (e.shared || !e.alive) continue;
      if (Math.hypot(e.x - _me.x, e.z - _me.z) > MMO.foeShow + 60) continue;
      const key = e.netKey ? netKey(e.netKey) : `${c.id}.f${++this.seq}`.slice(-48);
      e.shared = this.newFoeLink(key);
      this.pendingFoes.set(key, e);
      c.claimEnt(this.foeSpawn(e, key));
      this.stats.foeClaimed++;
    }
  }

  /** Kopie führen: Treffer und Brand gehen roh an den Shard (mit Haltung, Rückstoß, Richtung, Zustand) */
  private asFoeMirror(id: string, e: Enemy, built: boolean): MirrorFoe {
    const rec: MirrorFoe = { id, e, predicted: 0, phase: e.phase, built };
    const L = e.shared ?? (e.shared = this.newFoeLink(''));
    L.id = id; L.owner = false; L.peer = '';
    L.hit = (h: HitInfo) => {
      const cl = this.host.client();
      if (!cl) return;
      const f = this.foeHitOut;
      f.poise = h.poise; f.knock = h.knock; f.launch = h.launch ?? 0; f.dx = h.dirX; f.dz = h.dirZ; f.st = ''; f.sd = 0;
      f.heavy = !!h.heavy; f.fin = !!h.finisher; f.brk = !!h.breakGuard;
      cl.hitEnt(id, h.dmg, false, 'land', 'hull', h.tier ?? 3, f);
      rec.predicted += h.dmg * 0.6;
      this.stats.foeHits++;
    };
    this.mirrorFoes.set(id, rec);
    this.mirrorFoeList.push(rec);
    this.stats.foeMirrors = this.mirrorFoeList.length;
    return rec;
  }
  private readonly foeHitOut: FoeHitNet = { poise: 0, knock: 0, launch: 0, dx: 0, dz: 0, st: '', sd: 0, heavy: false, fin: false, brk: false };

  private addOwnFoe(id: string, e: Enemy) {
    if (this.ownFoes.has(id)) return;
    if (e.shared) { e.shared.id = id; e.shared.owner = true; e.shared.hit = null; }
    const r: OwnFoe = { id, e, lastHp: e.hp, fwd: 0 };
    this.ownFoes.set(id, r);
    this.ownFoeList.push(r);
    this.stats.foesOwned = this.ownFoeList.length;
  }

  private dropOwnFoe(i: number) {
    const r = this.ownFoeList[i];
    this.ownFoeList.splice(i, 1);
    this.ownFoes.delete(r.id);
    this.stats.foesOwned = this.ownFoeList.length;
  }

  private dropFoeMirror(id: string, remove: boolean) {
    const m = this.mirrorFoes.get(id);
    if (!m) return;
    this.mirrorFoes.delete(id);
    const i = this.mirrorFoeList.indexOf(m);
    if (i >= 0) this.mirrorFoeList.splice(i, 1);
    this.stats.foeMirrors = this.mirrorFoeList.length;
    const cb = this.host.combat();
    if (remove && cb && cb.enemies.includes(m.e)) cb.removeEnemy(m.e);
    else if (!remove && m.e.shared) m.e.shared = null;
  }

  /** eigene Landgegner: Bedrohung aus eigenem Schaden, Tod, Abgabe, Ziel der Aggro-Tabelle (ein Mitspieler: seine Figur) */
  private stepOwnedFoes(cb: CombatSystem, c: MmoClient) {
    for (let i = this.ownFoeList.length - 1; i >= 0; i--) {
      const r = this.ownFoeList[i], e = r.e, L = e.shared;
      if (!L) { this.dropOwnFoe(i); continue; }
      // nicht mehr in der Welt (Insel verlassen): abgeben, der Shard übergibt ihn jemandem in der Nähe
      if (!cb.enemies.includes(e)) {
        if (!L.dead) { c.releaseEnt(r.id); this.stats.released++; }
        this.dropOwnFoe(i);
        continue;
      }
      const ce = c.ents.get(r.id);
      // Besitz verloren (zu lange kein Bericht): der eigene Gegner wird zur Kopie
      if (ce && ce.owner && ce.owner !== c.id && !L.dead) {
        this.dropOwnFoe(i);
        this.asFoeMirror(r.id, e, false);
        this.stats.foeDemoted++;
        continue;
      }
      const drop = r.lastHp - e.hp;
      if (drop > 0.5) { const mine = drop - r.fwd; if (mine > 0.5) { c.hitEnt(r.id, mine, true); L.lastBy = ''; } }
      r.fwd = 0;
      r.lastHp = e.hp;
      if (!L.dead && !e.alive) { L.dead = true; c.entDead(r.id, L.lastBy || c.id); }
      const ag = ce?.aggro ?? '';
      if (ag && ag !== c.id && this.host.peerAt(ag, _at)) { L.peer = ag; L.px = _at.x; L.py = _at.y; L.pz = _at.z; } else L.peer = '';
    }
  }

  /** Kopien fremder Landgegner: bauen (in der Nähe), Lage, Bewegung, Leben, Haltung und Phase aus dem Schnappschuss, Tod, Abbau */
  private stepMirrorFoes(cb: CombatSystem, c: MmoClient) {
    const now = c.transport.now();
    for (const ce of c.entList) {
      if (ce.cat !== 'foe' || ce.owner === c.id || this.ownFoes.has(ce.id) || !this.mine(ce)) continue;
      let m = this.mirrorFoes.get(ce.id);
      const d = Math.hypot(ce.x - _me.x, ce.z - _me.z);
      if (!m) {
        if (ce.dead || d > MMO.foeShow) continue;
        const e = this.host.spawnFoe(ce);
        if (!e) continue;
        m = this.asFoeMirror(ce.id, e, true);
        e.hp = Math.max(1, ce.hp); e.maxHp = Math.max(1, ce.mhp);
        this.stats.foeBuilt++;
      }
      const e = m.e;
      if (!cb.enemies.includes(e)) { this.dropFoeMirror(ce.id, false); continue; }
      if (e.state === 'dead') continue;
      const v = c.sampleEnt(ce, now);
      e.x = v.x; e.z = v.z; e.yaw = v.hdg; e.y = ce.y;
      if (ce.mhp > 0) e.maxHp = ce.mhp;
      const drop = e.hp - ce.hp;
      if (drop > 0.5 && !ce.dead) m.predicted = Math.max(0, m.predicted - drop);
      if (!ce.dead) e.hp = Math.max(1, ce.hp);
      e.mirrorAn = ce.an; e.mirrorClip = ce.clip;
      if (e.hasPosture) { e.poise = ce.pose * e.def.poise; e.brokenT = ce.brk ? Math.max(e.brokenT, 0.3) : 0; }
      // Boss-Phase gestiegen: Brüllen, Schockring und Banner (Fähigkeiten der Phase führt der Besitzer)
      if (ce.phase > m.phase) { m.phase = ce.phase; e.phase = ce.phase; cb.bossPhase(e, ce.phase, true); this.stats.phaseShown++; }
      if (ce.dead && e.shared) { e.shared.dead = true; e.mirrorDie(); }
    }
    // Kopien ohne Eintrag (verschwunden) oder weit weg abbauen; selbst aufgestellte, verlassene Kopien laufen als eigene Gegner weiter
    for (let i = this.mirrorFoeList.length - 1; i >= 0; i--) {
      const m = this.mirrorFoeList[i];
      if (m.e.state === 'dead') continue;
      const ce = c.ents.get(m.id);
      const far = Math.hypot(m.e.x - _me.x, m.e.z - _me.z) > MMO.foeShow * 1.6;
      if (!ce || far) this.dropFoeMirror(m.id, m.built || far);
    }
  }

  /** Landgegner abgeben bzw. abbauen (Verbindung weg, Insel verlassen, Raid, Entern) */
  private clearFoes() {
    const c = this.host.client();
    for (const r of this.ownFoeList) { if (r.e.shared && !r.e.shared.dead && c?.online) c.releaseEnt(r.id); r.e.shared = null; }
    this.ownFoeList.length = 0; this.ownFoes.clear();
    for (const e of this.pendingFoes.values()) e.shared = null;
    this.pendingFoes.clear();
    for (const m of [...this.mirrorFoeList]) this.dropFoeMirror(m.id, m.built);
    this.stats.foesOwned = 0;
  }

  /** Hieb bzw. Fläche eines eigenen Landgegners trifft die Figur eines Mitspielers */
  peerHitFoe(e: Enemy, playerId: string, dmg: number) {
    const c = this.host.client(), id = e.shared?.id;
    if (!c || !id || !e.shared?.owner) return;
    c.entPlayerHit(id, playerId, dmg, 3);
    this.stats.peerStrikes++;
  }

  /** Warnfläche eines eigenen Landgegners (Boss-Angriff) zur Darstellung an die Mitspieler */
  sendTele(e: Enemy, shape: number, x: number, z: number, yaw: number, size: number, width: number, delay: number) {
    const c = this.host.client(), id = e.shared?.id;
    if (!c || !c.online || !id || !e.shared?.owner) return;
    const a = this.act;
    a.t = 'tele'; a.ent = id; a.x = x; a.y = e.y; a.z = z; a.yaw = yaw; a.side = 0; a.n = Math.round(Math.max(0, Math.min(4.8, delay)) * 10);
    a.style = ''; a.el = ''; a.slot = shape; a.tx = size; a.ty = width; a.tz = 0; a.sea = false;
    c.act(a);
    this.stats.teleSent++;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Nachrichten des Shards
  // ---------------------------------------------------------------------------------------------------------------

  /** Kennung vergeben: der Gegner gehört ab jetzt zu den geteilten */
  claimed(key: string, id: string, owner = '') {
    // 4.92: Leviathan – neu (eigener) oder schon von einem Mitspieler gesteuert (diese Welt zeigt eine Kopie)
    const B = this.beastRec;
    if (B.pending && key === B.key) {
      B.pending = false; B.id = id; B.dead = false;
      B.owner = !owner || owner === this.me;
      const bl = this.host.beast?.();
      if (bl) { B.lastHp = bl.leviathan.hp; B.fwd = 0; }
      this.stats.beastClaims++;
      if (!B.owner) this.stats.beastMerged++;
      return;
    }
    // 4.91: Landgegner – neu (eigener) oder zusammengeführt mit dem Gegner eines Mitspielers (Kopie)
    const f = this.pendingFoes.get(key);
    if (f) {
      this.pendingFoes.delete(key);
      if (!f.shared) return;
      if (!owner || owner === this.me) this.addOwnFoe(id, f);
      else {
        // schon als Kopie aus dem Schnappschuss gebaut (Antwort kam nach dem Schnappschuss): die eigene Aufstellung bleibt, die gebaute geht
        const prev = this.mirrorFoes.get(id);
        if (prev) this.dropFoeMirror(id, prev.built);
        this.asFoeMirror(id, f, false);
        this.stats.foeMerged++;
      }
      return;
    }
    const e = this.pending.get(key);
    if (!e) return;
    this.pending.delete(key);
    if (!e.shared) return;
    e.shared.id = id;
    // fester Schlüssel eines Mitspielers (Kaiser-Wachschiff): das eigene Schiff wird zur Kopie
    if (owner && owner !== this.me) { e.shared.owner = false; this.asMirror(id, e); return; }
    const r: OwnRec = { id, e, lastHp: e.ship.hull, fwd: 0, lastBy: '' };
    this.own.set(id, r);
    this.ownList.push(r);
    this.stats.owned = this.ownList.length;
  }

  /** Treffer eines Mitspielers auf einen eigenen Gegner verrechnen */
  netHit(id: string, from: string, dmg: number, ammo: string, zone: 'hull' | 'sail', pen: number, foe: FoeHitNet | null = null) {
    // 4.92: Treffer eines Mitspielers auf den eigenen geteilten Leviathan (Rüstung rechnet der Besitzer)
    const B = this.beastRec;
    if (B.id === id && B.owner) {
      const bl = this.host.beast?.();
      if (bl) { B.fwd += bl.levApplyHit(dmg, pen); B.lastBy = from; this.stats.beastApplied++; }
      return;
    }
    if (foe) {
      // 4.91: Treffer eines Mitspielers auf einen eigenen Landgegner – Rüstung, Haltung, Zustand und Tod wie bei jedem Treffer
      const rf = this.ownFoes.get(id), cb = this.host.combat();
      if (!rf || !cb || !rf.e.shared) return;
      rf.fwd += cb.applyNetFoeHit(rf.e, dmg, pen, foe);
      rf.e.shared.lastBy = from;
      this.stats.foeApplied++;
      return;
    }
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
    // schon unser (eine wiederholte Übergabe): nichts Neues aufstellen
    if (this.ownFoes.has(e.id) || this.own.has(e.id)) return;
    if (e.cat === 'beast') { this.adoptBeast(e); return; }
    const mf = this.mirrorFoes.get(e.id);
    if (mf) {
      // 4.91: Landgegner übernehmen – aus der Kopie wird ein Gegner mit KI (Leben aus dem Schnappschuss)
      this.mirrorFoes.delete(e.id);
      const i = this.mirrorFoeList.indexOf(mf);
      if (i >= 0) this.mirrorFoeList.splice(i, 1);
      this.stats.foeMirrors = this.mirrorFoeList.length;
      mf.e.hp = Math.max(1, e.hp); mf.e.maxHp = Math.max(1, e.mhp);
      this.addOwnFoe(e.id, mf.e);
      this.stats.foeAdopted++;
      return;
    }
    if (e.cat === 'foe') {
      // Landgegner ohne Kopie hier (außer Sicht): gleich als eigenen aufstellen, sofern in der Nähe gekämpft wird
      const cl = this.host.client(), ce = cl?.ents.get(e.id);
      if (!cl || !ce) return;
      // nur, wer selbst auf dieser Insel kämpft, übernimmt (sonst gleich wieder abgeben: der Shard sucht jemanden in der Nähe)
      if (!this.host.foesShared() || Math.hypot(ce.x - _me.x, ce.z - _me.z) > MMO.foeShow) { cl.releaseEnt(e.id); return; }
      const nf = this.host.spawnFoe(ce);
      if (!nf) return;
      nf.shared = this.newFoeLink('');
      nf.hp = Math.max(1, e.hp); nf.maxHp = Math.max(1, e.mhp);
      this.addOwnFoe(e.id, nf);
      this.stats.foeAdopted++;
      return;
    }
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
    if (this.beastRec.id === id && !this.beastRec.owner) this.clearBeast();
    // nur Kopien: eigene Gegner verwirft der Shard nie, solange man verbunden ist (ohne Verbindung räumt `clear` auf)
    const m = this.mirrors.get(id);
    if (m && m.e.ship.sinking <= 0) this.dropMirror(id);
    const mf = this.mirrorFoes.get(id);
    if (mf && mf.e.state !== 'dead') this.dropFoeMirror(id, mf.built);
  }

  /** 4.91: fester Schlüssel gesperrt (Lager geräumt, Boss besiegt) – den eben aufgestellten Gegner wieder abbauen */
  denied(key: string, wait: number) {
    const f = this.pendingFoes.get(key);
    if (f) {
      this.pendingFoes.delete(key);
      f.shared = null;
      this.host.foeDenied(f, wait);
      this.stats.foeDenied++;
      return;
    }
    if (this.beastRec.pending && key === this.beastRec.key) {
      // 4.92: der Leviathan ist gerade gefallen (gesperrt) – diese Welt zeigt ihn nicht noch einmal
      this.beastRec.pending = false;
      return;
    }
    const e = this.pending.get(key);
    if (!e) return;
    this.pending.delete(key);
    e.shared = undefined;
    // 4.92: ein schon versenktes Wachschiff mit festem Platz zählt als gefallen
    this.host.shipDenied?.(e);
    this.stats.shipDenied++;
    const nav = this.host.naval();
    if (nav && nav.enemies.includes(e)) nav.removeEventShip(e);
  }

  /** Ein geteilter Gegner trifft das eigene Schiff */
  hitMe(id: string, name: string, dmg: number, pen: number) {
    const ce = this.host.client()?.ents.get(id);
    if (ce && ce.cat === 'foe') { this.stats.foeHitsMe++; this.host.foeHitMe(name, dmg, ce.x, ce.z); return; }
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
  // 4.92: Tiefsee-Leviathan (ein Ungeheuer für alle in der offenen Welt)
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Läuft in dieser Welt ein eigener Leviathan, meldet sie ihn mit festem Schlüssel an (`wb:leviathan`); steuert ihn schon ein Mitspieler,
   * zeigt sie eine Kopie (Lage, Leben, Auftauchen, Tod) – auch ohne eigenes Ereignis, sobald er in Sicht ist. Als Besitzer folgen Ziel und
   * Schläge der Aggro-Tabelle; Treffer der Kopie gehen roh an den Besitzer, der Abschuss über den Shard an alle Beteiligten.
   */
  private stepBeast(c: MmoClient) {
    const bl = this.host.beast?.();
    const B = this.beastRec;
    if (!bl || this.scope) { if (B.key) this.clearBeast(); return; }
    this.hookBeast(bl);
    const L = bl.leviathan;
    // Kopie eines fremden Leviathans: der Schnappschuss mit Art `beast` (offene Welt)
    let ce: ClientEnt | null = null;
    for (const x of c.entList) if (x.cat === 'beast' && this.mine(x) && (B.id ? x.id === B.id : true)) { ce = x; break; }
    if (B.id && !B.owner) {
      if (!ce) { if (!B.pending) this.clearBeast(); return; }
      const now = c.transport.now(), v = c.sampleEnt(ce, now), o = this.beastOut;
      o.x = v.x; o.z = v.z; o.hp = ce.hp; o.mhp = Math.max(1, ce.mhp); o.up = ce.pose; o.dead = ce.dead;
      bl.levMirror = o;
      this.stats.beastMirror++;
      return;
    }
    if (!B.id && !B.pending && ce && !ce.dead && ce.owner !== c.id && Math.hypot(ce.x - _me.x, ce.z - _me.z) <= MMO.shipShow) {
      // ohne eigenes Ereignis (bzw. vor der eigenen Anmeldung): gleich als Kopie
      B.id = ce.id; B.key = BEAST_KEY; B.owner = false; B.dead = false;
      this.stats.beastMirror++;
      return;
    }
    // eigener Leviathan: anmelden, berichten, Tod melden, Aggro-Ziel
    if (!B.id && !B.pending && bl.levOwnActive && L.alive) {
      B.key = BEAST_KEY; B.pending = true; B.owner = true; B.dead = false;
      c.claimEnt({
        key: BEAST_KEY, cat: 'beast', tier: 6, role: 'leviathan', level: 60, name: 'Tiefsee-Leviathan', x: L.x, z: L.z, y: 0, hdg: L.heading, hp: L.hp, mhp: L.maxHp,
        boss: true, scale: 1, respawn: MMO.entRespawnBoss, scope: '',
        look: { hull: '#3a6680', stripe: '#2c5468', sail: '#8cc0c8', flag: 'totenkopf', flagColor: '#10222c', figurehead: 'keine', power: '', evo: [5, 5, 5] },
      });
      return;
    }
    if (!B.id || !B.owner) return;
    if (!L.active) { if (!B.dead) c.releaseEnt(B.id); this.clearBeast(); return; }
    const own = c.ents.get(B.id);
    if (own && own.owner && own.owner !== c.id && !B.dead) {
      // Besitz verloren (zu lange kein Bericht): ab jetzt Kopie
      B.owner = false; bl.levAggro = null;
      this.stats.demoted++;
      return;
    }
    // eigener Schaden = Rückgang des Lebens minus der Treffer von Mitspielern
    const drop = B.lastHp - L.hp;
    if (drop > 0.5) { const mine = drop - B.fwd; if (mine > 0.5) { c.hitEnt(B.id, mine, true); B.lastBy = c.id; } }
    B.fwd = 0; B.lastHp = L.hp;
    if (!B.dead && !L.alive) { B.dead = true; this.beastLocalReward = bl.levOwnEvent; c.entDead(B.id, B.lastBy || c.id); this.stats.beastKills++; }
    const ag = own?.aggro ?? '';
    bl.levAggro = ag && ag !== c.id ? this.host.peerShip(ag) : null;
  }

  /** Rückrufe der Seewelt einmal verbinden (Treffer der Kopie, Schläge gegen Mitspieler, Warnringe) */
  private hookBeast(bl: BeastLive) {
    const B = this.beastRec;
    if (B.hooked) return;
    B.hooked = true;
    bl.onLevHitOut = (dmg, pen) => {
      const cl = this.host.client();
      if (!cl || !B.id || B.owner) return 0;
      cl.hitEnt(B.id, dmg, false, 'kugel', 'hull', pen);
      this.stats.beastHits++;
      return dmg * 0.7;
    };
    bl.onLevPeerHit = (dmg) => {
      const cl = this.host.client(), own = cl && B.id ? cl.ents.get(B.id) : null;
      if (!cl || !own || !own.aggro || own.aggro === cl.id) return;
      cl.entPlayerHit(B.id, own.aggro, dmg, 4);
      this.stats.peerStrikes++;
    };
    bl.onLevSlam = (x, z) => {
      const cl = this.host.client();
      if (!cl || !cl.online || !B.id || !B.owner) return;
      const a = this.act;
      a.t = 'tele'; a.ent = B.id; a.x = x; a.y = 0; a.z = z; a.yaw = 0; a.side = 0; a.n = 18; a.style = ''; a.el = ''; a.slot = 9; a.tx = 16; a.ty = 0; a.tz = 0; a.sea = true;
      cl.act(a);
      this.stats.teleSent++;
    };
  }

  /** Übernahme: der bisherige Besitzer ist fort – diese Welt steuert den Leviathan weiter (auch ohne eigenes Ereignis) */
  private adoptBeast(e: EntNet) {
    const bl = this.host.beast?.(), cl = this.host.client();
    if (!bl || !cl || this.scope) { cl?.releaseEnt(e.id); return; }
    const B = this.beastRec;
    const L = bl.leviathan;
    if (!L.active) { cl.releaseEnt(e.id); return; }
    bl.levMirror = null;
    if (!bl.levOwnEvent) bl.levAdopted = true;
    B.id = e.id; B.key = BEAST_KEY; B.owner = true; B.pending = false; B.dead = false; B.lastHp = L.hp; B.fwd = 0;
    this.stats.beastAdopted++;
  }

  private clearBeast() {
    const B = this.beastRec, bl = this.host.beast?.();
    if (bl) { bl.levMirror = null; bl.levAggro = null; }
    B.id = ''; B.key = ''; B.pending = false; B.owner = false; B.dead = false; B.lastHp = 0; B.fwd = 0; B.lastBy = '';
  }

  /** 4.92: Bauwerk einer gemeinsamen Belagerung beschädigt bzw. zerstört (Lebensanteil) – an die Teilnehmer der Instanz */
  sendBau(id: string, frac: number) {
    const c = this.host.client();
    if (!c || !c.online || !this.scope) return;
    const a = this.act;
    a.t = 'bau'; a.ent = ''; a.x = _me.x; a.y = 0; a.z = _me.z; a.yaw = 0; a.side = 0; a.n = 0; a.style = ''; a.el = id; a.slot = 0; a.tx = Math.max(0, Math.min(1, frac)); a.ty = 0; a.tz = 0; a.sea = true;
    c.act(a);
    this.stats.bauSent++;
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
    // 4.92: Bauwerk einer gemeinsamen Belagerung (Seetor, Mauer, Turm, Batterie) – Lebensanteil des Mitspielers übernehmen
    if (a.t === 'bau') { if (a.el) { this.host.raidStructure?.(a.el, a.tx); this.stats.bauShown++; } return; }
    // 4.92: Tentakel-Schlag des geteilten Leviathans (Warnring; den Schaden rechnet der Besitzer)
    if (a.t === 'tele' && a.slot === 9) {
      const bl = this.host.beast?.();
      if (bl && bl.leviathan.active && a.ent && a.ent === this.beastRec.id) { bl.leviathan.remoteSlam(a.x, a.z); this.stats.teleShown++; }
      return;
    }
    if (a.t === 'tele') {
      // 4.91: Warnfläche eines Boss-Angriffs (Kopie zeigt sie, den Schaden rechnet der Besitzer)
      const m = this.mirrorFoes.get(a.ent), cb = this.host.combat();
      if (m && cb && m.e.alive) { cb.showTelegraph(m.e, a.slot, a.x, a.z, a.yaw, a.tx, a.ty, a.n / 10); this.stats.teleShown++; }
      return;
    }
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
