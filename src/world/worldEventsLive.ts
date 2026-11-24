// Die Seewelt-Seite des lebendigen Meeres (Phase 4.3C). Der reine `WorldEventDirector` (world/worldEventDirector.ts) führt Ereignisse, Konvois und
// Wetterzellen als Daten; diese Klasse macht in Spielernähe echte Schiffe daraus (`NavalSystem.spawnEventShip`, höchstens eines je Bild), schreibt
// Lage, Rumpf und Ausgang der Schiffe in die Daten zurück, baut sie in der Ferne wieder zu Daten ab, lässt den Tiefsee-Leviathan erscheinen, birgt
// Treibgut, mischt die Wetterzelle am Spieler in das Wetter, liefert Strömung und Flaute als Fahrtfaktor und meldet Ausgänge an das Spiel (Belohnungen).
import { Color, type Camera, type Object3D, type Scene, type Vector3 } from 'three';
import { audio } from '../audio/audio';
import type { IslandDef } from '../data/regions';
import { profileOf, type GoodId } from '../data/economy';
import { factionShipLook, SHIP_CLASSES, type NavalRole, type ShipLook } from '../data/ships';
import { CONVOY, DIRECTOR, FLOTSAM, WORLD_BOSSES, WORLD_EVENT_DEFS, type WorldBossId } from '../data/seaEvents';
import { aiEvolution, type ShipEvolution } from '../data/shipEvolution';
import { capVolley, dangerOfLevel, mitigation, worldBossHull, type VolleyWindow } from '../data/balanceConfig';
import { worldBossStats } from '../naval/worldBosses';
import { FACTIONS, type FactionId } from '../data/factions';
import type { NavalSystem, EnemyShip, EventShipLink } from '../naval/naval';
import type { Ship } from '../entities/ship/ship';
import { LeviathanBoss } from '../naval/leviathanBoss';
import { CurrentField, buildCurrentLanes, currentBoost, newCurrentSample, type CurrentLane, type CurrentSample } from './oceanCurrents';
import { cellSightK, cellSpeedK, newCellSample, type CellSample } from './weatherCells';
import { WorldEventDirector, emptyWorldEvents, type DirectorIsland, type DirectorNotice, type FlotsamCrate, type Interest, type WorldEvent, type WorldEventState } from './worldEventDirector';
import type { ConvoySite, ConvoyState, DefenseReward, SeaShipRec } from './tradeConvoys';
import { WorldEventView, type OceanUniformRefs } from './worldEventView';
import type { SmokeSystem } from './smoke';
import type { ParticleSystem } from './particles';
import type { Weather } from './weather';
import { WEATHER_CELL_DEFS } from '../data/seaEvents';

/** Meldungen an das Spiel (Belohnungen, Markt, Hinweise) */
export type SeaEventNews =
  | { type: 'spawn'; event: WorldEvent; dist: number }
  | { type: 'convoyArrived'; convoy: ConvoyState }
  | { type: 'convoyThreat'; convoy: ConvoyState; dist: number }
  | { type: 'convoyDefended'; convoy: ConvoyState; reward: DefenseReward }
  | { type: 'convoyPlundered'; convoy: ConvoyState; byPlayer: boolean; boarded: boolean }
  | { type: 'eventEnd'; event: WorldEvent; firstKill: boolean; dist: number }
  | { type: 'crate'; event: WorldEvent; crate: FlotsamCrate };

/** Was die Schicht von der Seewelt braucht */
export interface LiveHost {
  scene: Scene;
  naval: NavalSystem;
  weather: Weather;
  ocean: OceanUniformRefs;
  smoke: SmokeSystem | null;
  spray: ParticleSystem;
  heightAt(x: number, z: number): number;
  /** Spielerschiff und Lage der Spielfigur (Interessenpunkt) */
  ship: Ship;
  focus(): { x: number; z: number };
  /** Der Spieler segelt (nur dann Bergen, Zonen, Leviathan-Angriffe) */
  sailing(): boolean;
  /** Shader eines neuen Schiffs parallel vorübersetzen */
  warm(o: Object3D): void;
  shake(a: number): void;
  hurt(dmg: number, x: number, z: number): void;
  /** Dunst der Szene (Farbe, Sichtweite) */
  fog(): { color: Color; far: number };
}

const SYNC_EVERY = 0.25;
const TICK = 1;

