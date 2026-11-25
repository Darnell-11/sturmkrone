// Kamera-Engine (Phase 4.4, Abschluss): Spring-Arm mit Kollisionsschutz, kinematische See-Kamera, gerichtete Treffer-Erschütterung, Fokus-Puls für
// Paraden und Finisher, geschwindigkeitsabhängiges Sichtfeld und weiche Perspektivwechsel. Alles rechnet in vorab angelegten Objekten – im
// Bild entsteht nichts Neues (Zero-GC). Die Welt fragt der Spring-Arm über `CameraWorld` ab; `SeaWorld` liefert sie (Gelände, Brücken, Stege,
// Bauten, Schiffsrümpfe), die Tests eine Attrappe.
import { MathUtils, Quaternion, Vector3, type PerspectiveCamera } from 'three';

// ---------------------------------------------------------------------------------------------------------------
// Gedämpfte Werte
// ---------------------------------------------------------------------------------------------------------------

/** Kritisch gedämpfte Feder (kein Überschwingen): `omega` = Steifigkeit (1/s), der Wert läuft ohne Sprung auf das Ziel */
export class DampedValue {
  value: number;
  vel = 0;
  constructor(v = 0) { this.value = v; }
  set(v: number) { this.value = v; this.vel = 0; }
  step(target: number, omega: number, dt: number): number {
    if (!(dt > 0)) return this.value;
    // exakte Lösung der kritisch gedämpften Feder (stabil auch bei großen dt)
    const x = this.value - target;
    const e = Math.exp(-omega * dt);
    const t = (this.vel + omega * x) * dt;
    this.value = target + (x + t) * e;
    this.vel = (this.vel - omega * t) * e;
    if (!Number.isFinite(this.value)) { this.value = target; this.vel = 0; }
    return this.value;
  }
}

/** Glättungsfaktor für einen Zeitschritt (bildratenunabhängig): 1 − e^(−k·dt) */
export const smoothK = (k: number, dt: number) => 1 - Math.exp(-k * Math.max(0, dt));

// ---------------------------------------------------------------------------------------------------------------
// Spring-Arm mit Kollisionsschutz
// ---------------------------------------------------------------------------------------------------------------

/** Was der Spring-Arm von der Welt wissen muss */
export interface CameraWorld {
  /**
   * Boden unter einem Punkt: Gelände, Wasseroberfläche und begehbare Flächen (Brücken, Stege, Decks) – letztere nur, wenn sie unter `yRef`
   * liegen (wer unter einer Brücke steht, hat sie über sich, nicht unter sich).
   */
  floorAt(x: number, z: number, yRef: number): number;
  /** Liegt der Punkt in festem Material: Fels und Gelände, Bauwerk, Brückendeck oder Steg, Schiffsrumpf? */
  solid(x: number, y: number, z: number): boolean;
}

export interface SpringArmOptions {
  /** Abstand über Boden und Wasser, der nie unterschritten wird (m) */
  clearance: number;
  /** kürzeste Armlänge bei freier Sicht oder kleinem Hindernis (m) */
  minLength: number;
  /** absolute Untergrenze, wenn selbst `minLength` im Hindernis läge (Rücken an der Wand): lieber nah am Kopf als in der Wand */
  hardMin: number;
  /** Prüfpunkte entlang des Arms */
  samples: number;
  /** Rückweg nach dem Hindernis: Steifigkeit der Feder (1/s) */
  easeOut: number;
  /** Heranziehen bei kleiner Abweichung (1/s); Sprünge über `jumpIn` werden sofort genommen */
  pullIn: number;
  /** ab dieser Kürzung (m) springt der Arm sofort heran (kein Bild im Fels); `Infinity` = immer weich */
  jumpIn: number;
  /**
   * Letzter Ausweg, wenn die Kamera trotz allem in festem Material stünde: `in` = am Arm entlang zur Figur hin (zu Fuß: lieber nah am Kopf
   * als im Dach), `up` = senkrecht nach oben (See und Werft: aus dem eigenen Rumpf über das Deck).
   */
  escape: 'in' | 'up';
  /**
   * Ausweichen nach oben (Bogenmaß): ist der Arm hinter der Figur verdeckt (Rücken an der Wand, Klippe hinter dem Schiff), hebt er sich weich
   * um bis zu diesen Winkel über die Figur, statt bis an den Kopf heranzurücken. 0 = aus.
   */
  raise: number;
}

