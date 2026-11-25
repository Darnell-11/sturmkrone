import { ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, Vector3, type Scene } from 'three';
import { randomLook, sanitizeLook } from '../data/characterParts';
import { CREW_BY_ID, type CrewDef } from '../data/crew';
import { formationSlot, MAX_SQUADS } from '../data/crewTiers';
import { planSquads, TROOPS, rosterTotal, type CommandState, type TroopRoster } from '../data/troops';
import { followSlotPos, TroopSquad, type SoftBody, type TroopWorld } from '../entities/troops/squad';
import { TroopRenderer, type TroopView } from '../entities/troops/troopRender';
import { Ally, type AllyTarget } from '../entities/ally';
import type { CharacterAssets } from '../entities/character/assets';
import { Character } from '../entities/character/character';
import type { Ship } from '../entities/ship/ship';
import { addOutlines } from '../render/outline';
import { disposeObject } from '../render/dispose';
import { toon } from '../render/toon';
import type { Ground } from './islandGround';
import { gateKeepOut, type Route } from './docking';
import { seeded } from './waves';
import type { AnimRole } from '../data/animations';
import { pickOne, wrapAngle } from '../core/mathUtil';

/** Tätigkeit an Deck: Animation, Blickrichtung (zur Reling, zum Mast, frei) und Dauer in Sekunden */
interface Task { anim: AnimRole; face: 'out' | 'mast' | 'free'; min: number; max: number; loop: boolean }

interface DeckHand {
  def: CrewDef; char: Character | null; cat: Group | null; tail: Mesh | null; acc: number;
  /** Standort-Anker und Bordseite (+1 / −1) im Schiffskoordinatensystem */
  home: Vector3; side: number;
  /** Blickrichtung (Gierwinkel im Schiffskoordinatensystem) während der Tätigkeit */
  yaw: number;
  /** Restzeit der Tätigkeit, aktuelle Aufgabe, Gehziel (nur beim Gehen), Restzeit des Sprechens */
  t: number; task: Task; walking: boolean; goal: Vector3; speak: number;
}

const WALK_SPEED = 1.1;

const T = (anim: AnimRole, face: Task['face'] = 'out', min = 5, max = 11, loop = true): Task => ({ anim, face, min, max, loop });

/** Was jedes Crewmitglied an Deck tut (zufällig gewählt; ab und zu gehen sie zu einem neuen Platz) */
const DECK_TASKS: Record<string, Task[]> = {
  cook: [T('work', 'mast', 8, 14), T('interact', 'mast', 2.5, 3.5, false), T('work', 'mast', 6, 10)],
  nav: [T('idleLong', 'out', 6, 10), T('interact', 'mast', 2.5, 3.5, false), T('work', 'mast', 6, 10)],
  gun: [T('interact', 'out', 2.5, 3.5, false), T('pickup', 'out', 2.5, 3.5, false), T('work', 'out', 6, 10), T('idle', 'out', 3, 6)],
  bruno: [T('interact', 'out', 2.5, 3.5, false), T('work', 'out', 6, 10), T('pickup', 'out', 2.5, 3.5, false), T('idle', 'out', 3, 6)],
  carp: [T('hammer', 'out', 7, 13), T('pickup', 'out', 2.5, 3.5, false), T('work', 'out', 5, 9)],
  schmied: [T('hammer', 'mast', 7, 13), T('work', 'mast', 5, 9), T('pickup', 'mast', 2.5, 3.5, false)],
  look: [T('idleLong', 'out', 7, 12), T('wave', 'out', 2.5, 3.5, false), T('idle', 'out', 4, 8)],
  arzt: [T('work', 'mast', 6, 10), T('idle', 'free', 3, 6), T('interact', 'mast', 2.5, 3.5, false)],
  musik: [T('cheer', 'free', 5, 9), T('wave', 'free', 2.5, 3.5, false), T('idle', 'free', 3, 6)],
  helm: [T('idle', 'out', 4, 8), T('interact', 'out', 2.5, 3.5, false), T('idleLong', 'out', 5, 9)],
  kiko: [T('work', 'out', 6, 10), T('pickup', 'out', 2.5, 3.5, false), T('sitFloor', 'out', 8, 14)],
  ram: [T('pushups', 'free', 8, 14), T('idle', 'free', 3, 5), T('taunt', 'free', 2.5, 3.5, false)],
  lehrer: [T('sitFloor', 'free', 12, 22), T('idleLong', 'out', 5, 9)],
  esra: [T('work', 'mast', 8, 14), T('pickup', 'mast', 2.5, 3.5, false), T('interact', 'mast', 2.5, 3.5, false)],
  tomo: [T('sitFloor', 'out', 12, 22), T('idle', 'out', 4, 7), T('pickup', 'out', 2.5, 3.5, false)],
};
const DEFAULT_TASKS: Task[] = [T('work', 'out', 6, 10), T('pickup', 'out', 2.5, 3.5, false), T('interact', 'mast', 2.5, 3.5, false), T('idle', 'out', 3, 6)];