/** Aussehen eines Ereignis-Schiffs */
function lookOf(role: SeaShipRec['role'], power: FactionId | null, bossId: WorldBossId | null): { look: ShipLook; ghost: boolean } {
  if (bossId) {
    const L = WORLD_BOSSES[bossId].look!;
    const base = L.power ? factionShipLook(L.power) : factionShipLook('kurogane');
    return { look: { ...base, hull: L.hull, stripe: L.stripe, sail: L.sail, flagColor: L.flagColor, power: L.power, figurehead: bossId === 'ryujin' ? 'storm_dragon' : 'leviathan_skull', lanterns: true }, ghost: !!L.ghost };
  }
  if (role === 'korsar') return { look: { hull: '#2A1E1A', stripe: '#7A1F1A', sail: '#3A3230', flag: 'totenkopf', flagColor: '#1E1A20', figurehead: 'leviathan_skull', lanterns: true }, ghost: false };
  if (role === 'galeone') return { look: { hull: '#5C3A1F', stripe: '#D9A441', sail: '#F4E6C6', flag: 'krone', flagColor: '#C89B2E', figurehead: 'royal_griffin', lanterns: true, power: power ?? undefined }, ghost: false };
  return { look: power ? factionShipLook(power) : { hull: '#8A5A2B', stripe: '#2F6E4F', sail: '#F6EAD0', flag: 'anker', flagColor: '#2F6E4F', figurehead: 'keine', lanterns: true }, ghost: false };
}

const ROLE_NAME: Record<SeaShipRec['role'], string> = {
  frachter: 'Konvoi-Frachter', eskorte: 'Konvoi-Eskorte', korsar: 'Korsar', galeone: 'Schatz-Galeone', wache: 'Blockadeschiff', boss: 'Weltboss',
};

interface SpawnJob { owner: string; rec: SeaShipRec }
interface BuildJob { owner: string; rec: SeaShipRec; it: Generator<void, EnemyShip> }

export class WorldEventsLive {
  readonly director: WorldEventDirector;
  readonly lanes: CurrentLane[];
  readonly currents: CurrentField;
  readonly view: WorldEventView;
  readonly leviathan: LeviathanBoss;
  /** Meldungen an das Spiel */
  onNews: (n: SeaEventNews) => void = () => {};
  /** Ruht (Raid, Titelbild): kein Takt, keine Schiffe */
  paused = false;

  private readonly ships = new Map<string, EnemyShip>();
  private readonly owners = new Map<string, string>();
  private queue: SpawnJob[] = [];
  /** Schiff, das gerade in Teilschritten entsteht */
  private job: BuildJob | null = null;
  private acc = 0;
  private syncT = 0;
  private hornT = 10;
  private boltT = 6;
  private readonly interest: Interest[] = [{ x: 0, z: 0 }];
  private readonly cur: CurrentSample = newCurrentSample();
  private readonly cell: CellSample = newCellSample();
  private readonly tmpCell: CellSample = newCellSample();
  private readonly tmpCur: CurrentSample = newCurrentSample();
  private leviEngaged = false;
  private readonly leviVolley: VolleyWindow = { t: -99, sum: 0 };
  private clock = 0;

  constructor(private readonly host: LiveHost, islands: readonly IslandDef[], state: WorldEventState | null, seed: number) {
    const dIslands: DirectorIsland[] = islands.map((i) => ({
      id: i.id, name: i.name, x: i.x, z: i.z, r: i.r, ring: i.ring ?? 1, kind: i.kind, factionId: i.factionId ?? null, uncharted: !!i.uncharted,
      harbor: i.kind === 'harbor' || i.kind === 'town', blackMarket: !!profileOf(i).blackMarket,
    }));
    const sites: ConvoySite[] = islands.filter((i) => (i.kind === 'harbor' || i.kind === 'town') && !i.uncharted && (i.ring ?? 1) <= 3).map((i) => ({
      id: i.id, name: i.name, x: i.x, z: i.z, r: i.r, ring: i.ring ?? 1, dangerTier: i.dangerTier ?? 1, factionId: i.factionId ?? null, profile: profileOf(i),
    }));
    this.director = new WorldEventDirector({ islands: dIslands, sites }, state, seed);
    this.lanes = buildCurrentLanes(islands);
    this.currents = new CurrentField(this.lanes);
    this.view = new WorldEventView(host.scene, this.lanes, host.ocean, host.smoke);
    this.leviathan = new LeviathanBoss(host.scene);
    this.leviathan.group.visible = false;
    const nav = host.naval;
    nav.flowK = (s) => this.flowK(s.x, s.z, s.heading);
    nav.sightK = (x, z) => cellSightK(this.director.cellAt(x, z, this.tmpCell));
    nav.onEventHit = (e) => this.onHit(e);
  }

