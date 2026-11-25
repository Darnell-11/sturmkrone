// Phase 4.5D: die fünf Kaiser-Zitadellen in Ring 5, ihre dreiphasige Schlacht (Seesperre mit Hafenkette, doppelter Festungsring, Kaiser), die zwölf
// Archipel-Inseln, die Sturmkrone-Ruinen als Stufe 4, die Kriegsreichweite 6 800 m und der Spielstand (Ruhezeit der Kaiser, alte Stände).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ISLAND_REACH, REGIONS } from '../src/data/regions';
import { SITES } from '../src/data/settlements';
import { KAISER_SITES } from '../src/data/worldRings';
import { SECTORS, sectorAt } from '../src/data/factions';
import { PLAYABLE_RADIUS } from '../src/data/world';
import { WAR } from '../src/data/nations';
import { KAISER_BOSS_HIT_CAP, RAID_BOSS_HIT_CAP } from '../src/data/balanceConfig';
import { MEGA_BY_ID, MEGA_IDS, isMegaId, type KaiserId } from '../src/data/megaIslands';
import {
  KAISER_IDS, KAISER_ISLANDS, KAISER_SPECS, KAISER_SPEC_BY_ID, kaiserBlockade, kaiserLayout, kaiserRingPosts, kaiserThrone, ringWall,
} from '../src/data/kaiserIslands';
import {
  KAISER, bossAppeared, bossDefeated, bossPhase, bossShouldAppear, canLand, cleanKaiserSave, clearRing, damageBastion, enterRing, guardDown, kaiserBossDef,
  kaiserCooldownLeft, kaiserFromSave, kaiserOfficerDef, kaiserToSave, newKaiserBattle, retreatRings, rollKaiserLoot, tickKaiser,
} from '../src/data/kaiserBattle';
import { ARCHIPELS, THEME_ISLANDS, coastOf, plotCenter } from '../src/data/openWorld';
import { themeItems } from '../src/data/openWorld';
import { buildBlueprints } from '../src/world/islandBlueprint';
import { NationRegistry, warIslandOf, warWorldFromDefs } from '../src/world/factionWarEngine';
import { migrateSave } from '../src/core/save/migrations';
import { SAVE_VERSION, createSave } from '../src/core/save/types';
import { cleanUnlocks } from '../src/raid/occupation';
import { WORLD_RADIUS } from '../src/data/world';
import { fitScale, setMapSafeArea } from '../src/ui/mapView';
import { defaultLayers, drawWorldMap, lastLabels } from '../src/ui/worldMapDraw';
import type { WorldMapData } from '../src/ui/minimap';

const ALL = REGIONS.flatMap((r) => r.islands);
const KAISERS = ALL.filter((i) => i.kaiser);
const byId = (id: string) => ALL.find((i) => i.id === id)!;

// ---------- 1. Fünf Kaiser-Inseln ----------

