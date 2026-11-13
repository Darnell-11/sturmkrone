import {
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Material,
  type MeshToonMaterial,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FloraId, ScatterLayer } from '../data/settlements';
import { markShared } from '../render/dispose';
import { toon } from '../render/toon';
import { markWind, windify } from '../render/wind';
import { inBox, type Blocker } from './islandGround';
import { hashId, seeded } from './waves';
import { envGroup, hasEnv } from './envModels';

/**
 * Instanzierter Bewuchs: Bäume, Sträucher, Gras und Felsen werden nicht mehr als einzelne Netze gebaut und pro Insel
 * verschmolzen, sondern als wenige Vorlagen (Protos) angelegt und per InstancedMesh beliebig oft gezeichnet –
 * ein Zeichenaufruf je Vorlage und Geländekachel, ein gemeinsames Material für alles.
 *  - Farben stecken in den Eckpunkten (Stamm, Laub, Blüten in einem Netz), jede Instanz bekommt zusätzlich einen Farbton
 *  - Wind: Gewicht je Eckpunkt (aWind), der Shader verschiebt im Weltraum und rechnet in den Instanzraum zurück
 *  - Kleinkram (Gras, Blumen, Farn) liegt in Kacheln und wird jenseits seiner Sichtweite gar nicht gezeichnet
 */
export interface Proto {
  id: string;
  geo: BufferGeometry;
  /** Leuchtende Teile (Kristalle) mit eigenem Material */
  glow: { geo: BufferGeometry; mat: Material } | null;
  /** Kollisionsradius bei Größe 1 (0 = keiner) */
  collide: number;
  /** Sichtweite in Metern (0 = so weit wie die Insel selbst) */
  near: number;
  cast: boolean;
  outline: boolean;
}
export interface ProtoOpts {
  collide?: number; near?: number; cast?: boolean; outline?: boolean;
  /** Gras und Kräuter: Normalen nach oben richten – dann werden die Halme beleuchtet wie die Wiese, auf der sie stehen */
  soft?: boolean;
  /** Oberfläche im Shader: tree = Borke am Stamm und durchleuchtetes Laub, plant = durchleuchtetes Grün, rock = Moos auf Oberseiten */
  surf?: 'tree' | 'plant' | 'rock';
}

/** Eine Kachel instanzierter Pflanzen mit begrenzter Sichtweite (Weltkoordinaten) */
export interface VegChunk { mesh: InstancedMesh; x: number; z: number; r: number; max: number }

let vegMaterial: MeshToonMaterial | null = null;
/** Das eine Material für allen instanzierten Bewuchs: Eckpunktfarben, Wind, Toon-Licht */
export function vegMat(): MeshToonMaterial {
  if (!vegMaterial) {
    vegMaterial = markShared(markWind(toon({ color: 0xffffff, vertexColors: true })) as MeshToonMaterial);
    patchVeg(vegMaterial);
  }
  return vegMaterial;
}

/**
 * Oberflächen im Bewuchs-Shader (Attribut aSurf: 1 Borke, 2 Laub und Gras, 3 Fels; aBk = Stammkoordinaten):
 *  - Borke: längs laufende Rillen als Bump (Normale kippt nach dem Gefälle der Höhe), Rillen dunkler
 *  - Laub: Licht scheint durch, wenn Kamera und Sonne auf gegenüberliegenden Seiten stehen (Subsurface-Näherung, gelblich)
 *  - Fels: Moos auf Oberseiten und in feuchten Flecken
 */
