import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  Vector3,
  type Object3D,
  type Scene,
} from 'three';

/**
 * Leuchtender Waffenschweif (Mesh-Ribbon): ein Band zwischen Klingenansatz und Klingenspitze, das die letzten
 * Positionen der Klinge nachzeichnet und mit dem Alter verglüht. Zur Spitze hin heller (dort ist der Hieb am schnellsten).
 * Wird bei jedem Bild (nicht nur im Logikschritt) abgetastet – dadurch auch bei schnellen Schlägen glatt.
 */
const N = 24;          // Stützpunkte entlang des Schweifs
const MAX_AGE = 0.16;  // so lange zieht das Licht nach (Sekunden)

const VERT = /* glsl */ `
  attribute float aAge;
  attribute float aSide;
  varying float vAge;
  varying float vSide;
  void main() {
    vAge = aAge;
    vSide = aSide;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }`;
const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAge;
  varying float vSide;
  void main() {
    float a = clamp(1.0 - vAge, 0.0, 1.0);
    // zur Spitze hin heller und weißer Kern direkt hinter der Klinge
    float tip = mix(0.35, 1.0, vSide);
    vec3 c = mix(uColor, vec3(1.0), pow(a, 3.0) * 0.6 * vSide);
    float alpha = a * a * tip * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(c * (1.2 + 1.6 * a), alpha);
  }`;

export class WeaponTrail {
  readonly mesh: Mesh;
  private pos = new Float32Array(N * 2 * 3);
  private age = new Float32Array(N * 2);
  private samples: { b: Vector3; t: Vector3; time: number }[] = [];
  private head = 0;
  private count = 0;
  private now = 0;
  private wb = new Vector3();
  private wt = new Vector3();
  private mat: ShaderMaterial;
  /** an: Schweif zeichnet neue Punkte; aus: vorhandener Schweif verglüht */
  active = false;

  constructor(scene: Scene, private base: Object3D, private tip: Object3D, color: Color | string) {
    for (let i = 0; i < N; i++) this.samples.push({ b: new Vector3(), t: new Vector3(), time: -1 });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(35048));
    geo.setAttribute('aAge', new BufferAttribute(this.age, 1).setUsage(35048));
    const side = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { side[i * 2] = 0; side[i * 2 + 1] = 1; }
    geo.setAttribute('aSide', new BufferAttribute(side, 1));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uColor: { value: new Color(color) }, uOpacity: { value: 1 } },
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    });
    this.mesh = new Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.userData.noOutline = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setColor(c: Color | string) { (this.mat.uniforms.uColor.value as Color).set(c); }

  /** Bei jedem Bild aufrufen (nach dem Ausrichten der Figur); dt = Echtzeit */
  update(dt: number) {
    this.now += dt;
    if (this.active) {
      this.base.getWorldPosition(this.wb);
      this.tip.getWorldPosition(this.wt);
      const last = this.samples[(this.head + N - 1) % N];
      // nur neue Stützpunkte bei echter Bewegung (ruhige Klinge zeichnet nichts)
      if (this.count === 0 || last.t.distanceToSquared(this.wt) > 0.0004) {
        const s = this.samples[this.head];
        s.b.copy(this.wb); s.t.copy(this.wt); s.time = this.now;
        this.head = (this.head + 1) % N;
        this.count = Math.min(N, this.count + 1);
      }
    }
    // Band von alt nach neu aufbauen; der neueste Punkt klebt an der Klinge
    let live = 0;
    for (let k = 0; k < N; k++) {
      const s = this.samples[(this.head - this.count + k + N * 2) % N];
      const i = k;
      const a = k < this.count && s.time >= 0 ? (this.now - s.time) / MAX_AGE : 2;
      if (a < 1) live++;
      const src = k < this.count ? s : this.samples[(this.head + N - 1) % N];
      this.pos[i * 6] = src.b.x; this.pos[i * 6 + 1] = src.b.y; this.pos[i * 6 + 2] = src.b.z;
      this.pos[i * 6 + 3] = src.t.x; this.pos[i * 6 + 4] = src.t.y; this.pos[i * 6 + 5] = src.t.z;
      this.age[i * 2] = this.age[i * 2 + 1] = Math.min(2, a);
    }
    if (this.active && this.count > 0) {
      // letzter Stützpunkt genau an der aktuellen Klinge (kein Spalt zwischen Klinge und Licht)
      const i = Math.min(this.count, N) - 1;
      this.pos[i * 6] = this.wb.x; this.pos[i * 6 + 1] = this.wb.y; this.pos[i * 6 + 2] = this.wb.z;
      this.pos[i * 6 + 3] = this.wt.x; this.pos[i * 6 + 4] = this.wt.y; this.pos[i * 6 + 5] = this.wt.z;
      this.age[i * 2] = this.age[i * 2 + 1] = 0;
    }
    this.mesh.visible = live > 1;
    if (!this.mesh.visible && !this.active) this.count = 0;
    const g = this.mesh.geometry;
    (g.attributes.position as BufferAttribute).needsUpdate = true;
    (g.attributes.aAge as BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
