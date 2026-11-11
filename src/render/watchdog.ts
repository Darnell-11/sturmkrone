import type { QualityConfig } from '../data/qualityTiers';

/**
 * Leistungs-Wächter: Fällt die Bildrate unter 50 fps, nimmt er der Reihe nach Last weg, die man am wenigsten sieht
 * (Stufen 1 … 3: Schattenauflösung, Umgebungsverdeckung, Vegetationsdichte/Sichtweite, Partikel). Läuft es lange
 * wieder flüssig, gibt er die Stufen einzeln zurück. Erst wenn alle drei Stufen nicht reichen, greifen die
 * dynamische Auflösung und danach die Absenkung der ganzen Grafikstufe (siehe Game).
 */
export class PerfWatchdog {
  static readonly LOW = 50;
  static readonly HIGH = 58;
  static readonly MAX = 3;

  /** aktuelle Sparstufe 0 (aus) … 3 */
  level = 0;
  private warm = 0;
  private acc = 0;
  private frames = 0;
  private bad = 0;
  private good = 0;
  /** nach einer Rücknahme, die sofort wieder zu langsam war, bis dahin nicht erneut zurückgeben (Spielzeit s) */
  private blockUpUntil = 0;
  private clock = 0;
  private lastUp = -99;

  /** Nach Laden, Pause oder Szenenwechsel neu messen (Shader-Übersetzung verfälscht die ersten Sekunden) */
  rewarm() { this.warm = 0; this.acc = 0; this.frames = 0; this.bad = 0; this.good = 0; }

  reset() { this.level = 0; this.rewarm(); this.blockUpUntil = 0; this.lastUp = -99; }

  /** Je Bild aufrufen. Liefert die neue Stufe, wenn sie sich ändert, sonst null. */
  sample(frameDt: number): number | null {
    // sehr lange Bilder kommen von gedrosselten Hintergrund-Tabs, nicht von zu hoher Last
    if (frameDt <= 0 || frameDt > 0.2 || (typeof document !== 'undefined' && document.hidden)) return null;
    this.clock += frameDt;
    this.warm += frameDt;
    if (this.warm < 4) return null;
    this.acc += frameDt;
    this.frames++;
    if (this.acc < 2.5) return null;
    const fps = this.frames / this.acc;
    this.acc = 0; this.frames = 0;
    if (fps < PerfWatchdog.LOW) {
      this.good = 0;
      // wurde gerade erst zurückgegeben und es ruckelt wieder: Rücknahme war zu früh
      if (this.clock - this.lastUp < 20) this.blockUpUntil = this.clock + 90;
      if (++this.bad >= 2 && this.level < PerfWatchdog.MAX) {
        this.bad = 0;
        this.level++;
        this.warm = 2; // kurz beruhigen lassen (Schattenkarten und Nachbearbeitung werden neu aufgebaut)
        return this.level;
      }
    } else if (fps >= PerfWatchdog.HIGH) {
      this.bad = 0;
      if (this.level > 0 && this.clock >= this.blockUpUntil && ++this.good >= 6) {
        this.good = 0;
        this.level--;
        this.lastUp = this.clock;
        this.warm = 2;
        return this.level;
      }
    } else {
      // zwischen 50 und 58: weder schlecht noch gut
      this.bad = 0;
      this.good = 0;
    }
    return null;
  }
}

/**
 * Qualitätsstufe mit Sparstufe: berechnet die wirksame Konfiguration. Stufe 1 halbiert die Schattenkarte (mind. 1024)
 * und spart bei der Umgebungsverdeckung; Stufe 2 senkt Schattenkarte und Kaskaden weiter, AO auf Minimum, Vegetation
 * und Sichtweite etwas kürzer; Stufe 3 schaltet AO ab, nutzt nur noch eine Schattenkarte und kürzt Partikel und Vegetation weiter.
 */
export function budgetConfig(base: QualityConfig, level: number): QualityConfig {
  if (level <= 0) return base;
  const c: QualityConfig = { ...base, shadows: { ...base.shadows }, post: { ...base.post }, budget: level };
  if (c.shadows.enabled) {
    c.shadows.mapSize = Math.max(1024, Math.round(base.shadows.mapSize / (level >= 2 ? 4 : 2)));
    if (level >= 2) c.shadows.cascades = Math.min(c.shadows.cascades, 2);
    if (level >= 3) c.shadows.cascades = 1;
    c.shadows.soft = level >= 3 ? false : base.shadows.soft;
  }
  const ao = base.post.ambientOcclusion;
  if (ao) {
    c.post.ambientOcclusion = level >= 3 ? null
      : level === 2 ? { ...ao, dirs: 3, steps: 3, scale: 0.5 }
      : { ...ao, dirs: Math.max(3, ao.dirs - 2), steps: Math.max(3, ao.steps - 1), scale: Math.min(ao.scale, 0.5) };
  }
  if (level >= 3) { c.post.depthOfField = false; c.post.ssr = null; }
  c.particles = base.particles * (level >= 3 ? 0.55 : level === 2 ? 0.8 : 1);
  return c;
}
