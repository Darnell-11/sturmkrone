import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, EdgesGeometry, Group, LineBasicMaterial, LineSegments, CircleGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, SphereGeometry, TorusGeometry, type BufferGeometry, type Scene } from 'three';
import type { ZoneSpec } from '../data/combat';
import { q, sharedGeo } from '../render/geoCache';
import type { Enemy } from '../entities/enemy';
import { markShared } from '../render/dispose';
import { toon } from '../render/toon';

/**
 * Warnflächen der Boss-Angriffe: rote, sich füllende Flächen am Boden (Kreis, Ring, Linie, Kegel). Beim Einschlag
 * werden alle Spieler in der Fläche getroffen; wer vorher herauslief, nicht. Netze sind geteilt, Materialien je Fläche
 * und werden mit ihr freigegeben.
 */
export interface WarnZone {
  spec: ZoneSpec;
  x: number; z: number; y: number;
  /** Richtung (rotation.y), schon inklusive spec.turn */
  yaw: number;
  t: number; max: number;
  dmg: number; knock: number;
  from: Enemy;
  /** Angriffsnummer des Gegners beim Ausholen: ändert sie sich (Angriff abgebrochen), verfällt die Fläche */
  seq: number;
  group: Group;
  prog: Mesh;
  mats: (MeshBasicMaterial | LineBasicMaterial)[];
  /** Bleibt bestehen, auch wenn der Gegner schon den nächsten Angriff begonnen hat (Streuflächen, Fässer, Ketten) – verfällt nur bei Tod, Break und Phasenwechsel */
  sticky: boolean;
  /** Trifft unabhängig von den anderen Flächen desselben Angriffs (jede Streufläche für sich) */
  solo: boolean;
  /** Bild am Boden (Fass, Granate, Rune, Ketten, Signal) und seine Art */
  prop: Mesh | null;
  propKind: ZoneSpec['prop'] | null;
}

// ---------- Bilder der Flächen (geteilte Netze und Materialien, nie freigeben) ----------
const PROP_MATS = new Map<string, MeshBasicMaterial | ReturnType<typeof toon>>();
function propMat(kind: string): MeshBasicMaterial | ReturnType<typeof toon> {
  let m = PROP_MATS.get(kind);
  if (m) return m;
  switch (kind) {
    case 'fass': m = markShared(toon({ color: 0x7a4a26, spec: 0.3 })); break;
    case 'granate': m = markShared(toon({ color: 0x2a2a30, spec: 0.6, emissive: 0x7a1408 })); break;
    case 'rune': m = markShared(new MeshBasicMaterial({ color: new Color(1.7, 0.4, 3.0), transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false })); break;
    case 'kette': m = markShared(toon({ color: 0x5a6a80, spec: 0.8, emissive: 0x16304a })); break;
    default: m = markShared(new MeshBasicMaterial({ color: new Color(3.2, 1.5, 0.5), transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false, fog: false }));
  }
  PROP_MATS.set(kind, m);
  return m;
}
function propMesh(kind: NonNullable<ZoneSpec['prop']>, radius: number): Mesh {
  switch (kind) {
    case 'fass': return new Mesh(sharedGeo('zprop:fass', () => new CylinderGeometry(0.42, 0.46, 0.9, 10)), propMat('fass'));
    case 'granate': return new Mesh(sharedGeo('zprop:granate', () => new SphereGeometry(0.55, 12, 8)), propMat('granate'));
    case 'rune': return new Mesh(sharedGeo('zprop:rune', () => new RingGeometry(0.55, 0.62, 6, 1).rotateX(-Math.PI / 2)), propMat('rune'));
    case 'kette': return new Mesh(sharedGeo('zprop:kette', () => new TorusGeometry(0.85, 0.09, 6, 18).rotateX(Math.PI / 2)), propMat('kette'));
    default: { const m = new Mesh(sharedGeo('zprop:signal', () => new CylinderGeometry(0.16, 0.16, 26, 8, 1, true).translate(0, 13, 0)), propMat('signal')); void radius; return m; }
  }
}

const TAU = Math.PI * 2;
const WARN = new Color(1.7, 0.16, 0.08);
const EDGE = new Color(3.4, 0.7, 0.4);

/** Liegt ein Punkt (Spieler mit Radius r) in der Fläche? Reine Rechnung, ohne Grafik. */
export function zoneContains(z: { spec: ZoneSpec; x: number; z: number; yaw: number }, px: number, pz: number, r: number): boolean {
  const s = z.spec;
  const dx = px - z.x, dz = pz - z.z;
  const d = Math.hypot(dx, dz);
  switch (s.shape) {
    case 'circle': return d <= s.size + r;
    case 'ring': return d <= s.size + r && d >= (s.inner ?? 0) - r;
    case 'line': {
      const c = Math.cos(z.yaw), sn = Math.sin(z.yaw);
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      return lz >= -r && lz <= s.size + r && Math.abs(lx) <= (s.width ?? 2) / 2 + r;
    }
    case 'cone': {
      if (d > s.size + r) return false;
      if (d < 0.8) return true;
      const diff = Math.abs(((Math.atan2(dx, dz) - z.yaw + Math.PI * 3) % TAU) - Math.PI);
      return diff <= (s.arc ?? 2) / 2 + r / Math.max(d, 1);
    }
  }
}

