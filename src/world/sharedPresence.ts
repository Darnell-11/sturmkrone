// Phase 4.7A – geteilte Welt: andere Kapitäne in Ankerglück, im Hafen und auf See.
//
// Sobald sich die private Instanz auflöst, sind andere Spieler sichtbar. Bis zum Netz (Phase 4.8) sind es lokale Stellvertreter, die über
// dieselbe Schnittstelle kommen wie später der Server-Feed (`PresenceFeed`): eine Liste von Kapitänen mit Kennung, Name, Stufe und Ort
// (Stadt oder See). Die Welt zeigt nur, was der Feed liefert – Figuren in der Stadt (als ansprechbare Bewohner mit Namen, Titel und
// Gruß) und Schiffe, die ihre Runde vor dem Hafen fahren. Reine Daten und Rechnung oben (getestet), die Welt-Seite unten über `PresenceHost`.
import { SHARED_PRESENCE } from '../data/prologue';
import { DEFAULT_SHIP_LOOK, HULL_COLORS, SAIL_COLORS, type ShipLook } from '../data/ships';
import { SPECS, SPEC_IDS, type RoleTag, type SpecId } from '../data/classes';

/** Ein anderer Kapitän (Stellvertreter oder später ein echter Mitspieler aus dem Netz) */
export interface PresenceCaptain {
  id: string;
  name: string;
  level: number;
  /** Titel im Zielfenster und im Gespräch */
  title: string;
  /** auf See (mit Schiff) oder an Land in Ankerglück */
  atSea: boolean;
  /** Schiffsklasse (nur auf See) */
  tier: number;
  /** Gruß, wenn man ihn anspricht */
  greet: string[];
  /** 4.7B: feste Klasse und Rolle (Zielfenster: „Kapitän · Säbel (Kombo-DPS) · Stufe 12“) */
  spec?: SpecId;
  role?: RoleTag;
}

/** Quelle der Mitspieler: lokal (bis 4.8) oder Server-Feed */
export interface PresenceFeed {
  roster(): readonly PresenceCaptain[];
}

const GREETS: readonly string[][] = [
  ['Frisch gestrandet? Ging uns allen so. Die Bernsteinsee wartet!', 'Hast du das Gewitter letzte Nacht gesehen? Halb Ankerglück stand am Strand.'],
  ['Ahoi! Die Kurogane werden frecher – halt die Augen offen.', 'Wenn du eine Crew suchst: Baldo in der Taverne kennt jeden.'],
  ['Mein erstes Schiff war auch eine ranzige Schaluppe. Sie hat mich nie im Stich gelassen.', 'Wind aus Nordost. Gutes Wetter zum Auslaufen.'],
  ['Die Admirale jagen jeden, der Schwarzbarts Namen nennt. Sag ihn lieber leise.', 'Wir laufen gleich aus – vielleicht sieht man sich auf See.'],
  ['Pass auf die Riffe im Osten auf. Ich hab dort schon zwei Kiele verloren.', 'Grete schmiedet die besten Klingen der Bernsteinsee.'],
  ['Na, auch hinter der Sturmkrone her? Dann stell dich hinten an!', 'Ein Kapitän ohne Karte ist ein Kapitän auf dem Meeresgrund.'],
  ['Hörst du die Möwen? Die wissen, wo die Fische sind – und die Schätze.', 'Ankerglück ist klein, aber hier fängt jede Legende an.'],
];

/**
 * Lokale Stellvertreter (deterministisch aus dem Startwert): `SHARED_PRESENCE.townCaptains` in der Stadt, `seaShips` auf See, Namen aus
 * `SHARED_PRESENCE.names` (jeder Name einmal), Stufen 3 – 24.
 */
export function localRoster(seed = 0x7a11): PresenceCaptain[] {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const names = [...SHARED_PRESENCE.names];
  const out: PresenceCaptain[] = [];
  const total = Math.min(names.length, SHARED_PRESENCE.townCaptains + SHARED_PRESENCE.seaShips);
  for (let i = 0; i < total; i++) {
    const k = Math.floor(rnd() * names.length);
    const name = names.splice(k, 1)[0];
    const atSea = i >= SHARED_PRESENCE.townCaptains;
    const level = 3 + Math.floor(rnd() * 22);
    // 4.7B: Klasse fest aus Platz und Stufe (ohne den Zufall weiterzudrehen – Namen und Stufen bleiben wie in 4.7A)
    const spec = SPEC_IDS[(i * 7 + level) % SPEC_IDS.length];
    out.push({
      id: `kapitaen-${i}`, name, level, atSea, spec, role: SPECS[spec].role,
      title: `Kapitän · ${SPECS[spec].label} (${SPECS[spec].role}) · Stufe ${level}`,
      tier: atSea ? 1 + Math.floor(rnd() * 2) : 0,
      greet: GREETS[i % GREETS.length],
    });
  }
  return out;
}