  /** Zustand neu setzen (Spielstand geladen): alle echten Schiffe abbauen, dann die Daten übernehmen */
  load(state: WorldEventState | null, seed: number) {
    this.releaseAll();
    this.director.state = state ?? emptyWorldEvents(seed);
  }

  /** Der ganze Zustand für den Spielstand (vorher Lage und Rumpf der echten Schiffe zurückschreiben) */
  snapshot(): WorldEventState {
    this.sync();
    const s = this.director.snapshot();
    // echte Schiffe sind im Spielstand nie „live“: nach dem Laden entstehen sie neu
    for (const e of s.events) e.live = false;
    for (const c of s.convoys) c.live = false;
    return s;
  }

  // ---------- Fahrt, Wetter ----------

  /** Fahrtfaktor an (x, z) mit Kurs `heading`: Strömung (bis +35 %) mal Flaute */
  flowK(x: number, z: number, heading: number): number {
    const k = currentBoost(heading, this.currents.sample(x, z, this.tmpCur));
    return k * cellSpeedK(this.director.cellAt(x, z, this.tmpCell));
  }

  /** Strömung und Wetterzelle am Spielerschiff (für Anzeige und Bugwelle) */
  get playerCurrent(): CurrentSample { return this.cur; }
  get playerCell(): CellSample { return this.cell; }
  /** Name der Strömung am Spieler (oder null) */
  get currentName(): string | null { return this.cur.lane >= 0 && this.cur.strength > 0.15 ? this.lanes[this.cur.lane].name : null; }

  // ---------- Takt ----------

  /** Ein Logikschritt (60 Hz) */
  update(dt: number) {
    if (this.paused) return;
    this.clock += dt;
    const h = this.host, p = h.ship, f = h.focus();
    this.interest[0].x = f.x; this.interest[0].z = f.z;
    // Strömung und Zelle am Spieler; die Zelle mischt das Wetter (lokal statt global)
    this.currents.sample(p.x, p.z, this.cur);
    this.director.cellAt(f.x, f.z, this.cell);
    h.weather.cell = this.cell.cell && this.cell.k > 0.001 ? { k: this.cell.k, params: WEATHER_CELL_DEFS[this.cell.cell.kind].params } : null;
    // Planung im Sekundentakt
    this.acc += dt;
    if (this.acc >= TICK) {
      const step = this.acc;
      this.acc = 0;
      this.director.update(step, this.interest);
      for (const n of this.director.drain()) this.news(n);
      this.zones();
    }
    this.syncT -= dt;
    if (this.syncT <= 0) { this.syncT = SYNC_EVERY; this.sync(); this.stream(); }
    this.pumpSpawn();
    this.updateLeviathan(dt);
    this.flotsam();
    this.bossAtmosphere(dt);
  }

  /** Ein Bild zeichnen */
  render(frameDt: number, camera: Camera, light: number, show: boolean) {
    this.view.root.visible = show;
    if (!show) return;
    const fog = this.host.fog();
    this.view.update(frameDt, this.director.state, camera, { heightAt: (x, z) => this.host.heightAt(x, z), light, flash: this.host.weather.flash, fogColor: fog.color, fogFar: fog.far }, true);
  }

  /** Beim Laden: alle Darstellungen einmal zeigen (Shader vorübersetzen) */
  prewarm(on: boolean, at: Vector3) {
    this.view.prewarm(on, at);
    if (on) this.leviathan.prewarm(at); else if (!this.leviathan.active) this.leviathan.group.visible = false;
  }

  // ---------- Echte Schiffe ----------

  private recOf(owner: string, recId: string): { rec: SeaShipRec | null; ev: WorldEvent | null; cv: ConvoyState | null } {
    const ev = this.director.eventById(owner) ?? null;
    if (ev) return { rec: ev.ships.find((s) => s.id === recId) ?? null, ev, cv: null };
    const cv = this.director.convoyById(owner) ?? null;
    if (cv) return { rec: cv.ships.find((s) => s.id === recId) ?? cv.corsairs.find((s) => s.id === recId) ?? null, ev: null, cv };
    return { rec: null, ev: null, cv: null };
  }

