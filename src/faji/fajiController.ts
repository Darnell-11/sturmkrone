import { Vector3, type Scene } from 'three';
import type { CombatSystem } from '../combat/combat';
import type { CombatFx } from '../combat/fx';
import type { Input } from '../core/input/input';
import type { SkillState } from '../core/save/types';
import type { StyleId } from '../data/animations';
import { computePassives, SK, type ActiveDef, type Passives, type SynergyDef } from '../data/skills';
import type { Character } from '../entities/character/character';
import type { PlayerFoot } from '../entities/player/playerFoot';
import type { CombatOverlay } from '../ui/combatOverlay';
import type { IslandGround } from '../world/islandGround';
import type { ParticleSystem } from '../world/particles';
import { AbilityRunner, castClip } from './abilities';

interface Buff { b: NonNullable<ActiveDef['buff']>; t: number }

export interface SlotView { id: string | null; name: string; color: string; cdFrac: number; ready: boolean; cost: number }

/** Faji-Energie, Fähigkeitsplätze, Abklingzeiten, Stärkungen und passive Boni der Spielfigur. */
export class FajiController {
  faji = 100;
  maxFaji = 100;
  passives: Passives;
  synergies: SynergyDef[] = [];
  private cds: Record<string, number> = {};
  private buffs: Buff[] = [];
  private runner: AbilityRunner;
  private level = 1;
  private giant = 1;

  constructor(
    private skills: SkillState,
    private foot: PlayerFoot,
    private char: Character,
    private combat: CombatSystem,
    fx: CombatFx,
    particles: ParticleSystem,
    scene: Scene,
    ground: IslandGround,
    private overlay: CombatOverlay,
    private shake: (a: number) => void,
    private hitstop: (t: number) => void,
  ) {
    this.passives = computePassives(skills.learned).p;
    this.runner = new AbilityRunner({
      scene, fx, particles,
      caster: foot,
      moveCaster: (x, z, yaw) => {
        const c = ground.constrain(x, z);
        foot.x = c.x; foot.z = c.z;
        if (yaw !== undefined) foot.yaw = yaw;
      },
      targets: () => combat.abilityTargets(),
      ground: (x, z) => { const h = ground.height(x, z); return Number.isFinite(h) ? h : 0; },
      power: combat.atk,
      shake: (a) => this.shake(a),
      hitstop: (t) => this.hitstop(t),
      cutin: (t, c) => overlay.showCutin(t, c),
      speedlines: (s) => overlay.speedlines(s),
      buff: (b, dur) => this.buffs.push({ b, t: dur }),
      heal: (f) => { foot.hp = Math.min(foot.maxHp, foot.hp + foot.maxHp * f); overlay.number(new Vector3(foot.x, foot.y + 2, foot.z), `+${Math.round(foot.maxHp * f)}`, 'heal'); },
    });
  }

  /** Nach Lernen, Stufenaufstieg oder Stilwechsel aufrufen */
  refresh(level: number, style: StyleId) {
    this.level = level;
    const r = computePassives(this.skills.learned);
    this.passives = r.p;
    this.synergies = r.synergies;
    this.maxFaji = 100 + r.p.fajiMax;
    this.faji = Math.min(this.faji, this.maxFaji);
    this.applyMods(style);
  }

  private has(e: SynergyDef['effect']) { return this.synergies.some((s) => s.effect === e); }

