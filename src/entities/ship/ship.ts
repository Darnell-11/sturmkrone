import { updateClothFlag } from '../../render/flagCloth';
import { CircleGeometry, Color, Euler, MathUtils, Mesh, MeshBasicMaterial, Vector3, type Object3D, type Scene } from 'three';
import { AMMO, SEA_SPEED, SHIP_CLASSES, type AmmoId, type ShipClass, type ShipLook } from '../../data/ships';
import { troopCapacity } from '../../data/crewTiers';
import { buildShip, CABIN_WINDOW, GLOW_LAMP, type ShipModel } from './shipBuilder';
import { glowHub, makeEmitter } from '../../render/glow';
import { disposeObject, markShared } from '../../render/dispose';
import { wetShared } from '../../render/wetness';
import type { SailUniforms } from '../../render/flags';
import { mintEntityId, type EntityId } from '../../sim/entityId';
import type { CrewRefillIntent, SailRepairIntent } from '../../sim/intents';
import type { DockingState } from '../../world/docking';
import {
  applyDamage, applyStorm, boardingStrength, createShipSim, crewEffects, crewFrac, enterPhaseCheck, finishingBlow, missingHeads, poolHeads, refillCrew, sailFrac, sailPerformance,
  setCrewFrac, setPoolHeads, type BoardingStrength, startRepair, stepPassiveRepair, stepRepair, stepSailSet, type CrewEffects, type SailPerformance, type ShipSimState,
} from '../../naval/shipSim';
import { wrapAngle } from '../../core/mathUtil';
import { clamp01 } from '../../core/mathUtil';

export interface SeaEnv {
  heightAt(x: number, z: number): number;
  windDir: number;
  windStrength: number;
  /** Sturmstärke 0 … 1 (Wellenhöhe über dem Regenwetter): reißt gesetztes Tuch ein */
  storm?: number;
  time: number;
  /** Sonnenrichtung (zeigt zur Sonne) und Sichtbarkeit 0 … 1: Licht scheint durch die Segel */
  sunDir?: { x: number; y: number; z: number };
  sunVis?: number;
}

const _sc = new Color();
const _eu = new Euler();
const _pv = new Vector3();

const HOLE_MAT = markShared(new MeshBasicMaterial({ color: 0x1b1410, side: 2 }));

