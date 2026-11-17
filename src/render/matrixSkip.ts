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
 * Figuren außerhalb des Kamerabilds: ihr Skelett (je Figur rund 100 Knochen, in der Stadt über 1 900 sichtbare Knoten) wird in der
 * Szenenaktualisierung übersprungen. Kehrt die Figur ins Bild zurück, rechnet die Aktualisierung desselben Bildes alles neu, bevor
 * gezeichnet wird. Alles, was Knochen später braucht (Treffer, Waffen, Laternen), fragt über `getWorldPosition`, das sich selbst
 * aktualisiert.
 *
 * Wichtig: Eine solche Figur darf in diesem Bild auch NICHT gezeichnet werden. Ihre Netze und Knochen tragen veraltete
 * Weltmatrizen (bei frisch erzeugten Figuren die Einheitsmatrix am Weltursprung), und three.js prüft das Sichtfeld mit genau
 * diesen Matrizen. Blickte die Kamera zufällig zum Ursprung, zeichnete es die Figur dort mit teils aktuellen, teils
 * veralteten Knochen: lange Streifen und Flächen vom Ursprung bis zur Figur (Startbildschirm, Hafenstadt). Darum wird der
 * Halter für die Dauer des Zeichnens unsichtbar gemacht (`restoreCulledHolders` nach dem Bild); das gilt für alle
 * Durchgänge (Hauptbild, Schattenkaskaden, Spiegelung, Umgebungsverdeckung).
 */
const culled = new Set<Object3D>();
/** Halter, die `updateCulledHolders` für dieses Bild ausgeblendet hat (werden nach dem Zeichnen wieder eingeblendet) */
const hiddenNow: Object3D[] = [];
const frustum = new Frustum();
const pv = new Matrix4();
const sph = new Sphere();
/** Sicherheitsabstand um den Halter (Meter): Umhang, Waffen, eine Bildkante Kameradrehung */
const CULL_MARGIN = 6;

export function registerCulled<T extends Object3D>(o: T): T { culled.add(o); return o; }
export function unregisterCulled(o: Object3D) {
  culled.delete(o);
  o.userData.skipKids = false;
  const i = hiddenNow.indexOf(o);
  if (i >= 0) { hiddenNow.splice(i, 1); o.visible = true; }
}

/** Einmal je Bild vor dem Zeichnen: welche Figuren liegen außerhalb des Bilds? Sie werden bis `restoreCulledHolders` ausgeblendet. */
export function updateCulledHolders(camera: Camera) {
  if (!culled.size) return;
  // Falls ein früheres Bild nicht bis zum Ende kam (Ausnahme beim Zeichnen), zuerst alles zurückstellen
  restoreCulledHolders();
  camera.updateMatrixWorld();
  pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(pv);
  for (const h of culled) {
    h.userData.skipKids = false;
    // vom Spiel selbst ausgeblendet (zum Beispiel zu weit weg): nichts zu tun
    if (!h.visible) continue;
    // Die Weltmatrix des Halters jetzt frisch rechnen (in einem ausgeblendeten Halter tut das die Szenenaktualisierung nicht)
    h.updateWorldMatrix(true, false);
    const e = h.matrixWorld.elements;
    sph.center.set(e[12], e[13], e[14]);
    sph.radius = CULL_MARGIN;
    if (!frustum.intersectsSphere(sph)) {
      h.userData.skipKids = true;
      h.visible = false;
      hiddenNow.push(h);
    }
  }
}

/** Nach dem Zeichnen: die für dieses Bild ausgeblendeten Figuren wieder einblenden (das Spiel sieht sie als sichtbar) */
export function restoreCulledHolders() {
  for (let i = 0; i < hiddenNow.length; i++) hiddenNow[i].visible = true;
  hiddenNow.length = 0;
}

export function installMatrixSkip(scene: Scene) {
  if (!installed) {
    installed = true;
    const base = Object3D.prototype.updateMatrixWorld;
    Object3D.prototype.updateMatrixWorld = function (this: Object3D, force?: boolean) {
      if (!inSceneUpdate) { base.call(this, force); return; }
      if (this.visible === false) return;
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
