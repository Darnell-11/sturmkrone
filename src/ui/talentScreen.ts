// Phase 4.6E – Talent-Fenster (Taste N, Pausenmenü): 18 Bäume mit sieben Stufen, Pfadwahl, Mutationen, Meisterprüfung, Apex und Ultimate-
// Evolutionen; die Meisterschafts-Siegel; die geheime Aufstiegs-Prüfung (Stufe 101) und der Kosmos-Baum mit fünf Sternbildern.
// Reine Darstellung: baut HTML aus dem Talent-Stand und den Regeln (`core/talentRules.ts`); die Aktionen ruft `Menus.showTalents` im Spiel auf.
import {
  CAPTAIN_TREES, CONSTELLATIONS, COSMIC_SOURCES, FAJI_TREES, MILESTONES, NODE_BY_ID, TALENT, TREE_BY_ID, WEAPON_TREES, rankCost,
  type FxKey, type TalentNodeDef, type TalentTreeDef, type TalentTreeId,
} from '../data/talentTrees';
import {
  ascensionRevealed, ascensionRows, committedTree, cosmicTotal, freeCosmic, freePoints, fxText, learnBlock, pathOf, respecCost, talentTotal,
  treePoints, treeVisible, type RespecScope, type TalentSave, type TalentWorld,
} from '../core/talentRules';
import { mutationText } from '../combat/talentCombat';
import { esc } from './dom';
import { fmtInt } from '../core/format';

export type TalentTab = 'baum' | 'siegel' | 'aufstieg';

/** Zustand des Fensters (bleibt beim Neuzeichnen erhalten) */
export interface TalentUiState { tree: TalentTreeId; sel: string | null; tab: TalentTab; confirm: RespecScope | null; note: string }

/** Was das Fenster vom Spiel braucht */
export interface TalentView {
  t: TalentSave;
  w: TalentWorld;
  xp: number;
  xpNeed: number;
  gold: number;
}

export const newTalentUi = (tree: TalentTreeId): TalentUiState => ({ tree, sel: null, tab: 'baum', confirm: null, note: '' });

const rankOf = (t: TalentSave, id: string): number => t.nodes[id] ?? 0;

/** Zustand eines Knotens für die Anzeige */
function nodeState(v: TalentView, n: TalentNodeDef): 'full' | 'on' | 'open' | 'off' | 'lock' {
  const r = rankOf(v.t, n.id);
  if (r >= n.max) return 'full';
  if (n.path) { const p = pathOf(v.t, n.tree); if (p && p !== n.path) return 'off'; }
  const why = learnBlock(v.t, v.w, n.id);
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
  const rows = (Object.entries(n.fx) as [FxKey, number][]).map(([k, val]) => `<li>${esc(fxText(k, k === 'formStep' ? rank : val * rank))}</li>`);
  return rows.join('');
}

function treeList(v: TalentView, ui: TalentUiState): string {
  const btn = (id: TalentTreeId) => {
    const tr = TREE_BY_ID[id];
    const pts = treePoints(v.t, id);
    const bound = committedTree(v.t) === id;
    return `<button class="tal-tree-btn${bound ? ' bound' : ''}" data-a="tree" data-id="${id}" aria-pressed="${ui.tree === id}" style="--c:${tr.color}">
      <span class="ic" aria-hidden="true">${esc(tr.icon)}</span><span class="nm">${esc(tr.name)}</span><span class="pt">${pts}/${tr.capacity}</span></button>`;
  };
  const group = (label: string, ids: readonly TalentTreeId[]) => `<div class="tal-group"><div class="tal-group-h">${label}</div>${ids.map(btn).join('')}</div>`;
  let cosmos = '';
  if (treeVisible(v.t, 'kosmos')) cosmos = group('Kosmos · Stufe 101', ['kosmos']);
  else if (ascensionRevealed(v.t)) cosmos = `<div class="tal-group"><div class="tal-group-h">???</div><button class="tal-tree-btn secret" data-a="tab" data-id="aufstieg"><span class="ic">✹</span><span class="nm">Der Himmel öffnet sich …</span></button></div>`;
  return group('Waffen', WEAPON_TREES) + group('Faji-Künste', FAJI_TREES) + group('Kapitän &amp; Welt', CAPTAIN_TREES) + cosmos;
}