describe('Fünf Kaiser-Zitadellen auf den reservierten Plätzen bei 14 200 m', () => {
  it('je Macht eine, genau auf ihrem Bauplatz, Ring 5, Gefahrenstufe 5, 950 – 1 250 m Durchmesser', () => {
    expect(KAISERS).toHaveLength(5);
    expect(KAISER_IDS).toEqual(['britannia', 'batavia', 'kaiserdom', 'solis', 'tenkoku']);
    for (const k of KAISER_SITES) {
      const isl = KAISERS.find((i) => Math.hypot(i.x - k.x, i.z - k.z) < 1)!;
      expect(isl, k.id).toBeTruthy();
      expect(isl.factionId).toBe(k.power);
      expect(sectorAt(isl.x, isl.z).factionId).toBe(k.power);
      expect(isl.ring).toBe(5);
      expect(isl.dangerTier).toBe(5);
      expect(isl.r * 2).toBeGreaterThanOrEqual(950);
      expect(isl.r * 2).toBeLessThanOrEqual(1250);
      // der ganze Platzbedarf bleibt diesseits der Sturm-Barriere
      expect(Math.hypot(isl.x, isl.z) + isl.r * ISLAND_REACH).toBeLessThan(PLAYABLE_RADIUS);
    }
    expect(new Set(KAISERS.map((i) => i.factionId)).size).toBe(SECTORS.length);
    expect(byId('britannia').name).toBe('Kaiserzitadelle Britannia');
    expect(byId('batavia').name).toBe('Imperiale Kontor-Festung Batavia');
    expect(byId('kaiserdom').name).toBe('Eiserner Kaiserdom');
    expect(byId('solis').name).toBe('Palais Impérial Solis');
    expect(byId('tenkoku').name).toBe('Shogunats-Zitadelle Tenkoku');
  });

  it('größer als jede Mega-Insel und jede Königsinsel; kein anderer Inselrand im Freiraum des Bauplatzes', () => {
    const megaMax = Math.max(...MEGA_IDS.map((id) => MEGA_BY_ID[id].r));
    const kingMax = Math.max(...ALL.filter((i) => i.kind === 'citadel' || i.marine === 'hq').map((i) => i.r));
    for (const k of KAISERS) {
      expect(k.r).toBeGreaterThan(megaMax);
      expect(k.r).toBeGreaterThan(kingMax);
      for (const o of ALL) if (o !== k) expect(Math.hypot(o.x - k.x, o.z - k.z) - (o.r + k.r) * ISLAND_REACH, `${k.id} – ${o.id}`).toBeGreaterThan(50);
    }
  });

  it('Mega-Format, aber nicht als Mega-Insel gezählt; Siedlung mit doppeltem Mauerring, Gräben und breiten Brücken', () => {
    expect(MEGA_IDS).toHaveLength(6);
    for (const m of KAISER_ISLANDS) {
      expect(isMegaId(m.id)).toBe(true);
      const site = SITES[m.id];
      expect(site, m.id).toBeTruthy();
      expect(site.themed).toBe(true);
      expect(site.rifts).toHaveLength(2);
      for (const r of site.rifts!) { expect(r.wide).toBe(true); expect(r.cross).toHaveLength(2); }
      const L = kaiserLayout(KAISER_SPEC_BY_ID[m.id as KaiserId]);
      expect(L.outerWall).toBeGreaterThan(L.innerMoat + 60);
      // Mauerringe: Zinnenmauern rundum, offen an den Toren (äußerer Ring zur Bucht und gegenüber)
      const walls = site.clusters.find((c) => c.name.endsWith('Äußerer Ring'))!.items;
      const mods = walls.filter((i) => i.t === 'zinnenmauer');
      expect(mods.length).toBeGreaterThan(200);
      for (const g of L.outerGates) {
        const gx = Math.sin((g * Math.PI) / 180) * L.outerWall, gz = Math.cos((g * Math.PI) / 180) * L.outerWall;
        expect(Math.min(...mods.map((w) => Math.hypot(w.x - gx, w.z - gz)))).toBeGreaterThan(9);
      }
      expect(site.clusters.some((c) => c.name.endsWith('Thronsaal'))).toBe(true);
      // Küstengeschütze und Hafen
      expect(m.plots.filter((p) => p.theme === 'batterie')).toHaveLength(4);
      expect(m.plots[0].theme).toBe('hafen');
    }
    expect(ringWall(200, [0, 180], 'krone', true).filter((i) => i.t === 'torhaus')).toHaveLength(2);
  });

  it('Bucht zur Weltmitte: die Küste hat dort ihr tiefstes Tal', () => {
    for (const m of KAISER_ISLANDS) {
      const bay = kaiserLayout(KAISER_SPEC_BY_ID[m.id as KaiserId]).bay;
      const k = (deg: number) => { const a = Math.PI / 2 - (deg * Math.PI) / 180; let v = 1; for (const w of m.coast) if (w.f <= 5) v += w.a * Math.sin(w.f * a + w.p); return v; };
      for (let d = 0; d < 360; d += 15) if (Math.abs(((d - bay + 540) % 360) - 180) > 40) expect(k(d), `${m.id} ${d}`).toBeGreaterThan(k(bay));
      // Richtung Weltmitte
      const isl = byId(m.id);
      const toCenter = ((Math.atan2(-isl.x, -isl.z) * 180) / Math.PI + 360) % 360;
      expect(Math.abs(((toCenter - bay + 540) % 360) - 180)).toBeLessThan(1);
    }
  });

  it('Kaiser-Blueprints kommen ohne three.js aus (reine Daten, JSON-Rundlauf)', () => {
    const path = (u: URL) => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1');
    const seen = new Set<string>(), bare = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      const re = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (m[1].startsWith('.')) { const base = path(new URL(m[1], new URL(`file:///${file.replace(/\\/g, '/')}`))); visit(base.endsWith('.ts') ? base : `${base}.ts`); } else bare.add(m[1]);
      }
    };
    for (const f of ['../src/data/kaiserIslands.ts', '../src/data/kaiserBattle.ts', '../src/world/islandBlueprint.ts']) visit(path(new URL(f, import.meta.url)));
    expect([...bare].filter((b) => b.startsWith('three'))).toEqual([]);
    const bp = buildBlueprints(KAISERS, REGIONS);
    expect(bp).toHaveLength(5);
    expect(JSON.parse(JSON.stringify(bp))).toEqual(bp);
    // Hafen-Stege der Bucht stehen im Blueprint (Anlegen nach dem Fall der Kette)
    for (const b of bp) expect(b.piers.length, b.id).toBeGreaterThanOrEqual(2);
  });
});

