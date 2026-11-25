// Seewelt-Seite des Mächte-Ökosystems (Phase 4.5A): macht aus den Armadas der FactionWarEngine in Spielernähe echte Schiffe, aus ihren Großschlachten
// echte Seeschlachten und aus Belagerungen echte Truppen an Land – und schreibt Lage, Rumpf, Untergang und Verluste zurück. Entschieden wird in der
// Engine (world/factionWarEngine.ts); hier wird nur dargestellt und gemeldet.
//
// Übergang: ab `LIVE_IN` (1 500 m) entstehen die Schiffe in Teilschritten (höchstens `BUILD_MS` je Logikschritt, ein Schiff zugleich, wie die
// Ereignis-Schiffe des lebendigen Meeres), jenseits von `LIVE_OUT` (2 300 m) werden sie wieder zu Daten. Eine Großschlacht erscheint immer mit beiden
// Seiten; erst wenn beide Armadas echt fahren, rechnet die Seewelt (die Engine wartet so lange). Wie viele Schiffe je Armada echt fahren, bestimmt die
// Grafikstufe (`NavalSystem.detail`); die übrigen bleiben Reserve in den Daten und rücken nach, wenn eines sinkt.
import { BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, TorusGeometry, type BufferGeometry, type Object3D, type Scene } from 'three';
import { factionShipLook, SHIP_CLASSES } from '../data/ships';
import { ROLE_LABEL, WAR } from '../data/nations';
import { seaLevelAt } from '../data/regions';
import { FACTIONS, type FactionId } from '../data/factions';
import { disposeObject, markShared } from '../render/dispose';
import type { EnemyShip, EventShipLink, NavalSystem, SpawnYield } from '../naval/naval';
import type { Ship } from '../entities/ship/ship';
import type { ShipEvolution, EvoTier } from '../data/shipEvolution';
import { TroopSquad, type TroopFoe, type TroopWorld } from '../entities/troops/squad';
import { TroopRenderer, type TroopView } from '../entities/troops/troopRender';
import { hordePalette } from '../raid/horde';
import type { NavGrid } from '../ai/navGrid';
import type { WalkIsland } from './islandGround';
import { shipHp, type ArmadaShip, type ArmadaState, type FactionWarEngine, type SiegePoint, type SiegeSide } from './factionWarEngine';

const NO_PTS: readonly { x: number; y: number; z: number }[] = [];
const LIVE_IN = 1500;
const LIVE_OUT = 2300;
const SYNC_EVERY = 0.25;
/** Truppen an Land erscheinen unter diesem Abstand zur Insel (und nur, wenn sie als ACTIVE_HIGH steht) */
const TROOPS_IN = 650;
const TROOPS_OUT = 950;

/** Was die Live-Schicht von der Seewelt braucht */
export interface WarLiveHost {
  scene: Scene;
  naval: NavalSystem;
  ship: Ship;
  /** Lage der Spielfigur bzw. des Schiffs (Interessenpunkt) */
  focus(): { x: number; z: number };
  /** Shader eines neuen Schiffs parallel vorübersetzen */
  warm(o: Object3D): void;
  /** Begehbare Insel samt Begehbarkeits-Netz, wenn sie gerade als ACTIVE_HIGH steht (sonst null) */
  islandWalk(id: string): { walk: WalkIsland; nav: NavGrid | null } | null;
  /** Grundlage der Truppenwelt (Boden, Salvenblitze, Verlustzahlen) */
  troopBase(): TroopWorld;
  /** Kennung der Spielfigur (Besitzer der Trupps, nie verbündet mit dem Spieler) */
  playerId: string;
  // ---- Landkampf an den Kontrollpunkten (4.5B) ----
  /** Die Spielfigur als Ziel der Trupps (stabiles Objekt, Werte werden frisch gelesen) */
  playerFoe(): TroopFoe;
  /** Offiziere und Trupps des Spielers an Land (`combat.allies`) */
  crew(): readonly TroopFoe[];
  /** Treffer eines feindlichen Trupps auf Spielfigur oder Crew (abgeschwächt wie im Raid) */
  strike(t: TroopFoe, dmg: number, dirX: number, dirZ: number, heavy: boolean): void;
  /** Steht die Spielfigur an Land (nicht an Deck, nicht auf See)? */
  onFoot(): boolean;
  /** Verbände, die die Spielfigur treffen kann (`combat.mass`); null = keine (wieder freigeben) */
  setMass(list: TroopSquad[] | null): void;
}

interface BuildJob { armadaId: string; shipId: string; it: Generator<SpawnYield, EnemyShip> }

/** Netze der Kontrollpunkt-Markierungen (einmal angelegt, geteilt, nie freigegeben) */
let MARK_GEO: { pole: BufferGeometry; flag: BufferGeometry; ring: BufferGeometry } | null = null;
function markGeo() {
  if (!MARK_GEO) {
    MARK_GEO = {
      pole: markShared(new CylinderGeometry(0.09, 0.13, 6.6, 6).translate(0, 3.3, 0)),
      flag: markShared(new BoxGeometry(2.4, 1.5, 0.06).translate(1.25, 5.7, 0)),
      ring: markShared(new TorusGeometry(WAR.pointRadius, 0.16, 4, 56).rotateX(Math.PI / 2)),
    };
  }
  return MARK_GEO;
}
const NEUTRAL = new Color('#E8E2D4');
const POLE = new Color('#3A2A1C');

/** Was die Belagerungstruppen von der Live-Schicht brauchen */
interface SiegeCtx { engine: FactionWarEngine; host: WarLiveHost }

