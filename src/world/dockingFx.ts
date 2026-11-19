// Darstellung der Anleger- und Enterbrücken: Gangway, Enterplanken, Belagerungs-/Strickleitern, Festmacher- und Enterhaken-Taue.
// Nur Meshes; Zustand und Geometrie kommen aus `docking.ts` und dem `CompositeGround`. Alles Temporäre wird beim Einholen entfernt
// und mit `disposeObject()` freigegeben (Geometrien gehören der Ansicht, Toon-Materialien sind geteilt). Keine Allokationen je Bild:
// Vektoren und Matrizen sind modulweit vorab angelegt, die Seile/Brücken nur umpositioniert.
import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Group, MathUtils, Matrix4, Mesh, Quaternion, Vector3, type Scene } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { disposeObject, markShared } from '../render/dispose';
import { toon } from '../render/toon';
import { spanLength, type BridgeKind } from './docking';
import type { BridgeRt } from './islandGround';
import { smooth01 } from '../core/mathUtil';

const WOOD = toon('#A97E4F');
const WOOD_DARK = toon('#4A3120');
const ROPE = toon('#C9B184');
const IRON = toon('#34363B');

// gemeinsame Einheitsgeometrien (Taue, Haken, Poller): als geteilt markiert, nie freigegeben
const ROPE_GEO = markShared(new CylinderGeometry(1, 1, 1, 5, 1, false));
ROPE_GEO.rotateX(Math.PI / 2); // Länge entlang +z
const HOOK_GEO = markShared(new ConeGeometry(0.18, 0.55, 5));
HOOK_GEO.rotateX(Math.PI / 2);
const POST_GEO = markShared(new CylinderGeometry(0.17, 0.2, 0.7, 7));

/** Teilstücke je Tau: die Kurve (Durchhang, Flugbogen des Hakens) wirkt rund statt geknickt */
const ROPE_SEGS = 6;

const _p = new Vector3();
const _q = new Vector3();
const _d = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _up = new Vector3(0, 1, 0);
const _m = new Matrix4();
const _quat = new Quaternion();
const _ra = { x: 0, y: 0, z: 0 };
const _rb = { x: 0, y: 0, z: 0 };

/** Orientierung mit +z entlang `d` und möglichst waagerechter x-Achse (Rollen ausgeschlossen) */
function aim(d: Vector3, out: Quaternion): Quaternion {
  _x.crossVectors(_up, d);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(d, _x);
  _m.makeBasis(_x, _y, d);
  return out.setFromRotationMatrix(_m);
}


export type BridgeStyle = 'gangway' | 'plank' | 'siege' | 'rope';

interface BridgeView {
  id: string;
  rt: BridgeRt;
  group: Group;
  style: BridgeStyle;
  /** Länge, für die die Geometrie gebaut wurde (die Lage ändert sich nur wenig; sie wird darauf skaliert) */
  planned: number;
  /** Drehpunkt: am Ende a (Planke vom Angreifer aus) oder b (Gangway/Leiter hängt am Deck) */
  pivotA: boolean;
  /** Anteil des Einklappens (0 = ganz eingeholt), folgt `rt.def.out` */
  shown: number;
}

