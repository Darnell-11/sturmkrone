import { describe, expect, it } from 'vitest';
import { FIGUREHEAD_DEFS, FIGUREHEADS, LEGACY_FIGUREHEAD, figureheadModel, figureheadScale } from '../src/data/figureheads';
import { SHIP_CLASSES } from '../src/data/ships';
import { FACTIONS } from '../src/data/factions';
import { clothGeometry, makeClothUniforms, updateClothFlag, type ClothFlag } from '../src/render/flagCloth';

describe('Galionsfiguren (Daten)', () => {
  it('alte Kennungen aus Spielständen und Fraktionsdaten zeigen auf Skulpturen', () => {
    for (const id of Object.keys(LEGACY_FIGUREHEAD)) expect(figureheadModel(id)).toBe((LEGACY_FIGUREHEAD as Record<string, string>)[id]);
    for (const f of Object.values(FACTIONS)) expect(figureheadModel(f.ship.figurehead), f.name).not.toBeNull();
    expect(figureheadModel('keine')).toBeNull();
    expect(figureheadModel('gibt-es-nicht')).toBeNull();
    expect(figureheadModel(undefined)).toBeNull();
  });

  it('die Werft bietet keine und alle vier Skulpturen an', () => {
    expect(Object.keys(FIGUREHEADS).sort()).toEqual(['keine', 'leviathan_skull', 'royal_griffin', 'storm_dragon', 'valkyrie']);
  });

  it('Maßstab wächst mit der Klasse, bleibt unter 2,2 und die Flügel ragen nicht über die Bordwand', () => {
    for (const id of Object.keys(FIGUREHEAD_DEFS) as (keyof typeof FIGUREHEAD_DEFS)[]) {
      let last = 0;
      for (const c of SHIP_CLASSES) {
        const s = figureheadScale(id, c.L, c.W);
        expect(s).toBeGreaterThanOrEqual(0.55);
        expect(s).toBeLessThanOrEqual(2.2);
        expect(s * FIGUREHEAD_DEFS[id].halfW, `${id} auf ${c.id}`).toBeLessThanOrEqual(c.W * 0.55 + 1e-6 + (s === 0.55 ? 10 : 0));
        expect(s).toBeGreaterThanOrEqual(last - 1e-9);
        last = s;
      }
    }
  });
});

describe('Tuchflaggen', () => {
  it('Tuchnetz: 32 × 20 Stücke, Gewicht 0 am Mast und 1 an der freien Kante, Schwalbenschwanz kürzt die Mitte', () => {
    const g = clothGeometry({ len: 2, height: 1.2, taper: 0.2, swallow: 0.3 });
    const pos = g.getAttribute('position'), fl = g.getAttribute('aFlag');
    expect(pos.count).toBe(33 * 21);
    let maxX = 0, midMax = 0, edgeMax = 0;
    for (let i = 0; i < pos.count; i++) {
      expect(fl.getX(i)).toBeGreaterThanOrEqual(0);
      expect(fl.getX(i)).toBeLessThanOrEqual(1.0000001);
      maxX = Math.max(maxX, pos.getX(i));
      if (Math.abs(pos.getY(i)) < 0.02) midMax = Math.max(midMax, pos.getX(i));
      if (Math.abs(pos.getY(i)) > 0.4) edgeMax = Math.max(edgeMax, pos.getX(i));
    }
    expect(maxX).toBeCloseTo(2, 5);
    expect(midMax).toBeLessThan(edgeMax - 0.3);
    // verjüngt: die Kante an der freien Seite ist niedriger als am Mast
    let hHoist = 0, hFree = 0;
    for (let i = 0; i < pos.count; i++) { if (pos.getX(i) < 1e-6) hHoist = Math.max(hHoist, pos.getY(i)); if (Math.abs(pos.getX(i) - edgeMax) < 1e-6) hFree = Math.max(hFree, pos.getY(i)); }
    expect(hFree).toBeLessThan(hHoist);
  });

  const flag = (): ClothFlag => ({ mesh: null as never, mat: null as never, u: makeClothUniforms(2, 1.2), ang: 0, ph: 0 });

  it('Flaute: schlaff, Wind und Fahrt: gestreckt', () => {
    const calm = flag();
    for (let i = 0; i < 300; i++) updateClothFlag(calm, 1 / 60, 0, 0, 0, 0);
    const blow = flag();
    for (let i = 0; i < 300; i++) updateClothFlag(blow, 1 / 60, 0, Math.PI, 1.2, 8);
    expect(calm.u.uFK.value).toBeLessThan(0.3);
    expect(blow.u.uFK.value).toBeGreaterThan(0.9);
  });

  it('Phase läuft mit der Steifheit weiter, nie rückwärts, und alle Werte bleiben endlich', () => {
    const f = flag();
    let last = f.ph;
    for (let i = 0; i < 600; i++) {
      updateClothFlag(f, 1 / 60, i * 0.01, 0.6, 0.5 + Math.sin(i * 0.05), 5 + Math.sin(i * 0.02) * 5);
      expect(f.ph).toBeGreaterThanOrEqual(last);
      last = f.ph;
      for (const v of [f.u.uFK.value, f.u.uFAng.value, f.u.uFPh.value]) expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(f.u.uFAng.value)).toBeLessThanOrEqual(1.35 + 1e-9);
    }
  });

  it('Rückenwind (Wind weht in Fahrtrichtung, Schiff ist schneller): die Flagge streckt sich nach achtern und schwenkt nicht seitlich', () => {
    const f = flag();
    for (let i = 0; i < 400; i++) updateClothFlag(f, 1 / 60, 0.5, 0.5, 0.5, 14);
    expect(Math.abs(f.u.uFAng.value)).toBeLessThan(0.2);
    expect(f.u.uFK.value).toBeGreaterThan(0.6);
  });

  it('Seitenwind schwenkt das Tuch um den Mast auf die Leeseite', () => {
    const a = flag(), b = flag();
    // Schiff steht, Kurs Norden (0): Wind nach Osten (π/2) bzw. Westen (−π/2)
    for (let i = 0; i < 400; i++) { updateClothFlag(a, 1 / 60, 0, Math.PI / 2, 1.0, 0); updateClothFlag(b, 1 / 60, 0, -Math.PI / 2, 1.0, 0); }
    expect(a.u.uFAng.value).toBeGreaterThan(0.8);
    expect(b.u.uFAng.value).toBeLessThan(-0.8);
  });
});