/**
 * Echte Truppen einer Belagerung: Landungskorps gegen Garnison, beide als Massentrupps (ein InstancedMesh je Typ und Seite), dazu die Kontrollpunkte
 * (4.5B) mit Fahne und Fangring. Die Angreifer rücken auf die Punkte vor, die Verteidiger halten sie; wer im Fangradius die Übermacht hat, schiebt den
 * Punkt zu sich (`FactionWarEngine.controlStep`). Ergreift der Spieler Partei, werden die Trupps der Gegenseite zu Zielen seiner Hiebe, Geschosse,
 * Fähigkeiten und Trupps (`combat.mass`) und greifen ihrerseits Spielfigur und Crew an.
 */
class SiegeTroops {
  readonly sides: TroopSquad[][] = [[], []];
  private readonly views: TroopView[][] = [[], []];
  private readonly renderers: TroopRenderer[];
  private readonly worlds: TroopWorld[];
  private readonly soft: { x: number; z: number; radius: number; owner?: object }[] = [];
  readonly heads0: [number, number] = [0, 0];
  readonly units0: [number, number];
  private disposed = false;
  /** Kontrollpunkte auf begehbarem Boden (Reihenfolge wie in der Engine) */
  readonly pts: { x: number; y: number; z: number }[] = [];
  private readonly marks: { group: Group; flag: MeshBasicMaterial; ring: MeshBasicMaterial }[] = [];
  private readonly colA: Color;
  private readonly colD: Color;
  /** Punkt je Trupp (Angreifer rücken vor, Verteidiger halten) */
  private readonly assign: number[][] = [[], []];
  private readonly foeBuf: TroopFoe[][] = [[], []];
  private readonly att = new Float32Array(4);
  private readonly def = new Float32Array(4);
  private readonly credited = new Set<TroopSquad>();
  /** Seite des Spielers (null: schaut zu) und die ihm feindliche Seite (−1: keine) */
  side: SiegeSide | null = null;
  private hostile = -1;