// ---------- 2. Seesperre ----------

describe('Phase 1 · Kaiserliche Seesperre: Wachflotte, Ketten-Bastionen, Hafenkette', () => {
  it('zwei Bastionen im Wasser vor der Bucht, die Kette spannt sich seewärts vor dem Hafen; sechs Wachschiffe davor', () => {
    for (const k of KAISER_SPECS) {
      const B = kaiserBlockade(k), L = kaiserLayout(k);
      expect(B.bastions).toHaveLength(2);
      for (const b of B.bastions) expect(Math.hypot(b.x, b.z)).toBeGreaterThan(k.r * 1.08);
      const mid = Math.hypot((B.chain.ax + B.chain.bx) / 2, (B.chain.az + B.chain.bz) / 2);
      expect(mid).toBeGreaterThan(k.r * 1.0);
      expect(B.guards).toHaveLength(KAISER.guards);
      for (const g of B.guards) expect(Math.hypot(g.x, g.z)).toBeGreaterThan(mid);
      const bayDir = [Math.sin((L.bay * Math.PI) / 180), Math.cos((L.bay * Math.PI) / 180)];
      expect(((B.chain.ax + B.chain.bx) / 2) * bayDir[0] + ((B.chain.az + B.chain.bz) / 2) * bayDir[1]).toBeGreaterThan(0);
    }
  });

  it('Landung erst nach dem Fall beider Bastionen; Wachschiffe zählen, öffnen die Bucht aber nicht', () => {
    const st = newKaiserBattle('britannia');
    expect(st.phase).toBe('seesperre');
    expect(canLand(st)).toBe(false);
    for (let i = 0; i < 6; i++) guardDown(st);
    expect(st.guardsDown).toBe(6);
    expect(canLand(st)).toBe(false);
    const a = damageBastion(st, 0, KAISER.bastionHp - 1);
    expect(a.destroyed).toBe(false);
    expect(damageBastion(st, 0, 5)).toEqual({ destroyed: true, opened: false });
    expect(st.chainUp).toBe(true);
    expect(canLand(st)).toBe(false);
    // tote Bastion nimmt keinen Schaden mehr, falsche Werte auch nicht
    expect(damageBastion(st, 0, 999)).toEqual({ destroyed: false, opened: false });
    expect(damageBastion(st, 1, Number.NaN)).toEqual({ destroyed: false, opened: false });
    const b = damageBastion(st, 1, KAISER.bastionHp);
    expect(b).toEqual({ destroyed: true, opened: true });
    expect(st.chainUp).toBe(false);
    expect(st.phase).toBe('festungsringe');
    expect(canLand(st)).toBe(true);
  });

  it('Bastionen feuern zurück und halten einiges aus (mehrere Breitseiten)', () => {
    expect(KAISER.bastionHp).toBeGreaterThanOrEqual(4000);
    expect(KAISER.battery.range).toBeGreaterThan(400);
    expect(KAISER.battery.dmg).toBeGreaterThan(0);
    expect(KAISER.wakeDist).toBeLessThan(KAISER.sleepDist);
  });
});

