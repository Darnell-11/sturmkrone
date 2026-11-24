// Weltbosse auf See (Phase 4.3C): Werte und Beute als reine Rechnung (ohne three.js, Würfel wird übergeben). Leben, Panzerung und Anti-One-Shot
// kommen aus data/balanceConfig.ts (`worldBossHull`, `hullArmorOf`, `WORLD_BOSS_HIT_CAP`, `capVolley`), die Daten der drei Bosse aus data/seaEvents.ts.
import { SEAL_DROP, dangerOfLevel, hullArmorOf, playerNavalDps, worldBossHull, type DangerTier } from '../data/balanceConfig';
import { SHIP_CLASSES } from '../data/ships';
import { WORLD_BOSSES, WORLD_BOSS_LOOT, type WorldBossId } from '../data/seaEvents';
import type { FactionId } from '../data/factions';

export interface WorldBossStats {
  id: WorldBossId;
  level: number;
  dangerTier: DangerTier;
  maxHull: number;
  /** Rumpf-Panzerung (wie `Ship.hullArmor`; das Ungeheuer trägt die Panzerung eines Leviathans der Stufe 5) */
  armor: number;
}

/** Werte eines Weltbosses */
export function worldBossStats(id: WorldBossId): WorldBossStats {
  const d = WORLD_BOSSES[id];
  return {
    id, level: d.level, dangerTier: dangerOfLevel(d.level),
    maxHull: worldBossHull(SHIP_CLASSES[d.classTier].hp, d.level, d.hullK),
    armor: hullArmorOf(d.classTier, d.evo.hullTier),
  };
}

/** Wie lange (s) braucht ein Spielerschiff, um den Boss niederzukämpfen (Modell `NAVAL_FIGHT_MODEL`)? */
export function bossFightSeconds(id: WorldBossId, player: { level: number; classTier: number; rank: number; cannonTier: number }): number {
  const st = worldBossStats(id);
  const dps = playerNavalDps({ ...player, ports: SHIP_CLASSES[Math.max(0, Math.min(SHIP_CLASSES.length - 1, player.classTier))].can }, st.armor);
  return st.maxHull / Math.max(1e-6, dps);
}

export interface WorldBossLoot {
  gold: number;
  /** Boss-Siegel: Macht und Zahl (garantiert; der erste Sieg gibt mehr) */
  seals: { power: FactionId; n: number };
  /** Relikt-Splitter (garantiert) */
  shards: number;
  /** Garantiert ein Stück der Stufe 4 (Kriegsherren-Beute) */
  tier4: true;
  xp: number;
  fame: number;
}

/**
 * Beute eines Weltbosses: garantiert Boss-Siegel (erster Sieg `SEAL_DROP.first`, danach `repeat`) der Macht des Bosses oder – bei herrenlosen Bossen – der
 * Macht des Sektors, in dem er fällt; Relikt-Splitter (`SEAL_DROP.shardsMin` … `shardsMax` plus Bonus); ein Stück der Stufe 4; Gold, Erfahrung, Ruhm.
 */
export function rollWorldBossLoot(id: WorldBossId, first: boolean, sectorPower: FactionId, rnd: () => number): WorldBossLoot {
  const d = WORLD_BOSSES[id];
  const shards = SEAL_DROP.shardsMin + Math.floor(rnd() * (SEAL_DROP.shardsMax - SEAL_DROP.shardsMin + 1)) + WORLD_BOSS_LOOT.shardBonus;
  return {
    gold: WORLD_BOSS_LOOT.gold + WORLD_BOSS_LOOT.goldPerLevel * d.level,
    seals: { power: d.sealPower ?? sectorPower, n: first ? SEAL_DROP.first : SEAL_DROP.repeat },
    shards,
    tier4: true,
    xp: WORLD_BOSS_LOOT.xp,
    fame: WORLD_BOSS_LOOT.fame,
  };
}
