import { describe, expect, it } from 'vitest';
import { Color, PerspectiveCamera, Scene, Vector3 } from 'three';
import { Weather, type RainLook } from '../src/world/weather';

const look = (): RainLook => ({ horizon: new Color(0.5, 0.55, 0.65), lit: 0.6, sunK: 0.4, sunDir: new Vector3(0, 1, 0) });

function setup() {
  const scene = new Scene();
  const w = new Weather(scene);
  w.auto = false;
  const cam = new PerspectiveCamera();
  const meshes = scene.children.filter((c) => (c as { isMesh?: boolean }).isMesh);
  return { scene, w, cam, meshes };
}

describe('Regen', () => {
  it('ohne Regen bleibt alles unsichtbar, mit Regen kommen drei Tiefenschichten', () => {
    const { w, cam, scene } = setup();
    w.setMaxDrops(2600);
    w.render(1, cam, look());
    expect(scene.children.filter((c) => c.visible && (c as { isMesh?: boolean }).isMesh && c.renderOrder === 6)).toHaveLength(0);
    w.setWeather('sturm', true);
    w.render(2, cam, look());
    const layers = scene.children.filter((c) => c.visible && c.renderOrder === 6);
    expect(layers).toHaveLength(3);
    const counts = layers.map((l) => (l as unknown as { geometry: { instanceCount: number } }).geometry.instanceCount);
    // nah < mittel < fern, alle begrenzt durch die Samen
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
    for (const c of counts) expect(c).toBeLessThanOrEqual(12000);
  });

  it('Wind ändert den Drift stetig (kein Sprung der Tropfenmuster)', () => {
    const { w, cam } = setup();
    w.setWeather('sturm', true);
    w.render(1, cam, look());
    const d0 = ((w as unknown as { drift: Vector3 }).drift).clone();
    w.render(1.05, cam, look());
    const d1 = ((w as unknown as { drift: Vector3 }).drift).clone();
    // 0,05 s mit 10 m/s Wind: etwa 0,5 m, nie mehr als ein Meter
    expect(d1.x - d0.x).toBeGreaterThan(0.3);
    expect(d1.x - d0.x).toBeLessThan(1);
    // ein großer Zeitsprung (Pause, Szenenwechsel) wird auf 0,1 s begrenzt
    w.render(500, cam, look());
    const d2 = ((w as unknown as { drift: Vector3 }).drift).clone();
    expect(d2.x - d1.x).toBeLessThan(1.1);
  });

  it('Aufschlagringe: Ringpuffer läuft um, Ringe zeigen nur bei Regen', () => {
    const { w, cam, scene } = setup();
    w.addRing(0, 0, 0);
    expect((w as unknown as { ringAt: number }).ringAt).toBe(0); // ohne Regen kein Ring
    w.setWeather('regen', true);
    w.render(1, cam, look());
    for (let i = 0; i < 200; i++) w.addRing(i, 0, 0);
    expect((w as unknown as { ringAt: number }).ringAt).toBe(200);
    w.render(1.02, cam, look());
    const ring = scene.children.find((c) => c.renderOrder === 5)!;
    expect(ring.visible).toBe(true);
    // nach der Lebensdauer ohne neue Ringe verschwindet das Netz
    for (let t = 1.1; t < 3; t += 0.1) w.render(t, cam, look());
    expect(ring.visible).toBe(false);
  });
});
