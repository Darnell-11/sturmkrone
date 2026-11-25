import { describe, expect, it } from 'vitest';
import { REGIONS, type IslandDef } from '../src/data/regions';
import {
  CLICK_SLOP, LABEL_ZOOM, LabelPlacer, MAP_EXTENT, panLimit, MAP_ZOOM_MAX, MAP_ZOOM_MIN, centerOn, clampView, dragEnd, dragMove, dragStart, fitAll, labelShown, newDrag,
  panByPixels, screenToWorldInto, worldToScreenInto, zoomAtPoint, zoomOf, type MapView,
} from '../src/ui/mapView';
import { labelRank } from '../src/ui/worldMapDraw';
import {
  DISCOVERY, chartAround, chartLevel, chartOnLoad, chartToSave, cleanChart, discoverNear, isStartCharted, legacyDiscovered, seedStartCharts, type ChartZone,
} from '../src/world/mapDiscovery';
import { FAST_TRAVEL, findBerth, isTravelPort, travelCost, travelQuote, type TravelCtx } from '../src/world/fastTravel';
import { applyFleetEvo, assignShip, cleanFleet, emptyFleet, fleetShip, fleetShipUpkeep, fleetSpawnPoint, type FleetCtx } from '../src/data/playerFleet';
import { DEFAULT_SHIP_LOOK } from '../src/data/ships';
import { newShipEvolution } from '../src/data/shipEvolution';
import { migrateSave } from '../src/core/save/migrations';
import { createSave, SAVE_VERSION } from '../src/core/save/types';

const ALL: IslandDef[] = REGIONS.flatMap((r) => r.islands);
const byId = (id: string) => ALL.find((i) => i.id === id)!;

// ---------- Kartenansicht: Umrechnung, Zoom, Verschieben, Klemmung ----------

