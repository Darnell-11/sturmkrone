// Phase 4.6H – das vereinte 3.0-Fenster „Talente & Kampfkünste“ (Tasten N und K).
//
// Bis 4.6G gab es zwei getrennte Systeme: das alte Faji-Fenster (Taste K, eigene Faji-Punkte, vier Zweige mit den F1–F3-Techniken) und das
// 18-Baum-Talentfenster (Taste N, Talentpunkte). Jetzt läuft alles über EINEN Punktetopf (`core/talentRules.ts`: Stufen, Meisterschafts-Siegel und
// Bonuspunkte – die alten Faji-Punkte wurden beim Laden umgerechnet) und ein Fenster mit fünf Kategorie-Reitern:
//   Waffen-Meisterschaften · Faustkampf · Faji-Künste (acht Künste mit Formstufen 1 – 7) · Kapitän & Flotte · Stufe 101: Kosmos-Pfad.
// Die F1–F3-Techniken der alten Zweige stehen in ihrer Kategorie (Schwertkunst bei den Waffen, Körper-Faji beim Faustkampf, Effekt- und
// Geistiges Faji bei den Faji-Künsten). Rechts zeigt eine Vorschau-Karte das Apex-Ultimate und die drei Evolutionen des Baums; oben läuft der
// Fortschrittsbalken der geheimen Aufstiegs-Prüfung (0/5 bis 5/5 besiegte Kaiser-Inseln).
// Reine Darstellung: baut HTML aus dem Spielstand und den Regeln; die Aktionen ruft `Menus.showTalents` im Spiel auf.
import {
  CAPTAIN_TREES, CONSTELLATIONS, COSMIC_SOURCES, FAJI_TREES, MILESTONES, NODE_BY_ID, TALENT, TREE_BY_ID, rankCost,
  type FxKey, type TalentNodeDef, type TalentTreeDef, type TalentTreeId,
} from '../data/talentTrees';
import {
  allKaiserDefeated, ascensionRows, committedTree, cosmicTotal, freeCosmic, freePoints, fxText, learnBlock, pathOf, poolTotal, respecCost,
  techRespecCost, techSpentOf, treePoints, treeVisible, type RespecScope, type TalentSave, type TalentWorld,
} from '../core/talentRules';
import { mutationText } from '../combat/talentCombat';
import { ACTION_STYLES } from '../data/actionStyles';
import { FORM_NAMES, WILL_AURAS, type AuraId, type FajiArtId } from '../data/fajiArts';
import { BRANCHES, SEA_TEXT, SK, SKILLS, SYNERGIES, branchPoints, learnBlock as techBlock, type Branch, type SkillDef } from '../data/skills';
import { KAISER_IDS } from '../data/kaiserIslands';
import { skillIcon } from './skillIcons';
import { esc } from './dom';
import { fmtInt } from '../core/format';

// ---------- Kategorien ----------

export type TalentCat = 'waffen' | 'faust' | 'faji' | 'kapitaen' | 'kosmos';
export type TechBranch = Branch;
/** Auswahl in der Liste: ein Talentbaum oder ein Zweig der Faji-Techniken (F1 – F3) */
export type TalentPick = TalentTreeId | `tech.${TechBranch}`;

export interface TalentCatDef { id: TalentCat; label: string; short: string; icon: string; trees: readonly TalentTreeId[]; tech: readonly TechBranch[] }

/** Die fünf Reiter (Reihenfolge wie im Fenster) */
export const TALENT_CATS: readonly TalentCatDef[] = [
  { id: 'waffen', label: 'Waffen-Meisterschaften', short: 'Waffen', icon: '⚔', trees: ['zweihaender', 'saebel', 'doppel', 'langklinge'], tech: ['klinge'] },
  { id: 'faust', label: 'Faustkampf', short: 'Faust', icon: '✊', trees: ['sturmfaust', 'erdspalter'], tech: ['koerper'] },
  { id: 'faji', label: 'Faji-Künste', short: 'Faji', icon: '✦', trees: FAJI_TREES, tech: ['effekt', 'geist'] },
  { id: 'kapitaen', label: 'Kapitän & Flotte', short: 'Kapitän', icon: '⚓', trees: CAPTAIN_TREES, tech: [] },
  { id: 'kosmos', label: 'Stufe 101: Kosmos-Pfad', short: 'Kosmos', icon: '✹', trees: ['kosmos'], tech: [] },
];
export const CAT_BY_ID: Readonly<Record<TalentCat, TalentCatDef>> = Object.fromEntries(TALENT_CATS.map((c) => [c.id, c])) as Record<TalentCat, TalentCatDef>;

export const isTechPick = (p: string): p is `tech.${TechBranch}` => p.startsWith('tech.') && p.slice(5) in BRANCHES;
export const techOf = (p: `tech.${TechBranch}`): TechBranch => p.slice(5) as TechBranch;

/** Kategorie einer Auswahl */
export function catOfPick(p: TalentPick): TalentCat {
  for (const c of TALENT_CATS) if (isTechPick(p) ? c.tech.includes(techOf(p)) : c.trees.includes(p as TalentTreeId)) return c.id;
  return 'waffen';
}

/** Erste Auswahl einer Kategorie */
export const firstOf = (cat: TalentCat): TalentPick => CAT_BY_ID[cat].trees[0] ?? (`tech.${CAT_BY_ID[cat].tech[0]}` as TalentPick);

