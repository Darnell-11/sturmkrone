// Titelbild als Kamerafahrt: das Prachtschiff segelt in drei Stimmungen vorbei (Abendgold, Sturmfront, Mondnacht), dazwischen blendet das Bild
// kurz ab. Die Regie ist reine Daten und Rechnung (nur Vektoren von three.js): das Schiff fährt wirklich (Fahrphysik des Spielerschiffs),
// die Kamera ist eine Funktion von Zeit und Schiffslage. SeaWorld stellt Schiff, Himmel und Kamera zur Verfügung (siehe TitleHost).
import { Vector3, type Object3D, type PerspectiveCamera } from 'three';
import { clamp01, lerp, smooth01, wrapAngle } from '../core/mathUtil';
import type { WeatherDef } from '../data/world';
import type { SeaEnv } from '../entities/ship/ship';
import { baseFov } from '../render/lens';
import { createPalette, samplePalette } from './timeOfDay';

export type WeatherValues = Partial<Omit<WeatherDef, 'label' | 'weight'>>;

/** Was die Regie vom Schiff braucht (das echte `Ship` erfüllt es; Tests nehmen eine Attrappe) */
export interface TitleShip {
  x: number; z: number; heading: number; speed: number;
  speedCap: number | null; throttle: number | null;
  sim: { sailSet: number };
  cls: { L: number; W: number; mh: number };
  model: { group: Object3D; helm: Vector3 };
  place(x: number, z: number, heading: number): void;
  steer(dt: number, turn: number, env: SeaEnv, speedMult?: number): void;
}

/** Was die Regie von Himmel und Wetter braucht */
export interface TitleEnv {
  windDir: number;
  timeSpeed: number;
  setState(s: { time: number }): void;
  weather: {
    auto: boolean;
    hold(values: WeatherValues | null, instant?: boolean): void;
    strikeAt(focus: Vector3, x: number, z: number): void;
  };
}

export interface TitleHost {
  readonly env: TitleEnv;
  readonly ship: TitleShip;
  /** Meereswerte für die Fahrphysik (ohne Sturmschäden an den Segeln: im Titelbild reißt nichts) */
  seaEnv(): SeaEnv;
  /** Wasserhöhe an einem Punkt */
  sea(x: number, z: number): number;
  /** Ist der Platz im Umkreis von `radius` Metern frei von Inseln und Stegen? */
  free(x: number, z: number, radius: number): boolean;
  /** Die Regie hat das Schiff bewegt (`cut`: an einen ganz neuen Ort gesetzt, Kielwasser verwerfen) */
  moved(cut: boolean): void;
}

/** Lage von Schiff und See in einem Bild: daraus rechnet jede Kamerafahrt ihren Standort */
export interface RigCtx {
  /** Sekunden seit dem Schnitt und Anteil 0 … 1 der Einstellung */
  t: number; u: number;
  /** Schiffsmitte, Kurs, Richtung nach vorn und nach links (waagerecht, Meter) */
  x: number; z: number; h: number; fx: number; fz: number; lx: number; lz: number;
  /** Länge, Breite, Masthöhe; Abstandsfaktor für das Bildformat (Hochformat steht weiter weg) */
  L: number; W: number; mh: number; fit: number;
  /** Lage des Schiffs beim Schnitt (Ort, Kurs) und geplante Fahrstrecke in Metern: feste Kameras planen damit ihren Standort */
  x0: number; z0: number; h0: number; run: number;
  sea(x: number, z: number): number;
  /** Schiffsgruppe und Ruderplatz in Schiffskoordinaten (für Kameras, die an Bord mitfahren) */
  group: Object3D;
  helm: Vector3;
}

export interface RigOut { eye: Vector3; look: Vector3; roll: number }
export type Rig = (c: RigCtx, o: RigOut) => void;

