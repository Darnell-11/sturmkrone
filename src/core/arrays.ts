/**
 * Behält nur die Einträge, für die keep() true liefert – an Ort und Stelle, ohne neues Array.
 * Für Listen, die in jedem Logikschritt aufgeräumt werden (Geschosse, Effekte, Timer).
 */
export function keepIf<T>(arr: T[], keep: (v: T) => boolean): T[] {
  let n = 0;
  for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (keep(v)) arr[n++] = v; }
  arr.length = n;
  return arr;
}
