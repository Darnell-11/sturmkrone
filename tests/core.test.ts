import { describe, expect, it } from 'vitest';
import { GameLoop } from '../src/core/loop';
import { defaultSettings, sanitizeSettings, SettingsStore, SETTINGS_KEY } from '../src/core/settings';
import { MemoryStore } from '../src/core/storage';
import { detectTier, gpuMasked, needsBench, prettyGpu, type DeviceInfo } from '../src/render/quality';

describe('Spielschleife', () => {
  it('läuft mit festen Schritten unabhängig von der Bildrate', () => {
    let steps = 0;
    const loop = new GameLoop({ update: () => steps++, render: () => {} });
    for (let i = 0; i < 30; i++) loop.advance(1 / 30); // 30 fps, 1 Sekunde
    expect(steps).toBeGreaterThanOrEqual(59);
    expect(steps).toBeLessThanOrEqual(60);
    steps = 0;
    for (let i = 0; i < 144; i++) loop.advance(1 / 144); // 144 fps, 1 Sekunde
    expect(steps).toBeGreaterThanOrEqual(59);
    expect(steps).toBeLessThanOrEqual(61);
  });

  it('holt nach langen Pausen keine Zeit nach', () => {
    let steps = 0;
    const loop = new GameLoop({ update: () => steps++, render: () => {} });
    loop.advance(5);
    expect(steps).toBeLessThanOrEqual(8);
  });

  it('timeScale verlangsamt die Spielzeit', () => {
    let steps = 0;
    const loop = new GameLoop({ update: () => steps++, render: () => {} });
    loop.timeScale = 0.5;
    for (let i = 0; i < 60; i++) loop.advance(1 / 60);
    expect(steps).toBeGreaterThanOrEqual(29);
    expect(steps).toBeLessThanOrEqual(31);
  });
});

describe('Einstellungen', () => {
  it('kennt die Stufe Ultra', () => {
    expect(sanitizeSettings({ quality: 'ultra' }).quality).toBe('ultra');
  });

  it('ersetzt kaputte Werte durch Standardwerte', () => {
    const s = sanitizeSettings({ quality: 'extrem', volume: { music: 7, sfx: 'laut' }, textScale: 99, touchControls: 'vielleicht' });
    expect(s.quality).toBeNull();
    expect(s.volume.music).toBe(1);
    expect(s.volume.sfx).toBe(defaultSettings().volume.sfx);
    expect(s.textScale).toBe(1);
    expect(s.touchControls).toBe('auto');
  });

  it('werden gespeichert und wieder gelesen', () => {
    const store = new MemoryStore();
    new SettingsStore(store).update({ quality: 'high', qualityAuto: false, showFps: true });
    expect(JSON.parse(store.getItem(SETTINGS_KEY)!).quality).toBe('high');
    const again = new SettingsStore(store);
    expect(again.data.quality).toBe('high');
    expect(again.data.qualityAuto).toBe(false);
    expect(again.data.showFps).toBe(true);
  });
});

describe('Grafikstufen-Erkennung', () => {
  it('kürzt Grafikchip-Namen', () => {
    expect(prettyGpu('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('Intel Iris Xe Graphics');
    expect(prettyGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('NVIDIA GeForce RTX 4070');
    expect(prettyGpu('Apple GPU')).toBe('Apple GPU');
    expect(prettyGpu('')).toBe('unbekannte Grafik');
  });

  const base: DeviceInfo = { mobile: false, gpu: '', dpr: 1, memoryGb: 8, cores: 8, webgl2: true };
  const tier = (p: Partial<DeviceInfo>) => detectTier({ ...base, ...p }).tier;

  it('wählt passende Stufen', () => {
    expect(tier({ gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)' })).toBe('max');
    expect(tier({ gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti Direct3D11)' })).toBe('ultra');
    expect(tier({ gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11)' })).toBe('ultra');
    expect(tier({ gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)' })).toBe('max');
    expect(tier({ gpu: 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11)' })).toBe('high');
    expect(tier({ gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)' })).toBe('mid');
    expect(tier({ gpu: 'Google SwiftShader' })).toBe('low');
    expect(tier({ webgl2: false })).toBe('low');
    expect(tier({ mobile: true, gpu: 'Adreno (TM) 660' })).toBe('mid');
    expect(tier({ mobile: true, gpu: 'Mali-G52' })).toBe('low');
    expect(tier({ mobile: true, gpu: 'Adreno (TM) 750', memoryGb: 8 })).toBe('high');
    expect(tier({ mobile: true, gpu: 'Apple GPU', memoryGb: null })).toBe('mid');
    expect(tier({ mobile: true, gpu: 'Adreno (TM) 660', memoryGb: 2 })).toBe('low');
  });

  it('misst die Leistung, wenn der Browser den Namen verbirgt', () => {
    const ff = 'ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar';
    expect(gpuMasked(ff)).toBe(true);
    expect(gpuMasked('WebKit WebGL')).toBe(true);
    expect(gpuMasked('')).toBe(true);
    expect(gpuMasked('ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti Direct3D11)')).toBe(false);
    expect(needsBench({ ...base, gpu: ff })).toBe(true);
    expect(needsBench({ ...base, gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11)' })).toBe(false);
    expect(needsBench({ ...base, gpu: 'Google SwiftShader' })).toBe(false);
    // RTX 5070 Ti misst ≈ 0,1 ms je Durchgang
    expect(detectTier({ ...base, gpu: ff }, 0.1).tier).toBe('ultra');
    expect(detectTier({ ...base, gpu: ff }, 0.3).tier).toBe('max');
    expect(detectTier({ ...base, gpu: 'WebKit WebGL' }, 5).tier).toBe('mid');
    expect(detectTier({ ...base, gpu: 'WebKit WebGL', mobile: true }, 0.1).tier).toBe('high');
    // so langsam, dass nur Software-Grafik in Frage kommt
    const sw = detectTier({ ...base, gpu: 'WebKit WebGL' }, 200);
    expect(sw.tier).toBe('low');
    expect(sw.software).toBe(true);
    expect(detectTier({ ...base, gpu: 'Google SwiftShader' }).software).toBe(true);
  });
});
