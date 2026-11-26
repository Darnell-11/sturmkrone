// Phase 4.7D.1 – Stufe A des Einstiegs: der 3D-Anime-„VS“-Face-Off. Marine-Rekrut gegen Piraten-Rekrut im Vordergrund, dahinter die sieben
// Admirals-Silhouetten im Nebel bzw. Kapitän Schwarzbart mit sechs Piraten-Kapitänen in lichtumrandeter Aufstellung. Der Riss, das VS-Emblem
// und die Schrift liegen als CSS/SVG darüber (`ui/faceOffScreen.ts`).
//
// Leistung und Programme: die Bühne ERBT das Studio des Charakter-Editors (`EditorStage`: gleiche Lichter in gleicher Zahl) – die Figuren nutzen
// damit genau die Shader-Programme, die der Editor im nächsten Schritt ohnehin braucht; kein Nebel an der Szene (würde jedes Material neu
// übersetzen). Silhouetten entstehen über die Effekt-Kopien der Figuren (`setTint` dunkel + `setHeroRim` hell, gleiches Programm), Nebel,
// Auren und Blitze über die geliehenen Pools der Welt (`AnimeVfxForge`). Figuren entstehen eine je Bild (kein Stocken beim Öffnen), die
// Hintergrund-Gestalten rechnen nur jedes zweite Bild. Nichts Neues je Bild.
import { Color, Vector3 } from 'three';
import { Character } from '../entities/character/character';
import type { CharacterAssets } from '../entities/character/assets';
import { defaultLook, type CharacterLook } from '../data/characterParts';
import { weaponsFor } from '../entities/character/weapons';
import { toonShared } from '../render/toon';
import { EditorStage } from './editorStage';
import {
  FACE_OFF_CAM, FACE_OFF_SIDES, RECRUITS, faceOffBuildOrder, type FaceOffFigure, type FaceOffSide,
} from '../data/creationFlow';

interface Placed { def: FaceOffFigure; char: Character; color: Color; phase: number; acc: number }

const _v = new Vector3();
const C_WHITE = new Color(1, 1, 1);
const C_MIST = new Color(0.16, 0.18, 0.24);
const C_MARINE = new Color(FACE_OFF_SIDES.marine.aura);
const C_MARINE2 = new Color(FACE_OFF_SIDES.marine.accent);
const C_PIRATE = new Color(FACE_OFF_SIDES.pirat.aura);
const C_PIRATE2 = new Color(FACE_OFF_SIDES.pirat.accent);
const ease = (x: number) => { const k = x < 0 ? 0 : x > 1 ? 1 : x; return k * k * k * (k * (k * 6 - 15) + 10); };

export class FaceOffStage extends EditorStage {
  private readonly figures: Placed[] = [];
  private queue: FaceOffFigure[] = [];
  private assets: CharacterAssets | null = null;
  private t = 0;
  private frameN = 0;
  private mistT = 0;
  private boltT = 0.4;
  /** Zoom in eine Seite: Fortschritt (−1 = keiner) */
  private zoomT = -1;
  private zoomSide: FaceOffSide = 'pirat';
  /** Seite unter dem Zeiger (heller) */
  hover: FaceOffSide | null = null;
  /** gezeichnete Figuren (Prüfungen) */
  get built(): number { return this.figures.length; }
  get total(): number { return this.figures.length + this.queue.length; }
  /** alle Figuren stehen seit ein paar Bildern (Mixer, Ketten und Effekte haben sich gesetzt) */
  private settled = 0;
  get ready(): boolean { return this.settled > 6; }
  /** Zoom fertig (Übergang in den Editor darf beginnen) */
  get zoomDone(): boolean { return this.zoomT >= FACE_OFF_CAM.zoomDur; }
  /** Fortschritt des Zooms 0 … 1 (0 = kein Zoom) */
  get zoomK(): number { return this.zoomT < 0 ? 0 : Math.min(1, this.zoomT / FACE_OFF_CAM.zoomDur); }

