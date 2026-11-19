import { describe, expect, it } from 'vitest';
import { NavAgent, NavGrid, NavPath, WEDGE_AFTER, inThinBox, unstick } from '../src/ai/navGrid';
import { formationSlot, MAX_SQUADS, OFFICER_SLOTS, officerSlots, SQUAD_MAX_HEADS, TROOP_CAPACITY, troopCapacity } from '../src/data/crewTiers';
import { SHIP_CLASSES } from '../src/data/ships';
import { addTroops, clampRoster, cleanRoster, planSquads, rosterTotal, scaleRoster, troopHeadStats, TROOPS, type TroopRoster } from '../src/data/troops';
import { defaultParty } from '../src/data/crew';
import { followSlotPos, TroopSquad, type SoftBody, type TroopFoe, type TroopWorld } from '../src/entities/troops/squad';
import { formationOffset } from '../src/entities/troops/troopRender';
import { activeParty } from '../src/core/crewRoster';

describe('Offiziers-Plätze und Truppen-Kapazität je Schiffsklasse', () => {
  it('Schaluppe/Brigg 2, Korvette/Fregatte 3, Galeone/Linienschiff 4, Leviathan 5', () => {
    expect(OFFICER_SLOTS.length).toBe(SHIP_CLASSES.length);
    expect(SHIP_CLASSES.map((c) => c.id)).toEqual(['schaluppe', 'brigg', 'korvette', 'fregatte', 'galeone', 'linienschiff', 'leviathan']);
    expect([0, 1, 2, 3, 4, 5, 6].map(officerSlots)).toEqual([2, 2, 3, 3, 4, 4, 5]);
  });

  it('Massentruppen trägt nur der Leviathan (Rang 9)', () => {
    expect(TROOP_CAPACITY.length).toBe(SHIP_CLASSES.length);
    expect([0, 1, 2, 3, 4, 5].every((t) => troopCapacity(t) === 0)).toBe(true);
    expect(troopCapacity(6)).toBe(100);
    expect(SHIP_CLASSES[6].rank).toBe(9);
    // außerhalb des Bereichs wird geklemmt, nie ein Fehler
    expect(officerSlots(99)).toBe(5);
    expect(officerSlots(-3)).toBe(2);
  });

  it('defaultParty und activeParty richten sich nach den Plätzen', () => {
    const hired = ['cook', 'carp', 'nav', 'gun', 'arzt', 'ram', 'cat'];
    expect(defaultParty(hired, 2)).toHaveLength(2);
    expect(defaultParty(hired, 5)).toHaveLength(5);
    expect(defaultParty(hired, 5)).not.toContain('cat');
    // Reserve bleibt erhalten, aktiv sind nur die ersten `Plätze`
    const party = defaultParty(hired, 5);
    expect(activeParty(party, 0)).toEqual(party.slice(0, 2));
    expect(activeParty(party, 6)).toEqual(party);
  });

  it('Aufstellung der Offiziere: fünf Plätze, keine zwei am selben Ort', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) { const s = formationSlot(i); seen.add(`${s.side}|${s.back}`); expect(s.back).toBeGreaterThan(1); }
    expect(seen.size).toBe(5);
  });
});

