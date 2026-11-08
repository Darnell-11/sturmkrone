import {
  AdditiveBlending,
  BufferAttribute,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  SRGBColorSpace,
  type Scene,
  type Texture,
} from 'three';
import { markShared } from './dispose';

/**
 * Boden-Decals: Bodenrisse, Brandflecken, Frost und magische Siegel, die sich an das Gelände schmiegen
 * und nach einigen Sekunden langsam verblassen. Feste Anzahl wiederverwendeter Netze (kein Speicherwachstum).
 */
export type DecalKind = 'crack' | 'burn' | 'frost' | 'sigil';

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return markShared(t);
}

/** Bodenriss: dunkler Krater mit gezackten, verästelten Spalten */
function crackTex() {
  return canvasTex(512, (g, s) => {
    g.translate(s / 2, s / 2);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.2);
    rg.addColorStop(0, 'rgba(25,16,10,0.85)'); rg.addColorStop(0.55, 'rgba(45,30,18,0.55)'); rg.addColorStop(1, 'rgba(60,40,25,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, s * 0.2, 0, Math.PI * 2); g.fill();
    g.lineCap = 'round'; g.lineJoin = 'round';
    const crack = (x: number, y: number, a: number, w: number, steps: number, depth: number) => {
      for (let k = 0; k < steps; k++) {
        a += (Math.random() - 0.5) * 0.8;
        const len = s * (0.035 + Math.random() * 0.035);
        const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
        g.strokeStyle = 'rgba(150,120,90,0.35)'; g.lineWidth = w + 5;
        g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        g.strokeStyle = 'rgba(22,14,9,0.92)'; g.lineWidth = w;
        g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        x = nx; y = ny; w = Math.max(1.5, w * 0.78);
        if (depth > 0 && Math.random() < 0.35) crack(x, y, a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5), w * 0.8, steps - k - 1, depth - 1);
      }
    };
    const n = 8;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.random() * 0.5; crack(Math.cos(a) * s * 0.05, Math.sin(a) * s * 0.05, a, 14, 6, 2); }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, d = s * (0.08 + Math.random() * 0.16), r = 2 + Math.random() * 6;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(30,20,12,0.8)' : 'rgba(170,140,105,0.5)';
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
    }
  });
}

/** Brandfleck: verkohlte Mitte, ausgefranster Rußrand, Glutpunkte */
function burnTex() {
  return canvasTex(256, (g, s) => {
    g.translate(s / 2, s / 2);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.pow(Math.random(), 0.7) * s * 0.33, r = s * (0.04 + Math.random() * 0.09);
      const rg = g.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, r);
      rg.addColorStop(0, `rgba(14,10,8,${0.28 + Math.random() * 0.2})`); rg.addColorStop(1, 'rgba(14,10,8,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * s * 0.22;
      g.fillStyle = `rgba(255,${120 + Math.floor(Math.random() * 80)},40,${0.5 + Math.random() * 0.4})`;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 1 + Math.random() * 2.5, 0, Math.PI * 2); g.fill();
    }
  });
}

/** Frost: helle Eiskristalle, sternförmig */
function frostTex() {
  return canvasTex(256, (g, s) => {
    g.translate(s / 2, s / 2);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.38);
    rg.addColorStop(0, 'rgba(225,245,255,0.55)'); rg.addColorStop(1, 'rgba(225,245,255,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, s * 0.38, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(240,252,255,0.85)'; g.lineCap = 'round';
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
      g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      if (depth > 0) for (const k of [0.4, 0.7]) for (const sgn of [-1, 1]) branch(x + (nx - x) * k, y + (ny - y) * k, a + sgn * 0.9, len * 0.35, w * 0.6, depth - 1);
    };
    for (let i = 0; i < 6; i++) branch(0, 0, (i / 6) * Math.PI * 2 + Math.random() * 0.3, s * (0.28 + Math.random() * 0.1), 3.5, 2);
  });
}