describe('Weltkarte: Ansicht', () => {
  const W = 1440, H = 900;

  it('Bildschirm und Welt sind ohne neue Objekte ineinander umrechenbar (x gespiegelt, +z oben)', () => {
    const v: MapView = { cx: 1200, cz: -800, scale: 0.12 };
    const s = { x: 0, y: 0 }, w = { x: 0, z: 0 };
    worldToScreenInto(v, W, H, 3000, 400, s);
    screenToWorldInto(v, W, H, s.x, s.y, w);
    expect(w.x).toBeCloseTo(3000, 6);
    expect(w.z).toBeCloseTo(400, 6);
    worldToScreenInto(v, W, H, v.cx + 100, v.cz, s);
    expect(s.x).toBeLessThan(W / 2);
    worldToScreenInto(v, W, H, v.cx, v.cz + 100, s);
    expect(s.y).toBeLessThan(H / 2);
  });

  it('1× zeigt die ganze Welt; Zoom bleibt zwischen 0,65× und 4,5×', () => {
    const v: MapView = { cx: 0, cz: 0, scale: 1 };
    fitAll(v, W, H);
    expect(zoomOf(v, W, H)).toBeCloseTo(1, 6);
    expect(v.scale * MAP_EXTENT * 2).toBeCloseTo(Math.min(W, H), 3);
    for (let i = 0; i < 40; i++) zoomAtPoint(v, W, H, W / 2, H / 2, 1.5);
    expect(zoomOf(v, W, H)).toBeCloseTo(MAP_ZOOM_MAX, 6);
    for (let i = 0; i < 40; i++) zoomAtPoint(v, W, H, W / 2, H / 2, 0.5);
    expect(zoomOf(v, W, H)).toBeCloseTo(MAP_ZOOM_MIN, 6);
  });

  it('Mausrad-Zoom hält den Weltpunkt unter dem Zeiger fest – auch aus der Gesamtansicht heraus', () => {
    const v: MapView = { cx: 0, cz: 0, scale: 1 };
    fitAll(v, W, H);
    for (let i = 0; i < 6; i++) {
      const before = screenToWorldInto(v, W, H, 900, 350, { x: 0, z: 0 });
      zoomAtPoint(v, W, H, 900, 350, 1.25);
      const after = screenToWorldInto(v, W, H, 900, 350, { x: 0, z: 0 });
      expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(1e-6);
    }
  });

  it('Verschieben und Zentrieren lassen die Karte nie aus dem Fenster laufen (Desktop und Handy)', () => {
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      const v: MapView = { cx: 0, cz: 0, scale: 1 };
      fitAll(v, w, h);
      // bei 1× passt die Karte ins Fenster: sie darf wandern, bleibt aber immer mindestens zur Hälfte sichtbar
      panByPixels(v, w, h, 50000, -50000);
      const hw = w / 2 / v.scale, hh = h / 2 / v.scale;
      const seen = (c: number, half: number) => Math.min(c + half, MAP_EXTENT) - Math.max(c - half, -MAP_EXTENT);
      expect(seen(v.cx, hw)).toBeGreaterThanOrEqual(Math.min(2 * MAP_EXTENT, 2 * hw) * 0.5 - 1e-6);
      expect(seen(v.cz, hh)).toBeGreaterThanOrEqual(Math.min(2 * MAP_EXTENT, 2 * hh) * 0.5 - 1e-6);
      // stark gezoomt an den Rand: die Kante des Fensters liegt höchstens auf der Kante der Karte
      centerOn(v, w, h, 50000, -50000, 4);
      expect(zoomOf(v, w, h)).toBeCloseTo(4, 6);
      expect(v.cx + w / 2 / v.scale).toBeLessThanOrEqual(MAP_EXTENT + 1e-6);
      expect(v.cz - h / 2 / v.scale).toBeGreaterThanOrEqual(-MAP_EXTENT - 1e-6);
      // „Auf Schiff zentrieren“ in der Mitte der Welt trifft genau
      centerOn(v, w, h, 1200, 900, 3);
      expect(v.cx).toBeCloseTo(1200, 6);
      expect(v.cz).toBeCloseTo(900, 6);
      clampView(v, w, h);
      expect(v.cx).toBeCloseTo(1200, 6);
    }
  });

  it('Bis 5 Pixel ist es ein Klick (Insel wählen), darüber ein Verschieben – auch wenn der Zeiger zurückkehrt', () => {
    const d = newDrag(), step = { dx: 0, dy: 0 };
    dragStart(d, 100, 100);
    expect(dragMove(d, 103, 104, step)).toBe(false); // genau 5 px
    expect(step.dx).toBe(0);
    expect(dragEnd(d)).toBe(true);
    dragStart(d, 100, 100);
    expect(dragMove(d, 104, 104, step)).toBe(true); // 5,66 px
    expect(step.dx).toBe(4); // vom Berührungspunkt an
    expect(dragMove(d, 100, 100, step)).toBe(true);
    expect(dragEnd(d)).toBe(false);
    expect(CLICK_SLOP).toBe(5);
  });

  it('Klemmung: stark gezoomt bleibt das Fenster auf der Karte, weit draußen die Karte zur Hälfte im Fenster', () => {
    expect(panLimit(1000)).toBe(MAP_EXTENT - 1000);
    expect(panLimit(MAP_EXTENT)).toBe(MAP_EXTENT * 0.5);
    expect(panLimit(MAP_EXTENT * 3)).toBe(MAP_EXTENT * 2);
  });
});

// ---------- Semantischer Zoom: Beschriftung ohne Überlappung ----------

