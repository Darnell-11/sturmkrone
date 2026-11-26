// Phase 4.6E – Wirkung der Talente auf den Action-Kampf: aus dem Talent-Stand entstehen umgebaute Kopien aller Stile und Angriffe (gleiche
// Kennungen, gleiche Plätze wie `ALL_MOVES`, damit `FighterState.moveIdx` gültig bleibt) und je Stil die Engine-Werte (Tempo, Willenskraft,
// Verfolgung, Sturm-Schritt-Entladung, Nachbeben …). Rein: ohne three.js und ohne Zufall; berechnet nur bei einer Änderung des Talent-Stands
// (Lernen, Zurücksetzen, Kunstwechsel), nie je Bild. Alle Summen laufen durch die asymptotischen Obergrenzen (`TALENT_CAP`), die
// Anti-One-Shot-Grenzen der Bosse wirken danach unverändert (`Enemy.takeHit`, `UltimateBossLedger`).
import {
  ACTION_STYLES, ALL_MOVES, moveIndex,
  type ActionHit, type ActionMove, type ActionSkill, type ActionStyleDef, type ActionStyleId,
} from '../data/actionStyles';
import { ACTION_STYLE_IDS, H0, type HitStatus } from '../data/actionKit';
import { SKYFALL_ULTIMATE } from '../data/cataclysms';
import { NODE_BY_ID, TREE_BY_ID, isCombatTree, type FxKey, type MutStep, type TalentTreeId } from '../data/talentTrees';
import { TALENT_CAP, softCap } from '../data/balanceConfig';
import { capFx, formFloor, fxSums, type FxSums, type TalentSave } from '../core/talentRules';
import type { FajiArtId } from '../data/fajiArts';

/** Engine-Werte eines Stils aus den Talenten */
export interface TalentEngineParams {
  /** Tempo-Faktoren der Ketten (Leicht, Luft, Wechselschlag) und der schweren Angriffe (Schwer, Verzweigung, Finisher, Meteor) */
  comboK: number;
  heavyK: number;
  /** zusätzlicher Magnet-Weg (m) je Angriff */
  magnetAdd: number;
  /** Faktor auf jeden Willenskraft-Gewinn; Willenskraft je zusätzlichem Bruch/K.O. ab drei in einem Fenster */
  willK: number;
  multiKill: number;
  /** Auto-Verfolgung nach jedem Hochschleudern (Stil), längeres Verfolgungsfenster (s) und mehr Reichweite (m) */
  autoChase: boolean;
  chaseAdd: number;
  chaseRangeAdd: number;
  /** Ausdauer-Faktor der Dashes */
  dashCostK: number;
  /** Schadensbonus gegen Ziele in der Luft (Stil; Mutationen tragen ihren eigenen über `ActionMove.airExec`) */
  airExec: number;
  /** Schadensminderung, solange ein eigener Angriff läuft */
  stance: number;
  /** Entladung beim Sturm-Schritt (Kreis um die Figur hinter dem Angreifer); null = keine */
  stormBurst: ActionHit | null;
  /** zusätzliche Dauer des Sturm-Erwachens (s) */
  awakenAdd: number;
  /** Nachbeben nach dem Einschlag eines Ultimates (0 … 2) und ihr Treffer */
  aftershock: number;
  aftershockHit: ActionHit;
  /** Auren-Stärke (Sturmblick: Fenster, Eisenwille: Durchschlag, Königsdruck: Radius) */
  auraSightK: number;
  auraIronK: number;
  auraKingK: number;
  /** Formstufe, die die Talente einer Faji-Kunst mindestens geben (1 = keine) */
  formFloor: number;
  /** Apex-Form des Ultimates erreicht */
  apex: boolean;
  /** 4.7B Klassenbaum: Faktor auf die Ausdauer-Regeneration */
  regenK: number;
}

/**
 * 4.7B: Stärkungen des Klassenbaums als Talent-Wirkungen (Krit, Krit-Schaden, Angriffskraft, Tempo, Abklingzeit); sie laufen durch dieselben
 * Obergrenzen. Leben, Rüstung und Heilkraft rechnet das Spiel selbst (`Game.classDefense`), die Regeneration geht als `regenK` an die Engine.
 */