/** Magisches Siegel: Doppelring, Runen, Stern – weiß, wird über die Farbe eingefärbt (leuchtet additiv) */
function sigilTex() {
  return canvasTex(512, (g, s) => {
    g.translate(s / 2, s / 2);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 7; g.beginPath(); g.arc(0, 0, s * 0.46, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(0, 0, s * 0.42, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.arc(0, 0, s * 0.27, 0, Math.PI * 2); g.stroke();
    // Runen zwischen den Ringen
    g.lineWidth = 3;
    const n = 18;
    for (let i = 0; i < n; i++) {
      g.save(); g.rotate((i / n) * Math.PI * 2); g.translate(0, -s * 0.345);
      g.beginPath();
      const k = (i * 7) % 5;
      g.moveTo(-8, -10); g.lineTo(k > 1 ? 8 : 0, k > 2 ? 10 : -2); g.lineTo(-6, 10);
      if (k % 2) { g.moveTo(-10, 0); g.lineTo(10, 0); }
      g.stroke(); g.restore();
    }
    // Sechsstern
    g.lineWidth = 5;
    for (const off of [0, Math.PI / 3]) {
      g.beginPath();
      for (let i = 0; i <= 3; i++) { const a = off + (i / 3) * Math.PI * 2 - Math.PI / 2; const x = Math.cos(a) * s * 0.27, y = Math.sin(a) * s * 0.27; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.27);
    rg.addColorStop(0, 'rgba(255,255,255,0.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, s * 0.27, 0, Math.PI * 2); g.fill();
  });
}

const GRID = 8;
const MAX = 28;

interface Slot {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  tex: Partial<Record<DecalKind, Texture>>;
  kind: DecalKind;
  x: number; y: number; z: number; size: number; rot: number; spin: number;
  t: number; life: number; fade: number; alpha: number; held: boolean;
}

/** Griff auf ein Decal (z. B. Auflade-Siegel, das der Figur folgt) */
export type DecalHandle = Slot;

export class DecalSystem {
  /** Bodenhöhe (setzt die Welt); ohne: flach auf der Höhe des Einschlags */
  ground: ((x: number, z: number) => number) | null = null;
  private slots: Slot[] = [];
  private base: Record<DecalKind, Texture> | null = null;
  private next = 0;

  constructor(private scene: Scene) {}

  private textures() {
    // erst beim ersten Einschlag malen (spart Startzeit)
    this.base ??= { crack: crackTex(), burn: burnTex(), frost: frostTex(), sigil: sigilTex() };
    return this.base;
  }

  private slot(): Slot {
    if (this.slots.length < MAX) {
      const geo = new PlaneGeometry(1, 1, GRID, GRID);
      const mat = new MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
      const mesh = new Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      mesh.userData.noOutline = true;
      mesh.visible = false;
      this.scene.add(mesh);
      const s: Slot = { mesh, mat, tex: {}, kind: 'crack', x: 0, y: 0, z: 0, size: 1, rot: 0, spin: 0, t: 0, life: 1, fade: 1, alpha: 1, held: false };
      this.slots.push(s);
      return s;
    }
    // ältestes freies (nicht festgehaltenes) Decal wiederverwenden
    for (let k = 0; k < MAX; k++) {
      const s = this.slots[(this.next + k) % MAX];
      if (!s.held) { this.next = (this.next + k + 1) % MAX; return s; }
    }
    return this.slots[0];
  }

  /** Decal setzen. color tönt (Siegel: Leuchtfarbe), life in Sekunden, fade = Ausblenddauer am Ende */
  spawn(kind: DecalKind, x: number, y: number, z: number, size: number, color: Color | string = '#ffffff', life = 6, fade = 2.5): DecalHandle {
    const tx = this.textures();
    const s = this.slot();
    s.kind = kind; s.x = x; s.y = y; s.z = z; s.size = size; s.rot = Math.random() * Math.PI * 2;
    s.spin = kind === 'sigil' ? 0.6 : 0; s.t = 0; s.life = life; s.fade = Math.min(fade, life); s.alpha = 1; s.held = false;
    // eigene Kopie je Platz (gleiche Bildquelle): Drehung des Siegels per Texturmatrix
    let t = s.tex[kind];
    if (!t) { t = tx[kind].clone(); t.center.set(0.5, 0.5); s.tex[kind] = t; }
    t.rotation = s.rot;
    s.mat.map = t;
    s.mat.color.set(color);
    s.mat.blending = kind === 'sigil' ? AdditiveBlending : NormalBlending;
    s.mat.opacity = 0;
    s.mat.needsUpdate = true;
    this.conform(s);
    s.mesh.visible = true;
    return s;
  }

  /** Festgehaltenes Decal verschieben (folgt z. B. der aufladenden Figur) */
  move(h: DecalHandle, x: number, y: number, z: number, size = h.size) {
    h.x = x; h.y = y; h.z = z; h.size = size;
    this.conform(h);
  }

  /** Decal halten (verblasst nicht von selbst) oder loslassen (blendet in `fade` Sekunden aus) */
  hold(h: DecalHandle, on: boolean, fade = 0.4) {
    h.held = on;
    if (!on) { h.fade = fade; h.life = h.t + fade; }
  }

  /** Eckpunkte auf das Gelände legen (leicht darüber, damit nichts flimmert) */
  private conform(s: Slot) {
    const pos = s.mesh.geometry.attributes.position as BufferAttribute;
    const n = GRID + 1;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const lx = (i / GRID - 0.5) * s.size, lz = (j / GRID - 0.5) * s.size;
      const wx = s.x + lx, wz = s.z + lz;
      const gy = this.ground ? this.ground(wx, wz) : NaN;
      pos.setXYZ(k, wx, (Number.isFinite(gy) ? gy : s.y) + 0.04, wz);
    }
    pos.needsUpdate = true;
    // Netz liegt in Weltkoordinaten; UV bleibt wie beim PlaneGeometry (Drehung über die Textur)
    const uv = s.mesh.geometry.attributes.uv as BufferAttribute;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) uv.setXY(j * n + i, i / GRID, 1 - j / GRID);
    uv.needsUpdate = true;
  }

  update(dt: number) {
    for (const s of this.slots) {
      if (!s.mesh.visible) continue;
      s.t += dt;
      if (!s.held && s.t >= s.life) { s.mesh.visible = false; continue; }
      const fadeIn = Math.min(1, s.t / 0.12);
      const fadeOut = s.held ? 1 : Math.min(1, (s.life - s.t) / Math.max(0.01, s.fade));
      s.mat.opacity = fadeIn * fadeOut * s.alpha;
      if (s.spin) { s.rot += s.spin * dt; s.tex[s.kind]!.rotation = s.rot; }
    }
  }

  dispose() {
    for (const s of this.slots) {
      s.mesh.removeFromParent();
      s.mesh.geometry.dispose();
      for (const t of Object.values(s.tex)) t?.dispose();
      s.mat.dispose();
    }
    this.slots = [];
  }
}
