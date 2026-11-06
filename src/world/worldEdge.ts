import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type Scene,
  type Texture,
} from 'three';
import { WORLD_RADIUS } from '../data/world';

const FALL_HEIGHT = 700;
const MIST_COUNT = 70;

/** Das Meer stürzt am Rand der Welt als riesiger Wasserfall in die Tiefe. */
export class WorldEdge {
  private fall: Mesh;
  private mist: InstancedMesh;
  private rainbow: Mesh;
  readonly fallU = UniformsUtils.merge([UniformsLib.fog, {
    uTime: { value: 0 },
    uWater: { value: new Color(0x33c4d2) },
    uDeep: { value: new Color(0x0b6a96) },
    uFoam: { value: new Color(1, 1, 1) },
  }]);
  readonly mistU = {
    uMap: { value: null as Texture | null },
    uTime: { value: 0 },
    uCenter: { value: new Vector3() },
    uAngle: { value: 0 },
    uColor: { value: new Color(1, 1, 1) },
    uShade: { value: new Color(0.7, 0.75, 0.85) },
    uAlpha: { value: 0 },
  };
  readonly bowU = { uAlpha: { value: 0 } };

  constructor(scene: Scene, cloudMap: Texture) {
    const fallMat = new ShaderMaterial({
      uniforms: this.fallU,
      fog: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uWater, uDeep, uFoam;
        varying vec2 vUv;
        #include <fog_pars_fragment>
        float hh(float x) { x = fract(x * 0.1031); x *= x + 33.33; x *= x + x; return fract(x); }
        void main() {
          float col = floor(vUv.x * 2400.0);
          float sp = 0.7 + hh(col) * 0.8;
          float s = fract(vUv.y * 7.0 * sp + uTime * 0.9 * sp + hh(col) * 9.0);
          float streak = smoothstep(0.45, 1.0, s);
          float top = smoothstep(0.93, 1.0, vUv.y);
          vec3 c = mix(mix(uDeep, uWater, smoothstep(0.3, 0.95, vUv.y)), uFoam, clamp(streak * 0.7 + top * 0.9, 0.0, 1.0));
          // unten löst sich das Wasser in Nebel auf
          float a = smoothstep(0.0, 0.55, vUv.y) * 0.96;
          c = mix(vec3(0.85, 0.9, 0.95) * uWater * 1.6, c, smoothstep(0.1, 0.6, vUv.y));
          gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.fall = new Mesh(new CylinderGeometry(WORLD_RADIUS, WORLD_RADIUS * 0.985, FALL_HEIGHT, 360, 1, true), fallMat);
    this.fall.position.y = -FALL_HEIGHT / 2 + 0.3;
    this.fall.frustumCulled = false;
    this.fall.renderOrder = 1;
    scene.add(this.fall);

    // Gischtwolken an der Kante, nahe beim Spieler
    this.mistU.uMap.value = cloudMap;
    const geo = new PlaneGeometry(1, 1);
    const data = new Float32Array(MIST_COUNT * 4);
    for (let i = 0; i < MIST_COUNT; i++) data.set([Math.random() * 2 - 1, Math.random(), Math.random(), Math.floor(Math.random() * 4)], i * 4);
    geo.setAttribute('aData', new InstancedBufferAttribute(data, 4));
    this.mist = new InstancedMesh(geo, new ShaderMaterial({
      uniforms: this.mistU,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 aData;
        uniform float uTime, uAngle;
        varying vec2 vUv; varying float vA;
        void main() {
          float life = fract(aData.y + uTime * (0.035 + aData.z * 0.03));
          float ang = uAngle + aData.x * 0.16;
          float r = ${WORLD_RADIUS.toFixed(1)} + 15.0 + aData.z * 50.0;
          vec3 c = vec3(cos(ang) * r, -50.0 + life * 150.0, sin(ang) * r);
          vec4 mv = viewMatrix * vec4(c, 1.0);
          float size = 80.0 + life * 170.0;
          mv.xy += position.xy * vec2(size, size * 0.7);
          gl_Position = projectionMatrix * mv;
          vUv = uv * 0.5 + vec2(mod(aData.w, 2.0), 1.0 - floor(aData.w / 2.0)) * 0.5;
          vA = sin(life * 3.14159);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uColor, uShade; uniform float uAlpha;
        varying vec2 vUv; varying float vA;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          float a = t.a * vA * uAlpha * 0.85;
          if (a < 0.01) discard;
          gl_FragColor = vec4(mix(uShade, uColor, smoothstep(0.35, 0.65, t.r)), a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }), MIST_COUNT);
    this.mist.frustumCulled = false;
    this.mist.renderOrder = 2;
    scene.add(this.mist);

    // Regenbogen über dem Abgrund
    this.rainbow = new Mesh(new RingGeometry(330, 390, 96, 1, 0, Math.PI), new ShaderMaterial({
      uniforms: this.bowU,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha;
        varying vec2 vP;
        vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main() {
          float t = (length(vP) - 330.0) / 60.0;
          float edge = smoothstep(0.0, 0.15, t) * smoothstep(1.0, 0.85, t);
          vec3 c = hue(t * 0.8);
          float foot = smoothstep(-40.0, 120.0, vP.y);
          gl_FragColor = vec4(c * edge * uAlpha * 0.5 * foot, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    this.rainbow.frustumCulled = false;
    this.rainbow.renderOrder = 3;
    scene.add(this.rainbow);
  }

  /**
   * Jeden Frame. focus = Spielerposition. daylight 0 … 1, clearSky 0 … 1 (Regenbogen nur bei Sonne).
   */
  render(time: number, focus: Vector3, camPos: Vector3, sunDir: Vector3, daylight: number, clearSky: number, mistLit: Color, mistShade: Color) {
    const distToEdge = WORLD_RADIUS - Math.hypot(focus.x, focus.z);
    const near = 1 - Math.min(1, Math.max(0, (distToEdge - 150) / 900));
    this.fall.visible = near > 0;
    this.mist.visible = near > 0;
    this.fallU.uTime.value = time;
    const ang = Math.atan2(focus.z, focus.x);
    this.mistU.uTime.value = time;
    this.mistU.uAngle.value = ang;
    this.mistU.uAlpha.value = near;
    this.mistU.uColor.value.copy(mistLit);
    this.mistU.uShade.value.copy(mistShade).lerp(this.fallU.uWater.value, 0.3);

    // Regenbogen steht gegenüber der Sonne: sichtbar, wenn die Sonne hinter dem Betrachter steht
    const out = new Vector3(Math.cos(ang), 0, Math.sin(ang));
    const view = new Vector3(out.x * WORLD_RADIUS - camPos.x, 0, out.z * WORLD_RADIUS - camPos.z).normalize();
    const behind = Math.max(0, -(view.x * sunDir.x + view.z * sunDir.z));
    const close = Math.max(0, Math.min(1, (near - 0.6) / 0.35));
    this.bowU.uAlpha.value = close * close * daylight * clearSky * (0.35 + 0.65 * behind);
    this.rainbow.visible = this.bowU.uAlpha.value > 0.01;
    this.rainbow.position.set(out.x * (WORLD_RADIUS + 260), -140, out.z * (WORLD_RADIUS + 260));
    this.rainbow.lookAt(camPos.x, -140, camPos.z);
  }

  setWaterColors(water: Color, deep: Color) {
    this.fallU.uWater.value.copy(water);
    this.fallU.uDeep.value.copy(deep);
  }
}
