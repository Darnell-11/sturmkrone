import { action, BT, cond, selector, sequence, tracked, type BtNode } from './behaviorTree';
import type { NavGrid } from './navGrid';
import type { Enemy, EnemyWorld } from '../entities/enemy';

/** Was der Baum je Logikschritt über die Lage weiß (ein Objekt für alle Gegner, wird nur neu befüllt) */
export interface BrainCtx {
  w: EnemyWorld;
  nav: NavGrid | null;
  dt: number;
  /** Ziel (Spielfigur oder Crew) */
  tx: number;
  tz: number;
  /** Blickrichtung des Ziels, falls bekannt (NaN sonst) */
  tYaw: number;
  dist: number;
  /** Richtung zum Ziel (atan2(dx, dz)) */
  toT: number;
  /** freie Sichtlinie zum Ziel */
  los: boolean;
}

/** Wahrnehmung: Sichtkegel 2 × 65°, Sichtweite 26 m, Hören im Umkreis von 6 m, Sichtlinie über das NavMesh; Ziel verloren ab 70 m oder nach 8 s ohne Sicht */
export const SENSE = { sight: 26, cone: 1.13, hear: 6, near: 4.5, lose: 70 };

/** Verdacht und Alarm aktualisieren (vor dem Baum) */
export function perceive(e: Enemy, c: BrainCtx) {
  const w = c.w;
  if (!w.playerActive || !w.playerPos) {
    e.suspicion = Math.max(0, e.suspicion - c.dt * 0.3);
    return;
  }
  const facing = Math.abs(angDiff(c.toT, e.yaw));
  const seen = c.los && c.dist < SENSE.sight && (facing < SENSE.cone || c.dist < SENSE.near);
  let gain = 0;
  if (seen) gain = c.dist < 8 ? 2.6 : 0.3 + 1.4 * (1 - c.dist / SENSE.sight);
  if (c.dist < SENSE.hear) gain = Math.max(gain, 1.3);
  if (seen || c.dist < SENSE.hear) { e.lkX = c.tx; e.lkZ = c.tz; e.unseenT = 0; } else e.unseenT += c.dt;
  if (e.aggro) {
    // Ziel verloren: zu weit weg oder lange nicht gesehen → Spur suchen
    if (c.dist > SENSE.lose || (e.unseenT > 8 && c.dist > 22)) { e.aggro = false; e.suspicion = 0.7; }
    return;
  }
  if (gain > 0) e.suspicion += gain * c.dt;
  else e.suspicion = Math.max(0, e.suspicion - c.dt * 0.12);
  if (e.suspicion >= 1) e.becomeAlert();
}

