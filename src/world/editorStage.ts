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
import { STYLE_ANIMS } from '../data/animations';
import type { CharacterLook } from '../data/characterParts';
import type { CharacterAssets } from '../entities/character/assets';
import { Character } from '../entities/character/character';
import { weaponsFor } from '../entities/character/weapons';
import { addOutlines } from '../render/outline';
import { toon, toonShared } from '../render/toon';

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
  private yawTarget: number | null = null;
  private idleTime = 0;
  autoSpin = true;
  private style: StyleId = 'saebel';
  /** Schein hinter der Figur in der Farbe der Seltenheit des gezeigten Stücks */
  private aura = new PointLight(0xffffff, 0, 6, 1.6);
  private ring!: Mesh;

  constructor() {
    const bg = new Mesh(new SphereGeometry(40, 32, 16), new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: { top: { value: new Color(0x0d1624) }, bottom: { value: new Color(0x4a5568) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top, bottom; varying vec3 vP;
        void main(){ float t = smoothstep(-0.3, 0.6, vP.y); vec3 c = mix(bottom, top, t); gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    }));
    this.scene.add(bg);
    const floor = new Mesh(new CylinderGeometry(1.6, 1.75, 0.18, 48), toon(0x2a303c));
    floor.position.y = -0.09;
    floor.receiveShadow = true;
    const rim = new Mesh(new TorusGeometry(1.6, 0.03, 8, 72), toon({ color: 0xe3b04b, spec: 0.8, unique: true }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.0;
    addOutlines(floor);
    this.ring = rim;
    this.aura.position.set(-1.2, 1.4, -1.6);
    this.scene.add(floor, rim, this.aura);

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
    this.scene.add(key, back, fill, new HemisphereLight(0xe6efff, 0x3a3f4a, 1.0));
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
    this.char.playClip(STYLE_ANIMS[style].idle.clip, { loop: true, fade: 0.2 });
  }

  /** Vorschau-Animation, danach zurück in die Grundhaltung */
  preview(kind: 'cheer' | 'attack' | 'wave' | 'roll' | 'heavy') {
    const c = this.char;
    if (!c) return;
    const back = () => c.playClip(STYLE_ANIMS[this.style].idle.clip, { loop: true, fade: 0.3 });
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

  rotate(dx: number) { this.yaw += dx * 0.01; this.idleTime = 0; this.yawTarget = null; }
  zoomBy(d: number) { this.zoom = MathUtils.clamp(this.zoom + d, 0.22, 1.3); this.idleTime = 0; }

  /** Kamera-Voreinstellung: gleitet weich zu Zoom, Blickhöhe und Drehung */
  preset(p: 'gesamt' | 'kopf' | 'oberkoerper' | 'beine' | 'ruecken') {
    this.idleTime = 0;
    switch (p) {
      case 'gesamt': this.zoom = 1; this.lookY = 0.95; this.yawTarget = 0.5; break;
      case 'kopf': this.zoom = 0.27; this.lookY = 1.58; this.yawTarget = 0.35; break;
      case 'oberkoerper': this.zoom = 0.5; this.lookY = 1.25; this.yawTarget = 0.45; break;
      case 'beine': this.zoom = 0.52; this.lookY = 0.55; this.yawTarget = 0.5; break;
      case 'ruecken': this.zoom = 0.85; this.lookY = 1.0; this.yawTarget = Math.PI + 0.25; break;
    }
  }

  /** Schein in der Farbe eines Stücks (Seltenheit); null = aus */
  setAura(color: string | null) {
    this.auraTarget = color ? 3.2 : 0;
    if (color) { this.aura.color.set(color); (this.ring.material as MeshToonMaterial).color.set(color); } else (this.ring.material as MeshToonMaterial).color.set(0xe3b04b);
  }
  private auraTarget = 0;

  update(dt: number) {
    this.idleTime += dt;
    // Kamera gleitet zu den Zielwerten (unabhängig von der Bildrate)
    const k = 1 - Math.exp(-dt * 7);
    this.cz += (this.zoom - this.cz) * k;
    this.cy += (this.lookY - this.cy) * k;
    if (this.yawTarget !== null) {
      let d = (this.yawTarget - this.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * k;
      if (Math.abs(d) < 0.01) this.yawTarget = null;
    } else if (this.autoSpin && this.idleTime > 4) this.yaw += dt * 0.25;
    this.aura.intensity += (this.auraTarget - this.aura.intensity) * k;
    if (this.char) {
      this.char.holder.rotation.y = this.yaw;
      this.char.update(dt);
    }
    toonShared.rimColor.value.set(0xffe8c8);
    toonShared.rimStrength.value = 0.6;
  }

  /** Kamera: im Hochformat steht die Figur im oberen Bereich (unten liegt das Menü) */
  frame(aspect: number, portrait: boolean, panelFraction: number) {
    const cam = this.camera;
    cam.aspect = aspect;
    cam.fov = portrait ? 40 : 30;
    const dist = (portrait ? 7.4 : 6.6) * this.cz;
    const lookY = this.cy;
    cam.position.set(0, lookY + 0.35 * Math.min(1, this.cz + 0.2), dist);
    cam.lookAt(0, lookY, 0);
    // Figur nach oben bzw. links schieben, damit das Menü sie nicht verdeckt
    if (portrait) cam.setViewOffset(1000, 1000, 0, panelFraction * 500, 1000, 1000);
    else cam.setViewOffset(1000, 1000, panelFraction * 500, 0, 1000, 1000);
    cam.updateProjectionMatrix();
  }
}