function patchVeg(m: MeshToonMaterial) {
  const orig = m.onBeforeCompile.bind(m);
  const key = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    orig(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aSurf;
attribute vec2 aBk;
varying float vSkSurf;
varying vec2 vSkBk;
varying vec3 vSkVW;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSkSurf = aSurf; vSkBk = aBk;
{ vec4 skVp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
skVp = instanceMatrix * skVp;
#endif
vSkVW = (modelMatrix * skVp).xyz; }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vSkSurf;
varying vec2 vSkBk;
varying vec3 vSkVW;
float skvH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float skvN(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skvH(i), skvH(i + vec2(1.0, 0.0)), f.x), mix(skvH(i + vec2(0.0, 1.0)), skvH(i + vec2(1.0, 1.0)), f.x), f.y);
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float skSf = vSkSurf;
  bool skBark = skSf > 0.5 && skSf < 1.5;
  float skBu = vSkBk.x, skBv = vSkBk.y;
  // Borke: Rillen längs des Stamms, Platten durch Rauschen unterbrochen
  float skGr = abs(fract(skBu * 14.0 + skvN(vec2(skBu * 6.0, skBv * 2.5)) * 1.3) - 0.5) * 2.0;
  float skBh = skBark ? skGr * 0.65 + skvN(vec2(skBu * 30.0, skBv * 9.0)) * 0.35 : 0.0;
  float skBFade = 1.0 - smoothstep(12.0, 48.0, length(vViewPosition));
  vec3 skSx = dFdx(-vViewPosition), skSy = dFdy(-vViewPosition);
  vec3 skR1 = cross(skSy, normal), skR2 = cross(normal, skSx);
  float skDet = dot(skSx, skR1);
  vec3 skG = sign(skDet) * (dFdx(skBh) * skR1 + dFdy(skBh) * skR2) * 0.07 * skBFade;
  normal = normalize(abs(skDet) * normal - skG);
  if (skBark) diffuseColor.rgb *= mix(1.0, 0.6 + 0.55 * skBh, skBFade);
  if (skSf > 2.5) {
    float skUp = inverseTransformDirection(normal, viewMatrix).y;
    float skMn = skvN(vSkVW.xz * 2.3 + vSkVW.y * 1.1) * 0.6 + skvN(vSkVW.xz * 7.0) * 0.4;
    float skMoss = smoothstep(0.42, 0.78, skUp * 0.75 + skMn * 0.55 - 0.1);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.36, 0.13) * (0.75 + skMn * 0.6), skMoss * 0.85);
    // Spritzzone an der Wasserlinie (Meeresspiegel y = 0): der Stein ist nass, dunkler und satter, Moos fällt dort weg
    float skWl = 1.0 - smoothstep(0.35, 2.4, vSkVW.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.6, 0.64, 0.7), skWl);
  }
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// Nasser Stein glänzt: Himmelslicht im flachen Blickwinkel (Fresnel), nur an Felsen in Wassernähe
if (vSkSurf > 2.5) {
  float skWl2 = 1.0 - smoothstep(0.35, 2.4, vSkVW.y);
  float skFr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += vec3(0.46, 0.58, 0.68) * skFr * skWl2 * 0.4;
}
#if NUM_DIR_LIGHTS > 0
if (vSkSurf > 1.5 && vSkSurf < 2.5) {
  // Licht scheint durchs Blatt: Kamera schaut gegen die Sonne
  vec3 skV = normalize(vViewPosition);
  vec3 skL = directionalLights[0].direction;
  float skBack = clamp(-dot(skV, skL), 0.0, 1.0);
  float skSun = clamp(dot(directionalLights[0].color, vec3(0.333)) * 1.3, 0.0, 1.0);
  totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 1.0, 0.45) * pow(skBack, 1.4) * skSun * 1.1;
}
#endif`);
  };
  m.customProgramCacheKey = () => key() + 'veg3';
}

const protos = new Map<string, Proto>();

/** Vorlage aus einem fertig gebauten Objekt: alle Netze zu einem verschmelzen, Materialfarbe in die Eckpunkte schreiben */
function protoFrom(id: string, obj: Object3D, o: ProtoOpts): Proto {
  obj.updateMatrixWorld(true);
  const geos: BufferGeometry[] = [], glowGeos: BufferGeometry[] = [];
  let glowMat: Material | null = null;
  obj.traverse((c) => {
    const m = c as Mesh;
    if (!m.isMesh) return;
    const mat = m.material as MeshToonMaterial;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const isCyl = m.geometry.type === 'CylinderGeometry' || !!m.userData.bark;
    // Blender-Modelle tragen Ambient-Occlusion je Eckpunkt (Farbattribut): dunkler Kronenkern, helle Blattspitzen
    const ao = g.attributes.color as BufferAttribute | undefined;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'aWind' && !(k === 'uv' && isCyl)) g.deleteAttribute(k);
    g.applyMatrix4(m.matrixWorld);
    const n = g.attributes.position.count;
    if (!(mat as { isMeshToonMaterial?: boolean }).isMeshToonMaterial) {
      // selbstleuchtend (Kristall): eigenes Netz, keine Farben nötig
      g.deleteAttribute('aWind');
      g.deleteAttribute('uv');
      glowGeos.push(g);
      glowMat = mat;
    } else {
      if ((mat as unknown as { flatShading?: boolean }).flatShading) g.computeVertexNormals();
      if (o.soft) {
        const nor = g.attributes.normal;
        for (let i = 0; i < n; i++) {
          const x = nor.getX(i) * 0.3, y = nor.getY(i) * 0.3 + 1, z = nor.getZ(i) * 0.3, l = Math.hypot(x, y, z);
          nor.setXYZ(i, x / l, y / l, z / l);
        }
      }
      if (!g.attributes.aWind) g.setAttribute('aWind', new BufferAttribute(new Float32Array(n), 1));
      // Oberfläche je Eckpunkt: Stamm-Zylinder bekommen Borke und ihre Koordinaten, alles Grüne Durchleuchtung, Fels Moos
      const surf = (m.userData.surf as number | undefined) ?? (o.surf === 'tree' ? (isCyl ? 1 : 2) : o.surf === 'plant' ? 2 : o.surf === 'rock' ? 3 : 0);
      g.setAttribute('aSurf', new BufferAttribute(new Float32Array(n).fill(surf), 1));
      const bk = new Float32Array(n * 2);
      const uv = g.attributes.uv;
      if (uv && surf === 1) for (let i = 0; i < n; i++) { bk[i * 2] = uv.getX(i); bk[i * 2 + 1] = uv.getY(i); }
      g.deleteAttribute('uv');
      g.setAttribute('aBk', new BufferAttribute(bk, 2));
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const k = ao ? ao.getX(i) : 1;
        col[i * 3] = mat.color.r * k; col[i * 3 + 1] = mat.color.g * k; col[i * 3 + 2] = mat.color.b * k;
      }
      g.setAttribute('color', new BufferAttribute(col, 3));
      geos.push(g);
    }
    m.geometry.dispose();
  });
  const geo = markShared(mergeGeometries(geos, false) ?? new BufferGeometry());
  for (const g of geos) g.dispose();
  const glowGeo = glowGeos.length ? markShared(mergeGeometries(glowGeos, false)!) : null;
  for (const g of glowGeos) g.dispose();
  return { id, geo, glow: glowGeo && glowMat ? { geo: glowGeo, mat: glowMat } : null, collide: o.collide ?? 0, near: o.near ?? 0, cast: o.cast ?? true, outline: o.outline ?? true };
}

