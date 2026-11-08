import type { BufferGeometry } from 'three';
import { markShared } from './dispose';

/**
 * Gemeinsame Netze für kurzlebige Effekte: gleiche Maße ergeben dasselbe Netz.
 * So entsteht bei Treffern und Fähigkeiten kein neues Netz (keine Rechenarbeit, kein neuer Grafikspeicher),
 * und die Netze werden beim Entfernen des Effekts nicht freigegeben.
 */
const cache = new Map<string, BufferGeometry>();

export function sharedGeo(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = markShared(make());
    cache.set(key, g);
  }
  return g;
}

/** Maß auf ein Raster runden, damit sich wenige Netze viele Effekte teilen (Unterschied ist unsichtbar) */
export const q = (v: number, step = 0.05) => Math.max(step, Math.round(v / step) * step);