describe('Weltkarte: Beschriftung', () => {
  it('Unter 1,15× erscheinen nur Städte, Festungen und das Hauptquartier; ab 1,15× alle', () => {
    expect(labelShown(3, 0.65)).toBe(true);
    expect(labelShown(2, 1.14)).toBe(false);
    expect(labelShown(1, 1.14)).toBe(false);
    expect(labelShown(2, LABEL_ZOOM)).toBe(true);
    expect(labelShown(1, 4.5)).toBe(true);
    expect(labelRank(byId('ankerglueck'))).toBe(3);
    expect(labelRank(byId('nebelhafen'))).toBe(2);
    expect(labelRank(byId('muschelruh'))).toBe(1);
  });

  it('Gesetzte Rechtecke überlappen sich nie', () => {
    const p = new LabelPlacer(16);
    expect(p.tryPlace(0, 0, 50, 12)).toBe(true);
    expect(p.tryPlace(40, 5, 90, 17)).toBe(false);
    expect(p.tryPlace(53, 0, 100, 12)).toBe(true);
    expect(p.tryPlace(0, 15, 50, 27)).toBe(true);
    for (let i = 0; i < 40; i++) p.tryPlace(i * 3, i * 2, i * 3 + 30, i * 2 + 12);
    expect(p.n).toBeLessThanOrEqual(16);
  });

  it('Alle Inselnamen der Welt in jeder Zoomstufe: kein Paar überlappt, sichtbar ist genau, was der Zoom erlaubt', () => {
    const W = 1440, H = 900;
    const sorted = ALL.slice().sort((a, b) => labelRank(b) - labelRank(a) || b.r - a.r);
    for (const zoom of [0.65, 1, 1.15, 2, 4.5]) {
      const v: MapView = { cx: 0, cz: 0, scale: 1 };
      centerOn(v, W, H, 0, 300, zoom);
      const p = new LabelPlacer(400);
      const s = { x: 0, y: 0 };
      let shown = 0;
      for (const i of sorted) {
        if (!labelShown(labelRank(i), zoom)) continue;
        worldToScreenInto(v, W, H, i.x, i.z, s);
        if (s.x < -80 || s.x > W + 80 || s.y < -60 || s.y > H + 60) continue;
        const w = i.name.length * 6.6, y = s.y - i.r * v.scale * 1.3 - 6;
        if (p.tryPlace(s.x - w / 2, y - 12, s.x + w / 2, y + 3)) shown++;
      }
      const r: number[] = [], q: number[] = [];
      for (let a = 0; a < p.n; a++) for (let b = a + 1; b < p.n; b++) {
        p.at(a, r); p.at(b, q);
        const overlap = r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1];
        expect(overlap).toBe(false);
      }
      expect(shown).toBeGreaterThan(zoom < LABEL_ZOOM ? 3 : 10);
    }
  });
});

// ---------- Entdeckung ----------

