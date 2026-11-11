import {
  BackSide,
  Color,
  CylinderGeometry,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
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
  zoom = 1;
  private idleTime = 0;
  private style: StyleId = 'saebel';

  constructor() {
    const bg = new Mesh(new SphereGeometry(40, 32, 16), new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: { top: { value: new Color(0x1c3a5e) }, bottom: { value: new Color(0xe8b98a) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top, bottom; varying vec3 vP;
        void main(){ float t = smoothstep(-0.3, 0.6, vP.y); vec3 c = mix(bottom, top, t); gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    }));
    this.scene.add(bg);
    const floor = new Mesh(new CylinderGeometry(1.6, 1.75, 0.18, 48), toon(0x8a5a2b));
    floor.position.y = -0.09;
    floor.receiveShadow = true;
    const rim = new Mesh(new CylinderGeometry(1.62, 1.62, 0.06, 48), toon({ color: 0xe3b04b, spec: 0.8 }));
    rim.position.y = 0.01;
    addOutlines(floor);
    this.scene.add(floor, rim);

    const key = new DirectionalLight(0xfff2dc, 2.6);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    // ohne Versatz wirft die Kleidung Streifen auf sich selbst (Schatten-Akne)
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const sc = key.shadow.camera;
    sc.left = -2; sc.right = 2; sc.top = 3; sc.bottom = -1; sc.near = 1; sc.far = 15;
    const back = new DirectionalLight(0x9fd8ff, 1.2);
    back.position.set(-3, 3, -4);
    this.scene.add(key, back, new HemisphereLight(0xdff3ff, 0x5a3a2a, 1.1));
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

  rotate(dx: number) { this.yaw += dx * 0.01; this.idleTime = 0; }
  zoomBy(d: number) { this.zoom = MathUtils.clamp(this.zoom + d, 0.45, 1.3); }

  update(dt: number) {
    this.idleTime += dt;
    if (this.idleTime > 4) this.yaw += dt * 0.25;
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
    const dist = (portrait ? 7.4 : 6.6) * this.zoom;
    const lookY = this.zoom < 0.7 ? 1.4 : 0.95;
    cam.position.set(0, lookY + 0.35, dist);
    cam.lookAt(0, lookY, 0);
    // Figur nach oben bzw. links schieben, damit das Menü sie nicht verdeckt
    if (portrait) cam.setViewOffset(1000, 1000, 0, panelFraction * 500, 1000, 1000);
    else cam.setViewOffset(1000, 1000, panelFraction * 500, 0, 1000, 1000);
    cam.updateProjectionMatrix();
  }
}