export interface TitleShot {
  id: 'abendgold' | 'sturm' | 'mondnacht';
  /** Dauer in Sekunden (die Überblendung kommt dazu) */
  length: number;
  /** Uhrzeit 0 … 24 und Wetterwerte (Blitze setzt die Regie selbst, `bolts` = Pause zwischen zwei Einschlägen in Sekunden) */
  hour: number;
  weather: WeatherValues;
  bolts?: [number, number];
  /** Bühne: Ort und Kurs des Schiffs beim Schnitt (Kurs fest oder relativ zur Richtung von Sonne bzw. Mond) */
  stage: { x: number; z: number; heading: number | { toward: 'sun' | 'moon'; by: number } };
  /** Reisetempo (m/s, mit vollem Segel nur gedeckelt), gesetztes Tuch 0 … 1, Ruderausschlag −1 … 1 */
  speed: number;
  sails: number;
  helm: number;
  /** Öffnungswinkel im Querformat (Grad) und Stärke der Handkamera-Bewegung */
  fov: number;
  sway: number;
  rig: Rig;
}

const _pal = createPalette();
const _tgt = new Vector3();

// ---------- Kamerafahrten ----------

/** Verfolger von schräg hinten: steigt langsam und gleitet vom Heck-Backbord-Viertel hinter das Schiff */
const chase: Rig = (c, o) => {
  const e = smooth01(c.u);
  const k = (c.L / 46) * c.fit;
  const back = c.L * 0.5 + lerp(31, 28, e) * k;
  const side = lerp(16, 5, e) * k;
  const px = c.x - c.fx * back + c.lx * side;
  const pz = c.z - c.fz * back + c.lz * side;
  o.eye.set(px, c.sea(px, pz) + lerp(3.4, 10, e) * (0.55 + 0.45 * k), pz);
  o.look.set(c.x + c.fx * c.L * 0.22, c.sea(c.x, c.z) + lerp(c.mh * 0.4, c.mh * 0.43, e), c.z + c.fz * c.L * 0.22);
  o.roll = 0;
};

/**
 * Vorbeifahrt: die Kamera steht fest dicht über den Wellen (und hebt und senkt sich mit ihnen), das Schiff zieht an ihr vorbei:
 * erst der Bug von schräg vorn, dann die Breitseite, zuletzt das Heck. Sie schwenkt nur mit und hält das Schiff im Bild.
 */
const passBy: Rig = (c, o) => {
  const k = (c.L / 46) * c.fit;
  const f0x = Math.sin(c.h0), f0z = Math.cos(c.h0);
  const along = c.run * 0.55;
  const d = 62 * k;
  const px = c.x0 + f0x * along + f0z * d;
  const pz = c.z0 + f0z * along - f0x * d;
  o.eye.set(px, c.sea(px, pz) + 3.2, pz);
  o.look.set(c.x + c.fx * c.L * 0.05, c.sea(c.x, c.z) + c.mh * 0.32, c.z + c.fz * c.L * 0.05);
  o.roll = 0;
};

/** Bugkran: erst tief vor dem Bug mit Blick hinauf zur Galionsfigur, dann steigend und zur Seite ausschwenkend */
const bowCrane: Rig = (c, o) => {
  const e = smooth01(c.u);
  const k = (c.L / 46) * c.fit;
  const ahead = c.L * 0.5 + lerp(33, 54, e) * k;
  const side = lerp(-9, -26, e) * k;
  const px = c.x + c.fx * ahead + c.lx * side;
  const pz = c.z + c.fz * ahead + c.lz * side;
  o.eye.set(px, c.sea(px, pz) + lerp(2.6, 14, e) * (0.55 + 0.45 * k), pz);
  o.look.set(c.x - c.fx * c.L * 0.02, c.sea(c.x, c.z) + lerp(c.mh * 0.38, c.mh * 0.44, e), c.z - c.fz * c.L * 0.02);
  o.roll = 0;
};

/**
 * Die Einstellungen. Zeiten: 17,93 Uhr = die Sonne berührt den Horizont (Fenster und Laternen leuchten schon, die Sonne scheint noch);
 * 17,1 Uhr = noch hell genug, dass die Sturmwolken Tiefe zeigen; 3,4 Uhr = Nacht mit tief stehendem Mond.
 */