/** Zustand des Fensters (bleibt beim Neuzeichnen erhalten) */
export interface TalentUiState {
  cat: TalentCat;
  tree: TalentPick;
  /** Knoten-ID eines Talents oder `tech:<Technik>` */
  sel: string | null;
  /** Rückfrage vor dem Zurücksetzen (Bereich) */
  confirm: string | null;
  note: string;
  /** Meisterschafts-Siegel aufgeklappt */
  seals: boolean;
  /** Zoom des Baums (0,8 … 1,3) */
  zoom: number;
}

export const newTalentUi = (tree: TalentPick = 'zweihaender', cat?: TalentCat): TalentUiState => {
  const c = cat ?? catOfPick(tree);
  const t = cat && catOfPick(tree) !== cat ? firstOf(cat) : tree;
  return { cat: c, tree: t, sel: null, confirm: null, note: '', seals: false, zoom: 1 };
};

/** Was das Fenster vom Spiel braucht */
export interface TalentView {
  t: TalentSave;
  w: TalentWorld;
  xp: number;
  xpNeed: number;
  gold: number;
  /** 4.6H: Faji-Techniken (früher Taste K): gelernte Stufen, F-Plätze, erwachte Zweige */
  tech?: { learned: Record<string, number>; slots: readonly (string | null)[]; awakened: readonly string[] };
  /** 4.6H: die acht Faji-Künste: Form 1 … 7, Fortschritt, Meisterschaft (bis zur nächsten Form), ausgerüstet */
  arts?: readonly { id: FajiArtId; form: number; frac: number; mastery: number; next: number; equipped: boolean }[];
  aura?: AuraId;
}

const rankOf = (t: TalentSave, id: string): number => t.nodes[id] ?? 0;
const techSpent = (v: TalentView): number => v.w.techSpent ?? techSpentOf(v.tech?.learned);
const free = (v: TalentView): number => freePoints(v.t, v.w.level, techSpent(v));

// ---------- Talentknoten ----------

/** Zustand eines Knotens für die Anzeige */
function nodeState(v: TalentView, n: TalentNodeDef): 'full' | 'on' | 'open' | 'off' | 'lock' {
  const r = rankOf(v.t, n.id);
  if (r >= n.max) return 'full';
  if (n.path) { const p = pathOf(v.t, n.tree); if (p && p !== n.path) return 'off'; }
  const why = learnBlock(v.t, { ...v.w, techSpent: techSpent(v) }, n.id);
  if (r > 0) return why ? 'on' : 'open';
  return why ? 'lock' : 'open';
}

function nodeBtn(v: TalentView, ui: TalentUiState, n: TalentNodeDef, color: string): string {
  const r = rankOf(v.t, n.id);
  const st = nodeState(v, n);
  const evoOn = n.tier === 7 && (v.t.evo[n.tree] ?? []).includes(n.id);
  return `<button class="tal-node ${st}${evoOn ? ' eq' : ''}" data-a="sel" data-id="${n.id}" aria-pressed="${ui.sel === n.id}" style="--c:${color}" title="${esc(n.name)}">
    <span class="ic" aria-hidden="true">${esc(n.icon)}</span><span class="nm">${esc(n.name)}</span><span class="rk">${r}/${n.max}</span></button>`;
}

/** Wirkungen eines Rangs als Zeilen */
function fxLines(n: TalentNodeDef, rank: number): string {
  if (rank <= 0) return '';
  return (Object.entries(n.fx) as [FxKey, number][]).map(([k, val]) => `<li>${esc(fxText(k, k === 'formStep' ? rank : val * rank))}</li>`).join('');
}

// ---------- Liste der Kategorie ----------

function treeCard(v: TalentView, ui: TalentUiState, id: TalentTreeId): string {
  const tr = TREE_BY_ID[id];
  const pts = treePoints(v.t, id);
  const bound = committedTree(v.t) === id;
  const art = v.arts?.find((a) => a.id === id);
  const sealed = id === 'kosmos' && !treeVisible(v.t, 'kosmos');
  const sub = sealed ? 'Versiegelt' : art ? `${FORM_NAMES[art.form - 1] ?? ''}${art.equipped ? ' · Q' : ''}` : `${pts}/${tr.capacity}`;
  const bar = art ? `<u class="tal3-fb" aria-hidden="true"><i style="width:${Math.round((art.form >= 7 ? 1 : art.frac) * 100)}%"></i></u>` : '';
  return `<button class="tal-tree-btn tal3-card${bound ? ' bound' : ''}${sealed ? ' secret' : ''}" data-a="tree" data-id="${id}" aria-pressed="${ui.tree === id}" style="--c:${tr.color}">
    <span class="ic" aria-hidden="true">${esc(tr.icon)}</span><span class="nm">${esc(tr.name)}</span><span class="pt">${esc(sub)}</span>${bar}</button>`;
}

function techCard(v: TalentView, ui: TalentUiState, b: TechBranch): string {
  const info = BRANCHES[b];
  const pts = branchPoints(v.tech?.learned ?? {}, b);
  const awk = v.tech?.awakened.includes(b);
  const id = `tech.${b}`;
  return `<button class="tal-tree-btn tal3-card tech" data-a="tree" data-id="${id}" aria-pressed="${ui.tree === id}" style="--c:${info.col}">
    <span class="ic" aria-hidden="true">F</span><span class="nm">${esc(info.n)} · Techniken</span><span class="pt">${pts}${awk ? ' ✦' : ''}</span></button>`;
}

