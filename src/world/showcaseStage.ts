// Phase 4.7D.1 – Stufe C: Live-3D-Vorschau des Klassen-Showcases. Die eigene Figur (Aussehen aus Stufe B) zeigt die gewählte Klasse:
// Kampf-Kombo, drei Formen (I, V, X) und das Level-60-Ultimate in seiner echten 3-Akt-Choreografie – Kamera-Einstellungen aus
// `ULTIMATE_CINEMATICS` (über `UltimateCinematics.keyPose`, in Studio-Maße verkleinert), Effekte aus der `AnimeVfxForge` (geliehene Pools),
// Impact-Frames als CSS-Filter auf dem Canvas (`impactMode`, liest Game). Keine neuen Shader-Programme: Studio-Lichter wie im Editor,
// Boden und Puppen im Toon-Material, Effekte aus den vorhandenen Grundformen. Nichts Neues je Bild (modulweite Hilfswerte).
import { BoxGeometry, Color, CylinderGeometry, Group, Mesh, SphereGeometry, Vector3 } from 'three';
import type { VfxSurface } from '../graphics/animeVfxForge';
import { ACTION_STYLES, visualStyleOf } from '../data/actionStyles';
import { SHOWCASE_SLOW, previewScript, showcaseOf, type PreviewStep } from '../data/classShowcase';
import type { SpecId } from '../data/classes';
import type { CharacterAssets } from '../entities/character/assets';
import type { CharacterLook } from '../data/characterParts';
import { ULTIMATE_CINEMATICS, UltimateCinematics, makeAnchors, makeCam, type UltimateCinematic } from '../graphics/ultimateCinematics';
import type { ImpactMode } from '../graphics/animeImpactRig';
import { Character } from '../entities/character/character';
import { addOutlines } from '../render/outline';
import { toon, toonShared } from '../render/toon';
import { EditorStage } from './editorStage';

const _v = new Vector3();
const _w = new Vector3();
const C_WHITE = new Color(1, 1, 1);
const C_DUST = new Color(0.6, 0.55, 0.48);
/** Reichweite des Einschlags im Studio (m) und größter Kamera-Abstand von der Figur */
const STUDIO_REACH = 6.5;
const CAM_MAX = 11;
/** Blickrichtung der Figur: nach +x (quer durchs Fenster, die Puppen stehen rechts) */
const YAW = Math.PI / 2;
/** Grundeinstellung: Mitte zwischen Figur (x 0) und Puppen und die halbe Breite, die ins Fenster passen muss (m) */
const BASE_X = 2.4, BASE_HALF = 3.4;
const smoother = (x: number) => { const k = x < 0 ? 0 : x > 1 ? 1 : x; return k * k * k * (k * (k * 6 - 15) + 10); };

export type ShowcasePhase = 'idle' | 'combo' | 'form' | 'ult' | 'rest';

export class ShowcaseStage extends EditorStage {
  private spec: SpecId = 'saebel';
  private script: PreviewStep[] = [];
  private st = 0;
  private stepI = -1;
  private loop = 0;
  /** laufender Teil der Vorschau, Ultimate-Akt (0 … 2) und Anteil, gezeigte Form */
  phase: ShowcasePhase = 'idle';
  act = -1;
  formShown = 0;
  /** Impact-Frames: Game legt den Filter auf das Canvas (gezählt in GEZEICHNETEN Bildern) */
  impactMode: ImpactMode = 'none';
  impactColor = '#fff';
  private impactLeft = 0;
  private impactTotal = 0;
  /** Zähler für Prüfungen */
  readonly stats = { ults: 0, impacts: 0, forms: 0, combos: 0, frames: 0 };
  private readonly core = new Color();
  private readonly acc = new Color();
  private readonly ink = new Color();
  private readonly cine = new UltimateCinematics();
  private def: UltimateCinematic | null = null;
  private readonly anchors = makeAnchors();
  private readonly ccam = makeCam();
  private ultT = 0;
  private fxAcc = 0;
  private kick = 0;
  private camK = 0;
  private comboI = 0;
  private dummies: { g: Group; x: number; z: number; wobble: number }[] = [];
  /** Fenster der Vorschau auf dem Bildschirm (CSS-Pixel); null = ganzer Bildschirm */
  private win: { x: number; y: number; w: number; h: number } | null = null;
  /** Rückruf beim Wechsel des Vorschau-Teils (Anzeige im Fenster) */
  onPart: ((phase: ShowcasePhase, label: string, act: number) => void) | null = null;
  /**
   * 4.9: Vorschau „An Land“ (Arena mit Steinboden, Krater und Gesteinsbrocken) oder „Auf See“ (Planken eines Schiffsdecks über dem Meer,
   * Übungspuppen auf Flößen, Gischtkronen statt Kratern) – Toon-Materialien mit Schmiede-Sätzen (vorhandene Programme)
   */
  sea = false;
  private readonly ground: Mesh;
  private readonly seaGroup = new Group();
  private readonly rafts: Mesh[] = [];
  /** eigene Oberfläche der Effekte (Krater an Land, Gischt auf See) und die der Welt zum Zurückgeben */
  private readonly stageSurface: VfxSurface = { isLand: () => !this.sea, groundY: () => (this.sea ? 0.18 : 0), waterY: () => 0 };
  private worldSurface: VfxSurface | null = null;
  private surfaceSet = false;