/** Ein Schiff mit Fahrphysik, Schadenszonen und sichtbaren Schäden. */
export class Ship {
  /** Kennung dieses Schiffs (Schadens-, Reparatur- und Crew-Absichten sprechen es darüber an) */
  readonly entityId: EntityId;
  /** Serialisierbarer Zustand: Rumpf, Segel-HP, Crew je Schiff, gesetztes Tuch, Reparatur-Auftrag. Das Schiff stellt ihn nur dar. */
  readonly sim: ShipSimState;
  /** Wirkung der Crew und des Segelzustands (je Bild neu berechnet, ohne Zuweisungen) */
  readonly crewFx: CrewEffects = { reloadMult: 1, sailSetRate: 0, repairPerSec: 0, repairTime: 1 };
  readonly perf: SailPerformance = { speed: 1, accel: 1, turn: 1, drift: 0 };
  /** Rumpfpunkte je Sekunde zusätzlich (Schiffskoch), wirken nur mit genug Crew */
  repairBonus = 0;
  model: ShipModel;
  cls: ShipClass;
  x = 0;
  z = 0;
  heading = 0;
  speed = 0;
  /** Fahrstufe 0 = Anker, 1 = halbe, 2 = volle Fahrt */
  sailLevel = 1;
  /** Stufenloser Gashebel 0 … 1 (Spielerschiff); null = Fahrstufen der KI */
  throttle: number | null = null;
  /** Wendigkeit (Steuermann, Ausbauten) */
  turnMult = 1;
  /** Höchsttempo der KI-Schiffe (wie in 1.0 langsamer als der Spieler); null = frei */
  speedCap: number | null = null;
  fire = 0;
  reloadL = 0;
  reloadR = 0;
  ammo: AmmoId = 'kugel';
  sinking = 0;
  /** Faji-Effekte: eingefroren, Feuerpause */
  frozen = 0;
  ceasefire = 0;
  boost = 0;
  /** Faji-Schild (Stahlleib, Titanform, Unbeugsam auf See): Restdauer und Schadensminderung 0 … 1 */
  shield = 0;
  shieldK = 0;
  prev = { x: 0, z: 0, heading: 0 };
  /** Liegeplatz am Steg (nur Daten, siehe `world/docking.ts`); null = frei. Solange gesetzt, fährt das Schiff nicht. */
  moored: DockingState | null = null;
  /**
   * Enterphase: Gegner gehen durch Schaden nie unter, sondern bleiben mit 1 Rumpfpunkt liegen (Segel zerfetzt, Masten geknickt, Brand) und
   * sind besiegt, bis sie geentert oder durch einen weiteren Treffer des Spielers versenkt werden (Gnadenstoß).
   */
  canDisable = false;
  /** Auch der Gnadenstoß versenkt es nicht (Legenden, Marine-Kommandoschiffe, die zwei größten Klassen): nur Entern beendet den Kampf */
  noKill = false;
  disabled = false;
  /** Sekunden in der Enterphase (für das Ausbrennen nach langer Zeit ohne Spieler) */
  disabledFor = 0;
  /** Setzt auf wahr, wenn ein Mast aufschlägt (Wrackteile und Gischt, einmal abzuholen) */
  crashed = false;
  private fall = 0;
  private fallPlan: { up: Object3D; py: number; pz: number; roll: number; pitch: number }[] = [];
  /** Wellenberuhigung 0 … 1 (Anlegen, Heranziehen beim Entern): Nicken, Rollen und Auf und Ab klingen ab; `calmTo` ist das Ziel */
  calm = 0;
  calmTo = 0;
  private holes = 0;
  private turnInput = 0;
  /** Drehgeschwindigkeit (rad/s) mit Trägheit und Fahrtrichtung, die dem Bug hinterherhinkt (Abdrift in Kurven) */
  private yawRate = 0;
  /** Drehwinkel des Steuerrads (folgt dem Ruderausschlag mit Verzögerung) */
  private wheelA = 0;
  course = 0;
  private courseOk = false;
  /** Rückstoß der Breitseite: Stärke und Zeit seit dem Schuss */
  private recoilA = 0;
  private recoilT = 9;
  /** Wie das Schiff untergeht: Bug oder Heck voran, zur Seite kippend */
  private sinkPitch = 0;
  private sinkRoll = 0;

  /** Gischt auf dem Deck 0 … 1 (steigt bei schneller Fahrt in rauer See) */
  private spray = 0;
  /** Letzte dargestellte Lage und Tempo 0 … 1 (das Wasser zeichnet daraus Rumpfschaum und Bugwelle) */
  hullFx = { x: 0, z: 0, h: 0, speed: 0 };
  private ripple = 0;
  /** Gedämpfte Lage auf dem Wasser (Höhe, Neigung, Rollen) mit Geschwindigkeit: das Schiff folgt den Wellen mit Masse, statt jeder Welle sofort */
  private sm = { y: 0, p: 0, r: 0, vy: 0, vp: 0, vr: 0, init: false };

  /** hero: Spielerschiff – bekommt Laternenlichter und rechnet die Segel-Normalen jedes Bild neu */
  constructor(private scene: Scene, tier: number, public look: ShipLook, readonly faction: 'pirat' | 'marine', hullBonus = 0, private hero = false) {
    this.cls = SHIP_CLASSES[Math.max(0, Math.min(SHIP_CLASSES.length - 1, tier))];
    this.entityId = mintEntityId('ship');
    this.sim = createShipSim(this.entityId, this.cls.hp + hullBonus, this.cls.hp, this.cls.crew, hero ? troopCapacity(tier) : 0);
    this.model = buildShip(this.cls, look, hero);
    scene.add(this.model.group);
    this.glowLights();
  }

  /** Laternen des Schiffs als Lichtquellen anmelden (bewegen sich mit dem Schiff) */
  private glowLights() {
    for (const l of this.model.lanterns) glowHub.add(makeEmitter('lamp', 0, 0, 0, { obj: l, size: (l.userData.glowSize as number | undefined) ?? 0.62 * Math.min(1.5, this.cls.L / 28 + 0.55), owner: this, glint: !l.userData.glowSize }));
    // Fenster (Heckgalerie, Stückpforten) leuchten nachts: Hof an der Fläche, sichtbar nur, wenn das Schiff sie anzeigt
    for (const w of this.model.windows) if (!w.userData.noHalo) glowHub.add(makeEmitter('window', 0, 0, 0, { obj: w, size: 0.5, owner: this }));
  }