export interface ClassCombatFx { key: string; sums: FxSums; regen: number }

/** Ein fertiger Talent-Satz für die Engine */
export interface TalentCombat {
  /** Kennung des Stands (gleich = nichts neu zu rechnen) */
  key: string;
  styles: Readonly<Record<ActionStyleId, ActionStyleDef>>;
  /** gleiche Reihenfolge wie `ALL_MOVES` */
  moves: readonly ActionMove[];
  /** Reichweite je Angriff für den Suchradius der Ziele */
  reach: Float32Array;
  params: Readonly<Record<ActionStyleId, TalentEngineParams>>;
  /** Himmelssturz (umgebaut), wenn die Krone des Kosmos gelernt ist; als Ultimate des Erwachens ausgerüstet? */
  cosmic: ActionMove | null;
  useCosmic: boolean;
}

/** Grundwerte ohne Talente */
export const NO_TALENT_PARAMS: TalentEngineParams = {
  comboK: 1, heavyK: 1, magnetAdd: 0, willK: 1, multiKill: 0, autoChase: false, chaseAdd: 0, chaseRangeAdd: 0, dashCostK: 1, airExec: 0,
  stance: 0, stormBurst: null, awakenAdd: 0, aftershock: 0, aftershockHit: { ...H0 }, auraSightK: 1, auraIronK: 1, auraKingK: 1, formFloor: 1, apex: false, regenK: 1,
};

/** Zustand, den das Element einer Faji-Kunst einem Finisher gibt (Dauer in s) */
export const ELEMENT_STATUS: Readonly<Record<FajiArtId, { status: HitStatus; dur: number }>> = {
  schwarzloch: { status: 'suppress', dur: 4 }, feuer: { status: 'burn', dur: 3 }, eis: { status: 'freeze', dur: 1.2 }, wasser: { status: 'slow', dur: 2.5 },
  wind: { status: 'slow', dur: 2 }, blitz: { status: 'shock', dur: 1.5 }, sonne: { status: 'sunder', dur: 5 }, mond: { status: 'fear', dur: 1.5 },
};

/** Höchstzahl der Trefferfenster je Angriff (wie die Engine) */
const MAX_HITS = 16;
const ROUND_ARC = 6.2;

/** Schadensfaktor eines Treffers: alle Faktoren multipliziert, der Zuwachs asymptotisch auf `TALENT_CAP.total` begrenzt */
export function talentDamageK(parts: readonly number[]): number {
  let raw = 1;
  for (const p of parts) raw *= 1 + Math.max(0, p);
  return 1 + softCap(raw - 1, TALENT_CAP.total);
}

interface Ctx {
  c: (k: FxKey) => number;
  /** Element-Zustand für Finisher (Faji-Kunst der Figur bzw. die eigene) */
  element: { status: HitStatus; dur: number } | null;
}

type MoveRole = 'light' | 'lightLast' | 'branch' | 'heavy' | 'air' | 'airLast' | 'meteor' | 'finisher' | 'skill' | 'ultimate';

/** Treffer umbauen (Reichweite, Winkel, Wucht, Zustände, Sog) */
function hitOf(h: ActionHit, x: Ctx, role: MoveRole, mul: number, rangeK: number): ActionHit {
  const c = x.c;
  const out: ActionHit = { ...h, projectile: h.projectile ? { ...h.projectile } : null };
  out.dmg = h.dmg * mul;
  out.range = h.range * rangeK;
  if (h.shape === 'line') out.width = h.width * (1 + (rangeK - 1) * 0.5);
  if (h.shape === 'circle' && h.offset > 0 && role !== 'ultimate') out.offset = h.offset * (1 + (rangeK - 1) * 0.5);
  if (h.shape === 'arc' && h.arc < ROUND_ARC) out.arc = Math.min(ROUND_ARC, h.arc * (1 + c('arc')));
  if (h.launch > 0) out.launch = h.launch * (1 + c('launch'));
  if (h.fling > 0) out.fling = h.fling * (1 + c('fling'));
  if (h.knock > 0) out.knock = h.knock * (1 + c('knock'));
  if (h.status) out.statusDur = h.statusDur * (1 + c('statusDur'));
  if (h.vortex > 0) out.vortex = h.vortex * (1 + c('vortexK'));
  // Gravitations-Singularität (Kosmos): schwere Angriffe ziehen in ihren Mittelpunkt
  if ((role === 'heavy' || role === 'branch') && !h.projectile) out.vortex = Math.max(out.vortex, c('gravity'));
  // Element: Finisher (Elementhieb, Elementkern) und die letzten Schläge der Ketten (Fusionshieb)
  const elem = x.element && !h.status && (
    ((role === 'finisher' || role === 'lightLast') && c('elementFinisher') > 0) || ((role === 'lightLast' || role === 'airLast') && c('fusion') > 0));
  if (elem && x.element) { out.status = x.element.status; out.statusDur = x.element.dur * (1 + c('statusDur')); }
  return out;
}

