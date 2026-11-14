import { Frustum, Matrix4, Object3D, Sphere, type Camera, type Scene } from 'three';

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

/**
 * Figuren außerhalb des Kamerabilds: ihr Halter rechnet weiter (Position, Eltern bleiben richtig), aber ihr Skelett (je Figur
 * rund 100 Knochen, in der Stadt über 1 900 sichtbare Knoten) wird in der Szenenaktualisierung übersprungen. Kehrt die Figur ins Bild
 * zurück, rechnet die Aktualisierung desselben Bildes alles neu, bevor gezeichnet wird. Alles, was Knochen später braucht
 * (Treffer, Waffen, Laternen), fragt über `getWorldPosition`, das sich selbst aktualisiert.
 */
const culled = new Set<Object3D>();
const frustum = new Frustum();
const pv = new Matrix4();
const sph = new Sphere();
/** Sicherheitsabstand um den Halter (Meter): Umhang, Waffen, eine Bildkante Kameradrehung */
const CULL_MARGIN = 6;

export function registerCulled<T extends Object3D>(o: T): T { culled.add(o); return o; }
export function unregisterCulled(o: Object3D) { culled.delete(o); o.userData.skipKids = false; }

/** Einmal je Bild vor dem Zeichnen: welche Figuren liegen außerhalb des Bilds? */
export function updateCulledHolders(camera: Camera) {
  if (!culled.size) return;
  camera.updateMatrixWorld();
  pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(pv);
  for (const h of culled) {
    const e = h.matrixWorld.elements;
    sph.center.set(e[12], e[13], e[14]);
    sph.radius = CULL_MARGIN;
    h.userData.skipKids = h.visible && !frustum.intersectsSphere(sph);
  }
}

export function installMatrixSkip(scene: Scene) {
  if (!installed) {
    installed = true;
    const base = Object3D.prototype.updateMatrixWorld;
    Object3D.prototype.updateMatrixWorld = function (this: Object3D, force?: boolean) {
      if (!inSceneUpdate) { base.call(this, force); return; }
      if (this.visible === false) return;
      const ud = this.userData;
      if (ud.skipKids === true) {
        // nur den Halter selbst aktualisieren, die Knochen darunter nicht
        if (this.matrixAutoUpdate) this.updateMatrix();
        if (this.matrixWorldNeedsUpdate || force) {
          if (this.matrixWorldAutoUpdate === true) {
            if (this.parent === null) this.matrixWorld.copy(this.matrix);
            else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
          }
          this.matrixWorldNeedsUpdate = false;
        }
        ud.wasSkipped = true;
        return;
      }
      if (ud.wasSkipped === true) { ud.wasSkipped = false; force = true; }
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
