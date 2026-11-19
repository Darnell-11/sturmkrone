// RaidInstanceSession: die Spiellogik einer Belagerung, rein und ohne three.js. Sie kennt Teilnehmer, gemeinsame Ziele, Bauwerke mit
// Lebenspunkten, Anlege-Plätze, Viertel und Phasen; alle Eingänge nehmen die `playerId` des Verursachers entgegen, damit ein Schlachtzug
// mit mehreren Spielern funktioniert (heute einer, später viele). Der Zustand ist reine Daten (`state`): speichern, übertragen, wiederherstellen.
import type {
  DistrictId, RaidEvent, RaidLayout, RaidObjective, RaidOutcome, RaidParticipant, RaidPartyContext, RaidPhase, RaidRoute, RaidSessionState,
  RaidSlotState, RaidSnapshot, RaidStructureState, SlotZone, StructureState,
} from './raidTypes';
import { SIEGE_DAMAGE_MULT, STRUCTURE_AMMO_MULT } from './raidTypes';
import type { FactionId } from '../data/factions';

/** Kontext für einen neuen Raid: der Anführer ist Teilnehmer und trägt die Flotte (Eskorten, Söldner) */
export function createRaidContext(o: {
  raidInstanceId: string; factionId: FactionId; seed: number; leaderPlayerId: string; escorts?: number; mercenaries?: number; flagshipId?: string | null;
}): RaidPartyContext {
  return {
    raidInstanceId: o.raidInstanceId, factionId: o.factionId, seed: o.seed, leaderPlayerId: o.leaderPlayerId,
    participants: [newParticipant(o.leaderPlayerId, true, o.escorts ?? 0, o.mercenaries ?? 0, o.flagshipId ?? null)],
    sharedObjectives: [],
  };
}

export function newParticipant(playerId: string, leader: boolean, escorts = 0, mercenaries = 0, flagshipId: string | null = null): RaidParticipant {
  return { playerId, flagshipId, escorts, mercenaries, leader, alive: true, slotId: null, structureDamage: 0, shipsSunk: 0, kills: 0 };
}

type Listener = (e: RaidEvent) => void;

export class RaidInstanceSession {
  readonly state: RaidSessionState;
  private listeners: Listener[] = [];

  constructor(ctx: RaidPartyContext, layout: Pick<RaidLayout, 'structures' | 'slots' | 'districts' | 'guard'> & Partial<Pick<RaidLayout, 'captains'>>, now = 0, restored?: RaidSessionState) {
    if (restored) { this.state = restored; return; }
    const structures: Record<string, RaidStructureState> = {};
    for (const s of layout.structures) structures[s.structureId] = { structureId: s.structureId, hp: s.maxHp, maxHp: s.maxHp, state: 'INTACT', required: s.required };
    const slots: RaidSlotState[] = layout.slots.map((s) => ({ ...s, unlocked: false, occupiedBy: null }));
    const districts: RaidSessionState['districts'] = {};
    for (const d of layout.districts) {
      districts[d.districtId] = {
        districtId: d.districtId, label: d.label, order: d.order, entered: false, cleared: false,
        total: d.waves.reduce((n, w) => n + w.kinds.length, 0) + d.perches.length + (d.squads ?? []).reduce((n, q) => n + q.heads, 0) + (layout.captains ?? []).filter((c) => c.post === d.districtId).length, fallen: 0,
      };
    }
    const requiredStructures = layout.structures.filter((s) => s.required).length;
    ctx.sharedObjectives = [
      { id: 'fleet', label: 'Wachflotte versenken', required: layout.guard.length, progress: 0, done: false, route: 'both' },
      { id: 'breach', label: 'Seetor und Mauerflügel einreißen', required: requiredStructures, progress: 0, done: false, route: 'A' },
      { id: 'districts', label: 'Vier Stadtviertel erobern', required: layout.districts.length, progress: 0, done: false, route: 'B' },
      { id: 'keep', label: 'Burg stürmen und den Kommandanten besiegen', required: 1, progress: 0, done: false, route: 'both' },
    ];
    this.state = {
      ctx, phase: 'briefing', route: null, structures, slots, districts, fleetTotal: layout.guard.length, fleetDown: 0,
      landingOpen: false, breached: false, keepFallen: false, startedAt: now, endedAt: null, outcome: null,
    };
  }

