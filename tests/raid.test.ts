import { describe, expect, it } from 'vitest';
import { FACTION_IDS, CITADELS, type FactionId } from '../src/data/factions';
import { coastK, inBox, boxBlocker } from '../src/world/islandGround';
import { buildRaidLayout, pathLength, RAID_R } from '../src/raid/raidLayout';
import { createRaidContext, RaidInstanceSession } from '../src/raid/raidSession';
import { ESCORT_MAX, MARINE_SERVICE_STANDING, mercenarySlots, raidAccess, raidReward } from '../src/raid/raidRules';
import type { RaidSessionState } from '../src/raid/raidTypes';

const POWERS = FACTION_IDS;
const layoutFor = (id: FactionId, seaAngle = 1.1) => buildRaidLayout(id, 4711, seaAngle);
const landAt = (l: ReturnType<typeof layoutFor>, x: number, z: number, m = 0) => Math.hypot(x, z) < l.r * coastK(l.coast, Math.atan2(z, x)) - m;
const newSession = (id: FactionId = 'england', seaAngle = 1.1) => {
  const l = layoutFor(id, seaAngle);
  const ctx = createRaidContext({ raidInstanceId: `raid-${id}-1`, factionId: id, seed: 4711, leaderPlayerId: 'p1', escorts: 1 });
  return { l, s: new RaidInstanceSession(ctx, l) };
};

