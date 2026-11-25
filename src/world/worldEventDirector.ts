// WorldEventDirector (Phase 4.3C): das lebendige MMO-Meer. Rein, deterministisch (eigener Zufallsgenerator im Zustand), JSON-tauglich – ohne
// three.js und ohne Netze. Er führt gleichzeitig 4 bis 6 Welt-Ereignisse (Schatz-Galeone, Hafen-Blockade, Treibgut-Feld, Weltbosse) mit
// Mindestabstand und Wartezeiten, die Handelskonvois (world/tradeConvoys.ts) und die wandernden Wetterzellen (world/weatherCells.ts).
//
// Der ganze Zustand (`WorldEventState`) ist eine reine Datenstruktur: er steht im Spielstand (`SaveData.world.seaEvents`, Version 19) und kann in
// Phase 4.7 unverändert über den Mehrspieler-Shard abgeglichen werden. Die Seewelt (world/worldEventsLive.ts) liest ihn, macht in Spielernähe echte
// Schiffe und Signale daraus und schreibt Lage, Rumpf und Ausgang der Schiffe zurück; die Regeln (wann ein Ereignis endet, was es bewirkt) stehen hier.
//
// Opt-In: Ereignisse erscheinen nie näher als `DIRECTOR.spawnMin` an einem Spieler, sind am Horizont-Signal zu erkennen und greifen nur an, wer in ihre
// Zone fährt (Blockade, Weltboss) oder zuerst schießt.
import {
  CONVOY, DIRECTOR, FLOTSAM, FLOTSAM_GOODS, WEATHER_CELL_DEFS, WEATHER_CELLS, WORLD_BOSSES, WORLD_BOSS_IDS, WORLD_EVENT_DEFS, WORLD_EVENT_KINDS,
  BLOCKADE_RIVAL, HUNT, RESCUE, SMUGGLER, SUPPLY, type BeaconKind, type CrateKind, type WeatherCellKind, type WorldBossId, type WorldEventKind,
} from '../data/seaEvents';
import { DANGER, clampTier, dangerOfDistance, dangerOfLevel, type DangerTier } from '../data/balanceConfig';
import { GOOD_BY_ID, GOOD_IDS, type GoodId } from '../data/economy';
import { FACTION_IDS, type FactionId } from '../data/factions';
import { PLAYABLE_RADIUS } from '../data/world';
import { ringAtDistance, RINGS } from '../data/worldRings';
import { ISLAND_REACH } from '../data/regions';
import { routeAround } from './oceanCurrents';
import { TradeConvoySystem, advanceOnRoute, newShipRec, routeLength, updateLeg, type ConvoyNotice, type ConvoySite, type ConvoyState, type SeaShipRec, type SeaShipRole } from './tradeConvoys';
import { stepCells, strongestCell, type CellSample, type WeatherCell } from './weatherCells';

// ---------- Zustand ----------

export type EventPhase = 'aktiv' | 'gefecht' | 'beendet';
/**
 * Ausgang: besiegt/aufgebracht, Zeit abgelaufen, entkommen (Galeone am Ziel), alle Kisten bzw. die Schatztruhe geborgen; seit 4.5C dazu gerettet
 * (Schiffbrüchige) und angekommen (Kriegs-Nachschub an der Front)
 */
export type EventOutcome = 'gesiegt' | 'abgelaufen' | 'entkommen' | 'geborgen' | 'gerettet' | 'angekommen';

/** Antworten auf Schiffbrüchige (4.5C): als Crew anheuern, zum nächsten Hafen eskortieren, Wrack-Koordinaten bergen */
export type RescueChoice = 'crew' | 'eskorte' | 'wrack';
export const RESCUE_CHOICES: readonly RescueChoice[] = ['crew', 'eskorte', 'wrack'];

/** Angebot eines Schmugglers (4.5C): Bauplan einer Macht, Relikt-Splitter oder Schmuggelware */
export interface SmuggleOffer {
  id: string;
  kind: 'bauplan' | 'splitter' | 'ware';
  /** Bauplan: Macht; Ware: Kennung */
  power: FactionId | null;
  good: GoodId | null;
  units: number;
  price: number;
  sold: boolean;
}

/** Seite einer Belagerung, die ein Nachschub-Transport beliefert */
export type SupplySide = 'angreifer' | 'verteidiger';

/**
 * Front für den Kriegs-Nachschub (4.5C): eine laufende Belagerung samt Rohstoff-Inseln je Seite, aus denen Transporte kommen können. Liefert die
 * Seewelt aus dem Krieg der Mächte (world/factionWarEngine.ts `supplyFronts`); der Director bleibt rein und kennt den Krieg nur über diese Daten.
 */
export interface SupplyFront {
  siegeId: string;
  islandId: string;
  name: string;
  x: number;
  z: number;
  r: number;
  attacker: string;
  defender: string | null;
  sources: { side: SupplySide; nation: string; islandId: string; name: string; x: number; z: number; r: number }[];
}

export interface FlotsamCrate {
  id: string;
  x: number;
  z: number;
  kind: CrateKind;
  good: GoodId | null;
  units: number;
  /** Schatzkarte: Insel mit dem vergrabenen Schatz */
  islandId: string | null;
  taken: boolean;
}

export interface WorldEvent {
  id: string;
  kind: WorldEventKind;
  name: string;
  beacon: BeaconKind;
  x: number;
  z: number;
  /** Zone (m): wer hineinfährt, wird angegriffen (0 = nur wer zuerst schießt) */
  zone: number;
  level: number;
  dangerTier: DangerTier;
  power: FactionId | null;
  createdAt: number;
  expiresAt: number;
  phase: EventPhase;
  outcome: EventOutcome | null;
  /** Der Spieler hat den Ausgang herbeigeführt (Belohnung) */
  byPlayer: boolean;
  endedAt: number;
  /** Bis hierhin gilt es als „im Gefecht“ und läuft nicht ab (setzt die Seewelt bei jedem Treffer) */
  engagedUntil: number;
  /** Die Seewelt fährt echte Schiffe bzw. das Ungeheuer (setzt der Gastgeber) */
  live: boolean;
  ships: SeaShipRec[];
  /** Blockade: der gesperrte Hafen */
  islandId?: string;
  islandName?: string;
  /** Galeone und Weltboss: Route (flach x, z, …), nächster Wegpunkt, Kurs, Ziel */
  route?: number[];
  leg?: number;
  heading?: number;
  destName?: string;
  crates?: FlotsamCrate[];
  bossId?: WorldBossId;
  /** Leben des Ungeheuers 0 … 1 (Schiffs-Bosse führen ihren Rumpf im Schiffseintrag) */
  bossHp?: number;
  // ----- Phase 4.5C: interaktive Begegnungen -----
  /** Schiffbrüchige: Personen auf dem Floß, Wahl des Spielers (Eskorte: Zielhafen und Frist), Lage des verratenen Wracks */
  survivors?: number;
  rescue?: { choice: RescueChoice; portId?: string; portName?: string; deadline?: number; wreckX?: number; wreckZ?: number };
  /** Schmuggler: Angebote; hochgenommen (für die Marine) */
  offers?: SmuggleOffer[];
  busted?: boolean;
  /** Schatzsuche: Suchbereich auf der Insel (Weltkoordinaten, Radius), Hinterhalt ausgelöst, Karte stammt aus einem Fund des Spielers */
  site?: { x: number; z: number; r: number };
  ambushed?: boolean;
  mapped?: boolean;
  /** Kriegs-Nachschub: Belagerung, begünstigte Seite und Nation (`power`), Gegner, Herkunft, Begleitzeit des Spielers und Fahrtzeit (s) */
  siegeId?: string;
  side?: SupplySide;
  foe?: string | null;
  fromName?: string;
  escortT?: number;
  tripT?: number;
  /** Kriegs-Nachschub: die Gegenseite hat Kaperschiffe geschickt (einmal je Fahrt, sobald ein Spieler den Transport begleitet) */
  raided?: boolean;
}

export interface WorldEventState {
  v: 1;
  /** Uhr des Directors (s) */
  t: number;
  seq: number;
  /** Zustand des Zufallsgenerators (uint32) */
  rng: number;
  events: WorldEvent[];
  /**
   * Wartezeiten: Schlüssel Art bzw. `boss:<id>` → Uhrzeiten, bis zu denen je ein Platz gesperrt ist. Ein beendetes Ereignis gibt seinen Platz erst nach
   * der Wartezeit seiner Art frei (`WORLD_EVENT_DEFS[…].cooldown`), ein besiegter oder abgetauchter Weltboss kommt erst danach wieder.
   */
  cooldowns: Record<string, number[]>;
  nextSpawnAt: number;
  convoys: ConvoyState[];
  nextConvoyAt: number;
  cells: WeatherCell[];
  nextCellAt: number;
  /** Siege über jeden Weltboss (erster Sieg: mehr Siegel) */
  bossKills: Record<string, number>;
  /** Zählwerke für Anzeige und Prüfung */
  stats: { spawned: number; ended: number; convoysArrived: number; convoysLost: number; convoysPlundered: number };
}

export const emptyWorldEvents = (seed = 0x5eaf00d): WorldEventState => ({
  v: 1, t: 0, seq: 0, rng: seed >>> 0, events: [], cooldowns: {}, nextSpawnAt: 0, convoys: [], nextConvoyAt: 4, cells: [], nextCellAt: 0, bossKills: {},
  stats: { spawned: 0, ended: 0, convoysArrived: 0, convoysLost: 0, convoysPlundered: 0 },
});

// ---------- Eingaben ----------