/** Zusätzliche Wellen (Mutation): jedes Fenster läuft `n`-mal nach; Geschosse fliegen `n + 1`-mal so zahlreich */
function addWaves(m: ActionMove, n: number) {
  if (n <= 0 || !m.hits.length) return;
  if (m.hits.every((h) => h.projectile)) {
    for (const h of m.hits) if (h.projectile) { h.projectile.count = Math.min(9, h.projectile.count * (1 + n)); h.projectile.spread += 0.1 * n; }
    return;
  }
  const first = m.hits[0].t0, last = m.hits.reduce((a, h) => Math.max(a, h.t1), 0);
  const gap = Math.max(0.12, Math.min(0.3, (last - first) + 0.06));
  const base = m.hits.filter((h) => !h.projectile && h.delayTo <= 0);
  for (let k = 1; k <= n; k++) {
    for (const h of base) {
      if (m.hits.length >= MAX_HITS) break;
      m.hits.push({ ...h, t0: h.t0 + gap * k, t1: h.t1 + gap * k, dmg: h.dmg * 0.6, hitstop: Math.min(h.hitstop, 0.05) });
    }
  }
  const end = m.hits.reduce((a, h) => Math.max(a, h.t1), 0);
  m.dur = Math.max(m.dur, end + 0.12);
}

/** Bausteine einer Mutation auf eine Technik anwenden (`k` = Vielfaches, Rang 2 und 3 wiederholen `perRank`) */
function applyMut(m: ActionSkill, step: MutStep, k: number, extra: { dmg: number; cd: number }) {
  const v = step.v * k;
  switch (step.kind) {
    case 'waves': addWaves(m, Math.round(v)); break;
    case 'air': m.airOk = true; break;
    case 'airExec': m.airExec = (m.airExec ?? 0) + v; break;
    case 'chase': m.autoChase = true; break;
    case 'reach': for (const h of m.hits) { h.range *= 1 + v; if (h.shape === 'line') h.width *= 1 + v * 0.5; } break;
    case 'cd': extra.cd += v; break;
    case 'launch': for (const h of m.hits) if (!h.projectile) h.launch = Math.max(h.launch, v); break;
    case 'vortex': for (const h of m.hits) if (!h.projectile) h.vortex = Math.max(h.vortex, 0) + v; break;
    case 'chain': for (const h of m.hits) h.chain += Math.round(v); break;
    case 'proj': for (const h of m.hits) if (h.projectile) { h.projectile.count = Math.min(9, h.projectile.count + Math.round(v)); h.projectile.spread += 0.1 * v; } break;
    case 'pierce': for (const h of m.hits) if (h.projectile) h.projectile.pierce = true; break;
    case 'status': for (const h of m.hits) if (!h.status && step.status) { h.status = step.status; h.statusDur = v; } break;
    case 'dmg': extra.dmg += v; break;
  }
}

