// Phase 4.7B/4.7C – Talent-Fenster (Tasten N und K): NUR der eigene 60-Knoten-Klassenbaum und der Reiter „Geistes-Faji“. Fremde Klassen,
// Klingen, Faust-Pfade und Elemente sind verborgen; einzige Ausnahme: Faji-Wirker ohne Element (und Faustkämpfer ohne Pfad) sehen die
// Wahlkarten ihrer eigenen Klasse – der erste Punkt (bzw. die Wahl) legt sie für immer fest.
// 4.7C: der Baum ist ein Sternbild in SVG (`ui/classTreeGraph.ts`): aufsteigender Klassen-Pfad mit Seitenzweigen, Energie-Leitlinien,
// Edelstein-Sockel (Stärkungen mit Rang-Zähler), Rauten-Medaillons (Formen I – X mit Emblem), gekröntes Apex-Wappen (Knoten 60) und ein
// Wasserzeichen der Klasse. Kopf, Reiter und Fußzeile (Zurücksetzen, Zurück) stehen fest, nur der Inhalt rollt. Reines HTML/SVG aus Daten.
import { esc } from './dom';
import { ACTION_STYLES } from '../data/actionStyles';
import {
  BUFF_INFO, CLASS_BASES, FORM_NODES, GEIST, GEIST_MAX, SPECS, SPECS_OF, TREE_SIZE, ULT_NODE, classBase, classSpec, classTree,
  type ClassNode, type ClassSave, type SpecId,
} from '../data/classes';
import {
  NODE_SIZE, TREE_H, TREE_W, buffRanks, emblemSvg, hexPoints, patternOf, roman, statSvg, treeLayout, watermarkSvg,
} from './classTreeGraph';

export interface ClassView {
  cls: ClassSave;
  level: number;
  xp: number;
  xpNeed: number;
  /** verdiente Punkte (Stufen, Siegel, Bonus) und freie */
  pool: number;
  free: number;
  /** Tasten der zehn Formen, des Ultimates und der Geistes-Kräfte (Anzeige) */
  keys: { forms: string[]; ult: string; geist: string[] };
  /** Wahl erlaubt (Faustkämpfer ohne Pfad: nur bei Konrad bzw. außerhalb der Einführung) */
  canChoose: boolean;
}

export type ClassTab = 'baum' | 'geist';
export interface ClassUiState { tab: ClassTab; sel: number; pick: SpecId | null; note: string; confirm?: boolean }
export const newClassUi = (): ClassUiState => ({ tab: 'baum', sel: 1, pick: null, note: '', confirm: false });

const ROLE_ICON: Record<string, string> = { 'DPS': '⚔', 'Tank-DPS': '⛨', 'Assassinen-DPS': '✝', 'Kombo-DPS': '⟳', 'Midrange-DPS': '➹', 'Elementar-DPS': '✦', 'DPS/Heal': '✚' };

/** Rollen-Plakette („⛨ Tank-DPS“) für Erschaffung, Baum und Zielrahmen */
export const roleBadge = (role: string): string => (role ? `<span class="cls-role">${ROLE_ICON[role] ?? '◆'} ${esc(role)}</span>` : '');

function fmtS(v: number): string { return `${v.toFixed(v < 10 && v % 1 ? 1 : 0).replace('.', ',')} s`; }

/** Farbverläufe der Embleme und Edelsteine (je SVG eigene Kennungen) */
function defs(p: string, c: string, a: string): string {
  return `<defs>
    <linearGradient id="${p}-em" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF6DA"/><stop offset="0.45" stop-color="${c}"/><stop offset="1" stop-color="${a}"/></linearGradient>
    <radialGradient id="${p}-gem" cx="0.38" cy="0.32" r="0.8"><stop offset="0" stop-color="#FFF8E6" stop-opacity="0.95"/><stop offset="0.35" stop-color="${c}"/><stop offset="1" stop-color="${a}"/></radialGradient>
    <radialGradient id="${p}-off" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#4A4036"/><stop offset="1" stop-color="#14100C"/></radialGradient>
    <linearGradient id="${p}-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FCE9B0"/><stop offset="0.5" stop-color="#D7AE52"/><stop offset="1" stop-color="#7A5518"/></linearGradient>
  </defs>`;
}

