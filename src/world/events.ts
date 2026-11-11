import type { CombatSystem } from '../combat/combat';
import { ENEMIES, type EnemyKind } from '../data/combat';
import { rollEventLoot, type LootDrop } from '../data/loot';
import type { Faction } from '../core/save/types';
import { coastK, type WalkIsland } from './islandGround';

/**
 * Zufällige Zonen-Ereignisse auf Inseln, auf denen sonst Ruhe herrscht: Landungen am Strand (zwei Wellen) und
 * Elite-Jäger. Sie laufen nur, solange du zu Fuß auf einer Insel ohne Lager bist; wer die Insel verlässt, beendet sie.
 * Die Gegner gehören nicht zum Lager (Enemy.tag), „Insel befreit“ und die Lagerbelohnung bleiben also unberührt.
 */
export type EventKind = 'invasion' | 'elite';

export interface EventHooks {
  banner(title: string, sub: string): void;
  cutin(text: string, color: string): void;
  message(text: string): void;
  gold(n: number): void;
  /** Beute-Säule an einer Stelle (Höhe setzt die Welt) */
  drop(x: number, z: number, d: LootDrop): void;
}

export interface EventCtx {
  /** Darf gerade ein Ereignis laufen? (zu Fuß, lebendig, Insel ohne Lager-Gegner, kein Boss/Ruine, Stufe ≥ 2) */
  allowed: boolean;
  combat: CombatSystem;
  isl: WalkIsland | null;
  level: number;
  faction: Faction;
  px: number;
  pz: number;
}

/** Abstände und Gewichte: alles Balancing an einer Stelle */
export const EVENT = {
  /** Sekunden bis zum ersten Ereignis nach dem Landgang, danach zwischen zwei Ereignissen (min, Streuung) */
  first: 50,
  gap: [110, 90] as [number, number],
  invasionWeight: 0.6,
  waves: 2,
  /** Pause zwischen Ankündigung und Auftauchen, zwischen den Wellen */
  warn: 3,
  waveGap: 2.6,
  /** Gewünschter Abstand des Landungspunkts zum Spieler (m) */
  landing: 70,
  /** Mindeststufe des Spielers */
  minLevel: 2,
};

interface Run { kind: EventKind; tag: string; stage: 'warn' | 'fight' | 'gap'; t: number; wave: number; isl: WalkIsland }

let counter = 0;

/** Gegnerarten je Spielerstufe (wie die Lager) */
function pool(level: number): EnemyKind[] {
  if (level < 4) return ['matrose', 'matrose', 'musketier', 'schildtraeger'];
  if (level < 9) return ['matrose', 'schildtraeger', 'musketier', 'schlaeger', 'fajiwirker'];
  return ['matrose', 'schildtraeger', 'musketier', 'schlaeger', 'fajiwirker', 'hauptmann'];
}

export class WorldEvents {
  private timer: number = EVENT.first;
  private run: Run | null = null;

  constructor(private hooks: EventHooks) {}

  get active() { return this.run !== null; }
  get kind(): EventKind | null { return this.run?.kind ?? null; }

  /** Ereignis beenden (Insel verlassen, K.O.); die nächste Pause beginnt neu */
  cancel() {
    this.run = null;
    this.timer = Math.max(this.timer, 40);
  }

  update(dt: number, c: EventCtx) {
    const r = this.run;
    if (r) {
      if (!c.allowed || !c.isl || c.isl !== r.isl) { this.cancel(); return; }
      this.step(dt, c, r);
      return;
    }
    if (!c.allowed || !c.isl) return;
    this.timer -= dt;
    if (this.timer <= 0) this.start(c, c.isl);
  }