/** Füllung der Form als Netz in der Bodenebene, Größe 1 (wird skaliert); Linie: von z = 0 bis 1 */
function fillGeo(s: ZoneSpec): BufferGeometry {
  switch (s.shape) {
    case 'circle': return sharedGeo('zone:c', () => new CircleGeometry(1, 56).rotateX(-Math.PI / 2));
    case 'ring': { const k = q((s.inner ?? 0) / s.size, 0.02); return sharedGeo(`zone:r:${k}`, () => new RingGeometry(k, 1, 64).rotateX(-Math.PI / 2)); }
    case 'line': return sharedGeo('zone:l', () => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5));
    case 'cone': { const a = q(s.arc ?? 2, 0.05); return sharedGeo(`zone:k:${a}`, () => new CircleGeometry(1, 40, -a / 2 - Math.PI / 2, a).rotateX(-Math.PI / 2)); }
  }
}

export class ZoneSystem {
  readonly zones: WarnZone[] = [];
  constructor(private scene: Scene) {}

  spawn(from: Enemy, spec: ZoneSpec, x: number, z: number, y: number, yaw: number, time: number, dmg: number, knock: number, seq: number, opts: { sticky?: boolean; solo?: boolean } = {}) {
    const fill = new MeshBasicMaterial({ color: WARN, transparent: true, opacity: 0.18, depthWrite: false, side: DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const prog = new MeshBasicMaterial({ color: WARN, transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const edge = new LineBasicMaterial({ color: EDGE, transparent: true, opacity: 0.95, depthWrite: false, fog: false });
    const geo = fillGeo(spec);
    const group = new Group();
    const wide = spec.shape === 'line' ? spec.width ?? 2 : spec.size;
    const long = spec.size;
    const base = new Mesh(geo, fill);
    const progMesh = new Mesh(geo, prog);
    const outline = new LineSegments(sharedGeo(`${geo.uuid}:e`, () => new EdgesGeometry(geo)), edge);
    for (const m of [base, outline]) m.scale.set(wide, 1, long);
    progMesh.scale.set(wide, 1, 0.001);
    base.renderOrder = 3; progMesh.renderOrder = 4; outline.renderOrder = 5;
    group.add(base, progMesh, outline);
    group.position.set(x, y + 0.09, z);
    group.rotation.y = yaw;
    // Bild am Boden: Fässer und Granaten fallen aus der Höhe, Runen und Ketten drehen sich, das Signal steigt als Leuchtstrahl
    let prop: Mesh | null = null;
    if (spec.prop) {
      prop = propMesh(spec.prop, spec.size);
      prop.userData.noOutline = true;
      if (spec.prop === 'rune' || spec.prop === 'kette') prop.scale.setScalar(Math.max(1, spec.size * 0.9));
      prop.rotation.y = -yaw;
      group.add(prop);
    }
    this.scene.add(group);
    this.zones.push({ spec, x, z, y, yaw, t: time, max: time, dmg, knock, from, seq, group, prog: progMesh, mats: [fill, prog, edge], sticky: !!opts.sticky, solo: !!opts.solo, prop, propKind: spec.prop ?? null });
  }

  /** validate false: Angriff abgebrochen (Fläche verschwindet ohne Schaden); boom: Einschlag */
  update(dt: number, validate: (z: WarnZone) => boolean, boom: (z: WarnZone) => void) {
    let n = 0;
    for (const z of this.zones) {
      z.t -= dt;
      const ok = validate(z);
      if (ok && z.t <= 0) boom(z);
      if (!ok || z.t <= 0) { this.release(z); continue; }
      const k = 1 - z.t / z.max;
      const pulse = 0.5 + 0.5 * Math.sin(z.t * 22);
      // auf hellem Sand und Stein gut lesbar: Grundfläche kräftig, Füllung steigert sich bis zum Einschlag
      (z.mats[0] as MeshBasicMaterial).opacity = 0.24 + 0.1 * pulse + 0.12 * k;
      (z.mats[1] as MeshBasicMaterial).opacity = 0.25 + 0.45 * k;
      const s = z.spec;
      const full = s.shape === 'line' ? s.width ?? 2 : s.size;
      // Füllung wächst bis zum Einschlag: Kreis und Kegel nach außen, Linie nach vorn, Ring pulsiert
      if (s.shape === 'line') z.prog.scale.set(full, 1, Math.max(0.001, s.size * k));
      else if (s.shape === 'ring') z.prog.scale.set(full, 1, s.size);
      else z.prog.scale.set(Math.max(0.001, full * k), 1, Math.max(0.001, s.size * k));
      if (z.prop) this.animateProp(z, dt);
      this.zones[n++] = z;
    }
    this.zones.length = n;
  }

  /** Fass und Granate fallen herab und landen kurz vor dem Einschlag; Runen und Ketten drehen sich; das Signal flackert */
  private animateProp(z: WarnZone, dt: number) {
    const p = z.prop!;
    const k = 1 - z.t / z.max;
    switch (z.propKind) {
      case 'fass': case 'granate': {
        const drop = Math.max(0, z.t - 0.45) * 7;
        p.position.set(0, 0.5 + drop, 0);
        p.rotation.x += dt * (z.propKind === 'fass' ? 5 : 3) * (drop > 0 ? 1 : 0);
        const blink = z.t < 0.45 ? 1 + 0.12 * Math.sin(z.t * 40) : 1;
        p.scale.setScalar(blink);
        break;
      }
      case 'rune': p.rotation.y += dt * 2.4; p.position.y = 0.06; break;
      case 'kette': p.rotation.y += dt * 1.5; p.scale.setScalar(Math.max(0.4, z.spec.size * 0.9) * (0.4 + 0.6 * k)); p.position.y = 0.1; break;
      default: p.scale.set(1, 0.4 + 0.6 * k, 1); (p.material as MeshBasicMaterial).opacity = 0.45 + 0.35 * Math.sin(z.t * 18);
    }
  }

  private release(z: WarnZone) {
    z.group.removeFromParent();
    for (const m of z.mats) m.dispose();
  }

  clear() {
    for (const z of this.zones) this.release(z);
    this.zones.length = 0;
  }
}
