import { CylinderGeometry, Group, Mesh, SphereGeometry, Vector3 } from 'three';
import { CombatFx } from '../combat/fx';
import type { StyleId } from '../data/animations';
import type { CharacterLook } from '../data/characterParts';
import type { SkillDef } from '../data/skills';
import type { CharacterAssets } from '../entities/character/assets';
import { AbilityRunner, castClip, type AbilityTarget } from '../faji/abilities';
import { addOutlines } from '../render/outline';
import { toon } from '../render/toon';
import { EditorStage } from './editorStage';
import { ParticleSystem } from './particles';

/** Vorschau im Faji-Baum: die eigene Figur zeigt jede Fähigkeit an Übungspuppen. */
export class SkillStage extends EditorStage {
  private fx: CombatFx;
  private sparks: ParticleSystem;
  private dust: ParticleSystem;
  private runner: AbilityRunner;
  private dummies: { g: Group; x: number; z: number; wobble: number }[] = [];
  private caster = { x: -1, y: 0, z: 0, yaw: Math.PI / 2 };

  constructor() {
    super();
    this.sparks = new ParticleSystem(this.scene, true, 0.32);
    this.dust = new ParticleSystem(this.scene, false, 0.7);
    this.fx = new CombatFx(this.scene, this.sparks, this.dust);
    for (const [x, z] of [[2.6, 0], [4.2, -1.7], [4.2, 1.7]]) {
      const g = new Group();
      const post = new Mesh(new CylinderGeometry(0.07, 0.09, 1.7, 8), toon(0x8a5a2b));
      post.position.y = 0.85;
      const sack = new Mesh(new CylinderGeometry(0.3, 0.33, 0.8, 12), toon(0xd9b98a));
      sack.position.y = 1.1;
      const head = new Mesh(new SphereGeometry(0.22, 12, 10), toon(0xd9b98a));
      head.position.y = 1.7;
      g.add(post, sack, head);
      addOutlines(g);
      g.position.set(x, 0, z);
      this.scene.add(g);
      this.dummies.push({ g, x, z, wobble: 0 });
    }
    const targets = (): AbilityTarget[] => this.dummies.map((d) => ({
      x: d.x, y: 0, z: d.z, radius: 0.45, alive: true,
      hit: () => { d.wobble = 1.5; },
      shove: () => {},
    }));
    this.runner = new AbilityRunner({
      scene: this.scene, fx: this.fx, particles: this.sparks,
      caster: this.caster,
      moveCaster: (x, z, yaw) => { this.caster.x = x; this.caster.z = z; if (yaw !== undefined) this.caster.yaw = yaw; },
      targets,
      ground: () => 0,
      power: 20,
      shake: () => {}, hitstop: () => {}, cutin: () => {}, speedlines: () => {},
      buff: () => {}, heal: () => {},
    });
  }

  override show(assets: CharacterAssets, look: CharacterLook, style: StyleId) {
    super.show(assets, look, style);
    this.resetCaster();
  }

  private resetCaster() {
    this.caster.x = -1; this.caster.z = 0; this.caster.yaw = Math.PI / 2;
  }

  /** Fähigkeit vorführen */
  previewSkill(s: SkillDef, level: number) {
    if (!s.act || !this.char) return;
    this.resetCaster();
    const a = castClip(s);
    const c = this.char;
    c.playClip(a.clip, { loop: false, speed: a.speed, restart: true, fade: 0.05, onDone: () => c.play('idle', { fade: 0.3 }) });
    this.runner.cast(s, Math.max(1, level));
  }

  override update(dt: number) {
    if (this.char) {
      this.char.holder.position.set(this.caster.x, 0, this.caster.z);
      this.char.holder.rotation.y = this.caster.yaw;
      this.char.update(dt);
    }
    this.runner.update(dt);
    this.fx.update(dt);
    this.sparks.update(dt);
    this.dust.update(dt);
    for (const d of this.dummies) {
      d.wobble *= Math.pow(0.03, dt);
      d.g.rotation.z = Math.sin(performance.now() * 0.025) * d.wobble * 0.18;
    }
  }

  override frame(aspect: number, portrait: boolean, panelFraction: number) {
    const cam = this.camera;
    cam.aspect = aspect;
    cam.fov = portrait ? 50 : 38;
    cam.position.set(1.6, 4.4, portrait ? 13.5 : 12.5);
    cam.lookAt(new Vector3(1.6, 1, 0));
    if (portrait) cam.setViewOffset(1000, 1000, 0, panelFraction * 520, 1000, 1000);
    else cam.setViewOffset(1000, 1000, panelFraction * 330, 0, 1000, 1000);
    cam.updateProjectionMatrix();
  }
}