function catList(v: TalentView, ui: TalentUiState): string {
  const c = CAT_BY_ID[ui.cat];
  const trees = c.trees.map((id) => treeCard(v, ui, id)).join('');
  const tech = c.tech.length ? `<div class="tal-group-h">Faji-Techniken (F1 – F3)</div>${c.tech.map((b) => techCard(v, ui, b)).join('')}` : '';
  let extra = '';
  if (ui.cat === 'faji' && v.aura !== undefined) {
    const auras = WILL_AURAS.map((a) => `<button class="tal3-aura" data-a="aura" data-id="${a.id}" aria-pressed="${v.aura === a.id}" title="${esc(a.desc)}" style="--c:${a.color}">${esc(a.icon)} ${esc(a.label)}</button>`).join('');
    extra = `<div class="tal-group-h">Willenskraft-Aura (Taste B)</div><div class="tal3-auras">${auras}</div>`;
  }
  return `<div class="tal-group-h">${esc(c.label)}</div>${trees}${tech}${extra}`;
}

// ---------- Baum ----------

/** Formstufen 1 … 7 einer Faji-Kunst: Meisterschaft (Treffer) oder Formsiegel der Talente, Ausrüsten für den Q-Wechsel */
function formStrip(v: TalentView, tr: TalentTreeDef): string {
  const art = v.arts?.find((a) => a.id === tr.id);
  if (!art) return '';
  const pips = FORM_NAMES.map((n, i) => `<span class="tal3-pip${art.form > i ? ' on' : ''}${art.form === i + 1 ? ' now' : ''}" title="${esc(n)}">${i + 1}</span>`).join('');
  const st = ACTION_STYLES[art.id];
  const sk = st.skills.map((k) => `<span class="ma-sk${art.form >= k.formMin ? '' : ' off'}" title="${esc(k.desc)}">${esc(k.icon)} ${esc(k.label)}${art.form >= k.formMin ? '' : ` · ab ${k.formMin}.`}</span>`).join('');
  return `<div class="tal3-forms" style="--c:${tr.color}">
    <div class="tal3-pips" role="img" aria-label="Formstufe ${art.form} von 7">${pips}</div>
    <p class="small"><b>${esc(FORM_NAMES[art.form - 1] ?? '')}</b> · ${art.form >= 7 ? 'Meisterform erreicht – das Ultimate ist frei (im Sturm-Erwachen).' : `Meisterschaft ${fmtInt(art.mastery)} / ${fmtInt(art.next)} – Treffer der Kunst oder Formsiegel (Pfad A) heben die Form.`}</p>
    <div class="ma-sks">${sk}</div>
    <button class="${art.equipped ? 'primary' : 'secondary'} mini" data-a="equip" data-id="${art.id}" aria-pressed="${art.equipped}">${art.equipped ? 'Im Stilwechsel (Q) ausgerüstet' : 'Für den Stilwechsel (Q) ausrüsten'}</button></div>`;
}

function treeBody(v: TalentView, ui: TalentUiState, tr: TalentTreeDef): string {
  const pts = treePoints(v.t, tr.id);
  const rows: string[] = [];
  const maxTier = tr.nodes.reduce((a, n) => Math.max(a, n.tier), 0);
  if (tr.id === 'kosmos') rows.push(`<div class="tal-const">${CONSTELLATIONS.map((c) => `<span style="--c:${c.color}" title="${esc(c.desc)}">${esc(c.icon)} ${esc(c.name)}</span>`).join('')}</div>`);
  for (let tier = 1; tier <= maxTier; tier++) {
    const td = tr.tiers[tier - 1];
    const nodes = tr.nodes.filter((n) => n.tier === tier).sort((a, b) => a.col - b.col);
    const open = tr.id === 'kosmos' ? v.t.ascended : pts >= (td?.gate ?? 0);
    const head = tr.id === 'kosmos'
      ? `<b>${esc(td?.name ?? '')}</b>`
      : `<b>Stufe ${tier} · ${esc(td?.name ?? '')}</b><span>ab ${td?.gate ?? 0} Punkten · ab Stufe ${td?.level ?? 1}</span>`;
    let body: string;
    if (tier === 2 && tr.paths) {
      const chosen = pathOf(v.t, tr.id);
      const half = (p: 'A' | 'B') => `<div class="tal-path${chosen === p ? ' chosen' : chosen ? ' gone' : ''}">
        <div class="tal-path-h"><b>Pfad ${p}: ${esc(tr.paths![p].name)}</b><small>${esc(tr.paths![p].desc)}</small></div>
        <div class="tal-row">${nodes.filter((n) => n.path === p).map((n) => nodeBtn(v, ui, n, tr.color)).join('')}</div></div>`;
      body = `<div class="tal-paths">${half('A')}${half('B')}</div>`;
    } else {
      body = `<div class="tal-row${tr.id === 'kosmos' && tier < 4 ? ' five' : ''}">${nodes.map((n) => nodeBtn(v, ui, n, tr.id === 'kosmos' && n.constellation ? CONSTELLATIONS.find((c) => c.id === n.constellation)!.color : tr.color)).join('')}</div>`;
    }
    rows.push(`<div class="tal-tier${open ? '' : ' closed'}"><div class="tal-tier-h">${head}</div>${body}</div>`);
  }
  const bound = committedTree(v.t);
  const badge = bound === tr.id ? '<span class="tal-badge">Meisterbaum (gebunden)</span>' : '';
  return `<div class="tal-tree-head" style="--c:${tr.color}"><h3>${esc(tr.icon)} ${esc(tr.name)} <small>${esc(tr.title)}</small> ${badge}</h3>
    <p class="soft small">${esc(tr.desc)}</p><p class="small">Investiert: <b>${pts}</b> von ${tr.capacity} Punkten${tr.kind === 'waffe' || tr.kind === 'faji' ? ` · Bindung ab ${TALENT.commit}` : ''}</p></div>${formStrip(v, tr)}${rows.join('')}`;
}

