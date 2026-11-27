// Phase 4.93A – Bühne der Mitspieler-Aktionen (CombatActionBroadcast, Empfänger-Seite). Rein: ohne three.js, ohne DOM, ohne Klang, keine
// Speicheranforderung je Bild – die Plätze sind vorab angelegt. Darauf setzen die Darstellung (`world/remoteActionFx.ts`: Effekte und Klang),
// die Figuren der Mitspieler (`world/mmoLive.ts`: Clip, Kampfpose, Sprung auf die Bugreling) und die Welt (Himmelsverdunkelung, Kamera-Stoß).
//
// **Saubere Trennung:** der Ausführende bekommt seine eigene Kamera-Fahrt und den Vollbild-Impact-Frame (`graphics/endgameDirector.ts`,
// `graphics/ultimateCinematics.ts`). Mitspieler sehen und hören dieselbe Aktion von außen – ihre Kamera bleibt frei; diese Bühne kennt weder
// Kamera noch Impact-Frame noch Hit-Stop. Sie liefert nur
//   - je Mitspieler die laufende Aktion mit Zeitachse, Phase, Clip-Stand und Kampfpose (Kauern, Vorlage, Fäuste, Abheben, Sprung an den Bug),
//   - die Himmelsverdunkelung am Ort des Betrachters (voll bis `darkNear`, aus ab `darkFar`),
//   - den Kamera-Stoß im Treffermoment, spürbar nur näher als `shakeRange` (90 m) und mit der Entfernung abnehmend.
// Die Uhr läuft in ECHTZEIT (die Zeitlupe des Betrachters verzögert fremde Aktionen nicht).
import type { ActNet } from '../net/mmoProtocol';
import { DIRECTOR_POSES, DIRECTOR_TIMELINES, directorActionOfAct, type DirectorActionId, type DirectorPhaseId, type DirectorPose, type DirectorTimeline } from '../graphics/endgameDirector';
import { HELM_SIDE, SWING_CODE, chainStage, formMove, hitMoment, swingMove, ultimateMove } from '../combat/actionBroadcast';

export const REMOTE_ACT = {
  /** Kamera-Stoß: nur näher als so viele Meter; am Rand noch `shakeFloor` der Stärke (spürbar), direkt daneben die volle */
  shakeRange: 90, shakeFloor: 0.22, shakePow: 1.3,
  /** Himmelsverdunkelung: voll bis `darkNear` m, aus ab `darkFar` m */
  darkNear: 80, darkFar: 320,
  /** gleichzeitig dargestellte Aktionen (eine je Mitspieler; darüber hinaus weicht die älteste) */
  slots: 10,
  /** Zeitachsen der Aktionen ohne Kino-Regie (s): Geistes-Faji, Heilung, Ultimate der noch nicht ausgebauten Klassen */
  geist: { t1: 0.12, t2: 0.22, t3: 0.3, total: 0.9 },
  heal: { t1: 0.1, t2: 0.2, t3: 0.28, total: 1.0 },
  ult: { t1: 0.34, t2: 0.74, t3: 0.9, total: 2.4 },
  /** Kamera-Stoß der Aktionen ohne Kino-Regie: Formen `artBase + artStep · Platz`, Geistes-Faji 1 … 4, Ultimate */
  artBase: 0.2, artStep: 0.06, geistShake: [0.25, 0.12, 0.55, 0.9] as readonly number[], ultShake: 1.2,
  /** Verdunkelung der Aktionen ohne Kino-Regie: Ultimate, Formen ab VIII */
  ultDark: 0.5, artDark: 0.2,
} as const;

export type RemoteKind = 'swing' | 'art' | 'geist' | 'heal' | 'ult';
const KINDS: readonly string[] = ['swing', 'art', 'geist', 'heal', 'ult'];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const easeOut = (x: number) => { const k = 1 - clamp01(x); return 1 - k * k * k; };

/**
 * Kamera-Stoß eines fremden Einschlags der Stärke `strength` in `dist` m Entfernung: 0 ab `shakeRange`; darunter mindestens `shakeFloor`
 * der Stärke (man SPÜRT jeden Einschlag im Umkreis), zur Quelle hin bis zur vollen Stärke.
 */
