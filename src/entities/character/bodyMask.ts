// BodyMaskingEngine: was von Kleidung vollständig verdeckt ist, wird nicht gezeichnet – Haut unter Stoff, Hemd unter
// Mantel, Schuh unter Stiefelschaft. Dort kann dann nichts mehr durchstechen oder flackern.
//
// Technik: Die Figur bekommt je Netz eine eigene Dreiecksliste ohne die verdeckten Dreiecke; alle Punktdaten bleiben mit
// der Vorlage geteilt. Ein Material, ein Zeichenaufruf – Treffer-Leuchten, Auflösen und Schatten laufen unverändert.
// Gleiche Kombinationen (viele NPCs tragen dasselbe) teilen sich eine Liste.
import { BufferAttribute } from 'three';
import { markShared } from '../../render/dispose';

/** Ein getragenes, deckendes Stück: Ebene (innen → außen) und die Hautpunkte, die es verdeckt (Saumrand schon abgezogen) */
export interface MaskLayer {
  key: string;
  level: number;
  /** je Hautpunkt 1 = verdeckt (geteilt, je Grundfigur einmal berechnet) */
  cover: Uint8Array;
}

/** Ein Netz, dessen verdeckte Dreiecke wegfallen sollen */
export interface MaskTarget {
  key: string;
  /** vollständige Dreiecksliste */
  index: BufferAttribute;
  /** je Dreieck drei Hautpunkte, zu denen seine Ecken gehören (−1 = keiner: bleibt immer sichtbar) */
  src: ArrayLike<number>;
  /** Ebene des Netzes oder je Dreieck (mehrere Stücke in einem Netz) */
  level: number | Uint8Array;
}

/** Ungenutzte Listen bleiben bis zu dieser Zahl im Speicher (die nächste Figur mit derselben Kleidung nimmt sie wieder) */
const KEEP = 64;

export class BodyMaskingEngine {
  private cache = new Map<string, { attr: BufferAttribute; users: number }>();
  private keyOf = new Map<BufferAttribute, string>();

  /**
   * Dreiecksliste des Netzes ohne verdeckte Dreiecke. Ein Dreieck fällt weg, wenn EIN Stück einer höheren Ebene alle
   * drei Ecken verdeckt (nie zwei Stücke gemeinsam – zwischen Ärmel und Handschuh bliebe sonst ein Loch).
   * Ist nichts verdeckt, kommt die ursprüngliche Liste zurück.
   */
  indexFor(target: MaskTarget, worn: readonly MaskLayer[]): BufferAttribute {
    const lv = target.level;
    let low = 255;
    if (typeof lv === 'number') low = lv; else for (let i = 0; i < lv.length; i++) if (lv[i] < low) low = lv[i];
    const layers = worn.filter((l) => l.level > low);
    if (!layers.length) return target.index;
    const key = `${target.key}<${layers.map((l) => l.key).sort().join(',')}`;
    const hit = this.cache.get(key);
    if (hit) { hit.users++; return hit.attr; }
    const idx = target.index, src = target.src, tris = idx.count / 3;
    const keep: number[] = [];
    for (let t = 0; t < tris; t++) {
      const a = src[t * 3], b = src[t * 3 + 1], c = src[t * 3 + 2];
      let hidden = false;
      if (a >= 0 && b >= 0 && c >= 0) {
        const tl = typeof lv === 'number' ? lv : lv[t];
        for (const l of layers) if (l.level > tl && l.cover[a] && l.cover[b] && l.cover[c]) { hidden = true; break; }
      }
      if (!hidden) keep.push(idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2));
    }
    if (keep.length === idx.count) return target.index;
    const big = idx.array instanceof Uint32Array;
    // geteilt: eine Figur gibt die Liste nie allein frei (siehe release)
    const attr = markShared(new BufferAttribute(big ? Uint32Array.from(keep) : Uint16Array.from(keep), 1));
    this.cache.set(key, { attr, users: 1 });
    this.keyOf.set(attr, key);
    return attr;
  }

  /**
   * Nutzung einer Liste beenden. Liefert true, wenn es die letzte war und die Liste verworfen wurde – dann lässt der
   * Aufrufer sie an seiner Geometrie, damit deren dispose() auch den Grafikspeicher der Liste freigibt.
   */
  release(attr: BufferAttribute | null): boolean {
    const key = attr ? this.keyOf.get(attr) : undefined;
    if (!attr || key === undefined) return false;
    const e = this.cache.get(key)!;
    if (--e.users > 0 || this.cache.size <= KEEP) return false;
    this.cache.delete(key);
    this.keyOf.delete(attr);
    return true;
  }

  /** Für Speicherproben: Zahl der Listen und der laufenden Nutzungen */
  get stats() {
    let users = 0;
    for (const e of this.cache.values()) users += e.users;
    return { lists: this.cache.size, users };
  }
}

const engines = new WeakMap<object, BodyMaskingEngine>();
/** Eine Engine je Grundfigur */
export function maskEngine(base: object): BodyMaskingEngine {
  let e = engines.get(base);
  if (!e) { e = new BodyMaskingEngine(); engines.set(base, e); }
  return e;
}