export const TITLE_SHOTS: readonly TitleShot[] = [
  {
    id: 'abendgold', length: 17, hour: 17.93,
    weather: { clouds: 0.8, cloudDark: 0.12, visibility: 1, grey: 0.05, rain: 0, waves: 1.35, wind: 0.6, lightning: 0, light: 1 },
    stage: { x: 210, z: -110, heading: { toward: 'sun', by: 0.5 } },
    speed: 8, sails: 1, helm: -0.05, fov: 51, sway: 1, rig: chase,
  },
  {
    id: 'sturm', length: 15, hour: 17.1,
    weather: { clouds: 1, cloudDark: 1, visibility: 0.6, grey: 0.82, rain: 0.9, waves: 2.35, wind: 1, lightning: 0, light: 0.32 },
    bolts: [2.2, 3.8],
    stage: { x: -230, z: -230, heading: -1.0 },
    speed: 7.5, sails: 0.75, helm: 0.04, fov: 54, sway: 2.2, rig: passBy,
  },
  {
    id: 'mondnacht', length: 16, hour: 3.4,
    weather: { clouds: 0.45, cloudDark: 0, visibility: 1, grey: 0, rain: 0, waves: 0.85, wind: 0.35, lightning: 0, light: 1 },
    stage: { x: -150, z: -90, heading: { toward: 'moon', by: Math.PI + 0.4 } },
    speed: 4.5, sails: 0.8, helm: 0.03, fov: 52, sway: 0.8, rig: bowCrane,
  },
];

/** Peilung (Bogenmaß, Vorwärts = (sin, cos)) der Sonne bzw. des Mondes zu einer Uhrzeit */
export function bearingOf(hour: number, body: 'sun' | 'moon'): number {
  samplePalette(hour, _pal);
  const d = body === 'sun' ? _pal.sunDir : _pal.moonDir;
  return Math.atan2(d.x, d.z);
}

/** Kurs des Schiffs bei einem Schnitt */
export function headingOf(shot: TitleShot): number {
  const h = shot.stage.heading;
  return typeof h === 'number' ? wrapAngle(h) : wrapAngle(bearingOf(shot.hour, h.toward) + h.by);
}

/**
 * Blickrichtung so drehen, dass das anvisierte Ziel bei (ndcX, ndcY) im Bild steht statt in der Mitte (−1 … 1, rechts und oben positiv).
 * Reine Drehung der Kamera, der Horizont bleibt waagerecht (kein Neigen wie bei einem schief gesetzten Schwenk).
 */
export function lensShift(yaw: number, pitch: number, ndcX: number, ndcY: number, tanH: number, tanV: number): { yaw: number; pitch: number } {
  return { yaw: yaw + Math.atan(ndcX * tanH), pitch: pitch - Math.atan(ndcY * tanV) };
}

/** Wohin im Bild das Schiff gehört: im Querformat in den freien Teil links vom Menü, im Hochformat in die obere Hälfte über dem Menü */
export function layoutShift(w: number, h: number): { ndcX: number; ndcY: number; wide: boolean } {
  const wide = w > h * 1.15 && w >= 640;
  if (!wide) return { ndcX: 0, ndcY: 0.2, wide };
  // Menüspalte (höchstens 27 rem, 40 % der Breite) plus Rand rechts; das Schiff steht in der Mitte des Restes, etwas näher zur Bildmitte
  const menu = Math.min(432, w * 0.4) + Math.max(w * 0.03, 24);
  return { ndcX: -(menu / w) * 0.85, ndcY: -0.04, wide };
}

/** Abstandsfaktor für das Bildformat: Hochformat (schmal) steht weiter weg, damit das Schiff hineinpasst */
export function fitFor(aspect: number): number {
  return aspect >= 1.3 ? 1 : lerp(1.75, 1, clamp01((aspect - 0.45) / 0.85));
}

const INTRO_FADE = 2.4;
const CUT_IN = 1.1;
const CUT_OUT = 0.8;
/** Freier Raum um die Bühne (m): das Schiff fährt ein Stück, die Kamera steht bis etwa 60 m daneben */
const CLEAR = 110;

export class TitleDirector {
  /** Läuft die Regie (zwischen Titelbild und Spielstart)? */
  active = false;
  /** Schwarzblende 0 (klar) … 1 (schwarz): das Spiel legt sie als Schicht über das Bild */
  fade = 1;
  /** Zeit steht still (Prüfbilder) */
  paused = false;
  /** Zwischenstand des Blicks (Gier) für die Blitze */
  private camYaw = 0;
  private i = 0;
  private t = 0;
  private ph = 0;
  private phase: 'in' | 'play' | 'out' = 'in';
  private intro = true;
  private bolt = 0;
  private turn = 0;
  private readonly ctx: RigCtx;
  private readonly out: RigOut = { eye: new Vector3(), look: new Vector3(), roll: 0 };