  /** Lage, Rumpf und Ausgang der echten Schiffe in die Daten zurückschreiben */
  private sync() {
    const nav = this.host.naval;
    for (const [recId, e] of this.ships) {
      const owner = this.owners.get(recId)!;
      const { rec } = this.recOf(owner, recId);
      const gone = !nav.enemies.includes(e);
      if (!rec) { if (!gone) nav.removeEventShip(e); this.ships.delete(recId); this.owners.delete(recId); continue; }
      if (gone) {
        // abgebaut von außen (Raid-Start, eigener Untergang): wieder Daten, kein Ausgang
        this.ships.delete(recId); this.owners.delete(recId);
        this.setLive(owner, false);
        continue;
      }
      const s = e.ship;
      rec.x = s.x; rec.z = s.z; rec.heading = s.heading;
      rec.hull = s.maxHull > 0 ? Math.max(0, s.hull / s.maxHull) : 0;
      rec.sail = s.sail;
      if (nav.hitByPlayer(e, 10)) rec.byPlayer = true;
      if (e.captured) rec.boarded = true;
      const dead = !s.alive || s.sinking > 0 || !!e.captured;
      // Kampfunfähig zählt als erledigt – außer Frachter und Galeone, die der Spieler noch entern kann (dann zählt die volle Ladung)
      const disabledDown = s.disabled && (rec.role !== 'frachter' && rec.role !== 'galeone' || !rec.byPlayer);
      if (!rec.down && (dead || disabledDown)) rec.down = true;
    }
  }

  private setLive(owner: string, on: boolean) {
    const ev = this.director.eventById(owner);
    if (ev) { ev.live = on; return; }
    const cv = this.director.convoyById(owner);
    if (cv) cv.live = on;
  }

  /** Nähe prüfen: in Reichweite echte Schiffe anlegen, in der Ferne wieder zu Daten machen */
  private stream() {
    const p = this.host.ship;
    const st = this.director.state;
    const near = (x: number, z: number) => Math.hypot(x - p.x, z - p.z);
    for (const c of st.convoys) {
      const d = near(c.x, c.z);
      const done = c.endedAt >= 0;
      if (!c.live && !done && d < DIRECTOR.materialize) {
        c.live = true;
        for (const r of c.ships) if (!r.down) this.queue.push({ owner: c.id, rec: r });
      }
      // Korsaren eines Überfalls, die noch nicht auf See sind
      if (c.live && !done) for (const r of c.corsairs) if (!r.down && !this.ships.has(r.id) && this.job?.rec !== r && !this.queue.some((q) => q.rec === r)) this.queue.push({ owner: c.id, rec: r });
      if (c.live && (d > DIRECTOR.dematerialize || done) && !this.anyEngaged(c.id)) this.release(c.id, done);
    }
    for (const ev of st.events) {
      if (ev.kind === 'treibgut') continue;
      const b = ev.ships[0];
      const d = near(b ? b.x : ev.x, b ? b.z : ev.z);
      const done = ev.phase === 'beendet';
      if (ev.bossId === 'leviathan') continue;
      if (!ev.live && !done && d < DIRECTOR.materialize) {
        ev.live = true;
        for (const r of ev.ships) if (!r.down) this.queue.push({ owner: ev.id, rec: r });
      }
      if (ev.live && (d > DIRECTOR.dematerialize || done) && !this.anyEngaged(ev.id)) this.release(ev.id, done);
    }
  }

  /** Kämpft gerade ein Schiff dieses Besitzers mit dem Spieler (dann wird nichts abgebaut, auch nicht in der Ferne)? */
  private anyEngaged(owner: string): boolean {
    const p = this.host.ship;
    for (const [recId, e] of this.ships) {
      if (this.owners.get(recId) !== owner) continue;
      if (e.state === 'engage' && e.provoked && Math.hypot(e.ship.x - p.x, e.ship.z - p.z) < 1200) return true;
    }
    return false;
  }

  /** Echte Schiffe eines Besitzers abbauen (ihre Daten bleiben); `ended` = das Ereignis ist vorbei: auch erledigte Wracks fort */
  private release(owner: string, ended: boolean) {
    const nav = this.host.naval;
    this.sync();
    for (const [recId, e] of [...this.ships]) {
      if (this.owners.get(recId) !== owner) continue;
      // ein kampfunfähiges Schiff, das man zurücklässt, ist erledigt (sonst käme es beim nächsten Mal mit 1 Rumpfpunkt wieder)
      const { rec } = this.recOf(owner, recId);
      if (rec && e.ship.disabled) rec.down = true;
      // brennende oder sinkende Wracks bleiben stehen, bis sie das Seesystem selbst abräumt (kein Verschwinden vor den Augen); sie gehören dann
      // keinem Ereignis mehr (Kennung leer), Beute und Lohn hat das Ereignis schon vergeben
      if (!ended || !(e.ship.disabled || e.ship.sinking > 0)) nav.removeEventShip(e);
      else if (e.ev) e.ev.owner = '';
      this.ships.delete(recId); this.owners.delete(recId);
    }
    this.queue = this.queue.filter((q) => q.owner !== owner);
    if (this.job?.owner === owner) { this.job.it.return(undefined as unknown as EnemyShip); this.job = null; }
    this.setLive(owner, false);
  }