describe('Truppen-Bestand', () => {
  it('namenlos: nur Typ → Köpfe; Unsinn wird bereinigt', () => {
    expect(cleanRoster({ schwert: 12, musketier: -4, quatsch: 9, schlaeger: 'x' })).toEqual({ schwert: 12 });
    expect(cleanRoster(null)).toEqual({});
    expect(cleanRoster({ schwert: 3.9 })).toEqual({ schwert: 3 });
  });

  it('anheuern nur bis zur Kapazität', () => {
    const r: TroopRoster = { schwert: 90 };
    expect(addTroops(r, 'musketier', 30, 100)).toBe(10);
    expect(rosterTotal(r)).toBe(100);
    expect(addTroops(r, 'schwert', 5, 100)).toBe(0);
  });

  it('verhältnismäßig kürzen und skalieren, Summe stimmt immer', () => {
    const r: TroopRoster = { schwert: 40, musketier: 35, schlaeger: 25 };
    for (const want of [0, 1, 7, 33, 64, 100]) expect(rosterTotal(scaleRoster(r, want))).toBe(want);
    expect(rosterTotal(clampRoster(r, 50))).toBe(50);
    expect(clampRoster(r, 500)).toEqual(r);
    // Mischung bleibt ungefähr erhalten
    const half = scaleRoster(r, 50);
    expect(half.schwert).toBe(20);
  });

  it('Trupps: höchstens 6, je höchstens 20 Köpfe, kein Kopf geht verloren', () => {
    const cases: TroopRoster[] = [{ schwert: 100 }, { schwert: 40, musketier: 30, schlaeger: 30 }, { schwert: 1 }, { schwert: 21, musketier: 21, schlaeger: 21 }, { musketier: 99 }];
    for (const r of cases) {
      const plan = planSquads(r);
      expect(plan.length).toBeLessThanOrEqual(MAX_SQUADS);
      expect(plan.reduce((n, p) => n + p.heads, 0)).toBe(rosterTotal(r));
      for (const p of plan) expect(p.heads).toBeGreaterThan(0);
    }
    expect(planSquads({ schwert: 100 }).map((p) => p.heads)).toEqual([20, 20, 20, 20, 20]);
    expect(planSquads({ schwert: 40, musketier: 30, schlaeger: 30 }).length).toBe(MAX_SQUADS);
    expect(planSquads({ schwert: 40 }).every((p) => p.heads <= SQUAD_MAX_HEADS)).toBe(true);
    expect(planSquads({})).toEqual([]);
  });

  it('Stufe macht Köpfe stärker (höchstens ×4)', () => {
    expect(troopHeadStats('schwert', 1).hp).toBe(TROOPS.schwert.hp);
    expect(troopHeadStats('schwert', 21).hp).toBeCloseTo(TROOPS.schwert.hp * 2, 5);
    expect(troopHeadStats('schwert', 9999).hp).toBeCloseTo(TROOPS.schwert.hp * 4, 5);
  });
});

// ---------- TroopSquad ----------

const foe = (x: number, z: number, hp = 1e9): TroopFoe & { hp: number } => ({ x, z, radius: 0.45, hp, get alive() { return this.hp > 0; } } as TroopFoe & { hp: number });

function world(foes: (TroopFoe & { hp: number })[], log: { dmg: number; hits: number } = { dmg: 0, hits: 0 }): TroopWorld {
  return {
    enemies: () => foes,
    hit: (e, dmg) => { (e as unknown as { hp: number }).hp -= dmg; log.dmg += dmg; log.hits++; },
    ground: { height: () => 0, constrain: (x, z) => ({ x, z }) },
    nav: () => null,
  };
}

const run = (q: TroopSquad, w: TroopWorld, player: { x: number; z: number; yaw: number }, secs: number, soft: SoftBody[] = []) => {
  for (let i = 0; i < secs * 60; i++) q.update(1 / 60, player, w, soft);
};

