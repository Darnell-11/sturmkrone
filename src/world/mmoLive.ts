// Phase 4.8A – MMO-Mitspieler in der Seewelt. Liest nur den `MmoClient` (interpolierte Schnappschüsse) und zeigt:
// - **zu Fuß:** Figuren aus einem vorab angelegten Pool (`MMO.rigPool` Figuren, je zur Hälfte Kapitäninnen und Kapitäne, gleiche Programme wie
//   die Stadtbewohner – kein neues Shader-Programm), bis `MMO.rigShow` m um die Kamera, die nächsten zuerst;
// - **auf See:** ihre Schiffe (höchstens `MMO.shipPool`, gebaut über die Warteschlange der Seewelt wie jedes Mitspieler-Schiff, mit dem
//   Wappen ihres Teams), bewegt über die Schnappschüsse statt über die KI;
// - **Mitfahrer:** Figuren an Deck des Schiffs, auf dem sie mitfahren (relative Deck-Lage, auch auf dem eigenen Schiff).
// Für Zielring, Zielfenster, Rechtsklick-Menü und Eigenbeschuss liefert sie je Mitspieler Beziehung und Schadens-Erlaubnis
// (`partyRules.playerRelation`/`pvpBlock`). Je Logikschritt entsteht nichts Neues (Pool, Ziel-Ansichten, Hilfsobjekte vorab).
import type { Object3D, Scene } from 'three';
import type { Character } from '../entities/character/character';
import type { Ship } from '../entities/ship/ship';
import type { EnemyShip, NavalSystem } from '../naval/naval';
import { MMO, type PlayerProfile } from '../net/mmoProtocol';
import type { MmoClient, RemotePlayer } from '../net/mmoClient';
import { playerRelation, pvpBlock, rideToWorld, type PartyStance } from '../net/partyRules';
import { DEFAULT_SHIP_LOOK, HULL_COLORS, SAIL_COLORS, SHIP_CLASSES, type ShipLook } from '../data/ships';
import type { FactionId } from '../data/factions';
import type { AnimRole } from '../data/animations';

/** Was die Mitspieler-Darstellung von der Seewelt braucht */
export interface MmoLiveHost {
  readonly scene: Scene;
  /** Figur für den Pool bauen (versteckt; `female` = Kapitänin) – null, solange die Figuren-Bausteine fehlen */
  makeRig(i: number, female: boolean): Character | null;
  groundY(x: number, z: number, y: number): number;
  naval(): NavalSystem | null;
  /** eigenes Schiff (Mitfahrer, wenn man selbst Anführer ist) */
  ownShip(): Ship;
  /** Ort der Kamera bzw. Spielfigur (Zeichenabstand) */
  viewer(out: { x: number; z: number }): void;
  /** eigener Ort für Schutzzonen und PvP */
  me(out: { x: number; z: number }): void;
  /** Figuren-Sichtweite der Grafikstufe (m) */
  figureDist(): number;
  stance(team: string): PartyStance;
  safeAt(x: number, z: number): string;
  /** Figur bzw. Schiff unsichtbar vorübersetzen (keine neuen Programme im Bild) */
  warm?(o: Object3D): void;
}

/** Ansicht eines Mitspielers für die Ziel-Erfassung (vorab angelegt, je Schritt aufgefrischt) */
export interface RemoteTarget {
  id: string;
  x: number; y: number; z: number;
  name: string;
  level: number;
  team: string;
  classLabel: string;
  role: string;
  hp: number; mhp: number;
  relation: 'friendly' | 'neutral' | 'hostile';
  /** Schaden erlaubt (Spieler gegen Spieler) */
  harm: boolean;
  alive: boolean;
  /** steht an Deck eines Schiffs */
  onDeck: boolean;
}

interface RigSlot {
  char: Character;
  female: boolean;
  id: string;
  anim: AnimRole | '';
  acc: number;
}

interface ShipSlot { id: string; e: EnemyShip | null; pending: boolean; gone: number; tier: number; team: string }

