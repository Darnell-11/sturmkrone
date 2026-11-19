// RaidDirector: führt eine Belagerung durch. Er verbindet die reine Sitzung (raidSession.ts) mit der Welt: baut die Insel, tauscht die Hauptkarte gegen
// die Instanz (alles andere wird ausgeblendet und angehalten), stellt Wachflotte, Eskorten und Küstenbatterien, lässt an Land Gegnerwellen,
// dichte Verbände (Horde), Hauptmänner mit Aura und den Endboss erscheinen und räumt am Ende alles vollständig weg. Die Welt (SeaWorld) reicht ihm
// über `RaidHostWorld` nur, was er braucht.
import { Color, Vector3, type Scene } from 'three';
import type { Enemy } from '../entities/enemy';
import type { NavalSystem } from '../naval/naval';
import type { CombatSystem } from '../combat/combat';
import type { IslandDef } from '../data/regions';
import type { Faction } from '../core/save/types';
import { FACTIONS, type FactionId } from '../data/factions';
import type { BossMech, EnemyDef } from '../data/combat';
import { factionShipLook } from '../data/ships';
import type { AmmoId } from '../data/ships';
import type { Ship } from '../entities/ship/ship';
import type { TroopFoe } from '../entities/troops/squad';
import type { DebrisSystem } from '../world/debris';
import type { ParticleSystem } from '../world/particles';
import type { SmokeSystem } from '../world/smoke';
import type { IslandGround, Pier } from '../world/islandGround';
import { audio } from '../audio/audio';
import { Horde, hordePalette, HORDE_DMG, type HordeOrigin } from './horde';
import { captainDef, RAID_BOSSES } from './raidBosses';
import { buildRaidLayout, hashString } from './raidLayout';
import { rollRaidLoot, type LootOwned, type PersonalLoot } from './raidLoot';
import { raidReward, type RaidReward } from './raidRules';
import { RaidInstanceSession } from './raidSession';
import { RaidWorld } from './raidWorld';
import type {
  CaptainPost, DistrictId, EnemyKindId, RaidEvent, RaidLayout, RaidOutcome, RaidPartyContext, RaidRoute, RaidSlotState, RaidSquadDef, RaidWaveDef, StructureState,
} from './raidTypes';
import { clamp01 } from '../core/mathUtil';

/** Was die Welt dem Raid zur Verfügung stellt (SeaWorld baut diese Schnittstelle aus ihren privaten Teilen) */
export interface RaidHostWorld {
  scene: Scene;
  ground: IslandGround;
  naval: NavalSystem;
  combat: CombatSystem;
  smoke: SmokeSystem;
  sparks: ParticleSystem;
  debris: DebrisSystem;
  playerShip: Ship;
  /** Lage des eigenen Schiffs */
  shipPos(): { x: number; z: number; heading: number };
  /** Spielfigur zu Fuß auf der Raid-Insel (nicht an Deck): Position, sonst null */
  footOnIsland(): { x: number; y: number; z: number } | null;
  message(text: string): void;
  banner(title: string, sub: string): void;
  cutin(text: string): void;
  /** Schiff versetzen (setzt Zustände zurück und räumt Seegefecht und Landgang auf) */
  teleportShip(x: number, z: number, heading: number): void;
  /** Hauptkarte pausieren (Inseln, Figuren, Bewuchs, Fauna, Leben ausblenden und anhalten) und die Raid-Insel einsetzen */
  suspendMain(world: RaidWorld, def: IslandDef): void;
  /** Raid-Insel entfernen und die Hauptkarte wieder einsetzen */
  resumeMain(): void;
  /** Stege des Burghafens bei der Freigabe anmelden (Anlege-System) bzw. abmelden */
  setRaidPiers(piers: Pier[]): void;
  /** Wetter für die Belagerung festlegen (klare Sicht: Nebel würde Wachflotte und Batterien verbergen); das Spiel stellt es danach wieder her */
  setWeather(id: 'klar' | 'bewoelkt'): void;
  /** Dem Spiel die Oberfläche melden (Ziele, Hinweise) */
  view(v: RaidView | null): void;
  /** Der Raid ist zu Ende: Welt ist wiederhergestellt, Lohn und Folgen setzt das Spiel */
  ended(info: RaidEnd): void;
}

export interface RaidEnd {
  outcome: RaidOutcome; route: RaidRoute | null; reward: RaidReward | null; factionId: IslandDef['factionId']; defId: string; seconds: number;
  /** Persönliche Beute je Teilnehmer (nur beim Sieg) */
  loot: PersonalLoot[];
  bossId: string;
  level: number;
  /** Teilnehmer am Raid (für Mehrspieler: wer Beute bekommt) */
  participants: string[];
}