// ---------- 3. Festungsringe und Kaiser ----------

describe('Phase 2 · doppelter Festungsring und Phase 3 · der Kaiser', () => {
  const opened = () => { const st = newKaiserBattle('tenkoku'); damageBastion(st, 0, 1e9); damageBastion(st, 1, 1e9); return st; };

  it('große Wachverbände und je zwei Elite-Offiziere je Ring, an den Toren', () => {
    for (const k of KAISER_SPECS) {
      for (const ring of [0, 1] as const) {
        const P = kaiserRingPosts(k, ring);
        expect(P.squads.reduce((n, q) => n + q.heads, 0), `${k.id} ${ring}`).toBeGreaterThanOrEqual(60);
        expect(P.officers).toHaveLength(2);
        expect(P.wake.length).toBeGreaterThanOrEqual(1);
        for (const q of P.squads) expect(q.heads).toBeLessThanOrEqual(18);
      }
      const T = kaiserThrone(k);
      expect(Math.hypot(T.x, T.z)).toBeLessThan(kaiserLayout(k).innerWall);
    }
    const o = kaiserOfficerDef('britannia', 0);
    expect(o.raid).toBe('captain');
    expect(o.aura).toBeTruthy();
    expect(o.label).toContain('Kaisergarde');
  });

  it('Ringe nur nach dem Fall der Kette; der Kaiser erst, wenn beide Ringe geräumt sind', () => {
    const closed = newKaiserBattle('tenkoku');
    expect(enterRing(closed, 0)).toBe(false);
    const st = opened();
    expect(bossShouldAppear(st)).toBe(false);
    expect(enterRing(st, 0)).toBe(true);
    expect(enterRing(st, 0)).toBe(false);
    expect(clearRing(st, 1)).toBe(false);
    expect(clearRing(st, 0)).toBe(true);
    expect(st.phase).toBe('festungsringe');
    expect(bossShouldAppear(st)).toBe(false);
    // Rückzug: der aktive Ring steht beim nächsten Landgang wieder, der geräumte bleibt geräumt
    enterRing(st, 1);
    retreatRings(st);
    expect(st.rings).toEqual(['geraeumt', 'ruhig']);
    enterRing(st, 1);
    expect(clearRing(st, 1)).toBe(true);
    expect(st.phase).toBe('thron');
    expect(bossShouldAppear(st)).toBe(true);
  });

  it('zwei Phasen: bei 50 % genau einmal Verstärkung und Auren; Sieg startet 45 Minuten Ruhezeit', () => {
    const st = opened();
    enterRing(st, 0); clearRing(st, 0); enterRing(st, 1); clearRing(st, 1);
    bossAppeared(st);
    expect(bossShouldAppear(st)).toBe(false);
    expect(bossPhase(st, 1)).toBe(false);
    expect(bossPhase(st, 2)).toBe(true);
    expect(bossPhase(st, 2)).toBe(false);
    expect(st.boss.phase).toBe(2);
    expect(KAISER.cooldown).toBe(45 * 60);
    expect(bossDefeated(st, 1000)).toBe(true);
    expect(st.phase).toBe('besiegt');
    expect(kaiserCooldownLeft(st, 1000)).toBe(2700);
    expect(canLand(st)).toBe(true);
    // vor Ablauf bleibt alles still, danach steht die Zitadelle wieder in voller Stärke (Siege bleiben)
    expect(tickKaiser(st, 1000 + 2699)).toBe(false);
    expect(tickKaiser(st, 1000 + 2700)).toBe(true);
    expect(st.phase).toBe('seesperre');
    expect(st.chainUp).toBe(true);
    expect(st.bastions).toEqual([KAISER.bastionHp, KAISER.bastionHp]);
    expect(st.wins).toBe(1);
    // zweiter Sieg: kein „erster Sieg“ mehr
    damageBastion(st, 0, 1e9); damageBastion(st, 1, 1e9); enterRing(st, 0); clearRing(st, 0); enterRing(st, 1); clearRing(st, 1); bossAppeared(st);
    expect(bossDefeated(st, 9000)).toBe(false);
    expect(st.wins).toBe(2);
  });

  it('Kaiser: zwei Phasen bei 50 %, Aura-Angriffe in Phase 2, Anti-One-Shot strenger als bei Raid-Bossen', () => {
    for (const id of KAISER_IDS) {
      const d = kaiserBossDef(id);
      expect(d.raid).toBe('boss');
      expect(d.phases).toBe(2);
      expect(d.phaseAt).toEqual([0.5, -1]);
      expect(d.hitCap).toBe(KAISER_BOSS_HIT_CAP);
      expect(d.aura).toBeTruthy();
      expect(d.phaseAttacks?.[2]?.some((a) => (a.label ?? '').includes('Aura'))).toBe(true);
      expect(d.label).toBe(KAISER_SPEC_BY_ID[id].boss.name);
    }
    expect(KAISER_BOSS_HIT_CAP).toBeLessThan(RAID_BOSS_HIT_CAP);
    expect(KAISER.bossHitCap).toBe(KAISER_BOSS_HIT_CAP);
  });

  it('Lohn: Kaiser-Siegel, Boss-Siegel, mythischer Bauplan beim ersten Sieg, viel Gold und Ruhm', () => {
    const first = rollKaiserLoot('solis', true, () => 0.5), again = rollKaiserLoot('solis', false, () => 0.5);
    expect(first.kaiserSeals).toBeGreaterThan(again.kaiserSeals);
    expect(first.relic.first).toBe(true);
    expect(first.relic.name).toContain('Mythischer Bauplan');
    expect(again.relic.first).toBe(false);
    expect(again.relic.name).toBe('Kaiser-Relikt von Solis');
    expect(first.gold).toBeGreaterThan(again.gold);
    expect(again.gold).toBeGreaterThan(5000);
    expect(first.fame).toBeGreaterThanOrEqual(300);
    expect(first.seals.power).toBe('frankreich');
    expect(first.goods.map((g) => g.good)).toEqual(KAISER_SPEC_BY_ID.solis.goods);
    expect(first.warlord).toBe(true);
    const u = cleanUnlocks({ kaiserSeals: 4, kaiserRelics: ['bauplan_solis', 'bauplan_solis', 7] });
    expect(u.kaiserSeals).toBe(4);
    expect(u.kaiserRelics).toEqual(['bauplan_solis']);
    expect(cleanUnlocks({}).kaiserSeals).toBeUndefined();
  });
});

