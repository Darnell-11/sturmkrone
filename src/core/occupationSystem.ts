// Spiel-Seite der Insel-Besatzung: tickt die Zustandsmaschine aus raid/occupation.ts (reine Daten im Spielstand, `progress.conquest`), schickt die
// Rückeroberungs-Flotte, zahlt den Tribut, tauscht Banner und Wachen in der Welt und liefert die Anzeige für Weltkarte, Kompass und Insel-Banner.
// Die Uhr ist `meta.playTime` (aktive Spielzeit): in Menüs und Pausen steht sie still, in der Welt läuft sie mit.
import { FACTIONS, type FactionId } from '../data/factions';
import type { IslandDef } from '../data/regions';
import {
  OCCUPATION, beginOccupation, clockText, dispatchFleet, emptyUnlocks, fleetDue, fleetProgress, fleetShips, isLost, isOccupied, loseIsland, payTribute,
  phase, repelFleet, tributeAmount, tributeDue, viewOf, type ConquestRecord, type OccupationView,
} from '../raid/occupation';
import type { SeaWorld } from '../world/seaWorld';
import type { SaveData } from './save/types';

/** Was die Besatzung vom Spiel braucht */
export interface OccHost {
  save(): SaveData | null;
  world: SeaWorld;
  toast(t: string, secs?: number): void;
  banner(t: string, sub: string): void;
  fame(n: number): void;
  provisions(n: number): void;
  persist(): void;
  cue(kind: 'horn' | 'win' | 'bell'): void;
  /** Talente (4.6E, Tributordnung): Faktor auf das Tribut-Gold (fehlt er, gilt 1) */
  tributeK?(): number;
}

/** Wo die Rückeroberungs-Flotte gerade ist (in Weltkoordinaten) */
export interface FleetSpot { x: number; z: number; heading: number }

/** Zählt als „nahe“, wenn der Spieler so dicht an der Flotte ist, dass sie als echte Schiffe erscheint */
const MATERIALIZE_AT = 1500;

export class OccupationSystem {
  /** Flotten, die schon als echte Schiffe in der Welt sind (nicht im Spielstand: nach dem Laden erscheinen sie neu, sobald der Spieler nahe ist) */
  private fleet = new Map<string, { spawned: boolean; total: number }>();

  constructor(private h: OccHost) {}

  private recs(): Record<string, ConquestRecord> {
    const s = this.h.save();
    if (!s) return {};
    s.progress.conquest ??= {};
    s.progress.unlocks ??= emptyUnlocks();
    return s.progress.conquest;
  }
  private now(): number { return this.h.save()?.meta.playTime ?? 0; }
  private def(id: string): IslandDef | undefined { return this.h.world.islandDefs.find((d) => d.id === id); }

  get conquered(): ConquestRecord[] { return Object.values(this.recs()); }
  record(id: string): ConquestRecord | undefined { return this.recs()[id]; }
  occupied(id: string): boolean { return isOccupied(this.recs()[id], this.now()); }
  /** Wie oft die Insel erobert wurde (nur wachsend) */
  conquests(id: string): number { return this.recs()[id]?.conquestCount ?? 0; }

  // ---------- Beginn und Ende ----------

  /** Der Raid wurde gewonnen: die Insel gehört dem Spieler (neue Besatzung, Zählung +1, Flagge, Wachen) */
  conquer(def: IslandDef, fid: FactionId): ConquestRecord | null {
    const s = this.h.save();
    if (!s) return null;
    const recs = this.recs();
    const rec = beginOccupation(recs[def.id], def.id, fid, s.meta.playTime);
    recs[def.id] = rec;
    this.fleet.delete(def.id);
    this.h.world.clearRecon(def.id);
    this.h.world.setOccupied(def.id, s.ship.look, def.level ?? 15);
    this.h.persist();
    return rec;
  }