  get hull() { return this.sim.hull; }
  set hull(v: number) { this.sim.hull = v; }
  get maxHull() { return this.sim.maxHull; }
  set maxHull(v: number) { this.sim.maxHull = v; }
  /** Segelzustand 0 … 1 (Anteil der Segel-HP) */
  get sail() { return sailFrac(this.sim); }
  set sail(v: number) { this.sim.sail.hp = clamp01(v) * this.sim.sail.max; }
  /** Crew-% 0 … 1 */
  get crew() { return crewFrac(this.sim.crew); }
  set crew(v: number) { setCrewFrac(this.sim.crew, clamp01(v)); }
  /** Faktor auf die Nachladezeit der Geschütze nach Crew-% */
  get reloadScale() { return crewEffects(this.crew, this.crewFx).reloadMult; }

  /** Ruderausschlag −1 … 1 (für Steuerrad und Haltung des Steuermanns) */
  get steerAmount() { return this.turnInput; }
  get alive() { return this.hull > 0; }
  get length() { return this.cls.L; }
  get pos() { return new Vector3(this.x, 0, this.z); }

  /** Klasse oder Aussehen ändern (Werft) */
  rebuild(tier: number, look: ShipLook, hullBonus = 0) {
    const frac = this.hull / this.maxHull;
    const sailF = this.sail, crewF = this.crew;
    const troopsN = poolHeads(this.sim.crew, 'truppen');
    glowHub.removeOwner(this);
    disposeObject(this.model.group);
    this.cls = SHIP_CLASSES[tier];
    this.look = look;
    // Segel-HP und Crew-Höchstwerte folgen der neuen Klasse, die Anteile bleiben erhalten
    const fresh = createShipSim(this.entityId, this.cls.hp + hullBonus, this.cls.hp, this.cls.crew, this.hero ? troopCapacity(tier) : 0);
    this.sim.maxHull = fresh.maxHull;
    this.sim.hull = Math.max(1, this.sim.maxHull * frac);
    this.sim.sail = fresh.sail;
    this.sim.crew = fresh.crew;
    this.sim.repair = null;
    this.sail = sailF;
    this.crew = crewF;
    // Truppen bleiben als Köpfe erhalten (die neue Klasse kappt sie auf ihre Kapazität; ohne Truppenplätze gibt es keinen Pool)
    setPoolHeads(this.sim.crew, 'truppen', troopsN);
    this.model = buildShip(this.cls, look, this.hero);
    this.scene.add(this.model.group);
    this.glowLights();
    this.holes = 0;
    this.updateSailDamage();
  }