/** Angriff umbauen */
function moveOf(m: ActionMove, x: Ctx, role: MoveRole, extraDmg = 0): ActionMove {
  const c = x.c;
  const heavyish = role === 'heavy' || role === 'branch' || role === 'finisher';
  const kindK = role === 'skill' ? c('skillDmg') : role === 'finisher' || role === 'lightLast' ? c('finisher') : role === 'meteor' ? c('meteor') : role === 'ultimate' ? c('ult') : 0;
  const mul = talentDamageK([c('dmg'), kindK, extraDmg, c('cosmicDmg')]);
  let rangeK = 1;
  if (role === 'ultimate') rangeK = 1 + c('ultReach');
  else {
    rangeK = 1 + c('reach');
    if (heavyish) rangeK *= 1 + c('heavyReach');
    if (role === 'meteor') rangeK *= 1 + c('meteor') * 0.5;
  }
  const out: ActionMove = { ...m, hits: m.hits.map((h) => hitOf(h, x, role, mul, rangeK)) };
  if (role !== 'ultimate' && role !== 'skill' && m.lunge > 0) out.lunge = m.lunge + c('lunge') * 1.5;
  if ((role === 'heavy' || role === 'branch') && c('hyperHeavy') > 0) out.hyper = true;
  // Koloss-Welle / Seismische Welle: schwere Angriffe schicken eine wandernde Schockwelle (Linie, 14 m) im ersten Schwungfenster
  const wave = c('heavyWave');
  if ((role === 'heavy' || role === 'branch') && wave > 0 && out.hits.length && out.hits.length < MAX_HITS) {
    const f = out.hits[0];
    out.hits.push({ ...H0, t0: f.t0, t1: f.t1 + 0.12, shape: 'line', range: 14 * rangeK, width: 2.6, grow: true, dmg: wave * mul, poise: 18, knock: 7, fling: 8, hitstop: 0.03, shake: 0.35, fx: 'heavy', vfx: f.vfx || 'klinge' });
  }
  // Meteorschauer (Kosmos): Finisher rufen Meteoriten in einer Reihe vor der Figur herab
  const rain = c('meteorRain');
  if ((role === 'finisher' || role === 'lightLast') && rain > 0 && out.hits.length) {
    const lastT = out.hits.reduce((a, h) => Math.max(a, h.t1), 0);
    for (let i = 0; i < rain && out.hits.length < MAX_HITS; i++) {
      const t0 = lastT + 0.04 + i * 0.07;
      out.hits.push({ ...H0, t0, t1: t0 + 0.06, shape: 'circle', offset: 3 + i * 2.6, range: 2.4, dmg: 0.45 * mul, poise: 20, knock: 6, launch: 3, hitstop: 0.03, shake: 0.4, fx: 'heavy', vfx: 'meteor' });
    }
    out.dur = Math.max(out.dur, lastT + 0.06 + rain * 0.07 + 0.1);
  }
  if (role === 'ultimate' && m.ultimate) {
    out.ultimate = { ...m.ultimate, reach: m.ultimate.reach * rangeK, width: m.ultimate.width * rangeK };
    if (c('apex') > 0) { out.label = `Apex · ${m.label}`; out.cutin = `APEX · ${m.cutin || m.label}`; }
  }
  return out;
}

/** Schlüssel eines Talent-Stands (Ränge, ausgerüstete Evolutionen, Aufstieg, Ultimate-Wahl, Faji-Kunst) */
export function talentKey(t: TalentSave, fajiArt: FajiArtId | null): string {
  const nodes = Object.keys(t.nodes).sort().map((k) => `${k}:${t.nodes[k]}`).join(',');
  const evo = Object.keys(t.evo).sort().map((k) => `${k}=${t.evo[k].join('+')}`).join(',');
  return `${nodes}|${evo}|${t.ascended ? 1 : 0}|${t.ult}|${fajiArt ?? '-'}`;
}

/** Bäume, deren Wirkungen für einen Stil gelten: der eigene Kampfbaum und (nach dem Aufstieg) der Kosmos */
function treesOf(style: ActionStyleId): TalentTreeId[] {
  return isCombatTree(style) ? [style, 'kosmos'] : ['kosmos'];
}

function ctxOf(sums: FxSums, element: Ctx['element']): Ctx {
  const memo = new Map<FxKey, number>();
  return { c: (k) => { let v = memo.get(k); if (v === undefined) { v = capFx(k, sums[k]); memo.set(k, v); } return v; }, element };
}