export function remoteShake(dist: number, strength: number): number {
  if (!(strength > 0) || !Number.isFinite(dist) || dist >= REMOTE_ACT.shakeRange) return 0;
  const k = 1 - Math.max(0, dist) / REMOTE_ACT.shakeRange;
  return strength * (REMOTE_ACT.shakeFloor + (1 - REMOTE_ACT.shakeFloor) * Math.pow(k, REMOTE_ACT.shakePow));
}

/** Himmelsverdunkelung einer fremden Aktion (Stärke `darken`) für einen Betrachter in `dist` m Entfernung */
export function remoteDark(dist: number, darken: number): number {
  if (!(darken > 0) || !Number.isFinite(dist)) return 0;
  return darken * (1 - smooth((dist - REMOTE_ACT.darkNear) / (REMOTE_ACT.darkFar - REMOTE_ACT.darkNear)));
}

/** Laufende Aktion eines Mitspielers */
export interface RemoteCast {
  on: boolean;
  /** laufende Nummer (die Figur startet ihren Clip je Nummer einmal) */
  seq: number;
  from: string;
  kind: RemoteKind;
  /** Kennung und Zeitachse der Kino-Endgame-Regie (null = Aktion einer noch nicht ausgebauten Klasse) */
  action: DirectorActionId | null;
  tl: DirectorTimeline | null;
  style: string; el: string; slot: number; n: number;
  /** vom Steuerrad gewirkt: der Kapitän springt auf die Bugreling */
  helm: boolean; sea: boolean;
  /** Clip der Figur: Name, Abschnitt (Anteile des Clips), Dauer des Abschnitts (s) und Vorlauf (s, die Aushol-Pose davor) */
  clip: string; clipFrom: number; clipTo: number; clipDur: number; clipLead: number;
  pose: DirectorPose | null;
  /** Zeit seit dem Start (echte s) und Zeit davor; Phasen-Grenzen und Gesamtdauer */
  t: number; t0: number; t1: number; t2: number; t3: number; total: number;
  phase: DirectorPhaseId;
  /** in diesem Bild: die Kraft löst sich (Beginn von Phase 2) bzw. der Treffermoment (Beginn von Phase 3) */
  releaseNow: boolean; impactNow: boolean;
  impacted: boolean;
  /** Ort und Blickrichtung des Auslösers beim Start, Ziel */
  x: number; y: number; z: number; yaw: number; tx: number; ty: number; tz: number;
  /** Stärke des Kamera-Stoßes und der Himmelsverdunkelung (an der Quelle) */
  shake: number; darken: number;
  /** Pose 0 … 1, Glut der Fäuste 0 … 1, Abheben 0 … 1, Sprung auf die Bugreling 0 … 1 */
  poseK: number; glowK: number; liftK: number; leapK: number;
}

const blank = (): RemoteCast => ({
  on: false, seq: 0, from: '', kind: 'swing', action: null, tl: null, style: '', el: '', slot: 0, n: 0, helm: false, sea: false,
  clip: '', clipFrom: 0, clipTo: 1, clipDur: 0.5, clipLead: 0, pose: null,
  t: 0, t0: 0, t1: 0.1, t2: 0.2, t3: 0.26, total: 0.5, phase: 'aufbau', releaseNow: false, impactNow: false, impacted: false,
  x: 0, y: 0, z: 0, yaw: 0, tx: 0, ty: 0, tz: 0, shake: 0, darken: 0, poseK: 0, glowK: 0, liftK: 0, leapK: 0,
});

/** Stand des Figuren-Clips (Anteil 0 … 1 des ganzen Clips) zur laufenden Zeit der Aktion */
export function castClipAt(c: RemoteCast): number {
  if (c.t < c.clipLead) return c.clipFrom * clamp01(c.t / Math.max(1e-3, c.clipLead));
  return c.clipFrom + (c.clipTo - c.clipFrom) * clamp01((c.t - c.clipLead) / Math.max(0.05, c.clipDur));
}

export class RemoteActionStage {
  readonly casts: RemoteCast[] = Array.from({ length: REMOTE_ACT.slots }, blank);
  /** Himmelsverdunkelung am Ort des Betrachters (0 … 1) – je `update` neu */
  dark = 0;
  /** Kamera-Stoß dieses Bilds (0 = keiner) – je `update` neu, die Welt reicht ihn an ihre Kamera */
  shakeNow = 0;
  /** laufende Aktionen */
  active = 0;
  private seq = 0;
  readonly stats = { begun: 0, kino: 0, replaced: 0, dropped: 0, impacts: 0, shakes: 0, far: 0, ended: 0, ignored: 0 };

