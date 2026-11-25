// Phase 4.6F: Lebendigkeit des Körpers als reine Rechnung (ohne three.js, ohne Speicher je Schritt). Liefert je Schritt Winkel und Wege,
// die das Rig (characterRig.ts) auf die Knochen legt: Atem (Brustkorb hebt und senkt sich, nach Anstrengung schneller und tiefer),
// Gewichtsverlagerung im Stand mit Gegenbewegung des Oberkörpers, kleine Arm- und Kopfbewegungen, weiches Nachführen des Blicks
// (Kopf, Hals, Brust, die Augen eilen voraus), Kurvenneigen beim Sprinten, federndes In-die-Knie-Gehen nach Sprüngen und Stürzen,
// Kampf-Bereitschaft und die Haltung (Wache aufrecht, Fischer gebeugt, Endboss breitbeinig).
import { BLINK, LIFE, STANCES, type StanceId } from '../../../data/characterRig';

export interface LifeInput {
  /** Lauftempo (m/s), Drehtempo (rad/s, + = links), Beschleunigung (m/s²) */
  speed: number;
  turn: number;
  accel: number;
  grounded: boolean;
  /** Ein Clip mit eigener Ganzkörperbewegung läuft (Angriff, Treffer, Ausweichen): Schichten treten zurück */
  busy: boolean;
  /** Blickziel relativ zur Blickrichtung des Körpers (rad, + = links bzw. oben); hasLook = false: geradeaus */
  hasLook: boolean;
  lookYaw: number;
  lookPitch: number;
  /** Kampf-Bereitschaft 0 … 1 */
  ready: number;
}

export interface LifeOutput {
  chestLift: number; chestPitch: number; shoulderLift: number;
  hipX: number; hipRoll: number; counterRoll: number;
  armL: number; armR: number; headYaw: number; headPitch: number;
  lookYaw: number; lookPitch: number; eyeYaw: number; eyePitch: number;
  bankRoll: number; bankPitch: number;
  landDip: number; landLean: number;
  crouch: number; chestFwd: number; guard: number; chin: number; shoulders: number;
  /** Blicksprung im letzten Schritt (Anlass zum Blinzeln) */
  saccade: boolean;
  /** Anteil der Ruhe-Schichten (0 = in Bewegung/Aktion, 1 = steht still) */
  idleK: number;
}

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** Kritisch gedämpfte Feder (Wert, Tempo) auf ein Ziel zu */
function spring(s: { x: number; v: number }, target: number, w: number, dt: number) {
  const a = w * w * (target - s.x) - 2 * w * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}

export class BodyLife {
  readonly out: LifeOutput = {
    chestLift: 0, chestPitch: 0, shoulderLift: 0, hipX: 0, hipRoll: 0, counterRoll: 0, armL: 0, armR: 0, headYaw: 0, headPitch: 0,
    lookYaw: 0, lookPitch: 0, eyeYaw: 0, eyePitch: 0, bankRoll: 0, bankPitch: 0, landDip: 0, landLean: 0, crouch: 0, chestFwd: 0, guard: 0, chin: 0, shoulders: 0,
    saccade: false, idleK: 0,
  };
  /** Anstrengung 0 … 1 (Sprint, Kampf): schnellerer, tieferer Atem */
  exert = 0;
  /** Atemtempo-Faktor (schwere Endbosse < 1) und Ausschlag der Gewichtsverlagerung */
  breathK = 1;
  stance: StanceId = 'frei';
  private t = 0;
  private breathPh: number;
  private swayPh: number;
  private swayPeriod: number;
  private readonly ph: number[];
  private yaw = { x: 0, v: 0 };
  private pitch = { x: 0, v: 0 };
  private eyeY = { x: 0, v: 0 };
  private eyeP = { x: 0, v: 0 };
  private lastWantYaw = 0;
  private lastWantPitch = 0;
  private dip = { x: 0, v: 0 };
  private idle = 0;
  private readyK = 0;
  private roll = 0;
  private pitchB = 0;
  private st = { chest: 0, chin: 0, crouch: 0, shoulders: 0, sway: 1 };