export const FOOT_ARM: SpringArmOptions = { clearance: 0.45, minLength: 1.1, hardMin: 0.45, samples: 18, easeOut: 3.2, pullIn: 30, jumpIn: 0.6, escape: 'in', raise: 0.85 };
export const SEA_ARM: SpringArmOptions = { clearance: 1.2, minLength: 8, hardMin: 8, samples: 24, easeOut: 1.8, pullIn: 22, jumpIn: 0.6, escape: 'up', raise: 0.5 };
export const YARD_ARM: SpringArmOptions = { clearance: 1.0, minLength: 4, hardMin: 4, samples: 20, easeOut: 2.6, pullIn: 26, jumpIn: 0.6, escape: 'up', raise: 0 };
/**
 * Prüfung des überblendeten Wegs bei Perspektivwechseln zu Fuß: ohne Ausweichen und immer weich heran (ein Übergang soll nie springen; kurz
 * hinter einer Kante entlang ist besser als ein Schnitt mitten in der Überblendung)
 */
export const BLEND_ARM: SpringArmOptions = { clearance: 0.45, minLength: 1.4, hardMin: 1.0, samples: 18, easeOut: 3.2, pullIn: 16, jumpIn: Infinity, escape: 'in', raise: 0 };

/** Stufen des Ausweichens nach oben (Anteil von `raise`), die der Arm je Bild prüft */
const RAISE_LEVELS = [0, 0.5, 1] as const;
/** steilster Blick von oben (Bogenmaß) */
const MAX_PITCH = 1.35;

const _dir = new Vector3();
/** eigene Richtung der Abtastung (`probe` darf die Richtung von `solve` nicht überschreiben) */
const _pdir = new Vector3();
const _p = new Vector3();
const _r = new Vector3();

/**
 * Wunschposition um `ang` (Bogenmaß) steiler über den Anker gedreht, gleiche Armlänge (Blick von oben höchstens `MAX_PITCH`; was schon
 * steiler ist, bleibt). Schreibt in `out`.
 */
export function raisedPoint(anchor: Vector3, desired: Vector3, ang: number, out: Vector3): Vector3 {
  const dx = desired.x - anchor.x, dy = desired.y - anchor.y, dz = desired.z - anchor.z;
  const h = Math.hypot(dx, dz);
  if (!(h > 1e-4) || !(ang > 0)) return out.copy(desired);
  const L = Math.hypot(h, dy);
  const p0 = Math.atan2(dy, h);
  const p = Math.min(p0 + ang, Math.max(MAX_PITCH, p0));
  const hc = (Math.cos(p) * L) / h;
  return out.set(anchor.x + dx * hc, anchor.y + Math.sin(p) * L, anchor.z + dz * hc);
}

/**
 * Zweistufig gedämpfter Spring-Arm: vom Fokus-Anker zur gewünschten Kameraposition wird die Sichtlinie abgetastet. Trifft sie festes Material
 * oder unterschreitet sie den Mindestabstand über Boden und Wasser, wird der Arm sofort bzw. sehr schnell gekürzt (Stufe 1: kein Bild im Fels);
 * ist der Weg wieder frei, gleitet er über eine kritisch gedämpfte Feder auf die Wunschlänge zurück (Stufe 2: kein Springen). Ist der Arm hinter
 * der Figur verdeckt, weicht er weich nach oben aus (`raise`). Danach hebt eine Bodenklemme die Kamera, falls sie trotzdem zu tief stünde
 * (garantierter Mindestabstand); stünde sie dennoch in festem Material, greift der letzte Ausweg (`escape`).
 */
export class SpringArm {
  /** aktuelle Armlänge (m) */
  readonly len = new DampedValue(-1);
  /** Ausweichen nach oben (0 … 1 von `raise`) */
  readonly lift = new DampedValue(0);
  /** zuletzt erlaubte Länge (für Prüfungen und Anzeige) */
  allowed = 0;
  /** war die Sichtlinie in diesem Bild verdeckt? */
  hit = false;
  constructor(public opts: SpringArmOptions) {}

  reset() { this.len.set(-1); this.lift.set(0); }