/** Vorlage holen oder einmalig bauen (make bekommt einen festen Zufall aus dem Namen – jede Variante sieht immer gleich aus) */
export function cachedProto(id: string, make: (rnd: () => number) => Object3D, o: ProtoOpts = {}): Proto {
  let p = protos.get(id);
  if (!p) { p = protoFrom(id, make(seeded(hashId(id))), o); protos.set(id, p); }
  return p;
}

const _q = new Quaternion(), _e = new Euler(), _p = new Vector3(), _s = new Vector3(), _m = new Matrix4();
// Kachelgröße: Kleinkram fein (wird nach Entfernung ausgeblendet), Bäume und Felsen grob (nur Sichtkegel-Test)
const CELL_NEAR = 80, CELL_FAR = 240;

interface Bin { proto: Proto; m: number[]; c: number[] }

/** Sammelt Instanzen einer Insel (Inselkoordinaten) und baut daraus die InstancedMeshes */
export class Scatter {
  private bins = new Map<string, Bin>();
  count = 0;

  /** tilt: Neigung um x und z (Radiant); tint: Helligkeit bzw. Farbe der Instanz */
  add(proto: Proto, x: number, y: number, z: number, yaw = 0, sx = 1, sy = sx, tiltX = 0, tiltZ = 0, r = 1, g = r, b = r) {
    const cell = proto.near > 0 ? CELL_NEAR : CELL_FAR;
    const key = `${proto.id}|${Math.floor(x / cell)}|${Math.floor(z / cell)}`;
    let bin = this.bins.get(key);
    if (!bin) { bin = { proto, m: [], c: [] }; this.bins.set(key, bin); }
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(tiltX, yaw, tiltZ, 'YXZ')), _s.set(sx, sy, sx));
    for (let i = 0; i < 16; i++) bin.m.push(_m.elements[i]);
    bin.c.push(r, g, b);
    this.count++;
  }

  /** Netze erzeugen und an die Inselgruppe hängen. Liefert die Kacheln mit begrenzter Sichtweite. */
  build(group: Group): VegChunk[] {
    const chunks: VegChunk[] = [];
    const mat = vegMat();
    for (const bin of this.bins.values()) {
      const n = bin.c.length / 3;
      const mesh = new InstancedMesh(bin.proto.geo, mat, n);
      (mesh.instanceMatrix.array as Float32Array).set(bin.m);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(bin.c), 3);
      mesh.castShadow = bin.proto.cast;
      mesh.receiveShadow = true;
      mesh.userData.noOutline = !bin.proto.outline;
      mesh.userData.instanced = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      if (bin.proto.glow) {
        const gm = new InstancedMesh(bin.proto.glow.geo, bin.proto.glow.mat, n);
        gm.instanceMatrix = mesh.instanceMatrix;
        gm.userData.noOutline = true;
        gm.userData.instanced = true;
        gm.boundingSphere = mesh.boundingSphere!.clone();
        group.add(gm);
      }
      if (bin.proto.near > 0) {
        const s = mesh.boundingSphere!;
        chunks.push({ mesh, x: group.position.x + s.center.x, z: group.position.z + s.center.z, r: s.radius, max: bin.proto.near });
      }
    }
    this.bins.clear();
    return chunks;
  }
}

// ---------- Vorlagen der neuen Biome ----------

export type Biome = 'festland' | 'tropisch' | 'klippe';
interface Pal { trunk: string; leaf: string[]; bush: string[]; grass: string[]; reed: string; rock: string[]; flowers: string[] }
const PAL: Record<Biome, Pal> = {
  festland: { trunk: '#5E4630', leaf: ['#3F7A38', '#4E8C3C', '#6A9A40', '#356A34'], bush: ['#3E7238', '#4F8440', '#5E8E3A'], grass: ['#5C9448', '#6CA24E', '#4E843E'], reed: '#B8A85A', rock: ['#8A857A', '#9A948A', '#7A766C'], flowers: ['#E8D44A', '#F2F0E6', '#C8443C', '#7B8FE0', '#E28AB0'] },
  tropisch: { trunk: '#7A5A36', leaf: ['#3E8A3A', '#4E9A3E', '#2E7A40', '#66A83E'], bush: ['#2F7A44', '#3E8A3E', '#56984A'], grass: ['#5E9A4A', '#72AA4E', '#4A8A40'], reed: '#C2B26A', rock: ['#9A8E7C', '#AAA08C', '#857A6A'], flowers: ['#E0483C', '#F0A030', '#F4F0E0', '#C060C8', '#F06A90'] },
  klippe: { trunk: '#3E342C', leaf: ['#2E4E3E', '#38584A', '#274438', '#34503C'], bush: ['#3E5446', '#4A5E4A', '#55664E'], grass: ['#6E7E5A', '#7E8A62', '#5E6E52'], reed: '#A8A078', rock: ['#3A3C42', '#44464E', '#30323A'], flowers: ['#C2CCD2', '#9AA8C8', '#D8D4C4'] },
};

