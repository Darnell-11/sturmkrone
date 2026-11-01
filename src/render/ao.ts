import { Uniform, type PerspectiveCamera } from 'three';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';

// Einfache Umgebungsverdeckung nur aus dem Tiefenpuffer (Stufe Maximal).
const AO_FRAG = /* glsl */ `
  uniform float radius;
  uniform float intensity;
  uniform float projScale;
  float aoHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    if (depth >= 0.9999 || inputColor.a < 0.5) { outputColor = inputColor; return; }
    float d = -getViewZ(depth);
    float rUv = radius * projScale / d;
    float occ = 0.0;
    float rot = aoHash(uv * resolution) * 6.2831;
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float a = fi * 2.39996 + rot;
      float r = (fi + 0.5) / 12.0;
      vec2 o = vec2(cos(a) / aspect, sin(a)) * r * rUv;
      float sd = -getViewZ(readDepth(uv + o));
      float diff = d - sd;
      occ += step(0.08 * radius, diff) * (1.0 - smoothstep(radius * 0.5, radius * 2.0, diff));
    }
    occ = occ / 12.0;
    float fade = 1.0 - smoothstep(60.0, 160.0, d);
    outputColor = vec4(inputColor.rgb * (1.0 - occ * intensity * fade), inputColor.a);
  }
`;

export class DepthAOEffect extends Effect {
  constructor(private camera: PerspectiveCamera, { radius = 1.2, intensity = 0.55 } = {}) {
    super('DepthAOEffect', AO_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['radius', new Uniform(radius)],
        ['intensity', new Uniform(intensity)],
        ['projScale', new Uniform(1)],
      ]),
    });
  }

  update() {
    this.uniforms.get('projScale')!.value = this.camera.projectionMatrix.elements[5] * 0.5;
  }
}
