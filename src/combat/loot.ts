import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  RingGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Scene,
} from 'three';
import { audio } from '../audio/audio';
import { LOOT_LOOK, RARITIES, type LootDrop } from '../data/loot';
import { RARITY, type Rarity } from '../data/trinkets';
import { markShared } from '../render/dispose';
import { toon } from '../render/toon';
import type { CombatFx } from './fx';

/**
 * Beute am Boden: eine Lichtsäule in der Farbe der Seltenheit (Höhe und Glanz wachsen mit ihr), darin ein schwebendes
 * Stück (Edelstein, Goldstapel, Proviant) aus Metall-Toon-Material. Nähert sich der Spieler, wird es magnetisch
 * eingesaugt. Alle Netze und Materialien sind geteilt – ein Stück kostet nur seine Objekte.
 */
interface Item {
  g: Group;
  drop: LootDrop;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  t: number;
  bounces: number;
  state: 'fall' | 'idle' | 'magnet';
  pull: number;
  pillar: Mesh; core: Mesh; ring: Mesh; gem: Mesh;
  look: (typeof LOOT_LOOK)[Rarity];
  sparkT: number;
  color: string;
  phase: number;
}

interface Assets { pillar: Record<Rarity, Material>; core: Record<Rarity, Material>; ring: Record<Rarity, Material>; gem: Record<Rarity, Material> }

let assets: Assets | null = null;
const PILLAR_GEO = markShared(new CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0));
const RING_GEO = markShared(new RingGeometry(0.55, 1, 40).rotateX(-Math.PI / 2));
const GEM_GEO = markShared(new OctahedronGeometry(0.3));
const GOLD_GEO = markShared(new CylinderGeometry(0.34, 0.34, 0.24, 16));
const FOOD_GEO = markShared(new DodecahedronGeometry(0.27));
const MAX_ITEMS = 30;
const tmp = new Vector3();

/** Verlauf für die Säule: unten hell, nach oben ausklingend (Alpha, additiv gemischt) */
function gradient() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 128, 0, 0);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return markShared(t);
}

function build(): Assets {
  const map = gradient();
  const a: Assets = { pillar: {} as Assets['pillar'], core: {} as Assets['core'], ring: {} as Assets['ring'], gem: {} as Assets['gem'] };
  for (const r of RARITIES) {
    const col = new Color(RARITY[r].col);
    const L = LOOT_LOOK[r];
    const glow = (k: number, m?: typeof map) => markShared(new MeshBasicMaterial({ color: col.clone().multiplyScalar(k), map: m ?? null, transparent: true, opacity: 1, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }));
    a.pillar[r] = glow(L.glow * 0.55, map);
    a.core[r] = glow(L.glow * 1.1, map);
    a.ring[r] = glow(L.glow * 0.9);
    // PBR im Toon-Material: Metall mit glatter Oberfläche (spiegelt den Himmel), dazu Eigenleuchten in der Farbe der Seltenheit
    a.gem[r] = toon({ color: col, spec: 1, metalness: 0.92, roughness: 0.2, emissive: col.clone().multiplyScalar(0.45) });
  }
  return a;
}

export class LootSystem {
  private items: Item[] = [];
  /** Wird beim Aufheben (oder Einsammeln beim Verlassen) aufgerufen */
  onPickup: (d: LootDrop) => void = () => {};
  private t = 0;

  constructor(private scene: Scene, private fx: CombatFx) {}

  get count() { return this.items.length; }

  /** Beute an einer Stelle fallen lassen (fliegt in einem kleinen Bogen heraus) */
  drop(x: number, y: number, z: number, d: LootDrop, spread = 2.2) {
    assets ??= build();
    if (this.items.length >= MAX_ITEMS) this.collect(this.items[0]);
    const r = d.rarity;
    const look = LOOT_LOOK[r];
    const g = new Group();
    const pillar = new Mesh(PILLAR_GEO, assets.pillar[r]);
    const core = new Mesh(PILLAR_GEO, assets.core[r]);
    const ring = new Mesh(RING_GEO, assets.ring[r]);
    const gem = new Mesh(d.kind === 'gold' ? GOLD_GEO : d.kind === 'proviant' ? FOOD_GEO : GEM_GEO, d.kind === 'gold' ? goldMat() : d.kind === 'proviant' ? foodMat() : assets.gem[r]);
    pillar.renderOrder = core.renderOrder = ring.renderOrder = 6;
    pillar.frustumCulled = core.frustumCulled = false;
    pillar.scale.set(look.radius, 0.001, look.radius);
    core.scale.set(look.radius * 0.28, 0.001, look.radius * 0.28);
    ring.scale.setScalar(look.radius * 2.2);
    ring.position.y = 0.06;
    gem.castShadow = false;
    g.add(pillar, core, ring, gem);
    g.position.set(x, y, z);
    this.scene.add(g);
    const a = Math.random() * Math.PI * 2;
    const sp = (0.5 + Math.random() * 0.5) * spread;
    this.items.push({
      g, drop: d, x, y, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 6 + Math.random() * 2, t: 0, bounces: 0, state: 'fall', pull: 0,
      pillar, core, ring, gem, look, sparkT: 0, color: RARITY[r].col, phase: Math.random() * 6.28,
    });
  }