export function angDiff(a: number, b: number) {
  return ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

// ---------- Blätter ----------

/** Furcht (Geistiges Faji): weg vom Ziel */
const flee = action<Enemy, BrainCtx>('Flucht', (e, c) => {
  e.state = 'chase';
  e.goTo(e.x - Math.sin(c.toT) * 8, e.z - Math.cos(c.toT) * 8, 1, false, c.toT);
  return BT.Running;
});

/** Rückzug bei wenig Leben: zum Lager zurück oder vom Ziel weg; danach kurz verschnaufen und wieder angreifen */
const retreat = action<Enemy, BrainCtx>('Rückzug', (e, c) => {
  if (e.state !== 'retreat') {
    e.state = 'retreat';
    e.retreatT = 4.5 + Math.random() * 2;
    // Fluchtpunkt: Lagermitte, wenn sie vom Ziel weg liegt, sonst 14 m vom Ziel weg
    const hx = e.homeX - c.tx, hz = e.homeZ - c.tz;
    const awayOk = Math.hypot(hx, hz) > 10 && Math.hypot(e.homeX - e.x, e.homeZ - e.z) > 3;
    const px = awayOk ? e.homeX : e.x - Math.sin(c.toT) * 14, pz = awayOk ? e.homeZ : e.z - Math.cos(c.toT) * 14;
    if (c.nav) c.nav.snap(px, pz, e.radius, e.spot); else { e.spot.x = px; e.spot.z = pz; }
    e.bark('retreat');
  }
  e.retreatT -= c.dt;
  // in die Enge getrieben: zurückschlagen
  const cornered = c.dist < 2.2 && e.retreatT < 3.2;
  if (e.retreatT <= 0 || cornered) {
    e.retreatDone = true;
    if (!cornered) e.recover(0.2);
    e.state = 'chase';
    return BT.Failure;
  }
  const away = Math.hypot(e.spot.x - e.x, e.spot.z - e.z) > 1;
  if (away) e.goTo(e.spot.x, e.spot.z, 1.05, false, c.toT);
  else e.stand(c.toT);
  return BT.Running;
});

/** Angreifen: nur mit Angriffsplatz (höchstens zwei Gegner gleichzeitig) */
const attack = action<Enemy, BrainCtx>('Angriff', (e, c) => {
  if (!c.w.requestToken(e)) { e.timer = 0.5 + Math.random() * 0.9; return BT.Failure; }
  e.hasToken = true;
  e.startWindup(c.w);
  return BT.Running;
});

/** Flankieren: Platz an der Seite oder im Rücken des Ziels suchen, während andere angreifen */
const flank = action<Enemy, BrainCtx>('Flankieren', (e, c) => {
  e.state = 'flank';
  const r = e.def.keep + 1.3;
  const base = Number.isFinite(c.tYaw) ? c.tYaw + Math.PI : c.toT + Math.PI;
  const a = base + e.flankSide * 1.15;
  let fx = c.tx + Math.sin(a) * r, fz = c.tz + Math.cos(a) * r;
  if (c.nav && c.nav.clearAt(fx, fz) < e.radius) { c.nav.snap(fx, fz, e.radius, e.spot); fx = e.spot.x; fz = e.spot.z; }
  if (Math.hypot(fx - e.x, fz - e.z) > 0.8) e.goTo(fx, fz, 0.85, true, c.toT);
  else e.strafe(c.toT, 0.35);
  return BT.Running;
});

/** Jagd: Abstand halten (Nahkampf dicht ran, Musketen/Faji auf Distanz mit Sichtlinie), sonst seitlich umkreisen */
const chase = action<Enemy, BrainCtx>('Jagd', (e, c) => {
  const want = e.def.keep;
  const ranged = want > 4;
  e.state = e.timer > 0 && c.dist < want + 3 ? 'strafe' : 'chase';
  if (c.dist > want + 0.6 || (ranged && !c.los)) e.goTo(c.tx, c.tz, 1, true, c.toT, ranged && c.los ? want : 0.2);
  else if (ranged && c.dist < want - 3) e.goTo(e.x - Math.sin(c.toT) * 3, e.z - Math.cos(c.toT) * 3, 0.8, true, c.toT);
  else e.stand(c.toT);
  if (e.state === 'strafe') e.strafe(c.toT, 0.45);
  return BT.Running;
});

/** Verdacht: zur letzten bekannten Stelle gehen und sich umsehen */
const investigate = action<Enemy, BrainCtx>('Verdacht', (e, c) => {
  e.state = 'suspicious';
  const d = Math.hypot(e.lkX - e.x, e.lkZ - e.z);
  if (d > 1.2) e.goTo(e.lkX, e.lkZ, 0.4, false, 0);
  else e.lookAround(c.dt);
  e.suspicion = Math.max(0, e.suspicion - c.dt * (d > 1.2 ? 0.02 : 0.1));
  return BT.Running;
});

/** Patrouille: zwischen zufälligen Punkten rund ums Lager hin und her, dazwischen kurz stehen und umsehen */
const patrol = action<Enemy, BrainCtx>('Patrouille', (e, c) => {
  if (e.patrolWait > 0) {
    e.patrolWait -= c.dt;
    e.state = 'idle';
    e.lookAround(c.dt);
    if (e.patrolWait <= 0) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * (c.nav ? 7 : 2.5);
      const px = e.homeX + Math.sin(a) * r, pz = e.homeZ + Math.cos(a) * r;
      if (c.nav) c.nav.snap(px, pz, e.radius, e.spot); else { e.spot.x = px; e.spot.z = pz; }
    }
    return BT.Running;
  }
  e.state = 'patrol';
  if (Math.hypot(e.spot.x - e.x, e.spot.z - e.z) < 0.7) { e.patrolWait = 1.5 + Math.random() * 3; e.stand(e.yaw); }
  else e.goTo(e.spot.x, e.spot.z, 0.32, false, 0);
  return BT.Running;
});

/** Der gemeinsame Baum aller Gegner */
export const ENEMY_TREE: BtNode<Enemy, BrainCtx> = selector<Enemy, BrainCtx>('Wurzel',
  sequence('Furcht', cond('verängstigt', (e, c) => e.fearT > 0 && c.w.playerActive), tracked(flee)),
  sequence('Rückzug?',
    cond('wenig Leben', (e, c) => e.aggro && c.w.playerActive && !e.retreatDone && e.hp / e.maxHp < e.retreatAt),
    tracked(retreat)),
  sequence('Kampf',
    cond('Ziel erkannt', (e, c) => e.aggro && c.w.playerActive),
    selector('Kampfwahl',
      sequence('Angreifen?',
        cond('in Reichweite', (e, c) => e.timer <= 0 && c.dist < (e.def.keep > 4 ? 24 : e.def.keep + 1.4) && (c.los || c.dist < 3)),
        tracked(attack)),
      sequence('Flankieren?',
        cond('Platz besetzt', (e, c) => !e.def.boss && e.def.keep <= 4 && !e.hasToken && c.dist < 12 && c.w.attackersNear(e) > 0),
        tracked(flank)),
      tracked(chase))),
  sequence('Verdacht?', cond('verdächtig', (e) => e.suspicion > 0.3), tracked(investigate)),
  tracked(patrol),
);