  /** Laufende Aktion eines Mitspielers (null = keine) */
  castOf(from: string): RemoteCast | null {
    if (!from) return null;
    for (const c of this.casts) if (c.on && c.from === from) return c;
    return null;
  }

  /**
   * Aktion eines Mitspielers beginnen (Ort und Blickrichtung seiner Figur bzw. seines Schiffs). Eine laufende Aktion desselben Mitspielers
   * endet sofort – nie zwei Posen an einer Figur. null = keine darstellbare Kampf-Aktion.
   */
  begin(from: string, a: ActNet, x: number, y: number, z: number, yaw: number): RemoteCast | null {
    if (!KINDS.includes(a.t)) { this.stats.ignored++; return null; }
    let c = this.castOf(from);
    if (c) this.stats.replaced++;
    else {
      for (const k of this.casts) if (!k.on) { c = k; break; }
      if (!c) {
        // alle Plätze belegt: die Aktion, die am weitesten fortgeschritten ist, weicht
        c = this.casts[0];
        for (const k of this.casts) if (k.t / k.total > c.t / c.total) c = k;
        this.stats.dropped++;
      }
    }
    const kind = a.t as RemoteKind;
    const helm = a.side === HELM_SIDE && kind !== 'swing';
    c.on = true; c.seq = ++this.seq; c.from = from; c.kind = kind;
    c.style = a.style; c.el = a.el; c.slot = a.slot; c.n = a.n; c.helm = helm; c.sea = a.sea;
    c.x = x; c.y = y; c.z = z; c.yaw = yaw;
    c.tx = a.tx || x + Math.sin(yaw) * 8; c.tz = a.tz || z + Math.cos(yaw) * 8; c.ty = a.ty || y;
    c.t = 0; c.t0 = 0; c.phase = 'aufbau'; c.releaseNow = false; c.impactNow = false; c.impacted = false;
    c.poseK = 0; c.glowK = 0; c.liftK = 0; c.leapK = 0;
    c.clip = ''; c.clipFrom = 0; c.clipTo = 1; c.clipDur = 0.5; c.clipLead = 0; c.pose = null; c.shake = 0; c.darken = 0;
    const act = directorActionOfAct(a);
    const tl = act ? DIRECTOR_TIMELINES[act] : null;
    c.action = act; c.tl = tl;
    const mv = kind === 'swing' ? swingMove(a.style, a.n) : kind === 'art' ? formMove(a.style, a.slot) : kind === 'ult' ? ultimateMove(a.style, a.el) : null;
    if (mv) { c.clip = mv.clip; c.clipFrom = mv.clipFrom; c.clipTo = mv.clipTo; c.clipDur = mv.dur; }
    if (tl) {
      // Kino-Endgame-Regie: dieselbe Zeitachse wie beim Auslöser, Pose seines Modus (zu Fuß bzw. Sprung auf die Bugreling)
      c.t1 = tl.t1; c.t2 = tl.t2; c.t3 = tl.t3; c.total = tl.total;
      c.pose = DIRECTOR_POSES[helm ? tl.poseHelm : tl.poseFoot];
      c.shake = tl.shake; c.darken = tl.darken;
      // Ultimates: die Aufladung (Phase 1) zeigt die Aushol-Pose des Clips, der Angriff beginnt mit Phase 2
      if (tl.kind === 'ultimate') c.clipLead = tl.t1;
      this.stats.kino++;
    } else if (mv && (kind === 'swing' || kind === 'art')) {
      const hit = Math.max(0.04, Math.min(mv.dur - 0.02, hitMoment(mv)));
      c.total = Math.max(0.12, mv.dur); c.t2 = hit; c.t1 = hit * 0.55; c.t3 = Math.min(c.total, hit + 0.06);
      if (kind === 'art') { c.shake = REMOTE_ACT.artBase + REMOTE_ACT.artStep * Math.max(1, Math.min(10, a.slot)); c.darken = a.slot >= 8 ? REMOTE_ACT.artDark : 0; }
      else c.shake = a.n === SWING_CODE.finisher ? 0.5 : a.n === SWING_CODE.heavy || a.n === SWING_CODE.meteor ? 0.3 : chainStage(a.n) >= 4 ? 0.25 : 0;
    } else {
      const T = kind === 'geist' ? REMOTE_ACT.geist : kind === 'heal' ? REMOTE_ACT.heal : kind === 'ult' ? REMOTE_ACT.ult : REMOTE_ACT.geist;
      c.t1 = T.t1; c.t2 = T.t2; c.t3 = T.t3; c.total = T.total;
      if (kind === 'ult') { c.shake = REMOTE_ACT.ultShake; c.darken = REMOTE_ACT.ultDark; c.clipLead = T.t1; }
      else if (kind === 'geist') { c.shake = REMOTE_ACT.geistShake[Math.max(0, Math.min(3, a.slot - 1))]; c.clip = 'Ranged_Magic_Spellcasting'; c.clipFrom = 0.1; c.clipTo = 0.75; c.clipDur = T.total; }
      else if (kind === 'heal') { c.clip = 'Ranged_Magic_Raise'; c.clipFrom = 0.1; c.clipTo = 0.8; c.clipDur = T.total; }
      else if (kind === 'swing') { c.total = 0.4; c.t2 = 0.14; c.t1 = 0.08; c.t3 = 0.2; }
    }
    this.stats.begun++;
    return c;
  }