const tasksOf = (d: DeckHand) => DECK_TASKS[d.def.id] ?? DEFAULT_TASKS;

/** Punkt (x,z) frei von festen Aufbauten (mit Abstand)? */
function freeSpot(blockers: { cx: number; cz: number; hx: number; hz: number }[], x: number, z: number, margin: number) {
  for (const b of blockers) if (Math.abs(x - b.cx) < b.hx + margin && Math.abs(z - b.cz) < b.hz + margin) return false;
  return true;
}

/** Winkel sanft (kürzester Weg) auf das Ziel zudrehen */
function turnToward(o: { rotation: { y: number } }, target: number, k: number) {
  const d = wrapAngle(target - o.rotation.y);
  o.rotation.y += d * Math.min(1, k);
}

/** Die Crew an Deck (sichtbar, arbeitet, mit Sprüchen) und der Landtrupp im Kampf. */
/** Enterkraft-Faktoren der Truppen für die eigenen Offiziere (aus `boardingStrength`) */
export interface BoardingMult { damage: number; hp: number }

/** Beiboot zum Strand (Küste ohne Steg): Start am Schiff, Ziel der Strand. Über Stege und Enterbrücken gehen Trupps zu Fuß (`CrossingPlan`). */
export interface LandingPlan { fromX: number; fromZ: number; fromY: number; boat: boolean }

/** Wechsel zu Fuß über Gangway, Planken oder Leitern: je Figur ein Laufweg aus dem Schiffsdeck (null = keine Brücke frei) */
export interface CrossingPlan { routeFor(index: number): Route | null }

const _slotPos = { x: 0, z: 0 };

export class CrewAboard {
  private deck: DeckHand[] = [];
  allies: Ally[] = [];
  /** Massentruppen im Gefecht (Stufe 2) und ihre Darstellung */
  squads: TroopSquad[] = [];
  private squadViews: TroopView[] = [];
  private boatHold: number[] = [];
  private worldTroops: TroopRenderer | null = null;
  private deckTroops: TroopRenderer | null = null;
  private deckViews: TroopView[] = [];
  private soft: SoftBody[] = [];
  /** Letzter Befehl an Offiziere und Trupps */
  command: CommandState = 'sturm';
  private lineT = 10;
  private ship: Ship | null = null;
  /** Feste Aufbauten plus der freizuhaltende Zugang (Gangway/Leiter) auf beiden Seiten: dort stehen und gehen weder Crew noch Truppen */
  private obst: { cx: number; cz: number; hx: number; hz: number }[] = [];
  private obstFor: object | null = null;

  constructor(private assets: CharacterAssets, private outline: boolean) {}

  /** Arbeitsbereich an Deck (Schiffs-z): hinter dem Achterdeck-Aufgang bis vor das Vorderkastell */
  private zone(ship: Ship) {
    const q = ship.model.quarter, L = ship.cls.L;
    return { lo: q ? q.z1 + q.stairLen + 1.0 : -L / 2 + L * 0.28, hi: ship.model.fore ? ship.model.fore.z0 - ship.model.fore.stairLen - 1.0 : L * 0.4 };
  }