/** Feed der lokalen Stellvertreter */
export class LocalPresenceFeed implements PresenceFeed {
  private readonly list: PresenceCaptain[];
  constructor(seed?: number) { this.list = localRoster(seed); }
  roster(): readonly PresenceCaptain[] { return this.list; }
}

/** Runde eines Schiffs um die Insel: sechs Wegpunkte im Kreis (Mitte, Radius), gegen den Uhrzeigersinn ab dem Winkel `a0` */
export function peerLoop(cx: number, cz: number, r: number, a0: number, n = 6): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    pts.push(cx + Math.sin(a) * r, cz + Math.cos(a) * r);
  }
  return pts;
}

/** Aussehen eines Mitspieler-Schiffs (Farben je Kapitän, kein Weltmacht-Wappen) */
export function peerLook(i: number): ShipLook {
  const look = DEFAULT_SHIP_LOOK('pirat');
  look.hull = HULL_COLORS[(i * 3 + 1) % HULL_COLORS.length];
  look.sail = SAIL_COLORS[(i * 5) % SAIL_COLORS.length];
  look.flagColor = ['#1E1A20', '#7A1F1A', '#14284A', '#2F4A3A'][i % 4];
  return look;
}

// ---------------------------------------------------------------------------------------------------------------
// Welt-Seite
// ---------------------------------------------------------------------------------------------------------------

/** Was die Anwesenheit von der Seewelt braucht */
export interface PresenceHost {
  /** Mitte und Radius von Ankerglück */
  home(): { x: number; z: number; r: number };
  /** Abstand der Spielfigur bzw. des Schiffs zu Ankerglück */
  playerDist(): number;
  /** Kapitän als ansprechbare Figur in die Stadt stellen (liefert einen Griff zum späteren Abbau) */
  addTownCaptain(c: PresenceCaptain): object | null;
  removeTownCaptain(handle: object): void;
  /** Schiff in die Warteschlange (Bau über mehrere Bilder) */
  queueShip(c: PresenceCaptain, x: number, z: number, heading: number, look: ShipLook, pts: number[], done: (ship: object) => void): void;
  /** lebt das Schiff noch (noch nicht abgebaut)? */
  shipLive(ship: object): boolean;
  removeShip(ship: object): void;
}

/** Ab dieser Entfernung zu Ankerglück erscheinen Mitspieler, ab `PRESENCE_OUT` werden sie wieder abgebaut */
export const PRESENCE_IN = 1300;
export const PRESENCE_OUT = 1700;

export class SharedPresence {
  private readonly town = new Map<string, object>();
  private readonly ships = new Map<string, object>();
  /** Schiffe in der Warteschlange (Restzeit, bis ein verworfener Bau neu beauftragt wird) */
  private readonly pending = new Map<string, number>();
  /** Figuren entstehen eine nach der anderen (je 0,25 s), nie alle in einem Bild */
  private spawnT = 0;

  constructor(private readonly host: PresenceHost, readonly feed: PresenceFeed = new LocalPresenceFeed()) {}

  /** Anzahl sichtbarer Mitspieler (Stadt, See) – für Prüfungen */
  counts() { return { town: this.town.size, sea: this.ships.size, pending: this.pending.size }; }

  update(dt: number) {
    const h = this.host;
    const d = h.playerDist();
    if (d > PRESENCE_OUT) { this.clear(); return; }
    if (d > PRESENCE_IN) return;
    this.spawnT -= dt;
    for (const [id, s] of this.ships) if (!h.shipLive(s)) this.ships.delete(id);
    for (const [id, t] of this.pending) { if (t - dt <= 0) this.pending.delete(id); else this.pending.set(id, t - dt); }
    if (this.spawnT > 0) return;
    const home = h.home();
    const list = this.feed.roster();
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.atSea) {
        if (this.ships.has(c.id) || this.pending.has(c.id)) continue;
        const a0 = 0.7 + i * 2.1;
        const r = home.r + 210 + (i % 2) * 90;
        const pts = peerLoop(home.x, home.z, r, a0);
        this.pending.set(c.id, 30);
        h.queueShip(c, pts[0], pts[1], a0 + Math.PI / 2, peerLook(i), pts, (ship) => { this.pending.delete(c.id); this.ships.set(c.id, ship); });
        this.spawnT = 0.25;
        return;
      }
      if (this.town.has(c.id)) continue;
      const n = h.addTownCaptain(c);
      if (n) this.town.set(c.id, n);
      this.spawnT = 0.25;
      return;
    }
  }

  /** Alles abbauen (Instanz wieder privat, Spielstand gewechselt, weit weg) */
  clear() {
    for (const n of this.town.values()) this.host.removeTownCaptain(n);
    this.town.clear();
    for (const s of this.ships.values()) this.host.removeShip(s);
    this.ships.clear();
  }

  dispose() { this.clear(); this.pending.clear(); }
}