  /** Alle echten Schiffe abbauen (Laden, Raid) */
  releaseAll() {
    const nav = this.host.naval;
    this.sync();
    for (const e of this.ships.values()) if (nav.enemies.includes(e)) nav.removeEventShip(e);
    this.ships.clear(); this.owners.clear(); this.queue = [];
    if (this.job) { this.job.it.return(undefined as unknown as EnemyShip); this.job = null; }
    for (const e of this.director.state.events) e.live = false;
    for (const c of this.director.state.convoys) c.live = false;
    if (this.leviathan.active) this.leviathan.deactivate();
    nav.bossTarget = null;
  }

  /**
   * Neue Ereignis-Schiffe entstehen in Teilschritten (`NavalSystem.spawnEventShipSteps` → `buildShipSteps`): je Logikschritt höchstens `BUILD_MS`
   * Millisekunden Schiffsbau, immer nur ein Schiff zugleich. Ein Schiffsmodell kostet am Stück 50 bis 100 ms; verteilt bleibt jedes Bild flüssig.
   * Ist das Schiff inzwischen erledigt oder sein Ereignis abgebaut, wird der halbe Bau verworfen (er hing noch nicht in der Szene).
   */
  private pumpSpawn() {
    if (!this.job) {
      const next = this.queue.shift();
      if (!next) return;
      this.job = this.startJob(next);
      if (!this.job) return;
    }
    const job = this.job;
    if (job.rec.down || !this.recOf(job.owner, job.rec.id).rec) { job.it.return(undefined as unknown as EnemyShip); this.job = null; return; }
    const t0 = performance.now();
    for (;;) {
      const r = job.it.next();
      if (r.done) { this.adopt(r.value, job); this.job = null; return; }
      if (performance.now() - t0 >= WorldEventsLive.BUILD_MS) return;
    }
  }

  /** Zeitbudget je Logikschritt für den Bau neuer Ereignis-Schiffe (ms) */
  static readonly BUILD_MS = 3;

  /** Bau eines Ereignis-Schiffs vorbereiten: Aussehen, Ausbau, Rolle, Verbindung zum Ereignis (Formation, Route, Zone, Beute des Korsaren) */
  private startJob(job: SpawnJob): BuildJob | null {
    const { rec, ev, cv } = this.recOf(job.owner, job.rec.id);
    if (!rec || rec.down || this.ships.has(rec.id)) return null;
    const nav = this.host.naval;
    const power = ev ? ev.power : cv ? cv.power : null;
    const level = ev ? ev.level : cv!.level;
    const bossId = ev?.bossId ?? null;
    const { look, ghost } = lookOf(rec.role, rec.role === 'korsar' ? null : bossId ? WORLD_BOSSES[bossId].look?.power ?? null : power, bossId);
    const danger = dangerOfLevel(level);
    const evo: ShipEvolution = bossId ? { ...WORLD_BOSSES[bossId].evo }
      : rec.role === 'galeone' ? { hullTier: danger >= 3 ? 5 : 4, sailTier: 4, cannonTier: danger >= 3 ? 4 : 3 }
      : rec.role === 'frachter' ? aiEvolution('haendler', danger)
      : rec.role === 'korsar' ? aiEvolution('jaeger', danger)
      : rec.role === 'wache' ? aiEvolution('grenze', danger)
      : aiEvolution('eskorte', danger);
    const role: NavalRole = rec.role === 'frachter' || rec.role === 'galeone' ? 'haendler' : rec.role === 'korsar' ? 'jaeger' : bossId ? 'legende' : 'patrouille';
    const lead = ev ? ev.ships.find((s) => s.slot === 0) : cv ? cv.ships.find((s) => s.role === 'frachter') : undefined;
    const leadShip = lead && lead !== rec ? this.ships.get(lead.id) : undefined;
    const fr = cv?.ships.find((s) => s.role === 'frachter');
    const zoneR = ev ? (ev.kind === 'blockade' ? WORLD_EVENT_DEFS.blockade.zone : ev.kind === 'weltboss' ? WORLD_EVENT_DEFS.weltboss.zone : 0) : 0;
    const link: EventShipLink = {
      owner: job.owner, recId: rec.id, role: rec.role,
      leadId: leadShip ? leadShip.ship.entityId : null,
      route: ev?.route ?? cv?.route ?? null, leg: ev?.leg ?? cv?.leg ?? 1,
      zone: zoneR > 0 ? { x: ev!.kind === 'blockade' ? ev!.x : rec.x, z: ev!.kind === 'blockade' ? ev!.z : rec.z, r: zoneR } : null,
      preyId: rec.role === 'korsar' && fr ? this.ships.get(fr.id)?.ship.entityId ?? null : null,
      bossId, slot: rec.slot,
    };
    const bd = bossId ? WORLD_BOSSES[bossId] : null;
    const name = bd ? bd.name : rec.role === 'galeone' ? 'Schatz-Galeone' : cv && rec.role !== 'korsar' ? `${ROLE_NAME[rec.role]}${cv.power ? ` (${FACTIONS[cv.power].name})` : ''}` : ROLE_NAME[rec.role];
    const it = nav.spawnEventShipSteps({
      x: rec.x, z: rec.z, heading: rec.heading, classTier: rec.classTier, level, look, role, power: rec.role === 'korsar' ? undefined : (bd?.look?.power ?? power ?? undefined),
      name, evo, hullFrac: rec.hull, sailFrac: rec.sail, link, ghost,
      maxHull: bd ? worldBossHull(SHIP_CLASSES[bd.classTier].hp, bd.level, bd.hullK) : undefined,
    });
    return { owner: job.owner, rec, it };
  }

