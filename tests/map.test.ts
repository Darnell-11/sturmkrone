import { describe, expect, it } from 'vitest';
import { screenToWorld, worldToScreen, type WorldView } from '../src/ui/minimap';

describe('Karte', () => {
  it('Bildschirm und Welt sind ineinander umrechenbar (x gespiegelt)', () => {
    const v: WorldView = { cx: 120, cz: -340, scale: 0.37 };
    const s = worldToScreen(v, 800, 600, 500, 80);
    const w = screenToWorld(v, 800, 600, s.x, s.y);
    expect(w.x).toBeCloseTo(500);
    expect(w.z).toBeCloseTo(80);
  });

  it('Der Mittelpunkt liegt in der Bildschirmmitte, +x liegt links, +z oben', () => {
    const v: WorldView = { cx: 0, cz: 0, scale: 1 };
    expect(worldToScreen(v, 800, 600, 0, 0)).toEqual({ x: 400, y: 300 });
    expect(worldToScreen(v, 800, 600, 10, 0).x).toBeLessThan(400);
    expect(worldToScreen(v, 800, 600, 0, 10).y).toBeLessThan(300);
  });
});
