import { audio } from '../audio/audio';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  Vector3,
  type Camera,
  type Scene,
} from 'three';
import { WEATHER, WEATHER_IDS, type WeatherDef, type WeatherId } from '../data/world';

type Params = Omit<WeatherDef, 'label' | 'weight'>;
const PARAM_KEYS: (keyof Params)[] = ['clouds', 'cloudDark', 'visibility', 'grey', 'rain', 'waves', 'wind', 'lightning', 'light'];

const MAX_DROPS = 6000;
const RAIN_BOX = new Vector3(70, 40, 70);

/** Wetterzustand mit weichen Übergängen, Regen und Blitzen. */
export class Weather {
  target: WeatherId = 'klar';
  /** Aktuelle (überblendete) Werte */
  readonly p: Params;
  /** Automatischer Wetterwechsel */
  auto = true;
  /** Blitzhelligkeit 0 … 1, klingt schnell ab */
  flash = 0;
  /** Wird bei jedem Blitz aufgerufen (Donner kommt in Meilenstein 8) */
  onLightning: (pos: Vector3) => void = () => {};

  private changeTimer = 240;
  private boltTimer = 5;
  private rain: LineSegments;
  private rainMat: ShaderMaterial;
  private maxDrops = 3000;
  private bolt: Mesh;
  private boltLife = 0;

  constructor(scene: Scene) {
    this.p = { ...this.paramsOf('klar') };

    const seeds = new Float32Array(MAX_DROPS * 2 * 3);
    const ends = new Float32Array(MAX_DROPS * 2);
    for (let i = 0; i < MAX_DROPS; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      for (let e = 0; e < 2; e++) {
        seeds.set([x, y, z], (i * 2 + e) * 3);
        ends[i * 2 + e] = e;
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(seeds, 3));
    geo.setAttribute('aEnd', new BufferAttribute(ends, 1));
    this.rainMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new Vector3() },
        uBox: { value: RAIN_BOX.clone() },
        uWind: { value: new Vector3(6, 0, 2) },
        uAlpha: { value: 0 },
        uColor: { value: new Color(0.75, 0.82, 0.95) },
      },
      vertexShader: /* glsl */ `
        attribute float aEnd;
        uniform float uTime; uniform vec3 uCenter, uBox, uWind;
        varying float vA;
        void main() {
          vec3 vel = vec3(uWind.x, -28.0, uWind.z);
          vec3 p = position * uBox + vel * uTime * (0.85 + position.y * 0.3);
          p = mod(p - uCenter + uBox * 0.5, uBox) - uBox * 0.5 + uCenter;
          p -= vel * 0.045 * aEnd;
          vA = 1.0 - aEnd * 0.7;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; uniform vec3 uColor;
        varying float vA;
        void main() {
          gl_FragColor = vec4(uColor, uAlpha * vA);
          #include <colorspace_fragment>
        }`,
    });
    this.rain = new LineSegments(geo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    this.bolt = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ color: new Color(9, 9, 12), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }));
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    scene.add(this.bolt);
  }

  private paramsOf(id: WeatherId): Params {
    const d = WEATHER[id];
    const out = {} as Params;
    for (const k of PARAM_KEYS) out[k] = d[k];
    return out;
  }

  setWeather(id: WeatherId, instant = false) {
    this.target = id;
    this.changeTimer = 180 + Math.random() * 240;
    if (instant) Object.assign(this.p, this.paramsOf(id));
  }

  setMaxDrops(n: number) { this.maxDrops = Math.min(MAX_DROPS, n); }

  /** Logik (feste Schritte) */
  update(dt: number, focus: Vector3) {
    const goal = this.paramsOf(this.target);
    const k = Math.min(1, dt / 12); // ca. 12 s bis zum größten Teil des Übergangs
    for (const key of PARAM_KEYS) this.p[key] += (goal[key] - this.p[key]) * k;

    if (this.auto) {
      this.changeTimer -= dt;
      if (this.changeTimer <= 0) this.setWeather(this.pickNext());
    }

    if (this.p.lightning > 0.3) {
      this.boltTimer -= dt;
      if (this.boltTimer <= 0) {
        this.boltTimer = (60 / this.p.lightning) * (0.4 + Math.random() * 1.2);
        this.strike(focus);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.boltLife > 0) {
      this.boltLife -= dt;
      (this.bolt.material as MeshBasicMaterial).opacity = this.boltLife > 0.12 ? (Math.random() < 0.3 ? 0.4 : 1) : this.boltLife / 0.12;
      if (this.boltLife <= 0) this.bolt.visible = false;
    }
  }

  private pickNext(): WeatherId {
    const opts = WEATHER_IDS.filter((w) => w !== this.target);
    const total = opts.reduce((s, w) => s + WEATHER[w].weight, 0);
    let r = Math.random() * total;
    for (const w of opts) { r -= WEATHER[w].weight; if (r <= 0) return w; }
    return 'klar';
  }

  /** Blitz in sicherer Entfernung vom Spieler */
  private strike(focus: Vector3) {
    const a = Math.random() * Math.PI * 2;
    const d = 160 + Math.random() * 380;
    const base = new Vector3(focus.x + Math.cos(a) * d, 0, focus.z + Math.sin(a) * d);
    const pts: Vector3[] = [];
    let p = base.clone().setY(230);
    pts.push(p.clone());
    while (p.y > 0) {
      p = p.clone().add(new Vector3((Math.random() - 0.5) * 22, -12 - Math.random() * 14, (Math.random() - 0.5) * 22));
      p.y = Math.max(0, p.y);
      pts.push(p);
    }
    // Band aus Dreiecken, quer zur Blickrichtung zum Spieler
    const side = new Vector3(-(base.z - focus.z), 0, base.x - focus.x).normalize();
    const pos: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const w0 = 1.6 * (1 - i / pts.length) + 0.4;
      const w1 = 1.6 * (1 - (i + 1) / pts.length) + 0.4;
      const a0 = pts[i].clone().addScaledVector(side, -w0), b0 = pts[i].clone().addScaledVector(side, w0);
      const a1 = pts[i + 1].clone().addScaledVector(side, -w1), b1 = pts[i + 1].clone().addScaledVector(side, w1);
      pos.push(...a0.toArray(), ...b0.toArray(), ...a1.toArray(), ...b0.toArray(), ...b1.toArray(), ...a1.toArray());
    }
    this.bolt.geometry.dispose();
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    this.bolt.geometry = g;
    this.bolt.visible = true;
    this.boltLife = 0.32;
    this.flash = 1;
    setTimeout(() => audio.play('thunder', 0.6 + Math.random() * 0.4), 300 + Math.random() * 1500);
    this.onLightning(base);
  }

  /** Darstellung (jeder Frame) */
  render(time: number, camera: Camera) {
    const drops = Math.round(this.maxDrops * MathUtils.clamp(this.p.rain, 0, 1));
    this.rain.visible = drops > 10;
    if (this.rain.visible) {
      this.rain.geometry.setDrawRange(0, drops * 2);
      const u = this.rainMat.uniforms;
      u.uTime.value = time;
      u.uCenter.value.copy(camera.position);
      u.uWind.value.set(10 * this.p.wind, 0, 4 * this.p.wind);
      u.uAlpha.value = 0.35 + 0.25 * this.p.rain;
    }
  }
}