function treeBody(v: TalentView, ui: TalentUiState, tr: TalentTreeDef): string {
  const pts = treePoints(v.t, tr.id);
  const rows: string[] = [];
  const maxTier = tr.nodes.reduce((a, n) => Math.max(a, n.tier), 0);
  if (tr.id === 'kosmos') {
    rows.push(`<div class="tal-const">${CONSTELLATIONS.map((c) => `<span style="--c:${c.color}" title="${esc(c.desc)}">${esc(c.icon)} ${esc(c.name)}</span>`).join('')}</div>`);
  }
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
    <p class="soft small">${esc(tr.desc)}</p><p class="small">Investiert: <b>${pts}</b> von ${tr.capacity} Punkten${tr.kind === 'waffe' || tr.kind === 'faji' ? ` · Bindung ab ${TALENT.commit}` : ''}</p></div>${rows.join('')}`;
}

function nodeInfo(v: TalentView, ui: TalentUiState): string {
  const n = ui.sel ? NODE_BY_ID[ui.sel] : null;
  if (!n) return '<p class="soft small">Wähle ein Talent, um seine Wirkung zu sehen.</p>';
  const tr = TREE_BY_ID[n.tree];
  const r = rankOf(v.t, n.id);
  const why = learnBlock(v.t, v.w, n.id);
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

function respecRow(v: TalentView, ui: TalentUiState): string {
  const btn = (scope: RespecScope, label: string) => {
    const c = respecCost(v.t, v.w.level, scope);
    if (c.points <= 0) return `<button class="secondary" disabled>${label}</button>`;
    const afford = v.gold >= c.gold && v.w.kaiserSeals >= c.seals;
    const price = `${fmtInt(c.gold)} Gold${c.seals ? ` + ${c.seals} Kaiser-Siegel` : ''}`;
    const sure = ui.confirm === scope;
    return `<button class="${sure ? 'primary' : 'secondary'}" data-a="respec" data-id="${scope}"${afford ? '' : ' disabled'} title="${c.points} Punkte zurück">${sure ? `Wirklich zurücksetzen? (${price})` : `${label} · ${price}`}</button>`;
  };
  const tr = TREE_BY_ID[ui.tree];
  return `<div class="row tal-respec">${btn(ui.tree, `„${esc(tr.name)}“ zurücksetzen`)}${ui.tree !== 'kosmos' ? btn('all', 'Alle Bäume zurücksetzen') : ''}</div>
    <p class="soft tiny">Zurücksetzen gibt die Talentpunkte zurück; verbrauchte Kaiser-Siegel bleiben in den Knoten gebunden.</p>`;
}

function sealsTab(v: TalentView): string {
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
  return `<p class="soft small">Jeder erste Sieg über einen der großen Gegner schenkt ein Meisterschafts-Siegel – einen Talentpunkt (${v.t.seals.length}/${TALENT.sealPoints}). Mit Stufe 100 und allen 21 Siegeln sind es 120 Punkte.</p><div class="tal-seal-grid">${groups}${cosmic}</div>`;
}

function ascensionTab(v: TalentView): string {
  if (v.t.ascended) {
    return `<div class="tal-asc done"><h3>✹ Aufgestiegen – Stufe 101</h3><p>Der Kosmos-Baum ist offen. Kosmische Punkte: <b>${freeCosmic(v.t)}</b> frei von ${cosmicTotal(v.t)} (höchstens ${TALENT.cosmicMax}). Weitere Punkte bringen die Sternenprüfung (erster Sieg nach dem Aufstieg) und die Revanche (zweiter Sieg) auf jeder Kaiser-Insel.</p>
      <button class="primary" data-a="tree" data-id="kosmos">Zum Kosmos-Baum</button></div>`;
  }
  const rows = ascensionRows(v.t, v.w);
  const ready = rows.every((r) => r.ok);
  return `<div class="tal-asc"><h3>✹ Die Aufstiegs-Prüfung</h3>
    <p>Wer alle fünf Kaiser-Zitadellen bezwungen hat, kann am Sternenaltar die Grenze der Sterblichen überschreiten: Stufe 101, der geheime Kosmos-Baum mit fünf Sternbildern und als seine Krone das 15. Ultimate – <b>Himmelssturz: Zwillings-Meteoriten &amp; Planeten-Kollaps</b>.</p>
    <ul class="tal-req">${rows.map((r) => `<li class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✔' : '✗'} ${esc(r.label)} <span class="soft">(${esc(r.have)})</span></li>`).join('')}</ul>
    <button class="primary" data-a="ascend"${ready ? '' : ' disabled'}>Aufstiegs-Prüfung ablegen</button>
    <p class="soft tiny">Die geopferten Baupläne und Relikte bleiben in deiner Sammlung, sind aber im Sternenaltar gebunden.</p></div>`;
}

/** Ganzes Fenster */
export function talentScreenHtml(v: TalentView, ui: TalentUiState): string {
  const t = v.t, lvl = v.w.level;
  const total = talentTotal(t, lvl), free = freePoints(t, lvl);
  const xpPct = lvl >= TALENT.levelCap ? 100 : Math.round((v.xp / Math.max(1, v.xpNeed)) * 100);
  const revealed = ascensionRevealed(t);
  const chips = [
    `<span class="tal-chip big">Talentpunkte <b>${free}</b> frei · ${total}/${TALENT.total}</span>`,
    `<span class="tal-chip">Siegel ${t.seals.length}/${TALENT.sealPoints}</span>`,
    `<span class="tal-chip">Kaiser-Siegel ${v.w.kaiserSeals}</span>`,
    `<span class="tal-chip">Baupläne ${t.blueprints.length} · Relikte ${t.relics.length}</span>`,
    t.ascended ? `<span class="tal-chip cosmic">Kosmos <b>${freeCosmic(t)}</b> frei · ${cosmicTotal(t)}/${TALENT.cosmicMax}</span>` : '',
  ].join('');
  const tabs = `<div class="chips tal-tabs" role="tablist">
    <button data-a="tab" data-id="baum" aria-pressed="${ui.tab === 'baum'}">Talentbäume</button>
    <button data-a="tab" data-id="siegel" aria-pressed="${ui.tab === 'siegel'}">Meisterschafts-Siegel</button>
    ${revealed ? `<button data-a="tab" data-id="aufstieg" aria-pressed="${ui.tab === 'aufstieg'}">${t.ascended ? 'Kosmos' : 'Aufstieg ✹'}</button>` : ''}</div>`;
  let body = '';
  if (ui.tab === 'siegel') body = sealsTab(v);
  else if (ui.tab === 'aufstieg' && revealed) body = ascensionTab(v);
  else {
    const tr = TREE_BY_ID[treeVisible(t, ui.tree) ? ui.tree : 'zweihaender'];
    body = `<div class="tal-grid"><nav class="tal-trees" aria-label="Bäume">${treeList(v, ui)}</nav>
      <section class="tal-tree">${treeBody(v, ui, tr)}</section>
      <aside class="tal-info">${nodeInfo(v, ui)}</aside></div>${respecRow(v, ui)}`;
  }
  return `<h2 class="fell">Talente &amp; Stufen</h2>
    <div class="tal-head"><div class="tal-level"><b>Stufe ${lvl}</b>${lvl > TALENT.levelCap ? ' <span class="cosmic">Aufgestiegen</span>' : lvl >= TALENT.levelCap ? ' <span class="soft">Höchststufe</span>' : ''}
      <div class="ma-bar" role="img" aria-label="Erfahrung ${xpPct} %"><i style="width:${xpPct}%;--c:#d7ae52;--a:#fff1c0"></i></div>
      <span class="soft tiny">${lvl >= TALENT.levelCap ? (t.ascended ? 'Jenseits der Sterblichen' : revealed ? 'Der Sternenaltar wartet: Stufe 101 über die Aufstiegs-Prüfung' : 'Höchststufe erreicht') : `${fmtInt(v.xp)} / ${fmtInt(v.xpNeed)} EP`}</span></div>
      <div class="tal-chips">${chips}</div></div>
    ${ui.note ? `<p class="tal-note">${esc(ui.note)}</p>` : ''}
    ${tabs}${body}
    <div class="row"><button class="primary" data-a="back">Zurück</button></div>`;
}
