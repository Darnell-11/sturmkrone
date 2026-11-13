import { Vector2, type Material } from 'three';
import * as CSMShaderModule from 'three/examples/jsm/csm/CSMShader.js';
import { ShaderChunk } from 'three';

/**
 * Kaskadierte Schattenkarten (CSM): mehrere Schattenkarten hintereinander entlang der Blickrichtung.
 * Die erste deckt nur die Nähe ab (gestochen scharf), die weiteren immer größere Bereiche (weich auslaufend).
 *
 * Die Lichter und Ausschnitte verwaltet die CSM-Klasse von three.js (siehe Environment). Hier liegen die
 * gemeinsamen Shader-Werte: Alle Toon-Materialien lesen dieselben Uniforms, damit auch zwischengespeicherte
 * Materialien ohne Neuaufbau mitlaufen.
 */
export const csmShared = {
  /** Anzahl der Kaskaden (0 = aus, dann gewöhnliche Schatten mit einer Karte) */
  cascades: 0,
  uniforms: {
    CSM_cascades: { value: [] as Vector2[] },
    cameraNear: { value: 0.1 },
    shadowFar: { value: 300 },
  },
};

// Die Typdatei beschreibt CSMShader nur als Interface; zur Laufzeit ist es ein Objekt mit den Shader-Bausteinen
const CSMShader = (CSMShaderModule as unknown as { CSMShader: { lights_fragment_begin: string; lights_pars_begin: string } }).CSMShader;

let injected = false;
/** Shader-Bausteine für CSM einmalig einsetzen (ohne USE_CSM verhalten sie sich wie die normalen) */
function inject() {
  if (injected) return;
  injected = true;
  ShaderChunk.lights_fragment_begin = CSMShader.lights_fragment_begin;
  ShaderChunk.lights_pars_begin = CSMShader.lights_pars_begin;
}

/** CSM-Schalter eines Materials an die aktuelle Stufe anpassen. true = geändert (muss neu übersetzt werden). */
export function csmDefines(mat: Material): boolean {
  const d = (mat.defines ??= {}) as Record<string, unknown>;
  const n = csmShared.cascades;
  if (n >= 2) {
    inject();
    // Die Kaskaden-Grenzen füllt erst der nächste Weltschritt. Bis dahin müssen so viele Einträge da sein, wie der
    // Shader erwartet – sonst wirft das erste Bild nach einem Stufenwechsel einen Fehler (gesehen im Editor-Raum).
    const br = csmShared.uniforms.CSM_cascades.value;
    while (br.length < n) br.push(new Vector2());
    if (d.USE_CSM === 1 && d.CSM_CASCADES === n) return false;
    d.USE_CSM = 1;
    d.CSM_CASCADES = n;
    d.CSM_FADE = '';
    return true;
  }
  if (!('USE_CSM' in d)) return false;
  delete d.USE_CSM;
  delete d.CSM_CASCADES;
  delete d.CSM_FADE;
  return true;
}

/** Im onBeforeCompile eines Materials: gemeinsame CSM-Uniforms anhängen */
export function csmUniforms(shader: { uniforms: Record<string, unknown> }) {
  Object.assign(shader.uniforms, csmShared.uniforms);
}

const hooked = new WeakSet<Material>();
type Lit = Material & { isMeshToonMaterial?: boolean; isMeshStandardMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean };

/**
 * Beleuchtetes Material für CSM vorbereiten (Schalter + Uniforms). Ohne das würde ein Material jede
 * Kaskade als eigenes Licht zählen und zu hell werden. true = Schalter geändert (needsUpdate nötig).
 */
export function ensureCsm(mat: Material): boolean {
  const m = mat as Lit;
  if (!m.isMeshToonMaterial && !m.isMeshStandardMaterial && !m.isMeshLambertMaterial && !m.isMeshPhongMaterial) return false;
  if (!hooked.has(mat)) {
    hooked.add(mat);
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = function (shader, renderer) {
      prev.call(this, shader, renderer);
      csmUniforms(shader);
    };
  }
  return csmDefines(mat);
}
