import { describe, expect, it } from 'vitest';
import { Box3 } from 'three';
import { createLamp, LAMP_ARM } from '../src/render/lamps';

describe('Hüftlaterne', () => {
  it('hängt an einer Gürtelhalterung: nichts über dem Befestigungspunkt, der Körper liegt in +x, die Laterne hängt LAMP_ARM weiter außen', () => {
    const lamp = createLamp(1);
    lamp.geometry.computeBoundingBox();
    const b: Box3 = lamp.geometry.boundingBox!;
    // Befestigungspunkt = Ursprung am Gürtel; höchstens die Lederschlaufe reicht ein paar Millimeter darüber
    expect(b.max.y).toBeLessThan(0.01);
    // zum Körper hin (+x) ragt nur die Platte, nicht die Laterne
    expect(b.max.x).toBeLessThan(0.012);
    // nach außen (−x): Arm plus Laterne (Dach 0,046 breit um die Mittelachse)
    expect(b.min.x).toBeLessThanOrEqual(-(LAMP_ARM + 0.04));
    expect(b.min.x).toBeGreaterThan(-(LAMP_ARM + 0.06));
    // die Laterne hängt mehr als 30 cm tief (Henkel, Glas, Fuß)
    expect(b.min.y).toBeLessThan(-0.33);
  });

  it('die Halterung hängt zusammen: Kettenglieder reichen lückenlos von der Öse bis zum Henkel', () => {
    const lamp = createLamp(1);
    const pos = lamp.geometry.getAttribute('position');
    // Höhenbänder zwischen Arm (y −0.02) und Henkel-Scheitel (y −0.134) enthalten Punkte in der Kettenachse (x = −LAMP_ARM)
    for (let y = -0.04; y > -0.13; y -= 0.01) {
      let found = false;
      for (let i = 0; i < pos.count && !found; i++) if (Math.abs(pos.getY(i) - y) < 0.006 && Math.abs(pos.getX(i) + LAMP_ARM) < 0.015) found = true;
      expect(found, `Kette bei y = ${y.toFixed(3)}`).toBe(true);
    }
  });
});