const flat = (c: string) => toon({ color: c, flatShading: true });
const smooth = (c: string) => toon(c);
const pick = <T>(a: T[], rnd: () => number) => a[Math.floor(rnd() * a.length)];

/** Stamm als gebogene Kette von Zylindern: lehnt sich um `lean` Meter in +x. Liefert die Spitze. */
function bentTrunk(g: Group, h: number, lean: number, r0: number, r1: number, mat: Material, n = 6): { x: number; y: number } {
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const x0 = lean * t0 * t0, x1 = lean * t1 * t1, y0 = h * t0, y1 = h * t1;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const seg = new Mesh(new CylinderGeometry(r0 + (r1 - r0) * t1, r0 + (r1 - r0) * t0, len * 1.05, 6), mat);
    seg.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    seg.rotation.z = -Math.atan2(x1 - x0, y1 - y0);
    g.add(seg);
  }
  return { x: lean, y: h };
}

/** Blatt/Wedel: flacher Kegel, der vom Ursprung aus nach außen zeigt (pitch = Winkel zur Senkrechten) */
function blade(len: number, wid: number, mat: Material, pitch: number, yaw: number, thick = 0.22): Mesh {
  const geo = new ConeGeometry(wid, len, 4);
  geo.translate(0, len / 2, 0);
  const m = new Mesh(geo, mat);
  m.scale.z = thick;
  m.rotation.set(pitch, yaw, 0, 'YXZ');
  return m;
}

