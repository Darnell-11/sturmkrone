// Vorläufige Wellenfunktion für die Testszene. In Meilenstein 1 ersetzt durch Gerstner-Wellen.
export function waveHeight(x: number, z: number, t: number): number {
  return (
    0.55 * Math.sin(x * 0.045 + t * 1.1) +
    0.4 * Math.sin(z * 0.06 - t * 0.9 + x * 0.02) +
    0.22 * Math.sin((x + z) * 0.09 + t * 1.7)
  );
}

/** Einfacher, reproduzierbarer Zufallsgenerator (gleicher Startwert → gleiche Welt). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