  /** Längste freie Armlänge entlang der Sichtlinie (ohne Glättung) */
  probe(anchor: Vector3, desired: Vector3, world: CameraWorld): number {
    const o = this.opts;
    _pdir.subVectors(desired, anchor);
    const L = _pdir.length();
    if (!(L > 1e-4)) return 0;
    _pdir.multiplyScalar(1 / L);
    let free = L;
    // Material, in dem der Anker selbst steht (Deck über dem Rumpf, Ziel im Schiff der Werft), zählt erst nach dem ersten freien Punkt
    let outside = !world.solid(anchor.x, anchor.y, anchor.z);
    this.hit = false;
    for (let i = 1; i <= o.samples; i++) {
      const d = (L * i) / o.samples;
      _p.copy(anchor).addScaledVector(_pdir, d);
      const inSolid = world.solid(_p.x, _p.y, _p.z);
      if (!outside) { if (!inSolid) outside = true; continue; }
      // Bodenabstand wächst vom Anker weg auf den vollen Wert (am Anker selbst steht die Figur auf dem Boden)
      const clear = o.clearance * Math.min(1, d / 2);
      const low = _p.y < world.floorAt(_p.x, _p.z, anchor.y) + clear;
      if (inSolid || low) {
        this.hit = true;
        // eine halbe Probe Luft zum Hindernis
        free = Math.max(0, d - L / o.samples * 0.5 - 0.15);
        break;
      }
    }
    return free;
  }

  /**
   * Kameraposition für Anker und Wunschposition setzen (`out`), mit Glättung über `dt`. `snap` = ohne Glättung (Schnitt, erstes Bild).
   * Gibt die verwendete Armlänge zurück.
   */
  solve(anchor: Vector3, desired: Vector3, world: CameraWorld, dt: number, out: Vector3, snap = false): number {
    const o = this.opts;
    _dir.subVectors(desired, anchor);
    const want = _dir.length();
    if (!(want > 1e-4)) { out.copy(desired); return 0; }
    // Ausweichen nach oben: die niedrigste Stufe, deren Sichtlinie lang genug frei ist (sonst die freieste), weich anfahren –
    // schnell hinauf (Wand im Rücken), langsam wieder herab
    let free0 = -1, hit0 = false, target = 0;
    if (o.raise > 0) {
      const need = Math.min(want, Math.max(o.minLength * 2.5, want * 0.55));
      let best = -1;
      for (let i = 0; i < RAISE_LEVELS.length; i++) {
        const lv = RAISE_LEVELS[i];
        const f = this.probe(anchor, lv > 0 ? raisedPoint(anchor, desired, lv * o.raise, _r) : desired, world);
        if (i === 0) { free0 = f; hit0 = this.hit; }
        if (f >= need) { target = lv; break; }
        if (f > best + 0.5) { best = f; target = lv; }
      }
    }
    if (snap || this.len.value < 0) this.lift.set(target);
    else this.lift.step(target, target > this.lift.value ? 7 : 2.2, dt);
    const lifted = o.raise > 0 && this.lift.value > 1e-3;
    const goal = lifted ? raisedPoint(anchor, desired, this.lift.value * o.raise, _r) : desired;
    let free: number;
    if (!lifted && free0 >= 0) { free = free0; this.hit = hit0; }
    else free = this.probe(anchor, goal, world);
    _dir.subVectors(goal, anchor);
    // Untergrenze: `minLength`, außer das Hindernis liegt noch näher (dann bis `hardMin` heran statt in die Wand)
    const lower = Math.min(want, Math.max(o.hardMin, Math.min(free, o.minLength)));
    const allowed = MathUtils.clamp(Math.min(want, free), lower, want);
    this.allowed = allowed;
    const cur = this.len.value;
    if (snap || cur < 0) this.len.set(allowed);
    else if (allowed < cur) {
      // Stufe 1: heran – große Sprünge sofort, kleine sehr schnell
      if (cur - allowed > o.jumpIn) this.len.set(allowed);
      else { this.len.value += (allowed - cur) * smoothK(o.pullIn, dt); this.len.vel = 0; }
    } else this.len.step(allowed, o.easeOut, dt); // Stufe 2: weich zurück
    const L = Math.min(this.len.value, want);
    _dir.multiplyScalar(1 / want);
    out.copy(anchor).addScaledVector(_dir, L);
    // Bodenklemme: Mindestabstand über Boden und Wasser ist garantiert
    const floor = world.floorAt(out.x, out.z, anchor.y) + o.clearance;
    if (out.y < floor) out.y = floor;
    // steht die Kamera trotz allem in festem Material (kürzester Arm in einer Wand, Bodenklemme unter ein Vordach): letzter Ausweg
    if (world.solid(out.x, out.y, out.z)) this.escape(anchor, world, out, L);
    return L;
  }

