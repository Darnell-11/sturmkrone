/**
 * Schalter für die zweite Fassung der Schiffe („Schiffe 2“): neuer Rumpf, Heckgalerie, Galion, prunkvolle Kajüten.
 * In der Entwicklung (`npm run dev`) standardmäßig an, auf der veröffentlichten Seite aus. Mit `?schiffe2` am Ende der Adresse
 * schaltet man sie ein, mit `?schiffe2=aus` aus (der Browser merkt sich die Wahl). So bleibt die bisherige Fassung erhalten.
 */
const KEY = 'sturmkrone2-schiffe2';
let value: boolean | null = null;

export function ships2(): boolean {
  if (value !== null) return value;
  let on = !!import.meta.env.DEV;
  try {
    const q = new URLSearchParams(location.search).get('schiffe2');
    if (q === 'aus') localStorage.setItem(KEY, '0');
    else if (q !== null) localStorage.setItem(KEY, '1');
    const s = localStorage.getItem(KEY);
    if (s !== null) on = s === '1';
  } catch { /* ohne Speicher: Standard */ }
  value = on;
  return on;
}

/** Zur Laufzeit umschalten (nur für Vergleiche in der Entwicklung); wirkt auf Schiffe, die danach gebaut werden */
export function setShips2(on: boolean) { value = on; }