/** Engine-Werte eines Stils */
function paramsOf(t: TalentSave, style: ActionStyleId, x: Ctx, st: ActionStyleDef, regen = 0): TalentEngineParams {
  const c = x.c;
  const burst = c('stormBurst');
  return {
    comboK: 1 + c('combo'), heavyK: 1 + c('heavy'), magnetAdd: c('lunge'),
    willK: 1 + c('will'), multiKill: c('multiKill'),
    autoChase: c('autoChase') > 0, chaseAdd: c('chase'), chaseRangeAdd: c('chase') * 5,
    dashCostK: 1 - c('dashCost'), airExec: c('airDmg'), stance: c('stance'),
    stormBurst: burst > 0 ? { ...H0, t0: 0, t1: 0.1, shape: 'circle', range: 4.6, arc: 6.3, dmg: burst, poise: 30, knock: 8, launch: 3, fling: 10, breakGuard: true, hitstop: 0.06, shake: 0.5, fx: 'magic', vfx: st.element, status: x.element?.status ?? '', statusDur: x.element?.dur ?? 0 } : null,
    awakenAdd: c('awaken'),
    aftershock: c('aftershock'),
    aftershockHit: { ...H0, t0: 0, t1: 0.1, shape: 'circle', range: 12 * (1 + c('ultReach')), arc: 6.3, dmg: 1.1 * talentDamageK([c('dmg'), c('ult')]), poise: 60, knock: 12, launch: 5, fling: 16, breakGuard: true, hitstop: 0.08, shake: 0.9, fx: 'heavy', vfx: st.element },
    auraSightK: 1 + c('auraSight'), auraIronK: 1 + c('auraIron'), auraKingK: 1 + c('auraKing'),
    formFloor: isCombatTree(style) && st.faji ? formFloor(t, style) : 1,
    apex: c('apex') > 0,
    regenK: 1 + regen,
  };
}

/** Größte Ausdehnung eines Angriffs (Suchradius der Ziele), wie in der Engine */
function reachOfMove(m: ActionMove): number {
  let mx = 0;
  for (const h of m.hits) mx = Math.max(mx, h.shape === 'line' ? Math.max(h.range, h.width * 0.5) : h.range + h.offset);
  return mx + m.dashTo + 2;
}

/**
 * Den Talent-Satz für die Engine bauen: alle Stile und Angriffe umgebaut, Engine-Werte je Stil, Himmelssturz. `fajiArt` = ausgerüstete
 * Faji-Kunst der Figur (Element der Finisher in den Waffenstilen); Faji-Künste nutzen ihr eigenes Element.
 */