  /** Aus gespeichertem Zustand wiederherstellen (Reconnect, Server) */
  static restore(state: RaidSessionState): RaidInstanceSession {
    return new RaidInstanceSession(state.ctx, { structures: [], slots: [], districts: [], guard: [] }, 0, state);
  }

  on(l: Listener) { this.listeners.push(l); }
  private emit(e: RaidEvent) { for (const l of this.listeners) l(e); }

  // ---------- Teilnehmer ----------

  get participants() { return this.state.ctx.participants; }
  participant(playerId: string): RaidParticipant | undefined { return this.participants.find((p) => p.playerId === playerId); }
  get alive(): RaidParticipant[] { return this.participants.filter((p) => p.alive); }

  join(playerId: string, escorts = 0, mercenaries = 0, flagshipId: string | null = null): RaidParticipant | null {
    if (this.state.phase === 'victory' || this.state.phase === 'retreat') return null;
    const have = this.participant(playerId);
    if (have) return have;
    const p = newParticipant(playerId, false, escorts, mercenaries, flagshipId);
    this.participants.push(p);
    this.emit({ type: 'participant', playerId, what: 'joined' });
    return p;
  }

  /** Teilnehmer verlässt den Raid; verlässt der Anführer ihn, übernimmt der nächste. Ohne Teilnehmer endet der Raid als Rückzug. */
  leave(playerId: string) {
    const i = this.participants.findIndex((p) => p.playerId === playerId);
    if (i < 0) return;
    const [gone] = this.participants.splice(i, 1);
    if (gone.slotId) this.releaseSlot(playerId);
    this.emit({ type: 'participant', playerId, what: 'left' });
    if (gone.leader && this.participants.length) { this.participants[0].leader = true; this.state.ctx.leaderPlayerId = this.participants[0].playerId; }
    if (!this.participants.length) this.end('retreat');
  }

  /** Teilnehmer ist ausgeschieden (Flaggschiff gesunken, an Land gefallen); sind alle ausgeschieden, endet der Raid als Rückzug */
  down(playerId: string) {
    const p = this.participant(playerId);
    if (!p || !p.alive) return;
    p.alive = false;
    this.emit({ type: 'participant', playerId, what: 'down' });
    if (!this.alive.length) this.end('retreat');
  }

  revive(playerId: string) { const p = this.participant(playerId); if (p) p.alive = true; }

  get leaderId() { return this.state.ctx.leaderPlayerId; }
  /** Wie viele Spieler zählen: skaliert Gegnerzahl und Wachflotte (jeder weitere Spieler 60 % mehr) */
  get partyScale() { return 1 + 0.6 * Math.max(0, this.participants.length - 1); }

  // ---------- Phasen ----------

  get phase(): RaidPhase { return this.state.phase; }

  private setPhase(p: RaidPhase) {
    if (this.state.phase === p) return;
    this.state.phase = p;
    this.emit({ type: 'phase', phase: p });
  }

  /** Aus dem Briefing in die Seeschlacht */
  start(now = 0) {
    if (this.state.phase !== 'briefing') return;
    this.state.startedAt = now;
    this.setPhase('sea');
  }

  get over() { return this.state.phase === 'victory' || this.state.phase === 'retreat'; }

  end(outcome: RaidOutcome, now = 0) {
    if (this.over) return;
    this.state.outcome = outcome;
    this.state.endedAt = now;
    this.setPhase(outcome);
    this.emit({ type: 'end', outcome });
  }

  // ---------- Ziele ----------

  objective(id: RaidObjective['id']): RaidObjective { return this.state.ctx.sharedObjectives.find((o) => o.id === id)!; }
  private progress(id: RaidObjective['id'], value: number) {
    const o = this.objective(id);
    const v = Math.max(0, Math.min(o.required, value));
    if (v === o.progress && o.done === (v >= o.required)) return;
    o.progress = v;
    o.done = v >= o.required;
    this.emit({ type: 'objective', objective: o });
  }

  /** Ziele, die für die gewählte Route zählen (vor der Wahl alle) */
  activeObjectives(): RaidObjective[] {
    const r = this.state.route;
    return this.state.ctx.sharedObjectives.filter((o) => !r || o.route === 'both' || o.route === r);
  }