const _v = { x: 0, z: 0 };
const _me = { x: 0, z: 0 };
const _w = { x: 0, y: 0, z: 0 };
/** Beziehung (wiederverwendet: `relationOf` legt nichts Neues an) */
const _rel: { relation: 'friendly' | 'neutral' | 'hostile'; harm: boolean; stance: PartyStance } = { relation: 'neutral', harm: false, stance: 'neutral' };
/** Kandidaten für Figuren (Index in `client.list`, Abstand) – vorab angelegt */
const _cand: number[] = [];
const _candD: number[] = [];

/** Schiffsaussehen eines Mitspielers: Farben aus seinem Startwert, Wappen seines Teams */
export function remoteShipLook(p: PlayerProfile): ShipLook {
  const look = DEFAULT_SHIP_LOOK('pirat');
  const k = Math.abs(p.look | 0);
  look.hull = HULL_COLORS[(k * 3 + 1) % HULL_COLORS.length];
  look.sail = SAIL_COLORS[(k * 5) % SAIL_COLORS.length];
  look.flagColor = ['#1E1A20', '#7A1F1A', '#14284A', '#2F4A3A'][k % 4];
  if (p.team) look.power = p.team as FactionId;
  return look;
}

export class MmoLive {
  private readonly rigs: RigSlot[] = [];
  private fillT = 0.5;
  private readonly ships = new Map<string, ShipSlot>();
  private readonly shipList: ShipSlot[] = [];
  /** Ziel-Ansichten der Mitspieler (Figuren an Land und an Deck) */
  readonly targets: RemoteTarget[] = [];
  private readonly targetPool: RemoteTarget[] = [];
  /** Zahlen für Prüfungen */
  readonly stats = { rigs: 0, shown: 0, ships: 0, riders: 0, built: 0 };

  constructor(private readonly host: MmoLiveHost, readonly client: MmoClient) {}

  /** Pool-Figuren (Prüfungen) */
  get poolSize(): number { return this.rigs.length; }

  /** Schiff eines Mitspielers (null = keins in 3D) */
  shipOf(id: string): EnemyShip | null { return this.ships.get(id)?.e ?? null; }
  /** Mitspieler zu einem Schiff ('' = keiner) */
  playerOfShip(e: EnemyShip | null): string { return e?.peer?.mmo ?? ''; }
  /** Ziel-Ansicht eines Mitspielers an Land/an Deck */
  target(id: string): RemoteTarget | null { for (const t of this.targets) if (t.id === id) return t; return null; }

  /** Beziehung und Schadens-Erlaubnis zu einem Mitspieler */
  relationOf(r: RemotePlayer): { readonly relation: 'friendly' | 'neutral' | 'hostile'; readonly harm: boolean; readonly stance: PartyStance } {
    const stance = this.host.stance(r.profile.team);
    const party = this.client.inParty(r.id);
    _rel.stance = stance;
    _rel.relation = playerRelation(stance, party);
    // Spieler gegen Spieler nur bei Krieg: erst dann die Schutzzonen prüfen (kein Text je Schritt)
    if (stance !== 'krieg' || party) _rel.harm = false;
    else { this.host.me(_me); _rel.harm = !pvpBlock({ stance, sameParty: party, safeA: this.host.safeAt(_me.x, _me.z), safeB: this.host.safeAt(r.last.x, r.last.z) }); }
    return _rel;
  }

  /** Je Logikschritt: Pool füllen, Figuren zuteilen und bewegen, Schiffe führen, Ziel-Ansichten auffrischen */
  update(dt: number) {
    this.fillPool(dt);
    const c = this.client;
    const now = c.transport.now();
    for (const r of c.list) c.sample(r, now);
    this.updateShips(dt);
    this.updateRigs(dt);
  }