export function buildTalentCombat(t: TalentSave, fajiArt: FajiArtId | null, cls: ClassCombatFx | null = null): TalentCombat {
  const moves = ALL_MOVES.slice() as ActionMove[];
  const styles = {} as Record<ActionStyleId, ActionStyleDef>;
  const params = {} as Record<ActionStyleId, TalentEngineParams>;
  const set = (m: ActionMove) => { const i = moveIndex(m.id); if (i >= 0) moves[i] = m; return m; };
  for (const id of ACTION_STYLE_IDS) {
    const base = ACTION_STYLES[id];
    const sums = fxSums(t, treesOf(id));
    if (cls) for (const [k, v] of Object.entries(cls.sums) as [FxKey, number][]) sums[k] = (sums[k] ?? 0) + v;
    const ownArt = (base.faji ? id : fajiArt) as FajiArtId | null;
    const x = ctxOf(sums, ownArt && ELEMENT_STATUS[ownArt] ? ELEMENT_STATUS[ownArt] : null);
    const c = x.c;
    const nL = base.light.length, nA = base.air.length;
    // Mutationen der Techniken aus dem eigenen Kampfbaum
    const skills = base.skills.map((sk) => {
      const extra = { dmg: 0, cd: 0 };
      const copy: ActionSkill = { ...sk, buff: sk.buff ? { ...sk.buff } : null, hits: sk.hits.map((h) => ({ ...h, projectile: h.projectile ? { ...h.projectile } : null })) };
      if (isCombatTree(id)) {
        for (const n of TREE_BY_ID[id].nodes) {
          const r = t.nodes[n.id] ?? 0;
          if (!n.mut || n.mut.slot !== sk.slot || r <= 0) continue;
          for (const s of n.mut.add) applyMut(copy, s, 1, extra);
          for (const s of n.mut.perRank) if (r > 1) applyMut(copy, s, r - 1, extra);
        }
      }
      const m = moveOf(copy, x, 'skill', extra.dmg) as ActionSkill;
      m.slot = sk.slot; m.short = sk.short; m.desc = sk.desc; m.icon = sk.icon;
      m.cd = sk.cd * (1 - softCap(c('cd') + extra.cd, TALENT_CAP.cd));
      return set(m) as ActionSkill;
    });
    const st: ActionStyleDef = {
      ...base,
      light: base.light.map((m, i) => set(moveOf(m, x, i === nL - 1 ? 'lightLast' : 'light'))),
      branch: base.branch.map((m) => set(moveOf(m, x, 'branch'))) as ActionStyleDef['branch'],
      heavy: set(moveOf(base.heavy, x, 'heavy')),
      air: base.air.map((m, i) => set(moveOf(m, x, i === nA - 1 ? 'airLast' : 'air'))),
      meteor: set(moveOf(base.meteor, x, 'meteor')),
      finisher: set(moveOf(base.finisher, x, 'finisher')),
      skills,
      ultimate: base.ultimate ? set(moveOf(base.ultimate, x, 'ultimate')) : null,
      critBonus: base.critBonus + c('crit'),
      critMult: base.critMult + c('critDmg'),
      penBonus: base.penBonus + c('pen'),
      postureK: base.postureK * (1 + c('posture')),
      jumps: base.jumps + c('jumps'),
      airDashes: base.airDashes + c('airDashes'),
      perfectWindow: base.perfectWindow + c('perfect'),
      awakenWave: { ...base.awakenWave, dmg: base.awakenWave.dmg * talentDamageK([c('dmg'), c('cosmicDmg')]), range: base.awakenWave.range * (1 + c('reach')) },
    };
    styles[id] = st;
    params[id] = paramsOf(t, id, x, st, cls?.regen ?? 0);
  }
  // Himmelssturz: nur Kosmos-Wirkungen
  const learned = (t.nodes['kosmos.himmelssturz'] ?? 0) > 0 && t.ascended;
  const cx = ctxOf(fxSums(t, ['kosmos']), null);
  const cosmic = learned ? set(moveOf(SKYFALL_ULTIMATE, cx, 'ultimate')) : null;
  const reach = new Float32Array(moves.length);
  moves.forEach((m, i) => { reach[i] = reachOfMove(m); });
  return { key: `${talentKey(t, fajiArt)}|${cls?.key ?? '-'}`, styles, moves, reach, params, cosmic, useCosmic: !!cosmic && t.ult === 'kosmos' };
}

/** Kurzbeschreibung der Mutation einer Technik (Anzeige): welche Bausteine wirken */
export function mutationText(nodeId: string): string {
  const n = NODE_BY_ID[nodeId];
  if (!n?.mut) return '';
  const name: Record<MutStep['kind'], (v: number) => string> = {
    waves: (v) => (v >= 2 ? 'Dreifach-Welle' : 'Doppelwelle'), air: () => 'auch in der Luft', airExec: (v) => `Luft-Hinrichtung +${Math.round(v * 100)} %`,
    chase: () => 'Auto-Verfolgung', reach: (v) => `Reichweite +${Math.round(v * 100)} %`, cd: (v) => `Abklingzeit −${Math.round(v * 100)} %`,
    launch: () => 'schleudert hoch', vortex: () => 'Sog', chain: (v) => `Kettenblitz +${v}`, proj: (v) => `+${v} Geschoss${v > 1 ? 'e' : ''}`,
    pierce: () => 'durchbohrend', status: () => 'Element-Zustand', dmg: (v) => `Schaden +${Math.round(v * 100)} %`,
  };
  const a = n.mut.add.map((s) => name[s.kind](s.v)).join(', ');
  const b = n.mut.perRank.map((s) => name[s.kind](s.v)).join(', ');
  return b ? `${a}; je weiterem Rang ${b}` : a;
}
