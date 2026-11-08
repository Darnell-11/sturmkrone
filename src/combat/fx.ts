import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Scene,
} from 'three';
import type { FxKind } from '../data/combat';
import type { ParticleSystem } from '../world/particles';
import { disposeGeometry } from '../render/dispose';
import { q, sharedGeo } from '../render/geoCache';
import { markShared } from '../render/dispose';
import { DecalSystem } from '../render/decals';
import { heatShared } from '../render/heat';

// Wiederverwendete Farben (Partikel und Materialien kopieren den Wert)
const TMP_COL = new Color();
const DUST_COL = new Color(0.9, 0.82, 0.65);
const PUFF_COL = new Color(0.92, 0.85, 0.7);

function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  // einmal gemalt, von allen Treffern geteilt – nie freigeben
  return markShared(new CanvasTexture(c));
}

/** Anime-Trefferstern: spitze Strahlen und heller Kern */
const SPARK_TEX = canvasTex(128, (ctx, s) => {
  ctx.translate(s / 2, s / 2);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 10; i++) {
    const long = i % 2 === 0 ? s * 0.48 : s * 0.3;
    ctx.save();
    ctx.rotate((i / 10) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(0, -long);
    ctx.lineTo(s * 0.045, 0);
    ctx.lineTo(-s * 0.045, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.22);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2); ctx.fill();
});

interface Live { obj: Mesh | Sprite; life: number; max: number; kind: string; data?: any }

const SMEAR_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SMEAR_FRAG = /* glsl */ `
  uniform float uProg; uniform vec3 uColor; uniform float uAlpha;
  varying vec2 vUv;
  void main(){
    // UV begrenzen: am Innenrand entstehen durch Rundung winzige negative Werte, und pow(negativ, 2.4)
    // ergibt NaN – das hat die Nachbearbeitung (Bloom) übers ganze Bild verschmiert (schwarzer Bildschirm)
    vec2 uv = clamp(vUv, 0.0, 1.0);
    float a = uv.x;           // 0 = Anfang, 1 = Ende des Bogens
    float head = uProg;
    float d = head - a;
    if (d < 0.0) discard;
    float trail = 1.0 - smoothstep(0.0, 0.5, d);
    // Sichel: außen (Klingenspitze) hell und scharf, nach innen weich auslaufend
    float body = pow(max(uv.y, 1e-4), 2.4) * (1.0 - smoothstep(0.93, 1.0, uv.y));
    float rim = smoothstep(0.82, 0.93, uv.y) * (1.0 - smoothstep(0.93, 1.0, uv.y));
    vec3 c = mix(uColor, vec3(1.0), rim);
    gl_FragColor = vec4(c * 1.25, clamp((body * 0.8 + rim * 0.6) * trail * uAlpha, 0.0, 1.0));
  }`;

/** Ring mit UV entlang des Bogens (x) und quer (y) */
function arcGeometry(inner: number, outer: number, arc: number, seg = 24) {
  const g = new RingGeometry(inner, outer, seg, 1, -arc / 2, arc);
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const ang = Math.atan2(y, x);
    const r = Math.hypot(x, y);
    uv.setXY(i, (ang + arc / 2) / arc, (r - inner) / (outer - inner));
  }
  return g;
}

/** Alle Kampfeffekte in der 3D-Szene. Menge richtet sich nach der Grafikstufe. */
export class CombatFx {
  private live: Live[] = [];
  private sparkMat = new SpriteMaterial({ map: SPARK_TEX, blending: AdditiveBlending, depthWrite: false, transparent: true });
  scale = 1;

  /** Boden-Decals (Risse, Brandflecken, Frost, Siegel) – die Welt setzt die Bodenhöhe */
  readonly decals: DecalSystem;

  constructor(private scene: Scene, private sparks: ParticleSystem, private dust: ParticleSystem) {
    this.decals = new DecalSystem(scene);
  }

