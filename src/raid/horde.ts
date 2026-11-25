// Die Verbände der Verteidiger (Frontlinie der Massencrew): dichte Formationen schwächerer Soldaten, die als EINE Entität je Verband denken und
// als `InstancedMesh` (ein Zeichenaufruf je Truppentyp) gezeichnet werden – keine Figur und keine KI je Soldat. Sie benutzen dieselbe Simulation wie
// die eigenen Trupps (`TroopSquad`, entities/troops/squad.ts), stehen aber auf Posten (`hostile`), rücken erst vor, wenn jemand näher als der
// Aggro-Radius kommt, und kehren danach zurück. Alle Zähler (Köpfe, Verluste) laufen über die Entität, nie über Einzelfiguren.
import type { Scene } from 'three';
import { FACTIONS, type FactionId } from '../data/factions';
import { TroopSquad, type SoftBody, type TroopFoe, type TroopWorld } from '../entities/troops/squad';
import { TroopRenderer, type TroopPalette, type TroopView } from '../entities/troops/troopRender';
import { disposeObject } from '../render/dispose';
import type { RaidSquadDef } from './raidTypes';
import type { NavGrid } from '../ai/navGrid';

/** Herkunft eines Verbands: Viertel, Tor, Burghof oder vom Boss gerufene Verstärkung */
export type HordeOrigin = 'strand' | 'hafen' | 'markt' | 'aufstieg' | 'gate' | 'castle' | 'add' | 'ring1' | 'ring2' | 'thron';

export interface HordeMember {
  q: TroopSquad;
  origin: HordeOrigin;
  /** Wie viele Köpfe ursprünglich (ohne Skalierung durch Mitspieler) und wie viel Zählung schon gutgeschrieben wurde */
  base: number;
  credited: number;
  /** Anzeige-Daten für den Renderer */
  view: TroopView;
}

/** Uniform der Verteidiger aus den Daten der Macht (Rock, Hose, Kopfbedeckung, Zierfarbe) */
export function hordePalette(f: FactionId): TroopPalette {
  const u = FACTIONS[f].uniform, P = FACTIONS[f].palette;
  return { id: f, cloth: u.coatColor, pants: u.pantsColor, hat: u.hatColor, trim: P.accent };
}

/** Was der Verband von der Welt braucht: Boden, Begehbarkeitsnetz, Ziele und was ein Treffer bewirkt */
export interface HordeHost {
  ground: TroopWorld['ground'];
  nav(): NavGrid | null;
  /** Ziele: die Spielfigur und alles in `combat.allies` (Offiziere und Trupps) */
  targets(): readonly TroopFoe[];
  /** Treffer auf ein Ziel: Spielfigur (`player`) oder Crew */
  hit(target: TroopFoe, dmg: number, dirX: number, dirZ: number, heavy: boolean, from: TroopSquad): void;
  shot(x: number, y: number, z: number, tx: number, tz: number): void;
  text(x: number, y: number, z: number, t: string): void;
}

/** Schadensfaktor der Verteidiger gegen die Spielfigur und gegen Crew-Trupps (wirkt zusätzlich zu Stufe und Aura) */
export const HORDE_DMG = { player: 0.5, crew: 0.9 };

export class Horde {
  readonly members: HordeMember[] = [];
  /** Lebende und tote Verbände für das Kampfsystem (`CombatSystem.mass`): dieselbe Liste, jedes Bild aktuell gehalten */
  readonly squads: TroopSquad[] = [];
  private readonly renderer: TroopRenderer;
  private readonly views: TroopView[] = [];
  private readonly soft: SoftBody[] = [];
  private readonly world: TroopWorld;
  private readonly byId = new Map<string, TroopSquad>();
  private disposed = false;

  constructor(scene: Scene, palette: TroopPalette, private host: HordeHost, private level: number, private ownerId: string) {
    // Platz für 3 Typen × bis zu 300 Köpfe: Route B hält bis zu rund 180 Soldaten, dazu Verstärkung des Bosses
    this.renderer = new TroopRenderer(scene, true, { palette, cap: 330 });
    const h = host;
    this.world = {
      enemies: () => h.targets(),
      hit: (e, dmg, dx, dz, _col, heavy, src) => { void _col; const from = src ? this.byId.get(src) : undefined; if (from) h.hit(e, dmg, dx, dz, heavy, from); },
      ground: h.ground,
      nav: () => h.nav(),
      shot: (x, y, z, tx, tz) => h.shot(x, y, z, tx, tz),
      text: (x, y, z, t) => h.text(x, y, z, t),
    };
  }