  constructor(private readonly host: TitleHost, private readonly shots: readonly TitleShot[] = TITLE_SHOTS) {
    const s = host.ship;
    this.ctx = { t: 0, u: 0, x: 0, z: 0, h: 0, fx: 0, fz: 1, lx: 1, lz: 0, L: s.cls.L, W: s.cls.W, mh: s.cls.mh, fit: 1, x0: 0, z0: 0, h0: 0, run: 0, sea: (x, z) => host.sea(x, z), group: s.model.group, helm: s.model.helm };
  }

  get shot(): TitleShot { return this.shots[this.i]; }
  get index() { return this.i; }

  /** Titelbild beginnt (vom ersten Bild an Abblende → Aufblenden) */
  start() {
    this.active = true;
    this.intro = true;
    this.i = 0;
    this.enter();
  }

  /** Spiel beginnt: Wetter, Tempo und Öffnungswinkel zurückgeben */
  stop() {
    if (!this.active) return;
    this.active = false;
    this.fade = 0;
    const h = this.host;
    h.env.weather.hold(null);
    h.ship.speedCap = null;
  }

  /** Öffnungswinkel zurückstellen, wenn das Spiel die Kamera übernimmt */
  releaseCamera(cam: PerspectiveCamera) {
    cam.fov = baseFov(innerWidth, innerHeight);
    cam.updateProjectionMatrix();
  }

  /** Prüfhilfe: zur Einstellung `index` springen und `seconds` Fahrt überspringen (ohne Blende) */
  jump(index: number, seconds = 0) {
    this.active = true;
    this.i = ((index % this.shots.length) + this.shots.length) % this.shots.length;
    this.intro = false;
    this.enter();
    this.phase = 'play';
    this.fade = 0;
    this.ph = 0;
    const was = this.paused;
    this.paused = false;
    for (let t = 0; t < seconds; t += 1 / 30) this.update(1 / 30);
    this.paused = was;
  }

  private enter() {
    const s = this.shot;
    const h = this.host;
    const env = h.env;
    env.setState({ time: s.hour });
    env.timeSpeed = 0;
    env.weather.auto = false;
    env.weather.hold(s.weather, true);
    const heading = headingOf(s);
    env.windDir = heading + 0.35;
    // Bühne: der angegebene Ort, wenn er frei ist; sonst auf Ringen darum herum der nächste freie
    const { x, z } = this.freeStage(s, heading);
    const ship = h.ship;
    ship.place(x, z, heading);
    const c = this.ctx;
    c.x0 = x; c.z0 = z; c.h0 = heading; c.run = s.speed * s.length;
    ship.speedCap = s.speed;
    ship.throttle = s.sails;
    ship.sim.sailSet = s.sails;
    ship.speed = s.speed;
    this.turn = 0;
    this.t = 0;
    this.bolt = s.bolts ? 1.4 : 1e9;
    this.phase = 'in';
    this.ph = 0;
    this.fade = 1;
    h.moved(true);
  }