  /**
   * Bewegung, Magnet und Aufheben. pl: Spielfigur (null = niemand in Reichweite, nur Anzeige);
   * ground: Bodenhöhe an einer Stelle.
   */
  update(dt: number, pl: { x: number; y: number; z: number; active: boolean } | null, ground: (x: number, z: number) => number) {
    this.t += dt;
    let n = 0;
    for (const it of this.items) {
      it.t += dt;
      const L = it.look;
      const gem = it.gem;
      if (it.state === 'fall') {
        it.vy -= 24 * dt;
        it.x += it.vx * dt; it.z += it.vz * dt; it.y += it.vy * dt;
        const g = ground(it.x, it.z);
        if (it.y <= g) {
          it.y = g;
          if (it.bounces++ >= 2 || Math.abs(it.vy) < 2) { it.state = 'idle'; it.vx = it.vz = it.vy = 0; }
          else { it.vy = Math.abs(it.vy) * 0.38; it.vx *= 0.5; it.vz *= 0.5; }
        }
      }
      // Säule wächst beim Auftreffen empor
      const grow = Math.min(1, Math.max(0, (it.t - 0.15) / 0.6));
      const ease = 1 - (1 - grow) * (1 - grow);
      const pulse = 1 + 0.07 * Math.sin(this.t * 5 + it.phase);
      let fade = 1;
      if (it.state !== 'fall' && pl?.active) {
        const d = Math.hypot(pl.x - it.x, pl.z - it.z);
        if (it.state === 'idle' && it.t > 0.9 && d < L.magnet) it.state = 'magnet';
        if (it.state === 'magnet') {
          // Magnet: wird schneller, je länger er zieht; die Säule schrumpft mit dem Abstand
          it.pull += dt;
          const sp = Math.min(30, 8 + it.pull * 34);
          const k = Math.min(1, (sp * dt) / Math.max(d, 0.001));
          it.x += (pl.x - it.x) * k; it.z += (pl.z - it.z) * k;
          const gy = ground(it.x, it.z);
          it.y += (Math.max(gy, pl.y) - it.y) * Math.min(1, dt * 6);
          fade = Math.min(1, d / L.magnet);
          if (d < 0.9) { this.pickup(it); continue; }
        }
      }
      it.g.position.set(it.x, it.y, it.z);
      it.pillar.scale.set(L.radius * pulse * (0.4 + 0.6 * fade), L.height * ease * fade, L.radius * pulse * (0.4 + 0.6 * fade));
      it.core.scale.set(L.radius * 0.28 * pulse, L.height * ease * fade * 0.9, L.radius * 0.28 * pulse);
      it.ring.rotation.y += dt * (1 + L.glow * 0.4);
      gem.position.y = 1.15 + Math.sin(this.t * 2.2 + it.phase) * 0.14 - (it.state === 'magnet' ? 0.5 * (1 - fade) : 0);
      gem.rotation.y += dt * 2.2;
      gem.rotation.x = Math.sin(this.t * 1.3 + it.phase) * 0.3;
      // Funken steigen an der Säule auf (nur seltene Beute): Farbe der Seltenheit
      if (L.sparks > 0 && it.state !== 'fall') {
        it.sparkT -= dt;
        if (it.sparkT <= 0) {
          it.sparkT = 1 / L.sparks;
          this.fx.rise(tmp.set(it.x, it.y + 0.3, it.z), it.color, 1, L.radius * 1.8);
        }
      }
      this.items[n++] = it;
    }
    this.items.length = n;
  }

  /** Stück aus der Liste nehmen und aufheben (nicht innerhalb von update aufrufen: dort räumt die Verdichtung auf) */
  private collect(it: Item) {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
    this.pickup(it);
  }

  /** Aufheben: Effekt, Klang, Übergabe an Spielstand und Anzeige */
  private pickup(it: Item) {
    it.g.removeFromParent();
    const r = RARITIES.indexOf(it.drop.rarity);
    const at = new Vector3(it.x, it.y + 1, it.z);
    this.fx.hit(at, 'magic', it.color, r >= 2);
    if (r >= 2) this.fx.shockwave(at.setY(it.y + 0.1), 2 + r, it.color);
    audio.play('shard', 0.6 + r * 0.15);
    this.onPickup(it.drop);
  }

  /** Alles Liegengebliebene einsammeln (beim Verlassen der Insel geht nichts verloren) */
  collectAll() {
    for (const it of [...this.items]) this.collect(it);
  }

  clear() {
    for (const it of this.items) it.g.removeFromParent();
    this.items.length = 0;
  }
}

let gold: Material | null = null, food: Material | null = null;
function goldMat() { return (gold ??= toon({ color: 0xffc83a, spec: 1, metalness: 0.95, roughness: 0.25, emissive: 0x4a3000 })); }
function foodMat() { return (food ??= toon({ color: 0xb8683a, spec: 0, roughness: 0.6, emissive: 0x2a1408 })); }