/** Was der Director von einer Insel wissen muss (aus den Inseldaten bzw. Blueprints) */
export interface DirectorIsland {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
  ring: number;
  kind: string;
  factionId: FactionId | null;
  uncharted: boolean;
  /** Hafen mit Markt (Blockade-Ziel, Galeonen-Ziel) */
  harbor: boolean;
  blackMarket: boolean;
  /** Mega-Insel oder vorgelagerte Schäre (keine Schatzsuche, keine Schmugglerbucht) */
  mega?: boolean;
  skerry?: boolean;
}

export interface DirectorWorld {
  islands: readonly DirectorIsland[];
  /** Häfen der Konvois (Ringe 1 – 3) */
  sites: readonly ConvoySite[];
  /** Laufende Belagerungen für den Kriegs-Nachschub (4.5C); fehlt der Krieg, gibt es keinen Nachschub */
  fronts?: () => readonly SupplyFront[];
}

export interface Interest { x: number; z: number }

export type DirectorNotice =
  | ConvoyNotice
  | { type: 'eventStart'; event: WorldEvent }
  | { type: 'eventEnd'; event: WorldEvent }
  | { type: 'supplyRaid'; event: WorldEvent };

// ---------- Hilfen ----------

const GALLEON_SPEED = 6;
const BOSS_SPEED = 3.2;
/** Weltbosse ziehen im Inneren von Ring 4, den Königs-Meeren (seit 4.5C 10 200 – 13 000 m) */
const BOSS_RING: readonly [number, number] = [10600, 12700];

/** Zufallsgenerator (mulberry32) auf einem Zustandsfeld */
function nextRandom(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const num = (v: unknown, d: number, lo = -1e9, hi = 1e9) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v.slice(0, 80) : d);

// ---------- Director ----------

export class WorldEventDirector {
  state: WorldEventState;
  readonly convoys: TradeConvoySystem;
  private notices: DirectorNotice[] = [];
  private readonly rnd = () => nextRandom(this.state);
  private readonly harbors: DirectorIsland[];
  /** Alle Häfen mit Markt samt Ankerglück (Ziel der Schiffbrüchigen) */
  private readonly ports: DirectorIsland[];
  private readonly mapIslands: DirectorIsland[];
  /** Inseln für die Schatzsuche (ruhig, verlassen, Schatzinsel oder Kolonie-Hafen; keine Städte, Lager, Festungen, Mega-Inseln, Schären, Unkartierten) */
  private readonly huntIslands: DirectorIsland[];
  /** Inseln mit abgelegener Bucht für Schmuggler (ruhig, verlassen, Schatzinsel, herrenlos) */
  private readonly coveIslands: DirectorIsland[];
  private readonly cellTmp: CellSample = { cell: null, k: 0 };

  constructor(private readonly world: DirectorWorld, state?: WorldEventState | null, seed = 0x5eaf00d) {
    this.state = state ?? emptyWorldEvents(seed);
    this.convoys = new TradeConvoySystem(world.sites, world.islands);
    this.harbors = world.islands.filter((i) => i.harbor && !i.uncharted && i.id !== 'ankerglueck');
    this.ports = world.islands.filter((i) => i.harbor && !i.uncharted);
    this.mapIslands = world.islands.filter((i) => (i.kind === 'quiet' || i.kind === 'treasure') && !i.uncharted);
    const plain = (i: DirectorIsland) => !i.uncharted && !i.mega && !i.skerry && i.ring <= 4;
    this.huntIslands = world.islands.filter((i) => plain(i) && (i.kind === 'quiet' || i.kind === 'treasure' || i.kind === 'ruin' || (i.kind === 'harbor' && i.id !== 'ankerglueck')) && i.r >= 40);
    this.coveIslands = world.islands.filter((i) => plain(i) && (i.kind === 'quiet' || i.kind === 'treasure' || i.kind === 'ruin' || i.blackMarket) && i.ring >= 2);
  }

  /** Neue Meldungen abholen (die Liste wird geleert) */
  drain(): DirectorNotice[] {
    if (!this.notices.length) return this.notices;
    const out = this.notices;
    this.notices = [];
    return out;
  }

  // ---------- Takt ----------

  /** Lage der Spieler im laufenden Schritt (für Begleitschutz und Abstände; nur gelesen) */
  private interestNow: readonly Interest[] = [];

  /** Ein Planungsschritt (`dt` s, sinnvoll ~1 s); `interest` = Lage der Spieler (Interessenpunkte wie beim Streaming) */
  update(dt: number, interest: readonly Interest[]): void {
    const s = this.state;
    if (!(dt > 0)) return;
    s.t += dt;
    this.interestNow = interest;
    this.stepEvents(dt);
    this.stepConvoys(dt, interest);
    this.stepCells(dt, interest);
    this.spawnEvents(interest);
  }

  // ---------- Ereignisse ----------

  private stepEvents(dt: number): void {
    const s = this.state;
    for (let i = s.events.length - 1; i >= 0; i--) {
      const ev = s.events[i];
      if (ev.phase === 'beendet') {
        if (s.t - ev.endedAt > DIRECTOR.linger) s.events.splice(i, 1);
        continue;
      }
      ev.phase = s.t < ev.engagedUntil ? 'gefecht' : 'aktiv';
      switch (ev.kind) {
        case 'schatzgaleone': {
          const g = ev.ships.find((x) => x.role === 'galeone');
          if (!g || g.down) { this.end(ev, 'gesiegt', !!g && (g.byPlayer || g.boarded)); continue; }
          if (!ev.live) this.moveAlong(ev, GALLEON_SPEED * dt);
          else { ev.x = g.x; ev.z = g.z; ev.heading = g.heading; updateLeg(ev as { route: number[]; leg: number; x: number; z: number }); }
          const r = ev.route!;
          if (Math.hypot(r[r.length - 2] - ev.x, r[r.length - 1] - ev.z) < 140 && ev.phase !== 'gefecht') { this.end(ev, 'entkommen', false); continue; }
          break;
        }
        case 'blockade': {
          if (ev.ships.length && ev.ships.every((x) => x.down)) { this.end(ev, 'gesiegt', ev.ships.some((x) => x.byPlayer || x.boarded)); continue; }
          break;
        }
        case 'treibgut': {
          if (ev.crates && ev.crates.every((c) => c.taken)) { this.end(ev, 'geborgen', true); continue; }
          break;
        }
        case 'weltboss': {
          const b = ev.ships[0];
          const dead = WORLD_BOSSES[ev.bossId!].form === 'ungeheuer' ? (ev.bossHp ?? 1) <= 0 : !b || b.down;
          if (dead) { this.end(ev, 'gesiegt', WORLD_BOSSES[ev.bossId!].form === 'ungeheuer' ? true : !!b && (b.byPlayer || b.boarded)); continue; }
          if (!ev.live) {
            this.moveAlong(ev, BOSS_SPEED * dt);
            if (ev.leg! >= ev.route!.length / 2) this.roam(ev);
          } else if (b) { ev.x = b.x; ev.z = b.z; ev.heading = b.heading; updateLeg(ev as { route: number[]; leg: number; x: number; z: number }); if (ev.leg! >= ev.route!.length / 2 - 1) this.roam(ev); }
          if (b && !ev.live) { b.x = ev.x; b.z = ev.z; b.heading = ev.heading ?? 0; }
          break;
        }
        case 'schiffbruch': {
          // Eskorte: die Geretteten sind an Bord, das Ereignis zieht mit dem Schiff (setzt die Seewelt über `follow`); die Frist steht in `expiresAt`
          if (ev.rescue?.choice === 'eskorte') ev.engagedUntil = 0;
          break;
        }
        case 'schmuggler': {
          // hochgenommen (oder vom Spieler angegriffen) und alle Schiffe erledigt: die Marine zahlt
          if (ev.ships.length && ev.ships.every((x) => x.down)) { this.end(ev, 'gesiegt', ev.ships.some((x) => x.byPlayer || x.boarded)); continue; }
          break;
        }
        case 'schatzjagd': {
          // nach dem Hinterhalt läuft die Suche nicht ab, solange der Spieler auf der Insel kämpft (setzt die Seewelt über `engage`)
          break;
        }
        case 'nachschub': {
          const fr = ev.ships.find((x) => x.role === 'frachter');
          if (!fr || fr.down) { this.end(ev, 'gesiegt', !!fr && (fr.byPlayer || fr.boarded)); continue; }
          if (!ev.live) this.moveAlong(ev, SUPPLY.speed * dt);
          else { ev.x = fr.x; ev.z = fr.z; ev.heading = fr.heading; updateLeg(ev as { route: number[]; leg: number; x: number; z: number }); }
          ev.tripT = (ev.tripT ?? 0) + dt;
          // Begleitschutz: ein Spieler in der Nähe, der den Transport nie angegriffen hat
          if (this.interestNear(ev.x, ev.z, SUPPLY.escortRange) && !ev.ships.some((x) => x.byPlayer)) ev.escortT = (ev.escortT ?? 0) + dt;
          // wer den Transport begleitet, bekommt es mit Kaperschiffen der Gegenseite zu tun (einmal je Fahrt, nicht kurz vor dem Ziel)
          if (!ev.raided && (ev.escortT ?? 0) >= SUPPLY.raidAfter && ev.foe && ev.leg! < ev.route!.length / 2 - 3) this.raidSupply(ev);
          const r = ev.route!;
          if (Math.hypot(r[r.length - 2] - ev.x, r[r.length - 1] - ev.z) < 160 && ev.phase !== 'gefecht') {
            const escorted = (ev.escortT ?? 0) >= SUPPLY.escortShare * Math.max(1, ev.tripT ?? 1) && !ev.ships.some((x) => x.byPlayer);
            this.end(ev, 'angekommen', escorted);
            continue;
          }
          break;
        }
      }
      if (s.t >= ev.expiresAt && ev.phase !== 'gefecht') this.end(ev, 'abgelaufen', false);
    }
  }