/** Kosmos-Pfad vor dem Aufstieg: versiegelte Sternbilder und die Bedingungen der Prüfung */
function sealedCosmos(v: TalentView): string {
  const rows = ascensionRows(v.t, v.w);
  const ready = rows.every((r) => r.ok);
  const stars = CONSTELLATIONS.map((c) => `<span class="sealed" style="--c:${c.color}" title="${esc(c.desc)}">${esc(c.icon)} ${esc(c.name)}</span>`).join('');
  return `<div class="tal-asc"><h3>✹ Die geheime Aufstiegs-Prüfung</h3>
    <p>Wer alle fünf Kaiser-Zitadellen des fünften Rings bezwungen hat, kann am Sternenaltar die Grenze der Sterblichen überschreiten: Stufe 101, der Kosmos-Pfad mit fünf Sternbildern und als Krone das 15. Ultimate – <b>Himmelssturz: Zwillings-Meteoriten &amp; Planeten-Kollaps</b>.</p>
    <div class="tal-const">${stars}</div>
    <ul class="tal-req">${rows.map((r) => `<li class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✔' : '✗'} ${esc(r.label)} <span class="soft">(${esc(r.have)})</span></li>`).join('')}</ul>
    <button class="primary" data-a="ascend"${ready ? '' : ' disabled'}>Aufstiegs-Prüfung am Sternenaltar ablegen</button>
    <p class="soft tiny">Die geopferten Baupläne und Relikte bleiben in deiner Sammlung, sind aber im Sternenaltar gebunden.</p></div>`;
}

// ---------- Faji-Techniken (F1 – F3) ----------

function techState(v: TalentView, s: SkillDef): 'full' | 'on' | 'open' | 'lock' {
  const learned = v.tech?.learned ?? {};
  const lv = learned[s.id] ?? 0;
  if (lv >= s.max) return 'full';
  const why = techBlock(s, learned, free(v), v.w.level, (v.tech?.awakened ?? []) as Branch[]);
  if (lv > 0) return why ? 'on' : 'open';
  return why ? 'lock' : 'open';
}

function techBody(v: TalentView, ui: TalentUiState, b: TechBranch): string {
  const info = BRANCHES[b];
  const learned = v.tech?.learned ?? {};
  const list = SKILLS.filter((s) => s.b === b);
  const pts = branchPoints(learned, b);
  const awk = v.tech?.awakened.includes(b);
  const rows: string[] = [];
  const maxT = list.reduce((a, s) => Math.max(a, s.t), 0);
  for (let t = 1; t <= maxT; t++) {
    const row = list.filter((s) => s.t === t).sort((x, y) => x.x - y.x);
    if (!row.length) continue;
    const req = Math.min(...row.map((s) => s.req));
    const nodes = row.map((s) => {
      const lv = learned[s.id] ?? 0;
      const st = techState(v, s);
      const kind = s.act ? (s.act.ult ? ' ult' : ' act') : '';
      return `<button class="tal-node tech ${st}${kind}" data-a="sel" data-id="tech:${s.id}" aria-pressed="${ui.sel === `tech:${s.id}`}" style="--c:${info.col}" title="${esc(s.n)}">
        <span class="ic sk-ico" aria-hidden="true">${skillIcon(s)}</span><span class="nm">${esc(s.n)}</span><span class="rk">${lv}/${s.max}</span></button>`;
    }).join('');
    rows.push(`<div class="tal-tier${pts >= req ? '' : ' closed'}"><div class="tal-tier-h"><b>Reihe ${t}</b><span>ab ${req} Punkten im Zweig</span></div><div class="tal-row">${nodes}</div></div>`);
  }
  const syn = SYNERGIES.filter((sy) => sy.needs.some((n) => SK[n]?.b === b)).map((sy) => {
    const on = sy.needs.every((n) => (learned[n] ?? 0) > 0);
    return `<li class="${on ? 'on' : ''}"><b>${esc(sy.n)}</b> <span class="soft small">(${esc(SK[sy.needs[0]].n)} + ${esc(SK[sy.needs[1]].n)})</span> – <span class="small">${esc(sy.d)}</span></li>`;
  }).join('');
  return `<div class="tal-tree-head" style="--c:${info.col}"><h3>${esc(info.n)} <small>Faji-Techniken · F1 – F3</small></h3>
    <p class="soft small">${esc(info.d)} Aktive Techniken liegen auf den Plätzen F1 – F3 und wirken an Land wie auf See.</p>
    <p class="small">Investiert: <b>${pts}</b> Punkte · ${awk ? '<b>Erwacht!</b>' : `Faji-Erwachen: ab Stufe 15 mit 9 Punkten in diesem Zweig (jetzt ${pts})`}</p></div>
    ${rows.join('')}${syn ? `<div class="tal-tier"><div class="tal-tier-h"><b>Synergien</b></div><ul class="sk-syn">${syn}</ul></div>` : ''}`;
}

function techInfo(v: TalentView, id: string): string {
  const s = SK[id];
  if (!s) return '';
  const info = BRANCHES[s.b];
  const learned = v.tech?.learned ?? {};
  const lv = learned[s.id] ?? 0;
  const why = techBlock(s, learned, free(v), v.w.level, (v.tech?.awakened ?? []) as Branch[]);
  const a = s.act;
  const why2 = why === 'max' ? 'Höchste Stufe erreicht.' : why === 'points' ? 'Keine freien Talentpunkte.' : why === 'branch' ? 'Mehr Punkte in diesem Zweig nötig.' : why === 'level' ? 'Höhere Stufe nötig.' : why === 'needs' ? 'Erst die verbundene Technik lernen.' : why === 'awaken' ? 'Erst nach dem Faji-Erwachen dieses Zweigs.' : '';
  const slotIdx = (v.tech?.slots ?? []).indexOf(s.id);
  const slots = a && lv > 0 ? `<div class="row tal3-slots">${[0, 1, 2].map((i) => {
    const cur = v.tech?.slots[i];
    return `<button class="mini${slotIdx === i ? ' brass' : ''}" data-a="tslot" data-id="${s.id}|${i}">F${i + 1}${cur && cur !== s.id ? `: ${esc(SK[cur]?.n ?? '')}` : ''}</button>`;
  }).join('')}</div>` : '';
  return `<h3 style="--c:${info.col}">${esc(s.n)}</h3>
    <p class="soft small">${esc(info.n)} · ${a ? (a.ult ? 'Ultimate-Technik' : 'Aktive Technik') : 'Passiv'} · Stufe ${lv}/${s.max}</p>
    <p>${esc(s.d(Math.max(1, lv)))}</p>
    ${lv > 0 && lv < s.max ? `<div class="tal-fx next"><b>Nächste Stufe</b><ul><li>${esc(s.d(lv + 1))}</li></ul></div>` : ''}
    ${a ? `<p class="soft small">${a.cost} Faji · ${a.cd} s Abklingzeit</p>${a.sea ? `<p class="small sk-sea">⚓ Auf See: ${esc(SEA_TEXT[a.sea])}</p>` : ''}` : ''}
    ${s.req || s.lv ? `<p class="soft small">${s.req ? `Ab ${s.req} Punkten in diesem Zweig` : ''}${s.req && s.lv ? ' · ' : ''}${s.lv ? `ab Stufe ${s.lv}` : ''}</p>` : ''}
    <div class="tal-act">${why === 'max' ? '<p class="ok small">Höchste Stufe erreicht.</p>' : `<button class="primary" data-a="tlearn" data-id="${s.id}"${why ? ' disabled' : ''}>${lv ? 'Verbessern' : 'Lernen'} (1 Talentpunkt)</button>${why ? `<p class="warn small">${esc(why2)}</p>` : ''}`}${slots}</div>`;
}

// ---------- Vorschau-Karte (Apex-Ultimate und Evolutionen) ----------

function previewCard(v: TalentView, tr: TalentTreeDef): string {
  if (tr.kind === 'kapitaen') return '';
  if (tr.id === 'kosmos') {
    const crown = tr.nodes.find((n) => n.id === 'kosmos.himmelssturz');
    const r = crown ? rankOf(v.t, crown.id) : 0;
    return `<div class="tal3-preview" style="--c:${tr.color}"><div class="tal3-pv-h">✹ Krone des Kosmos</div>
      <b>Himmelssturz: Zwillings-Meteoriten &amp; Planeten-Kollaps</b>
      <p class="small soft">Das 15. Ultimate – mit jeder Waffe und jeder Kunst im Sturm-Erwachen. Einschläge liegen nie auf deinem eigenen Deck.</p>
      <p class="small">${r > 0 ? (v.t.ult === 'kosmos' ? '✔ gelernt · als Ultimate ausgerüstet' : '✔ gelernt') : v.t.ascended ? '○ noch nicht gelernt' : '🔒 versiegelt bis zum Aufstieg'}</p></div>`;
  }
  const st = tr.style ? ACTION_STYLES[tr.style] : null;
  const ult = st?.ultimate ?? null;
  const apex = tr.nodes.find((n) => n.fx.apex);
  const evo = tr.nodes.filter((n) => n.tier === 7);
  const eq = v.t.evo[tr.id] ?? [];
  const art = v.arts?.find((a) => a.id === tr.id);
  const unlock = art ? (art.form >= 7 ? '✔ Meisterform: frei' : `🔒 ab der 7. Meisterform (jetzt ${art.form}.)`) : '✔ frei im Sturm-Erwachen';
  const apexR = apex ? rankOf(v.t, apex.id) : 0;
  const evoRows = evo.map((n) => {
    const r = rankOf(v.t, n.id), on = eq.includes(n.id);
    return `<li class="${r > 0 ? 'done' : ''}"><button class="tal3-link" data-a="sel" data-id="${n.id}">${r > 0 ? (on ? '◆' : '◇') : '○'} ${esc(n.name.replace(/^Evolution: /, ''))}</button><span class="soft tiny">${r > 0 ? (on ? 'ausgerüstet' : `Rang ${r}`) : `ab Stufe ${n.levels?.[0] ?? tr.tiers[6]?.level ?? 90}`}</span></li>`;
  }).join('');
  return `<div class="tal3-preview" style="--c:${tr.color}"><div class="tal3-pv-h">Apex-Ultimate &amp; Evolutionen</div>
    <b>${esc(ult?.label ?? 'Ultimate des Stils')}</b>
    <p class="small soft">Im Sturm-Erwachen (Taste V, zweiter Druck) · ${unlock}</p>
    ${apex ? `<p class="small"><button class="tal3-link" data-a="sel" data-id="${apex.id}">${apexR > 0 ? '✹' : '○'} ${esc(apex.name)}</button> <span class="soft tiny">${apexR}/${apex.max}</span></p>` : ''}
    <ul class="tal3-evo">${evoRows}</ul>
    <p class="soft tiny">Ausgerüstet: ${eq.length}/${TALENT.evoSlots} Evolutionen – nur ausgerüstete wirken.</p></div>`;
}

// ---------- Details eines Talents ----------

function nodeInfo(v: TalentView, ui: TalentUiState): string {
  if (ui.sel?.startsWith('tech:')) return techInfo(v, ui.sel.slice(5));
  const n = ui.sel ? NODE_BY_ID[ui.sel] : null;
  if (!n) return '<p class="soft small">Wähle ein Talent oder eine Technik, um seine Wirkung zu sehen.</p>';
  const tr = TREE_BY_ID[n.tree];
  const r = rankOf(v.t, n.id);
  const why = learnBlock(v.t, { ...v.w, techSpent: techSpent(v) }, n.id);
  const reqs: string[] = [];
  const nextLv = n.levels?.[Math.min(r, n.levels.length - 1)];
  if (nextLv && r < n.max) reqs.push(`Stufe ${nextLv}`);
  const seals = r < n.max ? n.seals?.[r] ?? 0 : 0;
  if (seals) reqs.push(`${seals} Kaiser-Siegel (verbraucht)`);
  const bp = r < n.max ? n.blueprints?.[r] ?? 0 : 0;
  if (bp) reqs.push(`${bp} Mythischer Bauplan im Besitz`);
  const rel = r < n.max ? n.relics?.[r] ?? 0 : 0;
  if (rel) reqs.push(`${rel} Kaiser-Relikt${rel > 1 ? 'e' : ''} im Besitz`);
  const mut = n.mut ? `<p class="small"><b>Mutation der Technik ${n.mut.slot}:</b> ${esc(mutationText(n.id))}</p>` : '';
  const cost = rankCost(n);
  const learnBtn = r >= n.max
    ? '<p class="ok small">Höchster Rang erreicht.</p>'
    : `<button class="primary" data-a="learn" data-id="${n.id}"${why ? ' disabled' : ''}>Lernen (${cost} ${n.tree === 'kosmos' ? 'kosmische' : 'Talent'}punkt${cost > 1 ? 'e' : ''})</button>${why ? `<p class="warn small">${esc(why)}</p>` : ''}`;
  let extra = '';
  if (n.tier === 7 && n.tree !== 'kosmos' && r > 0) {
    const eq = v.t.evo[n.tree] ?? [];
    const on = eq.includes(n.id);
    extra = `<button class="secondary" data-a="evo" data-id="${n.id}" aria-pressed="${on}">${on ? 'Evolution ablegen' : 'Evolution ausrüsten'}</button><p class="soft small">Ausgerüstet: ${eq.length}/${TALENT.evoSlots} – nur ausgerüstete Evolutionen wirken.</p>`;
  }
  if (n.id === 'kosmos.himmelssturz' && r > 0) {
    const on = v.t.ult === 'kosmos';
    extra = `<button class="${on ? 'secondary' : 'primary'}" data-a="ult" data-id="${on ? 'stil' : 'kosmos'}">${on ? 'Wieder das Ultimate des Stils nutzen' : 'Als Ultimate des Sturm-Erwachens ausrüsten'}</button><p class="soft small">${on ? 'Im Sturm-Erwachen (Taste V) entfesselst du den Himmelssturz – mit jeder Waffe und jeder Kunst.' : 'Bisher gilt das Ultimate des Stils.'}</p>`;
  }
  const where = n.tree === 'kosmos' ? `Sternbild ${esc(CONSTELLATIONS.find((c) => c.id === n.constellation)?.name ?? 'Krone')}` : `Stufe ${n.tier}${n.path ? ` · Pfad ${n.path}` : ''}`;
  return `<h3 style="--c:${tr.color}">${esc(n.icon)} ${esc(n.name)}</h3>
    <p class="soft small">${esc(tr.name)} · ${where} · Rang ${r}/${n.max}</p>
    <p>${esc(n.desc)}</p>${mut}
    ${r > 0 ? `<div class="tal-fx"><b>Jetzt</b><ul>${fxLines(n, r)}</ul></div>` : ''}
    ${r < n.max ? `<div class="tal-fx next"><b>${r > 0 ? 'Nächster Rang' : 'Rang 1'}</b><ul>${fxLines(n, r + 1)}</ul></div>` : ''}
    ${reqs.length ? `<p class="small">Bedingungen: ${reqs.map(esc).join(' · ')}</p>` : ''}
    <div class="tal-act">${learnBtn}${extra}</div>
    <p class="soft tiny">Werte je Knoten vor den Obergrenzen; alle Boni laufen asymptotisch gegen feste Grenzen, Endbosse behalten ihren Schutz gegen Einzeltreffer.</p>`;
}

// ---------- Zurücksetzen ----------

function respecRow(v: TalentView, ui: TalentUiState): string {
  const btn = (scope: string, label: string, c: { gold: number; seals: number; points: number }) => {
    if (c.points <= 0) return `<button class="secondary" disabled>${label}</button>`;
    const afford = v.gold >= c.gold && v.w.kaiserSeals >= c.seals;
    const price = `${fmtInt(c.gold)} Gold${c.seals ? ` + ${c.seals} Kaiser-Siegel` : ''}`;
    const sure = ui.confirm === scope;
    return `<button class="${sure ? 'primary' : 'secondary'}" data-a="${scope.startsWith('tech.') ? 'trespec' : 'respec'}" data-id="${scope}"${afford ? '' : ' disabled'} title="${c.points} Punkte zurück">${sure ? `Wirklich zurücksetzen? (${price})` : `${label} · ${price}`}</button>`;
  };
  if (isTechPick(ui.tree)) {
    const b = techOf(ui.tree);
    const pts = branchPoints(v.tech?.learned ?? {}, b);
    return `<div class="row tal-respec">${btn(ui.tree, `„${esc(BRANCHES[b].n)}“ zurücksetzen`, techRespecCost(v.t, v.w.level, pts))}</div>
      <p class="soft tiny">Zurücksetzen gibt die Punkte in den gemeinsamen Topf zurück; die F-Plätze der Techniken werden frei.</p>`;
  }
  const tr = TREE_BY_ID[ui.tree as TalentTreeId];
  if (tr.id === 'kosmos' && !v.t.ascended) return '';
  return `<div class="row tal-respec">${btn(tr.id, `„${esc(tr.name)}“ zurücksetzen`, respecCost(v.t, v.w.level, tr.id))}${tr.id !== 'kosmos' ? btn('all', 'Alle Bäume zurücksetzen', respecCost(v.t, v.w.level, 'all')) : ''}</div>
    <p class="soft tiny">Zurücksetzen gibt die Talentpunkte in den gemeinsamen Topf zurück; verbrauchte Kaiser-Siegel bleiben in den Knoten gebunden.</p>`;
}

// ---------- Meisterschafts-Siegel ----------

function sealsPanel(v: TalentView): string {
  const kinds: [string, string][] = [['kaiser', 'Kaiser des fünften Rings'], ['mega', 'Kommandanten der Mega-Inseln'], ['weltboss', 'Weltbosse'], ['raid', 'Belagerungen (Raid-Endbosse)'], ['legende', 'Rangliste']];
  const groups = kinds.map(([k, label]) => {
    const rows = MILESTONES.filter((m) => m.kind === k).map((m) => {
      const done = v.t.seals.includes(m.id);
      return `<li class="${done ? 'done' : ''}">${done ? '✔' : '○'} ${esc(m.label)}</li>`;
    }).join('');
    return `<div class="tal-seals"><b>${label}</b><ul>${rows}</ul></div>`;
  }).join('');
  let cosmic = '';
  if (v.t.ascended) {
    const rows = COSMIC_SOURCES.map((c) => `<li class="${v.t.cosmic.includes(c.id) ? 'done' : ''}">${v.t.cosmic.includes(c.id) ? '✔' : '○'} ${esc(c.label)}</li>`).join('');
    cosmic = `<div class="tal-seals"><b>Kosmische Punkte (${cosmicTotal(v.t)}/${TALENT.cosmicMax})</b><ul>${rows}</ul></div>`;
  }
  return `<div class="tal3-seals"><div class="row"><h3>Meisterschafts-Siegel</h3><button class="secondary mini" data-a="seals">Schließen</button></div>
    <p class="soft small">Jeder erste Sieg über einen der großen Gegner schenkt ein Meisterschafts-Siegel – einen Talentpunkt (${v.t.seals.length}/${TALENT.sealPoints}). Mit Stufe 100 und allen 21 Siegeln sind es 120 Punkte; dazu kommen Bonuspunkte aus Bossinseln, Ruinen, Faji-Kristallen, Legenden, Aufträgen, Splittern und dem Schrein.</p><div class="tal-seal-grid">${groups}${cosmic}</div></div>`;
}

// ---------- Kopf: Stufe, Punkte, Aufstiegs-Prüfung ----------

/** Fortschritt der geheimen Aufstiegs-Prüfung: besiegte Kaiser-Inseln (0 … 5) */
export function ascensionProgress(t: TalentSave): { done: number; total: number } {
  return { done: KAISER_IDS.filter((id) => t.kaiserDefeated.includes(id)).length, total: KAISER_IDS.length };
}

function ascBar(v: TalentView): string {
  const p = ascensionProgress(v.t);
  if (v.t.ascended) return `<div class="tal3-asc done" data-a="cat" data-id="kosmos" role="button" tabindex="0"><span>✹ Aufgestiegen – Stufe 101</span><u><i style="width:100%"></i></u><small>Kosmos-Pfad offen</small></div>`;
  const segs = KAISER_IDS.map((id) => `<i class="${v.t.kaiserDefeated.includes(id) ? 'on' : ''}"></i>`).join('');
  const label = allKaiserDefeated(v.t) ? 'Der Sternenaltar wartet' : 'Geheime Aufstiegs-Prüfung';
  return `<div class="tal3-asc" data-a="cat" data-id="kosmos" role="button" tabindex="0" aria-label="${label}: ${p.done} von ${p.total} Kaiser-Inseln besiegt"><span>✹ ${label}</span><b class="tal3-segs">${segs}</b><small>${p.done}/${p.total} Kaiser-Inseln besiegt</small></div>`;
}

/** Ganzes Fenster */
export function talentScreenHtml(v: TalentView, ui: TalentUiState): string {
  const t = v.t, lvl = v.w.level;
  const total = poolTotal(t, lvl), freeP = free(v);
  const xpPct = lvl >= TALENT.levelCap ? 100 : Math.round((v.xp / Math.max(1, v.xpNeed)) * 100);
  const chips = [
    `<span class="tal-chip big">Talentpunkte <b>${freeP}</b> frei · ${total}</span>`,
    `<button class="tal-chip" data-a="seals" aria-pressed="${ui.seals}">Siegel ${t.seals.length}/${TALENT.sealPoints}</button>`,
    `<span class="tal-chip">Kaiser-Siegel ${v.w.kaiserSeals}</span>`,
    `<span class="tal-chip">Baupläne ${t.blueprints.length} · Relikte ${t.relics.length}</span>`,
    t.ascended ? `<span class="tal-chip cosmic">Kosmos <b>${freeCosmic(t)}</b> frei · ${cosmicTotal(t)}/${TALENT.cosmicMax}</span>` : '',
  ].join('');
  const tabs = TALENT_CATS.map((c) => `<button class="tal3-tab" role="tab" data-a="cat" data-id="${c.id}" aria-selected="${ui.cat === c.id}" aria-pressed="${ui.cat === c.id}"><span aria-hidden="true">${esc(c.icon)}</span> <span class="lg">${esc(c.label)}</span><span class="sm">${esc(c.short)}</span></button>`).join('');
  let main: string, info: string;
  if (isTechPick(ui.tree)) {
    main = techBody(v, ui, techOf(ui.tree));
    info = nodeInfo(v, ui);
  } else {
    const tr = TREE_BY_ID[ui.tree as TalentTreeId];
    main = tr.id === 'kosmos' && !treeVisible(t, 'kosmos') ? sealedCosmos(v) : treeBody(v, ui, tr);
    info = previewCard(v, tr) + `<div class="tal3-node">${nodeInfo(v, ui)}</div>`;
  }
  const zoom = Math.max(0.8, Math.min(1.3, ui.zoom || 1));
  return `<div class="tal3-top">
      <div class="tal3-title"><h2 class="fell">Talente &amp; Kampfkünste</h2><small class="soft">Tasten N und K · ein gemeinsamer Punktetopf</small></div>
      <div class="tal-level"><b>Stufe ${lvl}</b>${lvl > TALENT.levelCap ? ' <span class="cosmic">Aufgestiegen</span>' : lvl >= TALENT.levelCap ? ' <span class="soft">Höchststufe</span>' : ''}
        <div class="ma-bar" role="img" aria-label="Erfahrung ${xpPct} %"><i style="width:${xpPct}%;--c:#d7ae52;--a:#fff1c0"></i></div>
        <span class="soft tiny">${lvl >= TALENT.levelCap ? (t.ascended ? 'Jenseits der Sterblichen' : 'Höchststufe erreicht') : `${fmtInt(v.xp)} / ${fmtInt(v.xpNeed)} EP`}</span></div>
      <div class="tal-chips">${chips}</div>
      ${ascBar(v)}
    </div>
    ${ui.note ? `<p class="tal-note" role="status">${esc(ui.note)}</p>` : ''}
    <nav class="tal3-tabs" role="tablist" aria-label="Kategorien">${tabs}</nav>
    ${ui.seals ? sealsPanel(v) : `<div class="tal3-grid">
      <nav class="tal3-list" aria-label="Bäume">${catList(v, ui)}</nav>
      <section class="tal3-tree" style="--tz:${zoom.toFixed(2)}">
        <div class="tal3-zoom" role="group" aria-label="Zoom"><button class="mini" data-a="zoom" data-id="-" aria-label="Verkleinern">−</button><span>${Math.round(zoom * 100)} %</span><button class="mini" data-a="zoom" data-id="+" aria-label="Vergrößern">+</button></div>
        <div class="tal3-scroll">${main}</div>
      </section>
      <aside class="tal3-info tal-info">${info}</aside>
    </div>`}
    <div class="tal3-foot">${ui.seals ? '' : respecRow(v, ui)}<div class="row"><button class="primary" data-a="back">Zurück</button></div></div>`;
}

/** Respec-Bereich aus einer Auswahl (für die Aktion) */
export const respecScopeOf = (id: string): RespecScope | null => (id === 'all' || id in TREE_BY_ID ? (id as RespecScope) : null);
