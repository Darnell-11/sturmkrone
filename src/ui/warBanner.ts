import { esc } from './dom';

/** Eine Seite im Schlacht-Banner */
export interface WarHudSide {
  name: string;
  color: string;
  /** „Angreifer“, „Verteidiger“ oder leer (Seeschlacht) */
  role: string;
  /** Zeile unter dem Namen, z. B. „6 Kriegsschiffe · 2 Transporter“ oder „Garnison 52“ */
  line: string;
}

/** Inhalt des Taktik-Banners (4.5B): Großschlacht oder Belagerung in Reichweite */
export interface WarHudView {
  kind: 'schlacht' | 'belagerung';
  title: string;
  /** Uhr: Restzeit der Belagerung („≈ 7:20“), „ruht“, „läuft zurück“ oder Restzeit der Schlacht */
  clock: string;
  a: WarHudSide;
  b: WarHudSide;
  /** Fortschritt der Belagerung 0 … 1 (null: Seeschlacht) */
  progress: number | null;
  /** Nachschub-Moral der Belagerer bzw. beider Armadas (0 … 1) */
  morale: { label: string; value: number; color: string }[];
  /** Kontrollpunkte: Name, Lage −1 … 1, Text */
  points: { name: string; hold: number; label: string }[];
  /** Seite des Spielers an dieser Belagerung */
  side: 'angreifer' | 'verteidiger' | null;
  /** Landkampf in der Nähe, noch keine Partei ergriffen: Knöpfe zeigen */
  canJoin: boolean;
  /** Kriegspunkte des Spielers bei der Macht, für die er kämpft */
  kp: number;
}

const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)} %`;

/**
 * Taktik-Banner oben in der Mitte (Zone `tc`, unter dem Kompass): erscheint in Reichweite einer Großschlacht oder Belagerung. Beide Mächte mit
 * Kriegsschiffen bzw. Garnison, Nachschub-Moral, Belagerungsfortschritt mit Uhr und die Kontrollpunkte an Land; steht der Spieler an Land und hat noch
 * keine Partei ergriffen, wählt er hier seine Seite. Neu gezeichnet wird nur, wenn sich der Text ändert.
 */
export class WarBanner {
  readonly el: HTMLElement;
  private last = '';
  /** Partei ergreifen (setzt das Spiel) */
  onJoin: (side: 'angreifer' | 'verteidiger') => void = () => {};

  constructor(parent: HTMLElement) {
    this.el = document.createElement('aside');
    this.el.className = 'hud-war panel';
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button[data-side]') as HTMLButtonElement | null;
      if (!b) return;
      e.stopPropagation();
      this.onJoin(b.dataset.side === 'angreifer' ? 'angreifer' : 'verteidiger');
    });
  }

  update(v: WarHudView | null) {
    if (!v) { if (!this.el.hidden) { this.el.hidden = true; this.last = ''; } return; }
    const side = (s: WarHudSide, cls: string) => `<div class="wb-side ${cls}" style="--c:${s.color}"><b>${esc(s.name)}</b><span>${s.role ? `${esc(s.role)} · ` : ''}${esc(s.line)}</span></div>`;
    const bar = (label: string, value: number, color: string) => `<div class="wb-bar"><span>${esc(label)}</span><i style="--p:${Math.max(0, Math.min(1, value)).toFixed(3)};--c:${color}"></i><b>${pct(value)}</b></div>`;
    const points = v.points.length
      ? `<div class="wb-points">${v.points.map((p) => `<span class="wb-pt ${p.hold >= 0.999 ? 'att' : p.hold <= -0.999 ? 'def' : 'mid'}" style="--h:${((p.hold + 1) / 2).toFixed(3)}"><i></i>${esc(p.name)} <em>${esc(p.label)}</em></span>`).join('')}</div>`
      : '';
    const you = v.side
      ? `<div class="wb-you">Du kämpfst für die ${v.side === 'angreifer' ? 'Angreifer' : 'Verteidiger'} (${esc(v.side === 'angreifer' ? v.a.name : v.b.name)})${v.kp > 0 ? ` · ${v.kp} Kriegspunkte` : ''}</div>`
      : v.canJoin
        ? `<div class="wb-join"><button class="mini brass" data-side="angreifer">Für ${esc(v.a.name)} kämpfen</button><button class="mini brass" data-side="verteidiger">Für ${esc(v.b.name)} kämpfen</button></div>`
        : '';
    const html = `<div class="wb-head"><b>${v.kind === 'belagerung' ? '⚑' : '⚔'} ${esc(v.title)}</b><span class="wb-clock">${esc(v.clock)}</span></div>
      <div class="wb-sides">${side(v.a, 'a')}<em class="wb-vs">gegen</em>${side(v.b, 'b')}</div>
      ${v.progress !== null ? bar('Belagerung', v.progress, v.a.color) : ''}${v.morale.map((m) => bar(m.label, m.value, m.color)).join('')}
      ${points}${you}`;
    if (html === this.last) return;
    this.last = html;
    this.el.innerHTML = html;
    this.el.hidden = false;
  }
}
