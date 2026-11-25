// Phase 4.6E – Regeln des Talent- und Stufensystems (rein: ohne three.js, ohne Zufall, ohne Spielobjekte).
//
// Punkte: bis Stufe 100 je Aufstieg ein Talentpunkt (99) plus die 21 Meisterschafts-Siegel = 120. Stufe 101 gibt es nur über die
// Aufstiegs-Prüfung (Stufe 100, alle fünf Kaiser-Inseln besiegt, Opfer am Sternenaltar); erst danach ist der Kosmos-Baum sichtbar und
// kosmische Punkte (höchstens 15) zählen. Alle Prüfungen liefern deutsche Texte für die Oberfläche; die Wirkung auf den Kampf rechnet
// `combat/talentCombat.ts`, die Obergrenzen stehen in `data/balanceConfig.ts` (`TALENT_CAP`).
import {
  COMBAT_TREES, CONSTELLATIONS, COSMIC_SOURCE_IDS, FX_INFO, MILESTONES, MILESTONE_BY_ID, NODE_BY_ID, TALENT, TREE_BY_ID, isCombatTree, isTalentTree, rankCost,
  type CombatTreeId, type FxKey, type TalentNodeDef, type TalentTreeId,
} from '../data/talentTrees';
import { KAISER_IDS } from '../data/kaiserIslands';
import { TALENT_CAP, softCap } from '../data/balanceConfig';
import { xpToNext } from '../data/combat';
import { SK } from '../data/skills';

// ---------- Spielstand ----------

/** Talent-Zustand im Spielstand (seit Version 22): reine, JSON-taugliche Daten */
export interface TalentSave {
  v: 1;
  /** investierte Ränge je Knoten (Schlüssel = Knoten-ID `baum.knoten`, auch Kosmos) */
  nodes: Record<string, number>;
  /** verdiente Meisterschafts-Siegel (IDs aus `MILESTONES`) – je Siegel ein Talentpunkt */
  seals: string[];
  /** verdiente kosmische Punkte (IDs aus `COSMIC_SOURCES`) */
  cosmic: string[];
  /** Aufstieg auf Stufe 101 vollzogen */
  ascended: boolean;
  /** besiegte Kaiser-Inseln des fünften Rings (Kennungen) */
  kaiserDefeated: string[];
  /** Siege je Kaiser nach dem Aufstieg (Sternenprüfung beim ersten, Revanche beim zweiten) */
  kaiserAfter: Record<string, number>;
  /** gesammelte Kaiser-Relikte (`relikt_*`) und Mythische Baupläne (`bauplan_*`); am Sternenaltar gebundene (geopferte) IDs */
  relics: string[];
  blueprints: string[];
  bound: string[];
  /** in Talenten gebundene Kaiser-Siegel (Anzeige; Siegel werden beim Zurücksetzen nicht erstattet) */
  sealsSpent: number;
  /** ausgerüstete Ultimate-Evolutionen je Kampfbaum (Knoten-IDs, höchstens `TALENT.evoSlots`) */
  evo: Record<string, string[]>;
  /** Ultimate des Sturm-Erwachens: das des Stils oder der Himmelssturz (Kosmos) */
  ult: 'stil' | 'kosmos';
  /** Zahl der Rücksetzungen (der Preis steigt) */
  respecs: number;
  /** Stufe eines alten Stands über 100 (nur Anzeige; die Stufe selbst wird auf 100 begrenzt) */
  legacyLevel?: number;
  /**
   * 4.6H: Bonus-Talentpunkte über Stufen und Siegel hinaus: die umgerechneten alten Faji-Punkte (frei und in Techniken gebunden) sowie alles, was
   * früher Faji-Punkte gab (Bossinseln, Ruinen, Faji-Kristalle, erste Legenden, Aufträge, Splitter, Schrein, Faji-Erwachen)
   */
  bonus: number;
  /** 4.6H: die alten Faji-Punkte (Taste K) sind in diesen gemeinsamen Topf übernommen (einmal beim Laden, `mergeFajiPoints`) */
  fajiMerged: boolean;
}

export function emptyTalents(): TalentSave {
  return { v: 1, nodes: {}, seals: [], cosmic: [], ascended: false, kaiserDefeated: [], kaiserAfter: {}, relics: [], blueprints: [], bound: [], sealsSpent: 0, evo: {}, ult: 'stil', respecs: 0, bonus: 0, fajiMerged: true };
}

/** Was die Regeln über den übrigen Spielstand wissen müssen */
export interface TalentWorld {
  /** Stufe der Spielfigur (1 … 101) */
  level: number;
  /** verfügbare Kaiser-Siegel (`progress.unlocks.kaiserSeals`) */
  kaiserSeals: number;
  /** 4.6H: in Faji-Techniken (F1 – F3, früher Taste K) gebundene Punkte desselben Topfs */
  techSpent?: number;
}

