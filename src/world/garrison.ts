// Besatzung einer Festungsinsel (raid/occupation.ts): die Flagge des Spielers ersetzt die Banner der Macht, freundliche Wachen schreiten Burghof und
// Wehrgang ab. Beides ist billig: die Banner sind geteilte Netze und Materialien, die Wachen sind Massentrupps (`TroopSquad`, ein `InstancedMesh`
// je Truppentyp) und existieren nur, solange der Spieler in der Nähe ist.
import { CanvasTexture, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Scene } from 'three';
import type { ShipLook } from '../data/ships';
import { TroopSquad, type TroopWorld } from '../entities/troops/squad';
import { TroopRenderer, type TroopPalette, type TroopView } from '../entities/troops/troopRender';
import { markShared } from '../render/dispose';
import { toon } from '../render/toon';
import { flagTexture } from '../entities/ship/shipBuilder';
import type { NavGrid } from '../ai/navGrid';

// ---------- Flagge des Spielers als Banner ----------

const textures = new Map<string, CanvasTexture>();
const materials = new Map<string, MeshBasicMaterial>();
let poleGeo: CylinderGeometry | null = null;
let poleMat: ReturnType<typeof toon> | null = null;
let clothGeo: PlaneGeometry | null = null;

/** Fahnentuch im Hochformat: Grundfarbe der Flagge, mittig das Zeichen (Totenkopf, Krone, Anker …), goldener Rand */
function bannerTexture(look: ShipLook): CanvasTexture {
  const key = `${look.flag}|${look.flagColor}`;
  let t = textures.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = look.flagColor; g.fillRect(0, 0, 128, 256);
  const src = flagTexture(look.flag, look.flagColor).image as HTMLCanvasElement;
  g.drawImage(src, 0, 88, 128, 80);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, 128, 28); g.fillRect(0, 228, 128, 28);
  g.strokeStyle = '#E3B04B'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, 123, 251);
  t = markShared(new CanvasTexture(c));
  t.anisotropy = 4;
  textures.set(key, t);
  return t;
}

/** Banner mit der Flagge des Spielers (Mast mit Tuch), gleiches Maß wie das Ersatz-Banner der Mächte; `k` = Größe */
export function makePlayerBanner(look: ShipLook, k = 1): Group {
  poleGeo ??= markShared(new CylinderGeometry(0.07, 0.1, 9, 6));
  poleMat ??= markShared(toon('#4A3220'));
  clothGeo ??= markShared(new PlaneGeometry(2.0, 4.2));
  const key = `${look.flag}|${look.flagColor}`;
  let mat = materials.get(key);
  if (!mat) { mat = markShared(new MeshBasicMaterial({ map: bannerTexture(look), side: DoubleSide })); materials.set(key, mat); }
  const g = new Group();
  const pole = new Mesh(poleGeo, poleMat);
  pole.position.y = 4.5;
  const cloth = new Mesh(clothGeo, mat);
  cloth.position.set(0, 6.6, 0);
  cloth.userData.noOutline = true;
  g.add(pole, cloth);
  g.scale.setScalar(k);
  g.userData.playerBanner = true;
  return g;
}

/** Uniform der eigenen Wachen: Rock in der Flaggenfarbe, dunkle Hose und Kopfbedeckung, goldene Zier */
export function playerPalette(look: ShipLook): TroopPalette {
  return { id: `eigen:${look.flagColor}`, cloth: look.flagColor, pants: '#26262E', hat: '#2A2A34', trim: '#E3B04B' };
}

// ---------- Wachen ----------

export interface Waypoint { x: number; z: number }

/** Freundliche Wachen: Trupps schreiten Wegpunkte ab (Burghof, Wehrgang, Tor – Mitte – Tor), halten bei Feindberührung dagegen */
export class Garrison {
  readonly squads: TroopSquad[] = [];
  private readonly views: TroopView[] = [];
  private readonly renderer: TroopRenderer;
  private disposed = false;

  constructor(scene: Scene, palette: TroopPalette, routes: Waypoint[][], level: number, ownerId: string, private world: TroopWorld, nav: NavGrid | null) {
    this.renderer = new TroopRenderer(scene, true, { palette, cap: 90 });
    const spot = { x: 0, z: 0 };
    routes.slice(0, 4).forEach((route, ri) => {
      // Wegpunkte auf begehbaren Boden ziehen (Gebäude und Mauern liegen auf den Rundgängen)
      const pts = route.map((p) => { if (nav) { nav.snap(p.x, p.z, 0.8, spot); return { x: spot.x, z: spot.z }; } return { x: p.x, z: p.z }; });
      if (pts.length < 2) return;
      // je Rundgang zwei Trupps (Schwertträger und Musketiere), versetzt auf der Strecke
      (['schwert', 'musketier'] as const).forEach((typ, k) => {
        const q = new TroopSquad(typ, 4, level, ownerId);
        q.aggroR = 18;
        q.commandState = 'halten';
        const i0 = Math.floor((k / 2 + ri * 0.17) * pts.length) % pts.length;
        const a = pts[i0], b = pts[(i0 + 1) % pts.length];
        q.place(a.x, a.z, Math.atan2(b.x - a.x, b.z - a.z), world.ground);
        // Umlaufrichtung wechselt, damit die Wachen einander begegnen
        q.patrol = ri % 2 ? [...pts].reverse() : pts;
        this.squads.push(q);
        this.views.push({ typ: q.typ, heads: q.heads, x: q.x, y: q.y, z: q.z, yaw: q.yaw, move: 0, pulse: 0, seed: q.seed, compact: 1 });
      });
    });
  }

  update(dt: number, t: number, ref: { x: number; z: number; yaw: number }) {
    if (this.disposed) return;
    const soft = this.soft;
    soft.length = 0;
    for (const q of this.squads) if (q.alive) soft.push({ x: q.x, z: q.z, radius: q.sepRadius(), owner: q });
    for (let i = 0; i < this.squads.length; i++) {
      const q = this.squads[i], v = this.views[i];
      q.update(dt, ref, this.world, soft);
      for (const b of soft) if (b.owner === q) { b.x = q.x; b.z = q.z; }
      v.heads = q.heads; v.typ = q.typ; v.seed = q.seed; v.move = q.move; v.pulse = q.pulse;
      v.x = q.x; v.y = q.y; v.z = q.z; v.yaw = q.yaw; v.compact = q.squeeze;
      if (q.lostHeads > 0) { this.renderer.fall(v, q.lostHeads); q.lostHeads = 0; }
    }
    this.renderer.update(this.views, t, dt);
  }
  private readonly soft: { x: number; z: number; radius: number; owner?: object }[] = [];

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.squads.length = 0;
    this.views.length = 0;
    this.renderer.dispose();
  }
}