  /** Hindernisse für Standplätze und Laufwege an Deck (feste Aufbauten + Gangway-Zugang) */
  private obstacles(ship: Ship) {
    if (this.obstFor !== ship.model) { this.obstFor = ship.model; this.obst = [...ship.model.blockers, ...gateKeepOut(ship.model, ship.cls.L)]; }
    return this.obst;
  }

  /** Crew auf das (neu gebaute) Schiff stellen; `roster` = Massentruppen an Bord (stehen in Gruppen an Deck, siehe `setDeckTroops`) */
  setDeck(ship: Ship, hired: string[], roster: TroopRoster = {}) {
    for (const d of this.deck) { d.char?.dispose(); disposeObject(d.cat); }
    this.deck = [];
    this.ship = ship;
    this.setDeckTroops(ship, roster);
    const g = ship.model.group;
    const y = ship.model.deckY;
    const { lo, hi } = this.zone(ship);
    const n = hired.length;
    hired.forEach((id, i) => {
      const def = CREW_BY_ID[id];
      if (!def) return;
      // Platz: abwechselnd Backbord/Steuerbord, auf zwei Bahnen, über den Arbeitsbereich verteilt – nicht in Masten, Fässern oder der Luke
      const side = i % 2 ? 1 : -1;
      const lane = Math.floor(i / 2) % 2 ? 0.34 : 0.56;
      let z = lo + ((i + 0.5) / Math.max(1, n)) * (hi - lo);
      let x = side * ship.model.halfWidth(z) * lane;
      for (let k = 0; k < 70 && !freeSpot(this.obstacles(ship), x, z, 0.45); k++) {
        z = Math.max(lo, Math.min(hi, z + (k % 2 ? -1 : 1) * 0.2 * (1 + Math.floor(k / 2))));
        x = side * ship.model.halfWidth(z) * lane;
      }
      const p = new Vector3(x, y, z);
      if (def.cat) {
        const cat = buildCat();
        cat.position.set(p.x * 0.6, y + 0.02, p.z);
        cat.rotation.y = Math.random() * Math.PI * 2;
        g.add(cat);
        this.deck.push({ def, char: null, cat, tail: cat.userData.tail, acc: 0, home: p, side, yaw: 0, t: 0, task: DEFAULT_TASKS[0], walking: false, goal: p.clone(), speak: 0 });
        return;
      }
      const look = sanitizeLook({ ...randomLook(seeded(def.id.length * 977 + def.name.charCodeAt(0)), 'pirat'), ...(def.look ?? {}) }, 'pirat');
      const c = new Character(this.assets, look, this.outline);
      c.holder.position.copy(p);
      c.holder.scale.setScalar(def.big ?? 1);
      g.add(c.holder);
      const d: DeckHand = { def, char: c, cat: null, tail: null, acc: Math.random() * 0.1, home: p, side, yaw: 0, t: 0, task: DEFAULT_TASKS[0], walking: false, goal: p.clone(), speak: 0 };
      this.deck.push(d);
      this.startTask(d, pickOne(tasksOf(d)), true);
    });
    // Wird das Deck neu aufgebaut, während Offiziere im Einsatz sind (Treue, Anheuern, Umbau), dürfen ihre Deck-Kopien nicht wieder erscheinen
    // (sonst stehen sie doppelt da: einmal im Kampf, einmal an Deck bei ihren Gesten)
    this.hideDeckHands(true);
  }

  /** Neue Tätigkeit beginnen: Blick zur Reling oder zum Mast, Animation, Dauer auswürfeln */
  private startTask(d: DeckHand, task: Task, first = false) {
    const c = d.char;
    if (!c) return;
    d.task = task;
    d.walking = false;
    d.t = task.min + Math.random() * (task.max - task.min);
    // beim Start zeitversetzt, damit nicht alle im Gleichschritt arbeiten
    if (first) d.t *= 0.2 + Math.random() * 0.8;
    const jitter = (Math.random() - 0.5) * 0.5;
    d.yaw = task.face === 'out' ? d.side * Math.PI / 2 + jitter : task.face === 'mast' ? -d.side * Math.PI / 2 + jitter : Math.random() * Math.PI * 2;
    c.play(task.anim, { fade: first ? 0.01 : 0.25, restart: true, loop: task.loop });
    if (first) c.holder.rotation.y = d.yaw;
  }