  constructor(private readonly ctx: SiegeCtx, scene: Scene, readonly siegeId: string, attacker: FactionId, defender: FactionId, base: TroopWorld, nav: NavGrid | null, isl: WalkIsland,
    from: { x: number; z: number }, troops: number, garrison: number, level: number, ownerId: string, points: readonly SiegePoint[]) {
    this.renderers = [new TroopRenderer(scene, true, { palette: hordePalette(attacker), cap: 60 }), new TroopRenderer(scene, true, { palette: hordePalette(defender), cap: 60 })];
    this.units0 = [troops, garrison];
    this.colA = new Color(FACTIONS[attacker].color);
    this.colD = new Color(FACTIONS[defender].color);
    const host = ctx.host;
    this.worlds = [0, 1].map((side) => ({
      ...base,
      enemies: () => this.foes(side as 0 | 1),
      hit: (e: TroopFoe, dmg: number, dx: number, dz: number, _c: string, heavy: boolean) => {
        void _c;
        if (this.sides[1 - side].includes(e as TroopSquad)) (e as TroopSquad).receive(dmg, dx, dz);
        else if (this.hostile === side) host.strike(e, dmg, dx, dz, heavy);
      },
      nav: () => nav,
    }));
    // Kontrollpunkte: auf begehbaren Boden rücken, Fahne und Fangring aufstellen
    const g = markGeo();
    const snap = { x: 0, z: 0 };
    for (const p of points) {
      let x = p.x, z = p.z;
      if (nav) { nav.snap(x, z, 1.4, snap); x = snap.x; z = snap.z; }
      let y = base.ground.height(x, z);
      if (!Number.isFinite(y)) y = 1;
      this.pts.push({ x, y, z });
      const grp = new Group();
      grp.position.set(x, y, z);
      const pole = new Mesh(g.pole, new MeshBasicMaterial({ color: POLE }));
      const flagMat = new MeshBasicMaterial({ color: NEUTRAL.clone() });
      const flag = new Mesh(g.flag, flagMat);
      const ringMat = new MeshBasicMaterial({ color: NEUTRAL.clone() });
      const ring = new Mesh(g.ring, ringMat);
      // der Ring liegt knapp über dem höchsten Bodenpunkt seines Umfangs (kein Versinken im Hang)
      let top = y;
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const h = base.ground.height(x + Math.sin(a) * WAR.pointRadius, z + Math.cos(a) * WAR.pointRadius); if (Number.isFinite(h) && h > top) top = h; }
      ring.position.y = Math.min(top - y, 2.5) + 0.12;
      grp.add(pole, flag, ring);
      scene.add(grp);
      this.marks.push({ group: grp, flag: flagMat, ring: ringMat });
    }
    const npts = Math.max(1, this.pts.length);
    // Landeplatz: Strand auf der Seite der Flotte, Verteidigung an den Kontrollpunkten
    const ang = Math.atan2(from.x - isl.x, from.z - isl.z);
    this.mk = { from, ang, beachR: isl.r * 0.82, holdR: isl.r * 0.42, level, ownerId, base, nav, isl };
    // sichtbar ist nur die Front (höchstens sechs Trupps je Seite zu je vier Köpfen); der Rest landet als Verstärkung nach (`control`)
    const attackers = Math.max(2, Math.min(6, Math.round(troops / 22)));
    const defenders = Math.max(1, Math.min(6, Math.round(garrison / 22)));
    for (let k = 0; k < attackers; k++) {
      // nach der Landung rückt der Trupp auf seinen Kontrollpunkt vor (der nächste Punkt, den die Angreifer noch nicht halten: `control`)
      this.assign[0].push(k % npts);
      this.sides[0].push(this.makeSquad(0, k, attackers, 1 + k * 1.4));
    }
    for (let k = 0; k < defenders; k++) {
      // die Garnison verteilt sich auf die Kontrollpunkte
      this.assign[1].push(k % npts);
      this.sides[1].push(this.makeSquad(1, k, defenders, 0));
    }
    for (const side of [0, 1] as const) {
      let h = 0;
      for (const q of this.sides[side]) { h += q.heads; this.views[side].push(this.viewOf(q)); }
      this.heads0[side] = h;
    }
  }

  /** Zum Aufstellen neuer Trupps (Verstärkung) */
  private readonly mk: { from: { x: number; z: number }; ang: number; beachR: number; holdR: number; level: number; ownerId: string; base: TroopWorld; nav: NavGrid | null; isl: WalkIsland };
  /** Je Seite insgesamt aufgestellte Köpfe (Verluste = aufgestellt − lebend) und Wartezeit bis zur nächsten Verstärkung */
  private readonly spawned: [number, number] = [0, 0];
  private readonly reinforceT: [number, number] = [WAR.reinforceEvery, WAR.reinforceEvery];
  private readonly spot = { x: 0, z: 0 };

  private placeAt(r: number, off: number): { x: number; z: number } {
    const m = this.mk, a = m.ang + off;
    let x = m.isl.x + Math.sin(a) * r, z = m.isl.z + Math.cos(a) * r;
    if (m.nav) { m.nav.snap(x, z, 1.2, this.spot); x = this.spot.x; z = this.spot.z; }
    return { x, z };
  }

  private viewOf(q: TroopSquad): TroopView {
    return { typ: q.typ, heads: q.heads, x: q.x, y: q.y, z: q.z, yaw: q.yaw, move: 0, pulse: 0, seed: q.seed, compact: 1 };
  }

  /** Trupp aufstellen: Angreifer setzen im Beiboot von der Flotte über, Verteidiger kommen aus dem Ort an ihren Kontrollpunkt */
  private makeSquad(side: 0 | 1, k: number, n: number, delay: number): TroopSquad {
    const m = this.mk, npts = Math.max(1, this.pts.length);
    const q = new TroopSquad(side === 0 ? (k % 2 ? 'musketier' : 'schwert') : (k % 2 ? 'schwert' : 'musketier'), 4, m.level, m.ownerId);
    q.hostile = true;
    if (side === 0) {
      q.aggroR = 70;
      const p = this.placeAt(m.beachR, (k - (n - 1) / 2) * 0.12);
      q.place(p.x, p.z, m.ang + Math.PI, m.base.ground);
      q.startLanding({ fromX: m.from.x + Math.sin(m.ang) * 10, fromZ: m.from.z + Math.cos(m.ang) * 10, fromY: 0.6, delay, total: 9, boat: true });
    } else {
      q.aggroR = 55;
      const pt = this.pts[k % npts];
      const off = Math.floor(k / npts) * 5 - 2.5;
      const p = pt ? { x: pt.x + off, z: pt.z - off } : this.placeAt(m.holdR, (k - (n - 1) / 2) * 0.22);
      q.place(p.x, p.z, m.ang, m.base.ground);
      q.holdX = p.x; q.holdZ = p.z;
    }
    this.spawned[side] += q.heads;
    return q;
  }

  /** Köpfe einer Seite (lebende Trupps, auch noch im Boot) */
  heads(side: 0 | 1): number {
    let h = 0;
    for (const q of this.sides[side]) h += q.heads;
    return h;
  }

  /** Schon an die Engine gemeldete gefallene Köpfe je Seite */
  private readonly reported: [number, number] = [0, 0];
  private readonly losses: [number, number] = [0, 0];

  /**
   * Neue Verluste seit der letzten Meldung (Soldaten der Engine): jeder gefallene Kopf zählt `WAR.troopsPerHead` (die Front ist nur ein Ausschnitt des
   * Heeres). Als Differenz gemeldet, damit Änderungen von außen (Lieferung, versenkte Transporter) erhalten bleiben. Liefert ein festes Feld.
   */
  takeLosses(): readonly [number, number] {
    for (const side of [0, 1] as const) {
      const lost = this.spawned[side] - this.heads(side);
      this.losses[side] = Math.max(0, lost - this.reported[side]) * WAR.troopsPerHead;
      this.reported[side] = Math.max(this.reported[side], lost);
    }
    return this.losses;
  }

  /**
   * Verstärkung: ist ein Trupp gefallen und hat die Seite in der Engine noch Reserve (Soldaten jenseits der Front), landet höchstens alle
   * `WAR.reinforceEvery` s ein neuer Trupp an seiner Stelle (Angreifer im Beiboot, Verteidiger aus dem Ort). Felder bleiben gleich lang.
   */
  private reinforce(dt: number, troops: number, garrison: number) {
    for (const side of [0, 1] as const) {
      this.reinforceT[side] -= dt;
      if (this.reinforceT[side] > 0) continue;
      const reserve = (side === 0 ? troops : garrison) - this.heads(side) * WAR.troopsPerHead;
      if (reserve < 4 * WAR.troopsPerHead) continue;
      const list = this.sides[side];
      for (let k = 0; k < list.length; k++) {
        const old = list[k];
        if (old.heads > 0 || old.deadT < 2.5) continue;
        const q = this.makeSquad(side, k, list.length, 0.3);
        list[k] = q;
        this.views[side][k] = this.viewOf(q);
        this.credited.delete(old);
        this.reinforceT[side] = WAR.reinforceEvery;
        break;
      }
    }
  }

  update(dt: number, t: number, ref: { x: number; z: number; yaw: number }) {
    if (this.disposed) return;
    const soft = this.soft;
    soft.length = 0;
    for (const list of this.sides) for (const q of list) if (q.alive) soft.push({ x: q.x, z: q.z, radius: q.sepRadius(), owner: q });
    for (const side of [0, 1] as const) {
      const list = this.sides[side], views = this.views[side];
      for (let i = 0; i < list.length; i++) {
        const q = list[i], v = views[i];
        q.update(dt, ref, this.worlds[side], soft);
        for (const b of soft) if (b.owner === q) { b.x = q.x; b.z = q.z; }
        v.heads = q.heads; v.typ = q.typ; v.seed = q.seed; v.move = q.move; v.pulse = q.pulse;
        const lp = q.landingPose();
        if (lp) { v.x = lp.x; v.y = lp.y; v.z = lp.z; } else { v.x = q.x; v.y = q.y; v.z = q.z; }
        v.yaw = q.yaw; v.compact = q.compact * q.squeeze;
        if (q.lostHeads > 0) { this.renderers[side].fall(v, q.lostHeads); q.lostHeads = 0; }
      }
      this.renderers[side].update(views, t, dt);
    }
    // Fahnen und Ringe in der Farbe der haltenden Seite (umkämpft: hell), ohne neue Farben je Bild
    const sg = this.ctx.engine.siegeById(this.siegeId);
    if (sg) for (let i = 0; i < this.marks.length && i < sg.points.length; i++) {
      const h = sg.points[i].hold, m = this.marks[i];
      if (h >= 0) m.flag.color.lerpColors(NEUTRAL, this.colA, h); else m.flag.color.lerpColors(NEUTRAL, this.colD, -h);
      m.ring.color.copy(m.flag.color);
    }
  }

  /** Ziele eines Trupps: die lebenden Trupps der Gegenseite, für die dem Spieler feindliche Seite auch Spielfigur und Crew (Liste ohne neue Felder) */
  private foes(side: 0 | 1): readonly TroopFoe[] {
    const b = this.foeBuf[side];
    b.length = 0;
    const other = this.sides[1 - side];
    for (let i = 0; i < other.length; i++) if (other[i].alive) b.push(other[i]);
    if (this.hostile === side && this.ctx.host.onFoot()) {
      const pf = this.ctx.host.playerFoe();
      if (pf.alive) b.push(pf);
      const crew = this.ctx.host.crew();
      for (let i = 0; i < crew.length; i++) if (crew[i].alive) b.push(crew[i]);
    }
    return b;
  }

  /** Partei ergreifen: die Gegenseite wird angreifbar (`combat.mass`) und greift Spielfigur und Crew an; null = wieder Zuschauer */
  setSide(side: SiegeSide | null) {
    if (this.disposed || side === this.side) return;
    this.side = side;
    this.hostile = side === 'verteidiger' ? 0 : side === 'angreifer' ? 1 : -1;
    this.ctx.host.setMass(this.hostile >= 0 ? this.sides[this.hostile] : null);
  }

  /**
   * Ein Schritt um die Kontrollpunkte (alle `SYNC_EVERY` s): Kampfkraft im Fangradius zählen (Köpfe; Spielfigur und Offiziere mit festen Werten für
   * ihre Seite), an die Engine geben, Angreifer auf den nächsten Punkt schicken, den sie noch nicht halten; aufgeriebene Trupps der Gegenseite in
   * Spielernähe bringen Kriegspunkte.
   */
  control(dt: number) {
    const eng = this.ctx.engine, host = this.ctx.host;
    const sg = eng.siegeById(this.siegeId);
    if (!sg || sg.ended || this.disposed) return;
    const n = Math.min(this.pts.length, sg.points.length, 4);
    const att = this.att, def = this.def, R2 = WAR.pointRadius * WAR.pointRadius;
    att.fill(0); def.fill(0);
    for (let side = 0; side < 2; side++) {
      const arr = side === 0 ? att : def;
      for (const q of this.sides[side]) {
        if (!q.alive) continue;
        for (let i = 0; i < n; i++) { const dx = q.x - this.pts[i].x, dz = q.z - this.pts[i].z; if (dx * dx + dz * dz < R2) arr[i] += q.heads; }
      }
    }
    let at = 0;
    const ps = this.side;
    const foot = host.onFoot();
    if (ps && foot) {
      const arr = ps === 'angreifer' ? att : def;
      const f = host.focus();
      for (let i = 0; i < n; i++) { const dx = f.x - this.pts[i].x, dz = f.z - this.pts[i].z; if (dx * dx + dz * dz < R2) { arr[i] += WAR.playerPresence; at |= 1 << i; } }
      const crew = host.crew();
      for (const c of crew) {
        if (!c.alive) continue;
        const k = (c as { heads?: number }).heads ?? WAR.officerPresence;
        for (let i = 0; i < n; i++) { const dx = c.x - this.pts[i].x, dz = c.z - this.pts[i].z; if (dx * dx + dz * dz < R2) arr[i] += k; }
      }
    }
    eng.controlStep(this.siegeId, att, def, dt, ps ? { playerId: host.playerId, side: ps, at } : null);
    this.reinforce(dt, sg.troops, sg.garrison);
    // das Betreten der Insel setzt die Verbände des Kampfsystems zurück: die Gegenseite bleibt angreifbar (eine Zuweisung, keine neue Liste)
    if (this.hostile >= 0 && foot) host.setMass(this.sides[this.hostile]);
    // Angreifer: auf den eigenen Punkt; hält ihn die eigene Seite schon, weiter zum nächsten, der noch umkämpft oder in Feindeshand ist
    const list = this.sides[0];
    for (let k = 0; k < list.length; k++) {
      const q = list[k];
      if (!q.alive || n === 0) continue;
      let i = this.assign[0][k];
      if (sg.points[i] && sg.points[i].hold >= 1) {
        let best = -1, bd = Infinity;
        for (let j = 0; j < n; j++) { if (sg.points[j].hold >= 1) continue; const d = Math.hypot(this.pts[j].x - q.x, this.pts[j].z - q.z); if (d < bd) { bd = d; best = j; } }
        if (best >= 0) { i = best; this.assign[0][k] = best; }
      }
      const pt = this.pts[i];
      if (pt) { const off = (k % 3) * 3 - 3; q.holdX = pt.x + off; q.holdZ = pt.z + off * 0.5; }
    }
    // aufgeriebene Trupps der Gegenseite in Spielernähe: Kriegspunkte für die eigene Seite
    if (ps && this.hostile >= 0) {
      const f = host.focus();
      const nation = ps === 'angreifer' ? sg.attacker : sg.defender;
      for (const q of this.sides[this.hostile]) {
        if (q.heads > 0 || this.credited.has(q)) continue;
        this.credited.add(q);
        if (foot && Math.hypot(q.x - f.x, q.z - f.z) < 70) eng.awardMerit(host.playerId, nation, WAR.kp.trupp, 'Trupp aufgerieben', sg.islandId);
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.hostile >= 0) this.ctx.host.setMass(null);
    for (const r of this.renderers) r.dispose();
    for (const m of this.marks) { m.group.removeFromParent(); disposeObject(m.group); }
    this.marks.length = 0;
    this.sides[0].length = 0; this.sides[1].length = 0;
  }
}

