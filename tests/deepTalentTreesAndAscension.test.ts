// Phase 4.6E: das 18-Baum-Talent- und Stufensystem bis Stufe 100 (120 Punkte) und der geheime Aufstieg auf Stufe 101 mit dem Kosmos-Baum
// und dem 15. Ultimate „Himmelssturz“. Geprüft werden Punkte und Stufen-Obergrenze, alle sieben Stufen und Pfade der 14 Kampfbäume und die
// drei Kapitänsbäume, die Build-Bindung ab 55 Punkten, Ultimate-Evolutionen, Zurücksetzen, Kaiser-Siegel/Relikte/Baupläne, die harte Sperre
// von Stufe 101, die fünf Sternbilder samt Krone, die Obergrenzen aus balanceConfig, die Wirkung in der Kampf-Engine und Spielstand 22.
import { describe, expect, it } from 'vitest';
import {
  CAPTAIN_TREES, COMBAT_TREES, CONSTELLATIONS, COSMIC_SOURCES, FAJI_TREES, FX_INFO, MILESTONES, NODE_BY_ID, TALENT, TALENT_TREES, TREE_BY_ID, WEAPON_TREES,
  type CombatTreeId, type FxKey, type TalentTreeId,
} from '../src/data/talentTrees';
import {
  applyXp, ascend, ascensionRevealed, ascensionRows, capFx, chooseUltimate, claimMilestone, cleanTalents, committedTree, cosmicTotal, emptyTalents,
  equipEvo, formFloor, freeCosmic, freePoints, fxSums, kaiserWinAscended, learn, learnBlock, levelPoints, milestonesEarned, respec, respecCost,
  spentRegular, starsLit, syncKaiser, talentTotal, treePoints, xpTotalTo, type TalentSave, type TalentWorld,
} from '../src/core/talentRules';
import { buildTalentCombat, talentDamageK } from '../src/combat/talentCombat';
import { ACTION_STYLES, ALL_MOVES, moveIndex, type ActionHit, type ActionMove, type ActionStyleId } from '../src/data/actionStyles';
import { SKYFALL_ULTIMATE, UltimateBossLedger, ultimateBossCap } from '../src/data/cataclysms';
import { KAISER_BOSS_HIT_CAP, TALENT_CAP, effectiveLevel } from '../src/data/balanceConfig';
import { PLAYER_BASE, xpToNext } from '../src/data/combat';
import { KAISER_IDS } from '../src/data/kaiserIslands';
import { createSave, SAVE_VERSION } from '../src/core/save/types';
import { migrateSave } from '../src/core/save/migrations';
import { talentUnitPrices } from '../src/core/economyEngine';
import { newTalentUi, talentScreenHtml } from '../src/ui/talentScreen';
import { WILL } from '../src/data/fajiArts';
import {
  ActionCombatEngine, createFighter, makeInput,
  type ActionBody, type ActionInput, type ActionTarget, type ActionWorld, type HitContext,
} from '../src/combat/actionCombatEngine';

const DT = 1 / 60;

// ---------- Hilfen ----------

/** Großzügige Welt: Stufe 100, viele Kaiser-Siegel */
const rich = (level = 100, kaiserSeals = 99): TalentWorld => ({ level, kaiserSeals });

/** Stand mit allen 21 Siegeln, allen Bauplänen und drei Relikten */
function loaded(): TalentSave {
  const t = emptyTalents();
  for (const m of MILESTONES) claimMilestone(t, m.id);
  syncKaiser(t, Object.fromEntries(KAISER_IDS.map((k) => [k, 1])), [...KAISER_IDS.map((k) => `bauplan_${k}`), 'relikt_britannia', 'relikt_batavia', 'relikt_kaiserdom']);
  return t;
}

/** So viele Punkte wie möglich (höchstens `target`) in einen Baum lernen, Stufe für Stufe; Pfad A, wenn frei */
function fill(t: TalentSave, w: TalentWorld, tree: TalentTreeId, target = 999, path: 'A' | 'B' = 'A'): number {
  const nodes = [...TREE_BY_ID[tree].nodes].filter((n) => !n.path || n.path === path).sort((a, b) => a.tier - b.tier || a.col - b.col);
  let progress = true;
  while (progress && treePoints(t, tree) < target) {
    progress = false;
    for (const n of nodes) {
      if (treePoints(t, tree) >= target) break;
      if (learnBlock(t, w, n.id) === null) { const r = learn(t, w, n.id); if (r.ok) { w.kaiserSeals -= r.seals; progress = true; } }
    }
  }
  return treePoints(t, tree);
}

interface Foe { id: string; x: number; y: number; z: number; radius: number; alive: boolean; air: boolean; vy: number; boss: boolean; hits: number }

/** Spielzeug-Welt: ebener Boden, Gegner als Kreise; `ko` = Treffer zählen als Bruch/K.O. (Rückgabe 2) */
class World implements ActionWorld {
  foes: Foe[] = [];
  log: { id: string; move: string; h: ActionHit; c: HitContext }[] = [];
  ko = false;
  /** Steigtempo-Faktor beim Hochschleudern (die Spielzeug-Schwerkraft ist strenger als die echte) */
  lift = 1;
  foe(x: number, z: number, o: Partial<Foe> = {}): Foe { const f: Foe = { id: `f${this.foes.length}`, x, y: 0, z, radius: 0.45, alive: true, air: false, vy: 0, boss: false, hits: 0, ...o }; this.foes.push(f); return f; }
  height(): number { return 0; }
  move(b: ActionBody, dx: number, dz: number): void { b.x += dx; b.z += dz; }
  teleport(b: ActionBody, x: number, z: number): boolean { b.x = x; b.z = z; return true; }
  targets(x: number, z: number, r: number, out: ActionTarget[]): number {
    let n = 0;
    this.foes.forEach((f, i) => {
      if (n >= out.length || !f.alive || Math.hypot(f.x - x, f.z - z) > r + f.radius) return;
      const t = out[n++];
      t.id = f.id; t.x = f.x; t.y = f.y; t.z = f.z; t.radius = f.radius; t.height = 1.8; t.yaw = Math.PI;
      t.alive = true; t.airborne = f.air; t.mass = false; t.broken = false; t.boss = f.boss; t.elite = false; t.attacking = false; t.ref = i;
    });
    return n;
  }
  hit(t: ActionTarget, h: ActionHit, m: ActionMove, c: HitContext): number {
    const f = this.foes[t.ref];
    f.hits++;
    this.log.push({ id: f.id, move: m.id, h, c: { ...c } });
    if (h.launch > 0 && !f.boss) { f.vy = h.launch * this.lift; f.air = true; }
    return this.ko ? 2 : 1;
  }
  drag(): void {}
  shoot(): void {}
  step(dt: number) { for (const f of this.foes) if (f.air) { f.vy -= 22 * dt; f.y += f.vy * dt; if (f.y <= 0) { f.y = 0; f.vy = 0; f.air = false; } } }
}

