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
import { preload } from './preload';

/**
 * Shader vorkompilieren, damit nichts beim ersten Erscheinen ruckelt – seit 4.4B in zwei Stufen:
 *
 * 1. `warmupShaders` (hinter dem Ladebildschirm): alles, was das Titelbild zeigt – Inseln, Meer, Himmel, Prachtschiff, Spielfigur. Zuerst kommen
 *    die Lichter in ihren Endzustand (Kaskaden), dann übersetzt die Grafikkarte parallel (compileAsync), dann zeichnen einige Bilder Schatten-
 *    und Nachbearbeitungs-Programme.
 * 2. `warmupExtras` (im Hintergrund, während das Menü steht): von allem, was erst im Spiel auftaucht, einmal ein Exemplar – Anime-Figuren
 *    (männlich/weiblich, mit Waffen, Treffer-Leuchten, Auflösen, Waffenschweif), Rüstungssets, jede Schiffsklasse und die Schiffe der
 *    Weltmächte, Treffer- und Schwertbögen, Druckwellen, Warnkreise, Boden-Decals, die Einschläge aller Elemente. Alles liegt unter dem Meer
 *    auf einer Ebene, die keine Kamera zeigt (das Titelbild zeigt nichts davon); compileAsync erfasst auch das. Das Spiel beginnt erst, wenn
 *    diese Stufe fertig ist (`Game.awaitWarm`).
 *
 * Damit die Programme danach nicht wieder verworfen werden (three.js gibt ein Programm frei, sobald kein Material es mehr nutzt), hält ein
 * unsichtbarer „Bewahrer“ eine Kopie jedes neuen Materials.
 */
export interface WarmupDeps {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** ein Bild zeichnen (inklusive Nachbearbeitung) */
  renderFrame(): void;
  /** Szene parallel vorübersetzen (mit dem richtigen Zielpuffer, siehe GameRenderer.precompile); fehlt es, greift compileAsync */
  precompile?(): Promise<void>;
  /** Meldet, dass gleich eine lange, nicht teilbare Arbeit beginnt (true) beziehungsweise vorbei ist (false) */
  onBlocking?(on: boolean): void;
}

export interface ExtrasDeps {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  assets: CharacterAssets;
  fx: CombatFx;
  particles: ParticleSystem;
  precompile?(): Promise<void>;
}

/** Ebene, die keine Kamera zeigt: die Vorwärm-Exemplare liegen dort, solange das Titelbild läuft */
export const HIDDEN_LAYER = 31;

let keeper: Group | null = null;

function materialsOf(o: Object3D): Material[] {
  const m = (o as Mesh).material as Material | Material[] | undefined;
  return !m ? [] : Array.isArray(m) ? m : [m];
}

async function compileScene(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, precompile?: () => Promise<void>) {
  if (precompile) { await precompile(); return; }
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    renderer.compile(scene, camera);
  }
}

/** Texturen auf die Grafikkarte laden (in Häppchen von etwa 20 ms, dazwischen bekommt der Browser Luft) */
async function uploadTextures(renderer: WebGLRenderer, root: Object3D, onSlice?: (k: number) => void, skip?: Set<string>) {
  const seenTex = new Set<string>();
  const texList: { isTexture?: boolean; uuid?: string; image?: unknown }[] = [];
  root.traverse((o) => {
    if (skip?.has(o.uuid)) return;
    for (const m of materialsOf(o)) {
      for (const k in m) {
        const v = (m as unknown as Record<string, unknown>)[k] as { isTexture?: boolean; uuid?: string; image?: unknown } | null;
        if (v && v.isTexture && v.image && v.uuid && !seenTex.has(v.uuid)) { seenTex.add(v.uuid); texList.push(v); }
      }
    }
  });
  let sliceStart = performance.now();
  for (let i = 0; i < texList.length; i++) {
    try { renderer.initTexture(texList[i] as never); } catch { /* Textur ohne Bild */ }
    if (performance.now() - sliceStart > 20) { onSlice?.(i / texList.length); await tick(); sliceStart = performance.now(); }
  }
}