export class FactionWarLive {
  /** Echte Schiffe je Schiffs-Kennung der Engine */
  private readonly ships = new Map<string, EnemyShip>();
  private readonly armadaOf = new Map<string, string>();
  private queue: { armadaId: string; shipId: string }[] = [];
  private job: BuildJob | null = null;
  /** Großschlacht der Engine → Nummer der Seeschlacht im Seesystem */
  private readonly navBattle = new Map<string, number>();
  private siege: SiegeTroops | null = null;
  private syncT = 0;
  private clock = 0;
  /** Ruht (Raid, Titelbild): keine echten Schiffe, keine Truppen */
  paused = false;

  constructor(private readonly host: WarLiveHost, readonly engine: FactionWarEngine) {
    const nav = host.naval;
    const prev = nav.onEventHit;
    // Treffer des Spielers auf ein Armada-Schiff: die ganze Armada wehrt sich (Opt-In); andere Ereignis-Schiffe gehören dem lebendigen Meer
    nav.onEventHit = (e) => { if (e.ev && this.ships.get(e.ev.recId) === e) this.onHit(e); else prev?.(e); };
  }

  /** Zeitbudget je Logikschritt für den Bau neuer Armada-Schiffe (ms) */
  static readonly BUILD_MS = 3;

  /** Wie viele Schiffe einer Armada echt fahren (Grafikstufe) */
  private cap(): number {
    const d = this.host.naval.detail;
    return d >= 1 ? 8 : d >= 0.5 ? 5 : 3;
  }