describe('Raid-Layout', () => {
  it('Wachschiffe starten mit dem Bug zu den Angreifern (Bereitstellungsplatz), nicht zur Insel (4.4.1)', () => {
    for (const id of FACTION_IDS) for (const sea of [0.3, 1.1, 2.6, 4.4]) {
      const L = layoutFor(id, sea);
      for (const g of L.guard) {
        const dx = L.staging.x - g.x, dz = L.staging.z - g.z, l = Math.hypot(dx, dz);
        expect(Math.sin(g.heading) * dx / l + Math.cos(g.heading) * dz / l).toBeGreaterThan(0.95);
      }
    }
  });
  it('ist deterministisch (gleicher seed, gleiche Anlage) und reine JSON-Daten', () => {
    const a = layoutFor('kurogane', 2.2), b = layoutFor('kurogane', 2.2);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(buildRaidLayout('kurogane', 99, 2.2)).not.toEqual(a);
  });

  it('misst rund 700 × 700 m', () => {
    for (const id of POWERS) {
      const l = layoutFor(id, 0.7 + FACTION_IDS.indexOf(id));
      let max = 0;
      for (let i = 0; i < 360; i++) max = Math.max(max, l.r * coastK(l.coast, (i / 360) * Math.PI * 2));
      expect(max, id).toBeGreaterThan(330);
      expect(max, id).toBeLessThan(380);
      expect(l.r).toBe(RAID_R);
    }
  });

  it('hat eine tiefe Bucht zur See hin und einen flachen Strand im Osten der Anlage', () => {
    const sea = 2.0;
    const l = layoutFor('england', sea);
    const bayA = sea; // Richtung der Bucht
    const k = coastK(l.coast, bayA);
    expect(k, 'Bucht').toBeLessThan(0.55);
    // gegenüber (zur Burg hin) liegt Land
    expect(coastK(l.coast, bayA + Math.PI)).toBeGreaterThan(0.85);
  });

  it('verriegelt die Bucht mit Seetor und Mauerflügeln (Pflicht) plus Türmen und drei Batterien (frei)', () => {
    const l = layoutFor('deutschland');
    const by = (id: string) => l.structures.find((s) => s.structureId === id)!;
    expect(l.structures.filter((s) => s.required).map((s) => s.structureId).sort()).toEqual(['seagate', 'wall_l', 'wall_r']);
    expect(l.structures.filter((s) => s.kind === 'battery')).toHaveLength(3);
    for (const b of l.structures.filter((s) => s.kind === 'battery')) expect(b.fire!.range).toBeGreaterThan(200);
    expect(new Set(l.structures.map((s) => s.structureId)).size).toBe(l.structures.length);
    // alle Bauwerke haben eigene Lebenspunkte; das Tor ist am stärksten unter den Pflichtteilen
    expect(by('seagate').maxHp).toBeGreaterThan(by('wall_l').maxHp);
    // Das Seetor steht im Wasser der Bucht: halbe Breite der Bucht ≈ 54–90 m, Tor und Mauern spannen sie ganz
    const spanL = by('wall_l'), spanR = by('wall_r'), gate = by('seagate');
    const total = gate.w + spanL.w + spanR.w;
    expect(total).toBeGreaterThanOrEqual(100);
  });

  it('legt alle Bauten, Viertel, Burg und Wege auf Land (mit Abstand zur Küste)', () => {
    for (const id of POWERS) {
      for (const sea of [0.4, 2.0, 3.9, 5.5]) {
        const l = layoutFor(id, sea);
        for (const d of l.districts) {
          for (const b of d.buildings) expect(landAt(l, b.x, b.z, 8), `${id}/${sea}/${d.districtId}/${b.t}`).toBe(true);
          for (const p of d.perches) expect(landAt(l, p.x, p.z, 8), `${id}/${p.perchId}`).toBe(true);
          for (const bar of d.barricades) expect(landAt(l, bar.x, bar.z, 4), `${id}/${bar.barricadeId}`).toBe(true);
          for (const w of d.waves) expect(landAt(l, w.x, w.z, 6), `${id}/${w.waveId}`).toBe(true);
        }
        expect(landAt(l, l.castle.x, l.castle.z, 40)).toBe(true);
        for (const [x, z] of l.paths.B) expect(landAt(l, x, z, 6), `${id}/${sea}/Weg B`).toBe(true);
        for (const [x, z] of l.paths.A.slice(1)) expect(landAt(l, x, z, 2), `${id}/${sea}/Weg A`).toBe(true);
      }
    }
  });

  it('hat vier Viertel in fester Reihenfolge mit deutlich mehr Gegnern als Route A', () => {
    const { l, s } = newSession('niederlande');
    expect(l.districts.map((d) => d.districtId)).toEqual(['strand', 'hafen', 'markt', 'aufstieg']);
    expect(l.districts.map((d) => d.label)).toEqual(['Flachland-Strand & Vorposten', 'Hafen- & Kontorviertel', 'Marktplatz & Kasernen-Barrikaden', 'Steiler Burgaufstieg']);
    const districtFoes = Object.values(s.state.districts).reduce((n, d) => n + d.total, 0);
    const castleFoes = l.castle.waves.reduce((n, w) => n + w.kinds.length, 0) + 1;
    expect(districtFoes).toBeGreaterThan(castleFoes * 2);
    for (const d of l.districts) { expect(d.perches.length).toBeGreaterThanOrEqual(2); expect(d.barricades.length).toBeGreaterThanOrEqual(1); expect(d.waves.length).toBeGreaterThanOrEqual(2); }
  });

  it('macht Route B deutlich länger als Route A', () => {
    for (const id of POWERS) {
      const l = layoutFor(id, 1.3);
      expect(pathLength(l.paths.B), id).toBeGreaterThan(pathLength(l.paths.A) * 3);
      expect(pathLength(l.paths.A), id).toBeLessThan(220);
    }
  });

  it('hat zwei Stege mit vier Liegeplätzen im Burghafen, drei Landungsbuchten am Strand und eine Wachflotte von fünf Schiffen', () => {
    const l = layoutFor('frankreich');
    expect(l.piers).toHaveLength(2);
    expect(l.slots.filter((s) => s.zone === 'harbor')).toHaveLength(4);
    expect(l.slots.filter((s) => s.zone === 'beach')).toHaveLength(3);
    expect(l.guard).toHaveLength(5);
    for (const g of l.guard) { expect(g.hull).toBeGreaterThanOrEqual(2.6); expect(g.tier).toBeGreaterThanOrEqual(4); }
    // Die Flotte steht im Wasser vor der Bucht, nicht auf Land
    for (const g of l.guard) expect(landAt(l, g.x, g.z)).toBe(false);
    expect(landAt(l, l.staging.x, l.staging.z)).toBe(false);
  });

  it('Boss der Burg stammt aus den Daten der Endgame-Inseln', () => {
    for (const c of CITADELS) expect(c.boss.length).toBeGreaterThan(3);
  });
});

