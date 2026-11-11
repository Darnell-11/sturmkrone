import { Color, ShaderChunk, Vector3 } from 'three';

/**
 * Atmosphärischer Distanznebel für die ganze Welt (ersetzt den linearen Nebel von three.js):
 *  - verdichtet sich exponentiell mit der Entfernung (natürlicher als eine lineare Rampe),
 *  - liegt über dem Meer dichter als in der Höhe (Berggipfel und Masten ragen heraus),
 *  - nimmt in Richtung Sonne deren Lichtfarbe auf (Dunst leuchtet im Gegenlicht, abends golden).
 * Reichweite steuern weiter Fog.near/far der Szene (Wetter und Grafikstufe).
 * Materialien ohne die Sonnen-Uniforms (Effekte) bekommen denselben Verlauf, nur ohne Sonnenleuchten.
 */
export const fogShared = {
  skFogSunDir: { value: new Vector3(0, 1, 0) },
  skFogSunCol: { value: new Color(1, 0.9, 0.7) },
  /** Stärke des Sonnenleuchtens im Dunst (0 nachts) */
  skFogHaze: { value: 0.5 },
  /** Bodennebel 0 … 1: dichter nahe der Wasserlinie (Morgen, Abend, Nacht, Sturm) */
  skFogGround: { value: 0.2 },
};

/** Im onBeforeCompile eines Materials: Sonnen-Uniforms für den Nebel anhängen */
export function fogUniforms(shader: { uniforms: Record<string, unknown> }) {
  Object.assign(shader.uniforms, fogShared);
}

let installed = false;
export function installAtmosphere() {
  if (installed) return;
  installed = true;
  ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vSkFogDir;
#endif`;
  ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  // Blickstrahl von der Kamera zum Punkt in Weltrichtung (Zeilenvektor × Matrix = umgekehrte Drehung)
  vSkFogDir = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;
#endif`;
  ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vSkFogDir;
  uniform vec3 skFogSunDir;
  uniform vec3 skFogSunCol;
  uniform float skFogHaze;
  uniform float skFogGround;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float skFogT = 0.0;
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float skFogT = max( vFogDepth - fogNear, 0.0 ) / max( fogFar - fogNear, 1.0 );
    float fogFactor = 1.0 - exp( - ( skFogT * skFogT * 3.2 + skFogT * 1.05 ) );
  #endif
  // Höhennebel: mittlere Höhe entlang des Blickstrahls. Zum Ende der Sichtweite schließt sich der Nebel auch in der
  // Höhe ganz – Berggipfel werden an der Kamera-Fernebene sonst halb sichtbar abgeschnitten.
  float skFogH = cameraPosition.y + vSkFogDir.y * 0.5;
  fogFactor *= mix( mix( 1.0, 0.6, smoothstep( 8.0, 140.0, skFogH ) ), 1.0, smoothstep( 0.7, 1.0, skFogT ) );
  // Bodennebel: nahe dem Meeresspiegel dichter, nach oben dünner (tiefe Täler und Wasserlinie füllen sich zuerst)
  float skLow = 1.0 - smoothstep( 0.0, 55.0, skFogH );
  fogFactor = mix( fogFactor, min( 1.0, fogFactor * 1.7 + 0.04 * skFogT ), skLow * skFogGround );
  vec3 skFogC = fogColor;
  float skFogLen = length( vSkFogDir );
  if ( skFogLen > 1e-3 ) {
    float skSun = max( dot( vSkFogDir / skFogLen, skFogSunDir ), 0.0 );
    skFogC = mix( skFogC, skFogSunCol, pow( skSun, 6.0 ) * skFogHaze );
  }
  gl_FragColor.rgb = mix( gl_FragColor.rgb, skFogC, clamp( fogFactor, 0.0, 1.0 ) );
#endif`;
}