  /** Steuerung: throttle −1 … 1 ändert Fahrstufe nicht, turn −1 … 1 */
  steer(dt: number, turn: number, env: SeaEnv, speedMult = 1) {
    const pv = this.prev;
    pv.x = this.x; pv.z = this.z; pv.heading = this.heading;
    if (!this.alive) return;
    this.frozen -= dt;
    this.ceasefire -= dt;
    this.boost -= dt;
    this.shield -= dt;
    this.reloadL = Math.max(0, this.reloadL - dt);
    this.reloadR = Math.max(0, this.reloadR - dt);
    // Crew-% und Segelzustand bestimmen Setzen, Fahrt, Wendigkeit, Treiben und die passive Reparatur
    const sim = this.sim;
    const fx = crewEffects(this.crew, this.crewFx);
    const perf = sailPerformance(this.sail, this.perf);
    const level = this.throttle ?? [0, 0.55, 1][this.sailLevel];
    if (this.throttle !== null) this.sailLevel = level < 0.05 ? 0 : level < 0.75 ? 1 : 2;
    stepSailSet(sim, level, dt, fx);
    stepPassiveRepair(sim, dt, fx, this.repairBonus);
    if (env.storm) applyStorm(sim, dt, env.storm);
    this.tickRepair(dt);
    if (this.frozen > 0) { this.speed *= Math.pow(0.05, dt); return; }
    // Wind: Rückenwind schneller, Gegenwind etwas langsamer (Tempo wie in 1.0)
    const rel = Math.cos(this.heading - env.windDir);
    // wie in 1.0: das Tempo hängt nur vom Gashebel ab (der Wind wechselte sonst in jeder Kurve das Tempo)
    const windK = this.throttle !== null ? 1 : 0.96 + 0.24 * (rel * 0.5 + 0.5) + env.windStrength * 0.05;
    // Fläche des gesetzten Tuchs mal Leistung des Segelzustands (100 % = volle Fahrt, unter 30 % stark verlangsamt, 0 % treibt)
    const sailK = sim.sailSet * perf.speed;
    let target = this.cls.spd * SEA_SPEED * sailK * windK * speedMult * (this.boost > 0 ? 1.7 : 1);
    if (this.speedCap !== null) target = Math.min(target, this.speedCap);
    // Schwere Schiffe: je größer, desto träger beim Beschleunigen, Bremsen und Wenden (m: 0 Schaluppe … 1 Leviathan)
    const m = clamp01((this.cls.L - 15) / 59);
    this.speed += (target - this.speed) * Math.min(1, dt * (target < this.speed ? 0.45 : 0.62 * perf.accel) * (1.25 - 0.7 * m));
    // Wenden: Ruderausschlag baut Drehgeschwindigkeit nur langsam auf und ab; Kurven kosten Fahrt; zerfetztes Tuch lässt das Ruder ins Leere greifen
    this.turnInput += (turn - this.turnInput) * Math.min(1, dt * 4);
    const maxRate = (0.58 - 0.33 * m) * this.turnMult * perf.turn * (0.3 + 0.7 * Math.min(1, this.speed / 8));
    this.yawRate += (this.turnInput * maxRate - this.yawRate) * Math.min(1, dt * (1.5 - 0.8 * m));
    this.heading -= this.yawRate * dt;
    this.speed -= this.speed * Math.min(0.5, Math.abs(this.yawRate) * 0.07 * dt);
    // Die Fahrtrichtung folgt dem Bug mit Verzögerung: das Schiff schiebt in Kurven seitlich über das Wasser
    if (!this.courseOk) { this.course = this.heading; this.courseOk = true; }
    let dc = this.heading - this.course;
    dc = wrapAngle(dc);
    if (Math.abs(dc) > 1.0) { this.course = this.heading; dc = 0; }
    this.course += dc * Math.min(1, dt * (3.2 - 1.6 * m));
    this.x += Math.sin(this.course) * this.speed * dt;
    this.z += Math.cos(this.course) * this.speed * dt;
    // Ohne Segel treibt das Schiff mit dem Wind (im Sturm schneller); Bug und Ruder bleiben, wie sie sind
    if (perf.drift > 0) {
      const d = (0.35 + 1.7 * env.windStrength) * perf.drift * dt;
      this.x += Math.sin(env.windDir) * d;
      this.z += Math.cos(env.windDir) * d;
    }
    // Feuer frisst den Rumpf
    if (this.disabled) this.disabledFor += dt;
    else if (this.fire > 0) {
      this.fire -= dt; this.hull -= dt * this.maxHull * 0.012;
      if (enterPhaseCheck(this.sim, this.canDisable, this.disabled)) this.enterPhase();
    }
  }

  /**
   * Schiff liegt still (Spieler verlässt das Ruder oder geht an Land): Fahrt auf null und die Interpolationslage auf die
   * aktuelle setzen. Ohne das blieb `prev` eine Logikstufe hinter `x/z/heading` zurück, und die Darstellung sprang mit jedem
   * Bild zwischen alter und neuer Lage hin und her – das Schiff zitterte, solange es nicht gesteuert wurde.
   */
  settle() {
    this.speed = 0;
    this.yawRate = 0;
    this.turnInput = 0;
    this.course = this.heading;
    const pv = this.prev;
    pv.x = this.x; pv.z = this.z; pv.heading = this.heading;
  }

  /**
   * An einen neuen Ort setzen (Titelbild-Schnitt): Lage, Fahrtrichtung und die Federung auf den Wellen beginnen neu, damit nichts
   * nachfedert oder als Schlieren über das Wasser zieht. Die Fahrt bleibt, wie sie ist.
   */
  place(x: number, z: number, heading: number) {
    this.x = x; this.z = z; this.heading = heading;
    this.course = heading; this.courseOk = true;
    this.yawRate = 0; this.turnInput = 0;
    this.prev.x = x; this.prev.z = z; this.prev.heading = heading;
    this.sm.init = false;
  }

