import { skillIcon } from './skillIcons';
import type { SkillState } from '../core/save/types';
import { BRANCHES, branchPoints, ELEMENT_COLORS, learnBlock, SK, SKILLS, SYNERGIES, type Branch, type LearnBlock, type SkillDef, SEA_TEXT } from '../data/skills';
import { esc } from './dom';

export interface SkillTreeOptions {
  state: SkillState;
  level: number;
  onLearn: (id: string) => void;
  onSlot: (id: string, slot: number) => void;
  onPreview: (s: SkillDef, level: number) => void;
  onClose: () => void;
}

const BLOCK_TEXT: Record<Exclude<LearnBlock, null>, string> = {
  max: 'Höchste Stufe erreicht',
  points: 'Keine freien Punkte – steig eine Stufe auf',
  branch: 'Mehr Punkte in diesem Zweig nötig',
  level: 'Höhere Spielerstufe nötig',
  needs: 'Erst die verbundene Fähigkeit lernen',
  awaken: 'Erst nach dem Faji-Erwachen dieses Zweigs',
};

/** Grafischer Faji-Baum mit Knoten, Verbindungen und Vorschau. */
export class SkillTree {
  private root: HTMLElement;
  private branch: Branch = 'koerper';
  private sel: string | null = null;

  constructor(parent: HTMLElement, private o: SkillTreeOptions) {
    this.root = document.createElement('div');
    this.root.className = 'editor skilltree';
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => this.onClick(e));
    const first = SKILLS.find((s) => s.b === this.branch && s.t === 1);
    this.sel = first?.id ?? null;
    this.render();
    if (first) this.preview(first);
  }

  private preview(s: SkillDef) {
    if (s.act) this.o.onPreview(s, this.o.state.learned[s.id] ?? 1);
  }

  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!el) return;
    const v = el.dataset.v ?? '';
    switch (el.dataset.a) {
      case 'branch': this.branch = v as Branch; this.sel = SKILLS.find((s) => s.b === this.branch)?.id ?? null; break;
      case 'node': this.sel = v; this.preview(SK[v]); break;
      case 'learn': this.o.onLearn(v); this.preview(SK[v]); break;
      case 'slot': { const [id, i] = v.split('|'); this.o.onSlot(id, +i); break; }
      case 'play': this.preview(SK[v]); return;
      case 'close': this.o.onClose(); return;
      default: return;
    }
    this.render();
  }

  refresh() { this.render(); }

  private render() {
    const st = this.o.state;
    const b = this.branch;
    const info = BRANCHES[b];
    const list = SKILLS.filter((s) => s.b === b);
    const pts = branchPoints(st.learned, b);
    const rows = Math.max(...list.map((s) => s.t));
    const rowH = 100 / rows;
    const lines = list.flatMap((s) => (s.needs ?? []).map((n) => {
      const a = SK[n];
      if (!a || a.b !== b) return '';
      const on = (st.learned[n] ?? 0) > 0;
      return `<line x1="${(a.x + 0.5) * 20}" y1="${(a.t - 0.5) * rowH}" x2="${(s.x + 0.5) * 20}" y2="${(s.t - 0.5) * rowH}" class="${on ? 'on' : ''}" style="--c:${info.col}"/>`;
    })).join('');
    const nodes = list.map((s) => {
      const lv = st.learned[s.id] ?? 0;
      const block = learnBlock(s, st.learned, st.sp, this.o.level, st.awakened as Branch[]);
      const cls = [lv > 0 ? 'have' : '', block === null ? 'can' : '', s.act ? 'act' : 'pas', s.id === this.sel ? 'sel' : '', s.act?.ult ? 'ult' : '', s.awaken ? 'awk' : ''].join(' ');
      const col = s.act ? ELEMENT_COLORS[s.act.el] : info.col;
      return `<button class="sk-node ${cls}" data-a="node" data-v="${s.id}" style="left:${(s.x + 0.5) * 20}%;top:${(s.t - 0.5) * rowH}%;--c:${col}" aria-label="${esc(s.n)}">
        <span class="sk-ico">${skillIcon(s)}</span>
        <span class="sk-pips">${Array.from({ length: s.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span>
        <span class="sk-name">${esc(s.n)}</span></button>`;
    }).join('');

    const s = this.sel ? SK[this.sel] : null;
    let detail = '';
    if (s) {
      const lv = st.learned[s.id] ?? 0;
      const block = learnBlock(s, st.learned, st.sp, this.o.level, st.awakened as Branch[]);
      const a = s.act;
      const slotIdx = st.slots.indexOf(s.id);
      detail = `<div class="sk-detail">
        <div class="sk-dhead"><b>${esc(s.n)}</b><span>${a ? (a.ult ? 'Ultimate' : 'Aktiv') : 'Passiv'} · Stufe ${lv}/${s.max}</span></div>
        <p>${esc(s.d(Math.max(1, lv)))}${lv > 0 && lv < s.max ? `<br><span class="soft small">Nächste Stufe: ${esc(s.d(lv + 1))}</span>` : ''}</p>
        ${a ? `<p class="soft small">${a.cost} Faji · ${a.cd} s Abklingzeit</p>${a.sea ? `<p class="small sk-sea">⚓ Auf See: ${SEA_TEXT[a.sea]}</p>` : ''}` : ''}
        ${s.req ? `<p class="soft small">Ab ${s.req} Punkten in diesem Zweig${s.lv ? ` · ab Stufe ${s.lv}` : ''}</p>` : s.lv ? `<p class="soft small">Ab Stufe ${s.lv}</p>` : ''}
        <div class="row">
          ${block === null ? `<button class="mini brass" data-a="learn" data-v="${s.id}">${lv ? 'Verbessern' : 'Lernen'} (1 Punkt)</button>` : `<span class="soft small">${BLOCK_TEXT[block]}</span>`}
          ${a ? `<button class="mini" data-a="play" data-v="${s.id}">▶ Vorschau</button>` : ''}
        </div>
        ${a && lv > 0 ? `<div class="row sk-slots">${[0, 1, 2].map((i) => `<button class="mini${slotIdx === i ? ' brass' : ''}" data-a="slot" data-v="${s.id}|${i}">Platz ${i + 1}${st.slots[i] && st.slots[i] !== s.id ? `: ${esc(SK[st.slots[i]!]?.n ?? '')}` : ''}</button>`).join('')}</div>` : ''}
      </div>`;
    }
    const syn = SYNERGIES.map((sy) => {
      const on = sy.needs.every((n) => (st.learned[n] ?? 0) > 0);
      return `<li class="${on ? 'on' : ''}"><b>${esc(sy.n)}</b> <span class="soft small">(${esc(SK[sy.needs[0]].n)} + ${esc(SK[sy.needs[1]].n)})</span><br><span class="small">${esc(sy.d)}</span></li>`;
    }).join('');
    const awakened = st.awakened.includes(b);

    this.root.innerHTML = `
      <div class="editor-stage"><div class="sk-hint soft small">Vorschau</div></div>
      <div class="editor-panel card sk-panel">
        <div class="editor-head"><h2 class="fell">Faji</h2><div class="sk-sp">Freie Punkte <b>${st.sp}</b></div><button class="icon-btn" data-a="close" aria-label="Schließen">✕</button></div>
        <div class="tabs">${(Object.keys(BRANCHES) as Branch[]).map((k) => `<button data-a="branch" data-v="${k}" aria-pressed="${k === b}" style="--c:${BRANCHES[k].col}">${BRANCHES[k].n}<small> ${branchPoints(st.learned, k)}</small></button>`).join('')}</div>
        <div class="editor-body">
          <p class="soft small">${esc(info.d)} ${awakened ? '<b>· Erwacht!</b>' : `· Faji-Erwachen: ab Stufe 15 mit 9 Punkten in diesem Zweig (jetzt ${pts})`}</p>
          <div class="sk-tree" style="height:${rows * 88}px"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>${nodes}</div>
          ${detail}
          <h3>Synergien</h3><ul class="sk-syn">${syn}</ul>
        </div>
      </div>`;
  }

  dispose() { this.root.remove(); }
}
