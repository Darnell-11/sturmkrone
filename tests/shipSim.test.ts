import { describe, expect, it } from 'vitest';
import { AMMO } from '../src/data/ships';
import {
  applyDamage, applyStorm, createShipSim, crewEffects, crewFrac, crewHeads, crewPricePerHead, loseCrew, missingHeads, refillCrew, sailCurve,
  sailFrac, sailPerformance, setCrewFrac, shipTooltip, startRepair, stepPassiveRepair, stepRepair, stepSailSet, STORM_SAIL_FLOOR,
} from '../src/naval/shipSim';
import { mintEntityId, entityKind } from '../src/sim/entityId';

const mk = () => createShipSim('ship-test', 400, 400, 6);
const repairIntent = (shipId: string, material: 'segeltuch' | 'planken' | 'hafen' | 'notsegel') => ({ type: 'sailRepair' as const, entityId: 'foot-1', shipId, material });

describe('Segel-HP → Fahrleistung', () => {
  it('100 % = volle Fahrt, 0 % = nur noch Treiben', () => {
    const full = sailPerformance(1);
    expect(full.speed).toBe(1); expect(full.turn).toBe(1); expect(full.accel).toBe(1); expect(full.drift).toBe(0);
    const none = sailPerformance(0);
    expect(none.speed).toBe(0); expect(none.turn).toBe(0); expect(none.drift).toBe(1);
  });

  it('unter 30 % stark verlangsamt, stetig und streng steigend', () => {
    expect(sailCurve(0.3)).toBeCloseTo(0.45, 3);
    expect(sailCurve(0.29)).toBeLessThan(0.45);
    expect(sailCurve(0.1)).toBeLessThan(0.2);
    let prev = -1;
    for (let i = 0; i <= 100; i++) { const v = sailCurve(i / 100); expect(v).toBeGreaterThan(prev); prev = v; }
    // keine Sprünge: Nachbarwerte liegen eng beieinander
    for (let i = 0; i < 100; i++) expect(Math.abs(sailCurve((i + 1) / 100) - sailCurve(i / 100))).toBeLessThan(0.05);
  });

  it('Treiben setzt erst bei fast fehlendem Tuch ein', () => {
    expect(sailPerformance(0.2).drift).toBe(0);
    expect(sailPerformance(0.04).drift).toBeGreaterThan(0);
    expect(sailPerformance(0.04).drift).toBeLessThan(1);
  });
});

describe('Crew-% → Mechanik', () => {
  it('weniger Crew verlängert das Nachladen und verlangsamt das Setzen der Segel', () => {
    const a = crewEffects(1), b = crewEffects(0.5), c = crewEffects(0.1);
    expect(a.reloadMult).toBe(1);
    expect(b.reloadMult).toBeGreaterThan(1.4);
    expect(c.reloadMult).toBeGreaterThan(b.reloadMult);
    expect(a.sailSetRate).toBeGreaterThan(b.sailSetRate);
    expect(b.sailSetRate).toBeGreaterThan(c.sailSetRate);
  });

  it('die Rumpfreparatur ruht bei sehr kleiner Crew und nach einem Treffer', () => {
    const s = mk();
    s.hull = 200;
    const fx = crewEffects(1);
    stepPassiveRepair(s, 1, fx);          // sinceHit = 99 + 1: sofort aktiv
    expect(s.hull).toBeGreaterThan(200);
    const h = s.hull;
    applyDamage(s, 10, AMMO.kugel, 'hull');
    const afterHit = s.hull;
    stepPassiveRepair(s, 4, fx);
    expect(s.hull).toBe(afterHit);        // Ruhepause von 8 s
    stepPassiveRepair(s, 5, fx);
    expect(s.hull).toBeGreaterThan(afterHit);
    expect(h).toBeGreaterThan(200);
    expect(crewEffects(0.1).repairPerSec).toBe(0);
  });

  it('das Segelsetzen folgt dem Ziel mit der Crew-Geschwindigkeit (Reffen schneller)', () => {
    const fast = mk(), slow = mk();
    fast.sailSet = slow.sailSet = 0;
    for (let i = 0; i < 60; i++) { stepSailSet(fast, 1, 1 / 60, crewEffects(1)); stepSailSet(slow, 1, 1 / 60, crewEffects(0.2)); }
    expect(fast.sailSet).toBeGreaterThan(slow.sailSet * 2);
    const down = mk(); down.sailSet = 1;
    for (let i = 0; i < 60; i++) stepSailSet(down, 0, 1 / 60, crewEffects(1));
    expect(1 - down.sailSet).toBeGreaterThan(fast.sailSet);
  });

  it('Gruppen der Crew: Verluste, Auffüllen, Kennung je Schiff', () => {
    const s = mk();
    expect(crewFrac(s.crew)).toBe(1);
    const heads = crewHeads(s.crew);
    expect(heads.max).toBe(48);
    loseCrew(s.crew, 24);
    expect(crewFrac(s.crew)).toBeCloseTo(0.5, 5);
    expect(missingHeads(s.crew)).toBe(24);
    // falsche Schiffskennung wird abgelehnt
    expect(refillCrew(s.crew, { type: 'crewRefill', entityId: 'foot-1', shipId: 'ship-andere', heads: null })).toBe(0);
    expect(refillCrew(s.crew, { type: 'crewRefill', entityId: 'foot-1', shipId: 'ship-test', heads: 10 })).toBe(10);
    expect(missingHeads(s.crew)).toBe(14);
    expect(refillCrew(s.crew, { type: 'crewRefill', entityId: 'foot-1', shipId: 'ship-test', heads: null })).toBe(14);
    expect(crewFrac(s.crew)).toBe(1);
    setCrewFrac(s.crew, 0.25);
    expect(crewFrac(s.crew)).toBeCloseTo(0.25, 5);
    expect(crewPricePerHead(6)).toBeGreaterThan(crewPricePerHead(0));
  });
});