  /** Zu einem neuen Platz in der Nähe gehen – nur wenn Ziel und Weg frei von Aufbauten sind */
  private tryWalk(d: DeckHand): boolean {
    const c = d.char, ship = this.ship;
    if (!c || !ship) return false;
    const { lo, hi } = this.zone(ship);
    for (let k = 0; k < 6; k++) {
      const z = Math.max(lo, Math.min(hi, d.home.z + (Math.random() - 0.5) * 6));
      const x = d.side * ship.model.halfWidth(z) * (0.34 + Math.random() * 0.26);
      if (Math.hypot(x - d.home.x, z - d.home.z) < 1.2 || !freeSpot(this.obstacles(ship), x, z, 0.5)) continue;
      const px = c.holder.position.x, pz = c.holder.position.z;
      let ok = true;
      for (let s = 1; s <= 5 && ok; s++) ok = freeSpot(this.obstacles(ship), px + ((x - px) * s) / 5, pz + ((z - pz) * s) / 5, 0.35);
      if (!ok) continue;
      d.goal.set(x, d.home.y, z);
      d.walking = true;
      c.play('walk', { fade: 0.25 });
      c.setLocoSpeed(WALK_SPEED);
      return true;
    }
    return false;
  }

  /**
   * Landtrupp an Land oder aufs Enterdeck bringen. `party` = die Offiziere, die auf dieser Schiffsklasse mitkämpfen (höchstens `officerSlots`),
   * Aufstellung für bis zu 5 Plätze (`formationSlot`); `strength` = Enterkraft aus dem Truppen-Pool.
   */
  spawnAllies(scene: Scene, party: string[], level: number, loyalty: Record<string, number>, x: number, z: number, yaw: number, ground: Ground, buffMult: number, strength: BoardingMult = { damage: 1, hp: 1 }, cross?: CrossingPlan) {
    this.clearAllies();
    party.forEach((id, i) => {
      const def = CREW_BY_ID[id];
      if (!def || def.cat) return;
      const a = new Ally(this.assets, def, level, loyalty[id] ?? 0, i, this.outline);
      a.buffMult = buffMult * strength.damage;
      if (strength.hp !== 1) a.scaleHp(strength.hp);
      const route = cross?.routeFor(i) ?? null;
      const hand = route ? this.handWorld(id) : null;
      if (hand) {
        // der Offizier verlässt seinen Platz an Deck und läuft über die Brücke (kein Versetzen)
        a.place(hand.x, hand.z, yaw, ground);
      } else {
        const { side, back } = formationSlot(i);
        const c = ground.constrain(x - Math.sin(yaw) * back + Math.cos(yaw) * side * 1.6, z - Math.cos(yaw) * back - Math.sin(yaw) * side * 1.6, 0.45);
        a.place(c.x, c.z, yaw, ground);
      }
      a.command(this.command);
      if (route) a.startRoute(route);
      scene.add(a.char.holder);
      this.allies.push(a);
    });
    this.hideDeckHands(true);
  }

  /** Weltposition einer Deck-Person (Schiffskoordinaten der Figur → Welt); null, wenn sie nicht an Deck steht */
  private handWorld(id: string): { x: number; z: number } | null {
    const ship = this.ship;
    if (!ship) return null;
    for (const d of this.deck) {
      if (d.def.id !== id || !d.char) continue;
      const p = d.char.holder.position, c = Math.cos(ship.heading), s = Math.sin(ship.heading);
      return { x: ship.x + p.x * c + p.z * s, z: ship.z - p.x * s + p.z * c };
    }
    return null;
  }

  /** Deck-Personen, die gerade als Offiziere unterwegs sind, an Deck ausblenden (sonst stünden sie doppelt da) */
  private hideDeckHands(hide: boolean) {
    const out = new Set(hide ? this.allies.map((a) => a.def.id) : []);
    for (const d of this.deck) if (d.char) d.char.holder.visible = !out.has(d.def.id);
  }

  clearAllies() {
    for (const a of this.allies) a.dispose();
    this.allies = [];
    this.hideDeckHands(false);
  }

  // ---------- Massentruppen ----------

