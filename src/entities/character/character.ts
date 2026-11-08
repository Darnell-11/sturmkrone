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
  type Object3D,
  type Skeleton,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ROLES, type AnimRole, type ClipRef } from '../../data/animations';
import type { CharacterLook } from '../../data/characterParts';
import { addOutlines } from '../../render/outline';
import { toon, toonFx, type ToonFxUniforms } from '../../render/toon';
import { disposeMaterial } from '../../render/dispose';
import { audio } from '../../audio/audio';
import type { ColorRepresentation, Material, Mesh } from 'three';
import { disposeObject, markShared } from '../../render/dispose';
import type { CharacterAssets } from './assets';
import { buildCharacterGeometry, LIMB_EXT } from './builder';
import { slotTurn, VROID_BONES, VroidBase, type GarmentKind } from './vroid';
import { attachHeadgear, attachOutfit } from './animeHats';

const CURL_Z = new Vector3(0, 0, 1), CURL_X = new Vector3(1, 0, 0);

/** Lange Frisuren nutzen die weibliche Grundfigur, kurze die männliche */
function isFemale(l: CharacterLook) { return ['lang', 'pferdeschwanz', 'zoepfe', 'zopf', 'dutt'].includes(l.hair); }

/** Weltmaßstab: Skelett ist 2,2 Einheiten hoch → Figur ca. 1,75 m */
export const CHARACTER_SCALE = 0.8;

const IDENTITY = new Matrix4();
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
export class Character {
  /** In die Welt setzen und bewegen */
  readonly holder = new Group();