  private freeStage(s: TitleShot, heading: number): { x: number; z: number } {
    const run = s.speed * s.length * 0.5;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const ok = (x: number, z: number) => this.host.free(x, z, CLEAR) && this.host.free(x + fx * run, z + fz * run, CLEAR) && this.host.free(x + fx * run * 2, z + fz * run * 2, CLEAR);
    if (ok(s.stage.x, s.stage.z)) return { x: s.stage.x, z: s.stage.z };
    for (const r of [160, 320, 480, 640]) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const x = s.stage.x + Math.cos(a) * r, z = s.stage.z + Math.sin(a) * r;
        if (ok(x, z)) return { x, z };
      }
    }
    return { x: s.stage.x, z: s.stage.z };
  }

  /** Ein Schritt in Echtzeit (je Bild): Blende, Fahrt des Schiffs, Blitze */
  update(dt: number) {
    if (!this.active || this.paused) return;
    dt = Math.min(dt, 0.05);
    const s = this.shot;
    this.t += dt;
    this.ph += dt;
    if (this.phase === 'in') {
      const len = this.intro ? INTRO_FADE : CUT_IN;
      this.fade = 1 - smooth01(this.ph / len);
      if (this.ph >= len) { this.phase = 'play'; this.ph = 0; this.fade = 0; this.intro = false; }
    } else if (this.phase === 'play') {
      this.fade = 0;
      if (this.t >= s.length) { this.phase = 'out'; this.ph = 0; }
    } else {
      this.fade = smooth01(this.ph / CUT_OUT);
      if (this.ph >= CUT_OUT) { this.i = (this.i + 1) % this.shots.length; this.enter(); return; }
    }
    // Das Schiff segelt: sanft pendelndes Ruder (Schräglage und Heckwelle wie im Spiel)
    const ship = this.host.ship;
    this.turn = s.helm * (0.6 + 0.4 * Math.sin(this.t * 0.45));
    ship.steer(dt, this.turn, this.host.seaEnv(), 1);
    this.host.moved(false);
    if (s.bolts && this.phase !== 'out') {
      this.bolt -= dt;
      if (this.bolt <= 0) { this.bolt = lerp(s.bolts[0], s.bolts[1], Math.random()); this.strike(); }
    }
  }

  /** Blitz vor der Kamera, im Blickfeld (der Himmel flackert, der Donner folgt) */
  private strike() {
    const cam = this.out.eye;
    const yaw = this.camYaw + (Math.random() - 0.5) * 0.9;
    const d = 240 + Math.random() * 260;
    this.host.env.weather.strikeAt(cam, cam.x + Math.sin(yaw) * d, cam.z + Math.cos(yaw) * d);
  }

  /** Kamera für dieses Bild setzen (das Schiff ist schon dargestellt) */
  frame(cam: PerspectiveCamera, aspect: number) {
    const s = this.shot;
    const ship = this.host.ship;
    const g = ship.model.group;
    const c = this.ctx;
    // das Schiff kann neu gebaut worden sein (Klassenwechsel): Maße und Gruppe jedes Bild frisch lesen
    c.group = g; c.helm = ship.model.helm; c.L = ship.cls.L; c.W = ship.cls.W; c.mh = ship.cls.mh;
    c.t = this.t;
    c.u = clamp01(this.t / s.length);
    c.x = g.position.x; c.z = g.position.z; c.h = g.rotation.y;
    c.fx = Math.sin(c.h); c.fz = Math.cos(c.h);
    c.lx = c.fz; c.lz = -c.fx;
    c.fit = fitFor(aspect);
    const o = this.out;
    s.rig(c, o);
    // nie unter die Wellen
    const floor = this.host.sea(o.eye.x, o.eye.z) + 1.2;
    if (o.eye.y < floor) o.eye.y = floor;

    // Öffnungswinkel: Querformat wie angegeben, Hochformat weiter (wie der Grundwinkel der Kamera); nach Fenstergrößen-Änderung nachziehen
    const fov = s.fov * (baseFov(innerWidth, innerHeight) / 55);
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }

    const lay = layoutShift(innerWidth, innerHeight);
    const tanV = Math.tan((fov * Math.PI) / 360);
    const dx = o.look.x - o.eye.x, dy = o.look.y - o.eye.y, dz = o.look.z - o.eye.z;
    const yaw0 = Math.atan2(dx, dz);
    const pitch0 = Math.atan2(dy, Math.hypot(dx, dz));
    const a = lensShift(yaw0, pitch0, lay.ndcX, lay.ndcY, tanV * aspect, tanV);
    // Handkamera: kleine, langsame Schwankungen in Blickrichtung und Neigung
    const t = this.t;
    const sw = s.sway;
    const yaw = a.yaw + (Math.sin(t * 0.71) * 0.0035 + Math.sin(t * 1.37 + 2.1) * 0.002) * sw;
    const pitch = a.pitch + (Math.sin(t * 0.93 + 1.3) * 0.0028 + Math.sin(t * 1.9) * 0.0012) * sw;
    const roll = o.roll + Math.sin(t * 0.5 + 0.7) * 0.007 * sw;
    this.camYaw = yaw;
    const cp = Math.cos(pitch);
    cam.position.copy(o.eye);
    cam.up.set(0, 1, 0);
    cam.lookAt(_tgt.set(o.eye.x + Math.sin(yaw) * cp, o.eye.y + Math.sin(pitch), o.eye.z + Math.cos(yaw) * cp));
    if (roll) cam.rotateZ(roll);
  }
}
