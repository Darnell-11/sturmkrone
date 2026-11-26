// Phase 4.6F: das organische Anime-Rig einer Figur. Läuft nach jedem Animationsschritt und legt über den Clip:
// - Anatomie: Statur je Körperbau (Glieder gleichmäßig um ihr Gelenk dicker/dünner, Schulter- und Hüftbreite, Kopfgröße – ohne Scherung),
//   weiche Gelenke (Hals übernimmt einen Teil der Kopfdrehung, oberer Brustkorb einen Teil der Brustdrehung, Unterarm die halbe Handdrehung,
//   das Schlüsselbein hebt sich, wenn der Arm über die Schulter geht), Hände in Haltungen (offen, Faust, Schwertgriff, Steuerrad, Geste).
// - Leben: Atem, Gewichtsverlagerung mit Fuß-Halt, kleine Bewegungen, Blick-Nachführung (Kopf, Hals, Brust, Augen), Kurvenneigen,
//   federnde Landung, Kampf-Bereitschaft, Haltung (Wache, Fischer, Endboss), Fuß-Anpassung an Rampen und Decks, Gesten im Gespräch.
// - Gesicht: Blinzeln, Mimik, Sprechen (Morph-Ziele der Grundfigur), Augen-Leuchten im Erwachen.
// - Stoff und Haar: Feder-Ketten (clothRig.ts) gegen Beine, Rumpf, Kopf und Boden.
// Keine Speicheranforderung je Bild: alle Hilfswerte sind vorab angelegt. Der Clip-Stand wird nach dem Mischer gesichert und vor dem
// nächsten Mischer-Schritt zurückgesetzt – nichts summiert sich auf, auch wenn ein Clip einen Knochen nicht jedes Mal neu setzt.
import { Object3D, Quaternion, Vector3, type SkinnedMesh } from 'three';
import { ARM_RELAX, BUILDS, FIGURE_POSE, LEG_CAPS, HAND_BLEND, HAND_POSES, LIFE, RIG_BONES, ROT_BUDGET, type BuildId, type ExpressionId, type FigurePose, type HandPoseId, type RigBone, type StanceId } from '../../../data/characterRig';
import { BodyLife, type LifeInput } from './bodyLife';
import { FaceMixer, morphMap, NCH } from './faceRig';
import { ClothRig, type ChainKind, type ClothLayout } from './clothRig';
import { addCapsule, addSphere, makeColliders } from './springChain';
import { CharacterSockets, type SocketMeasures } from './characterSockets';

const IDS = Object.keys(RIG_BONES) as RigBone[];
const NB = IDS.length;
const I = Object.fromEntries(IDS.map((b, i) => [b, i])) as Record<RigBone, number>;
/** Knochen der Ersatzfigur aus Bausteinen (KayKit-Namen, wie three.js sie bereinigt) */
const BLOCK: Partial<Record<RigBone, string>> = {
  hips: 'hips', spine: 'spine', chest: 'chest', head: 'head',
  upperArmL: 'upperarml', lowerArmL: 'lowerarml', handL: 'wristl', upperArmR: 'upperarmr', lowerArmR: 'lowerarmr', handR: 'wristr',
  upperLegL: 'upperlegl', lowerLegL: 'lowerlegl', footL: 'footl', toesL: 'toesl', upperLegR: 'upperlegr', lowerLegR: 'lowerlegr', footR: 'footr', toesR: 'toesr',
};
/** Vom Clip bewegte Knochen: werden nach dem Mischer gesichert und vor dem nächsten Schritt zurückgesetzt */
const ANIMATED: RigBone[] = ['hips', 'spine', 'chest', 'head', 'upperArmL', 'lowerArmL', 'handL', 'upperArmR', 'lowerArmR', 'handR', 'upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR'];
const ANIM_IDX = ANIMATED.map((b) => I[b]);
/** Gelenkkette für die Statur: Eltern je Knochen (Weltumfang = Produkt) */
const PARENT: Partial<Record<RigBone, RigBone>> = {
  spine: 'hips', chest: 'spine', upperChest: 'chest', neck: 'upperChest', head: 'neck',
  shoulderL: 'upperChest', upperArmL: 'shoulderL', lowerArmL: 'upperArmL', handL: 'lowerArmL',
  shoulderR: 'upperChest', upperArmR: 'shoulderR', lowerArmR: 'upperArmR', handR: 'lowerArmR',
  upperLegL: 'hips', lowerLegL: 'upperLegL', footL: 'lowerLegL', upperLegR: 'hips', lowerLegR: 'upperLegR', footR: 'lowerLegR',
};
const FINGERS = ['Index', 'Middle', 'Ring', 'Little', 'Thumb'] as const;

const AX_X = 0, AX_Y = 1, AX_Z = 2;
const _q = new Quaternion(), _q2 = new Quaternion(), _q3 = new Quaternion(), _qd = new Quaternion(), _qi = new Quaternion();
const _v = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3(), _v5 = new Vector3();
const _s = new Vector3();
const _fx = new Vector3(), _fy = new Vector3();
/** Wert auf ±m begrenzen (4.6G: Budget der Zusatz-Drehungen) */
const cap = (x: number, m: number) => (x > m ? m : x < -m ? -m : x);
const IDQ = new Quaternion();

/** Was das Rig von der Figur braucht */
export interface RigHost { holder: Object3D; rig: Object3D }

export interface RigOptions {
  seed: number;
  cloth?: ClothLayout | null;
  measures?: SocketMeasures | null;
  /** Gesichtsnetze mit Morph-Zielen (teilen sich ein Gewichtsfeld) */
  face?: SkinnedMesh[];
}

/**
 * Detailstufen nach Abstand zum Betrachter (m): bis `full` alles (Fuß-Anpassung, Stoff in jedem Schritt), bis `mid` Stoff im halben Takt,
 * bis `life` nur Atem, Blick und Gesicht (Stoff ruht in seiner Ruhelage), darüber nur noch das Gesicht.
 */
const LOD = { full: Math.min(LIFE.foot.range, 22), mid: 48, life: 90 } as const;
/** Körperknochen in Eltern-vor-Kind-Reihenfolge: gezielt aufgefrischt statt der ganzen Figur (Finger, Ketten, Netze, Ausrüstung bleiben) */
const BODY_ORDER: RigBone[] = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'shoulderL', 'upperArmL', 'lowerArmL', 'shoulderR', 'upperArmR', 'lowerArmR', 'upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR'];
const BODY_IDX = BODY_ORDER.map((b) => I[b]);

export class CharacterRig {
  /** Alle Figuren teilen Wind (Welt, m/s) und Betrachter (Kamera) */
  static readonly wind = new Vector3();
  static readonly viewer = new Vector3();
  static viewerOn = false;
  /** Detail-Faktor der Grafikstufe auf die Entfernungen der Detailstufen (Niedrig ≈ 0,5, Hoch 1, Max 1,3) */
  static detail = 1;