  // ---------- Seeschlacht ----------

  /** Ein Schiff der Wachflotte ist gesunken oder erobert; sind alle weg, sind die Landungszonen frei (Strand sofort, Burghafen nach dem Durchbruch) */
  guardDown(by: string | null = null) {
    if (this.state.phase !== 'sea' && this.state.phase !== 'assault') return;
    if (this.state.fleetDown >= this.state.fleetTotal) return;
    this.state.fleetDown++;
    const p = by ? this.participant(by) : null;
    if (p) p.shipsSunk++;
    this.progress('fleet', this.state.fleetDown);
    if (this.state.fleetDown >= this.state.fleetTotal && !this.state.landingOpen) {
      this.state.landingOpen = true;
      this.unlock('beach');
      if (this.state.breached) this.unlock('harbor');
      this.setPhase('assault');
    }
  }

  // ---------- Bauwerke ----------

  structure(id: string): RaidStructureState | undefined { return this.state.structures[id]; }

  /**
   * Schaden an einem Bauwerk (Kugeln aus Schiffskanonen). `rawDamage` ist der Kanonenschaden; Munition und Belagerungs-Zuschlag rechnet die
   * Sitzung ein. Zustände: INTACT, DAMAGED (unter 65 % der Lebenspunkte), BREACHED (0 Lebenspunkte: eingerissen).
   */
  damageStructure(structureId: string, rawDamage: number, ammo = 'kugel', by: string | null = null): { state: StructureState; hp: number; changed: boolean } | null {
    const s = this.state.structures[structureId];
    if (!s || s.state === 'BREACHED' || this.over) return null;
    // Schaden zählt nur im Gefecht (nach dem Briefing)
    if (this.state.phase === 'briefing') return null;
    const dmg = rawDamage * (STRUCTURE_AMMO_MULT[ammo] ?? 1) * SIEGE_DAMAGE_MULT;
    const before = s.state;
    s.hp = Math.max(0, s.hp - dmg);
    const p = by ? this.participant(by) : null;
    if (p) p.structureDamage += dmg;
    s.state = s.hp <= 0 ? 'BREACHED' : s.hp / s.maxHp < 0.65 ? 'DAMAGED' : 'INTACT';
    const changed = s.state !== before;
    if (changed) {
      this.emit({ type: 'structure', structureId, state: s.state, previous: before, hp: s.hp });
      if (s.state === 'BREACHED') this.checkBreach();
    }
    return { state: s.state, hp: s.hp, changed };
  }

  /** Zählt die durchbrochenen Pflicht-Bauwerke; sind alle gefallen, werden die Liegeplätze im Burghafen frei (sobald die Landung offen ist) */
  private checkBreach() {
    const req = Object.values(this.state.structures).filter((s) => s.required);
    const done = req.filter((s) => s.state === 'BREACHED').length;
    this.progress('breach', done);
    if (done >= req.length && !this.state.breached) {
      this.state.breached = true;
      if (this.state.landingOpen) this.unlock('harbor');
      if (!this.state.route) this.chooseRoute('A');
    }
  }

  get breached() { return this.state.breached; }

  // ---------- Anlege-Plätze ----------

  private unlock(zone: SlotZone) {
    let any = false;
    for (const s of this.state.slots) if (s.zone === zone && !s.unlocked) { s.unlocked = true; any = true; }
    if (any) this.emit({ type: 'slots', zone, unlocked: true });
  }

  slot(slotId: string): RaidSlotState | undefined { return this.state.slots.find((s) => s.slotId === slotId); }
  unlockedSlots(zone?: SlotZone): RaidSlotState[] { return this.state.slots.filter((s) => s.unlocked && (!zone || s.zone === zone)); }

