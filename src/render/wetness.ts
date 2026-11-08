/**
 * Nässe bei Regen: ein gemeinsamer Wert für alle Toon-Materialien.
 *  - uWet 0 … 1: Oberflächen werden dunkler und glänzen (Glanzfleck schärfer, Himmel spiegelt sich, oben stärker als an Wänden)
 *  - uPuddle 0 … 1: auf flachem Boden (Sand, Gras, Pflaster, Planken) bilden sich Pfützen mit Regenringen,
 *    die über die Bildschirm-Spiegelungen (SSR) die Umgebung spiegeln
 * Nässe baut sich im Regen in etwa 20 s auf und trocknet danach in ein bis zwei Minuten (in der Sonne schneller).
 */
export const wetShared = {
  uWet: { value: 0 },
  uPuddle: { value: 0 },
  uRain: { value: 0 },
};

/** Einmal je Logikschritt: rain = aktueller Regen (0 … 1), sun = Sonnensichtbarkeit (0 … 1) */
export function updateWetness(dt: number, rain: number, sun: number) {
  const w = wetShared.uWet, p = wetShared.uPuddle;
  if (rain > 0.08) w.value = Math.min(1, w.value + dt * rain * 0.07);
  else w.value = Math.max(0, w.value - dt * (0.008 + sun * 0.012));
  // Pfützen entstehen erst auf nassem Boden und verschwinden langsamer
  const wantP = rain > 0.08 ? Math.max(0, (w.value - 0.35) / 0.65) * Math.min(1, rain * 1.4) : 0;
  p.value += (wantP - p.value) * Math.min(1, dt * (wantP > p.value ? 0.06 : 0.012));
  wetShared.uRain.value = rain;
}

/** GLSL: Uniforms, Rauschen und Regenringe */
export const WET_PARS = /* glsl */ `
  uniform float uWet;
  uniform float uPuddle;
  uniform float uRain;
  uniform float uSkWetTime;
  float skWetH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float skWetN(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(skWetH(i), skWetH(i + vec2(1.0, 0.0)), f.x), mix(skWetH(i + vec2(0.0, 1.0)), skWetH(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // Regenringe: je Zelle ein Tropfen, der sich ausbreitende Ring verblasst
  float skRipple(vec2 p) {
    vec2 cell = floor(p * 1.6);
    vec2 f = fract(p * 1.6);
    float r = 0.0;
    for (int j = 0; j < 2; j++) {
      vec2 off = vec2(float(j), 0.0);
      float h = skWetH(cell + off + 7.3);
      float t = fract(uSkWetTime * (0.8 + h * 0.6) + h);
      vec2 c = vec2(skWetH(cell + off), skWetH(cell + off + 3.1)) - off;
      float d = length(f - c);
      r += (1.0 - t) * (1.0 - smoothstep(0.0, 0.05, abs(d - t * 0.45)));
    }
    return r;
  }
`;