describe('TroopSquad', () => {
  const P = { x: 0, z: 0, yaw: 0 };

  it('Zustand ist serialisierbar: squadId, ownerPlayerId, typ, heads, hp, x, z, yaw, commandState', () => {
    const q = new TroopSquad('schwert', 18, 5, 'foot-7');
    q.place(3, 4, 1.2, { height: () => 0, constrain: (x, z) => ({ x, z }) });
    const st = JSON.parse(JSON.stringify(q.state));
    expect(Object.keys(st).sort()).toEqual(['commandState', 'heads', 'hp', 'level', 'ownerPlayerId', 'squadId', 'typ', 'x', 'yaw', 'z']);
    expect(st.squadId).toMatch(/^squad-\d+$/);
    expect(st.ownerPlayerId).toBe('foot-7');
    const back = TroopSquad.fromState(st);
    expect(back.state).toMatchObject({ typ: 'schwert', heads: 18, x: 3, z: 4, commandState: 'sturm' });
  });

  it('Treffer kosten Lebenspunkte und Köpfe; bei 0 ist der Trupp tot', () => {
    const q = new TroopSquad('schwert', 10, 1, 'foot-1');
    const hpHead = TROOPS.schwert.hp;
    q.receive(hpHead * 2.5, 1, 0);            // 2,5 Köpfe Schaden: zwei fallen, einer ist verwundet
    expect(q.heads).toBe(8);
    expect(q.lostHeads).toBe(2);
    q.receive(1e6, 1, 0);
    expect(q.heads).toBe(0);
    expect(q.alive).toBe(false);
    expect(q.present).toBe(false);
  });

  it('Sturmangriff läuft auf den Gegner zu und kämpft; Schaden wächst mit den Köpfen', () => {
    const big = new TroopSquad('schwert', 20, 1, 'foot-1', 0.3), small = new TroopSquad('schwert', 5, 1, 'foot-1', 0.3);
    const dmg = (q: TroopSquad) => {
      q.place(0, 0, 0, { height: () => 0, constrain: (x, z) => ({ x, z }) });
      const log = { dmg: 0, hits: 0 };
      const e = foe(0, 18);
      run(q, world([e], log), P, 12);
      return { log, q };
    };
    const a = dmg(big), b = dmg(small);
    expect(a.log.hits).toBeGreaterThan(3);
    expect(a.q.z).toBeGreaterThan(10);
    expect(a.log.dmg).toBeGreaterThan(b.log.dmg * 2.5);
  });

  it('Befehl „Position halten“ bleibt am Platz und greift nur nahe Gegner an', () => {
    const q = new TroopSquad('schwert', 10, 1, 'foot-1', 0.4);
    const g = { height: () => 0, constrain: (x: number, z: number) => ({ x, z }) };
    q.place(5, 5, 0, g);
    q.command('halten');
    const far = foe(5, 30);
    run(q, world([far]), { x: 40, z: 40, yaw: 0 }, 8);
    expect(Math.hypot(q.x - 5, q.z - 5)).toBeLessThan(1);
    expect(far.hp).toBe(1e9);
    // ein Gegner in Schlagreichweite des Haltepunkts wird bekämpft
    const near = foe(5, 8);
    const log = { dmg: 0, hits: 0 };
    run(q, world([near], log), { x: 40, z: 40, yaw: 0 }, 6);
    expect(log.hits).toBeGreaterThan(0);
    expect(Math.hypot(q.x - 5, q.z - 5)).toBeLessThan(5.1);
  });

  it('Befehl „Folgen“ bleibt bei der Spielfigur und ignoriert ferne Gegner', () => {
    const q = new TroopSquad('schwert', 10, 1, 'foot-1', 0.4);
    const g = { height: () => 0, constrain: (x: number, z: number) => ({ x, z }) };
    q.place(0, 0, 0, g);
    q.command('folgen');
    const far = foe(0, 60);
    const player = { x: 20, z: 0, yaw: Math.PI / 2 };
    run(q, world([far]), player, 20);
    expect(far.hp).toBe(1e9);
    expect(Math.hypot(q.x - player.x, q.z - player.z)).toBeLessThan(9);
  });

  it('Verbündete schieben die Spielfigur nie: die KI liest ihre Lage nur, ändert sie nie, und kennt sie nicht als weichen Körper', () => {
    const q = new TroopSquad('schwert', 20, 1, 'foot-1', 0.5);
    const g = { height: () => 0, constrain: (x: number, z: number) => ({ x, z }) };
    q.place(0, 0, 0, g);
    const player = Object.freeze({ x: 0.2, z: 0.1, yaw: 0 });  // unveränderlich: jeder Schreibzugriff würde werfen
    expect(() => run(q, world([foe(0, 10)]), player, 6)).not.toThrow();
    expect(player).toEqual({ x: 0.2, z: 0.1, yaw: 0 });
  });

  it('Trupps und Offiziere trennen sich weich (≤ 3 m/s), sie springen nicht', () => {
    const a = new TroopSquad('schwert', 20, 1, 'foot-1', 0.1), b = new TroopSquad('schwert', 20, 1, 'foot-1', 0.9);
    const g = { height: () => 0, constrain: (x: number, z: number) => ({ x, z }) };
    a.place(0, 0, 0, g); b.place(0.5, 0, 0, g);
    a.command('halten'); b.command('halten');
    const bodies = (): SoftBody[] => [{ x: a.x, z: a.z, radius: a.sepRadius(), owner: a }, { x: b.x, z: b.z, radius: b.sepRadius(), owner: b }];
    let maxStep = 0;
    for (let i = 0; i < 180; i++) {
      const px = a.x, pz = a.z;
      const soft = bodies();
      a.update(1 / 60, P, world([]), soft);
      b.update(1 / 60, P, world([]), soft);
      maxStep = Math.max(maxStep, Math.hypot(a.x - px, a.z - pz));
    }
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1.5);
    expect(maxStep).toBeLessThanOrEqual(3 / 60 + 0.01);
  });

  it('Aufstellung: Trupps halten Abstand von der Spielfigur', () => {
    const out = { x: 0, z: 0 };
    for (let slot = 0; slot < 6; slot++) {
      followSlotPos(slot, { x: 10, z: 10, yaw: 0.7 }, out);
      expect(Math.hypot(out.x - 10, out.z - 10)).toBeGreaterThan(3);
    }
  });

  it('Übersetzen: im Boot/Sprung nicht angreifbar, danach an Land', () => {
    const q = new TroopSquad('schwert', 12, 1, 'foot-1', 0.2);
    const g = { height: () => 0, constrain: (x: number, z: number) => ({ x, z }) };
    q.place(10, 10, 0, g);
    q.startLanding({ fromX: 0, fromZ: 0, fromY: 0, delay: 0.5, total: 2, boat: true });
    expect(q.alive).toBe(false);
    const hp = q.hp;
    q.receive(1e6, 0, 0);                 // im Boot nicht zu treffen
    expect(q.hp).toBe(hp);
    run(q, world([]), P, 3);
    expect(q.landing).toBeNull();
    expect(q.alive).toBe(true);
  });

  it('Leistung: 6 Trupps × 20 Köpfe gegen 12 Gegner, 10 Sekunden Spielzeit in unter 100 ms', () => {
    const g = { height: () => 0, constrain: (x: number, z: number) => ({ x, z }) };
    const squads = Array.from({ length: 6 }, (_, i) => { const q = new TroopSquad(i % 2 ? 'musketier' : 'schwert', 20, 10, 'foot-1', i / 6); q.place(i * 3, 0, 0, g); return q; });
    const foes = Array.from({ length: 12 }, (_, i) => foe(i * 2 - 10, 14 + (i % 3) * 4));
    const w = world(foes);
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) {
      const soft = squads.map((q) => ({ x: q.x, z: q.z, radius: q.sepRadius(), owner: q }));
      for (const q of squads) q.update(1 / 60, P, w, soft);
    }
    expect(performance.now() - t0).toBeLessThan(100);
  });
});