// ---------- Stufen und Erfahrung ----------

/** Erfahrung bis zur nächsten Stufe; auf der Höchststufe (100) und nach dem Aufstieg gibt es keine weitere */
export const xpNeedAt = (level: number): number => xpToNext(Math.min(level, TALENT.levelCap));

/**
 * Erfahrung gutschreiben: Stufenaufstiege bis höchstens Stufe 100 (Stufe 101 nur über den Aufstieg). Auf der Höchststufe verfällt weitere
 * Erfahrung (der Balken bleibt voll). Rückgabe: neue Stufe, Rest-Erfahrung, Zahl der Aufstiege.
 */
export function applyXp(level: number, xp: number, gain: number): { level: number; xp: number; ups: number } {
  let l = Math.max(1, Math.floor(level)), x = Math.max(0, xp) + Math.max(0, gain), ups = 0;
  if (l >= TALENT.levelCap) return { level: l, xp: 0, ups: 0 };
  while (l < TALENT.levelCap && x >= xpToNext(l)) { x -= xpToNext(l); l++; ups++; }
  if (l >= TALENT.levelCap) x = 0;
  return { level: l, xp: x, ups };
}

/** Gesamte Erfahrung von Stufe 1 bis zur Stufe `level` */
export function xpTotalTo(level: number): number {
  let t = 0;
  for (let l = 1; l < Math.min(level, TALENT.levelCap); l++) t += xpToNext(l);
  return t;
}

// ---------- Punkte ----------

/** Talentpunkte aus Stufenaufstiegen (Stufe − 1, höchstens 99) */
export const levelPoints = (level: number): number => Math.max(0, Math.min(TALENT.levelCap, Math.floor(level)) - 1);
/** Alle regulären Talentpunkte: Stufen plus Meisterschafts-Siegel (höchstens 120) */
export const talentTotal = (t: TalentSave, level: number): number => Math.min(TALENT.total, levelPoints(level) + Math.min(TALENT.sealPoints, t.seals.length));

const rankOf = (t: TalentSave, id: string): number => t.nodes[id] ?? 0;

/** In einem Baum investierte Punkte (Krone des Kosmos zählt dreifach) */
export function treePoints(t: TalentSave, tree: TalentTreeId): number {
  let n = 0;
  for (const node of TREE_BY_ID[tree].nodes) n += rankOf(t, node.id) * rankCost(node);
  return n;
}

/** Ausgegebene reguläre Punkte (alle Bäume außer dem Kosmos) */
export function spentRegular(t: TalentSave): number {
  let n = 0;
  for (const [id, r] of Object.entries(t.nodes)) { const node = NODE_BY_ID[id]; if (node && node.tree !== 'kosmos') n += r * rankCost(node); }
  return n;
}
/** 4.6H: der gemeinsame Topf – Stufen, Meisterschafts-Siegel und Bonuspunkte (umgerechnete alte Faji-Punkte) */
export const poolTotal = (t: TalentSave, level: number): number => talentTotal(t, level) + Math.max(0, t.bonus || 0);
/** Freie Punkte des gemeinsamen Topfs (Talentbäume und Faji-Techniken zahlen aus demselben) */
export const freePoints = (t: TalentSave, level: number, techSpent = 0): number => poolTotal(t, level) - spentRegular(t) - Math.max(0, techSpent);

/** 4.6H: in Faji-Techniken gebundene Punkte (je Rang einer; nur bekannte Techniken, höchstens ihr Höchstrang) */
export function techSpentOf(learned: Record<string, number> | null | undefined): number {
  let n = 0;
  if (!learned) return 0;
  for (const [id, r] of Object.entries(learned)) {
    const d = SK[id];
    if (!d || typeof r !== 'number' || !Number.isFinite(r)) continue;
    n += Math.max(0, Math.min(d.max, Math.floor(r)));
  }
  return n;
}

/**
 * 4.6H: die alten Faji-Punkte (Taste K) in den gemeinsamen Topf übernehmen – einmal je Spielstand: alle schon in Techniken gebundenen Punkte und die
 * freien Faji-Punkte werden zu Bonus-Talentpunkten (die Techniken bleiben gelernt und zahlen ab jetzt aus demselben Topf, es geht also nichts
 * verloren). Danach landet jeder später noch auftauchende freie Faji-Punkt ebenfalls im Topf. Rückgabe: übernommene Punkte.
 */
export function mergeFajiPoints(t: TalentSave, skills: { sp: number; learned: Record<string, number> }): number {
  let add = 0;
  if (!t.fajiMerged) { add += techSpentOf(skills.learned); t.fajiMerged = true; }
  const sp = Number.isFinite(skills.sp) ? Math.max(0, Math.floor(skills.sp)) : 0;
  if (sp > 0) add += sp;
  skills.sp = 0;
  t.bonus = Math.max(0, Math.min(9999, Math.floor((t.bonus || 0) + add)));
  return add;
}