  constructor() {
    super();
    // Bühne ohne Drehteller: dunkler Sturmhimmel, Laterne und Schein werden zu den Auren der beiden Rekruten
    this.floor.visible = false;
    this.ring.visible = false;
    this.bgU.top.value.setHex(0x05070d);
    this.bgU.bottom.value.setHex(0x1c2233);
    this.floorMat.color.setHex(0x161a24);
    this.key.color.setHex(0xc8d4ff); this.key.intensity = 0.55;
    this.back.color.setHex(0xb8c8ff); this.back.intensity = 2.0;
    this.fill.color.setHex(0x8090c0); this.fill.intensity = 0.25;
    this.hemi.color.setHex(0x3a4466); this.hemi.groundColor.setHex(0x0a0a10); this.hemi.intensity = 0.55;
    // links blau-smaragd (Marine), rechts karmesin-gold (Piraten)
    this.aura.color.copy(C_MARINE); this.aura.intensity = 4.5; this.aura.distance = 7; this.aura.position.set(RECRUITS.marine.x - 0.4, 1.4, RECRUITS.marine.z + 1.2);
    this.lantern.color.copy(C_PIRATE); this.lantern.intensity = 4.5; this.lantern.distance = 7; this.lantern.position.set(RECRUITS.pirat.x + 0.4, 1.4, RECRUITS.pirat.z + 1.2);
    this.autoSpin = false;
  }

  /** Aufbau beginnen: Figuren entstehen über die nächsten Bilder (Rekruten zuerst) */
  build(assets: CharacterAssets) {
    this.assets = assets;
    this.queue = faceOffBuildOrder();
    // die beiden Rekruten sofort (sie tragen das erste Bild)
    this.spawnNext(); this.spawnNext();
  }

  private lookOf(d: FaceOffFigure): CharacterLook {
    const marine = d.id === RECRUITS.marine.id || d.id.startsWith('adm_');
    const g = d.look.gender === 'female' ? 'female' : 'male';
    return { ...defaultLook(marine ? 'marine' : 'pirat', g), ...d.look } as CharacterLook;
  }

  private spawnNext(): boolean {
    const d = this.queue.shift();
    if (!d || !this.assets) return false;
    const c = new Character(this.assets, this.lookOf(d), true);
    c.holder.position.set(d.x, 0, d.z);
    c.holder.rotation.y = d.yaw;
    c.holder.scale.setScalar(d.scale);
    const w = weaponsFor('saebel');
    if (!d.back) { c.hold('r', w.right); c.hold('l', w.left); c.setReady(1); c.setMood('entschlossen'); }
    else c.setMood(d.id.startsWith('adm_') ? 'grimmig' : 'entschlossen');
    c.playClip(d.clip, { loop: true, fade: 0 });
    // Silhouetten: dunkle Kleidung (Aussehen), dazu ein Randlicht in der Farbe der Figur – die Färbung der Effekt-Kopie wirkt im Shader
    // additiv am Rand (Fresnel, `uHitCol`), gleiches Programm wie jede Figur
    if (d.back) {
      const marine = d.id.startsWith('adm_');
      c.setTint(d.color, marine ? 0.55 : 0.4);
      c.setHeroRim(marine ? 2.2 : 2.8);
      c.setGlowColor(d.color);
    } else {
      c.setHeroRim(1.6);
      c.setGlowColor(d.color);
    }
    this.scene.add(c.holder);
    this.figures.push({ def: d, char: c, color: new Color(d.color), phase: this.figures.length * 0.37, acc: 0 });
    return true;
  }

  /** Zoom in eine Seite (Klick auf die Piraten): Kamera rast mit Speedlines auf das Gesicht des Rekruten */
  zoomTo(side: FaceOffSide) {
    if (this.zoomT >= 0) return;
    this.zoomT = 0;
    this.zoomSide = side;
    const r = this.figures.find((f) => f.def.id === RECRUITS[side].id);
    if (r && this.vfx) {
      r.char.holder.getWorldPosition(_v);
      this.vfx.pressureRing(_v.x, _v.y + 0.05, _v.z, 0, false, 2.2, side === 'pirat' ? C_PIRATE : C_MARINE, 0.5);
      this.vfx.spiral(_v.x, _v.y, _v.z, 0.8, 2.6, side === 'pirat' ? C_PIRATE2 : C_MARINE2, 0.7, 3, 8);
    }
  }