describe('Entdeckung und Kartierung', () => {
  const secrets = ALL.filter((i) => i.uncharted);

  it('Es gibt genau sieben Geheim-Inseln (vier seit 4.3B, drei seit 4.5C); keine ist von Anfang an kartiert', () => {
    expect(secrets).toHaveLength(7);
    for (const s of secrets) expect(isStartCharted(s)).toBe(false);
  });

  it('Start: Ankerglück und alles bis 3 050 m (seit 4.5C entzerrt, dieselben Inseln wie früher bis 2 400 m) sind kartiert, der Rest zeigt Umrisse, Geheim-Inseln nichts', () => {
    const known = new Set<string>();
    seedStartCharts(ALL, known);
    expect(known.has('ankerglueck')).toBe(true);
    for (const i of ALL) {
      const lvl = chartLevel(i, known);
      if (i.uncharted) expect(lvl).toBe('hidden');
      else if (Math.hypot(i.x, i.z) <= DISCOVERY.startRadius) expect(lvl).toBe('known');
      else expect(lvl).toBe('outline');
    }
    expect(ALL.some((i) => chartLevel(i, known) === 'outline')).toBe(true);
  });

  it('Normale Inseln werden ab 1 600 m Küstenabstand entdeckt, Geheim-Inseln erst ab 1 400 m', () => {
    const far = ALL.find((i) => !i.uncharted && Math.hypot(i.x, i.z) > 6000)!;
    const out: string[] = [];
    const known = new Set<string>();
    const dir = { x: far.x / Math.hypot(far.x, far.z), z: far.z / Math.hypot(far.x, far.z) };
    const at = (gap: number) => ({ x: far.x - dir.x * (far.r + gap), z: far.z - dir.z * (far.r + gap) });
    let p = at(1650);
    discoverNear([far], known, p.x, p.z, 1, out);
    expect(known.has(far.id)).toBe(false);
    p = at(1590);
    expect(discoverNear([far], known, p.x, p.z, 1, out)).toBe(1);
    expect(out).toEqual([far.id]);
    // die Liste wird wiederverwendet (kein neues Feld)
    expect(discoverNear([far], known, p.x, p.z, 1, out)).toBe(0);
    expect(out).toHaveLength(0);

    const sec = secrets[0];
    const sk = new Set<string>();
    const sd = { x: sec.x / Math.hypot(sec.x, sec.z), z: sec.z / Math.hypot(sec.x, sec.z) };
    const sp = (gap: number) => ({ x: sec.x - sd.x * (sec.r + gap), z: sec.z - sd.z * (sec.r + gap) });
    let q = sp(1500);
    discoverNear([sec], sk, q.x, q.z, 1.25, out); // Ausguck hilft bei Geheim-Inseln nicht
    expect(sk.has(sec.id)).toBe(false);
    q = sp(1390);
    discoverNear([sec], sk, q.x, q.z, 1, out);
    expect(sk.has(sec.id)).toBe(true);
    expect(DISCOVERY.near).toBe(1600);
    expect(DISCOVERY.secret).toBe(1400);
  });

  it('Anlegen oder Leuchtfeuer kartiert 3 200 m rundum – Geheim-Inseln bleiben verborgen', () => {
    const port = ALL.find((i) => i.kind === 'harbor' && Math.hypot(i.x, i.z) > 4000)!;
    const known = new Set<string>(), zones: ChartZone[] = [], out: string[] = [];
    chartAround(ALL, known, zones, port, out);
    expect(known.has(port.id)).toBe(true);
    expect(zones).toHaveLength(1);
    expect(zones[0].r).toBe(port.r + DISCOVERY.harborChart);
    for (const i of ALL) {
      const gap = Math.hypot(i.x - port.x, i.z - port.z) - i.r - port.r;
      if (i.uncharted) expect(known.has(i.id)).toBe(false);
      else if (gap <= 3200) expect(known.has(i.id)).toBe(true);
      else if (gap > 3300) expect(known.has(i.id)).toBe(false);
    }
    // nochmals: keine doppelte Zone, nichts Neues
    expect(chartAround(ALL, known, zones, port, out)).toBe(0);
    expect(zones).toHaveLength(1);
    // auch mit allen Geheim-Inseln im Umkreis bleiben sie verborgen
    for (const s of secrets) { chartAround(ALL, known, zones, { ...s, uncharted: false, id: `x-${s.id}`, kind: 'lighthouse' }, out); expect(known.has(s.id)).toBe(false); }
  });

  it('Spielstand-Daten: säubern, sortiert speichern, kaputte Einträge fallen weg', () => {
    const c = cleanChart({ islands: ['a', 'a', 7, '', 'b'], zones: [{ src: 'h', x: 1.4, z: 2.6, r: 3300 }, { src: 'h', x: 0, z: 0, r: 1 }, { src: 'k', x: NaN, z: 0, r: 5 }, 'x'] });
    expect(c.islands).toEqual(['a', 'b']);
    expect(c.zones).toEqual([{ src: 'h', x: 1, z: 3, r: 3300 }]);
    expect(chartToSave(new Set(['z', 'a']), c.zones)).toEqual({ islands: ['a', 'z'], zones: [{ src: 'h', x: 1, z: 3, r: 3300 }] });
    expect(cleanChart(null)).toEqual({ islands: [], zones: [] });
  });
});

// ---------- Schnellreise ----------

