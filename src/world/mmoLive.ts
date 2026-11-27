// Phase 4.8A – MMO-Mitspieler in der Seewelt. Liest nur den `MmoClient` (interpolierte Schnappschüsse) und zeigt:
// - **zu Fuß:** Figuren aus einem vorab angelegten Pool (`MMO.rigPool` Figuren, je zur Hälfte Kapitäninnen und Kapitäne, gleiche Programme wie
//   die Stadtbewohner – kein neues Shader-Programm), bis `MMO.rigShow` m um die Kamera, die nächsten zuerst;
// - **auf See:** ihre Schiffe (höchstens `MMO.shipPool`, gebaut über die Warteschlange der Seewelt wie jedes Mitspieler-Schiff, mit dem
//   Wappen ihres Teams), bewegt über die Schnappschüsse statt über die KI;
// - **Mitfahrer:** Figuren an Deck des Schiffs, auf dem sie mitfahren (relative Deck-Lage, auch auf dem eigenen Schiff).
// Für Zielring, Zielfenster, Rechtsklick-Menü und Eigenbeschuss liefert sie je Mitspieler Beziehung und Schadens-Erlaubnis
// (`partyRules.playerRelation`/`pvpBlock`). Je Logikschritt entsteht nichts Neues (Pool, Ziel-Ansichten, Hilfsobjekte vorab).
// 4.8B: Pool-Figuren tragen das echte Aussehen ihres Kapitäns (`PlayerProfile.app`: Geschlecht, Statur, Frisur, Farben, Hut, Kleidung,
// Mantel, sichtbare Ausrüstung, Klassen-Waffe) – umgekleidet höchstens eine Figur je `APPLY_GAP` Sekunden, damit kein Bild stockt; zu Fuß
// sind Kapitäne verfeindeter Nationen außerhalb der Schutzzonen treffbar (`RemoteTarget.harm`).
import { Vector3, type AnimationAction, type Object3D, type Scene } from 'three';
import type { Character } from '../entities/character/character';
import type { Ship } from '../entities/ship/ship';
import type { EnemyShip, NavalSystem } from '../naval/naval';
import { MMO, type AppearanceNet, type PlayerProfile } from '../net/mmoProtocol';
import type { CharacterLook } from '../data/characterParts';
import type { MmoClient, RemotePlayer } from '../net/mmoClient';
import { playerRelation, pvpBlock, rideToWorld, type PartyStance } from '../net/partyRules';
import { DEFAULT_SHIP_LOOK, HULL_COLORS, SAIL_COLORS, SHIP_CLASSES, type ShipLook } from '../data/ships';
import type { FactionId } from '../data/factions';
import type { AnimRole } from '../data/animations';
import type { HandPoseId } from '../data/characterRig';
import { castClipAt, type RemoteCast } from './remoteActionStage';

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
  /** 4.8B: Aussehen eines Kapitäns auf eine Pool-Figur legen (null = zurück zum Pool-Aussehen `base`) */
  dress?(char: Character, app: AppearanceNet | null, base: CharacterLook): void;
  /** 4.93A: laufende Kampf-Aktion eines Mitspielers (Clip, Kampfpose, Sprung auf die Bugreling) – null = keine */
  castOf?(id: string): RemoteCast | null;
  /** 4.93A: Glut an einer Faust der Figur (je Bild; Stärke 0 … 1) */
  fistGlow?(x: number, y: number, z: number, style: string, k: number): void;
}

/** 4.8B: höchstens eine Pool-Figur je so viele Sekunden umkleiden (ein Umkleiden kostet einige Millisekunden) */
export const APPLY_GAP = 0.2;

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
  /** 4.8B: Aussehen aus dem Pool (zum Zurückkleiden) und das angelegte (Kennung + Steckbrief-Version; '' = Pool) */
  base: CharacterLook;
  dressed: string;
  /** 4.93A: laufende Kampf-Aktion an dieser Figur – Nummer der Aktion, ihr Clip, die Hände vor der Faust-Pose */
  castSeq: number;
  castOn: boolean;
  castAct: AnimationAction | null;
  handR: HandPoseId | null;
  handL: HandPoseId | null;
}