  /** Ist ein Spieler näher als `r` an (x, z)? */
  private interestNear(x: number, z: number, r: number): boolean {
    for (const q of this.interestNow) if (Math.hypot(q.x - x, q.z - z) < r) return true;
    return false;
  }

  private moveAlong(ev: WorldEvent, dist: number): void {
    const c = ev as WorldEvent & { route: number[]; leg: number; heading: number };
    advanceOnRoute(c, dist);
    for (const sh of ev.ships) if (!sh.down) {
      // Begleitschutz fährt in loser Formation mit (Daten; echte Schiffe halten ihre Formation selbst)
      const side = sh.slot === 0 ? 0 : sh.slot % 2 ? 1 : -1, back = sh.slot === 0 ? 0 : 45 + 20 * Math.floor((sh.slot - 1) / 2);
      sh.x = ev.x + Math.cos(c.heading) * side * 40 - Math.sin(c.heading) * back;
      sh.z = ev.z - Math.sin(c.heading) * side * 40 - Math.cos(c.heading) * back;
      sh.heading = c.heading;
    }
  }

  /** Ereignis beenden: Wartezeit setzen, Meldung */
  end(ev: WorldEvent, outcome: EventOutcome, byPlayer: boolean): void {
    if (ev.phase === 'beendet') return;
    const s = this.state;
    ev.phase = 'beendet';
    ev.outcome = outcome;
    ev.byPlayer = byPlayer;
    ev.endedAt = s.t;
    const def = WORLD_EVENT_DEFS[ev.kind];
    this.coolSlot(ev.bossId ? `boss:${ev.bossId}` : ev.kind, s.t + def.cooldown);
    if (ev.bossId) {
      if (outcome === 'gesiegt' && byPlayer) s.bossKills[ev.bossId] = (s.bossKills[ev.bossId] ?? 0) + 1;
      // die Wetterzelle des Bosses zieht ab (blendet über ihre Restzeit aus)
      for (const c of s.cells) if (c.bossEventId === ev.id) { delete c.bossEventId; c.life = c.age + WEATHER_CELLS.fade; c.vx = 0; c.vz = 0; }
    }
    s.stats.ended++;
    this.notices.push({ type: 'eventEnd', event: ev });
  }

  /** Nächstes Wegstück eines Weltbosses: entlang des Außenrings (Ring 4), deterministisch */
  private roam(ev: WorldEvent): void {
    const r = this.rnd;
    const a0 = Math.atan2(ev.x, ev.z);
    const d0 = Math.hypot(ev.x, ev.z);
    const a1 = a0 + (r() < 0.5 ? -1 : 1) * (0.1 + r() * 0.12);
    const d1 = Math.max(BOSS_RING[0], Math.min(BOSS_RING[1], d0 + (r() - 0.5) * 600));
    const tx = Math.sin(a1) * d1, tz = Math.cos(a1) * d1;
    ev.route = this.path(ev.x, ev.z, tx, tz);
    ev.leg = 1;
  }

  /** Weg um Inseln (Wegpunkte etwa alle 240 m) */
  private path(ax: number, az: number, bx: number, bz: number): number[] {
    const obs = this.world.islands.map((i) => ({ x: i.x, z: i.z, c: i.r * ISLAND_REACH + 90 }));
    const r = routeAround(ax, az, bx, bz, obs, 60);
    const out: number[] = [];
    for (let k = 0; k < r.xs.length; k++) if (k % 4 === 0 || k === r.xs.length - 1) out.push(r.xs[k], r.zs[k]);
    return out;
  }

  private activeCount(kind?: WorldEventKind): number {
    let n = 0;
    for (const e of this.state.events) if (e.phase !== 'beendet' && (!kind || e.kind === kind)) n++;
    return n;
  }

  /** Platz einer Art (oder eines Bosses) bis `until` sperren; abgelaufene Sperren fallen dabei weg */
  private coolSlot(key: string, until: number): void {
    const list = (this.state.cooldowns[key] ??= []);
    for (let i = list.length - 1; i >= 0; i--) if (list[i] <= this.state.t) list.splice(i, 1);
    list.push(until);
  }

  /** Wie viele Plätze dieser Art (oder dieses Bosses) gerade warten */
  cooling(key: string): number {
    const list = this.state.cooldowns[key];
    if (!list) return 0;
    let n = 0;
    for (const t of list) if (t > this.state.t) n++;
    return n;
  }

  private bossAvailable(): WorldBossId[] {
    return WORLD_BOSS_IDS.filter((id) => !this.cooling(`boss:${id}`) && !this.state.events.some((e) => e.bossId === id && e.phase !== 'beendet'));
  }

  /** Neue Ereignisse: höchstens `maxActive`, nie während einer Wartezeit, nie dichter als `spawnGap` (beim Auffüllen auf `minActive` schneller) */
  private spawnEvents(interest: readonly Interest[]): void {
    const s = this.state;
    const active = this.activeCount();
    if (active >= DIRECTOR.maxActive || s.t < s.nextSpawnAt) return;
    const kinds: { kind: WorldEventKind; w: number }[] = [];
    for (const k of WORLD_EVENT_KINDS) {
      const def = WORLD_EVENT_DEFS[k];
      if (k === 'weltboss') { if (this.activeCount(k) < def.max && this.bossAvailable().length) kinds.push({ kind: k, w: def.weight }); continue; }
      if (this.activeCount(k) + this.cooling(k) >= def.max) continue;
      // Kriegs-Nachschub nur, solange irgendwo eine Belagerung läuft
      if (k === 'nachschub' && !(this.world.fronts?.().length)) continue;
      kinds.push({ kind: k, w: def.weight });
    }
    let made: WorldEvent | null = null;
    while (kinds.length && !made) {
      const total = kinds.reduce((a, b) => a + b.w, 0);
      let x = this.rnd() * total, pick = 0;
      for (let i = 0; i < kinds.length; i++) { x -= kinds[i].w; if (x <= 0) { pick = i; break; } }
      const k = kinds.splice(pick, 1)[0].kind;
      made = this.create(k, interest);
    }
    if (made) {
      s.events.push(made);
      s.stats.spawned++;
      this.notices.push({ type: 'eventStart', event: made });
      if (made.bossId) this.attachBossCell(made);
      s.nextSpawnAt = s.t + (active + 1 < DIRECTOR.minActive ? DIRECTOR.bootstrapGap : DIRECTOR.spawnGap * (0.8 + 0.4 * this.rnd()));
    } else s.nextSpawnAt = s.t + 5;
  }