  update(dt: number) {
    if (this.paused) return;
    this.clock += dt;
    this.syncT -= dt;
    if (this.syncT <= 0) { this.syncT = SYNC_EVERY; this.sync(); this.stream(); this.battles(); this.siegeTroops(); }
    this.pumpSpawn();
    const s = this.siege;
    if (s) { const f = this.host.focus(); s.update(dt, this.clock, { x: f.x, z: f.z, yaw: 0 }); }
  }

  // ---------- Rückschreiben ----------

  /** Lage, Rumpf und Untergang der echten Schiffe sofort in die Engine schreiben (Speichern) */
  flush() { this.sync(); }

  private sync() {
    const nav = this.host.naval, eng = this.engine;
    const leaderSeen = new Set<string>();
    for (const [shipId, e] of this.ships) {
      const aid = this.armadaOf.get(shipId)!;
      const a = eng.armadaById(aid);
      if (!a || !nav.enemies.includes(e)) {
        this.ships.delete(shipId); this.armadaOf.delete(shipId);
        if (a && !nav.enemies.includes(e) && !this.anyShip(aid)) eng.setLive(aid, false);
        continue;
      }
      const s = e.ship;
      const down = !s.alive || s.sinking > 0 || s.disabled || !!e.captured;
      // versenkt oder kampfunfähig geschossen vom Spieler (letzter Treffer vor höchstens 12 s): Kriegspunkte (4.5B)
      const by = down && nav.hitByPlayer(e, 12) ? this.host.playerId : null;
      eng.syncShip(aid, shipId, s.maxHull > 0 ? s.hull / s.maxHull : 0, s.sail, down, by);
      if (!down && !leaderSeen.has(aid)) {
        const rec = a.ships.find((x) => x.id === shipId);
        if (rec && (rec.slot === 0 || !this.leaderAlive(a))) { eng.syncArmada(aid, s.x, s.z, s.heading); leaderSeen.add(aid); }
      }
    }
  }

  private leaderAlive(a: ArmadaState): boolean {
    const l = a.ships.find((x) => x.slot === 0);
    return !!l && !l.down && this.ships.has(l.id);
  }