interface ShipSlot { id: string; e: EnemyShip | null; pending: boolean; gone: number; tier: number; team: string }

const _v = { x: 0, z: 0 };
const _me = { x: 0, z: 0 };
const _w = { x: 0, y: 0, z: 0 };
const _hand = new Vector3();
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
  readonly stats = { rigs: 0, shown: 0, ships: 0, riders: 0, built: 0, dressed: 0 };
  private dressT = 0;

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
    this.rigs.push({ char, female, id: '', anim: '', acc: 0, base: char.look, dressed: '', castSeq: 0, castOn: false, castAct: null, handR: null, handL: null });
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

  /**
   * 4.93A: Lage des Kapitäns eines Mitspieler-Schiffs während eines Wirkens vom Steuerrad – er springt vom Steuerrad im Bogen auf die
   * Bugreling und am Ende zurück (`leapK` 0 … 1, wie beim eigenen Kapitän). false = sein Schiff ist nicht in 3D.
   */
  private helmWorld(r: RemotePlayer, c: RemoteCast): boolean {
    const ship = this.ships.get(r.id)?.e?.ship ?? null;
    if (!ship || !ship.model.group.visible) return false;
    const m = ship.model, k = c.leapK < 0 ? 0 : c.leapK > 1 ? 1 : c.leapK, e = k * k * (3 - 2 * k);
    const bowY = (m.fore ? m.fore.top : m.deckY) + 0.05, bowZ = ship.cls.L * 0.4;
    rideToWorld(ship, m.group.position.y, m.helm.x * (1 - e), m.helm.y + (bowY - m.helm.y) * e + (k < 1 ? Math.sin(Math.PI * k) * 2.2 : 0), m.helm.z + (bowZ - m.helm.z) * e, _w);
    return true;
  }

  /**
   * 4.93A: Kampf-Aktion an der Figur zeigen – ihr Clip folgt exakt der Zeitachse der Aktion (wie bei der eigenen Figur), darüber die Kampfpose
   * der Kino-Endgame-Regie (Kauern, Vorlage, Blick, Drehung), geballte glühende Fäuste und das Abheben. Rückgabe: Abheben in m.
   */
  private applyCast(slot: RigSlot, ch: Character, c: RemoteCast): number {
    if (slot.castSeq !== c.seq || !slot.castOn) {
      if (slot.castOn) this.releaseCast(slot, ch);
      slot.castSeq = c.seq; slot.castOn = true; slot.anim = '';
      slot.castAct = c.clip ? ch.playSynced(c.clip, 0.08) : null;
      if (c.pose?.fists && ch.rigX) { slot.handR = ch.rigX.handPose('r'); slot.handL = ch.rigX.handPose('l'); ch.setHandPose('r', 'faust'); ch.setHandPose('l', 'faust'); }
    }
    const act = slot.castAct;
    if (act) act.time = act.getClip().duration * castClipAt(c);
    const rx = ch.rigX, pose = c.pose;
    if (!pose) return 0;
    if (rx) { rx.cine.k = c.poseK; rx.cine.crouch = pose.crouch; rx.cine.lean = pose.lean; rx.cine.look = pose.look; rx.cine.twist = pose.twist; }
    if (pose.fists && c.glowK > 0.05 && this.host.fistGlow) {
      const so = ch.charSockets;
      for (let side = 0; side < 2; side++) {
        const node = so?.get(side ? 'handOff' : 'handMain') ?? null;
        if (!node) continue;
        node.getWorldPosition(_hand);
        this.host.fistGlow(_hand.x, _hand.y, _hand.z, c.tl ? c.tl.style : c.style, c.glowK);
      }
    }
    return c.helm ? 0 : pose.lift * c.liftK;
  }

  /** Aktion beendet: Pose und Hände zurück, die Figur läuft bzw. steht wieder */
  private releaseCast(slot: RigSlot, ch: Character) {
    slot.castOn = false; slot.castAct = null; slot.anim = '';
    if (ch.rigX) ch.rigX.cine.k = 0;
    if (slot.handR !== null) { ch.setHandPose('r', slot.handR); ch.setHandPose('l', slot.handL ?? 'offen'); slot.handR = null; slot.handL = null; }
  }

  private updateRigs(dt: number) {
    this.dressT -= dt;
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
      else if (r.last.dom !== 'land') {
        // 4.93A: am Steuerrad zeigt sich der Kapitän während eines Wirkens – er springt auf die Bugreling seines Schiffs
        const hc = this.host.castOf?.(r.id) ?? null;
        if (!hc || !hc.helm || !this.helmWorld(r, hc)) continue;
        x = _w.x; z = _w.z;
      }
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
      if (!keep) { if (s.castOn) this.releaseCast(s, s.char); s.id = ''; s.char.holder.visible = false; s.anim = ''; }
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
      this.dress(slot, r);
      const onDeck = !!r.last.ride;
      const cast = this.host.castOf?.(r.id) ?? null;
      const atHelm = !onDeck && r.last.dom !== 'land';
      let x = r.view.x, y = r.view.y, z = r.view.z, yaw = r.view.yaw;
      if (onDeck) { this.riderWorld(r); x = _w.x; y = _w.y; z = _w.z; riders++; }
      else if (atHelm) { if (!cast || !this.helmWorld(r, cast)) continue; x = _w.x; y = _w.y; z = _w.z; yaw = cast.yaw; }
      else if (r.profile.bot || !Number.isFinite(y)) y = this.host.groundY(x, z, y);
      const ch = slot.char;
      if (!ch.holder.visible) ch.holder.visible = true;
      const spd = onDeck || atHelm ? 0 : r.view.spd;
      if (cast) y += this.applyCast(slot, ch, cast);
      else {
        if (slot.castOn) this.releaseCast(slot, ch);
        const anim: AnimRole = spd > 3.2 ? 'run' : spd > 0.35 ? 'walk' : 'idle';
        if (anim !== slot.anim) { slot.anim = anim; ch.play(anim, { fade: 0.25 }); }
        if (anim !== 'idle') ch.setLocoSpeed(Math.max(0.6, spd));
      }
      ch.place(x, y, z, yaw);
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
      // 4.8B: zu Fuß an Land (nicht an Deck) treffbar, wenn Krieg herrscht und keine Schutzzone greift (der Shard prüft noch einmal)
      t.role = r.profile.role; t.hp = r.last.hp; t.mhp = r.last.mhp; t.relation = rel.relation; t.harm = rel.harm && !onDeck && r.last.dom === 'land'; t.alive = true; t.onDeck = onDeck || atHelm;
      this.targets.push(t);
    }
    this.stats.shown = shown;
    this.stats.riders = riders;
  }

  /** 4.8B: Aussehen anlegen, wenn sich Kapitän oder Steckbrief geändert haben (höchstens eine Figur je `APPLY_GAP`) */
  private dress(slot: RigSlot, r: RemotePlayer) {
    const want = r.profile.app ? `${r.id}:${r.pv}` : '';
    if (want === slot.dressed || !this.host.dress) return;
    if (this.dressT > 0) return;
    this.dressT = APPLY_GAP;
    slot.dressed = want;
    this.host.dress(slot.char, r.profile.app, slot.base);
    slot.anim = '';
    this.stats.dressed++;
  }

  /** Aussehen eines Mitspielers auf seiner Figur (Prüfungen): Kennung + Steckbrief-Version oder '' */
  dressedOf(id: string): string { for (const s of this.rigs) if (s.id === id) return s.dressed; return ''; }
  /** Figur eines Mitspielers (Prüfungen) */
  rigOf(id: string): Character | null { for (const s of this.rigs) if (s.id === id) return s.char; return null; }

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
