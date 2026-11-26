// Phase 4.7B – Talent-Fenster (Tasten N und K): NUR der eigene 60-Knoten-Klassenbaum und der Reiter „Geistes-Faji“. Fremde Klassen,
// Klingen, Faust-Pfade und Elemente sind verborgen; einzige Ausnahme: Faji-Wirker ohne Element (und Faustkämpfer ohne Pfad) sehen die
// Wahlkarten ihrer eigenen Klasse – der erste Punkt (bzw. die Wahl) legt sie für immer fest. Reines HTML aus Daten (keine DOM-Abfragen),
// Gestaltung je Klasse über CSS-Variablen (Farbe, Akzent, Rune) und `data-base` (Knotenrahmen: Faust achteckig, Schwert Raute, Faji rund).
import { esc } from './dom';
import { ACTION_STYLES, type ActionSkill } from '../data/actionStyles';
import {
  CLASS_BASES, FORM_NODES, GEIST, GEIST_MAX, SPECS, SPECS_OF, TREE_SIZE, ULT_NODE, classBase, classSpec, classTree,
  type ClassNode, type ClassSave, type SpecId,
} from '../data/classes';
import { FORM_PATTERN_USE } from '../data/classForms';

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
export interface ClassUiState { tab: ClassTab; sel: number; pick: SpecId | null; note: string }
export const newClassUi = (): ClassUiState => ({ tab: 'baum', sel: 1, pick: null, note: '' });

const ROLE_ICON: Record<string, string> = { 'DPS': '⚔', 'Tank-DPS': '⛨', 'Assassinen-DPS': '✝', 'Kombo-DPS': '⟳', 'Midrange-DPS': '➹', 'Elementar-DPS': '✦', 'DPS/Heal': '✚' };

/** Rollen-Plakette („⛨ Tank-DPS“) für Erschaffung, Baum und Zielrahmen */
export const roleBadge = (role: string): string => (role ? `<span class="cls-role">${ROLE_ICON[role] ?? '◆'} ${esc(role)}</span>` : '');

/** Muster einer Form (0 … 5 für die Formen 5 … 10; die Formen 1 – 4 nach ihren eigenen Daten) – für die animierte Vorschau */
function previewKind(sk: ActionSkill): string {
  if (sk.heal) return 'heal';
  if (sk.dashTo > 0) return 'dash';
  if (sk.rise > 0) return 'rise';
  if (sk.counter > 0) return 'counter';
  if (sk.hits.some((h) => h.projectile)) return 'shot';
  if (sk.hits.some((h) => h.shape === 'line')) return 'wave';
  if (sk.hits.length >= 3) return 'spin';
  return 'impact';
}

function fmtS(v: number): string { return `${v.toFixed(v < 10 && v % 1 ? 1 : 0).replace('.', ',')} s`; }

/** Detail einer Form bzw. des Ultimates: Emblem, Rolle, Wirkung, Abklingzeit/Kosten, animierte Vorschau */
function formDetail(v: ClassView, n: ClassNode, learned: boolean): string {
  const sp = SPECS[classSpec(v.cls)!];
  const st = ACTION_STYLES[sp.style];
  if (n.kind === 'ult') {
    const u = st.ultimate;
    return `<div class="cls-detail ult">
      <div class="cls-emblem ult" data-kind="ult"><i>✪</i><s></s><s></s><s></s></div>
      <h4>${esc(u?.label ?? 'Klassen-Ultimate')}</h4>
      <p class="small">${roleBadge(sp.role)} · Knoten ${ULT_NODE} · im Sturm-Erwachen (${esc(v.keys.ult)}) einmal je Erwachen</p>
      <p>Das Ultimate deiner Klasse mit 3-Akt-Kino-Regie: Aufladen in Zeitlupe, Einschlag, Impact-Frames.${u?.heal ? ` Heilt dich und Verbündete in ${u.healR ?? 0} m um ${Math.round(u.heal * 100)} %.` : ''}</p>
      <p class="small soft">Kosten: 1 Punkt · ${learned ? '<b class="ok">gelernt</b>' : 'noch nicht gelernt'}</p></div>`;
  }
  const sk = st.skills[n.form - 1];
  const use = n.form > 4 ? FORM_PATTERN_USE[n.form - 5] : '';
  const kind = previewKind(sk);
  return `<div class="cls-detail">
    <div class="cls-emblem" data-kind="${kind}"><i>${esc(sk.icon)}</i><s></s><s></s><s></s></div>
    <h4>Form ${n.form}: ${esc(sk.label)}</h4>
    <p class="small">${roleBadge(sp.role)} · Taste <kbd>${esc(v.keys.forms[n.form - 1] ?? '')}</kbd> · Knoten ${n.n}</p>
    <p>${esc(n.form > 4 ? sk.desc : `${sk.desc}${use ? ` ${use}` : ''}`)}</p>
    <p class="small soft">Abklingzeit ${fmtS(sk.cd)} · Kosten: 1 Punkt${sk.hyper ? ' · Hyper-Armor' : ''}${sk.airOk ? ' · auch in der Luft' : ''} · ${learned ? '<b class="ok">frei</b>' : 'noch gesperrt'}</p></div>`;
}