const MAKERS: Record<FloraId, (pal: Pal, rnd: () => number, v: number) => Group> = {
  treibholz: (_pal, rnd) => {
    const g = new Group();
    const log = new Mesh(new CylinderGeometry(0.14, 0.18, 2.2 + rnd(), 6), toon('#9C8A6E'));
    log.rotation.z = Math.PI / 2;
    log.position.y = 0.15;
    g.add(log);
    return g;
  },
  klippe: (pal, rnd, v) => MAKERS.fels(pal, rnd, v),
  palme: (pal, rnd) => {
    const g = new Group();
    const h = 6.2 + rnd() * 2.6;
    const top = bentTrunk(g, h, 0.6 + rnd() * 1.9, 0.36, 0.19, smooth(pal.trunk));
    const crown = new Group();
    crown.position.set(top.x, top.y, 0);
    const a0 = rnd() * 6;
    for (let i = 0; i < 6; i++) crown.add(blade(3.9 + rnd() * 0.7, 0.62, flat(pal.leaf[i % 2]), 1.05 + rnd() * 0.25, a0 + (i / 6) * Math.PI * 2));
    for (let i = 0; i < 6; i++) crown.add(blade(3.3 + rnd() * 0.6, 0.56, flat(pal.leaf[2 + (i % 2)]), 1.75 + rnd() * 0.3, a0 + 0.5 + (i / 6) * Math.PI * 2));
    for (let i = 0; i < 3; i++) crown.add(blade(2.2, 0.4, flat(pal.leaf[3]), 0.35 + rnd() * 0.3, a0 + i * 2.1));
    for (let i = 0; i < 3; i++) {
      const nut = new Mesh(new SphereGeometry(0.2, 6, 5), smooth('#5A3E22'));
      nut.position.set(Math.cos(i * 2.1) * 0.3, -0.25, Math.sin(i * 2.1) * 0.3);
      crown.add(nut);
    }
    g.add(crown);
    windify(g, 0.55, h + 1.5);
    return g;
  },
  laubbaum: (pal, rnd) => {
    const g = new Group();
    const h = 3.4 + rnd() * 1.6;
    const top = bentTrunk(g, h, (rnd() - 0.5) * 0.7, 0.46, 0.26, smooth(pal.trunk), 4);
    // Äste tragen die Krone
    for (let i = 0; i < 3; i++) {
      const b = new Mesh(new CylinderGeometry(0.1, 0.19, 2.4, 5), smooth(pal.trunk));
      b.position.set(top.x, h - 0.5, 0);
      b.rotation.set(0, i * 2.1 + rnd(), 0.75 + rnd() * 0.3, 'YXZ');
      b.translateY(1.1);
      g.add(b);
    }
    const n = 6 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const s = i === 0 ? 2.3 + rnd() * 0.5 : 1.4 + rnd() * 0.9;
      const a = (i / (n - 1)) * Math.PI * 2 + rnd();
      const d = i === 0 ? 0 : 1.5 + rnd() * 0.9;
      const blob = new Mesh(new IcosahedronGeometry(s, i === 0 ? 1 : 0), flat(pal.leaf[i === 0 ? 1 : Math.floor(rnd() * pal.leaf.length)]));
      blob.position.set(top.x + Math.cos(a) * d, h + (i === 0 ? 2.1 : 0.7 + rnd() * 1.5), Math.sin(a) * d);
      blob.scale.y = 0.78;
      blob.rotation.set(rnd(), rnd() * 3, rnd());
      g.add(blob);
    }
    windify(g, 0.34, h + 4);
    return g;
  },
  birke: (_pal, rnd) => {
    const g = new Group();
    const h = 5.6 + rnd() * 1.8;
    const top = bentTrunk(g, h, (rnd() - 0.5) * 0.9, 0.2, 0.1, smooth('#E4E0D4'), 5);
    for (let i = 0; i < 4; i++) {
      const ring = new Mesh(new CylinderGeometry(0.19, 0.2, 0.12, 6), smooth('#3A3632'));
      ring.position.set(top.x * ((0.2 + i * 0.16) ** 2), h * (0.2 + i * 0.16), 0);
      g.add(ring);
    }
    for (let i = 0; i < 5; i++) {
      const s = 0.9 + rnd() * 0.5;
      const blob = new Mesh(new IcosahedronGeometry(s, 0), flat(i % 2 ? '#7CAE4A' : '#8EBC52'));
      blob.position.set(top.x + (rnd() - 0.5) * 1.6, h - 0.6 + rnd() * 1.8 - (i > 2 ? 1.2 : 0), (rnd() - 0.5) * 1.6);
      blob.scale.y = 1.35;
      blob.rotation.set(rnd(), rnd() * 3, rnd());
      g.add(blob);
    }
    windify(g, 0.5, h + 2);
    return g;
  },
  windkiefer: (pal, rnd) => {
    const g = new Group();
    const h = 4.2 + rnd() * 1.8;
    const top = bentTrunk(g, h, 1.4 + rnd() * 1.2, 0.34, 0.14, smooth(pal.trunk));
    // flache Nadelschirme, vom Wind nach Lee gedrückt
    for (let i = 0; i < 4; i++) {
      const s = 1.7 - i * 0.28 + rnd() * 0.3;
      const pad = new Mesh(new IcosahedronGeometry(s, 0), flat(pal.leaf[i % pal.leaf.length]));
      pad.scale.set(1.5, 0.3, 1);
      pad.position.set(top.x * (0.62 + i * 0.13) + 0.5 + i * 0.5, h * (0.66 + i * 0.12), (rnd() - 0.5) * 0.9);
      pad.rotation.y = rnd() * 0.6;
      g.add(pad);
    }
    const dead = new Mesh(new CylinderGeometry(0.03, 0.09, 1.6, 4), smooth(pal.trunk));
    dead.position.set(top.x * 0.3, h * 0.55, 0);
    dead.rotation.z = 1.1;
    dead.translateY(0.7);
    g.add(dead);
    windify(g, 0.24, h + 1);
    return g;
  },
  busch: (pal, rnd) => {
    const g = new Group();
    for (let k = 0; k < 3 + Math.floor(rnd() * 3); k++) {
      const s = 0.5 + rnd() * 0.55;
      const m = new Mesh(new IcosahedronGeometry(s, 0), flat(pick(pal.bush, rnd)));
      m.position.set((rnd() - 0.5) * 1.3, s * 0.6, (rnd() - 0.5) * 1.3);
      m.scale.y = 0.75;
      m.rotation.set(rnd(), rnd() * 3, rnd());
      g.add(m);
    }
    windify(g, 0.08, 1.2);
    return g;
  },
  farn: (pal, rnd) => {
    const g = new Group();
    const n = 7 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) g.add(blade(1 + rnd() * 0.5, 0.2, flat(pick(pal.bush, rnd)), 0.85 + rnd() * 0.45, (i / n) * Math.PI * 2 + rnd() * 0.4, 0.3));
    windify(g, 0.13, 0.8);
    return g;
  },
  gras: (pal, rnd) => {
    const g = new Group();
    for (let k = 0; k < 6; k++) {
      const h = 0.38 + rnd() * 0.45;
      const b = new Mesh(new ConeGeometry(0.07, h, 3, 1, true), flat(pick(pal.grass, rnd)));
      b.position.set((rnd() - 0.5) * 0.5, h / 2, (rnd() - 0.5) * 0.5);
      b.rotation.set((rnd() - 0.5) * 0.6, rnd() * 3, (rnd() - 0.5) * 0.6);
      g.add(b);
    }
    windify(g, 0.17, 0.8);
    return g;
  },
  halme: (pal, rnd) => {
    const g = new Group();
    for (let k = 0; k < 9; k++) {
      const h = 0.85 + rnd() * 0.5;
      const x = (rnd() - 0.5) * 0.6, z = (rnd() - 0.5) * 0.6;
      const tx = (rnd() - 0.5) * 0.3, tz = (rnd() - 0.5) * 0.3;
      const b = new Mesh(new ConeGeometry(0.035, h, 3, 1, true), flat(k % 3 ? pal.reed : pal.grass[0]));
      b.position.set(x, h / 2, z);
      b.rotation.set(tx, 0, tz);
      g.add(b);
      if (k % 2 === 0) {
        const ear = new Mesh(new OctahedronGeometry(0.04, 0), flat(pal.reed));
        ear.scale.y = 2.6;
        ear.position.set(x - Math.sin(tz) * h * 0.5, h * 0.97, z + Math.sin(tx) * h * 0.5);
        g.add(ear);
      }
    }
    windify(g, 0.3, 1.3);
    return g;
  },
  blume: (pal, rnd, v) => {
    const g = new Group();
    for (let k = 0; k < 4 + Math.floor(rnd() * 3); k++) {
      const h = 0.28 + rnd() * 0.2;
      const x = (rnd() - 0.5) * 0.6, z = (rnd() - 0.5) * 0.6;
      // je Büschel eine Hauptfarbe, dazwischen einzelne andere Blüten
      const col = pal.flowers[(v + (rnd() < 0.25 ? 1 + Math.floor(rnd() * 3) : 0)) % pal.flowers.length];
      const stem = new Mesh(new ConeGeometry(0.02, h, 3, 1, true), flat(pal.grass[2]));
      stem.position.set(x, h / 2, z);
      const head = new Mesh(new OctahedronGeometry(0.085, 0), flat(col));
      head.position.set(x, h + 0.03, z);
      head.scale.y = 0.7;
      g.add(stem, head);
    }
    windify(g, 0.09, 0.5);
    return g;
  },
  fels: (pal, rnd, v) => {
    const g = new Group();
    const mk = (s: number) => {
      const geo = new DodecahedronGeometry(s, 0);
      const pos = geo.attributes.position;
      // Ecken verschieben (gleiche Lage = gleiche Verschiebung, sonst reißt das Netz auf)
      for (let i = 0; i < pos.count; i++) {
        const k = 1 + (Math.sin(pos.getX(i) * 12.9 + pos.getY(i) * 78.2 + pos.getZ(i) * 37.7 + v * 5.1) * 0.5) * 0.36;
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
      }
      return new Mesh(geo, flat(pal.rock[v % pal.rock.length]));
    };
    const main = mk(1);
    main.scale.set(1.15 + rnd() * 0.3, 0.7 + rnd() * 0.35, 1);
    main.position.y = 0.3;
    main.rotation.y = rnd() * 3;
    const side = mk(0.45);
    side.position.set(0.95 + rnd() * 0.3, 0.12, (rnd() - 0.5) * 0.8);
    side.rotation.set(rnd(), rnd() * 3, rnd());
    g.add(main, side);
    return g;
  },
  basalt: (pal, rnd) => {
    const g = new Group();
    const rr = 0.62;
    const HEX: [number, number][] = [[0, 0], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [2, -1], [1, 1], [-2, 1], [-1, -1], [2, 0]];
    const n = 7 + Math.floor(rnd() * 5);
    const peak = 4.4 + rnd() * 2.6;
    for (let i = 0; i < n; i++) {
      const [q, r] = HEX[i];
      const x = Math.sqrt(3) * rr * (q + r / 2), z = 1.5 * rr * r;
      const h = Math.max(0.5, (peak - Math.hypot(x, z) * 1.5) * (0.55 + rnd() * 0.6));
      const col = new Mesh(new CylinderGeometry(rr, rr, h + 1.6, 6), flat(pal.rock[Math.floor(rnd() * pal.rock.length)]));
      col.position.set(x, (h - 1.6) / 2, z);
      // verwitterte, hellere Deckfläche
      const cap = new Mesh(new CylinderGeometry(rr * 0.9, rr * 0.99, 0.08, 6), flat('#5A5C62'));
      cap.position.set(x, h + 0.03, z);
      g.add(col, cap);
    }
    return g;
  },
  basaltblock: (pal, rnd) => {
    const g = new Group();
    const rr = 0.55;
    for (let i = 0; i < 1 + Math.floor(rnd() * 3); i++) {
      const h = 0.3 + rnd() * 0.7;
      const x = i === 0 ? 0 : Math.sqrt(3) * rr * (i === 1 ? 1 : 0.5), z = i === 2 ? 1.5 * rr : 0;
      const col = new Mesh(new CylinderGeometry(rr, rr, h + 0.8, 6), flat(pal.rock[Math.floor(rnd() * pal.rock.length)]));
      col.position.set(x, (h - 0.8) / 2, z);
      const cap = new Mesh(new CylinderGeometry(rr * 0.9, rr * 0.99, 0.06, 6), flat('#5A5C62'));
      cap.position.set(x, h + 0.02, z);
      g.add(col, cap);
    }
    return g;
  },
};