  /** Segel einholen (Festmachen): das gesetzte Tuch fährt auf null, auch wenn das Schiff nicht gesteuert wird */
  furl(dt: number) { stepSailSet(this.sim, 0, dt, crewEffects(this.crew, this.crewFx)); }

  /**
   * Schaden mit Munitionsart; liefert den Rumpfschaden. `zone` 'sail' = die Kugel traf das Tuch (Segel-HP sinken, Rumpf kaum),
   * 'hull' = Rumpf. Kettenkugeln zerfetzen Segel in beiden Zonen am stärksten.
   */
  damage(base: number, ammo: AmmoId, hitLocal: Vector3 | null, zone: 'hull' | 'sail' = 'hull'): number {
    if (!this.alive) return 0;
    // Enterphase: ein weiterer Treffer ist der Gnadenstoß (bei Schiffen, die nie untergehen, wirkungslos: nur Entern)
    // (die ersten 2 s zählen nicht: Kugeln derselben Breitseite, die noch fliegen, sind kein neuer Treffer)
    if (this.disabled) return this.disabledFor < 2 ? 0 : finishingBlow(this.sim, this.noKill) ? base : 0;
    if (this.shield > 0) base *= 1 - this.shieldK;
    const a = AMMO[ammo];
    const r = applyDamage(this.sim, base, a, zone);
    const hullDmg = r.hull;
    if (a.fire > 0 && Math.random() < 0.6) this.fire = Math.max(this.fire, 8);
    if (hitLocal && this.holes < 24 && a.hull >= 0.5) this.addHole(hitLocal);
    this.updateSailDamage();
    if (enterPhaseCheck(this.sim, this.canDisable, this.disabled)) this.enterPhase();
    return hullDmg;
  }

