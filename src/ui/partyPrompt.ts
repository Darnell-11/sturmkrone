// Phase 4.8A – Gruppeneinladung (Popup oben in der Mitte mit 30-s-Balken, Annehmen / Ablehnen) und Warn-Banner bei Kriegsausbruch in der
// eigenen Gruppe (Schutzfrist mit Restzeit). Beides liegt in der oberen HUD-Mitte und lässt das Spiel weiterlaufen.

export interface InviteView { name: string; level: number; team: string; teamColor: string; total: number }

export class PartyPrompt {
  private readonly inv: HTMLElement;
  private readonly invText: HTMLElement;
  private readonly invBar: HTMLElement;
  private readonly warn: HTMLElement;
  private readonly warnText: HTMLElement;
  private readonly warnTime: HTMLElement;
  onAccept: (() => void) | null = null;
  onDecline: (() => void) | null = null;
  private barK = -1;
  private warnSec = -1;

  constructor(parent: HTMLElement) {
    const inv = document.createElement('section');
    inv.className = 'hud-invite panel';
    inv.hidden = true;
    inv.setAttribute('role', 'alertdialog');
    inv.setAttribute('aria-label', 'Gruppeneinladung');
    inv.innerHTML = '<div class="pi-kicker">Gruppeneinladung</div><div class="pi-text"></div><i class="pi-bar"><s></s></i>'
      + '<div class="pi-btns"><button class="pi-yes" type="button">Annehmen</button><button class="pi-no" type="button">Ablehnen</button></div>';
    parent.appendChild(inv);
    this.inv = inv;
    this.invText = inv.querySelector('.pi-text')!;
    this.invBar = inv.querySelector('.pi-bar s')!;
    inv.querySelector('.pi-yes')!.addEventListener('click', () => this.onAccept?.());
    inv.querySelector('.pi-no')!.addEventListener('click', () => this.onDecline?.());

    const warn = document.createElement('section');
    warn.className = 'hud-partywarn panel';
    warn.hidden = true;
    warn.setAttribute('role', 'alert');
    warn.innerHTML = '<b class="pw-title">Kriegsausbruch in deiner Gruppe!</b><span class="pw-text"></span><span class="pw-time"></span>';
    parent.appendChild(warn);
    this.warn = warn;
    this.warnText = warn.querySelector('.pw-text')!;
    this.warnTime = warn.querySelector('.pw-time')!;
  }

  get inviteShown(): boolean { return !this.inv.hidden; }
  get warnShown(): boolean { return !this.warn.hidden; }

  showInvite(v: InviteView | null) {
    if (!v) { this.inv.hidden = true; return; }
    this.invText.replaceChildren();
    const b = document.createElement('b');
    b.textContent = v.name;
    const team = document.createElement('span');
    team.className = 'pi-team';
    team.style.setProperty('--crest', v.teamColor);
    team.textContent = v.team;
    this.invText.append(b, ` (Stufe ${v.level}) `, team, ' lädt dich in eine Gruppe ein.');
    this.barK = -1;
    this.inv.hidden = false;
  }

  /** Restzeit der Einladung (0 … 1) */
  tickInvite(frac: number) {
    if (this.inv.hidden) return;
    const k = Math.round(Math.max(0, Math.min(1, frac)) * 100) / 100;
    if (k !== this.barK) { this.barK = k; this.invBar.style.transform = `scaleX(${k})`; }
  }

  /** Warn-Banner: Text, Restzeit (s); null = aus */
  showWarn(text: string | null, left = 0, fight = false) {
    if (!text) { this.warn.hidden = true; this.warnSec = -1; return; }
    this.warn.hidden = false;
    if (this.warnText.textContent !== text) this.warnText.textContent = text;
    const sec = Math.ceil(left) + (fight && left <= 0 ? 1000 : 0);
    if (sec !== this.warnSec) {
      this.warnSec = sec;
      this.warnTime.textContent = left > 0 ? `Schutzfrist: ${Math.ceil(left)} s` : fight ? 'Das Gefecht wird noch zu Ende gekämpft …' : 'Die Wege trennen sich …';
    }
  }
}