  readonly life: BodyLife;
  readonly face: FaceMixer;
  readonly sockets: CharacterSockets;
  readonly cloth: ClothRig | null;
  readonly colliders = makeColliders(12, 2);
  private readonly b: (Object3D | null)[] = new Array(NB).fill(null);
  private readonly restQ: Quaternion[] = [];
  private readonly restP: Vector3[] = [];
  private readonly baseP: Vector3[] = [];
  /** Achsen der Figur (X links, Y oben, Z vorn) im Ruheraum jedes Knochens */
  private readonly ax = new Float32Array(NB * 9);
  private readonly snapQ: Quaternion[] = [];
  private readonly snapHips = new Vector3();
  private snapped = false;
  /** Zuletzt gesetzte Bank-Drehung der Skelett-Wurzel */
  private readonly host: RigHost;
  private readonly fingerB: { l: (Object3D | null)[]; r: (Object3D | null)[] } = { l: [], r: [] };
  private readonly hand = {
    l: { from: new Float32Array(16), to: new Float32Array(16), cur: new Float32Array(16), t: 1, id: 'offen' as HandPoseId, dirty: true },
    r: { from: new Float32Array(16), to: new Float32Array(16), cur: new Float32Array(16), t: 1, id: 'offen' as HandPoseId, dirty: true },
  };
  /** Unterarm-Achse im Handraum und Armachse im Oberarmraum (für Drehungs-Verteilung und Schlüsselbein) */
  private readonly forearmAx = [new Vector3(1, 0, 0), new Vector3(-1, 0, 0)];
  private faceInf: number[] | null = null;
  private morph: Int16Array | null = null;
  private readonly lifeIn: LifeInput = { speed: 0, turn: 0, accel: 0, grounded: true, busy: false, hasLook: false, lookYaw: 0, lookPitch: 0, ready: 0 };
  private readonly look = new Vector3();
  private lookOn = false;
  private readyK = 0;
  /** Bodenabtastung für die Füße (Welt): Höhe unter (x, z) bei einer Läuferhöhe y; null = flacher Boden */
  ground: ((x: number, z: number, y: number) => number) | null = null;
  private readonly footOff = new Float32Array(2);
  private readonly footPitch = new Float32Array(2);
  private readonly ankle = [new Vector3(), new Vector3()];
  private readonly knee = [new Vector3(), new Vector3()];
  private readonly footQ = [new Quaternion(), new Quaternion()];
  private readonly legLen0: number;
  private build: BuildId = 'athletisch';
  private chestOut = 0;
  private chin = 0;
  private gestureT = 0;
  private gestureU = -1;
  private gestureDur = 1;
  private gestureSide = 0;
  private gestureK = 0.6;
  private gestureN = 0;
  /** Figur ist in der Luft (Sprung, Fall) */
  grounded = true;
  /** Ein Clip mit eigener Ganzkörperbewegung läuft (setzt die Figur) */
  busy = false;
  /** 4.6G: ein ruhiger Stand-Clip läuft (Arme dürfen natürlich hängen; setzt die Figur) */
  relaxClip = false;
  /** Mantel oder Jacke: die Arme brauchen etwas Luft (setzt die Figur) */
  coatOn = false;
  /** Einblendung der entspannten Arme (0 … 1) */
  private relaxK = 0;
  /** Zähler für Prüfungen: wie oft ein Drehbudget gegriffen hat */
  budgetHits = 0;
  /** Zusätzliche Vorlage des Oberkörpers (rad, + = nach vorn), z. B. aufrechter Gang */
  extraPitch = 0;
  /**
   * 4.6I: Kino-Pose der Ultimate-Regie (`graphics/ultimateCinematics.ts`, Akt 1): Einblendung k (0 … 1), Kauern (m), Vorlage (rad, + vorn),
   * Blick nach oben (rad), Drehung der Brust (rad, + links). Liegt über Clip und Leben, eigene Grenzen (nicht im Budget des Alltags).
   */
  readonly cine = { k: 0, crouch: 0, lean: 0, look: 0, twist: 0 };
  /** 4.6G.2: Haltung des Geschlechts (FIGURE_POSE) */
  private figure: FigurePose = FIGURE_POSE.male;
  /** Einblendung des Kontraposts (0 … 1), Seite des Standbeins (±1), Gang-Anteil (0 … 1) und Schrittphase (−1 … 1) */
  private contraK = 0;
  private contraSide = 1;
  private walkK = 0;
  private swing = 0;
  /** Zähler für die Prüfungen: ungültige Werte, die das Rig abgefangen hat */
  nanGuards = 0;
  /** Augen-Leuchten (0 … 1) für die Figur (Iris-Material) */
  get glow() { return this.face.glow; }

  constructor(host: RigHost, opts: RigOptions) {
    this.host = host;
    this.life = new BodyLife(opts.seed);
    this.face = new FaceMixer(Math.floor(opts.seed * 1000) + 17);
    const root = host.rig;
    for (let i = 0; i < NB; i++) this.b[i] = root.getObjectByName(RIG_BONES[IDS[i]]) ?? (BLOCK[IDS[i]] ? root.getObjectByName(BLOCK[IDS[i]]!) ?? null : null);
    host.holder.updateWorldMatrix(true, true);
    host.holder.getWorldQuaternion(_q2).invert();
    for (let i = 0; i < NB; i++) {
      const bn = this.b[i];
      this.restQ.push(bn ? bn.quaternion.clone() : new Quaternion());
      this.restP.push(bn ? bn.position.clone() : new Vector3());
      this.baseP.push(bn ? bn.position.clone() : new Vector3());
      this.snapQ.push(new Quaternion());
      if (!bn) continue;
      // Ruhe-Drehung relativ zur Figur → Achsen der Figur im Knochenraum
      bn.getWorldQuaternion(_q).premultiply(_q2).invert();
      _v.set(1, 0, 0).applyQuaternion(_q).toArray(this.ax, i * 9);
      _v.set(0, 1, 0).applyQuaternion(_q).toArray(this.ax, i * 9 + 3);
      _v.set(0, 0, 1).applyQuaternion(_q).toArray(this.ax, i * 9 + 6);
    }
    for (const s of ['l', 'r'] as const) {
      const S = s === 'l' ? 'L' : 'R';
      for (const f of FINGERS) for (let j = 1; j <= 3; j++) this.fingerB[s].push(root.getObjectByName(`J_Bip_${S}_${f}${j}`) ?? null);
      const mid = root.getObjectByName(`J_Bip_${S}_Middle1`);
      if (mid && mid.position.lengthSq() > 1e-10) this.forearmAx[s === 'l' ? 0 : 1].copy(mid.position).normalize();
      for (const k of ['from', 'to', 'cur'] as const) this.poseInto('offen', this.hand[s][k]);
    }
    const hp = this.b[I.hips]?.parent;
    if (hp) {
      hp.getWorldQuaternion(_q).premultiply(_q2).invert();
      _v.set(1, 0, 0).applyQuaternion(_q).toArray(this.hipAx, 0);
      _v.set(0, 1, 0).applyQuaternion(_q).toArray(this.hipAx, 3);
    }
    const ul = this.b[I.upperLegL], ll = this.b[I.lowerLegL];
    this.legLen0 = ul && ll ? ul.getWorldPosition(_v).distanceTo(ll.getWorldPosition(_v2)) / Math.max(1e-6, host.holder.getWorldScale(_v3).x) : 0.4;
    this.cloth = opts.cloth ? new ClothRig(root, opts.cloth, this.colliders) : null;
    this.headBall = opts.cloth?.headBall ?? null;
    this.sockets = new CharacterSockets(host.holder, root, opts.measures ?? null);
    if (opts.face?.length) this.attachFace(opts.face);
  }
  private readonly headBall: [number, number, number, number] | null;
  /** Achsen der Figur (X, Y) im Raum des Hüft-Elternknotens */
  private readonly hipAx = new Float32Array(6);