function setup(style: ActionStyleId, t: TalentSave | null, art: Parameters<typeof buildTalentCombat>[1] = null) {
  const w = new World();
  const eng = new ActionCombatEngine(createFighter('tal-test', style));
  if (t) eng.setTalents(buildTalentCombat(t, art));
  return { w, eng, inp: makeInput(), f: eng.f };
}

function tick(eng: ActionCombatEngine, w: World, inp: ActionInput, press: Partial<ActionInput> = {}): string[] {
  Object.assign(inp, { light: false, heavy: false, jump: false, dash: false, skill: 0, blockPressed: false, awaken: false, aura: false }, press);
  eng.step(inp, w, DT);
  w.step(DT);
  const out: string[] = [];
  for (let k = 0; k < eng.events.n; k++) out.push(eng.events.items[k].type);
  return out;
}

function run(eng: ActionCombatEngine, w: World, inp: ActionInput, n: number, press: Partial<ActionInput> = {}): string[] {
  const seen: string[] = [];
  for (let i = 0; i < n; i++) seen.push(...tick(eng, w, inp, i === 0 ? press : {}));
  return seen;
}

/** Talent-Stand direkt setzen (Engine-Prüfungen; die Regeln prüfen eigene Tests) */
function nodes(...ids: [string, number][]): TalentSave {
  const t = emptyTalents();
  for (const [id, r] of ids) { expect(NODE_BY_ID[id], id).toBeTruthy(); t.nodes[id] = r; }
  return t;
}

// ---------------------------------------------------------------------------------------------------------------

describe('Stufen und Erfahrung: reguläres Maximum Stufe 100', () => {
  it('EP-Kurve: bis Stufe 40 wie bisher (60 + 45 · Stufe), darüber quadratisch steiler; Stufe 100 ist ein langes Endziel', () => {
    for (const l of [1, 10, 25, 40]) expect(xpToNext(l)).toBe(60 + 45 * l);
    expect(xpToNext(41)).toBeGreaterThan(60 + 45 * 41);
    expect(xpToNext(99)).toBeGreaterThan(4 * xpToNext(40));
    expect(PLAYER_BASE.xpNeed(50)).toBe(xpToNext(50));
    const total = xpTotalTo(100);
    expect(total).toBeGreaterThan(500_000);
    expect(total).toBeLessThan(800_000);
  });

  it('Aufstiege enden bei Stufe 100: weitere Erfahrung verfällt, Stufe 101 gibt es nie über EP', () => {
    expect(applyXp(99, 0, 10_000_000)).toEqual({ level: 100, xp: 0, ups: 1 });
    expect(applyXp(100, 0, 999_999)).toEqual({ level: 100, xp: 0, ups: 0 });
    expect(applyXp(101, 0, 999_999)).toEqual({ level: 101, xp: 0, ups: 0 });
    const r = applyXp(1, 0, xpToNext(1) + xpToNext(2) + 5);
    expect(r).toEqual({ level: 3, xp: 5, ups: 2 });
  });

  it('Grundwerte wachsen über Stufe 40 asymptotisch (Leben, Angriff), nie über eine feste Grenze', () => {
    expect(effectiveLevel(40)).toBe(40);
    expect(effectiveLevel(100)).toBeLessThan(70);
    expect(effectiveLevel(10_000)).toBeLessThanOrEqual(75);
    expect(PLAYER_BASE.hp(100)).toBeLessThan(PLAYER_BASE.hp(40) * 1.8);
    expect(PLAYER_BASE.atk(101)).toBeGreaterThan(PLAYER_BASE.atk(100));
  });
});

describe('120-Punkte-Ökonomie: 99 Stufenpunkte + 21 Meisterschafts-Siegel', () => {
  it('Stufenpunkte und Siegel ergeben genau 120; mehr gibt es nicht', () => {
    expect(levelPoints(1)).toBe(0);
    expect(levelPoints(100)).toBe(TALENT.levelPoints);
    expect(levelPoints(101)).toBe(TALENT.levelPoints);
    expect(MILESTONES.length).toBe(21);
    expect(new Set(MILESTONES.map((m) => m.id)).size).toBe(21);
    const t = loaded();
    expect(talentTotal(t, 100)).toBe(120);
    expect(TALENT.total).toBe(TALENT.levelPoints + TALENT.sealPoints);
    expect(claimMilestone(t, 'kaiser_britannia')).toBe(false);
    expect(claimMilestone(t, 'gibt_es_nicht')).toBe(false);
    expect(talentTotal(t, 101)).toBe(120);
  });

  it('Siegel kommen aus den Erstsiegen: Kaiser, Mega-Kommandanten, Weltbosse, Raids, erste Legende', () => {
    const kinds = new Set(MILESTONES.map((m) => m.kind));
    expect([...kinds].sort()).toEqual(['kaiser', 'legende', 'mega', 'raid', 'weltboss']);
    expect(MILESTONES.filter((m) => m.kind === 'kaiser').length).toBe(5);
    const got = milestonesEarned({ flags: { megaboss_kronenklippe: true, raidwon_albion: true, weltboss_ryujin: true }, kaiserWins: { tenkoku: 1 }, bossKills: { leviathan: 2 }, legends: ['x'] });
    expect(got.sort()).toEqual(['kaiser_tenkoku', 'legende_erste', 'mega_kronenklippe', 'raid_albion', 'weltboss_leviathan', 'weltboss_ryujin'].sort());
  });
});