  private anyShip(armadaId: string): boolean {
    for (const v of this.armadaOf.values()) if (v === armadaId) return true;
    return false;
  }

  // ---------- Nähe ----------

  /** Echte Schiffe in Reichweite anlegen, in der Ferne wieder zu Daten machen; Großschlachten immer mit beiden Seiten */
  private stream() {
    const eng = this.engine, f = this.host.focus();
    for (const a of eng.state.armadas) {
      const bt = eng.battleById(a.battleId);
      const px = bt ? bt.x : a.x, pz = bt ? bt.z : a.z;
      const d = Math.hypot(px - f.x, pz - f.z);
      const gone = a.status === 'aufgeloest';
      if (!a.live && !gone && d < LIVE_IN) this.materialize(a);
      else if (a.live && (gone || (d > LIVE_OUT && !this.engaged(a.id)))) this.release(a.id);
      // nachrücken: die Reserve füllt die echten Plätze wieder auf
      if (a.live && !gone) this.refill(a);
    }
    // Schlacht: die Gegenseite erscheint mit
    for (const bt of eng.state.battles) {
      if (bt.ended) continue;
      const A = eng.armadaById(bt.a), B = eng.armadaById(bt.b);
      if (A && B && A.live !== B.live) { if (!A.live) this.materialize(A); if (!B.live) this.materialize(B); }
    }
  }

  private materialize(a: ArmadaState) {
    this.engine.setLive(a.id, true);
    this.refill(a);
  }

  private refill(a: ArmadaState) {
    let live = 0;
    for (const sh of a.ships) if (!sh.down && (this.ships.has(sh.id) || this.queued(sh.id))) live++;
    const cap = this.cap();
    for (const sh of a.ships) {
      if (live >= cap) break;
      if (sh.down || this.ships.has(sh.id) || this.queued(sh.id)) continue;
      this.queue.push({ armadaId: a.id, shipId: sh.id });
      live++;
    }
  }

  private queued(shipId: string): boolean {
    if (this.job?.shipId === shipId) return true;
    for (const q of this.queue) if (q.shipId === shipId) return true;
    return false;
  }

  /** Kämpft ein Schiff dieser Armada gerade mit dem Spieler (dann wird nichts abgebaut, auch nicht in der Ferne)? */
  private engaged(armadaId: string): boolean {
    const p = this.host.ship;
    for (const [shipId, e] of this.ships) {
      if (this.armadaOf.get(shipId) !== armadaId) continue;
      if (e.provoked && e.state === 'engage' && Math.hypot(e.ship.x - p.x, e.ship.z - p.z) < 1200) return true;
    }
    return false;
  }

  /** Echte Schiffe einer Armada abbauen (ihre Daten bleiben) */
  release(armadaId: string) {
    const nav = this.host.naval;
    this.sync();
    for (const [shipId, e] of [...this.ships]) {
      if (this.armadaOf.get(shipId) !== armadaId) continue;
      // ein kampfunfähiges Schiff, das man zurücklässt, ist erledigt; brennende Wracks bleiben stehen, bis das Seesystem sie abräumt
      if (e.ship.disabled || e.ship.sinking > 0) { if (e.ev) e.ev.owner = ''; e.battle = undefined; }
      else nav.removeEventShip(e);
      this.ships.delete(shipId); this.armadaOf.delete(shipId);
    }
    this.queue = this.queue.filter((q) => q.armadaId !== armadaId);
    if (this.job?.armadaId === armadaId) { this.job.it.return(undefined as unknown as EnemyShip); this.job = null; }
    this.engine.setLive(armadaId, false);
  }

  /** Alles abbauen (Laden, Raid, Titelbild) */
  releaseAll() {
    for (const a of this.engine.state.armadas) if (a.live) this.release(a.id);
    for (const id of this.navBattle.values()) this.host.naval.closeWarBattle(id);
    this.navBattle.clear();
    if (this.siege) { this.engine.setSiegeLive(this.siege.siegeId, false); this.siege.dispose(); this.siege = null; }
  }

  // ---------- Bau ----------

  private pumpSpawn() {
    if (!this.job) {
      if (!this.queue.length) return;
      // gerecht bauen: zuerst die Armada mit den wenigsten echten Schiffen (in einer Schlacht stehen so beide Seiten früh auf dem Wasser)
      let pick = 0, fewest = Infinity;
      for (let k = 0; k < this.queue.length; k++) {
        let n = 0;
        for (const v of this.armadaOf.values()) if (v === this.queue[k].armadaId) n++;
        if (n < fewest) { fewest = n; pick = k; }
      }
      const next = this.queue.splice(pick, 1)[0];
      this.job = this.startJob(next.armadaId, next.shipId);
      if (!this.job) return;
    }
    const job = this.job;
    const a = this.engine.armadaById(job.armadaId);
    const rec = a?.ships.find((x) => x.id === job.shipId);
    if (!a || !a.live || !rec || rec.down) { job.it.return(undefined as unknown as EnemyShip); this.job = null; return; }
    const t0 = performance.now();
    for (;;) {
      const r = job.it.next();
      if (r.done) { this.adopt(r.value, a, rec); this.job = null; return; }
      if (r.value === 'gpu' || r.value === 'wait' || performance.now() - t0 >= FactionWarLive.BUILD_MS) return;
    }
  }

  /** Lage eines Schiffs in der Formation der Armada (Daten): Kommandoschiff vorn, die anderen beiderseits dahinter */
  private slotPos(a: ArmadaState, slot: number, out: { x: number; z: number }) {
    const side = slot === 0 ? 0 : slot % 2 ? 1 : -1, back = slot === 0 ? 0 : 50 + 24 * Math.floor((slot - 1) / 2);
    out.x = a.x + Math.cos(a.heading) * side * 46 - Math.sin(a.heading) * back;
    out.z = a.z - Math.sin(a.heading) * side * 46 - Math.cos(a.heading) * back;
    return out;
  }