  /** Truppen an Deck: Gruppen von höchstens 20 Köpfen in Reihen an Reling und Deckmitte (eine Zeichnung je Truppentyp, im Schiffsraum) */
  setDeckTroops(ship: Ship, roster: TroopRoster) {
    this.deckTroops?.dispose();
    this.deckTroops = null;
    this.deckViews = [];
    if (rosterTotal(roster) <= 0) return;
    this.deckTroops = new TroopRenderer(ship.model.group, true);
    this.deckTroops.visible = !this.squadsActive;
    const { lo, hi } = this.zone(ship);
    const plan = planSquads(roster);
    const y = ship.model.deckY;
    plan.forEach((pl, i) => {
      const side = i % 2 ? 1 : -1;
      const lane = Math.floor(i / 2) % 2 ? 0.3 : 0.62;
      let z = lo + ((Math.floor(i / 2) + 0.5) / Math.max(1, Math.ceil(plan.length / 2))) * (hi - lo);
      let x = side * ship.model.halfWidth(z) * lane;
      const margin = 0.5 + Math.sqrt(pl.heads) * TROOPS[pl.typ].spacing * 0.5;
      for (let k = 0; k < 90 && !freeSpot(this.obstacles(ship), x, z, margin); k++) {
        z = Math.max(lo, Math.min(hi, z + (k % 2 ? -1 : 1) * 0.35 * (1 + Math.floor(k / 2))));
        x = side * ship.model.halfWidth(z) * lane;
      }
      this.deckViews.push({ typ: pl.typ, heads: pl.heads, x, y, z, yaw: side * Math.PI / 2 * (i % 3 === 2 ? -1 : 1), move: 0, pulse: 0, seed: (i + 1) * 0.173 % 1, compact: 1 });
    });
  }

  /** Anzeige der Truppen an Deck (nur solange sie nicht an Land oder auf dem Enterdeck kämpfen) */
  updateDeckTroops(t: number, dt: number) {
    if (this.deckTroops && this.deckTroops.root.visible) this.deckTroops.update(this.deckViews, t, dt);
  }

  /** Sind Trupps im Einsatz (an Land/Enterdeck)? */
  get squadsActive() { return this.squads.some((q) => q.present); }
  /** Köpfe aller Trupps im Einsatz */
  get squadHeads() { let n = 0; for (const q of this.squads) n += q.heads; return n; }

  /**
   * Trupps aus dem Bestand aufstellen (höchstens `MAX_SQUADS`). Mit `cross` stehen sie auf ihren Plätzen an Deck und marschieren in
   * enger Aufstellung über Gangway, Enterplanken oder Leitern (echte Laufwege, kein Sprung über die Reling); mit `plan` (Küste ohne
   * Steg) setzen sie im Beiboot zum Strand über. Danach folgen sie dem Befehl.
   */
  spawnSquads(scene: Scene, roster: TroopRoster, level: number, ownerId: string, player: { x: number; z: number; yaw: number }, ground: Ground, plan: LandingPlan | null, cross?: CrossingPlan) {
    this.clearSquads();
    const plans = planSquads(roster, MAX_SQUADS);
    if (!plans.length) return;
    this.worldTroops ??= new TroopRenderer(scene, true);
    this.worldTroops.visible = true;
    this.worldTroops.clearCorpses();
    const ship = this.ship;
    plans.forEach((pl, i) => {
      const q = new TroopSquad(pl.typ, pl.heads, level, ownerId);
      q.slot = i;
      const route = cross?.routeFor(i) ?? null;
      const st = route && ship ? this.deckStation(ship, i) : null;
      if (st) {
        q.place(st.x, st.z, st.yaw, ground);
        q.command(this.command);
        q.startRoute(route!);
      } else {
        followSlotPos(i, player, _slotPos);
        const c = ground.constrain(_slotPos.x, _slotPos.z, 0.6);
        q.place(c.x, c.z, player.yaw, ground);
        q.command(this.command);
        if (plan) {
          const dist = Math.hypot(plan.fromX - q.x, plan.fromZ - q.z);
          q.startLanding({ fromX: plan.fromX + (i % 2 ? 1 : -1) * 0.8, fromZ: plan.fromZ, fromY: plan.fromY, delay: i * 0.28 + 0.4, total: Math.max(2.4, Math.min(8, dist / 4.2)), boat: true });
        }
      }
      this.squads.push(q);
      this.squadViews.push({ typ: q.typ, heads: q.heads, x: q.x, y: q.y, z: q.z, yaw: q.yaw, move: 0, pulse: 0, seed: q.seed, compact: 1 });
      this.boatHold.push(0);
    });
    // die Truppen haben ihre Plätze an Deck verlassen: dort stehen sie nicht mehr
    if (this.deckTroops) this.deckTroops.visible = false;
  }