  /** Fertig gebautes Ereignis-Schiff übernehmen: Lage aus den Daten (es kann sich während des Baus bewegt haben), Feindschaft, Formation */
  private adopt(e: EnemyShip, job: BuildJob) {
    const { rec, ev, cv } = this.recOf(job.owner, job.rec.id);
    const r = rec ?? job.rec;
    e.ship.x = r.x; e.ship.z = r.z; e.ship.heading = r.heading;
    e.ship.prev = { x: r.x, z: r.z, heading: r.heading };
    // Konvoi- und Ereignis-Schiffe, die schon einmal vom Spieler angegriffen wurden, bleiben feindlich
    if ((cv?.playerHitConvoy && r.role !== 'korsar') || (ev && ev.engagedUntil > this.director.state.t && r.byPlayer)) e.provoked = true;
    this.ships.set(r.id, e);
    this.owners.set(r.id, job.owner);
    this.host.warm(e.ship.model.group);
    // Formationsführer nachtragen (er kann nach seinen Begleitern entstanden sein)
    if (r.slot === 0) for (const [rid, o] of this.ships) if (this.owners.get(rid) === job.owner && o.ev && o !== e && o.ev.role !== 'korsar') o.ev.leadId = e.ship.entityId;
    if (r.role === 'frachter') for (const [rid, o] of this.ships) if (this.owners.get(rid) === job.owner && o.ev?.role === 'korsar') o.ev.preyId = e.ship.entityId;
  }

  /** Der Spieler hat ein Ereignis-Schiff getroffen: die ganze Gruppe wehrt sich (Opt-In), das Ereignis läuft nicht ab */
  private onHit(e: EnemyShip) {
    const L = e.ev;
    if (!L) return;
    const cv = this.director.convoyById(L.owner);
    if (cv && L.role !== 'korsar') cv.playerHitConvoy = true;
    this.director.engage(L.owner);
    for (const [rid, o] of this.ships) {
      if (this.owners.get(rid) !== L.owner || !o.ev) continue;
      if (L.role === 'korsar' ? o.ev.role === 'korsar' : o.ev.role !== 'korsar') o.provoked = true;
    }
  }

  /** Zonen: wer in eine Blockade oder in die Reichweite eines Weltbosses fährt, hält das Ereignis im Gefecht (es läuft nicht ab) */
  private zones() {
    const p = this.host.ship;
    for (const ev of this.director.state.events) {
      if (ev.phase === 'beendet' || !ev.zone) continue;
      const b = ev.kind === 'weltboss' ? ev.ships[0] : null;
      if (Math.hypot(p.x - (b ? b.x : ev.x), p.z - (b ? b.z : ev.z)) < ev.zone) this.director.engage(ev.id, 30);
    }
  }

  // ---------- Tiefsee-Leviathan ----------

