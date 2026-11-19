// Kamera-Öffnungswinkel: eine Quelle für Renderer (Größenänderung) und Titelbild (stellt den Winkel nach dem Spielstart zurück)

/** Senkrechter Öffnungswinkel in Grad: Querformat 55, Hochformat 70 (dort muss das Schiff schmaler ins Bild passen) */
export const baseFov = (w: number, h: number): number => (h > w ? 70 : 55);
