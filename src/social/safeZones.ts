// Phase 4.8A – friedliche Schutzzonen der geteilten Welt: Ankerglück (Startort jedes Kapitäns) und die Hauptstadt-Häfen der fünf Mächte.
// Dort gibt es keinen Kampf zwischen Spielern (`partyRules.pvpBlock`); das Hafenwasser zählt mit. Die Zonen entstehen einmal aus den Insel-
// Daten (`REGIONS`), der Shard und die Seewelt fragen `safeZoneAt`.
import { REGIONS } from '../data/regions';
import { NATION_DEFS } from '../data/nations';
import { TEAM_IDS } from '../data/allegiance';
import type { SafeZone } from '../net/partyRules';

/** Hafenwasser um die Insel, das noch zur Schutzzone gehört (m) */
export const SAFE_HARBOR = 350;

let cache: SafeZone[] | null = null;

/** Schutzzonen: Ankerglück und die Hauptstädte der fünf Mächte */
export function safeZones(): readonly SafeZone[] {
  if (cache) return cache;
  const want = new Map<string, string>([['ankerglueck', 'Ankerglück']]);
  for (const n of NATION_DEFS) if (n.capital && (TEAM_IDS as readonly string[]).includes(n.id)) want.set(n.capital, '');
  const out: SafeZone[] = [];
  for (const r of REGIONS) for (const i of r.islands) {
    if (!want.has(i.id)) continue;
    out.push({ id: i.id, name: want.get(i.id) || i.name, x: i.x, z: i.z, r: i.r + SAFE_HARBOR });
    want.delete(i.id);
  }
  cache = out;
  return out;
}