interface FloraSpec extends ProtoOpts { variants: number; sink: number; tint: number; tilt: number; tree?: boolean; bush?: boolean; lee?: boolean }
const FLORA: Record<FloraId, FloraSpec> = {
  palme: { surf: 'tree', variants: 4, collide: 0.42, sink: 0.15, tint: 0.14, tilt: 0.1, tree: true },
  laubbaum: { surf: 'tree', variants: 3, collide: 0.5, sink: 0.2, tint: 0.16, tilt: 0.05, tree: true },
  birke: { surf: 'tree', variants: 2, collide: 0.3, sink: 0.15, tint: 0.12, tilt: 0.06, tree: true },
  windkiefer: { surf: 'tree', variants: 3, collide: 0.4, sink: 0.2, tint: 0.12, tilt: 0.05, tree: true, lee: true },
  busch: { surf: 'plant', variants: 2, near: 230, sink: 0.05, tint: 0.18, tilt: 0, bush: true },
  farn: { surf: 'plant', variants: 2, near: 150, cast: false, outline: false, soft: true, sink: 0.02, tint: 0.2, tilt: 0 },
  gras: { surf: 'plant', variants: 2, near: 105, cast: false, outline: false, soft: true, sink: 0.02, tint: 0.22, tilt: 0 },
  halme: { surf: 'plant', variants: 2, near: 140, cast: false, outline: false, soft: true, sink: 0.02, tint: 0.16, tilt: 0 },
  blume: { surf: 'plant', variants: 3, near: 85, cast: false, outline: false, soft: true, sink: 0, tint: 0.08, tilt: 0 },
  fels: { surf: 'rock', variants: 3, collide: 0.9, sink: 0.12, tint: 0.14, tilt: 0.12 },
  basalt: { variants: 4, collide: 1.75, sink: 0.1, tint: 0.12, tilt: 0.03 },
  basaltblock: { variants: 3, collide: 0.7, sink: 0.05, tint: 0.12, tilt: 0 },
  treibholz: { surf: 'tree', variants: 3, cast: false, near: 190, sink: 0.02, tint: 0.1, tilt: 0 },
  klippe: { surf: 'rock', variants: 2, collide: 3.2, sink: 0.4, tint: 0.1, tilt: 0.02 },
};