  /** Platz einer Truppgruppe an Deck in Weltkoordinaten (ihre Darstellung stand genau dort) */
  private deckStation(ship: Ship, i: number): { x: number; z: number; yaw: number } | null {
    const v = this.deckViews[i];
    if (!v) return null;
    const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
    return { x: ship.x + v.x * c + v.z * s, z: ship.z - v.x * s + v.z * c, yaw: ship.heading + v.yaw };
  }

  /**
   * Heimweg nach dem Kampf: Offiziere und Trupps gehen über die Brücke zurück aufs Schiff und verschwinden dort (zählen ab jetzt nicht
   * mehr als Ziele). Wer keinen Weg hat, verschwindet sofort.
   */
  beginHome(cross: CrossingPlan) {
    let i = 0;
    for (const a of this.allies) { const r = cross.routeFor(i++); if (r) a.startRoute(r, true); else { a.homeBound = true; a.arrivedHome = true; } }
    for (const q of this.squads) { const r = cross.routeFor(i++); if (r) q.startRoute(r, true); else { q.homeBound = true; q.arrivedHome = true; } }
  }

  /** Läuft ein Heimweg noch? */
  get homing() { return this.allies.some((a) => a.homeBound) || this.squads.some((q) => q.homeBound); }

  /** Angekommene (und nach einer Weile alle) Heimkehrer entfernen */
  purgeHome() {
    if (this.allies.some((a) => a.arrivedHome)) {
      for (const a of this.allies) if (a.arrivedHome) a.dispose();
      this.allies = this.allies.filter((a) => !a.arrivedHome);
      this.hideDeckHands(true);
    }
    for (let i = this.squads.length - 1; i >= 0; i--) {
      if (!this.squads[i].arrivedHome) continue;
      this.squads.splice(i, 1); this.squadViews.splice(i, 1); this.boatHold.splice(i, 1);
      this.worldTroops?.boat(i, null);
    }
    if (!this.squads.length && this.deckTroops) { this.worldTroops?.update([], 0, 0); this.deckTroops.visible = true; }
  }

  /** Trupps entfernen (Kampfende): der Bestand an Überlebenden steht in `squads` (vorher abholen) */
  clearSquads() {
    this.squads = [];
    this.squadViews = [];
    this.boatHold = [];
    this.worldTroops?.clearCorpses();
    if (this.worldTroops) { this.worldTroops.update([], 0, 0); for (let i = 0; i < MAX_SQUADS; i++) this.worldTroops.boat(i, null); }
    if (this.deckTroops) this.deckTroops.visible = true;
  }

  /** Überlebende nach Typ (für den Bestand im Spielstand) */
  survivors(): TroopRoster {
    const r: TroopRoster = {};
    for (const q of this.squads) if (q.heads > 0 && !q.homeBound) r[q.typ] = (r[q.typ] ?? 0) + q.heads;
    return r;
  }

  /** Befehl an alle Offiziere und Trupps */
  setCommand(c: CommandState) {
    this.command = c;
    for (const a of this.allies) a.command(c);
    for (const q of this.squads) q.command(c);
  }