  private updateLeviathan(dt: number) {
    const ev = this.director.state.events.find((e) => e.bossId === 'leviathan' && e.phase !== 'beendet') ?? null;
    const L = this.leviathan, h = this.host, p = h.ship;
    const nav = h.naval;
    if (!ev) {
      if (L.active) { L.deactivate(); nav.bossTarget = null; }
      return;
    }
    const d = Math.hypot(ev.x - p.x, ev.z - p.z);
    if (!L.active && d < DIRECTOR.materialize) {
      const bd = WORLD_BOSSES.leviathan;
      L.activate(ev.x, ev.z, worldBossHull(SHIP_CLASSES[bd.classTier].hp, bd.level, bd.hullK), ev.bossHp ?? 1, bd.level);
      const levArmor = worldBossStats('leviathan').armor;
      this.leviEngaged = false;
      ev.live = true;
      nav.bossTarget = {
        hitTest: (q) => L.hitTest(q),
        damage: (n, pen) => { const dealt = L.damage(n * (1 - mitigation(levArmor, pen))); this.leviEngaged = true; this.director.engage(ev.id); this.director.setBossHp(ev.id, L.frac); return dealt; },
      };
    }
    if (!L.active) return;
    if (d > DIRECTOR.dematerialize && !this.leviEngaged) { L.deactivate(); nav.bossTarget = null; ev.live = false; return; }
    const r = ev.route!, k = Math.min(ev.leg ?? 1, r.length / 2 - 1);
    const goal = { x: r[k * 2], z: r[k * 2 + 1] };
    if (Math.hypot(goal.x - L.x, goal.z - L.z) < 60 && (ev.leg ?? 1) < r.length / 2 - 1) ev.leg = (ev.leg ?? 1) + 1;
    const engage = h.sailing() && (this.leviEngaged || Math.hypot(p.x - L.x, p.z - L.z) < ev.zone);
    L.update(dt, (x, z) => h.heightAt(x, z), p.alive ? p : null, goal, engage, {
      shake: (a) => h.shake(a),
      splash: (x, z, big) => h.spray.emit(big ? 70 : 30, x, 1, z, { speed: big ? 7 : 4, up: big ? 14 : 8, life: 2, color: SPLASH, spread: big ? 10 : 4 }),
      hitShip: (dmg, px, pz) => {
        if (!p.alive) return;
        const capped = capVolley(this.leviVolley, this.clock, dmg, p.maxHull);
        const dealt = p.damage(capped, 'kugel', null);
        p.shoveX += px; p.shoveZ += pz;
        h.hurt(dealt, p.x, p.z);
      },
      roar: () => audio.play('roar', 1, { x: L.x, z: L.z }),
    });
    ev.x = L.x; ev.z = L.z;
    const b = ev.ships[0];
    if (b) { b.x = L.x; b.z = L.z; b.byPlayer = true; }
    this.director.setBossHp(ev.id, L.frac);
    if (!L.alive && this.leviEngaged) this.leviEngaged = false;
  }

  // ---------- Treibgut ----------

  private flotsam() {
    const h = this.host, p = h.ship;
    if (!h.sailing() || !p.alive) return;
    for (const ev of this.director.state.events) {
      if (ev.kind !== 'treibgut' || ev.phase === 'beendet' || Math.hypot(ev.x - p.x, ev.z - p.z) > FLOTSAM.spread + 80) continue;
      for (const c of ev.crates ?? []) {
        if (c.taken || Math.hypot(c.x - p.x, c.z - p.z) > p.cls.W * 0.5 + FLOTSAM.pickup) continue;
        const got = this.director.collectCrate(ev.id, c.id);
        if (got) { this.onNews({ type: 'crate', event: ev, crate: got }); audio.play('coin', 0.8, { x: c.x, z: c.z }); }
      }
    }
    // die Kisten treiben leicht zum Schiff, wenn es nah ist (wie Beutekisten)
    for (const ev of this.director.state.events) {
      if (ev.kind !== 'treibgut' || ev.phase === 'beendet') continue;
      for (const c of ev.crates ?? []) {
        if (c.taken) continue;
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
        if (d > 1 && d < p.cls.L * 1.4) { const k = Math.min(d, 0.25) / d; c.x += dx * k; c.z += dz * k; }
      }
    }
  }

  // ---------- Weltbosse: Blitze und Nebelhorn ----------