interface RopeView { id: string; a: (o: { x: number; y: number; z: number }) => void; b: (o: { x: number; y: number; z: number }) => void; segs: Mesh[]; hook: Mesh | null; droop: number; radius: number; t: number }

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** Geometrie einer Brücke entlang +z (Mitte im Ursprung, Oberkante des Belags bei y = 0) */
function buildBridgeMeshes(style: BridgeStyle, hw: number, len: number): Group {
  const g = new Group();
  const parts = (list: BufferGeometry[]) => { const m = mergeGeometries(list, false); for (const l of list) l.dispose(); return m; };
  if (style === 'gangway' || style === 'plank') {
    const thick = style === 'plank' ? 0.16 : 0.09;
    const deck = new Mesh(boxAt(hw * 2, thick, len, 0, -thick / 2, 0), WOOD);
    // Quer-Latten gegen das Rutschen
    const slats: BufferGeometry[] = [];
    for (let z = -len / 2 + 0.3; z < len / 2 - 0.1; z += 0.42) slats.push(boxAt(hw * 2 + 0.06, 0.035, 0.1, 0, 0.012, z));
    const lat = new Mesh(parts(slats), WOOD_DARK);
    g.add(deck, lat);
    if (style === 'gangway') {
      // Wangen an den Kanten, Handlauf auf Pfosten und ein durchhängendes Seil darunter (statt dünner heller Stangen)
      const sides: BufferGeometry[] = [], hand: BufferGeometry[] = [], cord: BufferGeometry[] = [];
      for (const sd of [-1, 1]) {
        sides.push(boxAt(0.07, 0.2, len, sd * (hw + 0.02), -0.06, 0));
        hand.push(boxAt(0.07, 0.07, len, sd * hw, 1.0, 0));
        cord.push(boxAt(0.035, 0.035, len, sd * hw, 0.55, 0));
        for (let z = -len / 2 + 0.1; z <= len / 2 + 0.01; z += 1.2) hand.push(boxAt(0.08, 1.02, 0.08, sd * hw, 0.5, z));
      }
      g.add(new Mesh(parts(sides), WOOD_DARK), new Mesh(parts(hand), WOOD_DARK), new Mesh(parts(cord), ROPE));
    } else {
      // Enterplanke: dicke Bohlen-Kante und Eisenbeschläge an den Enden
      const cap = [boxAt(hw * 2 + 0.1, 0.1, 0.12, 0, 0.0, -len / 2 + 0.06), boxAt(hw * 2 + 0.1, 0.1, 0.12, 0, 0.0, len / 2 - 0.06)];
      g.add(new Mesh(parts(cap), IRON));
    }
  } else {
    // Leiter (Belagerungs- oder Strickleiter): zwei Holme, Sprossen
    const rail = style === 'siege' ? 0.09 : 0.045;
    const bars: BufferGeometry[] = [];
    for (const s of [-1, 1]) bars.push(boxAt(rail, rail, len, s * hw * 0.88, 0, 0));
    const rungs: BufferGeometry[] = [];
    for (let z = -len / 2 + 0.25; z < len / 2 - 0.05; z += 0.36) rungs.push(boxAt(hw * 1.76, style === 'siege' ? 0.06 : 0.045, style === 'siege' ? 0.07 : 0.05, 0, 0, z));
    g.add(new Mesh(parts(bars), style === 'siege' ? WOOD_DARK : ROPE), new Mesh(parts(rungs), WOOD));
    if (style === 'siege') {
      // Haken oben (eiserne Spitzen über der Reling)
      const hooks = [boxAt(hw * 1.9, 0.07, 0.3, 0, 0.05, len / 2 + 0.05)];
      g.add(new Mesh(parts(hooks), IRON));
    }
  }
  g.traverse((o) => { o.castShadow = true; o.userData.noOutline = true; });
  return g;
}

/**
 * Brücken, Taue und Poller sichtbar machen und nachführen. Eine Instanz gehört der Welt; `clear()` räumt alles ab (Ablegen, Ende des
 * Enterkampfs), `dispose()` beim Abbau der Welt.
 */
export class DockingFx {
  private root = new Group();
  private views: BridgeView[] = [];
  private ropes: RopeView[] = [];
  private posts: Mesh[] = [];

  constructor(scene: Scene) {
    this.root.name = 'dockingFx';
    scene.add(this.root);
  }

  get active() { return this.views.length + this.ropes.length + this.posts.length > 0; }

  // ---------- Brücken ----------

  /** Mesh für eine im Verbund eingetragene Brücke anlegen (die Länge wird aus der aktuellen Lage genommen) */
  addBridge(rt: BridgeRt, style: BridgeStyle) {
    this.removeBridge(rt.def.id);
    if (!rt.ok) return;
    const planned = Math.max(0.8, spanLength(rt.f));
    const group = buildBridgeMeshes(style, rt.def.hw, planned);
    group.visible = false;
    this.root.add(group);
    this.views.push({ id: rt.def.id, rt, group, style, planned, pivotA: style === 'plank', shown: 0 });
  }

  removeBridge(id: string) {
    const i = this.views.findIndex((v) => v.id === id);
    if (i < 0) return;
    disposeObject(this.views[i].group);
    this.views.splice(i, 1);
  }