/** Stufe 1: das Titelbild (hinter dem Ladebildschirm) */
export async function warmupShaders(d: WarmupDeps, progress: (k: number) => void) {
  const { scene, camera } = d;
  progress(0.02);
  // ---- Texturen schon jetzt auf die Grafikkarte laden (sonst ruckelt es, sobald eine Insel zum ersten Mal ins Bild kommt) ----
  await uploadTextures(d.renderer, scene, (k) => progress(0.02 + 0.38 * k));
  progress(0.4);
  preload.mark('warm: Texturen #' + (d.renderer.info.programs?.length ?? 0));

  // ---- Lichter in ihren Endzustand bringen, BEVOR übersetzt wird (4.4B) ----
  // Jedes Programm hängt von der Zahl der Lichter ab. Früher fehlten beim parallelen Übersetzen noch die vier Kaskaden-Lichter (sie entstehen
  // erst im ersten Bild), und beim gestaffelten Zeichnen unten verschwanden die Laternen des Schiffs mit dem Schiff: jedes Material wurde
  // dreimal übersetzt (rund 230 Programme zu viel). Ein leeres Bild legt die Kaskaden an; danach bleibt die Lichtzahl fest.
  const hidePre = scene.children.filter((o) => o.visible && !(o as { isLight?: boolean }).isLight && !(o as { isCamera?: boolean }).isCamera);
  for (const o of hidePre) o.visible = false;
  d.renderFrame();
  for (const o of hidePre) o.visible = true;

  // ---- Übersetzen (parallel, wenn der Browser es kann) und einige Bilder zeichnen ----
  await compileScene(d.renderer, scene, camera, d.precompile);
  progress(0.8);
  preload.mark('warm: compileAsync #' + (d.renderer.info.programs?.length ?? 0));
  await tick();
  // Das erste echte Bild übersetzt Schattentiefe und Nachbearbeitung (nicht parallel möglich). Damit es nicht ein einziger Block wird, zeichnen
  // wir die Szene in Gruppen: zuerst ist alles ausgeblendet, dann kommt Gruppe für Gruppe dazu. Gruppen mit Lichtern darin bleiben sichtbar
  // (sonst änderte sich die Lichtzahl und alles würde neu übersetzt).
  const hasLight = (o: Object3D) => { let found = false; o.traverse((c) => { if ((c as { isLight?: boolean }).isLight) found = true; }); return found; };
  const hideable = scene.children.filter((o) => o.visible && !(o as { isLight?: boolean }).isLight && !(o as { isCamera?: boolean }).isCamera && !hasLight(o));
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
  preload.mark('warm: Bilder #' + (d.renderer.info.programs?.length ?? 0));
  await tick();
  heatShared.clear();
  progress(1);
}