/** Anzeige-Daten der Oberfläche (reine Daten) */
export interface RaidView {
  title: string;
  phase: RaidInstanceSession['phase'];
  route: RaidRoute | null;
  hint: string;
  objectives: { label: string; progress: number; required: number; done: boolean }[];
  structures: { label: string; frac: number; state: StructureState; required: boolean }[];
  districts: { label: string; state: 'offen' | 'aktiv' | 'erobert'; fallen: number; total: number }[];
  participants: number;
  /** Markierungen für Karte und Kompass: Landungsplätze, Bauwerke */
  marks: { x: number; z: number; kind: 'slot' | 'gate' | 'battery' | 'castle'; name: string }[];
  /** Endboss: Name und Phase (null, solange er nicht erschienen ist), dazu die Bedrohungsliste für die Anzeige */
  boss: { name: string; phase: number; threat: string[] } | null;
  /** Hauptmänner im Kampf: Name, Aura und Lebensanteil */
  captains: { name: string; aura: string; frac: number }[];
}

/** Abstand (m), ab dem ein Spieler zu weit vom Raid wegsegelt: Rückzug */
const LEAVE_RADIUS = 1400;

type Origin = DistrictId | 'gate' | 'castle' | 'keep';

interface SpawnItem { kind: EnemyKindId; level: number; district: Origin; x: number; z: number; perchY?: number; name?: string; def?: EnemyDef }

export class RaidDirector {
  readonly session: RaidInstanceSession;
  readonly layout: RaidLayout;
  world: RaidWorld | null = null;
  /** Die Verbände der Verteidiger (dichte Formationen, instanziert gezeichnet) */
  horde: Horde | null = null;
  private tracked: { e: Enemy; district: Origin; counted: boolean }[] = [];
  private queue: { wave: RaidWaveDef; level: number; district: DistrictId | 'gate' | 'castle' }[] = [];
  /** Einzelne Gegner warten auf ihr Erscheinen: höchstens einer je 0,14 s (jede Figur kostet beim Erzeugen; so gibt es keine Ruckler bei großen Wellen) */
  private spawnQ: SpawnItem[] = [];
  private spawnT = 0;
  private battery = new Map<string, number>();
  private countedGuards = new Set<string>();
  private spawnedGate = false;
  private spawnedCastle = false;
  private spawnedDistricts = false;
  private boss: Enemy | null = null;
  private origin: { x: number; z: number; heading: number };
  private endT = -1;
  private began = false;
  private disposed = false;
  private time = 0;
  private hintT = 0;
  private viewT = 0;
  private reward: RaidReward | null = null;
  private loot: PersonalLoot[] = [];
  private foeBuf: TroopFoe[] = [];
  /** Die Spielfigur als Ziel der Verbände (Werte werden jedes Mal frisch gelesen) */
  private readonly playerFoe: TroopFoe;

  constructor(private host: RaidHostWorld, readonly def: IslandDef, ctx: RaidPartyContext, private opts: { level: number; align: Faction; playerId: string; firstClear: boolean; conquestsBefore?: number; owned?: () => LootOwned }) {
    const seaAngle = Math.atan2(-def.z, -def.x);
    this.layout = buildRaidLayout(def.factionId ?? 'marine', ctx.seed, seaAngle);
    this.session = new RaidInstanceSession(ctx, this.layout);
    this.origin = host.shipPos();
    this.session.on((e) => this.onEvent(e));
    const cb = host.combat;
    this.playerFoe = { get x() { return cb.player?.x ?? 0; }, get z() { return cb.player?.z ?? 0; }, radius: 0.55, get alive() { return !!cb.player?.active; } };
  }

  get playerId() { return this.opts.playerId; }
  /** Ort des Flaggschiffs vor dem Raid (dorthin kehrt es zurück; beim Speichern gilt er als Lage des Schiffs) */
  get originPos() { return this.origin; }
  get center() { return { x: this.def.x, z: this.def.z }; }
  get over() { return this.session.over; }
  get fid() { return this.def.factionId ?? 'marine'; }

  // ---------- Beginn ----------

