/**
 * Robuste Bildraten-Messung für die Wächter (Leistungs-Wächter, dynamische Auflösung, automatische Grafikstufe).
 *
 * Ein Mittelwert über Zeit lässt sich von einzelnen Ruckern täuschen: Eine Shader-Übersetzung beim Betreten einer Insel, ein Nachladen
 * oder die Speicherbereinigung des Browsers dauern 80 bis 400 ms, dann bricht die gemessene Bildrate ein, obwohl das Spiel danach wieder
 * flüssig läuft – und die Wächter senkten Auflösung oder Grafikstufe. Hier zählen die langsamsten Bilder eines Messfensters (`TRIM`,
 * standardmäßig 4 %) nicht mit: einzelne Ruckler verschwinden aus der Messung, anhaltend zu langsames Zeichnen dagegen nicht.
 * Ohne Speicherzuteilung im Betrieb (feste Felder), die Auswertung am Fensterende sortiert nur eine Kopie von höchstens 1600 Werten.
 */
const CAP = 1600;
/** Anteil der langsamsten Bilder, der nicht zählt */
export const TRIM = 0.04;

export class FrameWindow {
  private buf = new Float32Array(CAP);
  private tmp = new Float32Array(CAP);
  private n = 0;
  /** Summe aller Bilddauern im Fenster (Sekunden) */
  acc = 0;

  reset() { this.n = 0; this.acc = 0; }

  get frames() { return this.n; }

  push(dt: number) {
    if (this.n < CAP) this.buf[this.n++] = dt;
    this.acc += dt;
  }

  /**
   * Bildrate ohne die langsamsten Bilder (Ruckler). `outlierShare` (optional): Anteil der Bilder, die mehr als 2,5-mal so lange
   * dauerten wie das mittlere Bild – ein Hinweis auf Ruckeln statt auf zu hohe Dauerlast.
   */
  fps(trim = TRIM): number {
    const n = this.n;
    if (n === 0) return 0;
    const a = this.tmp;
    a.set(this.buf.subarray(0, n));
    const s = a.subarray(0, n).sort();
    const keep = Math.max(1, n - Math.floor(n * trim));
    let sum = 0;
    for (let i = 0; i < keep; i++) sum += s[i];
    return sum > 0 ? keep / sum : 0;
  }

  /** Anteil der Bilder, die mehr als 2,5-mal so lange dauerten wie das mittlere der schnellen Hälfte */
  hitchShare(): number {
    const n = this.n;
    if (n < 8) return 0;
    const a = this.tmp;
    a.set(this.buf.subarray(0, n));
    const s = a.subarray(0, n).sort();
    const med = s[n >> 1];
    let k = 0;
    for (let i = n - 1; i >= 0 && s[i] > med * 2.5; i--) k++;
    return k / n;
  }
}