  /** Je Bild in ECHTZEIT: Uhren, Phasen, Posen; Verdunkelung und Kamera-Stoß für den Betrachter am Ort (vx, vz) */
  update(realDt: number, vx: number, vz: number) {
    const dt = Math.max(0, Math.min(0.1, Number.isFinite(realDt) ? realDt : 0));
    let dark = 0, shake = 0, active = 0;
    for (const c of this.casts) {
      if (!c.on) continue;
      active++;
      c.t0 = c.t;
      c.t += dt;
      const t = c.t;
      c.releaseNow = c.t0 < c.t1 && t >= c.t1;
      c.impactNow = !c.impacted && t >= c.t2;
      const near = Math.min(Math.hypot(c.tx - vx, c.tz - vz), Math.hypot(c.x - vx, c.z - vz));
      if (c.impactNow) {
        c.impacted = true;
        this.stats.impacts++;
        const s = remoteShake(near, c.shake);
        if (s > 0) { if (s > shake) shake = s; this.stats.shakes++; } else if (c.shake > 0) this.stats.far++;
      }
      const ph: DirectorPhaseId = t < c.t1 ? 'aufbau' : t < c.t2 ? 'entladung' : t < c.t3 ? 'einschlag' : 'nachbeben';
      c.phase = ph;
      let env: number;
      if (ph === 'aufbau') {
        const u = t / Math.max(1e-3, c.t1);
        c.poseK = smooth(u / 0.5); c.glowK = clamp01(u); c.liftK = easeOut(u); c.leapK = c.liftK; env = smooth(u);
      } else if (ph === 'entladung') {
        const u = (t - c.t1) / Math.max(1e-3, c.t2 - c.t1);
        c.poseK = 1; c.glowK = 1; c.liftK = 1 - smooth((u - 0.5) / 0.5); c.leapK = 1; env = 1;
      } else if (ph === 'einschlag') {
        c.poseK = 1; c.glowK = 1; c.liftK = 0; c.leapK = 1; env = 1;
      } else {
        const u = (t - c.t3) / Math.max(1e-3, c.total - c.t3);
        c.poseK = 1 - smooth(u / 0.45); c.glowK = 1 - smooth(u / 0.3); c.liftK = 0; c.leapK = 1 - clamp01((u - 0.3) / 0.6); env = 1 - smooth((u - 0.3) / 0.7);
      }
      if (!c.helm) c.leapK = 0;
      const d = remoteDark(near, c.darken) * env;
      if (d > dark) dark = d;
      if (t >= c.total) { c.on = false; this.stats.ended++; }
    }
    this.dark = dark; this.shakeNow = shake; this.active = active;
  }

  /** Alles beenden (Szenenwechsel, Instanz verlassen) */
  reset() {
    for (const c of this.casts) c.on = false;
    this.dark = 0; this.shakeNow = 0; this.active = 0;
  }
}
