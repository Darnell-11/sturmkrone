import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three';
import { installMatrixSkip, registerCulled, restoreCulledHolders, unregisterCulled, updateCulledHolders } from '../src/render/matrixSkip';

/** Kleine Szene: eine Figur (Halter mit Netz und „Knochen“) an einer Weltposition */
function figure(scene: Scene, x: number, z: number) {
  const holder = registerCulled(new Group());
  const bone = new Group();
  const mesh = new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial());
  bone.add(mesh);
  holder.add(bone);
  holder.position.set(x, 0, z);
  scene.add(holder);
  return { holder, bone, mesh };
}

function camera() {
  const cam = new PerspectiveCamera(60, 2, 0.1, 500);
  cam.position.set(0, 5, 0);
  cam.lookAt(0, 0, -50);
  cam.updateMatrixWorld();
  return cam;
}

describe('matrixSkip: Figuren außerhalb des Bilds', () => {
  const scene = new Scene();
  installMatrixSkip(scene);
  const cam = camera();

  it('blendet Figuren außerhalb des Bilds nur für das Zeichnen aus', () => {
    const inView = figure(scene, 0, -20);
    const behind = figure(scene, 0, 60);
    const aside = figure(scene, 300, -20);
    updateCulledHolders(cam);
    expect(inView.holder.visible).toBe(true);
    expect(behind.holder.visible).toBe(false);
    expect(aside.holder.visible).toBe(false);
    restoreCulledHolders();
    // nach dem Bild ist alles wieder sichtbar (das Spiel sieht die Figuren als sichtbar)
    expect(behind.holder.visible).toBe(true);
    expect(aside.holder.visible).toBe(true);
    [inView, behind, aside].forEach((f) => { scene.remove(f.holder); unregisterCulled(f.holder); });
  });

  it('rechnet die Weltmatrix des Halters vor dem Test frisch (kein Geist am Ursprung)', () => {
    // frisch erzeugt, noch nie eine Szenenaktualisierung: Weltmatrix wäre die Einheitsmatrix, also am Ursprung (im Bild)
    const f = figure(scene, 0, 200);
    expect(f.holder.matrixWorld.elements[14]).toBe(0);
    updateCulledHolders(cam);
    expect(f.holder.matrixWorld.elements[14]).toBe(200);
    expect(f.holder.visible).toBe(false);
    restoreCulledHolders();
    scene.remove(f.holder); unregisterCulled(f.holder);
  });

  it('aktualisiert unter ausgeblendeten Figuren keine Knochen, unter sichtbaren schon', () => {
    const hidden = figure(scene, 0, 80);
    const shown = figure(scene, 0, -20);
    updateCulledHolders(cam);
    scene.updateMatrixWorld();
    expect(hidden.mesh.matrixWorld.elements[14]).toBe(0); // übersprungen
    expect(shown.mesh.matrixWorld.elements[14]).toBe(-20); // aktuell
    restoreCulledHolders();
    // Figur kehrt ins Bild zurück: die nächste Aktualisierung rechnet alles neu
    hidden.holder.position.set(0, 0, -30);
    updateCulledHolders(cam);
    expect(hidden.holder.visible).toBe(true);
    scene.updateMatrixWorld();
    expect(hidden.mesh.matrixWorld.elements[14]).toBe(-30);
    restoreCulledHolders();
    [hidden, shown].forEach((f) => { scene.remove(f.holder); unregisterCulled(f.holder); });
  });

  it('lässt vom Spiel ausgeblendete Figuren ausgeblendet', () => {
    const f = figure(scene, 0, -20);
    f.holder.visible = false; // zum Beispiel zu weit entfernt
    updateCulledHolders(cam);
    restoreCulledHolders();
    expect(f.holder.visible).toBe(false);
    scene.remove(f.holder); unregisterCulled(f.holder);
  });

  it('stellt beim Entfernen einer ausgeblendeten Figur den Zustand wieder her', () => {
    const f = figure(scene, 0, 90);
    updateCulledHolders(cam);
    expect(f.holder.visible).toBe(false);
    unregisterCulled(f.holder); // zum Beispiel dispose während des Zeichnens
    expect(f.holder.visible).toBe(true);
    restoreCulledHolders();
    scene.remove(f.holder);
  });
});