/** Modellname und Windausschlag der Blender-Fassung einer Flora-Art (die übrigen bleiben Eigenbau) */
const ENV_FLORA: Partial<Record<FloraId, { name: string; wind: number }>> = {
  palme: { name: 'palme', wind: 0.55 }, laubbaum: { name: 'laubbaum', wind: 0.34 }, busch: { name: 'busch', wind: 0.08 },
  farn: { name: 'farn', wind: 0.13 }, fels: { name: 'fels', wind: 0 }, treibholz: { name: 'treibholz', wind: 0 }, klippe: { name: 'klippe', wind: 0 },
};

/** Farbe je Rolle des Blender-Modells aus der Palette des Biomes */
function envColors(pal: Pal, flora: FloraId, k: number) {
  const low = flora === 'busch' || flora === 'farn';
  const leaf = low ? pal.bush : pal.leaf;
  return (role: string): string => {
    switch (role) {
      case 'trunk': return pal.trunk;
      case 'leaf': return leaf[0];
      case 'leaf2': return leaf[1 % leaf.length];
      case 'leaf3': return leaf[2 % leaf.length];
      case 'nut': return '#5A3E22';
      case 'drift': return '#9C8A6E';
      default: return pal.rock[k % pal.rock.length];
    }
  };
}

/** Vorlage aus einem Blender-Modell (oder null, wenn die Datei fehlt) – mit eigener Kennung, damit jede Quelle ihre Variante hat */
export function envProto(id: string, name: string, color: (role: string) => string, o: ProtoOpts & { wind?: number } = {}): Proto | null {
  if (!hasEnv(name)) return null;
  return cachedProto(id, () => envGroup(name, color, o.wind ?? 0)!, o);
}

/** Zufallsvariante einer Flora-Art; Palme, Laubbaum, Busch, Farn, Fels, Treibholz und Klippe kommen aus Blender */
export function floraProto(biome: Biome, flora: FloraId, v: number): Proto {
  const spec = FLORA[flora];
  const k = v % spec.variants;
  const env = ENV_FLORA[flora];
  const id = `${biome}:${flora}:${k}`;
  const fromEnv = env && hasEnv(`${env.name}_${k + 1}`) ? envProto(id, `${env.name}_${k + 1}`, envColors(PAL[biome], flora, k), { ...spec, wind: env.wind }) : null;
  return fromEnv ?? cachedProto(id, (rnd) => MAKERS[flora](PAL[biome], rnd, k), spec);
}

// ---------- Belegung und Verteilung ----------

/** Belegte Flächen in einem Raster: schnelle Antwort auf „ist hier frei?“, auch bei tausenden Pflanzen */
export class Occupancy {
  private grid = new Map<number, Blocker[]>();
  private readonly cell = 8;
  private key(i: number, j: number) { return (i + 4096) * 8192 + (j + 4096); }

  add(b: Blocker) {
    const c = this.cell;
    for (let i = Math.floor((b.x - b.r) / c); i <= Math.floor((b.x + b.r) / c); i++) {
      for (let j = Math.floor((b.z - b.r) / c); j <= Math.floor((b.z + b.r) / c); j++) {
        const k = this.key(i, j);
        const l = this.grid.get(k);
        if (l) l.push(b); else this.grid.set(k, [b]);
      }
    }
  }