/** Stufe 2: alles, was erst im Spiel auftaucht – unsichtbar im Hintergrund, während das Menü steht */
export async function warmupExtras(d: ExtrasDeps): Promise<void> {
  const { scene, camera } = d;
  const t0 = performance.now();
  const before = new Set<string>();
  scene.traverse((o) => before.add(o.uuid));
  camera.updateMatrixWorld();
  // weit unter dem Meer und auf einer Ebene, die keine Kamera zeigt
  const at = camera.position.clone();
  at.y -= 400;
  const root = new Group();
  root.name = 'warmExtras';
  scene.add(root);
  const hide = (o: Object3D) => o.traverse((c) => c.layers.set(HIDDEN_LAYER));

  // ---- Figuren: beide Grundfiguren mit Waffen und Effekt-Materialien ----
  const figs: Character[] = [];
  for (const role of ['pirat', 'marine'] as const) {
    for (const female of [false, true]) {
      const look = randomLook(Math.random, role);
      // Frisur bestimmt die Grundfigur (lange Haare = weibliche Figur)
      look.hair = female ? 'lang' : 'stachel';
      const c = new Character(d.assets, look, true);
      c.holder.position.copy(at).add(new Vector3(figs.length * 0.9 - 1.4, 0, 0));
      root.add(c.holder);
      const w = enemyWeapons(figs.length % 2 ? 'schild' : 'saebel');
      c.hold('r', w.right);
      c.hold('l', w.left);
      c.play('idle');
      c.update(0.016);
      c.enableFx();
      c.hitFlash('#ffffff');
      hide(c.holder);
      figs.push(c);
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
    root.add(c.holder);
    c.play('idle');
    c.update(0.016);
    c.enableFx();
    hide(c.holder);
    figs.push(c);
    await tick();
  }
  // ---- Schiffe: jede Klasse einmal (Rümpfe, Segel, Takelage, Kanonen, Schaum haben eigene Materialien) ----
  const ships: Group[] = [];
  for (const cls of SHIP_CLASSES) {
    const m = buildShip(cls, DEFAULT_SHIP_LOOK(ships.length % 2 ? 'marine' : 'pirat'), false);
    m.group.position.copy(at);
    m.group.scale.setScalar(0.01);
    root.add(m.group);
    hide(m.group);
    ships.push(m.group);
    await tick();
  }
  // ---- Schiffe der Weltmächte (Phase 4.3C): Segelmuster, Wappen und Tuchflaggen jeder Macht werden einmal gemalt und hochgeladen ----
  for (const f of FACTION_IDS) {
    const m = buildShip(SHIP_CLASSES[2], factionShipLook(f), false);
    m.group.position.copy(at);
    m.group.scale.setScalar(0.01);
    root.add(m.group);
    hide(m.group);
    ships.push(m.group);
    await tick();
  }

  // ---- Kampfeffekte und Boden-Decals (sie hängen in eigenen Gruppen der Szene) ----
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
  // Schweif einmal an und abtasten, damit sein Netz Punkte hat
  figs[0].setTrail(true, '#ff6a4a');
  Character.renderTrails(0.016);
  // alles Neue außerhalb der eigenen Gruppe (Effekt-Pools, Decals, Schweife) bis zum Aufräumen auf die verborgene Ebene; die alten Ebenen
  // merken (die Pools werden im Spiel wiederverwendet)
  const layerBack: [Object3D, number][] = [];
  scene.traverse((o) => {
    if (before.has(o.uuid) || o === root) return;
    let p: Object3D | null = o;
    while (p && p !== root) p = p.parent;
    if (p === root) return;
    layerBack.push([o, o.layers.mask]);
    o.layers.set(HIDDEN_LAYER);
  });
  await tick();

  // ---- Bewahrer: Kopie jedes neuen Materials hält sein Programm am Leben ----
  keeper ??= new Group();
  keeper.name = 'shaderKeeper';
  const seen = new Set<string>();
  scene.traverse((o) => {
    if (before.has(o.uuid) || o === keeper || o.parent === keeper) return;
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
  keeper.visible = false;
  if (!keeper.parent) scene.add(keeper);
  await tick();

  // ---- Texturen hochladen und parallel übersetzen (die Grafikkarte arbeitet, das Titelbild läuft weiter) ----
  await uploadTextures(d.renderer, scene, undefined, before);
  await compileScene(d.renderer, scene, camera, d.precompile);
  preload.mark(`warm: Hintergrund ${Math.round(performance.now() - t0)} ms #${d.renderer.info.programs?.length ?? 0}`);

  // ---- Aufräumen: Effekte sofort ablaufen lassen, Ebenen zurück, Schiffe weg, Figuren unsichtbar ----
  efx.update(10);
  fx.update(10);
  fx.decals.update(60);
  d.particles.update(10);
  heatShared.clear();
  for (const [o, mask] of layerBack) o.layers.mask = mask;
  for (const g of ships) disposeObject(g);
  figs[0].setTrail(false);
  Character.renderTrails(1);
  for (const c of figs) {
    // Figur bleibt unsichtbar bestehen: ihre Effekt-Materialien halten die Programme der Gegner am Leben
    c.holder.visible = false;
  }
}
