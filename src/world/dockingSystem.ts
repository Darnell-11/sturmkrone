// Anlegen, Gangway, Strickleiter am Ufer und Entern mit Planken/Leitern: der Ablauf. Zustand liegt als reine Daten in
// `Ship.moored` (`DockingState`) und `session` (`BoardingSession`); Brücken sind `BridgeDef`s im `CompositeGround`; die Meshes zeichnet
// `DockingFx`. Dieses Modul bewegt nur die Schiffe (gedämpft), baut und baut ab, und liefert Laufwege über die Brücken.
import type { Scene } from 'three';
import { Ship } from '../entities/ship/ship';
import {
  GATE_INSET, berthPose, bridgeTypeFor, planPull, pullPose, type PullPlan, deckGate, deckGates, deckWalkHalf, freeOf, makeRoute, mainDeckRange,
  pickBerth, pierAxes, pierPoint, planGangway, planPlank, plankCount, slopeDeg, type Anchor, type Berth, type BoardingPhase, type BoardingSession, type BridgeDef,
  type DockingState, type PierLine, type Route, type RoutePoint,
} from './docking';
import { DockingFx, styleFor } from './dockingFx';
import { WATERLINE, coastK, type CompositeGround, type DeckGround, type IslandGround, type Pier, type WalkIsland } from './islandGround';
import { clamp01, wrapAngle } from '../core/mathUtil';

/** Was der Ablauf von der Welt braucht */
export interface DockHost {
  scene: Scene;
  ground: IslandGround;
  composite: CompositeGround;
  /** Das eigene Schiff (bleibt dasselbe Objekt, wird nur umgebaut) */
  ship: Ship;
  /** Deck des eigenen Schiffs (bleibt bestehen, bis das Schiff umgebaut wird) */
  ownDeck(): DeckGround;
  waterY(x: number, z: number): number;
  say(text: string): void;
  /** Phasenwechsel eines Enterkampfs */
  onBoard(phase: BoardingPhase): void;
  /** Die Rümpfe stoßen beim Heranziehen aneinander (Ruck, Ton) */
  bump?(x: number, y: number, z: number): void;
}

const _pt = { x: 0, y: 0, z: 0 };
const _nearIslands: WalkIsland[] = [];
const _pt2 = { x: 0, y: 0, z: 0 };

/** Wasserlinie-Abstand eines Punkts zu den Inseln (positiv = im Wasser); Unendlich ohne Insel in der Nähe */
export function shoreGap(g: IslandGround, x: number, z: number): { gap: number; isl: WalkIsland | null } {
  let best = Infinity, bi: WalkIsland | null = null;
  // Broadphase (4.3A): nur die Nachbarinseln; Suchradius deckt „Mitte näher als 2,2 · r + 60 m“ ab (Umkreis im Raster: 1,9 · r)
  const near = g.getNearbyIslands(x, z, 60 + g.maxIslandR * 0.3, _nearIslands);
  for (let k = 0; k < near.length; k++) {
    const i = near[k];
    const d = Math.hypot(x - i.x, z - i.z);
    if (d > i.r * 2.2 + 60) continue;
    const gap = d - i.r * coastK(i.coast, Math.atan2(z - i.z, x - i.x)) * (1 + i.shelf * WATERLINE);
    if (gap < best) { best = gap; bi = i; }
  }
  return { gap: best, isl: bi };
}

/**
 * Größe der Küstennähe, bis zu der „Ankern & Leiter auswerfen“ angeboten wird: Abstand der Bordwand zur Wasserlinie. Kleine Schiffe
 * (Schaluppe, Brigg) kommen nach `IslandGround.pushShip` (Mitte ≥ W/2 + 1,2 m vor der Wasserlinie) näher heran als Galeone oder
 * Leviathan; die Reichweite wächst mit der Länge, weil die Leiter am Rumpf entlang und das Watstück länger werden.
 */
export function ladderReach(cls: { L: number; W: number }): number { return 1.2 + 6 + cls.L * 0.04; }

/** Anzahl der Viertel-Schritte (von 4 je Hälfte des Rumpfes), die am Liegeplatz frei von Land sein müssen; der Rest darf überstehen */
export const OVERHANG_FREE = 3;

export class DockingSystem {
  readonly fx: DockingFx;
  session: BoardingSession | null = null;

  private berth: Berth | null = null;
  /** Gefundene Liegeplätze je Steg, Seite, Richtung und Klasse (die Suche prüft viele Lagen gegen die Küsten – nicht jedes Bild) */
  private berthCache = new Map<string, Berth | null>();
  /** Geöffnete Reling-Teile (an Gangway, Leitern und Planken ausgeblendet; beim Einholen wieder sichtbar) */
  private opened: { visible: boolean }[] = [];
  /** Letzte Planung der Enterbrücken (für Prüfungen) */
  lastPlan: unknown = null;
  /** Schiffs-z der Gangway-Landestelle am aktuellen Liegeplatz */
  private gz = 0;
  private gangId = '';
  private lines: string[] = [];
  private target: { ship: Ship; deck: DeckGround } | null = null;
  private bridgeIds: string[] = [];
  private stagger = 0;
  private pull: PullPlan | null = null;
  private phaseT = 0;
  private ladderBridge = '';
  private wadeBridge = '';
  /** Scripted climb of the player */
  private climbing: { id: string; up: boolean; k: number; speed: number; done: (() => void) | null } | null = null;

  constructor(private host: DockHost) {
    this.fx = new DockingFx(host.scene);
  }