/** Ein Knoten des Sternbilds */
function nodeSvg(v: ClassView, sp: SpecId, n: ClassNode, x: number, y: number, rank: { k: number; n: number }, sel: boolean): string {
  const learned = v.cls.nodes >= n.n;
  const st = learned ? 'on' : n.n === v.cls.nodes + 1 ? 'next' : 'off';
  const cls = `cn ${n.kind} ${st}${sel ? ' sel' : ''}`;
  const tr = `transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"`;
  const fill = learned ? 'url(#ctA-gem)' : 'url(#ctA-off)';
  if (n.kind === 'buff') {
    const r = NODE_SIZE.buff / 2;
    return `<g class="${cls}" ${tr} data-a="sel" data-id="${n.n}" tabindex="-1"><title>${esc(`Knoten ${n.n}: ${n.label} – ${BUFF_INFO[n.buff!].label} Rang ${rank.k}/${rank.n}`)}</title>
      <polygon class="cn-sock" points="${hexPoints(r)}"/><polygon class="cn-gem" points="${hexPoints(r - 3.5)}" fill="${fill}"/>
      <g class="cn-ic" transform="scale(0.6)">${statSvg(n.buff!)}</g><text class="cn-rank" y="${r + 11}">${rank.k}/${rank.n}</text></g>`;
  }
  if (n.kind === 'form') {
    const sk = ACTION_STYLES[SPECS[sp].style].skills[n.form - 1];
    const h = NODE_SIZE.form / 2 / Math.SQRT2;
    return `<g class="${cls}" ${tr} data-a="sel" data-id="${n.n}" tabindex="-1"><title>${esc(`Knoten ${n.n}: Form ${roman(n.form)} – ${sk.label}`)}</title>
      <rect class="cn-glow" x="${-h - 5}" y="${-h - 5}" width="${(h + 5) * 2}" height="${(h + 5) * 2}" rx="5" transform="rotate(45)"/>
      <rect class="cn-frame" x="${-h}" y="${-h}" width="${h * 2}" height="${h * 2}" rx="4" transform="rotate(45)" fill="url(#ctA-gold)"/>
      <rect class="cn-inner" x="${-h + 4}" y="${-h + 4}" width="${(h - 4) * 2}" height="${(h - 4) * 2}" rx="3" transform="rotate(45)" fill="${learned ? '#1A110A' : '#100C09'}"/>
      <g class="cn-em" transform="scale(0.92)">${emblemSvg(sp, patternOf(sk), learned ? 'ctA-em' : 'ctA-off')}</g>
      <text class="cn-num" y="${-NODE_SIZE.form / 2 - 7}">${roman(n.form)}</text></g>`;
  }
  // Knoten 60: gekröntes Apex-Wappen mit Aura-Ring
  const R = NODE_SIZE.ult / 2;
  return `<g class="${cls}" ${tr} data-a="sel" data-id="${n.n}" tabindex="-1"><title>${esc(`Knoten ${n.n}: ${n.label}`)}</title>
    <circle class="cn-aura" r="${R + 6}"/><circle class="cn-aura2" r="${R + 12}"/>
    <path class="cn-crest" d="M0 ${-R + 8} L${R - 8} ${-R + 20} V${R * 0.1} C${R - 8} ${R * 0.62} ${R * 0.3} ${R - 6} 0 ${R + 2} C${-R * 0.3} ${R - 6} ${-R + 8} ${R * 0.62} ${-R + 8} ${R * 0.1} V${-R + 20}Z" fill="url(#ctA-gold)"/>
    <path class="cn-crest-in" d="M0 ${-R + 15} L${R - 15} ${-R + 25} V${R * 0.08} C${R - 15} ${R * 0.5} ${R * 0.24} ${R - 13} 0 ${R - 6} C${-R * 0.24} ${R - 13} ${-R + 15} ${R * 0.5} ${-R + 15} ${R * 0.08} V${-R + 25}Z" fill="${learned ? '#1A110A' : '#100C09'}"/>
    <path class="cn-crown" d="M-16 ${-R + 4} L-16 ${-R - 10} L-8 ${-R - 3} L0 ${-R - 15} L8 ${-R - 3} L16 ${-R - 10} L16 ${-R + 4}Z" fill="url(#ctA-gold)"/>
    <g class="cn-em" transform="translate(0 2) scale(1.3)">${emblemSvg(sp, 'impact', learned ? 'ctA-em' : 'ctA-off')}</g>
    <text class="cn-num" y="${R + 22}">ULTIMATE</text></g>`;
}

