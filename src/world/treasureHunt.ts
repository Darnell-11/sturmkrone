// Schatzsuche an Land (Phase 4.5C): Darstellung des Suchbereichs und der Truhe. Die Regeln (Suchbereich, Hinterhalt, Bergen) stehen rein im
// WorldEventDirector (world/worldEventDirector.ts); die Seewelt (SeaWorld.updateHunt) löst den Hinterhalt aus und meldet das Bergen.
//
// Alles ist beim Start angelegt (Objekt-Pools, ein Zeichenaufruf je Teil): Pfähle mit roten Wimpeln rund um jeden Suchbereich in Spielernähe
// (höchstens `MAX_SITES` zugleich) und eine einzige Truhe, die nach dem Hinterhalt halb ausgegraben in der Mitte steht. Je Bild entstehen keine Objekte.
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3, type Scene } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from '../render/toon';
import { disposeObject } from '../render/dispose';

/** Höchstens so viele Suchbereiche gleichzeitig mit Pfählen, und Pfähle je Bereich */
export const MAX_SITES = 3;
export const STAKES_PER_SITE = 10;

/** Ein Suchbereich für die Darstellung: Mitte, Radius und die Geländehöhe als Rückruf */
export interface HuntSiteView { x: number; z: number; r: number }

const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const UP = new Vector3(0, 1, 0);
const HIDDEN = new Matrix4().makeTranslation(0, -800, 0);

/** Pfahl mit Wimpel (ein Netz, Farben über die Eckpunkte) */
function stakeGeometry(): BufferGeometry {
  const pole = new CylinderGeometry(0.06, 0.08, 1.9, 6).translate(0, 0.95, 0).toNonIndexed();
  const flag = new BoxGeometry(0.04, 0.32, 0.5).translate(0, 1.7, 0.26).toNonIndexed();
  const colorize = (g: BufferGeometry, c: Color) => {
    const n = g.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new BufferAttribute(a, 3));
  };
  colorize(pole, new Color('#6E4A28'));
  colorize(flag, new Color('#D2402A'));
  const g = mergeGeometries([pole, flag]);
  pole.dispose(); flag.dispose();
  return g;
}

/** Truhe: Kasten, gewölbter Deckel (halb offen), Goldbeschläge, aufgeworfene Erde ringsum */
function chestGroup(): Group {
  const g = new Group();
  g.name = 'schatztruhe';
  const wood = toon('#6A3E1E'), gold = toon({ color: '#D9A441', spec: 0.9 }), soil = toon('#5A4630');
  const box = new Mesh(new BoxGeometry(1.1, 0.6, 0.7), wood); box.position.y = 0.3;
  const lid = new Mesh(new CylinderGeometry(0.35, 0.35, 1.1, 10, 1, false, 0, Math.PI), wood);
  lid.rotation.z = Math.PI / 2; lid.position.set(0, 0.6, -0.1); lid.rotation.x = -0.55;
  const band1 = new Mesh(new BoxGeometry(0.08, 0.62, 0.72), gold); band1.position.set(-0.36, 0.31, 0);
  const band2 = band1.clone(); band2.position.x = 0.36;
  const lock = new Mesh(new BoxGeometry(0.16, 0.18, 0.04), gold); lock.position.set(0, 0.42, 0.37);
  const shine = new Mesh(new BoxGeometry(0.8, 0.1, 0.5), toon({ color: '#FFD86A', emissive: '#B8862A', spec: 0.9 })); shine.position.y = 0.58;
  const mound = new Mesh(new CylinderGeometry(1.25, 1.7, 0.36, 12), soil); mound.position.y = 0.05;
  g.add(mound, box, lid, band1, band2, lock, shine);
  g.traverse((o) => { o.userData.noOutline = true; });
  return g;
}

export class TreasureHuntView {
  readonly root = new Group();
  private readonly stakes: InstancedMesh;
  private readonly chest: Group;
  private chestOn = false;
  private time = 0;

  constructor(scene: Scene) {
    this.root.name = 'treasureHunt';
    scene.add(this.root);
    this.stakes = new InstancedMesh(stakeGeometry(), toon({ color: '#FFFFFF', vertexColors: true }), MAX_SITES * STAKES_PER_SITE);
    this.stakes.instanceMatrix.setUsage(DynamicDrawUsage);
    this.stakes.count = 0;
    this.stakes.frustumCulled = false;
    this.stakes.userData.noOutline = true;
    this.root.add(this.stakes);
    this.chest = chestGroup();
    this.chest.visible = false;
    this.root.add(this.chest);
  }

  /** Pfähle rund um die ersten `count` Suchbereiche setzen (höchstens `MAX_SITES`); `groundAt` liefert die Laufhöhe */
  setSites(sites: readonly HuntSiteView[], count: number, groundAt: (x: number, z: number) => number, dt: number) {
    this.time += dt;
    const n = Math.min(MAX_SITES, count, sites.length);
    for (let k = 0; k < n; k++) {
      const s = sites[k];
      for (let j = 0; j < STAKES_PER_SITE; j++) {
        const a = (j / STAKES_PER_SITE) * Math.PI * 2;
        const x = s.x + Math.cos(a) * s.r, z = s.z + Math.sin(a) * s.r;
        const y = groundAt(x, z);
        // Wimpel flattern leicht (Drehung um den Pfahl)
        _q.setFromAxisAngle(UP, -a + Math.sin(this.time * 2.4 + j) * 0.25);
        _m.compose(_v.set(x, Number.isFinite(y) ? y - 0.15 : -800, z), _q, _s.set(1, 1, 1));
        this.stakes.setMatrixAt(k * STAKES_PER_SITE + j, _m);
      }
    }
    for (let i = n * STAKES_PER_SITE; i < this.stakes.count; i++) this.stakes.setMatrixAt(i, HIDDEN);
    this.stakes.count = n * STAKES_PER_SITE;
    this.stakes.visible = n > 0;
    if (n) this.stakes.instanceMatrix.needsUpdate = true;
  }

  /** Truhe nach dem Hinterhalt in der Mitte des Suchbereichs zeigen bzw. nach dem Bergen verbergen */
  showChest(x: number, y: number, z: number, yaw: number) {
    this.chest.position.set(x, y, z);
    this.chest.rotation.y = yaw;
    this.chest.visible = true;
    this.chestOn = true;
  }
  hideChest() { this.chest.visible = false; this.chestOn = false; }
  get chestShown(): boolean { return this.chestOn; }

  /** Beim Laden einmal zeigen, damit der Ladebildschirm die Shader vorübersetzt */
  prewarm(on: boolean, at: Vector3) {
    if (on) {
      this.stakes.count = 1; this.stakes.setMatrixAt(0, _m.makeTranslation(at.x, -2000, at.z)); this.stakes.instanceMatrix.needsUpdate = true; this.stakes.visible = true;
      this.chest.position.set(at.x, -2000, at.z); this.chest.visible = true;
    } else {
      this.stakes.count = 0; this.stakes.visible = false;
      if (!this.chestOn) this.chest.visible = false;
    }
  }

  dispose() { disposeObject(this.root); }
}
