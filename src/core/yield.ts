/**
 * Dem Browser beim Laden Luft geben: schwere Aufbauarbeit läuft in kleinen Stücken, dazwischen darf er Eingaben bearbeiten
 * und zeichnen (Ladebalken, Seite bleibt bedienbar, der PC hängt nicht).
 *
 * `tick()` gibt die Hauptschleife über eine Nachricht (MessageChannel) frei: das ist sofort und wird auch in einem Hintergrund-Tab
 * nicht gebremst (setTimeout schon: dort höchstens einmal je Sekunde). Etwa alle 80 ms wartet es zusätzlich auf ein gezeichnetes
 * Bild, damit der Balken wirklich vorrückt – nur bei sichtbarem Tab, sonst gäbe es kein Bild, auf das man warten könnte.
 */
const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const waiting: (() => void)[] = [];
if (channel) channel.port1.onmessage = () => { const r = waiting.shift(); if (r) r(); };

/** Sofort wieder dran, nachdem der Browser anderes erledigt hat */
function macroTask(): Promise<void> {
  if (!channel) return new Promise((r) => setTimeout(r, 0));
  return new Promise((r) => { waiting.push(r); channel.port2.postMessage(0); });
}

let lastPaint = 0;

export async function tick(): Promise<void> {
  const now = performance.now();
  if (now - lastPaint >= 80 && typeof document !== 'undefined' && !document.hidden) {
    lastPaint = now;
    // auf das nächste gezeichnete Bild warten (mit Zeitschranke, falls der Browser keins liefert)
    await new Promise<void>((resolve) => {
      let done = false;
      const go = () => { if (!done) { done = true; resolve(); } };
      requestAnimationFrame(go);
      // bei 60 Hz kommt das Bild nach 16 ms; ist das Fenster verdeckt oder gebremst, nicht lange warten
      setTimeout(go, 50);
    });
  }
  await macroTask();
}

/** Eine Folge von Schritten (Generator) abarbeiten, nach jedem Schritt Luft geben und den Fortschritt melden */
export async function runSteps(steps: Iterator<number, unknown>, onProgress: (p: number) => void): Promise<void> {
  for (let r = steps.next(); !r.done; r = steps.next()) {
    onProgress(r.value as number);
    await tick();
  }
}
