// Darstellung des lebendigen Meeres (Phase 4.3C): Schaumlinien der Windstraßen, Horizont-Signale der Welt-Ereignisse (goldene Leuchtraketen, schwarze
// Rauchfahnen, kreisende Möwen über Treibgut, Gewitterwirbel über den Weltbossen) und die Wolken- und Nebelwände der wandernden Wetterzellen.
//
// Alles ist beim Start angelegt und wird nur ein- und ausgeblendet (Objekt-Pools, keine Netze und Materialien zur Laufzeit): so übersetzt der Ladebildschirm
// alle Shader vor (`prewarm`), und das Auftauchen eines Ereignisses kostet kein Bild. Je Bild entstehen keine neuen Objekte (Arbeitsvektoren im Modul).
// Die Daten kommen aus dem reinen `WorldEventState` (world/worldEventDirector.ts); diese Klasse liest sie nur.
import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, CustomBlending, CylinderGeometry, DoubleSide, DynamicDrawUsage, Group, InstancedMesh,
  Matrix4, Mesh, MeshBasicMaterial, OneFactor, OneMinusSrcAlphaFactor, Points, PointsMaterial, Quaternion, SrcAlphaFactor, Vector3, ZeroFactor,
  BoxGeometry, CapsuleGeometry, SphereGeometry, type Camera, type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FACTIONS, type FactionId } from '../data/factions';
import { GERSTNER_GLSL } from './ocean';
import type { CurrentLane } from './oceanCurrents';
import type { WorldEvent, WorldEventState } from './worldEventDirector';
import type { SmokeSystem } from './smoke';
import { markShared } from '../render/dispose';
import { toon } from '../render/toon';
import { DIRECTOR } from '../data/seaEvents';
import { clamp01, smoothstep } from '../core/mathUtil';

/** Uniforms des Ozeans, die die Schaumlinien mitbenutzen (Zeit, Wellenhöhe, Kamera): so liegen sie auf denselben Wellen */
export interface OceanUniformRefs { uTime: { value: number }; uWaveScale: { value: number }; uCamPos: { value: Vector3 } }

/** Was die Darstellung je Bild von der Welt braucht */
export interface ViewHost {
  heightAt(x: number, z: number): number;
  /** Tageslicht 0 (Nacht) … 1 */
  light: number;
  /** Blitz-Helligkeit 0 … 1 (Wolkenwände leuchten auf) */
  flash: number;
  /** Dunst: Farbe des Horizonts und Sichtweite (m); ferne Wände und Wirbel verblassen darin wie Inseln am Horizont */
  fogColor: Color;
  fogFar: number;
}

// Arbeitsobjekte (nichts je Bild neu anlegen)
const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _c = new Color();
const UP = new Vector3(0, 1, 0);

/** Normal mischen, ohne den Alpha-Kanal zu verändern (er markiert Wasser für Konturen und Schattierung) */
const MIX_KEEP_ALPHA = { blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor } as const;

/** Wie frontal eine Fläche zur Kamera steht (0 = Silhouette, 1 = frontal): für weiche Seitenränder von Wolkenwänden und Wirbeln */
const FACE_GLSL = /* glsl */ `
  float skFace() {
    vec3 wn = normalize(mat3(modelMatrix) * normal);
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
    return abs(dot(wn, normalize(cameraPosition - wp)));
  }`;
const STORM_COL = new Color('#2C3038');
const FOG_COL = new Color('#E4E8EC');
const VORTEX_COL = new Color('#2A2F38');

const MAX_FLARE_PTS = 192;
const FLARE_PERIOD = 7;
const GULLS_PER = 24;
const MAX_FIELDS = 3;
const PLANKS_PER = 12;
const BARRELS_PER = 5;
const CRATES_PER = 8;
const MAX_VORTEX = 3;
const MAX_WALLS = 8;
/** Flöße der Schiffbrüchigen (4.5C) und Personen je Floß */
const MAX_RAFTS = 3;
const CASTAWAYS_PER = 6;

/** Farben der Leuchtraketen (Werte über 1 leuchten im Bloom): golden (Schatz-Galeone), rot (Notruf), violett und gold im Wechsel (Schmuggler) */
const FLARE_GOLD: readonly [number, number, number] = [2.8, 1.5, 0.2];
const FLARE_RED: readonly [number, number, number] = [3.2, 0.42, 0.22];
const FLARE_VIOLET: readonly [number, number, number] = [2.1, 0.55, 3.1];
/** Signalfeuer in der Farbe der Nation (Kriegs-Nachschub): einmal beim Start ausgerechnet */
const NATION_FLARE: Partial<Record<FactionId, [number, number, number]>> = {};
for (const f of Object.values(FACTIONS)) {
  const c = new Color(f.color);
  const m = Math.max(c.r, c.g, c.b, 0.2);
  NATION_FLARE[f.id] = [(c.r / m) * 2.6 + 0.2, (c.g / m) * 2.6 + 0.2, (c.b / m) * 2.6 + 0.2];
}