describe('Aufstellung im Trupp', () => {
  it('Köpfe stehen nie aufeinander (Mindestabstand), auch bei 20 Köpfen', () => {
    for (const n of [1, 5, 12, 20]) {
      const pts = Array.from({ length: n }, (_, i) => { const o = formationOffset(i, n, 1, 0.37, { lat: 0, fwd: 0, row: 0 }); return [o.lat, o.fwd]; });
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])).toBeGreaterThan(0.35);
    }
  });
});


describe('Verkeilt? Befreiung nach 2,5 s (NavAgent.wedged, unstick)', () => {
  /** Boden mit einer Wand bei x ∈ [4, 5] (z von −2 bis 2): constrain schiebt heraus */
  const wall = { constrain: (x: number, z: number) => (x > 4 && x < 5 && Math.abs(z) < 2 ? { x: 4, z } : { x, z }) };

  it('meldet verkeilt erst nach WEDGE_AFTER Sekunden ohne Fortschritt und löscht das mit clearWedge', () => {
    const a = new NavAgent(), out = { x: 0, z: 0 };
    let t = 0;
    while (t < WEDGE_AFTER - 0.1) { a.steer(null, 0, 0, 5, 0, 0.4, 1 / 60, out); t += 1 / 60; }
    expect(a.wedged).toBe(false);
    while (t < WEDGE_AFTER + 0.1) { a.steer(null, 0, 0, 5, 0, 0.4, 1 / 60, out); t += 1 / 60; }
    expect(a.wedged).toBe(true);
    a.clearWedge();
    expect(a.wedged).toBe(false);
  });

  it('wer vorankommt, wird nie als verkeilt gemeldet', () => {
    const a = new NavAgent(), out = { x: 0, z: 0 };
    let x = 0;
    for (let i = 0; i < 600; i++) { a.steer(null, x, 0, 50, 0, 0.4, 1 / 60, out); x += 3 / 60; }
    expect(a.wedged).toBe(false);
  });

  it('setzt auf einen freien Punkt, der dem Ziel nicht ferner liegt, sonst auf das nahe Ziel', () => {
    const u = unstick(wall, 3.9, 0, 8, 0, 0.4, 0);
    expect(u).not.toBeNull();
    const c = wall.constrain(u!.x, u!.z);
    expect(c).toEqual({ x: u!.x, z: u!.z });
    expect(Math.hypot(8 - u!.x, 0 - u!.z)).toBeLessThanOrEqual(Math.hypot(8 - 3.9, 0) + 1);
    // Ziel mitten in der Wand: weiter als 12 m weg → keine Rettung durch das Ziel, aber ein freier Nachbarpunkt wird gefunden oder null
    const far = unstick({ constrain: () => ({ x: 0, z: 0 }) }, 50, 50, 80, 80, 0.4, 0);
    expect(far).toBeNull();
  });
});