  /** Trupps und Offiziere vorrücken: KI (gestaffelt), weiche Trennung untereinander (nie die Spielfigur), Darstellung */
  updateSquads(dt: number, t: number, player: { x: number; z: number; yaw: number }, w: TroopWorld, waterY: (x: number, z: number) => number) {
    const R = this.worldTroops;
    if (!R || !this.squads.length) return;
    // weiche Körper: lebende Offiziere und alle Trupps
    this.soft.length = 0;
    for (const a of this.allies) if (a.alive) this.soft.push({ x: a.x, z: a.z, radius: 0.5 });
    for (const q of this.squads) if (q.alive) this.soft.push({ x: q.x, z: q.z, radius: q.sepRadius(), owner: q });
    for (let i = 0; i < this.squads.length; i++) {
      const q = this.squads[i], v = this.squadViews[i];
      q.update(dt, player, w, this.soft);
      // aktualisierte Lage in die weichen Körper zurückschreiben (nächster Trupp sieht sie)
      for (const b of this.soft) if (b.owner === q) { b.x = q.x; b.z = q.z; }
      v.heads = q.heads; v.typ = q.typ; v.seed = q.seed; v.move = q.move; v.pulse = q.pulse;
      const L = q.landing;
      if (L) {
        const pose = q.landingPose()!;
        const toX = q.x - pose.x, toZ = q.z - pose.z;
        if (pose.waiting) {
          // wartet noch am Schiff: Boot-Truppen sind noch nicht zu sehen, Springer stehen an der Reling
          v.heads = L.boat ? 0 : q.heads;
          v.x = pose.x; v.y = pose.y; v.z = pose.z; v.compact = 1; v.move = 0;
          v.yaw = Math.atan2(q.x - pose.x, q.z - pose.z);
        } else {
          v.x = pose.x; v.z = pose.z; v.y = L.boat ? waterY(pose.x, pose.z) + 0.35 : pose.y;
          v.yaw = Math.hypot(toX, toZ) > 0.3 ? Math.atan2(toX, toZ) : q.yaw;
          v.compact = q.compact * q.squeeze;
          if (L.boat) { R.boat(i, { x: pose.x, y: waterY(pose.x, pose.z) - 0.1, z: pose.z, yaw: v.yaw, s: 1 }); this.boatHold[i] = 6; }
        }
      } else {
        v.x = q.x; v.y = q.y; v.z = q.z; v.yaw = q.yaw; v.compact = q.squeeze;
        // Beiboot bleibt kurz am Strand liegen und verschwindet dann
        if (this.boatHold[i] > 0) { this.boatHold[i] -= dt; if (this.boatHold[i] <= 0) R.boat(i, null); }
      }
      if (q.lostHeads > 0) { R.fall(v, q.lostHeads, q); q.lostHeads = 0; }
    }
    R.update(this.squadViews, t, dt);
  }

  /** Offiziere (und Trupps) weich voneinander trennen – die Spielfigur wird nie verschoben und nie blockiert */
  separateAllies(dt: number, ground: Ground) {
    const a = this.allies;
    for (let i = 0; i < a.length; i++) {
      if (!a[i].alive) continue;
      for (let j = i + 1; j < a.length; j++) {
        if (!a[j].alive) continue;
        const dx = a[i].x - a[j].x, dz = a[i].z - a[j].z, d2 = dx * dx + dz * dz, min = 0.95;
        if (d2 > 1e-6 && d2 < min * min) {
          const d = Math.sqrt(d2), push = Math.min((min - d) * 0.5, 2.5 * dt) * 0.5;
          const c1 = ground.constrain(a[i].x + (dx / d) * push, a[i].z + (dz / d) * push, 0.45);
          const c2 = ground.constrain(a[j].x - (dx / d) * push, a[j].z - (dz / d) * push, 0.45);
          a[i].x = c1.x; a[i].z = c1.z; a[j].x = c2.x; a[j].z = c2.z;
        }
      }
    }
  }

  dispose() {
    this.clearSquads();
    this.worldTroops?.dispose(); this.worldTroops = null;
    this.deckTroops?.dispose(); this.deckTroops = null;
  }

  /** Ausgeknockte Crew wieder aufstellen (Ärztin, Kampfende) */
  reviveAll(frac: number) { for (const a of this.allies) a.revive(frac); }

  /** Ziele für die Gegner: Offiziere und Trupps (als Ziele, die sie angreifen können) */
  targets(): AllyTarget[] { return [...this.allies, ...this.squads]; }

