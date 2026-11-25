import {
  AnimationMixer,
  Bone,
  Group,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  MathUtils,
  Color,
  DoubleSide,
  FrontSide,
  SkinnedMesh,
  Vector3,
  type AnimationAction,
  BufferAttribute,
  BufferGeometry,
  Sphere,
  Object3D,
  type Skeleton,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ROLES, type AnimRole, type ClipRef } from '../../data/animations';
import { genderOf, type CharacterLook } from '../../data/characterParts';
import { addOutlines } from '../../render/outline';
import { CHARACTER_INK, extendToon, toon, toonChar, toonFx, type Surface, type ToonFxUniforms } from '../../render/toon';
import { disposeMaterial } from '../../render/dispose';
import { audio } from '../../audio/audio';
import { WeaponTrail } from '../../render/weaponTrail';
import { createLamp } from '../../render/lamps';

/** Höhe der Hüftlaterne der Bausteinfigur über dem Becken-Knochen (die Anime-Figur hängt sie an den gemessenen Socket „hipLeft“) */
const LAMP_HIP_Y = 0.04;
import { glowHub, makeEmitter } from '../../render/glow';
import { Quaternion, Vector3 as V3, Vector4, type Scene } from 'three';
import type { ColorRepresentation, Material, Mesh, MeshToonMaterial } from 'three';
import { disposeObject, markShared } from '../../render/dispose';
import type { CharacterAssets } from './assets';
import { buildCharacterGeometry, LIMB_EXT } from './builder';
import { GARMENT_LEVEL, garmentKey, slotTurn, VROID_BONES, VroidBase, type GarmentKind, type GarmentSetData } from './vroid';
import type { AuditLayer } from './audit';
import { maskEngine, type MaskLayer } from './bodyMask';

/** Umhang: weht beim Laufen nach hinten, flattert leicht in Wellen; oben am Nacken bleibt er fest (Gewicht capeK) */
const CAPE_GLSL = /* glsl */ `
  {
    float ck = capeK;
    transformed.z -= (uCape.x + sin(uCape.w * 1.7 + transformed.y * 5.0) * uCape.z) * ck;
    transformed.x += (uCape.y + sin(uCape.w * 2.3 + transformed.y * 6.0 + transformed.x * 9.0) * uCape.z * 0.5) * ck;
    transformed.y += uCape.x * ck * ck * 0.3;
  }`;

/**
 * Mantelschöße und Kilt (4.4B): mehrstufige Windwelle – Schwung nach hinten mit dem Lauftempo, darüber zwei Wellen verschiedener Länge, die
 * vom Saum nach oben laufen, und ein leichtes seitliches Flattern. Oben an der Hüfte bleibt der Stoff fest (Gewicht tailK).
 */
const TAIL_GLSL = /* glsl */ `
  {
    float tk = tailK;
    float w1 = sin(uCape.w * 2.1 - transformed.y * 9.0 + transformed.x * 3.0);
    float w2 = sin(uCape.w * 3.7 - transformed.y * 17.0 + transformed.x * 11.0) * 0.45;
    transformed.z -= (uCape.x * 0.8 + (w1 + w2) * uCape.z * 1.1) * tk;
    transformed.x += sin(uCape.w * 2.9 + transformed.y * 7.0) * uCape.z * 0.45 * tk;
    transformed.y += uCape.x * 0.12 * tk * tk;
  }`;
import { SocketRig } from './sockets';
import { loadoutFromLook, resolveLoadout, type Finish, type Loadout, type ResolvedLoadout } from '../../data/equipment';
import { attachHeadgear, buildBuckle, buildButton, buildEpaulette, buildKnot, buildPauldron, CAPPED, CAP_RIM_DEFAULT, hairSqueezeFor, PATCH_RX, PATCH_RY } from './animeHats';
import { isSeatedHat } from './hatFit';
import { BELT_KINDS, HELM_KINDS, SHOULDERS, buildBeltExtras } from './gear/rigid';
import { finishMat } from './gear/kit';
import { buildHeld, buildSkinned, glbModel } from './gear/glbGear';
import { registerCulled, unregisterCulled } from '../../render/matrixSkip';
import { CharacterRig } from './rig/characterRig';
import { chainSkin } from './rig/clothRig';
import type { CharacterSockets } from './rig/characterSockets';
import { SHEATH, SHEATH_LEN, sheathPose, type BuildId, type ExpressionId, type HandPoseId, type PresenceDef, type StanceId } from '../../data/characterRig';
import { rigProfile } from './rig/rigProfile';


/** 4.6G.2: das Geschlecht wählt die Grundfigur (fehlt es: männlich, alte Stände mit langer Grundfrisur bleiben weiblich – genderOf) */
function isFemale(l: CharacterLook) { return genderOf(l) === 'female'; }

/** Weltmaßstab: Skelett ist 2,2 Einheiten hoch → Figur ca. 1,75 m */
export const CHARACTER_SCALE = 0.8;

const IDENTITY = new Matrix4();
/**
 * Halbmesser der Hüllkugel einer Figur um ihre Hüfte (m): kein Körperteil ist in irgendeiner Pose weiter entfernt.
 * three.js berechnet die Kugel eines Skelett-Netzes sonst nur einmal aus der ersten Pose – liegt die Figur später,
 * verschwinden Haare, Gesicht oder Kleidung einzeln am Bildrand. Die Kugel folgt deshalb der Hüfte; so bleibt sie eng
 * (eine feste, große Kugel hielt 30 Figuren im Schattenbild und kostete ein Fünftel mehr Bildzeit).
 */
const CULL_RADIUS = 1.45;
const geoCache = new Map<string, { main: BufferGeometry; detail: BufferGeometry | null; users: number }>();

function lookKey(l: CharacterLook) { return JSON.stringify(l); }

const tmpA = new Vector3();
const tmpB = new Vector3();

/** Skelett auf Anime-Proportionen bringen; die Figur wird um die längeren Beine angehoben */
function applyAnimeProportions(rig: Object3D, bones: Record<string, Bone>) {
  // Knochen verlängern (Knie, Knöchel, Ellbogen, Handgelenk weiter nach außen) – keine Verzerrung bei Bewegung
  const lengthen = (b: Bone | undefined, ext: number) => {
    if (!b) return;
    const len = b.position.length();
    if (len > 1e-4) b.position.multiplyScalar((len + ext) / len);
  };
  for (const s of ['l', 'r']) {
    lengthen(bones[`lowerleg${s}`], LIMB_EXT.thigh);
    lengthen(bones[`foot${s}`], LIMB_EXT.shin);
    lengthen(bones[`lowerarm${s}`], LIMB_EXT.upperArm);
    lengthen(bones[`wrist${s}`], LIMB_EXT.foreArm);
  }
  for (const [n, s] of Object.entries(Character.PROPORTIONS)) bones[n]?.scale.setScalar(s);
  // längere Beine: Figur anheben, damit die Füße auf dem Boden bleiben
  rig.position.y += (LIMB_EXT.thigh + LIMB_EXT.shin) * rig.scale.y;
  void tmpA; void tmpB;
}

export interface PlayOptions {
  fade?: number;
  loop?: boolean;
  speed?: number;
  /** Wird aufgerufen, wenn eine einmalige Animation endet */
  onDone?: () => void;
  /** Animation von vorn starten, auch wenn sie schon läuft */
  restart?: boolean;
}

/** Eine animierte Figur (Spieler oder NPC). */
/** Oberfläche je Teil der Anime-Figur */
/** Schleifen mit Schrittzyklus (gleiche Phasenlage, siehe playClip) */
const LOCO_CLIPS = new Set(['Walking_A', 'Walking_B', 'Walking_C', 'Running_A']);
/** Natürliche Geschwindigkeit der Geh-Clips in m/s (aus Fußkontakten gemessen: Schrittweite × 2 / Dauer) */
/** Beckenhöhe im Gehen (Mittel der Clips), Dämpfung der Auf-und-ab-Bewegung, Anhebung in m */
const GAIT_ELBOW = 0.5, GAIT_UPRIGHT = -0.1;
const GAIT_HIP = 0.848, GAIT_DAMP = 0.35, GAIT_LIFT = 0.03, GAIT_ANKLE = 0.08, GAIT_FOOT = 0.42;
export const WALK_NATURAL: Record<string, number> = { Walking_A: 1.5, Walking_B: 1.63, Walking_C: 0.82 };
const SLOT_SURFACE: Record<string, Surface> = { skin: 'skin', hair: 'hair', top: 'cloth', bottom: 'cloth', shoes: 'leather', iris: 'eye' };
/** 4.6G.2: Ton der Wimpern und des Lidstrichs (fast schwarz, mit einem Hauch der Haarfarbe) */
const LASH_TONE = new Color('#1A1214');
/** Clips ohne eigene Ganzkörper-Aktion: hier legt das Rig Atem, Blick und Gewicht voll darüber (4.6F) */
const CALM_CLIP = /^(Idle_|Walking_|Running_|Melee_Unarmed_Idle|Melee_2H_Idle|Holding_|Sit_|Lie_Idle|Fishing_Idle|Melee_Blocking|Skeletons_Idle|Skeletons_Walking|Ranged_1H_Aiming)/;
/** 4.6G: Clips, in denen die Arme entspannt hängen dürfen */
const RELAX_CLIP = /^(Idle_[AB]$|Walking_[AB]$|Skeletons_Idle)/;
/** Anteil der Kette an Mantelschößen und Rocksaum (der Rest folgt Hüfte und Beinen) */
const CHAIN_SHARE = { mantelLang: 0.82, kilt: 0.6, cape: 0.9 } as const;

export class Character {
  /** In die Welt setzen und bewegen */
  readonly holder = registerCulled(new Group());

  // ---------- Weiche Darstellung zwischen den festen Logikschritten (60 Hz) ----------
  // Die Logik setzt die Position 60-mal pro Sekunde (place); die Darstellung gleitet bei jedem Bild
  // zwischen dem letzten und dem aktuellen Schritt (present). So ruckelt nichts auf 90/120/144-Hz-Bildschirmen.
  private static moving = new Set<Character>();
  /** Alle Figuren mit Laterne (für die Lichter, die den nächsten Trägern folgen) */
  static readonly lamped = new Set<Character>();
  /** Laterne an der Hüfte (hängt am Becken-Knochen, pendelt beim Gehen) */
  lamp: Mesh | null = null;
  private lampPhase = Math.random() * 6.28;
  private from = { x: 0, y: 0, z: 0, yaw: 0 };
  private tgt = { x: 0, y: 0, z: 0, yaw: 0 };
  private placed = false;

  /** Logik-Position setzen (im festen Schritt) */
  place(x: number, y: number, z: number, yaw: number) {
    const t = this.tgt;
    // erste Platzierung oder großer Sprung (Teleport): nicht durchs Bild gleiten
    if (!this.placed || Math.abs(x - t.x) + Math.abs(z - t.z) > 6) {
      this.from.x = x; this.from.y = y; this.from.z = z; this.from.yaw = yaw;
      this.placed = true;
      Character.moving.add(this);
    }
    this.footsteps(x, y, z);
    // Lauf-Animation an das echte Tempo koppeln (keine gleitenden Füße) und in Kurven neigen
    const sp = Math.hypot(x - t.x, z - t.z) * 60;
    if (this.placed) { this.setLocoSpeed(sp); this.lean(yaw, sp, 1 / 60); }
    t.x = x; t.y = y; t.z = z; t.yaw = yaw;
    this.holder.position.set(x, y, z);
    this.holder.rotation.y = yaw;
  }

  /** Lautstärke der Schritte (Stadtleute leiser, 0 = stumm) */
  stepVol = 0.55;
  private stepAcc = 0;
  private stepPrev = { x: NaN, z: NaN };

  /**
   * Schrittgeräusche aus der zurückgelegten Strecke (einmal je fester Logikschritt aufrufen).
   * Schrittlänge wächst mit dem Tempo; der Klang kommt räumlich von der Figur.
   */
  footsteps(x: number, y: number, z: number) {
    const p = this.stepPrev;
    const moved = Number.isNaN(p.x) ? 0 : Math.hypot(x - p.x, z - p.z);
    p.x = x; p.z = z;
    if (this.stepVol <= 0 || moved > 1.5) { this.stepAcc = 0; return; }
    const speed = moved * 60;
    if (speed < 0.6) { this.stepAcc = 0; return; }
    this.stepAcc += moved;
    const stride = Math.min(1.4, Math.max(0.7, 0.5 + speed * 0.12));
    if (this.stepAcc >= stride) {
      this.stepAcc -= stride;
      audio.play('step', this.stepVol * Math.min(1.2, 0.6 + speed * 0.1), { x, y: y + 0.1, z });
    }
  }