describe('Schaden an Segeln', () => {
  it('Kettenkugeln zerfetzen das Tuch stärker als Kugeln, Kugeln den Rumpf stärker als Ketten', () => {
    const a = mk(), b = mk();
    applyDamage(a, 20, AMMO.kette, 'sail');
    applyDamage(b, 20, AMMO.kugel, 'sail');
    expect(a.sail.hp).toBeLessThan(b.sail.hp);
    const c = mk(), d = mk();
    applyDamage(c, 20, AMMO.kugel, 'hull');
    applyDamage(d, 20, AMMO.kette, 'hull');
    expect(c.hull).toBeLessThan(d.hull);
    // Treffer im Tuch lassen den Rumpf fast heil
    const e = mk();
    applyDamage(e, 20, AMMO.kugel, 'sail');
    expect(400 - e.hull).toBeLessThan(10);
  });

  it('wenige Kettenkugeln nehmen das Segel ganz, dann 0 % (nie negativ)', () => {
    const s = mk();
    for (let i = 0; i < 20; i++) applyDamage(s, 25, AMMO.kette, 'sail');
    expect(s.sail.hp).toBe(0);
    expect(sailFrac(s)).toBe(0);
    expect(sailPerformance(sailFrac(s)).speed).toBe(0);
  });

  it('ein schwerer Sturm reißt gesetztes Tuch ein, gerefftes deutlich weniger, nie unter die Sturm-Untergrenze', () => {
    const full = mk(), reefed = mk();
    full.sailSet = 1;
    reefed.sailSet = 0.1;
    for (let i = 0; i < 60 * 60; i++) { applyStorm(full, 1 / 60, 1); applyStorm(reefed, 1 / 60, 1); }
    expect(sailFrac(full)).toBeLessThan(0.85);
    expect(sailFrac(reefed)).toBeGreaterThan(sailFrac(full));
    for (let i = 0; i < 60 * 60 * 30; i++) applyStorm(full, 1 / 60, 1);
    expect(sailFrac(full)).toBeCloseTo(STORM_SAIL_FLOOR, 2);
    // ruhige See: nichts
    const calm = mk();
    for (let i = 0; i < 600; i++) applyStorm(calm, 1 / 60, 0);
    expect(sailFrac(calm)).toBe(1);
  });
});