  // ---------- Taue und Poller ----------

  /** Tau zwischen zwei bewegten Punkten (Funktionen liefern die Weltlage); `hook` zeigt einen Enterhaken am Ende; `droop` = Durchhang in m */
  addRope(id: string, a: RopeView['a'], b: RopeView['b'], opts: { radius?: number; droop?: number; hook?: boolean; t?: number } = {}) {
    this.removeRope(id);
    const segs: Mesh[] = [];
    for (let i = 0; i < ROPE_SEGS; i++) { const m = new Mesh(ROPE_GEO, ROPE); m.userData.noOutline = true; m.castShadow = true; this.root.add(m); segs.push(m); }
    let hook: Mesh | null = null;
    if (opts.hook) { hook = new Mesh(HOOK_GEO, IRON); hook.userData.noOutline = true; this.root.add(hook); }
    this.ropes.push({ id, a, b, segs, hook, droop: opts.droop ?? 0.12, radius: opts.radius ?? 0.045, t: opts.t ?? 1 });
  }

  /** Flug des Enterhakens: 0 = an Bord des Angreifers, 1 = fest an der Reling des Gegners */
  setRopeProgress(id: string, t: number) { const r = this.ropes.find((x) => x.id === id); if (r) r.t = MathUtils.clamp(t, 0, 1); }

  /** Durchhang eines Taus ändern (beim Heranziehen spannt es sich) */
  setRopeDroop(id: string, droop: number) { const r = this.ropes.find((x) => x.id === id); if (r) r.droop = Math.max(0, droop); }

  removeRope(id: string) {
    const i = this.ropes.findIndex((r) => r.id === id);
    if (i < 0) return;
    for (const s of this.ropes[i].segs) s.removeFromParent();
    this.ropes[i].hook?.removeFromParent();
    this.ropes.splice(i, 1);
  }

  /** Poller (Pfosten) an einem Weltpunkt, z. B. am Stegrand für die Festmacher */
  addPost(x: number, y: number, z: number) {
    const m = new Mesh(POST_GEO, WOOD_DARK);
    m.position.set(x, y + 0.35, z);
    m.userData.noOutline = true;
    m.castShadow = true;
    this.root.add(m);
    this.posts.push(m);
  }

  /** Flache Holzplatte (Anlegeplatte, Stegabschluss) an einem Weltpunkt; Maße in m, Drehung wie `rotation.y` */
  addSlab(x: number, y: number, z: number, w: number, d: number, yaw: number, thick = 0.14) {
    const m = new Mesh(new BoxGeometry(w, thick, d), WOOD);
    m.position.set(x, y - thick / 2 + 0.02, z);
    m.rotation.y = yaw;
    m.userData.noOutline = true;
    m.castShadow = true;
    this.root.add(m);
    this.posts.push(m);
  }

  // ---------- Bild ----------

  /** Je Bild: Brücken und Taue an die aktuelle Lage der Schiffe setzen */
  update(dt: number) {
    for (const v of this.views) this.placeBridge(v, dt);
    for (const r of this.ropes) this.placeRope(r);
  }

  private placeBridge(v: BridgeView, dt: number) {
    const rt = v.rt, f = rt.f;
    const want = rt.ok ? rt.def.out : 0;
    v.shown += (want - v.shown) * Math.min(1, dt * 6);
    if (Math.abs(want - v.shown) < 0.002) v.shown = want;
    const e = smooth01(v.shown);
    v.group.visible = rt.ok && v.shown > 0.01;
    if (!v.group.visible) return;
    const span = spanLength(f);
    const k = span / v.planned;
    // Drehpunkt und Richtung zum freien Ende
    const pivA = v.pivotA;
    const px = pivA ? f.ax : f.bx, py = pivA ? f.ay : f.by, pz = pivA ? f.az : f.bz;
    const qx = pivA ? f.bx : f.ax, qy = pivA ? f.by : f.ay, qz = pivA ? f.bz : f.az;
    _d.set(qx - px, qy - py, qz - pz);
    const l = _d.length() || 1;
    _d.divideScalar(l);
    if (v.style === 'rope' || v.style === 'siege') {
      // Leiter rollt von oben aus: Länge wächst, Richtung bleibt
      v.group.scale.set(1, 1, Math.max(0.02, k * e));
      _p.set(px, py, pz).addScaledVector(_d, (v.planned * k * e) / 2);
    } else {
      // Klappt aus der Senkrechten herunter (Drehpunkt am Anker), landet mit voller Länge bündig auf dem anderen Anker
      const hx = _d.x, hz = _d.z, hl = Math.hypot(hx, hz) || 1;
      _q.set((hx / hl) * 0.2, 1, (hz / hl) * 0.2).normalize();
      _d.lerp(_q, 1 - e).normalize();
      v.group.scale.set(1, 1, MathUtils.lerp(1, k, e));
      _p.set(px, py, pz).addScaledVector(_d, (v.planned * MathUtils.lerp(1, k, e)) / 2);
    }
    v.group.position.copy(_p);
    v.group.quaternion.copy(aim(_d, _quat));
  }