  /** Nach dem Laden eines Spielstands: Flaggen und Wachen der noch besetzten Inseln wiederherstellen */
  sync() {
    const s = this.h.save();
    if (!s) return;
    const now = s.meta.playTime;
    this.fleet.clear();
    for (const rec of Object.values(this.recs())) {
      const d = this.def(rec.islandId);
      if (isOccupied(rec, now)) this.h.world.setOccupied(rec.islandId, s.ship.look, d?.level ?? 15);
      else if (rec.occupiedUntil !== null) this.recs()[rec.islandId] = loseIsland(rec);
    }
  }

  /** Spiel beendet oder anderer Spielstand: alles abräumen (die Daten bleiben im Spielstand) */
  reset() {
    for (const id of this.h.world.occupiedIds) { this.h.world.setOccupied(id, null); this.h.world.clearRecon(id); }
    for (const id of this.fleet.keys()) this.h.world.clearRecon(id);
    this.fleet.clear();
  }

  // ---------- Schleife ----------

  update(_dt: number) {
    const s = this.h.save();
    if (!s) return;
    const recs = this.recs();
    const now = s.meta.playTime;
    for (const id of Object.keys(recs)) {
      let rec = recs[id];
      if (rec.occupiedUntil === null) continue;
      const def = this.def(id);
      // Tribut: Gold und Proviant in regelmäßigen Abständen
      if (tributeDue(rec, now)) {
        const t = tributeAmount(def?.level ?? 15, rec.conquestCount);
        t.gold = Math.round(t.gold * (this.h.tributeK?.() ?? 1));
        s.player.gold += t.gold;
        this.h.provisions(t.proviant);
        recs[id] = rec = payTribute(rec, now);
        this.h.toast(`Tribut aus ${def?.name ?? 'der besetzten Insel'}: +${t.gold.toLocaleString('de-DE')} Gold, +${t.proviant} Proviant`, 3.5);
      }
      // Endspurt: die Macht schickt ihre Flotte
      if (fleetDue(rec, now)) {
        recs[id] = rec = dispatchFleet(rec, now);
        this.h.cue('horn');
        this.h.banner(`Rückeroberungs-Flotte der ${FACTIONS[rec.factionId].name}!`, `Sie läuft auf ${def?.name ?? 'die Insel'} zu. Versenke sie, bevor die Besatzung endet (${clockText(Math.max(0, (rec.occupiedUntil ?? now) - now))}).`);
        this.h.persist();
      }
      if (rec.counter === 'inbound' && !this.h.world.raid) this.tickFleet(rec, def, now);
      // Zeit abgelaufen: die Macht erobert die Insel zurück
      if (isLost(rec, now)) this.lose(rec, def);
    }
  }

  /** Virtuelle Lage der Flotte: sie läuft von weit draußen (Seeseite) geradeaus zu ihrem Platz vor der Insel */
  fleetSpot(def: IslandDef, rec: ConquestRecord, now: number): FleetSpot {
    const a = Math.atan2(-def.z, -def.x), dx = Math.cos(a), dz = Math.sin(a);
    const base = def.r * 1.15;
    const sx = def.x + dx * (base + 1100), sz = def.z + dz * (base + 1100);
    const tx = def.x + dx * (base + 130), tz = def.z + dz * (base + 130);
    const k = fleetProgress(rec, now);
    return { x: sx + (tx - sx) * k, z: sz + (tz - sz) * k, heading: Math.atan2(tx - sx, tz - sz) };
  }

  private tickFleet(rec: ConquestRecord, def: IslandDef | undefined, now: number) {
    if (!def) return;
    const w = this.h.world;
    const fl = this.fleet.get(rec.islandId) ?? { spawned: false, total: 0 };
    this.fleet.set(rec.islandId, fl);
    if (!fl.spawned) {
      const f = this.fleetSpot(def, rec, now);
      const pp = w.playerPos;
      if (Math.hypot(f.x - pp.x, f.z - pp.z) < MATERIALIZE_AT) {
        const a = Math.atan2(-def.z, -def.x), base = def.r * 1.15;
        const n = w.spawnRecon(def, { x: f.x, z: f.z, heading: f.heading, homeX: def.x + Math.cos(a) * (base + 130), homeZ: def.z + Math.sin(a) * (base + 130), count: fleetShips(rec), level: (def.level ?? 15) + 1 });
        if (n > 0) { fl.spawned = true; fl.total = n; this.h.toast(`${n} Kriegsschiffe der ${FACTIONS[rec.factionId].name} halten auf ${def.name} zu!`, 4); }
      }
      return;
    }
    // alle Schiffe versenkt: die Flotte ist abgewehrt
    if (w.reconAlive(rec.islandId) === 0) this.repel(rec, def, now);
  }