describe('Reparatur auf See', () => {
  it('Segeltuch flickt 40 % der Segel-HP nach der Arbeitszeit; Crew bestimmt die Dauer', () => {
    const s = mk();
    s.sail.hp = 0;
    const ok = startRepair(s, repairIntent('ship-test', 'segeltuch'), crewEffects(1));
    expect(ok).toBe(true);
    const total = s.repair!.total;
    // zweite Reparatur gleichzeitig: abgelehnt
    expect(startRepair(s, repairIntent('ship-test', 'planken'), crewEffects(1))).toBe(false);
    let done = null;
    for (let t = 0; t < total + 1 && !done; t += 0.1) done = stepRepair(s, 0.1);
    expect(done).not.toBeNull();
    expect(sailFrac(s)).toBeCloseTo(0.4, 2);
    const slow = mk(); slow.sail.hp = 0;
    startRepair(slow, repairIntent('ship-test', 'segeltuch'), crewEffects(0.2));
    expect(slow.repair!.total).toBeGreaterThan(total * 1.5);
  });

  it('Holzplanken bessern Rumpf und Segel; ohne Schaden gibt es nichts zu tun', () => {
    const s = mk();
    expect(startRepair(s, repairIntent('ship-test', 'planken'), crewEffects(1))).toBe(false);
    s.hull = 100; s.sail.hp = 10;
    expect(startRepair(s, repairIntent('ship-test', 'planken'), crewEffects(1))).toBe(true);
    stepRepair(s, 100);
    expect(s.hull).toBeCloseTo(100 + 0.12 * 400, 3);
    expect(s.sail.hp).toBeCloseTo(10 + 0.15 * s.sail.max, 3);
  });

  it('Notsegel gibt es nur bei fast fehlendem Tuch und bringt es auf 15 %', () => {
    const s = mk();
    s.sail.hp = s.sail.max * 0.5;
    expect(startRepair(s, repairIntent('ship-test', 'notsegel'), crewEffects(1))).toBe(false);
    s.sail.hp = 0;
    expect(startRepair(s, repairIntent('ship-test', 'notsegel'), crewEffects(1))).toBe(true);
    stepRepair(s, 100);
    expect(sailFrac(s)).toBeCloseTo(0.15, 3);
    expect(sailPerformance(sailFrac(s)).speed).toBeGreaterThan(0.1);
  });

  it('eine Absicht für ein anderes Schiff wird abgelehnt', () => {
    const s = mk(); s.sail.hp = 0;
    expect(startRepair(s, repairIntent('ship-fremd', 'segeltuch'), crewEffects(1))).toBe(false);
  });

  it('die Werft stellt sofort alles her', () => {
    const s = mk(); s.sail.hp = 0; s.hull = 10;
    expect(startRepair(s, repairIntent('ship-test', 'hafen'), crewEffects(1))).toBe(true);
    expect(sailFrac(s)).toBe(1); expect(s.hull).toBe(400);
  });
});

describe('Zustand ist serialisierbar', () => {
  it('JSON-Hin-und-zurück ändert nichts, es stecken keine Objekte mit Methoden darin', () => {
    const s = mk();
    applyDamage(s, 30, AMMO.kette, 'sail');
    startRepair(s, repairIntent('ship-test', 'segeltuch'), crewEffects(1));
    const copy = JSON.parse(JSON.stringify(s));
    expect(copy).toEqual(s);
    expect(copy.shipId).toBe('ship-test');
    expect(copy.crew.shipId).toBe('ship-test');
  });

  it('Tooltip nennt Segel-%, Crew-% und ihre Wirkung', () => {
    const s = mk();
    s.sail.hp = s.sail.max * 0.2;
    setCrewFrac(s.crew, 0.5);
    const t = shipTooltip(s);
    expect(t).toContain('Segel 20 %');
    expect(t).toContain('stark verlangsamt');
    expect(t).toContain('Crew 50 %');
    expect(t).toContain('Nachladen');
  });
});

describe('Entity-Kennungen', () => {
  it('sind eindeutig und tragen die Art', () => {
    const a = mintEntityId('foot'), b = mintEntityId('foot'), c = mintEntityId('ship');
    expect(new Set([a, b, c]).size).toBe(3);
    expect(entityKind(a)).toBe('foot');
    expect(entityKind(c)).toBe('ship');
  });
});