  private placeRope(r: RopeView) {
    r.a(_ra); r.b(_rb);
    // Haken fliegt im Bogen von a nach b; danach liegt er fest
    const t = r.t;
    _p.set(_ra.x, _ra.y, _ra.z);
    _q.set(_rb.x, _rb.y, _rb.z);
    const arc = r.hook ? Math.sin(Math.PI * t) * Math.min(4, _p.distanceTo(_q) * 0.25) : 0;
    const ex = _p.x + (_q.x - _p.x) * t, ey = _p.y + (_q.y - _p.y) * t + arc, ez = _p.z + (_q.z - _p.z) * t;
    // Kurve aus ROPE_SEGS Stücken: gerade Linie p → e, Durchhang als Parabel (mitten am tiefsten)
    let px = _p.x, py = _p.y, pz = _p.z;
    for (let i = 1; i <= ROPE_SEGS; i++) {
      const u = i / ROPE_SEGS;
      const nx = _p.x + (ex - _p.x) * u, nz = _p.z + (ez - _p.z) * u;
      const ny = _p.y + (ey - _p.y) * u - r.droop * 4 * u * (1 - u);
      this.seg(r.segs[i - 1], px, py, pz, nx, ny, nz, r.radius);
      px = nx; py = ny; pz = nz;
    }
    if (r.hook) {
      r.hook.position.set(ex, ey, ez);
      _d.set(_q.x - _p.x, _q.y - _p.y + 0.001, _q.z - _p.z).normalize();
      r.hook.quaternion.copy(aim(_d, _quat));
      r.hook.visible = r.t > 0.001;
    }
  }

  private seg(m: Mesh, ax: number, ay: number, az: number, bx: number, by: number, bz: number, rad: number) {
    _d.set(bx - ax, by - ay, bz - az);
    const l = _d.length();
    if (l < 1e-4) { m.visible = false; return; }
    m.visible = true;
    _d.divideScalar(l);
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.quaternion.copy(aim(_d, _quat));
    m.scale.set(rad, rad, l);
  }

  // ---------- Aufräumen ----------

  /** Alle Brücken, Taue und Poller abbauen und freigeben (Ablegen, Kampfende) */
  clear() {
    for (const p of this.posts) if (p.geometry && !p.geometry.userData.shared && p.geometry !== POST_GEO) p.geometry.dispose();
    for (const v of this.views) disposeObject(v.group);
    this.views.length = 0;
    for (const r of this.ropes) { for (const s of r.segs) s.removeFromParent(); r.hook?.removeFromParent(); }
    this.ropes.length = 0;
    for (const p of this.posts) p.removeFromParent();
    this.posts.length = 0;
  }

  dispose() { this.clear(); disposeObject(this.root); }

  /** Nur für Tests/Anzeige: wie viele Teile hängen gerade in der Szene */
  get counts() { return { bridges: this.views.length, ropes: this.ropes.length, posts: this.posts.length }; }
}

/** Welche Art Mesh gehört zu welcher Brücke */
export function styleFor(kind: BridgeKind, siege = false): BridgeStyle | null {
  if (kind === 'gangway') return 'gangway';
  if (kind === 'plank') return 'plank';
  if (kind === 'ladder') return siege ? 'siege' : 'rope';
  return null;
}