  // ---------- Weiche Darstellung zwischen den festen Logikschritten (60 Hz) ----------
  // Die Logik setzt die Position 60-mal pro Sekunde (place); die Darstellung gleitet bei jedem Bild
  // zwischen dem letzten und dem aktuellen Schritt (present). So ruckelt nichts auf 90/120/144-Hz-Bildschirmen.
  private static moving = new Set<Character>();
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
  private face: { mesh: SkinnedMesh; blink: number; joy: number; mouth: number } | null = null;
  private blinkT = 2 + Math.random() * 3;
  private headgear: Group | null = null;
  private outfit: Group[] = [];
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
  }

  // ---------- Anime-Figur (VRoid) ----------

  private initVroid(vb: VroidBase, look: CharacterLook) {
    const old = this.rig;
    const held = { l: this.bones.handslotl?.children[0] ?? null, r: this.bones.handslotr?.children[0] ?? null };
    // gehaltene Waffen wandern zur neuen Figur – vorher abnehmen, damit sie nicht mit der alten freigegeben werden
    held.l?.removeFromParent(); held.r?.removeFromParent();
    if (old) { this.mixer?.stopAllAction(); this.mixer?.uncacheRoot(old); for (const g of this.garments) releaseGarment(g); this.garments = []; disposeRig(old); }
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
      this.curl(s, held[s] ? 1 : 0.3);
    }
    this.face = null;
    this.rig.traverse((o) => {
      const m = o as SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.castShadow = true;
      // Anime-Gesichter bleiben schattenfrei (sonst legt sich ein dunkler Haarschatten über die Augen)
      m.receiveShadow = !/Face/i.test(m.name);
      m.frustumCulled = true;
      const dict = m.morphTargetDictionary;
      if (dict) {
        const find = (re: RegExp) => { const k = Object.keys(dict).find((n) => re.test(n)); return k !== undefined ? dict[k] : -1; };
        const blink = find(/EYE_Close$/);
        if (blink >= 0) this.face = { mesh: m, blink, joy: find(/ALL_Joy$/), mouth: find(/MTH_A$/) };
      }
    });
    this.holder.add(this.rig);
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
    };
    this.rig.traverse((o) => {
      const m = o as SkinnedMesh;
      const i = m.userData.vroidPart as number | undefined;
      if (!m.isSkinnedMesh || i === undefined) return;
      const p = vb.parts[i];
      const mat = toon({ color: colorFor[p.slot], map: p.gray ?? p.map, side: p.doubleSided ? DoubleSide : FrontSide, transparent: p.transparent, spec: p.slot === 'hair' ? 0.7 : 0, rim: p.slot === 'fixed' ? 0.4 : 1 });
      mat.alphaTest = p.alphaTest || (p.transparent ? 0 : 0.5);
      m.material = mat;
    });
    // Kopfschmuck und Piraten-Kleidung neu aufsetzen
    disposeObject(this.headgear);
    this.headgear = null;
    for (const o of this.outfit) disposeObject(o);
    const chest = this.rig.getObjectByName('J_Bip_C_Chest'), hips = this.rig.getObjectByName('J_Bip_C_Hips');
    const marine = look.outfit === 'uniform' || look.hat === 'marine' || look.hat === 'zweispitz';
    this.outfit = chest && hips ? attachOutfit(chest, hips, this.rig.getObjectByName('J_Bip_L_UpperArm') ?? null, this.rig.getObjectByName('J_Bip_R_UpperArm') ?? null, look, marine ? 'marine' : 'pirat', this.outline) : [];
    this.dressVroid(vb, look);
    const head = this.rig.getObjectByName('J_Bip_C_Head');
    if (head) this.headgear = attachHeadgear(head, this.rig.getObjectByName('J_Adj_L_FaceEye') ?? null, this.rig.getObjectByName('J_Adj_R_FaceEye') ?? null, look, this.outline, vb.hairFit);
    const h = Math.min(1.1, Math.max(0.9, look.height));
    const base = vb.template.scale.x;
    const wide = look.body === 'kraeftig' ? 1.07 : look.body === 'schmal' ? 0.95 : 1;
    this.rig.scale.set(base * h * wide, base * h, base * h * wide);
  }

  /**
   * Piratenkleidung: Hose statt Faltenrock (die Grundfigur trägt eine Schuluniform), hohe Stiefel und Mantel.
   * Die Stücke entstehen aus dem Körper selbst und bewegen sich deshalb genau mit.
   */
  private dressVroid(vb: VroidBase, look: CharacterLook) {
    for (const g of this.garments) releaseGarment(g);
    this.garments = [];
    const female = vb === this.assets.vroid?.female;
    this.rig.traverse((o) => {
      const m = o as SkinnedMesh;
      const i = m.userData.vroidPart as number | undefined;
      if (m.isSkinnedMesh && i !== undefined && vb.parts[i].slot === 'bottom') m.visible = !female;
    });
    const body = vb.bodySkin(this.rig);
    if (!body?.parent) return;
    const want: [GarmentKind, string][] = [];
    if (female) want.push(['hose', look.pantsColor]);
    want.push(['guertel', look.outfit === 'uniform' || look.hat === 'marine' || look.hat === 'zweispitz' ? '#2A2420' : look.accentColor]);
    if (look.shoes === 'stiefel') want.push(['stiefel', look.shoesColor]);
    if (look.coat === 'kurz') want.push(['mantelKurz', look.coatColor]);
    else if (look.coat === 'lang' || look.coat === 'kapitaen') want.push(['mantelLang', look.coatColor]);
    const set = vb.garmentSet(want.map((w) => w[0]));
    if (!set) return;
    // eigene Farben je Figur, Lage und Gewichte werden geteilt
    const geo = new BufferGeometry();
    for (const name of ['position', 'normal', 'skinIndex', 'skinWeight'] as const) geo.setAttribute(name, set.attributes[name]);
    geo.setIndex(set.index);
    geo.boundingSphere = set.boundingSphere;
    const part = set.attributes.part;
    const cols = want.map((w) => new Color(w[1]));
    const col = new Float32Array(part.count * 3);
    for (let i = 0; i < part.count; i++) cols[part.getX(i)].toArray(col, i * 3);
    geo.setAttribute('color', new BufferAttribute(col, 3));
    const m = new SkinnedMesh(geo, toon({ color: 0xffffff, vertexColors: true, side: DoubleSide, rim: 0.8 }));
    m.bind(body.skeleton, body.bindMatrix);
    m.castShadow = true;
    m.receiveShadow = true;
    body.parent.add(m);
    if (this.outline) addOutlines(m, 0.7);
    this.garments.push(m);
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
    const mat = toon({ color: 0xffffff, vertexColors: true, spec: 0.15 });
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

  /** Eine Spielaktion abspielen (siehe data/animations.ts) */
  play(role: AnimRole, opts: PlayOptions = {}) {
    const r = ROLES[role] as ClipRef;
    return this.playClip(r.clip, { loop: r.loop, speed: r.speed, ...opts });
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
   * Schrittgeschwindigkeit an die echte Bewegung anpassen, damit die Füße nicht über den Boden rutschen.
   * Gemessen: Gehen ≈ 1,5 m/s, Rennen ≈ 3,7 m/s bei normaler Abspielgeschwindigkeit.
   */
  setLocoSpeed(mps: number) {
    const a = this.current;
    if (!a) return;
    if (this.currentName === 'Walking_A') a.timeScale = Math.max(0.45, Math.min(1.6, mps / 1.5));
    else if (this.currentName === 'Running_A') a.timeScale = Math.max(0.7, Math.min(1.75, mps / 3.7));
  }

  /** Fortschritt der aktuellen Animation 0 … 1 */
  get progress() {
    const a = this.current;
    if (!a) return 0;
    return a.time / a.getClip().duration;
  }

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
        this.fxU.push(fx.u);
        this.fxMats.push(v);
      }
      m.material = v;
    });
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
    this.mixer.update(dt);
    // Mimik: blinzeln, beim Jubeln strahlen, beim Reden den Mund bewegen
    const f = this.face;
    if (f && f.mesh.morphTargetInfluences) {
      const inf = f.mesh.morphTargetInfluences;
      this.blinkT -= dt;
      if (this.blinkT < -0.14) this.blinkT = 2 + Math.random() * 4;
      const joy = this.currentName === 'Cheering' ? 1 : 0;
      if (f.joy >= 0) inf[f.joy] += (joy - inf[f.joy]) * Math.min(1, dt * 8);
      inf[f.blink] = joy ? 0 : this.blinkT < 0 ? 1 : 0;
      if (f.mouth >= 0) inf[f.mouth] = this.currentName === 'Interact' ? 0.35 + 0.35 * Math.sin(performance.now() * 0.02) : 0;
    }
  }

  /** Objekt in eine Hand legen ('r' oder 'l'). null entfernt. */
  hold(side: 'l' | 'r', obj: Object3D | null) {
    const slot = this.bones[`handslot${side}`];
    if (!slot) return;
    for (const c of [...slot.children]) slot.remove(c);
    if (obj) slot.add(obj);
    this.curl(side, obj ? 1 : 0.3);
  }

  /**
   * Finger der Anime-Figur beugen: 1 = Faust um den Griff, 0.3 = locker. Die Animationen bewegen
   * die Finger nicht, deshalb bleibt die Stellung einfach stehen.
   * VRoid-Ruhelage: Finger links entlang −X, rechts entlang +X, Handfläche nach unten, Daumen nach vorn (−Z).
   */
  private curl(side: 'l' | 'r', amount: number) {
    if (!this.vroid) return;
    const S = side === 'l' ? 'L' : 'R';
    const sign = side === 'l' ? 1 : -1;
    const bend = [1.05, 1.3, 0.9];
    for (const f of ['Index', 'Middle', 'Ring', 'Little']) {
      for (let j = 0; j < 3; j++) {
        const b = this.rig.getObjectByName(`J_Bip_${S}_${f}${j + 1}`);
        // der kleine Finger etwas stärker, der Zeigefinger etwas lockerer – wirkt natürlicher
        const k = f === 'Index' ? 0.85 : f === 'Little' ? 1.08 : 1;
        if (b) b.quaternion.setFromAxisAngle(CURL_Z, sign * bend[j] * k * amount);
      }
    }
    const thumb = [0.25, 0.55, 0.5];
    for (let j = 0; j < 3; j++) {
      const b = this.rig.getObjectByName(`J_Bip_${S}_Thumb${j + 1}`);
      if (b) b.quaternion.setFromAxisAngle(CURL_X, -thumb[j] * amount);
    }
  }

  /** Figur entfernen und alles freigeben, was nur ihr gehört (Kleidung, Hut, Waffen, Skelett-Daten) */
  dispose() {
    Character.moving.delete(this);
    // Effekt-Kopien gehören nur dieser Figur (hängen sie gerade nicht an einem Netz, hier freigeben)
    for (const m of this.fxMats) disposeMaterial(m);
    this.fxMats = [];
    this.fxU = [];
    this.releaseGeometry();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.rig);
    for (const g of this.garments) releaseGarment(g);
    this.garments = [];
    this.outfit = [];
    this.headgear = null;
    disposeRig(this.holder);
  }
}

/** Kleidung teilt Lage und Gewichte mit der Grundfigur: nur die eigenen Farben freigeben, nie die geteilten Puffer */
function releaseGarment(m: SkinnedMesh) {
  const g = m.geometry;
  for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) g.deleteAttribute(name);
  g.setIndex(null);
  disposeObject(m);
}

/** Figur samt Skelett-Texturen (eine je Klon) freigeben; geteilte Netze der Grundfigur bleiben */
function disposeRig(root: Object3D) {
  const skeletons = new Set<Skeleton>();
  root.traverse((o) => { const sm = o as SkinnedMesh; if (sm.isSkinnedMesh) skeletons.add(sm.skeleton); });
  for (const s of skeletons) s.dispose();
  disposeObject(root);
}
