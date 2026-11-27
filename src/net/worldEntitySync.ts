// Phase 4.9 – geteilte Gegner der offenen Welt (rein: kein DOM, kein three.js; strip-sicher: der Relay-Server lädt die Datei mit reinem
// Typen-Abstreifen – keine Parameter-Eigenschaften, kein enum).
//
// Modell „Besitzer simuliert, Shard entscheidet“:
// - Ein Client erzeugt einen Gegner (Patrouille, Kriegsschiff, Händler auf offener See) und meldet ihn an (`claim`): der Shard vergibt die
//   Kennung, der Client steuert ihn ab dann (KI, Lenkung, Kanonen) und meldet 8× je Sekunde Lage und Leben (`report`).
// - Alle anderen Spieler in der Nähe bekommen ihn im Schnappschuss und zeigen eine Kopie ohne KI. Treffen sie ihn, geht der Schaden über den
//   Shard an den Besitzer (`hit`), der ihn verrechnet – so gibt es genau ein Leben, eine Lage und einen Untergang für alle.
// - Jeder Treffer zählt als Bedrohung je Spieler; der Gegner wendet sich dem mit der höchsten Bedrohung zu (`aggro`).
// - Verschwindet der Besitzer oder meldet er sich nicht mehr, übernimmt der nächste Spieler in Reichweite (`tick` → `migrate`); ohne Spieler in
//   der Nähe verschwindet der Gegner (`drop`).
// - Beim Untergang (`dead`) bekommen alle Beteiligten und ihre Gruppenmitglieder im Einsatzgebiet die Gutschrift (`credit`).
import { MMO, type EntLookNet, type EntNet, type EntSpawnNet, type EntStateNet } from './mmoProtocol';

/** Ein geteilter Gegner im Shard */
export interface SharedEnt extends EntNet {
  key: string;
  born: number;
  /** letzter Bericht des Besitzers (Shard-Zeit) */
  seen: number;
  /** Zeitpunkt des Untergangs (NaN = lebt) */
  deadT: number;
  /** Bedrohung je Spieler (Summe des Schadens) */
  readonly threat: Map<string, number>;
  /** wer zuletzt traf (Kennung) */
  last: string;
  /** hat ihn zuletzt abgegeben (zu weit weg) – bekommt ihn bis `skipUntil` nicht zurück (sonst Hin und Her) */
  skip: string;
  skipUntil: number;
}

/** Was das Register über einen Spieler wissen muss (liefert der Shard) */
export interface EntPeer { id: string; x: number; z: number; dom: string; bot: boolean; party: string }

const d2 = (ax: number, az: number, bx: number, bz: number) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

function copyLook(l: EntLookNet): EntLookNet {
  return { hull: l.hull, stripe: l.stripe, sail: l.sail, flag: l.flag, flagColor: l.flagColor, figurehead: l.figurehead, power: l.power, evo: [l.evo[0], l.evo[1], l.evo[2]] };
}

export class SharedEntityRegistry {
  readonly ents = new Map<string, SharedEnt>();
  /** dieselben Gegner als Liste (Durchlauf je Takt ohne Iterator) */
  readonly list: SharedEnt[] = [];
  private seq = 0;
  /** Zahlen für Prüfungen */
  readonly stats = { claimed: 0, rejected: 0, hits: 0, forwarded: 0, kills: 0, migrated: 0, dropped: 0 };

  /** Gegner eines Besitzers (lebend) */
  countOf(owner: string): number {
    let n = 0;
    for (const e of this.list) if (e.owner === owner && !e.dead) n++;
    return n;
  }

  /** Anmeldung eines selbst erzeugten Gegners; null = abgelehnt (Grenzen je Shard und je Besitzer) */
  claim(owner: string, s: EntSpawnNet, t: number): SharedEnt | null {
    if (this.list.length >= MMO.entMax || this.countOf(owner) >= MMO.entPerOwner) { this.stats.rejected++; return null; }
    const e: SharedEnt = {
      id: `e${++this.seq}`, key: s.key, owner, tier: s.tier, role: s.role, level: s.level, name: s.name, look: copyLook(s.look),
      x: s.x, z: s.z, hdg: s.hdg, spd: 0, hp: s.hp, mhp: s.mhp, dis: false, aggro: '', dead: false,
      born: t, seen: t, deadT: Number.NaN, threat: new Map(), last: '', skip: '', skipUntil: 0,
    };
    this.ents.set(e.id, e);
    this.list.push(e);
    this.stats.claimed++;
    return e;
  }

  /** Bericht des Besitzers (Fremde dürfen nichts melden); false = verworfen */
  report(owner: string, s: EntStateNet, t: number): boolean {
    const e = this.ents.get(s.id);
    if (!e || e.owner !== owner || e.dead) return false;
    e.x = s.x; e.z = s.z; e.hdg = s.hdg; e.spd = s.spd; e.mhp = s.mhp; e.hp = Math.min(s.hp, s.mhp); e.dis = s.dis;
    e.seen = t;
    return true;
  }