  private repel(rec: ConquestRecord, def: IslandDef | undefined, now: number) {
    const r = repelFleet(rec, now);
    this.recs()[rec.islandId] = r.rec;
    this.fleet.delete(rec.islandId);
    this.h.world.clearRecon(rec.islandId);
    this.h.fame(r.fame);
    this.h.cue('win');
    this.h.banner('Rückeroberungs-Flotte versenkt!', `${def?.name ?? 'Die Insel'} bleibt in deiner Hand${r.extended ? ` · +${clockText(r.extended)} Besatzung` : ''} · +${r.fame} Ruhm`);
    this.h.persist();
  }

  private lose(rec: ConquestRecord, def: IslandDef | undefined) {
    this.recs()[rec.islandId] = loseIsland(rec);
    this.fleet.delete(rec.islandId);
    this.h.world.setOccupied(rec.islandId, null);
    this.h.world.clearRecon(rec.islandId);
    this.h.cue('bell');
    this.h.banner(`${def?.name ?? 'Die Insel'} ist zurückerobert`, `${FACTIONS[rec.factionId].name} hält die Festung wieder. Deine Beute und Freischaltungen bleiben dir – ein neuer Sturm ist jederzeit möglich.`);
    this.h.persist();
  }

  // ---------- Anzeige ----------

  /** Alle besetzten Inseln (für Karte, Kompass, Banner) */
  views(): OccupationView[] {
    const now = this.now();
    const out: OccupationView[] = [];
    for (const rec of this.conquered) {
      if (!isOccupied(rec, now)) continue;
      const d = this.def(rec.islandId);
      out.push(viewOf(rec, d?.name ?? rec.islandId, now, this.h.world.reconAlive(rec.islandId) || (rec.counter === 'inbound' && !this.fleet.get(rec.islandId)?.spawned ? fleetShips(rec) : 0)));
    }
    return out;
  }

  /** Punkte für Weltkarte und Kompass: besetzte Inseln (goldene Fahne) und die anrückende Flotte (Alarm) */
  pois(): { x: number; z: number; kind: 'citadel' | 'alarm'; name: string; color?: string }[] {
    const now = this.now();
    const out: { x: number; z: number; kind: 'citadel' | 'alarm'; name: string; color?: string }[] = [];
    for (const rec of this.conquered) {
      if (!isOccupied(rec, now)) continue;
      const d = this.def(rec.islandId);
      if (!d) continue;
      out.push({ x: d.x, z: d.z, kind: 'citadel', name: `${d.name} (besetzt)`, color: '#E3B04B' });
      if (rec.counter === 'inbound') { const f = this.fleetSpot(d, rec, now); out.push({ x: f.x, z: f.z, kind: 'alarm', name: 'Rückeroberungs-Flotte' }); }
    }
    return out;
  }

  /** Kennzahlen für Prüfungen und Anzeigen */
  summary(): { occupied: number; conquests: number; inbound: number } {
    const now = this.now();
    let occupied = 0, conquests = 0, inbound = 0;
    for (const r of this.conquered) { conquests += r.conquestCount; if (isOccupied(r, now)) { occupied++; if (r.counter === 'inbound') inbound++; } }
    return { occupied, conquests, inbound };
  }

  /** Phase einer Insel (für Menüs) */
  phaseOf(id: string) { return phase(this.recs()[id], this.now()); }
}

void OCCUPATION;