  private applyMods(style: StyleId) {
    const p = this.passives;
    const buff = this.buffs.reduce((acc, b) => {
      for (const [k, v] of Object.entries(b.b)) if (typeof v === 'number') (acc as any)[k] = ((acc as any)[k] ?? 0) + v;
      if (b.b.invuln) acc.invuln = true;
      if (b.b.giant) acc.giant = true;
      return acc;
    }, {} as Partial<Passives> & { invuln?: boolean; giant?: boolean });
    const f = this.foot;
    const fist = style === 'faust';
    f.dmgMult = (1 + p.dmgAll + (buff.dmgAll ?? 0)) * (fist ? 1 + p.dmgFist : style === 'effekt' ? 1 + p.dmgSkill * 0.5 : 1 + p.dmgBlade);
    f.reduce = p.reduce + (buff.reduce ?? 0);
    f.dodgeChance = p.dodge;
    f.speedMult = 1 + p.speed;
    f.invuln = !!buff.invuln;
    f.parryBonus = p.riposte;
    f.secondWind = p.secondWind;
    const c = this.combat;
    c.critChance = 0.1 + p.crit;
    c.mods.critMult = 1.6 + (this.has('shadowCrit') ? 0.4 : 0);
    c.mods.lifesteal = p.lifesteal * (this.has('lightLeech') ? 2 : 1);
    c.mods.burnOnHit = this.has('burnBlade');
    c.mods.frostParry = this.has('frostParry');
    c.mods.fearWeak = p.fearWeak;
    c.mods.playerLevel = this.level;
    c.mods.skillMult = 1 + p.dmgSkill;
    this.giant = buff.giant ? 1.45 : 1;
  }

  /** Ansicht der drei Plätze für HUD und Touch-Buttons */
  slots(): SlotView[] {
    return [0, 1, 2].map((i) => {
      const id = this.skills.slots[i] ?? null;
      const s = id ? SK[id] : null;
      if (!s?.act || !(this.skills.learned[s.id] > 0)) return { id: null, name: 'Leer', color: '#888', cdFrac: 1, ready: false, cost: 0 };
      const max = s.act.cd * (1 - this.passives.cdr);
      const cd = this.cds[s.id] ?? 0;
      return { id: s.id, name: s.n, color: BRANCH_COLOR[s.b], cdFrac: 1 - cd / max, ready: cd <= 0 && this.faji >= s.act.cost, cost: s.act.cost };
    });
  }

  update(dt: number, input: Input, style: StyleId, lockYaw: number | null) {
    // Energie, Abklingzeiten, Stärkungen
    this.faji = Math.min(this.maxFaji, this.faji + dt * (6 + this.level * 0.25) * (1 + this.passives.fajiRegen));
    for (const k of Object.keys(this.cds)) { this.cds[k] -= dt; if (this.cds[k] <= 0) delete this.cds[k]; }
    for (const b of this.buffs) b.t -= dt;
    const before = this.buffs.length;
    this.buffs = this.buffs.filter((b) => b.t > 0);
    if (before !== this.buffs.length || this.buffs.length) this.applyMods(style);
    const s = this.char.holder.scale.x;
    this.char.holder.scale.setScalar(s + (this.giant - s) * Math.min(1, dt * 6));
    this.runner.update(dt);

    const slotAction = (['skill1', 'skill2', 'skill3'] as const).findIndex((a) => input.pressed(a));
    if (slotAction >= 0) this.use(slotAction, lockYaw);
  }

  /** Fähigkeit aus Platz i einsetzen */
  use(i: number, lockYaw: number | null) {
    const id = this.skills.slots[i];
    const s = id ? SK[id] : null;
    if (!s?.act) { this.overlay.number(new Vector3(this.foot.x, this.foot.y + 2, this.foot.z), 'Kein Faji im Platz – öffne den Faji-Baum', 'info'); return; }
    if (!this.foot.canCast) return;
    if ((this.cds[s.id] ?? 0) > 0) return;
    if (this.faji < s.act.cost) { this.overlay.number(new Vector3(this.foot.x, this.foot.y + 2, this.foot.z), 'Zu wenig Faji', 'info'); return; }
    this.faji -= s.act.cost;
    this.cds[s.id] = s.act.cd * (1 - this.passives.cdr);
    const anim = castClip(s);
    this.foot.cast(anim.clip, anim.speed, lockYaw);
    this.runner.ctx.power = this.combat.atk;
    this.runner.cast(s, this.skills.learned[s.id] ?? 1);
  }
}

const BRANCH_COLOR: Record<string, string> = { koerper: '#FF8A3A', klinge: '#9FD8FF', effekt: '#C77DFF', geist: '#FFD166' };
