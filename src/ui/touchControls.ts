import type { Input } from '../core/input/input';
import type { TouchButtonDef } from '../data/touchLayout';

const STICK_RADIUS = 56;

/** Virtueller Joystick (linke Bildschirmhälfte), Kamera-Ziehen (rechts) und Aktions-Buttons. */
export class TouchControls {
  readonly root: HTMLElement;
  private buttonsEl: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  /** 4.6J: Beginn des Fingers auf der Lauf-Fläche (Zeit, weiteste Auslenkung) – ein kurzer Tipp ohne Ziehen wählt ein Ziel */
  private stickStart = { t: 0, max: 0 };
  /** 4.6J: Beginn des Fingers auf der Kamera-Fläche (Ort, Zeit, Weg) – ein kurzer Tipp ohne Wischen wählt ein Ziel */
  private lookStart = { x: 0, y: 0, t: 0, path: 0 };
  private layout: TouchButtonDef[] = [];
  /** Größe der Knöpfe und Abstände (Einstellung „HUD-Größe“) */
  private scale = 1;
  /** Höhenfaktor, mit dem die Knöpfe zuletzt aufgebaut wurden (siehe heightFit) */
  private fitShown = 1;

  constructor(parent: HTMLElement, private input: Input) {
    this.root = document.createElement('div');
    this.root.className = 'touch';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="touch-zone touch-move"></div>
      <div class="touch-zone touch-look"></div>
      <div class="touch-stick" hidden><i></i></div>
      <div class="touch-buttons"></div>`;
    parent.appendChild(this.root);
    this.base = this.root.querySelector('.touch-stick')!;
    this.knob = this.base.querySelector('i')!;
    this.buttonsEl = this.root.querySelector('.touch-buttons')!;

    const moveZone = this.root.querySelector<HTMLElement>('.touch-move')!;
    moveZone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      moveZone.setPointerCapture(e.pointerId);
      this.stickId = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      this.stickStart.t = performance.now(); this.stickStart.max = 0;
      this.base.hidden = false;
      this.base.style.left = e.clientX + 'px';
      this.base.style.top = e.clientY + 'px';
      this.knob.style.transform = '';
      this.input.setTouchStick(0, 0);
    });
    moveZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      let dx = e.clientX - this.origin.x;
      let dy = e.clientY - this.origin.y;
      const d = Math.hypot(dx, dy);
      if (d > this.stickStart.max) this.stickStart.max = d;
      if (d > STICK_RADIUS) { dx = (dx / d) * STICK_RADIUS; dy = (dy / d) * STICK_RADIUS; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.setTouchStick(dx / STICK_RADIUS, -dy / STICK_RADIUS);
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.base.hidden = true;
      this.input.setTouchStick(0, 0);
    };
    moveZone.addEventListener('pointerup', (e) => {
      // 4.6J: ein kurzer Tipp ohne Ziehen wählt auch auf der Lauf-Fläche ein Ziel (die linke Bildhälfte gehört sonst ganz dem Stick)
      if (e.pointerId === this.stickId && this.stickStart.max < 14 && performance.now() - this.stickStart.t < 300) this.input.tap(e.clientX, e.clientY);
      endStick(e);
    });
    moveZone.addEventListener('pointercancel', endStick);

    const lookZone = this.root.querySelector<HTMLElement>('.touch-look')!;
    lookZone.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      lookZone.setPointerCapture(e.pointerId);
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
      const st = this.lookStart;
      st.x = e.clientX; st.y = e.clientY; st.t = performance.now(); st.path = 0;
    });
    lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      this.lookStart.path += Math.hypot(e.clientX - this.lookLast.x, e.clientY - this.lookLast.y);
      this.input.addLook(e.clientX - this.lookLast.x, e.clientY - this.lookLast.y);
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e: PointerEvent) => { if (e.pointerId === this.lookId) this.lookId = null; };
    lookZone.addEventListener('pointerup', (e) => {
      // 4.6J: kurzer Tipp (unter 0,3 s, kaum bewegt) auf die Welt = Ziel antippen
      const st = this.lookStart;
      if (e.pointerId === this.lookId && st.path < 14 && performance.now() - st.t < 300) this.input.tap(e.clientX, e.clientY);
      endLook(e);
    });
    lookZone.addEventListener('pointercancel', endLook);
    // Drehen des Geräts oder neue Fenstergröße: Knöpfe passend neu aufbauen
    addEventListener('resize', () => { if (this.layout.length && this.heightFit() !== this.fitShown) this.setLayout(this.layout); });
  }

  /** Knöpfe und Abstände skalieren (0,8 … 1,4) und neu aufbauen */
  setScale(scale: number) {
    if (scale === this.scale) return;
    this.scale = scale;
    if (this.layout.length) this.setLayout(this.layout);
  }

  /**
   * Knöpfe schrumpfen auf niedrigen Bildschirmen (Handy quer, rund 390 px hoch): sonst reicht die Knopfgruppe bis unter die Minikarte
   * und die Auftragstafel. Ab 700 px Höhe voll groß, mindestens 80 % (der kleinste Knopf bleibt über 36 px: noch gut mit dem Daumen zu treffen).
   */
  private heightFit(): number {
    return Math.min(1, Math.max(0.8, (innerHeight - 110) / 590));
  }

  setLayout(defs: TouchButtonDef[]) {
    this.layout = defs;
    this.fitShown = this.heightFit();
    const k = this.scale * this.fitShown;
    this.buttonsEl.textContent = '';
    for (const def of defs) {
      const b = document.createElement('button');
      b.className = `touch-btn c-${def.color}`;
      b.dataset.action = def.action;
      b.style.width = b.style.height = Math.round(def.size * k) + 'px';
      b.style.right = `calc(${Math.round(def.right * k)}px + env(safe-area-inset-right, 0px))`;
      b.style.bottom = `calc(${Math.round(def.bottom * k)}px + env(safe-area-inset-bottom, 0px))`;
      b.setAttribute('aria-label', def.label.replace('\n', ''));
      const span = document.createElement('span');
      span.innerText = def.label;
      b.appendChild(span);
      let active = false;
      const release = () => {
        if (!active) return;
        active = false;
        b.classList.remove('on');
        this.input.setVirtual(def.action, false);
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        if (active) return;
        active = true;
        b.classList.add('on');
        this.input.setVirtual(def.action, true);
      });
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      b.addEventListener('lostpointercapture', release);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      this.buttonsEl.appendChild(b);
    }
  }

  /** Beschriftung, Farbe und Abklingzeit eines Buttons aktualisieren (Fähigkeiten) */
  setButton(action: string, label: string, frac: number, ready: boolean, color: string, dim = false, empty = false) {
    const b = this.buttonsEl.querySelector<HTMLElement>(`[data-action="${action}"]`);
    if (!b) return;
    // leere Plätze („Leer“) machten den Bildschirm am Handy voll, ohne etwas zu bringen
    if (b.hidden !== empty) b.hidden = empty;
    b.classList.toggle('dim', dim);
    const span = b.querySelector('span')!;
    if (span.textContent !== label) span.textContent = label;
    b.style.setProperty('--p', frac.toFixed(3));
    b.style.setProperty('--c', color);
    b.classList.toggle('cd', frac < 1);
    b.classList.toggle('rdy', ready);
  }

  /** Knopf einer Kampfkunst (4.6A): großes Symbol, Kurzname darunter, Abklingzeit als Kreisausschnitt (`frac` 1 = bereit) */
  setArt(action: string, icon: string, name: string, frac: number, ready: boolean, color: string) {
    const b = this.buttonsEl.querySelector<HTMLElement>(`[data-action="${action}"]`);
    if (!b) return;
    const span = b.querySelector('span')!;
    const key = `${icon}|${name}`;
    if (span.dataset.k !== key) {
      span.dataset.k = key;
      span.textContent = '';
      const i = document.createElement('i'); i.className = 'art-ic'; i.textContent = icon;
      const n = document.createElement('small'); n.className = 'art-nm'; n.textContent = name;
      span.append(i, n);
    }
    const p = frac.toFixed(2);
    if (b.dataset.p !== p) { b.dataset.p = p; b.style.setProperty('--p', p); }
    if (b.style.getPropertyValue('--c') !== color) b.style.setProperty('--c', color);
    b.classList.toggle('cd', frac < 1);
    b.classList.toggle('rdy', ready);
  }

  /** 4.6H: Knopf eines Offiziers-Kombo-Assists: Symbol, Kurzname, Abklingzeit (Kreisausschnitt); ohne Offizier im Landtrupp ausgeblendet */
  setAssist(action: string, v: { icon: string; short: string; cd: number; ready: boolean; color: string } | null) {
    const b = this.buttonsEl.querySelector<HTMLElement>(`[data-action="${action}"]`);
    if (!b) return;
    if (b.hidden !== !v) b.hidden = !v;
    if (!v) return;
    this.setArt(action, v.icon, v.short, 1 - Math.max(0, Math.min(1, v.cd)), v.ready, v.color);
  }

  /** Feuerknopf hervorheben, solange ein Gegner im Fächer liegt (wie in 1.0) */
  setHot(action: string, on: boolean) {
    const b = this.buttonsEl.querySelector<HTMLElement>(`[data-action="${action}"]`);
    if (b && b.classList.contains('aim') !== on) b.classList.toggle('aim', on);
  }

  setVisible(v: boolean) {
    if (this.root.hidden === !v) return;
    this.root.hidden = !v;
    if (!v) {
      this.stickId = this.lookId = null;
      this.base.hidden = true;
      this.input.setTouchStick(0, 0);
    }
  }
}