/** 4.6H: Bonus-Talentpunkte gutschreiben (Bossinsel, Ruine, Kristall, Legende, Auftrag, Splitter, Schrein, Erwachen) */
export function grantBonus(t: TalentSave, n: number): number {
  const k = Math.max(0, Math.floor(n));
  t.bonus = Math.max(0, Math.min(9999, (t.bonus || 0) + k));
  return k;
}

/** Kosmische Punkte (zählen erst nach dem Aufstieg) */
export const cosmicTotal = (t: TalentSave): number => (t.ascended ? Math.min(TALENT.cosmicMax, t.cosmic.filter((c) => COSMIC_SOURCE_IDS.has(c)).length) : 0);
export const spentCosmic = (t: TalentSave): number => treePoints(t, 'kosmos');
export const freeCosmic = (t: TalentSave): number => cosmicTotal(t) - spentCosmic(t);

/** Gewählter Pfad der Stufe 2 eines Kampfbaums */
export function pathOf(t: TalentSave, tree: TalentTreeId): 'A' | 'B' | null {
  for (const n of TREE_BY_ID[tree].nodes) if (n.path && rankOf(t, n.id) > 0) return n.path;
  return null;
}

/** Der gebundene Meisterbaum (ein Kampfbaum mit mindestens `TALENT.commit` Punkten) oder null */
export function committedTree(t: TalentSave): CombatTreeId | null {
  for (const id of COMBAT_TREES) if (treePoints(t, id) >= TALENT.commit) return id;
  return null;
}

/** Besitz an Mythischen Bauplänen und Kaiser-Relikten (gebundene zählen als Besitz für Knoten, nicht für den Altar) */
export const ownedBlueprints = (t: TalentSave): number => t.blueprints.length;
export const ownedRelics = (t: TalentSave): number => t.relics.length;
export const freeBlueprints = (t: TalentSave): string[] => t.blueprints.filter((b) => !t.bound.includes(b));
export const freeRelics = (t: TalentSave): string[] => t.relics.filter((r) => !t.bound.includes(r));

/** Ist der Baum sichtbar? (der Kosmos erst nach dem Aufstieg) */
export const treeVisible = (t: TalentSave, tree: TalentTreeId): boolean => tree !== 'kosmos' || t.ascended;

// ---------- Freischalten ----------

/** Mindeststufe für den nächsten Rang eines Knotens */
export function levelFor(n: TalentNodeDef, rank: number): number {
  const tr = TREE_BY_ID[n.tree];
  return n.levels?.[Math.min(rank, n.levels.length - 1)] ?? tr.tiers[Math.min(n.tier, tr.tiers.length) - 1]?.level ?? 1;
}

/** Sterne (gelernte Kosmos-Knoten außer der Krone) und Zahl der Sternbilder mit mindestens einem Stern */
export function starsLit(t: TalentSave): { stars: number; constellations: number } {
  let stars = 0;
  const seen = new Set<string>();
  for (const n of TREE_BY_ID.kosmos.nodes) if (n.constellation && rankOf(t, n.id) > 0) { stars++; seen.add(n.constellation); }
  return { stars, constellations: seen.size };
}

/**
 * Warum kann dieser Knoten jetzt keinen weiteren Rang bekommen? null = er kann. Prüft Sichtbarkeit, Höchstrang, Punkte, Stufe, Freischalt-
 * Grenze der Stufe, Pfadwahl, Vorgänger, Build-Bindung, Kaiser-Siegel und Besitz an Bauplänen und Relikten.
 */