describe('Raid-Sitzung (Schlachtzug-Logik)', () => {
  it('beginnt im Briefing, startet die Seeschlacht und führt vier gemeinsame Ziele', () => {
    const { s } = newSession();
    expect(s.phase).toBe('briefing');
    expect(s.state.ctx.sharedObjectives.map((o) => o.id)).toEqual(['fleet', 'breach', 'districts', 'keep']);
    s.start();
    expect(s.phase).toBe('sea');
    expect(s.objective('fleet').required).toBe(5);
    expect(s.unlockedSlots()).toHaveLength(0);
  });

  it('gibt die Landungszonen erst frei, wenn die Wachflotte gefallen ist (Strand sofort, Burghafen erst nach dem Durchbruch)', () => {
    const { s } = newSession();
    s.start();
    for (let i = 0; i < 4; i++) s.guardDown('p1');
    expect(s.state.landingOpen).toBe(false);
    expect(s.unlockedSlots()).toHaveLength(0);
    s.guardDown('p1');
    expect(s.state.landingOpen).toBe(true);
    expect(s.phase).toBe('assault');
    expect(s.unlockedSlots('beach')).toHaveLength(3);
    expect(s.unlockedSlots('harbor')).toHaveLength(0);
    expect(s.participant('p1')!.shipsSunk).toBe(5);
  });

  it('wertet Bauwerks-Schaden nach Munition, kennt INTACT / DAMAGED / BREACHED und öffnet nach dem Durchbruch den Burghafen', () => {
    const { l, s } = newSession();
    // vor dem Briefing-Ende kein Schaden
    expect(s.damageStructure('seagate', 100)).toBeNull();
    s.start();
    for (let i = 0; i < 5; i++) s.guardDown('p1');
    const events: string[] = [];
    s.on((e) => { if (e.type === 'structure') events.push(`${e.structureId}:${e.previous}>${e.state}`); if (e.type === 'slots') events.push(`slots:${e.zone}`); });
    const gate = l.structures.find((x) => x.structureId === 'seagate')!;
    // Kettenkugeln richten gegen Stein kaum etwas aus
    s.damageStructure('seagate', 14, 'kette', 'p1');
    expect(s.structure('seagate')!.hp).toBeGreaterThan(gate.maxHp - 20);
    // Kugeln: ab etwa 35 % Verlust beschädigt
    let state = s.structure('seagate')!.state;
    let n = 0;
    while (state === 'INTACT' && n++ < 200) state = s.damageStructure('seagate', 20, 'kugel', 'p1')!.state;
    expect(state).toBe('DAMAGED');
    while (s.structure('seagate')!.state !== 'BREACHED' && n++ < 400) s.damageStructure('seagate', 20, 'kugel', 'p1');
    expect(s.structure('seagate')!.state).toBe('BREACHED');
    expect(s.breached).toBe(false); // Mauerflügel stehen noch
    for (const id of ['wall_l', 'wall_r']) while (s.structure(id)!.state !== 'BREACHED' && n++ < 800) s.damageStructure(id, 25, 'kugel', 'p1');
    expect(s.breached).toBe(true);
    expect(s.objective('breach').done).toBe(true);
    expect(s.unlockedSlots('harbor')).toHaveLength(4);
    expect(s.route).toBe('A');
    expect(events).toContain('seagate:INTACT>DAMAGED');
    expect(events).toContain('seagate:DAMAGED>BREACHED');
    expect(events).toContain('slots:harbor');
    // eingerissene Bauwerke nehmen keinen Schaden mehr
    expect(s.damageStructure('seagate', 100)).toBeNull();
  });

  it('öffnet den Burghafen auch dann erst, wenn die Wachflotte gefallen ist, auch bei vorherigem Durchbruch', () => {
    const { s } = newSession();
    s.start();
    for (const id of ['seagate', 'wall_l', 'wall_r']) while (s.structure(id)!.state !== 'BREACHED') s.damageStructure(id, 400, 'kugel', 'p1');
    expect(s.breached).toBe(true);
    expect(s.unlockedSlots('harbor')).toHaveLength(0);
    for (let i = 0; i < 5; i++) s.guardDown('p1');
    expect(s.unlockedSlots('harbor')).toHaveLength(4);
  });

  it('teilt Anlege-Plätze zwischen Spielern: ein Liegeplatz fasst ein Schiff, eine Bucht beliebig viele', () => {
    const { s } = newSession();
    s.start();
    s.join('p2', 1, 0, 'ship-p2');
    for (const id of ['seagate', 'wall_l', 'wall_r']) while (s.structure(id)!.state !== 'BREACHED') s.damageStructure(id, 400);
    for (let i = 0; i < 5; i++) s.guardDown('p1');
    expect(s.claimSlot('harbor-1', 'p1')).toBe(true);
    expect(s.claimSlot('harbor-1', 'p2')).toBe(false);
    expect(s.claimSlot('harbor-2', 'p2')).toBe(true);
    expect(s.slot('harbor-1')!.occupiedBy).toBe('p1');
    s.releaseSlot('p1');
    expect(s.slot('harbor-1')!.occupiedBy).toBeNull();
    expect(s.claimSlot('beach-1', 'p1')).toBe(true);
    expect(s.claimSlot('beach-1', 'p2')).toBe(true);
    expect(s.slotNear(s.slot('beach-1')!.x + 3, s.slot('beach-1')!.z, 20, 'beach')!.slotId).toBe('beach-1');
    expect(s.slotNear(0, 0, 5)).toBeNull();
  });

  it('erobert Viertel: Betreten legt Route B fest, gefallene Gegner zählen für den Spieler, vier erobert = Ziel erfüllt', () => {
    const { s } = newSession();
    s.start();
    for (let i = 0; i < 5; i++) s.guardDown('p1');
    expect(s.enterDistrict('strand')).toBe(true);
    expect(s.enterDistrict('strand')).toBe(false);
    expect(s.route).toBe('B');
    expect(s.activeObjectives().map((o) => o.id)).toEqual(['fleet', 'districts', 'keep']);
    for (const d of Object.values(s.state.districts)) {
      s.enterDistrict(d.districtId);
      for (let i = 0; i < d.total; i++) s.districtFoe(d.districtId, 'p1');
    }
    expect(s.objective('districts').done).toBe(true);
    expect(s.participant('p1')!.kills).toBeGreaterThan(40);
  });

  it('endet mit Sieg, wenn der Kommandant fällt, und mit Rückzug, wenn alle Teilnehmer ausscheiden', () => {
    const a = newSession().s;
    a.start();
    const ends: string[] = [];
    a.on((e) => { if (e.type === 'end') ends.push(e.outcome); });
    a.keepFallen('p1');
    expect(a.phase).toBe('victory');
    expect(a.state.outcome).toBe('victory');
    expect(ends).toEqual(['victory']);
    a.end('retreat');
    expect(a.state.outcome).toBe('victory');

    const b = newSession().s;
    b.start();
    b.join('p2');
    b.down('p1');
    expect(b.phase).toBe('sea');
    b.down('p2');
    expect(b.phase).toBe('retreat');
    expect(b.join('p3')).toBeNull();
  });

  it('übergibt die Führung, wenn der Anführer geht, und skaliert die Gruppe', () => {
    const { s } = newSession();
    s.join('p2');
    s.join('p3');
    expect(s.partyScale).toBeCloseTo(2.2);
    s.leave('p1');
    expect(s.leaderId).toBe('p2');
    expect(s.participant('p2')!.leader).toBe(true);
    expect(s.partyScale).toBeCloseTo(1.6);
  });

  it('lässt sich als JSON speichern und wiederherstellen', () => {
    const { l, s } = newSession('kurogane');
    s.start();
    s.guardDown('p1');
    s.damageStructure('seagate', 100, 'kugel', 'p1');
    const copy = JSON.parse(JSON.stringify(s.toJSON())) as RaidSessionState;
    const r = RaidInstanceSession.restore(copy);
    expect(r.snapshot()).toEqual(s.snapshot());
    expect(r.structure('seagate')!.hp).toBe(s.structure('seagate')!.hp);
    expect(r.state.ctx.raidInstanceId).toBe('raid-kurogane-1');
    expect(l.structures.length).toBeGreaterThan(5);
  });
});

