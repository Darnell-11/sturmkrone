/**
 * Schalter für die zweite Fassung der Schiffe („Schiffe 2“): neuer Rumpf, Heckgalerie, Galion, prunkvolle Kajüten.
 * Seit 2.9.74 überall standardmäßig an (auch auf der veröffentlichten Seite). Mit `?schiffe2=aus` am Ende der Adresse
 * schaltet man auf die bisherige Fassung zurück, mit `?schiffe2` wieder ein (der Browser merkt sich die Wahl).
 */
const KEY = 'sturmkrone2-schiffe2';
let value: boolean | null = null;

export function ships2(): boolean {
  if (value !== null) return value;
  let on = true;
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
