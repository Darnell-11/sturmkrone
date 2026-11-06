/**
 * Auflösung der selbst gemalten Texturen (Holz, Segel, Pflaster, Wolken, Rauch).
 * Wird beim Start einmal nach der Grafikstufe gesetzt, bevor die Welt gebaut wird:
 * Ultra malt alles in vierfacher Auflösung und mit maximaler Texturfilterung.
 */
export const texDetail = { scale: 1, aniso: 4, density: 1 };

/** density: Menge an Pflanzen und Kleinkram auf den Inseln (nach Grafikstufe) */
export function setTexDetail(scale: number, aniso: number, density = 1) {
  texDetail.scale = scale;
  texDetail.aniso = aniso;
  texDetail.density = density;
}

/** Leinwand in Grundgröße × Detailfaktor; gezeichnet wird weiter in Grundkoordinaten */
export function detailCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const k = texDetail.scale;
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g = c.getContext('2d')!;
  g.scale(k, k);
  return { c, g };
}