  /** Zu Beginn jedes festen Schritts: letzter Stand wird Ausgangspunkt fürs Gleiten */
  static beginStep() {
    for (const c of Character.moving) { const f = c.from, t = c.tgt; f.x = t.x; f.y = t.y; f.z = t.z; f.yaw = t.yaw; }
  }

  /** Bei jedem Bild: alpha = Anteil zwischen letztem und nächstem Logikschritt */
  static present(alpha: number) {
    for (const c of Character.moving) {
      const f = c.from, t = c.tgt;
      c.holder.position.set(f.x + (t.x - f.x) * alpha, f.y + (t.y - f.y) * alpha, f.z + (t.z - f.z) * alpha);
      const dy = MathUtils.euclideanModulo(t.yaw - f.yaw + Math.PI, Math.PI * 2) - Math.PI;
      c.holder.rotation.y = f.yaw + dy * alpha;
    }
  }
  rig!: Object3D;
  readonly bones: Record<string, Bone> = {};
  mixer!: AnimationMixer;
  look!: CharacterLook;
  private skeleton!: Skeleton;
  /** Anime-Grundfigur (VRoid) oder null für die Bausteinfigur */
  private vroid: VroidBase | null = null;
  /** Organisches Rig (4.6F): Anatomie, Leben, Gesicht, Hände, Stoff- und Haarphysik, Sockets */
  rigX: CharacterRig | null = null;
  /** Alle lebenden Figuren (Druckwellen auf Stoff und Haar) */
  static readonly all = new Set<Character>();
  private readonly seed = Math.random();
  /** Statur von außen (Endbosse), sonst aus dem Körperbau */
  private buildOverride: BuildId | null = null;
  /** Iris-Netze (Augen-Leuchten im Erwachen) und ihre Leuchtfarbe */
  private irises: SkinnedMesh[] = [];
  private glowCol = new Color('#9FE8FF');
  private glowShown = 0;
  /** 4.6G: Aura-Teile der getragenen Ausrüstung (leer = keine) */
  auraSpecs: ResolvedLoadout['aura'] = [];
  /** Kopfschmuck (4.6G: jedes Teil an seinem Socket: Hut, Brille, Augenklappe, Ohrring, Bart, Narbe) */
  private headgear: Object3D[] = [];
  /** Aus dem Körper erzeugte Kleidung (Hose, Stiefel, Mantel) */
  private garments: SkinnedMesh[] = [];
  private mesh: SkinnedMesh | null = null;
  private detail: SkinnedMesh | null = null;
  private actions = new Map<string, AnimationAction>();
  private current: AnimationAction | null = null;
  private currentName = '';
  private doneCb: (() => void) | null = null;
  private key = '';

  /** Proportionen: kleinerer Kopf, längere Glieder (realistischer Anime-Stil statt Chibi) */
  static readonly PROPORTIONS: Record<string, number> = { head: 0.68, spine: 1.05 };