  /** Nächster freigegebener Anlege-Platz zu einem Punkt innerhalb von maxDist (sonst null); optional nur freie */
  slotNear(x: number, z: number, maxDist: number, zone?: SlotZone, freeOnly = false): RaidSlotState | null {
    let best: RaidSlotState | null = null, bd = maxDist;
    for (const s of this.state.slots) {
      if (!s.unlocked || (zone && s.zone !== zone) || (freeOnly && s.occupiedBy)) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** Spieler belegt einen freigegebenen Platz; legt die Route fest (Burghafen = A, Strand = B). Mehrere Spieler können dieselbe Bucht teilen, ein Liegeplatz fasst ein Schiff. */
  claimSlot(slotId: string, playerId: string): boolean {
    const s = this.slot(slotId);
    const p = this.participant(playerId);
    if (!s || !p || !s.unlocked || this.over) return false;
    if (s.zone === 'harbor' && s.occupiedBy && s.occupiedBy !== playerId) return false;
    if (p.slotId && p.slotId !== slotId) this.releaseSlot(playerId);
    if (s.zone === 'harbor') s.occupiedBy = playerId;
    p.slotId = slotId;
    this.chooseRoute(s.route);
    return true;
  }

  releaseSlot(playerId: string) {
    const p = this.participant(playerId);
    if (!p?.slotId) return;
    const s = this.slot(p.slotId);
    if (s && s.occupiedBy === playerId) s.occupiedBy = null;
    p.slotId = null;
  }

  /** Darf an dieser Stelle jemand anlegen oder an Land gehen? (Die Wachflotte muss gefallen sein; im Burghafen zusätzlich der Durchbruch.) */
  canLand(x: number, z: number, reach: number): RaidSlotState | null {
    return this.slotNear(x, z, reach);
  }

  /** Die gewählte Route steht nach der ersten Landung (oder dem Durchbruch) fest */
  chooseRoute(route: RaidRoute) {
    if (this.state.route) return;
    this.state.route = route;
    this.emit({ type: 'route', route });
  }
  get route() { return this.state.route; }

  // ---------- Viertel (Route B) ----------

  district(id: DistrictId) { return this.state.districts[id]; }

  /** Ein Spieler betritt ein Viertel: es wird aktiv (die Welt lässt die Gegnerwellen erscheinen); legt die Route auf B fest */
  enterDistrict(id: DistrictId): boolean {
    const d = this.state.districts[id];
    if (!d || d.entered || this.over) return false;
    d.entered = true;
    this.chooseRoute('B');
    this.emit({ type: 'district', districtId: id, what: 'entered' });
    return true;
  }

  /** Gegner eines Viertels ist gefallen; sind alle gefallen, gilt das Viertel als erobert */
  districtFoe(id: DistrictId, by: string | null = null) {
    const d = this.state.districts[id];
    if (!d || d.cleared) return;
    d.fallen = Math.min(d.total, d.fallen + 1);
    const p = by ? this.participant(by) : null;
    if (p) p.kills++;
    if (d.fallen >= d.total) {
      d.cleared = true;
      this.progress('districts', Object.values(this.state.districts).filter((x) => x.cleared).length);
      this.emit({ type: 'district', districtId: id, what: 'cleared' });
    }
  }

  // ---------- Endboss ----------

  /** Aktuelle Kampfphase des Endbosses (1 oder 2) und ob er schon aufgetreten ist */
  bossPhase = 0;
  bossId: string | null = null;
  bossAppeared(id: string) { this.bossId = id; this.bossPhase = 1; this.emit({ type: 'boss', what: 'appeared', phase: 1, bossId: id }); }
  bossPhaseChanged(phase: number) {
    if (this.over || phase <= this.bossPhase) return;
    this.bossPhase = phase;
    this.emit({ type: 'boss', what: 'phase', phase, bossId: this.bossId ?? '' });
  }

  // ---------- Burg ----------

  /** Der Kommandant der Burg ist gefallen: Sieg */
  keepFallen(by: string | null = null) {
    if (this.over || this.state.keepFallen) return;
    this.state.keepFallen = true;
    const p = by ? this.participant(by) : null;
    if (p) p.kills++;
    this.progress('keep', 1);
    this.end('victory');
  }

  // ---------- Auskunft ----------

  snapshot(): RaidSnapshot {
    return {
      raidInstanceId: this.state.ctx.raidInstanceId, factionId: this.state.ctx.factionId, phase: this.state.phase, route: this.state.route,
      objectives: this.activeObjectives().map((o) => ({ ...o })), participants: this.participants.length,
      slotsUnlocked: this.state.slots.filter((s) => s.unlocked).length, breached: this.state.breached,
    };
  }

  /** Ganz in JSON verwandeln (Beweis der Serialisierbarkeit und Übertragung) */
  toJSON(): RaidSessionState { return this.state; }
}
