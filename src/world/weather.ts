import { audio } from '../audio/audio';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
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

const MAX_DROPS = 12000;

/**
 * Regen in drei Tiefenschichten (alle aus denselben Samen, je Schicht anders verschoben): nah (wenige, dicke, lange Striche mit viel Glanz),
 * mittel (die Hauptmasse) und fern (viele feine, lange, blasse Striche, die zusammen einen Regenvorhang ergeben).
 * `share` = Anteil an `maxDrops`, `len`/`width` in Metern, `alpha` Grunddeckkraft, `fade` = Entfernung (m), ab der die Tropfen vor der Linse einblenden.
 */
const RAIN_LAYERS = [
  { box: [24, 20, 24], share: 0.34, len: 1.35, width: 0.022, alpha: 0.62, fade: [2.6, 6.5], shift: [0.31, 0.57, 0.83] },
  { box: [70, 40, 70], share: 0.8, len: 1.15, width: 0.014, alpha: 0.48, fade: [2.6, 6.5], shift: [0, 0, 0] },
  { box: [200, 70, 200], share: 1.7, len: 3.6, width: 0.017, alpha: 0.27, fade: [8, 20], shift: [0.67, 0.13, 0.29] },
] as const;
const FALL = 28;
const WHITE = new Color(1, 1, 1);

interface RainLayer { mesh: Mesh; geo: InstancedBufferGeometry; mat: ShaderMaterial; share: number; alpha: number }