  // ---------- Einstellungen ----------

  /** Gesichtsnetze verbinden: alle teilen ein Gewichtsfeld; Kanäle über die Namen der Morph-Ziele */
  attachFace(meshes: SkinnedMesh[]) {
    const first = meshes.find((m) => m.morphTargetInfluences?.length);
    if (!first) return;
    const inf = first.morphTargetInfluences!;
    for (const m of meshes) if (m.morphTargetInfluences && m.morphTargetInfluences.length === inf.length) m.morphTargetInfluences = inf;
    this.faceInf = inf;
    this.morph = morphMap(first.morphTargetDictionary);
  }

  /** Anzahl der gefundenen Mimik-Kanäle (Prüfung) */
  get faceChannels() { let n = 0; if (this.morph) for (let i = 0; i < NCH; i++) if (this.morph[i] >= 0) n++; return n; }

  /** Statur anwenden: Umfang je Glied, Schulter- und Hüftbreite, Kopfgröße, Haltung */
  setBuild(id: BuildId) {
    const B = BUILDS[id] ?? BUILDS.athletisch;
    this.build = id;
    this.chestOut = B.chestOut;
    this.chin = B.chin;
    const G = new Float32Array(NB).fill(1);
    const set = (k: RigBone, v: number) => { G[I[k]] = v; };
    set('hips', B.girth.hips); set('spine', B.girth.spine); set('chest', B.girth.chest); set('upperChest', B.girth.chest * B.girth.upperChest);
    set('neck', B.girth.neck); set('head', B.head);
    for (const s of ['L', 'R'] as const) {
      set(`shoulder${s}`, B.girth.chest * B.girth.upperChest);
      set(`upperArm${s}`, B.girth.upperArm); set(`lowerArm${s}`, B.girth.lowerArm); set(`hand${s}`, 1);
      set(`upperLeg${s}`, B.girth.upperLeg); set(`lowerLeg${s}`, B.girth.lowerLeg); set(`foot${s}`, 1);
    }
    for (let i = 0; i < NB; i++) {
      const bn = this.b[i];
      if (!bn) continue;
      const id2 = IDS[i];
      const p = PARENT[id2];
      if (id2 === 'eyeL' || id2 === 'eyeR' || id2 === 'toesL' || id2 === 'toesR') continue;
      const gp = p ? G[I[p]] : 1;
      bn.scale.setScalar(G[i] / gp);
      // Gelenk bleibt am Platz (Weg zum Elternknochen gegen dessen Umfang ausgleichen); Schultern und Hüftgelenke rücken mit der Breite
      const P0 = this.restP[i];
      const out = this.baseP[i].copy(P0).multiplyScalar(1 / gp);
      // Schulterbreite: Schlüsselbein-Ansatz und Schlüsselbein-Länge (Weg zum Oberarm) wachsen seitlich mit
      const wide = id2 === 'shoulderL' || id2 === 'shoulderR' || id2 === 'upperArmL' || id2 === 'upperArmR' ? B.shoulders : id2 === 'upperLegL' || id2 === 'upperLegR' ? B.hips : 1;
      if (p && wide !== 1) {
        const pi = I[p], ax = this.ax;
        _v.set(ax[pi * 9], ax[pi * 9 + 1], ax[pi * 9 + 2]);
        out.addScaledVector(_v, (_v.dot(P0) * (wide - 1)) / gp);
      }
      if (id2 !== 'hips') bn.position.copy(out);
    }
  }

  get buildId() { return this.build; }

  setStance(id: StanceId) { this.life.stance = id; }
  /** 4.6G.2: Haltung je Geschlecht (Kontrapost, Hüftschwung, Arme, Schultern) */
  setFigure(g: 'male' | 'female') { this.figure = FIGURE_POSE[g] ?? FIGURE_POSE.male; }
  get figurePose() { return this.figure; }
  setBreath(k: number) { this.life.breathK = Math.max(0.3, Math.min(2, k)); }
  setMood(id: ExpressionId, k = 1) { this.face.setMood(id, k); }
  setTraits(eyes?: string, brows?: string, mouth?: string) { this.face.setTraits(eyes, brows, mouth); }

  /** Blickziel in Welt (null = geradeaus) */
  lookAt(x: number | null, y = 0, z = 0) {
    if (x === null || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) { this.lookOn = false; return; }
    this.look.set(x, y, z);
    this.lookOn = true;
  }

  setReady(k: number) { this.readyK = k; }

  /** Bewegung aus dem Logikschritt: Drehtempo (rad/s), Tempo (m/s), Beschleunigung (m/s²) */
  motion(turn: number, speed: number, accel: number) {
    const i = this.lifeIn;
    i.turn = Number.isFinite(turn) ? turn : 0;
    i.speed = Number.isFinite(speed) ? speed : 0;
    i.accel = Number.isFinite(accel) ? accel : 0;
  }

  /** Landung nach Sprung oder Sturz (Aufprall m/s): Knie federn ein, Stoff schwingt nach */
  land(impact: number) {
    this.life.land(impact);
    if (impact > 3) this.cloth?.kick(0, -Math.min(6, impact * 0.6), 0);
  }

  /** Stoß auf Stoff und Haar (Welt, m/s) */
  kick(vx: number, vy: number, vz: number) { this.cloth?.kick(vx, vy, vz); }
  /** Druckwelle (Welt) auf Stoff und Haar */
  blast(x: number, y: number, z: number, radius: number, strength: number) { this.cloth?.blast(x, y, z, radius, strength); }

  /** Sprechen (Mund und Gesten) für sec Sekunden; gesture = Neigung zu gestikulieren (0 … 1) */
  talk(sec: number, gesture = 0.6) { this.face.talk(sec); this.gestureK = gesture; if (sec <= 0) this.gestureU = -1; }

  /** Handhaltung einer Seite weich wechseln */
  setHand(side: 'l' | 'r', id: HandPoseId, instant = false) {
    const h = this.hand[side];
    if (h.id === id && !instant) return;
    h.id = id;
    h.from.set(h.cur);
    this.poseInto(id, h.to);
    h.t = instant ? 1 : 0;
    if (instant) h.cur.set(h.to);
    h.dirty = true;
  }
  handPose(side: 'l' | 'r') { return this.hand[side].id; }

