import { ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, Vector3, type Scene } from 'three';
import { randomLook, sanitizeLook } from '../data/characterParts';
import { CREW_BY_ID, type CrewDef } from '../data/crew';
import { Ally } from '../entities/ally';
import type { CharacterAssets } from '../entities/character/assets';
import { Character } from '../entities/character/character';
import type { Ship } from '../entities/ship/ship';
import { addOutlines } from '../render/outline';
import { disposeObject } from '../render/dispose';
import { toon } from '../render/toon';
import type { Ground } from './islandGround';
import { seeded } from './waves';
import type { AnimRole } from '../data/animations';

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
const pick = <A>(a: A[]) => a[Math.floor(Math.random() * a.length)];

/** Punkt (x,z) frei von festen Aufbauten (mit Abstand)? */
function freeSpot(blockers: { cx: number; cz: number; hx: number; hz: number }[], x: number, z: number, margin: number) {
  for (const b of blockers) if (Math.abs(x - b.cx) < b.hx + margin && Math.abs(z - b.cz) < b.hz + margin) return false;
  return true;
}

/** Winkel sanft (kürzester Weg) auf das Ziel zudrehen */
function turnToward(o: { rotation: { y: number } }, target: number, k: number) {
  const d = Math.atan2(Math.sin(target - o.rotation.y), Math.cos(target - o.rotation.y));
  o.rotation.y += d * Math.min(1, k);
}

/** Die Crew an Deck (sichtbar, arbeitet, mit Sprüchen) und der Landtrupp im Kampf. */
export class CrewAboard {
  private deck: DeckHand[] = [];
  allies: Ally[] = [];
  private lineT = 10;
  private ship: Ship | null = null;

  constructor(private assets: CharacterAssets, private outline: boolean) {}

  /** Arbeitsbereich an Deck (Schiffs-z): hinter dem Achterdeck-Aufgang bis vor das Vorderkastell */
  private zone(ship: Ship) {
    const q = ship.model.quarter, L = ship.cls.L;
    return { lo: q ? q.z1 + q.stairLen + 1.0 : -L / 2 + L * 0.28, hi: ship.model.fore ? ship.model.fore.z0 - ship.model.fore.stairLen - 1.0 : L * 0.4 };
  }

  /** Crew auf das (neu gebaute) Schiff stellen */
  setDeck(ship: Ship, hired: string[]) {
    for (const d of this.deck) { d.char?.dispose(); disposeObject(d.cat); }
    this.deck = [];
    this.ship = ship;
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
      for (let k = 0; k < 70 && !freeSpot(ship.model.blockers, x, z, 0.45); k++) {
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
      this.startTask(d, pick(tasksOf(d)), true);
    });
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
      if (Math.hypot(x - d.home.x, z - d.home.z) < 1.2 || !freeSpot(ship.model.blockers, x, z, 0.5)) continue;
      const px = c.holder.position.x, pz = c.holder.position.z;
      let ok = true;
      for (let s = 1; s <= 5 && ok; s++) ok = freeSpot(ship.model.blockers, px + ((x - px) * s) / 5, pz + ((z - pz) * s) / 5, 0.35);
      if (!ok) continue;
      d.goal.set(x, d.home.y, z);
      d.walking = true;
      c.play('walk', { fade: 0.25 });
      c.setLocoSpeed(WALK_SPEED);
      return true;
    }
    return false;
  }

  /** Landtrupp an Land oder aufs Enterdeck bringen */
  spawnAllies(scene: Scene, party: string[], level: number, loyalty: Record<string, number>, x: number, z: number, yaw: number, ground: Ground, buffMult: number) {
    this.clearAllies();
    party.forEach((id, i) => {
      const def = CREW_BY_ID[id];
      if (!def || def.cat) return;
      const a = new Ally(this.assets, def, level, loyalty[id] ?? 0, i, this.outline);
      a.buffMult = buffMult;
      const side = i === 0 ? -1 : i === 1 ? 1 : 0;
      a.place(x - Math.sin(yaw) * (i === 2 ? 2.4 : 1.4) + Math.cos(yaw) * side * 1.6, z - Math.cos(yaw) * (i === 2 ? 2.4 : 1.4) - Math.sin(yaw) * side * 1.6, yaw, ground);
      scene.add(a.char.holder);
      this.allies.push(a);
    });
  }

  clearAllies() {
    for (const a of this.allies) a.dispose();
    this.allies = [];
  }

  /** Ausgeknockte Crew wieder aufstellen (Ärztin, Kampfende) */
  reviveAll(frac: number) { for (const a of this.allies) a.revive(frac); }

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
            this.startTask(d, pick(tasksOf(d)));
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
          if (d.t <= 0 && !(Math.random() < 0.4 && this.tryWalk(d))) this.startTask(d, pick(tasksOf(d)));
        }
        d.acc += dt;
        if (near || d.acc > 0.12) { c.update(d.acc); d.acc = 0; }
      } else if (d.tail) d.tail.rotation.x = 0.6 + Math.sin(t * 3) * 0.4;
    }
    this.lineT -= dt;
    if (this.lineT > 0 || !calm || !this.deck.length) return null;
    this.lineT = 22 + Math.random() * 18;
    const d = pick(this.deck);
    const obj = d.char?.holder ?? d.cat;
    if (!obj) return null;
    const pos = obj.getWorldPosition(new Vector3());
    pos.y += d.cat ? 1 : 2.4 * (d.def.big ?? 1);
    if (d.char) {
      d.walking = false;
      d.speak = 2.4;
      d.char.play('talk', { restart: true });
    }
    return { who: d.def, text: pick(d.def.lines), pos };
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
