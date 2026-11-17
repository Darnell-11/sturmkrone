/**
 * Auflösung der selbst gemalten Texturen (Holz, Segel, Pflaster, Wolken, Rauch).
 * Wird beim Start einmal nach der Grafikstufe gesetzt, bevor die Welt gebaut wird:
 * Ultra malt alles in vierfacher Auflösung und mit maximaler Texturfilterung.
 */
export const texDetail = { scale: 1, aniso: 4, density: 1, boost: 1 };

/** Größte Kantenlänge einer gemalten Textur in Pixeln (ein 4096²-Bild braucht etwa 85 MB mit Mipmaps, mehr lohnt nicht) */
const MAX_SIDE = 4096;

/** density: Menge an Pflanzen und Kleinkram auf den Inseln (nach Grafikstufe); boost: Zusatzfaktor für kleine Basen (≤ 256 px) */
export function setTexDetail(scale: number, aniso: number, density = 1, boost = 1) {
  texDetail.scale = scale;
  texDetail.aniso = aniso;
  texDetail.density = density;
  texDetail.boost = boost;
}

/**
 * Leinwand in Grundgröße × Detailfaktor; gezeichnet wird weiter in Grundkoordinaten.
 * Kleine Basen (≤ 256 px) bekommen zusätzlich den Faktor `boost` (Max 1024 px, Ultra 2048 px), große Basen bleiben bei Basis × Faktor;
 * nie über 4096 px je Seite.
 */
export function detailCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  let k = texDetail.scale * (Math.max(w, h) <= 256 ? texDetail.boost : 1);
  k = Math.min(k, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g = c.getContext('2d')!;
  g.scale(k, k);
  return { c, g };
}