  /** seed: eigene Phasen je Figur (nicht alle atmen im Gleichtakt) */
  constructor(seed: number) {
    const r = (k: number) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    this.breathPh = r(1) * TAU;
    this.swayPh = r(2) * TAU;
    this.swayPeriod = LIFE.sway.periodMin + r(3) * (LIFE.sway.periodMax - LIFE.sway.periodMin);
    this.ph = [r(4) * TAU, r(5) * TAU, r(6) * TAU, r(7) * TAU, r(8) * TAU, r(9) * TAU];
  }

  /** Aufprall nach Sprung oder Sturz (m/s nach unten): Hüfte federt ein */
  land(impact: number) {
    const L = LIFE.land;
    const want = Math.min(L.max, Math.max(0, impact) * L.perMps);
    if (want < 0.01) return;
    // Starttempo so, dass der tiefste Punkt etwa `want` erreicht (gedämpfte Feder, ω = √k)
    this.dip.v = Math.min(this.dip.v, -want * Math.sqrt(L.stiffness) * 1.75);
    this.exert = Math.min(1, this.exert + want * 1.5);
  }

  /** Anstrengung hinzufügen (Schlag, Ausweichen, Sprint-Spitze) */
  addExert(k: number) { this.exert = clamp(this.exert + k, 0, 1); }