  private poseInto(id: HandPoseId, out: Float32Array) {
    const p = HAND_POSES[id] ?? HAND_POSES.offen;
    for (let f = 0; f < 4; f++) for (let k = 0; k < 4; k++) out[f * 4 + k] = p.fingers[f][k];
    for (let k = 0; k < 4; k++) out[16 - 4 + k] = p.thumb[k];
  }

  /** Welche Ketten schwingen (Kleidung, die die Figur trägt) */
  setWorn(kind: ChainKind, on: boolean) { this.cloth?.setWorn(kind, on); }

  // ---------- je Schritt ----------

  /** Vor dem Mischer: Clip-Stand des letzten Schritts wiederherstellen (alles vom Rig Gesetzte fällt weg) */
  restore() {
    if (!this.snapped) return;
    for (let k = 0; k < ANIM_IDX.length; k++) { const i = ANIM_IDX[k], bn = this.b[i]; if (bn) bn.quaternion.copy(this.snapQ[i]); }
    const hips = this.b[I.hips];
    if (hips) hips.position.copy(this.snapHips);
  }

  /** Nach dem Mischer: Clip-Stand sichern */
  snapshot() {
    for (let k = 0; k < ANIM_IDX.length; k++) { const i = ANIM_IDX[k], bn = this.b[i]; if (bn) this.snapQ[i].copy(bn.quaternion); }
    const hips = this.b[I.hips];
    if (hips) this.snapHips.copy(hips.position);
    this.snapped = true;
  }

  /** Zusatz-Drehung auf ihr Budget begrenzen (zählt Treffer für die Prüfungen) */
  private budget(x: number, m: number) {
    if (x > m || x < -m) this.budgetHits++;
    return cap(x, m);
  }

  /** Einblendung der entspannten Arme (Prüfungen) */
  get armRelax() { return this.relaxK; }

  /** Drehung um eine Achse der Figur im Ruheraum des Knochens (hinten anmultipliziert) */
  private rot(i: number, axis: number, angle: number) {
    const bn = this.b[i];
    if (!bn || angle === 0 || !Number.isFinite(angle)) return;
    const o = i * 9 + axis * 3;
    _v.set(this.ax[o], this.ax[o + 1], this.ax[o + 2]);
    bn.quaternion.multiply(_q.setFromAxisAngle(_v, angle));
  }

  /** Drehung um eine Achse der Figur als eigene Quaternion (Knochenraum) */
  private axisQ(i: number, axis: number, angle: number, out: Quaternion) {
    const o = i * 9 + axis * 3;
    _v.set(this.ax[o], this.ax[o + 1], this.ax[o + 2]);
    return out.setFromAxisAngle(_v, angle);
  }

  /**
   * Alle Schichten anwenden (nach Mischer und Gang-Dämpfung). dt in Sekunden.
   * Gibt das Augen-Leuchten zurück (die Figur färbt die Iris).
   */
  /** Weltmatrizen der Körperknochen auffrischen (Eltern zuerst); die Kette über der Hüfte (Halter, Wurzel) einmal von oben */
  private refreshBody() {
    const hips = this.b[I.hips];
    if (!hips?.parent) { this.host.rig.updateMatrixWorld(true); return; }
    hips.parent.updateWorldMatrix(true, false);
    for (let k = 0; k < BODY_IDX.length; k++) {
      const bn = this.b[BODY_IDX[k]];
      if (!bn || !bn.parent) continue;
      bn.updateMatrix();
      bn.matrixWorld.multiplyMatrices(bn.parent.matrixWorld, bn.matrix);
    }
  }

  private clothSkip = 0;

  apply(dt: number) {
    if (!(dt > 0)) return;
    const holder = this.host.holder, rig = this.host.rig;
    holder.updateWorldMatrix(true, false);
    // Entfernung zum Betrachter: ferne Figuren rechnen weniger (siehe LOD)
    let dist = 0;
    if (CharacterRig.viewerOn) dist = _v4.setFromMatrixPosition(holder.matrixWorld).distanceTo(CharacterRig.viewer);
    const dk = CharacterRig.detail;
    const near = dist < LOD.life * dk, mid = dist < LOD.mid * dk, full = dist < LOD.full * dk;
    // Clip-Stand der Körperknochen frisch (nur in der Nähe: Fuß-Anpassung, Schlüsselbein, Blick vom Kopf aus); weiter weg genügt das letzte Bild
    if (mid) this.refreshBody();
    const inp = this.lifeIn;
    inp.grounded = this.grounded;
    inp.busy = this.busy;
    inp.ready = this.readyK;
    // Blickziel relativ zur Figur (vom Kopf aus)
    inp.hasLook = false;
    const head = this.b[I.head];
    holder.matrixWorld.decompose(_v5, _q2, _s);
    const hs = _s.x;
    if (this.lookOn && head && near) {
      _v3.copy(this.look).sub(_v2.setFromMatrixPosition(head.matrixWorld));
      _v3.applyQuaternion(_qi.copy(_q2).invert());
      const h = Math.hypot(_v3.x, _v3.z);
      if (h > 0.05) {
        inp.hasLook = true;
        inp.lookYaw = Math.atan2(_v3.x, _v3.z);
        inp.lookPitch = Math.atan2(_v3.y, h);
      }
    }
    const o = this.life.update(dt, inp);
    if (o.saccade && Math.random() < 0.6) this.face.blink.trigger();
    // Kurvenneigen und Sprint-Vorlage: die ganze Figur kippt um die Füße (wirkt ab dem nächsten Durchlauf)
    // 4.6G: Kurvenneigen begrenzt (bis 17° wirkte die Figur wie umgeweht)
    if (near) rig.rotation.set(cap(o.bankPitch, ROT_BUDGET.bankPitch) * (this.grounded ? 1 : 0.3), 0, -cap(o.bankRoll, ROT_BUDGET.bankRoll));
    else rig.rotation.set(0, 0, 0);
    // Füße für die Beinführung merken (Clip-Stand nach der Gang-Dämpfung)
    const feetOn = full && this.grounded && inp.speed < 4.5;
    if (feetOn) for (let s = 0; s < 2; s++) {
      const ft = this.b[s ? I.footR : I.footL], kn = this.b[s ? I.lowerLegR : I.lowerLegL];
      if (!ft || !kn) continue;
      ft.matrixWorld.decompose(this.ankle[s], this.footQ[s], _s);
      this.knee[s].setFromMatrixPosition(kn.matrixWorld);
    }
    let fresh = false;
    if (near) {
      this.figureStep(dt, inp.speed, holder);
      this.bodyLayers(dt, o);
      this.cineLayer();
      // Hüfte: Pendeln, Kauern, Landung, Bodenausgleich – danach die Beine zu den gemerkten Füßen führen
      const hips = this.b[I.hips];
      let drop = 0;
      if (feetOn && this.ground) drop = this.sampleFeet(dt);
      else { this.footOff[0] *= 0.8; this.footOff[1] *= 0.8; this.footPitch[0] *= 0.8; this.footPitch[1] *= 0.8; }
      const dy = -o.crouch - this.cine.k * this.cine.crouch + o.landDip + drop;
      if (hips && hips.parent && (Math.abs(o.hipX) > 1e-4 || Math.abs(dy) > 1e-4)) {
        // im Raum des Hüft-Elternknotens (Achsen der Figur aus der Ruhelage): ohne Weltmatrizen, nichts summiert sich auf
        const a = this.hipAx, u = this.posUnit(hips);
        hips.position.x += (a[0] * o.hipX + a[3] * dy) * u;
        hips.position.y += (a[1] * o.hipX + a[4] * dy) * u;
        hips.position.z += (a[2] * o.hipX + a[5] * dy) * u;
      }
      // 4.6G.2: Kontrapost und Hüftschwung (weiblich) über das Pendeln der Hüfte; die Fußführung danach hält die Füße am Boden
      const fp = this.figure;
      const hipRoll = o.hipRoll * fp.sway + this.contraK * fp.contra * this.contraSide + this.walkK * fp.walkRoll * this.swing;
      this.rot(I.hips, AX_Z, this.budget(hipRoll, ROT_BUDGET.spineRoll * 1.6));
      if (this.walkK > 0.01 && fp.walkYaw) this.rot(I.hips, AX_Y, this.walkK * fp.walkYaw * this.swing);
      if (mid) { this.refreshBody(); fresh = true; }
      if (feetOn) this.legs(_q2, hs);
    }
    this.hands(dt);
    this.faceStep(dt);
    // Stoff und Haar: nah in jedem Schritt, mittlere Entfernung im halben Takt, weiter weg in Ruhelage
    const cl = this.cloth;
    if (cl) {
      if (mid) {
        this.clothSkip = full ? 0 : this.clothSkip + 1;
        if (full || (this.clothSkip & 1) === 0) {
          if (!fresh) this.refreshBody();
          this.fillColliders(holder);
          cl.update(full ? dt : dt * 2, CharacterRig.wind.x, CharacterRig.wind.z);
        }
      } else cl.snap();
    }
    void rig;
  }

