// Phase 4.2B: sichtbare Schiffs-Evolution. Der Bauplan (`data/shipVisuals.ts`) ist rein und deterministisch: für alle sieben Klassen und alle 125 Kombinationen
// aus Rumpf-, Segel- und Kanonen-Stufe prüfen wir Stufenfolge, Pforten (dieselbe Auswahl wie beim Feuern), Lagen der Anbauten und den Abprall beim Rammen.
import { describe, expect, it } from 'vitest';
import { RAM, dangerOfLevel } from '../src/data/balanceConfig';
import { activePorts, evolutionOfTier, portIndices, type EvoTier, type ShipEvolution } from '../src/data/shipEvolution';
import { SHIP_CLASSES } from '../src/data/ships';
import {
  PATCH_TONES, beltPlates, deckHeightOf, hullPatches, ironStations, lowerOpenIndices, mainPortZ, mixHex, pilasterPlates, portSpots, sailAreaK, scaleHex,
  pickSwivelZ, seeded, shipVisual, tierHullColor, visualKey,
} from '../src/data/shipVisuals';
import { ramContact, ramImpulse, type Kin } from '../src/naval/ramming';

const TIERS: EvoTier[] = [1, 2, 3, 4, 5];
const evo = (hullTier: EvoTier, sailTier: EvoTier, cannonTier: EvoTier): ShipEvolution => ({ hullTier, sailTier, cannonTier });
const lum = (hex: string) => { const v = parseInt(hex.slice(1), 16); return 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255); };