  /** Der Rumpf hat nichts mehr: Segel in Fetzen, ein bis zwei Masten knicken um, das Schiff brennt (Rauch und Flammen zeichnet die Seewelt) */
  enterPhase() {
    if (this.disabled) return;
    this.disabled = true;
    this.disabledFor = 0;
    this.sim.hull = 1;
    this.sim.sail.hp = 0;
    this.sim.sailSet = 0;
    this.fire = 1e9;
    this.speed *= 0.5;
    this.updateSailDamage();
    const masts = this.model.masts;
    // 1 bis 2 Masten knicken um (ein einziger Mast immer); die Takelage fällt mit weg
    const idx = masts.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, masts.length > 1 && (this.cls.L >= 30 || Math.random() < 0.5) ? 2 : 1);
    this.fallPlan = idx.map((i, k) => {
      const m = masts[i];
      return { up: m.up, py: m.pivotY, pz: m.z, roll: (k % 2 ? -1 : 1) * (Math.random() < 0.5 ? -1 : 1) * (1.0 + Math.random() * 0.45), pitch: (Math.random() - 0.5) * 0.6 };
    });
    if (this.fallPlan.length) this.model.rigging.visible = false;
    this.fall = 0;
  }

  /** Maststurz je Bild: die oberen Teile kippen beschleunigt um (Drehpunkt an der Bruchstelle) und schlagen auf */
  private stepFall(frameDt: number) {
    if (!this.disabled || this.fall >= 1 || !this.fallPlan.length) return;
    this.fall = Math.min(1, this.fall + frameDt / 1.5);
    const e = this.fall * this.fall;
    for (const f of this.fallPlan) {
      const up = f.up;
      _eu.set(f.pitch * e, 0, f.roll * e);
      up.rotation.copy(_eu);
      _pv.set(0, f.py, f.pz);
      up.position.copy(_pv).sub(_pv.clone().applyEuler(_eu));
    }
    if (this.fall >= 1) this.crashed = true;
  }

  private addHole(p: Vector3) {
    this.holes++;
    const side = p.x >= 0 ? 1 : -1;
    const z = MathUtils.clamp(p.z, -this.cls.L * 0.42, this.cls.L * 0.42);
    const hole = new Mesh(new CircleGeometry(0.25 + Math.random() * 0.25, 7), HOLE_MAT);
    hole.position.set(side * (this.model.halfWidth(z) + 0.03), this.model.deckY * (0.25 + Math.random() * 0.5), z);
    hole.rotation.y = side * Math.PI / 2;
    hole.userData.noOutline = true;
    this.model.group.add(hole);
  }

  /** Segelschäden an die Darstellung geben: Risse und Ruß im Tuch (Shader `uDmg`) und dunkleres Tuch */
  private updateSailDamage() {
    const dmg = 1 - this.sail;
    for (const s of this.model.sails) {
      const su = s.userData.sailU as SailUniforms | undefined;
      if (su) su.uDmg.value = dmg;
      const m = s.material as unknown as { color: Color };
      m.color.set(this.look.sail).lerp(_sc.set('#5A4A3A'), dmg * 0.45);
    }
  }

  /** Rückstoß einer Breitseite (Vorzeichen = feuernde Seite) */
  kick(a: number) {
    this.recoilA = a;
    this.recoilT = 0;
  }

  /** Werft oder Notreparatur: Rumpf und Segel-HP um einen Anteil auffüllen, Feuer löschen */
  repair(frac: number) {
    this.sinkPitch = 0;
    this.sinkRoll = 0;
    this.sim.hull = Math.min(this.maxHull, this.hull + this.maxHull * frac);
    this.sim.sail.hp = Math.min(this.sim.sail.max, this.sim.sail.hp + this.sim.sail.max * frac);
    this.sim.repair = null;
    this.fire = 0;
    this.updateSailDamage();
  }

  /** Reparatur-Absicht (Segeltuch, Holz, Notsegel, Werft). Auf See dauert sie je nach Crew; liefert, ob sie begonnen wurde. */
  requestRepair(intent: SailRepairIntent): boolean {
    const ok = startRepair(this.sim, intent, crewEffects(this.crew, this.crewFx));
    if (ok && intent.material === 'hafen') { this.fire = 0; this.updateSailDamage(); }
    return ok;
  }

  /** Laufende Reparatur auf See vorrücken; liefert das Ergebnis, sobald sie fertig ist (für Meldung und Effekte) */
  tickRepair(dt: number) {
    const r = stepRepair(this.sim, dt);
    if (r) { this.updateSailDamage(); this.onRepaired?.(r); }
    return r;
  }
  /** Wird aufgerufen, wenn eine Reparatur fertig ist (setzt die Welt für Meldung, Ton, Funken) */
  onRepaired: ((r: { sail: number; hull: number }) => void) | null = null;

  /** Crew aufstocken (Taverne, Hafen); liefert die angeheuerten Köpfe */
  requestCrewRefill(intent: CrewRefillIntent): number { return refillCrew(this.sim.crew, intent); }
  get missingCrew() { return missingHeads(this.sim.crew, 'matrosen'); }
  /** Truppen-Köpfe an Bord (0 ohne Truppenplätze) und Kapazität */
  get troopHeads() { return poolHeads(this.sim.crew, 'truppen'); }
  get troopMax() { return this.sim.crew.pools.truppen?.max ?? 0; }
  /** Truppen-Köpfe setzen (Anheuern, Rückkehr aus dem Gefecht, Spielstand); höchstens bis zur Kapazität */
  setTroopHeads(n: number) { setPoolHeads(this.sim.crew, 'truppen', n); }
  /** Enterkraft der Truppen (Schaden und Trefferpunkte der eigenen Enterer) */
  get boarding(): BoardingStrength { return boardingStrength(this.sim.crew, this.boardingTmp); }
  private boardingTmp: BoardingStrength = { heads: 0, frac: 0, damage: 1, hp: 1 };
  /** Mindestbesatzung (z. B. nach dem Untergang): hebt die Crew auf diesen Anteil, wenn sie darunter liegt */
  ensureCrew(f: number) { if (this.crew < f) this.crew = f; }

  /** Darstellung: auf Wellen setzen, Segel blähen, Flagge flattern, sinken */
  render(alpha: number, env: SeaEnv, night: number, frameDt: number) {
    const x = MathUtils.lerp(this.prev.x, this.x, alpha);
    const z = MathUtils.lerp(this.prev.z, this.z, alpha);
    const h = this.prev.heading + (this.heading - this.prev.heading) * alpha;
    const L = this.cls.L, W = this.cls.W;
    this.stepFall(frameDt);
    const fx = Math.sin(h), fz = Math.cos(h);
    this.hullFx.x = x; this.hullFx.z = z; this.hullFx.h = h;
    this.hullFx.speed = this.sinking > 0 ? 0 : clamp01((this.speed - 0.5) / 9);
    const wy = env.heightAt(x, z);
    const ahead = env.heightAt(x + fx * L * 0.4, z + fz * L * 0.4);
    const behind = env.heightAt(x - fx * L * 0.4, z - fz * L * 0.4);
    const sideA = env.heightAt(x + fz * W * 0.45, z - fx * W * 0.45);
    const sideB = env.heightAt(x - fz * W * 0.45, z + fx * W * 0.45);
    const g = this.model.group;
    if (this.sinking > 0) {
      if (this.sinking <= 0.02 && this.sinkPitch === 0) {
        // jedes Wrack geht anders unter: mal sticht der Bug in die Tiefe, mal ragt er in den Himmel
        this.sinkPitch = (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.4);
        this.sinkRoll = (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.35);
      }
      this.sinking += frameDt;
    }
    const sink = this.sinking > 0 ? this.sinking : 0;
    // erst langsam vollaufen, dann immer schneller wegsacken
    const depth = sink * 0.35 + sink * sink * 0.16;
    const tilt = Math.min(1, sink / 5.5);
    const m = clamp01((L - 15) / 59);
    // Festgemacht oder herangezogen: Seegang klingt ab (Höhe zur ruhigen Wasserlinie, Neigung und Rollen gegen null)
    this.calm += (this.calmTo - this.calm) * Math.min(1, frameDt * 1.4);
    const calmK = 1 - 0.88 * this.calm;
    const tgtY = -0.25 + ((ahead + behind) / 2 * 0.6 + wy * 0.4) * (1 - 0.85 * this.calm);
    // Bug hebt sich mit Fahrt (Gleiten), das Heck sackt leicht ein
    const lift = Math.min(1, this.speed / 14);
    const tgtP = (Math.atan2(behind - ahead, L * 0.8) - lift * 0.02) * calmK;
    const tgtR = Math.atan2(sideA - sideB, W * 0.9) * 0.8 * calmK;
    const sm = this.sm;
    if (!sm.init) { sm.y = tgtY; sm.p = tgtP; sm.r = tgtR; sm.vy = sm.vp = sm.vr = 0; sm.init = true; }
    // Federn: je größer das Schiff, desto träger (Eigenfrequenz 2,6 → 1,2 rad/s), leicht unterdämpft für weiches Nachschwingen
    {
      const dt = Math.min(frameDt, 1 / 30);
      const w0 = 2.6 - 1.4 * m, c = 2 * 0.8 * w0, k = w0 * w0;
      sm.vy += (k * (tgtY - sm.y) - c * sm.vy) * dt; sm.y += sm.vy * dt;
      sm.vp += (k * (tgtP - sm.p) - c * sm.vp) * dt; sm.p += sm.vp * dt;
      sm.vr += (k * (tgtR - sm.r) - c * sm.vr) * dt; sm.r += sm.vr * dt;
      if (Math.abs(tgtY - sm.y) > 4) { sm.y = tgtY; sm.vy = 0; }
    }
    g.position.set(x, sm.y - depth, z);
    this.recoilT += frameDt;
    const recoil = this.recoilA * Math.exp(-2.4 * this.recoilT) * Math.cos(this.recoilT * 6.5);
    const pitch = sm.p + this.sinkPitch * tilt * tilt;
    const roll = sm.r - (this.yawRate * 0.22 + this.turnInput * 0.05) * Math.min(1, this.speed / 10) + this.sinkRoll * tilt - recoil;
    g.rotation.set(pitch, h, roll, 'YXZ');
    // Steuerrad dreht mit dem Ruder: voller Ausschlag etwa 140°, mit leichtem Nachlauf wie beim echten Rad
    this.wheelA += (this.turnInput * 2.4 - this.wheelA) * Math.min(1, frameDt * 7);
    this.model.wheel.rotation.z = this.wheelA;
    // Segel: Fahrstufe und Wind
    // Segel wachsen stufenlos mit dem Gashebel (springen nicht mehr zwischen drei Größen)
    // (gesetztes Tuch folgt dem Gashebel so schnell, wie die Crew arbeitet; zerfetztes Tuch hängt kürzer)
    const k = (0.15 + this.sim.sailSet * 0.85) * (0.35 + 0.65 * this.sail);
    const wind = env.windStrength;
    const gust = 0.5 + 0.5 * Math.sin(env.time * 0.9 + this.x * 0.01);
    this.ripple += frameDt * (2.2 + wind * 3.5);
    for (const s of this.model.sails) {
      s.scale.set(1, Math.max(0.15, k), 0.6 + k * 0.5 + Math.sin(env.time * 2 + s.position.y) * 0.05);
      // Windbiegung: Bauch, Wellen und Kantenflattern laufen im Vertex-Shader (render/flags.ts, sailMaterial); hier nur die Uniforms
      const su = s.userData.sailU as SailUniforms | undefined;
      if (!su) continue;
      su.uRip.value = this.ripple;
      su.uGust.value = gust;
      su.uAmp.value = (0.05 + wind * 0.16) * (this.cls.L / 15) * (1.1 - k * 0.5);
      // Stoff-Durchleuchtung: Steht die Sonne hinter dem Tuch, glüht es warm (tiefe Sonne mehr als hohe)
      const m = s.material as unknown as { emissive?: Color; color: Color };
      if (m.emissive && env.sunDir) {
        const sd = env.sunDir;
        const hl = Math.hypot(sd.x, sd.z) || 1;
        const facing = Math.abs((sd.x * fx + sd.z * fz) / hl);
        const sss = (env.sunVis ?? 0) * (0.1 + 0.42 * facing) * (1.15 - Math.min(1, Math.abs(sd.y)) * 0.6);
        m.emissive.copy(m.color).multiplyScalar(sss).lerp(_sc.setRGB(1, 0.62, 0.3), 0.18 * sss);
      }
    }
    // Flaggen: scheinbarer Wind (Wetter-Wind minus Fahrtwind) streckt das Tuch und schwenkt es um den Mast; im Gegenlicht glüht das Tuch warm
    for (const f of this.model.flags) {
      updateClothFlag(f, frameDt, h, env.windDir, wind, this.sinking > 0 ? 0 : this.speed);
      if (env.sunDir) {
        const sd = env.sunDir;
        const hl = Math.hypot(sd.x, sd.z) || 1;
        const side = Math.abs((sd.x * fz - sd.z * fx) / hl);
        f.mat.emissive.setScalar((env.sunVis ?? 0) * (0.05 + 0.4 * side) * (1.15 - Math.min(1, Math.abs(sd.y)) * 0.6) * 0.55);
      }
    }
    // Deck: Gischt bei Fahrt in rauer See und Regen machen die Planken dunkel und nass
    this.spray = clamp01(this.spray + frameDt * (Math.min(1, this.speed / 12) * (0.1 + env.windStrength * 0.7) - 0.06));
    const wet = Math.max(this.spray, wetShared.uWet.value * 0.9);
    const dm = this.model.deckMat as unknown as { color: Color };
    dm.color.copy(this.model.deckBase).multiplyScalar(1 - 0.4 * wet);
    // Laternen: warmes Punktlicht bei Dämmerung und Nacht, leicht flackernd
    for (let i = 0; i < this.model.lights.length; i++) {
      const l = this.model.lights[i];
      const nightK = clamp01((night - 0.15) / 0.6);
      l.intensity = nightK * (28 + 7 * Math.sin(env.time * 7.3 + i * 2.1) * Math.sin(env.time * 3.1 + i)) * (this.cls.L / 20);
    }
    // Flagge: weht im Vertex-Shader (render/flags.ts), hier nichts zu tun
    for (const l of this.model.lanterns) l.scale.setScalar(0.7 + night * 0.8);
    // Flamme tagsüber gedämpft (sonst brennt sie in der Mittagssonne weiß aus und blüht im Bloom), nachts voll
    CABIN_WINDOW.color.setRGB(0.8, 0.95, 1.2).multiplyScalar(1 - 0.94 * Math.min(1, night * 1.5));
    GLOW_LAMP.color.setRGB(4, 2.4, 0.9).multiplyScalar(0.28 + 0.72 * Math.min(1, night * 1.6));
    for (const w of this.model.windows) w.visible = night > 0.25;
  }

  /** Schiff aus der Szene nehmen und seinen Grafikspeicher freigeben */
  dispose() { glowHub.removeOwner(this); disposeObject(this.model.group); }
}