  constructor() {
    super();
    this.pose = 'kampf';
    this.autoSpin = false;
    this.yaw = YAW;
    // weite Arena statt Drehteller: großer Boden im Toon-Material (gleiches Programm wie der Drehteller), drei Übungspuppen
    this.floor.visible = false;
    this.ring.visible = false;
    const ground = new Mesh(new CylinderGeometry(16, 16.4, 0.2, 64), this.floorMat);
    ground.position.set(3, -0.1, 0);
    ground.receiveShadow = true;
    addOutlines(ground);
    this.scene.add(ground);
    this.ground = ground;
    // 4.9: See-Bühne – weites Meer (Schmiede-Satz „wasser“), Deck aus Planken mit Reling, Flöße unter den Übungspuppen
    const sea = new Mesh(new CylinderGeometry(42, 42, 0.1, 72), toon({ color: 0x1b5f80, forge: 'wasser' }));
    sea.position.set(3, -0.35, 0);
    sea.receiveShadow = true;
    const deck = new Mesh(new BoxGeometry(4.6, 0.5, 7.5), toon({ color: 0x8a5a2b, forge: 'hafenholz' }));
    deck.position.set(0, -0.25, 0);
    deck.receiveShadow = true;
    const railMat = toon({ color: 0x5c3a1f, forge: 'hafenholz' });
    for (const s of [-1, 1]) {
      const rail = new Mesh(new BoxGeometry(0.14, 0.75, 7.3), railMat);
      rail.position.set(s * 2.25, 0.38, 0);
      deck.add(rail);
    }
    addOutlines(deck);
    this.seaGroup.add(sea, deck);
    const raftMat = toon({ color: 0x7a4f2a, forge: 'hafenholz' });
    for (const [x, z] of [[3.4, 0], [5.0, -1.4], [5.0, 1.4]]) {
      const raft = new Mesh(new CylinderGeometry(0.8, 0.9, 0.26, 12), raftMat);
      raft.position.set(x, 0.05, z);
      addOutlines(raft);
      this.seaGroup.add(raft);
      this.rafts.push(raft);
    }
    this.seaGroup.visible = false;
    this.scene.add(this.seaGroup);
    for (const [x, z] of [[3.4, 0], [5.0, -1.4], [5.0, 1.4]]) {
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
    this.setLight('laterne');
    this.bgU.top.value.setHex(0x070a14);
    this.bgU.bottom.value.setHex(0x232a3c);
    this.floorMat.color.setHex(0x1c2130);
  }

  /** Figur anzeigen (Aussehen aus dem Editor) und Klasse wählen */
  showSpec(assets: CharacterAssets, look: CharacterLook, spec: SpecId) {
    this.spec = spec;
    const st = ACTION_STYLES[showcaseOf(spec).style];
    super.show(assets, look, visualStyleOf(st.id));
    this.restart(spec);
    // 4.9: Effekte der Vorschau reagieren auf die Bühne (Krater an Land, Gischt auf See), nicht auf die Welt dahinter
    this.applySurface();
  }

  /** Klasse wechseln: Waffe, Farben, Vorschau von vorn */
  setSpec(spec: SpecId) {
    this.spec = spec;
    const st = ACTION_STYLES[showcaseOf(spec).style];
    this.setStyle(visualStyleOf(st.id));
    this.restart(spec);
  }

  private restart(spec: SpecId) {
    const e = showcaseOf(spec);
    this.core.set(e.ultimate.color);
    this.acc.set(e.ultimate.accent);
    if (this.vfx) this.vfx.inkOf(this.core, this.ink);
    this.char?.setGlowColor(e.accent);
    this.script = previewScript(spec);
    this.st = 0; this.stepI = -1; this.phase = 'idle'; this.act = -1;
    this.endImpact();
    this.char?.setDissolve(0);
  }

  /** Sofort eine bestimmte Form oder das Ultimate zeigen (Klick in der Liste) */
  playPart(kind: 'form' | 'ult', slot = 0) {
    const i = this.script.findIndex((s) => s.part.kind === kind && (kind === 'ult' || (s.part.kind === 'form' && s.part.slot === slot)));
    if (i >= 0) { this.st = this.script[i].at; this.stepI = i - 1; return; }
    if (kind === 'form') {
      // Formen, die nicht im Ablauf stehen: einmal zeigen, danach läuft der Ablauf weiter
      this.startForm(slot);
    }
  }

  setWindow(r: { x: number; y: number; w: number; h: number } | null) { this.win = r; }

  /** Ablauf: Teile nach Zeit starten (Echtzeit) */
  private stepScript(dt: number) {
    if (!this.script.length || !this.char) return;
    this.st += dt;
    const total = this.script[this.script.length - 1].at + this.script[this.script.length - 1].dur;
    if (this.st >= total) { this.st -= total; this.stepI = -1; this.loop++; }
    while (this.stepI + 1 < this.script.length && this.script[this.stepI + 1].at <= this.st) {
      this.stepI++;
      const p = this.script[this.stepI].part;
      if (p.kind === 'combo') this.startCombo();
      else if (p.kind === 'form') this.startForm(p.slot);
      else if (p.kind === 'ult') this.startUlt();
      else this.startRest();
    }
  }

  private startCombo() {
    const c = this.char!, e = showcaseOf(this.spec);
    this.phase = 'combo'; this.act = -1; this.comboI = 0;
    this.stats.combos++;
    c.sheathe(false);
    const next = () => {
      if (this.phase !== 'combo') return;
      const m = e.combo[this.comboI++];
      if (!m) { c.playClip(ACTION_STYLES[e.style].idleClip, { loop: true, fade: 0.25 }); return; }
      c.playClip(m.clip, { loop: false, fade: 0.08, restart: true, speed: 1.05, onDone: next });
      this.slashFx(this.comboI, false);
    };
    next();
    this.onPart?.('combo', 'Kampf-Kombo', -1);
  }

  private startForm(slot: number) {
    const c = this.char!, e = showcaseOf(this.spec);
    const f = e.forms.find((x) => x.nr === slot) ?? e.forms[0];
    this.phase = 'form'; this.act = -1; this.formShown = f.nr;
    this.stats.forms++;
    c.sheathe(false);
    c.playClip(f.clip, { loop: false, fade: 0.08, restart: true, onDone: () => { if (this.phase === 'form') c.playClip(ACTION_STYLES[e.style].idleClip, { loop: true, fade: 0.25 }); } });
    this.formFx(f.nr);
    this.onPart?.('form', `Form ${f.roman}: ${f.label}`, -1);
  }

  private startUlt() {
    const c = this.char!, e = showcaseOf(this.spec);
    this.phase = 'ult'; this.act = 0; this.ultT = 0; this.fxAcc = 0;
    this.def = ULTIMATE_CINEMATICS[e.ultimate.kind];
    this.cine.def = this.def;
    this.stats.ults++;
    c.sheathe(false);
    const a = c.playClip(e.ultimate.clip, { loop: false, fade: 0.1, restart: true });
    if (a) {
      const D = this.def.dur;
      const len = a.getClip().duration;
      a.setEffectiveTimeScale(Math.max(0.25, Math.min(1.2, len / ((D[0] + D[1] + D[2]) * SHOWCASE_SLOW))));
    }
    c.setMood('entschlossen');
    this.onPart?.('ult', `Level-60-Ultimate: ${e.ultimate.label}`, 0);
  }

  private startRest() {
    const c = this.char!, e = showcaseOf(this.spec);
    this.phase = 'rest'; this.act = -1;
    c.playClip(ACTION_STYLES[e.style].idleClip, { loop: true, fade: 0.4 });
    this.onPart?.('rest', '', -1);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Effekte (geliehene Pools der Welt)
  // ---------------------------------------------------------------------------------------------------------------

  private feet(out: Vector3) { return this.char ? this.char.holder.getWorldPosition(out) : out.set(0, 0, 0); }

  private slashFx(i: number, big: boolean) {
    const v = this.vfx;
    if (!v) return;
    const p = this.feet(_v);
    const e = showcaseOf(this.spec);
    const fist = e.base === 'faust';
    if (e.base === 'faji') {
      // Faji-Wirker kämpfen auf Abstand: Geschoss zur Puppe
      const d = this.dummies[i % this.dummies.length];
      v.bolt(p.x + 0.4, 1.3, p.z, d.x, 1.2, d.z, this.core, 0.12, 0.18, { branches: 1, impact: 0.6 });
      v.burst('spark', d.x, 1.2, d.z, 8, 3, this.acc, { size: 0.08, life: 0.35 });
      d.wobble = 1.2;
      return;
    }
    v.slash(p.x + 0.9, 1.15 + (i % 2) * 0.25, p.z, YAW, -0.2 + (i % 3) * 0.3, (i % 2 ? 1 : -1) * 0.6, big ? 2.4 : 1.5, this.core, this.ink, { life: 0.22, fist });
    this.dummies[0].wobble = 1;
  }

  private formFx(nr: number) {
    const v = this.vfx;
    if (!v) return;
    const p = this.feet(_v);
    const fx = p.x + 2.6;
    switch (nr) {
      case 10:
        v.surfaceHit(fx + 0.6, 0.02, p.z, 2.6, this.core, 1, 0.45);
        v.pressureRing(fx + 0.6, 0.05, p.z, 0, false, 3.4, this.acc, 0.6);
        v.burst('rock', fx + 0.6, 0.2, p.z, 14, 5, C_DUST, { up: 5, size: 0.14, delay: 0.45 });
        v.spiral(p.x, p.y, p.z, 0.8, 2.4, this.core, 0.6, 3, 8);
        break;
      case 5:
        v.slash(p.x + 1.6, 1.1, p.z, YAW, 0, 0, 2.6, this.core, this.ink, { life: 0.35, vx: 9 });
        v.burst('spark', fx, 1.1, p.z, 16, 5, this.acc, { size: 0.08, life: 0.4 });
        break;
      default:
        v.slash(p.x + 1, 1.2, p.z, YAW, -0.6, 0.4, 2, this.core, this.ink, { life: 0.3 });
        v.pressureRing(p.x + 1.2, 1.1, p.z, YAW, true, 1.6, this.acc, 0.35);
    }
    for (const d of this.dummies) d.wobble = 1.4;
  }

  /** Bezugspunkte der Choreografie im Studio (Einschlag `STUDIO_REACH` m voraus) */
  private fillAnchors() {
    const a = this.anchors, c = this.char!;
    const p = c.holder.getWorldPosition(_v);
    const fx = Math.sin(YAW), fz = Math.cos(YAW);
    a.yaw = YAW;
    a.origin.x = p.x; a.origin.y = p.y; a.origin.z = p.z;
    a.feet.x = p.x; a.feet.y = p.y; a.feet.z = p.z;
    const head = c.bones.head;
    if (head) { head.getWorldPosition(_w); a.head.x = _w.x; a.head.y = _w.y + 0.05; a.head.z = _w.z; } else { a.head.x = p.x; a.head.y = 1.6; a.head.z = p.z; }
    a.chest.x = p.x; a.chest.y = p.y + 1.25; a.chest.z = p.z;
    const hand = c.bones.handr;
    if (hand) { hand.getWorldPosition(_w); a.hand.x = _w.x; a.hand.y = _w.y; a.hand.z = _w.z; } else { a.hand.x = p.x + fx * 0.4; a.hand.y = 1.2; a.hand.z = p.z + fz * 0.4; }
    a.hip.x = p.x; a.hip.y = p.y + 0.95; a.hip.z = p.z;
    a.impact.x = p.x + fx * STUDIO_REACH; a.impact.y = 0; a.impact.z = p.z + fz * STUDIO_REACH;
    a.threat.x = p.x + fx * STUDIO_REACH * 0.6; a.threat.y = 3.2; a.threat.z = p.z + fz * STUDIO_REACH * 0.6;
    a.path.x = p.x + fx * STUDIO_REACH * 0.5; a.path.y = 0.8; a.path.z = p.z + fz * STUDIO_REACH * 0.5;
    a.sky.x = p.x + fx * 2; a.sky.y = 9; a.sky.z = p.z + fz * 2;
  }

  private stepUlt(dt: number) {
    const d = this.def;
    if (this.phase !== 'ult' || !d || !this.char) return;
    this.ultT += dt;
    const D0 = d.dur[0] * SHOWCASE_SLOW, D1 = d.dur[1] * SHOWCASE_SLOW, D2 = d.dur[2] * SHOWCASE_SLOW;
    const prevAct = this.act;
    this.act = this.ultT < D0 ? 0 : this.ultT < D0 + D1 ? 1 : this.ultT < D0 + D1 + D2 ? 2 : 3;
    if (this.act !== prevAct && this.act <= 2) this.onPart?.('ult', `Level-60-Ultimate: ${showcaseOf(this.spec).ultimate.label}`, this.act);
    if (this.act === 2 && prevAct === 1) this.impactHit();
    const v = this.vfx;
    if (!v) return;
    const a = this.anchors;
    this.fxAcc += dt;
    if (this.fxAcc < 0.06) return;
    this.fxAcc = 0;
    const p = a.origin;
    if (this.act === 0) {
      // Akt 1 – Aufladung: Aura-Wirbel, aufsteigende Spirale, Funken
      v.auraSwirl(p.x, p.y, p.z, this.core, this.acc, 1, 0.14);
      if (Math.random() < 0.35) v.spiral(p.x, p.y, p.z, 0.7, 2.6, this.core, 0.5, 2, 9);
      v.burst('spark', p.x + (Math.random() - 0.5) * 1.2, 0.2 + Math.random() * 1.8, p.z + (Math.random() - 0.5) * 1.2, 2, 1.5, this.acc, { up: 2.6, size: 0.07, life: 0.5 });
    } else if (this.act === 1) {
      this.threatFx(d, (this.ultT - D0) / D1);
    } else if (this.act === 2) {
      // Akt 3 – Zerstörungs-Follow: Staub, Glut und Funken am Einschlag
      const i = a.impact;
      v.burst(Math.random() < 0.5 ? 'smoke' : 'dust', i.x + (Math.random() - 0.5) * 3, 0.4, i.z + (Math.random() - 0.5) * 3, 2, 1.2, C_DUST, { up: 1.8, size: 1.1, life: 1.2 });
      v.burst('ember', i.x, 0.3, i.z, 3, 4, this.acc, { up: 4, size: 0.1, life: 0.8 });
    }
  }

  /** Akt 2: die entstehende Gefahr (Art aus der Choreografie) */
  private threatFx(d: UltimateCinematic, u: number) {
    const v = this.vfx!, a = this.anchors, c = this.core, ac = this.acc, ink = this.ink;
    const o = a.origin, i = a.impact, t = a.threat;
    const fx = Math.sin(YAW), fz = Math.cos(YAW);
    const k = Math.max(0, Math.min(1, u));
    switch (d.threat) {
      case 'meteors': {
        const h = 10 - k * 9;
        const mx = i.x - fx * 2 * (1 - k), mz = i.z - fz * 2 * (1 - k);
        v.burst('ember', mx, h, mz, 4, 2, c, { size: 0.5, life: 0.25 });
        v.machCone(mx, h, mz, 0.35, -0.94, 0, 2.4, 0.8, ac, 0.08);
        break;
      }
      case 'bladeWave': case 'saw': case 'dash': case 'sickleRain':
        v.slash(o.x + fx * (1 + k * 4.5), 1 + (d.threat === 'sickleRain' ? 2.5 * (1 - k) : 0), o.z + fz * (1 + k * 4.5), YAW, d.threat === 'sickleRain' ? -1.1 : 0, 0, 2.2 + k * 1.4, c, ink, { life: 0.18 });
        break;
      case 'fistFlood': case 'armada':
        v.slash(o.x + fx * (1 + k * 4), 1.1 + (Math.random() - 0.5) * 0.8, o.z + fz * (1 + k * 4) + (Math.random() - 0.5) * 1.2, YAW, 0, Math.random() - 0.5, 1.2, c, ink, { life: 0.16, fist: d.threat === 'fistFlood' });
        if (d.threat === 'armada' && Math.random() < 0.25) v.silhouette(i.x + (Math.random() - 0.5) * 3, 0, i.z + (Math.random() - 0.5) * 3, YAW + Math.PI, c, 0.3);
        break;
      case 'trench': case 'tsunami':
        v.pressureRing(o.x + fx * (1 + k * 5), 0.5, o.z + fz * (1 + k * 5), YAW, true, 1.2 + k * 1.4, c, 0.3);
        v.burst('drop', o.x + fx * (1 + k * 5), 0.3, o.z + fz * (1 + k * 5), 6, 4, ac, { up: 4, size: 0.12, life: 0.6 });
        break;
      case 'vortex': case 'tornado':
        v.funnel(t.x, 0, t.z, 3 + k * 3, 0.8 + k * 0.9, c, ink, 0.2);
        break;
      case 'dragons':
        v.spiral(o.x + fx * (1 + k * 4), 0.3, o.z + fz * (1 + k * 4), 0.6 + k * 0.6, 2 + k, c, 0.35, 2, 9);
        v.burst('ember', o.x + fx * (1 + k * 4), 1.3, o.z + fz * (1 + k * 4), 6, 3, ac, { size: 0.12, life: 0.5 });
        break;
      case 'glacier':
        v.burst('ice', o.x + fx * (1 + k * 5), 0.2, o.z + fz * (1 + k * 5), 8, 3, c, { up: 3, size: 0.25, life: 0.7 });
        break;
      case 'bolt':
        if (Math.random() < 0.5) v.bolt(i.x + (Math.random() - 0.5) * 2, 9, i.z + (Math.random() - 0.5) * 2, i.x, 0.1, i.z, c, 0.14, 0.12, { branches: 2 });
        break;
      case 'sunRing':
        v.corona(t.x, t.y + 1, t.z, YAW, 1 + k * 1.6, c, ac, 0.16);
        break;
      default:
        v.spiral(t.x, 0, t.z, 1 + k, 3, c, 0.3, 2, 8);
    }
    if (Math.random() < 0.3) v.skyVortex(a.sky.x, a.sky.y, a.sky.z, 3 + k * 2, c, ink, 0.25);
  }

  /** Treffermoment (Beginn von Akt 3): Impact-Frames, Kamera-Stoß, Einschlag */
  private impactHit() {
    const d = this.def!, v = this.vfx, i = this.anchors.impact;
    this.stats.impacts++;
    this.impactTotal = Math.max(2, d.frames);
    this.impactLeft = this.impactTotal;
    this.impactColor = `#${this.acc.getHexString()}`;
    this.kick = Math.min(1.4, d.kick);
    for (const dm of this.dummies) dm.wobble = 2.2;
    if (!v) return;
    v.surfaceHit(i.x, 0.02, i.z, 3.4, this.core, 1.4);
    v.pressureRing(i.x, 0.1, i.z, 0, false, 5.5, this.acc, 0.7);
    v.pressureRing(i.x, 1.4, i.z, YAW, true, 3, C_WHITE, 0.35);
    v.burst('rock', i.x, 0.3, i.z, 22, 7, C_DUST, { up: 7, size: 0.18 });
    v.burst('spark', i.x, 1, i.z, 24, 9, this.core, { size: 0.1, life: 0.5 });
    v.bolt(i.x, 10, i.z, i.x, 0, i.z, C_WHITE, 0.35, 0.2, { branches: 3 });
  }

  private endImpact() { this.impactLeft = 0; this.impactMode = 'none'; this.kick = 0; }

  override update(dt: number) {
    this.stepScript(dt);
    this.stepUlt(dt);
    // Impact-Frames je gezeichnetem Bild: erst invertiert, dann Tusche
    if (this.impactLeft > 0) {
      this.impactMode = this.impactLeft === this.impactTotal ? 'invert' : 'ink';
      this.impactLeft--;
      this.stats.frames++;
    } else this.impactMode = 'none';
    this.kick = Math.max(0, this.kick - dt * 2.4);
    for (const d of this.dummies) {
      d.wobble *= Math.pow(0.03, dt);
      d.g.rotation.z = Math.sin(this.st * 25) * d.wobble * 0.18;
    }
    const c = this.char;
    if (c) {
      c.holder.rotation.y = YAW;
      Character.setViewer(null);
      Character.setWind(-1.2, 0.6 + (this.phase === 'ult' ? 4 : 0));
      c.update(dt);
    }
    if (this.vfx) this.vfx.fx.update(dt);
    // Kamera: im Ultimate die Choreografie, sonst die Grundeinstellung (weich übergeblendet)
    const want = this.phase === 'ult' && this.act <= 2 ? 1 : 0;
    this.camK += (want - this.camK) * (1 - Math.exp(-dt * (want ? 9 : 3.5)));
    toonShared.rimColor.value.setHex(0xc8d8ff);
    toonShared.rimStrength.value = 0.8;
  }

  override frame(aspect: number) {
    const cam = this.camera;
    cam.aspect = aspect;
    const W = innerWidth, H = innerHeight;
    const r = this.win ?? { x: 0, y: 0, w: W, h: H };
    // Grundeinstellung: Figur links, Puppen rechts – der Abstand richtet sich nach der Breite des Fensters (Hoch- wie Querformat)
    let fov = 40;
    const tanV = Math.tan((fov * Math.PI) / 360), aspW = Math.max(0.3, r.w / Math.max(1, r.h));
    const dist = Math.max(6.2, BASE_HALF / (tanV * aspW) + 1.2);
    let px = BASE_X, py = 1.55 + dist * 0.06, pz = dist, lx = BASE_X, ly = 0.95, lz = 0;
    if (this.camK > 0.001 && this.def && this.char && this.phase === 'ult') {
      this.fillAnchors();
      const D = this.def.dur;
      const t = this.ultT / SHOWCASE_SLOW;
      const act = Math.min(2, this.act);
      const t0 = act === 0 ? 0 : act === 1 ? D[0] : D[0] + D[1];
      const u = Math.max(0, Math.min(1, (t - t0) / D[act]));
      this.cine.keyPose(act, u, this.anchors, this.ccam);
      const C = this.ccam, o = this.anchors.origin;
      // Studio-Maße: die Kamera bleibt in der Arena (die Weiten der Seeschlacht wären hier außerhalb der Kulisse)
      let dx = C.px - o.x, dy = C.py - o.y, dz = C.pz - o.z;
      const len = Math.hypot(dx, dy, dz);
      if (len > CAM_MAX) { const s = CAM_MAX / len; dx *= s; dy *= s; dz *= s; }
      const k = smoother(this.camK);
      px += (o.x + dx - px) * k; py += (Math.max(0.25, o.y + dy) - py) * k; pz += (o.z + dz - pz) * k;
      lx += (C.lx - lx) * k; ly += (C.ly - ly) * k; lz += (C.lz - lz) * k;
      fov += (Math.min(70, C.fov) - fov) * k;
    }
    if (this.kick > 0) { const s = this.kick * 0.12; px += Math.sin(this.st * 61) * s; py += Math.sin(this.st * 53) * s * 0.6; }
    cam.position.set(px, py, pz);
    cam.lookAt(lx, ly, lz);
    // Bildmitte in die Mitte des Vorschau-Fensters, Sichtfeld auf seine Höhe
    const full = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (H / Math.max(80, r.h))) * 180) / Math.PI;
    cam.fov = Math.min(150, full);
    cam.setViewOffset(W, H, W / 2 - (r.x + r.w / 2), H / 2 - (r.y + r.h / 2), W, H);
    cam.updateProjectionMatrix();
  }

