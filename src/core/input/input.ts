import { ACTION_IDS, DEFAULT_KEYS, DEFAULT_PAD, type ActionId } from '../../data/actions';

export type InputDevice = 'keyboard' | 'touch' | 'gamepad';

const DEADZONE = 0.2;
const MENU_STICK = 0.6;

export interface Vec2 { x: number; y: number }

function deadzone(x: number, y: number): Vec2 {
  const len = Math.hypot(x, y);
  if (len < DEADZONE) return { x: 0, y: 0 };
  const s = Math.min(1, (len - DEADZONE) / (1 - DEADZONE)) / len;
  return { x: x * s, y: y * s };
}

/**
 * Sammelt Tastatur, Maus, Touch und Gamepad und übersetzt alles in Aktionen.
 * Ablauf pro Logikschritt: poll() (jeder Frame) → beginStep() → Abfragen mit down()/pressed()/move().
 */
export class Input {
  lastDevice: InputDevice = 'keyboard';
  padConnected = false;
  /** Nur im Spiel true – dann werden Browser-Standardaktionen (Scrollen mit Leertaste) unterdrückt. */
  gameplayActive = false;
  /** Fängt die nächste Taste ab (für die Tastenbelegung im Menü). */
  captureNext: ((code: string) => void) | null = null;
  /** Kamera vertikal umkehren (Einstellung) */
  invertY = false;

  private keyMap = new Map<string, ActionId[]>();
  private bindings: Record<ActionId, string[]> = { ...DEFAULT_KEYS };
  private held = new Set<string>();
  private virtualHeld = new Map<ActionId, number>();
  private padHeld = new Set<ActionId>();
  private pressCount = new Map<ActionId, number>();
  private pressedNow = new Set<ActionId>();
  private touchStick: Vec2 = { x: 0, y: 0 };
  private padStick: Vec2 = { x: 0, y: 0 };
  private padLook: Vec2 = { x: 0, y: 0 };
  private lookAcc: Vec2 = { x: 0, y: 0 };
  private lookStep: Vec2 = { x: 0, y: 0 };
  private zoomAcc = 0;
  private zoomStep = 0;
  private padPrev: boolean[] = [];
  private stickDir = 0;
  private deviceListeners: ((d: InputDevice) => void)[] = [];
  private padButtonListeners: ((button: number) => void)[] = [];
  private layoutMap: Map<string, string> | null = null;

  constructor(canvas: HTMLElement) {
    if (matchMedia('(pointer: coarse)').matches) this.lastDevice = 'touch';
    this.rebuildKeyMap();
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('blur', () => this.releaseAll());
    canvas.addEventListener('pointerdown', this.onPointerDown);
    addEventListener('pointerup', this.onPointerUp);
    addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.zoomAcc += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    addEventListener('gamepadconnected', () => { this.padConnected = true; });
    addEventListener('gamepaddisconnected', () => { this.padConnected = false; });
    // Tastaturlayout (z. B. QWERTZ) für die Anzeige der Tastennamen
    const kb = (navigator as any).keyboard;
    if (kb?.getLayoutMap) kb.getLayoutMap().then((m: Map<string, string>) => { this.layoutMap = m; }).catch(() => {});
  }

  // ---------- Belegung ----------

  setKeyBindings(overrides: Partial<Record<ActionId, string[]>>) {
    this.bindings = { ...DEFAULT_KEYS };
    for (const a of ACTION_IDS) if (Array.isArray(overrides[a])) this.bindings[a] = overrides[a]!.slice();
    // Esc pausiert immer
    for (const a of ACTION_IDS) this.bindings[a] = this.bindings[a].filter((c) => c !== 'Escape');
    this.bindings.pause = ['Escape', ...this.bindings.pause];
    this.rebuildKeyMap();
  }

  getKeyBindings(): Record<ActionId, string[]> { return this.bindings; }

  private rebuildKeyMap() {
    this.keyMap.clear();
    for (const a of ACTION_IDS) {
      for (const code of this.bindings[a]) {
        const list = this.keyMap.get(code) ?? [];
        list.push(a);
        this.keyMap.set(code, list);
      }
    }
  }

  keyLabel(code: string): string {
    const fixed: Record<string, string> = {
      Space: 'Leertaste', ShiftLeft: 'Umschalt', ShiftRight: 'Umschalt rechts', ControlLeft: 'Strg', ControlRight: 'Strg rechts',
      AltLeft: 'Alt', AltRight: 'Alt Gr', Enter: 'Eingabe', Escape: 'Esc', Tab: 'Tab', Backspace: 'Rück',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
      Mouse0: 'Linke Maustaste', Mouse1: 'Mittlere Maustaste', Mouse2: 'Rechte Maustaste',
    };
    if (fixed[code]) return fixed[code];
    const lm = this.layoutMap?.get(code);
    if (lm) return lm.toUpperCase();
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return code;
  }

  // ---------- Ereignisse ----------

  onDeviceChange(l: (d: InputDevice) => void) { this.deviceListeners.push(l); }
  /** Rohe Gamepad-Tasten (für die Menüsteuerung). Der linke Stick meldet sich als Steuerkreuz (12–15). */
  onPadButton(l: (button: number) => void) { this.padButtonListeners.push(l); }

  private setDevice(d: InputDevice) {
    if (d === this.lastDevice) return;
    this.lastDevice = d;
    for (const l of this.deviceListeners) l(d);
  }

  private press(a: ActionId) { this.pressCount.set(a, (this.pressCount.get(a) ?? 0) + 1); }