  private fillPool(dt: number) {
    if (this.rigs.length >= MMO.rigPool) return;
    this.fillT -= dt;
    if (this.fillT > 0) return;
    this.fillT = 0.35;
    const female = this.rigs.length % 2 === 0;
    const char = this.host.makeRig(this.rigs.length, female);
    if (!char) return;
    char.holder.visible = false;
    this.host.scene.add(char.holder);
    this.host.warm?.(char.holder);
    this.rigs.push({ char, female, id: '', anim: '', acc: 0 });
    this.stats.rigs = this.rigs.length;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Schiffe
  // ---------------------------------------------------------------------------------------------------------------

  private updateShips(dt: number) {
    const nav = this.host.naval();
    if (!nav) return;
    this.host.viewer(_v);
    let count = 0;
    for (const r of this.client.list) {
      let slot = this.ships.get(r.id);
      const reach = slot?.e ? MMO.shipHide : MMO.shipShow;
      const wantShip = r.live && r.last.dom === 'sea' && !r.last.ride && Math.hypot(r.view.x - _v.x, r.view.z - _v.z) <= reach;
      if (!wantShip) { if (slot) slot.gone += dt; continue; }
      if (count >= MMO.shipPool) continue;
      count++;
      if (!slot) { slot = { id: r.id, e: null, pending: false, gone: 0, tier: r.profile.shipTier, team: r.profile.team }; this.ships.set(r.id, slot); this.shipList.push(slot); }
      slot.gone = 0;
      if (slot.e && !nav.enemies.includes(slot.e)) slot.e = null;
      // neues Schiff (oder anderes Team/Schiff): über die Warteschlange bauen
      if (slot.e && (slot.tier !== r.profile.shipTier || slot.team !== r.profile.team)) { nav.removeEventShip(slot.e); slot.e = null; }
      if (!slot.e && !slot.pending) {
        slot.pending = true; slot.tier = r.profile.shipTier; slot.team = r.profile.team;
        const s = slot, id = r.id;
        nav.queuePeer(r.view.x, r.view.z, r.view.hdg, Math.max(0, Math.min(SHIP_CLASSES.length - 1, r.profile.shipTier)), remoteShipLook(r.profile), r.profile.name, [], (e) => {
          s.pending = false;
          if (this.ships.get(id) !== s) { nav.removeEventShip(e); return; }
          s.e = e;
          this.stats.built++;
        }, id);
        continue;
      }
      const e = slot.e;
      if (!e) continue;
      const sh = e.ship, v = r.view;
      sh.prev.x = sh.x; sh.prev.z = sh.z; sh.prev.heading = sh.heading;
      sh.x = v.x; sh.z = v.z; sh.heading = v.hdg; sh.speed = v.spd;
      if (r.last.mhull > 0) { sh.maxHull = Math.max(sh.maxHull, r.last.mhull); sh.hull = Math.max(1, Math.min(sh.maxHull, r.last.hull)); }
      const rel = this.relationOf(r);
      if (e.peer) { e.peer.rel = rel.relation; e.peer.harm = rel.harm; }
      if (e.name !== r.profile.name) e.name = r.profile.name;
    }
    // Schiffe ohne Kapitän an Bord (an Land gegangen, außer Sicht): liegen noch 20 s vor Anker, dann abbauen (kommt er gleich zurück, steht es noch)
    for (let i = this.shipList.length - 1; i >= 0; i--) {
      const s = this.shipList[i];
      if (s.e && s.gone > 0) s.e.ship.speed = 0;
      if (s.gone > 20 || (!this.client.remotes.has(s.id) && s.gone > 1)) {
        if (s.e && nav.enemies.includes(s.e)) nav.removeEventShip(s.e);
        this.ships.delete(s.id);
        this.shipList.splice(i, 1);
      }
    }
    this.stats.ships = this.ships.size;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Figuren (zu Fuß und an Deck)
  // ---------------------------------------------------------------------------------------------------------------

  /** Deck-Lage eines Mitfahrers in Welt (false = das Schiff ist nicht in 3D) */
  private riderWorld(r: RemotePlayer): boolean {
    const owner = r.last.ride;
    let ship: Ship | null = null;
    if (owner === this.client.id) ship = this.host.ownShip();
    else ship = this.ships.get(owner)?.e?.ship ?? null;
    if (!ship || !ship.model.group.visible) return false;
    rideToWorld(ship, ship.model.group.position.y + ship.model.deckY, r.view.rx, r.view.ry, r.view.rz, _w);
    return true;
  }

  private updateRigs(dt: number) {
    const list = this.client.list;
    this.host.viewer(_v);
    const show = Math.min(MMO.rigShow, this.host.figureDist());
    _cand.length = 0; _candD.length = 0;
    // Kandidaten: an Land in Sicht oder an Deck eines sichtbaren Schiffs, die nächsten zuerst
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!r.live) continue;
      let x = r.view.x, z = r.view.z;
      if (r.last.ride) { if (!this.riderWorld(r)) continue; x = _w.x; z = _w.z; }
      else if (r.last.dom !== 'land') continue;
      const d = Math.hypot(x - _v.x, z - _v.z);
      if (d > show) continue;
      let k = _cand.length;
      _cand.push(i); _candD.push(d);
      while (k > 0 && _candD[k - 1] > d) { _cand[k] = _cand[k - 1]; _candD[k] = _candD[k - 1]; k--; }
      _cand[k] = i; _candD[k] = d;
    }
    const n = Math.min(_cand.length, this.rigs.length);
    // Figuren behalten ihren Mitspieler, solange er Kandidat bleibt; die übrigen werden frei
    for (const s of this.rigs) {
      if (!s.id) continue;
      let keep = false;
      for (let k = 0; k < n; k++) if (list[_cand[k]].id === s.id) { keep = true; break; }
      if (!keep) { s.id = ''; s.char.holder.visible = false; s.anim = ''; }
    }
    this.targets.length = 0;
    let riders = 0, shown = 0;
    for (let k = 0; k < n; k++) {
      const r = list[_cand[k]];
      let slot: RigSlot | null = null;
      for (const s of this.rigs) if (s.id === r.id) { slot = s; break; }
      if (!slot) slot = this.freeRig(r.profile.gender === 'w', r.profile.look);
      if (!slot) continue;
      slot.id = r.id;
      const onDeck = !!r.last.ride;
      let x = r.view.x, y = r.view.y, z = r.view.z;
      if (onDeck) { this.riderWorld(r); x = _w.x; y = _w.y; z = _w.z; riders++; }
      else if (r.profile.bot || !Number.isFinite(y)) y = this.host.groundY(x, z, y);
      const ch = slot.char;
      if (!ch.holder.visible) ch.holder.visible = true;
      const spd = onDeck ? 0 : r.view.spd;
      const anim: AnimRole = spd > 3.2 ? 'run' : spd > 0.35 ? 'walk' : 'idle';
      if (anim !== slot.anim) { slot.anim = anim; ch.play(anim, { fade: 0.25 }); }
      if (anim !== 'idle') ch.setLocoSpeed(Math.max(0.6, spd));
      ch.place(x, y, z, r.view.yaw);
      slot.acc += dt;
      const far = _candD[k];
      if (far < 60 || (far < 120 && slot.acc >= 0.05) || slot.acc >= 0.1) { ch.update(slot.acc); slot.acc = 0; }
      shown++;
      // Ziel-Ansicht
      const t = this.targetPool[this.targets.length] ?? (this.targetPool[this.targets.length] = {
        id: '', x: 0, y: 0, z: 0, name: '', level: 0, team: '', classLabel: '', role: '', hp: 0, mhp: 1, relation: 'neutral', harm: false, alive: false, onDeck: false,
      });
      const rel = this.relationOf(r);
      t.id = r.id; t.x = x; t.y = y; t.z = z; t.name = r.profile.name; t.level = r.profile.level; t.team = r.profile.team; t.classLabel = r.profile.classLabel;
      t.role = r.profile.role; t.hp = r.last.hp; t.mhp = r.last.mhp; t.relation = rel.relation; t.harm = false; t.alive = true; t.onDeck = onDeck;
      this.targets.push(t);
    }
    this.stats.shown = shown;
    this.stats.riders = riders;
  }

  private freeRig(female: boolean, look: number): RigSlot | null {
    let any: RigSlot | null = null;
    const start = Math.abs(look | 0) % Math.max(1, this.rigs.length);
    for (let k = 0; k < this.rigs.length; k++) {
      const s = this.rigs[(start + k) % this.rigs.length];
      if (s.id) continue;
      if (s.female === female) return s;
      any ??= s;
    }
    return any;
  }

  /** Alles abbauen (Instanz wieder privat, Spielstand gewechselt, Shard verlassen) */
  dispose() {
    const nav = this.host.naval();
    for (const s of this.shipList) if (s.e && nav?.enemies.includes(s.e)) nav.removeEventShip(s.e);
    this.ships.clear();
    this.shipList.length = 0;
    for (const s of this.rigs) { s.char.holder.removeFromParent(); s.char.dispose(); }
    this.rigs.length = 0;
    this.targets.length = 0;
  }
}
