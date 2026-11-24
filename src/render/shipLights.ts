import { Color, Object3D, PointLight, type Scene } from 'three';

/**
 * Lichtstellen eines Schiffs (Hecklaterne, Mastkorb, Kajüte) ohne eigenes Licht (4.4B).
 *
 * Früher hing an jedem Heldenschiff ein echtes `PointLight`. Jedes Programm in three.js hängt von der Zahl der Lichter in der Szene ab:
 * kam ein Schiff dazu (Titelbild, Schiffswechsel, Werft-Vorschau) oder wurde es mit seiner Gruppe ausgeblendet, übersetzte die Grafikkarte
 * alle beleuchteten Materialien neu – beim Start fast jedes Programm doppelt. Jetzt trägt das Schiff nur Anker mit Farbe, Reichweite und
 * Stärke; die echten Lichter stehen fest in der Szene (`ShipLightRig`) und folgen den Ankern des eigenen Schiffs.
 */
export class LightAnchor extends Object3D {
  readonly isLightAnchor = true;
  /** Stärke wie bei `PointLight.intensity` (setzt `Ship.render` bzw. die Kajüte) */
  intensity = 0;
  readonly color: Color;
  distance: number;
  decay: number;
  constructor(color: number, distance: number, decay: number) {
    super();
    this.color = new Color(color);
    this.distance = distance;
    this.decay = decay;
  }
}

/** Was der Licht-Satz von einem Schiffsmodell braucht */
export interface LightAnchors { lights: LightAnchor[]; cabinLight: LightAnchor | null }

/** Feste Lichter für das eigene Schiff: zwei Laternen und das Kajütenlicht, immer sichtbar, nur die Stärke wechselt */
export class ShipLightRig {
  static readonly COUNT = 3;
  readonly lights: PointLight[] = [];

  constructor(scene: Scene) {
    for (let i = 0; i < ShipLightRig.COUNT; i++) {
      const l = new PointLight(0xffa24a, 0, 20, 1.5);
      l.castShadow = false;
      l.name = 'shipLight' + i;
      scene.add(l);
      this.lights.push(l);
    }
  }

  /** Jedes Bild: den Ankern folgen (Platz 0 und 1 Laternen, Platz 2 Kajüte); `on` = false schaltet alle dunkel (nie unsichtbar) */
  follow(model: LightAnchors | null, on: boolean) {
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const a = !model || !on ? null : i < 2 ? model.lights[i] ?? null : model.cabinLight;
      if (!a) { l.intensity = 0; continue; }
      a.getWorldPosition(l.position);
      l.color.copy(a.color);
      l.distance = a.distance;
      l.decay = a.decay;
      l.intensity = a.intensity;
    }
  }
}
