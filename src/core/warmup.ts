import {
  Group,
  Mesh,
  Vector3,
  type Material,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { ELEMENT_COLORS, type Element } from '../data/skills';
import { randomLook } from '../data/characterParts';
import { Character } from '../entities/character/character';
import { enemyWeapons } from '../entities/character/weapons';
import type { CharacterAssets } from '../entities/character/assets';
import type { CombatFx } from '../combat/fx';
import { ElementFx } from '../faji/elementFx';
import type { ParticleSystem } from '../world/particles';
import { cloneToon } from '../render/toon';
import { heatShared } from '../render/heat';
import { buildShip } from '../entities/ship/shipBuilder';
import { DEFAULT_SHIP_LOOK, SHIP_CLASSES } from '../data/ships';
import { disposeObject } from '../render/dispose';

/**
 * Shader vorkompilieren, bevor der Ladebildschirm verschwindet (gegen Ruckler beim ersten Erscheinen).
 *
 * Vor der Kamera wird von allem einmal ein Exemplar erzeugt: Anime-Figuren (männlich/weiblich, mit Waffen,
 * Treffer-Leuchten, Auflösen, Waffenschweif), Treffer- und Schwertbögen, Druckwellen, Warnkreise, alle Boden-Decals
 * und die Einschläge aller Elemente. Dann übersetzt die Grafikkarte alle Programme (compileAsync – parallel, wo
 * möglich) und zwei Bilder werden gezeichnet (Schattenkarten und Nachbearbeitung).
 *
 * Damit die Programme danach nicht wieder verworfen werden (three.js gibt ein Programm frei, sobald kein Material
 * es mehr nutzt), hält ein unsichtbarer „Bewahrer“ eine Kopie jedes neuen Materials.
 */
export interface WarmupDeps {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  assets: CharacterAssets;
  fx: CombatFx;
  particles: ParticleSystem;
  /** ein Bild zeichnen (inklusive Nachbearbeitung) */
  renderFrame(): void;
}

let keeper: Group | null = null;

function materialsOf(o: Object3D): Material[] {
  const m = (o as Mesh).material as Material | Material[] | undefined;
  return !m ? [] : Array.isArray(m) ? m : [m];
}

export async function warmupShaders(d: WarmupDeps, progress: (k: number) => void) {
  const { scene, camera } = d;
  progress(0.02);
  // alles, was schon da ist, merken – nur Neues muss bewahrt werden
  const before = new Set<string>();
  scene.traverse((o) => before.add(o.uuid));

  camera.updateMatrixWorld();
  const fwd = camera.getWorldDirection(new Vector3());
  const at = camera.position.clone().addScaledVector(fwd, 7);
  at.y = camera.position.y - 1.5;

  // ---- Figuren: beide Grundfiguren mit Waffen, Effekt-Materialien und Schweif ----
  const figs: Character[] = [];
  for (const role of ['pirat', 'marine'] as const) {
    for (const female of [false, true]) {
      const look = randomLook(Math.random, role);
      // Frisur bestimmt die Grundfigur (lange Haare = weibliche Figur)
      look.hair = female ? 'lang' : 'stachel';
      const c = new Character(d.assets, look, true);
      c.holder.position.copy(at).add(new Vector3(figs.length * 0.9 - 1.4, 0, 0));
      scene.add(c.holder);
      const w = enemyWeapons(figs.length % 2 ? 'schild' : 'saebel');
      c.hold('r', w.right);
      c.hold('l', w.left);
      c.play('idle');
      c.update(0.016);
      c.enableFx();
      c.hitFlash('#ffffff');
      c.setTrail(true, '#ff6a4a');
      figs.push(c);
    }
  }
  // ---- Schiffe: jede Klasse einmal (Rümpfe, Segel, Takelage, Kanonen, Schaum haben eigene Materialien) ----
  const ships: Group[] = [];
  for (const cls of SHIP_CLASSES) {
    const m = buildShip(cls, DEFAULT_SHIP_LOOK(ships.length % 2 ? 'marine' : 'pirat'), false);
    m.group.position.copy(at);
    m.group.scale.setScalar(0.01);
    scene.add(m.group);
    ships.push(m.group);
  }
  progress(0.15);

  // ---- Kampfeffekte und Boden-Decals ----
  const fx = d.fx;
  fx.hit(at.clone().setY(at.y + 1), 'slash', '#ffffff', true);
  fx.hit(at.clone().setY(at.y + 1), 'magic', '#9fd8ff');
  fx.smear(at.clone().setY(at.y + 1), 0, 0.4, 2.2, 2, '#ffffff');
  fx.shockwave(at, 3, '#ffffff');
  fx.telegraph(at, 2, 1);
  fx.crack(at, 3); fx.burn(at, 2); fx.frost(at, 2); fx.sigil(at, 2, '#ffd166');
  fx.rise(at, '#ffd166', 4);
  // ---- Einschläge aller Elemente (Flammen, Splitter, Säulen, Ringe, Blitze …) ----
  const efx = new ElementFx(scene, fx, d.particles, { shake: () => {}, hitstop: () => {}, speedlines: () => {} });
  for (const el of Object.keys(ELEMENT_COLORS) as Element[]) efx.impact(at.clone(), el, 1);
  progress(0.3);

  // Schweife einmal abtasten, damit ihr Netz Punkte hat
  Character.renderTrails(0.016);

  // ---- Bewahrer: Kopie jedes neuen Materials hält sein Programm am Leben ----
  keeper ??= new Group();
  keeper.name = 'shaderKeeper';
  const seen = new Set<string>();
  scene.traverse((o) => {
    if (before.has(o.uuid) || o === keeper) return;
    for (const m of materialsOf(o)) {
      if (seen.has(m.uuid)) continue;
      seen.add(m.uuid);
      const mesh = o as Mesh;
      // gleiche Objektart wie das Original (Netz/Skin/Instanz zählen zum Programm) – die Figuren selbst bleiben unten erhalten
      if ((o as { isSkinnedMesh?: boolean }).isSkinnedMesh || (o as { isInstancedMesh?: boolean }).isInstancedMesh) continue;
      if (!mesh.isMesh || !mesh.geometry) continue;
      const copy = (m as Material & { userData: { toon?: boolean } }).userData?.toon ? cloneToon(m) : m.clone();
      const k = new Mesh(mesh.geometry, copy);
      k.frustumCulled = false;
      k.position.copy(at);
      k.scale.setScalar(0.001);
      keeper!.add(k);
    }
  });
  scene.add(keeper);
  keeper.visible = true;
  progress(0.4);

  // ---- Texturen schon jetzt auf die Grafikkarte laden (sonst ruckelt es, sobald eine Insel zum ersten Mal ins Bild kommt) ----
  const seenTex = new Set<string>();
  let texN = 0;
  scene.traverse((o) => {
    for (const m of materialsOf(o)) {
      for (const k in m) {
        const v = (m as unknown as Record<string, unknown>)[k] as { isTexture?: boolean; uuid?: string; image?: unknown } | null;
        if (v && v.isTexture && v.image && v.uuid && !seenTex.has(v.uuid)) { seenTex.add(v.uuid); try { d.renderer.initTexture(v as never); texN++; } catch { /* Textur ohne Bild */ } }
      }
    }
  });
  progress(0.6);

  // ---- Übersetzen (parallel, wenn der Browser es kann) und zwei Bilder zeichnen ----
  try {
    await d.renderer.compileAsync(scene, camera);
  } catch {
    d.renderer.compile(scene, camera);
  }
  progress(0.8);
  d.renderFrame();
  d.renderFrame();
  progress(0.92);

  // ---- Aufräumen: Effekte sofort ablaufen lassen, Figuren und Bewahrer unsichtbar ----
  efx.update(10);
  fx.update(10);
  fx.decals.update(60);
  d.particles.update(10);
  heatShared.clear();
  keeper.visible = false;
  for (const g of ships) disposeObject(g);
  for (const c of figs) {
    c.setTrail(false);
    Character.renderTrails(1);
    // Figur bleibt unsichtbar bestehen: ihre Effekt-Materialien halten die Programme der Gegner am Leben
    c.holder.visible = false;
  }
  progress(1);
}