describe('NavGrid: dünne Wände, kleine Pfosten und lange Wege um Mauern', () => {
  const isl = (blockers: any[]) => ({ x: 0, z: 0, r: 40, coast: [], blockers } as any);
  const wallY = [{ x: 0, z: 0, r: 20, hw: 0.1, hd: 20, yaw: 0 }];        // 0,2 m dünne Mauer entlang z mit Lücke an den Enden

  it('eine 0,2 m dünne Mauer ist im Raster lückenlos (vorher nur jede dritte Zelle)', () => {
    const nav = new NavGrid(isl(wallY));
    for (let z = -19; z <= 19; z += 0.3) expect(nav.clearAt(0.05, z)).toBe(0);
    expect(inThinBox({ x: 0, z: 0, hw: 0.1, hd: 20, yaw: 0 }, 0.28, 0, 0.6)).toBe(true);
    // konservativ: gesperrt ist jede Zelle, die der Quader berührt (Zellmitte bis 0,1 + 0,3 m); darüber hinaus frei
    expect(inThinBox({ x: 0, z: 0, hw: 0.1, hd: 20, yaw: 0 }, 0.45, 0, 0.6)).toBe(false);
  });

  it('Fugen zwischen aneinanderstoßenden Mauerstücken lassen im 1-m-Raster keinen Durchschlupf (Burgring der Raids)', () => {
    // zwei 6 m lange, 2,2 m dicke Stücke mit 0,2 m Fuge (Mitte x = 3,1); vorher blieb dort bei manchen Lagen ein Zellband frei
    for (const shift of [0, 0.15, 0.3, 0.45, 0.6, 0.8]) {
      const nav = new NavGrid({ x: 0, z: 0, r: 170, coast: [], blockers: [{ x: -3.1 + shift, z: 0, r: 4, hw: 3, hd: 1.1, yaw: 0 }, { x: 3.1 + shift, z: 0, r: 4, hw: 3, hd: 1.1, yaw: 0 }] } as any);
      expect(nav.cell).toBe(1);
      for (let z = -1; z <= 1; z += 0.25) for (let x = -5.5; x <= 5.5; x += 0.25) expect(nav.clearAt(x + shift, z)).toBe(0);
    }
    // gedrehtes Paar (Tangente eines Rings): ebenfalls dicht
    const yaw = 0.35, c = Math.cos(yaw), s = Math.sin(yaw);
    const nav = new NavGrid({ x: 0, z: 0, r: 170, coast: [], blockers: [{ x: -3.1 * c, z: 3.1 * s, r: 4, hw: 3, hd: 1.1, yaw }, { x: 3.1 * c, z: -3.1 * s, r: 4, hw: 3, hd: 1.1, yaw }] } as any);
    for (let t = -5.5; t <= 5.5; t += 0.25) expect(nav.clearAt(t * c, -t * s)).toBe(0);
  });

  it('kleine runde Pfosten (r 0,15) sperren mindestens eine Zelle', () => {
    const nav = new NavGrid(isl([{ x: 3.3, z: 2.2, r: 0.15 }]));
    expect(nav.clearAt(3.3, 2.2)).toBe(0);
  });

  it('plant einen Weg um die Mauer herum (um das Ende, nie hindurch) und gibt auch auf langen Strecken nicht auf', () => {
    const nav = new NavGrid(isl([{ x: 0, z: 0, r: 30, hw: 0.1, hd: 30, yaw: 0 }]));
    const p = new NavPath();
    const ok = nav.findPath(-12, 0, 12, 0, 0.45, p);
    expect(ok).toBe(true);
    // jeder Teil des Wegs bleibt hinter der Mauerlinie: der Weg quert x = 0 nur außerhalb der Mauer (|z| > 30), also gar nicht in der Insel (r 40 deckt z bis 40)
    let x = -12, z = 0;
    for (let i = 0; i < p.n; i++) {
      const tx = p.pts[i * 2], tz = p.pts[i * 2 + 1], n = Math.ceil(Math.hypot(tx - x, tz - z) / 0.2);
      for (let k = 1; k <= n; k++) { const qx = x + ((tx - x) * k) / n, qz = z + ((tz - z) * k) / n; if (Math.abs(qx) < 0.15) expect(Math.abs(qz)).toBeGreaterThan(29.5); }
      x = tx; z = tz;
    }
  });
});