describe('Bauplan: Kennung und Determinismus', () => {
  it('125 Kombinationen ergeben 125 verschiedene Kennungen, dieselbe Eingabe denselben Plan', () => {
    const keys = new Set<string>();
    for (const h of TIERS) for (const s of TIERS) for (const k of TIERS) keys.add(visualKey(evo(h, s, k)));
    expect(keys.size).toBe(125);
    for (const c of SHIP_CLASSES) {
      const e = evo(4, 2, 5);
      expect(shipVisual(c, e)).toEqual(shipVisual(c, e));
      expect(shipVisual(c, e).key).toBe(visualKey(e));
    }
  });

  it('der Zufall ist an den Text gebunden und wiederholbar', () => {
    const a = seeded('x'), b = seeded('x'), c = seeded('y');
    const sa = [a(), a(), a()], sb = [b(), b(), b()];
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual([c(), c(), c()]);
    for (const v of sa) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('Rumpf: Farbe, Holz, Eisen, Panzer, Sporn, Heckgalerie', () => {
  it('die Tönung wird von Stufe zu Stufe dunkler, die gewählte Farbe bleibt erkennbar', () => {
    for (const base of ['#8A5A2B', '#2F5D8C', '#B03030']) {
      const l = TIERS.map((t) => lum(tierHullColor(base, t)));
      for (let i = 1; i < l.length; i++) expect(l[i], `${base} Stufe ${i + 1}`).toBeLessThan(l[i - 1]);
      expect(tierHullColor(base, 1)).not.toBe(tierHullColor(base, 5));
    }
    // dieselbe Eingabe, dieselbe Farbe; Stufe 1 ist heller als die Grundfarbe, Stufe 5 dunkler
    expect(tierHullColor('#8A5A2B', 3)).toBe(tierHullColor('#8A5A2B', 3));
    expect(lum(tierHullColor('#8A5A2B', 1))).toBeGreaterThan(lum('#8A5A2B'));
    expect(lum(tierHullColor('#8A5A2B', 5))).toBeLessThan(lum('#8A5A2B') * 0.7);
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(scaleHex('#808080', 0.5)).toBe('#404040');
  });

  it('Stufe für Stufe: Flickbretter nur auf 1, Eisenbänder auf 2 – 3, Gürtel und Sporn ab 4, Galerie und Hecklaternen ab 4', () => {
    for (const c of SHIP_CLASSES) {
      const v = TIERS.map((t) => shipVisual(c, evo(t, 3, 3)).hull);
      expect(v.map((h) => h.patches > 0)).toEqual([true, false, false, false, false]);
      expect(v.map((h) => h.bands > 0)).toEqual([false, true, true, false, false]);
      expect(v[2].bands, c.id).toBeGreaterThanOrEqual(v[1].bands);                      // Stufe 3 mindestens so viele Bänder wie Stufe 2
      expect(v.map((h) => h.reinforced)).toEqual([false, true, true, false, false]);
      expect(v.map((h) => h.brass)).toEqual([0, 1, 2, 0, 0]);
      expect(v.map((h) => h.belt !== null)).toEqual([false, false, false, true, true]);
      expect(v.map((h) => h.ram !== null)).toEqual([false, false, false, true, true]);
      expect(v.map((h) => h.galleryRows)).toEqual([0, 0, 0, 2, 2]);
      expect(v.map((h) => h.sternLamps)).toEqual([0, 0, 0, 2, 3]);
      // Holz wird glatter (Rauheit sinkt streng)
      for (let i = 1; i < 5; i++) expect(v[i].roughness).toBeLessThan(v[i - 1].roughness);
      // Stufe 4 geschmiedeter Stahl, Stufe 5 geschwärzt mit Gold
      expect(v[3].belt!.gold).toBe(false);
      expect(v[4].belt!.gold).toBe(true);
      expect(v[4].belt!.rows).toBe(2);
      expect(v[4].ram!.gold).toBe(true);
      expect(lum(v[4].belt!.steel)).toBeLessThan(lum(v[3].belt!.steel));
    }
  });
});

describe('Segel: Fläche, Tuch, Rahen, Takelage', () => {
  it('Stufe 1 hat 72 % der Fläche, ab 2 die volle; keine Vorsegel, Bramsegel und Besan ab 4, Bordüre ab 4 (5 doppelt)', () => {
    for (const c of SHIP_CLASSES) {
      const v = TIERS.map((t) => shipVisual(c, evo(3, t, 3)).sail);
      expect(sailAreaK(v[0])).toBeCloseTo(0.72, 1);
      for (let i = 1; i < 5; i++) expect(sailAreaK(v[i])).toBe(1);
      for (let i = 1; i < 5; i++) {
        expect(v[i].wear).toBeLessThan(v[i - 1].wear);
        expect(v[i].billow).toBeLessThan(v[i - 1].billow);                              // straffer
        expect(v[i].shrouds).toBeGreaterThanOrEqual(v[i - 1].shrouds);
      }
      expect(v.map((s) => s.topgallants)).toEqual([false, false, false, true, true]);
      expect(v.map((s) => s.spanker)).toEqual([false, false, false, true, true]);
      expect(v.map((s) => s.border === null)).toEqual([true, true, true, false, false]);
      expect(v[3].border!.double).toBe(false);
      expect(v[4].border!.double).toBe(true);
      expect(v.map((s) => s.tattered)).toEqual([true, true, true, false, false]);
      expect('jibs' in v[0]).toBe(false);                                             // 4.9: keine Vorsegel mehr
      expect(v[0].yardLifts).toBe(false);
      expect(v[1].yardLifts).toBe(true);
      expect(v[4].wear).toBe(0);
    }
  });
});

describe('Kanonen: Pforten, Rohre, Drehbassen', () => {
  it('offene und vernagelte Pforten sind genau die Auswahl, die beim Feuern gilt (activePorts/portIndices), ohne Überschneidung', () => {
    for (const c of SHIP_CLASSES) for (const t of TIERS) {
      const v = shipVisual(c, evo(3, 3, t)).cannon;
      expect(v.active).toBe(activePorts(c.can, t));
      expect(v.open).toEqual(portIndices(c.can, v.active));
      expect(v.open.length + v.boarded.length).toBe(c.can);
      expect(v.open.filter((i) => v.boarded.includes(i))).toEqual([]);
      expect([...v.open, ...v.boarded].sort((a, b) => a - b)).toEqual(Array.from({ length: c.can }, (_, i) => i));
      if (t >= 3) expect(v.boarded, `${c.id} Stufe ${t}`).toEqual([]);
      if (t === 1) expect(v.open.length / c.can, `${c.id} Stufe 1`).toBeGreaterThanOrEqual(0.4);
      if (t === 1 && c.can >= 4) expect(v.boarded.length).toBeGreaterThan(0);
    }
  });

  it('Rohre: Rost → Eisen → Bronze → polierte Bronze (lang) → schwarzer Gussstahl mit Goldring; Deckel ab 2; Drehbassen ab 4 (2 … 7 je Seite)', () => {
    for (const c of SHIP_CLASSES) {
      const v = TIERS.map((t) => shipVisual(c, evo(3, 3, t)).cannon);
      expect(v.map((x) => x.barrel)).toEqual(['rost', 'eisen', 'bronze', 'bronzelang', 'schwarz']);
      expect(v.map((x) => x.lids)).toEqual([false, true, true, true, true]);
      expect(v.map((x) => x.goldRing)).toEqual([false, false, false, false, true]);
      expect(v.map((x) => x.lengthK)).toEqual([...v.map((x) => x.lengthK)].sort((a, b) => a - b));
      expect(v[0].lengthK).toBeLessThan(1);                                              // kurze Rohre
      expect(v[4].lengthK).toBeGreaterThan(v[3].lengthK);
      expect(v.map((x) => x.swivels > 0)).toEqual([false, false, false, true, true]);
      for (const x of v.slice(3)) { expect(x.swivels).toBeGreaterThanOrEqual(2); expect(x.swivels).toBeLessThanOrEqual(7); }
      expect(v[4].swivels).toBeGreaterThanOrEqual(v[3].swivels);
      // untere Reihen: Anteil offener Pforten wächst
      expect(v.map((x) => x.lowerOpenK)).toEqual([...v.map((x) => x.lowerOpenK)].sort((a, b) => a - b));
      expect(v[2].lowerOpenK).toBe(1);
    }
  });

  it('untere Pfortenreihen: gleichmäßige Auswahl, nie leer, Stufe ≥ 3 alle', () => {
    for (const c of SHIP_CLASSES) {
      const all = Array.from({ length: c.can + 1 }, (_, i) => i);
      expect(lowerOpenIndices(c, 1)).toEqual(all);
      for (const k of [0, 0.25, 0.5, 0.75]) {
        const o = lowerOpenIndices(c, k);
        expect(o.length).toBeGreaterThanOrEqual(1);
        expect(o.length).toBeLessThanOrEqual(c.can + 1);
        expect(new Set(o).size).toBe(o.length);
      }
    }
  });
});

describe('Lagen der Anbauten: aus den Maßen der Klasse, nie auf Pforten, symmetrisch aufgebaut oder bewusst schief', () => {
  it('Flickbretter: immer im Mittelschiff, unter dem Deck, nie über einer Stückpforte, je Seite anders, deterministisch', () => {
    for (const c of SHIP_CLASSES) {
      const n = shipVisual(c, evo(1, 3, 3)).hull.patches;
      const list = hullPatches(c, n), again = hullPatches(c, n), D = deckHeightOf(c);
      expect(list).toEqual(again);
      expect(list.length).toBeGreaterThanOrEqual(4);
      for (const p of list) {
        expect(Math.abs(p.z), c.id).toBeLessThanOrEqual(c.L / 2 * 0.74 + 1e-6);
        expect(p.y + p.h / 2).toBeLessThanOrEqual(D * 0.97);
        expect(p.y - p.h / 2).toBeGreaterThanOrEqual(0.45);
        expect(p.tone).toBeGreaterThanOrEqual(0);
        expect(p.tone).toBeLessThan(PATCH_TONES.length);
        for (const s of portSpots(c)) {
          const overlap = Math.abs(p.z - s.z) < p.w / 2 + s.hz && Math.abs(p.y - s.y) < p.h / 2 + s.hy;
          expect(overlap, `${c.id}: Flicken bei z ${p.z.toFixed(1)} über einer Pforte`).toBe(false);
        }
      }
      // beide Bordseiten bestückt, aber nicht deckungsgleich
      const left = list.filter((p) => p.side === 1), right = list.filter((p) => p.side === -1);
      expect(left.length).toBeGreaterThanOrEqual(2);
      expect(right.length).toBeGreaterThanOrEqual(2);
      expect(left.map((p) => p.z.toFixed(2))).not.toEqual(right.map((p) => p.z.toFixed(2)));
      // keine zwei Flicken überlappen
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.side !== b.side) continue;
        expect(Math.abs(a.z - b.z) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2, c.id).toBe(false);
      }
    }
  });

  it('Eisenbänder, Gürtelplatten, Pilaster und Drehbassen-Kandidaten liegen im Rumpf und folgen der Länge der Klasse', () => {
    for (const c of SHIP_CLASSES) {
      const stations = ironStations(c, shipVisual(c, evo(3, 3, 3)).hull.bands);
      expect(stations.length).toBe(shipVisual(c, evo(3, 3, 3)).hull.bands);
      for (const z of stations) expect(Math.abs(z)).toBeLessThan(c.L / 2 * 0.85);
      for (const p of beltPlates(c)) { expect(Math.abs(p.z) + p.len / 2).toBeLessThanOrEqual(c.L / 2); expect(p.len).toBeGreaterThan(0.5); }
      expect(beltPlates(c).length).toBeGreaterThanOrEqual(3);
      const pil = pilasterPlates(c);
      for (const p of pil) {
        // zwischen zwei Pforten, nicht davor
        for (let i = 0; i < c.can; i++) expect(Math.abs(p.z - mainPortZ(c, i)) - p.len / 2, c.id).toBeGreaterThan(0.5);
      }
    }
  });

  it('Drehbassen-Lagen: gleichmäßig über die freie Reling verteilt, Mindestabstand, nie auf gesperrten Stellen, vorn zuerst', () => {
    const all = pickSwivelZ(4, -10, 10, 2.4, () => true);
    expect(all.length).toBe(4);
    expect([...all].sort((a, b) => b - a)).toEqual(all);                                 // vorn zuerst
    for (const z of all) { expect(z).toBeGreaterThanOrEqual(-10); expect(z).toBeLessThanOrEqual(10); }
    for (let i = 1; i < all.length; i++) expect(all[i - 1] - all[i]).toBeGreaterThanOrEqual(2.4 - 1e-9);
    // gesperrte Stellen (Zugänge der Gangway) bleiben frei
    const gates = [0, 6];
    const free = (z: number) => gates.every((g) => Math.abs(g - z) >= 1.25);
    for (const z of pickSwivelZ(5, -10, 10, 2.4, free)) expect(free(z)).toBe(true);
    // zwei schmale Fenster zwischen den Zugängen: je eine Drehbasse
    const win = pickSwivelZ(2, 0, 10, 2.4, (z) => (z > 2 && z < 3) || (z > 5.5 && z < 6.5));
    expect(win.length).toBe(2);
    expect(win[0]).toBeGreaterThan(5.5);
    expect(win[1]).toBeLessThan(3);
    // zu wenig Platz: weniger als gewünscht, nie mehr als Plätze
    expect(pickSwivelZ(5, 0, 10, 2.4, (z) => z > 4 && z < 5).length).toBe(1);
    expect(pickSwivelZ(3, 0, 10, 2.4, () => false)).toEqual([]);
    expect(pickSwivelZ(0, -1, 1, 1, () => true)).toEqual([]);
    expect(pickSwivelZ(3, 5, 5, 1, () => true)).toEqual([]);
    // deterministisch
    expect(pickSwivelZ(4, -10, 10, 2.4, free)).toEqual(pickSwivelZ(4, -10, 10, 2.4, free));
  });

  it('Anbauten wachsen mit der Klasse: Leviathan hat mehr Bänder und Platten als die Schaluppe', () => {
    const small = SHIP_CLASSES[0], big = SHIP_CLASSES[SHIP_CLASSES.length - 1];
    expect(shipVisual(big, evo(3, 3, 5)).cannon.swivels).toBeGreaterThanOrEqual(shipVisual(small, evo(3, 3, 5)).cannon.swivels);
    expect(shipVisual(big, evo(3, 3, 3)).hull.bands).toBeGreaterThan(shipVisual(small, evo(3, 3, 3)).hull.bands);
    expect(beltPlates(big).length).toBeGreaterThan(beltPlates(small).length);
  });
});

describe('KI-Schiffe zeigen ihre Stufe', () => {
  it('stärkere Meere ergeben sichtbar weiter ausgebaute Schiffe (Gefahrenstufe → Stufen)', () => {
    const low = evolutionOfTier(dangerOfLevel(1)), high = evolutionOfTier(dangerOfLevel(18));
    const c = SHIP_CLASSES[3];
    expect(shipVisual(c, high).cannon.tier).toBeGreaterThan(shipVisual(c, low).cannon.tier);
    expect(shipVisual(c, high).hull.tier).toBeGreaterThanOrEqual(shipVisual(c, low).hull.tier);
  });
});

describe('Rammen: Abprall entlang der Hüllen-Normalen', () => {
  const ship = (x: number, z: number, heading: number, speed: number, L = 30, W = 8): Kin => ({ x, z, heading, course: heading, speed, L, W });

  it('ramContact liefert eine Einheitsnormale, die vom Ziel zum Angreifer zeigt, und die Eindringtiefe der Bugspitze', () => {
    // Ziel liegt mit Bug nach +Z; der Angreifer fährt von der Seite (−X) mit Kurs +X in die Bordwand
    const target = ship(0, 0, 0, 0, 30, 8);
    const a = ship(-12, 0, Math.PI / 2, 12, 20, 6);                                      // Bugspitze bei x = −2 (innerhalb der Hülle, |x| < 5)
    const c = ramContact(a, target);
    expect(c.hit).toBe(true);
    expect(Math.hypot(c.nx, c.nz)).toBeCloseTo(1, 5);
    expect(c.nx).toBeLessThan(-0.9);                                                    // nach außen, Richtung Angreifer
    expect(c.depth).toBeGreaterThan(2);
    expect(c.depth).toBeLessThan(4);
    // seitliche Lage verschiebt die Normale mit (Ellipse), bleibt aber nach außen gerichtet
    const bowHit = ramContact(ship(0, -22, 0, 12, 20, 6), ship(0, 0, 0, 0, 30, 8));
    expect(bowHit.nz).toBeLessThan(-0.9);
    expect(bowHit.depth).toBeGreaterThan(0);
    // ohne Eindringen keine Tiefe
    expect(ramContact(ship(0, -30, 0, 12, 20, 6), ship(0, 0, 0, 0, 30, 8)).depth).toBe(0);
  });

  it('Impuls: Hüllen werden um die Eindringtiefe auseinandergeschoben, der Leichtere bewegt sich mehr, das Ziel wird weggedrückt, der Rammer federt zurück', () => {
    const c = { hit: true, dot: 1, relSpeed: 10, ownSpeed: 10, x: 0, z: 0, nx: 1, nz: 0, depth: 2 };
    const eq = ramImpulse(c, 500, 500);
    expect(eq.sepA.x - eq.sepB.x).toBeCloseTo(2, 6);                                    // zusammen genau die Tiefe
    expect(eq.sepA.x).toBeCloseTo(1);
    expect(eq.sepB.x).toBeCloseTo(-1);
    expect(eq.sepA.z).toBe(0);
    expect(eq.shoveB.x).toBeLessThan(0);                                                // Ziel wird in Stoßrichtung (−Normale) gedrückt
    expect(eq.shoveA.x).toBeGreaterThan(0);                                             // Rammer prallt zurück (+Normale)
    expect(Math.abs(eq.shoveB.x)).toBeGreaterThan(Math.abs(eq.shoveA.x));
    // Massenverhältnis: kleines Schiff gegen großes
    const light = ramImpulse(c, 100, 900);
    expect(Math.abs(light.sepA.x)).toBeGreaterThan(Math.abs(light.sepB.x) * 5);
    expect(Math.abs(light.shoveA.x)).toBeGreaterThan(Math.abs(light.shoveB.x));
    const heavy = ramImpulse(c, 900, 100);
    expect(Math.abs(heavy.shoveB.x)).toBeGreaterThan(Math.abs(light.shoveB.x));
    expect(Math.abs(heavy.sepB.x)).toBeGreaterThan(Math.abs(heavy.sepA.x) * 5);
  });

  it('Impuls: gedeckelt, ohne Tiefe keine Trennung, nie NaN, die Stärke wächst mit der Annäherung', () => {
    const base = { hit: true, dot: 1, relSpeed: 10, ownSpeed: 10, x: 0, z: 0, nx: 0, nz: -1, depth: 0 };
    const none = ramImpulse(base, 400, 400);
    for (const v of [none.sepA, none.sepB]) { expect(Math.abs(v.x)).toBe(0); expect(Math.abs(v.z)).toBe(0); }
    const fast = ramImpulse({ ...base, relSpeed: 500, depth: 40 }, 1, 1e6);
    for (const v of [fast.shoveA, fast.shoveB]) expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(RAM.maxShove + 1e-9);
    expect(Math.hypot(fast.sepA.x, fast.sepA.z) + Math.hypot(fast.sepB.x, fast.sepB.z)).toBeLessThanOrEqual(6 + 1e-9);    // Tiefe auf 6 m gedeckelt
    for (const r of [none, fast, ramImpulse(base, 0, 0)]) for (const v of [r.sepA, r.sepB, r.shoveA, r.shoveB]) { expect(Number.isFinite(v.x)).toBe(true); expect(Number.isFinite(v.z)).toBe(true); }
    const slow = ramImpulse({ ...base, relSpeed: 5 }, 400, 400), quick = ramImpulse({ ...base, relSpeed: 14 }, 400, 400);
    expect(Math.abs(quick.shoveB.z)).toBeGreaterThan(Math.abs(slow.shoveB.z));
    // Ziel wird in +Z gedrückt, wenn die Normale nach −Z zeigt (Angreifer südlich, Stoß nach Norden)
    expect(quick.shoveB.z).toBeGreaterThan(0);
    expect(quick.shoveA.z).toBeLessThan(0);
  });

  it('der Abprall klingt ab: der Gesamtweg bei Höchsttempo bleibt bei wenigen Metern', () => {
    // Weg einer exponentiell abklingenden Geschwindigkeit: v0 · (1 − e^{−r t}) / r
    const v0 = RAM.maxShove, total = (v0 * (1 - Math.exp(-RAM.shoveDecay * 5))) / RAM.shoveDecay;
    expect(total).toBeLessThan(v0 / RAM.shoveDecay + 1e-9);
    expect(total).toBeGreaterThan(0.5);
    expect(total).toBeLessThan(8);                                                       // höchstens wenige Meter, kein Wegschleudern
  });
});
