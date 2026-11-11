import { Effect } from 'postprocessing';
import { Uniform } from 'three';

/**
 * Filmische Farbkorrektur für den ernsten, düsteren Anime-Look:
 * Schatten kühl und stahlblau, Lichter warm, Farben leicht entsättigt, mehr Kontrast.
 * Der Alpha-Kanal bleibt unangetastet (er markiert Wasser für Konturen und Schattierung).
 */
const FRAG = /* glsl */ `
  uniform float uStrength;
  uniform float uSat;
  uniform float uContrast;
  uniform float uNight;
  uniform float uGold;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 c = inputColor.rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // Teiltonung: Schatten Richtung Stahlblau, Lichter Richtung Bernstein
    vec3 shadowTone = vec3(0.82, 0.92, 1.06);
    vec3 lightTone = vec3(1.06, 1.0, 0.9);
    vec3 graded = c * mix(shadowTone, lightTone, smoothstep(0.05, 0.75, l));
    // Nacht: Mondlicht-Look – Schatten und Mitteltöne ins Blau-Türkis, ein kleiner Aufheller, damit nichts absäuft
    graded *= mix(vec3(1.0), vec3(0.84, 0.97, 1.18), uNight * (1.0 - smoothstep(0.1, 0.85, l)));
    graded += uNight * vec3(0.004, 0.010, 0.024) * (1.0 - l);
    // Goldene Stunde: Lichter bernsteinfarben, Schatten leicht violett
    graded *= mix(vec3(1.0), vec3(1.10, 0.98, 0.82), uGold * smoothstep(0.12, 0.8, l));
    graded *= mix(vec3(1.0), vec3(0.94, 0.9, 1.06), uGold * (1.0 - smoothstep(0.0, 0.4, l)) * 0.7);
    // Sättigung: kräftige Farben behalten etwas mehr, Mitteltöne werden ruhiger
    float lg = dot(graded, vec3(0.2126, 0.7152, 0.0722));
    graded = mix(vec3(lg), graded, uSat);
    // S-Kurve für Kontrast, Tiefen leicht angehoben (kein absolutes Schwarz – Anime bleibt lesbar)
    graded = clamp(graded, 0.0, 1.0);
    graded = mix(graded, graded * graded * (3.0 - 2.0 * graded), uContrast);
    graded = graded * 0.97 + 0.015;
    outputColor = vec4(mix(c, graded, uStrength), inputColor.a);
  }`;

export class GradeEffect extends Effect {
  constructor(strength = 1, saturation = 0.84, contrast = 0.32) {
    super('GradeEffect', FRAG, {
      uniforms: new Map<string, Uniform>([
        ['uStrength', new Uniform(strength)],
        ['uSat', new Uniform(saturation)],
        ['uContrast', new Uniform(contrast)],
        ['uNight', new Uniform(0)],
        ['uGold', new Uniform(0)],
      ]),
    });
  }
}
