import type { KeyValueStore } from '../storage';
import { LEGACY_KEY } from './legacy';
import { migrateSave, type MigrationResult } from './migrations';
import type { SaveData } from './types';

export const SLOT_COUNT = 3;
const EXPORT_FORMAT = 'sturmkrone-spielstand';

const slotKey = (slot: number) => `sturmkrone2-slot-${slot}`;
const backupKey = (slot: number) => `sturmkrone2-slot-${slot}-backup`;

export interface SlotInfo {
  slot: number;
  data: SaveData | null;
  /** Gesetzt, wenn im Platz etwas liegt, das sich nicht lesen ließ */
  error?: string;
}

export class SaveManager {
  constructor(private store: KeyValueStore, private gameVersion: string) {}

  private read(key: string): MigrationResult | null {
    const text = this.store.getItem(key);
    if (text === null) return null;
    try {
      return migrateSave(JSON.parse(text), this.gameVersion);
    } catch {
      return { ok: false, error: 'Der Spielstand ist beschädigt.' };
    }
  }

  /** Lädt einen Platz. Ist der Hauptstand kaputt, wird die Sicherung versucht. */
  load(slot: number): SlotInfo {
    const main = this.read(slotKey(slot));
    if (main?.ok) return { slot, data: main.data };
    const backup = this.read(backupKey(slot));
    if (backup?.ok) return { slot, data: backup.data, error: main ? 'Hauptstand beschädigt – Sicherung geladen.' : undefined };
    if (!main) return { slot, data: null };
    return { slot, data: null, error: main.error };
  }

  list(): SlotInfo[] {
    return Array.from({ length: SLOT_COUNT }, (_, i) => this.load(i + 1));
  }

  save(slot: number, data: SaveData, now = Date.now()): boolean {
    data.meta.updated = now;
    data.meta.gameVersion = this.gameVersion;
    try {
      const prev = this.store.getItem(slotKey(slot));
      if (prev !== null) this.store.setItem(backupKey(slot), prev);
      this.store.setItem(slotKey(slot), JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  delete(slot: number) {
    this.store.removeItem(slotKey(slot));
    this.store.removeItem(backupKey(slot));
  }

  exportJson(data: SaveData): string {
    return JSON.stringify({ format: EXPORT_FORMAT, exported: new Date().toISOString(), data }, null, 2);
  }

  /** Nimmt eine exportierte Datei, einen rohen 2.0-Stand oder einen 1.0-Stand an. */
  importJson(text: string): MigrationResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'Die Datei ist keine gültige Spielstand-Datei.' };
    }
    if (parsed && typeof parsed === 'object' && (parsed as any).format === EXPORT_FORMAT) parsed = (parsed as any).data;
    return migrateSave(parsed, this.gameVersion);
  }

  /** Spielstand aus Sturmkrone 1.0 auf derselben Web-Adresse, falls vorhanden. */
  findLegacy(): SaveData | null {
    const r = this.read(LEGACY_KEY);
    return r?.ok ? r.data : null;
  }
}
