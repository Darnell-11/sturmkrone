import { ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, Vector3, type Scene } from 'three';
import { randomLook, sanitizeLook } from '../data/characterParts';
import { CREW_BY_ID, type CrewDef } from '../data/crew';
import { Ally } from '../entities/ally';
import type { CharacterAssets } from '../entities/character/assets';
import { Character } from '../entities/character/character';
import type { Ship } from '../entities/ship/ship';
import { addOutlines } from '../render/outline';
import { toon } from '../render/toon';
import type { Ground } from './islandGround';
import { seeded } from './waves';
import type { AnimRole } from '../data/animations';

interface DeckHand { def: CrewDef; char: Character | null; cat: Group | null; tail: Mesh | null; acc: number }

const DECK_ANIM: Record<string, AnimRole> = {
  cook: 'work', nav: 'idleLong', gun: 'idle', carp: 'hammer', look: 'idleLong', arzt: 'idle', musik: 'cheer', helm: 'idle',
  kiko: 'sitFloor', schmied: 'hammer', ram: 'pushups', lehrer: 'sitFloor', esra: 'work', bruno: 'idle', tomo: 'sitFloor',
};

/** Die Crew an Deck (sichtbar, mit Sprüchen) und der Landtrupp im Kampf. */
export class CrewAboard {
  private deck: DeckHand[] = [];
  allies: Ally[] = [];
  private lineT = 10;

  constructor(private assets: CharacterAssets, private outline: boolean) {}

  /** Crew auf das (neu gebaute) Schiff stellen */
  setDeck(ship: Ship, hired: string[]) {
    for (const d of this.deck) { d.char?.dispose(); d.cat?.removeFromParent(); }
    this.deck = [];
    const g = ship.model.group;
    const L = ship.cls.L, W = ship.cls.W, y = ship.model.deckY;
    const helm = ship.model.helm;
    const spots: Vector3[] = [];
    for (let i = 0; i < 24 && spots.length < hired.length; i++) {
      const z = L * (0.3 - (Math.floor(i / 2) * 0.09));
      const x = (i % 2 ? 1 : -1) * W * (0.2 + (i % 4 > 1 ? 0.06 : 0));
      const p = new Vector3(x, y, z);
      if (p.distanceTo(helm) < 2.2 || Math.abs(z) > L * 0.42) continue;
      spots.push(p);
    }
    hired.slice(0, spots.length).forEach((id, i) => {
      const def = CREW_BY_ID[id];
      if (!def) return;
      const p = spots[i];
      if (def.cat) {
        const cat = buildCat();
        cat.position.set(p.x * 0.6, y + 0.02, p.z);
        cat.rotation.y = Math.random() * Math.PI * 2;
        g.add(cat);
        this.deck.push({ def, char: null, cat, tail: cat.userData.tail, acc: 0 });
        return;
      }
      const look = sanitizeLook({ ...randomLook(seeded(def.id.length * 977 + def.name.charCodeAt(0)), 'pirat'), ...(def.look ?? {}) }, 'pirat');
      const c = new Character(this.assets, look, this.outline);
      c.holder.position.copy(p);
      c.holder.scale.setScalar(def.big ?? 1);
      c.holder.rotation.y = (i % 2 ? -1 : 1) * Math.PI / 2 + (Math.random() - 0.5) * 0.8;
      c.play(DECK_ANIM[def.id] ?? 'idle', { fade: 0.01 });
      g.add(c.holder);
      this.deck.push({ def, char: c, cat: null, tail: null, acc: Math.random() * 0.1 });
    });
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

  /** Deck-Animationen; liefert ab und zu einen Spruch */
  updateDeck(dt: number, near: boolean, calm: boolean, t: number): { who: CrewDef; text: string; pos: Vector3 } | null {
    for (const d of this.deck) {
      if (d.char) {
        d.acc += dt;
        if (near || d.acc > 0.12) { d.char.update(d.acc); d.acc = 0; }
      } else if (d.tail) d.tail.rotation.x = 0.6 + Math.sin(t * 3) * 0.4;
    }
    this.lineT -= dt;
    if (this.lineT > 0 || !calm || !this.deck.length) return null;
    this.lineT = 22 + Math.random() * 18;
    const d = this.deck[Math.floor(Math.random() * this.deck.length)];
    const obj = d.char?.holder ?? d.cat;
    if (!obj) return null;
    const pos = obj.getWorldPosition(new Vector3());
    pos.y += d.cat ? 1 : 2.4 * (d.def.big ?? 1);
    d.char?.play('talk', { restart: true, onDone: () => d.char?.play(DECK_ANIM[d.def.id] ?? 'idle', { fade: 0.3 }) });
    return { who: d.def, text: d.def.lines[Math.floor(Math.random() * d.def.lines.length)], pos };
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