  constructor(private assets: CharacterAssets, look: CharacterLook, private outline = true) {
    // Figuren zeichnen ihre Ränder mit Himmelslicht (Fresnel) statt mit Tusche
    this.outline = outline && CHARACTER_INK;
    const vb = assets.vroid ? (isFemale(look) ? assets.vroid.female : assets.vroid.male) : null;
    if (vb) { this.initVroid(vb, look); return; }
    this.rig = cloneSkinned(assets.rig);
    let tmpl: SkinnedMesh | null = null;
    const old: Object3D[] = [];
    this.rig.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) { tmpl ??= o as SkinnedMesh; old.push(o); }
      if ((o as Bone).isBone) this.bones[o.name] = o as Bone;
    });
    this.skeleton = (tmpl as unknown as SkinnedMesh).skeleton;
    for (const o of old) o.removeFromParent();
    // Halterungen für Waffen (wie in den Animationsdateien)
    for (const s of ['l', 'r']) {
      const slot = new Bone();
      slot.name = `handslot${s}`;
      slot.position.set(0, 0.096, -0.058);
      slot.quaternion.copy(slotTurn(s as 'l' | 'r'));
      this.bones[`hand${s}`]?.add(slot);
      this.bones[slot.name] = slot;
    }
    this.rig.scale.setScalar(CHARACTER_SCALE);
    this.holder.add(this.rig);
    this.sockets = new SocketRig(this.rig, 'block', (n) => assets.rig.getObjectByName(n)?.getWorldQuaternion(new Quaternion()) ?? null);
    applyAnimeProportions(this.rig, this.bones);
    this.mixer = new AnimationMixer(this.rig);
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.current && this.doneCb) {
        const cb = this.doneCb;
        this.doneCb = null;
        cb();
      }
    });
    this.look = look;
    this.applyLook(look);
    this.rigX = new CharacterRig({ holder: this.holder, rig: this.rig }, { seed: this.seed });
    Character.all.add(this);
    this.mountLamp();
  }

  // ---------- Anime-Figur (VRoid) ----------

  private initVroid(vb: VroidBase, look: CharacterLook) {
    const old = this.rig;
    const held = { l: this.bones.handslotl?.children[0] ?? null, r: this.bones.handslotr?.children[0] ?? null };
    // gehaltene Waffen wandern zur neuen Figur – vorher abnehmen, damit sie nicht mit der alten freigegeben werden
    held.l?.removeFromParent(); held.r?.removeFromParent();
    if (old) { this.mixer?.stopAllAction(); this.mixer?.uncacheRoot(old); this.undress(); disposeRig(old); }
    this.vroid = vb;
    this.actions.clear();
    this.current = null;
    this.currentName = '';
    this.rig = cloneSkinned(vb.template);
    for (const k of Object.keys(this.bones)) delete this.bones[k];
    for (const [ours, theirs] of Object.entries({ ...VROID_BONES, ...VroidBase.HAND_ALIAS })) {
      const b = this.rig.getObjectByName(theirs);
      if (b) this.bones[ours] = b as Bone;
    }
    for (const s of ['l', 'r'] as const) {
      const slot = new Bone();
      slot.name = `handslot${s}`;
      slot.position.copy(vb.slot[s].pos);
      slot.quaternion.copy(vb.slot[s].quat);
      slot.scale.setScalar(vb.slot[s].scale);
      this.bones[`hand${s}`]?.add(slot);
      this.bones[slot.name] = slot;
      if (held[s]) slot.add(held[s]!);
    }
    this.sockets = new SocketRig(this.rig, 'vroid', (n) => vb.restQuat(n));
    // Gesichtsteile mit Morph-Zielen (Lider, Wimpern, Iris, Brauen, Mund): alle teilen sich ein Gewichtsfeld im Rig
    const faces: SkinnedMesh[] = [];
    this.rig.traverse((o) => {
      const m = o as SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.castShadow = true;
      // Anime-Gesichter bleiben schattenfrei (sonst legt sich ein dunkler Haarschatten über die Augen)
      m.receiveShadow = !/Face/i.test(m.name);
      m.frustumCulled = true;
      if (m.morphTargetInfluences?.length) faces.push(m);
    });
    this.holder.add(this.rig);
    this.rigX = new CharacterRig({ holder: this.holder, rig: this.rig }, { seed: this.seed, cloth: vb.cloth, measures: vb.socketMeasures(), face: faces });
    Character.all.add(this);
    for (const s of ['l', 'r'] as const) this.rigX.setHand(s, held[s] ? 'griff' : 'offen', true);
    this.mixer = new AnimationMixer(this.rig);
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.current && this.doneCb) {
        const cb = this.doneCb;
        this.doneCb = null;
        cb();
      }
    });
    this.look = look;
    this.applyVroidLook(look);
    if (this.outline) this.rig.traverse((o) => { const m = o as SkinnedMesh; if (m.isSkinnedMesh && !(m.material as { transparent?: boolean }).transparent) addOutlines(m, 0.7); });
    this.mountLamp();
  }

  /** Laterne an die Hüfte hängen (Socket „legs“, Maße in Metern): außen an der Hüfte, etwa in Oberschenkelhöhe */
  private mountLamp() {
    this.lamp?.removeFromParent();
    this.lamp = null;
    glowHub.removeOwner(this);
    // Anime-Figur: an der linken Hüfte (Socket „hipLeft“ aus dem neuen Rig, gemessen an Gürtel und Mantel); Bausteinfigur: alter Hüft-Socket
    const node = this.vroid ? this.rigX?.sockets.get('hipLeft') ?? null : this.sockets.node('legs');
    if (!node) { Character.lamped.delete(this); return; }
    this.sockets.normalize();
    const lamp = createLamp(1.25);
    if (this.vroid) { lamp.position.set(0, 0, 0); lamp.rotation.y = Math.PI; } else lamp.position.set(-0.22, LAMP_HIP_Y, 0);
    lamp.userData.holder = this.holder;
    node.add(lamp);
    this.lamp = lamp;
    // Lichthof an der Laterne (das Glas hängt etwa 0,25 m unter dem Aufhängepunkt)
    glowHub.add(makeEmitter('lamp', 0, 0, 0, { obj: (lamp.userData.glowAnchor as Object3D | undefined) ?? lamp, oy: lamp.userData.glowAnchor ? 0 : -0.35, size: 0.26, owner: this }));
    Character.lamped.add(this);
  }

  /** Farben der Anime-Figur aus dem Look (Haut, Haare, Kleidung, Augen) */
  private applyVroidLook(look: CharacterLook) {
    const vb = this.vroid!;
    const skinBase = new Color('#F6DCC6');
    const skin = new Color(look.skin);
    const skinTint = new Color(Math.min(1.08, skin.r / skinBase.r), Math.min(1.08, skin.g / skinBase.g), Math.min(1.08, skin.b / skinBase.b));
    const colorFor: Record<string, Color> = {
      skin: skinTint, hair: new Color(look.hairColor), brow: new Color(look.hairColor).multiplyScalar(0.8), top: new Color(look.outfitColor),
      bottom: new Color(look.pantsColor), shoes: new Color(look.shoesColor), iris: new Color(look.eyeColor), fixed: new Color(0xffffff),
      lash: new Color(look.hairColor).multiplyScalar(0.3).lerp(LASH_TONE, 0.7),
    };
    this.irises = [];
    this.glowShown = 0;
    { const rp = rigProfile(look); this.rigX?.setTraits(rp.eyes, rp.brows, rp.mouth); }
    // 4.6G.2: Haltung und Gang des Geschlechts
    this.rigX?.setFigure(isFemale(look) ? 'female' : 'male');
    this.rig.traverse((o) => {
      const m = o as SkinnedMesh;
      const i = m.userData.vroidPart as number | undefined;
      if (!m.isSkinnedMesh || i === undefined) return;
      const p = vb.parts[i];
      if (p.slot === 'iris') this.irises.push(m);
      const mat = toon({ color: colorFor[p.slot], map: p.gray ?? p.map, side: p.doubleSided ? DoubleSide : FrontSide, transparent: p.transparent, spec: p.slot === 'hair' ? 0.7 : 0, rim: p.slot === 'lash' ? 0 : p.slot === 'fixed' ? 0.4 : 1, surface: SLOT_SURFACE[p.slot] ?? 'plain', eyeUv: p.slot === 'iris' ? vb.irisUv() : undefined, hairC: p.slot === 'hair' ? vb.hairCenter() : undefined });
      mat.alphaTest = p.alphaTest || (p.transparent ? 0 : 0.5);
      // durchscheinende Gesichtsteile (Wimpern, Augenglanz) liegen übereinander: ohne Tiefenschreiben verdecken sie
      // sich nicht gegenseitig je nach Zeichenreihenfolge (wie MToon „Transparent“ ohne ZWrite)
      mat.depthWrite = !p.transparent;
      m.material = mat;
    });
    this.equipVroid(vb, look, this.custom ?? loadoutFromLook(look));
  }

  /**
   * Alles an der Figur (Kleidung, Hüte, Schmuck, Waffen) bekommt die Figuren-Fassung seines Materials:
   * Feinrelief, passender Glanz und Randlicht. Tusche-Hüllen fremder Bausteine (Waffen) fallen weg.
   */
  private stylize(root: Object3D) {
    const hulls: Object3D[] = [];
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const mat = m.material as Material & { userData: { outline?: boolean; toon?: boolean } };
      if (mat.userData?.outline) { if (!CHARACTER_INK) hulls.push(m); return; }
      if (mat.userData?.toon) m.material = toonChar(mat);
    });
    for (const h of hulls) h.removeFromParent();
  }

  /** Halterungen der Figur (Head, Chest, Legs, Feet, Hands, MainHand, OffHand) */
  sockets!: SocketRig;
  /** Was die Figur gerade trägt */
  loadout: Loadout | null = null;
  /** Von außen gesetzte Ausrüstung (statt der aus dem Aussehen abgeleiteten) */
  private custom: Loadout | null = null;
  /** Netze mit eigener Dreiecksliste (verdeckte Dreiecke entfernt): Punktdaten bleiben die der Vorlage */
  private masked: { mesh: SkinnedMesh; geo: BufferGeometry; src: BufferGeometry; index: BufferAttribute | null }[] = [];
  private garmentIndex: BufferAttribute | null = null;

  /** Ausrüstung direkt setzen, ohne das Aussehen zu ändern; null = wieder aus dem Aussehen ableiten */
  equip(loadout: Loadout | null) {
    this.custom = loadout;
    this.setLook(this.look);
  }

  /** Kleidung, Hut, Anker und Masken abnehmen und alles freigeben, was nur dieser Figur gehört */
  private undress() {
    for (const p of this.headgear) disposeObject(p);
    this.headgear = [];
    for (const a of this.sockets?.takeAnchors() ?? []) disposeObject(a);
    const engine = this.vroid ? maskEngine(this.vroid) : null;
    // gemeinsame Dreiecksliste der Kleidung nur einmal zurückgeben (mehrere Netze können sie teilen)
    const freed = !!engine?.release(this.garmentIndex);
    for (const g of this.garments) releaseGarment(g, g.userData.ownIndex ? true : freed);
    for (const k of ['r', 'l'] as const) { const h = this.heldSkin[k]; if (h?.parent) h.parent.remove(h); }
    this.heldSkin = { r: null, l: null };
    this.garments = [];
    this.capeU = [];
    this.garmentIndex = null;
    for (const k of this.masked) { k.mesh.geometry = k.src; releaseShared(k.geo, !!engine?.release(k.index)); }
    this.masked = [];
    this.worn = [];
    this.wornPart = null;
  }

  /** Netz bekommt eine eigene Dreiecksliste (und unter Hüten eine eigene, geteilte Lage); alle übrigen Punktdaten teilt es mit der Vorlage */
  private mask(m: SkinnedMesh, src: BufferGeometry, index: BufferAttribute | null, fromEngine: boolean, position: BufferAttribute | null = null, morphs = false) {
    const geo = new BufferGeometry();
    for (const k in src.attributes) geo.setAttribute(k, src.attributes[k]);
    if (position) geo.setAttribute('position', position);
    // 4.6G.3: Teile mit Gesichts-Morphs (Wimpern blinzeln mit) behalten ihre Morph-Ziele – sonst fiele das Netz auf ein anderes Programm
    if (morphs) { geo.morphAttributes = src.morphAttributes; geo.morphTargetsRelative = src.morphTargetsRelative; }
    geo.setIndex(index);
    geo.boundingSphere = src.boundingSphere;
    m.geometry = geo;
    this.masked.push({ mesh: m, geo, src, index: fromEngine ? index : null });
  }

  /**
   * Ausrüstung anlegen (data/equipment.ts): Hüllen aus dem Körper (Hose, Hemd, Mantel …), starre Teile auf Haut-Ankern,
   * Kopfbedeckung. Was unter deckender Kleidung liegt, wird nicht gezeichnet (bodyMask.ts).
   */
  private equipVroid(vb: VroidBase, look: CharacterLook, loadout: Loadout) {
    this.undress();
    this.loadout = loadout;
    const R = resolveLoadout(loadout);
    // 4.6G: Aura-Teilchen der Endgame-Ausrüstung (graphics/gearAura.ts liest sie je Bild)
    this.auraSpecs = R.aura;
    const engine = maskEngine(vb);
    // deckende Schichten: erzeugte Stücke und die sichtbare Kleidung der Grundfigur
    const layers: MaskLayer[] = [];
    for (const s of R.shells) {
      const cover = vb.garmentCover(s.kind, R.ctx);
      if (cover) layers.push({ key: garmentKey(s.kind, R.ctx), level: GARMENT_LEVEL[s.kind], cover });
    }
    for (const g of R.glb) {
      const cover = g.maskAs ? vb.garmentCover(g.maskAs, R.ctx) : null;
      if (g.maskAs && cover && glbModel(g.model)) layers.push({ key: `glb.${g.model}.${g.maskAs}`, level: GARMENT_LEVEL[g.maskAs], cover });
    }
    const hideHair = R.glb.some((g) => g.hidesHair && glbModel(g.model));
    if (R.base.top) layers.push({ key: 'grund.top', level: 1, cover: vb.baseCover('top') });
    if (R.base.shoes) layers.push({ key: 'grund.shoes', level: 1, cover: vb.baseCover('shoes') });
    // Hüte aus Modellen bekommen dieselbe Haar-Ausblendung wie Helme
    const glbHat = R.glb.some((g) => g.trimsHair && glbModel(g.model));
    // 4.6G.3: Standard-Hüte sitzen am Schädel; das Haar über dem Band wird in die Krone gedrückt, nichts abgeschnitten (keine kahle Stirn)
    const seated = !glbHat && isSeatedHat(R.hat) ? vb.hatSeat(R.hat) : null;
    const cap = glbHat ? { sink: 0.13, margin: 0.012 } : seated ? undefined : CAPPED[R.hat];
    // Hüte ohne Kappe (Dreispitz, Marinemütze) ohne Schädelmessung: Haar nur stauchen, nichts abschneiden
    const hatFit = cap || seated ? null : hairSqueezeFor(R.hat);
    // 4.6G.3: unter der Augenklappe Wimpern und Lidstrich ausblenden (sie stehen bis 2 cm vor dem Auge)
    const an0 = look.eyepatch ? vb.anchors() : null;
    this.rig.traverse((o) => {
      const m = o as SkinnedMesh;
      const i = m.userData.vroidPart as number | undefined;
      if (!m.isSkinnedMesh || i === undefined) return;
      const p = vb.parts[i], src = vb.partGeo[i];
      // 4.6G.2: weitere Netze eines Teils (Morph-Gruppen, z. B. das Ohr der Gesichtshaut) haben eigene Punktdaten – nie mit der Vorlage maskieren
      const own = m.geometry === src;
      // Hose bzw. Rock der Grundfigur bleibt aus: an gebeugten Knien stach dort die Haut durch – die erzeugte Hose bewegt sich genau mit
      if (p.slot === 'bottom') { m.visible = false; return; }
      // Frisur aus einem Modell ersetzt das Haar der Grundfigur
      if (p.slot === 'hair') { m.visible = !hideHair; if (hideHair) return; }
      if (p.slot === 'top') m.visible = R.base.top;
      if (p.slot === 'shoes') m.visible = R.base.shoes;
      if (!src.index || !own) return;
      let index: BufferAttribute | null = null;
      if (p.slot === 'hair' && seated && isSeatedHat(R.hat)) {
        const pos = vb.hairUnderBand(i, R.hat);
        if (pos) this.mask(m, src, src.index, false, pos);
        return;
      }
      if (p.slot === 'lash' && an0?.pupilR) {
        const li = vb.lashUnderPatch(i, an0.pupilR, PATCH_RX * 1.08, PATCH_RY * 1.12);
        if (li) this.mask(m, src, li, false, null, true);
        return;
      }
      if (p.slot === 'skin' && /^Body/.test(p.name)) index = engine.indexFor({ key: 'haut', index: src.index, src: src.index.array, level: 0 }, layers);
      // Das Hemd der Grundfigur bleibt ganz: Schärpe und Halstuch liegen stellenweise unter seinem losen Saum bzw. Kragen –
      // dort ein Loch ins Hemd zu schneiden sähe falsch aus. Nur der Schuh verschwindet unter dem Stiefelschaft.
      else if (p.slot === 'shoes' && m.visible) {
        const bs = vb.baseSrc(i);
        if (bs) index = engine.indexFor({ key: `grund${i}`, index: src.index, src: bs, level: 1 }, layers);
      } else if (p.slot === 'hair' && (hatFit || (cap && (HELM_KINDS.includes(R.hat) || glbHat)))) {
        // 4.6G.2: unter aufgesetzten Hüten (Dreispitz, Marinemütze), Helmen und Kronen wird das Haar nach innen und unten gestaucht (eigene
        // Lage); Helme und Kronen schneiden zusätzlich ab, was ganz darüber liegt. Kappen aus der Frisurform (Kopftuch, Mütze …) umschließen
        // das Haar schon – dort bleibt es beim Abschneiden (sonst läge die Kopfhaut zwischen Kappe und gestauchtem Haar frei).
        const h = cap ? vb.hairUnderHat(i, cap.sink, -0.012, true) : vb.hairUnderHat(i, hatFit!.sink, hatFit!.rim, false);
        if (h.index || h.position) { this.mask(m, src, h.index ?? src.index, false, h.position); return; }
      } else if (p.slot === 'hair' && cap) index = vb.hairUnderCap(i, cap.sink, CAP_RIM_DEFAULT);
      if (index && index !== src.index) this.mask(m, src, index, p.slot !== 'hair');
    });
    const body = vb.bodySkin(this.rig);
    const set = vb.garmentSet(R.shells.map((s) => s.kind), R.ctx);
    if (body?.parent && set) {
      this.worn = R.shells.map((s) => s.kind);
      this.wornPart = set.attributes.part as BufferAttribute;
      const sd = set.userData as GarmentSetData;
      const index = engine.indexFor({ key: sd.key, index: set.index!, src: sd.src, level: sd.level }, layers);
      this.garmentIndex = index !== set.index ? index : null;
      this.addShells(body, set, index, R.shells);
    }
    if (body?.parent && R.cape) this.addCape(vb, body, R.cape, R.ctx.coat === 'lang' || this.worn.includes('kilt'));
    // 4.6G: echter Schultermantel – leere Ärmel hängen an eigenen Federketten
    const sleeves = !!(body?.parent && R.cape?.drape && vb.cloth?.sleeves);
    if (sleeves) this.addSleeves(vb, body!, R.cape!);
    // Federketten (4.6F): was die Figur trägt, schwingt; Schalenden und Schärpenbänder als eigene Bänder
    const rx = this.rigX;
    if (rx) {
      rx.setWorn('tails', this.worn.includes('mantelLang') || this.worn.includes('kilt'));
      rx.setWorn('cape', !!R.cape && !!body?.parent);
      rx.setWorn('sleeves', sleeves);
      rx.setWorn('hair', !hideHair);
      const scarf = R.shells.find((s) => s.kind === 'schal');
      const knot = R.rigid.find((r) => r.build === 'knoten');
      const belt = R.shells.find((s) => s.kind === 'guertel');
      rx.setWorn('scarf', !!scarf && !!body?.parent);
      rx.setWorn('sash', !!knot && !!body?.parent);
      if (body?.parent && scarf) this.addRibbon(vb, body, 'scarf', scarf.color, scarf.spec.finish);
      if (body?.parent && knot) this.addRibbon(vb, body, 'sash', knot.color ?? belt?.color ?? '#A8322A', belt?.spec.finish ?? 'stoff');
    }
    // Modelle aus Blender: Stiefel, Hose, Gehrock (am Körper) und Hut, Frisur (an einem Knochen)
    if (body?.parent) for (const g of R.glb) {
      const model = glbModel(g.model);
      if (!model) continue;
      // Frisur unter einem Hut aus einem Modell: Haare über dem Hutrand (Höhe 1,668 der männlichen Vorlage) weglassen
      const headFit = g.mode === 'bone' ? { box: vb.skullBox(), seat: g.hidesHair && seated ? seated : null, seatKey: R.hat } : null;
      for (const m of buildSkinned(vb, model, g.mode, g.bone, body, g.look, g.hidesHair && glbHat ? 1.668 : undefined, headFit)) {
        m.userData.parts = [];
        // fürs Prüfwerkzeug (audit.ts): Name und Ebene des Modells; Hüte und Frisuren (an einem Knochen) liegen ganz außen
        m.userData.glbModel = g.model;
        // Hosen liegen über dem Hemd (Hemd in die Hose gesteckt)
        m.userData.glbLevel = g.maskAs === 'hose' ? 3 : g.maskAs ? GARMENT_LEVEL[g.maskAs] : g.mode === 'bone' ? 9 : 2;
        m.name = `glb:${g.model}/${m.userData.glbRole}`;
        body.parent.add(m);
        this.garments.push(m);
      }
    }
    // Waffen aus Modellen: ersetzen den Säbel (rechts) und füllen die freie Linke mit dem Dolch (siehe hold)
    this.heldSkin = { r: null, l: null };
    for (const h of R.held) {
      const model = glbModel(h.model);
      if (model) this.heldSkin[h.hand] = buildHeld(model, h.look);
    }
    // starre Kleinteile auf Haut-Ankern: sie bewegen sich mit dem Stoff unter ihnen
    if (body) for (const r of R.rigid) {
      if (SHOULDERS[r.build]) {
        // Schulterpanzer aus dem Bausatz: Rahmen x nach außen, y oben, z vorn (die Brust-Knochen schauen nach −Z)
        const over = (['mantelLang', 'mantelKurz', 'jacke', 'uniform', 'weste', 'tunika', 'ringel', 'hemd'] as GarmentKind[]).find((k) => this.worn.includes(k)) ?? null;
        for (const s of vb.shoulderAnchors(R.ctx, over) ?? []) {
          const piece = SHOULDERS[r.build](r.color, r.color2);
          const wrap = new Group();
          wrap.position.copy(s.pos);
          wrap.scale.set(s.pos.x < 0 ? -1 : 1, 1, -1);
          wrap.add(piece);
          this.sockets.skinAnchor(body.skeleton, s.pin, 'J_Bip_C_Chest')?.add(wrap);
        }
      } else if (BELT_KINDS.includes(r.build)) {
        const b = vb.beltAnchors(R.ctx);
        if (!b) continue;
        const wrap = new Group();
        wrap.rotation.y = Math.PI;
        wrap.add(buildBeltExtras(r.build, r.color, r.color2));
        this.sockets.skinAnchor(body.skeleton, b.bucklePin, 'J_Bip_C_Hips')?.add(wrap);
      } else if (r.build === 'knoepfe') {
        // 4.6G: Knopfleiste auf dem äußersten Oberteil (Mantel > Rock/Jacke > Weste), jeder Knopf auf dem Stoff darunter verankert
        const over = (['mantelLang', 'mantelKurz', 'uniform', 'jacke', 'weste'] as GarmentKind[]).find((k) => this.worn.includes(k)) ?? null;
        if (!over) continue;
        for (const s of vb.buttonAnchors(R.ctx, over) ?? []) this.sockets.skinAnchor(body.skeleton, s.pin, 'J_Bip_C_Chest')?.add(buildButton(s.pos, r.color));
      } else if (r.build === 'schulterstuecke' || r.build === 'schulterplatten') {
        // gemessen am äußersten Stück über der Schulter
        const over = (['mantelLang', 'mantelKurz', 'jacke', 'uniform', 'weste', 'tunika', 'ringel', 'hemd'] as GarmentKind[]).find((k) => this.worn.includes(k)) ?? null;
        for (const s of vb.shoulderAnchors(R.ctx, over) ?? []) {
          this.sockets.skinAnchor(body.skeleton, s.pin, 'J_Bip_C_Chest')?.add(r.build === 'schulterstuecke' ? buildEpaulette(s.pos, this.outline) : buildPauldron(s.pos, r.color, this.outline));
        }
      } else {
        const b = vb.beltAnchors(R.ctx);
        if (!b) continue;
        const knot = r.build === 'knoten';
        this.sockets.skinAnchor(body.skeleton, knot ? b.knotPin : b.bucklePin, 'J_Bip_C_Hips')?.add(knot ? buildKnot(r.color, b.knot, this.outline) : buildBuckle(b.buckle, this.outline));
      }
    }
    // Kopf: Hut, Schmuck, Bart und Narbe (gemessene Anker statt geschätzter Abstände)
    const head = this.sockets.bone('head');
    // Brille aus der Ausrüstung (4.6G: eigene Kategorie, auch zusammen mit einem Hut)
    const hatLook: CharacterLook = { ...look, hat: R.hat, hatColor: R.hatColor ?? loadout.colors.hat, hatAccent: R.hatAccent ?? undefined, glasses: R.glasses?.kind ?? 'keine' };
    const eyewear = hatLook.glasses !== 'keine' || look.eyepatch;
    const face = {
      beard: look.beard !== 'keiner' && !isFemale(look) ? vb.beard(look.beard) : null, scar: look.scar ? vb.scarPlacement() : null, cap: (sink: number, margin: number) => vb.capShell(sink, margin),
      field: eyewear ? vb.faceField() : null,
      // 4.6G.3: vorderste Gesichtsfläche vor den Augen (Brillen-Ebene) und Sitz der Standard-Hüte am Schädel
      front: (x: number, y: number, R: number, solid: boolean) => vb.eyeFront(x, y, R, solid),
      hatSeat: seated,
    };
    if (head) this.headgear = attachHeadgear(head, this.rig.getObjectByName('J_Adj_L_FaceEye') ?? null, this.rig.getObjectByName('J_Adj_R_FaceEye') ?? null, hatLook, this.outline, vb.hairFit, vb.anchors(), face, this.rigX?.sockets ?? null);
    const h = Math.min(1.1, Math.max(0.9, look.height));
    const base = vb.template.scale.x;
    // Statur über die Glieder (4.6F) statt die ganze Figur in die Breite zu ziehen (das machte auch den Kopf breiter)
    this.rig.scale.set(base * h, base * h, base * h);
    this.rigX?.setBuild(this.buildOverride ?? rigProfile(look).build);
    this.sockets.normalize();
    this.fitCull();
    this.stylize(this.holder);
  }

  /**
   * Hüllen als Netze je Oberfläche (Stoff, Leder, Stahl, Gold …): jede Gruppe bekommt ihr eigenes Material, alle teilen Lage,
   * Gewichte und Randabstand. Farben, Borten und Muster sind Attribute je Punkt und Figur.
   */
  private addShells(body: SkinnedMesh, set: BufferGeometry, index: BufferAttribute, shells: ResolvedLoadout['shells']) {
    const part = set.attributes.part as BufferAttribute;
    const n = part.count;
    const fin = shells.map((s) => s.spec.finish);
    const trimmed = shells.map((s) => !!(s.spec.trim || s.spec.pattern));
    const anyTrim = trimmed.some(Boolean);
    const col = new Float32Array(n * 3);
    const trimC = anyTrim ? new Float32Array(n * 3) : null, patC = anyTrim ? new Float32Array(n * 3) : null, gset = anyTrim ? new Float32Array(n * 4) : null;
    const cols = shells.map((s) => new Color(s.color));
    const tcols = shells.map((s) => new Color(s.spec.trim ?? s.spec.patColor));
    const pcols = shells.map((s) => new Color(s.spec.patColor));
    for (let i = 0; i < n; i++) {
      const k = part.getX(i);
      cols[k].toArray(col, i * 3);
      if (anyTrim) {
        tcols[k].toArray(trimC!, i * 3); pcols[k].toArray(patC!, i * 3);
        const sp = shells[k].spec;
        gset![i * 4] = sp.pattern; gset![i * 4 + 1] = sp.patSize; gset![i * 4 + 2] = sp.trimW; gset![i * 4 + 3] = sp.trimStyle;
      }
    }
    const own: BufferAttribute[] = [new BufferAttribute(col, 3)];
    if (anyTrim) own.push(new BufferAttribute(trimC!, 3), new BufferAttribute(patC!, 3), new BufferAttribute(gset!, 4));
    // Dreiecke je Oberfläche sortieren (nur nötig, wenn mehrere vorkommen)
    const kinds = [...new Set(fin)];
    const lists = new Map<string, number[]>();
    if (kinds.length > 1) {
      const idx = index;
      for (let t = 0; t < idx.count; t += 3) {
        const f = fin[part.getX(idx.getX(t))];
        const l = lists.get(f);
        if (l) l.push(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)); else lists.set(f, [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)]);
      }
    }
    const scale = Math.max(1e-4, body.getWorldScale(new V3()).y);
    for (const f of kinds) {
      const ids = shells.map((_, i) => i).filter((i) => fin[i] === f);
      const needTrim = ids.some((i) => trimmed[i]);
      const hasRingel = ids.some((i) => shells[i].kind === 'ringel');
      const geo = new BufferGeometry();
      for (const name of ['position', 'normal', 'skinIndex', 'skinWeight'] as const) geo.setAttribute(name, set.attributes[name]);
      geo.setAttribute('color', own[0]);
      if (needTrim) {
        geo.setAttribute('rimD', set.attributes.rimD);
        geo.setAttribute('trimC', own[1]); geo.setAttribute('patC', own[2]); geo.setAttribute('gset', own[3]);
      }
      // Streifen des Ringelhemds zeichnet der Shader (Höhe im Körpermodell; 3,5 cm in Weltmaß)
      if (set.attributes.stripe && hasRingel) geo.setAttribute('stripe', set.attributes.stripe);
      // Mantelschöße und Kilt (4.4B): Gewicht je Punkt von der Hüfte (0) bis zum Knie (1) – sie wehen im Shader mit Lauf und Wind
      const tails = ids.some((i) => shells[i].kind === 'mantelLang' || shells[i].kind === 'kilt') ? this.tailWeights(body, set, part, shells, ids) : null;
      if (tails) geo.setAttribute('tailK', tails);
      // Mantelschöße und Rocksaum hängen an den Federketten (4.6F): Gewichte einmal je Kleidungs-Satz, geteilt
      const cs = this.chainSkinOf(set, part, shells);
      if (cs) { geo.setAttribute('skinIndex', cs.skinIndex); geo.setAttribute('skinWeight', cs.skinWeight); }
      let own_ = false;
      if (kinds.length > 1) {
        const l = lists.get(f)!;
        geo.setIndex(new BufferAttribute(set.attributes.position.count > 65535 ? Uint32Array.from(l) : Uint16Array.from(l), 1));
        own_ = true;
      } else geo.setIndex(index);
      geo.boundingSphere = set.boundingSphere;
      const mat = finishMat(f as Finish, '#ffffff', { vertexColors: true, rim: 0.8, trim: needTrim, ringel: hasRingel ? 0.035 / scale : 0, unique: !!tails });
      if (tails) this.flutter(mat, 'tailK', TAIL_GLSL, '-tail');
      // kleine Tiefenverschiebung: am Saumrand liegt die untere Schicht noch darunter – ihre letzten Millimeter stechen nicht durch
      mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -2;
      const m = new SkinnedMesh(geo, mat);
      m.bind(body.skeleton, body.bindMatrix);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.ownIndex = own_;
      m.userData.parts = ids;
      body.parent!.add(m);
      // wehende Schöße: keine Tusche-Hülle (sie folgte dem Wind nicht)
      if (this.outline && !tails) addOutlines(m, 0.7);
      this.garments.push(m);
    }
  }

  /** Ketten-Gewichte eines Kleidungs-Satzes (nur wenn er Mantelschöße oder einen Rock enthält); geteilt über den Satz */
  private chainSkinOf(set: BufferGeometry, part: BufferAttribute, shells: ResolvedLoadout['shells']) {
    const lay = this.vroid?.cloth;
    if (!lay) return null;
    const kinds = shells.map((s) => s.kind);
    if (!kinds.includes('mantelLang') && !kinds.includes('kilt')) return null;
    const ud = set.userData as GarmentSetData & { chainSkin?: ReturnType<typeof chainSkin>; chainKey?: string };
    const key = kinds.join(',');
    if (ud.chainKey !== key) {
      ud.chainSkin = chainSkin(lay, 'tails', set, (i) => { const k = kinds[part.getX(i)]; return k === 'mantelLang' ? CHAIN_SHARE.mantelLang : k === 'kilt' ? CHAIN_SHARE.kilt : 0; });
      ud.chainKey = key;
    }
    return ud.chainSkin ?? null;
  }

  /** Schalenden bzw. Schärpenbänder: Bänder an den Federketten, Farbe und Oberfläche der Figur */
  private addRibbon(vb: VroidBase, body: SkinnedMesh, kind: 'scarf' | 'sash', color: string, finish: Finish) {
    const rg = vb.cloth?.ribbons[kind];
    if (!rg) return;
    const src = rg.geo;
    const geo = new BufferGeometry();
    for (const name of ['position', 'normal', 'skinIndex', 'skinWeight'] as const) geo.setAttribute(name, src.attributes[name]);
    geo.setIndex(src.index);
    geo.boundingSphere = src.boundingSphere;
    const n = src.attributes.position.count, col = new Float32Array(n * 3), c = new Color(color);
    for (let i = 0; i < n; i++) c.toArray(col, i * 3);
    geo.setAttribute('color', new BufferAttribute(col, 3));
    const mat = finishMat(finish, '#ffffff', { vertexColors: true, rim: 0.8 });
    const m = new SkinnedMesh(geo, mat);
    m.bind(body.skeleton, body.bindMatrix);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.ownIndex = false;
    m.userData.parts = [];
    m.name = `band:${kind}`;
    body.parent!.add(m);
    this.garments.push(m);
  }

  /** Gewicht der Mantelschöße je Punkt (nur Teile der Arten mantelLang/kilt): 0 an der Hüfte, 1 ab dem Knie, im Raum des Körpermodells */
  private tailWeights(body: SkinnedMesh, set: BufferGeometry, part: BufferAttribute, shells: ResolvedLoadout['shells'], ids: number[]): BufferAttribute | null {
    const bones = body.skeleton.bones;
    const bindY = (re: RegExp) => {
      const i = bones.findIndex((b) => re.test(b.name));
      if (i < 0) return null;
      return new Matrix4().copy(body.skeleton.boneInverses[i]).invert().elements[13];
    };
    const hipsY = bindY(/J_Bip_C_Hips$/), kneeY = bindY(/J_Bip_L_LowerLeg$/);
    if (hipsY === null || kneeY === null || hipsY - kneeY < 0.05) return null;
    const pos = set.attributes.position as BufferAttribute;
    const n = pos.count;
    const out = new Float32Array(n);
    const want = new Set(ids.filter((i) => shells[i].kind === 'mantelLang' || shells[i].kind === 'kilt'));
    let any = false;
    for (let i = 0; i < n; i++) {
      if (!want.has(part.getX(i))) continue;
      const t = Math.min(1, Math.max(0, (hipsY - 0.04 - pos.getY(i)) / (hipsY - 0.04 - kneeY)));
      out[i] = t * t * (3 - 2 * t);
      if (out[i] > 0) any = true;
    }
    return any ? new BufferAttribute(out, 1) : null;
  }

  /** Wind und Schwung für Umhang und Mantelschöße: eigener Wert je Figur (`uCape`, siehe updateCape), Code nach dem Skinning */
  private flutter(mat: Material, attr: string, glsl: string, key: string) {
    const U = { value: new Vector4(0, 0, 0.006, 0) };
    extendToon(mat, key, (sh) => {
      sh.uniforms.uCape = U;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nattribute float ${attr};\nuniform vec4 uCape;`)
        .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n' + glsl);
    });
    this.capeU.push(U);
  }

  /**
   * 4.6G: leere Ärmel des Schultermantels – Röhren an den Ketten `sleeves` (Form und Gewichte von der Grundfigur, geteilt), Farbe, Oberfläche
   * und Borte am Aufschlag wie der Mantel; die Innenkappe am Aufschlag ist dunkel (leerer Ärmel). Gleiches Programm wie die übrige Kleidung.
   */
  private addSleeves(vb: VroidBase, body: SkinnedMesh, c: NonNullable<ResolvedLoadout['cape']>) {
    const sg = vb.cloth?.sleeves;
    if (!sg) return;
    const src = sg.geo, n = src.attributes.position.count;
    const geo = new BufferGeometry();
    // Lage, Gewichte und Saum-Abstand sind geteilt (releaseGarment nimmt sie vor dem Freigeben ab)
    for (const name of ['position', 'normal', 'skinIndex', 'skinWeight', 'rimD'] as const) geo.setAttribute(name, src.attributes[name]);
    geo.setIndex(src.index);
    geo.boundingSphere = src.boundingSphere;
    const col = new Float32Array(n * 3), trimC = new Float32Array(n * 3), patC = new Float32Array(n * 3), gset = new Float32Array(n * 4);
    const base = new Color(c.color), dark = base.clone().multiplyScalar(0.22), tc = new Color(c.spec.trim ?? c.spec.patColor), pc = new Color(c.spec.patColor);
    for (let i = 0; i < n; i++) {
      (i >= sg.capFrom ? dark : base).toArray(col, i * 3); tc.toArray(trimC, i * 3); pc.toArray(patC, i * 3);
      // Muster nur auf dem Stoff, Borte am Aufschlag (rimD = Abstand zum Aufschlag)
      gset[i * 4] = i >= sg.capFrom ? 0 : c.spec.pattern; gset[i * 4 + 1] = c.spec.patSize; gset[i * 4 + 2] = c.spec.trimW; gset[i * 4 + 3] = c.spec.trimStyle;
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.setAttribute('trimC', new BufferAttribute(trimC, 3));
    geo.setAttribute('patC', new BufferAttribute(patC, 3));
    geo.setAttribute('gset', new BufferAttribute(gset, 4));
    const mat = finishMat(c.spec.finish, '#ffffff', { vertexColors: true, rim: 0.8, trim: true });
    const m = new SkinnedMesh(geo, mat);
    m.bind(body.skeleton, body.bindMatrix);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.ownIndex = false;
    m.userData.parts = [];
    m.userData.socket = 'shouldersCoat';
    m.name = 'band:sleeves';
    body.parent!.add(m);
    this.garments.push(m);
  }

  /** Umhang als eigenes Netz am Skelett (Form und Gewichte kommen von der Grundfigur, Farbe und Borte von der Figur) */
  private addCape(vb: VroidBase, body: SkinnedMesh, c: NonNullable<ResolvedLoadout['cape']>, overCoat = false) {
    const g0 = vb.cape(c.len, overCoat, !!c.drape, c.cut ?? 'glatt');
    if (!g0) return;
    const n = g0.attributes.position.count;
    const geo = new BufferGeometry();
    for (const name of ['position', 'normal', 'skinIndex', 'skinWeight', 'rimD', 'capeK'] as const) geo.setAttribute(name, g0.attributes[name]);
    // Umhang an den Federketten (4.6F): Gewichte einmal je Umhang-Form, geteilt
    const lay = vb.cloth;
    if (lay) {
      const ud = g0.userData as { chainSkin?: ReturnType<typeof chainSkin> };
      if (ud.chainSkin === undefined) ud.chainSkin = chainSkin(lay, 'cape', g0, () => CHAIN_SHARE.cape);
      if (ud.chainSkin) { geo.setAttribute('skinIndex', ud.chainSkin.skinIndex); geo.setAttribute('skinWeight', ud.chainSkin.skinWeight); }
    }
    geo.setIndex(g0.index);
    geo.boundingSphere = g0.boundingSphere;
    const col = new Float32Array(n * 3), trimC = new Float32Array(n * 3), patC = new Float32Array(n * 3), gset = new Float32Array(n * 4);
    const base = new Color(c.color), tc = new Color(c.spec.trim ?? c.spec.patColor), pc = new Color(c.spec.patColor);
    for (let i = 0; i < n; i++) {
      base.toArray(col, i * 3); tc.toArray(trimC, i * 3); pc.toArray(patC, i * 3);
      gset[i * 4] = c.spec.pattern; gset[i * 4 + 1] = c.spec.patSize; gset[i * 4 + 2] = c.spec.trimW; gset[i * 4 + 3] = c.spec.trimStyle;
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.setAttribute('trimC', new BufferAttribute(trimC, 3));
    geo.setAttribute('patC', new BufferAttribute(patC, 3));
    geo.setAttribute('gset', new BufferAttribute(gset, 4));
    // eigenes Material je Umhang: Wehen und Schwingen laufen über Werte, die diese Figur setzt (siehe update); der Zusatz überlebt die
    // Effekt-Kopien (extendToon), sonst hörte der Umhang nach dem ersten Treffer auf zu wehen
    const mat = finishMat(c.spec.finish, '#ffffff', { vertexColors: true, rim: 0.8, trim: true, unique: true }) as MeshToonMaterial;
    this.flutter(mat, 'capeK', CAPE_GLSL, '-cape');
    const m = new SkinnedMesh(geo, mat);
    m.bind(body.skeleton, body.bindMatrix);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.ownIndex = false;
    m.userData.parts = [];
    body.parent!.add(m);
    this.garments.push(m);
  }

  /** Umhang-Schwingung: gemessen an der Bewegung der Hüfte (m/s), geglättet */
  private capeU: { value: Vector4 }[] = [];
  private capeT = 0;
  private capeFlow = 0;
  private capeLast = new Vector3();
  private capeHas = false;
  private updateCape(dt: number) {
    if (!this.capeU.length || dt <= 0) return;
    this.capeT += dt;
    const hp = this.bones.hips.getWorldPosition(tmpA);
    const sp = this.capeHas ? Math.min(8, Math.hypot(hp.x - this.capeLast.x, hp.z - this.capeLast.z) / dt) : 0;
    this.capeLast.copy(hp);
    this.capeHas = true;
    this.capeFlow += (Math.min(1, sp / 4) - this.capeFlow) * Math.min(1, dt * 5);
    const f = this.capeFlow;
    // Schwung und Wind kommen seit 4.6F aus den Federketten; der Shader legt nur noch feine Wellen im Stoff darüber
    const chained = !!this.vroid?.cloth;
    if (chained) for (const u of this.capeU) u.value.set(0, 0, 0.003 + f * 0.007, this.capeT * (1.3 + f * 3));
    else for (const u of this.capeU) u.value.set(0.015 + f * 0.17, Math.sin(this.capeT * 1.1) * 0.01 * (1 - f * 0.5), 0.005 + f * 0.022, this.capeT * (1.3 + f * 3));
  }

  /** Hüllkugel aller Netze der Figur: folgt der Hüfte (siehe CULL_RADIUS) */
  private cull = new Sphere();
  /** Raum des Hüft-Elternknotens → Raum der Netze (beides bewegt sich nicht gegeneinander) */
  private cullM = new Matrix4();
  private cullOn = false;

  /** Alle Netze der Figur teilen sich eine Hüllkugel, die bei jedem Schritt der Hüfte nachgeführt wird */
  private fitCull() {
    const hips = this.bones.hips;
    this.cullOn = false;
    if (!hips?.parent) return;
    this.holder.updateMatrixWorld(true);
    let first: SkinnedMesh | null = null;
    this.rig.traverse((o) => {
      const m = o as SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      // die Netze der Figur liegen alle im selben Raum; ein abweichendes bleibt sicherheitshalber immer sichtbar
      if (!first) first = m;
      else if (!m.matrixWorld.equals((first as SkinnedMesh).matrixWorld)) { m.frustumCulled = false; return; }
      m.boundingSphere = this.cull;
      m.frustumCulled = true;
    });
    const ref = first as SkinnedMesh | null;
    if (!ref) return;
    this.cullM.copy(ref.matrixWorld).invert().multiply(hips.parent.matrixWorld);
    this.holder.getWorldScale(tmpA);
    ref.getWorldScale(tmpB);
    this.cull.radius = (CULL_RADIUS * Math.min(1.1, Math.max(0.9, this.look.height)) * Math.max(tmpA.x, tmpA.y, tmpA.z)) / Math.max(1e-4, Math.min(tmpB.x, tmpB.y, tmpB.z));
    this.cullOn = true;
    this.syncCull();
  }

  /** Hüllkugel auf die Hüfte setzen (nach jedem Animationsschritt; ohne neue Objekte) */
  syncCull() {
    if (this.cullOn) this.cull.center.copy(this.bones.hips.position).applyMatrix4(this.cullM);
  }

  private worn: GarmentKind[] = [];
  /** Mantel, Jacke oder Uniformrock über den Armen (entspannte Arme halten etwas Abstand) */
  private get coatOn() { return this.worn.includes('mantelLang') || this.worn.includes('mantelKurz') || this.worn.includes('jacke') || this.worn.includes('uniform'); }
  private wornPart: BufferAttribute | null = null;

  /** Für das Prüfwerkzeug (audit.ts): alle gezeichneten Schichten von innen nach außen */
  auditLayers(): AuditLayer[] {
    const vb = this.vroid;
    if (!vb) return [];
    const out: AuditLayer[] = [];
    this.rig.traverse((o) => {
      const m = o as SkinnedMesh;
      const i = m.userData.vroidPart as number | undefined;
      if (!m.isSkinnedMesh || i === undefined || !m.visible) return;
      const p = vb.parts[i];
      if (p.slot === 'skin' && /^Body/.test(p.name)) out.push({ name: 'haut', level: 0, mesh: m });
      else if (p.slot === 'top') out.push({ name: 'grundhemd', level: 1, mesh: m });
      else if (p.slot === 'shoes') out.push({ name: 'grundschuhe', level: 1, mesh: m });
    });
    if (this.wornPart) for (const g of this.garments) for (const id of (g.userData.parts as number[]) ?? []) out.push({ name: this.worn[id], level: GARMENT_LEVEL[this.worn[id]], mesh: g, part: { attr: this.wornPart, id } });
    // Modelle aus Blender: je Rolle eine Schicht
    for (const g of this.garments) if (g.userData.glbModel) out.push({ name: g.name, level: g.userData.glbLevel as number, mesh: g });
    // Reihenfolge innen → außen
    out.sort((a, b) => a.level - b.level);
    return out;
  }

  /** Aussehen ändern (baut die Figur neu) */
  setLook(look: CharacterLook) {
    const hadFx = this.fxReady;
    if (hadFx) this.dropFx();
    this.look = look;
    if (hadFx) queueMicrotask(() => this.enableFx());
    if (this.assets.vroid) {
      const vb = isFemale(look) ? this.assets.vroid.female : this.assets.vroid.male;
      if (vb !== this.vroid) { this.initVroid(vb, look); this.play('idle', { fade: 0.01 }); }
      else this.applyVroidLook(look);
      return;
    }
    this.applyLook(look);
  }

  private applyLook(look: CharacterLook) {
    this.releaseGeometry();
    const key = lookKey(look);
    let entry = geoCache.get(key);
    if (!entry) {
      const g = buildCharacterGeometry(look, this.assets.boneIndex);
      entry = { main: markShared(g.main), detail: g.detail ? markShared(g.detail) : null, users: 0 };
      geoCache.set(key, entry);
    }
    entry.users++;
    this.key = key;
    const mat = toon({ color: 0xffffff, vertexColors: true, spec: 0.15, surface: 'cloth' });
    this.mesh = new SkinnedMesh(entry.main, mat);
    // Bindungsraum = Raum der Vorlage; die Bindungsmatrizen des Skeletts bleiben unverändert
    this.mesh.bind(this.skeleton, IDENTITY);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.rig.add(this.mesh);
    if (this.outline) addOutlines(this.mesh, 0.8);
    if (entry.detail) {
      this.detail = new SkinnedMesh(entry.detail, toon({ color: 0xffffff, vertexColors: true, rim: 0 }));
      this.detail.bind(this.skeleton, IDENTITY);
      this.detail.frustumCulled = false;
      this.detail.userData.noOutline = true;
      this.rig.add(this.detail);
    }
    const h = Math.min(1.1, Math.max(0.9, look.height));
    this.rig.scale.setScalar(CHARACTER_SCALE * h);
  }

  private releaseGeometry() {
    for (const m of [this.mesh, this.detail]) m?.removeFromParent();
    this.mesh = this.detail = null;
    const entry = geoCache.get(this.key);
    if (entry && --entry.users <= 0 && geoCache.size > 40) {
      entry.main.dispose();
      entry.detail?.dispose();
      geoCache.delete(this.key);
    }
  }

  private action(name: string): AnimationAction | null {
    let a = this.actions.get(name);
    if (!a) {
      const clip = this.vroid ? this.vroid.clip(name) : this.assets.clips.get(name);
      if (!clip) return null;
      a = this.mixer.clipAction(clip);
      this.actions.set(name, a);
    }
    return a;
  }

  /** Eigener Geh-Clip dieser Figur (Bewohner schlendern mit `Walking_B`: ruhiger Gang, passt zu 1 bis 1,6 m/s) */
  walkVariant: string | null = null;

  /** Eine Spielaktion abspielen (siehe data/animations.ts) */
  play(role: AnimRole, opts: PlayOptions = {}) {
    const r = ROLES[role] as ClipRef;
    return this.playClip(role === 'walk' && this.walkVariant ? this.walkVariant : r.clip, { loop: r.loop, speed: r.speed, ...opts });
  }

  playClip(name: string, opts: PlayOptions = {}): AnimationAction | null {
    const a = this.action(name);
    if (!a) return null;
    const fade = opts.fade ?? 0.18;
    const speed = opts.speed ?? 1;
    const loop = opts.loop ?? true;
    if (a === this.current && !opts.restart) {
      a.timeScale = speed;
      return a;
    }
    a.reset();
    a.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    a.clampWhenFinished = !loop;
    a.timeScale = speed;
    a.enabled = true;
    a.setEffectiveWeight(1);
    // Gehen ↔ Rennen: Schrittphase übernehmen, damit beim Überblenden nicht plötzlich das andere Bein vorn ist
    if (this.current && this.current !== a && loop && LOCO_CLIPS.has(name) && LOCO_CLIPS.has(this.currentName)) {
      const cur = this.current;
      a.time = ((cur.time / cur.getClip().duration) % 1) * a.getClip().duration;
    }
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false);
    else a.fadeIn(fade);
    a.play();
    this.current = a;
    this.currentName = name;
    this.doneCb = opts.onDone ?? null;
    return a;
  }

  get playing() { return this.currentName; }

  /**
   * Clip für die Action-Kampf-Engine (4.6A): die Zeit setzt der Aufrufer jedes Logikbild selbst (`time`, `timeScale` 0), die Animation folgt
   * also exakt der Simulation (auch in der Trefferpause). Folgt ein Angriff mit demselben Clip (Faust, Faust), blendet ein Zwilling des
   * Clips über statt denselben Clip neu zu starten – sonst zöge die Überblendung die Figur kurz zur Grundhaltung.
   */
  playSynced(name: string, fade: number): AnimationAction | null {
    let a = this.action(name);
    if (!a) return null;
    if (a === this.current) {
      const twinKey = `${name}#2`;
      let twin = this.actions.get(twinKey);
      if (!twin) { twin = this.mixer.clipAction(a.getClip().clone()); this.actions.set(twinKey, twin); }
      a = twin;
    }
    a.reset();
    a.setLoop(LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = 0;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false);
    else a.fadeIn(fade);
    a.play();
    this.current = a;
    this.currentName = name;
    this.doneCb = null;
    return a;
  }

  /**
   * Schrittgeschwindigkeit an die echte Bewegung anpassen, damit die Füße nicht über den Boden rutschen.
   * Gemessen (Fußkontakte, Welt-Maßstab der Figur 1,085): Gehen ≈ 1,5 m/s, Rennen ≈ 5,9 m/s bei normaler Abspielgeschwindigkeit.
   * Früher stand für Rennen 3,7: bei 6,2 m/s lief der Clip mit dem 1,7-Fachen seiner Geschwindigkeit, die Beine hasteten wie im Trickfilm.
   */
  setLocoSpeed(mps: number) {
    const a = this.current;
    if (!a) return;
    // Weite Grenzen: bei schnellerem Spieler (Fähigkeiten, Tempo-Bonus) darf der Clip nicht an die Grenze stoßen, sonst rutscht er
    if (this.currentName in WALK_NATURAL) a.timeScale = Math.max(0.4, Math.min(2.1, mps / WALK_NATURAL[this.currentName]));
    else if (this.currentName === 'Running_A') a.timeScale = Math.max(0.6, Math.min(1.7, mps / 5.9));
  }

  /** Fortschritt der aktuellen Animation 0 … 1 */
  get progress() {
    const a = this.current;
    if (!a) return 0;
    return a.time / a.getClip().duration;
  }

  // ---------- Waffenschweif ----------
  private static trailed = new Set<Character>();
  private trails: WeaponTrail[] = [];
  private trailColor = '#ffffff';

  /** Waffenschweif an/aus (z. B. während eines Hiebs); Farbe nach Kampfstil oder Element */
  setTrail(on: boolean, color?: string) {
    if (color) this.trailColor = color;
    if (on && !this.trails.length) {
      let root: Object3D = this.holder;
      while (root.parent) root = root.parent;
      if (!(root as Scene).isScene) return;
      const tips: Object3D[] = [];
      this.holder.traverse((o) => { if (o.name === 'trailTip') tips.push(o); });
      for (const tip of tips) {
        const base = tip.parent?.getObjectByName('trailBase');
        if (base) this.trails.push(new WeaponTrail(root as Scene, base, tip, this.trailColor));
      }
      if (this.trails.length) Character.trailed.add(this);
    }
    for (const t of this.trails) { t.active = on; if (on && color) t.setColor(color); }
  }

  private dropTrails() {
    glowHub.removeOwner(this);
    for (const t of this.trails) t.dispose();
    this.trails = [];
    Character.trailed.delete(this);
  }

  /** Bei jedem Bild (nach dem Ausrichten aller Figuren): Schweife abtasten */
  static renderTrails(dt: number) {
    for (const c of Character.trailed) {
      let fresh = false;
      for (const t of c.trails) {
        if (t.active && !fresh) { c.holder.updateWorldMatrix(true, true); fresh = true; }
        t.update(dt);
      }
    }
  }

  // ---------- Gewicht: Neigung in Kurven und beim Beschleunigen ----------
  private leanYaw = NaN;
  private leanSpeed = 0;

  /**
   * Bewegung des Logikschritts an das Rig geben (Drehtempo × Lauftempo → Kurvenneigen, Beschleunigung → Vorlage). Die Neigung selbst kippt
   * seit 4.6F die ganze Figur um die Füße (characterRig.ts) statt nur Wirbelsäule und Brust zu biegen.
   */
  lean(yaw: number, speed: number, dt: number) {
    if (Number.isNaN(this.leanYaw)) this.leanYaw = yaw;
    const dy = MathUtils.euclideanModulo(yaw - this.leanYaw + Math.PI, Math.PI * 2) - Math.PI;
    this.leanYaw = yaw;
    const turn = dy / Math.max(dt, 1e-3);
    const accel = (speed - this.leanSpeed) / Math.max(dt, 1e-3);
    this.leanSpeed = speed;
    this.rigX?.motion(turn, speed, accel);
  }

  // ---------- Arme zu einem Ziel strecken (Steuerrad) ----------
  private static readonly IK_S = new V3();
  private static readonly IK_SS = new V3();
  private static readonly IK_EL = new V3();
  private static readonly IK_T = new V3();
  private static readonly IK_W2 = new V3();
  private static readonly IK_D2 = new V3();
  private static readonly IK_E = new V3();
  private static readonly IK_W = new V3();
  private static readonly IK_D = new V3();
  private static readonly IK_H = new V3();
  private static readonly IK_Q = new Quaternion();
  private static readonly IK_PQ = new Quaternion();

  /** Knochen so drehen, dass die Richtung zu seinem Kind auf das Ziel zeigt (Weltraum) */
  private aimBone(bone: Bone, child: Bone, target: V3) {
    // eigene Hilfsvektoren: das Ziel darf nicht mit ihnen zusammenfallen (sonst überschreibt die Kindposition das Ziel)
    const tgt = Character.IK_T.copy(target);
    const P = Character.IK_S.set(0, 0, 0), C = Character.IK_W2, Dn = Character.IK_D2;
    bone.getWorldPosition(P);
    child.getWorldPosition(C);
    const cur = C.sub(P).normalize();
    const want = Dn.copy(tgt).sub(P).normalize();
    const dq = Character.IK_Q.setFromUnitVectors(cur, want);
    bone.getWorldQuaternion(Character.IK_PQ);
    const nq = dq.multiply(Character.IK_PQ);
    const par = bone.parent;
    if (par) { par.getWorldQuaternion(Character.IK_PQ); bone.quaternion.copy(Character.IK_PQ.invert().multiply(nq)); } else bone.quaternion.copy(nq);
    bone.updateMatrixWorld(true);
  }

  /**
   * Zwei-Knochen-Zielführung: Hand ans Ziel (Weltposition), Ellbogen nach außen und unten.
   * Läuft nach der Animation (jedes Bild neu aus dem Ziel berechnet, summiert sich nicht auf).
   */
  reach(side: 'l' | 'r', target: V3) {
    const up = this.bones[`upperarm${side}`], lo = this.bones[`lowerarm${side}`], wr = this.bones[`wrist${side}`];
    if (!up || !lo || !wr) return;
    this.holder.updateWorldMatrix(true, true);
    const S = Character.IK_SS, E = Character.IK_E, W = Character.IK_W;
    up.getWorldPosition(S);
    lo.getWorldPosition(E);
    wr.getWorldPosition(W);
    const a = E.distanceTo(S), b = W.distanceTo(E);
    const dir = Character.IK_D.copy(target).sub(S);
    const dist = Math.min(Math.max(dir.length(), 0.05), (a + b) * 0.995);
    dir.normalize();
    // Ellbogen-Hinweis: nach außen (zur Körperseite) und unten, in Blickrichtung der Figur gedreht
    const hint = Character.IK_H.set(side === 'l' ? 0.6 : -0.6, -1, -0.45);
    this.holder.getWorldQuaternion(Character.IK_Q);
    hint.applyQuaternion(Character.IK_Q);
    hint.addScaledVector(dir, -hint.dot(dir)).normalize();
    const x = (a * a - b * b + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, a * a - x * x));
    const elbow = Character.IK_EL.copy(S).addScaledVector(dir, x).addScaledVector(hint, h);
    this.aimBone(up, lo, elbow);
    this.aimBone(lo, wr, target);
  }

  /**
   * Gehen ruhiger machen: Der Clip senkt das Becken bei jedem Schritt um bis zu 14 cm (knickende Knie, "Stampfen"). Hier wird die
   * Auf-und-ab-Bewegung auf gut ein Drittel gedämpft und das Becken etwas höher geführt; die Füße bleiben dank Beinführung genau
   * dort, wo der Clip sie hinsetzt (kein Rutschen), nur die Knie strecken sich.
   */
  private softenGait() {
    // Arme: der Clip hält die Ellbogen fast im rechten Winkel (wie beim Joggen); zum Gehen nur halb gebeugt, Oberkörper etwas aufrechter
    for (const sd of ['l', 'r']) {
      const lo = this.bones[`lowerarm${sd}`];
      if (lo) lo.quaternion.slerp(Character.IDQ, GAIT_ELBOW);
    }
    this.gaitPitchWant = GAIT_UPRIGHT;
    const hips = this.bones.hips;
    if (!hips || !hips.parent) return;
    this.holder.updateWorldMatrix(true, true);
    const sc = this.holder.scale.y || 1;
    const base = Character.SG_B.set(0, 0, 0);
    this.holder.getWorldPosition(base);
    const hp = Character.SG_H;
    hips.getWorldPosition(hp);
    const h = (hp.y - base.y) / sc;
    const want = GAIT_HIP + (h - GAIT_HIP) * GAIT_DAMP + GAIT_LIFT;
    const dy = (want - h) * sc;
    if (Math.abs(dy) < 0.002) return;
    const legs = this.sgLegs;
    for (let i = 0; i < 2; i++) {
      const side = i ? 'r' : 'l', L = legs[i];
      L.up = this.bones[`upperleg${side}`]; L.lo = this.bones[`lowerleg${side}`]; L.ft = this.bones[`foot${side}`];
      if (!L.up || !L.lo || !L.ft) return;
      L.ft.getWorldPosition(L.ank); L.lo.getWorldPosition(L.knee); L.ft.getWorldQuaternion(L.q);
      // Knochenlängen aus der unveränderten Pose (vor Beckenverschiebung und Fußhub-Dämpfung)
      L.up.getWorldPosition(Character.SG_T);
      L.a = L.knee.distanceTo(Character.SG_T); L.b = L.ank.distanceTo(L.knee);
      // Fußhub dämpfen: der Clip hebt den Fuß beim Schwingen bis über 65 cm (Ferse zum Gesäß, wie beim Joggen); ein Gehen hebt ihn ~25 cm
      L.ank.y = base.y + sc * (GAIT_ANKLE + 0.02 + (((L.ank.y - base.y) / sc) - GAIT_ANKLE) * GAIT_FOOT);
    }
    hp.y += dy;
    hips.position.copy(hips.parent.worldToLocal(hp));
    hips.updateMatrixWorld(true);
    for (const L of legs) {
      const S = Character.SG_S.set(0, 0, 0);
      L.up.getWorldPosition(S);
      const a = L.a, b = L.b;
      const dir = Character.SG_D.copy(L.ank).sub(S);
      const dist = Math.min(Math.max(dir.length(), 0.05), (a + b) * 0.998);
      dir.normalize();
      // Kniebeuge zeigt dorthin, wohin das Knie im Clip zeigte
      const hint = Character.SG_K.copy(L.knee).sub(S);
      hint.addScaledVector(dir, -hint.dot(dir));
      if (hint.lengthSq() < 1e-8) continue;
      hint.normalize();
      const x = (a * a - b * b + dist * dist) / (2 * dist);
      const hh = Math.sqrt(Math.max(0, a * a - x * x));
      const knee = Character.SG_E.copy(S).addScaledVector(dir, x).addScaledVector(hint, hh);
      this.aimBone(L.up, L.lo, knee);
      this.aimBone(L.lo, L.ft, Character.SG_A.copy(L.ank));
      const par = L.ft.parent;
      if (par) { par.getWorldQuaternion(Character.IK_PQ); L.ft.quaternion.copy(Character.IK_PQ.invert().multiply(L.q)); L.ft.updateMatrixWorld(true); }
    }
  }
  private sgLegs = [0, 1].map(() => ({ up: null as unknown as Bone, lo: null as unknown as Bone, ft: null as unknown as Bone, ank: new V3(), knee: new V3(), q: new Quaternion(), a: 0.4, b: 0.4 }));
  private static readonly IDQ = new Quaternion();
  private gaitPitch = 0;
  private gaitPitchWant = 0;
  private static readonly SG_B = new V3();
  private static readonly SG_H = new V3();
  private static readonly SG_S = new V3();
  private static readonly SG_T = new V3();
  private static readonly SG_D = new V3();
  private static readonly SG_K = new V3();
  private static readonly SG_E = new V3();
  private static readonly SG_A = new V3();

  // ---------- Treffer-Randlicht und Auflösen ----------
  private fxU: ToonFxUniforms[] = [];
  private fxMats: Material[] = [];
  private fxReady = false;
  private hitT = 0;
  private hitAmp = 0;
  private tintAmt = 0;
  private dissolveK = 0;

  /**
   * Eigene Effekt-Materialien anlegen (eine Kopie je verwendetem Material dieser Figur, gleiches Shader-Programm).
   * Gegner bekommen sie gleich beim Erscheinen, damit der erste Treffer nicht ruckelt.
   */
  enableFx() {
    if (this.fxReady) return;
    this.fxReady = true;
    const made = new Map<Material, Material>();
    this.holder.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const src = m.material as Material;
      if ((src as Material & { userData: { outline?: boolean } }).userData?.outline) return;
      let v = made.get(src);
      if (!v) {
        const fx = toonFx(src);
        if (!fx) return;
        v = fx.mat;
        made.set(src, v);
        fx.u.hero.value = this.heroK;
        fx.u.near.value = this.nearK;
        this.fxU.push(fx.u);
        this.fxMats.push(v);
      }
      m.material = v;
    });
  }

  /** Stärke des heroischen Kantenlichts (1 = normal): Bosse und Insel-Kommandanten heben sich damit vor jeder Kulisse ab (4.4B) */
  private heroK = 1;
  setHeroRim(k: number) {
    this.heroK = k;
    this.enableFx();
    for (const u of this.fxU) u.hero.value = k;
  }

  /** Nahbereichs-Ausblenden (4.5A): 0 = sichtbar, 1 = ausgeblendet; die Kamera rückt an einer Wand an die Figur heran (`cameraNearFade`) */
  private nearK = 0;
  setNearFade(k: number) {
    const v = k > 0.001 ? Math.min(1, k) : 0;
    if (v === this.nearK) return;
    this.nearK = v;
    if (v > 0) this.enableFx();
    for (const u of this.fxU) u.near.value = v;
  }

  /** Effekt-Kopien verwerfen (z. B. nach Aussehen-Wechsel, der neue Materialien setzt) */
  private dropFx() {
    for (const m of this.fxMats) disposeMaterial(m);
    this.fxMats = [];
    this.fxU = [];
    this.fxReady = false;
  }

  /** Treffer: Ränder leuchten kurz in der Trefferfarbe auf */
  hitFlash(color: ColorRepresentation = 0xffffff, strength = 1) {
    this.enableFx();
    for (const u of this.fxU) u.hitCol.value.set(color);
    this.hitT = 0.16;
    this.hitAmp = strength;
    // sofort sichtbar – auch während des Standbilds, in dem keine Logikschritte laufen
    for (const u of this.fxU) u.hit.value = Math.max(this.tintAmt, strength);
  }

  /** Dauerhafte Färbung (z. B. eingefroren); 0 = aus */
  setTint(color: ColorRepresentation, amount: number) {
    if (amount > 0) this.enableFx();
    if (amount > 0) for (const u of this.fxU) u.hitCol.value.set(color);
    this.tintAmt = amount;
  }

  /** Nur die Stärke der Färbung ändern (Puls einer Aura): ohne die Farbe neu zu lesen */
  setTintAmount(amount: number) {
    if (amount > 0) this.enableFx();
    this.tintAmt = amount;
  }

  /** Auflösen beim Besiegen: 0 = ganz, 1 = verschwunden */
  setDissolve(k: number) {
    if (k > 0) this.enableFx();
    if (k > 0 && this.dissolveK === 0) {
      // Konturen und Schatten folgen den Löchern nicht – während des Auflösens aus
      this.holder.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.castShadow = false;
        // auch die Schatten-Detailstufe des Renderers soll ihn nicht wieder einschalten
        (m.userData as { skCast?: boolean }).skCast = false;
        if ((m.material as Material & { userData: { outline?: boolean } }).userData?.outline) m.visible = false;
      });
    }
    this.dissolveK = k;
    for (const u of this.fxU) u.dissolve.value = k;
  }

  update(dt: number) {
    if (this.fxReady) {
      this.hitT = Math.max(0, this.hitT - dt);
      const v = Math.max(this.tintAmt, this.hitAmp * (this.hitT / 0.16));
      for (const u of this.fxU) u.hit.value = v;
    }
    const rx = this.rigX;
    // Clip-Stand des letzten Schritts zurück (alles vom Rig Gesetzte fällt weg), Mischer, Clip-Stand sichern
    rx?.restore();
    this.mixer.update(dt);
    rx?.snapshot();
    this.gaitPitchWant = 0;
    if (this.currentName in WALK_NATURAL) this.softenGait();
    this.gaitPitch += (this.gaitPitchWant - this.gaitPitch) * Math.min(1, dt * 6);
    if (rx) {
      rx.busy = !CALM_CLIP.test(this.currentName);
      // 4.6G: entspannte Arme nur in ruhigen Stand- und Geh-Clips (nie am Steuer, im Sitzen oder in Kampfhaltungen)
      rx.relaxClip = RELAX_CLIP.test(this.currentName);
      rx.coatOn = this.coatOn;
      // Gang: Oberkörper etwas aufrechter als im Clip (vorher als eigene Neigung, jetzt im Rig)
      rx.extraPitch = this.gaitPitch;
      rx.apply(dt);
      this.eyeGlow(rx.glow);
    }
    this.syncCull();
    this.updateCape(dt);
    if (this.lamp) {
      // die Laterne pendelt leicht, beim Gehen stärker
      const lt = performance.now() * 0.001 + this.lampPhase;
      const w = this.currentName in WALK_NATURAL ? 1 : this.currentName === 'Running_A' || this.currentName === 'Running_B' ? 1.8 : 0.35;
      this.lamp.rotation.z = Math.sin(lt * 2.6) * 0.07 * w;
      this.lamp.rotation.x = Math.sin(lt * 3.1 + 1) * 0.06 * w;
    }
  }

  /** Augen-Leuchten (Sturm-Erwachen, Ultimates): die Iris strahlt in der Leuchtfarbe und blüht im Bloom */
  private eyeGlow(k: number) {
    if (Math.abs(k - this.glowShown) < 0.01 && !(k === 0 && this.glowShown !== 0)) return;
    const v = k < 0.01 ? 0 : k;
    this.glowShown = v;
    if (v > 0) this.enableFx();
    for (const m of this.irises) {
      const mat = m.material as MeshToonMaterial;
      // nur eigene Kopien färben (Effekt-Kopien je Figur), nie das geteilte Material
      // so stark, dass die Iris im Bloom aufglüht, Pupille und Glanzpunkte aber lesbar bleiben
      if (mat?.emissive && this.fxMats.includes(mat)) mat.emissive.copy(this.glowCol).multiplyScalar(v * 0.75);
    }
  }

  // ---------- Rig: Blick, Mimik, Bereitschaft, Stöße (4.6F) ----------

  /** Blickziel in Welt (null = geradeaus) */
  lookAt(x: number | null, y = 0, z = 0) { this.rigX?.lookAt(x, y, z); }
  setMood(id: ExpressionId, k = 1) { this.rigX?.setMood(id, k); }
  setReady(k: number) { this.rigX?.setReady(k); }
  /** Aufprall nach Sprung oder Sturz (m/s) */
  land(impact: number) { this.rigX?.land(impact); }
  /** Sprechen: Mund und Gesten für sec Sekunden */
  talk(sec: number, gesture = 0.6) { this.rigX?.talk(sec, gesture); }
  kick(vx: number, vy: number, vz: number) { this.rigX?.kick(vx, vy, vz); }
  setGround(fn: ((x: number, z: number, y: number) => number) | null) { if (this.rigX) this.rigX.ground = fn; }
  setGrounded(on: boolean) { if (this.rigX) this.rigX.grounded = on; }
  setHandPose(side: 'l' | 'r', id: HandPoseId) { this.rigX?.setHand(side, id); }
  setGlowColor(color: ColorRepresentation) { this.glowCol.set(color); this.glowShown = -1; }
  /** Die zwölf Sockets der Figur (headTop … handOff) */
  get charSockets(): CharacterSockets | null { return this.rigX?.sockets ?? null; }

  /** Präsenz (Endbosse, Stadtleute): Statur, Haltung, Ausdruck, Atemtempo */
  presence(p: Partial<PresenceDef> & { stance?: StanceId }) {
    const rx = this.rigX;
    if (!rx) return;
    if (p.build && p.build !== this.buildOverride) { this.buildOverride = p.build; rx.setBuild(p.build); this.sockets.normalize(); }
    if (p.stance) rx.setStance(p.stance);
    if (p.face) rx.setMood(p.face, 0.8);
    if (p.breath) rx.setBreath(p.breath);
  }

  /** Wind an allen Figuren (Welt, m/s) und Betrachter (Kamera) für die Detailstufen */
  static setWind(x: number, z: number) { CharacterRig.wind.set(x, 0, z); }
  static setViewer(v: Vector3 | null) { CharacterRig.viewerOn = !!v; if (v) CharacterRig.viewer.copy(v); }
  /** Detail-Faktor der Grafikstufe (Sichtweite der Figuren / 112 m): schwache Geräte rechnen Stoff und Füße nur ganz nah */
  static setRigDetail(k: number) { CharacterRig.detail = Math.max(0.45, Math.min(1.3, Number.isFinite(k) ? k : 1)); }

  /** Druckwelle auf Stoff und Haar aller Figuren im Umkreis (Ultimates, Königsdruck, Explosionen) */
  static blastAll(x: number, y: number, z: number, radius: number, strength: number) {
    for (const c of Character.all) {
      const p = c.holder.position;
      if (Math.abs(p.x - x) > radius + 2 || Math.abs(p.z - z) > radius + 2) continue;
      c.rigX?.blast(x, y, z, radius, strength);
    }
  }

  /** Objekt in eine Hand legen ('r' oder 'l'). null entfernt. */
  /** Waffen aus Modellen der Ausrüstung (Entermesser rechts, Parierdolch links) und ob rechts gerade ein Säbel liegt */
  private heldSkin: { r: Object3D | null; l: Object3D | null } = { r: null, l: null };
  private sabre = false;

  hold(side: 'l' | 'r', obj: Object3D | null, grip = 0.3) {
    const slot = this.sockets.node(side === 'r' ? 'mainHand' : 'offHand');
    if (!slot) return;
    // 4.6G: weggesteckte Waffen erst zurück in die Hände (dann gibt der Tausch unten sie richtig frei), danach wieder wegstecken
    const sh = this.sheath;
    if (sh) this.unsheatheNow();
    if (side === 'r') {
      this.sabre = !!obj?.userData.swordSkin;
      if (obj && this.sabre && this.heldSkin.r) {
        // Lichtschweif-Marken des Säbels übernehmen (Klinge des Entermessers: Ansatz bei 0,3, Spitze bei 0,9)
        const skin = this.heldSkin.r;
        for (const c of [...skin.children]) if (c.name === 'trailBase' || c.name === 'trailTip') skin.remove(c);
        const b = new Object3D(); b.name = 'trailBase'; b.position.set(0.02, 0.3, 0);
        const t = new Object3D(); t.name = 'trailTip'; t.position.set(0.11, 0.84, 0);
        skin.add(b, t);
        obj = skin;
      }
    } else if (!obj && this.sabre && this.heldSkin.l) obj = this.heldSkin.l;
    // neue Waffe: Schweife beim nächsten Einschalten neu anlegen
    this.dropTrails();
    // Vorige Waffe freigeben (Modelle aus Blender sind geteilt und bleiben, Säbel und Schilde aus Formen werden frei)
    for (const c of [...slot.children]) { slot.remove(c); if (c !== obj) disposeObject(c); }
    if (obj) { slot.add(obj); this.stylize(obj); }
    // ein Schild links verdeckt die Laterne an der linken Hüfte: sie wechselt dann die Seite
    // (die Halterung schaut mit dem Rücken zum Körper: beim Seitenwechsel mitdrehen)
    if (side === 'l' && this.lamp && this.vroid) {
      const left = !obj?.userData.wide;
      const node = this.rigX?.sockets.get(left ? 'hipLeft' : 'hipRight');
      if (node && this.lamp.parent !== node) { node.add(this.lamp); this.lamp.position.set(0, 0, 0); }
      this.lamp.rotation.y = left ? Math.PI : 0;
    }
    this.rigX?.setHand(side, obj ? 'griff' : grip >= 0.95 ? 'faust' : grip >= 0.6 ? 'steuer' : 'offen');
    // Länge der Klinge für die Rückenwaffe (Modelle aus Blender: Entermesser rechts, Parierdolch links)
    if (obj && obj === this.heldSkin.r) obj.userData.bladeLen ??= SHEATH_LEN.entermesser;
    if (obj && obj === this.heldSkin.l) obj.userData.bladeLen ??= SHEATH_LEN.dolch;
    if (sh) this.sheathe(true, sh.grip, sh.all);
  }

  /** 4.6G: weggesteckte Waffen (Rücken-Socket) samt ihrer Lage in der Hand */
  private sheath: { grip: number; all: boolean; items: { obj: Object3D; side: 'l' | 'r'; pos: V3; quat: Quaternion; scale: V3; visible: boolean }[] } | null = null;

  /** Stecken die Waffen gerade weg? */
  get sheathed() { return !!this.sheath; }

  /**
   * Waffen wegstecken (true) oder wieder in die Hände nehmen (false). Klingen (`userData.bladeLen`) wandern auf den Socket `backWeapon`:
   * Griff über der rechten Schulter, Doppelklingen gekreuzt, Abstand zum Rücken nach der äußersten Kleidung; unter einem Umhang oder
   * Schultermantel liegen sie verdeckt. Schilde liegen flach auf dem Rücken. `all`: auch Fäuste und Fokus-Kugeln ablegen (am Steuer).
   * `grip`: Handhaltung ohne Waffe (0,8 = am Steuerrad). Billig, wenn sich nichts ändert (je Bild aufrufbar).
   */
  sheathe(on: boolean, grip = 0.3, all = false) {
    if (!on) { if (this.sheath) this.unsheatheNow(); return; }
    if (this.sheath && this.sheath.grip === grip && this.sheath.all === all) return;
    if (this.sheath) this.unsheatheNow();
    const back = this.rigX?.sockets.get('backWeapon') ?? null;
    const slots = { r: this.sockets.node('mainHand'), l: this.sockets.node('offHand') };
    const held = { r: slots.r?.children[0] ?? null, l: slots.l?.children[0] ?? null };
    const blade = (o: Object3D | null) => !!o && typeof o.userData.bladeLen === 'number';
    const double = blade(held.r) && blade(held.l);
    const covered = !!this.rigX?.cloth?.isOn('cape');
    const clear = this.sheathClear();
    const items: NonNullable<Character['sheath']>['items'] = [];
    this.dropTrails();
    for (const side of ['r', 'l'] as const) {
      const o = held[side];
      if (!o) continue;
      const wide = !!o.userData.wide;
      if (!blade(o) && !wide && !all) continue;
      items.push({ obj: o, side, pos: o.position.clone(), quat: o.quaternion.clone(), scale: o.scale.clone(), visible: o.visible });
      if (back && blade(o)) {
        const p = sheathPose(o.userData.bladeLen as number, side, double, clear);
        back.add(o);
        o.position.set(p.hx, p.hy, p.z);
        o.quaternion.setFromAxisAngle(_zAxis, p.rotZ);
        o.scale.setScalar(1);
        o.visible = !covered;
      } else if (back && wide) {
        // Schild flach zwischen den Schulterblättern (Rand nach oben), unter dem Umhang verdeckt
        back.add(o);
        o.position.set(0, -0.06, -clear - 0.02);
        o.quaternion.setFromAxisAngle(_yAxis, Math.PI / 2);
        o.scale.setScalar(0.8);
        o.visible = !covered;
      } else o.visible = false;
    }
    this.sheath = { grip, all, items };
    for (const side of ['r', 'l'] as const) {
      const still = slots[side]?.children[0];
      this.rigX?.setHand(side, still && still.visible ? 'griff' : grip >= 0.95 ? 'faust' : grip >= 0.6 ? 'steuer' : 'offen');
    }
  }

  /** Weggesteckte Waffen sofort zurück in ihre Halterungen (Lage wie vorher) */
  private unsheatheNow() {
    const sh = this.sheath;
    if (!sh) return;
    this.sheath = null;
    for (const it of sh.items) {
      const slot = this.sockets.node(it.side === 'r' ? 'mainHand' : 'offHand');
      if (!slot) { disposeObject(it.obj); continue; }
      slot.add(it.obj);
      it.obj.position.copy(it.pos);
      it.obj.quaternion.copy(it.quat);
      it.obj.scale.copy(it.scale);
      it.obj.visible = it.visible;
      this.rigX?.setHand(it.side, 'griff');
    }
  }

  /** Abstand der Rückenwaffe zum Rücken: äußerste getragene Schicht am Oberkörper */
  private sheathClear() {
    let c = SHEATH.clear.haut;
    for (const k of this.worn) c = Math.max(c, SHEATH.clear[k === 'kuerass' ? 'ruestung' : k] ?? 0);
    return c;
  }

  /** Figur entfernen und alles freigeben, was nur ihr gehört (Kleidung, Hut, Waffen, Skelett-Daten) */
  dispose() {
    Character.moving.delete(this);
    Character.all.delete(this);
    // weggesteckte Waffen hängen am Rücken-Socket: zurück in die Hände, damit sie mit der Figur freigegeben werden
    this.unsheatheNow();
    this.rigX?.sockets.clear();
    Character.lamped.delete(this);
    unregisterCulled(this.holder);
    this.lamp?.removeFromParent();
    this.lamp = null;
    this.dropTrails();
    // Effekt-Kopien gehören nur dieser Figur (hängen sie gerade nicht an einem Netz, hier freigeben)
    for (const m of this.fxMats) disposeMaterial(m);
    this.fxMats = [];
    this.fxU = [];
    this.releaseGeometry();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.rig);
    this.undress();
    disposeRig(this.holder);
  }
}