const CRATE_COL: Record<string, Color> = {
  planken: new Color('#8A5A2B'), segeltuch: new Color('#D8CCB0'), ware: new Color('#7A2E22'), karte: new Color('#E3B04B'),
};

/** Weicher runder Lichtfleck (Leuchtraketen) */
function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.75)'); r.addColorStop(0.6, 'rgba(255,255,255,0.18)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return markShared(new CanvasTexture(c));
}

/** Schaumbänder der Strömungen: je Band ein Streifen mit 9 Punkten quer, die Wellen rechnet der Vertex-Shader wie das Meer */
function laneGeometry(lanes: readonly CurrentLane[]): BufferGeometry {
  const ACROSS = 8;
  let rows = 0;
  for (const l of lanes) rows += l.pts.length / 2;
  const pos = new Float32Array(rows * (ACROSS + 1) * 3);
  const flow = new Float32Array(rows * (ACROSS + 1) * 3);
  const idx: number[] = [];
  let v = 0;
  for (const l of lanes) {
    const n = l.pts.length / 2;
    const base = v;
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
      let tx = l.pts[b * 2] - l.pts[a * 2], tz = l.pts[b * 2 + 1] - l.pts[a * 2 + 1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = tz, nz = -tx;
      for (let j = 0; j <= ACROSS; j++) {
        const acr = (j / ACROSS) * 2 - 1;
        pos[v * 3] = l.pts[k * 2] + nx * acr * l.width * 0.5;
        pos[v * 3 + 1] = 0;
        pos[v * 3 + 2] = l.pts[k * 2 + 1] + nz * acr * l.width * 0.5;
        flow[v * 3] = l.s[k]; flow[v * 3 + 1] = acr; flow[v * 3 + 2] = l.length;
        v++;
      }
    }
    for (let k = 0; k + 1 < n; k++) for (let j = 0; j < ACROSS; j++) {
      const i0 = base + k * (ACROSS + 1) + j, i1 = i0 + 1, i2 = i0 + ACROSS + 1, i3 = i2 + 1;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aFlow', new BufferAttribute(flow, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export class WorldEventView {
  readonly root = new Group();
  private readonly lanesMesh: Mesh | null = null;
  private readonly laneU = { uLight: { value: 1 }, uOpacity: { value: 1 } };

  // Leuchtraketen: eine Punktwolke für alle (ein Zeichenaufruf)
  private readonly flarePts: Points;
  private readonly flarePos: Float32Array;
  private readonly flareCol: Float32Array;
  private readonly flareSize: Float32Array;

  // Möwen, Trümmer, Kisten
  private readonly gulls: InstancedMesh;
  private readonly planks: InstancedMesh;
  private readonly barrels: InstancedMesh;
  readonly crates: InstancedMesh;

  // Flöße der Schiffbrüchigen und die Personen darauf (4.5C)
  private readonly rafts: InstancedMesh;
  private readonly castaways: InstancedMesh;

  // Gewitterwirbel und Wolken-/Nebelwände
  private readonly vortices: Mesh[] = [];
  private readonly vortexU = { uTime: { value: 0 }, uFlash: { value: 0 } };
  private readonly walls: Mesh[] = [];
  private readonly wallMats: MeshBasicMaterial[] = [];

  private prewarming = false;
  private smokeT = 0;
  private time = 0;

  constructor(scene: Scene, lanes: readonly CurrentLane[], ocean: OceanUniformRefs, private readonly smoke: SmokeSystem | null) {
    this.root.name = 'seaEvents';
    scene.add(this.root);

    // ---- Schaumlinien der Windstraßen ----
    if (lanes.length) {
      const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: DoubleSide, fog: false, ...MIX_KEEP_ALPHA });
      const lu = this.laneU;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = ocean.uTime; sh.uniforms.uWaveScale = ocean.uWaveScale; sh.uniforms.uCamPos = ocean.uCamPos;
        sh.uniforms.uLight = lu.uLight; sh.uniforms.uOpacity = lu.uOpacity;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
            attribute vec3 aFlow;
            varying vec3 vFlow;
            varying vec3 vW;
            ${GERSTNER_GLSL}`)
          .replace('#include <begin_vertex>', `
            vec3 skN; float skC;
            vec3 transformed = position + skGerstner(position.xz, skN, skC);
            // etwas über dem Wasser: das Meer zeichnet seine Wellen über ein gröberes Gitter, Kämme stächen sonst durch die Fäden
            transformed.y += 0.55;
            vFlow = aFlow;
            vW = transformed;`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            uniform float uTime;
            uniform float uLight, uOpacity;
            uniform vec3 uCamPos;
            varying vec3 vFlow;
            varying vec3 vW;
            float fHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
            float fNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
              return mix(mix(fHash(i), fHash(i + vec2(1, 0)), f.x), mix(fHash(i + vec2(0, 1)), fHash(i + vec2(1, 1)), f.x), f.y); }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
            {
              // Schaumfäden: dünn, geschwungen, unregelmäßig aufgerissen und mit der Strömung treibend (keine gleichmäßigen Striche)
              float acr = vFlow.y;
              float sAl = vFlow.x;
              float lines = 0.0;
              for (int i = 0; i < 6; i++) {
                float fi = float(i);
                float off = -0.75 + fi * 0.3 + 0.1 * sin(sAl * 0.0063 + fi * 2.1) + 0.04 * sin(sAl * 0.031 + fi * 4.3);
                float w = 0.013 + 0.012 * fNoise(vec2(sAl * 0.02, fi * 3.1));
                float line = 1.0 - smoothstep(w * 0.25, w, abs(acr - off));
                float n = fNoise(vec2((sAl - uTime * (4.5 + fi * 0.7)) / 24.0, fi * 7.7)) * 0.7 + fNoise(vec2((sAl - uTime * 5.0) / 7.0, fi * 2.3)) * 0.3;
                lines += line * smoothstep(0.45, 0.72, n);
              }
              lines = min(lines, 1.0);
              float edge = 1.0 - smoothstep(0.7, 1.0, abs(acr));
              float ends = smoothstep(0.0, 160.0, vFlow.x) * smoothstep(0.0, 160.0, vFlow.z - vFlow.x);
              float dist = length(vW.xz - uCamPos.xz);
              float far = 1.0 - smoothstep(900.0, 1700.0, dist);
              float a = lines * 0.45 * edge * ends * far * uOpacity;
              if (a < 0.004) discard;
              diffuseColor = vec4(vec3(0.9, 0.97, 1.0) * (0.35 + 0.65 * uLight), a);
            }`);
      };
      const mesh = new Mesh(laneGeometry(lanes), mat);
      mesh.name = 'currentFoam';
      mesh.renderOrder = 2;
      mesh.userData.noOutline = true;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.lanesMesh = mesh;
    }

    // ---- Leuchtraketen (Punkte, Größe je Punkt über `aSize`) ----
    {
      const g = new BufferGeometry();
      this.flarePos = new Float32Array(MAX_FLARE_PTS * 3);
      this.flareCol = new Float32Array(MAX_FLARE_PTS * 3);
      this.flareSize = new Float32Array(MAX_FLARE_PTS);
      g.setAttribute('position', new BufferAttribute(this.flarePos, 3).setUsage(DynamicDrawUsage));
      g.setAttribute('color', new BufferAttribute(this.flareCol, 3).setUsage(DynamicDrawUsage));
      g.setAttribute('aSize', new BufferAttribute(this.flareSize, 1).setUsage(DynamicDrawUsage));
      g.setDrawRange(0, 0);
      const mat = new PointsMaterial({ size: 1, sizeAttenuation: true, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false, ...MIX_KEEP_ALPHA });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aSize;')
          .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
      };
      this.flarePts = new Points(g, mat);
      this.flarePts.frustumCulled = false;
      this.flarePts.renderOrder = 7;
      this.flarePts.userData.noOutline = true;
      this.root.add(this.flarePts);
    }

    // ---- Möwen: V-förmige Schwingen ----
    {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0.35, -1.3, 0.35, -0.15, 0, 0, -0.3, 0, 0, 0.35, 0, 0, -0.3, 1.3, 0.35, -0.15]), 3));
      g.computeVertexNormals();
      this.gulls = new InstancedMesh(g, new MeshBasicMaterial({ color: '#F1EFE8', side: DoubleSide, fog: false }), MAX_FIELDS * GULLS_PER);
      this.gulls.instanceMatrix.setUsage(DynamicDrawUsage);
      this.gulls.count = 0;
      this.gulls.frustumCulled = false;
      this.gulls.userData.noOutline = true;
      this.root.add(this.gulls);
    }
    // ---- Trümmer und Kisten ----
    this.planks = new InstancedMesh(new BoxGeometry(3.2, 0.22, 0.7), toon('#6E4A28'), MAX_FIELDS * PLANKS_PER);
    this.barrels = new InstancedMesh(new CylinderGeometry(0.45, 0.45, 1.1, 10), toon('#7A5532'), MAX_FIELDS * BARRELS_PER);
    this.crates = new InstancedMesh(new BoxGeometry(1.3, 1.0, 1.3), toon('#FFFFFF'), MAX_FIELDS * CRATES_PER);
    for (const im of [this.planks, this.barrels, this.crates]) {
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      im.userData.noOutline = true;
      this.root.add(im);
    }
    for (let i = 0; i < MAX_FIELDS * CRATES_PER; i++) this.crates.setColorAt(i, CRATE_COL.planken);

    // ---- Flöße der Schiffbrüchigen: fünf Planken mit Querlatten und ein Mast mit Fetzen; Personen als schlichte Figuren (4.5C) ----
    {
      const parts: BufferGeometry[] = [];
      for (let k = 0; k < 5; k++) parts.push(new BoxGeometry(0.62, 0.24, 4.2).translate(-1.3 + k * 0.65, 0, 0));
      parts.push(new BoxGeometry(3.4, 0.16, 0.3).translate(0, 0.18, -1.4), new BoxGeometry(3.4, 0.16, 0.3).translate(0, 0.18, 1.4));
      parts.push(new CylinderGeometry(0.07, 0.09, 2.6, 6).translate(0.9, 1.3, 0.6), new BoxGeometry(0.06, 0.9, 1.1).translate(0.9, 2.0, 1.1));
      const raft = mergeGeometries(parts.map((g) => g.toNonIndexed()));
      for (const g of parts) g.dispose();
      this.rafts = new InstancedMesh(raft, toon('#7A5532'), MAX_RAFTS);
      const body = new CapsuleGeometry(0.26, 0.85, 3, 8).translate(0, 0.72, 0);
      const head = new SphereGeometry(0.2, 8, 6).translate(0, 1.42, 0);
      const person = mergeGeometries([body.toNonIndexed(), head.toNonIndexed()]);
      body.dispose(); head.dispose();
      this.castaways = new InstancedMesh(person, toon('#E8DCC4'), MAX_RAFTS * CASTAWAYS_PER);
      for (const im of [this.rafts, this.castaways]) {
        im.instanceMatrix.setUsage(DynamicDrawUsage);
        im.count = 0;
        im.frustumCulled = false;
        im.userData.noOutline = true;
        this.root.add(im);
      }
      const shirts = ['#C8B48A', '#8A3A2A', '#2F4F6E', '#D8D0BC', '#5A6A3A', '#9A6A3A'];
      for (let i = 0; i < MAX_RAFTS * CASTAWAYS_PER; i++) this.castaways.setColorAt(i, _c.set(shirts[i % shirts.length]));
    }

    // ---- Gewitterwirbel (Weltbosse) ----
    {
      const g = new CylinderGeometry(200, 24, 340, 40, 10, true);
      g.translate(0, 170, 0);
      const vu = this.vortexU;
      const mat = new MeshBasicMaterial({ color: '#2A2F38', transparent: true, depthWrite: false, side: DoubleSide, fog: false, ...MIX_KEEP_ALPHA });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = vu.uTime; sh.uniforms.uFlash = vu.uFlash;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nvarying vec2 vSp;\nvarying float vFace;\n${FACE_GLSL}`).replace('#include <uv_vertex>', '#include <uv_vertex>\nvSp = uv;\nvFace = skFace();');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uTime, uFlash;\nvarying vec2 vSp;\nvarying float vFace;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            {
              float sp = fract(vSp.x * 4.0 + vSp.y * 1.7 - uTime * 0.09);
              float band = smoothstep(0.0, 0.35, sp) * (1.0 - smoothstep(0.55, 1.0, sp));
              float h = vSp.y;
              float a = (0.35 + 0.65 * band) * smoothstep(0.0, 0.03, h) * (1.0 - smoothstep(0.82, 1.0, h)) * smoothstep(0.05, 0.55, vFace);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.8, 1.0), uFlash * 0.7) * (0.75 + 0.35 * band);
              diffuseColor.a *= a;
            }`);
      };
      for (let i = 0; i < MAX_VORTEX; i++) {
        const m = new Mesh(g, mat);
        m.renderOrder = 5;
        m.userData.noOutline = true;
        m.frustumCulled = false;
        this.vortices.push(m);
        this.root.add(m);
      }
    }

    // ---- Wolken- und Nebelwände der Wetterzellen ----
    {
      const g = new CylinderGeometry(1, 1, 1, 48, 6, true);
      g.translate(0, 0.5, 0);
      for (let i = 0; i < MAX_WALLS; i++) {
        const mat = new MeshBasicMaterial({ color: '#30343C', transparent: true, depthWrite: false, side: DoubleSide, fog: false, opacity: 0.8, ...MIX_KEEP_ALPHA });
        const vu = this.vortexU;
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.uTime = vu.uTime; sh.uniforms.uFlash = vu.uFlash;
          sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nvarying vec2 vSp;\nvarying float vFace;\n${FACE_GLSL}`).replace('#include <uv_vertex>', '#include <uv_vertex>\nvSp = uv;\nvFace = skFace();');
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
              uniform float uTime, uFlash;
              varying vec2 vSp;
              varying float vFace;
              float wHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
              float wNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
                return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y); }`)
            .replace('#include <color_fragment>', `#include <color_fragment>
              {
                vec2 p = vec2(vSp.x * 28.0, vSp.y * 4.0);
                float n = wNoise(p + vec2(uTime * 0.05, 0.0)) * 0.6 + wNoise(p * 2.3 - vec2(uTime * 0.08, uTime * 0.02)) * 0.4;
                float h = vSp.y;
                // Wolkenkante oben ausgefranst, Seiten weich (keine senkrechten Kanten wie bei einem Kasten)
                float top = 1.0 - smoothstep(0.35 + 0.35 * n, 0.95, h);
                float a = smoothstep(0.15, 0.75, n) * top * (0.55 + 0.45 * (1.0 - h)) * smoothstep(0.08, 0.6, vFace);
                // Regenvorhang im unteren Teil (nur Gewitter: Farbe dunkel)
                float rain = step(0.6, fract(vSp.x * 220.0 + h * 3.0 - uTime * 1.6)) * (1.0 - smoothstep(0.0, 0.45, h)) * step(diffuseColor.r, 0.5);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.85, 1.0), uFlash * 0.6 * step(diffuseColor.r, 0.5));
                diffuseColor.a *= clamp(a + rain * 0.25, 0.0, 1.0);
              }`);
        };
        const m = new Mesh(g, mat);
        m.renderOrder = 5;
        m.userData.noOutline = true;
        m.frustumCulled = false;
        this.walls.push(m);
        this.wallMats.push(mat);
        this.root.add(m);
      }
    }
  }

  /** Beim Laden alles sichtbar halten, damit der Ladebildschirm alle Shader vorübersetzt (danach blendet `update` aus, was nicht gebraucht wird) */
  prewarm(on: boolean, at?: Vector3) {
    this.prewarming = on;
    if (!on) return;
    const x = at?.x ?? 0, z = at?.z ?? 0;
    for (const o of [...this.vortices, ...this.walls]) { o.visible = true; o.position.set(x, -2000, z); }
    this.gulls.count = 1; this.planks.count = 1; this.barrels.count = 1; this.crates.count = 1; this.rafts.count = 1; this.castaways.count = 1;
    _m.makeTranslation(x, -2000, z);
    for (const im of [this.gulls, this.planks, this.barrels, this.crates, this.rafts, this.castaways]) { im.setMatrixAt(0, _m); im.instanceMatrix.needsUpdate = true; }
    this.flarePts.geometry.setDrawRange(0, 1);
    this.flarePos.set([x, -2000, z]); this.flareSize[0] = 1;
    if (this.lanesMesh) this.lanesMesh.visible = true;
  }

  /**
   * Ein Bild zeichnen: Signale und Wände an die Ereignisse und Zellen setzen. `frameDt` = Echtzeit des Bildes, `cam` für Abstände (Signale wachsen mit dem
   * Abstand, damit sie am Horizont sichtbar bleiben), `crateHidden` = schon geborgene Kisten (Kennung) bis zum nächsten Abgleich.
   */
  update(frameDt: number, state: WorldEventState, camera: Camera, host: ViewHost, showLanes: boolean) {
    if (this.prewarming) return;
    this.time += frameDt;
    const t = this.time;
    const cam = camera.position;
    this.vortexU.uTime.value = t;
    this.vortexU.uFlash.value = host.flash;
    this.laneU.uLight.value = 0.25 + 0.75 * clamp01(host.light);
    if (this.lanesMesh) this.lanesMesh.visible = showLanes;

    let nFlare = 0, nGull = 0, nPlank = 0, nBarrel = 0, nCrate = 0, nVortex = 0, nWall = 0, fields = 0, nRaft = 0, nCast = 0;
    this.smokeT -= frameDt;
    const puff = this.smokeT <= 0;
    if (puff) this.smokeT = 0.55;
    for (const ev of state.events) {
      if (ev.phase === 'beendet') continue;
      const d = Math.hypot(ev.x - cam.x, ev.z - cam.z);
      if (d > DIRECTOR.beaconRange) continue;
      switch (ev.kind) {
        case 'schatzgaleone': {
          const g = ev.ships.find((s) => s.role === 'galeone' && !s.down);
          nFlare = this.flare(g ? g.x : ev.x, g ? g.z : ev.z, ev.createdAt, t, d, nFlare, FLARE_GOLD, FLARE_PERIOD, 175);
          break;
        }
        case 'schiffbruch': {
          // an Bord (Eskorte) gibt es kein Floß und keine Fackeln mehr
          if (ev.rescue) break;
          nFlare = this.flare(ev.x, ev.z, ev.createdAt, t, d, nFlare, FLARE_RED, 9, 120);
          if (d < 1600 && nRaft < MAX_RAFTS) { nCast = this.raft(ev, t, host, nRaft, nCast); nRaft++; }
          break;
        }
        case 'schmuggler': {
          if (ev.busted) break;
          const s = ev.ships.find((x) => x.role === 'schmuggler' && !x.down);
          // abwechselnd violett und gold, wie es unter Schmugglern Brauch ist
          const alt = Math.floor((t + ev.createdAt) / 8) % 2 === 0;
          nFlare = this.flare(s ? s.x : ev.x, s ? s.z : ev.z, ev.createdAt * 0.7, t, d, nFlare, alt ? FLARE_VIOLET : FLARE_GOLD, 8, 150);
          break;
        }
        case 'nachschub': {
          const fr = ev.ships.find((x) => x.role === 'frachter' && !x.down);
          nFlare = this.flare(fr ? fr.x : ev.x, fr ? fr.z : ev.z, ev.createdAt * 1.3, t, d, nFlare, (ev.power && NATION_FLARE[ev.power]) || FLARE_GOLD, 11, 140);
          break;
        }
        case 'schatzjagd': if (puff && ev.site && d < 3600) this.huntSmoke(ev.site.x, ev.site.z, d); break;
        case 'blockade': if (puff) this.smokeColumn(ev.x, ev.z, d); break;
        case 'treibgut':
          if (fields < MAX_FIELDS && d < 2600) {
            const r = this.flotsam(ev, t, host, fields, nGull, nPlank, nBarrel, nCrate, d);
            nGull = r[0]; nPlank = r[1]; nBarrel = r[2]; nCrate = r[3]; fields++;
          }
          break;
        case 'weltboss':
          if (nVortex < MAX_VORTEX) {
            const m = this.vortices[nVortex++];
            m.visible = true;
            const b = ev.ships[0];
            m.position.set(b ? b.x : ev.x, 0, b ? b.z : ev.z);
            m.rotation.y = -t * 0.12;
            const near = smoothstep(120, 420, d);
            const vm = m.material as MeshBasicMaterial;
            vm.opacity = 0.85 * near;
            // Dunst: in der Ferne verblasst der Wirbel zur Farbe des Horizonts (bleibt aber als dunkle Säule erkennbar)
            vm.color.copy(VORTEX_COL).lerp(host.fogColor, 0.55 * smoothstep(host.fogFar * 0.5, host.fogFar * 3, d));
          }
          break;
      }
    }
    for (const c of state.cells) {
      if (nWall >= MAX_WALLS || c.kind === 'flaute') continue;
      const d = Math.hypot(c.x - cam.x, c.z - cam.z);
      if (d - c.r > DIRECTOR.beaconRange) continue;
      const m = this.walls[nWall], mat = this.wallMats[nWall];
      nWall++;
      const storm = c.kind === 'gewitter';
      const rr = c.r * (storm ? 0.72 : 0.8);
      m.visible = true;
      m.position.set(c.x, storm ? -4 : -2, c.z);
      m.scale.set(rr, storm ? 430 : 80, rr);
      mat.color.copy(storm ? STORM_COL : FOG_COL).lerp(host.fogColor, 0.7 * smoothstep(host.fogFar * 0.4, host.fogFar * 2.5, Math.max(0, d - rr)));
      // Ein- und Ausblenden mit der Zelle; von innen verschwindet die Wand (dann zeigt das Wetter selbst Nebel und Regen)
      const life = c.bossEventId ? Math.min(1, c.age / 60) : clamp01(Math.min(c.age, c.life - c.age) / 60);
      const inside = smoothstep(rr * 0.85, rr * 1.25, d);
      mat.opacity = (storm ? 0.85 : 0.75) * life * inside * (1 - smoothstep(DIRECTOR.beaconRange * 0.8, DIRECTOR.beaconRange, d - c.r));
    }
    for (let i = nVortex; i < MAX_VORTEX; i++) this.vortices[i].visible = false;
    for (let i = nWall; i < MAX_WALLS; i++) this.walls[i].visible = false;
    const pg = this.flarePts.geometry;
    pg.setDrawRange(0, nFlare);
    if (nFlare) { pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true; pg.attributes.aSize.needsUpdate = true; }
    this.flarePts.visible = nFlare > 0;
    this.gulls.count = nGull; this.planks.count = nPlank; this.barrels.count = nBarrel; this.crates.count = nCrate; this.rafts.count = nRaft; this.castaways.count = nCast;
    for (const im of [this.gulls, this.planks, this.barrels, this.crates, this.rafts, this.castaways]) {
      im.visible = im.count > 0;
      if (im.count) im.instanceMatrix.needsUpdate = true;
    }
    if (nCrate && this.crates.instanceColor) this.crates.instanceColor.needsUpdate = true;
  }

  /**
   * Punkt der Leuchtraketen setzen. `size` = Größe in der Nähe (m), `dk` = Anteil des Abstands, der die Größe in der Ferne bestimmt: so bleibt das
   * Signal am Horizont etwa gleich groß auf dem Bildschirm (ein Stern von rund 30 Bildpunkten bis 4 km).
   */
  private pt(i: number, x: number, y: number, z: number, r: number, g: number, b: number, size: number, dk: number, d: number): number {
    if (i >= MAX_FLARE_PTS) return i;
    this.flarePos[i * 3] = x; this.flarePos[i * 3 + 1] = y; this.flarePos[i * 3 + 2] = z;
    this.flareCol[i * 3] = r; this.flareCol[i * 3 + 1] = g; this.flareCol[i * 3 + 2] = b;
    this.flareSize[i] = Math.max(size, d * dk);
    return i + 1;
  }

  /**
   * Leuchtrakete über (x, z): alle `period` Sekunden steigt eine auf, zerplatzt und hängt als Stern am Himmel. `col` = Farbe (Werte über 1 leuchten),
   * `top` = Gipfelhöhe (m). Golden über der Schatz-Galeone, rot als Notruf der Schiffbrüchigen, violett-golden beim Schmuggler, in Nationsfarbe über dem
   * Kriegs-Nachschub (4.5C).
   */
  private flare(x: number, z: number, seedT: number, t: number, d: number, n: number, col: readonly [number, number, number], period: number, top: number): number {
    const seed = (seedT * 13.7) % period;
    const ph = (t + seed) % period;
    const rise = 2.6;
    const [cr, cg, cb] = col;
    // Farben über 1: die Nachbearbeitung lässt sie leuchten (Bloom), das Verhältnis hält sie golden statt weiß
    if (ph < rise) {
      // Rakete mit Funkenschweif
      const k = ph / rise, y = 12 + (top - 12) * (1 - (1 - k) * (1 - k));
      n = this.pt(n, x, y, z, cr, cg, cb, 10, 0.045, d);
      for (let j = 1; j <= 9; j++) { const f = 1 - j * 0.07; n = this.pt(n, x + Math.sin(j * 2.1 + t * 9) * 0.6, y - j * (4 + d * 0.004), z + Math.cos(j * 1.7 + t * 7) * 0.6, cr * f * 0.86, cg * f * 0.8, cb * f * 0.75, 7 - j * 0.5, 0.032 - j * 0.0022, d); }
    } else {
      // Zerplatzt: Stern mit Kranz, der langsam sinkt und verglüht
      const k = (ph - rise) / (period - rise);
      const fade = 1 - k * 0.8;
      const y = top - k * 30;
      n = this.pt(n, x, y, z, cr * 0.93 * fade + 0.6, cg * 0.97 * fade + 0.3, cb * fade + 0.2, 22 + 12 * (1 - k), 0.085 * (0.7 + 0.3 * fade), d);
      const r0 = (10 + 30 * Math.sqrt(k)) * Math.max(1, d / 1500);
      for (let j = 0; j < 14; j++) {
        const a = (j / 14) * Math.PI * 2;
        n = this.pt(n, x + Math.cos(a) * r0, y - k * k * 22 * Math.max(1, d / 1500) + Math.sin(a * 3) * 2, z + Math.sin(a) * r0, cr * 0.86 * fade, cg * 0.87 * fade, cb * 0.9 * fade, 8 * fade + 2, 0.05 * fade, d);
      }
    }
    return n;
  }

  /** Floß der Schiffbrüchigen auf den Wellen, die Leute darauf winken (4.5C) */
  private raft(ev: WorldEvent, t: number, host: ViewHost, k: number, nC: number): number {
    const x = ev.x, z = ev.z, hd = ev.heading ?? 0;
    const y = host.heightAt(x, z);
    _q.setFromAxisAngle(UP, hd + Math.sin(t * 0.3 + k) * 0.08);
    _m.compose(_v.set(x, y + 0.08, z), _q, _s.set(1, 1, 1));
    this.rafts.setMatrixAt(k, _m);
    const n = Math.min(CASTAWAYS_PER, ev.survivors ?? 3);
    const cs = Math.cos(hd), sn = Math.sin(hd);
    for (let j = 0; j < n; j++) {
      const lx = -1.1 + (j % 3) * 1.1, lz = j < 3 ? -0.7 : 0.8;
      const px = x + lx * cs + lz * sn, pz = z - lx * sn + lz * cs;
      // sitzen, knien, stehen: abwechselnd; wer steht, winkt (Neigung hin und her)
      const stand = j % 2 === 0;
      _q.setFromAxisAngle(_v.set(cs, 0, -sn), stand ? Math.sin(t * 3.2 + j * 1.7) * 0.18 : 0);
      _m.compose(_v.set(px, y + 0.2, pz), _q, _s.set(1, stand ? 1 : 0.62, 1));
      this.castaways.setMatrixAt(k * CASTAWAYS_PER + j, _m);
      nC = Math.max(nC, k * CASTAWAYS_PER + j + 1);
    }
    // freie Plätze dieses Floßes unsichtbar (unter dem Meer)
    for (let j = n; j < CASTAWAYS_PER; j++) { _m.makeTranslation(x, -500, z); this.castaways.setMatrixAt(k * CASTAWAYS_PER + j, _m); }
    return Math.max(nC, (k + 1) * CASTAWAYS_PER);
  }

  /** Dünne, helle Rauchsäule über dem Lager der Schatzjäger (Schatzsuche, 4.5C) */
  private huntSmoke(x: number, z: number, d: number) {
    const sm = this.smoke;
    if (!sm) return;
    // die Säule beginnt über den Kuppen (die Darstellung kennt die Geländehöhe nicht; aus der Ferne zählt nur die Säule)
    const y = 12;
    sm.puff(x + (Math.random() - 0.5) * 4, y, z + (Math.random() - 0.5) * 4, { n: 1, size: 1.6, grow: 10, life: 12, tone: 0.62, vy: 4, spread: 0.6, rise: 1.6, drag: 0.4, alpha: d < 900 ? 0.4 : 0.55, wind: 0.9, jitter: 2, glow: 0.15 });
  }

  /** Dichte schwarze Rauchfahne vor dem blockierten Hafen (am Fuß Glut) */
  private smokeColumn(x: number, z: number, d: number) {
    const sm = this.smoke;
    if (!sm) return;
    sm.puff(x + (Math.random() - 0.5) * 30, 6, z + (Math.random() - 0.5) * 30, { n: 1, size: 4, grow: 22, life: 16, tone: 0.08, vy: 9, spread: 3, rise: 3, drag: 0.4, alpha: 0.82, wind: 1.1, jitter: 10, glow: d < 900 ? 0.5 : 0.2 });
  }

  /** Treibgut-Feld: Möwen kreisen darüber, Planken und Fässer treiben, bergbare Kisten (Farbe nach Inhalt) */
  private flotsam(ev: WorldEvent, t: number, host: ViewHost, field: number, nG: number, nP: number, nB: number, nC: number, d: number): [number, number, number, number] {
    const seed = field * 7.31 + ev.createdAt * 0.017;
    // Möwen: zwei Kreise in 25 – 45 m Höhe, Flügelschlag über die Höhe der V-Form
    for (let j = 0; j < GULLS_PER; j++) {
      const ring = j % 2, sp = ring ? 0.32 : -0.25;
      const a = t * sp + j * 0.83 + seed;
      const r = 34 + ring * 22 + Math.sin(j * 1.9) * 8;
      const x = ev.x + Math.cos(a) * r, z = ev.z + Math.sin(a) * r;
      const y = 26 + ring * 14 + Math.sin(t * 0.7 + j) * 3;
      const flap = 0.35 + 0.65 * Math.abs(Math.sin(t * 6 + j * 1.3));
      // der Schwarm wächst mit dem Abstand: aus der Ferne eine kreisende Wolke heller Punkte über dem Treibgut
      const k = Math.max(1.3, d / 300);
      _q.setFromAxisAngle(UP, a + (sp > 0 ? Math.PI : 0));
      _s.set(k, flap * k, k);
      _m.compose(_v.set(x, y, z), _q, _s);
      this.gulls.setMatrixAt(nG++, _m);
    }
    // Trümmer und Fässer treiben auf den Wellen (nur in der Nähe)
    if (d < 1500) {
      for (let j = 0; j < PLANKS_PER; j++) {
        const a = seed * 3 + j * 2.4, r = 10 + ((j * 37) % 60);
        const x = ev.x + Math.cos(a) * r, z = ev.z + Math.sin(a) * r;
        _q.setFromAxisAngle(UP, a * 1.7 + Math.sin(t * 0.2 + j) * 0.2);
        _m.compose(_v.set(x, host.heightAt(x, z) + 0.05, z), _q, _s.set(1, 1, 1));
        this.planks.setMatrixAt(nP++, _m);
      }
      for (let j = 0; j < BARRELS_PER; j++) {
        const a = seed * 5 + j * 1.31, r = 14 + ((j * 53) % 50);
        const x = ev.x + Math.cos(a) * r, z = ev.z + Math.sin(a) * r;
        _q.setFromAxisAngle(_v.set(Math.cos(a), 0, Math.sin(a)), Math.PI / 2 + Math.sin(t + j) * 0.15);
        _m.compose(_v.set(x, host.heightAt(x, z) + 0.15, z), _q, _s.set(1, 1, 1));
        this.barrels.setMatrixAt(nB++, _m);
      }
      for (const c of ev.crates ?? []) {
        if (c.taken || nC >= MAX_FIELDS * CRATES_PER) continue;
        _q.setFromAxisAngle(UP, (c.x * 0.3 + c.z * 0.7) % 6.28 + Math.sin(t * 0.4 + c.x) * 0.25);
        _m.compose(_v.set(c.x, host.heightAt(c.x, c.z) + 0.25, c.z), _q, _s.set(1, 1, 1));
        this.crates.setMatrixAt(nC, _m);
        this.crates.setColorAt(nC, _c.copy(CRATE_COL[c.kind] ?? CRATE_COL.planken));
        nC++;
      }
    }
    return [nG, nP, nB, nC];
  }
}