  /** 4.9: Vorschau an Land bzw. auf See umschalten (Boden, Licht, Himmel, Oberfläche der Effekte) */
  setSea(on: boolean) {
    this.sea = on;
    this.ground.visible = !on;
    this.seaGroup.visible = on;
    for (const d of this.dummies) d.g.position.y = on ? 0.18 : 0;
    this.setLight(on ? 'sonne' : 'laterne');
    if (on) { this.bgU.top.value.setHex(0x5f9ccc); this.bgU.bottom.value.setHex(0x16405a); }
    else { this.bgU.top.value.setHex(0x070a14); this.bgU.bottom.value.setHex(0x232a3c); this.floorMat.color.setHex(0x1c2130); }
    this.applySurface();
  }

  /** Eigene Oberfläche der geliehenen Effekte setzen (die der Welt kommt beim Schließen zurück) */
  applySurface() {
    const v = this.vfx;
    if (!v) return;
    if (!this.surfaceSet) { this.worldSurface = v.surface; this.surfaceSet = true; }
    v.surface = this.stageSurface;
  }

  dispose() {
    this.endImpact();
    if (this.vfx && this.surfaceSet) { this.vfx.surface = this.worldSurface; this.surfaceSet = false; }
    this.vfx?.fx.clear();
    this.char?.holder.removeFromParent();
    this.char?.dispose();
    this.char = null;
  }
}
