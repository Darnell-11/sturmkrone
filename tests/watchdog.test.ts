import { describe, expect, it } from 'vitest';
import { PerfWatchdog, budgetConfig } from '../src/render/watchdog';
import { QUALITY_TIERS } from '../src/data/qualityTiers';

/** Simuliert Bilder mit fester Bildrate über n Sekunden; liefert alle Stufenwechsel */
function run(w: PerfWatchdog, fps: number, seconds: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < seconds; t += 1 / fps) { const r = w.sample(1 / fps); if (r !== null) out.push(r); }
  return out;
}

describe('Leistungs-Wächter', () => {
  it('ruckelt es unter 50 fps, steigt die Sparstufe bis 3 und nicht weiter', () => {
    const w = new PerfWatchdog();
    const steps = run(w, 35, 60);
    expect(steps).toEqual([1, 2, 3]);
    expect(w.level).toBe(3);
  });

  it('bei 60 fps passiert nichts', () => {
    const w = new PerfWatchdog();
    expect(run(w, 60, 60)).toEqual([]);
    expect(w.level).toBe(0);
  });

  it('läuft es lange wieder flüssig, werden die Stufen einzeln zurückgegeben', () => {
    const w = new PerfWatchdog();
    run(w, 35, 40);
    expect(w.level).toBe(3);
    const back = run(w, 60, 160);
    expect(back).toEqual([2, 1, 0]);
  });

  it('zwischen 50 und 58 fps bleibt die Stufe', () => {
    const w = new PerfWatchdog();
    run(w, 35, 60);
    const l = w.level;
    expect(l).toBe(3);
    expect(run(w, 54, 60)).toEqual([]);
    expect(w.level).toBe(l);
  });

  it('einzelne Ruckler (Shader-Übersetzung, Nachladen) senken nichts', () => {
    const w = new PerfWatchdog();
    const out: number[] = [];
    // 60 fps, dazu alle 40 Bilder ein 150-ms-Ruckler: das ist kein Dauerzustand
    for (let i = 0; i < 60 * 90; i++) { const r = w.sample(i % 40 === 0 ? 0.15 : 1 / 60); if (r !== null) out.push(r); }
    expect(out).toEqual([]);
    expect(w.level).toBe(0);
  });

  it('die Schonfrist nach einem Szenenwechsel wird nicht gemessen', () => {
    const w = new PerfWatchdog();
    w.rewarm(10);
    // 8 s sehr langsam (Aufbau einer Insel), danach flüssig: kein Eingriff
    const out: number[] = [];
    for (let t = 0; t < 8; t += 1 / 20) { const r = w.sample(1 / 20); if (r !== null) out.push(r); }
    expect(run(w, 60, 30)).toEqual([]);
    expect(out).toEqual([]);
    expect(w.level).toBe(0);
  });

  it('Sparstufen senken Schatten, AO und Partikel', () => {
    const base = QUALITY_TIERS.max;
    const l1 = budgetConfig(base, 1), l3 = budgetConfig(base, 3);
    expect(l1.shadows.mapSize).toBeLessThan(base.shadows.mapSize);
    expect(l1.post.ambientOcclusion!.dirs).toBeLessThan(base.post.ambientOcclusion!.dirs);
    expect(l3.post.ambientOcclusion).toBeNull();
    expect(l3.shadows.cascades).toBe(1);
    expect(l3.particles).toBeLessThan(base.particles);
    expect(budgetConfig(base, 0)).toBe(base);
  });
});
