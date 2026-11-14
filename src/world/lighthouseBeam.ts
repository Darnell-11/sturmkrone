import { AdditiveBlending, CylinderGeometry, DoubleSide, Group, Mesh, ShaderMaterial } from 'three';
import { markShared } from '../render/dispose';

/** Gemeinsame Werte aller Leuchtturm-Strahlen: Uhr und Nacht (0 = Tag, 1 = Nacht) */
const U = { uTime: { value: 0 }, uNight: { value: 0 } };

export function updateBeams(dt: number, night: number) {
  U.uTime.value += dt;
  U.uNight.value = night;
}

let mat: ShaderMaterial | null = null;
function beamMat(): ShaderMaterial {
  if (mat) return mat;
  mat = markShared(new ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        // Der Strahl liegt entlang +x (uv.y läuft von der Lampe nach außen) und dreht sich um die Hochachse
        float a = uTime * 0.55;
        float c = cos(a), s = sin(a);
        vec3 p = position;
        p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
        vec3 n = vec3(c * normal.x + s * normal.z, normal.y, -s * normal.x + c * normal.z);
        vAlong = uv.y;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vN = normalize(mat3(modelMatrix) * n);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        // Rand weich ausblenden (Kegel von der Seite hell, am Rand durchsichtig), nach außen verblassen
        float side = abs(dot(normalize(vN), normalize(vV)));
        float a = pow(side, 1.6) * pow(1.0 - vAlong, 1.35) * uNight * 0.3;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.5) * 1.6, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false,
  }));
  return mat;
}

/** Zwei gegenüberliegende, umlaufende Lichtkegel (nachts sichtbar), Ursprung in der Laterne */
export function lighthouseBeams(length = 120): Group {
  const g = new Group();
  const geo = new CylinderGeometry(0.4, length * 0.038, length, 14, 1, true);
  // Zylinder liegt entlang y: auf die x-Achse legen und mit dem Anfang in den Ursprung setzen
  geo.rotateZ(-Math.PI / 2);
  geo.translate(length / 2, 0, 0);
  // uv.y läuft vom Rand zum Rand; wir brauchen die Länge: aus der x-Position neu belegen
  const uv = geo.getAttribute('uv'), pos = geo.getAttribute('position');
  for (let i = 0; i < uv.count; i++) uv.setY(i, Math.min(1, Math.max(0, pos.getX(i) / length)));
  for (const flip of [0, Math.PI]) {
    const m = new Mesh(geo, beamMat());
    m.rotation.y = flip;
    m.frustumCulled = false;
    m.renderOrder = 7;
    m.userData.noOutline = true;
    g.add(m);
  }
  return g;
}
