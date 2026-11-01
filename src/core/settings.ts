import type { ActionId } from '../data/actions';
import { QUALITY_IDS, type QualityTier } from '../data/qualityTiers';
import type { KeyValueStore } from './storage';

// Einstellungen gehören zum Gerät, nicht zum Spielstand.
export const SETTINGS_KEY = 'sturmkrone2-settings';

export interface Settings {
  version: 1;
  /** null = noch nicht ermittelt */
  quality: QualityTier | null;
  qualityAuto: boolean;
  volume: { master: number; music: number; sfx: number; ambient: number; voice: number };
  textScale: number;
  showFps: boolean;
  /** Farbenblind-freundliche Farben und Formen */
  colorblind: boolean;
  touchControls: 'auto' | 'on' | 'off';
  invertLookY: boolean;
  /** Nur Abweichungen von der Standardbelegung */
  keyBindings: Partial<Record<ActionId, string[]>>;
}

export function defaultSettings(): Settings {
  return {
    version: 1,
    quality: null,
    qualityAuto: true,
    volume: { master: 0.8, music: 0.7, sfx: 0.8, ambient: 0.6, voice: 0.8 },
    textScale: 1,
    showFps: false,
    colorblind: false,
    touchControls: 'auto',
    invertLookY: false,
    keyBindings: {},
  };
}

const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** Liest gespeicherte Einstellungen und füllt fehlende oder kaputte Werte mit Standardwerten. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, any>;
  const vol = r.volume && typeof r.volume === 'object' ? r.volume : {};
  return {
    version: 1,
    quality: QUALITY_IDS.includes(r.quality) ? r.quality : null,
    qualityAuto: typeof r.qualityAuto === 'boolean' ? r.qualityAuto : d.qualityAuto,
    volume: {
      master: clamp01(vol.master, d.volume.master),
      music: clamp01(vol.music, d.volume.music),
      sfx: clamp01(vol.sfx, d.volume.sfx),
      ambient: clamp01(vol.ambient, d.volume.ambient),
      voice: clamp01(vol.voice, d.volume.voice),
    },
    textScale: [1, 1.15, 1.3].includes(r.textScale) ? r.textScale : 1,
    showFps: typeof r.showFps === 'boolean' ? r.showFps : d.showFps,
    colorblind: typeof r.colorblind === 'boolean' ? r.colorblind : false,
    touchControls: ['auto', 'on', 'off'].includes(r.touchControls) ? r.touchControls : 'auto',
    invertLookY: typeof r.invertLookY === 'boolean' ? r.invertLookY : false,
    keyBindings: r.keyBindings && typeof r.keyBindings === 'object' ? r.keyBindings : {},
  };
}

export class SettingsStore {
  data: Settings;
  private listeners: ((s: Settings) => void)[] = [];

  constructor(private store: KeyValueStore) {
    let raw: unknown = null;
    try { raw = JSON.parse(store.getItem(SETTINGS_KEY) ?? 'null'); } catch { raw = null; }
    this.data = sanitizeSettings(raw);
  }

  update(patch: Partial<Settings>) {
    this.data = { ...this.data, ...patch };
    this.persist();
    for (const l of this.listeners) l(this.data);
  }

  onChange(l: (s: Settings) => void) { this.listeners.push(l); }

  private persist() {
    try { this.store.setItem(SETTINGS_KEY, JSON.stringify(this.data)); } catch { /* Speicher voll oder gesperrt */ }
  }
}