  private escape(anchor: Vector3, world: CameraWorld, out: Vector3, L: number) {
    if (this.opts.escape === 'up') {
      for (let k = 0; k < 8 && world.solid(out.x, out.y, out.z); k++) out.y += 0.5;
      return;
    }
    // am Arm entlang zur Figur hin bis zum ersten freien Punkt (`_dir` ist hier die Einheitsrichtung des Arms)
    for (let d = L - 0.25; d > 0.2; d -= 0.25) {
      _p.copy(anchor).addScaledVector(_dir, d);
      if (!world.solid(_p.x, _p.y, _p.z)) { out.copy(_p); return; }
    }
    // die Figur steht selbst an der Wand: knapp über den Kopf
    out.copy(anchor);
    out.y += 0.35;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Nahbereichs-Ausblenden der Spielfigur (4.5A)
// ---------------------------------------------------------------------------------------------------------------

/** Ab diesem Abstand (m) zwischen Kamera und Kopf blendet die Figur aus; beim kürzesten Arm (`FOOT_ARM.hardMin`) ist sie ganz weg */
export const NEAR_FADE = { start: 0.7, end: 0.45 } as const;

/**
 * Wie stark die Spielfigur ausgeblendet wird (0 = sichtbar, 1 = ganz weg), wenn die Kamera an einer engen Wand näher als 0,70 m an sie heranrückt:
 * weicher Verlauf bis zum kürzesten Arm. So verdeckt der eigene Körper nie die Sicht.
 */
export function cameraNearFade(dist: number, start: number = NEAR_FADE.start, end: number = NEAR_FADE.end): number {
  if (!(dist < start)) return 0;
  if (dist <= end) return 1;
  const x = (start - dist) / (start - end);
  return x * x * (3 - 2 * x);
}

/** Geglättetes Ausblenden: schnell hinein (die Wand ist sofort da), etwas langsamer wieder heraus; nie NaN */
export class NearFade {
  private readonly d = new DampedValue(0);
  value = 0;
  update(dist: number, dt: number): number {
    const target = cameraNearFade(Number.isFinite(dist) ? dist : 99);
    this.value = MathUtils.clamp(this.d.step(target, target > this.d.value ? 22 : 9, dt), 0, 1);
    if (this.value < 0.002) this.value = 0;
    return this.value;
  }
  reset() { this.d.set(0); this.value = 0; }
}

// ---------------------------------------------------------------------------------------------------------------
// See-Kamera: Klassen- und Gefechts-Skalierung, Dünung
// ---------------------------------------------------------------------------------------------------------------

/** Schiffslängen der kleinsten und größten Klasse (Schaluppe, Leviathan) */
export const SHIP_L_RANGE = [18, 74] as const;

export interface NavalFrame { back: number; up: number }

/**
 * Abstand hinter und Höhe über dem Schiff (m) für die Segelkamera: wächst mit der Schiffslänge (Schaluppe nah, Leviathan weit) und dem Abstand
 * zum Gegner; beim Zielen mit Breitseiten (`aimK` 0 … 1) etwas höher und steiler, damit Zielkreis und Gegner über hohe Wellenkämme sichtbar bleiben.
 */
export function navalFrame(L: number, portrait: boolean, sep: number, boost: boolean, zoom: number, aimK: number, waves: number, out: NavalFrame): NavalFrame {
  const back = ((portrait ? 22 : 16) + L * 1.45 + sep * 0.3 + (boost ? 4 : 0)) * zoom;
  let up = ((portrait ? 12 : 8) + L * 0.6 + sep * (portrait ? 0.5 : 0.32)) * zoom * 0.99;
  // Zielen: bis 22 % höher, bei hohem Seegang mehr (Wellenkämme verdecken sonst den Zielkreis)
  up *= 1 + aimK * (0.16 + 0.06 * MathUtils.clamp(waves - 1, 0, 1.5));
  out.back = back * (1 - 0.06 * aimK);
  out.up = up;
  return out;
}

/** Zusätzliches Sichtfeld (Grad): Fahrt bis +4°, Windstraße (Strömung bis +35 %) bis +6°, Rammstoß bis +8° – nie mehr als +8° */
export const FOV_BOOST = { speed: 4, current: 6, ram: 8 } as const;

/**
 * Wunsch-Zuschlag zum Sichtfeld: `speedK` = Fahrt relativ zur Höchstfahrt (0 … 1+), `flowBoost` = Strömungsschub (0 … 0,35), `ramK` = Rammstoß/
 * Schub (0 … 1). Unter halber Fahrt bleibt das Sichtfeld unverändert.
 */
export function dynamicFovExtra(speedK: number, flowBoost: number, ramK: number): number {
  const s = MathUtils.smoothstep(speedK, 0.5, 1.0) * FOV_BOOST.speed;
  const c = MathUtils.clamp(flowBoost / 0.35, 0, 1) * FOV_BOOST.current * MathUtils.smoothstep(speedK, 0.25, 0.7);
  const r = MathUtils.clamp(ramK, 0, 1) * FOV_BOOST.ram;
  return MathUtils.clamp(Math.max(s, c, r) + 0.25 * Math.min(s, c), 0, FOV_BOOST.ram);
}

/**
 * Dünungs-Nachführung, verträglich gegen Reisekrankheit: die Kamera hebt und senkt sich nur mit einem langsamen, gedämpften Anteil der Wasserhöhe
 * am Schiff (Tiefpass ~0,8 s), begrenzt auf ±0,9 m und 1,4 m/s – man spürt die Wellen, ohne dass das Bild schaukelt.
 */
export class SwellFollow {
  private y = new DampedValue(0);
  offset = 0;
  update(waveHeight: number, dt: number): number {
    const target = MathUtils.clamp(waveHeight * 0.35, -0.9, 0.9);
    const before = this.y.value;
    this.y.step(target, 2.4, dt);
    // Geschwindigkeitsgrenze
    const maxStep = 1.4 * Math.max(0, dt);
    if (Math.abs(this.y.value - before) > maxStep) { this.y.value = before + Math.sign(this.y.value - before) * maxStep; this.y.vel = 0; }
    this.offset = this.y.value;
    return this.offset;
  }
  reset() { this.y.set(0); this.offset = 0; }
}

// ---------------------------------------------------------------------------------------------------------------
// Kampf-Kamera: gerichtete Erschütterung und Fokus-Puls
// ---------------------------------------------------------------------------------------------------------------

/**
 * Treffer-Erschütterung: (1) Stoß in Schlagrichtung, der federnd zurückschwingt, (2) kurze Schwingung entlang der Trefferachse, (3) ungerichtetes
 * Zittern (Explosionen, Fähigkeiten). `scale` ist der Regler „Kamera-Erschütterung“ (0 … 1): 0 schaltet alles ab.
 */
export class HitShake {
  scale = 1;
  readonly kick = new Vector3();
  readonly kickV = new Vector3();
  readonly axis = new Vector3(1, 0, 0);
  dir = 0;
  private ph = 0;
  rumble = 0;
  /** zuletzt berechneter Versatz (m) */
  readonly offset = new Vector3();

  /** Gerichteter Stoß (Kanonensalve, Rammstoß, Boss-Treffer, eigener schwerer Hieb): Richtung in der Welt, Stärke 0 … 1,5 */
  impulse(dirX: number, dirY: number, dirZ: number, strength: number) {
    if (!(strength > 0)) return;
    const l = Math.hypot(dirX, dirY, dirZ) || 1;
    this.axis.set(dirX / l, dirY / l, dirZ / l);
    this.dir = Math.min(1.2, Math.max(this.dir, strength * 0.55));
    const k = Math.min(1.5, strength);
    this.kickV.x += (dirX / l) * k * 2.4;
    this.kickV.z += (dirZ / l) * k * 2.4;
    this.kickV.y += (dirY / l) * k * 2.4 - k * 1.1;
  }

  /** Ungerichtetes Zittern (0 … 1) */
  shake(amount: number) { this.rumble = Math.max(this.rumble, amount); }

  /**
   * Je Bild (Echtzeit, auch im Standbild): Versatz berechnen; `rand` liefert Zufall in [0, 1) (Tests geben eine feste Folge), `dirGain`
   * verstärkt nur den gerichteten Anteil (weite See-Kamera).
   */
  update(dt: number, rand: () => number = Math.random, dirGain = 1): Vector3 {
    const d = Math.min(Math.max(dt, 0), 0.05);
    const K = 240, C = 15;
    this.kickV.x += (-K * this.kick.x - C * this.kickV.x) * d;
    this.kickV.y += (-K * this.kick.y - C * this.kickV.y) * d;
    this.kickV.z += (-K * this.kick.z - C * this.kickV.z) * d;
    this.kick.addScaledVector(this.kickV, d);
    const o = this.offset.copy(this.kick);
    if (this.dir > 0.001) {
      this.ph += d * 62;
      o.addScaledVector(this.axis, Math.sin(this.ph) * this.dir * this.dir * 0.22);
      this.dir = Math.max(0, this.dir - d * 4.5);
    }
    if (dirGain !== 1 && dirGain > 0) o.multiplyScalar(dirGain);
    if (this.rumble > 0) {
      const s = this.rumble * this.rumble * 0.6;
      o.x += (rand() - 0.5) * s;
      o.y += (rand() - 0.5) * s;
      this.rumble = Math.max(0, this.rumble - d * 1.8);
    }
    o.multiplyScalar(MathUtils.clamp(this.scale, 0, 1));
    if (!Number.isFinite(o.x + o.y + o.z)) { o.set(0, 0, 0); this.clear(); }
    return o;
  }

  clear() { this.kick.set(0, 0, 0); this.kickV.set(0, 0, 0); this.dir = 0; this.rumble = 0; this.offset.set(0, 0, 0); }
}

/**
 * Fokus-Puls (Parade, finaler Boss-Treffer): die Kamera rückt kurz filmreif näher (bis `strength` × 24 % der Distanz, Sichtfeld bis −3°) und
 * gleitet danach weich zurück. Anstieg 0,12 s, Halten, Abklingen über die Restdauer.
 */
export class FocusPulse {
  private t = 0;
  private dur = 0;
  private k = 0;
  value = 0;
  trigger(strength: number, duration = 0.9) {
    if (this.value > strength && this.t < this.dur) return;
    this.k = MathUtils.clamp(strength, 0, 1);
    this.dur = Math.max(0.3, duration);
    this.t = 0;
  }
  update(dt: number): number {
    if (this.t >= this.dur) { this.value = 0; return 0; }
    this.t += Math.max(0, dt);
    const rise = MathUtils.smoothstep(this.t, 0, 0.12);
    const fall = 1 - MathUtils.smoothstep(this.t, this.dur * 0.35, this.dur);
    this.value = this.k * Math.min(rise, fall);
    return this.value;
  }
  /** Faktor für die Kameradistanz (1 = unverändert) */
  get distK() { return 1 - 0.24 * this.value; }
  /** Sichtfeld-Abzug in Grad */
  get fovDelta() { return -3 * this.value; }
}

// ---------------------------------------------------------------------------------------------------------------
// Weiche Perspektivwechsel
// ---------------------------------------------------------------------------------------------------------------

const _q = new Quaternion();
const _a = new Vector3();
const _b = new Vector3();
const _axis = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Kameraposition zwischen zwei Ständen auf einer Kugelbahn um `focus`: `from` ist absolut (Welt) oder – mit `fromRelative` – ein Versatz zum
 * Fokus, `to` die Zielposition. Richtung über den Großkreis (bei genau entgegengesetzten Ständen über oben), Abstand linear. `e` = 0 … 1.
 * `out` darf `to` sein.
 */
export function orbitBlend(from: Vector3, fromRelative: boolean, to: Vector3, focus: Vector3, e: number, out: Vector3): Vector3 {
  _a.copy(from);
  if (!fromRelative) _a.sub(focus);
  _b.subVectors(to, focus);
  const la = _a.length(), lb = _b.length();
  if (!(la > 1e-3) || !(lb > 1e-3)) {
    // entarteter Stand genau im Fokus: gerade überblenden
    _a.add(focus);
    out.lerpVectors(_a, to, e);
    if (!Number.isFinite(out.x + out.y + out.z)) out.copy(to);
    return out;
  }
  _a.multiplyScalar(1 / la);
  _b.multiplyScalar(1 / lb);
  const d = MathUtils.clamp(_a.dot(_b), -1, 1);
  const th = Math.acos(d);
  if (th > 1e-4) {
    if (d < -0.999) {
      // entgegengesetzt: über eine Achse quer zur Hochrichtung drehen (die Kamera schwingt über die Figur, nicht durch sie)
      _axis.crossVectors(_a, UP);
      if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0);
      _axis.normalize();
      _a.applyAxisAngle(_axis, th * e); // (a × oben) als Achse: positive Drehung hebt a nach oben
    } else {
      const s = Math.sin(th);
      const wa = Math.sin((1 - e) * th) / s, wb = Math.sin(e * th) / s;
      _a.multiplyScalar(wa).addScaledVector(_b, wb);
    }
  }
  const len = la + (lb - la) * e;
  out.copy(focus).addScaledVector(_a, len);
  if (!Number.isFinite(out.x + out.y + out.z)) out.copy(to);
  return out;
}

/**
 * Übergang zwischen zwei Kameraständen: beim Wechsel (Anlegen, Bordleiter, Entern, Landgang, Schnellreise, Werft) wird der letzte Stand gemerkt
 * und über `duration` Sekunden weich in den neu berechneten überblendet – Position, Blickrichtung (Quaternion) und Sichtfeld. Bei großen Sprüngen
 * des Fokus (Schnellreise) gilt der gemerkte Stand relativ zum Fokus, sonst absolut.
 */
export class CameraBlend {
  private active = false;
  private t = 0;
  private dur = 0.7;
  private relative = false;
  private readonly fromPos = new Vector3();
  private readonly fromQuat = new Quaternion();
  private fromFov = 55;
  /** zuletzt gezeichneter Stand (für den nächsten Wechsel) */
  private readonly lastPos = new Vector3();
  private readonly lastQuat = new Quaternion();
  private lastFov = 55;
  private readonly lastFocus = new Vector3();
  private has = false;

