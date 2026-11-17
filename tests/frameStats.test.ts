import { describe, expect, it } from 'vitest';
import { FrameWindow } from '../src/render/frameStats';
import { AutoQuality } from '../src/render/quality';
import { DynamicResolution } from '../src/render/dynamicResolution';

describe('Robuste Bildraten-Messung', () => {
  it('ein Mittelwert würde einbrechen, die gekürzte Messung nicht', () => {
    const w = new FrameWindow();
    for (let i = 0; i < 150; i++) w.push(i % 50 === 0 ? 0.18 : 1 / 60);
    // 3 Ruckler von 150 Bildern: roher Mittelwert ≈ 50 fps, gekürzt (4 % = 6 Bilder) wieder 60 fps
    const raw = w.frames / w.acc;
    expect(raw).toBeLessThan(54);
    expect(w.fps()).toBeGreaterThan(59);
  });

  it('anhaltend langsames Zeichnen bleibt sichtbar', () => {
    const w = new FrameWindow();
    for (let i = 0; i < 100; i++) w.push(1 / 30);
    expect(w.fps()).toBeLessThan(31);
  });

  it('Ruckleranteil', () => {
    const w = new FrameWindow();
    for (let i = 0; i < 100; i++) w.push(i < 10 ? 0.12 : 1 / 60);
    expect(w.hitchShare()).toBeCloseTo(0.1, 1);
  });
});

describe('Automatische Grafikstufe', () => {
  it('senkt erst nach zwei langsamen Fenstern, nicht in den ersten Sekunden', () => {
    const a = new AutoQuality();
    // 1) erste 8 s langsam: ignoriert
    let lowered = false;
    for (let t = 0; t < 8; t += 1 / 25) lowered ||= a.sample(1 / 25);
    expect(lowered).toBe(false);
    // 2) ein langsames Fenster (6 s), dann flüssig: nichts
    for (let t = 0; t < 6; t += 1 / 25) lowered ||= a.sample(1 / 25);
    for (let t = 0; t < 30; t += 1 / 60) lowered ||= a.sample(1 / 60);
    expect(lowered).toBe(false);
    // 3) zwei langsame Fenster in Folge: senken
    for (let t = 0; t < 14; t += 1 / 25) lowered ||= a.sample(1 / 25);
    expect(lowered).toBe(true);
  });

  it('Ruckler allein senken die Stufe nicht', () => {
    const a = new AutoQuality();
    let lowered = false;
    for (let i = 0; i < 60 * 60; i++) lowered ||= a.sample(i % 30 === 0 ? 0.12 : 1 / 60);
    expect(lowered).toBe(false);
  });
});

describe('Dynamische Auflösung', () => {
  it('ein Ruckler ändert die Auflösung nicht', () => {
    const d = new DynamicResolution();
    d.reset(1.5);
    let changed = false;
    for (let i = 0; i < 60 * 40; i++) changed ||= d.sample(i % 45 === 0 ? 0.15 : 1 / 60);
    expect(changed).toBe(false);
    expect(d.scale).toBe(1);
  });

  it('anhaltend zu langsam: senkt in Schritten', () => {
    const d = new DynamicResolution();
    d.reset(1.5);
    let changed = false;
    for (let i = 0; i < 40 * 40; i++) changed ||= d.sample(1 / 40);
    expect(changed).toBe(true);
    expect(d.scale).toBeLessThan(1);
  });
});
