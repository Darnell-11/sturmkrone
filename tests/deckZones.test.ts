// 4.4.1: Zonen des Schiffsdecks je Läufer. Früher teilten sich alle Läufer eines Decks einen Zustand: lief jemand übers Hauptdeck oder durch die
// Kajütentür, fiel die Spielfigur oben am Steuerrad in die Kajüte (eigenes Schiff und beim Entern auf dem Feindschiff).
import { describe, expect, it } from 'vitest';
import { CompositeGround, DeckGround, IslandGround } from '../src/world/islandGround';

function ship() {
  const m = new Array(16).fill(0); m[0] = m[5] = m[10] = m[15] = 1;
  const roof = { visible: true };
  const s = {
    entityId: 'ship-T', x: 0, z: 0, heading: 0, cls: { L: 40 },
    model: {
      deckY: 2,
      group: { position: { y: 0 }, matrixWorld: { elements: m }, updateMatrixWorld() { /* Einheitsmatrix */ } },
      halfWidth: () => 5,
      blockers: [] as { cx: number; cz: number; hx: number; hz: number }[],
      // Achterkastell von z −18 bis −10, 2,4 m hoch, Treppen links und rechts, Tür in der Mitte, Kajüte darunter
      quarter: { z0: -18, z1: -10, top: 2.4, stairX: [-3, 3], stairW: 1.2, stairLen: 3, doorHalf: 0.6, cabin: { zA: -17, zB: -10.5 } },
      cabinRoof: roof,
    },
  };
  return { s, roof };
}

describe('Deck-Zonen je Läufer (Kajüte, Achterdeck, Hauptdeck)', () => {
  it('ein Läufer unten oder in der Tür lässt die Spielfigur oben am Steuerrad nicht in die Kajüte fallen', () => {
    const { s } = ship();
    const dg = new DeckGround(s);
    const comp = new CompositeGround(new IslandGround());
    comp.setDecks(dg);
    const top = 2 + 2.4, main = 2;
    // Spielfigur oben in der Mitte nahe der Vorderkante (Steuerrad), andere laufen unten
    const px = 0, pz = -10.4;
    for (let k = 0; k < 50; k++) {
      // Matrose auf dem Hauptdeck vor dem Kastell, dann durch die Tür in die Kajüte (ohne Höhe: Deck-Crew; mit Höhe: Gegner/Truppe)
      comp.constrain(0, -9 + (k % 3), 0.35, main);
      comp.constrain(0, -10.3, 0.35, main);
      dg.constrain(0.2, -9.5, 0.45);
      dg.constrain(0.1, -10.3, 0.45);
      const h = comp.height(px, pz, top);
      expect(h).toBeCloseTo(top, 5);
      const c = comp.constrain(px, pz, 0.35, top);
      expect(c.z).toBeLessThanOrEqual(-10 + 1e-6);
    }
  });

  it('wer unten durch die Tür geht, ist in der Kajüte (Boden auf Hauptdeckhöhe); wer die Treppe hoch kommt, steht oben', () => {
    const { s } = ship();
    const dg = new DeckGround(s);
    expect(dg.height(0, -12, 2)).toBeCloseTo(2, 5);
    expect(dg.height(0, -12, 4.4)).toBeCloseTo(4.4, 5);
    // oben ist die Türlücke eine Wand (kein Absturz durch die Tür)
    const c = dg.constrain(0, -10.05, 0.35, 4.4);
    expect(c.z).toBeLessThan(-10);
    // vor dem Kastell immer Hauptdeck
    expect(dg.height(0, -5, 4.4)).toBeCloseTo(2, 5);
  });

  it('Kamera und Kajütendach folgen nur der Spielfigur', () => {
    const { s, roof } = ship();
    const dg = new DeckGround(s);
    dg.notePlayer(0, -12, 4.4);
    expect(dg.inCabin).toBe(false);
    expect(roof.visible).toBe(true);
    // andere Läufer in der Kajüte ändern nichts
    dg.constrain(0, -12, 0.35, 2);
    dg.constrain(0, -12, 0.35);
    expect(dg.inCabin).toBe(false);
    dg.notePlayer(0, -12, 2);
    expect(dg.inCabin).toBe(true);
    expect(roof.visible).toBe(false);
    dg.notePlayer(0, -6, 2);
    expect(dg.inCabin).toBe(false);
    expect(roof.visible).toBe(true);
  });
});
