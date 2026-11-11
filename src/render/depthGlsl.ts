/**
 * Gemeinsame GLSL-Bausteine für alle Durchgänge, die den Tiefenpuffer lesen (Umgebungsverdeckung, Spiegelungen, Konturen).
 *
 * Regeln für stabile Bilder (keine flimmernden Linien, keine Shader-Warnungen):
 *  - Tiefe immer mit `texelFetch` aus genau einem Bildpunkt lesen. `texture2D` auf einer Bildpunkt-Grenze
 *    (halbe Auflösung trifft immer genau die Ecke zwischen vier Bildpunkten) wählt je nach Rundung mal den einen,
 *    mal den anderen Nachbarn – das ergab dunkle Linien, die bei jeder Kamerabewegung wanderten.
 *  - Die Position wird aus der Mitte desselben Bildpunkts berechnet, aus dem die Tiefe stammt.
 *  - In Schleifen nie `texture2D` (braucht Ableitungen; ANGLE/Direct3D meldet X3595, das Ergebnis ist undefiniert),
 *    kein `break`/`continue`: feste Durchlaufzahl, Auswahl über Gewichte.
 */

/** Ab dieser Tiefe gilt ein Bildpunkt als Himmel (bei Nah 0,1 m / Fern 1000 m entspricht das etwa 990 m) */
export const SKY_DEPTH = '0.999999';

/** Braucht `#include <packing>` davor und das Define DEPTH_PACKING */
export const DEPTH_PARS = /* glsl */ `
  uniform highp sampler2D tDepth;
  uniform vec2 projScale;
  uniform float cameraNear;
  uniform float cameraFar;
  #define SK_SKY_DEPTH ${SKY_DEPTH}

  // Tiefe genau eines Bildpunkts (ohne Filter, ohne Ableitungen); p muss im Bild liegen
  float skDepth(ivec2 p) {
    #if DEPTH_PACKING == 3201
      return unpackRGBAToDepth(texelFetch(tDepth, p, 0));
    #else
      return texelFetch(tDepth, p, 0).r;
    #endif
  }
  float skViewZ(float d) { return perspectiveDepthToViewZ(d, cameraNear, cameraFar); }
  // Position im Kameraraum: Bildpunkt-Mitte und die Tiefe desselben Bildpunkts
  vec3 skViewPos(ivec2 p, float d, vec2 fsize) {
    float z = skViewZ(d);
    vec2 ndc = (vec2(p) + 0.5) / fsize * 2.0 - 1.0;
    return vec3(ndc.x * -z / projScale.x, ndc.y * -z / projScale.y, z);
  }
  vec3 skPosAt(ivec2 p, vec2 fsize) { return skViewPos(p, skDepth(p), fsize); }
  // Flächennormale aus den vier Nachbarn – je Achse die Seite mit dem kleineren Tiefensprung (saubere Kanten).
  // p muss mindestens einen Bildpunkt vom Rand entfernt sein.
  vec3 skNormalAt(ivec2 p, vec3 P, vec2 fsize) {
    vec3 Pr = skPosAt(p + ivec2(1, 0), fsize);
    vec3 Pl = skPosAt(p - ivec2(1, 0), fsize);
    vec3 Pu = skPosAt(p + ivec2(0, 1), fsize);
    vec3 Pd = skPosAt(p - ivec2(0, 1), fsize);
    vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
    vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
    vec3 c = cross(dx, dy);
    float cl = dot(c, c);
    // entartete Fläche (Länge 0): zur Kamera zeigen statt durch 0 zu teilen (sonst ungültige Werte = schwarze Punkte)
    vec3 n = cl > 0.0 ? c * inversesqrt(cl) : vec3(0.0, 0.0, 1.0);
    return dot(n, -P) < 0.0 ? -n : n;
  }
  // Interleaved Gradient Noise: verteilt Suchrichtungen und Schrittversatz je Pixel
  float skIgn(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;