export function learnBlock(t: TalentSave, w: TalentWorld, id: string): string | null {
  const n = NODE_BY_ID[id];
  if (!n) return 'Unbekanntes Talent.';
  const tree = TREE_BY_ID[n.tree];
  if (!treeVisible(t, n.tree)) return 'Erst nach dem Aufstieg auf Stufe 101.';
  const r = rankOf(t, id);
  if (r >= n.max) return 'Höchster Rang erreicht.';
  const cost = rankCost(n);
  if (n.tree === 'kosmos') {
    if (freeCosmic(t) < cost) return cost > 1 ? `${cost} kosmische Punkte nötig.` : 'Keine freien kosmischen Punkte.';
  } else if (freePoints(t, w.level, w.techSpent ?? 0) < cost) return 'Keine freien Talentpunkte.';
  const lv = levelFor(n, r);
  if (w.level < lv) return `Stufe ${lv} nötig.`;
  const gate = tree.tiers[n.tier - 1]?.gate ?? 0;
  if (treePoints(t, n.tree) < gate) return `${gate} Punkte in diesem Baum nötig.`;
  if (n.path) {
    const p = pathOf(t, n.tree);
    if (p && p !== n.path) return `Pfad ${p} („${tree.paths?.[p].name ?? ''}“) ist gewählt – erst zurücksetzen.`;
  }
  for (const need of n.needs ?? []) {
    if (rankOf(t, need) < 1) return `Erst „${NODE_BY_ID[need]?.name ?? need}“ lernen.`;
  }
  if (isCombatTree(n.tree)) {
    const held = committedTree(t);
    if (held && held !== n.tree && treePoints(t, n.tree) + cost >= TALENT.commit) {
      return `Build-Bindung: „${TREE_BY_ID[held].name}“ ist dein Meisterbaum – jeder andere Kampfbaum endet bei ${TALENT.commit - 1} Punkten.`;
    }
  }
  const seals = n.seals?.[r] ?? 0;
  if (seals > w.kaiserSeals) return `${seals} Kaiser-Siegel nötig (du hast ${w.kaiserSeals}).`;
  const bp = n.blueprints?.[r] ?? 0;
  if (bp > ownedBlueprints(t)) return bp > 1 ? `${bp} Mythische Baupläne nötig.` : 'Ein Mythischer Bauplan nötig (erster Sieg über einen Kaiser).';
  const rel = n.relics?.[r] ?? 0;
  if (rel > ownedRelics(t)) return `${rel} Kaiser-Relikt${rel > 1 ? 'e' : ''} nötig (aus Kaiser-Revanchen).`;
  if (n.id === 'kosmos.himmelssturz') {
    const s = starsLit(t);
    if (s.stars < TALENT.skyfallStars || s.constellations < TALENT.skyfallConstellations) {
      return `${TALENT.skyfallStars} Sterne in mindestens ${TALENT.skyfallConstellations} Sternbildern nötig (${s.stars} in ${s.constellations}).`;
    }
  }
  return null;
}

export type LearnResult = { ok: true; seals: number } | { ok: false; reason: string };

/** Einen Rang lernen. `seals` = verbrauchte Kaiser-Siegel (zieht das Spiel von `progress.unlocks.kaiserSeals` ab). */
export function learn(t: TalentSave, w: TalentWorld, id: string): LearnResult {
  const why = learnBlock(t, w, id);
  if (why) return { ok: false, reason: why };
  const n = NODE_BY_ID[id];
  const r = rankOf(t, id);
  const seals = n.seals?.[r] ?? 0;
  t.nodes[id] = r + 1;
  t.sealsSpent += seals;
  // Ultimate-Evolution: beim ersten Rang ausrüsten, solange ein Platz frei ist
  if (n.tier === 7 && isCombatTree(n.tree) && r === 0) {
    const eq = (t.evo[n.tree] ??= []);
    if (eq.length < TALENT.evoSlots && !eq.includes(id)) eq.push(id);
  }
  return { ok: true, seals };
}

/** Ultimate-Evolution aus- oder abrüsten; Rückgabe: Fehlermeldung oder null */
export function equipEvo(t: TalentSave, id: string, on: boolean): string | null {
  const n = NODE_BY_ID[id];
  if (!n || n.tier !== 7 || !isCombatTree(n.tree)) return 'Keine Ultimate-Evolution.';
  const eq = (t.evo[n.tree] ??= []);
  if (!on) { t.evo[n.tree] = eq.filter((e) => e !== id); return null; }
  if (rankOf(t, id) < 1) return 'Erst lernen.';
  if (eq.includes(id)) return null;
  if (eq.length >= TALENT.evoSlots) return `Höchstens ${TALENT.evoSlots} Evolutionen zugleich – erst eine ablegen.`;
  eq.push(id);
  return null;
}

/** Ultimate des Erwachens wählen (Himmelssturz nur mit gelernter Krone) */
export function chooseUltimate(t: TalentSave, ult: 'stil' | 'kosmos'): string | null {
  if (ult === 'kosmos' && rankOf(t, 'kosmos.himmelssturz') < 1) return 'Erst die Krone „Himmelssturz“ lernen.';
  t.ult = ult;
  return null;
}

// ---------- Zurücksetzen ----------

export type RespecScope = 'all' | TalentTreeId;

const inScope = (n: TalentNodeDef, scope: RespecScope): boolean => (scope === 'all' ? n.tree !== 'kosmos' : n.tree === scope);

/** Preis des Zurücksetzens: Gold (steigt mit Stufe und Zahl der Rücksetzungen; ein Baum allein kostet 40 %) und Kaiser-Siegel für Meister-Knoten */
export function respecCost(t: TalentSave, level: number, scope: RespecScope): { gold: number; seals: number; points: number } {
  const R = TALENT.respec;
  let points = 0, master = false;
  for (const [id, r] of Object.entries(t.nodes)) {
    const n = NODE_BY_ID[id];
    if (!n || r <= 0 || !inScope(n, scope)) continue;
    points += r * rankCost(n);
    if ((isCombatTree(n.tree) && n.tier >= 5) || (n.seals?.some((s) => s > 0) ?? false) || n.tree === 'kosmos') master = true;
  }
  if (points === 0) return { gold: 0, seals: 0, points: 0 };
  const k = Math.min(R.repeatMax, 1 + R.repeatK * t.respecs) * (scope === 'all' ? 1 : R.treeK);
  const gold = Math.round((R.goldBase + R.goldPerLevel * Math.min(level, TALENT.levelCap)) * k);
  return { gold, seals: master ? (scope === 'kosmos' ? 1 : R.masterSeals) : 0, points };
}