  /** Instanz anlegen: Insel bauen, Hauptkarte pausieren, Flotte aufstellen, Wachflotte erscheinen lassen */
  begin() {
    if (this.began) return;
    this.began = true;
    const h = this.host, L = this.layout, fid = this.fid;
    this.origin = h.shipPos();
    h.teleportShip(this.def.x + L.staging.x, this.def.z + L.staging.z, L.staging.heading);
    this.world = new RaidWorld({
      scene: h.scene, layout: L, center: this.center, factionId: fid, smoke: h.smoke, sparks: h.sparks, debris: h.debris,
      host: { damage: (id, dmg, ammo) => this.damage(id, dmg, ammo) },
    });
    h.suspendMain(this.world, this.def);
    h.ground.shipBlockers = this.world.shipBlockers;
    h.combat.leaveIsland();
    // Verbände der Verteidiger: dieselbe Liste liest das Kampfsystem (Treffer, Fähigkeiten) und die eigenen Trupps (Gegner)
    this.horde = new Horde(h.scene, hordePalette(fid), {
      ground: h.ground,
      nav: () => h.combat.nav,
      targets: () => this.targets(),
      hit: (t, dmg, dx, dz, heavy) => this.hordeHit(t, dmg, dx, dz, heavy),
      shot: (x, y, z, tx, tz) => {
        const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz) || 1;
        h.sparks.emit(7, x + (dx / d) * 0.9, y, z + (dz / d) * 0.9, { speed: 3, up: 0.6, life: 0.35, color: _shotColor.set(1.0, 0.82, 0.5).multiplyScalar(3), gravity: -0.5, spread: 0.5 });
        audio.play('swing', 0.3, { x, y, z });
      },
      text: () => {},
    }, this.opts.level - 1, 'horde-' + this.session.state.ctx.raidInstanceId);
    h.combat.mass = this.horde.squads;
    h.combat.onSummon = (e, mech) => this.summon(e, mech);
    h.combat.onBossPhase = (e, phase) => this.bossPhase(e, phase);
    const n = h.naval;
    n.clear();
    n.raidMode = true;
    n.raidEscorts = Math.min(3, this.session.participant(this.opts.playerId)?.escorts ?? 0) + (this.session.participant(this.opts.playerId)?.mercenaries ?? 0);
    n.raidTargets = this.world;
    h.setWeather('bewoelkt');
    const look = factionShipLook(fid);
    for (const g of L.guard) n.spawnGuard({ ...g, x: this.def.x + g.x, z: this.def.z + g.z }, { ...look }, this.opts.level, fid, this.session.partyScale);
    this.session.start(this.time);
    h.banner(`Belagerung von ${this.def.name}`, `${FACTIONS[fid].name} · Stufe ${this.opts.level}`);
    h.message('Die Wachflotte hält die Zufahrt. Versenke sie, dann sind die Landungszonen frei.');
    this.pushView(true);
  }

  /** Ziele der Verbände: die Spielfigur und alles in der Crew (Offiziere und Trupps) */
  private targets(): readonly TroopFoe[] {
    const b = this.foeBuf;
    b.length = 0;
    if (this.playerFoe.alive) b.push(this.playerFoe);
    for (const a of this.host.combat.allies) if (a.alive) b.push(a);
    return b;
  }

  /** Treffer eines Verbands: auf die Spielfigur (abgeschwächt, mit Block und Ausweichen) oder auf die Crew */
  private hordeHit(t: TroopFoe, dmg: number, dx: number, dz: number, heavy: boolean) {
    if (t === this.playerFoe) this.host.combat.strikePlayer(dmg * HORDE_DMG.player, dx, dz, heavy);
    else (t as unknown as { receive(d: number, x: number, z: number): void }).receive(dmg * HORDE_DMG.crew, dx, dz);
  }

  // ---------- Schaden an Bauwerken ----------

  private damage(id: string, dmg: number, ammo: AmmoId) {
    const r = this.session.damageStructure(id, dmg, ammo, this.opts.playerId);
    if (r?.changed) {
      const label = this.layout.structures.find((s) => s.structureId === id)?.label ?? id;
      if (r.state === 'DAMAGED') this.host.message(`${label} ist schwer getroffen!`);
      else if (r.state === 'BREACHED') this.host.message(`${label} ist eingestürzt!`);
    }
    return r;
  }

  private onEvent(e: RaidEvent) {
    const h = this.host;
    switch (e.type) {
      case 'structure': this.world?.setState(e.structureId, e.state); this.pushView(true); break;
      case 'slots':
        if (e.zone === 'harbor') {
          // Burghafen frei: Stege anmelden, damit man anlegen kann
          if (this.world) h.setRaidPiers(this.world.piers.map((p, i) => ({ ...p, id: `raid-pier-${i + 1}` })));
          h.banner('Der Burghafen ist offen!', 'Lege an einem der Burgstege an – direkt vor dem Burgtor');
        } else h.message('Die Wachflotte ist gefallen: die Landungsbuchten am Strand sind frei!');
        this.pushView(true);
        break;
      case 'phase':
        if (e.phase === 'assault') h.banner('Landungszonen frei', 'Route A: Seetor einreißen · Route B: am Strand landen');
        break;
      case 'route': h.message(e.route === 'A' ? 'Route A: der Weg zum Burgtor ist kurz, aber die Burg ist stark besetzt.' : 'Route B: durch vier Stadtviertel hinauf zur Burg – ein langer Marsch.'); break;
      case 'district':
        if (e.what === 'entered') this.enterDistrict(e.districtId);
        else h.banner(`${this.layout.districts.find((d) => d.districtId === e.districtId)?.label ?? 'Viertel'} erobert`, `${Object.values(this.session.state.districts).filter((d) => d.cleared).length} von 4 Vierteln`);
        this.pushView(true);
        break;
      case 'boss':
        if (e.what === 'phase') { const B = RAID_BOSSES[this.fid]; h.banner(B.name, B.phase2); }
        this.pushView(true);
        break;
      case 'end': this.onEnd(e.outcome); break;
      default: break;
    }
  }

  // ---------- Landung ----------

  /** Wo darf man landen? Strand: Landungsbuchten (nach dem Fall der Wachflotte); Burghafen: nur an den Stegen nach dem Durchbruch (Anlegen) */
  landing(x: number, z: number): { ok: boolean; reason: string; slot: RaidSlotState | null } {
    const s = this.session;
    if (s.over) return { ok: false, reason: 'Der Raid ist beendet.', slot: null };
    if (!s.state.landingOpen) return { ok: false, reason: 'Die Wachflotte hält die Küste: versenke zuerst ihre Kriegsschiffe.', slot: null };
    // Landungsplätze liegen in Inselkoordinaten, Orte der Welt in Weltkoordinaten
    const slot = s.slotNear(x - this.def.x, z - this.def.z, 150, 'beach');
    if (!slot) return { ok: false, reason: 'Hier ist keine Landungsbucht frei: segle zu einer markierten Bucht am Strand – oder reiße das Seetor ein und lege im Burghafen an.', slot: null };
    return { ok: true, reason: slot.label, slot };
  }

  /** Spielfigur ist an Land gegangen (Gangway oder Strickleiter): Anlege-Platz festhalten, Kampfgebiet vorbereiten */
  onAshore(shipX: number, shipZ: number) {
    const s = this.session;
    const slot = s.slotNear(shipX - this.def.x, shipZ - this.def.z, 170, undefined, false);
    if (slot) s.claimSlot(slot.slotId, this.opts.playerId);
    this.reviveOrphans();
    if (this.world) this.host.combat.beginEvent(this.world.walk);
    // Route B: die Verbände der vier Viertel stehen schon auf ihren Posten (instanziert, kaum Kosten) – sie rücken erst vor, wenn jemand näher kommt
    if (s.route === 'B' && !this.spawnedDistricts) {
      this.spawnedDistricts = true;
      for (const d of this.layout.districts) this.spawnSquads(d.squads, d.districtId);
    }
    this.pushView(true);
  }

  // ---------- Schleife ----------

  update(dt: number) {
    if (this.disposed || !this.began) return;
    this.time += dt;
    if (this.endT >= 0) { this.endT -= dt; if (this.endT <= 0) this.finish(); return; }
    const s = this.session;
    if (s.over) return;
    this.world?.update(dt);
    this.trackGuards();
    this.fireBatteries(dt);
    this.landUpdate(dt);
    this.updateHorde(dt);
    // Flaggschiff weit vom Raid weg: Rückzug
    const sp = this.host.shipPos();
    if (Math.hypot(sp.x - this.def.x, sp.z - this.def.z) > LEAVE_RADIUS && !this.host.footOnIsland()) { this.retreat('Du hast den Kampfplatz verlassen.'); return; }
    this.hintT -= dt;
    this.viewT -= dt;
    if (this.viewT <= 0) { this.viewT = 0.5; this.pushView(false); }
  }

  /** Verbände vorrücken lassen und ihre Verluste als Zählung der Viertel gutschreiben */
  private updateHorde(dt: number) {
    const hd = this.horde;
    if (!hd || !hd.members.length) return;
    const fp = this.host.footOnIsland();
    const sp = this.host.shipPos();
    hd.update(dt, this.time, { x: fp?.x ?? sp.x, z: fp?.z ?? sp.z, yaw: 0 }, fp?.x ?? sp.x, fp?.z ?? sp.z);
    for (const c of hd.collectCredit()) {
      const o = c.origin as HordeOrigin;
      if (o === 'gate' || o === 'castle') { const p = this.session.participant(this.opts.playerId); if (p) p.kills += c.n; continue; }
      for (let i = 0; i < c.n; i++) this.session.districtFoe(o as DistrictId, this.opts.playerId);
    }
  }

  /** Wachschiffe, die gesunken oder erobert sind, der Sitzung melden (einmal je Schiff) */
  private trackGuards() {
    if (this.countedGuards.size >= this.layout.guard.length) return;
    const list = this.host.naval.enemies;
    // Nach den Kennungen der Wachflotte suchen (nicht nur nach dem, was noch in der Liste steht): ein gesunkenes Schiff, das die Seeschlacht
    // schon abgeräumt hat, zählt trotzdem als gefallen
    for (const g of this.layout.guard) {
      if (this.countedGuards.has(g.guardId)) continue;
      let e: (typeof list)[number] | undefined;
      for (const x of list) if (x.guardId === g.guardId) { e = x; break; }
      if (e && e.ship.alive && !e.captured) continue;
      this.countedGuards.add(g.guardId);
      this.session.guardDown(this.opts.playerId);
      this.host.message(`${e?.name ?? g.name ?? 'Wachschiff'} ist gefallen (${this.session.state.fleetDown}/${this.session.state.fleetTotal}).`);
    }
  }

  /** Küstenbatterien beschießen die eigenen Schiffe in Reichweite (bis sie eingerissen sind) */
  private fireBatteries(dt: number) {
    const w = this.world;
    if (!w) return;
    const targets: Ship[] = [];
    const ps = this.host.playerShip;
    if (ps.alive && !ps.sinking) targets.push(ps);
    for (const e of this.host.naval.enemies) if (e.companion && e.ship.alive && !e.ship.sinking) targets.push(e.ship);
    if (!targets.length) return;
    const scale = 1 + Math.max(0, this.opts.level - 10) * 0.04;
    for (const st of w.structures.values()) {
      const f = st.def.fire;
      if (!f || st.state === 'BREACHED') continue;
      const t = (this.battery.get(st.def.structureId) ?? f.reload * Math.random()) - dt;
      if (t > 0) { this.battery.set(st.def.structureId, t); continue; }
      let best: Ship | null = null, bd = f.range;
      for (const s of targets) { const d = Math.hypot(s.x - st.wx, s.z - st.wz); if (d < bd) { bd = d; best = s; } }
      if (!best) { this.battery.set(st.def.structureId, 0.6); continue; }
      this.battery.set(st.def.structureId, f.reload * (st.state === 'DAMAGED' ? 1.5 : 1) * (0.9 + Math.random() * 0.2));
      this.host.naval.fireBattery(_from.set(st.wx, st.y + st.def.h, st.wz), best, f.dmg * scale);
    }
  }

  // ---------- Gegner an Land ----------

  private landUpdate(dt: number) {
    const s = this.session;
    const fp = this.host.footOnIsland();
    if (!fp || s.state.phase !== 'assault') { this.countFallen(); return; }
    this.pump(dt);
    const L = this.layout, c = this.center;
    // Viertel betreten
    for (const d of L.districts) {
      if (s.district(d.districtId)?.entered) continue;
      if (Math.hypot(fp.x - (c.x + d.x), fp.z - (c.z + d.z)) < d.radius * 0.85) s.enterDistrict(d.districtId);
    }
    // Burgtor (Route A): Torwache aus zwei Verbänden und einem Hauptmann, sobald man den Burgsteg verlässt
    if (!this.spawnedGate && Math.hypot(fp.x - (c.x + L.castle.gateN.x), fp.z - (c.z + L.castle.gateN.z)) < 58) {
      this.spawnedGate = true;
      this.spawnSquads(L.gateSquads, 'gate');
      this.queueCaptain('tor');
    }
    // Burg: Besatzung, Hauptmänner und Endboss
    if (!this.spawnedCastle && Math.hypot(fp.x - (c.x + L.castle.x), fp.z - (c.z + L.castle.z)) < L.castle.ringR + 4) {
      this.spawnedCastle = true;
      this.spawnSquads(L.castle.squads, 'castle');
      this.spawnBoss();
      for (const w of L.castle.waves) this.enqueue(w, 'castle', 1);
      this.queueCaptain('burg1');
      if (s.route !== 'B') this.queueCaptain('burg2');
    }
    this.stream();
    this.countFallen();
  }

  private enqueue(wave: RaidWaveDef, district: DistrictId | 'gate' | 'castle', levelOffset: number) {
    this.queue.push({ wave, district, level: this.opts.level + levelOffset });
  }

  /** Verbände aufstellen: instanziert (kein Einzelobjekt je Soldat), Größe wächst mit den Mitspielern */
  private spawnSquads(defs: RaidSquadDef[], origin: HordeOrigin) {
    const hd = this.horde;
    if (!hd) return;
    const c = this.center, k = this.session.partyScale;
    for (const d of defs) hd.spawn(d, c.x + d.x, c.z + d.z, origin, k);
  }

  /** Hauptmann auf seinem Posten: stark gepanzert, mit Aura und Bedrohungstabelle; erscheint wie die anderen Einzelfiguren gestaffelt */
  private queueCaptain(post: CaptainPost) {
    const cap = this.layout.captains.find((x) => x.post === post);
    if (!cap) return;
    const fid = this.fid;
    const district: Origin = post === 'tor' ? 'gate' : post === 'burg1' || post === 'burg2' ? 'castle' : post;
    const def = captainDef(fid, cap.index);
    const c = this.center;
    this.spawnQ.push({ kind: 'hauptmann', level: this.opts.level + 1, district, x: c.x + cap.x, z: c.z + cap.z, name: def.label, def });
  }

  /** Viertel betreten: Dachschützen sofort, Wellen der Reihe nach, der Hauptmann des Viertels tritt vor */
  private enterDistrict(id: DistrictId) {
    const d = this.layout.districts.find((x) => x.districtId === id);
    const w = this.world;
    if (!d || !w) return;
    const lvl = this.opts.level - 2 + d.order;
    this.host.banner(d.label, `Viertel ${d.order} von 4`);
    for (const wave of d.waves) this.enqueue(wave, id, lvl - this.opts.level);
    // Dachschützen: Musketiere stehen fest auf den flachen Dächern der Schützenhäuser
    const c = this.center;
    for (const p of d.perches) {
      const gy = w.solo.height(c.x + p.x, c.z + p.z);
      const roofY = (Number.isFinite(gy) ? gy : 1.3) + p.h + 0.55;
      this.spawnQ.push({ kind: 'musketier', level: lvl, district: id, x: c.x + p.x, z: c.z + p.z, perchY: roofY });
    }
    if (id === 'hafen' || id === 'markt' || id === 'aufstieg') this.queueCaptain(id);
  }

  /** Die nächste Welle erscheint, wenn von den bisherigen höchstens drei stehen und nicht zu viele Gegner gleichzeitig auf der Insel sind (Leistung) */
  private stream() {
    if (!this.queue.length) return;
    const alive = this.tracked.reduce((n, t) => n + (!t.counted && t.e.alive && !t.e.perch ? 1 : 0), 0) + this.spawnQ.filter((q) => q.perchY === undefined).length;
    if (alive > 4) return;
    const next = this.queue.shift()!;
    const c = this.center;
    const kinds = next.wave.kinds.slice(0, 12);
    // Ring um die Mitte der Welle: erst kommen die Frontkämpfer, dann die Schützen (Reihenfolge der Daten)
    kinds.forEach((kind, i) => {
      const a = (i / kinds.length) * Math.PI * 2, rr = next.wave.spread * (0.4 + (i % 2) * 0.5);
      this.spawnQ.push({ kind, level: Math.max(1, next.level), district: next.district, x: c.x + next.wave.x + Math.cos(a) * rr, z: c.z + next.wave.z + Math.sin(a) * rr });
    });
  }

  /** Einen Gegner aus der Warteschlange erscheinen lassen (höchstens alle 0,14 s) */
  private pump(dt: number) {
    this.spawnT -= dt;
    if (this.spawnT > 0 || !this.spawnQ.length) return;
    this.spawnT = 0.14;
    const r = this.spawnQ.shift()!;
    const list = this.host.combat.spawnWave([r.kind], r.level, this.opts.align, `raid:${r.district}`, { x: r.x, z: r.z }, 0, { power: this.def.factionId ?? undefined, name: r.name, def: r.def });
    for (const e of list) {
      if (r.perchY !== undefined) { e.x = r.x; e.z = r.z; e.homeX = e.x; e.homeZ = e.z; e.y = r.perchY; e.perch = { y: r.perchY }; }
      this.tracked.push({ e, district: r.district, counted: false });
    }
  }

  // ---------- Endboss ----------

  private spawnBoss() {
    const c = this.center, a = this.layout.castle.arena;
    const B = RAID_BOSSES[this.fid];
    const list = this.host.combat.spawnWave(['legende'], this.opts.level + 3, this.opts.align, 'raid:keep', { x: c.x + a.x, z: c.z + a.z }, 0, { power: this.def.factionId ?? undefined, name: B.name, def: B.def });
    for (const e of list) { this.tracked.push({ e, district: 'keep', counted: false }); this.boss = e; }
    this.session.bossAppeared(B.id);
    this.host.cutin(B.name);
    this.host.banner(B.name, `${B.title} – ${B.intro}`);
  }

  /** Phasenwechsel des Endbosses (von der Kampfwelt gemeldet) */
  private bossPhase(e: Enemy, phase: number) {
    if (e !== this.boss) return;
    this.session.bossPhaseChanged(phase);
  }

  /** Verstärkung des Bosses: Verbände erscheinen als Schildwall vor ihm, als Flanke neben ihm oder als Ring (gerufen mit `summon`) */
  private summon(boss: Enemy, mech: Extract<BossMech, { kind: 'summon' }>) {
    const hd = this.horde, h = this.host;
    if (!hd || boss !== this.boss || this.over) return;
    if (hd.addHeads > 70) return;
    const fp = h.footOnIsland();
    const tx = fp?.x ?? boss.x, tz = fp?.z ?? boss.z + 1;
    const toT = Math.atan2(tx - boss.x, tz - boss.z);
    const n = Math.max(1, mech.n ?? 2), typ = mech.typ ?? 'schwert', heads = mech.heads ?? 8;
    const sx = Math.sin(toT), sz = Math.cos(toT), lx = Math.cos(toT), lz = -Math.sin(toT);
    for (let i = 0; i < n; i++) {
      let x = boss.x, z = boss.z, yaw = toT;
      if (mech.shape === 'wall') {
        const off = (i - (n - 1) / 2) * 6.2;
        x = boss.x + sx * 7.5 + lx * off; z = boss.z + sz * 7.5 + lz * off;
      } else if (mech.shape === 'flank') {
        const side = i % 2 === 0 ? -1 : 1, row = Math.floor(i / 2);
        x = boss.x + lx * side * (8 + row * 5) + sx * 2; z = boss.z + lz * side * (8 + row * 5) + sz * 2;
      } else {
        const a = (i / n) * Math.PI * 2;
        x = boss.x + Math.cos(a) * 10; z = boss.z + Math.sin(a) * 10; yaw = Math.atan2(boss.x - x, boss.z - z) + Math.PI;
      }
      const g = h.ground.constrain(x, z, 1.4);
      const m = hd.spawn({ squadId: `ruf-${Math.round(this.time * 10)}-${i}`, typ, heads, x: 0, z: 0, yaw }, g.x, g.z, 'add', this.session.partyScale, 45);
      m.q.alertT = 10;
    }
    h.message(`${mech.label ?? 'Verstärkung'}: ${boss.name ?? 'Der Boss'} ruft ${n} Verbände herbei!`);
  }

  /**
   * Nach K.O. und Rettung räumt der Kampf alle Gegner ab (`leaveIsland`), die Viertel bleiben aber unerobert: wer noch stand, tritt beim nächsten
   * Landgang an seinem Platz wieder an (sonst bliebe ein Viertel für immer bei „15 von 16“ stehen). Verbände bleiben stehen (sie sind keine Figuren).
   */
  private reviveOrphans() {
    if (!this.tracked.length) return;
    const present = this.host.combat.enemies;
    let n = 0;
    for (const t of this.tracked) {
      const e = t.e;
      if (t.counted || !e.alive || present.includes(e)) { this.tracked[n++] = t; continue; }
      if (e === this.boss) this.boss = null;
      this.spawnQ.push({ kind: e.kind, level: e.level, district: t.district, x: e.homeX, z: e.homeZ, perchY: e.perch?.y, name: e.name, def: e.def.raid ? e.def : undefined });
    }
    this.tracked.length = n;
    // der Boss erscheint nach dem Wiederaufstellen neu (er setzt seine Phase zurück)
    if (!this.boss && this.spawnQ.some((q) => q.district === 'keep')) this.session.bossPhase = 1;
  }

  /** Gefallene Gegner den Vierteln und Zielen gutschreiben */
  private countFallen() {
    if (!this.tracked.length) return;
    for (const t of this.tracked) {
      if (t.counted || t.e.alive) continue;
      t.counted = true;
      if (t.district === 'keep') this.session.keepFallen(this.opts.playerId);
      else if (t.district !== 'gate' && t.district !== 'castle') this.session.districtFoe(t.district, this.opts.playerId);
      else { const p = this.session.participant(this.opts.playerId); if (p) p.kills++; }
    }
    // Verweise auf Gefallene lösen (der Kampf entfernt die Figuren selbst)
    let n = 0;
    for (const t of this.tracked) if (!t.counted) this.tracked[n++] = t;
    this.tracked.length = n;
  }

  // ---------- Ende ----------

  /** Lage für die Musik: Route, Phase, Ende und Endboss (Macht, Lebensanteil, Kampfphase), solange er lebt */
  musicState(): { route: RaidRoute | null; phase: string; over: boolean; boss: { faction: FactionId; hp: number; phase: number } | null } {
    const s = this.session, b = this.boss;
    return { route: s.route, phase: s.state.phase, over: s.over, boss: b && b.alive && b.maxHp > 0 ? { faction: this.fid, hp: clamp01(b.hp / b.maxHp), phase: s.bossPhase } : null };
  }

  /** Rückzug (Menü, Flaggschiff gesunken, zu weit weg): Instanz wird sauber abgebaut */
  retreat(why: string) {
    if (this.session.over || this.disposed) return;
    this.host.message(why);
    this.session.end('retreat', this.time);
  }

  private onEnd(outcome: RaidOutcome) {
    if (outcome === 'victory') {
      this.reward = raidReward(this.opts.level, this.session.route, this.opts.firstClear);
      // persönliche Beute: jeder Teilnehmer bekommt seinen eigenen Wurf (nichts wird geteilt)
      const owned = this.opts.owned?.() ?? { gear: [], sails: [], ornaments: [] };
      this.loot = rollRaidLoot(this.session.state.ctx, { level: this.opts.level, conquestsBefore: this.opts.conquestsBefore ?? 0, owned, firstClear: this.opts.firstClear });
      this.session.state.ctx.personalLoot = Object.fromEntries(this.loot.map((l) => [l.participantId, l]));
      this.host.banner(`${this.def.name} ist gefallen!`, `${FACTIONS[this.fid].name} streicht die Flagge`);
      this.endT = 5;
    } else this.endT = 1.2;
    this.pushView(true);
  }

  /** Nach kurzer Pause: Welt wiederherstellen, Raid-Meshes freigeben, zurück auf die Hauptkarte */
  private finish() {
    if (this.disposed) return;
    const B = RAID_BOSSES[this.fid];
    const info: RaidEnd = {
      outcome: this.session.state.outcome ?? 'retreat', route: this.session.route, reward: this.reward, factionId: this.def.factionId, defId: this.def.id,
      seconds: Math.round(this.time), loot: this.loot, bossId: B.id, level: this.opts.level, participants: this.session.participants.map((p) => p.playerId),
    };
    this.dispose();
    this.host.teleportShip(this.origin.x, this.origin.z, this.origin.heading);
    this.host.ended(info);
  }

  /** Alles abbauen: Gegner, Verbände, Wachschiffe, Batterien, Stege, Kollider, Welt – danach ist die Hauptkarte wie vorher */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const h = this.host;
    h.combat.leaveIsland();
    h.combat.mass = [];
    h.combat.onSummon = null;
    h.combat.onBossPhase = null;
    this.horde?.dispose();
    this.horde = null;
    const n = h.naval;
    n.raidTargets = null;
    n.raidMode = false;
    n.raidEscorts = null;
    n.clear();
    h.setRaidPiers([]);
    h.ground.shipBlockers = [];
    h.resumeMain();
    this.world?.dispose();
    this.world = null;
    this.tracked.length = 0;
    this.queue.length = 0;
    this.spawnQ.length = 0;
    this.battery.clear();
    this.boss = null;
    h.view(null);
  }

  // ---------- Anzeige ----------

  /** Aktueller Hinweis: was ist jetzt zu tun? */
  private hint(): string {
    const s = this.session;
    if (s.over) return s.state.outcome === 'victory' ? 'Sieg! Die Burg ist erobert.' : 'Rückzug: die Flotte kehrt zurück.';
    if (!s.state.landingOpen) return `Wachflotte versenken (${s.state.fleetDown}/${s.state.fleetTotal}). Küstenbatterien feuern auf Schiffe in Reichweite.`;
    if (!s.route) return 'Route A: Seetor und beide Mauerflügel von See einreißen, dann im Burghafen anlegen. Route B: an einer Landungsbucht am Strand an Land gehen.';
    if (s.bossPhase > 0) return `Besiege ${RAID_BOSSES[this.fid].name}${s.bossPhase > 1 ? ' – er ist in Phase 2' : ''}. Weiche den roten Flächen aus!`;
    if (s.route === 'A') {
      if (!s.breached) return `Seetor und Mauerflügel zusammenschießen (${s.objective('breach').progress}/${s.objective('breach').required}).`;
      return this.host.footOnIsland() ? 'Hinauf zum Burgtor und die Burg stürmen!' : 'Der Burghafen ist offen: lege an einem Burgsteg an.';
    }
    const next = Object.values(s.state.districts).sort((a, b) => a.order - b.order).find((d) => !d.cleared);
    return next ? `Weiter durch die Viertel: ${next.label}.` : 'Alle Viertel erobert: hinauf zur Burg!';
  }

  private pushView(_force = false) {
    const s = this.session, L = this.layout;
    const hint = this.hint();
    const c = this.center;
    const marks: RaidView['marks'] = [];
    for (const sl of s.unlockedSlots()) marks.push({ x: c.x + sl.x, z: c.z + sl.z, kind: 'slot', name: sl.label });
    for (const st of L.structures) {
      const r = s.structure(st.structureId);
      if (!r || r.state === 'BREACHED') continue;
      if (st.kind === 'seagate') marks.push({ x: c.x + st.x, z: c.z + st.z, kind: 'gate', name: st.label });
      else if (st.kind === 'battery') marks.push({ x: c.x + st.x, z: c.z + st.z, kind: 'battery', name: st.label });
    }
    if (s.state.phase === 'assault') marks.push({ x: c.x + L.castle.x, z: c.z + L.castle.z, kind: 'castle', name: 'Burg' });
    const showA = !s.route || s.route === 'A';
    const B = RAID_BOSSES[this.fid];
    const be = this.boss && this.boss.alive ? this.boss : null;
    const names = new Map<string, string>();
    names.set(this.host.combat.player?.entityId ?? '', 'Du');
    for (const a of this.host.combat.allies) if (a.entityId) names.set(a.entityId, (a as unknown as { def?: { name?: string } }).def?.name ?? 'Trupp');
    const captains: RaidView['captains'] = [];
    for (const t of this.tracked) if (!t.counted && t.e.alive && t.e.def.raid === 'captain') captains.push({ name: t.e.name ?? t.e.def.label, aura: t.e.def.aura?.label ?? '', frac: t.e.hp / t.e.maxHp });
    const view: RaidView = {
      title: `Belagerung von ${this.def.name}`,
      phase: s.phase,
      route: s.route,
      hint,
      objectives: s.activeObjectives().map((o) => ({ label: o.label, progress: o.progress, required: o.required, done: o.done })),
      structures: showA ? L.structures.filter((x) => x.required || x.kind === 'battery').map((x) => { const r = s.structure(x.structureId)!; return { label: x.label, frac: r.maxHp > 0 ? r.hp / r.maxHp : 0, state: r.state, required: r.required }; }) : [],
      districts: !s.route || s.route === 'B' ? Object.values(s.state.districts).sort((a, b) => a.order - b.order).map((d) => ({ label: d.label, state: d.cleared ? 'erobert' as const : d.entered ? 'aktiv' as const : 'offen' as const, fallen: d.fallen, total: d.total })) : [],
      participants: s.participants.length,
      marks,
      boss: be ? { name: B.name, phase: s.bossPhase || 1, threat: be.threat ? be.threat.ranked().slice(0, 3).map((r) => `${names.get(r.id) ?? 'Mitstreiter'} ${Math.round(r.value)}`) : [] } : null,
      captains: captains.slice(0, 4),
    };
    this.host.view(view);
  }
}

const _from = new Vector3();
const _shotColor = new Color();

/** Neue Raid-Kennung aus Insel und Zeit (eindeutig je Instanz) */
export function newRaidInstanceId(defId: string, now: number): { raidInstanceId: string; seed: number } {
  const seed = hashString(`${defId}:${now}`);
  return { raidInstanceId: `raid-${defId}-${seed.toString(36)}`, seed };
}
