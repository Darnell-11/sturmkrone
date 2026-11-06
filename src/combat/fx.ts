import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Scene,
} from 'three';
import type { FxKind } from '../data/combat';
import type { ParticleSystem } from '../world/particles';

function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  return new CanvasTexture(c);
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

/** Bodenriss: dunkle, gezackte Linien */
const CRACK_TEX = canvasTex(512, (ctx, s) => {
  ctx.translate(s / 2, s / 2);
  // Krater: dunkle, verbrannte Mitte mit weichem Rand – liest sich als Einschlag statt als Spinnennetz
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.2);
  g.addColorStop(0, 'rgba(25,16,10,0.85)');
  g.addColorStop(0.55, 'rgba(45,30,18,0.55)');
  g.addColorStop(1, 'rgba(60,40,25,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // dicke, gezackte Risse mit Verästelungen, die nach außen dünn auslaufen
  const crack = (x: number, y: number, a: number, w: number, steps: number, depth: number) => {
    for (let k = 0; k < steps; k++) {
      a += (Math.random() - 0.5) * 0.8;
      const len = s * (0.035 + Math.random() * 0.035);
      const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
      // heller Bruchrand, dann die dunkle Spalte darauf
      ctx.strokeStyle = 'rgba(150,120,90,0.35)'; ctx.lineWidth = w + 5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      ctx.strokeStyle = 'rgba(22,14,9,0.92)'; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      x = nx; y = ny; w = Math.max(1.5, w * 0.78);
      if (depth > 0 && Math.random() < 0.35) crack(x, y, a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5), w * 0.8, steps - k - 1, depth - 1);
    }
  };
  const n = 7 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    crack(Math.cos(a) * s * 0.05, Math.sin(a) * s * 0.05, a, 14, 6, 2);
  }
  // Brocken und Steinchen am Kraterrand
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, d = s * (0.08 + Math.random() * 0.16), r = 2 + Math.random() * 6;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(30,20,12,0.8)' : 'rgba(170,140,105,0.5)';
    ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, Math.PI * 2); ctx.fill();
  }
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
    float body = pow(uv.y, 2.4) * (1.0 - smoothstep(0.93, 1.0, uv.y));
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

  constructor(private scene: Scene, private sparks: ParticleSystem, private dust: ParticleSystem) {}

  /** Trefferfunke am Trefferpunkt */
  hit(pos: Vector3, kind: FxKind, color: string, big = false) {
    const c = new Color(color);
    const mat = this.sparkMat.clone();
    mat.color = c.clone().multiplyScalar(kind === 'magic' ? 3 : 2.2);
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
    (s2.material as SpriteMaterial).color = new Color(3, 3, 3);
    (s2.material as SpriteMaterial).rotation = mat.rotation + Math.PI / 4;
    this.scene.add(s2);
    this.live.push({ obj: s2, life: 0.1, max: 0.1, kind: 'spark', data: size * 0.6 });
    this.sparks.emit(big ? 22 : 12, pos.x, pos.y, pos.z, { speed: big ? 11 : 8, up: 4, life: 0.35, color: c.clone().multiplyScalar(1.6), gravity: 12, spread: 0.2 });
  }

  /** Schmier-Bogen eines Schwerthiebs */
  smear(origin: Vector3, yaw: number, tilt: number, range: number, arc: number, color: string, flip = false) {
    const a = Math.min(arc, Math.PI * 1.9);
    const geo = arcGeometry(range * 0.45, range * 1.05, a, 32);
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
    const m = new Mesh(new RingGeometry(0.8, 1, 48), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(2), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos).setY(pos.y + 0.08);
    this.scene.add(m);
    this.live.push({ obj: m, life: 0.45, max: 0.45, kind: 'wave', data: radius });
    this.dust.emit(Math.round(26 * this.scale), pos.x, pos.y + 0.2, pos.z, { speed: radius * 2.2, up: 1.5, life: 0.8, color: new Color(0.9, 0.82, 0.65), gravity: 2, spread: 0.6 });
  }

  /** Bodenriss nach schweren Schlägen */
  crack(pos: Vector3, size: number) {
    // riesige Risse wirkten wie Spinnweben: Größe deckeln, damit die Spalten kräftig bleiben
    size = Math.min(size, 8);
    const m = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({ map: CRACK_TEX, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI * 2;
    m.position.copy(pos).setY(pos.y + 0.05);
    this.scene.add(m);
    this.live.push({ obj: m, life: 2.5, max: 2.5, kind: 'crack' });
  }

  /** Warnkreis für Flächenangriffe; füllt sich bis zum Einschlag */
  telegraph(pos: Vector3, radius: number, time: number, color = '#FF3A2A') {
    const ring = new Mesh(new RingGeometry(radius * 0.92, radius, 48), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(1.5), transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide }));
    const fill = new Mesh(new CircleGeometry(radius, 48), new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.25, depthWrite: false, side: DoubleSide }));
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
    this.sparks.emit(1, pos.x + (Math.random() - 0.5) * 0.6, pos.y + Math.random(), pos.z + (Math.random() - 0.5) * 0.6, { speed: 0.4, up: 2.5, life: 0.6, color: new Color(color).multiplyScalar(2.2), gravity: -1, spread: 0.1 });
  }

  /** Staubwolke (Rolle, Landung) */
  puff(pos: Vector3, n = 8) {
    this.dust.emit(Math.round(n * this.scale), pos.x, pos.y + 0.15, pos.z, { speed: 2, up: 1, life: 0.6, color: new Color(0.92, 0.85, 0.7), gravity: 1, spread: 0.5 });
  }

  update(dt: number) {
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
        if (l.kind !== 'spark') (l.obj as Mesh).geometry?.dispose?.();
        mat.dispose?.();
      }
    }
    this.live = this.live.filter((l) => l.life > 0);
  }
}