/** 4.6H: Preis, einen Zweig der Faji-Techniken zurückzusetzen (wie ein einzelner Baum: Gold nach Stufe und Zahl der Rücksetzungen, keine Siegel) */
export function techRespecCost(t: TalentSave, level: number, points: number): { gold: number; seals: number; points: number } {
  if (points <= 0) return { gold: 0, seals: 0, points: 0 };
  const R = TALENT.respec;
  const k = Math.min(R.repeatMax, 1 + R.repeatK * t.respecs) * R.treeK;
  return { gold: Math.round((R.goldBase + R.goldPerLevel * Math.min(level, TALENT.levelCap)) * k), seals: 0, points };
}

/** Zurücksetzen (Preis zahlt das Spiel vorher): Ränge, Pfadwahl und ausgerüstete Evolutionen im Bereich verschwinden */
export function respec(t: TalentSave, scope: RespecScope): number {
  let freed = 0;
  for (const id of Object.keys(t.nodes)) {
    const n = NODE_BY_ID[id];
    if (!n || !inScope(n, scope)) continue;
    freed += (t.nodes[id] ?? 0) * rankCost(n);
    delete t.nodes[id];
  }
  for (const tree of Object.keys(t.evo)) if (scope === 'all' ? isCombatTree(tree) : tree === scope) delete t.evo[tree];
  if (rankOf(t, 'kosmos.himmelssturz') < 1) t.ult = 'stil';
  if (freed > 0) t.respecs++;
  return freed;
}

// ---------- Meisterschafts-Siegel ----------

/** Siegel vergeben (erster Sieg); true = neu */
export function claimMilestone(t: TalentSave, id: string): boolean {
  if (!MILESTONE_BY_ID[id] || t.seals.includes(id)) return false;
  t.seals.push(id);
  return true;
}

/** Woraus sich die Siegel eines Spielstands rückwirkend ergeben (Migration, Laden) */
export interface MilestoneSource {
  flags: Record<string, unknown>;
  /** Siege je Kaiser (`world.kaiser`) */
  kaiserWins: Record<string, number>;
  /** Siege je Weltboss (`world.seaEvents.bossKills`) */
  bossKills: Record<string, number>;
  /** besiegte Legenden */
  legends: readonly string[];
}

export function milestonesEarned(src: MilestoneSource): string[] {
  const out: string[] = [];
  for (const m of MILESTONES) {
    let ok = false;
    switch (m.kind) {
      case 'kaiser': ok = (src.kaiserWins[m.ref] ?? 0) > 0 || !!src.flags[`kaiser_${m.ref}`]; break;
      case 'mega': ok = !!src.flags[`megaboss_${m.ref}`]; break;
      case 'weltboss': ok = (src.bossKills[m.ref] ?? 0) > 0 || !!src.flags[`weltboss_${m.ref}`]; break;
      case 'raid': ok = !!src.flags[`raidwon_${m.ref}`]; break;
      case 'legende': ok = src.legends.length > 0; break;
    }
    if (ok) out.push(m.id);
  }
  return out;
}

// ---------- Kaiser, Relikte, Aufstieg ----------

/** Kaiser-Stand übernehmen: besiegte Kaiser aus den Siegen, Relikte und Baupläne aus der Sammlung (`progress.unlocks.kaiserRelics`) */
export function syncKaiser(t: TalentSave, kaiserWins: Record<string, number>, relicIds: readonly string[]) {
  for (const id of KAISER_IDS) if ((kaiserWins[id] ?? 0) > 0 && !t.kaiserDefeated.includes(id)) t.kaiserDefeated.push(id);
  for (const r of relicIds) {
    if (typeof r !== 'string') continue;
    if (r.startsWith('bauplan_') && !t.blueprints.includes(r)) t.blueprints.push(r);
    else if (r.startsWith('relikt_') && !t.relics.includes(r)) t.relics.push(r);
  }
}

export const allKaiserDefeated = (t: TalentSave): boolean => KAISER_IDS.every((id) => t.kaiserDefeated.includes(id));

export interface AscensionRow { label: string; ok: boolean; have: string }

