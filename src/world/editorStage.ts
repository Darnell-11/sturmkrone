import {
  BackSide,
  Color,
  CylinderGeometry,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshToonMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { StyleId } from '../data/animations';
import { ROLES, STYLE_ANIMS } from '../data/animations';
import type { CharacterLook } from '../data/characterParts';
import { ACTION_STYLES, actionStyleOf } from '../data/actionStyles';
import type { CharacterAssets } from '../entities/character/assets';
import { Character } from '../entities/character/character';
import { weaponsFor } from '../entities/character/weapons';
import { GearAura } from '../graphics/gearAura';
import type { AnimeVfxForge } from '../graphics/animeVfxForge';
import { addOutlines } from '../render/outline';
import { STAGE_FOCUS, STAGE_LIGHTING, type StageFocus, type StageLight, type StagePose } from '../data/editorStudio';
import { toon, toonShared } from '../render/toon';

export type { StageFocus, StagePose, StageLight } from '../data/editorStudio';

/** Studio für den Charakter-Editor: Figur auf einem Drehteller, weiches Licht, Farbverlauf. */
export class EditorStage {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(32, 1, 0.1, 100);
  readonly focus = new Vector3(0, 1.0, 0);
  char: Character | null = null;
  yaw = 0.5;
  /** Zielwerte der Kamera; die sichtbaren (cz, cy) gleiten dorthin */
  zoom = 1;
  private lookY = 0.95;
  private cz = 1;
  private cy = 0.95;
  /** senkrechtes Umkreisen (Ziehen nach oben/unten): Höhe der Kamera über der Blickhöhe, Anteil des Abstands */
  private tilt = 0;
  private tiltT = 0;
  private yawTarget: number | null = null;
  private idleTime = 0;
  autoSpin = true;
  private style: StyleId = 'saebel';
  /** Schein hinter der Figur in der Farbe der Seltenheit des gezeigten Stücks */
  protected aura = new PointLight(0xffffff, 0, 6, 1.6);
  protected ring!: Mesh;
  /** 4.7D.1: Boden des Drehtellers (Face-Off und Klassen-Showcase blenden ihn aus bzw. ersetzen ihn) */
  protected floor!: Mesh;
  /** 4.6G: Laterne für die Nachtstimmung (immer da, nur die Stärke wechselt) */
  protected lantern = new PointLight(0xffb060, 0, 7, 1.8);
  protected key!: DirectionalLight;
  protected back!: DirectionalLight;
  protected fill!: DirectionalLight;
  protected hemi!: HemisphereLight;
  protected bgU!: { top: { value: Color }; bottom: { value: Color } };
  protected floorMat!: MeshToonMaterial;
  private camFocus: StageFocus = 'ganz';
  /** 4.6G: Haltung, Licht, Aura der Endgame-Ausrüstung, geliehene Effekt-Pools */
  pose: StagePose = 'hafen';
  light: StageLight = 'sonne';
  readonly gearAura = new GearAura();
  protected vfx: AnimeVfxForge | null = null;
  private fxT = 0;
  private gustT = 0;
  private readonly tmpC = new Color();
  private readonly tmpV = new Vector3();
  /** Leuchtfarbe des Kampfstils (beim Stilwechsel umgerechnet) */
  private readonly accent = new Color('#7FD8FF');

  constructor() {
    this.bgU = { top: { value: new Color(0x0d1624) }, bottom: { value: new Color(0x4a5568) } };
    const bg = new Mesh(new SphereGeometry(40, 32, 16), new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: this.bgU,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top, bottom; varying vec3 vP;
        void main(){ float t = smoothstep(-0.3, 0.6, vP.y); vec3 c = mix(bottom, top, t); gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    }));
    this.scene.add(bg);
    this.floorMat = toon({ color: 0x2a303c, unique: true }) as MeshToonMaterial;
    const floor = new Mesh(new CylinderGeometry(1.6, 1.75, 0.18, 48), this.floorMat);
    floor.position.y = -0.09;
    floor.receiveShadow = true;
    this.floor = floor;
    const rim = new Mesh(new TorusGeometry(1.6, 0.03, 8, 72), toon({ color: 0xe3b04b, spec: 0.8, unique: true }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.0;
    addOutlines(floor);
    this.ring = rim;
    this.aura.position.set(-1.2, 1.4, -1.6);
    // Laterne vorn links in Brusthöhe: warmes Licht von der Seite, wie im nächtlichen Hafen
    this.lantern.position.set(1.1, 1.55, 1.2);
    this.scene.add(floor, rim, this.aura, this.lantern);

    const key = new DirectionalLight(0xfff6e8, 2.5);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    // ohne Versatz wirft die Kleidung Streifen auf sich selbst (Schatten-Akne)
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const sc = key.shadow.camera;
    sc.left = -2; sc.right = 2; sc.top = 3; sc.bottom = -1; sc.near = 1; sc.far = 15;
    const back = new DirectionalLight(0xbfe0ff, 1.5);
    back.position.set(-3, 3, -4);
    // Füllicht von der Seite (hellt die Schattenseite der Rüstung auf, ohne das Studio zu flach zu machen)
    const fill = new DirectionalLight(0xd8e4ff, 0.7);
    fill.position.set(-4, 1.5, 3);
    const hemi = new HemisphereLight(0xe6efff, 0x3a3f4a, 1.0);
    this.key = key; this.back = back; this.fill = fill; this.hemi = hemi;
    this.scene.add(key, back, fill, hemi);
  }

  /** Figur anzeigen (neu oder aktualisiert) */
  show(assets: CharacterAssets, look: CharacterLook, style: StyleId) {
    if (!this.char) {
      this.char = new Character(assets, look, true);
      this.scene.add(this.char.holder);
    } else this.char.setLook(look);
    this.setStyle(style);
  }

  setStyle(style: StyleId) {
    this.style = style;
    if (!this.char) return;
    const w = weaponsFor(style);
    this.char.hold('r', w.right);
    this.char.hold('l', w.left);
    this.applyPose(true);
  }

  /** Grundhaltung der gewählten Pose (Clip, Waffen, Ausdruck, Bereitschaft) */
  private idleClip(): string {
    return this.pose === 'hafen' ? ROLES.idle.clip : STYLE_ANIMS[this.style].idle.clip;
  }

  /** 4.6G: Haltung wechseln – Hafen (Klinge auf dem Rücken, lockerer Stand), Kampfbereitschaft, Sturm-Erwachen (Leuchten, Wind, Aura) */
  setPose(p: StagePose) {
    if (p === this.pose) return;
    this.pose = p;
    this.applyPose(false);
  }

  private applyPose(styleChange: boolean) {
    const c = this.char;
    if (!c) return;
    const accent = ACTION_STYLES[actionStyleOf(this.style)]?.accent ?? '#7FD8FF';
    this.accent.set(accent);
    c.sheathe(this.pose === 'hafen');
    c.setReady(this.pose === 'hafen' ? 0 : 1);
    c.setMood(this.pose === 'hafen' ? 'hafen' : this.pose === 'kampf' ? 'kampf' : 'entschlossen');
    c.setGlowColor(accent);
    c.playClip(this.idleClip(), { loop: true, fade: styleChange ? 0.2 : 0.35 });
    if (this.pose === 'erwachen') {
      // Druckwelle durch Mantel und Haar, dann bleibt ein Sturmwind
      this.tmpV.setFromMatrixPosition(c.holder.matrixWorld);
      c.kick(0, 2.5, 0);
      Character.blastAll(this.tmpV.x, this.tmpV.y + 0.2, this.tmpV.z - 0.8, 3, 6);
      this.burstAwaken(accent);
    }
  }

  /** 4.6G: Lichtstimmung (nur Stärken und Farben) */
  setLight(l: StageLight) {
    this.light = l;
    const L = STAGE_LIGHTING[l];
    this.key.color.setHex(L.key[0]); this.key.intensity = L.key[1];
    this.back.color.setHex(L.back[0]); this.back.intensity = L.back[1];
    this.fill.color.setHex(L.fill[0]); this.fill.intensity = L.fill[1];
    this.hemi.color.setHex(L.hemi[0]); this.hemi.groundColor.setHex(L.hemi[1]); this.hemi.intensity = L.hemi[2];
    this.lantern.intensity = L.lantern;
    this.bgU.top.value.setHex(L.bgTop); this.bgU.bottom.value.setHex(L.bgBottom);
    this.floorMat.color.setHex(L.floor);
  }

  /** Effekt-Pools der Welt (ausgeliehen) für Aura und Sturm-Erwachen; null = keine Effekte */
  attachVfx(vfx: AnimeVfxForge | null) { this.vfx = vfx; }

  /** Vorschau-Animation, danach zurück in die Grundhaltung */
  preview(kind: 'cheer' | 'attack' | 'wave' | 'roll' | 'heavy') {
    const c = this.char;
    if (!c) return;
    // Angriffe mit der Klinge in der Hand, danach zurück in die gewählte Haltung (Hafen: wieder auf den Rücken)
    const armed = kind === 'attack' || kind === 'heavy';
    if (armed) c.sheathe(false);
    const back = () => { if (armed) c.sheathe(this.pose === 'hafen'); c.playClip(this.idleClip(), { loop: true, fade: 0.3 }); };
    if (kind === 'attack') {
      const combo = STYLE_ANIMS[this.style].combo;
      let i = 0;
      const next = () => {
        if (i >= combo.length) { back(); return; }
        const s = combo[i++];
        c.playClip(s.clip, { loop: false, speed: s.speed, fade: 0.08, restart: true, onDone: next });
      };
      next();
    } else if (kind === 'heavy') {
      const h = STYLE_ANIMS[this.style].heavy;
      c.playClip(h.clip, { loop: false, speed: h.speed, restart: true, onDone: back });
    } else {
      c.play(kind, { loop: false, restart: true, onDone: back });
    }
  }

  rotate(dx: number, dy = 0) {
    this.yaw += dx * 0.01;
    // senkrecht: ein Stück über und unter die Figur (ganz von oben oder unten wirkt sie verzerrt)
    this.tiltT = MathUtils.clamp(this.tiltT - dy * 0.004, -0.25, 0.7);
    this.idleTime = 0; this.yawTarget = null;
  }
  zoomBy(d: number) { this.zoom = MathUtils.clamp(this.zoom + d, 0.16, 1.3); this.idleTime = 0; }

  /** Kamera-Voreinstellung: gleitet weich zu Zoom, Blickhöhe und Drehung (alte Namen: gesamt = ganz, kopf = gesicht) */
  preset(p: StageFocus | 'gesamt') {
    this.idleTime = 0;
    const f: StageFocus = p === 'gesamt' ? 'ganz' : p;
    this.camFocus = f;
    this.tiltT = 0;
    // Werte in data/editorStudio.ts: Blickhöhe fest (m) oder relativ zur gemessenen Augenhöhe der Figur
    const F = STAGE_FOCUS[f];
    this.zoom = F.zoom;
    this.lookY = F.fromHead === null ? F.y : this.headY() + F.fromHead;
    this.yawTarget = F.yaw;
  }

  /** Augenhöhe der Figur (Größe, Statur und Grundfigur verschieden) */
  private headY(): number {
    const h = this.char?.bones.head;
    if (!h) return 1.58;
    h.updateWorldMatrix(true, false);
    return this.tmpV.setFromMatrixPosition(h.matrixWorld).y + 0.07;
  }

  /** Schein in der Farbe eines Stücks (Seltenheit); null = aus */
  setAura(color: string | null) {
    this.auraTarget = color ? 3.2 : 0;
    if (color) { this.aura.color.set(color); (this.ring.material as MeshToonMaterial).color.set(color); } else (this.ring.material as MeshToonMaterial).color.set(0xe3b04b);
  }
  private auraTarget = 0;

  /** Sturm-Erwachen: aufsteigende Spirale, Funkenkranz und Druckring in der Farbe des Kampfstils */
  private burstAwaken(accent: string) {
    const v = this.vfx, c = this.char;
    if (!v || !c) return;
    const p = this.tmpV.setFromMatrixPosition(c.holder.matrixWorld);
    const col = this.tmpC.set(accent);
    v.spiral(p.x, p.y, p.z, 0.9, 2.4, col, 0.9, 3, 7);
    v.pressureRing(p.x, p.y + 0.05, p.z, 0, false, 1.4, col, 0.5);
    v.burst('spark', p.x, p.y + 1.1, p.z, 18, 3.5, col, { up: 2.2, size: 0.12, spread: 0.6 });
  }

  update(dt: number) {
    this.idleTime += dt;
    // Kamera gleitet zu den Zielwerten (unabhängig von der Bildrate)
    const k = 1 - Math.exp(-dt * 7);
    // Nahaufnahmen folgen dem Kopf (Atem, Blick, Größe)
    const FF = STAGE_FOCUS[this.camFocus];
    if (FF.follow && FF.fromHead !== null && this.char) this.lookY = this.headY() + FF.fromHead;
    this.cz += (this.zoom - this.cz) * k;
    this.cy += (this.lookY - this.cy) * k;
    this.tilt += (this.tiltT - this.tilt) * k;
    if (this.yawTarget !== null) {
      let d = (this.yawTarget - this.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * k;
      if (Math.abs(d) < 0.01) this.yawTarget = null;
    } else if (this.autoSpin && this.idleTime > 4) this.yaw += dt * 0.25;
    this.aura.intensity += (this.auraTarget - this.aura.intensity) * k;
    const c = this.char;
    if (c) {
      c.holder.rotation.y = this.yaw;
      // 4.6F: im Studio immer volle Detailstufe (Atem, Blick, Stoff, Haar)
      Character.setViewer(null);
      // 4.6G: Sturmwind im Erwachen (Böen von vorn), sonst eine leichte Brise
      this.gustT += dt;
      const g = this.pose === 'erwachen' ? 5.5 + 2.5 * Math.sin(this.gustT * 1.7) : 0.6;
      Character.setWind(Math.sin(this.yaw) * -g * 0.3, -Math.cos(this.yaw) * g);
      c.update(dt);
    }
    // 4.6G: Effekte im Studio (geliehene Pools): Aura der Endgame-Ausrüstung und das Leuchten des Erwachens
    const fight = this.pose === 'hafen' ? 0 : 1;
    toonShared.gearGlow.value = GearAura.glowFor(this.gearAura.level, this.pose === 'erwachen' ? 1 : fight * 0.5);
    if (this.vfx && c) {
      this.vfx.fx.update(dt);
      this.gearAura.update(dt, c, this.vfx, this.pose === 'erwachen' ? 1 : fight * 0.5);
      if (this.pose === 'erwachen') {
        this.fxT -= dt;
        if (this.fxT <= 0) {
          this.fxT = 0.09;
          const p = this.tmpV.setFromMatrixPosition(c.holder.matrixWorld);
          const a = Math.random() * Math.PI * 2, r = 0.45 + Math.random() * 0.35;
          const col = this.accent;
          this.vfx.burst('spark', p.x + Math.sin(a) * r, p.y + 0.1 + Math.random() * 1.6, p.z + Math.cos(a) * r, 1, 0.6, col, { up: 2.4, size: 0.09, life: 0.55 });
          if (Math.random() < 0.25) this.vfx.burst('ember', p.x + Math.sin(a) * r * 0.6, p.y + 0.05, p.z + Math.cos(a) * r * 0.6, 1, 0.4, col, { up: 1.6, size: 0.1, life: 1.1 });
        }
      }
    }
    const L = STAGE_LIGHTING[this.light];
    toonShared.rimColor.value.setHex(L.rim[0]);
    toonShared.rimStrength.value = L.rim[1];
  }

  /** Kamera: im Hochformat steht die Figur im oberen Bereich (unten liegt das Menü) */
  frame(aspect: number, portrait: boolean, panelFraction: number) {
    const cam = this.camera;
    cam.aspect = aspect;
    cam.fov = portrait ? 40 : 30;
    const dist = (portrait ? 7.4 : 6.6) * this.cz;
    const lookY = this.cy;
    // Umkreisen: der Abstand bleibt, die Kamera wandert auf einem Bogen nach oben bzw. unten
    const up = 0.35 * Math.min(1, this.cz + 0.2) + this.tilt * dist;
    cam.position.set(0, Math.max(0.08, lookY + up), dist * Math.cos(Math.min(0.6, Math.abs(this.tilt)) * 0.5));
    cam.lookAt(0, lookY, 0);
    // Figur nach oben bzw. links schieben, damit das Menü sie nicht verdeckt
    if (portrait) cam.setViewOffset(1000, 1000, 0, panelFraction * 500, 1000, 1000);
    else cam.setViewOffset(1000, 1000, panelFraction * 500, 0, 1000, 1000);
    cam.updateProjectionMatrix();
  }
}