describe('Seekarten-Schnellreise', () => {
  const port = ALL.find((i) => i.kind === 'harbor' && Math.hypot(i.x, i.z) > 3000)!;
  const base = (o: Partial<TravelCtx> = {}): TravelCtx => ({
    dest: port, discovered: true, from: { x: 0, z: 0 }, standing: 10, tariff: 1, blockade: false, inCombat: false, inStorm: false, heat: 0, hunted: false,
    cargoUnits: 0, sailing: true, gold: 100000, provisions: 10, ...o,
  });

  it('Frei: Gold und Proviant wachsen mit der Strecke, der Hafen-Tarif wirkt aufs Gold', () => {
    const q = travelQuote(base());
    expect(q.ok).toBe(true);
    expect(q.lock).toBeNull();
    expect(q.reasons).toEqual([]);
    const near = travelCost(1000, 1), far = travelCost(8000, 1);
    expect(far.gold).toBeGreaterThan(near.gold);
    expect(far.provisions).toBeGreaterThan(near.provisions);
    expect(travelCost(8000, 1.35).gold).toBeGreaterThan(far.gold);
    expect(travelCost(8000, 0.8).gold).toBeLessThan(far.gold);
    expect(travelCost(0, 1)).toEqual({ gold: FAST_TRAVEL.minGold, provisions: FAST_TRAVEL.minProvisions });
  });

  it('Gesperrt bei Blockade, Kampf, Handelsfracht, Sturm, Fahndung und Verfemung – mit deutschem Hinweis', () => {
    const cases: [Partial<TravelCtx>, string, RegExp][] = [
      [{ blockade: true }, 'blockade', /Blockade/],
      [{ inCombat: true }, 'combat', /Kampf/],
      [{ cargoUnits: 3 }, 'cargo', /Handelsware/],
      [{ inStorm: true }, 'storm', /Sturm/],
      [{ heat: FAST_TRAVEL.heatLock }, 'wanted', /Fahndung/],
      [{ hunted: true }, 'wanted', /Fahndung/],
      [{ standing: -60 }, 'standing', /verfemt/],
      [{ discovered: false }, 'undiscovered', /entdeckt/],
      [{ sailing: false }, 'notSailing', /Schiff/],
      [{ gold: 0 }, 'gold', /Gold/],
      [{ provisions: 0 }, 'provisions', /Proviant/],
    ];
    for (const [o, lock, text] of cases) {
      const q = travelQuote(base(o));
      expect(q.ok, lock).toBe(false);
      expect(q.lock).toBe(lock);
      expect(q.reasons.join(' ')).toMatch(text);
    }
    // Ansehen −59 reicht noch
    expect(travelQuote(base({ standing: -59 })).ok).toBe(true);
    // mehrere Sperren werden alle genannt
    expect(travelQuote(base({ inCombat: true, cargoUnits: 1, blockade: true })).reasons).toHaveLength(3);
  });

  it('Nur Häfen und Städte sind Ziele', () => {
    expect(isTravelPort('harbor')).toBe(true);
    expect(isTravelPort('town')).toBe(true);
    for (const k of ['camp', 'lighthouse', 'marinefort', 'citadel', 'quiet'] as const) expect(isTravelPort(k)).toBe(false);
    const camp = ALL.find((i) => i.kind === 'camp')!;
    expect(travelQuote(base({ dest: camp })).lock).toBe('noPort');
  });

  it('Anlegeplatz: offenes Wasser seewärts der Stegspitze, Bug zum Hafen', () => {
    const isl = { x: 1000, z: 2000, r: 80 };
    const pier = { ax: 1000, az: 2080, bx: 1000, bz: 2150, hw: 3 };
    const out = { x: 0, z: 0, heading: 0 };
    // Wasser frei, wenn mindestens 45 m vom Steg und 60 m von der Küste
    const clear = (x: number, z: number) => Math.hypot(x - isl.x, z - isl.z) > isl.r + 60 && Math.hypot(x - pier.bx, z - pier.bz) > 45;
    const b = findBerth(isl, [pier], 50, clear, out)!;
    expect(b).not.toBeNull();
    expect(clear(b.x, b.z)).toBe(true);
    expect(b.z).toBeGreaterThan(pier.bz);
    const toIsland = Math.atan2(isl.x - b.x, isl.z - b.z);
    expect(Math.abs(b.heading - toIsland)).toBeLessThan(1e-9);
    expect(findBerth(isl, [pier], 50, () => false, out)).toBeNull();
  });

  it('Begleitschiffe laufen nach der Reise mit mehr als 45 m Abstand zu allen Stegen aus', () => {
    const flag = { x: 0, z: 0, heading: 0, L: 40, W: 10 };
    const own = { L: 30, W: 8 };
    // ein Steg genau dort, wo Backbord-Flanke und Nachhut lägen
    const piers = [{ ax: -60, az: -80, bx: 60, bz: -80, hw: 3 }, { ax: -40, az: -20, bx: 40, bz: -20, hw: 3 }];
    const dist = (x: number, z: number, p: (typeof piers)[number]) => {
      const t = Math.max(0, Math.min(1, ((x - p.ax) * (p.bx - p.ax) + (z - p.az) * (p.bz - p.az)) / ((p.bx - p.ax) ** 2 + (p.bz - p.az) ** 2)));
      return Math.hypot(x - (p.ax + t * (p.bx - p.ax)), z - (p.az + t * (p.bz - p.az))) - p.hw - own.W / 2;
    };
    const free = (x: number, z: number) => piers.every((p) => dist(x, z, p) > FAST_TRAVEL.arrivalClear);
    for (let idx = 0; idx < 3; idx++) {
      const pt = { x: 0, z: 0 };
      expect(fleetSpawnPoint(idx, flag, own, free, pt)).toBe(true);
      for (const p of piers) expect(dist(pt.x, pt.z, p)).toBeGreaterThan(45);
    }
  });
});