  get blending() { return this.active; }

  /**
   * Übergang ab dem zuletzt gezeichneten Stand starten (`focusNow` = neuer Fokus; bei Sprüngen über 40 m relativ). Ein relativer Stand, der
   * näher als `minRel` am alten Fokus lag (Kamera an einer Wand herangezogen), würde am neuen Ort im Kopf der Figur oder im Rumpf beginnen:
   * dann ist ein klarer Schnitt besser als eine Überblendung.
   */
  start(focusNow: Vector3, duration = 0.7, minRel = 3) {
    if (!this.has) return;
    this.relative = this.lastFocus.distanceTo(focusNow) > 40;
    this.fromPos.copy(this.lastPos);
    if (this.relative) {
      this.fromPos.sub(this.lastFocus);
      if (this.fromPos.length() < minRel) { this.active = false; return; }
    }
    this.fromQuat.copy(this.lastQuat);
    this.fromFov = this.lastFov;
    this.t = 0;
    this.dur = Math.max(0.05, duration);
    this.active = true;
  }

  cancel() { this.active = false; }

  /** Wie weit ist der Fokus seit dem letzten Bild gesprungen? (0 vor dem ersten Bild) */
  focusJump(focus: Vector3): number { return this.has ? this.lastFocus.distanceTo(focus) : 0; }