  /** Brandfleck mit kurzer Glut (Feuer, Meteore, Blitzeinschläge) */
  burn(pos: Vector3, size: number, tint = '#ffffff') { this.decals.spawn('burn', pos.x, pos.y, pos.z, size, tint, 7, 3); }
  /** Reifschicht (Eis) */
  frost(pos: Vector3, size: number) { this.decals.spawn('frost', pos.x, pos.y, pos.z, size, '#cfefff', 6, 2.5); }
  /** Leuchtendes magisches Siegel am Boden */
  sigil(pos: Vector3, size: number, color: string, life = 1.6) { return this.decals.spawn('sigil', pos.x, pos.y, pos.z, size, TMP_COL.set(color).multiplyScalar(1.6), life, Math.min(0.8, life * 0.5)); }
  /** Hitzeflimmern um einen Punkt (Bildverzerrung, nur auf höheren Grafikstufen sichtbar) */
  heat(pos: Vector3, radius: number, strength: number, life: number) { return heatShared.add(pos.x, pos.y, pos.z, radius, strength, life); }
  /** Aufsteigende Leuchtpunkte (Auflade-Aura) */
  rise(pos: Vector3, color: string, n = 2, radius = 0.8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
      this.sparks.emit(1, pos.x + Math.cos(a) * r, pos.y + 0.1, pos.z + Math.sin(a) * r, { speed: 0.2, up: 2.6, life: 0.9, color: TMP_COL.set(color).multiplyScalar(2.2), gravity: -1.5, spread: 0.1 });
    }
  }

  /** Trefferfunke am Trefferpunkt */
  hit(pos: Vector3, kind: FxKind, color: string, big = false) {
    const c = TMP_COL.set(color);
    const mat = this.sparkMat.clone();
    mat.color.copy(c).multiplyScalar(kind === 'magic' ? 3 : 2.2);
    mat.rotation = Math.random() * Math.PI;
    const s = new Sprite(mat);
    s.position.copy(pos);
    const size = big ? 3.2 : kind === 'punch' ? 1.6 : 2.0;
    s.scale.setScalar(size * 0.4);
    s.renderOrder = 10;
    this.scene.add(s);
    this.live.push({ obj: s, life: 0.16, max: 0.16, kind: 'spark', data: size });
    // Zweiter, weißer Stern um 45° gedreht für mehr Punch
    const s2 = s.clone();
    s2.material = mat.clone();
    (s2.material as SpriteMaterial).color.setRGB(3, 3, 3);
    (s2.material as SpriteMaterial).rotation = mat.rotation + Math.PI / 4;
    this.scene.add(s2);
    this.live.push({ obj: s2, life: 0.1, max: 0.1, kind: 'spark', data: size * 0.6 });
    this.sparks.emit(big ? 22 : 12, pos.x, pos.y, pos.z, { speed: big ? 11 : 8, up: 4, life: 0.35, color: c.multiplyScalar(1.6), gravity: 12, spread: 0.2 });
  }

  /** Schmier-Bogen eines Schwerthiebs */
  smear(origin: Vector3, yaw: number, tilt: number, range: number, arc: number, color: string, flip = false) {
    const a = Math.min(arc, Math.PI * 1.9);
    // gleiche Reichweite und Bogenweite → dasselbe Netz (Schwerthiebe wiederholen sich ständig)
    const r = q(range), aq = q(a, 0.02);
    const geo = sharedGeo(`arc:${r}:${aq}`, () => arcGeometry(r * 0.45, r * 1.05, aq, 32));
    const mat = new ShaderMaterial({
      uniforms: { uProg: { value: 0 }, uColor: { value: new Color(color) }, uAlpha: { value: 1 } },
      vertexShader: SMEAR_VERT,
      fragmentShader: SMEAR_FRAG,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    const m = new Mesh(geo, mat);
    m.position.copy(origin);
    // Ebene: waagrecht (tilt 0) bis senkrecht (π/2), Bogen öffnet nach vorn
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2 + tilt, yaw, flip ? Math.PI : 0);
    m.rotateZ(Math.PI / 2);
    m.renderOrder = 9;
    this.scene.add(m);
    this.live.push({ obj: m, life: 0.2, max: 0.2, kind: 'smear' });
  }

  /** Schockwelle am Boden */
  shockwave(pos: Vector3, radius: number, color = '#ffffff') {
    const m = new Mesh(sharedGeo('wave', () => new RingGeometry(0.8, 1, 48)), new MeshBasicMaterial({ color: TMP_COL.set(color).multiplyScalar(2), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos).setY(pos.y + 0.08);
    this.scene.add(m);
    this.live.push({ obj: m, life: 0.45, max: 0.45, kind: 'wave', data: radius });
    this.dust.emit(Math.round(26 * this.scale), pos.x, pos.y + 0.2, pos.z, { speed: radius * 2.2, up: 1.5, life: 0.8, color: DUST_COL, gravity: 2, spread: 0.6 });
  }

  /** Bodenriss nach schweren Schlägen: Decal, das sich ans Gelände legt und nach einigen Sekunden verblasst */
  crack(pos: Vector3, size: number) {
    // riesige Risse wirkten wie Spinnweben: Größe deckeln, damit die Spalten kräftig bleiben
    this.decals.spawn('crack', pos.x, pos.y, pos.z, Math.min(size, 8), '#ffffff', 4.5, 2);
  }

  /** Warnkreis für Flächenangriffe; füllt sich bis zum Einschlag */
  telegraph(pos: Vector3, radius: number, time: number, color = '#FF3A2A') {
    const rq = q(radius);
    const ring = new Mesh(sharedGeo(`tele:${rq}`, () => new RingGeometry(rq * 0.92, rq, 48)), new MeshBasicMaterial({ color: TMP_COL.set(color).multiplyScalar(1.5), transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide }));
    const fill = new Mesh(sharedGeo(`teleFill:${rq}`, () => new CircleGeometry(rq, 48)), new MeshBasicMaterial({ color: TMP_COL.set(color), transparent: true, opacity: 0.25, depthWrite: false, side: DoubleSide }));
    ring.rotation.x = fill.rotation.x = -Math.PI / 2;
    ring.position.copy(pos).setY(pos.y + 0.06);
    fill.position.copy(pos).setY(pos.y + 0.05);
    fill.scale.setScalar(0.01);
    this.scene.add(ring, fill);
    this.live.push({ obj: ring, life: time, max: time, kind: 'tele' });
    this.live.push({ obj: fill, life: time, max: time, kind: 'telefill' });
  }

  /** Farbige Partikel (Brand, Gift) */
  puffColor(pos: Vector3, color: string) {
    this.sparks.emit(1, pos.x + (Math.random() - 0.5) * 0.6, pos.y + Math.random(), pos.z + (Math.random() - 0.5) * 0.6, { speed: 0.4, up: 2.5, life: 0.6, color: TMP_COL.set(color).multiplyScalar(2.2), gravity: -1, spread: 0.1 });
  }

  /** Staubwolke (Rolle, Landung) */
  puff(pos: Vector3, n = 8) {
    this.dust.emit(Math.round(n * this.scale), pos.x, pos.y + 0.15, pos.z, { speed: 2, up: 1, life: 0.6, color: PUFF_COL, gravity: 1, spread: 0.5 });
  }

  update(dt: number) {
    this.decals.update(dt);
    for (const l of this.live) {
      l.life -= dt;
      const k = Math.max(0, l.life / l.max);
      const mat = (l.obj as Mesh).material as any;
      switch (l.kind) {
        case 'spark': l.obj.scale.setScalar(l.data * (0.4 + (1 - k) * 0.9)); mat.opacity = k; break;
        case 'smear': mat.uniforms.uProg.value = Math.min(1.6, (1 - k) * 2.6); mat.uniforms.uAlpha.value = Math.min(1, k * 2.2); break;
        case 'wave': l.obj.scale.setScalar(0.5 + (1 - k) * l.data); mat.opacity = k; break;
        case 'crack': mat.opacity = Math.min(1, k * 3); break;
        case 'tele': mat.opacity = 0.5 + 0.4 * Math.sin(l.life * 30); break;
        case 'telefill': l.obj.scale.setScalar(1 - k); break;
      }
      if (l.life <= 0) {
        l.obj.removeFromParent();
        // eigenes Material freigeben; geteilte Netze (Bögen, Ringe) bleiben für den nächsten Treffer
        disposeGeometry((l.obj as Mesh).geometry);
        mat.dispose?.();
      }
    }
    // abgelaufene Effekte an Ort und Stelle entfernen (kein neues Array pro Bild)
    let n = 0;
    for (const l of this.live) if (l.life > 0) this.live[n++] = l;
    this.live.length = n;
  }
}