  override update(dt: number) {
    this.t += dt;
    this.frameN++;
    // eine neue Figur je Bild, bis alle stehen
    if (this.queue.length) this.spawnNext();
    else this.settled++;
    if (this.zoomT >= 0) this.zoomT += dt;
    // Wind: Böen von vorn (Mäntel und Haare wehen), stärker beim Zoom
    const g = 2.4 + 1.6 * Math.sin(this.t * 1.3) + (this.zoomT >= 0 ? 5 : 0);
    Character.setWind(Math.sin(this.t * 0.4) * 0.8, g);
    Character.setViewer(null);
    const every = FACE_OFF_CAM.backEvery;
    for (const f of this.figures) {
      if (f.def.back) {
        f.acc += dt;
        if ((this.frameN + Math.round(f.phase * 10)) % every !== 0) continue;
        f.char.update(f.acc);
        f.acc = 0;
      } else f.char.update(dt);
    }
    // Rekruten-Auren pulsieren (die Seite unter dem Zeiger leuchtet heller)
    const pm = 0.75 + 0.25 * Math.sin(this.t * 3.1);
    this.aura.intensity = 4.2 * pm * (this.hover === 'marine' ? 1.5 : 1);
    this.lantern.intensity = 4.2 * (0.75 + 0.25 * Math.sin(this.t * 3.1 + 1.6)) * (this.hover === 'pirat' ? 1.5 : 1);
    toonShared.rimColor.value.setHex(0xdfe8ff);
    toonShared.rimStrength.value = 0.9;
    this.effects(dt);
  }

  /** Nebel, Lichthöfe hinter den Silhouetten, Auren der Rekruten und Blitze in der Mitte (geliehene Pools) */
  private effects(dt: number) {
    const v = this.vfx;
    if (!v) return;
    v.fx.update(dt);
    this.mistT -= dt;
    if (this.mistT <= 0) {
      this.mistT = 0.11;
      // Bodennebel über die ganze Breite und hinter den Reihen
      // Nebel HINTER den Reihen und flach am Boden (vor den Gestalten machte er sie milchig-hell)
      const x = (Math.random() - 0.5) * 13, z = -5.4 - Math.random() * 3.5;
      v.burst('mist', x, 0.4 + Math.random() * 1.6, z, 1, 0.2, C_MIST, { up: 0.12, size: 3.2, life: 2.8 });
      if (Math.random() < 0.5) v.burst('mist', (Math.random() - 0.5) * 12, 0.05, -1 - Math.random() * 2, 1, 0.15, C_MIST, { up: 0.02, size: 1.4, life: 2.2 });
      // Lichthof hinter einer Gestalt (in ihrer Farbe), dazu ein Funke am Rand
      if (this.figures.length > 2) {
        const f = this.figures[2 + Math.floor(Math.random() * (this.figures.length - 2))];
        f.char.holder.getWorldPosition(_v);
        v.burst('mist', _v.x, _v.y + 1.3 * f.def.scale, _v.z - 1.2, 1, 0.1, f.color, { up: 0.3, size: 1.7, life: 1.2 });
        v.burst('spark', _v.x + (Math.random() - 0.5) * 0.8, _v.y + Math.random() * 2, _v.z - 0.3, 1, 0.5, f.color, { up: 1.2, size: 0.06, life: 0.9 });
      }
      // Auren der Rekruten: aufsteigende Funken und Glut in den Seitenfarben
      for (const side of ['marine', 'pirat'] as const) {
        const r = RECRUITS[side];
        const a = Math.random() * Math.PI * 2, rr = 0.45 + Math.random() * 0.3;
        const core = side === 'pirat' ? C_PIRATE : C_MARINE, acc = side === 'pirat' ? C_PIRATE2 : C_MARINE2;
        v.burst('spark', r.x + Math.sin(a) * rr, 0.1 + Math.random() * 1.5, r.z + Math.cos(a) * rr, 1, 0.6, Math.random() < 0.5 ? core : acc, { up: 2.4, size: 0.07, life: 0.7 });
        if (Math.random() < 0.3) v.burst('ember', r.x + Math.sin(a) * rr * 0.6, 0.05, r.z + Math.cos(a) * rr * 0.6, 1, 0.4, acc, { up: 1.6, size: 0.09, life: 1.2 });
      }
    }
    // Blitze entlang des Risses zwischen den Lagern
    this.boltT -= dt;
    if (this.boltT <= 0) {
      this.boltT = 0.5 + Math.random() * 0.9;
      const x = (Math.random() - 0.5) * 0.6;
      v.bolt(x, 5.5, -1.5, x * 0.4 + (Math.random() - 0.5) * 0.5, 0.2, 0.6, Math.random() < 0.5 ? C_MARINE : C_PIRATE, 0.16, 0.12, { branches: 2, jitter: 0.16 });
      v.burst('spark', x * 0.4, 0.25, 0.6, 6, 2.2, C_WHITE, { up: 1.5, size: 0.06, life: 0.4 });
    }
    // Aura-Wellen am Boden unter den Rekruten
    if (Math.floor(this.t * 1.25) !== Math.floor((this.t - dt) * 1.25)) {
      v.pressureRing(RECRUITS.marine.x, 0.04, RECRUITS.marine.z, 0, false, 1.5, C_MARINE2, 0.7);
      v.pressureRing(RECRUITS.pirat.x, 0.04, RECRUITS.pirat.z, 0, false, 1.5, C_PIRATE2, 0.7);
    }
  }

