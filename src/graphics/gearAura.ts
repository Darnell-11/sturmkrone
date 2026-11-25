// Phase 4.6G – Aura der Endgame-Ausrüstung: feine Teilchen an Schultern, Umhang-Saum, Krone und Klinge der Kaiser- und Endgame-Sets.
// Keine eigenen Netze und keine neuen Shader-Programme: jedes Teilchen läuft über die Instanz-Pools der AnimeVfxForge (Glut, Funken, Sterne),
// verankert an den Sockets der Figur bzw. an den Saum-Knochen der Umhang-Ketten. Stärke über die Einstellung „Ausrüstungs-Aura“
// (0 … 100 %, im Editor und in den Einstellungen regelbar), im Kampf stärker. Dazu der Glanz der Energie-Säume und Runen (toonShared.gearGlow).
import { Color, Vector3, type Object3D } from 'three';
import type { AnimeVfxForge } from './animeVfxForge';
import type { ResolvedLoadout } from '../data/equipment';
import type { CharacterSocketId } from '../data/characterRig';
import { CHAIN_LAYOUT } from '../data/characterRig';

export type AuraSpec = ResolvedLoadout['aura'][number];

/** Was die Aura von einer Figur braucht (Character erfüllt es) */
export interface AuraHost {
  readonly holder: Object3D;
  readonly rig: Object3D;
  readonly auraSpecs: readonly AuraSpec[];
  readonly charSockets: { get(id: CharacterSocketId): Object3D | null } | null;
}

/** Zahlen der Aura: Teilchen je Sekunde = rate × Stärke × (1 + Kampf × combatBoost); Glanz der Säume = (base + range × Stärke) × (1 + combat × Kampf) */
export const GEAR_AURA = { combatBoost: 0.9, glowBase: 0.35, glowRange: 0.65, glowCombat: 0.45, maxPerFrame: 3, standard: 0.7 } as const;

const _p = new Vector3(), _c = new Color();
const CAPE_COLS = CHAIN_LAYOUT.cape.columns, CAPE_LINKS = CHAIN_LAYOUT.cape.links;

export class GearAura {
  /** Einstellung „Ausrüstungs-Aura“ (0 … 1) */
  level: number = GEAR_AURA.standard;
  /** ausgestoßene Teilchen (Prüfungen) */
  emitted = 0;
  private acc: number[] = [];
  /** Farben je Aura-Teil (einmal je Ausrüstungswechsel umgerechnet – je Teilchen nichts Neues) */
  private cols: [Color, Color][] = [];
  private specs: readonly AuraSpec[] = [];
  private hem: Object3D[] = [];
  private hemRig: Object3D | null = null;
  private side = 1;

  /** Leuchtkraft der Energie-Säume und Runen für Einstellung und Kampf (für toonShared.gearGlow) */
  static glowFor(level: number, combat: number): number {
    const l = Math.max(0, Math.min(1, level)), c = Math.max(0, Math.min(1, combat));
    return (GEAR_AURA.glowBase + GEAR_AURA.glowRange * l) * (1 + GEAR_AURA.glowCombat * c);
  }

  /** Teilchen für eine Figur ausstoßen (Echtzeit je Bild). combat 0 … 1 (Kampfnähe). Ohne Effekt-Schmiede oder Aura-Teile: nichts. */
  update(dt: number, ch: AuraHost | null, vfx: AnimeVfxForge | null, combat = 0) {
    if (!ch || !vfx || !(dt > 0)) return;
    const specs = ch.auraSpecs;
    if (specs !== this.specs) {
      this.specs = specs;
      this.acc = specs.map((_, i) => (i * 0.37) % 1);
      this.cols = specs.map((s) => [new Color(s.color), new Color(s.color2)]);
    }
    if (!specs.length || this.level <= 0.001 || !ch.holder.visible) return;
    const k = this.level * (1 + GEAR_AURA.combatBoost * Math.max(0, Math.min(1, combat)));
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      this.acc[i] += s.rate * k * Math.min(dt, 0.1);
      let n = 0;
      while (this.acc[i] >= 1 && n < GEAR_AURA.maxPerFrame) { this.acc[i] -= 1; n++; this.emit(s, this.cols[i], ch, vfx); }
      if (this.acc[i] > 2) this.acc[i] = 0;
    }
  }

  private emit(s: AuraSpec, col: [Color, Color], ch: AuraHost, vfx: AnimeVfxForge) {
    if (!this.where(s.at, ch, _p)) return;
    _c.copy(Math.random() < 0.7 ? col[0] : col[1]);
    switch (s.kind) {
      // Glut: steigt langsam auf, flackert
      case 'glut': vfx.burst('ember', _p.x, _p.y, _p.z, 1, 0.3, _c, { up: 0.55, size: 0.06, life: 0.9 + Math.random() * 0.6, spread: 0.05, grav: -0.9 }); break;
      // Funken: kurze, helle Striche, fallen leicht
      case 'funken': vfx.burst('spark', _p.x, _p.y, _p.z, 1, 0.7, _c, { up: 0.5, size: 0.045, life: 0.32 + Math.random() * 0.2, spread: 0.04, grav: 1.2 }); break;
      // Sterne: schweben fast still und verglimmen
      case 'sterne': vfx.burst('spark', _p.x, _p.y, _p.z, 1, 0.12, _c, { up: 0.12, size: 0.075, life: 1.1 + Math.random() * 0.6, spread: 0.07, grav: -0.15 }); break;
    }
    this.emitted++;
  }

  /** Ausstoßort in Welt (false = Figur hat diesen Ort nicht) */
  private where(at: AuraSpec['at'], ch: AuraHost, out: Vector3): boolean {
    const so = ch.charSockets;
    switch (at) {
      case 'schultern': {
        const n = so?.get('shouldersCoat');
        if (!n) return false;
        // abwechselnd links und rechts über der Schulterkuppe
        this.side = -this.side;
        n.localToWorld(out.set(this.side * (0.13 + Math.random() * 0.06), -0.01 + Math.random() * 0.03, -0.02 + Math.random() * 0.05));
        return true;
      }
      case 'krone': {
        const n = so?.get('headTop');
        if (!n) return false;
        const a = Math.random() * Math.PI * 2, r = 0.05 + Math.random() * 0.05;
        n.localToWorld(out.set(Math.sin(a) * r, 0.01 + Math.random() * 0.04, Math.cos(a) * r));
        return true;
      }
      case 'waffe': {
        const n = so?.get('handMain');
        if (!n) return false;
        // entlang der Klinge (+Y aus der Faust)
        n.localToWorld(out.set(0, 0.15 + Math.random() * 0.6, 0));
        return true;
      }
      case 'umhang': {
        // Saum der Umhang-Ketten (letztes Glied jeder Bahn); ohne Umhang: unter den Schultern am Rücken
        if (this.hemRig !== ch.rig) {
          this.hemRig = ch.rig;
          this.hem = [];
          for (let c = 0; c < CAPE_COLS; c++) { const b = ch.rig.getObjectByName(`K_cape_${c}_${CAPE_LINKS}`); if (b) this.hem.push(b); }
        }
        if (this.hem.length) {
          const b = this.hem[Math.floor(Math.random() * this.hem.length)];
          b.updateWorldMatrix(true, false);
          out.setFromMatrixPosition(b.matrixWorld);
          out.y += 0.03 + Math.random() * 0.1;
          return true;
        }
        const n = so?.get('backWeapon');
        if (!n) return false;
        n.localToWorld(out.set((Math.random() - 0.5) * 0.3, -0.2 - Math.random() * 0.4, -0.04));
        return true;
      }
    }
    return false;
  }
}