  /**
   * 4.6G.2: Schrittphase aus den Knien (vorderes gegen hinteres Knie entlang der Blickrichtung, −1 … 1) und Gang-Anteil aus dem Tempo; im ruhigen
   * Stand blendet der Kontrapost ein (Standbein wechselt mit dem Pendeln der Hüfte). Ohne Speicheranforderung, nur nah an der Kamera.
   */
  private figureStep(dt: number, speed: number, holder: Object3D) {
    const fp = this.figure;
    if (!fp.contra && !fp.walkYaw) { this.contraK = 0; this.walkK = 0; return; }
    const kl = this.b[I.lowerLegL], kr = this.b[I.lowerLegR];
    const k = Math.min(1, dt * 6);
    const walking = this.grounded && !this.busy ? Math.min(1, Math.max(0, (speed - 0.4) / 1.4)) * (speed < 6 ? 1 : 0.5) : 0;
    this.walkK += (walking - this.walkK) * k;
    if (kl && kr && this.walkK > 0.01) {
      const e = holder.matrixWorld.elements;
      const fl = Math.hypot(e[8], e[9], e[10]) || 1;
      _v.setFromMatrixPosition(kl.matrixWorld).sub(_v2.setFromMatrixPosition(kr.matrixWorld));
      const d = (_v.x * e[8] + _v.y * e[9] + _v.z * e[10]) / fl;
      const sw = d / Math.max(1e-4, this.legLen0 * (Math.hypot(e[0], e[1], e[2]) || 1) * 0.9);
      this.swing += ((sw > 1 ? 1 : sw < -1 ? -1 : sw) - this.swing) * Math.min(1, dt * 18);
    } else this.swing *= 0.9;
    const calm = this.relaxClip && !this.busy && this.readyK < 0.5 && this.walkK < 0.2 ? 1 : 0;
    this.contraK += (calm - this.contraK) * Math.min(1, dt * 1.6);
    // Standbein wechselt selten (mit dem langsamen Pendeln), nie mitten im Schritt
    if (this.contraK < 0.05) this.contraSide = this.swing >= 0 ? 1 : -1;
  }