  /**
   * Nach dem Berechnen der Kamera (vor Erschütterung): Übergang anwenden und den Stand für den nächsten Wechsel merken. Die Position läuft
   * auf einer Kugelbahn um den Fokus (Richtung über den Großkreis, Abstand linear) – eine gerade Linie zwischen zwei Ständen auf
   * verschiedenen Seiten der Figur führte mitten durch ihren Kopf.
   */
  apply(cam: PerspectiveCamera, focus: Vector3, dt: number) {
    // ungültiger Stand (NaN aus einer fehlerhaften Rechnung): den letzten gültigen halten, nie weitergeben oder merken
    if (!Number.isFinite(cam.position.x + cam.position.y + cam.position.z) && this.has) {
      cam.position.copy(this.lastPos);
      cam.quaternion.copy(this.lastQuat);
    }
    if (this.active) {
      this.t += Math.max(0, dt);
      const x = Math.min(1, this.t / this.dur);
      const e = x * x * x * (x * (x * 6 - 15) + 10); // weicher Ein- und Auslauf
      orbitBlend(this.fromPos, this.relative, cam.position, focus, e, cam.position);
      _q.copy(this.fromQuat).slerp(cam.quaternion, e);
      cam.quaternion.copy(_q);
      const fov = this.fromFov + (cam.fov - this.fromFov) * e;
      if (Number.isFinite(fov)) cam.fov = fov;
      if (!Number.isFinite(cam.position.x + cam.position.y + cam.position.z)) { this.active = false; }
      if (x >= 1) this.active = false;
    }
    this.lastPos.copy(cam.position);
    this.lastQuat.copy(cam.quaternion);
    this.lastFov = cam.fov;
    this.lastFocus.copy(focus);
    this.has = true;
  }
}
