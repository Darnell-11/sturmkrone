// Phase 4.7D – Bühnenbauten des Prologs:
//  - Grünmarkt: eine Hafenstadt im Abendlicht (Gelände mit Uferterrasse und Hügel, Kaimauer, Fachwerk- und Hafenhäuser, Kran, Leuchtturm,
//    Marktstände, Laternen, Stege, schaukelnde Boote, Bewohner bei der Arbeit) – und ihre Zerstörung in Szene 3 (Brände, Einstürze, fliehende
//    Bewohner, zerschossene Boote, am Ende Ruinen unter Rauch). Grünmarkt existiert nur im Prolog; im Spiel liegt dort offene See.
//  - Meeresgrund unter dem Ozean-Graben (Szene 5): Sand und Felsrippen, sichtbar, sobald der Strahl das Wasser bis auf den Grund spaltet.
// Alles aus den vorhandenen Bausteinen (world/architecture.ts, Insel-Materialien, Figuren) – keine neuen Shader. Bau in Teilschritten
// (Ladescreen), danach je Bild nichts Neues.
import { BufferAttribute, BufferGeometry, Box3, Group, Mesh, Object3D, Vector3, type Scene } from 'three';
import { GRUENMARKT, type GmClip, type GmHouse } from '../data/prologue';
import { frameToWorld, gmCoastZ, gmHeight, type StageFrame } from './prologueGeo';
import { build, type Built } from './architecture';
import { mergeByMaterial } from './town';
import { styleKit } from './islandStyle';
import { toon } from '../render/toon';
import { disposeObject } from '../render/dispose';
import { glowHub, makeEmitter } from '../render/glow';
import { seeded } from './waves';
import { Character } from '../entities/character/character';
import type { CharacterAssets } from '../entities/character/assets';
import { randomLook, type NpcRole } from '../data/characterParts';

export { frameToWorld, gmCoastZ, gmHeight, type StageFrame };

const _w = { x: 0, y: 0, z: 0 };
const _box = new Box3();
const _v = new Vector3();

/** Geländenetz: Raster über dem Inselrechteck; Zellen oberhalb des Strands bekommen Wiese, die übrigen Sand (zwei Netze, eine Geometrie je Material) */
function terrain(): { grass: BufferGeometry; sand: BufferGeometry } {
  const x0 = -130, x1 = 130, z0 = -165, z1 = 12, step = 2.6;
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + (i / nx) * (x1 - x0), z = z0 + (j / nz) * (z1 - z0), o = (j * (nx + 1) + i) * 3;
    pos[o] = x; pos[o + 1] = gmHeight(x, z); pos[o + 2] = z;
  }
  const gi: number[] = [], si: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    const avg = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1] + pos[d * 3 + 1]) / 4;
    const mn = Math.min(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1], pos[d * 3 + 1]);
    if (mn < -4.9) continue;
    (avg > GRUENMARKT.plateau * 0.8 ? gi : si).push(a, c, b, b, c, d);
  }
  const mk = (idx: number[]) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos.slice(), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Normalen zeigen nach oben (Dreiecke sind so gewunden): sonst umdrehen
    const n = g.getAttribute('normal');
    if (n.count && n.getY(Math.floor(n.count / 2)) < 0) { const ix = g.getIndex()!; for (let k = 0; k < ix.count; k += 3) { const t = ix.getX(k + 1); ix.setX(k + 1, ix.getX(k + 2)); ix.setX(k + 2, t); } g.computeVertexNormals(); }
    g.computeBoundingSphere();
    return g;
  };
  return { grass: mk(gi), sand: mk(si) };
}

// ---------------------------------------------------------------------------------------------------------------
// Grünmarkt
// ---------------------------------------------------------------------------------------------------------------

interface House { type: GmHouse; b: Built; x: number; z: number; y: number; yaw: number; top: number; fire: Object3D; burning: boolean; fall: number; fallDir: number; ruin: Group | null; gone: boolean }
interface Boat { g: Group; x: number; z: number; yaw: number; wx: number; wz: number; phase: number; sunk: number }
interface Folk { c: Character; clip: GmClip; x: number; z: number; yaw: number; walk: number; dir: number; flee: number; fallen: boolean; wx: number; wz: number }