/** Bedingungen der Aufstiegs-Prüfung (Stufe 101) als Zeilen für die Anzeige */
export function ascensionRows(t: TalentSave, w: TalentWorld): AscensionRow[] {
  const A = TALENT.ascension;
  const k = KAISER_IDS.filter((id) => t.kaiserDefeated.includes(id)).length;
  return [
    { label: `Stufe ${TALENT.levelCap}`, ok: w.level >= TALENT.levelCap, have: `Stufe ${w.level}` },
    { label: 'Alle fünf Kaiser-Inseln des fünften Rings besiegt', ok: k >= KAISER_IDS.length, have: `${k}/${KAISER_IDS.length}` },
    { label: `${A.blueprints} Mythische Baupläne opfern`, ok: freeBlueprints(t).length >= A.blueprints, have: `${freeBlueprints(t).length}` },
    { label: `${A.relics} Kaiser-Relikte opfern`, ok: freeRelics(t).length >= A.relics, have: `${freeRelics(t).length}` },
    { label: `${A.seals} Kaiser-Siegel opfern`, ok: w.kaiserSeals >= A.seals, have: `${w.kaiserSeals}` },
  ];
}

/** Ist der Aufstieg überhaupt schon sichtbar? (das Geheimnis lüftet sich erst, wenn alle fünf Kaiser gefallen sind) */
export const ascensionRevealed = (t: TalentSave): boolean => t.ascended || allKaiserDefeated(t);

export type AscendResult = { ok: true; seals: number; cosmic: number } | { ok: false; reason: string };

/** Aufstieg vollziehen: Baupläne und Relikte binden, Stufe 101 (setzt das Spiel), fünf kosmische Punkte */
export function ascend(t: TalentSave, w: TalentWorld): AscendResult {
  if (t.ascended) return { ok: false, reason: 'Der Aufstieg ist schon vollzogen.' };
  const miss = ascensionRows(t, w).find((r) => !r.ok);
  if (miss) return { ok: false, reason: `Noch nicht bereit: ${miss.label}.` };
  const A = TALENT.ascension;
  t.bound.push(...freeBlueprints(t).slice(0, A.blueprints), ...freeRelics(t).slice(0, A.relics));
  t.ascended = true;
  let cosmic = 0;
  for (let i = 1; i <= 5; i++) { const id = `aufstieg_${i}`; if (!t.cosmic.includes(id)) { t.cosmic.push(id); cosmic++; } }
  return { ok: true, seals: A.seals, cosmic };
}

/**
 * Sieg über einen Kaiser nach dem Aufstieg: der erste je Insel ist die Sternenprüfung, der zweite die Revanche – je ein kosmischer Punkt.
 * Rückgabe: Kennung des neuen kosmischen Punkts oder null.
 */
export function kaiserWinAscended(t: TalentSave, kaiserId: string): string | null {
  if (!t.ascended || !(KAISER_IDS as readonly string[]).includes(kaiserId)) return null;
  const n = (t.kaiserAfter[kaiserId] = (t.kaiserAfter[kaiserId] ?? 0) + 1);
  const id = n === 1 ? `pruefung_${kaiserId}` : n === 2 ? `revanche_${kaiserId}` : null;
  if (!id || t.cosmic.includes(id)) return null;
  t.cosmic.push(id);
  return id;
}

// ---------- Wirkungen ----------

export type FxSums = Partial<Record<FxKey, number>>;

/** Ist dieser Knoten wirksam? (Ultimate-Evolutionen nur, wenn ausgerüstet) */
function active(t: TalentSave, n: TalentNodeDef): boolean {
  if (n.tier === 7 && isCombatTree(n.tree)) return (t.evo[n.tree] ?? []).includes(n.id);
  return true;
}

/** Summen der Wirkungen (vor den Obergrenzen) über die genannten Bäume */
export function fxSums(t: TalentSave, trees: readonly TalentTreeId[]): FxSums {
  const out: FxSums = {};
  for (const [id, r] of Object.entries(t.nodes)) {
    if (r <= 0) continue;
    const n = NODE_BY_ID[id];
    if (!n || !trees.includes(n.tree) || !active(t, n)) continue;
    if (n.tree === 'kosmos' && !t.ascended) continue;
    for (const [k, v] of Object.entries(n.fx) as [FxKey, number][]) out[k] = (out[k] ?? 0) + v * r;
  }
  return out;
}

/** Obergrenze einer Wirkung (Schlüssel in `TALENT_CAP`), Zählwerte abgerundet */
const CAP_OF: Partial<Record<FxKey, keyof typeof TALENT_CAP>> = {
  auraSight: 'aura', auraIron: 'aura', auraKing: 'aura', vortexK: 'vortex', stance: 'reduce', armor: 'reduce',
};
const COUNT_KEYS: ReadonlySet<FxKey> = new Set<FxKey>(['pen', 'jumps', 'airDashes', 'aftershock', 'meteorRain']);

