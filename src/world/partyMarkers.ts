// Phase 4.9 – Gruppenmitglieder in der Welt: pulsierender smaragdgrüner Ring auf Boden bzw. Wasser und die Ansichten (Lage über Kopf bzw. Mast,
// Name, Stufe, Rolle, Emblem) für die Namensschilder (`ui/partyPlates.ts`). Liest nur die Mitspieler-Darstellung (`MmoLive`) und die Gruppe
// des Clients; je Bild entsteht nichts Neues (vier Ringe und vier Ansichten vorab). Die Ringe nutzen dieselben Material-Werte wie der Zielring
// und die Breitseiten-Ringe: gleiches Shader-Programm, kein neues.
import { BufferAttribute, BufferGeometry, Color, CustomBlending, DoubleSide, Mesh, MeshBasicMaterial, OneFactor, OneMinusSrcAlphaFactor, SrcAlphaFactor, ZeroFactor, type Scene } from 'three';
import { markShared } from '../render/dispose';
import { PARTY_COLORS, PARTY_MARK, partyEmblem, partyRingRadius, plateLine } from '../data/partyMarks';
import type { MmoLive } from './mmoLive';

export interface PartyMarkHost {
  live(): MmoLive | null;
  waterY(x: number, z: number): number;
  /** Ort der Kamera (Entfernung der Schilder) */
  camPos(out: { x: number; y: number; z: number }): void;
}

/** Ansicht eines markierten Mitglieds (vorab angelegt, je Bild aufgefrischt) */
export interface PartyMarkView {
  id: string;
  name: string;
  /** „Stufe 12 · Kombo-DPS“ */
  line: string;
  emblem: string;
  /** Anker des Schilds in Weltkoordinaten (über dem Kopf bzw. dem Masttopp) */
  x: number; y: number; z: number;
  /** Entfernung zur Kamera (m) */
  dist: number;
  dom: 'land' | 'deck' | 'sea';
  /** Stand von Stufe und Rolle, aus dem `line` entstand (der Text entsteht nur bei Änderungen neu) */
  lvl: number;
  role: string;
}

/** Doppelring flach in der XZ-Ebene: breites Band (0,88 … 1) und schmaler Innenring (0,7 … 0,74); nur Lage (gleiches Programm wie der Zielring) */
function ringGeometry(): BufferGeometry {
  const seg = 72, pos: number[] = [], idx: number[] = [];
  const band = (r0: number, r1: number) => {
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(c * r0, 0, s * r0, c * r1, 0, s * r1);
      if (i < seg) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  };
  band(0.88, 1);
  band(0.7, 0.74);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const _cam = { x: 0, y: 0, z: 0 };

export class PartyMarkers {
  readonly views: PartyMarkView[] = [];
  /** gültige Ansichten in `views` (die übrigen sind frei) */
  count = 0;
  private readonly rings: Mesh[] = [];
  private readonly mats: MeshBasicMaterial[] = [];
  private t = 0;
  /** Zahlen für Prüfungen */
  readonly stats = { rings: 0, plates: 0 };

  constructor(scene: Scene, private readonly host: PartyMarkHost) {
    const geo = markShared(ringGeometry());
    const col = new Color(PARTY_COLORS.emerald);
    for (let i = 0; i < PARTY_MARK.max; i++) {
      // dieselben Werte wie Ziel- und Breitseiten-Ring: gleiches Programm; je Ring ein eigenes Material nur für die eigene Deckkraft
      const mat = new MeshBasicMaterial({
        color: col, transparent: true, opacity: PARTY_MARK.opacity, depthWrite: false, side: DoubleSide, fog: false,
        blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
      });
      const ring = new Mesh(geo, mat);
      ring.visible = false;
      ring.renderOrder = 4;
      ring.frustumCulled = false;
      ring.name = 'gruppenring';
      scene.add(ring);
      this.rings.push(ring);
      this.mats.push(mat);
      this.views.push({ id: '', name: '', line: '', emblem: '', x: 0, y: 0, z: 0, dist: 0, dom: 'land', lvl: -1, role: '' });
    }
  }

  /** Je gezeichnetem Bild (Echtzeit): Ringe setzen, Ansichten für die Schilder auffrischen */
  render(frameDt: number, hidden: boolean) {
    this.t += frameDt;
    this.count = 0;
    const live = this.host.live();
    const c = live?.client, party = c?.party;
    if (!hidden && live && c && party) {
      this.host.camPos(_cam);
      for (const m of party.members) {
        if (m.id === c.id || this.count >= PARTY_MARK.max) continue;
        const r = c.remotes.get(m.id);
        if (!r || !r.live) continue;
        const v = this.views[this.count], ring = this.rings[this.count], mat = this.mats[this.count];
        let rx = 0, ry = 0, rz = 0, rad = 0;
        if (r.last.ride || r.last.dom === 'land') {
          const ch = live.rigOf(m.id);
          if (!ch || !ch.holder.visible) continue;
          const p = ch.holder.position;
          rx = p.x; ry = p.y + PARTY_MARK.liftLand; rz = p.z; rad = partyRingRadius(false, 0);
          v.x = p.x; v.y = p.y + PARTY_MARK.plateLand * (ch.holder.scale.y || 1); v.z = p.z;
          v.dom = r.last.ride ? 'deck' : 'land';
        } else {
          const e = live.shipOf(m.id);
          if (!e || !e.ship.model.group.visible) continue;
          const sh = e.ship, g = sh.model.group.position;
          rx = g.x; rz = g.z; ry = this.host.waterY(g.x, g.z) + PARTY_MARK.liftSea; rad = partyRingRadius(true, sh.cls.L);
          v.x = g.x; v.y = g.y + sh.model.deckY + sh.cls.mh + PARTY_MARK.plateMast; v.z = g.z;
          v.dom = 'sea';
        }
        const ph = this.t * PARTY_MARK.pulseW + this.count * 1.3;
        ring.position.set(rx, ry, rz);
        ring.scale.setScalar(rad * (1 + Math.sin(ph) * PARTY_MARK.pulseScale));
        ring.rotation.y = this.t * 0.3;
        mat.opacity = PARTY_MARK.opacity + Math.sin(ph) * PARTY_MARK.opacityAmp;
        ring.visible = true;
        v.id = m.id;
        if (v.name !== m.name) v.name = m.name;
        if (v.lvl !== m.level || v.role !== m.role) { v.lvl = m.level; v.role = m.role; v.line = plateLine(m.level, m.role); }
        const em = partyEmblem(m.spec, r.profile.base);
        if (v.emblem !== em) v.emblem = em;
        v.dist = Math.hypot(v.x - _cam.x, v.y - _cam.y, v.z - _cam.z);
        this.count++;
      }
    }
    for (let i = this.count; i < this.rings.length; i++) this.rings[i].visible = false;
    this.stats.rings = this.count;
  }

  dispose() {
    for (const r of this.rings) r.removeFromParent();
    for (const m of this.mats) m.dispose();
    this.rings.length = 0;
    this.mats.length = 0;
    this.count = 0;
  }
}