/** Licht und Nebel für den Regen (die Umgebung reicht sie je Bild mit) */
export interface RainLook {
  /** Horizontfarbe (Nebelfarbe), der Regen mischt sie in seine Farbe */
  horizon: Color;
  /** Helligkeit 0 (Nacht, Unwetterdunkel) … 1 (Sonne) */
  lit: number;
  /** Stärke des Gegenlichts (Sonne oder Mond sichtbar), 0 … 1 */
  sunK: number;
  /** Richtung zur Lichtquelle (normiert) */
  sunDir: Vector3;
}

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
  /** Gehaltene Werte (siehe `hold`) */
  private held: Partial<Params> | null = null;
  private layers: RainLayer[] = [];
  /** Aufsummierte Fallzeit und Winddrift: ändert sich der Wind, treibt der Regen sanft mit statt zu springen */
  private fall = 0;
  private readonly drift = new Vector3();
  private lastT = -1;
  private readonly tint = new Color();
  /** Sekunden bis zum Donner nach einem Blitz (< 0: keiner geplant) */
  private thunderT = -1;
  private maxDrops = 3000;
  private bolt: Mesh;
  private boltLife = 0;

  constructor(scene: Scene) {
    this.p = { ...this.paramsOf('klar') };

    // Instanzierte Regentropfen: ein Quad je Tropfen (zur Kamera gedrehter Streifen), Bahn rechnet die Grafikkarte
    const seeds = new Float32Array(MAX_DROPS * 3);
    for (let i = 0; i < MAX_DROPS; i++) seeds.set([Math.random(), Math.random(), Math.random()], i * 3);
    const quad = new PlaneGeometry(1, 1);
    const seedAttr = new InstancedBufferAttribute(seeds, 3);
    for (const L of RAIN_LAYERS) {
      const geo = new InstancedBufferGeometry();
      geo.index = quad.index;
      geo.setAttribute('position', quad.getAttribute('position'));
      geo.setAttribute('uv', quad.getAttribute('uv'));
      geo.setAttribute('aSeed', seedAttr);
      geo.instanceCount = 0;
      const mat = new ShaderMaterial({
        transparent: true,
        // der Streifen dreht sich zur Kamera, seine Wicklung hängt aber von der Fallrichtung ab: beide Seiten zeichnen
        side: DoubleSide,
        depthWrite: false,
        uniforms: {
          uFall: { value: 0 },
          uTime: { value: 0 },
          uDrift: { value: new Vector3() },
          uCenter: { value: new Vector3() },
          uBox: { value: new Vector3(L.box[0], L.box[1], L.box[2]) },
          uShift: { value: new Vector3(L.shift[0], L.shift[1], L.shift[2]) },
          uWind: { value: new Vector3(6, 0, 2) },
          uAlpha: { value: 0 },
          uColor: { value: new Color(0.75, 0.82, 0.95) },
          uLen: { value: L.len },
          uWidth: { value: L.width },
          uFade: { value: new Vector3(L.fade[0], L.fade[1], 0) },
          uSunDir: { value: new Vector3(0, 1, 0) },
          uSunK: { value: 0 },
        },
        vertexShader: /* glsl */ `
          attribute vec3 aSeed;
          uniform float uFall, uTime, uLen, uWidth, uSunK;
          uniform vec3 uCenter, uBox, uWind, uDrift, uShift, uFade, uSunDir;
          varying vec2 vUv;
          varying float vNear;
          varying float vVar;
          varying float vGlint;
          void main() {
            vec3 s = fract(aSeed + uShift);
            float sp = 0.85 + s.y * 0.3;
            // Fall und Winddrift werden einzeln aufsummiert (CPU): ändert sich der Wind, treibt der Regen sanft mit statt zu springen
            vec3 rel = s * uBox + vec3(0.0, -${FALL.toFixed(1)} * sp * uFall, 0.0) + uDrift;
            rel = mod(rel - uCenter + uBox * 0.5, uBox) - uBox * 0.5;
            vec3 p = rel + uCenter;
            // Böen: die Luft schwankt mit der Höhe leicht hin und her (glatt, ohne Sprünge)
            float gust = sin(uTime * 0.6 + p.y * 0.07 + p.x * 0.021) * 0.6 + sin(uTime * 1.3 + p.z * 0.03) * 0.4;
            p.xz += uWind.xz * 0.05 * gust;
            vec3 vel = vec3(uWind.x * (1.0 + 0.12 * gust), -${FALL.toFixed(1)} * sp, uWind.z * (1.0 + 0.12 * gust));
            vec3 dir = normalize(vel);
            vec3 toCam = normalize(cameraPosition - p);
            vec3 side = normalize(cross(dir, toCam));
            float camD = distance(cameraPosition, p);
            // weiter weg etwas breiter, damit Tropfen nicht zu flimmernden Pixeln werden
            float w = uWidth * (1.0 + camD * 0.045);
            // Tropfen direkt vor der Linse ausblenden, am Rand des Regenkastens weich ein- und ausblenden (kein Auftauchen aus dem Nichts)
            vec3 e = abs(rel) / (uBox * 0.5);
            float edge = 1.0 - smoothstep(0.7, 1.0, max(max(e.x, e.z), e.y));
            vNear = smoothstep(uFade.x, uFade.y, camD) * edge;
            vVar = 0.5 + 0.5 * fract(s.x * 7.31 + s.z * 3.77);
            // Gegenlicht: Tropfen vor der Sonne oder dem Mond leuchten auf
            vec3 view = normalize(p - cameraPosition);
            vGlint = uSunK * smoothstep(0.35, 0.97, dot(view, uSunDir));
            float len = uLen * (0.75 + s.z * 0.5);
            vec3 q = p - dir * (position.y + 0.5) * len + side * position.x * w;
            vUv = uv;
            gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uAlpha; uniform vec3 uColor;
          varying vec2 vUv;
          varying float vNear;
          varying float vVar;
          varying float vGlint;
          void main() {
            // Kopf hell, Schweif läuft aus; heller Kern mit weichem Rand (kein harter Strich)
            float along = vUv.y;
            float across = clamp(1.0 - abs(vUv.x - 0.5) * 2.0, 0.0, 1.0);
            float core = across * sqrt(across);
            float body = (1.0 - smoothstep(0.1, 1.0, along)) * smoothstep(0.0, 0.1, along);
            float a = uAlpha * (0.45 + 0.55 * vVar) * core * body * vNear * (1.0 + 1.1 * vGlint);
            if (a < 0.01) discard;
            vec3 col = uColor * (0.8 + 0.4 * vVar) + vec3(0.9, 0.95, 1.0) * vGlint * 0.35;
            gl_FragColor = vec4(col, min(a, 0.9));
            #include <colorspace_fragment>
          }`,
      });
      const mesh = new Mesh(geo, mat);
      mesh.renderOrder = 6;
      mesh.userData.noOutline = true;
      mesh.frustumCulled = false;
      mesh.visible = false;
      scene.add(mesh);
      this.layers.push({ mesh, geo, mat, share: L.share, alpha: L.alpha });
    }

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
    if (instant) Object.assign(this.p, this.goalOf());
  }

  /** Eigene Werte, die über dem Wetter-Typ stehen (Titelbild: Abendhimmel, Sturmfront ohne zufällige Blitze); `null` gibt das Wetter wieder frei */
  hold(values: Partial<Params> | null, instant = false) {
    this.held = values ? { ...values } : null;
    if (instant) Object.assign(this.p, this.goalOf());
  }

  /** Zielwerte: Vorgabe des Wetter-Typs, darüber die gehaltenen Werte (ohne neue Objekte je Schritt) */
  private goalOf(): Params {
    const base = this.paramsOf(this.target);
    return this.held ? Object.assign(base, this.held) : base;
  }

  setMaxDrops(n: number) { this.maxDrops = Math.min(MAX_DROPS, n); }


  /** Logik (feste Schritte) */
  update(dt: number, focus: Vector3) {
    if (this.thunderT >= 0 && (this.thunderT -= dt) < 0) audio.play('thunder', 0.6 + Math.random() * 0.4);
    const goal = this.goalOf();
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
    this.strikeAt(focus, focus.x + Math.cos(a) * d, focus.z + Math.sin(a) * d);
  }

  /** Blitz an einem bestimmten Ort (das Titelbild lässt ihn vor der Kamera einschlagen); `focus` bestimmt nur, wie das Band zum Betrachter steht */
  strikeAt(focus: Vector3, x: number, z: number) {
    const base = new Vector3(x, 0, z);
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
    // Donner kommt nach dem Blitz – in Spielzeit (in der Pause kein Donner)
    this.thunderT = 0.3 + Math.random() * 1.5;
    this.onLightning(base);
  }

  /** Darstellung (jeder Frame); `look` = Licht und Nebel der Umgebung (ohne: neutrales Bläulichweiß) */
  render(time: number, camera: Camera, look?: RainLook) {
    const rainK = MathUtils.clamp(this.p.rain, 0, 1);
    const total = Math.round(this.maxDrops * rainK);
    const visible = total > 10;
    const dt = this.lastT < 0 ? 0 : MathUtils.clamp(time - this.lastT, 0, 0.1);
    this.lastT = time;
    // Farbe: Horizont (Nebel) mit Licht gemischt, nachts dunkel statt grellweiß, Blitze hellen auf
    const lit = look ? look.lit : 1;
    const flash = this.flash;
    if (look) this.tint.copy(look.horizon).lerp(WHITE, 0.45 + 0.2 * lit).multiplyScalar(0.28 + 0.72 * lit);
    else this.tint.setRGB(0.75, 0.82, 0.95);
    this.tint.addScalar(flash * 0.55);
    const windX = 10 * this.p.wind, windZ = 4 * this.p.wind;
    if (visible) {
      this.fall += dt;
      this.drift.x += windX * dt; this.drift.z += windZ * dt;
      // Zähler bleiben unbegrenzt (eine Stunde Dauerregen sind ~10^5 m, Float32 löst dort noch auf 1 cm auf); ein Rücksetzen würde den Regen springen lassen
    }
    for (const L of this.layers) {
      L.mesh.visible = visible;
      if (!visible) continue;
      L.geo.instanceCount = Math.min(MAX_DROPS, Math.round(total * L.share));
      const u = L.mat.uniforms;
      u.uFall.value = this.fall;
      u.uTime.value = time;
      u.uDrift.value.copy(this.drift);
      u.uCenter.value.copy(camera.position);
      u.uWind.value.set(windX, 0, windZ);
      u.uAlpha.value = L.alpha * (0.75 + 0.35 * rainK) * (1 + flash * 0.8);
      u.uColor.value.copy(this.tint);
      if (look) { u.uSunDir.value.copy(look.sunDir); u.uSunK.value = look.sunK; }
    }
  }
}
