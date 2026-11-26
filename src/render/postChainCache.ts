// Phase 4.7E – Cache der Nachbearbeitung über Bühnenwechsel (VS-Face-Off → Editor → Klassen-Showcase → Spielwelt).
//
// Bis 4.7D.1 baute jeder Bühnenwechsel (`GameRenderer.setView`/`setEffectSources`) den ganzen Composer neu – Bloom, Tiefenunschärfe, Lichtstrahlen,
// Umgebungsverdeckung, Spiegelungen und der Abschluss-Durchgang entstanden je Bühne frisch (rund 16 Nachbearbeitungs-Programme). Welche Durchgänge
// und Shader es gibt, hängt aber nur an Grafikstufe, Sparstufe, Gerät und Multisampling – nie an der Szene. Darum gibt es je Schlüssel genau EINE
// Pipeline; ein Bühnenwechsel hängt nur Szene, Kamera, Lichtquelle und Fokus um. Rein (ohne WebGL), damit die Regel ohne Grafikkarte prüfbar ist.

/** Was die Pipeline bestimmt (alles Übrige wird umgehängt) */
export interface PostChainSpec {
  /** Nachbearbeitung an (Niedrig/Mittel: aus) */
  enabled: boolean;
  tier: string;
  /** Sparstufe des Leistungs-Wächters */
  budget: number;
  mobile: boolean;
  samples: number;
}

/** Schlüssel einer Pipeline ('' = keine Nachbearbeitung) */
export const postChainKey = (s: PostChainSpec): string => (s.enabled ? `${s.tier}|${s.budget}|${s.mobile ? 1 : 0}|${s.samples}` : '');

/**
 * Hält höchstens eine Pipeline (die der aktuellen Grafikstufe). `use` baut nur, wenn sich der Schlüssel ändert (Grafikstufe, Sparstufe), sonst wird
 * die bestehende Pipeline auf die neue Bühne umgehängt. Die alte Pipeline gibt `dispose` frei; die übersetzten Programme hält der Renderer ohnehin fest
 * (`pinPrograms`), ein Zurückwechseln übersetzt also nichts neu.
 */
export class PostChainCache<T> {
  private key = '';
  private value: T | null = null;
  /** Zählwerte für Prüfungen: Neubauten und Umhängungen */
  builds = 0;
  retargets = 0;

  get current(): T | null { return this.value; }
  get currentKey(): string { return this.key; }

  use(spec: PostChainSpec, build: () => T, retarget: (v: T) => void, dispose: (v: T) => void): T | null {
    const key = postChainKey(spec);
    if (!key) { this.drop(dispose); return null; }
    if (this.value && key === this.key) { retarget(this.value); this.retargets++; return this.value; }
    this.drop(dispose);
    this.value = build();
    this.key = key;
    this.builds++;
    return this.value;
  }

  /** Pipeline freigeben (Nachbearbeitung aus) */
  drop(dispose: (v: T) => void) {
    if (this.value) dispose(this.value);
    this.value = null;
    this.key = '';
  }
}