const _zAxis = new V3(0, 0, 1), _yAxis = new V3(0, 1, 0);

/**
 * Geometrie freigeben, die ihre Punktdaten mit der Grundfigur teilt: nur was der Figur allein gehört.
 * Die geteilten Puffer werden vorher abgehängt (dispose() gäbe sonst deren Grafikspeicher frei); die Dreiecksliste
 * bleibt nur dran, wenn sie verworfen ist und mit freigegeben werden soll.
 */
function releaseShared(g: BufferGeometry, freeIndex: boolean, own: string[] = []) {
  for (const name of Object.keys(g.attributes)) if (!own.includes(name)) g.deleteAttribute(name);
  if (!freeIndex) g.setIndex(null);
  g.dispose();
}

/** Kleidung teilt Lage, Gewichte und Dreiecksliste: nur die eigenen Farben freigeben */
function releaseGarment(m: SkinnedMesh, freeIndex: boolean) {
  const g = m.geometry;
  for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'stripe', 'rimD', 'capeK']) g.deleteAttribute(name);
  if (!freeIndex) g.setIndex(null);
  disposeObject(m);
}

/** Figur samt Skelett-Texturen (eine je Klon) freigeben; geteilte Netze der Grundfigur bleiben */
function disposeRig(root: Object3D) {
  const skeletons = new Set<Skeleton>();
  root.traverse((o) => { const sm = o as SkinnedMesh; if (sm.isSkinnedMesh) skeletons.add(sm.skeleton); });
  for (const s of skeletons) s.dispose();
  disposeObject(root);
}