  /** Treffer: Bedrohung zählen, Aggro neu bestimmen; liefert den Gegner (null = unbekannt oder schon tot) */
  hit(from: string, id: string, dmg: number): SharedEnt | null {
    const e = this.ents.get(id);
    if (!e || e.dead || dmg <= 0) return null;
    e.threat.set(from, (e.threat.get(from) ?? 0) + dmg);
    e.last = from;
    e.aggro = this.topThreat(e);
    this.stats.hits++;
    return e;
  }

  /** Spieler mit der höchsten Bedrohung ('' = keiner) */
  topThreat(e: SharedEnt): string {
    let best = '', bv = 0;
    for (const [id, v] of e.threat) if (v > bv) { bv = v; best = id; }
    return best;
  }

  /** Untergang (nur der Besitzer meldet ihn); liefert den Gegner (null = unbekannt, fremd oder schon tot) */
  dead(owner: string, id: string, t: number): SharedEnt | null {
    const e = this.ents.get(id);
    if (!e || e.owner !== owner || e.dead) return null;
    e.dead = true; e.deadT = t; e.hp = 0;
    this.stats.kills++;
    return e;
  }

  /** Der Besitzer steuert den Gegner nicht mehr (zu weit weg): beim nächsten Takt übernimmt jemand anderes oder er verschwindet */
  release(owner: string, id: string, t = 0): SharedEnt | null {
    const e = this.ents.get(id);
    if (!e || e.owner !== owner || e.dead) return null;
    e.owner = '';
    e.skip = owner; e.skipUntil = t + 10;
    return e;
  }

  /**
   * Gutschrift eines Abschusses: alle, die getroffen haben, und die Mitglieder ihrer Gruppen im Einsatzgebiet (`lootSea` m um den Gegner);
   * ohne Treffer zählt der Besitzer. Bots bekommen nichts (sie spielen nicht).
   */
  credit(e: SharedEnt, peers: readonly EntPeer[], out: string[]): string[] {
    out.length = 0;
    const r2 = MMO.lootSea * MMO.lootSea;
    const parties: string[] = [];
    const add = (id: string) => { if (!out.includes(id)) out.push(id); };
    const hitters = e.threat.size ? [...e.threat.keys()] : [e.owner];
    for (const h of hitters) {
      const p = peers.find((o) => o.id === h);
      if (!p || p.bot) continue;
      add(p.id);
      if (p.party && !parties.includes(p.party)) parties.push(p.party);
    }
    for (const p of peers) if (!p.bot && p.party && parties.includes(p.party) && d2(p.x, p.z, e.x, e.z) <= r2) add(p.id);
    return out;
  }

  /** Gegner im Umkreis (Schnappschüsse) */
  near(x: number, z: number, r: number, out: SharedEnt[]): SharedEnt[] {
    out.length = 0;
    const r2 = r * r;
    for (const e of this.list) if (d2(e.x, e.z, x, z) <= r2) out.push(e);
    return out;
  }

  /**
   * Je Takt (Shard-Zeit): Tote nach `entDeadKeep` s austragen; Gegner ohne Besitzer bzw. ohne Bericht seit `entStale` s an den nächsten
   * Spieler übergeben (höchstens `entMigrate` m, nie an Bots), sonst – ohne Spieler in `entDrop` m – verwerfen.
   */
  tick(t: number, peers: readonly EntPeer[], migrate: (e: SharedEnt, to: string) => void, drop: (e: SharedEnt) => void): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.dead) {
        if (t - e.deadT > MMO.entDeadKeep) { this.list.splice(i, 1); this.ents.delete(e.id); }
        continue;
      }
      const owner = e.owner ? peers.find((p) => p.id === e.owner) : undefined;
      const stale = !owner || t - e.seen > MMO.entStale;
      if (!stale) continue;
      let best: EntPeer | null = null, bd = MMO.entMigrate * MMO.entMigrate, any = false;
      for (const p of peers) {
        if (p.bot) continue;
        const dd = d2(p.x, p.z, e.x, e.z);
        if (dd <= MMO.entDrop * MMO.entDrop) any = true;
        // nicht an den (schweigenden) Besitzer selbst und nicht gleich wieder an den, der ihn abgegeben hat
        if (p.id === e.owner || (p.id === e.skip && t < e.skipUntil)) continue;
        if (dd < bd) { bd = dd; best = p; }
      }
      if (best) { e.owner = best.id; e.seen = t; this.stats.migrated++; migrate(e, best.id); continue; }
      if (!any || !owner) { this.list.splice(i, 1); this.ents.delete(e.id); this.stats.dropped++; drop(e); }
    }
  }

  /** Alles eines Spielers vergessen (Bedrohung), Gegner ohne Besitzer übernimmt der nächste Takt */
  forget(id: string): void {
    for (const e of this.list) {
      e.threat.delete(id);
      if (e.aggro === id) e.aggro = this.topThreat(e);
      if (e.owner === id) e.owner = '';
    }
  }
}
