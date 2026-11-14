import { Object3D, type Scene } from 'three';

/**
 * Unsichtbare Teile der Szene überspringen, wenn three.js vor dem Zeichnen alle Welt-Matrizen berechnet.
 *
 * `Scene.updateMatrixWorld` besucht jedes Objekt, auch wenn es (oder ein Elternteil) unsichtbar ist. In Sturmkrone liegen
 * rund 70 % aller Objekte in ausgeblendeten Gruppen (Inseln außer Sichtweite, ruhende Figuren, Vorlagen), das waren
 * etwa 3 ms je Bild allein für Matrizen. Gezeichnet wird Unsichtbares ohnehin nie (`projectObject` bricht ab); kommt es
 * wieder ins Bild, rechnet die nächste Szenenaktualisierung es vor dem Zeichnen neu.
 *
 * Gilt NUR für die Aktualisierung, die die Szene selbst auslöst (Renderer). Direkte Aufrufe wie `group.updateMatrixWorld(true)`
 * oder `getWorldPosition()` rechnen unverändert, auch an ausgeblendeten Objekten.
 */
let inSceneUpdate = false;
let installed = false;

export function installMatrixSkip(scene: Scene) {
  if (!installed) {
    installed = true;
    const base = Object3D.prototype.updateMatrixWorld;
    Object3D.prototype.updateMatrixWorld = function (this: Object3D, force?: boolean) {
      if (inSceneUpdate && this.visible === false) return;
      base.call(this, force);
    };
  }
  // Instanz-Überschreibung: nur diese Szene schaltet den Überspringen-Zustand ein
  const sceneBase = Object3D.prototype.updateMatrixWorld;
  scene.updateMatrixWorld = function (this: Scene, force?: boolean) {
    inSceneUpdate = true;
    try { sceneBase.call(this, force); } finally { inSceneUpdate = false; }
  };
}