// ---------- 4. Spielstand ----------

describe('Spielstand: Ruhezeit der Kaiser überdauert das Laden, Version 21 bleibt', () => {
  it('nur laufende Ruhezeiten und Siege werden gespeichert, relativ zur Weltuhr', () => {
    const a = newKaiserBattle('batavia'), b = newKaiserBattle('kaiserdom');
    damageBastion(a, 0, 1e9); damageBastion(a, 1, 1e9); enterRing(a, 0); clearRing(a, 0); enterRing(a, 1); clearRing(a, 1); bossAppeared(a); bossDefeated(a, 500);
    const save = kaiserToSave([a, b], 800);
    expect(save).toEqual({ batavia: { cd: 2400, wins: 1 } });
    const back = kaiserFromSave(JSON.parse(JSON.stringify(save)), 10);
    expect(back).toHaveLength(1);
    expect(back[0].phase).toBe('besiegt');
    expect(kaiserCooldownLeft(back[0], 10)).toBe(2400);
    expect(back[0].wins).toBe(1);
    expect(canLand(back[0])).toBe(true);
  });

  it('fremde und kaputte Daten fallen weg, Werte werden begrenzt', () => {
    expect(cleanKaiserSave(null)).toEqual({});
    expect(cleanKaiserSave({ nirgendwo: { cd: 5 }, britannia: { cd: 99999, wins: -3 }, tenkoku: { cd: 'x', wins: 2 }, solis: 4 })).toEqual({ britannia: { cd: KAISER.cooldown, wins: 0 }, tenkoku: { cd: 0, wins: 2 } });
  });

  it('ein Stand der Version 21 ohne Kaiser-Feld lädt nahtlos: alle fünf unentdeckt und in voller Stärke', () => {
    const s = createSave('Alt', 'pirat', '4.5.3') as unknown as Record<string, unknown>;
    const w = s.world as Record<string, unknown>;
    delete w.kaiser;
    const r = migrateSave(JSON.parse(JSON.stringify(s)), '4.5.3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(21); // 4.6E: Talente heben auf 22, das Kaiser-Feld bleibt ohne eigene Version
    expect(r.data.world.kaiser).toEqual({});
    for (const id of KAISER_IDS) expect(r.data.world.chart?.islands ?? []).not.toContain(id);
    expect(kaiserFromSave(r.data.world.kaiser, 0)).toEqual([]);
  });
});

// ---------- 5. Archipele, Ruinen, Krieg ----------

describe('Zwölf Archipel-Inseln, Sturmkrone-Ruinen Stufe 4, Kriegsreichweite 6 800 m', () => {
  const archs = THEME_ISLANDS.filter((s) => s.archipel);

  it('zwölf Inseln der Ringe 2 – 4 mit 380 – 540 m Durchmesser: Doppelinseln mit zwei Brücken, Atolle mit Lagune und Steg', () => {
    expect(archs).toHaveLength(12);
    expect(Object.keys(ARCHIPELS)).toHaveLength(12);
    for (const s of archs) {
      const isl = byId(s.id);
      expect(isl.ring, s.id).toBeGreaterThanOrEqual(2);
      expect(isl.ring, s.id).toBeLessThanOrEqual(4);
      expect(isl.r * 2, s.id).toBeGreaterThanOrEqual(380);
      expect(isl.r * 2, s.id).toBeLessThanOrEqual(540);
      const site = SITES[s.id];
      expect(site.rifts, s.id).toHaveLength(1);
      const rf = site.rifts![0];
      expect(rf.kind).toBe('sund');
      if (s.archipel === 'doppel') { expect(rf.cross).toHaveLength(2); expect(['holz', 'stein']).toContain(rf.bridge); }
      else { expect(rf.cross).toHaveLength(1); expect(rf.bridge).toBe('holz'); expect(rf.name).toBe('Lagune'); }
    }
    expect(archs.filter((s) => s.archipel === 'doppel').length).toBeGreaterThanOrEqual(6);
    expect(archs.filter((s) => s.archipel === 'lagune').length).toBeGreaterThanOrEqual(4);
  });

  it('kein Bauplatz steht im Wasser: jeder Platz bleibt mit seinem Freiraum vom Meeresarm bzw. der Lagune weg', () => {
    for (const s of archs) {
      const coast = coastOf(s), rf = s.rifts![0];
      s.plots.forEach((pl) => {
        const [x, z] = plotCenter(s, pl, coast);
        let d = Infinity;
        for (let i = 1; i < rf.pts.length; i++) {
          const [ax, az] = rf.pts[i - 1], [bx, bz] = rf.pts[i];
          const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
          d = Math.min(d, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
        }
        expect(d - rf.w / 2, `${s.id} · ${pl.theme}`).toBeGreaterThan(themeItems(pl.theme, s.biome).clear * 0.55);
      });
    }
  });

  it('die Sturmkrone-Ruinen bleiben Gefahrenstufe 4 (Ring 3)', () => {
    const i = byId('sturmkroneruinen');
    expect(i.ring).toBe(3);
    expect(i.dangerTier).toBe(4);
    expect(MEGA_BY_ID.sturmkroneruinen.tier).toBe(4);
  });

  it('Kriegsreichweite 6 800 m; Kaiser-Zitadellen sind geschützt, nie eroberbar, ohne Ertrag und keine Mega-Insel', () => {
    expect(WAR.reach).toBe(6800);
    const reg = new NationRegistry();
    for (const k of KAISERS) {
      const w = warIslandOf(k, reg);
      expect(w.protected, k.id).toBe(true);
      expect(w.conquerable).toBe(false);
      expect(w.produces).toBe(false);
      expect(w.mega).toBe(false);
    }
    const world = warWorldFromDefs(ALL, reg);
    expect(world.islands.some((w) => KAISER_IDS.includes(w.id as never))).toBe(false);
    expect(world.islands.filter((w) => w.mega)).toHaveLength(6);
  });
});

// ---------- 6. Weltkarte ----------

function fakeCtx(texts: string[]): CanvasRenderingContext2D {
  const grad = { addColorStop() {} };
  const target: Record<string, unknown> = {
    measureText: (t: string) => ({ width: t.length * 6.5 }),
    fillText: (t: string) => { texts.push(t); },
    createRadialGradient: () => grad, createLinearGradient: () => grad,
  };
  return new Proxy(target, { get: (o, k: string) => (k in o ? o[k] : () => undefined), set: (o, k: string, v) => { o[k] = v; return true; } }) as unknown as CanvasRenderingContext2D;
}

describe('Weltkarte (M): größere Scheibe, Kaiser-Kronen, keine Platzhalter mehr', () => {
  it('Desktop 1440 × 900: zweizeilige Kopfleiste und 7,5 % Rand machen die Scheibe bei 1,00× rund 35 – 45 % größer als in 4.5C', () => {
    const before = (900 - 220 - 84) * (1 - 2 * 0.1);
    setMapSafeArea(112, 0);
    const now = 2 * WORLD_RADIUS * fitScale(1440, 900);
    setMapSafeArea(0, 0);
    expect(now / before).toBeGreaterThanOrEqual(1.35);
    expect(now / before).toBeLessThanOrEqual(1.45);
  });

  it('bei 1,00× und 2,50× (Desktop und Handy): alle fünf Kaiser beschriftet, keine „Verbotenen Gewässer“, keine Überlappung', () => {
    const d: WorldMapData = { islands: ALL, regions: REGIONS, known: () => false, islandMarks: new Map(), markers: { player: { x: 0, z: 0, heading: 0 }, enemies: [], target: null, digs: [] } };
    for (const [W, H] of [[1440, 900], [390, 844]]) for (const zoom of [1, 2.5]) {
      const texts: string[] = [];
      // Ansicht wie im Spiel: 1,00× = ganze Welt; 2,50× auf Britannia (Norden) gerichtet
      const v = { cx: 0, cz: zoom > 1 ? 13000 : 0, scale: fitScale(W, H) * zoom };
      drawWorldMap(fakeCtx(texts), W, H, 1, v, d, { selected: null, layers: defaultLayers(), fog: null, zoom });
      expect(texts.some((t) => t.includes('Verbotene'))).toBe(false);
      const L = lastLabels(), a: number[] = [], b: number[] = [];
      let bad = 0;
      for (let i = 0; i < L.count; i++) for (let j = i + 1; j < L.count; j++) { L.at(i, a); L.at(j, b); if (a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]) bad++; }
      expect(bad, `${W}×${H} ${zoom}×`).toBe(0);
      if (zoom === 1 && W > H) for (const k of KAISERS) expect(texts, k.name).toContain(k.name);
      if (zoom > 1) expect(texts).toContain('Kaiserzitadelle Britannia');
    }
  });
});