  /** Oberkörper, Kopf, Arme: Gelenk-Verteilung, Atem, Blick, Haltung, kleine Bewegungen, Gesten */
  private bodyLayers(dt: number, o: ReturnType<BodyLife['update']>) {
    const S = LIFE.spread, sh = LIFE.look.share;
    const b = this.b;
    // Brust → oberer Brustkorb: ein Teil der Clip-Biegung wandert eine Etage höher (keine Knickstelle unter den Schultern)
    const ch = b[I.chest], uc = b[I.upperChest];
    if (ch && uc) {
      _qd.copy(this.restQ[I.chest]).invert().multiply(ch.quaternion); // D
      _q3.copy(IDQ).slerp(_qd, S.upperChest); // D^s
      ch.quaternion.copy(this.restQ[I.chest]).multiply(_q.copy(IDQ).slerp(_qd, 1 - S.upperChest));
      uc.quaternion.copy(_q3).multiply(this.restQ[I.upperChest]);
      uc.position.copy(this.baseP[I.upperChest]);
      // Atem: Brustkorb hebt sich und kippt leicht zurück
      const ui = I.upperChest, ax = this.ax;
      _v.set(ax[ui * 9 + 3], ax[ui * 9 + 4], ax[ui * 9 + 5]);
      const unit = this.posUnit(uc);
      uc.position.addScaledVector(_v, o.chestLift * unit);
      // 4.6G: jede Summe aus Atem, Blick, Haltung und Vorlage hat ihr Budget (ROT_BUDGET) – sonst verdrehte Korkenzieher-Posen
      this.rot(ui, AX_X, this.budget(o.chestPitch + (o.chestFwd - this.chestOut) * 0.4 + o.lookPitch * -sh.upperChest, ROT_BUDGET.upperChestPitch));
      this.rot(ui, AX_Y, this.budget(o.lookYaw * sh.upperChest, ROT_BUDGET.upperChestYaw));
    }
    // Wirbelsäule und Brust: Blickanteil, Gegenbewegung zur Hüfte, Vorlage (Bereitschaft, Landung)
    const fp = this.figure;
    const contra = this.contraK * fp.contra * this.contraSide * fp.contraCounter;
    this.rot(I.spine, AX_Z, this.budget(o.counterRoll * 0.6 * fp.sway - contra * 0.6, ROT_BUDGET.spineRoll));
    this.rot(I.spine, AX_X, this.budget((o.chestFwd - this.chestOut) * 0.35 + o.landLean * 0.6 - o.lookPitch * sh.spine + this.extraPitch * 0.55, ROT_BUDGET.spinePitch));
    this.rot(I.spine, AX_Y, this.budget(o.lookYaw * sh.spine, ROT_BUDGET.spineYaw));
    this.rot(I.chest, AX_Z, this.budget(o.counterRoll * 0.4 * fp.sway - contra * 0.4, ROT_BUDGET.chestRoll));
    if (this.walkK > 0.01 && fp.walkCounter) this.rot(I.chest, AX_Y, -this.walkK * fp.walkCounter * this.swing);
    this.rot(I.chest, AX_X, this.budget((o.chestFwd - this.chestOut) * 0.25 + o.landLean * 0.4 - o.lookPitch * sh.chest + this.extraPitch * 0.45, ROT_BUDGET.chestPitch));
    this.rot(I.chest, AX_Y, this.budget(o.lookYaw * sh.chest, ROT_BUDGET.chestYaw));
    // Kopf → Hals: Teil der Kopfdrehung im Hals (weicher Nacken statt Knick am Schädelansatz)
    const nk = b[I.neck], hd = b[I.head];
    if (nk && hd) {
      const Hr = this.restQ[I.head];
      _qd.copy(Hr).invert().multiply(hd.quaternion); // D
      _q3.copy(IDQ).slerp(_qd, S.neck); // D^s
      // Hals = N_ruhe · (H_ruhe · D^s · H_ruhe⁻¹), Kopf = H_ruhe · D^(1−s)
      nk.quaternion.copy(this.restQ[I.neck]).multiply(_q.copy(Hr).multiply(_q3).multiply(_qi.copy(Hr).invert()));
      hd.quaternion.copy(Hr).multiply(_q2.copy(IDQ).slerp(_qd, 1 - S.neck));
      this.rot(I.neck, AX_Y, this.budget(o.lookYaw * sh.neck, ROT_BUDGET.neckYaw));
      this.rot(I.neck, AX_X, this.budget(-o.lookPitch * sh.neck, ROT_BUDGET.neckPitch));
    }
    // Gesten im Gespräch: Nicken
    const g = this.gesture(dt, o.idleK);
    this.rot(I.head, AX_Y, this.budget(o.lookYaw * sh.head + o.headYaw, ROT_BUDGET.headYaw));
    this.rot(I.head, AX_X, this.budget(-o.lookPitch * sh.head + o.headPitch + (this.chin + o.chin + fp.chin) + g.nod, ROT_BUDGET.headPitch));
    // 4.6G: entspannte Arme im Stand – Frontalebene der Figur (Weltachsen des Halters)
    const relaxOn = this.relaxClip && !this.busy && this.readyK < 0.5;
    this.relaxK += ((relaxOn ? 1 : 0) - this.relaxK) * Math.min(1, dt * ARM_RELAX.speed);
    if (this.relaxK > 0.01) {
      const e = this.host.holder.matrixWorld.elements;
      _fx.set(e[0], e[1], e[2]).normalize();
      _fy.set(e[4], e[5], e[6]).normalize();
    }
    // Schlüsselbeine: heben sich mit dem Atem und wenn der Arm über die Schulter geht; der Oberarm behält seine Richtung
    for (let s = 0; s < 2; s++) {
      const si = s ? I.shoulderR : I.shoulderL, ui = s ? I.upperArmR : I.upperArmL, li = s ? I.lowerArmR : I.lowerArmL;
      const cl = b[si], ua = b[ui], la = b[li];
      if (!ua) continue;
      let lift = o.shoulderLift + o.shoulders + fp.shoulders;
      if (la) {
        _v2.setFromMatrixPosition(ua.matrixWorld);
        _v3.setFromMatrixPosition(la.matrixWorld).sub(_v2);
        const len = _v3.length();
        if (len > 1e-5) {
          const elev = Math.acos(Math.max(-1, Math.min(1, -_v3.y / len)));
          lift += Math.min(0.42, Math.max(0, elev - S.clavicleFrom) * S.clavicle);
        }
      }
      if (cl) {
        this.axisQ(si, AX_Z, s ? -lift : lift, _qd);
        cl.quaternion.copy(this.restQ[si]).multiply(_qd);
        // Oberarm = C⁻¹ · U (gleiche Weltrichtung, nur das Gelenk wandert mit)
        ua.quaternion.premultiply(_qi.copy(_qd).invert());
      }
      // kleine Armbewegung, Deckung in Bereitschaft, Gesten
      const ga = g.side === s ? g.arm : g.side === 2 ? g.arm * 0.7 : 0;
      // 4.6G: Arm aus der steifen A-Haltung des Clips natürlich herabhängen lassen (Abspreizung auf das Ziel der Statur), Ellbogen leicht
      // gebeugt; mit einer Waffe in der Hand nur teilweise, während einer Geste gar nicht
      let relax = 0;
      if (this.relaxK > 0.01 && la && ga <= 0) {
        _v2.setFromMatrixPosition(ua.matrixWorld);
        _v3.setFromMatrixPosition(la.matrixWorld).sub(_v2);
        const out = (s ? -1 : 1) * _v3.dot(_fx), down = -_v3.dot(_fy);
        const abd = Math.atan2(out, Math.max(1e-4, down));
        const target = Math.max(0.06, (ARM_RELAX.target[this.build] ?? 0.16) + (this.coatOn ? ARM_RELAX.coat : 0) - fp.armIn);
        const k = this.relaxK * (this.hand[s ? 'r' : 'l'].id === 'griff' ? ARM_RELAX.armed : 1);
        relax = Math.min(ARM_RELAX.max, Math.max(0, abd - target)) * k;
        if (relax > 0) this.rot(li, AX_X, -ARM_RELAX.elbow * k);
      }
      this.rot(ui, AX_X, (s ? o.armR : o.armL) - o.guard - ga * 0.55);
      this.rot(ui, AX_Z, (s ? 1 : -1) * (o.guard * 0.4 + ga * 0.25 + relax));
      if (ga > 0 && la) this.rot(li, AX_X, -ga * 0.95);
    }
    // Unterarm übernimmt die halbe Drehung der Hand um die Armachse (kein verdrehtes „Bonbonpapier“ am Handgelenk)
    for (let s = 0; s < 2; s++) {
      const hi = s ? I.handR : I.handL, li = s ? I.lowerArmR : I.lowerArmL;
      const hn = b[hi], ln = b[li];
      if (!hn || !ln) continue;
      const Hr = this.restQ[hi];
      _qd.copy(Hr).invert().multiply(hn.quaternion); // D
      const a = this.forearmAx[s];
      const d = _qd.x * a.x + _qd.y * a.y + _qd.z * a.z;
      _q.set(a.x * d, a.y * d, a.z * d, _qd.w);
      const l = Math.hypot(_q.x, _q.y, _q.z, _q.w);
      if (l < 1e-6) continue;
      _q.x /= l; _q.y /= l; _q.z /= l; _q.w /= l; // Drehanteil T
      _q2.copy(IDQ).slerp(_q, S.forearmTwist); // T^h
      // Unterarm' = L · (H_ruhe · T^h · H_ruhe⁻¹), Hand' = H_ruhe · T^−h · D
      ln.quaternion.multiply(_q3.copy(Hr).multiply(_q2).multiply(_qi.copy(Hr).invert()));
      hn.quaternion.copy(Hr).multiply(_q2.invert()).multiply(_qd);
    }
    // Augen eilen dem Kopf voraus
    for (const ei of [I.eyeL, I.eyeR]) {
      const e = b[ei];
      if (!e) continue;
      e.quaternion.copy(this.restQ[ei]).multiply(this.axisQ(ei, AX_Y, o.eyeYaw, _q)).multiply(this.axisQ(ei, AX_X, -o.eyePitch, _q2));
    }
  }

