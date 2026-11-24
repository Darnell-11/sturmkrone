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
import { DEFAULT_SHIP_LOOK, SHIP_CLASSES, factionShipLook } from '../data/ships';
import { FACTION_IDS } from '../data/factions';
import { disposeObject } from '../render/dispose';
import { tick } from './yield';

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
  /** Szene parallel vorübersetzen (mit dem richtigen Zielpuffer, siehe GameRenderer.precompile); fehlt es, greift compileAsync */
  precompile?(): Promise<void>;
  /** Meldet, dass gleich eine lange, nicht teilbare Arbeit beginnt (true) beziehungsweise vorbei ist (false) */
  onBlocking?(on: boolean): void;
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
      progress(0.02 + 0.04 * (figs.length / 9));
      await tick();
    }
  }
  // ---- Ausrüstung: Figuren in ganzen Sets, damit alle Oberflächen (Stoff, Leder, Stahl, Gold, Seide) samt Borten und Mustern vorab übersetzt sind ----
  for (const set of ['eisenwall', 'drache', 'sturmkrone', 'kapitaen', 'strand']) {
    const look = randomLook(Math.random, 'pirat');
    look.extra = ['head', 'shoulder', 'chest', 'cloak', 'hands', 'legs', 'feet', 'mainhand', 'offhand'].map((c) => `${set}_${c}`);
    if (set === 'strand') look.hairModel = 'frisur_mehrlagig';
    const c = new Character(d.assets, look, true);
    c.holder.position.copy(at).add(new Vector3(figs.length * 0.9 - 1.4, 0, 0));
    scene.add(c.holder);
    c.play('idle');
    c.update(0.016);
    c.enableFx();
    figs.push(c);
    progress(0.02 + 0.04 * (figs.length / 9));
    await tick();
  }
  // ---- Schiffe: jede Klasse einmal (Rümpfe, Segel, Takelage, Kanonen, Schaum haben eigene Materialien) ----
  const ships: Group[] = [];
  for (const cls of SHIP_CLASSES) {
    const m = buildShip(cls, DEFAULT_SHIP_LOOK(ships.length % 2 ? 'marine' : 'pirat'), false);
    m.group.position.copy(at);
    m.group.scale.setScalar(0.01);
    scene.add(m.group);
    ships.push(m.group);
    progress(0.06 + 0.09 * (ships.length / SHIP_CLASSES.length));
    await tick();
  }
  // ---- Schiffe der Weltmächte (Phase 4.3C): Segelmuster, Wappen und Tuchflaggen jeder Macht werden einmal gemalt und hochgeladen, damit ein Konvoi,
  // eine Blockade oder ein Weltboss auf See keine Textur malen und keinen Shader übersetzen muss (Spawn-Ruckler aus 4.3.3) ----
  for (const f of FACTION_IDS) {
    const m = buildShip(SHIP_CLASSES[2], factionShipLook(f), false);
    m.group.position.copy(at);
    m.group.scale.setScalar(0.01);
    scene.add(m.group);
    ships.push(m.group);
    await tick();
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
  await tick();

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
  await tick();

  // ---- Texturen schon jetzt auf die Grafikkarte laden (sonst ruckelt es, sobald eine Insel zum ersten Mal ins Bild kommt) ----
  // in Häppchen von etwa 20 ms, dazwischen bekommt der Browser Luft
  const seenTex = new Set<string>();
  const texList: { isTexture?: boolean; uuid?: string; image?: unknown }[] = [];
  scene.traverse((o) => {
    for (const m of materialsOf(o)) {
      for (const k in m) {
        const v = (m as unknown as Record<string, unknown>)[k] as { isTexture?: boolean; uuid?: string; image?: unknown } | null;
        if (v && v.isTexture && v.image && v.uuid && !seenTex.has(v.uuid)) { seenTex.add(v.uuid); texList.push(v); }
      }
    }
  });
  let sliceStart = performance.now();
  for (let i = 0; i < texList.length; i++) {
    try { d.renderer.initTexture(texList[i] as never); } catch { /* Textur ohne Bild */ }
    if (performance.now() - sliceStart > 20) { progress(0.4 + 0.2 * (i / texList.length)); await tick(); sliceStart = performance.now(); }
  }
  progress(0.6);

  // ---- Übersetzen (parallel, wenn der Browser es kann) und zwei Bilder zeichnen ----
  if (d.precompile) await d.precompile();
  else {
    try {
      await d.renderer.compileAsync(scene, camera);
    } catch {
      d.renderer.compile(scene, camera);
    }
  }
  progress(0.8);
  await tick();
  // Das erste echte Bild übersetzt Schattentiefe und Nachbearbeitung (nicht parallel möglich). Beim allerersten Start auf einem Gerät
  // kann das mehrere Sekunden am Stück dauern (die Grafikkarte merkt sich die Programme danach): der Ladebildschirm zeigt dann
  // einen wandernden Streifen statt eines stehenden Balkens (siehe `onBlocking`).
  // Damit es nicht ein einziger Block wird, zeichnen wir die Szene in Gruppen: zuerst ist alles ausgeblendet (Lichter bleiben, sonst
  // ändert sich die Lichtzahl und damit die Programme), dann kommt Gruppe für Gruppe dazu. Jedes Bild übersetzt nur, was neu ist;
  // dazwischen bekommt der Browser Luft und der Balken rückt vor. Danach ist alles wieder genau so sichtbar wie vorher.
  const hideable = scene.children.filter((o) => o.visible && !(o as { isLight?: boolean }).isLight && !(o as { isCamera?: boolean }).isCamera);
  for (const o of hideable) o.visible = false;
  const batch = Math.max(1, Math.ceil(hideable.length / 10));
  d.onBlocking?.(true);
  await tick();
  d.renderFrame(); // Nachbearbeitung und Schattenkarte (ohne sichtbare Objekte)
  d.onBlocking?.(false);
  for (let i = 0; i < hideable.length; i += batch) {
    for (const o of hideable.slice(i, i + batch)) o.visible = true;
    d.renderFrame();
    progress(0.8 + 0.12 * Math.min(1, (i + batch) / hideable.length));
    await tick();
  }
  for (const o of hideable) o.visible = true;
  d.renderFrame();
  progress(0.92);
  await tick();

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