  private start(c: EventCtx, isl: WalkIsland) {
    const kind: EventKind = Math.random() < EVENT.invasionWeight ? 'invasion' : 'elite';
    c.combat.beginEvent(isl);
    this.run = { kind, tag: `ev${++counter}`, stage: 'warn', t: EVENT.warn, wave: 0, isl };
    if (kind === 'invasion') {
      const label = c.faction === 'pirat' ? 'Marine-Landung!' : 'Piraten-Invasion!';
      this.hooks.cutin(label, '#E0453A');
      this.hooks.banner(label, 'Feindliche Boote landen am Strand');
      this.hooks.message('Verteidige die Insel!');
    } else {
      this.hooks.cutin('Elite-Jäger!', '#E8A82A');
      this.hooks.banner('Elite-Jäger gesichtet!', 'Ein gefährlicher Gegner sucht dich');
      this.hooks.message('Ein Elite-Jäger ist hinter dir her!');
    }
  }

  private step(dt: number, c: EventCtx, r: Run) {
    const left = c.combat.tagLeft(r.tag);
    r.t -= dt;
    if (r.stage === 'warn' && r.t <= 0) { this.spawn(c, r); r.stage = 'fight'; return; }
    if (r.stage === 'gap' && r.t <= 0) { this.spawn(c, r); r.stage = 'fight'; return; }
    if (r.stage !== 'fight') return;
    if (r.kind === 'invasion') {
      if (r.wave < EVENT.waves && left <= 1) { r.stage = 'gap'; r.t = EVENT.waveGap; this.hooks.message('Eine zweite Welle landet!'); return; }
      if (r.wave >= EVENT.waves && left === 0) this.finish(c, r);
    } else if (left === 0) this.finish(c, r);
  }

  private spawn(c: EventCtx, r: Run) {
    const isl = r.isl;
    r.wave++;
    if (r.kind === 'invasion') {
      const n = Math.min(6, 3 + Math.floor(c.level / 5));
      const p = pool(c.level);
      const kinds: EnemyKind[] = Array.from({ length: n }, () => p[Math.floor(Math.random() * p.length)]);
      // Strand: ein Küstenpunkt der Insel, der etwa 70 m vom Spieler liegt (auf großen Inseln nicht am anderen Ende)
      let best = { x: isl.x, z: isl.z, score: Infinity };
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2;
        const edge = isl.r * coastK(isl.coast, a) * 0.93;
        const x = isl.x + Math.cos(a) * edge, z = isl.z + Math.sin(a) * edge;
        const score = Math.abs(Math.hypot(x - c.px, z - c.pz) - EVENT.landing);
        if (score < best.score) best = { x, z, score };
      }
      c.combat.spawnWave(kinds, c.level, enemyFaction(c.faction), r.tag, best, 3);
    } else {
      // Elite-Jäger mit zwei Begleitern, 22 bis 30 m vom Spieler entfernt (landeinwärts, falls möglich)
      const a = Math.atan2(c.pz - isl.z, c.px - isl.x) + Math.PI + (Math.random() - 0.5) * 1.2;
      const d = 22 + Math.random() * 8;
      const at = { x: c.px + Math.cos(a) * d, z: c.pz + Math.sin(a) * d };
      const e = c.combat.spawnWave(['hauptmann', 'matrose', 'schildtraeger'], c.level + 1, enemyFaction(c.faction), r.tag, at, 2.5);
      const boss = e[0];
      if (boss) boss.becomeAlert();
    }
  }

  private finish(c: EventCtx, r: Run) {
    const inv = r.kind === 'invasion';
    const gold = Math.round(c.level * (inv ? 35 : 55));
    this.hooks.gold(gold);
    this.hooks.banner(inv ? 'Strand verteidigt!' : 'Elite-Jäger besiegt!', `+${gold} Gold · Beute wartet`);
    const loot = rollEventLoot({ level: c.level, gold: ENEMIES.hauptmann.gold }, inv ? 2 : 3);
    for (const d of loot) this.hooks.drop(c.px + (Math.random() - 0.5) * 3, c.pz + (Math.random() - 0.5) * 3, d);
    this.run = null;
    this.timer = EVENT.gap[0] + Math.random() * EVENT.gap[1];
  }
}

/** Die Gegner sind immer die Gegenseite des Spielers */
function enemyFaction(f: Faction): Faction { return f === 'pirat' ? 'marine' : 'pirat'; }