/** Wirksamer Wert einer Summe: asymptotisch gedeckelt (Anteile, Sekunden, Meter), Zählwerte abgerundet und gekappt, Schalter 0/1 */
export function capFx(key: FxKey, raw: number | undefined): number {
  const v = raw ?? 0;
  if (!(v > 0)) return 0;
  if (FX_INFO[key].unit === 'flag') return 1;
  const ck = CAP_OF[key] ?? (key in TALENT_CAP ? (key as keyof typeof TALENT_CAP) : null);
  const cap = ck ? TALENT_CAP[ck] : Infinity;
  if (COUNT_KEYS.has(key)) return Math.min(cap, Math.floor(v + 1e-6));
  return Number.isFinite(cap) ? softCap(v, cap) : v;
}

/** Formstufe, die die Talente einer Faji-Kunst mindestens geben (1 = keine; Formsiegel je Rang eine, Meisterprüfung die 7.) */
export function formFloor(t: TalentSave, tree: TalentTreeId): number {
  const s = fxSums(t, [tree]);
  if ((s.form ?? 0) > 0) return 7;
  return Math.max(1, Math.min(6, 1 + Math.floor(s.formStep ?? 0)));
}

/** Kapitäns- und Weltwirkungen (alle drei Kapitänsbäume), gedeckelt */
export function captainFx(t: TalentSave): Record<FxKey, number> {
  const s = fxSums(t, ['admiral', 'belagerung', 'handel']);
  const out = {} as Record<FxKey, number>;
  for (const k of Object.keys(FX_INFO) as FxKey[]) out[k] = capFx(k, s[k]);
  return out;
}

/** Leben und Schadensminderung aus allen Bäumen (gelten unabhängig vom Stil), gedeckelt */
export function defenseFx(t: TalentSave): { hp: number; armor: number } {
  const all = [...COMBAT_TREES, 'admiral', 'belagerung', 'handel', 'kosmos'] as TalentTreeId[];
  const s = fxSums(t, all);
  return { hp: capFx('hp', s.hp), armor: capFx('armor', s.armor) };
}

/** Text einer Wirkung (für die Anzeige): „+6 % Schaden“, „−9 % Abklingzeit der Techniken“, „+0,6 s Fenster des Sturm-Schritts“ */
export function fxText(key: FxKey, v: number): string {
  const info = FX_INFO[key];
  if (info.unit === 'flag') return info.label;
  const sign = info.sign < 0 ? '−' : '+';
  const num = (x: number, d: number) => x.toFixed(d).replace(/\.?0+$/, '').replace('.', ',');
  if (key === 'formStep') return `Formstufe ${1 + Math.floor(v)}`;
  // Schadensfaktoren eigener Treffer (Schockwelle, Entladung): Anteil am Grundschaden statt Zuschlag
  if (key === 'heavyWave' || key === 'stormBurst') return `${info.label.replace(/ \(Schaden\)$/, '')}: ${num(v * 100, 1)} % Grundschaden`;
  if (info.unit === '%') return `${sign}${num(v * 100, 1)} % ${info.label}`;
  if (info.unit === 's') return `${sign}${num(v, 2)} s ${info.label}`;
  if (info.unit === 'm') return `${sign}${num(v, 2)} m ${info.label}`;
  return `${sign}${num(v, 2)} ${info.label}`;
}

// ---------- Säubern (Laden, Migration) ----------

/** Was das Säubern über den übrigen Stand weiß */
export interface TalentCleanContext {
  level: number;
  kaiserWins: Record<string, number>;
  relicIds: readonly string[];
  milestones: readonly string[];
  /** 4.6H: in Faji-Techniken gebundene Punkte (zählen erst nach der Übernahme der alten Faji-Punkte zum gemeinsamen Topf) */
  techSpent?: number;
}

const strList = (v: unknown, ok: (s: string) => boolean): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ok(x)))] : []);

/**
 * Talent-Stand aus unbekannten Daten: nur bekannte Knoten, Ränge begrenzt, Pfade eindeutig (bei beiden Pfaden gewinnt A), Bindung eingehalten,
 * nie mehr ausgegeben als verdient (sonst wird der Bereich kostenlos zurückgesetzt), Evolutionen nur gelernte, Kaiser-Stand ergänzt.
 */
