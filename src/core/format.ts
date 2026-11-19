// Anzeige-Formate (Deutsch): eine Stelle für Zahlen, Prozent und Entfernungen. Vorher stand der Code an drei Stellen
// (Kompass, HUD, Weltkarte) und `toLocaleString('de-DE')` gut zwanzigmal verstreut.

/** Ganze Zahl mit Tausenderpunkt: 12 500 → „12.500“ */
export const fmtInt = (n: number): string => Math.round(n).toLocaleString('de-DE');

/** Anteil 0 … 1 als Prozent: 0,456 → „46 %“ */
export const fmtPct = (f: number, digits = 0): string => `${(f * 100).toFixed(digits).replace('.', ',')} %`;

/** Entfernung: ab 1 000 m in Kilometern („1,3 km“), sonst auf 10 m gerundet („240 m“) */
export const fmtDist = (m: number): string => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 10) * 10} m`);

/** Zahl mit Komma als Dezimaltrenner: 1.2 → „1,2“ */
export const fmtNum = (n: number, digits = 1): string => n.toFixed(digits).replace('.', ',');