// ---------- Direkter Ausbau der Begleitschiffe ----------

describe('Werft → Flotte: Begleitschiffe direkt ausbauen', () => {
  const ctx = (): FleetCtx => ({ owned: [0, 1, 2], flagship: 2, evo: { '0': newShipEvolution(), '1': newShipEvolution() }, look: DEFAULT_SHIP_LOOK('pirat'), slots: 2 });

  it('hebt Rumpf, Segel und Kanonen bis Stufe 5, in ship.evo und im Eintrag der Flotte', () => {
    const c = ctx(), f = emptyFleet();
    const ship = { evo: c.evo };
    expect(assignShip(f, 1, c).ok).toBe(true);
    f.ships[0].status = 'docked'; // auch eingemottete Schiffe lassen sich ausbauen
    const before = fleetShipUpkeep(fleetShip(f, 'fleet-1')!).daily;
    for (let t = 2; t <= 5; t++) {
      const r = applyFleetEvo(ship, f, 'fleet-1', 'hull');
      expect(r.ok).toBe(true);
      expect(r.next).toBe(t);
    }
    expect(applyFleetEvo(ship, f, 'fleet-1', 'hull')).toEqual({ ok: false, reason: 'Höchste Stufe erreicht.' });
    expect(applyFleetEvo(ship, f, 'fleet-1', 'sail').ok).toBe(true);
    expect(applyFleetEvo(ship, f, 'fleet-1', 'cannon').ok).toBe(true);
    const rec = fleetShip(f, 'fleet-1')!;
    expect(rec.evo).toEqual({ hullTier: 5, sailTier: 2, cannonTier: 2 });
    expect(ship.evo['1']).toEqual(rec.evo);
    // das Flaggschiff bleibt unberührt, der Sold steigt mit der Gesamtstufe
    expect(ship.evo['2']).toBeUndefined();
    expect(fleetShipUpkeep(rec).daily).toBeGreaterThan(before);
    // Laden gleicht gegen ship.evo ab: der Ausbau bleibt erhalten
    const re = cleanFleet(JSON.parse(JSON.stringify(f)), { ...c, evo: ship.evo });
    expect(re.ships[0].evo).toEqual(rec.evo);
    expect(applyFleetEvo(ship, f, 'fleet-9', 'hull').ok).toBe(false);
  });
});

// ---------- Spielstand Version 19 ----------

