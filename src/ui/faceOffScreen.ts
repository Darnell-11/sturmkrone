// Phase 4.7D.1 – Stufe A: Oberfläche des VS-Face-Offs über der 3D-Bühne (`world/faceOffStage.ts`). Ein pulsierender, gezackter Energie- und
// Blitz-Riss teilt den Bildschirm diagonal, in der Mitte das „VS“-Emblem mit sprühenden Funken, an den Rekruten Anime-Aura-Wellen. Links die
// Marine mit Schloss („Marine-Pfad — Kommt in einem späteren Story-Update“, Klick zeigt nur eine Info-Meldung), rechts die spielbaren Piraten.
// Reines CSS/SVG (kein Shader, keine Speicheranforderung je Bild: alles läuft über CSS-Animationen).
import { FACE_OFF_SIDES, type FaceOffSide } from '../data/creationFlow';
import { esc } from './dom';

export interface FaceOffOptions {
  /** Klick auf eine Seite; liefert die Meldung einer gesperrten Seite oder startet den Zoom */
  onPick: (side: FaceOffSide) => { ok: boolean; message: string };
  onHover: (side: FaceOffSide | null) => void;
  onBack: () => void;
}

/** Zacken des Risses (Anteile der Bildschirmbreite/-höhe, von oben nach unten) – drei Varianten flackern gegeneinander */
const RIFT_PATHS = [
  'M57 -2 L53 9 L58 17 L51 28 L56 37 L49 49 L54 58 L46 69 L51 78 L44 89 L47 102',
  'M58 -2 L52 8 L57 18 L52 27 L55 38 L48 48 L55 57 L47 70 L50 79 L45 88 L46 102',
  'M56 -2 L54 10 L59 16 L50 29 L57 36 L50 50 L53 59 L45 68 L52 77 L43 90 L48 102',
];
/** Lage des Risses an einer Höhe y (0 … 100): x in % – für die schräge Trennung der Klickflächen */
export const riftX = (y: number) => 57 - (y / 100) * 11;