function nodeDetail(v: ClassView, n: ClassNode): string {
  const learned = v.cls.nodes >= n.n;
  if (n.kind !== 'buff') return formDetail(v, n, learned);
  return `<div class="cls-detail">
    <div class="cls-emblem buff" data-kind="buff"><i>${esc(n.icon)}</i><s></s></div>
    <h4>${esc(n.label)}</h4>
    <p class="small soft">Knoten ${n.n} · Stärkung · Kosten: 1 Punkt · ${learned ? '<b class="ok">gelernt</b>' : 'noch nicht gelernt'}</p></div>`;
}

/** Der Pfad aus 60 Knoten (Schlangenlinie, 10 je Reihe) mit leuchtenden Verbindungen */
function treeHtml(v: ClassView, ui: ClassUiState): string {
  const sp = classSpec(v.cls)!;
  const tree = classTree(sp);
  const rows: string[] = [];
  for (let r = 0; r < TREE_SIZE / 10; r++) {
    const cells = tree.slice(r * 10, r * 10 + 10);
    if (r % 2) cells.reverse();
    rows.push(`<div class="cls-row${r % 2 ? ' rev' : ''}">${cells.map((n) => {
      const st = v.cls.nodes >= n.n ? 'on' : n.n === v.cls.nodes + 1 ? 'next' : 'off';
      return `<button class="cls-node ${n.kind} ${st}${ui.sel === n.n ? ' sel' : ''}" data-a="sel" data-id="${n.n}" title="${esc(`${n.n}: ${n.label}`)}"><i>${esc(n.icon)}</i>${n.kind === 'form' ? `<em>${n.form}</em>` : n.kind === 'ult' ? '<em>60</em>' : ''}</button>`;
    }).join('')}</div>`);
  }
  return `<div class="cls-tree">${rows.join('')}</div>`;
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
      <p class="small soft">Form 1: ${esc(st.skills[0].label)} · Ultimate: ${esc(st.ultimate?.label ?? '')}</p>
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

/** Das ganze Fenster */
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
  if (ui.tab === 'geist') body = geistHtml(v);
  else if (!sp) body = choiceHtml(v, ui);
  else {
    const tree = classTree(sp.id);
    const sel = tree[Math.max(0, Math.min(TREE_SIZE - 1, ui.sel - 1))];
    const next = c.nodes < TREE_SIZE ? tree[c.nodes] : null;
    body = `<div class="cls-grid">${treeHtml(v, ui)}<div class="cls-side">${nodeDetail(v, sel)}
      <div class="cls-actions">${next ? `<button class="primary" data-a="learn"${v.free > 0 ? '' : ' disabled'}>Knoten ${next.n} lernen: ${esc(next.label)}</button>
        <button class="mini" data-a="fill"${v.free > 0 ? '' : ' disabled'}>Alle freien Punkte verteilen</button>` : '<p class="ok">Dein Klassenbaum ist vollständig.</p>'}</div></div></div>`;
  }
  return `<div class="cls-screen" data-base="${base.id}" style="--cc:${color};--ca:${accent};--rune:'${esc(sp?.rune ?? '✦')}'">
    <h2 class="fell">Klassenbaum</h2>${head}${ui.note ? `<p class="tal-note">${esc(ui.note)}</p>` : ''}${tabs}${body}
    <button class="primary" data-a="back" data-focus>Zurück</button></div>`;
}