  update(dt: number, inp: LifeInput): LifeOutput {
    const o = this.out;
    if (!(dt > 0)) return o;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const B = LIFE.breath, S = LIFE.sway, M = LIFE.micro, LK = LIFE.look, BK = LIFE.bank, LD = LIFE.land, RD = LIFE.ready;
    const stance = STANCES[this.stance] ?? STANCES.frei;
    // Ruhe: steht, am Boden, kein Clip mit eigener Bewegung
    const still = inp.grounded && !inp.busy && inp.speed < 0.35 ? 1 : 0;
    this.idle += (still - this.idle) * ease(still ? 2.2 : 7, dt);
    const idle = this.idle;
    o.idleK = idle;
    // Anstrengung: Sprinten baut sie auf, sonst klingt sie ab
    this.exert = clamp(this.exert + (inp.speed > 4.5 ? 0.11 : 0) * dt - B.exertDecay * dt * (inp.speed > 4.5 ? 0 : 1), 0, 1);
    // Atem: schneller Einatmen als Ausatmen (verzerrte Welle), tiefer nach Anstrengung
    const rate = (B.rate + (B.rateExert - B.rate) * this.exert) * this.breathK;
    this.breathPh = (this.breathPh + TAU * rate * dt) % TAU;
    const b = Math.sin(this.breathPh + 0.32 * Math.sin(this.breathPh));
    const amp = (1 + (B.exertAmp - 1) * this.exert) * (0.55 + 0.45 * idle) * (inp.busy ? 0.6 : 1);
    o.chestLift = B.lift * b * amp;
    o.chestPitch = -B.pitch * b * amp;
    o.shoulderLift = B.shoulder * (b * 0.5 + 0.5) * amp;
    // Haltung (Stil der Figur) weich nachführen; im Lauf zur Hälfte
    const sk = ease(3, dt), sw = 0.5 + 0.5 * idle;
    this.st.chest += (stance.chest * sw - this.st.chest) * sk;
    this.st.chin += (stance.chin * sw - this.st.chin) * sk;
    this.st.crouch += (stance.crouch * idle - this.st.crouch) * sk;
    this.st.shoulders += (stance.shoulders * sw - this.st.shoulders) * sk;
    this.st.sway += (stance.sway - this.st.sway) * sk;
    // Gewichtsverlagerung im Stand: Hüfte pendelt langsam, kippt zum Standbein, der Oberkörper gleicht aus
    this.swayPh = (this.swayPh + (TAU / this.swayPeriod) * dt) % TAU;
    const sv = Math.sin(this.swayPh) + 0.25 * Math.sin(this.swayPh * 2.3 + this.ph[0]);
    // Hüfte wandert zum Standbein (+X = links) und hebt sich dort (Becken kippt), der Oberkörper gleicht gegen
    o.hipX = S.hip * sv * idle * this.st.sway;
    o.hipRoll = S.roll * sv * idle * this.st.sway;
    o.counterRoll = -o.hipRoll * S.counter;
    // kleine Bewegungen (zwei Wellen, die sich nie wiederholen)
    const t = this.t;
    o.armL = M.arm * idle * (0.6 * Math.sin(t * 0.71 + this.ph[1]) + 0.4 * Math.sin(t * 1.37 + this.ph[2]));
    o.armR = M.arm * idle * (0.6 * Math.sin(t * 0.67 + this.ph[3]) + 0.4 * Math.sin(t * 1.29 + this.ph[4]));
    o.headYaw = M.head * (0.3 + 0.7 * idle) * Math.sin(t * 0.37 + this.ph[5]);
    o.headPitch = M.head * 0.6 * (0.3 + 0.7 * idle) * Math.sin(t * 0.53 + this.ph[0] * 1.7);
    // Blick: Ziel begrenzen; liegt es weit hinter der Figur, wieder nach vorn
    let wy = 0, wp = 0;
    if (inp.hasLook && Number.isFinite(inp.lookYaw) && Number.isFinite(inp.lookPitch) && Math.abs(inp.lookYaw) < LK.behind) {
      wy = clamp(inp.lookYaw, -LK.yaw, LK.yaw);
      wp = clamp(inp.lookPitch, -LK.pitchDown, LK.pitchUp);
    }
    // in Aktion schaut die Figur eher dorthin, wohin der Clip sie dreht
    const lk = inp.busy ? 0.45 : 1;
    o.saccade = Math.abs(wy - this.lastWantYaw) + Math.abs(wp - this.lastWantPitch) > BLINK.saccade;
    this.lastWantYaw = wy; this.lastWantPitch = wp;
    spring(this.yaw, wy * lk, LK.speed, dt);
    spring(this.pitch, wp * lk, LK.speed, dt);
    o.lookYaw = clamp(this.yaw.x, -LK.yaw, LK.yaw);
    o.lookPitch = clamp(this.pitch.x, -LK.pitchDown, LK.pitchUp);
    // Augen: eilen dem Kopf voraus (Rest bis zum Ziel), schnell, eng begrenzt
    spring(this.eyeY, clamp(wy - o.lookYaw, -LK.eyeYaw, LK.eyeYaw), LK.eyeSpeed, dt);
    spring(this.eyeP, clamp(wp - o.lookPitch, -LK.eyePitch, LK.eyePitch), LK.eyeSpeed, dt);
    o.eyeYaw = clamp(this.eyeY.x, -LK.eyeYaw, LK.eyeYaw);
    o.eyePitch = clamp(this.eyeP.x, -LK.eyePitch, LK.eyePitch);
    // Kurvenneigen (Drehtempo × Lauftempo) und Vorlage im Sprint, geglättet
    const sp = Math.min(inp.speed, BK.speed);
    const wantRoll = inp.grounded ? clamp(inp.turn * sp * BK.k, -BK.max, BK.max) : 0;
    const wantPitch = inp.grounded ? clamp((inp.speed / BK.speed) * BK.run + inp.accel * BK.accel, -0.05, 0.16) : 0;
    this.roll += (wantRoll - this.roll) * ease(7, dt);
    this.pitchB += (wantPitch - this.pitchB) * ease(6, dt);
    o.bankRoll = this.roll;
    o.bankPitch = this.pitchB;
    // Landung: Feder (leicht unterdämpft = federnd)
    const a = -LD.stiffness * this.dip.x - LD.damping * this.dip.v;
    this.dip.v += a * dt;
    this.dip.x += this.dip.v * dt;
    if (this.dip.x > 0.05) { this.dip.x = 0.05; this.dip.v = Math.min(0, this.dip.v); }
    if (this.dip.x < -LD.max) { this.dip.x = -LD.max; this.dip.v = Math.max(0, this.dip.v); }
    o.landDip = this.dip.x;
    o.landLean = -this.dip.x * LD.lean;
    // Bereitschaft
    this.readyK += (clamp(inp.ready, 0, 1) - this.readyK) * ease(RD.speed, dt);
    const rk = this.readyK * (inp.busy ? 0.3 : 1);
    o.crouch = RD.crouch * rk + this.st.crouch;
    // Haltung „Brust heraus“ (positiv) lehnt den Oberkörper zurück, Bereitschaft nach vorn
    o.chestFwd = RD.chest * rk - this.st.chest;
    o.guard = RD.arms * rk * (0.4 + 0.6 * idle);
    o.chin = this.st.chin;
    o.shoulders = this.st.shoulders;
    return o;
  }
}
