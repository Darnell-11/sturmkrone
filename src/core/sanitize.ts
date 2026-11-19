// Unbekannte Werte aus Spielständen, Einstellungen und Importdateien prüfen: eine Stelle statt eigener Lambdas in legacy, migrations,
// settings und occupation.
import { clamp01 } from './mathUtil';

/** Einfaches Objekt (kein Array, kein null) */
export const isRecord = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Endliche Zahl, sonst der Standardwert */
export const finiteOr = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Endliche Zahl, sonst null */
export const finiteOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Ganze Zahl (abgerundet) von 0 bis max, sonst der Standardwert */
export const countOr = (v: unknown, d: number, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : d);

/** Anteil von 0 bis 1, sonst der Standardwert */
export const unitOr = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : d);