describe('Raid-Regeln', () => {
  it('lässt die fünf Mächte immer belagern; die Marine nur ohne hohen Dienststatus', () => {
    for (const id of ['england', 'niederlande', 'deutschland', 'frankreich', 'kurogane'] as FactionId[]) expect(raidAccess(id, { marineStanding: 100 }).allowed, id).toBe(true);
    expect(raidAccess('marine', { marineStanding: -40 })).toMatchObject({ allowed: true, safeBase: false });
    expect(raidAccess('marine', { marineStanding: MARINE_SERVICE_STANDING - 1 }).allowed).toBe(true);
    expect(raidAccess('marine', { marineStanding: MARINE_SERVICE_STANDING })).toMatchObject({ allowed: false, safeBase: true });
    expect(raidAccess('marine', { marineStanding: 100 }).safeBase).toBe(true);
  });

  it('begrenzt Begleitschiffe auf drei und zahlt Route B besser', () => {
    expect(mercenarySlots(0, 0)).toBe(ESCORT_MAX);
    expect(mercenarySlots(2, 1)).toBe(0);
    expect(mercenarySlots(1, 1)).toBe(1);
    expect(raidReward(18, 'B', true).gold).toBeGreaterThan(raidReward(18, 'A', true).gold);
    expect(raidReward(18, 'A', false).gold).toBeLessThan(raidReward(18, 'A', true).gold);
  });

  it('Kollisionsquader sind drehbar und messen richtig (Grundlage der Mauern)', () => {
    const b = boxBlocker(0, 0, 10, 2, Math.PI / 2);
    expect(inBox(b, 0, 4)).toBe(true);
    expect(inBox(b, 4, 0)).toBe(false);
  });
});