  /** Verband aufstellen (Weltkoordinaten); `scale` vergrößert ihn für mehrere Spieler (jeder weitere 60 %) */
  spawn(def: RaidSquadDef, wx: number, wz: number, origin: HordeOrigin, scale = 1, aggro = 22): HordeMember {
    const heads = Math.max(3, Math.min(18, Math.round(def.heads * scale)));
    const q = new TroopSquad(def.typ, heads, this.level, this.ownerId);
    q.hostile = true;
    q.aggroR = aggro;
    q.commandState = 'halten';
    q.place(wx, wz, def.yaw, this.host.ground);
    const m: HordeMember = {
      q, origin, base: def.heads, credited: 0,
      view: { typ: q.typ, heads: q.heads, x: q.x, y: q.y, z: q.z, yaw: q.yaw, move: 0, pulse: 0, seed: q.seed, compact: 1 },
    };
    this.members.push(m);
    this.squads.push(q);
    this.views.push(m.view);
    this.byId.set(q.squadId, q);
    return m;
  }

  /** Köpfe, die seit dem letzten Aufruf gefallen sind, als Gutschrift auf die Zählung eines Viertels (anteilig: Skalierung wird ausgeglichen) */
  collectCredit(): { origin: HordeOrigin; n: number }[] {
    const out: { origin: HordeOrigin; n: number }[] = [];
    for (const m of this.members) {
      if (m.origin === 'add' || m.credited >= m.base) continue;
      const fallen = m.q.maxHeads - m.q.heads;
      // tot: der Rest wird gutgeschrieben; sonst anteilig
      const due = m.q.heads <= 0 ? m.base : Math.min(m.base, Math.floor((fallen / m.q.maxHeads) * m.base));
      const n = due - m.credited;
      if (n > 0) { m.credited = due; out.push({ origin: m.origin, n }); }
    }
    return out;
  }

  /** Lebende Köpfe */
  get heads(): number { let n = 0; for (const m of this.members) n += m.q.heads; return n; }
  get alive(): number { let n = 0; for (const m of this.members) if (m.q.alive) n++; return n; }
  /** Köpfe der noch lebenden Verstärkung (Boss-Aufgebot) */
  get addHeads(): number { let n = 0; for (const m of this.members) if (m.origin === 'add') n += m.q.heads; return n; }

  /** Ein Bild vorrücken: KI (gestaffelt), weiche Trennung, Darstellung */
  update(dt: number, t: number, ref: { x: number; z: number; yaw: number }, camX = 0, camZ = 0, far = 260) {
    if (this.disposed || !this.members.length) return;
    this.soft.length = 0;
    for (const m of this.members) if (m.q.alive) this.soft.push({ x: m.q.x, z: m.q.z, radius: m.q.sepRadius(), owner: m.q });
    for (const m of this.members) {
      const q = m.q, v = m.view;
      // weit von der Kamera: Verband ruht (kein Denken, keine Bewegung) – spart Zeit bei großen Inseln
      if (Math.hypot(q.x - camX, q.z - camZ) > far && !q.engaged) { v.move = 0; continue; }
      q.update(dt, ref, this.world, this.soft);
      for (const b of this.soft) if (b.owner === q) { b.x = q.x; b.z = q.z; }
      v.heads = q.heads; v.typ = q.typ; v.seed = q.seed; v.move = q.move; v.pulse = q.pulse;
      v.x = q.x; v.y = q.y; v.z = q.z; v.yaw = q.yaw; v.compact = q.squeeze;
      if (q.lostHeads > 0) { this.renderer.fall(v, q.lostHeads, q); q.lostHeads = 0; }
    }
    this.renderer.update(this.views, t, dt);
  }

  /** Alle entfernen (Verbände auf einen Schlag, z. B. bei Rückzug) */
  clear() {
    this.members.length = 0; this.squads.length = 0; this.views.length = 0; this.byId.clear();
    this.renderer.update([], 0, 0);
    this.renderer.clearCorpses();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.members.length = 0; this.squads.length = 0; this.views.length = 0;
    this.renderer.dispose();
    disposeObject(this.renderer.root);
  }
}
