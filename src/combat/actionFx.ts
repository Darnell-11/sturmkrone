// Effekte der Action-Kampf-Engine (4.6A): Blitz-Nachbilder (Sturm-Schritt, Rotations-Dash, Nachbild-Fäuste) und Leuchtstreifen entlang eines
// Vorstoßes. Feste Pools: alle Sprites, Netze und Materialien entstehen einmal beim Start und werden reihum wiederverwendet – keine
// Speicheranforderung im Kampf, ein Material je Platz (Farbe und Deckkraft je Nachbild).
import { AdditiveBlending, CanvasTexture, CylinderGeometry, Mesh, MeshBasicMaterial, Sprite, SpriteMaterial, Vector3, type Scene } from 'three';
import { markShared } from '../render/dispose';

/** Silhouette einer Figur im Sprung-Schritt als weiches Leuchtbild (für die Nachbilder) */
function ghostTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.filter = 'blur(3px)';
  g.fillStyle = '#ffffff';
  // Kopf, Rumpf, Arme, Beine – grob, das Nachbild lebt nur Sekundenbruchteile
  g.beginPath(); g.arc(32, 18, 9, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(20, 30); g.lineTo(44, 30); g.lineTo(40, 70); g.lineTo(24, 70); g.closePath(); g.fill();
  g.lineCap = 'round'; g.strokeStyle = '#ffffff';
  g.lineWidth = 7; g.beginPath(); g.moveTo(22, 34); g.lineTo(10, 58); g.moveTo(42, 34); g.lineTo(55, 54); g.stroke();
  g.lineWidth = 9; g.beginPath(); g.moveTo(27, 70); g.lineTo(20, 120); g.moveTo(37, 70); g.lineTo(46, 118); g.stroke();
  const t = new CanvasTexture(c);
  return markShared(t);
}

interface Ghost { s: Sprite; mat: SpriteMaterial; life: number; max: number; k: number }
interface Streak { m: Mesh; mat: MeshBasicMaterial; life: number; max: number }

const UP = new Vector3(0, 1, 0);
const _d = new Vector3();

export class ActionFx {
  private readonly ghosts: Ghost[] = [];
  private readonly streaks: Streak[] = [];
  private gi = 0;
  private si = 0;
  /** Menge nach Grafikstufe (Handy: weniger Nachbilder) */
  scale = 1;

  constructor(private scene: Scene) {
    const tex = ghostTexture();
    for (let i = 0; i < 14; i++) {
      const mat = new SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false });
      const s = new Sprite(mat);
      s.visible = false;
      s.renderOrder = 8;
      s.userData.noOutline = true;
      scene.add(s);
      this.ghosts.push({ s, mat, life: 0, max: 1, k: 1 });
    }
    const geo = markShared(new CylinderGeometry(1, 1, 1, 8, 1, true));
    for (let i = 0; i < 6; i++) {
      const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false });
      const m = new Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 8;
      m.frustumCulled = false;
      m.userData.noOutline = true;
      scene.add(m);
      this.streaks.push({ m, mat, life: 0, max: 1 });
    }
  }

  /** Blitz-Nachbild an einer Stelle (Figur steht dort mit den Füßen auf `y`) */
  afterimage(x: number, y: number, z: number, color: string, life = 0.36, size = 1) {
    if (this.scale < 0.5 && (this.gi & 1)) { this.gi++; return; }
    const g = this.ghosts[this.gi++ % this.ghosts.length];
    g.life = g.max = life;
    g.k = size;
    g.mat.color.set(color).multiplyScalar(1.6);
    g.mat.opacity = 0.85;
    g.s.position.set(x, y + 0.95 * size, z);
    g.s.scale.set(0.95 * size, 1.9 * size, 1);
    g.s.visible = true;
  }

  /** Leuchtstreifen von A nach B (Zieh-Schnitt, Sturm-Schritt) */
  streak(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, width = 0.14, life = 0.3) {
    _d.set(x1 - x0, y1 - y0, z1 - z0);
    const len = _d.length();
    if (len < 0.3) return;
    const st = this.streaks[this.si++ % this.streaks.length];
    st.life = st.max = life;
    st.mat.color.set(color).multiplyScalar(2.2);
    st.mat.opacity = 0.9;
    st.m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    st.m.quaternion.setFromUnitVectors(UP, _d.multiplyScalar(1 / len));
    st.m.scale.set(width, len, width);
    st.m.visible = true;
  }

  update(dt: number) {
    for (const g of this.ghosts) {
      if (!g.s.visible) continue;
      g.life -= dt;
      if (g.life <= 0) { g.s.visible = false; continue; }
      const k = g.life / g.max;
      g.mat.opacity = 0.85 * k * k;
      g.s.scale.set(0.95 * g.k * (1 + (1 - k) * 0.25), 1.9 * g.k * (1 + (1 - k) * 0.08), 1);
    }
    for (const s of this.streaks) {
      if (!s.m.visible) continue;
      s.life -= dt;
      if (s.life <= 0) { s.m.visible = false; continue; }
      const k = s.life / s.max;
      s.mat.opacity = 0.9 * k;
      s.m.scale.x = s.m.scale.z = Math.max(0.02, s.m.scale.x * (0.86 + 0.1 * k));
    }
  }

  dispose() {
    for (const g of this.ghosts) { g.s.removeFromParent(); g.mat.dispose(); }
    for (const s of this.streaks) { s.m.removeFromParent(); s.mat.dispose(); }
    this.ghosts.length = 0;
    this.streaks.length = 0;
    void this.scene;
  }
}