  /** Kamera: beide Lager im Bild (Hochformat: Breite passt sich an), beim Zoom fliegt sie auf das Gesicht des gewählten Rekruten */
  override frame(aspect: number, portrait: boolean) {
    const C = FACE_OFF_CAM, cam = this.camera;
    cam.aspect = aspect;
    cam.clearViewOffset();
    // Grundeinstellung: quer ein festes Sichtfeld; hoch so weit, dass beide Rekruten samt Rand hineinpassen
    let fov: number = C.fovWide;
    let dist: number = C.dist;
    if (portrait || aspect < 1.2) {
      const hHalf = C.portraitHalf;
      const tanV = hHalf / (C.dist - 1.7) / Math.max(0.3, aspect);
      fov = Math.min(C.fovTall, (Math.atan(tanV) * 360) / Math.PI);
      dist = C.dist + Math.max(0, ((Math.atan(tanV) * 360) / Math.PI - C.fovTall) * 0.12);
    }
    let px = 0, py = C.camY, pz = dist, lx = 0, ly = C.lookY, lz = 0;
    if (this.zoomT >= 0) {
      const k = ease(this.zoomT / C.zoomDur);
      const r = RECRUITS[this.zoomSide];
      const head = 1.55 * r.scale;
      const tx = r.x + Math.sin(r.yaw) * C.zoomDist, tz = r.z + Math.cos(r.yaw) * C.zoomDist;
      px += (tx - px) * k; py += (head + 0.05 - py) * k; pz += (tz - pz) * k;
      lx += (r.x - lx) * k; ly += (head - ly) * k; lz += (r.z - lz) * k;
      fov += (C.zoomFov - fov) * k * k;
    }
    // leichtes Atmen der Kamera (Handkamera)
    px += Math.sin(this.t * 0.5) * 0.06; py += Math.sin(this.t * 0.7) * 0.03;
    cam.fov = fov;
    cam.position.set(px, py, pz);
    cam.lookAt(lx, ly, lz);
    // Hochformat: oben ist viel Himmel – das Bild rückt nach unten, die Lager stehen im unteren Drittel über dem Knopf
    if ((portrait || aspect < 1.2) && this.zoomT < 0) cam.setViewOffset(1000, 1000, 0, -120, 1000, 1000);
    cam.updateProjectionMatrix();
  }

  /** Alles abbauen (Figuren samt Effekt-Kopien); die Studio-Lichter bleiben im eigenen Objekt */
  dispose() {
    for (const f of this.figures) { f.char.holder.removeFromParent(); f.char.dispose(); }
    this.figures.length = 0;
    this.queue.length = 0;
    this.vfx?.fx.clear();
  }
}
