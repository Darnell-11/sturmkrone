// Phase 4.4C: Meer (Küstentiefe, Kleinwellen, Streuung), Tageszeiten, Regions-Atmosphäre, Belichtung und Grafikstufen.
import { DataTexture, ShaderLib } from 'three';
import { describe, expect, it } from 'vitest';
import { OCEAN_DEPTH, SEA_COLOR_GLSL, seaColorAt, seaDepthAt, seaWeights, type SeaColors } from '../src/data/oceanLook';
import { QUALITY_TIERS, RENDER_LOOK } from '../src/data/qualityTiers';
import { TIME_KEYS } from '../src/data/world';
import { createPalette, DAY_PHASES, dayPhase, phaseWeights, samplePalette, type DayPhase } from '../src/world/timeOfDay';
import { ATMO_SPOTS, atmosphereAt, createAtmoState, REGION_ATMO, sectorWeight, SECTOR_FEATHER } from '../src/world/regionAtmosphere';
import { Ocean } from '../src/world/ocean';
import { forgeKindSize, FORGE_KINDS, FORGE_RECIPES } from '../src/graphics/forgeMaps';

const blank = () => { const t = new DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); t.needsUpdate = true; return t; };

describe('Küstentiefe und Wasserfarbe (data/oceanLook.ts)', () => {
  it('die Tiefe wächst mit dem Küstenabstand; flache Lagunen bleiben unter 6 m', () => {
    let prev = -1;
    for (let sd = 0; sd <= 255; sd++) {
      const d = seaDepthAt(sd);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    expect(seaDepthAt(0)).toBeLessThan(0.5);
    expect(seaDepthAt(40)).toBeLessThan(6);
    expect(seaDepthAt(255)).toBeGreaterThan(30);
    // Sandbänke machen das Wasser flacher, nie negativ
    expect(seaDepthAt(60, 1)).toBeLessThan(seaDepthAt(60));
    expect(seaDepthAt(60, 1)).toBeGreaterThan(0);
  });

  it('Gewichte der fünf Farben ergeben überall 1 und laufen von Lagune über Türkis und Azur zu Tiefblau und Kobalt', () => {
    for (let sd = 0; sd <= 255; sd += 3) {
      const w = seaWeights(seaDepthAt(sd), sd);
      expect(w.lagoon + w.shallow + w.mid + w.deep + w.abyss).toBeCloseTo(1, 6);
    }
    expect(seaWeights(seaDepthAt(0), 0).lagoon).toBeGreaterThan(0.9);
    // Türkis vorherrschend zwischen ~2,6 und ~5 m
    const tq = seaWeights(4, 70);
    expect(tq.shallow).toBeGreaterThan(Math.max(tq.lagoon, tq.mid, tq.deep, tq.abyss));
    expect(seaWeights(seaDepthAt(255), 255).abyss).toBeGreaterThan(0.99);
  });

  it('Farbverlauf: Smaragd an der Küste, Kobalt auf offener See, stetig dazwischen', () => {
    const cols: SeaColors = { lagoon: [0.1, 0.8, 0.6], shallow: [0.2, 0.83, 0.75], mid: [0.05, 0.58, 0.79], deep: [0.04, 0.42, 0.65], abyss: [0.03, 0.15, 0.45] };
    expect(seaColorAt(0, cols)).toEqual(cols.lagoon.map((v) => expect.closeTo(v, 2)));
    expect(seaColorAt(255, cols).map((v) => +v.toFixed(3))).toEqual(cols.abyss);
    // stetig: kein Sprung über 0,08 je Meter Küstenabstand
    let prev = seaColorAt(0, cols).slice();
    for (let sd = 1; sd <= 255; sd++) {
      const c = seaColorAt(sd, cols);
      for (let k = 0; k < 3; k++) expect(Math.abs(c[k] - prev[k])).toBeLessThan(0.08);
      prev = c.slice();
    }
    // Grün nimmt nach außen ab (Lagune → Kobalt)
    expect(seaColorAt(0, cols)[1]).toBeGreaterThan(seaColorAt(120, cols)[1]);
    expect(seaColorAt(120, cols)[1]).toBeGreaterThan(seaColorAt(255, cols)[1]);
  });

  it('der Meeres-Shader nutzt dieselben Zahlen wie die CPU-Rechnung', () => {
    for (const r of Object.values(OCEAN_DEPTH)) for (const v of r) expect(SEA_COLOR_GLSL).toContain(v.toFixed(4));
    const ocean = new Ocean();
    ocean.uniforms.uWaterN.value = blank();
    const mat = ocean.mesh.material as unknown as { onBeforeCompile: (s: unknown, r: unknown) => void; customProgramCacheKey: () => string };
    const sh = { uniforms: {} as Record<string, unknown>, vertexShader: ShaderLib.toon.vertexShader, fragmentShader: ShaderLib.toon.fragmentShader };
    mat.onBeforeCompile(sh, undefined);
    expect(sh.fragmentShader).toContain(SEA_COLOR_GLSL.trim().split('\n')[0].trim());
    expect(sh.fragmentShader).toContain('uniform sampler2D uWaterN;');
    expect(sh.fragmentShader).toContain('uSss');
    expect(sh.uniforms.uLagoon).toBeDefined();
    expect(sh.uniforms.uAbyss).toBeDefined();
  });
});

describe('Wasser-Mikrowellen aus der Schmiede', () => {
  it('eigener Satz mit Normalkarte über UV, ab Mittel in 1024 px', () => {
    expect(FORGE_KINDS).toContain('wasser');
    expect(FORGE_RECIPES.wasser.uvNormal).toBe(true);
    expect(forgeKindSize('wasser', 512)).toBe(1024);
    expect(forgeKindSize('wasser', 1024)).toBe(1024);
    expect(forgeKindSize('wasser', 256)).toBe(512);
    expect(forgeKindSize('stahl', 512)).toBe(512);
  });
});

describe('Grafikstufen: Meer und Nachbearbeitung', () => {
  it('Niedrig und Mittel ohne Nachbearbeitung, ab Hoch selektiver Bloom mit hoher Schwelle und geringer Stärke', () => {
    expect(QUALITY_TIERS.low.post.enabled).toBe(false);
    expect(QUALITY_TIERS.mid.post.enabled).toBe(false);
    for (const t of ['high', 'max', 'ultra'] as const) {
      expect(QUALITY_TIERS[t].post.enabled).toBe(true);
      expect(QUALITY_TIERS[t].post.bloom).toBe(true);
    }
    expect(RENDER_LOOK.bloom.threshold).toBeGreaterThanOrEqual(1.05);
    expect(RENDER_LOOK.bloom.intensity).toBeLessThanOrEqual(1);
    expect(RENDER_LOOK.bloom.radius).toBeGreaterThanOrEqual(0.8);
  });

  it('Stufenwechsel am Meer: alte Geometrie und (bei anderer Kielwasser-Länge) altes Material werden freigegeben', () => {
    const ocean = new Ocean();
    ocean.uniforms.uWaterN.value = blank();
    let geoGone = 0, matGone = 0;
    const g0 = ocean.mesh.geometry;
    g0.addEventListener('dispose', () => geoGone++);
    const m0 = ocean.mesh.material as unknown as { addEventListener: (t: string, f: () => void) => void };
    m0.addEventListener('dispose', () => matGone++);
    ocean.setDetail(0.5, 8);  // Niedrig: andere Kielwasser-Länge → neues Material
    expect(geoGone).toBe(1);
    expect(matGone).toBe(1);
    expect(ocean.uniforms.uWaterK.value).toBe(0);
    expect(ocean.uniforms.uSss.value).toBe(0);
    ocean.setDetail(0.75, 8); // Mittel: eine Lage Kleinwellen, keine Kamm-Streuung
    expect(ocean.uniforms.uWaterK.value).toBe(0.5);
    expect(ocean.uniforms.uSss.value).toBe(0);
    ocean.setDetail(1.6, 32); // Ultra: volle Kleinwellen und Streuung
    expect(ocean.uniforms.uWaterK.value).toBe(1);
    expect(ocean.uniforms.uSss.value).toBe(1);
  });

  it('Farben, Tageszeit und Region ändern nur Uniforms: kein neues Programm, keine neue Materialfassung', () => {
    const ocean = new Ocean();
    ocean.uniforms.uWaterN.value = blank();
    ocean.setDetail(1, 16);
    const mat = ocean.mesh.material as unknown as { version: number; customProgramCacheKey: () => string };
    const key = mat.customProgramCacheKey(), ver = mat.version;
    const u = ocean.uniforms;
    for (let i = 0; i < 50; i++) {
      u.uLagoon.value.setRGB(0.1, 0.8, 0.6 + i * 0.001);
      u.uAbyss.value.setRGB(0.03, 0.15, 0.45);
      u.uDeep.value.setRGB(0.05, 0.3, 0.5);
      u.uWaveScale.value = 0.9 + i * 0.03;
      u.uSunDir.value.set(Math.sin(i), 0.5, Math.cos(i)).normalize();
    }
    ocean.setDetail(1.25, 16); // gleiche Kielwasser-Länge: nur Werte
    expect(mat.customProgramCacheKey()).toBe(key);
    expect(mat.version).toBe(ver);
    expect(ocean.mesh.material).toBe(mat);
  });
});

describe('Tageszeiten (vier Phasen, weiche Übergänge)', () => {
  it('die Schlüssel enthalten Morgengrauen, Goldene Stunde und Mondnacht mit silbrigem Licht', () => {
    const names = TIME_KEYS.map((k) => k.name);
    for (const n of ['Morgengrauen', 'Mittag', 'Goldene Stunde', 'Abendrot', 'Mondnacht']) expect(names).toContain(n);
    const night = TIME_KEYS.find((k) => k.name === 'Mondnacht')!;
    const r = (night.light >> 16) & 255, g = (night.light >> 8) & 255, b = night.light & 255;
    // silbrig: bläulich, aber nicht gesättigt (Rot mindestens 70 % von Blau)
    expect(b).toBeGreaterThan(r);
    expect(r / b).toBeGreaterThan(0.7);
    expect(g / b).toBeGreaterThan(0.75);
    // Schlüssel aufsteigend sortiert
    for (let i = 1; i < TIME_KEYS.length; i++) expect(TIME_KEYS[i].h).toBeGreaterThan(TIME_KEYS[i - 1].h);
  });

  it('Phasen-Anteile: Summe 1, vorherrschende Phase stimmt, stetig über den ganzen Tag', () => {
    const w = { morgengrauen: 0, mittag: 0, goldeneStunde: 0, nacht: 0 } as Record<DayPhase, number>;
    const prev = { ...w };
    for (let m = 0; m <= 24 * 60; m++) {
      phaseWeights(m / 60, w);
      let sum = 0;
      for (const p of DAY_PHASES) { sum += w[p]; expect(w[p]).toBeGreaterThanOrEqual(0); }
      expect(sum).toBeCloseTo(1, 6);
      if (m > 0) for (const p of DAY_PHASES) expect(Math.abs(w[p] - prev[p])).toBeLessThan(0.02);
      Object.assign(prev, w);
    }
    expect(dayPhase(5.8)).toBe('morgengrauen');
    expect(dayPhase(12.5)).toBe('mittag');
    expect(dayPhase(17.9)).toBe('goldeneStunde');
    expect(dayPhase(0.5)).toBe('nacht');
    expect(dayPhase(23)).toBe('nacht');
  });

  it('Farbstimmung stetig: keine Sprünge zwischen zwei Minuten (Himmel, Licht, Meer)', () => {
    const a = createPalette(), b = createPalette();
    for (let m = 0; m < 24 * 60; m++) {
      samplePalette(m / 60, a);
      samplePalette((m + 1) / 60, b);
      for (const k of ['zenith', 'horizon', 'light', 'seaDeep', 'seaShallow'] as const) {
        expect(Math.abs(a[k].r - b[k].r) + Math.abs(a[k].g - b[k].g) + Math.abs(a[k].b - b[k].b)).toBeLessThan(0.06);
      }
      expect(Math.abs(a.lightI - b.lightI)).toBeLessThan(0.05);
    }
  });

  it('Belichtung je Phase: Mittag knapper (Kreide, Segel), Nacht offener; weich gemischt', () => {
    const e = RENDER_LOOK.phaseExposure;
    expect(e.mittag).toBeLessThan(1);
    expect(e.nacht).toBeGreaterThan(1);
    const w = { morgengrauen: 0, mittag: 0, goldeneStunde: 0, nacht: 0 } as Record<DayPhase, number>;
    let prev = -1;
    for (let m = 0; m <= 24 * 60; m += 5) {
      phaseWeights(m / 60, w);
      let x = 0;
      for (const p of DAY_PHASES) x += w[p] * e[p];
      if (prev >= 0) expect(Math.abs(x - prev)).toBeLessThan(0.01);
      prev = x;
    }
  });
});

describe('Regions-Atmosphäre', () => {
  it('die Bernsteinsee bleibt unverfälscht', () => {
    const s = atmosphereAt(0, 150, createAtmoState());
    expect(s.region).toBe('bernsteinsee');
    expect(s.skyK + s.fogK + s.lightK + s.glowK + s.seaK).toBe(0);
    expect(s.haze).toBe(1);
    expect(s.lightMul).toBe(1);
  });

  it('mitten im Sektor wirkt dessen Stimmung, an der Grenze mischen sich beide weich', () => {
    const s = createAtmoState();
    // seit 4.5C beginnt die Sektor-Stimmung hinter der Bernsteinsee (Ring 1 bis 2 800 m): Prüfpunkte in Ring 2
    atmosphereAt(0, 3800, s); // Norden: Nebelarchipel
    expect(s.region).toBe('nebel');
    expect(s.skyK).toBeCloseTo(REGION_ATMO.nebel.skyK, 2);
    expect(s.haze).toBeLessThan(0.9);
    atmosphereAt(-2800, -2800, s); // Südwesten: Sturmgürtel
    expect(s.region).toBe('sturm');
    expect(s.lightMul).toBeLessThan(0.9);
    // entlang eines Kreises über die Grenze bei 36° (Nebel → Nordwacht): keine Sprünge
    const a = createAtmoState(), b = createAtmoState();
    for (let deg = 20; deg < 52; deg += 0.5) {
      const r = (x: number) => (x * Math.PI) / 180;
      atmosphereAt(Math.sin(r(deg)) * 3800, Math.cos(r(deg)) * 3800, a);
      atmosphereAt(Math.sin(r(deg + 0.5)) * 3800, Math.cos(r(deg + 0.5)) * 3800, b);
      expect(Math.abs(a.skyK - b.skyK)).toBeLessThan(0.03);
      expect(Math.abs(a.haze - b.haze)).toBeLessThan(0.03);
      for (let k = 0; k < 3; k++) expect(Math.abs(a.sky[k] - b.sky[k])).toBeLessThan(0.06);
    }
    expect(sectorWeight(0, -36, 36)).toBe(1);
    expect(sectorWeight(36, -36, 36)).toBeCloseTo(0.5, 5);
    expect(sectorWeight(36 + SECTOR_FEATHER, -36, 36)).toBe(0);
  });

  it('Kurogane-Schlund wirft seinen Ascheschein weit über das Meer', () => {
    const spot = ATMO_SPOTS.find((s) => s.id === 'kuroganeschlund')!;
    expect(spot).toBeDefined();
    const s = atmosphereAt(spot.x, spot.z, createAtmoState());
    expect(s.region).toBe('kuroganeschlund');
    expect(s.glowK).toBeGreaterThan(0.4);
    expect(s.glow[0]).toBeGreaterThan(s.glow[2]);
    const far = atmosphereAt(spot.x + spot.r + spot.fade + 3000, spot.z, createAtmoState());
    expect(far.glowK).toBeLessThan(0.2);
  });

  it('schreibt in dasselbe Objekt (keine Zuweisungen je Bild)', () => {
    const s = createAtmoState();
    const sky = s.sky, fog = s.fog, glow = s.glow;
    for (let i = 0; i < 100; i++) atmosphereAt(Math.sin(i) * 4000, Math.cos(i) * 4000, s);
    expect(s.sky).toBe(sky);
    expect(s.fog).toBe(fog);
    expect(s.glow).toBe(glow);
  });
});