  /** Liegt ein Kreis (x, z, Radius rr) auf etwas Belegtem? */
  hit(x: number, z: number, rr: number): boolean {
    const c = this.cell;
    for (let i = Math.floor((x - rr) / c); i <= Math.floor((x + rr) / c); i++) {
      for (let j = Math.floor((z - rr) / c); j <= Math.floor((z + rr) / c); j++) {
        const l = this.grid.get(this.key(i, j));
        if (!l) continue;
        for (const b of l) {
          if (b.hw !== undefined ? inBox(b, x, z, rr) : (x - b.x) ** 2 + (z - b.z) ** 2 < (b.r + rr) ** 2) return true;
        }
      }
    }
    return false;
  }
}

/** Weiches Rauschen 0 … 1 (für Haine und Lichtungen) */
export function noise(x: number, z: number, seed: number): number {
  const h = (i: number, j: number) => {
    let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1274126177);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x), j = Math.floor(z);
  let fx = x - i, fz = z - j;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  return (h(i, j) * (1 - fx) + h(i + 1, j) * fx) * (1 - fz) + (h(i, j + 1) * (1 - fx) + h(i + 1, j + 1) * fx) * fz;
}

export interface Spot { x: number; y: number; z: number }

export interface ScatterSiteOpts {
  layers: ScatterLayer[];
  biome: Biome;
  r: number;
  /** Mittelpunkt der Insel in Weltkoordinaten (Belegung und Kollider sind Weltkoordinaten) */
  wx: number;
  wz: number;
  /** Küstenradius in einer Richtung (Winkel wie atan2(z, x)) */
  edge: (a: number) => number;
  /** Bodenhöhe in Inselkoordinaten */
  hAt: (x: number, z: number) => number;
  veg: Scatter;
  occ: Occupancy;
  /** Lichtungen (Inselkoordinaten): hier wachsen keine Bäume, Büsche und Felsen */
  clear: { x: number; z: number; r: number }[];
  blockers: Blocker[];
  rnd: () => number;
  density: number;
  seed: number;
}

/** Verteilt den Bewuchs eines Landes nach seinen Schichten (data/settlements.ts) */
export function scatterSite(o: ScatterSiteOpts): { trees: Spot[]; bushes: Spot[] } {
  const { rnd, hAt, veg, occ } = o;
  const trees: Spot[] = [], bushes: Spot[] = [];
  const dens = Math.max(0.4, Math.min(1.6, o.density));
  // vorherrschende Windrichtung der Insel: Windkiefern lehnen alle nach Lee
  const lee = rnd() * Math.PI * 2;
  o.layers.forEach((L, li) => {
    const spec = FLORA[L.flora];
    const solid = (spec.collide ?? 0) > 0 || spec.bush;
    const area = Math.PI * o.r * o.r * (Math.min(1, L.zone[1]) ** 2 - L.zone[0] ** 2);
    // Kleinkram folgt der Detailstufe ganz, Bäume und Felsen nur halb (die Insel soll überall gleich aussehen)
    const want = Math.round((area / 10000) * L.perHa * (solid ? 0.5 + dens * 0.5 : dens));
    let placed = 0;
    for (let t = 0; t < want * 8 && placed < want; t++) {
      const a = rnd() * Math.PI * 2;
      const f = Math.sqrt(L.zone[0] ** 2 + rnd() * (L.zone[1] ** 2 - L.zone[0] ** 2));
      const d = o.edge(a) * f;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (L.grove) {
        const n = noise(x / L.grove[0] + 31.7, z / L.grove[0] - 12.3, o.seed + li * 7);
        if (n < L.grove[1] || rnd() > 0.25 + (n - L.grove[1]) / (1 - L.grove[1]) * 1.6) continue;
      }
      if (solid && o.clear.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r)) continue;
      const s = L.size[0] + rnd() * (L.size[1] - L.size[0]);
      if (occ.hit(o.wx + x, o.wz + z, Math.max(L.space, (spec.collide ?? 0) * s))) continue;
      const y = hAt(x, z);
      if (L.slope !== undefined) {
        const steep = Math.hypot(hAt(x + 1, z) - hAt(x - 1, z), hAt(x, z + 1) - hAt(x, z - 1)) / 2 > 0.13;
        if (steep !== L.slope) continue;
      }
      // Pflanzen wachsen nicht im Wasser (Felsen und Basalt schon)
      if (y < 1 && (spec.tree || spec.bush || !solid)) continue;
      const v = Math.floor(rnd() * spec.variants);
      const tint = 1 + (rnd() - 0.5) * 2 * spec.tint;
      const warm = (rnd() - 0.5) * spec.tint;
      const yaw = spec.lee ? lee + (rnd() - 0.5) * 0.5 : rnd() * Math.PI * 2;
      veg.add(floraProto(o.biome, L.flora, v), x, y - spec.sink * s, z, yaw, s, s * (0.88 + rnd() * 0.26),
        (rnd() - 0.5) * 2 * spec.tilt, (rnd() - 0.5) * 2 * spec.tilt, tint + warm, tint, tint - warm);
      if (solid) {
        const b: Blocker = { x: o.wx + x, z: o.wz + z, r: Math.max(0.4, (spec.collide ?? 0.5) * s) };
        occ.add(b);
        if ((spec.collide ?? 0) > 0) o.blockers.push(b);
      }
      if (spec.tree) trees.push({ x, y, z });
      else if (spec.bush) bushes.push({ x, y, z });
      placed++;
    }
  });
  return { trees, bushes };
}