  private bossAtmosphere(dt: number) {
    const p = this.host.ship;
    this.hornT -= dt; this.boltT -= dt;
    let nearest: WorldEvent | null = null, nd = Infinity;
    for (const ev of this.director.state.events) {
      if (ev.kind !== 'weltboss' || ev.phase === 'beendet') continue;
      const b = ev.ships[0];
      const d = Math.hypot((b?.x ?? ev.x) - p.x, (b?.z ?? ev.z) - p.z);
      if (d < nd) { nd = d; nearest = ev; }
    }
    if (!nearest) return;
    const b = nearest.ships[0];
    const bx = b?.x ?? nearest.x, bz = b?.z ?? nearest.z;
    if (this.boltT <= 0 && nd < 3800) {
      this.boltT = 5 + Math.random() * 5;
      const f = this.host.focus();
      this.host.weather.strikeAt({ x: f.x, y: 0, z: f.z } as Vector3, bx + (Math.random() - 0.5) * 220, bz + (Math.random() - 0.5) * 220);
    }
    if (this.hornT <= 0 && nd < 3400) {
      this.hornT = 26 + Math.random() * 8;
      audio.play('foghorn', Math.max(0.25, 1 - nd / 3400), { x: bx, z: bz });
    }
  }

  // ---------- Meldungen ----------

  private news(n: DirectorNotice) {
    const p = this.host.ship;
    switch (n.type) {
      case 'eventStart': this.onNews({ type: 'spawn', event: n.event, dist: Math.hypot(n.event.x - p.x, n.event.z - p.z) }); break;
      case 'eventEnd': {
        const ev = n.event;
        const first = !!ev.bossId && (this.director.state.bossKills[ev.bossId] ?? 0) === 1 && ev.outcome === 'gesiegt' && ev.byPlayer;
        this.onNews({ type: 'eventEnd', event: ev, firstKill: first, dist: Math.hypot(ev.x - p.x, ev.z - p.z) });
        break;
      }
      case 'convoyArrived': this.onNews({ type: 'convoyArrived', convoy: n.convoy }); break;
      case 'convoyThreat': this.onNews({ type: 'convoyThreat', convoy: n.convoy, dist: Math.hypot(n.convoy.x - p.x, n.convoy.z - p.z) }); break;
      case 'convoyDefended': this.onNews({ type: 'convoyDefended', convoy: n.convoy, reward: n.reward }); break;
      case 'convoyPlundered': this.onNews({ type: 'convoyPlundered', convoy: n.convoy, byPlayer: n.byPlayer, boarded: n.boarded }); break;
    }
  }

  // ---------- Abfragen für Karte, Kompass, Hafen ----------

  /** Laufende Ereignisse für Kompass und Karten */
  marks(): { id: string; kind: WorldEvent['kind']; x: number; z: number; name: string; bossId?: WorldBossId; islandName?: string }[] {
    const out = [];
    for (const ev of this.director.state.events) {
      if (ev.phase === 'beendet') continue;
      const b = ev.kind === 'weltboss' || ev.kind === 'schatzgaleone' ? ev.ships.find((s) => s.slot === 0) : null;
      out.push({ id: ev.id, kind: ev.kind, x: b ? b.x : ev.x, z: b ? b.z : ev.z, name: ev.kind === 'blockade' ? `Blockade vor ${ev.islandName}` : ev.name, bossId: ev.bossId, islandName: ev.islandName });
    }
    return out;
  }

  /** Laufende Konvois für Kompass und Karten (Frachter) */
  convoyMarks(): { id: string; x: number; z: number; name: string; threatened: boolean }[] {
    const out = [];
    for (const c of this.director.state.convoys) {
      if (c.endedAt >= 0) continue;
      out.push({ id: c.id, x: c.x, z: c.z, name: `Konvoi ${c.fromName} → ${c.toName}`, threatened: c.status === 'bedroht' });
    }
    return out;
  }

  /** Ware eines Konvois, der gerade den Spieler-Hafen beliefert (für den Kontor-Hinweis) */
  deliveriesTo(islandId: string): { good: GoodId; units: number; from: string }[] {
    return this.director.state.convoys.filter((c) => c.to === islandId && c.endedAt < 0).map((c) => ({ good: c.good, units: c.units, from: c.fromName }));
  }

  /** Belastete Gesamtzahl je Zustand (Prüfungen) */
  counts() { return { events: this.director.active().length, convoys: this.director.state.convoys.filter((c) => c.endedAt < 0).length, ships: this.ships.size, queue: this.queue.length + (this.job ? 1 : 0), cells: this.director.state.cells.length }; }

  /** Stufe 0 … 1 der Strömung, wenn das Spielerschiff mitfährt (für die Bugwelle) */
  playerBoost(): number { return currentBoost(this.host.ship.heading, this.cur) - 1; }

  /** Konstanten für die Anzeige */
  static readonly arrive = CONVOY.arrive;
}

const SPLASH = new Color(0.9, 0.97, 1);