  /**
   * 4.6I: Kino-Pose (Akt 1 der Ultimate-Regie) über Clip und Leben: Vorlage verteilt auf Wirbelsäule und Brust, Drehung der Brust, Blick zum
   * Himmel über den Kopf. Eigene Grenzen (0,6 / 0,7 / 0,8 rad) – die Pose ist kurz und bewusst ausdrucksstärker als der Alltag.
   */
  private cineLayer() {
    const c = this.cine;
    if (!(c.k > 0.001)) return;
    const k = Math.min(1, c.k);
    if (c.lean) { this.rot(I.spine, AX_X, cap(k * c.lean * 0.5, 0.6)); this.rot(I.chest, AX_X, cap(k * c.lean * 0.45, 0.6)); }
    if (c.twist) this.rot(I.chest, AX_Y, cap(k * c.twist, 0.7));
    if (c.look) this.rot(I.head, AX_X, cap(-k * c.look, 0.8));
  }

  /** Knocheneinheiten je Meter der Figur am Ort eines Knochens (Weltmaß des Elternknochens gegen die Figur) */
  private posUnit(bn: Object3D) {
    const p = bn.parent;
    if (!p) return 1;
    const e = p.matrixWorld.elements, h = this.host.holder.matrixWorld.elements;
    const ps = Math.hypot(e[0], e[1], e[2]), hs = Math.hypot(h[0], h[1], h[2]);
    return hs / Math.max(1e-6, ps);
  }

  /** Gesten-Hüllkurve: Arm heben, Hand öffnen, Nicken (nur im Gespräch und im Stand) */
  private gesture(dt: number, idle: number): { arm: number; nod: number; side: number } {
    const G = this.gestureOut;
    G.arm = 0; G.nod = 0; G.side = this.gestureSide;
    if (!this.face.talking || idle < 0.3) { this.gestureU = -1; return G; }
    this.gestureT -= dt;
    if (this.gestureU < 0 && this.gestureT <= 0) {
      // nächste Geste: Hand, beide Hände oder nur Nicken
      this.gestureN++;
      const r = (Math.sin(this.gestureN * 91.7 + this.life.exert) * 0.5 + 0.5);
      if (r < this.gestureK) {
        this.gestureU = 0;
        this.gestureDur = 0.9 + r * 0.9;
        this.gestureSide = r < this.gestureK * 0.45 ? 1 : r < this.gestureK * 0.8 ? 0 : 2;
        this.setHand(this.gestureSide === 0 ? 'l' : 'r', r < 0.15 ? 'zeigen' : 'geste');
        if (this.gestureSide === 2) this.setHand('l', 'geste');
      }
      this.gestureT = 0.6 + r * 1.4;
    }
    if (this.gestureU >= 0) {
      this.gestureU += dt / this.gestureDur;
      if (this.gestureU >= 1) { this.gestureU = -1; this.setHand('l', 'offen'); this.setHand('r', 'offen'); }
      else G.arm = Math.sin(this.gestureU * Math.PI) * idle;
    }
    G.side = this.gestureSide;
    G.nod = Math.sin(this.gestureN * 2.1 + this.gestureT * 6) * 0.035 * idle;
    return G;
  }
  private readonly gestureOut = { arm: 0, nod: 0, side: 0 };

  /** Boden unter beiden Füßen: Ausgleich je Fuß (geglättet); Rückgabe = wie weit die Hüfte sinken muss (m der Figur) */
  private sampleFeet(dt: number): number {
    const g = this.ground!;
    const e = this.host.holder.matrixWorld.elements;
    const baseY = e[13];
    const k = 1 - Math.exp(-LIFE.foot.smooth * dt);
    const max = LIFE.foot.maxStep;
    const fl = Math.hypot(e[8], e[9], e[10]) || 1;
    const fx = e[8] / fl, fz = e[10] / fl;
    for (let s = 0; s < 2; s++) {
      const a = this.ankle[s];
      let h = g(a.x, a.z, baseY + 0.3);
      let off = Number.isFinite(h) ? h - baseY : 0;
      off = off > max ? max : off < -max ? -max : off;
      this.footOff[s] += (off - this.footOff[s]) * k;
      // Neigung des Bodens unter dem Fuß (vorn gegen hinten)
      const hf = g(a.x + fx * 0.12, a.z + fz * 0.12, baseY + 0.3);
      h = Number.isFinite(h) ? h : baseY;
      const pitch = Number.isFinite(hf) ? Math.atan2(hf - h, 0.12) : 0;
      this.footPitch[s] += ((pitch > 0.5 ? 0.5 : pitch < -0.5 ? -0.5 : pitch) - this.footPitch[s]) * k;
    }
    return Math.min(0, this.footOff[0], this.footOff[1]);
  }

  /** Zwei-Knochen-Führung beider Beine zu den gemerkten Füßen (plus Bodenausgleich), Fußdrehung wie im Clip (plus Bodenneigung) */
  private legs(holderQ: Quaternion, hs: number) {
    for (let s = 0; s < 2; s++) {
      const up = this.b[s ? I.upperLegR : I.upperLegL], lo = this.b[s ? I.lowerLegR : I.lowerLegL], ft = this.b[s ? I.footR : I.footL];
      if (!up || !lo || !ft) continue;
      const S0 = _v.setFromMatrixPosition(up.matrixWorld);
      const K0 = _v2.setFromMatrixPosition(lo.matrixWorld);
      const A0 = _v3.setFromMatrixPosition(ft.matrixWorld);
      const a = S0.distanceTo(K0), bl = K0.distanceTo(A0);
      // Ziel: gemerkter Knöchel, um den Bodenausgleich angehoben
      const T = _v4.copy(this.ankle[s]);
      T.y += this.footOff[s] * hs;
      const dir = T.sub(S0);
      const dist = Math.min(Math.max(dir.length(), 0.05), (a + bl) * 0.999);
      if (!Number.isFinite(dist) || !(a > 1e-5) || !(bl > 1e-5)) { this.nanGuards++; continue; }
      dir.normalize();
      // Knie zeigt dorthin, wohin es im Clip zeigte
      const hint = _v2.copy(this.knee[s]).sub(S0);
      hint.addScaledVector(dir, -hint.dot(dir));
      if (hint.lengthSq() < 1e-8) hint.set(0, 0, 1).applyQuaternion(holderQ);
      hint.normalize();
      const x = (a * a - bl * bl + dist * dist) / (2 * dist);
      const h = Math.sqrt(Math.max(0, a * a - x * x));
      // Kniepunkt = S + dir·x + hint·h; Ziel des Knöchels = S + dir·dist
      const kx = S0.x + dir.x * x + hint.x * h, ky = S0.y + dir.y * x + hint.y * h, kz = S0.z + dir.z * x + hint.z * h;
      const tx = S0.x + dir.x * dist, ty = S0.y + dir.y * dist, tz = S0.z + dir.z * dist;
      this.aim(up, lo, kx, ky, kz);
      this.aim(lo, ft, tx, ty, tz);
      // Fuß: Weltdrehung wie im Clip, dazu die Neigung des Bodens (um die Querachse der Figur)
      _q.copy(this.footQ[s]);
      if (this.footPitch[s] !== 0) { _v5.set(1, 0, 0).applyQuaternion(holderQ); _q.premultiply(_q3.setFromAxisAngle(_v5, -this.footPitch[s])); }
      if (ft.parent) { ft.parent.matrixWorld.decompose(_v5, _qi, _s); ft.quaternion.copy(_qi.invert().multiply(_q)); ft.updateMatrixWorld(true); }
    }
  }