export function cleanTalents(raw: unknown, ctx: TalentCleanContext): TalentSave {
  const t = emptyTalents();
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (o.nodes && typeof o.nodes === 'object') {
    for (const [id, v] of Object.entries(o.nodes as Record<string, unknown>)) {
      const n = NODE_BY_ID[id];
      if (!n || typeof v !== 'number' || !Number.isFinite(v)) continue;
      const r = Math.max(0, Math.min(n.max, Math.floor(v)));
      if (r > 0) t.nodes[id] = r;
    }
  }
  t.seals = strList(o.seals, (s) => !!MILESTONE_BY_ID[s]);
  for (const m of ctx.milestones) if (MILESTONE_BY_ID[m] && !t.seals.includes(m)) t.seals.push(m);
  t.cosmic = strList(o.cosmic, (s) => COSMIC_SOURCE_IDS.has(s));
  t.ascended = o.ascended === true && ctx.level >= TALENT.ascendedLevel;
  t.kaiserDefeated = strList(o.kaiserDefeated, (s) => (KAISER_IDS as readonly string[]).includes(s));
  if (o.kaiserAfter && typeof o.kaiserAfter === 'object') {
    for (const [k, v] of Object.entries(o.kaiserAfter as Record<string, unknown>)) {
      if ((KAISER_IDS as readonly string[]).includes(k) && typeof v === 'number' && Number.isFinite(v)) t.kaiserAfter[k] = Math.max(0, Math.min(999, Math.floor(v)));
    }
  }
  t.relics = strList(o.relics, (s) => s.startsWith('relikt_'));
  t.blueprints = strList(o.blueprints, (s) => s.startsWith('bauplan_'));
  syncKaiser(t, ctx.kaiserWins, ctx.relicIds);
  t.bound = strList(o.bound, (s) => t.relics.includes(s) || t.blueprints.includes(s));
  t.sealsSpent = typeof o.sealsSpent === 'number' && Number.isFinite(o.sealsSpent) ? Math.max(0, Math.min(9999, Math.floor(o.sealsSpent))) : 0;
  t.respecs = typeof o.respecs === 'number' && Number.isFinite(o.respecs) ? Math.max(0, Math.min(999, Math.floor(o.respecs))) : 0;
  if (typeof o.legacyLevel === 'number' && Number.isFinite(o.legacyLevel) && o.legacyLevel > TALENT.levelCap) t.legacyLevel = Math.floor(o.legacyLevel);
  // 4.6H: Bonuspunkte und Übernahme der alten Faji-Punkte (fehlt der Merker, steht die Übernahme noch aus: `mergeFajiPoints` beim Laden)
  t.bonus = typeof o.bonus === 'number' && Number.isFinite(o.bonus) ? Math.max(0, Math.min(9999, Math.floor(o.bonus))) : 0;
  t.fajiMerged = o.fajiMerged === true;
  // Pfade eindeutig: hat ein Baum Ränge in beiden Pfaden (fremde Daten), fällt Pfad B weg
  for (const tree of COMBAT_TREES) {
    const nodes = TREE_BY_ID[tree].nodes;
    if (nodes.some((n) => n.path === 'A' && (t.nodes[n.id] ?? 0) > 0)) for (const n of nodes) if (n.path === 'B') delete t.nodes[n.id];
  }
  // Bindung: höchstens ein Kampfbaum mit 55 Punkten und mehr – die übrigen werden zurückgesetzt
  const big = COMBAT_TREES.filter((id) => treePoints(t, id) >= TALENT.commit);
  for (const id of big.slice(1)) for (const n of TREE_BY_ID[id].nodes) delete t.nodes[n.id];
  // nie mehr ausgegeben als verdient (nach der Übernahme zahlen die Faji-Techniken aus demselben Topf)
  const tech = t.fajiMerged ? Math.max(0, ctx.techSpent ?? 0) : 0;
  if (spentRegular(t) + tech > poolTotal(t, ctx.level)) for (const id of Object.keys(t.nodes)) if (NODE_BY_ID[id]?.tree !== 'kosmos') delete t.nodes[id];
  if (!t.ascended || spentCosmic(t) > cosmicTotal(t)) for (const n of TREE_BY_ID.kosmos.nodes) delete t.nodes[n.id];
  // Evolutionen: nur gelernte, höchstens zwei je Baum
  if (o.evo && typeof o.evo === 'object') {
    for (const [tree, list] of Object.entries(o.evo as Record<string, unknown>)) {
      if (!isCombatTree(tree)) continue;
      const ok = strList(list, (s) => NODE_BY_ID[s]?.tree === tree && NODE_BY_ID[s]?.tier === 7 && (t.nodes[s] ?? 0) > 0).slice(0, TALENT.evoSlots);
      if (ok.length) t.evo[tree] = ok;
    }
  }
  t.ult = o.ult === 'kosmos' && (t.nodes['kosmos.himmelssturz'] ?? 0) > 0 ? 'kosmos' : 'stil';
  return t;
}

/** Talent-Baum-Kennung prüfen (Oberfläche, Eingaben) */
export const talentTreeOk = (id: unknown): id is TalentTreeId => isTalentTree(id);

/** Sternbilder mit ihren gelernten Sternen (Anzeige) */
export function constellationState(t: TalentSave): { id: string; name: string; lit: number }[] {
  return CONSTELLATIONS.map((c) => ({ id: c.id, name: c.name, lit: TREE_BY_ID.kosmos.nodes.filter((n) => n.constellation === c.id && (t.nodes[n.id] ?? 0) > 0).length }));
}