  /** Ein Ereignis dieser Art anlegen (Ort, Schiffe, Inhalt); null, wenn kein Platz gefunden wurde */
  create(kind: WorldEventKind, interest: readonly Interest[]): WorldEvent | null {
    const s = this.state;
    const def = WORLD_EVENT_DEFS[kind];
    const id = `ev${++s.seq}`;
    const life = def.life[0] + (def.life[1] - def.life[0]) * this.rnd();
    const base = (x: number, z: number, level: number, power: FactionId | null): WorldEvent => this.baseEvent(id, kind, x, z, level, power, life);
    switch (kind) {
      case 'schiffbruch': {
        const p = this.placeOpenWater(def.rings, interest, DIRECTOR.islandClear + 40);
        if (!p) return null;
        const ev = base(p.x, p.z, this.levelAt(p.x, p.z), null);
        ev.survivors = RESCUE.survivors[0] + Math.floor(this.rnd() * (RESCUE.survivors[1] - RESCUE.survivors[0] + 1));
        ev.heading = this.rnd() * Math.PI * 2;
        return ev;
      }
      case 'schmuggler': {
        // halb und halb: in einer abgelegenen Bucht (vor einer ruhigen, verlassenen oder herrenlosen Insel) oder auf offener See
        let p: { x: number; z: number } | null = null;
        let isl: DirectorIsland | null = null;
        if (this.rnd() < 0.5) { const c = this.placeCove(def.rings, interest); if (c) { p = c; isl = c.island; } }
        if (!p) p = this.placeOpenWater(def.rings, interest, DIRECTOR.islandClear + 60);
        if (!p) return null;
        const ev = base(p.x, p.z, this.levelAt(p.x, p.z) + 1, null);
        if (isl) { ev.islandId = isl.id; ev.islandName = isl.name; }
        // in der Bucht quer zur Küste, auf See mit beliebigem Kurs; der Begleit-Logger liegt 60 m daneben
        const hd = isl ? Math.atan2(isl.x - p.x, isl.z - p.z) + Math.PI / 2 : this.rnd() * Math.PI * 2;
        ev.heading = hd;
        const cls = Math.min(4, 1 + ev.dangerTier);
        ev.ships.push(newShipRec(`${id}-s`, 'schmuggler', cls, p.x, p.z, hd, 0));
        ev.ships.push(newShipRec(`${id}-e0`, 'eskorte', Math.max(1, cls - 1), p.x + Math.cos(hd) * 60, p.z - Math.sin(hd) * 60, hd, 1));
        ev.offers = this.makeOffers(id, ev.dangerTier);
        return ev;
      }
      case 'schatzjagd': return this.createHunt(id, null, interest, false, life);
      case 'nachschub': return this.createSupply(id, interest, life);
      case 'treibgut': {
        const p = this.placeOpenWater(def.rings, interest, DIRECTOR.islandClear + FLOTSAM.spread);
        if (!p) return null;
        const ev = base(p.x, p.z, this.levelAt(p.x, p.z), null);
        ev.crates = this.makeCrates(id, p.x, p.z);
        return ev;
      }
      case 'schatzgaleone': {
        const p = this.placeOpenWater(def.rings, interest, DIRECTOR.islandClear + 60);
        if (!p) return null;
        const dest = this.harbors.filter((h) => h.ring >= 2 && Math.hypot(h.x - p.x, h.z - p.z) > 2500 && Math.hypot(h.x - p.x, h.z - p.z) < 6500);
        if (!dest.length) return null;
        const h = dest[Math.floor(this.rnd() * dest.length) % dest.length];
        const ang = Math.atan2(p.x - h.x, p.z - h.z);
        const route = this.path(p.x, p.z, h.x + Math.sin(ang) * (h.r * ISLAND_REACH + 120), h.z + Math.cos(ang) * (h.r * ISLAND_REACH + 120));
        if (route.length < 4) return null;
        const level = this.levelAt(p.x, p.z) + 2;
        const ev = base(p.x, p.z, level, h.factionId);
        ev.route = route; ev.leg = 1; ev.heading = Math.atan2(route[2] - p.x, route[3] - p.z); ev.destName = h.name;
        // so lange, wie die Fahrt dauert (plus Reserve)
        ev.expiresAt = s.t + routeLength(route) / GALLEON_SPEED + 180;
        const escortClass = ev.dangerTier >= 4 ? 4 : 3;
        ev.ships.push(newShipRec(`${id}-g`, 'galeone', 4, p.x, p.z, ev.heading, 0));
        ev.ships.push(newShipRec(`${id}-e0`, 'eskorte', escortClass, p.x, p.z, ev.heading, 1));
        ev.ships.push(newShipRec(`${id}-e1`, 'eskorte', escortClass, p.x, p.z, ev.heading, 2));
        return ev;
      }
      case 'blockade': {
        const cand = this.harbors.filter((h) => !h.blackMarket && def.rings.includes(h.ring as 1 | 2 | 3 | 4)
          && !s.events.some((e) => e.phase !== 'beendet' && e.islandId === h.id));
        const ok = (h: DirectorIsland, x: number, z: number) => this.spacingOk(x, z) && interest.every((q) => Math.hypot(q.x - x, q.z - z) >= DIRECTOR.spawnMin + h.r);
        const spot = (h: DirectorIsland) => { const a = Math.atan2(-h.x, -h.z); const d = h.r * ISLAND_REACH + 260; return { x: h.x + Math.sin(a) * d, z: h.z + Math.cos(a) * d, a }; };
        // bevorzugt ein Hafen in Sichtweite eines Spielers
        const near = interest.length ? cand.filter((h) => interest.some((q) => Math.hypot(q.x - h.x, q.z - h.z) < DIRECTOR.spawnMax + 1500)) : [];
        const pool = (near.length && this.rnd() < 0.75 ? near : cand).slice();
        let h: DirectorIsland | null = null, sp = { x: 0, z: 0, a: 0 };
        while (pool.length && !h) {
          const c = pool.splice(Math.floor(this.rnd() * pool.length) % pool.length, 1)[0];
          const p = spot(c);
          if (ok(c, p.x, p.z)) { h = c; sp = p; }
        }
        if (!h) return null;
        const rival = h.factionId ? BLOCKADE_RIVAL[h.factionId] : 'kurogane';
        const power: FactionId = this.rnd() < 0.6 ? (h.factionId === 'kurogane' ? rival : 'kurogane') : rival;
        const level = this.levelAt(sp.x, sp.z) + 1;
        const ev = base(sp.x, sp.z, level, power);
        ev.islandId = h.id; ev.islandName = h.name;
        const n = ev.dangerTier >= 4 ? 4 : 3;
        const cls = Math.min(5, 1 + ev.dangerTier);
        for (let k = 0; k < n; k++) {
          // im Bogen vor dem Hafen, quer zur Anfahrt
          const off = (k - (n - 1) / 2) * 110;
          const x = sp.x + Math.cos(sp.a) * off, z = sp.z - Math.sin(sp.a) * off;
          ev.ships.push(newShipRec(`${id}-w${k}`, 'wache', k === 0 ? cls : Math.max(1, cls - 1), x, z, sp.a + Math.PI / 2, k));
        }
        return ev;
      }
      case 'weltboss': {
        const free = this.bossAvailable();
        if (!free.length) return null;
        const bossId = free[Math.floor(this.rnd() * free.length) % free.length];
        const bd = WORLD_BOSSES[bossId];
        const p = this.placeRing4(interest);
        if (!p) return null;
        const ev = base(p.x, p.z, bd.level, bd.sealPower);
        ev.bossId = bossId;
        ev.name = bd.name;
        ev.bossHp = 1;
        ev.heading = 0;
        ev.route = [p.x, p.z, p.x, p.z]; ev.leg = 1;
        this.roam(ev);
        ev.ships.push(newShipRec(`${id}-b`, 'boss', bd.classTier, p.x, p.z, 0, 0));
        return ev;
      }
    }
  }

  private attachBossCell(ev: WorldEvent): void {
    const bd = WORLD_BOSSES[ev.bossId!];
    const cd = WEATHER_CELL_DEFS[bd.cell];
    this.state.cells.push({ id: `c${++this.state.seq}`, kind: bd.cell, x: ev.x, z: ev.z, r: cd.r[1], vx: 0, vz: 0, age: 0, life: 1e9, bossEventId: ev.id });
  }

  /** Gegnerstufe auf See an einem Ort (aus den Gefahrenbändern) */
  levelAt(x: number, z: number): number {
    const t = dangerOfDistance(Math.hypot(x, z));
    return DANGER[t].levelMin + 1;
  }

  private spacingOk(x: number, z: number): boolean {
    for (const e of this.state.events) if (e.phase !== 'beendet' && Math.hypot(e.x - x, e.z - z) < DIRECTOR.minSpacing) return false;
    return true;
  }

  /** Freies Wasser: im spielbaren Radius, mit Abstand zu jeder Küste */
  freeWater(x: number, z: number, clear: number): boolean {
    if (Math.hypot(x, z) > PLAYABLE_RADIUS - 350) return false;
    for (const i of this.world.islands) if (Math.hypot(i.x - x, i.z - z) - i.r * ISLAND_REACH < clear) return false;
    return true;
  }

  /** Neues Ereignis aus den Grunddaten seiner Art (Lebensdauer `life` s) */
  private baseEvent(id: string, kind: WorldEventKind, x: number, z: number, level: number, power: FactionId | null, life: number): WorldEvent {
    const s = this.state, def = WORLD_EVENT_DEFS[kind];
    return {
      id, kind, name: def.name, beacon: def.beacon, x, z, zone: def.zone, level, dangerTier: dangerOfLevel(level), power, createdAt: s.t, expiresAt: s.t + life,
      phase: 'aktiv', outcome: null, byPlayer: false, endedAt: -1, engagedUntil: 0, live: false, ships: [],
    };
  }

  /** Laufende Ereignisse je Ring (Index = Ring 1 … 5); schreibt in `out` */
  ringLoad(out: number[] = this.loadTmp): number[] {
    out.fill(0);
    for (const e of this.state.events) if (e.phase !== 'beendet') out[ringAtDistance(Math.hypot(e.x, e.z)).ring]++;
    return out;
  }
  private readonly loadTmp = [0, 0, 0, 0, 0, 0];

  /**
   * Ring für das nächste Ereignis (4.5C): unter den erlaubten der mit den wenigsten laufenden Ereignissen, je Ring gewichtet nach seiner Fläche
   * (die äußeren Ringe tragen mehr), bei Gleichstand der Zufall. So verteilen sich die Ereignisse gleichmäßig über die Ringe 1 bis 4.
   */
  private pickRing(rings: readonly number[]): number {
    const load = this.ringLoad();
    let best = Infinity;
    const cand: number[] = [];
    for (const r of rings) {
      const R = RINGS[r - 1];
      // gewünschter Anteil ∝ Wurzel der Fläche: der kleine Ring 1 bekommt nicht zu wenig, die großen nicht zu viel
      const share = Math.sqrt(R.to * R.to - R.from * R.from);
      const v = (load[r] + 1) / share;
      if (v < best - 1e-12) { best = v; cand.length = 0; cand.push(r); } else if (Math.abs(v - best) <= 1e-12) cand.push(r);
    }
    return cand[Math.floor(this.rnd() * cand.length) % cand.length] ?? rings[0];
  }

  /**
   * Ort auf offener See: in einem der Ringe, frei, mit Mindestabstand zu Ereignissen und Spielern. Ein Teil (`DIRECTOR.nearShare`) entsteht in
   * Sichtweite eines Spielers, der Rest im Ring mit den wenigsten Ereignissen (gleichmäßige Verteilung über die Welt).
   */
  private placeOpenWater(rings: readonly number[], interest: readonly Interest[], clear: number): { x: number; z: number } | null {
    const near = interest.length > 0 && this.rnd() < DIRECTOR.nearShare;
    const target = this.pickRing(rings);
    for (let tries = 0; tries < 80; tries++) {
      let x: number, z: number;
      if (near && tries < 36) {
        const q = interest[Math.floor(this.rnd() * interest.length) % interest.length];
        const a = this.rnd() * Math.PI * 2, d = DIRECTOR.spawnMin + this.rnd() * (DIRECTOR.spawnMax - DIRECTOR.spawnMin);
        x = q.x + Math.sin(a) * d; z = q.z + Math.cos(a) * d;
      } else {
        const ring = RINGS[(tries < 64 ? target : rings[Math.floor(this.rnd() * rings.length) % rings.length] ?? 1) - 1];
        const a = this.rnd() * Math.PI * 2, d = ring.from + 200 + this.rnd() * Math.max(1, ring.to - ring.from - 400);
        x = Math.sin(a) * d; z = Math.cos(a) * d;
      }
      if (!rings.includes(ringAtDistance(Math.hypot(x, z)).ring)) continue;
      if (!this.freeWater(x, z, clear) || !this.spacingOk(x, z)) continue;
      if (!interest.every((q) => Math.hypot(q.x - x, q.z - z) >= DIRECTOR.spawnMin)) continue;
      return { x, z };
    }
    return null;
  }