  /** Knochen so drehen, dass sein Kind auf den Punkt zeigt (Welt) */
  private aim(bone: Object3D, child: Object3D, x: number, y: number, z: number) {
    // Weltlagen sind frisch (Durchlauf vor der Beinführung; jeder Schritt hier frischt seine Kinder auf)
    _v5.setFromMatrixPosition(bone.matrixWorld);
    _v4.setFromMatrixPosition(child.matrixWorld).sub(_v5);
    const l1 = _v4.length();
    _v5.set(x - _v5.x, y - _v5.y, z - _v5.z);
    const l2 = _v5.length();
    if (l1 < 1e-6 || l2 < 1e-6) return;
    _v4.multiplyScalar(1 / l1); _v5.multiplyScalar(1 / l2);
    _qd.setFromUnitVectors(_v4, _v5);
    bone.matrixWorld.decompose(_v4, _qi, _s);
    _qd.multiply(_qi);
    if (bone.parent) { bone.parent.matrixWorld.decompose(_v4, _qi, _s); bone.quaternion.copy(_qi.invert().multiply(_qd)); } else bone.quaternion.copy(_qd);
    bone.updateMatrixWorld(true);
  }

  /** Finger: weich zwischen Haltungen überblenden (nur während eines Wechsels geschrieben) */
  private hands(dt: number) {
    for (const side of ['l', 'r'] as const) {
      const h = this.hand[side];
      if (!h.dirty) continue;
      h.t = Math.min(1, h.t + dt / HAND_BLEND);
      const u = h.t * h.t * (3 - 2 * h.t);
      for (let k = 0; k < 16; k++) h.cur[k] = h.from[k] + (h.to[k] - h.from[k]) * u;
      this.writeFingers(side, h.cur);
      if (h.t >= 1) h.dirty = false;
    }
  }

  /**
   * Fingerknochen setzen. Ruhelage der Grundfigur: Finger links entlang −X, rechts entlang +X, Handfläche unten; Beugen um die lokale Z-Achse
   * (Vorzeichen je Seite), Spreizen um Y, Daumen beugt um X und stellt sich um Y der Handfläche gegenüber.
   */
  private writeFingers(side: 'l' | 'r', p: Float32Array) {
    const B = this.fingerB[side];
    const sg = side === 'l' ? 1 : -1;
    for (let f = 0; f < 4; f++) for (let j = 0; j < 3; j++) {
      const bn = B[f * 3 + j];
      if (!bn) continue;
      bn.quaternion.setFromAxisAngle(_v.set(0, 0, 1), sg * p[f * 4 + j]);
      if (j === 0 && p[f * 4 + 3] !== 0) bn.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 1, 0), sg * p[f * 4 + 3]));
    }
    for (let j = 0; j < 3; j++) {
      const bn = B[12 + j];
      if (!bn) continue;
      bn.quaternion.setFromAxisAngle(_v.set(1, 0, 0), -p[12 + j]);
      if (j === 0) bn.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 1, 0), -sg * p[15] * 0.45));
    }
  }

  private faceStep(dt: number) {
    const w = this.face.update(dt);
    const inf = this.faceInf, mp = this.morph;
    if (!inf || !mp) return;
    for (let i = 0; i < NCH; i++) { const k = mp[i]; if (k >= 0) inf[k] = w[i]; }
  }

  /** Kollisionskörper aus dem Skelett: Beine, Rumpf, Hals, Kopf, Boden */
  private fillColliders(holder: Object3D) {
    const c = this.colliders, b = this.b;
    c.nCaps = 0; c.nSph = 0;
    const ul = b[I.upperLegL], ll = b[I.lowerLegL];
    // Maßstab der Figur gegenüber der Vorlage (Größe, Endboss): aus der Oberschenkellänge
    const k = ul && ll ? _v.setFromMatrixPosition(ul.matrixWorld).distanceTo(_v2.setFromMatrixPosition(ll.matrixWorld)) / Math.max(1e-6, this.legLen0) : 1;
    const G = BUILDS[this.build]?.girth;
    const cap = (a: number, bI: number, r: number) => {
      const A = b[a], B2 = b[bI];
      if (!A || !B2) return;
      _v.setFromMatrixPosition(A.matrixWorld); _v2.setFromMatrixPosition(B2.matrixWorld);
      addCapsule(c, _v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z, r * k);
    };
    // 4.6G.2: Beine samt Hose und Stiefelschaft (vorher nur die Haut: Stulpen und Knie stachen durch Mantel und Umhang)
    cap(I.upperLegL, I.lowerLegL, LEG_CAPS.upper * (G?.upperLeg ?? 1)); cap(I.lowerLegL, I.footL, LEG_CAPS.lower * (G?.lowerLeg ?? 1));
    cap(I.upperLegR, I.lowerLegR, LEG_CAPS.upper * (G?.upperLeg ?? 1)); cap(I.lowerLegR, I.footR, LEG_CAPS.lower * (G?.lowerLeg ?? 1));
    cap(I.hips, b[I.upperChest] ? I.upperChest : I.chest, 0.1 * (G?.chest ?? 1));
    cap(I.neck, I.head, 0.045);
    // 4.6G: leere Mantelärmel liegen an den Armen an (nur dann: vier Kapseln mehr kosten jede Kette Rechenzeit)
    if (this.cloth?.isOn('sleeves')) {
      cap(I.upperArmL, I.lowerArmL, 0.045 * (G?.upperArm ?? 1)); cap(I.lowerArmL, I.handL, 0.036 * (G?.lowerArm ?? 1));
      cap(I.upperArmR, I.lowerArmR, 0.045 * (G?.upperArm ?? 1)); cap(I.lowerArmR, I.handR, 0.036 * (G?.lowerArm ?? 1));
    }
    const hd = b[I.head];
    if (hd && this.headBall) {
      const hb = this.headBall;
      _v.set(hb[0], hb[1], hb[2]).applyMatrix4(hd.matrixWorld);
      const e = hd.matrixWorld.elements;
      addSphere(c, _v.x, _v.y, _v.z, hb[3] * Math.hypot(e[0], e[1], e[2]));
    }
    c.floorY = holder.matrixWorld.elements[13] + 0.012;
  }
}