  get ship() { return this.host.ship; }
  get dock(): DockingState | null { return this.host.ship.moored; }
  /** Liegt das eigene Schiff fest am Steg (Gangway ausgefahren oder im Ausfahren)? */
  get moored(): boolean { return this.dock?.phase === 'moored'; }
  get busy(): boolean { return !!this.dock || !!this.session || !!this.ladderBridge || !!this.climbing; }
  get isClimbing(): boolean { return !!this.climbing; }
  get targetShip(): Ship | null { return this.target?.ship ?? null; }
  get targetDeck(): DeckGround | null { return this.target?.deck ?? null; }
  get gangway() { return this.gangId ? this.host.composite.bridge(this.gangId) : null; }
  get ladderId(): string { return this.ladderBridge; }

  // ---------- Stege und Liegeplätze ----------

  private pierLines(): PierLine[] {
    const out: PierLine[] = [];
    this.host.ground.piers.forEach((p, i) => { p.id ??= `pier-${i}`; out.push(p as PierLine); });
    return out;
  }

  private pierOf(id: string): Pier | null { return this.host.ground.piers.find((p) => p.id === id) ?? null; }

  /**
   * Schiff darf hier liegen? Alle Punkte des Rumpf-Umrisses (Bug bis Heck, beide Bordwände) müssen mindestens 0,4 m jenseits der
   * Wasserlinie liegen. (Strenger als nötig wäre `pushShip`, das W/2 + 1,2 m Abstand der Schiffsachse verlangt: überstehende Enden
   * dürfen über flachem Wasser liegen, nur nicht über trockenem Strand.)
   */
  private clear(b: Berth, margin = 0.4): boolean {
    const s = this.ship, L = s.cls.L;
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading), rx = Math.cos(b.heading), rz = -Math.sin(b.heading);
    // die äußersten Achtel (Bug- und Hecksteven, laufen spitz zu) dürfen überstehen; `OVERHANG_FREE` Messpunkte je Seite bleiben frei
    for (let k = -OVERHANG_FREE; k <= OVERHANG_FREE; k++) {
      const lz = L * 0.5 * (k / 4);
      // echte Rumpfbreite an dieser Stelle (Bug und Heck laufen spitz zu)
      const half = s.model.halfWidth(lz * 0.98);
      for (const lat of [-1, 0, 1]) {
        const px = b.x + fx * lz + rx * lat * half, pz = b.z + fz * lz + rz * lat * half;
        if (shoreGap(this.host.ground, px, pz).gap < margin) return false;
      }
    }
    return true;
  }

  /**
   * Liegeplatz in Reichweite: Tempo unter 2,5 m/s, Winkel zum Steg unter 25°. Die Landestelle der Gangway liegt mittig auf dem Steg;
   * das Schiff darf mit Bug und Heck überstehen (Überhang-Regel). Liegt dabei ein Ende an Land, rücken Schiff und Zugang (Mitte, achtern,
   * vorn) so, dass die Landestelle noch auf den Bohlen ist und der Rumpf frei im Wasser liegt – sonst gibt es dort keinen Liegeplatz.
   */
  /** Gefundene Liegeplätze vergessen (nach einem Wechsel der Stege, etwa beim Betreten und Verlassen eines Raids) */
  clearBerthCache() { this.berthCache.clear(); }

  findBerth(): Berth | null {
    const s = this.ship;
    if (s.moored || this.session) return null;
    for (const p of this.pierLines()) {
      const raw = pickBerth(p, { x: s.x, z: s.z, heading: s.heading, speed: s.speed, L: s.cls.L, W: s.cls.W });
      if (!raw) continue;
      const key = `${p.id}|${raw.side}|${raw.dir}|${s.cls.id}`;
      let b = this.berthCache.get(key);
      if (b === undefined) { b = this.searchBerth(p, raw.side, raw.dir); this.berthCache.set(key, b); }
      if (b) return b;
    }
    return null;
  }

  /** Liegeplatz suchen: Zugang und Schiffsmitte `u` so, dass die Landestelle auf dem Steg liegt und der Rumpf nicht an Land ragt */
  private searchBerth(p: PierLine, side: 1 | -1, dir: 1 | -1): Berth | null {
    const s = this.ship, len = pierAxes(p).len, L = s.cls.L;
    const g = deckGates(s.model, L);
    let best: Berth | null = null, bestCost = Infinity;
    // erst mit viel Platz zum Ablegen (Rumpf mindestens 30 m vom Strand), dann knapper; Gangway-Landestelle möglichst weit vorn am Steg
    for (const margin of [30, 20, 12, 0.4]) {
    for (const gz of [g.mid, g.aft, g.fore]) {
      for (let u = -L / 2; u <= len + L / 2; u += 1.5) {
        const top = u + dir * gz;
        if (top < 2 || top > len - 2) continue;
        const cost = Math.abs(top - (len - 4)) + 0.15 * Math.abs(u - (len - 4));
        if (cost >= bestCost) continue;
        const pose = berthPose(p, side, u, dir, s.cls.W);
        const b: Berth = { pierId: p.id, side, u, dir, x: pose.x, z: pose.z, heading: pose.heading, gz };
        if (!this.clear(b, margin)) continue;
        best = b; bestCost = cost;
      }
    }
    if (best) break;
    }
    return best;
  }

  /** Anlegen beginnen: das Schiff gleitet gedämpft an den Liegeplatz */
  moor(b: Berth) {
    const s = this.ship;
    this.berth = b;
    this.gz = b.gz ?? deckGate(s.model, s.cls.L);
    s.moored = { shipId: s.entityId, pierId: b.pierId, side: b.side, u: b.u, dir: b.dir, phase: 'gliding' };
    s.throttle = 0;
    s.calmTo = 1;
    this.host.composite.setDecks(this.host.ownDeck(), this.target?.deck);
    this.host.say('Anlegen … das Schiff gleitet an den Steg.');
  }

  /** Ablegen: Gangway und Taue einholen, danach ist das Schiff frei */
  castOff(): boolean {
    const d = this.dock;
    if (!d || d.phase === 'departing') return false;
    d.phase = 'departing';
    this.removeLines();
    for (const b of this.host.composite.bridges) if (b.def.id === this.gangId) b.def.out = Math.min(b.def.out, 1);
    this.host.say('Leinen los! Die Gangway wird eingeholt.');
    return true;
  }

  private moveShip(s: Ship, x: number, z: number, h: number) {
    s.prev.x = s.x; s.prev.z = s.z; s.prev.heading = s.heading;
    s.x = x; s.z = z; s.heading = h;
  }

  private glide(dt: number): boolean {
    const s = this.ship, b = this.berth!;
    const dx = b.x - s.x, dz = b.z - s.z, dist = Math.hypot(dx, dz);
    const dh = wrapAngle(b.heading - s.heading);
    const v = Math.min(2.2, 0.3 + dist * 0.7);
    const step = Math.min(dist, v * dt);
    const hs = Math.max(-0.3 * dt, Math.min(0.3 * dt, dh * Math.min(1, dt * 1.6)));
    s.speed = 0;
    if (dist < 0.04 && Math.abs(dh) < 0.004) { this.moveShip(s, b.x, b.z, b.heading); return true; }
    this.moveShip(s, dist > 1e-4 ? s.x + (dx / dist) * step : s.x, dist > 1e-4 ? s.z + (dz / dist) * step : s.z, s.heading + (Math.abs(dh) < 0.004 ? dh : hs));
    return false;
  }

  /** Wo liegt die Bordseite zum Steg? (Schiffs-x-Vorzeichen) */
  private shipSideToward(s: Ship, wx: number, wz: number): 1 | -1 {
    const ax = Math.cos(s.heading), az = -Math.sin(s.heading);
    return (wx - s.x) * ax + (wz - s.z) * az >= 0 ? 1 : -1;
  }

  // ---------- Festmacher und Gangway ----------

  private makeLines() {
    const s = this.ship, d = this.dock!, p = this.pierOf(d.pierId);
    if (!p) return;
    const dg = this.host.ownDeck();
    const L = s.cls.L, len = pierAxes(p as PierLine).len;
    const sx = this.shipSideToward(s, p.ax + (p.bx - p.ax) / 2, p.az + (p.bz - p.az) / 2);
    const cleat = (lz: number) => (o: { x: number; y: number; z: number }) => { dg.anchorInto(sx * deckWalkHalf(s.model, lz), lz, 0.5, o); };
    const bollard = (u: number) => { const uu = Math.max(0.9, Math.min(len - 0.9, u)); const pt = pierPoint(p as PierLine, uu, d.side * (p.hw - 0.25)); return { x: pt.x, y: p.y + 0.55, z: pt.z }; };
    const uBow = d.u + d.dir * L * 0.34, uStern = d.u - d.dir * L * 0.34;
    const bB = bollard(uBow), bS = bollard(uStern), bM1 = bollard(d.u + d.dir * L * 0.1), bM2 = bollard(d.u - d.dir * L * 0.1);
    const to = (b: { x: number; y: number; z: number }) => (o: { x: number; y: number; z: number }) => { o.x = b.x; o.y = b.y; o.z = b.z; };
    const defs: [string, number, { x: number; y: number; z: number }][] = [
      ['moor-bow', L * 0.34, bB], ['moor-stern', -L * 0.34, bS], ['moor-spring-f', L * 0.34, bM2], ['moor-spring-a', -L * 0.34, bM1],
    ];
    for (const [id, lz, pt] of defs) { this.fx.addRope(id, cleat(Math.max(-L * 0.46, Math.min(L * 0.46, lz))), to(pt), { droop: 0.18, radius: 0.05 }); this.lines.push(id); }
    this.fx.addPost(bB.x, p.y, bB.z);
    this.fx.addPost(bS.x, p.y, bS.z);
    if (Math.hypot(bM1.x - bB.x, bM1.z - bB.z) > 3) this.fx.addPost(bM1.x, p.y, bM1.z);
  }

  /** Die Seitenreling dort öffnen, wo eine Brücke ans Deck kommt (Schiffs-x-Vorzeichen `sx`, Schiffs-z `z`): man läuft nicht durch das Geländer */
  private openRail(ship: Ship, sx: number, z: number, half = 1.3) {
    for (const r of ship.model.railParts) if (Math.sign(r.x) === Math.sign(sx) && Math.abs(r.z - z) < half && r.m.visible) { r.m.visible = false; this.opened.push(r.m); }
  }

  private closeRail() {
    for (const m of this.opened) m.visible = true;
    this.opened.length = 0;
  }

  private removeLines() {
    for (const id of this.lines) this.fx.removeRope(id);
    this.lines.length = 0;
  }

  /** Gangway planen und ausfahren: Fuß auf den Bohlen, Landestelle an Deck (Steigung unter 38°, Länge nach Höhenunterschied) */
  private deployGangway() {
    const s = this.ship, d = this.dock!, p = this.pierOf(d.pierId);
    if (!p) return;
    const dg = this.host.ownDeck();
    const gz = this.gz;
    const w = deckWalkHalf(s.model, gz);
    const sx = this.shipSideToward(s, p.ax + (p.bx - p.ax) / 2, p.az + (p.bz - p.az) / 2);
    const lxTop = sx * (w - GATE_INSET);
    dg.anchorInto(lxTop, gz, 0, _pt);
    const plan = planGangway({
      pierHw: p.hw, pierY: p.y, pierLen: pierAxes(p as PierLine).len, side: d.side, shipHalfW: w, inset: GATE_INSET,
      deckY: _pt.y, uTop: d.u + d.dir * gz, shipW: s.cls.W,
    });
    const foot = pierPoint(p as PierLine, plan.footU, plan.footL);
    const a: Anchor = { ref: 'world', x: foot.x, z: foot.z, y: p.y + 0.06 };
    const b: Anchor = { ref: 'ship', shipId: s.entityId, lx: lxTop, lz: gz, dy: 0.06 };
    const def: BridgeDef = { id: 'gangway', kind: 'gangway', a, b, hw: 0.85, freeA: 0.05, freeB: GATE_INSET - 0.05, out: 0 };
    this.gangId = def.id;
    const rt = this.host.composite.addBridge(def);
    this.fx.addBridge(rt, 'gangway');
    this.openRail(s, sx, gz);
  }

  // ---------- Strickleiter am Ufer ----------

  /** Bordseite zum Ufer und Abstand der Bordwand zur Wasserlinie; null ohne Insel in Reichweite */
  coastSide(): { side: 1 | -1; gap: number; isl: WalkIsland } | null {
    const s = this.ship;
    const ax = Math.cos(s.heading), az = -Math.sin(s.heading);
    let best: { side: 1 | -1; gap: number; isl: WalkIsland } | null = null;
    for (const side of [1, -1] as const) {
      for (const k of [-0.25, 0, 0.25]) {
        const px = s.x + Math.sin(s.heading) * s.cls.L * k + ax * side * s.cls.W / 2;
        const pz = s.z + Math.cos(s.heading) * s.cls.L * k + az * side * s.cls.W / 2;
        const r = shoreGap(this.host.ground, px, pz);
        if (r.isl && (!best || r.gap < best.gap)) best = { side, gap: r.gap, isl: r.isl };
      }
    }
    return best;
  }

  /** Kommt am Ufer die Leiter in Frage (ohne Steg, nah genug für diese Schiffsgröße)? */
  canDropLadder(): { side: 1 | -1; isl: WalkIsland } | null {
    if (this.dock || this.session || this.ladderBridge) return null;
    const c = this.coastSide();
    if (!c || c.gap > ladderReach(this.ship.cls)) return null;
    return { side: c.side, isl: c.isl };
  }

  /** Anker werfen und die Leiter an der ufernäheren Bordseite herablassen; dazu ein Watweg vom Leiterfuß zum Strand */
  dropLadder(): boolean {
    const c = this.canDropLadder();
    if (!c) return false;
    const s = this.ship, dg = this.host.ownDeck();
    s.throttle = 0; s.calmTo = 0.7;
    const gz = deckGate(s.model, s.cls.L);
    const sx = c.side;
    // Leiter hängt an der Reling (Ruhelage), Fuß 0,5 m neben dem Rumpf im flachen Wasser
    // Haken über der Reling, AUSSEN an der Bordwand (die Wand wölbt sich nach außen: innen steckte die Leiter im Rumpf)
    const rail = s.model.halfWidth(gz) + 0.2;
    dg.anchorInto(sx * rail, gz, 0.9, _pt);
    const ox = Math.cos(s.heading) * sx, oz = -Math.sin(s.heading) * sx;
    // Die Bordwand wölbt sich unter der Reling nach außen: der Fuß hängt weit genug draußen, damit die Leiter nicht im Rumpf steckt
    const out = 1.0 + 0.16 * Math.max(0, _pt.y - this.host.waterY(_pt.x, _pt.z));
    const fx = _pt.x + ox * out, fz = _pt.z + oz * out;
    const water = this.host.waterY(fx, fz);
    const a: Anchor = { ref: 'world', x: fx, z: fz, y: water - 0.3 };
    const b: Anchor = { ref: 'ship', shipId: s.entityId, lx: sx * rail, lz: gz, dy: 0.9 };
    const def: BridgeDef = { id: 'ladder-coast', kind: 'ladder', a, b, hw: 0.4, freeA: 0, freeB: 0, out: 0 };
    this.ladderBridge = def.id;
    this.openRail(s, sx, gz, 1.0);
    this.host.composite.setDecks(dg, this.target?.deck);
    const rt = this.host.composite.addBridge(def, false);
    this.fx.addBridge(rt, 'rope');
    // Watweg: vom Leiterfuß zum begehbaren Strand der Insel
    const isl = c.isl;
    const ang = Math.atan2(fz - isl.z, fx - isl.x);
    const e = isl.r * coastK(isl.coast, ang);
    const qx = isl.x + Math.cos(ang) * e * (1 + isl.shelf * 0.08), qz = isl.z + Math.sin(ang) * e * (1 + isl.shelf * 0.08);
    const qh = this.host.ground.height(qx, qz);
    const wade: BridgeDef = { id: 'wade-coast', kind: 'wade', a: { ref: 'world', x: fx, z: fz, y: water - 0.3 }, b: { ref: 'world', x: qx, z: qz, y: Number.isFinite(qh) ? qh : 0.3 }, hw: 1.6, freeA: 0, freeB: 1.2, out: 1 };
    this.wadeBridge = wade.id;
    this.host.composite.addBridge(wade);
    this.host.say('Anker geworfen – die Leiter hängt an der Bordwand.');
    return true;
  }

  raiseLadder() {
    if (!this.ladderBridge) return;
    this.host.composite.removeBridge(this.ladderBridge);
    this.fx.removeBridge(this.ladderBridge);
    if (this.wadeBridge) this.host.composite.removeBridge(this.wadeBridge);
    this.ladderBridge = this.wadeBridge = '';
    this.closeRail();
    this.ship.calmTo = 0;
  }

  /** Leiter in Reichweite einer Position (Fuß oder Spitze): Kennung und ob man unten (hinaufklettern) oder oben (hinab) steht */
  ladderNear(x: number, y: number, z: number, reach = 1.8): { id: string; atBottom: boolean } | null {
    for (const b of this.host.composite.bridges) {
      if (b.def.kind !== 'ladder' || !b.ok || b.def.out < 0.98) continue;
      const f = b.f;
      if (Math.hypot(x - f.ax, z - f.az) < reach && Math.abs(y - f.ay) < 1.2) return { id: b.def.id, atBottom: true };
      if (Math.hypot(x - f.bx, z - f.bz) < reach + 0.6 && Math.abs(y - f.by) < 1.6) return { id: b.def.id, atBottom: false };
    }
    return null;
  }

  /** Klettern beginnen (Spieler): hinauf (vom Fuß zur Spitze) oder hinab */
  climb(id: string, up: boolean, done: () => void) {
    if (this.climbing) return;
    this.climbing = { id, up, k: 0, speed: 1.5, done };
  }

  /** Lage des Kletternden in dieser Zeitscheibe; false, wenn nicht geklettert wird. `out.yaw` zeigt zur Leiter. */
  stepClimb(dt: number, out: { x: number; y: number; z: number; yaw: number }): boolean {
    const c = this.climbing;
    if (!c) return false;
    const len = this.host.composite.ladderLength(c.id);
    if (len <= 0) { this.climbing = null; return false; }
    c.k = Math.min(1, c.k + (c.speed / len) * dt);
    this.host.composite.ladderAt(c.id, c.up ? c.k : 1 - c.k, _pt2);
    out.x = _pt2.x; out.y = _pt2.y; out.z = _pt2.z;
    const b = this.host.composite.bridge(c.id)!;
    // Blick zum Rumpf: entlang der Leiterneigung von unten nach oben (steht die Leiter fast senkrecht, in Schiffsrichtung)
    out.yaw = Math.hypot(b.f.bx - b.f.ax, b.f.bz - b.f.az) > 0.2 ? Math.atan2(b.f.ux, b.f.uz) : this.ship.heading;
    if (c.k >= 1) { const d = c.done; this.climbing = null; d?.(); }
    return true;
  }

  // ---------- Entern ----------

  /** Seite des Ziels, von der eigenen Schiffsmitte aus (Schiffs-x-Vorzeichen) */
  private sideOf(a: Ship, b: Ship): 1 | -1 { return this.shipSideToward(a, b.x, b.z); }

  /**
   * Enterhaken: beide Schiffe stehen still, drei Enterhaken fliegen zur Reling des Gegners (Taue gespannt), dann zieht die Crew die
   * Schiffe Bord an Bord (Abstand W1/2 + W2/2 + 0,6 m), das Rollen klingt ab. Brücken folgen in `update`.
   */
  startBoarding(prey: Ship, preyDeck: DeckGround) {
    const s = this.ship;
    this.target = { ship: prey, deck: preyDeck };
    this.host.composite.setDecks(this.host.ownDeck(), preyDeck);
    this.session = { attackerShipId: s.entityId, targetShipId: prey.entityId, phase: 'hooks', bridgeType: 'planks' };
    this.phaseT = 0;
    s.speed = 0; prey.speed = 0;
    s.calmTo = 1; prey.calmTo = 1;
    const dgA = this.host.ownDeck(), dgB = preyDeck;
    const side = this.sideOf(s, prey);
    // Gleichlauf nach dem Drehen entscheidet, welche Bordwand des Gegners dem Angreifer zugewandt liegt (nicht die Lage vor dem Drehen):
    // bei gleichem Kurs liegt der Angreifer an der Gegenseite von `side`, bei Gegenkurs auf derselben
    const parNow = Math.cos(s.heading - prey.heading) > 0;
    const sideB = (parNow ? -side : side) as 1 | -1;
    const n = 3, Ls = Math.min(s.cls.L, prey.cls.L);
    for (let i = 0; i < n; i++) {
      const lz = (i - 1) * Ls * 0.22;
      const a = (o: { x: number; y: number; z: number }) => { dgA.anchorInto(side * deckWalkHalf(s.model, lz), lz, 1.1, o); };
      const zb = parNow ? lz : -lz;
      const b = (o: { x: number; y: number; z: number }) => { dgB.anchorInto(sideB * prey.model.halfWidth(zb) * 0.96, zb, 1.0, o); };
      this.fx.addRope(`hook-${i}`, a, b, { hook: true, radius: 0.05, droop: 0.55, t: 0 });
      this.lines.push(`hook-${i}`);
    }
    this.host.onBoard('hooks');
  }

  private setPhase(p: BoardingPhase) {
    if (!this.session) return;
    this.session.phase = p;
    this.phaseT = 0;
    this.host.onBoard(p);
  }

  /** Brückenart und -lage planen und ausfahren */
  private buildBridges() {
    const A = this.ship, B = this.target!.ship;
    const dgA = this.host.ownDeck(), dgB = this.target!.deck;
    const sideA = this.sideOf(A, B), sideB = this.shipSideToward(B, A.x, A.z);
    const par = Math.cos(A.heading - B.heading) > 0;
    const rA = mainDeckRange(A.model, A.cls.L), rB = mainDeckRange(B.model, B.cls.L);
    // Die Decks liegen Mitte an Mitte; die Enden einer Brücke dürfen auf verschiedenen Höhen (z) liegen, wenn dort frei ist (schräge Planke):
    // so findet auch das kleine, vollgestellte Deck Plätze neben dem langen Gegner. zB(z) = z in den Schiffskoordinaten des Gegners.
    const zB = (z: number) => (par ? z : -z);
    /**
     * Auflage der Brücke an Deck: kleinster Abstand von der Bordkante (≥ 0,5 m), an dem die Stelle frei von Aufbauten ist. Geschütze und
     * Kisten am Rand liegen unter der Planke (sie reicht darüber hinweg bis auf freies Deck), damit man sie vom Deck aus auch erreicht.
     * null = an dieser Stelle gibt es keine freie Auflage.
     */
    const inset = (m: Ship['model'], side: number, zz: number): number | null => {
      const w = deckWalkHalf(m, zz);
      for (const k of [GATE_INSET, 1.2, 1.9, 2.6]) {
        const x = w - k;
        if (x < 0.6) break;
        // Auflage und der Raum davor (zur Mitte hin) müssen frei sein: der Läufer soll hinkommen und nach dem Absprung nicht feststecken
        if (freeOf(m.blockers, side * x, zz, 0.45) && freeOf(m.blockers, side * Math.max(0, x - 0.7), zz, 0.45)) return k;
      }
      return null;
    };
    const aOk = (z: number) => inset(A.model, sideA, z);
    const bOk = (z: number) => inset(B.model, sideB, zB(z));
    dgA.anchorInto(0, 0, 0, _pt); dgB.anchorInto(0, 0, 0, _pt2);
    const dh = _pt2.y - _pt.y;
    const type = bridgeTypeFor(dh);
    this.session!.bridgeType = type;
    const n = type === 'planks' ? plankCount(Math.min(A.cls.L, B.cls.L)) : 2;
    const lo = rA.lo, hi = rA.hi;
    // Kandidaten: freie Stelle am eigenen Deck (z) mit freier Gegenstelle im Abstand höchstens 2 m längs
    const cand: { za: number; zb: number; ia: number; ib: number }[] = [];
    for (let z = lo; z <= hi + 1e-6; z += 0.4) {
      const ia = aOk(z);
      if (ia === null) continue;
      let best: { z: number; ib: number } | null = null;
      for (let d = 0; d <= 2.0 && best === null; d += 0.4) for (const sg of d === 0 ? [1] : [1, -1]) {
        const zz = z + sg * d;
        if (zz < (par ? rB.lo : -rB.hi) || zz > (par ? rB.hi : -rB.lo)) continue;
        const ib = bOk(zz);
        if (ib !== null) { best = { z: zz, ib }; break; }
      }
      if (best) cand.push({ za: z, zb: zB(best.z), ia, ib: best.ib });
    }
    const span = Math.max(1, hi - lo);
    const stations: { za: number; zb: number; ia: number; ib: number }[] = [];
    for (let i = 0; i < n; i++) {
      const base = lo + ((i + 0.5) / n) * span;
      let pick: { za: number; zb: number; ia: number; ib: number } | null = null;
      for (const c of cand) if (!stations.some((q) => Math.abs(q.za - c.za) < 2.4) && (!pick || Math.abs(c.za - base) < Math.abs(pick.za - base))) pick = c;
      if (pick) stations.push(pick);
    }
    if (!stations.length) { const z = (lo + hi) / 2; stations.push({ za: z, zb: zB(z), ia: GATE_INSET, ib: GATE_INSET }); }
    this.lastPlan = { cand, stations: stations.map((q) => ({ ...q })), n, lo, hi, sideA, sideB, par };
    stations.forEach((stn, i) => {
      const z = stn.za, zbl = stn.zb;
      const wA = deckWalkHalf(A.model, z), wB = deckWalkHalf(B.model, zbl);
      let def: BridgeDef;
      if (type === 'planks') {
        // natürliche Länge (Spalt und beide Randstreifen) und nötige Verlängerung nach innen, damit die Neigung unter dem Limit bleibt
        const ia = stn.ia, ib = stn.ib;
        dgA.anchorInto(sideA * (wA - ia), z, 0.1, _pt); dgB.anchorInto(sideB * (wB - ib), zbl, 0.1, _pt2);
        const natural = Math.hypot(_pt2.x - _pt.x, _pt2.z - _pt.z);
        const plan = planPlank(_pt2.y - _pt.y, natural);
        const ext = Math.min(plan.extend, Math.max(0, Math.min(wA - ia, wB - ib) - 0.7));
        def = {
          id: `plank-${i}`, kind: 'plank',
          a: { ref: 'ship', shipId: A.entityId, lx: sideA * (wA - ia - ext), lz: z, dy: 0.1 },
          b: { ref: 'ship', shipId: B.entityId, lx: sideB * (wB - ib - ext), lz: zbl, dy: 0.1 },
          hw: 0.85, freeA: ia + ext - 0.05, freeB: ib + ext - 0.05, out: 0,
        };
      } else {
        // Leitern: unten auf dem tieferen Deck, oben an der Reling des höheren Schiffs
        const aLow = dh > 0;
        const low = aLow ? A : B, high = aLow ? B : A, dgL = aLow ? dgA : dgB, dgH = aLow ? dgB : dgA;
        const zl = aLow ? z : zbl, zh = aLow ? zbl : z;
        const sl = aLow ? sideA : sideB, sh = aLow ? sideB : sideA;
        void dgL; void dgH;
        const wl = deckWalkHalf(low.model, zl);
        def = {
          id: `ladder-${i}`, kind: 'ladder',
          a: { ref: 'ship', shipId: low.entityId, lx: sl * (wl - 0.3), lz: zl, dy: 0 },
          b: { ref: 'ship', shipId: high.entityId, lx: sh * (high.model.halfWidth(zh) + 0.2), lz: zh, dy: 0.9 },
          hw: 0.55, freeA: 0, freeB: 0, out: 0,
        };
      }
      if (def.a.ref === 'ship' && def.b.ref === 'ship') {
        for (const an of [def.a, def.b]) { const sh = an.shipId === A.entityId ? A : B; this.openRail(sh, an.lx, an.lz, 1.0); }
      }
      const rt = this.host.composite.addBridge(def, def.kind !== 'ladder');
      const st = styleFor(def.kind, true);
      if (st) this.fx.addBridge(rt, st);
      this.bridgeIds.push(def.id);
    });
    this.stagger = 0;
  }

  /** Kampfende: die Crew holt Brücken und Haken ein; danach ist alles abgebaut */
  endBoarding() {
    if (!this.session || this.session.phase === 'retracting' || this.session.phase === 'done') return;
    this.setPhase('retracting');
  }

  /** Notfall: Brücken und Haken sofort abbauen (die Spielfigur wurde gerettet) */
  abortBoarding() {
    if (!this.session) return;
    for (const id of this.bridgeIds) { const b = this.host.composite.bridge(id); if (b) b.def.out = 0; }
    this.finishBoarding();
  }

  /** Planke/Leiter-Kennungen (Reihenfolge der Anlage) */
  get bridgeList(): { id: string; kind: BridgeDef['kind'] }[] {
    return this.bridgeIds.map((id) => ({ id, kind: this.host.composite.bridge(id)?.def.kind ?? 'plank' }));
  }

  // ---------- Laufwege über Brücken ----------

  /**
   * Laufweg über eine Brücke. `fromA` = Start am Anfang `a` (Land/unteres Ende), sonst am Ende `b`. Die Punkte liegen auf der
   * Brückenlinie; davor und dahinter je ein Wegpunkt auf dem Boden, damit der Läufer gerade auf die Kante zuläuft.
   */
  routeAcross(id: string, fromA: boolean): Route | null {
    const b = this.host.composite.bridge(id);
    if (!b || !b.ok) return null;
    const f = b.f, def = b.def;
    const ux = f.ux, uz = f.uz;
    const A: RoutePoint = { x: f.ax, z: f.az }, B: RoutePoint = { x: f.bx, z: f.bz };
    if (def.kind === 'ladder') {
      return fromA
        ? makeRoute([A, { x: B.x, z: B.z, climb: id, up: true }, { x: B.x + ux * 1.2, z: B.z + uz * 1.2 }])
        : makeRoute([B, { x: A.x, z: A.z, climb: id, up: false }, { x: A.x - ux * 1.2, z: A.z - uz * 1.2 }]);
    }
    if (def.kind === 'gangway') {
      return fromA
        ? makeRoute([A, B, { x: B.x + ux * 1.2, z: B.z + uz * 1.2 }])
        : makeRoute([B, A, { x: A.x - ux * 1.8, z: A.z - uz * 1.8 }]);
    }
    // Planke: Start und Ziel sind die freien Auflagen an Deck (hinter den Geschützen), nicht die Bordkante
    return fromA ? makeRoute([A, B]) : makeRoute([B, A]);
  }

  /** Die Brücke, über die gerade gewechselt wird (Gangway, sonst die nächste Planke/Leiter), und ob der Start am Anfang `a` liegt */
  crossingFor(fromShipId: string | null): { id: string; fromA: boolean } | null {
    const list = this.bridgeIds.length ? this.bridgeIds : this.gangId ? [this.gangId] : [];
    for (const id of list) {
      const b = this.host.composite.bridge(id);
      if (!b || !b.ok || b.def.out < 0.98) continue;
      if (id === this.gangId) return { id, fromA: fromShipId === null };
      const a = b.def.a;
      return { id, fromA: a.ref === 'ship' && a.shipId === fromShipId };
    }
    return null;
  }

  // ---------- Takt ----------

  /** Je Logikbild: Schiffe bewegen, Brücken ausfahren oder einholen */
  update(dt: number) {
    const s = this.ship;
    const d = s.moored;
    if (d) {
      s.furl(dt);
      if (d.phase === 'gliding') {
        if (this.glide(dt)) { d.phase = 'moored'; this.makeLines(); this.deployGangway(); this.host.say('Festgemacht. Die Gangway ist ausgefahren.'); }
      } else if (d.phase === 'moored') {
        s.speed = 0;
        const g = this.gangway;
        if (g) g.def.out = Math.min(1, g.def.out + dt / 1.3);
      } else {
        const g = this.gangway;
        if (g) g.def.out = Math.max(0, g.def.out - dt / 1.1);
        if (!g || g.def.out <= 0.001) {
          if (g) { this.host.composite.removeBridge(g.def.id); this.fx.removeBridge(g.def.id); }
          this.gangId = ''; this.berth = null;
          this.fx.clear();
          this.closeRail();
          s.moored = null; s.calmTo = 0;
          this.host.say('Abgelegt.');
        }
      }
    }
    if (this.ladderBridge) { const b = this.host.composite.bridge(this.ladderBridge); if (b) b.def.out = Math.min(1, b.def.out + dt / 1.2); }
    if (this.session) this.updateBoarding(dt);
    this.host.composite.update();
  }

  private updateBoarding(dt: number) {
    const se = this.session!, A = this.ship, B = this.target!.ship;
    this.phaseT += dt;
    switch (se.phase) {
      case 'hooks': {
        for (let i = 0; i < 3; i++) this.fx.setRopeProgress(`hook-${i}`, (this.phaseT - i * 0.18) / 0.9);
        A.furl(dt); B.furl(dt);
        if (this.phaseT > 1.6) this.setPhase('pulling');
        break;
      }
      case 'pulling': {
        // Zug in fester Zeit (3 bis 6,5 s): beide Schiffe gleiten auf ihre Endlage, der Gegner dreht früher ein; die Taue spannen sich
        A.furl(dt); B.furl(dt);
        if (!this.pull) this.pull = planPull(A, B);
        const pl = this.pull;
        pl.t += dt;
        const u = clamp01(pl.t / pl.T);
        const q = pullPose(pl, u);
        this.moveShip(A, q.ax, q.az, A.heading);
        this.moveShip(B, q.bx, q.bz, q.bh);
        for (let i = 0; i < 3; i++) this.fx.setRopeDroop(`hook-${i}`, 0.55 * (1 - q.p) + 0.03);
        // Kurz vor dem Ende: die Rümpfe stoßen aneinander (Ruck und Ton, einmal)
        if (u > 0.93 && !pl.bumped) {
          pl.bumped = true;
          const side = this.sideOf(A, B);
          A.kick(-side * 0.03); B.kick(side * 0.03);
          this.host.bump?.((A.x + B.x) / 2, A.model.deckY, (A.z + B.z) / 2);
        }
        if (u >= 1) {
          this.moveShip(A, pl.af.x, pl.af.z, A.heading);
          this.moveShip(B, pl.bf.x, pl.bf.z, pl.hB);
          this.pull = null;
          this.setPhase('bridging');
          this.buildBridges();
        }
        break;
      }
      case 'bridging': {
        A.furl(dt); B.furl(dt);
        this.stagger += dt;
        let all = true;
        this.bridgeIds.forEach((id, i) => {
          const b = this.host.composite.bridge(id);
          if (!b) return;
          if (this.stagger > i * 0.4) b.def.out = Math.min(1, b.def.out + dt / 0.9);
          if (b.def.out < 0.999) all = false;
        });
        if (all && this.bridgeIds.length) this.setPhase('fight');
        break;
      }
      case 'fight': break;
      case 'retracting': {
        let all = true;
        for (const id of this.bridgeIds) { const b = this.host.composite.bridge(id); if (b && b.def.out > 0.001) { b.def.out = Math.max(0, b.def.out - dt / 0.9); all = false; } }
        for (let i = 0; i < 3; i++) this.fx.setRopeProgress(`hook-${i}`, 1 - Math.min(1, this.phaseT / 1.2));
        if (all && this.phaseT > 1.2) this.finishBoarding();
        break;
      }
      default: break;
    }
  }

  /** Alles vom Enterkampf abbauen (Brücken, Haken, Taue, Ziel-Deck) */
  private finishBoarding() {
    this.pull = null;
    for (const id of this.bridgeIds) { this.host.composite.removeBridge(id); this.fx.removeBridge(id); }
    this.bridgeIds.length = 0;
    for (const id of this.lines.filter((l) => l.startsWith('hook-'))) this.fx.removeRope(id);
    this.lines = this.lines.filter((l) => !l.startsWith('hook-'));
    this.ship.calmTo = this.dock ? 1 : 0;
    this.closeRail();
    this.target = null;
    this.host.composite.setDecks(this.host.ownDeck());
    const se = this.session;
    if (se) se.phase = 'done';
    this.session = null;
    this.host.onBoard('done');
  }

  /** Zum Rendern: Matrizen der beteiligten Schiffe auffrischen und Brücken/Taue nachführen (aus der aktuellen Lage der Rümpfe) */
  frame(dt: number) {
    if (!this.fx.active && !this.dock && !this.session) return;
    this.ship.model.group.updateMatrixWorld(true);
    this.target?.ship.model.group.updateMatrixWorld(true);
    this.host.composite.update();
    this.fx.update(dt);
  }

  /** Aktuelle Neigung der steilsten begehbaren Brücke in Grad (für Prüfung und Anzeige) */
  get steepestDeg(): number {
    let m = 0;
    for (const b of this.host.composite.bridges) if (b.walk && b.ok && b.def.kind !== 'wade') m = Math.max(m, slopeDeg(b.f));
    return m;
  }

  /** Harter Abbau (Spiel zurücksetzen, Schiff gesunken, Weltwechsel) */
  reset() {
    this.pull = null;
    this.climbing = null;
    this.closeRail();
    this.removeLines();
    this.fx.clear();
    this.host.composite.clearBridges();
    this.bridgeIds.length = 0;
    this.gangId = this.ladderBridge = this.wadeBridge = '';
    if (this.target) { this.target.ship.calmTo = 0; this.target = null; }
    this.session = null;
    const s = this.ship;
    s.moored = null; s.calmTo = 0;
    this.berth = null;
    this.host.composite.setDecks(this.host.ownDeck());
  }

  dispose() { this.reset(); this.fx.dispose(); }
}