  private startJob(armadaId: string, shipId: string): BuildJob | null {
    const a = this.engine.armadaById(armadaId);
    const rec = a?.ships.find((x) => x.id === shipId);
    if (!a || !rec || rec.down || this.ships.has(shipId)) return null;
    const def = this.engine.registry.get(a.nation);
    const power = def?.heraldry ?? 'marine';
    const look = factionShipLook(power);
    const p = this.slotPos(a, rec.slot, { x: 0, z: 0 });
    const level = Math.max(4, seaLevelAt(a.x, a.z) + (rec.role === 'kommando' ? 3 : 1));
    const evo: ShipEvolution = { hullTier: rec.hullTier as EvoTier, sailTier: rec.sailTier as EvoTier, cannonTier: rec.cannonTier as EvoTier };
    const link: EventShipLink = {
      owner: a.id, recId: rec.id, role: rec.slot === 0 ? 'galeone' : 'eskorte', leadId: null, route: a.route, leg: a.leg, zone: null, preyId: null, bossId: null, slot: rec.slot,
    };
    const it = this.host.naval.spawnEventShipSteps({
      x: p.x, z: p.z, heading: a.heading, classTier: rec.cls, level, look, role: 'patrouille', power, name: `${def?.name ?? 'Unbekannt'}: ${ROLE_LABEL[rec.role]}`,
      // dieselben Trefferpunkte wie in der Engine (`shipHp`): eine Schlacht dauert in 3D so lange wie in den Daten
      evo, hullFrac: rec.hull, sailFrac: rec.sail, link, maxHull: Math.round(shipHp(rec)),
    });
    return { armadaId, shipId, it };
  }

  private adopt(e: EnemyShip, a: ArmadaState, rec: ArmadaShip) {
    const p = this.slotPos(a, rec.slot, { x: 0, z: 0 });
    e.ship.x = p.x; e.ship.z = p.z; e.ship.heading = a.heading;
    e.ship.prev = { x: p.x, z: p.z, heading: a.heading };
    this.ships.set(rec.id, e);
    this.armadaOf.set(rec.id, a.id);
    this.host.warm(e.ship.model.group);
    this.linkRoles(a);
  }

  /**
   * Rollen der echten Schiffe nach dem Zustand der Armada: unterwegs folgt das Kommandoschiff der Route und die anderen halten Formation (Ereignis-KI);
   * vor der belagerten Insel kreuzen alle als Belagerungsring; in einer Großschlacht kämpfen sie wie in einer Seeschlacht (`EnemyShip.battle`).
   */
  private linkRoles(a: ArmadaState) {
    let leadId: string | null = null;
    for (const sh of a.ships) { const e = this.ships.get(sh.id); if (e && !sh.down && (sh.slot === 0 || !leadId)) { leadId = e.ship.entityId; if (sh.slot === 0) break; } }
    const siege = a.status === 'belagerung';
    const w = siege ? this.engine.island(a.target) : null;
    for (const sh of a.ships) {
      const e = this.ships.get(sh.id);
      if (!e?.ev) continue;
      const L = e.ev;
      L.route = a.route; L.leg = a.leg;
      if (siege && w) {
        L.role = 'wache';
        // Ring vor der Küste: jedes Schiff an seinem Platz auf der Seite der Flotte
        const ang = Math.atan2(a.x - w.x, a.z - w.z) + (sh.slot - a.ships.length / 2) * 0.09;
        const r = w.r * 1.45 + 120;
        e.wander.x = w.x + Math.sin(ang) * r; e.wander.z = w.z + Math.cos(ang) * r;
      } else {
        const lead = e.ship.entityId === leadId;
        L.role = lead ? 'galeone' : 'eskorte';
        L.leadId = lead ? null : leadId;
      }
    }
  }

  // ---------- Großschlachten ----------

  /** Stehen von dieser Armada genug echte Schiffe für den Beginn der Schlacht (zwei, oder alle, die noch schwimmen)? Der Rest stößt dazu, sobald er gebaut ist */
  private ready(a: ArmadaState | null): boolean {
    if (!a || !a.live) return false;
    let n = 0, alive = 0;
    for (const sh of a.ships) {
      if (sh.down) continue;
      alive++;
      if (this.ships.has(sh.id)) n++;
    }
    return n > 0 && n >= Math.min(2, alive);
  }