  /** Abgelegene Bucht für ein Schmuggler-Rendezvous: vor einer ruhigen, verlassenen oder herrenlosen Insel (keine Häfen, Festungen, Mega-Inseln) */
  private placeCove(rings: readonly number[], interest: readonly Interest[]): { x: number; z: number; island: DirectorIsland } | null {
    const target = this.pickRing(rings);
    const pool = this.coveIslands.filter((i) => rings.includes(i.ring));
    const inRing = pool.filter((i) => i.ring === target);
    const from = (inRing.length ? inRing : pool).slice();
    while (from.length) {
      const isl = from.splice(Math.floor(this.rnd() * from.length) % from.length, 1)[0];
      // die Bucht liegt auf der dem Weltmittelpunkt abgewandten Seite (abseits der Handelsrouten)
      const a = Math.atan2(isl.x, isl.z) + (this.rnd() - 0.5) * 1.6;
      const d = isl.r * ISLAND_REACH + 120;
      const x = isl.x + Math.sin(a) * d, z = isl.z + Math.cos(a) * d;
      if (!rings.includes(ringAtDistance(Math.hypot(x, z)).ring)) continue;
      if (!this.freeWater(x, z, 60) || !this.spacingOk(x, z)) continue;
      if (!interest.every((q) => Math.hypot(q.x - x, q.z - z) >= DIRECTOR.spawnMin)) continue;
      return { x, z, island: isl };
    }
    return null;
  }

  /**
   * Schatzsuche (4.5C): Suchbereich auf einer Insel. `islandId` = Insel aus einer Schatzkarte des Spielers (dann `mapped`, ohne Mindestabstand: die Karte
   * zeigt genau dorthin); sonst wählt der Director eine ruhige Insel im Ring mit den wenigsten Ereignissen (bzw. in Sichtweite eines Spielers).
   */
  private createHunt(id: string, islandId: string | null, interest: readonly Interest[], mapped: boolean, life: number): WorldEvent | null {
    let isl: DirectorIsland | undefined;
    if (islandId) isl = this.world.islands.find((i) => i.id === islandId);
    else {
      const def = WORLD_EVENT_DEFS.schatzjagd;
      const ring = this.pickRing(def.rings);
      const busy = new Set<string>();
      for (const e of this.state.events) if (e.kind === 'schatzjagd' && e.phase !== 'beendet' && e.islandId) busy.add(e.islandId);
      const pool = this.huntIslands.filter((i) => def.rings.includes(i.ring as 1) && !busy.has(i.id) && this.spacingOk(i.x, i.z)
        && interest.every((q) => Math.hypot(q.x - i.x, q.z - i.z) >= DIRECTOR.spawnMin + i.r));
      const near = interest.length && this.rnd() < DIRECTOR.nearShare ? pool.filter((i) => interest.some((q) => Math.hypot(q.x - i.x, q.z - i.z) < DIRECTOR.spawnMax)) : [];
      const inRing = pool.filter((i) => i.ring === ring);
      const from = near.length ? near : inRing.length ? inRing : pool;
      if (!from.length) return null;
      isl = from[Math.floor(this.rnd() * from.length) % from.length];
    }
    if (!isl) return null;
    // Suchbereich: auf halbem Weg zwischen Inselmitte und Küste, in einer vom Zufall gewählten Richtung
    const a = this.rnd() * Math.PI * 2, d = isl.r * HUNT.siteK;
    const sx = isl.x + Math.sin(a) * d, sz = isl.z + Math.cos(a) * d;
    const ev = this.baseEvent(id, 'schatzjagd', sx, sz, this.levelAt(isl.x, isl.z) + 1, null, life);
    ev.islandId = isl.id; ev.islandName = isl.name;
    ev.site = { x: sx, z: sz, r: HUNT.searchR };
    ev.ambushed = false;
    ev.mapped = mapped;
    return ev;
  }

  /**
   * Kriegs-Nachschub (4.5C): ein Transport mit Begleitschutz von einer Rohstoff-Insel einer Kriegspartei zur belagerten Insel. Je Front und Seite höchstens
   * einer zugleich; bevorzugt eine Front in Sichtweite eines Spielers.
   */
  private createSupply(id: string, interest: readonly Interest[], life: number): WorldEvent | null {
    const fronts = this.world.fronts?.() ?? [];
    const cand: { f: SupplyFront; src: SupplyFront['sources'][number] }[] = [];
    for (const f of fronts) for (const src of f.sources) {
      const d = Math.hypot(src.x - f.x, src.z - f.z);
      if (d < SUPPLY.minTrip || d > SUPPLY.maxTrip) continue;
      if (this.state.events.some((e) => e.kind === 'nachschub' && e.phase !== 'beendet' && e.siegeId === f.siegeId && e.side === src.side)) continue;
      cand.push({ f, src });
    }
    if (!cand.length) return null;
    const near = interest.length && this.rnd() < DIRECTOR.nearShare ? cand.filter((c) => interest.some((q) => Math.hypot(q.x - c.f.x, q.z - c.f.z) < DIRECTOR.spawnMax + 2000)) : [];
    const pool = (near.length ? near : cand).slice();
    while (pool.length) {
      const { f, src } = pool.splice(Math.floor(this.rnd() * pool.length) % pool.length, 1)[0];
      const dx = f.x - src.x, dz = f.z - src.z, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
      const ax = src.x + ux * (src.r * ISLAND_REACH + 140), az = src.z + uz * (src.r * ISLAND_REACH + 140);
      const bx = f.x - ux * (f.r * ISLAND_REACH + 220), bz = f.z - uz * (f.r * ISLAND_REACH + 220);
      if (!this.freeWater(ax, az, 60) || !this.spacingOk(ax, az)) continue;
      if (!interest.every((q) => Math.hypot(q.x - ax, q.z - az) >= DIRECTOR.spawnMin)) continue;
      const route = this.path(ax, az, bx, bz);
      if (route.length < 4) continue;
      const level = this.levelAt(ax, az) + 1;
      const ev = this.baseEvent(id, 'nachschub', ax, az, level, src.nation as FactionId, life);
      ev.siegeId = f.siegeId; ev.side = src.side;
      ev.foe = src.side === 'angreifer' ? f.defender : f.attacker;
      ev.islandId = f.islandId; ev.islandName = f.name; ev.fromName = src.name; ev.destName = f.name;
      ev.route = route; ev.leg = 1; ev.heading = Math.atan2(route[2] - ax, route[3] - az);
      ev.expiresAt = this.state.t + routeLength(route) / SUPPLY.speed + 300;
      ev.escortT = 0; ev.tripT = 0;
      const t = ev.dangerTier - 1;
      ev.ships.push(newShipRec(`${id}-f`, 'frachter', SUPPLY.freighterClass[t], ax, az, ev.heading, 0));
      for (let k = 0; k < SUPPLY.escorts[t]; k++) ev.ships.push(newShipRec(`${id}-e${k}`, 'eskorte', SUPPLY.escortClass[t], ax, az, ev.heading, k + 1));
      return ev;
    }
    return null;
  }

