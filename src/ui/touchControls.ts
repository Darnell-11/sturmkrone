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
    moveZone.addEventListener('pointerup', endStick);
    moveZone.addEventListener('pointercancel', endStick);

    const lookZone = this.root.querySelector<HTMLElement>('.touch-look')!;
    lookZone.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      lookZone.setPointerCapture(e.pointerId);
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      this.input.addLook(e.clientX - this.lookLast.x, e.clientY - this.lookLast.y);
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e: PointerEvent) => { if (e.pointerId === this.lookId) this.lookId = null; };
    lookZone.addEventListener('pointerup', endLook);
    lookZone.addEventListener('pointercancel', endLook);
  }

  setLayout(defs: TouchButtonDef[]) {
    this.buttonsEl.textContent = '';
    for (const def of defs) {
      const b = document.createElement('button');
      b.className = `touch-btn c-${def.color}`;
      b.style.width = b.style.height = def.size + 'px';
      b.style.right = `calc(${def.right}px + env(safe-area-inset-right, 0px))`;
      b.style.bottom = `calc(${def.bottom}px + env(safe-area-inset-bottom, 0px))`;
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