describe('Spielstand: Weltkarte (Version 19)', () => {
  it('Ein Stand der Version 18 übernimmt besuchte und eroberte Inseln als entdeckt', () => {
    const s = createSave('Test', 'pirat', 't', 1) as unknown as Record<string, any>;
    s.version = 18;
    delete s.world.chart;
    delete s.world.seaEvents;
    s.progress.flags = { seen_nebelhafen: true, loot_kraehenfels: true, raidwon_koenigshafen: true, disc: ['moewennest'], quest_x: true };
    s.progress.conquest = { eisenfels: { islandId: 'eisenfels' } };
    const r = migrateSave(s, 't');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(18);
    expect(r.data.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(19);
    for (const id of ['nebelhafen', 'kraehenfels', 'koenigshafen', 'moewennest', 'eisenfels']) expect(r.data.world.chart!.islands).toContain(id);
    expect(r.data.world.chart!.islands).not.toContain('x');
    expect(r.data.world.chart!.zones).toEqual([]);
  });

  it('Ein früher Stand der Version 19 ohne Karte bekommt sie; eine gespeicherte Karte bleibt erhalten', () => {
    const s = createSave('Test', 'pirat', 't', 1) as unknown as Record<string, any>;
    delete s.world.chart;
    s.progress.flags = { seen_banda: true };
    const r = migrateSave(s, 't');
    expect(r.ok && r.data.world.chart!.islands).toEqual(['banda']);
    const t = createSave('Test', 'pirat', 't', 1);
    t.world.chart = { islands: ['knochenriff', 'nebelhafen'], zones: [{ src: 'nebelhafen', x: 10, z: 20, r: 3240 }] };
    const r2 = migrateSave(JSON.parse(JSON.stringify(t)), 't');
    expect(r2.ok && r2.data.world.chart).toEqual(t.world.chart);
    expect(legacyDiscovered({ flags: { beat_x: true, crystal_y: true, seen_z: false } }).sort()).toEqual(['x', 'y']);
    expect(chartOnLoad(undefined, undefined)).toEqual({ islands: [], zones: [] });
  });
});

// ---------- Mehr-Bild-Spawning normaler Feindschiffe ----------

describe('Feindschiffe entstehen ohne Ruckler', () => {
  it('Patrouillen, Jäger und Kopfgeldjäger laufen über die Warteschlange; Texturen werden Bild für Bild hochgeladen', async () => {
    const { readFileSync } = await import('node:fs');
    const naval = readFileSync(new URL('../src/naval/naval.ts', import.meta.url), 'utf8');
    expect(naval).toContain('if (this.pendingSpawns < 2) this.queueEnemy(p.x, p.z);');
    expect(naval).toContain("this.queueEnemy(p.x, p.z, 'jaeger', undefined, pick, true,");
    expect(naval).toContain('const ship = yield* Ship.buildSteps(this.scene, tier, look, foe,');
    expect(naval).toContain('yield* this.uploadSteps(ship);');
    expect(naval).toContain("if (tu.upload(t)) yield 'gpu';");
    expect(naval).toContain("if (r.value === 'gpu' || r.value === 'wait' || performance.now() - t0 >= NavalSystem.SPAWN_BUILD_MS) return;");
    // halbe Aufträge werden beim Leeren der See verworfen
    expect(naval.replace(/\r/g, '')).toMatch(/clear\(\) \{\n {4}this\.dropSpawns\(\);/);
  });

  it('Segeltexturen gleicher Optik sind geteilt und werden mit dem letzten Segel freigegeben', async () => {
    const { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry } = await import('three');
    const { cachedSailTexture, sailCacheStats } = await import('../src/render/textures');
    const { disposeObject } = await import('../src/render/dispose');
    let made = 0, disposed = 0;
    const make = () => { made++; const t = new CanvasTexture(undefined as unknown as HTMLCanvasElement); t.addEventListener('dispose', () => disposed++); return t; };
    const a = cachedSailTexture('test|weiß|1', make), b = cachedSailTexture('test|weiß|1', make), c = cachedSailTexture('test|weiß|2', make);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(made).toBe(2);
    expect(a.userData.staticCanvas).toBe(true);
    const base = sailCacheStats();
    const ma = new Mesh(new PlaneGeometry(), new MeshBasicMaterial({ map: a }));
    const mb = new Mesh(new PlaneGeometry(), new MeshBasicMaterial({ map: b }));
    disposeObject(ma);
    disposeObject(ma); // zweimal abbauen zählt nur einmal
    expect(disposed).toBe(0);
    disposeObject(mb);
    expect(disposed).toBe(1);
    expect(sailCacheStats().entries).toBe(base.entries - 1);
  });
});