  /** Seeschlachten im Seesystem öffnen und schließen, Seiten setzen, Rollen nachführen */
  private battles() {
    const eng = this.engine, nav = this.host.naval;
    // eine Großschlacht übernimmt die Seewelt erst, wenn beide Seiten vollständig als echte Schiffe stehen; bis dahin rechnet die Engine
    for (const bt of eng.state.battles) {
      if (bt.ended) continue;
      const both = this.ready(eng.armadaById(bt.a)) && this.ready(eng.armadaById(bt.b));
      if (both !== bt.live) eng.setBattleLive(bt.id, both);
    }
    for (const a of eng.state.armadas) {
      if (!a.live) continue;
      const bt = eng.battleById(a.battleId);
      const fight = !!bt && !bt.ended && bt.live;
      let id = 0;
      if (fight) {
        id = this.navBattle.get(bt!.id) ?? 0;
        if (!id) {
          const A = eng.registry.get(bt!.nationA)?.heraldry ?? 'marine', B = eng.registry.get(bt!.nationB)?.heraldry ?? 'marine';
          id = nav.openWarBattle(bt!.id, A, B, bt!.x, bt!.z);
          this.navBattle.set(bt!.id, id);
        }
      }
      const side: 0 | 1 = bt && bt.a === a.id ? 0 : 1;
      for (const sh of a.ships) {
        const e = this.ships.get(sh.id);
        if (!e) continue;
        if (fight) { if (!e.battle || e.battle.id !== id) { e.battle = { id, side }; e.state = 'engage'; } }
        else if (e.battle) { e.battle = undefined; e.state = 'patrol'; }
      }
      if (!fight) this.linkRoles(a);
    }
    // beendete Schlachten im Seesystem schließen
    for (const [warId, id] of [...this.navBattle]) {
      const bt = eng.battleById(warId);
      if (bt && !bt.ended && bt.live) continue;
      nav.closeWarBattle(id);
      this.navBattle.delete(warId);
    }
  }

  /** Der Spieler hat ein Schiff der Armada getroffen: die ganze Armada wehrt sich */
  private onHit(e: EnemyShip) {
    const aid = e.ev ? this.armadaOf.get(e.ev.recId) : undefined;
    if (!aid) return;
    for (const [shipId, o] of this.ships) if (this.armadaOf.get(shipId) === aid) { o.provoked = true; o.state = 'engage'; }
  }

  // ---------- Truppen an Land ----------

  /** Echte Belagerungstruppen an der nächsten belagerten Insel in Spielernähe (ACTIVE_HIGH), Verluste zurück an die Engine */
  private siegeTroops() {
    const eng = this.engine, f = this.host.focus();
    let cur = this.siege ? eng.siegeById(this.siege.siegeId) : null;
    if (this.siege) {
      const w = cur ? eng.island(cur.islandId) : undefined;
      const far = !w || Math.hypot(w.x - f.x, w.z - f.z) - w.r > TROOPS_OUT;
      if (!cur || cur.ended || cur.paused || far || !this.host.islandWalk(cur.islandId)) {
        eng.setSiegeLive(this.siege.siegeId, false);
        this.siege.dispose(); this.siege = null; cur = null;
      } else {
        // Verluste umrechnen: jeder gefallene Kopf kostet die Engine `WAR.troopsPerHead` Soldaten (die Front ist ein Ausschnitt, Verstärkung landet nach)
        const s = this.siege;
        const lost = s.takeLosses();
        eng.siegeLosses(s.siegeId, lost[0], lost[1]);
        // Partei des Spielers (Auftrag oder Wahl im Schlacht-Banner) und Kampf um die Kontrollpunkte
        s.setSide(eng.helperSide(s.siegeId, this.host.playerId));
        s.control(SYNC_EVERY);
        return;
      }
    }
    for (const sg of eng.state.sieges) {
      if (sg.ended || sg.paused || !sg.defender) continue;
      const w = eng.island(sg.islandId);
      if (!w || Math.hypot(w.x - f.x, w.z - f.z) - w.r > TROOPS_IN) continue;
      const ground = this.host.islandWalk(sg.islandId);
      const a = eng.armadaById(sg.armadaId);
      if (!ground || !a) continue;
      const atk = eng.registry.get(sg.attacker)?.heraldry ?? 'marine', def = eng.registry.get(sg.defender)?.heraldry ?? 'marine';
      const level = Math.max(4, seaLevelAt(w.x, w.z) + 1);
      this.siege = new SiegeTroops({ engine: eng, host: this.host }, this.host.scene, sg.id, atk, def, this.host.troopBase(), ground.nav, ground.walk, { x: a.x, z: a.z }, sg.troops, sg.garrison, level, this.host.playerId, sg.points);
      this.siege.setSide(eng.helperSide(sg.id, this.host.playerId));
      eng.setSiegeLive(sg.id, true);
      return;
    }
  }

  /** Lebende Belagerungstrupps (Prüfungen, Anzeige) */
  get siegeView(): { siegeId: string; attackers: number; defenders: number; side: SiegeSide | null } | null {
    const s = this.siege;
    return s ? { siegeId: s.siegeId, attackers: s.heads(0), defenders: s.heads(1), side: s.side } : null;
  }

  /** Kontrollpunkte der echten Belagerung auf begehbarem Boden (Kompass, Prüfungen); leer ohne Landkampf */
  get siegePoints(): readonly { x: number; y: number; z: number }[] { return this.siege?.pts ?? NO_PTS; }

  /** Trupps beider Seiten der echten Belagerung (Prüfungen) */
  get siegeSquads(): readonly (readonly TroopSquad[])[] | null { return this.siege?.sides ?? null; }

  /**
   * Partei ergreifen an der Belagerung, deren Truppen gerade an Land stehen (Schlacht-Banner): der Spieler kämpft an der Seite der Angreifer oder der
   * Verteidiger. false, wenn keine Belagerung in der Nähe ist.
   */
  join(side: SiegeSide): boolean {
    const s = this.siege;
    if (!s || !this.engine.joinSiege(s.siegeId, this.host.playerId, side)) return false;
    s.setSide(side);
    return true;
  }

  /** Zahl der echten Schiffe (Prüfungen, Anzeige) */
  get liveShips(): number { return this.ships.size; }
  get building(): boolean { return !!this.job || this.queue.length > 0; }
}

/** Klassen-Name für Meldungen („Linienschiff“) */
export const className = (cls: number): string => SHIP_CLASSES[Math.max(0, Math.min(6, cls))].n;