export class FaceOffScreen {
  readonly root: HTMLElement;
  private msgT = 0;
  private picked = false;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); this.o.onBack(); }
    else if (e.key === 'Enter') { e.preventDefault(); this.pick('pirat'); }
  };

  constructor(parent: HTMLElement, private o: FaceOffOptions) {
    const M = FACE_OFF_SIDES.marine, P = FACE_OFF_SIDES.pirat;
    this.root = document.createElement('div');
    this.root.className = 'faceoff';
    this.root.style.setProperty('--fo-m', M.aura);
    this.root.style.setProperty('--fo-m2', M.accent);
    this.root.style.setProperty('--fo-p', P.aura);
    this.root.style.setProperty('--fo-p2', P.accent);
    const sparks = Array.from({ length: 14 }, (_, i) => `<i style="--a:${(i * 360) / 14}deg;--d:${(i % 5) * 0.17}s;--r:${70 + (i % 3) * 26}px"></i>`).join('');
    const lines = Array.from({ length: 28 }, (_, i) => `<i style="--a:${(i * 360) / 28}deg;--d:${(i % 7) * 0.05}s"></i>`).join('');
    this.root.innerHTML = `
      <div class="fo-tint fo-tint-m"></div><div class="fo-tint fo-tint-p"></div>
      <div class="fo-wave fo-wave-m"><i></i><i></i><i></i></div><div class="fo-wave fo-wave-p"><i></i><i></i><i></i></div>
      <svg class="fo-rift" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="fo-rg" x1="0" x2="1"><stop offset="0" stop-color="${M.aura}"/><stop offset="0.5" stop-color="#ffffff"/><stop offset="1" stop-color="${P.aura}"/></linearGradient></defs>
        ${RIFT_PATHS.map((d, i) => `<path class="glow g${i}" d="${d}"/><path class="core c${i}" d="${d}"/>`).join('')}
      </svg>
      <button class="fo-side fo-m" data-side="marine" aria-label="Marine – gesperrt: ${esc(M.lockText)}">
        <span class="fo-head"><b>${esc(M.title)}</b><small>${esc(M.sub)}</small></span>
        <span class="fo-lock" aria-hidden="true"><svg viewBox="0 0 48 56"><path d="M12 24 V16 a12 12 0 0 1 24 0 V24" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><rect x="6" y="24" width="36" height="28" rx="6" fill="currentColor"/><circle cx="24" cy="36" r="4" fill="#0b1018"/><rect x="22" y="38" width="4" height="8" rx="2" fill="#0b1018"/></svg></span>
        <span class="fo-locktext">${esc(M.lockText)}</span>
      </button>
      <button class="fo-side fo-p" data-side="pirat" aria-label="${esc(P.title)} – ${esc(P.cta)}">
        <span class="fo-head"><b>${esc(P.title)}</b><small>${esc(P.sub)}</small></span>
        <span class="fo-cta">${esc(P.cta)} <em>▶</em></span>
      </button>
      <div class="fo-vs" aria-hidden="true"><div class="fo-sparks">${sparks}</div><span class="fo-ring"></span><span class="fo-vs-t">VS</span></div>
      <div class="fo-top"><button class="mini fo-back" data-a="back">◀ Zurück</button><span class="fo-step">Schritt 1 von 3 · Wähle deine Seite</span></div>
      <div class="fo-msg" role="status" aria-live="polite" hidden></div>
      <div class="fo-speed" aria-hidden="true">${lines}</div>
      <div class="fo-flash" aria-hidden="true"></div>
      <div class="fo-veil" aria-hidden="true"><span>Die Lager formieren sich …</span></div>`;
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-a="back"]')) { this.o.onBack(); return; }
      const s = t.closest<HTMLElement>('[data-side]');
      if (s) this.pick(s.dataset.side as FaceOffSide);
    });
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-side]')) {
      el.addEventListener('pointerenter', () => { this.root.dataset.hover = el.dataset.side!; this.o.onHover(el.dataset.side as FaceOffSide); });
      el.addEventListener('pointerleave', () => { delete this.root.dataset.hover; this.o.onHover(null); });
    }
    addEventListener('keydown', this.onKey);
  }

  /** Alle Figuren stehen: die Eröffnungsblende hebt sich, das VS-Emblem schlägt ein (die Figuren entstehen unter der Blende – ihr Aufbau
   *  kostet je Figur ein Bild, das soll man nicht als Ruckeln sehen) */
  reveal() {
    if (this.root.classList.contains('in')) return;
    this.root.classList.add('in');
  }
  get revealed(): boolean { return this.root.classList.contains('in'); }

  private pick(side: FaceOffSide) {
    if (this.picked || !this.revealed) return;
    const r = this.o.onPick(side);
    if (!r.ok) { this.message(r.message); return; }
    this.picked = true;
    this.msgT = 0;
    this.root.querySelector<HTMLElement>('.fo-msg')!.hidden = true;
    this.root.classList.add('zoom', side === 'pirat' ? 'zoom-p' : 'zoom-m');
  }

  /** kurze Info-Meldung (gesperrte Seite) */
  message(text: string) {
    const m = this.root.querySelector<HTMLElement>('.fo-msg')!;
    m.innerHTML = `<b>🔒 Noch versiegelt</b><span>${esc(text)}</span>`;
    m.hidden = false;
    m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop');
    this.root.querySelector('.fo-m')?.classList.remove('shake');
    void (this.root.querySelector('.fo-m') as HTMLElement | null)?.offsetWidth;
    this.root.querySelector('.fo-m')?.classList.add('shake');
    this.msgT = 3.2;
  }

  /** je Bild (Echtzeit): Meldung ausblenden */
  update(dt: number) {
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.root.querySelector<HTMLElement>('.fo-msg')!.hidden = true; }
  }

  /** Weißblende am Ende des Zooms (0 … 1) */
  flash(k: number) { this.root.style.setProperty('--fo-flash', k.toFixed(3)); }

  dispose() {
    removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