  /** Kaperschiffe der Gegenseite gegen einen begleiteten Nachschub-Transport: sie kommen quer zur Fahrt aus 420 m und jagen den Transporter */
  private raidSupply(ev: WorldEvent): void {
    ev.raided = true;
    const n = SUPPLY.raiders[ev.dangerTier - 1];
    const side = this.rnd() < 0.5 ? -1 : 1;
    const h = ev.heading ?? 0;
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * 90;
      const x = ev.x + Math.cos(h) * side * 420 + Math.sin(h) * (160 + off), z = ev.z - Math.sin(h) * side * 420 + Math.cos(h) * (160 + off);
      ev.ships.push(newShipRec(`${ev.id}-k${k}`, 'korsar', SUPPLY.escortClass[ev.dangerTier - 1], x, z, Math.atan2(ev.x - x, ev.z - z), 10 + k));
    }
    this.notices.push({ type: 'supplyRaid', event: ev });
  }

  /** Angebote eines Schmugglers: ein Bauplan einer Macht, Relikt-Splitter und zwei Posten Schmuggelware (Kriegsware und Luxus) */
  private makeOffers(id: string, tier: number): SmuggleOffer[] {
    const r = this.rnd;
    const powers: FactionId[] = ['england', 'niederlande', 'deutschland', 'frankreich', 'kurogane'];
    const out: SmuggleOffer[] = [];
    out.push({ id: `${id}-o0`, kind: 'bauplan', power: powers[Math.floor(r() * powers.length) % powers.length], good: null, units: 1, price: SMUGGLER.blueprintPrice + 200 * tier, sold: false });
    const shards = SMUGGLER.shardUnits[0] + Math.floor(r() * (SMUGGLER.shardUnits[1] - SMUGGLER.shardUnits[0] + 1));
    out.push({ id: `${id}-o1`, kind: 'splitter', power: null, good: null, units: shards, price: shards * SMUGGLER.shardPrice, sold: false });
    const contraband: GoodId[] = ['waffenkisten', 'schiesspulver', 'medizin'];
    const luxury: GoodId[] = ['luxusgueter', 'seide', 'gewuerze'];
    for (const [k, list] of [[2, contraband], [3, luxury]] as const) {
      const good = list[Math.floor(r() * list.length) % list.length];
      const units = SMUGGLER.goodsUnits[0] + Math.floor(r() * (SMUGGLER.goodsUnits[1] - SMUGGLER.goodsUnits[0] + 1));
      out.push({ id: `${id}-o${k}`, kind: 'ware', power: null, good, units, price: Math.round(units * (GOOD_BY_ID[good]?.base ?? 60) * (1 + SMUGGLER.goodsMarkup)), sold: false });
    }
    return out.slice(0, SMUGGLER.offers);
  }

  /** Ort im Außenring für Weltbosse (Königs-Meere, 10 600 – 12 700 m) */
  private placeRing4(interest: readonly Interest[]): { x: number; z: number } | null {
    const outer = interest.filter((q) => Math.hypot(q.x, q.z) > 8000);
    for (let tries = 0; tries < 60; tries++) {
      let a: number;
      if (outer.length && tries < 30) {
        const q = outer[Math.floor(this.rnd() * outer.length) % outer.length];
        a = Math.atan2(q.x, q.z) + (this.rnd() - 0.5) * 0.6;
      } else a = this.rnd() * Math.PI * 2;
      const d = BOSS_RING[0] + this.rnd() * (BOSS_RING[1] - BOSS_RING[0]);
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (!this.freeWater(x, z, 200) || !this.spacingOk(x, z)) continue;
      if (!interest.every((q) => Math.hypot(q.x - x, q.z - z) >= DIRECTOR.spawnMin)) continue;
      return { x, z };
    }
    return null;
  }

  /** Kisten eines Treibgut-Felds; `count` = Spanne der Anzahl, `wreck` = Wrackfeld der Schiffbrüchigen (mehr Ware, immer eine Schatzkarte) */
  private makeCrates(id: string, cx: number, cz: number, count: readonly [number, number] = FLOTSAM.crates as readonly [number, number], wreck = false): FlotsamCrate[] {
    const n = count[0] + Math.floor(this.rnd() * (count[1] - count[0] + 1));
    const out: FlotsamCrate[] = [];
    let mapIsland: string | null = null;
    if ((wreck || this.rnd() < FLOTSAM.mapChance) && this.mapIslands.length) {
      // die nächste ruhige Insel oder Schatzinsel bekommt das X
      let best = Infinity;
      for (const i of this.mapIslands) { const d = Math.hypot(i.x - cx, i.z - cz); if (d < best) { best = d; mapIsland = i.id; } }
    }
    for (let k = 0; k < n; k++) {
      const a = this.rnd() * Math.PI * 2, d = Math.sqrt(this.rnd()) * FLOTSAM.spread;
      let kind: CrateKind;
      let good: GoodId | null = null, units: number;
      if (k === 0 && mapIsland) { kind = 'karte'; units = 1; }
      else {
        const r = this.rnd();
        if (r < (wreck ? 0.65 : FLOTSAM.goodsShare)) { kind = 'ware'; good = FLOTSAM_GOODS[Math.floor(this.rnd() * FLOTSAM_GOODS.length) % FLOTSAM_GOODS.length]; units = 3 + Math.floor(this.rnd() * 6); }
        else if (r < FLOTSAM.goodsShare + 0.32) { kind = 'planken'; units = 1 + Math.floor(this.rnd() * 3); }
        else { kind = 'segeltuch'; units = 1 + Math.floor(this.rnd() * 2); }
      }
      out.push({ id: `${id}-k${k}`, x: cx + Math.sin(a) * d, z: cz + Math.cos(a) * d, kind, good, units, islandId: kind === 'karte' ? mapIsland : null, taken: false });
    }
    return out;
  }

  // ---------- Konvois ----------

  private stepConvoys(dt: number, interest: readonly Interest[]): void {
    const s = this.state;
    for (let i = s.convoys.length - 1; i >= 0; i--) {
      const c = s.convoys[i];
      if (c.endedAt >= 0) { if (s.t - c.endedAt > DIRECTOR.linger) s.convoys.splice(i, 1); continue; }
      const n = this.convoys.step(c, dt, this.rnd);
      if (n) {
        this.notices.push(n);
        if (n.type === 'convoyArrived') { c.endedAt = s.t; s.stats.convoysArrived++; }
        else if (n.type === 'convoyPlundered') { c.endedAt = s.t; if (n.byPlayer) s.stats.convoysPlundered++; else s.stats.convoysLost++; }
      }
    }
    let running = 0;
    for (const c of s.convoys) if (c.endedAt < 0) running++;
    if (running < CONVOY.max && s.t >= s.nextConvoyAt) {
      const c = this.convoys.create(`kv${++s.seq}`, s.t, this.rnd, interest, s.convoys.filter((x) => x.endedAt < 0).map((x) => `${x.from}>${x.to}`));
      s.nextConvoyAt = s.t + (running + 1 < CONVOY.max ? CONVOY.bootstrapGap : CONVOY.spawnGap * (0.7 + 0.6 * this.rnd()));
      // nie direkt neben einem Spieler loslegen (Opt-In: man sieht sie kommen)
      if (c && interest.every((q) => Math.hypot(q.x - c.x, q.z - c.z) > 600)) s.convoys.push(c);
    }
  }

  // ---------- Wetter ----------

  private stepCells(dt: number, interest: readonly Interest[]): void {
    const s = this.state;
    stepCells(s.cells, dt);
    // Bosszellen folgen ihrem Boss
    for (const c of s.cells) {
      if (!c.bossEventId) continue;
      const ev = s.events.find((e) => e.id === c.bossEventId);
      if (ev) { c.x = ev.x; c.z = ev.z; }
    }
    let free = 0;
    for (const c of s.cells) if (!c.bossEventId) free++;
    if (free >= WEATHER_CELLS.count || s.t < s.nextCellAt) return;
    s.nextCellAt = s.t + (free + 1 < WEATHER_CELLS.count ? 3 : WEATHER_CELLS.spawnGap * (0.7 + 0.6 * this.rnd()));
    const kinds = Object.values(WEATHER_CELL_DEFS);
    const total = kinds.reduce((a, b) => a + b.weight, 0);
    let x = this.rnd() * total;
    let kind: WeatherCellKind = 'gewitter';
    for (const d of kinds) { x -= d.weight; if (x <= 0) { kind = d.kind; break; } }
    const def = WEATHER_CELL_DEFS[kind];
    for (let tries = 0; tries < 20; tries++) {
      let px: number, pz: number;
      if (interest.length && this.rnd() < 0.6) {
        const q = interest[Math.floor(this.rnd() * interest.length) % interest.length];
        const a = this.rnd() * Math.PI * 2, d = WEATHER_CELLS.spawnMin + this.rnd() * (WEATHER_CELLS.spawnMax - WEATHER_CELLS.spawnMin);
        px = q.x + Math.sin(a) * d; pz = q.z + Math.cos(a) * d;
      } else {
        const a = this.rnd() * Math.PI * 2, d = 600 + this.rnd() * (PLAYABLE_RADIUS - 1200);
        px = Math.sin(a) * d; pz = Math.cos(a) * d;
      }
      const r = def.r[0] + this.rnd() * (def.r[1] - def.r[0]);
      if (Math.hypot(px, pz) > PLAYABLE_RADIUS - r) continue;
      if (!interest.every((q) => Math.hypot(q.x - px, q.z - pz) > r + 300)) continue;
      if (s.cells.some((c) => Math.hypot(c.x - px, c.z - pz) < c.r + r)) continue;
      const a = this.rnd() * Math.PI * 2, v = def.speed[0] + this.rnd() * (def.speed[1] - def.speed[0]);
      s.cells.push({ id: `c${++s.seq}`, kind, x: px, z: pz, r, vx: Math.sin(a) * v, vz: Math.cos(a) * v, age: 0, life: def.life[0] + this.rnd() * (def.life[1] - def.life[0]) });
      return;
    }
  }

  // ---------- Abfragen ----------

  /** Laufende Ereignisse (ohne beendete) */
  active(): WorldEvent[] { return this.state.events.filter((e) => e.phase !== 'beendet'); }

  eventById(id: string): WorldEvent | undefined { return this.state.events.find((e) => e.id === id); }
  convoyById(id: string): ConvoyState | undefined { return this.state.convoys.find((c) => c.id === id); }

  /** Laufende Blockade eines Hafens */
  blockadeOf(islandId: string): WorldEvent | null {
    for (const e of this.state.events) if (e.kind === 'blockade' && e.islandId === islandId && e.phase !== 'beendet') return e;
    return null;
  }

  /** Preisfaktor eines Hafens: eine Blockade verdoppelt die Handelspreise */
  priceK(islandId: string): number { return this.blockadeOf(islandId) ? 2 : 1; }

  /** Schnellreise zu diesem Hafen gesperrt (Blockade) */
  travelLocked(islandId: string): boolean { return !!this.blockadeOf(islandId); }

  /** Stärkste Wetterzelle an (x, z) */
  cellAt(x: number, z: number, out: CellSample = this.cellTmp): CellSample { return strongestCell(this.state.cells, x, z, out); }

  // ---------- Rückmeldungen der Seewelt ----------

  /** Treffer oder Zonen-Eintritt: das Ereignis läuft 60 s lang nicht ab */
  engage(evId: string, seconds = 60): void {
    const ev = this.eventById(evId);
    if (ev && ev.phase !== 'beendet') { ev.engagedUntil = Math.max(ev.engagedUntil, this.state.t + seconds); ev.phase = 'gefecht'; }
  }

  /** Eine Kiste eines Treibgut-Felds bergen; liefert sie (nur einmal) */
  collectCrate(evId: string, crateId: string): FlotsamCrate | null {
    const ev = this.eventById(evId);
    const c = ev?.crates?.find((k) => k.id === crateId);
    if (!ev || !c || c.taken || ev.phase === 'beendet') return null;
    c.taken = true;
    if (ev.crates!.every((k) => k.taken)) this.end(ev, 'geborgen', true);
    return c;
  }

  /** Leben des Ungeheuers (0 … 1) */
  setBossHp(evId: string, frac: number): void {
    const ev = this.eventById(evId);
    if (ev) ev.bossHp = Math.max(0, Math.min(1, frac));
  }

  /** Erster Sieg über diesen Boss? (vor `end` abfragen) */
  firstKill(bossId: WorldBossId): boolean { return !(this.state.bossKills[bossId] > 0); }

  // ---------- Entscheidungen des Spielers (4.5C) ----------

  private openEvent(evId: string, kind: WorldEventKind): WorldEvent | null {
    const ev = this.eventById(evId);
    return ev && ev.kind === kind && ev.phase !== 'beendet' ? ev : null;
  }

  /** Nächster Hafen mit Markt (ohne Blockade, ohne unkartierte Inseln, Freihafen Ankerglück eingeschlossen) zu einem Ort: Ziel der Eskorte Schiffbrüchiger */
  nearestPort(x: number, z: number): DirectorIsland | null {
    let best: DirectorIsland | null = null, bd = Infinity;
    for (const h of this.ports) {
      if (this.blockadeOf(h.id)) continue;
      const d = Math.hypot(h.x - x, h.z - z) - h.r;
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  /**
   * Schiffbrüchige: Antwort des Spielers. `crew` und `wrack` beenden die Begegnung sofort (gerettet; beim Wrack entsteht ein reiches Wrackfeld mit
   * sicherer Schatzkarte, dessen Lage in `rescue.wreckX/Z` steht); `eskorte` nimmt sie an Bord: Ziel ist der nächste Hafen, die Frist läuft.
   */
  rescue(evId: string, choice: RescueChoice): WorldEvent | null {
    const ev = this.openEvent(evId, 'schiffbruch');
    if (!ev || ev.rescue) return null;
    if (choice === 'eskorte') {
      const port = this.nearestPort(ev.x, ev.z);
      if (!port) return null;
      ev.rescue = { choice, portId: port.id, portName: port.name, deadline: this.state.t + RESCUE.escortTime };
      ev.expiresAt = this.state.t + RESCUE.escortTime;
      ev.engagedUntil = 0;
      return ev;
    }
    if (choice === 'wrack') {
      const w = this.createWreck(ev.x, ev.z);
      ev.rescue = { choice, wreckX: w?.x, wreckZ: w?.z };
    } else ev.rescue = { choice };
    this.end(ev, 'gerettet', true);
    return ev;
  }

  /** Eskorte: die Geretteten sind an Bord, das Ereignis zieht mit dem Schiff mit */
  follow(evId: string, x: number, z: number): void {
    const ev = this.openEvent(evId, 'schiffbruch');
    if (ev?.rescue?.choice === 'eskorte') { ev.x = x; ev.z = z; }
  }

  /** Eskorte am Ziel: die Schiffbrüchigen gehen im Hafen an Land */
  rescueArrived(evId: string): WorldEvent | null {
    const ev = this.openEvent(evId, 'schiffbruch');
    if (!ev || ev.rescue?.choice !== 'eskorte') return null;
    this.end(ev, 'gerettet', true);
    return ev;
  }

  /** Wrack-Koordinaten: ein reiches Treibgut-Feld („Wrackfeld“) 0,8 bis 1,5 km entfernt; zählt nicht gegen die Plätze der Ereignisse */
  createWreck(fromX: number, fromZ: number): WorldEvent | null {
    const s = this.state;
    for (let tries = 0; tries < 40; tries++) {
      const a = this.rnd() * Math.PI * 2, d = RESCUE.wreckDist[0] + this.rnd() * (RESCUE.wreckDist[1] - RESCUE.wreckDist[0]);
      const x = fromX + Math.sin(a) * d, z = fromZ + Math.cos(a) * d;
      if (!this.freeWater(x, z, DIRECTOR.islandClear + FLOTSAM.spread)) continue;
      const id = `ev${++s.seq}`;
      const def = WORLD_EVENT_DEFS.treibgut;
      const ev = this.baseEvent(id, 'treibgut', x, z, this.levelAt(x, z), null, def.life[1] + 300);
      ev.name = 'Wrackfeld';
      ev.crates = this.makeCrates(id, x, z, RESCUE.wreckCrates, true);
      s.events.push(ev);
      s.stats.spawned++;
      this.notices.push({ type: 'eventStart', event: ev });
      return ev;
    }
    return null;
  }

  /** Schmuggler: ein Angebot kaufen (einmal); liefert es (die Bezahlung macht das Spiel) */
  buyOffer(evId: string, offerId: string): SmuggleOffer | null {
    const ev = this.openEvent(evId, 'schmuggler');
    const o = ev?.offers?.find((x) => x.id === offerId);
    if (!ev || !o || o.sold || ev.busted) return null;
    o.sold = true;
    return o;
  }

  /** Schmuggler für die Marine hochnehmen: die Schiffe wehren sich (die Seewelt macht sie feindlich), das Ereignis läuft nicht ab */
  bust(evId: string): WorldEvent | null {
    const ev = this.openEvent(evId, 'schmuggler');
    if (!ev || ev.busted) return null;
    ev.busted = true;
    this.engage(evId, 240);
    return ev;
  }

  /** Schatzsuche: der Spieler hat den Suchbereich betreten – die Schatzjäger schlagen zu (einmal) */
  ambush(evId: string): WorldEvent | null {
    const ev = this.openEvent(evId, 'schatzjagd');
    if (!ev || ev.ambushed) return null;
    ev.ambushed = true;
    this.engage(evId, 300);
    return ev;
  }

  /** Schatzsuche: die Truhe ist geborgen */
  claimTreasure(evId: string): WorldEvent | null {
    const ev = this.openEvent(evId, 'schatzjagd');
    if (!ev) return null;
    this.end(ev, 'geborgen', true);
    return ev;
  }

  /**
   * Eine Schatzkarte des Spielers (Treibgut, Wrackfeld, Schmuggler) wird zur Schatzsuche auf ihrer Insel. Läuft dort schon eine, gilt sie als kartiert
   * und bekommt die volle Zeit. Höchstens drei kartierte Suchen zugleich; für sie gilt der Mindestabstand nicht (die Karte zeigt genau dorthin).
   */
  startTreasureHunt(islandId: string): WorldEvent | null {
    const s = this.state, def = WORLD_EVENT_DEFS.schatzjagd;
    const open = s.events.find((e) => e.kind === 'schatzjagd' && e.islandId === islandId && e.phase !== 'beendet');
    if (open) { open.mapped = true; open.expiresAt = Math.max(open.expiresAt, s.t + def.life[1]); return open; }
    if (s.events.filter((e) => e.kind === 'schatzjagd' && e.mapped && e.phase !== 'beendet').length >= 3) return null;
    const ev = this.createHunt(`ev${++s.seq}`, islandId, [], true, def.life[1]);
    if (!ev) return null;
    s.events.push(ev);
    s.stats.spawned++;
    this.notices.push({ type: 'eventStart', event: ev });
    return ev;
  }

  /** Der ganze Zustand als JSON-Kopie (Spielstand, Mehrspieler-Abgleich) */
  snapshot(): WorldEventState { return JSON.parse(JSON.stringify(this.state)) as WorldEventState; }
}

// ---------- Säubern (Laden, Import) ----------

const ROLES: readonly SeaShipRole[] = ['frachter', 'eskorte', 'korsar', 'galeone', 'wache', 'boss', 'schmuggler'];
const isFaction = (v: unknown): v is FactionId => typeof v === 'string' && (FACTION_IDS as readonly string[]).includes(v);
const numArr = (v: unknown, max = 4000): number[] => (Array.isArray(v) ? v.slice(0, max).map((x) => num(x, 0)) : []);

function cleanShip(raw: any): SeaShipRec | null {
  if (!raw || typeof raw !== 'object' || !ROLES.includes(raw.role)) return null;
  return {
    id: str(raw.id, 'x'), role: raw.role, classTier: Math.round(num(raw.classTier, 1, 0, 6)), hull: num(raw.hull, 1, 0, 1), sail: num(raw.sail, 1, 0, 1),
    down: raw.down === true, byPlayer: raw.byPlayer === true, boarded: raw.boarded === true, x: num(raw.x, 0), z: num(raw.z, 0), heading: num(raw.heading, 0), slot: Math.round(num(raw.slot, 0, 0, 9)),
  };
}

/** Fremde oder alte Daten säubern: unbrauchbare Einträge fallen weg, nichts Echtes bleibt beim Laden hängen (`live` = false) */
export function cleanWorldEvents(raw: unknown): WorldEventState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, any>;
  if (o.v !== 1) return null;
  const s = emptyWorldEvents(num(o.rng, 0x5eaf00d, 0, 4294967295));
  s.t = num(o.t, 0, 0, 1e9); s.seq = Math.round(num(o.seq, 0, 0, 1e9)); s.nextSpawnAt = num(o.nextSpawnAt, 0); s.nextConvoyAt = num(o.nextConvoyAt, 0); s.nextCellAt = num(o.nextCellAt, 0);
  if (o.cooldowns && typeof o.cooldowns === 'object') for (const [k, v] of Object.entries(o.cooldowns)) s.cooldowns[str(k)] = (Array.isArray(v) ? v : [v]).slice(0, 8).map((x) => num(x, 0));
  if (o.bossKills && typeof o.bossKills === 'object') for (const [k, v] of Object.entries(o.bossKills)) if ((WORLD_BOSS_IDS as readonly string[]).includes(k)) s.bossKills[k] = Math.round(num(v, 0, 0, 1e6));
  if (o.stats && typeof o.stats === 'object') for (const k of Object.keys(s.stats) as (keyof WorldEventState['stats'])[]) s.stats[k] = Math.round(num(o.stats[k], 0, 0, 1e9));
  if (Array.isArray(o.events)) for (const e of o.events.slice(0, 16)) {
    if (!e || typeof e !== 'object' || !(WORLD_EVENT_KINDS as readonly string[]).includes(e.kind)) continue;
    const kind = e.kind as WorldEventKind;
    const ev: WorldEvent = {
      id: str(e.id, 'ev'), kind, name: str(e.name, WORLD_EVENT_DEFS[kind].name), beacon: WORLD_EVENT_DEFS[kind].beacon, x: num(e.x, 0), z: num(e.z, 0), zone: num(e.zone, 0, 0, 2000),
      level: Math.round(num(e.level, 1, 1, 40)), dangerTier: clampTier(num(e.dangerTier, 1)), power: isFaction(e.power) ? e.power : null,
      createdAt: num(e.createdAt, 0), expiresAt: num(e.expiresAt, 0), phase: e.phase === 'beendet' ? 'beendet' : 'aktiv', outcome: e.outcome ?? null, byPlayer: e.byPlayer === true,
      endedAt: num(e.endedAt, -1), engagedUntil: 0, live: false, ships: Array.isArray(e.ships) ? e.ships.slice(0, 8).map(cleanShip).filter((x: SeaShipRec | null): x is SeaShipRec => !!x) : [],
    };
    if (typeof e.islandId === 'string') { ev.islandId = e.islandId; ev.islandName = str(e.islandName, e.islandId); }
    if (Array.isArray(e.route)) { ev.route = numArr(e.route); ev.leg = Math.round(num(e.leg, 1, 1, 4000)); ev.heading = num(e.heading, 0); if (typeof e.destName === 'string') ev.destName = str(e.destName); }
    if (Array.isArray(e.crates)) ev.crates = e.crates.slice(0, 16).map((c: any) => ({
      id: str(c?.id, 'k'), x: num(c?.x, ev.x), z: num(c?.z, ev.z), kind: (['planken', 'segeltuch', 'ware', 'karte'] as const).includes(c?.kind) ? c.kind : 'planken',
      good: typeof c?.good === 'string' && (GOOD_IDS as readonly string[]).includes(c.good) ? c.good : null, units: Math.round(num(c?.units, 1, 1, 99)),
      islandId: typeof c?.islandId === 'string' ? c.islandId : null, taken: c?.taken === true,
    }));
    if ((WORLD_BOSS_IDS as readonly string[]).includes(e.bossId)) { ev.bossId = e.bossId; ev.bossHp = num(e.bossHp, 1, 0, 1); }
    // Begegnungen (4.5C)
    if (typeof e.survivors === 'number') ev.survivors = Math.round(num(e.survivors, 3, 1, 12));
    if (e.rescue && typeof e.rescue === 'object' && (RESCUE_CHOICES as readonly string[]).includes(e.rescue.choice)) {
      const r = e.rescue;
      ev.rescue = { choice: r.choice };
      if (typeof r.portId === 'string') { ev.rescue.portId = str(r.portId); ev.rescue.portName = str(r.portName, r.portId); ev.rescue.deadline = num(r.deadline, ev.expiresAt); }
      if (typeof r.wreckX === 'number' && typeof r.wreckZ === 'number') { ev.rescue.wreckX = num(r.wreckX, 0); ev.rescue.wreckZ = num(r.wreckZ, 0); }
    }
    if (Array.isArray(e.offers)) ev.offers = e.offers.slice(0, 8).filter((o: any) => o && (o.kind === 'bauplan' || o.kind === 'splitter' || o.kind === 'ware')).map((o: any) => ({
      id: str(o.id, 'o'), kind: o.kind, power: isFaction(o.power) ? o.power : null, good: typeof o.good === 'string' && (GOOD_IDS as readonly string[]).includes(o.good) ? o.good : null,
      units: Math.round(num(o.units, 1, 1, 99)), price: Math.round(num(o.price, 100, 0, 1e6)), sold: o.sold === true,
    }));
    if (e.busted === true) ev.busted = true;
    if (e.site && typeof e.site === 'object') ev.site = { x: num(e.site.x, ev.x), z: num(e.site.z, ev.z), r: num(e.site.r, HUNT.searchR, 4, 200) };
    if (typeof e.ambushed === 'boolean') ev.ambushed = e.ambushed;
    if (typeof e.mapped === 'boolean') ev.mapped = e.mapped;
    // Kurs ohne Route (Floß der Schiffbrüchigen, ankernder Schmuggler)
    if (ev.heading === undefined && typeof e.heading === 'number') ev.heading = num(e.heading, 0);
    if (typeof e.siegeId === 'string') { ev.siegeId = str(e.siegeId); ev.side = e.side === 'verteidiger' ? 'verteidiger' : 'angreifer'; ev.foe = typeof e.foe === 'string' ? str(e.foe) : null; }
    if (typeof e.fromName === 'string') ev.fromName = str(e.fromName);
    if (typeof e.escortT === 'number') ev.escortT = num(e.escortT, 0, 0, 1e6);
    if (typeof e.tripT === 'number') ev.tripT = num(e.tripT, 0, 0, 1e6);
    if (e.raided === true) ev.raided = true;
    // unvollständige Einträge verwerfen (Route fehlt, Boss ohne Schiff, Suche ohne Insel, Nachschub ohne Transporter)
    if ((kind === 'schatzgaleone' || kind === 'weltboss' || kind === 'nachschub') && (!ev.route || ev.route.length < 4)) continue;
    if (kind === 'nachschub' && (!ev.siegeId || !ev.ships.some((x) => x.role === 'frachter'))) continue;
    if (kind === 'schatzjagd' && (!ev.site || !ev.islandId)) continue;
    if (kind === 'schmuggler' && (!ev.ships.length || !ev.offers?.length)) continue;
    if (kind === 'weltboss' && (!ev.bossId || !ev.ships.length)) continue;
    if (kind === 'treibgut' && !ev.crates?.length) continue;
    s.events.push(ev);
  }
  if (Array.isArray(o.convoys)) for (const c of o.convoys.slice(0, 12)) {
    if (!c || typeof c !== 'object' || !Array.isArray(c.route) || c.route.length < 4 || !(GOOD_IDS as readonly string[]).includes(c.good)) continue;
    const ships = Array.isArray(c.ships) ? c.ships.slice(0, 6).map(cleanShip).filter((x: SeaShipRec | null): x is SeaShipRec => !!x) : [];
    if (!ships.some((x: SeaShipRec) => x.role === 'frachter')) continue;
    s.convoys.push({
      id: str(c.id, 'kv'), from: str(c.from), to: str(c.to), fromName: str(c.fromName), toName: str(c.toName), power: isFaction(c.power) ? c.power : null,
      dangerTier: clampTier(num(c.dangerTier, 1)), level: Math.round(num(c.level, 2, 1, 40)), good: c.good, units: Math.round(num(c.units, 8, 1, 999)),
      route: numArr(c.route), leg: Math.round(num(c.leg, 1, 1, 4000)), x: num(c.x, 0), z: num(c.z, 0), heading: num(c.heading, 0), progress: num(c.progress, 0, 0, 1), length: num(c.length, 1, 1, 1e6),
      status: (['unterwegs', 'bedroht', 'angekommen', 'gepluendert', 'verloren'] as const).includes(c.status) ? c.status : 'unterwegs',
      threatAt: num(c.threatAt, -1, -1, 1), threatDone: c.threatDone !== false, ships,
      corsairs: Array.isArray(c.corsairs) ? c.corsairs.slice(0, 4).map(cleanShip).filter((x: SeaShipRec | null): x is SeaShipRec => !!x) : [],
      live: false, playerHitConvoy: c.playerHitConvoy === true, startedAt: num(c.startedAt, 0), endedAt: num(c.endedAt, -1),
    });
  }
  if (Array.isArray(o.cells)) for (const c of o.cells.slice(0, 12)) {
    if (!c || typeof c !== 'object' || !(c.kind in WEATHER_CELL_DEFS)) continue;
    const cell: WeatherCell = { id: str(c.id, 'c'), kind: c.kind, x: num(c.x, 0), z: num(c.z, 0), r: num(c.r, 500, 50, 3000), vx: num(c.vx, 0, -20, 20), vz: num(c.vz, 0, -20, 20), age: num(c.age, 0, 0, 1e9), life: num(c.life, 600, 1, 1e9) };
    if (typeof c.bossEventId === 'string') cell.bossEventId = c.bossEventId;
    s.cells.push(cell);
  }
  return s;
}