export class GruenmarktStage {
  readonly group = new Group();
  private readonly houses: House[] = [];
  private readonly boats: Boat[] = [];
  private readonly folk: Folk[] = [];
  private readonly glowOwner = {};
  private readonly fireOwner = {};
  private built = false;
  private t = 0;

  constructor(private readonly scene: Scene, readonly frame: StageFrame, private readonly assets: CharacterAssets | null) {
    this.group.name = 'gruenmarkt';
    this.group.position.set(frame.x, 0, frame.z);
    this.group.rotation.y = frame.h;
  }

  get ready(): boolean { return this.built; }
  /** Häuser (Prüfungen) */
  get houseCount(): number { return this.houses.length; }
  get burning(): number { return this.houses.filter((h) => h.burning).length; }
  get razed(): boolean { return this.houses.every((h) => h.gone || h.type === 'leuchtturm'); }
  get folkCount(): number { return this.folk.length; }

  /** Lage eines Hauses (Welt, für Treffer und Feuer) */
  housePos(i: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } | null {
    const h = this.houses[i];
    if (!h) return null;
    return frameToWorld(this.frame, h.x, h.y + h.top * 0.6, h.z, out);
  }
  get houseTotal(): number { return this.houses.length; }

  /** In Teilschritten bauen (Ladescreen): Gelände, Kaimauer, Häuser, Kleinkram, Stege, Boote, Bewohner, Ruinen */
  *build(): Generator<void, void> {
    const G = GRUENMARKT;
    const rnd = seeded(0x9e7a1c);
    const kit = styleKit('festland');
    const t = terrain();
    const grass = new Mesh(t.grass, kit.grass), sand = new Mesh(t.sand, kit.sand);
    grass.receiveShadow = sand.receiveShadow = true;
    grass.userData.noOutline = sand.userData.noOutline = true;
    this.group.add(grass, sand);
    // Kaimauer: Steinquader entlang der Küste, Kante bei Terrassenhöhe
    {
      const stone = toon({ color: '#A8A092', detail: 'stone', forge: 'mauerwerk' });
      const quay = new Group();
      for (let x = -64; x < 64; x += 8) {
        const geo = boxGeo(8.04, G.plateau + 4.2, 2.4);
        const m = new Mesh(geo, stone);
        m.position.set(x + 4, (G.plateau - 4.2) / 2 + 0.06, gmCoastZ(x + 4) - 0.6);
        quay.add(m);
      }
      this.group.add(quay);
      mergeByMaterial(quay, new Set());
    }
    yield;
    // Häuser
    for (const [type, x, z, yaw] of G.houses) {
      const b = build(type, rnd);
      const y = gmHeight(x, z);
      b.g.position.set(x, y - 0.05, z);
      b.g.rotation.y = yaw;
      this.group.add(b.g);
      b.g.updateMatrixWorld(true);
      // je Haus und Material ein Netz (wenige Zeichenaufrufe; jedes Haus kann einzeln einstürzen)
      mergeByMaterial(b.g, new Set());
      b.g.traverse((o) => { const m = o as Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      _box.setFromObject(b.g);
      const top = Math.max(3, _box.max.y - y);
      const fire = new Object3D();
      fire.position.set(x + (rnd() - 0.5) * 2, y + top * 0.72, z + (rnd() - 0.5) * 2);
      this.group.add(fire);
      this.houses.push({ type, b, x, z, y, yaw, top, fire, burning: false, fall: -1, fallDir: rnd() < 0.5 ? -1 : 1, ruin: null, gone: false });
      this.addGlows(b, x, y, z, yaw);
      yield;
    }
    // Kleinkram an der Kaimauer und die Stege ins Hafenbecken: eine Gruppe, je Material ein Netz
    const props = new Group();
    this.group.add(props);
    for (const [type, x, z] of G.props) {
      const b = build(type, rnd);
      const y = gmHeight(x, z);
      b.g.position.set(x, y - 0.03, z);
      b.g.rotation.y = rnd() * 0.6 - 0.3;
      props.add(b.g);
      this.addGlows(b, x, y, z, b.g.rotation.y);
    }
    for (const [x, len] of G.piers) {
      const b = build('steg', rnd, len);
      b.g.position.set(x, 0, gmCoastZ(x) - 0.4);
      props.add(b.g);
      this.addGlows(b, x, 0, gmCoastZ(x) - 0.4, 0);
    }
    yield;
    mergeByMaterial(props, new Set());
    props.traverse((o) => { const m = o as Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    yield;
    // Boote (schaukeln auf den Wellen)
    for (const [x, z, yaw] of G.boats) {
      const b = build('boot', rnd);
      b.g.position.set(x, 0, z);
      b.g.rotation.y = yaw;
      this.group.add(b.g);
      mergeByMaterial(b.g, new Set());
      frameToWorld(this.frame, x, 0, z, _w);
      this.boats.push({ g: b.g, x, z, yaw, wx: _w.x, wz: _w.z, phase: rnd() * 6, sunk: -1 });
    }
    yield;
    // Ruinen für das Ende von Szene 3 (verborgen, bis Grünmarkt dem Erdboden gleichgemacht ist)
    for (const h of this.houses) {
      if (h.type === 'leuchtturm' || h.type === 'marktstand' || h.type === 'kran') continue;
      const r = build('ruine', rnd);
      r.g.position.set(h.x, h.y - 0.1, h.z);
      r.g.rotation.y = h.yaw + (rnd() - 0.5) * 0.4;
      this.group.add(r.g);
      mergeByMaterial(r.g, new Set());
      r.g.visible = false;
      h.ruin = r.g;
    }
    yield;
    this.scene.add(this.group);
    this.group.updateMatrixWorld(true);
    // Bewohner bei der Arbeit (echte Figuren mit Mimik und Rig)
    if (this.assets) {
      const roles: NpcRole[] = ['fischer', 'fischer', 'buerger', 'haendler', 'schmied', 'buerger', 'buerger', 'haendler', 'wirt', 'koch'];
      for (let i = 0; i < G.folk.length; i++) {
        const [clip, x, z, yaw, walk] = G.folk[i];
        const look = randomLook(rnd, roles[i % roles.length]);
        const c = new Character(this.assets, look, true);
        const y = z > 0 ? 1.27 + 0.18 : gmHeight(x, z);
        frameToWorld(this.frame, x, y, z, _w);
        const wyaw = this.frame.h + yaw;
        c.place(_w.x, _w.y, _w.z, wyaw);
        c.playClip(clip, { loop: true, fade: 0 });
        c.setMood('hafen', 0.7);
        this.scene.add(c.holder);
        this.folk.push({ c, clip, x, z, yaw, walk: walk ?? 0, dir: 1, flee: -1, fallen: false, wx: _w.x, wz: _w.z });
        yield;
      }
    }
    this.built = true;
  }

  /** Lichter eines Baus (Fenster, Laternen) als Glüh-Emitter in Welt-Koordinaten */
  private addGlows(b: Built, x: number, y: number, z: number, yaw: number) {
    if (!b.glows?.length) return;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const g of b.glows) {
      const lx = x + g.x * c + g.z * s, lz = z - g.x * s + g.z * c;
      frameToWorld(this.frame, lx, y + g.y, lz, _w);
      glowHub.add(makeEmitter(g.kind, _w.x, _w.y, _w.z, { size: g.size, pool: g.pool, ground: g.gy == null ? null : y + g.gy, glint: g.glint, owner: this.glowOwner }));
    }
  }

  /** Je Bild: Boote schaukeln, Bewohner gehen ihre Wege, Häuser stürzen ein */
  update(dt: number, waterY: (x: number, z: number) => number) {
    if (!this.built) return;
    this.t += dt;
    for (const b of this.boats) {
      if (b.sunk >= 0) { b.sunk += dt; b.g.position.y = waterY(b.wx, b.wz) - b.sunk * 0.9; b.g.rotation.z = Math.min(1.2, b.sunk * 0.6); if (b.sunk > 4) b.g.visible = false; continue; }
      b.g.position.y = waterY(b.wx, b.wz) - 0.05;
      b.g.rotation.set(Math.sin(this.t * 1.3 + b.phase) * 0.05, b.yaw, Math.sin(this.t * 1.7 + b.phase * 1.3) * 0.07);
    }
    for (const f of this.folk) {
      if (f.fallen) { f.c.update(dt); continue; }
      if (f.flee >= 0) {
        // fliehen landeinwärts (weg vom Hafen)
        f.flee += dt;
        f.z -= dt * 5.2;
        f.x += dt * f.dir * 0.8;
        this.placeFolk(f, f.yaw = Math.PI);
      } else if (f.walk > 0) {
        f.x += f.dir * dt * 1.25;
        if (Math.abs(f.x - this.homeX(f)) > f.walk / 2) f.dir = -f.dir;
        this.placeFolk(f, f.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      f.c.update(dt);
    }
    for (const h of this.houses) {
      if (h.fall < 0 || h.gone) continue;
      h.fall += dt;
      const k = Math.min(1, h.fall / 2.4);
      h.b.g.rotation.set(h.fallDir * 0.5 * k * k, h.yaw, h.fallDir * 0.35 * k * k);
      h.b.g.position.y = h.y - 0.05 - k * k * h.top * 0.9;
      if (h.fall > 2.4) { h.b.g.visible = false; h.gone = true; if (h.ruin) h.ruin.visible = true; }
    }
  }

  private homeX(f: Folk): number { return GRUENMARKT.folk[this.folk.indexOf(f)]?.[1] ?? f.x; }

  private placeFolk(f: Folk, yaw: number) {
    const y = f.z > 0 ? 1.45 : gmHeight(f.x, f.z);
    frameToWorld(this.frame, f.x, y, f.z, _w);
    f.wx = _w.x; f.wz = _w.z;
    f.c.place(_w.x, _w.y, _w.z, this.frame.h + yaw);
  }

  /** Szene 1: der Wind dreht – die Bewohner schauen auf (zum Meer) */
  lookUp() {
    for (const f of this.folk) {
      if (f.walk > 0) continue;
      frameToWorld(this.frame, f.x, 6, f.z + 400, _w);
      f.c.lookAt(_w.x, _w.y, _w.z);
      f.c.setMood('erstaunt', 0.6);
    }
  }

  /** Szene 3: alle fliehen landeinwärts (manche stürzen) */
  flee() {
    for (let i = 0; i < this.folk.length; i++) {
      const f = this.folk[i];
      if (f.flee >= 0 || f.fallen) continue;
      f.flee = 0;
      f.dir = i % 2 ? 1 : -1;
      f.c.playClip('Running_A', { loop: true, fade: 0.15 });
      f.c.setMood('schmerz', 0.8);
      f.c.lookAt(null);
    }
  }

  /** Eine Figur stürzt (Treffer in der Nähe) */
  knockDown(i: number) {
    const f = this.folk[i % Math.max(1, this.folk.length)];
    if (!f || f.fallen) return;
    f.fallen = true;
    f.c.playClip('Death_A', { loop: false, fade: 0.1 });
  }

  /** Haus `i` brennt (echte 3D-Flammen über das GlowSystem) */
  ignite(i: number, size = 2.4) {
    const h = this.houses[i];
    if (!h || h.burning || h.gone) return;
    h.burning = true;
    h.fire.updateMatrixWorld(true);
    h.fire.getWorldPosition(_v);
    glowHub.add(makeEmitter('fire', _v.x, _v.y, _v.z, { size: size + h.top * 0.18, owner: this.fireOwner }));
  }

  /** Haus `i` stürzt ein (kippt und sackt weg, danach steht die Ruine) */
  collapse(i: number) {
    const h = this.houses[i];
    if (!h || h.fall >= 0 || h.gone) return;
    h.fall = 0;
  }

  /** Boot `i` zerschossen: es sinkt */
  sinkBoat(i: number) {
    const b = this.boats[i % Math.max(1, this.boats.length)];
    if (b && b.sunk < 0) b.sunk = 0;
  }
  boatPos(i: number, out: { x: number; z: number }) { const b = this.boats[i % Math.max(1, this.boats.length)]; if (b) { out.x = b.wx; out.z = b.wz; } return out; }

  /** Grünmarkt wird dem Erdboden gleichgemacht: alle Häuser stürzen, die Ruinen bleiben */
  raze() {
    for (let i = 0; i < this.houses.length; i++) {
      const h = this.houses[i];
      if (h.type === 'leuchtturm') continue;
      if (h.fall < 0) { h.fall = Math.min(0.3, (i % 5) * 0.06); this.ignite(i, 1.6); }
    }
    for (let i = 0; i < this.boats.length; i++) this.sinkBoat(i);
  }

  /** Vorwärmen: auch die verborgenen Ruinen zeigen (nur sichtbare Objekte werden übersetzt), danach wieder verbergen */
  warmAll(on: boolean) { for (const h of this.houses) if (h.ruin && !h.gone) h.ruin.visible = on; }

  /** Bühne sichtbar (Szenen 1 – 3) oder verborgen (auf hoher See) */
  set visible(v: boolean) {
    this.group.visible = v;
    for (const f of this.folk) f.c.holder.visible = v;
    if (!v) { glowHub.removeOwner(this.glowOwner); glowHub.removeOwner(this.fireOwner); }
  }

  /** Abbau: Netze (geteilte Materialien bleiben), Figuren, Lichter */
  dispose() {
    glowHub.removeOwner(this.glowOwner);
    glowHub.removeOwner(this.fireOwner);
    for (const f of this.folk) { f.c.holder.removeFromParent(); f.c.dispose(); }
    this.folk.length = 0;
    this.group.removeFromParent();
    disposeObject(this.group);
    this.houses.length = 0;
    this.boats.length = 0;
  }
}

/** Quader mit Position und Normale (Kaimauer, Meeresgrund-Rippen) */
function boxGeo(w: number, h: number, d: number): BufferGeometry {
  const x = w / 2, y = h / 2, z = d / 2;
  const P = [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]];
  const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [3, 2, 7, 6], [5, 4, 1, 0], [1, 4, 7, 2], [5, 0, 3, 6]];
  const pos: number[] = [], idx: number[] = [];
  for (const f of faces) {
    const o = pos.length / 3;
    for (const i of f) pos.push(...P[i]);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Meeresgrund unter dem Ozean-Graben (Szene 5)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Sandiger Meeresgrund mit Felsrippen entlang der Grabenlinie: Länge `len` (lokal z von 0 bis len), halbe Breite `hw`, in `depth` m Tiefe.
 * Die Gruppe wird in Richtung des Strahls gedreht; sie bleibt verborgen, bis der Graben sich öffnet.
 */
export function buildSeabed(len: number, hw: number, depth: number): Group {
  const g = new Group();
  g.name = 'meeresgrund';
  const kit = styleKit('festland');
  const nx = 10, nz = Math.max(8, Math.round(len / 6));
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  const rnd = seeded(0x5eab3d);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / nz, o = (j * (nx + 1) + i) * 3;
    const x = (u - 0.5) * hw * 2.6;
    // flacher Grund unter dem ganzen Graben; erst hinter den Wasserwänden steigt er an (4.7D: vorher ragten die Hänge innerhalb des Grabens
    // über das abgesenkte Wasser und verdeckten die Wasserwände wie Sandklippen)
    const ax = Math.abs(x), k = Math.min(1, Math.max(0, (ax - (hw - 2)) / (hw * 1.3 - (hw - 2))));
    pos[o] = x; pos[o + 1] = -depth + k * k * (3 - 2 * k) * depth * 0.45 + (rnd() - 0.5) * 0.6; pos[o + 2] = v * len;
  }
  const idx: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Normalen nach oben (die Kamera schaut von oben in den Graben)
  if (geo.getAttribute('normal').getY(Math.floor(nx / 2)) < 0) {
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  const bed = new Mesh(geo, kit.sand);
  bed.receiveShadow = true;
  bed.userData.noOutline = true;
  g.add(bed);
  // Felsrippen am Grund
  for (let k = 0; k < 14; k++) {
    const r = new Mesh(boxGeo(1.6 + rnd() * 2.2, 1.2 + rnd() * 2.6, 3 + rnd() * 5), kit.rock);
    r.position.set((rnd() - 0.5) * hw * 1.4, -depth + 0.6, rnd() * len);
    r.rotation.set(rnd() * 0.5, rnd() * 3, rnd() * 0.4);
    g.add(r);
  }
  g.visible = false;
  return g;
}