describe('18 Bäume: 14 Kampfbäume mit sieben Stufen, drei Kapitänsbäume, Kosmos', () => {
  it('Zusammensetzung, eindeutige Kennungen, Kapazitäten', () => {
    expect(TALENT_TREES.length).toBe(18);
    expect(WEAPON_TREES.length).toBe(6);
    expect(FAJI_TREES.length).toBe(8);
    expect(CAPTAIN_TREES.length).toBe(3);
    const ids = TALENT_TREES.flatMap((t) => t.nodes.map((n) => n.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const tr of TALENT_TREES) for (const n of tr.nodes) expect(n.id.startsWith(`${tr.id}.`)).toBe(true);
    for (const id of COMBAT_TREES) {
      const tr = TREE_BY_ID[id];
      expect(tr.capacity, id).toBe(70);
      expect([...new Set(tr.nodes.map((n) => n.tier))].sort(), id).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(tr.nodes.filter((n) => n.tier <= 5 && n.path !== 'B').reduce((a, n) => a + n.max, 0), id).toBeGreaterThanOrEqual(TALENT.commit);
    }
    for (const id of CAPTAIN_TREES) {
      expect(TREE_BY_ID[id].capacity).toBeGreaterThanOrEqual(36);
      expect(TREE_BY_ID[id].capacity).toBeLessThanOrEqual(42);
      expect(new Set(TREE_BY_ID[id].nodes.map((n) => n.tier)).size).toBe(5);
    }
  });

  it('Stufe 2: zwei Pfade mit den Namen der Vorgabe (A gegen B)', () => {
    const want: Record<string, [string, string]> = {
      zweihaender: ['Koloss-Schiffsspalter', 'Unaufhaltsamer Moloch'], saebel: ['Sturmblitz-Duellant', 'Korsaren-Kommandant'],
      doppel: ['Luft-Kreissäge', 'Schatten-Assassine'], langklinge: ['Lautloser Zieh-Schnitt', 'Spiegel-Kontermeister'],
      sturmfaust: ['Überschall-Stakkato', 'Orkan-Akrobat'], erdspalter: ['Seismischer Brecher', 'Titanen-Ringer'],
    };
    for (const id of WEAPON_TREES) expect([TREE_BY_ID[id].paths!.A.name, TREE_BY_ID[id].paths!.B.name], id).toEqual(want[id]);
    for (const id of FAJI_TREES) {
      expect(TREE_BY_ID[id].paths!.A.name.startsWith('Zerstörungs-Formen')).toBe(true);
      expect(TREE_BY_ID[id].paths!.B.name.startsWith('Kontroll- & Aura-Meisterschaft')).toBe(true);
    }
    for (const id of COMBAT_TREES) {
      const t2 = TREE_BY_ID[id].nodes.filter((n) => n.tier === 2);
      expect(t2.filter((n) => n.path === 'A').length).toBe(3);
      expect(t2.filter((n) => n.path === 'B').length).toBe(3);
    }
  });

  it('Stufe 3 bis 7: Mutationen der vier Techniken, Synergien, Meisterprüfung (60 – 85), Apex, drei Ultimate-Evolutionen (85 – 100)', () => {
    let waves = 0, exec = 0, chase = 0;
    for (const id of COMBAT_TREES) {
      const tr = TREE_BY_ID[id];
      const muts = tr.nodes.filter((n) => n.tier === 3);
      expect(muts.map((n) => n.mut?.slot).sort()).toEqual([1, 2, 3, 4]);
      const kinds = new Set(muts.flatMap((n) => n.mut!.add.map((s) => s.kind)));
      if (kinds.has('waves') || kinds.has('proj')) waves++;
      if (kinds.has('airExec')) exec++;
      if (kinds.has('chase')) chase++;
      const syn = tr.nodes.filter((n) => n.tier === 4);
      expect(syn.length).toBe(4);
      expect(syn.some((n) => n.fx.elementFinisher)).toBe(true);
      expect(syn.some((n) => n.fx.stormBurst)).toBe(true);
      expect(syn.some((n) => n.fx.auraSight && n.fx.auraIron && n.fx.auraKing)).toBe(true);
      const master = tr.nodes.filter((n) => n.tier === 5);
      expect(master.length).toBe(3);
      for (const m of master) { expect(m.levels).toEqual([60, 72, 85]); expect(m.seals?.some((s) => s > 0)).toBe(true); }
      if (tr.kind === 'faji') expect(master.some((m) => m.fx.form)).toBe(true);
      const apex = tr.nodes.filter((n) => n.tier === 6);
      expect(apex.length).toBe(1);
      expect(apex[0].fx.apex).toBe(1);
      expect(apex[0].seals?.[0]).toBeGreaterThan(0);
      expect(apex[0].blueprints?.[0]).toBeGreaterThan(0);
      const evo = tr.nodes.filter((n) => n.tier === 7);
      expect(evo.length).toBe(3);
      expect(evo.some((n) => n.fx.ultReach)).toBe(true);
      expect(evo.some((n) => n.fx.aftershock)).toBe(true);
      expect(evo.some((n) => n.fx.multiKill)).toBe(true);
      for (const e of evo) { expect(e.levels).toEqual([85, 95]); expect(e.needs).toEqual([apex[0].id]); expect(e.relics?.[1]).toBeGreaterThan(0); }
    }
    // Dreifach-Wellen, Luft-Hinrichtung und Auto-Verfolgung sind über die Bäume verteilt
    expect(waves).toBeGreaterThanOrEqual(12);
    expect(exec).toBeGreaterThanOrEqual(10);
    expect(chase).toBeGreaterThanOrEqual(10);
  });

  it('jede Wirkung hat eine deutsche Anzeige; jede gedeckelte Wirkung eine Obergrenze', () => {
    for (const tr of TALENT_TREES) for (const n of tr.nodes) for (const k of Object.keys(n.fx) as FxKey[]) expect(FX_INFO[k], `${n.id}:${k}`).toBeTruthy();
  });
});

describe('Freischalten, Pfadwahl und Build-Bindung ab 55 Punkten', () => {
  it('Stufen öffnen sich mit Punkten im Baum, Pfad A sperrt Pfad B', () => {
    const t = loaded();
    const w = rich(100);
    expect(learnBlock(t, w, 'zweihaender.kielbrecher')).toContain('5 Punkte');
    for (let i = 0; i < 5; i++) expect(learn(t, w, 'zweihaender.stand').ok).toBe(true);
    expect(learn(t, w, 'zweihaender.stand').ok).toBe(false);
    expect(learn(t, w, 'zweihaender.kielbrecher').ok).toBe(true);
    expect(learnBlock(t, w, 'zweihaender.molochhaut')).toContain('Pfad A');
    expect(learnBlock(t, w, 'zweihaender.rumpfbrecher')).toBeNull();
    expect(learnBlock(t, w, 'zweihaender.kolosswelle')).toContain('Rumpfbrecher');
  });

  it('ohne Punkte und unter der Mindeststufe geht nichts', () => {
    const t = emptyTalents();
    expect(learnBlock(t, rich(1), 'saebel.fechterstand')).toBe('Keine freien Talentpunkte.');
    expect(learn(t, rich(2), 'saebel.fechterstand').ok).toBe(true);
    const t2 = loaded();
    fill(t2, rich(59), 'saebel', 40);
    expect(treePoints(t2, 'saebel')).toBeGreaterThanOrEqual(34);
    expect(learnBlock(t2, rich(59), 'saebel.meister')).toBe('Stufe 60 nötig.');
  });

  it('ein Kampfbaum bindet ab 55 Punkten: jeder andere endet bei 54', () => {
    const t = loaded();
    const w = rich(100);
    expect(fill(t, w, 'zweihaender', 55)).toBe(55);
    expect(committedTree(t)).toBe('zweihaender');
    const second = fill(t, w, 'saebel', 60);
    expect(second).toBe(TALENT.commit - 1);
    const next = TREE_BY_ID.saebel.nodes.find((n) => learnBlock(t, w, n.id)?.includes('Build-Bindung'));
    expect(next).toBeTruthy();
    // die Kapitänsbäume sind frei von der Bindung
    expect(fill(t, w, 'admiral', 5)).toBe(5);
    expect(spentRegular(t)).toBeLessThanOrEqual(120);
  });

  it('Apex: 55 Punkte, Stufe 70, zwei Kaiser-Siegel und ein Mythischer Bauplan', () => {
    const t = loaded();
    const w = rich(100, 7);
    fill(t, w, 'erdspalter', 55);
    expect(w.kaiserSeals).toBeGreaterThanOrEqual(2);
    expect(learnBlock(t, rich(69, 9), 'erdspalter.apex')).toBe('Stufe 70 nötig.');
    expect(learnBlock(t, rich(100, 1), 'erdspalter.apex')).toContain('Kaiser-Siegel');
    const nob = { ...t, blueprints: [] };
    expect(learnBlock(nob, rich(100, 9), 'erdspalter.apex')).toContain('Mythischer Bauplan');
    const r = learn(t, rich(100, 9), 'erdspalter.apex');
    expect(r).toEqual({ ok: true, seals: 2 });
  });
});

describe('Ultimate-Evolutionen (Stufe 7)', () => {
  it('erst nach dem Apex, Rang 2 ab Stufe 95 mit Kaiser-Relikten; höchstens zwei ausgerüstet, nur ausgerüstete wirken', () => {
    const t = loaded();
    const w = rich(100);
    fill(t, w, 'feuer', 56);
    expect(treePoints(t, 'feuer')).toBe(56);
    expect(learnBlock(t, w, 'feuer.evobeben')).toContain('Apex');
    expect(learn(t, w, 'feuer.apex').ok).toBe(true);
    expect(learnBlock(t, rich(84), 'feuer.evobeben')).toBe('Stufe 85 nötig.');
    expect(learn(t, w, 'feuer.evoradius').ok).toBe(true);
    expect(learn(t, w, 'feuer.evobeben').ok).toBe(true);
    expect(learn(t, w, 'feuer.evowille').ok).toBe(true);
    expect(t.evo.feuer).toEqual(['feuer.evoradius', 'feuer.evobeben']);
    expect(equipEvo(t, 'feuer.evowille', true)).toContain('Höchstens');
    expect(learnBlock(t, rich(94), 'feuer.evobeben')).toBe('Stufe 95 nötig.');
    const few = { ...t, relics: ['relikt_britannia'] };
    expect(learnBlock(few, w, 'feuer.evobeben')).toContain('Kaiser-Relikte');
    expect(learn(t, w, 'feuer.evobeben').ok).toBe(true);
    expect(fxSums(t, ['feuer']).aftershock).toBe(2);
    expect(fxSums(t, ['feuer']).multiKill ?? 0).toBe(0);
    expect(equipEvo(t, 'feuer.evobeben', false)).toBeNull();
    expect(fxSums(t, ['feuer']).aftershock ?? 0).toBe(0);
    expect(equipEvo(t, 'feuer.evowille', true)).toBeNull();
    expect(fxSums(t, ['feuer']).multiKill).toBeGreaterThan(0);
    // umgebaut: größerer Ultimate-Radius
    const tc = buildTalentCombat(t, null);
    expect(tc.styles.feuer.ultimate!.ultimate!.reach).toBeGreaterThan(ACTION_STYLES.feuer.ultimate!.ultimate!.reach);
  });
});

describe('Zurücksetzen gegen Gold und Kaiser-Siegel', () => {
  it('Preis steigt mit Stufe und Wiederholung, Meister-Knoten kosten Kaiser-Siegel; Punkte und Pfad werden frei', () => {
    const t = loaded();
    const w = rich(100);
    fill(t, w, 'langklinge', 40);
    expect(respecCost(t, 100, 'langklinge').seals).toBe(0);
    fill(t, w, 'langklinge', 56);
    const before = freePoints(t, 100);
    const c1 = respecCost(t, 100, 'langklinge');
    expect(c1.gold).toBeGreaterThan(0);
    expect(c1.seals).toBe(TALENT.respec.masterSeals);
    expect(c1.points).toBe(56);
    const all = respecCost(t, 100, 'all');
    expect(all.gold).toBeGreaterThan(c1.gold);
    expect(respec(t, 'langklinge')).toBe(56);
    expect(freePoints(t, 100)).toBe(before + 56);
    expect(t.respecs).toBe(1);
    fill(t, w, 'langklinge', 6, 'B');
    expect(learnBlock(t, w, 'langklinge.spiegelauge')).toBeNull();
    const c2 = respecCost(t, 100, 'langklinge');
    expect(c2.seals).toBe(0);
    expect(c2.gold).toBeGreaterThan(respecCost({ ...t, respecs: 0 }, 100, 'langklinge').gold);
    expect(respecCost(emptyTalents(), 100, 'all')).toEqual({ gold: 0, seals: 0, points: 0 });
  });
});

describe('Kaiser-Siegel, Kaiser-Relikte und Mythische Baupläne', () => {
  it('Meister-Knoten verbrauchen Kaiser-Siegel; ohne Siegel gesperrt', () => {
    const t = loaded();
    fill(t, rich(100), 'blitz', 34);
    expect(learnBlock(t, rich(100, 0), 'blitz.siegel')).toContain('Kaiser-Siegel');
    const r = learn(t, rich(100, 1), 'blitz.siegel');
    expect(r).toEqual({ ok: true, seals: 1 });
    expect(t.sealsSpent).toBeGreaterThanOrEqual(1);
  });

  it('Kaiser-Stand: Siege machen besiegt, die Sammlung trennt Baupläne und Relikte', () => {
    const t = emptyTalents();
    syncKaiser(t, { britannia: 2, batavia: 0 }, ['bauplan_britannia', 'relikt_britannia', 'fremd', 'relikt_britannia']);
    expect(t.kaiserDefeated).toEqual(['britannia']);
    expect(t.blueprints).toEqual(['bauplan_britannia']);
    expect(t.relics).toEqual(['relikt_britannia']);
  });
});

describe('Geheimer Aufstieg: Stufe 101 nur nach allen fünf Kaiser-Inseln', () => {
  it('mit weniger als fünf besiegten Kaisern bleibt Stufe 101 hart gesperrt, der Kosmos unsichtbar', () => {
    const t = emptyTalents();
    syncKaiser(t, { britannia: 1, batavia: 1, kaiserdom: 1, solis: 1 }, [...KAISER_IDS.map((k) => `bauplan_${k}`), 'relikt_solis', 'relikt_batavia']);
    const w = rich(100, 20);
    expect(ascensionRevealed(t)).toBe(false);
    expect(ascensionRows(t, w).find((r) => !r.ok)?.label).toContain('fünf Kaiser');
    expect(ascend(t, w).ok).toBe(false);
    expect(t.ascended).toBe(false);
    expect(learnBlock(t, rich(101), 'kosmos.ereignisfunke')).toContain('Aufstieg');
    expect(cosmicTotal({ ...t, cosmic: ['aufstieg_1'] })).toBe(0);
  });

  it('Stufe 100, fünf Kaiser, Opfer am Sternenaltar: Aufstieg, fünf kosmische Punkte, Baupläne und Relikte gebunden', () => {
    const t = loaded();
    expect(ascend(t, rich(99, 20)).ok).toBe(false);
    expect(ascend(t, rich(100, 4)).ok).toBe(false);
    const r = ascend(t, rich(100, 20));
    expect(r).toEqual({ ok: true, seals: TALENT.ascension.seals, cosmic: 5 });
    expect(t.ascended).toBe(true);
    expect(t.bound.filter((b) => b.startsWith('bauplan_')).length).toBe(5);
    expect(t.bound.filter((b) => b.startsWith('relikt_')).length).toBe(2);
    expect(cosmicTotal(t)).toBe(5);
    expect(ascend(t, rich(101, 20)).ok).toBe(false);
    // Sternenprüfung und Revanche je Kaiser-Insel: zusammen höchstens 15 kosmische Punkte
    for (const k of KAISER_IDS) { expect(kaiserWinAscended(t, k)).toBe(`pruefung_${k}`); expect(kaiserWinAscended(t, k)).toBe(`revanche_${k}`); expect(kaiserWinAscended(t, k)).toBeNull(); }
    expect(cosmicTotal(t)).toBe(TALENT.cosmicMax);
    expect(COSMIC_SOURCES.length).toBe(15);
  });

  it('Säubern verhindert Schummeln: Aufstieg nur mit Stufe 101, nie mehr ausgegeben als verdient', () => {
    const fake = { ...emptyTalents(), ascended: true, cosmic: COSMIC_SOURCES.map((c) => c.id), nodes: { 'kosmos.ereignisfunke': 1 } };
    const c = cleanTalents(fake, { level: 100, kaiserWins: {}, relicIds: [], milestones: [] });
    expect(c.ascended).toBe(false);
    expect(c.nodes['kosmos.ereignisfunke']).toBeUndefined();
    const over = { nodes: Object.fromEntries(TREE_BY_ID.zweihaender.nodes.map((n) => [n.id, n.max])) };
    const c2 = cleanTalents(over, { level: 10, kaiserWins: {}, relicIds: [], milestones: [] });
    expect(spentRegular(c2)).toBe(0);
    const both = { nodes: { 'saebel.fechterstand': 5, 'saebel.blitzklinge': 1, 'saebel.enterbefehl': 1 } };
    const c3 = cleanTalents(both, { level: 50, kaiserWins: {}, relicIds: [], milestones: [] });
    expect(c3.nodes['saebel.blitzklinge']).toBe(1);
    expect(c3.nodes['saebel.enterbefehl']).toBeUndefined();
  });
});

describe('Kosmos-Baum: fünf Sternbilder und das 15. Ultimate', () => {
  it('fünf Sternbild-Cluster mit je drei Sternen, Krone „Himmelssturz“ für drei Punkte ab sechs Sternen in drei Sternbildern', () => {
    expect(CONSTELLATIONS.map((c) => c.name)).toEqual(['Gravitations-Singularität', 'Sternenlicht-Geschwindigkeit', 'Elementar-Faji-Verschmelzung', 'Planeten-Schild', 'Meteoriten-Regen']);
    const k = TREE_BY_ID.kosmos;
    for (const c of CONSTELLATIONS) expect(k.nodes.filter((n) => n.constellation === c.id).length).toBe(3);
    const crown = NODE_BY_ID['kosmos.himmelssturz'];
    expect(crown.name).toBe('Himmelssturz: Zwillings-Meteoriten & Planeten-Kollaps');
    const t = loaded();
    ascend(t, rich(100, 20));
    for (const c of COSMIC_SOURCES) if (!t.cosmic.includes(c.id)) t.cosmic.push(c.id);
    const w = rich(101, 20);
    expect(learnBlock(t, w, 'kosmos.massekern')).toContain('Ereignisfunke');
    for (const id of ['kosmos.ereignisfunke', 'kosmos.massekern', 'kosmos.lichtschritt', 'kosmos.lichtjahr', 'kosmos.orbitalschild']) expect(learn(t, w, id).ok, id).toBe(true);
    expect(starsLit(t)).toEqual({ stars: 5, constellations: 3 });
    expect(learnBlock(t, w, 'kosmos.himmelssturz')).toContain('6 Sterne');
    expect(learn(t, w, 'kosmos.gravitationsmantel').ok).toBe(true);
    expect(learn(t, w, 'kosmos.himmelssturz').ok).toBe(true);
    expect(freeCosmic(t)).toBe(15 - 6 - TALENT.skyfallCost);
    expect(chooseUltimate(t, 'kosmos')).toBeNull();
    expect(t.ult).toBe('kosmos');
  });

  it('Himmelssturz: eigener Kataklysmus mit festem Platz, Sternenhimmel-Einstellung und vier Impact-Frames', () => {
    expect(SKYFALL_ULTIMATE.ultimate!.kind).toBe('skyfall');
    expect(SKYFALL_ULTIMATE.ultimate!.shot).toBe('sky');
    expect(SKYFALL_ULTIMATE.ultimate!.frames).toBe(4);
    expect(moveIndex('kosmos.u')).toBe(ALL_MOVES.length - 1);
    expect(SKYFALL_ULTIMATE.hits.some((h) => h.vfx === 'meteor')).toBe(true);
  });

  it('im Sturm-Erwachen entfesselt die Figur mit jeder Waffe und jeder Kunst den Himmelssturz; der Endboss-Deckel bleibt', () => {
    for (const style of ['zweihaender', 'mond'] as ActionStyleId[]) {
      const t = nodes(['kosmos.himmelssturz', 1]);
      t.ascended = true; t.ult = 'kosmos';
      const { w, eng, inp } = setup(style, t);
      eng.setForm(1);
      w.foe(0, 16, { boss: true });
      eng.addWill(WILL.max);
      run(eng, w, inp, 2, { awaken: true });
      expect(eng.ultAvailable).toBe(true);
      const ev = run(eng, w, inp, 1, { awaken: true });
      expect(ev).toContain('ultimate');
      expect(eng.f.moveId).toBe('kosmos.u');
      const after = run(eng, w, inp, 240);
      expect(after).toContain('ultStrike');
      expect(w.log.some((l) => l.move === 'kosmos.u' && l.c.ultimate)).toBe(true);
    }
    // ein Wirken zählt gegen Kaiser wie ein einziger gedeckelter Treffer – auch mit allen Talenten
    const L = new UltimateBossLedger();
    const cap = ultimateBossCap({ raid: 'boss', hitCap: KAISER_BOSS_HIT_CAP })!;
    let dealt = 0;
    for (let i = 0; i < 12; i++) { const a = L.allow(7, 'kaiser', cap, 100_000, 50_000 * talentDamageK([9, 9, 9])); L.record(a); dealt += a; }
    expect(dealt).toBeLessThanOrEqual(100_000 * KAISER_BOSS_HIT_CAP);
  });
});

describe('Obergrenzen aus balanceConfig: asymptotisch, nie darüber', () => {
  it('jede Wirkung bleibt unter ihrer Grenze, Schalter sind 0/1, Zählwerte ganzzahlig', () => {
    for (const k of Object.keys(FX_INFO) as FxKey[]) {
      const v = capFx(k, 1e6);
      if (FX_INFO[k].unit === 'flag') { expect(v, k).toBe(1); continue; }
      const capKey = (k === 'auraSight' || k === 'auraIron' || k === 'auraKing') ? 'aura' : k === 'vortexK' ? 'vortex' : k === 'stance' || k === 'armor' ? 'reduce' : k;
      if (capKey in TALENT_CAP) expect(v, k).toBeLessThanOrEqual((TALENT_CAP as Record<string, number>)[capKey] + 1e-9);
      expect(capFx(k, 0), k).toBe(0);
    }
    expect(capFx('pen', 1.9)).toBe(1);
    expect(talentDamageK([100, 100, 100])).toBeLessThanOrEqual(1 + TALENT_CAP.total + 1e-9);
    expect(talentDamageK([0, 0])).toBe(1);
  });

  it('voll ausgebauter Meisterbaum plus Kosmos: jeder Treffer höchstens (1 + total) des Grundwerts, Engine-Werte gedeckelt', () => {
    for (const tree of COMBAT_TREES) {
      const t = nodes();
      for (const n of TREE_BY_ID[tree].nodes) if (n.path !== 'B') t.nodes[n.id] = n.max;
      for (const n of TREE_BY_ID.kosmos.nodes) t.nodes[n.id] = n.max;
      t.evo[tree] = TREE_BY_ID[tree].nodes.filter((n) => n.tier === 7).slice(0, 2).map((n) => n.id);
      t.ascended = true;
      const tc = buildTalentCombat(t, 'feuer');
      const base = ACTION_STYLES[tree as CombatTreeId], st = tc.styles[tree];
      const pairs: [ActionMove, ActionMove][] = [[base.heavy, st.heavy], [base.finisher, st.finisher], ...base.light.map((m, i): [ActionMove, ActionMove] => [m, st.light[i]]), ...base.skills.map((m, i): [ActionMove, ActionMove] => [m, st.skills[i]])];
      for (const [a, b] of pairs) for (let i = 0; i < a.hits.length; i++) expect(b.hits[i].dmg, `${b.id}#${i}`).toBeLessThanOrEqual(a.hits[i].dmg * (1 + TALENT_CAP.total) + 1e-9);
      const p = tc.params[tree];
      expect(p.comboK).toBeLessThanOrEqual(1 + TALENT_CAP.combo + 1e-9);
      expect(p.willK).toBeLessThanOrEqual(1 + TALENT_CAP.will + 1e-9);
      expect(p.aftershock).toBeLessThanOrEqual(TALENT_CAP.aftershock);
      expect(st.critBonus - base.critBonus).toBeLessThanOrEqual(TALENT_CAP.crit + 1e-9);
      expect(st.jumps - base.jumps).toBeLessThanOrEqual(TALENT_CAP.jumps);
      for (const sk of st.skills) expect(sk.hits.length).toBeLessThanOrEqual(16);
    }
  });

  it('Schadensminderung aus Talenten höchstens 30 %', () => {
    const t = nodes(['zweihaender.stand', 5], ['zweihaender.unaufhaltsam', 3], ['zweihaender.molochhaut', 5]);
    const { eng } = setup('zweihaender', t);
    eng.talentArmor = 0.9;
    eng.f.phase = 'move';
    expect(eng.talentReduce).toBeLessThanOrEqual(TALENT_CAP.reduce + 1e-9);
    expect(eng.talentReduce).toBeGreaterThan(0.2);
  });

  it('Handels-Talente: Hin und Zurück im selben Hafen kostet immer Gold, ohne Talente bleiben die alten Preise', () => {
    for (const tariff of [0.75, 1, 1.35]) {
      for (const p of [10, 80, 400]) {
        const max = talentUnitPrices(p, tariff, { buy: TALENT_CAP.buy, sell: TALENT_CAP.sell, cargo: 0, smuggle: 0 });
        expect(max.buy).toBeGreaterThan(max.sell);
        const none = talentUnitPrices(p, tariff);
        expect(none.buy).toBeCloseTo(p * 1.05 * tariff, 6);
        expect(none.sell).toBeCloseTo(p * 0.95 * (tariff < 1 ? Math.max(0.5, tariff) : 1 / tariff), 6);
      }
    }
  });
});

describe('Talente wirken in der Kampf-Engine', () => {
  it('Kombo-Tempo: der Säbel-Kettenschlag endet mit Talenten früher', () => {
    const frames = (t: TalentSave | null) => {
      const { w, eng, inp } = setup('saebel', t);
      tick(eng, w, inp, { light: true });
      let n = 1;
      while (eng.move && n < 200) { tick(eng, w, inp); n++; }
      return n;
    };
    const plain = frames(null);
    const fast = frames(nodes(['saebel.klingenrhythmus', 5], ['saebel.blitzklinge', 5], ['saebel.meisterschaft', 3]));
    expect(fast).toBeLessThan(plain);
  });

  it('Auto-Verfolgung: nach dem Hochschleudern teleportiert die Figur ohne Dash zum Ziel (Mutation „Eislanzen · Auto-Verfolgung“)', () => {
    const { w, eng, inp } = setup('eis', nodes(['eis.m_lanzen', 1]));
    eng.setForm(7);
    w.lift = 1.6;
    w.foe(0, 2.6);
    const ev = run(eng, w, inp, 90, { skill: 2 });
    expect(ev).toContain('chase');
    const { w: w2, eng: e2, inp: i2 } = setup('eis', null);
    e2.setForm(7);
    w2.lift = 1.6;
    w2.foe(0, 2.6);
    expect(run(e2, w2, i2, 90, { skill: 2 })).not.toContain('chase');
  });

  it('Nachbeben: die Ultimate-Evolution schickt nach dem Einschlag zwei Druckwellen, gedeckelt als Teil des Ultimates', () => {
    const t = nodes(['zweihaender.apex', 1], ['zweihaender.evobeben', 2]);
    t.evo.zweihaender = ['zweihaender.evobeben'];
    const { w, eng, inp } = setup('zweihaender', t);
    w.foe(0, 6);
    eng.addWill(WILL.max);
    run(eng, w, inp, 2, { awaken: true });
    run(eng, w, inp, 1, { awaken: true });
    const ev = run(eng, w, inp, 240);
    expect(ev.filter((e) => e === 'aftershock').length).toBe(2);
    const shocks = w.log.filter((l) => l.h.range === eng.talentParams.aftershockHit.range);
    expect(shocks.length).toBeGreaterThan(0);
    for (const s of shocks) expect(s.c.ultimate).toBe(true);
  });

  it('Sturm-Schritt-Entladung: perfektes Ausweichen entlädt das Element hinter dem Angreifer', () => {
    const { w, eng, inp } = setup('langklinge', nodes(['langklinge.sturmschritt', 3]));
    const foe = w.foe(0, 3);
    run(eng, w, inp, 1, { dash: true, moveX: 0, moveZ: -1, mag: 1 });
    const r = eng.incoming({ id: foe.id, x: foe.x, z: foe.z, yaw: Math.PI, radius: foe.radius }, 0, -1, w);
    expect(r).toBe('perfect');
    const types: string[] = [];
    for (let k = 0; k < eng.events.n; k++) types.push(eng.events.items[k].type);
    expect(types).toContain('stormBurst');
    expect(foe.hits).toBeGreaterThan(0);
  });

  it('Willens-Rausch: Mehrfach-Brüche laden die Willenskraft schneller', () => {
    const will = (t: TalentSave | null) => {
      const { w, eng, inp } = setup('zweihaender', t);
      w.ko = true;
      for (let i = 0; i < 5; i++) w.foe(Math.sin(i) * 1.5, 1.6 + Math.cos(i) * 0.6);
      run(eng, w, inp, 40, { light: true });
      return eng.f.will;
    };
    const t = nodes(['zweihaender.apex', 1], ['zweihaender.evowille', 2]);
    t.evo.zweihaender = ['zweihaender.evowille'];
    expect(will(t)).toBeGreaterThan(will(null));
  });

  it('Formsiegel öffnen die Formstufen 2 – 6, die Meisterprüfung die 7. Meisterform', () => {
    expect(formFloor(nodes(), 'wind')).toBe(1);
    expect(formFloor(nodes(['wind.formsiegel', 3]), 'wind')).toBe(4);
    expect(formFloor(nodes(['wind.formsiegel', 5]), 'wind')).toBe(6);
    expect(formFloor(nodes(['wind.meisterform', 1]), 'wind')).toBe(7);
    expect(buildTalentCombat(nodes(['wind.formsiegel', 2]), null).params.wind.formFloor).toBe(3);
  });

  it('Mutationen bauen Angriffe wirklich um: Dreifach-Beben, Dreifach-Sicheln, Luft-Hinrichtung, Element-Finisher', () => {
    const tc = buildTalentCombat(nodes(['zweihaender.m_berg', 1], ['mond.m_sichel', 1], ['saebel.m_tanz', 1], ['saebel.elementhieb', 1]), 'feuer');
    expect(tc.styles.zweihaender.skills[0].hits.length).toBe(ACTION_STYLES.zweihaender.skills[0].hits.length * 3);
    expect(tc.styles.mond.skills[0].hits[0].projectile!.count).toBe(ACTION_STYLES.mond.skills[0].hits[0].projectile!.count + 2);
    expect(tc.styles.saebel.skills[2].airOk).toBe(true);
    expect(tc.styles.saebel.skills[2].airExec).toBeGreaterThan(0);
    expect(tc.styles.saebel.finisher.hits.some((h) => h.status === 'burn')).toBe(true);
    expect(ACTION_STYLES.saebel.finisher.hits.some((h) => h.status === 'burn')).toBe(false);
    // gleiche Plätze wie ALL_MOVES: der Spielstand der Engine bleibt gültig
    expect(tc.moves.length).toBe(ALL_MOVES.length);
    tc.moves.forEach((m, i) => expect(m.id).toBe(ALL_MOVES[i].id));
  });
});

describe('Spielstand 22: Migration aus Version 21 ohne Verlust', () => {
  const v21 = () => {
    const s = createSave('Alt', 'pirat', '4.6.3') as Record<string, any>;
    s.version = 21;
    delete s.talents;
    s.player.level = 37; s.player.xp = 120; s.player.gold = 4321;
    s.player.faji = { equipped: 'feuer', mastery: { feuer: 700 }, aura: 2 };
    s.progress.flags = { kaiser_britannia: true, megaboss_kronenklippe: true, raidwon_albion: true };
    s.world.kaiser = { batavia: { cd: 120, wins: 2 } };
    s.world.seaEvents = { v: 1, t: 0, seq: 0, rng: 1, events: [], cooldowns: {}, nextSpawnAt: 0, convoys: [], nextConvoyAt: 0, cells: [], nextCellAt: 0, bossKills: { leviathan: 1 } };
    s.legends = ['kapitaen_x'];
    s.progress.unlocks.kaiserSeals = 7;
    s.progress.unlocks.kaiserRelics = ['bauplan_britannia', 'bauplan_batavia', 'relikt_batavia'];
    return s;
  };

  it('Talente entstehen: Siegel rückwirkend, besiegte Kaiser, Relikte und Baupläne; alles andere bleibt', () => {
    expect(SAVE_VERSION).toBe(22);
    const r = migrateSave(JSON.parse(JSON.stringify(v21())), '4.6.4');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.data, t = d.talents!;
    expect(d.version).toBe(22);
    expect(r.migratedFrom).toBe(21);
    expect(t.seals.sort()).toEqual(['kaiser_batavia', 'kaiser_britannia', 'legende_erste', 'mega_kronenklippe', 'raid_albion', 'weltboss_leviathan'].sort());
    expect(t.kaiserDefeated.sort()).toEqual(['batavia', 'britannia']);
    expect(t.blueprints.sort()).toEqual(['bauplan_batavia', 'bauplan_britannia']);
    expect(t.relics).toEqual(['relikt_batavia']);
    expect(talentTotal(t, d.player.level)).toBe(36 + 6);
    expect(d.player.level).toBe(37);
    expect(d.player.xp).toBe(120);
    expect(d.player.gold).toBe(4321);
    expect(d.player.faji).toMatchObject({ equipped: 'feuer', aura: 2 });
    expect(d.progress.unlocks!.kaiserSeals).toBe(7);
    expect(d.world.kaiser).toEqual({ batavia: { cd: 120, wins: 2 } });
    // Rundlauf: gespeicherte Ränge bleiben
    t.nodes['feuer.glutstand'] = 3;
    const again = migrateSave(JSON.parse(JSON.stringify(d)), '4.6.4');
    expect(again.ok && again.data.talents!.nodes['feuer.glutstand']).toBe(3);
  });

  it('eine Stufe über 100 (alte Kurve) wird auf 100 begrenzt und vermerkt; Stufe 101 ohne Aufstieg gibt es nicht', () => {
    const s = v21();
    s.player.level = 130;
    const r = migrateSave(JSON.parse(JSON.stringify(s)), '4.6.4');
    expect(r.ok && r.data.player.level).toBe(100);
    expect(r.ok && r.data.talents!.legacyLevel).toBe(130);
    expect(r.ok && r.data.player.xp).toBe(0);
    const n = createSave('Neu', 'marine', '4.6.4') as Record<string, any>;
    n.player.level = 101;
    const r2 = migrateSave(JSON.parse(JSON.stringify(n)), '4.6.4');
    expect(r2.ok && r2.data.player.level).toBe(100);
  });
});

describe('Talent-Fenster (Anzeige)', () => {
  it('zeichnet alle 18 Bäume, die Siegel und den Aufstieg; Stufe 101 bleibt geheim, bis alle fünf Kaiser gefallen sind', () => {
    const plain = emptyTalents();
    const hidden = talentScreenHtml({ t: plain, w: rich(100, 3), xp: 0, xpNeed: 1, gold: 500 }, newTalentUi('zweihaender'));
    expect(hidden).not.toContain('Stufe 101');
    expect(hidden).not.toContain('data-id="aufstieg"');
    expect(hidden).not.toContain('data-id="kosmos"');
    const t = loaded();
    ascend(t, rich(100, 20));
    for (const c of COSMIC_SOURCES) if (!t.cosmic.includes(c.id)) t.cosmic.push(c.id);
    const v = { t, w: rich(101, 20), xp: 0, xpNeed: 1, gold: 99_999 };
    for (const tr of TALENT_TREES) {
      const ui = newTalentUi(tr.id);
      ui.sel = tr.nodes[tr.nodes.length - 1].id;
      const html = talentScreenHtml(v, ui);
      expect(html, tr.id).toContain(tr.name.replace(/&/g, '&amp;'));
      expect(html, tr.id).toContain(`data-id="${tr.nodes[0].id}"`);
      expect(html, tr.id).toContain(NODE_BY_ID[ui.sel].name.replace(/&/g, '&amp;'));
    }
    for (const tab of ['siegel', 'aufstieg'] as const) {
      const ui = newTalentUi('kosmos');
      ui.tab = tab;
      const html = talentScreenHtml(v, ui);
      expect(html).toContain(tab === 'siegel' ? 'Meisterschafts-Siegel' : 'Aufgestiegen');
    }
  });
});