  private codeDown(code: string) {
    const acts = this.keyMap.get(code);
    if (!this.held.has(code) && acts) for (const a of acts) this.press(a);
    this.held.add(code);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    // Nur eine echte Tastatur schaltet die Bedienung um – nicht die Zurück-Taste der Android-App, die Esc nachahmt
    if (e.isTrusted) this.setDevice('keyboard');
    if (this.captureNext) {
      e.preventDefault();
      const cb = this.captureNext;
      this.captureNext = null;
      cb(e.code);
      return;
    }
    if (e.repeat) return;
    if (this.gameplayActive && this.keyMap.has(e.code)) e.preventDefault();
    this.codeDown(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => { this.held.delete(e.code); };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return; // Touch übernimmt die Touch-Steuerung
    this.setDevice('keyboard');
    const code = 'Mouse' + e.button;
    if (this.captureNext) {
      const cb = this.captureNext;
      this.captureNext = null;
      cb(code);
      return;
    }
    this.codeDown(code);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') this.held.delete('Mouse' + e.button);
  };

  private onPointerMove = (e: PointerEvent) => {
    // Rechte Maustaste gedrückt halten und ziehen = Kamera drehen
    if (e.pointerType === 'mouse' && (e.buttons & 2) && this.gameplayActive) this.addLook(e.movementX, e.movementY);
  };

  releaseAll() {
    this.held.clear();
    this.virtualHeld.clear();
    this.touchStick = { x: 0, y: 0 };
  }

  // ---------- Touch (von der Touch-Steuerung aufgerufen) ----------

  setVirtual(a: ActionId, down: boolean) {
    this.setDevice('touch');
    const n = this.virtualHeld.get(a) ?? 0;
    if (down) {
      if (n === 0) this.press(a);
      this.virtualHeld.set(a, n + 1);
    } else if (n <= 1) this.virtualHeld.delete(a);
    else this.virtualHeld.set(a, n - 1);
  }

  /** x rechts positiv, y nach oben (vorwärts) positiv, Länge ≤ 1 */
  setTouchStick(x: number, y: number) {
    if (x || y) this.setDevice('touch');
    this.touchStick = { x, y };
  }

  addLook(dx: number, dy: number) {
    this.lookAcc.x += dx;
    this.lookAcc.y += dy;
  }

  // ---------- Gamepad ----------

  /** Jeden Frame aufrufen (auch im Menü). */
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) {
      this.padConnected = false;
      this.padHeld.clear();
      this.padStick = { x: 0, y: 0 };
      this.padLook = { x: 0, y: 0 };
      this.padPrev = [];
      return;
    }
    this.padConnected = true;
    const buttons = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    let active = false;

    for (let i = 0; i < buttons.length; i++) {
      if (buttons[i] && !this.padPrev[i]) {
        active = true;
        for (const l of this.padButtonListeners) l(i);
      }
    }
    for (const a of ACTION_IDS) {
      const idx = DEFAULT_PAD[a];
      const now = idx.some((i) => buttons[i]);
      const before = idx.some((i) => this.padPrev[i]);
      if (now && !before) this.press(a);
      if (now) this.padHeld.add(a); else this.padHeld.delete(a);
    }
    this.padPrev = buttons;

    const l = deadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    const r = deadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
    this.padStick = { x: l.x, y: -l.y };
    this.padLook = r;
    if (l.x || l.y || r.x || r.y) active = true;

    // Linker Stick als Steuerkreuz fürs Menü
    const raw = { x: pad.axes[0] ?? 0, y: pad.axes[1] ?? 0 };
    let dir = 0;
    if (raw.y < -MENU_STICK) dir = 12; else if (raw.y > MENU_STICK) dir = 13;
    else if (raw.x < -MENU_STICK) dir = 14; else if (raw.x > MENU_STICK) dir = 15;
    if (dir && dir !== this.stickDir) for (const cb of this.padButtonListeners) cb(dir);
    this.stickDir = dir;

    if (active) this.setDevice('gamepad');
  }

  // ---------- Abfragen im Logikschritt ----------

  beginStep() {
    this.pressedNow.clear();
    for (const [a, n] of this.pressCount) if (n > 0) this.pressedNow.add(a);
    this.pressCount.clear();
    this.lookStep = this.lookAcc;
    this.lookAcc = { x: 0, y: 0 };
    this.zoomStep = this.zoomAcc;
    this.zoomAcc = 0;
  }

  /** Alle gesammelten Tastendrücke verwerfen (z. B. beim Verlassen des Menüs). */
  flush() {
    this.pressCount.clear();
    this.pressedNow.clear();
    this.lookAcc = { x: 0, y: 0 };
    this.zoomAcc = 0;
  }

  down(a: ActionId): boolean {
    if ((this.virtualHeld.get(a) ?? 0) > 0 || this.padHeld.has(a)) return true;
    for (const code of this.bindings[a]) if (this.held.has(code)) return true;
    return false;
  }

  pressed(a: ActionId): boolean { return this.pressedNow.has(a); }

  /** Bewegungsrichtung: x rechts, y vorwärts, Länge ≤ 1 */
  move(): Vec2 {
    let x = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0) + this.touchStick.x + this.padStick.x;
    let y = (this.down('up') ? 1 : 0) - (this.down('down') ? 1 : 0) + this.touchStick.y + this.padStick.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  /** Kamera: Pixel-Verschiebung seit dem letzten Schritt (Maus/Touch) */
  lookDelta(): Vec2 { return { x: this.lookStep.x, y: this.invertY ? -this.lookStep.y : this.lookStep.y }; }
  /** Kamera: Stick-Auslenkung (Gamepad), −1 … 1 */
  lookAxis(): Vec2 { return { x: this.padLook.x, y: this.invertY ? -this.padLook.y : this.padLook.y }; }
  zoomDelta(): number { return this.zoomStep; }
}