/** Das Sternbild: Verbindungen (gesperrt dunkel, frei pulsierend in Klassenfarbe), Knoten, Wasserzeichen dahinter */
function treeSvg(v: ClassView, ui: ClassUiState, sp: SpecId): string {
  const tree = classTree(sp);
  const { nodes, edges } = treeLayout();
  const ranks = buffRanks(tree);
  const lines = edges.map((e) => {
    const a = nodes[e.a - 1], b = nodes[e.b - 1];
    const on = v.cls.nodes >= e.b ? 'on' : v.cls.nodes >= e.a ? 'next' : 'off';
    return `<line class="ce ${on}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`;
  }).join('');
  const glow = edges.filter((e) => v.cls.nodes >= e.b).map((e) => {
    const a = nodes[e.a - 1], b = nodes[e.b - 1];
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`;
  }).join('');
  // Buffs zuerst, Formen und Apex obenauf
  const order = [...tree].sort((p, q) => (p.kind === 'buff' ? 0 : 1) - (q.kind === 'buff' ? 0 : 1));
  const ns = order.map((n) => { const g = nodes[n.n - 1]; return nodeSvg(v, sp, n, g.x, g.y, ranks[n.n - 1], ui.sel === n.n); }).join('');
  return `<svg class="ct-svg" viewBox="0 0 ${TREE_W} ${TREE_H}" width="${TREE_W}" height="${TREE_H}" role="img" aria-label="Klassenbaum mit 60 Knoten" shape-rendering="geometricPrecision">
    ${defs('ctA', SPECS[sp].color, SPECS[sp].accent)}
    <g class="ce-glow">${glow}</g><g class="ce-all">${lines}</g><g class="cn-all">${ns}</g></svg>`;
}

/** Detail einer Form bzw. des Ultimates: großes Emblem mit animierter Vorschau, Rolle, Wirkung, Abklingzeit/Kosten */
function formDetail(v: ClassView, sp: SpecId, n: ClassNode, learned: boolean): string {
  const s = SPECS[sp];
  const st = ACTION_STYLES[s.style];
  const big = (pat: string, ult: boolean) => `<div class="cls-emblem${ult ? ' ult' : ''}" data-kind="${pat}"><s></s><s></s><s></s>
    <svg viewBox="-24 -24 48 48" class="em-big">${defs('ctD', s.color, s.accent)}${emblemSvg(sp, pat, 'ctD-em')}</svg></div>`;
  if (n.kind === 'ult') {
    const u = st.ultimate;
    return `<div class="cls-detail ult">${big('impact', true)}
      <h4>${esc(u?.label ?? 'Klassen-Ultimate')}</h4>
      <p class="small">${roleBadge(s.role)} · Knoten ${ULT_NODE} · im Sturm-Erwachen (${esc(v.keys.ult)}) einmal je Erwachen</p>
      <p>Das Ultimate deiner Klasse mit 3-Akt-Kino-Regie: Aufladen in Zeitlupe, Einschlag, Impact-Frames.${u?.heal ? ` Heilt dich und Verbündete in ${u.healR ?? 0} m um ${Math.round(u.heal * 100)} %.` : ''}</p>
      <p class="small soft">Kosten: 1 Punkt · ${learned ? '<b class="ok">gelernt</b>' : 'noch nicht gelernt'}</p></div>`;
  }
  const sk = st.skills[n.form - 1];
  const pat = patternOf(sk);
  return `<div class="cls-detail">${big(pat, false)}
    <h4>Form ${roman(n.form)}: ${esc(sk.label)}</h4>
    <p class="small">${roleBadge(s.role)} · Taste <kbd>${esc(v.keys.forms[n.form - 1] ?? '')}</kbd> · Knoten ${n.n}</p>
    <p>${esc(sk.desc)}</p>
    <p class="small soft">Abklingzeit ${fmtS(sk.cd)} · Kosten: 1 Punkt${sk.hyper ? ' · Hyper-Armor' : ''}${sk.airOk ? ' · auch in der Luft' : ''} · ${learned ? '<b class="ok">frei</b>' : 'noch gesperrt'}</p></div>`;
}

function nodeDetail(v: ClassView, sp: SpecId, n: ClassNode, rank: { k: number; n: number }): string {
  const learned = v.cls.nodes >= n.n;
  if (n.kind !== 'buff') return formDetail(v, sp, n, learned);
  const s = SPECS[sp];
  return `<div class="cls-detail">
    <div class="cls-emblem buff" data-kind="buff"><s></s><svg viewBox="-24 -24 48 48" class="em-big">${defs('ctD', s.color, s.accent)}
      <polygon points="${hexPoints(20)}" fill="url(#ctD-gem)" stroke="#D7AE52" stroke-width="2"/><g class="st-big" transform="scale(1.05)">${statSvg(n.buff!)}</g></svg></div>
    <h4>${esc(n.label)}</h4>
    <p class="small">${esc(BUFF_INFO[n.buff!].label)} · Rang ${rank.k} von ${rank.n} in diesem Baum</p>
    <p class="small soft">Knoten ${n.n} · Stärkung · Kosten: 1 Punkt · ${learned ? '<b class="ok">gelernt</b>' : 'noch nicht gelernt'}</p></div>`;
}

/** Wahlkarten der eigenen Klasse (Element bzw. Faust-Pfad) */
function choiceHtml(v: ClassView, ui: ClassUiState): string {
  const base = classBase(v.cls);
  const ids = SPECS_OF[base];
  const faji = base === 'faji';
  const head = faji
    ? `<p class="tal-note">Wähle dein Element. <b>Der erste Punkt legt es für immer fest</b> – andere Elemente verschwinden danach aus diesem Fenster.${v.free > 0 ? '' : ' Du brauchst dafür einen freien Talentpunkt.'}</p>`
    : `<p class="tal-note">Wähle deinen Faust-Pfad. <b>Die Wahl gilt für immer.</b>${v.canChoose ? '' : ' In der Einführung triffst du sie bei Konrad.'}</p>`;
  const cards = ids.map((id) => {
    const s = SPECS[id];
    const st = ACTION_STYLES[s.style];
    const on = ui.pick === id;
    return `<div class="cls-card${on ? ' on' : ''}" style="--cc:${s.color};--ca:${s.accent}">
      <div class="cls-card-h"><span class="cls-crest">${esc(s.crest)}</span><b>${esc(s.label)}</b>${roleBadge(s.role)}</div>
      <p class="small">${esc(s.desc)}</p>
      <p class="small soft">Form I: ${esc(st.skills[0].label)} · Ultimate: ${esc(st.ultimate?.label ?? '')}</p>
      ${v.canChoose ? `<button class="mini ${on ? 'primary' : 'brass'}" data-a="pick" data-id="${id}">${on ? 'Für immer festlegen' : 'Wählen'}</button>` : ''}</div>`;
  }).join('');
  return `${head}<div class="cls-cards">${cards}</div>`;
}

function geistHtml(v: ClassView): string {
  const c = v.cls;
  if (!c.awake) return `<p class="tal-note">Deine Geistes-Faji schläft noch. Sie erwacht am Faji-Kristall bei Meister Gerstenkorn (Stufe 3) – für alle Klassen.</p>`;
  return `<p class="soft small">Vier Kräfte für jede Klasse. Rang 1 kam mit dem Erwachen, jeder weitere Rang kostet einen Punkt aus demselben Topf.</p>
    <div class="cls-geist">${GEIST.map((g, i) => {
      const r = c.geist[i];
      return `<div class="cls-gcard" style="--gc:${g.color};--ga:${g.accent}">
        <div class="cls-gicon" data-g="${g.id}"><i>${esc(g.icon)}</i></div>
        <div class="cls-gbody"><b>${esc(g.label)}</b> <kbd>${esc(v.keys.geist[i] ?? g.key)}</kbd>
          <div class="cls-pips">${Array.from({ length: GEIST_MAX }, (_, k) => `<span class="${k < r ? 'on' : ''}"></span>`).join('')}</div>
          <p class="small">${esc(g.desc(Math.max(1, r)))}</p>
          <p class="small soft">Rang ${r}/${GEIST_MAX} · Abklingzeit ${g.cd(Math.max(1, r))} s${r < GEIST_MAX ? ` → ${g.cd(r + 1)} s` : ''}</p>
          ${r < GEIST_MAX ? `<button class="mini brass" data-a="geist" data-id="${i}" title="${esc(`Rang ${r + 1}: ${g.desc(r + 1)}`)}"${v.free > 0 ? '' : ' disabled'}>Rang ${r + 1} lernen (1 Punkt)</button>` : '<span class="small ok">Höchster Rang</span>'}
        </div></div>`;
    }).join('')}</div>`;
}

/** Das ganze Fenster: fester Kopf und Fuß, dazwischen rollt nur der Inhalt */
export function classScreenHtml(v: ClassView, ui: ClassUiState): string {
  const c = v.cls;
  const base = CLASS_BASES[classBase(c)];
  const spId = classSpec(c);
  const sp = spId ? SPECS[spId] : null;
  const color = sp?.color ?? '#E8CB7C', accent = sp?.accent ?? '#93691F';
  const forms = FORM_NODES.filter((k) => c.nodes >= k).length;
  const head = `<div class="cls-head">
      <span class="cls-crest big">${esc(sp?.crest ?? base.icon)}</span>
      <div class="cls-title"><b>${esc(base.label)}${sp ? ` · ${esc(sp.label)}` : ''}</b>${sp ? roleBadge(sp.role) : ''}
        <small>Stufe ${v.level} · ${v.xpNeed > 0 ? `${v.xp}/${v.xpNeed} EP` : 'Höchststufe'}</small></div>
      <div class="tal-chips"><span class="tal-chip big">Freie Punkte <b>${v.free}</b></span><span class="tal-chip">Baum <b>${c.nodes}/${TREE_SIZE}</b></span><span class="tal-chip">Formen <b>${forms}/10</b></span><span class="tal-chip">Ultimate <b>${c.nodes >= ULT_NODE ? 'frei' : '–'}</b></span></div>
    </div>`;
  const tabs = `<div class="tabs tal-tabs"><button data-a="tab" data-id="baum" aria-pressed="${ui.tab === 'baum'}">Klassenbaum</button><button data-a="tab" data-id="geist" aria-pressed="${ui.tab === 'geist'}">Geistes-Faji</button></div>`;
  let body: string;
  if (ui.tab === 'geist') body = `<div class="ct-scroll-y">${geistHtml(v)}</div>`;
  else if (!sp) body = `<div class="ct-scroll-y">${choiceHtml(v, ui)}</div>`;
  else {
    const tree = classTree(sp.id);
    const ranks = buffRanks(tree);
    const sel = tree[Math.max(0, Math.min(TREE_SIZE - 1, ui.sel - 1))];
    const next = c.nodes < TREE_SIZE ? tree[c.nodes] : null;
    body = `<div class="cls-grid">
      <div class="ct-panel"><svg class="ct-wm" viewBox="-220 -220 440 440" aria-hidden="true">${watermarkSvg(sp.id)}</svg>
        <div class="ct-scroll">${treeSvg(v, ui, sp.id)}</div></div>
      <div class="cls-side">${nodeDetail(v, sp.id, sel, ranks[sel.n - 1])}
        <div class="cls-actions">${next ? `<button class="primary" data-a="learn"${v.free > 0 ? '' : ' disabled'}>Knoten ${next.n} lernen: ${esc(next.label)}</button>
          <button class="mini" data-a="fill"${v.free > 0 ? '' : ' disabled'}>Alle freien Punkte verteilen</button>` : '<p class="ok">Dein Klassenbaum ist vollständig.</p>'}</div></div></div>`;
  }
  const canReset = c.nodes > 0 || c.geist.some((r) => r > 1);
  const foot = `<div class="ct-foot">
      <button class="secondary${ui.confirm ? ' warn' : ''}" data-a="reset"${canReset ? '' : ' disabled'}>${ui.confirm ? 'Wirklich zurücksetzen?' : 'Zurücksetzen'}</button>
      <button class="primary" data-a="back" data-focus>Zurück</button></div>`;
  return `<div class="cls-screen" data-base="${base.id}" data-spec="${sp?.id ?? ''}" style="--cc:${color};--ca:${accent};--rune:'${esc(sp?.rune ?? '✦')}'">
    <div class="ct-top"><h2 class="fell">Klassenbaum</h2>${head}${ui.note ? `<p class="tal-note">${esc(ui.note)}</p>` : ''}${tabs}</div>
    <div class="ct-body">${body}</div>${foot}</div>`;
}
