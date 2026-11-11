import { BufferGeometry, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial } from 'three';

/**
 * Möwe als kleines Modell statt zwei Dreiecken: Körper mit Kopf und gelbem Schnabel, Schwanzfächer, jeder Flügel aus Arm und Hand.
 * Das Flügelschlagen rechnet die Grafikkarte (Phase und Stärke je Möwe): der Arm hebt sich, die Handspitzen folgen zeitversetzt, im Gleitflug
 * stehen die Flügel leicht gewinkelt. Farben: weiß mit grauem Rücken und schwarzen Handspitzen.
 */
const WHITE: [number, number, number] = [0.97, 0.97, 0.95];
const GREY: [number, number, number] = [0.66, 0.7, 0.76];
const BLACK: [number, number, number] = [0.1, 0.1, 0.12];
const BEAK: [number, number, number] = [1.0, 0.78, 0.2];
const BELLY: [number, number, number] = [0.86, 0.88, 0.9];

type V = [number, number, number];

function build(): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const tri = (a: V, ca: V, b: V, cb: V, c: V, cc: V) => {
    pos.push(...a, ...b, ...c);
    col.push(...ca, ...cb, ...cc);
  };
  // Körper: Spindel aus Nase, Schultern, Rücken, Bauch und Schwanz
  const nose: V = [0, 0.015, 0.46], head: V = [0, 0.045, 0.34], shL: V = [-0.085, 0.02, 0.14], shR: V = [0.085, 0.02, 0.14];
  const back: V = [0, 0.075, 0.02], belly: V = [0, -0.07, 0.04], tailBase: V = [0, 0.01, -0.2];
  const tlL: V = [-0.1, 0.0, -0.46], tlR: V = [0.1, 0.0, -0.46], tlM: V = [0, 0.0, -0.5];
  // Rücken (grauer Mantel) und Bauch (weiß)
  tri(head, WHITE, shL, GREY, back, GREY);
  tri(head, WHITE, back, GREY, shR, GREY);
  tri(back, GREY, shL, GREY, tailBase, GREY);
  tri(back, GREY, tailBase, GREY, shR, GREY);
  tri(head, WHITE, belly, BELLY, shL, WHITE);
  tri(head, WHITE, shR, WHITE, belly, BELLY);
  tri(shL, WHITE, belly, BELLY, tailBase, WHITE);
  tri(shR, WHITE, tailBase, WHITE, belly, BELLY);
  // Kopf und Schnabel
  tri(nose, WHITE, head, WHITE, shL, WHITE);
  tri(nose, WHITE, shR, WHITE, head, WHITE);
  tri([0, -0.005, 0.62], BEAK, [-0.03, 0.04, 0.45], BEAK, [0.03, 0.04, 0.45], BEAK);
  tri([0, -0.005, 0.62], BEAK, [0.03, 0.04, 0.45], BEAK, [0, -0.03, 0.46], BEAK);
  tri([0, -0.005, 0.62], BEAK, [0, -0.03, 0.46], BEAK, [-0.03, 0.04, 0.45], BEAK);
  // Schwanzfächer
  tri(tailBase, WHITE, tlL, WHITE, tlM, WHITE);
  tri(tailBase, WHITE, tlM, WHITE, tlR, WHITE);
  tri(tailBase, WHITE, tlR, WHITE, tlL, WHITE);
  // Flügel je Seite: Arm (Wurzel → Ellbogen) und Hand (Ellbogen → Spitze)
  for (const sg of [-1, 1]) {
    const m = (x: number, y: number, z: number): V => [x * sg, y, z];
    const A = m(0.07, 0.035, 0.2), B = m(0.07, 0.03, -0.14);
    const E1 = m(0.58, 0.07, 0.13), E2 = m(0.52, 0.05, -0.2);
    const T = m(1.22, 0.0, -0.22), F = m(0.95, 0.02, -0.34), H1 = m(0.92, 0.04, 0.0);
    // Arm
    if (sg > 0) {
      tri(A, GREY, E1, GREY, E2, GREY);
      tri(A, GREY, E2, GREY, B, GREY);
      // Hand: Handwurzel weiß, Spitzen schwarz
      tri(E1, WHITE, H1, WHITE, E2, WHITE);
      tri(H1, WHITE, F, BLACK, E2, WHITE);
      tri(H1, WHITE, T, BLACK, F, BLACK);
    } else {
      tri(A, GREY, E2, GREY, E1, GREY);
      tri(A, GREY, B, GREY, E2, GREY);
      tri(E1, WHITE, E2, WHITE, H1, WHITE);
      tri(H1, WHITE, E2, WHITE, F, BLACK);
      tri(H1, WHITE, F, BLACK, T, BLACK);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

export interface GullSwarm { mesh: InstancedMesh; flap: InstancedBufferAttribute }

export function createGulls(count: number): GullSwarm {
  const flap = new InstancedBufferAttribute(new Float32Array(count * 2), 2);
  flap.setUsage(35048);
  const geo = build();
  geo.setAttribute('aFlap', flap);
  const mat = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n attribute vec2 aFlap;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // Flügelschlag: Arm hebt sich, Handspitzen folgen versetzt; im Gleitflug (kleine Stärke) stehen sie leicht gewinkelt
        float wx = abs(position.x);
        float ph = aFlap.x;
        float hand = max(wx - 0.55, 0.0);
        transformed.y += aFlap.y * (0.34 * wx * sin(ph) + 0.62 * hand * sin(ph - 1.0));
        transformed.y += (1.0 - aFlap.y) * (0.1 * wx - 0.16 * hand);
        transformed.z += aFlap.y * 0.1 * hand * (1.0 - sin(ph - 1.0));`);
  };
  mat.customProgramCacheKey = () => 'sk-gull1';
  const mesh = new InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  return { mesh, flap };
}