  /** Deck-Arbeit: Tätigkeiten wechseln, gelegentlich umhergehen; liefert ab und zu einen Spruch */
  updateDeck(dt: number, near: boolean, calm: boolean, t: number): { who: CrewDef; text: string; pos: Vector3 } | null {
    for (const d of this.deck) {
      if (d.char) {
        const c = d.char;
        if (d.speak > 0) {
          // spricht gerade: danach zurück an die Arbeit
          d.speak -= dt;
          if (d.speak <= 0) this.startTask(d, d.task);
        } else if (d.walking) {
          const dx = d.goal.x - c.holder.position.x, dz = d.goal.z - c.holder.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.12) {
            c.holder.position.copy(d.goal);
            d.home.copy(d.goal);
            this.startTask(d, pickOne(tasksOf(d)));
          } else {
            const step = Math.min(dist, WALK_SPEED * dt);
            c.holder.position.x += (dx / dist) * step;
            c.holder.position.z += (dz / dist) * step;
            turnToward(c.holder, Math.atan2(dx, dz), dt * 8);
          }
        } else {
          turnToward(c.holder, d.yaw, dt * 4);
          d.t -= dt;
          // meist am Platz weiterarbeiten, ab und zu zu einem neuen Platz gehen
          if (d.t <= 0 && !(Math.random() < 0.4 && this.tryWalk(d))) this.startTask(d, pickOne(tasksOf(d)));
        }
        d.acc += dt;
        if (near || d.acc > 0.12) { c.update(d.acc); d.acc = 0; }
      } else if (d.tail) d.tail.rotation.x = 0.6 + Math.sin(t * 3) * 0.4;
    }
    this.lineT -= dt;
    if (this.lineT > 0 || !calm || !this.deck.length) return null;
    this.lineT = 22 + Math.random() * 18;
    const d = pickOne(this.deck);
    const obj = d.char?.holder ?? d.cat;
    if (!obj) return null;
    const pos = obj.getWorldPosition(new Vector3());
    pos.y += d.cat ? 1 : 2.4 * (d.def.big ?? 1);
    if (d.char) {
      d.walking = false;
      d.speak = 2.4;
      d.char.play('talk', { restart: true });
    }
    return { who: d.def, text: pickOne(d.def.lines), pos };
  }

  get deckCount() { return this.deck.length; }

  /** Crewmitglied an Deck in der Nähe einer Weltposition */
  deckHandNear(x: number, z: number, r: number): CrewDef | null {
    const p = new Vector3();
    for (const d of this.deck) {
      const o = d.char?.holder ?? d.cat;
      if (!o) continue;
      o.getWorldPosition(p);
      if (Math.hypot(p.x - x, p.z - z) < r) return d.def;
    }
    return null;
  }
}

/** Brömmel, die Schiffskatze */
function buildCat(): Group {
  const g = new Group();
  const fur = toon('#D98E32');
  const white = toon('#F6EBDD');
  const body = new Mesh(new SphereGeometry(0.22, 12, 8), fur);
  body.scale.set(0.8, 0.75, 1.4);
  body.position.y = 0.22;
  const head = new Mesh(new SphereGeometry(0.16, 12, 8), fur);
  head.position.set(0, 0.42, 0.28);
  const muzzle = new Mesh(new SphereGeometry(0.07, 8, 6), white);
  muzzle.position.set(0, 0.38, 0.42);
  for (const s of [-1, 1]) {
    const ear = new Mesh(new ConeGeometry(0.06, 0.12, 4), fur);
    ear.position.set(s * 0.08, 0.57, 0.27);
    g.add(ear);
    for (const z of [0.18, -0.18]) {
      const leg = new Mesh(new CylinderGeometry(0.04, 0.04, 0.18, 6), white);
      leg.position.set(s * 0.09, 0.09, z);
      g.add(leg);
    }
  }
  const tail = new Mesh(new CylinderGeometry(0.03, 0.04, 0.4, 6), fur);
  tail.geometry.translate(0, 0.2, 0);
  tail.position.set(0, 0.26, -0.28);
  tail.rotation.x = 0.6;
  g.add(body, head, muzzle, tail);
  g.userData.tail = tail;
  addOutlines(g);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}
