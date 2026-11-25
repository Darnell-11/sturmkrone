import type { ActionId } from '../data/actions';
import { QUALITY_IDS, type QualityTier } from '../data/qualityTiers';
import type { KeyValueStore } from './storage';
import { unitOr } from './sanitize';
import { clamp } from './mathUtil';

// Einstellungen gehören zum Gerät, nicht zum Spielstand.
export const SETTINGS_KEY = 'sturmkrone2-settings';

export interface Settings {
  version: 1;
  /** null = noch nicht ermittelt */
  quality: QualityTier | null;
  qualityAuto: boolean;
  /** Dynamische Auflösung: bei Rucklern kurzzeitig mit weniger Pixeln rechnen */
  dynamicResolution: boolean;
  volume: { master: number; music: number; sfx: number; ambient: number; voice: number };
  /** Klang anhalten, wenn Tab oder Fenster den Fokus verlieren */
  muteWhenUnfocused: boolean;
  textScale: number;
  showFps: boolean;
  /** Größe aller Anzeigen im Spiel (HUD), 0,8 … 1,4 */
  hudScale: number;
  /** Sektor- und Titeleinblendung beim Überqueren einer Grenze */
  sectorBanner: boolean;
  /** Schadenszahlen über den Gegnern */
  damageNumbers: boolean;
  /** Stärke der Kamera-Erschütterung bei Treffern, Salven und Rammstößen (0 … 1; 0 = aus) */
  camShake: number;
  /** 4.6G: Aura der Endgame-Ausrüstung (Teilchen und Leuchten der Säume, 0 … 1; im Kampf stärker) */
  gearAura: number;
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
    dynamicResolution: true,
    volume: { master: 0.8, music: 0.7, sfx: 0.8, ambient: 0.6, voice: 0.8 },
    muteWhenUnfocused: true,
    textScale: 1,
    showFps: false,
    hudScale: 1,
    sectorBanner: true,
    damageNumbers: true,
    camShake: 1,
    gearAura: 0.7,
    colorblind: false,
    touchControls: 'auto',
    invertLookY: false,
    keyBindings: {},
  };
}


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
    dynamicResolution: typeof r.dynamicResolution === 'boolean' ? r.dynamicResolution : d.dynamicResolution,
    volume: {
      master: unitOr(vol.master, d.volume.master),
      music: unitOr(vol.music, d.volume.music),
      sfx: unitOr(vol.sfx, d.volume.sfx),
      ambient: unitOr(vol.ambient, d.volume.ambient),
      voice: unitOr(vol.voice, d.volume.voice),
    },
    muteWhenUnfocused: typeof r.muteWhenUnfocused === 'boolean' ? r.muteWhenUnfocused : d.muteWhenUnfocused,
    textScale: [1, 1.15, 1.3].includes(r.textScale) ? r.textScale : 1,
    showFps: typeof r.showFps === 'boolean' ? r.showFps : d.showFps,
    hudScale: typeof r.hudScale === 'number' && Number.isFinite(r.hudScale) ? clamp(r.hudScale, 0.8, 1.4) : d.hudScale,
    sectorBanner: typeof r.sectorBanner === 'boolean' ? r.sectorBanner : d.sectorBanner,
    damageNumbers: typeof r.damageNumbers === 'boolean' ? r.damageNumbers : d.damageNumbers,
    camShake: typeof r.camShake === 'number' && Number.isFinite(r.camShake) ? clamp(r.camShake, 0, 1) : d.camShake,
    gearAura: typeof r.gearAura === 'number' && Number.isFinite(r.gearAura) ? clamp(r.gearAura, 0, 1) : d.gearAura,
    colorblind: typeof r.colorblind === 'boolean' ? r.colorblind : false,
    touchControls: ['auto', 'on', 'off'].includes(r.touchControls) ? r.touchControls : 'auto',
    invertLookY: typeof r.invertLookY === 'boolean' ? r.invertLookY : false,
    keyBindings: r.keyBindings && typeof r.keyBindings === 'object' ? r.keyBindings : {},
  };
}

/** Welche Einstellungen zu welchem Reiter des Einstellungsmenüs gehören (für „Zurücksetzen“) */
export type SettingsTab = 'grafik' | 'steuerung' | 'ton' | 'anzeige';
export const SETTINGS_TAB_KEYS: Record<SettingsTab, (keyof Settings)[]> = {
  grafik: ['quality', 'qualityAuto', 'dynamicResolution'],
  steuerung: ['touchControls', 'invertLookY', 'keyBindings'],
  ton: ['volume', 'muteWhenUnfocused'],
  anzeige: ['textScale', 'showFps', 'colorblind', 'hudScale', 'sectorBanner', 'damageNumbers', 'camShake', 'gearAura'],
};

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

  /** Die Einstellungen eines Reiters auf den Standard zurücksetzen */
  reset(tab: SettingsTab) {
    const d = defaultSettings();
    this.update(Object.fromEntries(SETTINGS_TAB_KEYS[tab].map((k) => [k, d[k]])) as Partial<Settings>);
  }

  onChange(l: (s: Settings) => void) { this.listeners.push(l); }

  private persist() {
    try { this.store.setItem(SETTINGS_KEY, JSON.stringify(this.data)); } catch { /* Speicher voll oder gesperrt */ }
  }
}
