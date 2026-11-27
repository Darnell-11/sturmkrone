// Phase 4.6J – MMO-Ziel-Erfassung, Welt-Seite: füllt den Kandidaten-Pool aus Gegnern, Verbänden, Offizieren, eigenen Trupps, Hafen-Bewohnern und
// Schiffen, wertet Tab / Umschalt+Tab / rechten Stick / Ziel-Knopf, Mausklick und Antippen aus, hält das angewählte Ziel lebendig (Lage,
// Leben, Haltung, Beziehung) und zeichnet den Zielring am Boden bzw. auf dem Wasser. Alle Regeln (Freund/Feind, Reihenfolge, Treffer-Prüfung,
// Fenster-Daten) stehen rein in `combat/targetLock.ts`; hier entsteht je Bild nichts Neues (Pool, Ring, Hilfsvektoren sind vorab angelegt).
import { BufferAttribute, BufferGeometry, Color, CustomBlending, DoubleSide, Mesh, MeshBasicMaterial, OneFactor, OneMinusSrcAlphaFactor, SrcAlphaFactor, Vector3, ZeroFactor, type PerspectiveCamera, type Scene } from 'three';
import {
  TARGET, TargetPool, RELATION_RING, cycleTarget, frameView, makeCandidate, newFrameView, newTargetState, pickTarget, ringTone, setTarget,
  type CycleView, type TargetCandidate, type TargetFrameView, type TargetLockState,
} from '../combat/targetLock';
import { Enemy } from '../entities/enemy';
import { Ally } from '../entities/ally';
import { Npc } from '../entities/npc';
import { TroopSquad } from '../entities/troops/squad';
import type { EnemyShip } from '../naval/naval';
import type { CombatSystem } from '../combat/combat';
import type { NavalSystem } from '../naval/naval';
import { FACTIONS, type FactionId } from '../data/factions';
import { SHIP_CLASSES } from '../data/ships';
import type { NpcRole } from '../data/characterParts';
import { markShared } from '../render/dispose';
import { MMO } from '../net/mmoProtocol';
import type { RemoteTarget } from './mmoLive';

/** Was die Ziel-Erfassung von der Welt braucht */
export interface TargetHost {
  mode(): 'foot' | 'sail';
  camera(): PerspectiveCamera;
  /** Spielfigur (zu Fuß) bzw. Schiff: Ort und Blickrichtung der Kamera */
  viewer(out: { x: number; y: number; z: number; yaw: number }): void;
  combat(): CombatSystem | null;
  naval(): NavalSystem | null;
  npcs(): readonly Npc[];
  /** Macht der Insel an dieser Stelle ('' = keine) */
  powerAt(x: number, z: number): string;
  groundY(x: number, z: number, y: number): number;
  waterY(x: number, z: number): number;
  /** Lager der Spielfigur (Gegner ohne Macht gehören zur Gegenseite) */
  playerFaction(): 'pirat' | 'marine';
  time(): number;
  /** 4.7E: Team des Spielers ('' = keines) – Hafenwachen und Trupps des Teams sind verbündet (grün) */
  teamPower?(): string;
  /** 4.7E: verbündete Trupps in der Nähe (Wachen eroberter Team-Inseln, Team-Seite einer Belagerung) */
  alliedSquads?(): readonly TroopSquad[];
  /** 4.8A: Mitspieler zu Fuß und an Deck (MMO-Schicht) */
  players?(): readonly RemoteTarget[];
  /** 4.8A: Anzeige eines Mitspieler-Schiffs (Name, Kategorie, Team) */
  peerInfo?(e: EnemyShip): { name: string; category: string; nation: string; crest: string; level: number } | null;
}

/** 4.7E: Rollen, die auf einer Insel des eigenen Teams als Hafenwache gelten */
const GUARD_ROLES: ReadonlySet<NpcRole> = new Set<NpcRole>(['marine', 'offizier']);

/** Titel der Bewohner nach Rolle (Hafen-NPCs ohne eigenen Namen) */
const NPC_TITLE: Record<NpcRole, string> = {
  buerger: 'Bürgerin / Bürger', fischer: 'Fischer', haendler: 'Händler', pirat: 'Freibeuter', marine: 'Marinesoldat', offizier: 'Offizier', koch: 'Koch', schmied: 'Schmied', wirt: 'Wirt',
};
/** Kämpfertypen in Worten (wenn der Name schon die Bezeichnung trägt) */
const KIND_LABEL: Record<string, string> = { matrose: 'Matrose', schildtraeger: 'Schildträger', musketier: 'Musketier', schlaeger: 'Schläger', fajiwirker: 'Faji-Wirker', hauptmann: 'Hauptmann', legende: 'Legende' };
/** Schiffsrollen in Worten */
const SHIP_ROLE: Record<string, string> = { patrouille: 'Patrouille', haendler: 'Handelsschiff', jaeger: 'Kriegsschiff', legende: 'Legende' };
/** Banner der Freibeuter (Gegner ohne Macht im Piraten-Lager) */
const FREE = { name: 'Freie Piraten', color: '#B5452F' };
const OWN = { name: 'Deine Mannschaft', color: '#E3B04B' };

function nationOf(power: string): { name: string; color: string } {
  const f = power ? FACTIONS[power as FactionId] : null;
  return f ? { name: f.name, color: f.color } : FREE;
}

const _v = new Vector3();
/** Ringfarben vorab als Farben (Zero-GC: `Color.set(Text)` liest den Text je Aufruf neu) */
const RING_COL = {
  hostile: new Color(RELATION_RING.hostile), neutral: new Color(RELATION_RING.neutral), friendly: new Color(RELATION_RING.friendly), npc: new Color(RELATION_RING.npc),
} as const;
const _view: CycleView = { x: 0, z: 0, yaw: 0, range: 0, half: 0 };
const _me = { x: 0, y: 0, z: 0, yaw: 0 };

/** Ring: Kreisband (0,9 … 1) mit drei kleinen Zacken nach innen, flach in der XZ-Ebene; nur Lage, keine UV (gleiches Programm wie die Breitseiten-Ringe) */
function ringGeometry(): BufferGeometry {
  const seg = 72, pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    pos.push(c * 0.9, 0, s * 0.9, c, 0, s);
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  for (let t = 0; t < 3; t++) {
    const a = t * (Math.PI * 2 / 3) + Math.PI / 2, w = 0.07;
    const base = pos.length / 3;
    pos.push(Math.cos(a - w) * 0.9, 0, Math.sin(a - w) * 0.9, Math.cos(a + w) * 0.9, 0, Math.sin(a + w) * 0.9, Math.cos(a) * 0.74, 0, Math.sin(a) * 0.74);
    idx.push(base, base + 1, base + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export class TargetLockLive {
  readonly state: TargetLockState = newTargetState();
  readonly view: TargetFrameView = newFrameView();
  /** das angewählte Ziel (eigene Kopie, je Bild aus dem lebenden Objekt aufgefrischt) */
  readonly sel: TargetCandidate = makeCandidate();
  readonly pool = new TargetPool(160);
  /** Bildschirm-Lage je Pool-Platz (Anklicken) */
  private readonly sx = new Float32Array(160);
  private readonly sy = new Float32Array(160);
  private readonly sr = new Float32Array(160);
  private readonly sd = new Float32Array(160);
  readonly ring: Mesh;
  private readonly ringMat: MeshBasicMaterial;
  private ringT = 0;
  /** Zahlen für Prüfungen */
  readonly stats = { cycles: 0, picks: 0, cleared: 0, gathered: 0 };

  constructor(scene: Scene, private readonly host: TargetHost) {
    // dieselben Werte wie die Breitseiten-Ringe in NavalSystem: gleiches Programm, kein neuer Shader
    this.ringMat = markShared(new MeshBasicMaterial({
      color: new Color(1, 0.3, 0.25), transparent: true, opacity: 0.6, depthWrite: false, side: DoubleSide, fog: false,
      blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
    }));
    this.ring = new Mesh(markShared(ringGeometry()), this.ringMat);
    this.ring.visible = false;
    this.ring.renderOrder = 4;
    this.ring.frustumCulled = false;
    this.ring.name = 'zielring';
    scene.add(this.ring);
  }

  get active(): boolean { return !!this.state.id && this.sel.alive; }

  // ---------------------------------------------------------------------------------------------------------------
  // Sammeln
  // ---------------------------------------------------------------------------------------------------------------

  /** Pool mit allen erreichbaren Zielen füllen (nur bei Tab, Klick und Lock-on – nicht je Bild) */
  gather(): number {
    const h = this.host, pool = this.pool;
    pool.clear();
    h.viewer(_me);
    const foot = h.mode() === 'foot';
    const landR = TARGET.keepLand, seaR = foot ? 320 : TARGET.keepSea;
    const c = h.combat();
    if (foot && c) {
      for (const e of c.enemies) if (e.alive && Math.hypot(e.x - _me.x, e.z - _me.z) < landR) this.fillEnemy(pool.next(), e);
      for (const q of c.mass) if (q.alive && Math.hypot(q.x - _me.x, q.z - _me.z) < landR) this.fillSquad(pool.next(), q, q.hostile);
      for (const a of c.allies) {
        if (!a.alive || Math.hypot(a.x - _me.x, a.z - _me.z) > landR) continue;
        if (a instanceof Ally) this.fillOfficer(pool.next(), a);
        else if (a instanceof TroopSquad) this.fillSquad(pool.next(), a, false);
      }
      // 4.7E: Trupps des eigenen Teams (Wachen, Belagerungs-Seite) – verbündet, grün im Zielfenster, nie Ziel eines Angriffs
      const allied = h.alliedSquads?.();
      if (allied) for (const q of allied) if (q.alive && Math.hypot(q.x - _me.x, q.z - _me.z) < landR) this.fillTeamSquad(pool.next(), q);
    }
    if (foot) for (const n of h.npcs()) if (Math.hypot(n.x - _me.x, n.z - _me.z) < landR) this.fillNpc(pool.next(), n);
    // 4.8A: Mitspieler (zu Fuß und an Deck) – auch weiter weg anwählbar (Gruppenfenster, Rechtsklick), solange ihre Figur steht
    const pl = h.players?.();
    if (pl) for (const t of pl) if (t.alive && Math.hypot(t.x - _me.x, t.z - _me.z) < MMO.rigShow) this.fillPlayer(pool.next(), t);
    // 4.7A: Übungspuppen (Waffenmeister der Einführung) lassen sich anwählen wie Bewohner
    if (foot && c) for (const d of c.trainingDummies) if (Math.hypot(d.x - _me.x, d.z - _me.z) < landR) this.fillDummy(pool.next(), d);
    const nav = h.naval();
    if (nav) for (const e of nav.enemies) {
      const s = e.ship;
      if (!s.alive || s.sinking > 0 || Math.hypot(s.x - _me.x, s.z - _me.z) > seaR) continue;
      this.fillShip(pool.next(), e, nav);
    }
    this.stats.gathered = pool.n;
    return pool.n;
  }

  private fillEnemy(c: TargetCandidate | null, e: Enemy) {
    if (!c) return;
    const boss = !!e.def.boss, elite = !boss && e.hasPosture;
    const n = e.power ? nationOf(e.power) : this.host.playerFaction() === 'pirat' ? nationOf('marine') : FREE;
    c.id = e.entityId; c.kind = boss ? 'boss' : elite ? 'elite' : 'fighter'; c.relation = 'hostile'; c.domain = 'land'; c.npc = false;
    c.name = e.name ?? e.def.label; c.level = e.level; c.power = e.power ?? ''; c.nation = n.name; c.crest = n.color;
    // Rolle: Kaiser (Ring 5), Endboss (Raid), Boss, Hauptmann, Elite; dazu Titel bzw. Kämpfertyp (nicht noch einmal der Name)
    const kaiser = !!e.tag && e.tag.startsWith('kaiser:');
    const role = boss ? (kaiser ? 'Kaiser' : e.def.raid === 'boss' ? 'Endboss' : 'Boss') : elite ? (e.def.raid === 'captain' ? 'Hauptmann' : 'Elite') : '';
    const what = e.def.title && e.def.title !== c.name ? e.def.title : e.def.label !== c.name ? e.def.label : (KIND_LABEL[e.kind] ?? '');
    c.category = role && what ? `${role} · ${what}` : role || what;
    c.prio = boss ? 3 : elite ? 2 : e.kind === 'musketier' ? 1.2 : 1;
    c.radius = e.radius; c.height = 1.9 * e.def.scale;
    c.ref = e;
    this.refreshEnemy(c, e);
  }

  private refreshEnemy(c: TargetCandidate, e: Enemy) {
    c.alive = e.alive; c.x = e.x; c.y = e.y; c.z = e.z;
    c.hp = e.hp; c.maxHp = e.maxHp;
    c.posture = e.hasPosture ? e.breakFrac : -1; c.broken = e.brokenT > 0;
  }

  private fillSquad(c: TargetCandidate | null, q: TroopSquad, hostile: boolean) {
    if (!c) return;
    c.id = q.squadId; c.kind = 'troop'; c.relation = hostile ? 'hostile' : 'friendly'; c.domain = 'land'; c.npc = false;
    c.name = q.label; c.level = q.level; c.power = ''; c.nation = hostile ? 'Feindlicher Verband' : OWN.name; c.crest = hostile ? '#9A3A2E' : OWN.color;
    c.category = `${hostile ? 'Verband' : 'Eigener Trupp'} · ${q.maxHeads} Mann`;
    c.prio = hostile ? 0.6 : 0; c.radius = q.sepRadius() * 0.7; c.height = 1.8;
    c.ref = q;
    this.refreshSquad(c, q);
  }

  /** 4.7E: Trupp des eigenen Teams (verbündet, Wappenfarbe des Teams) */
  private fillTeamSquad(c: TargetCandidate | null, q: TroopSquad) {
    if (!c) return;
    const team = this.host.teamPower?.() ?? '';
    const n = team ? nationOf(team) : OWN;
    c.id = q.squadId; c.kind = 'troop'; c.relation = 'friendly'; c.domain = 'land'; c.npc = false;
    c.name = q.label; c.level = q.level; c.power = team; c.nation = n.name; c.crest = n.color;
    c.category = `Verbündeter Trupp · ${q.maxHeads} Mann`;
    c.prio = 0; c.radius = q.sepRadius() * 0.7; c.height = 1.8;
    c.ref = q;
    this.refreshSquad(c, q);
  }

  private refreshSquad(c: TargetCandidate, q: TroopSquad) {
    c.alive = q.alive; c.x = q.x; c.y = q.y; c.z = q.z; c.hp = q.heads; c.maxHp = q.maxHeads; c.posture = -1; c.broken = false;
  }

  private fillOfficer(c: TargetCandidate | null, a: Ally) {
    if (!c) return;
    c.id = a.entityId; c.kind = 'officer'; c.relation = 'friendly'; c.domain = 'land'; c.npc = false;
    c.name = a.def.name; c.level = a.level; c.power = ''; c.nation = OWN.name; c.crest = OWN.color;
    c.category = `Offizier · ${a.def.job}`; c.prio = 0; c.radius = 0.5; c.height = 1.8;
    c.ref = a;
    this.refreshOfficer(c, a);
  }

  private refreshOfficer(c: TargetCandidate, a: Ally) {
    c.alive = a.alive; c.x = a.x; c.y = a.y; c.z = a.z; c.hp = a.hp; c.maxHp = a.maxHp; c.posture = -1; c.broken = false;
  }

  private fillDummy(c: TargetCandidate | null, d: { readonly id: string; readonly x: number; readonly z: number; readonly group: { position: { y: number } } }) {
    if (!c) return;
    c.id = d.id; c.kind = 'npc'; c.relation = 'neutral'; c.domain = 'land'; c.npc = true;
    c.name = 'Übungspuppe'; c.level = 0; c.power = ''; c.nation = 'Ankerglück'; c.crest = '#C9A15A';
    c.category = 'Übungsplatz des Waffenmeisters'; c.prio = 0.2; c.radius = 0.5; c.height = 2;
    c.ref = d;
    c.alive = true; c.x = d.x; c.z = d.z; c.y = d.group.position.y; c.hp = 0; c.maxHp = 0; c.posture = -1; c.broken = false;
  }

  private fillNpc(c: TargetCandidate | null, n: Npc) {
    if (!c) return;
    const p = this.host.powerAt(n.x, n.z);
    const nat = p ? nationOf(p) : { name: 'Freie Hafenstadt', color: '#5BA9F2' };
    // 4.7E: Hafenwachen auf Inseln des eigenen Teams sind Verbündete (grün), alle anderen Bewohner bleiben blau
    const guard = !n.townDef && !!p && p === (this.host.teamPower?.() ?? '') && GUARD_ROLES.has(n.role);
    c.id = n.entityId; c.kind = 'npc'; c.relation = guard ? 'friendly' : 'neutral'; c.domain = 'land'; c.npc = !guard;
    c.name = n.townDef?.name ?? (guard ? 'Hafenwache' : NPC_TITLE[n.role]); c.level = 0; c.power = p; c.nation = nat.name; c.crest = nat.color;
    c.category = n.townDef?.title ?? (guard ? `Hafenwache deines Teams · ${NPC_TITLE[n.role]}` : NPC_TITLE[n.role]);
    c.prio = n.townDef ? 0.4 : 0; c.radius = 0.45; c.height = 1.75;
    c.ref = n;
    this.refreshNpc(c, n);
  }

  private refreshNpc(c: TargetCandidate, n: Npc) {
    c.alive = !!n.char.holder.parent; c.x = n.x; c.z = n.z; c.y = n.char.holder.position.y; c.hp = 0; c.maxHp = 0; c.posture = -1; c.broken = false;
  }

  /** 4.8A: Mitspieler (Kapitän eines anderen Spielers) */
  private fillPlayer(c: TargetCandidate | null, t: RemoteTarget) {
    if (!c) return;
    const n = t.team ? nationOf(t.team) : { name: 'Ungebunden', color: '#9AA3AE' };
    c.id = t.id; c.kind = 'player'; c.relation = t.relation; c.domain = 'land'; c.npc = false;
    c.name = t.name; c.level = t.level; c.power = t.team; c.nation = t.team ? `Team ${n.name}` : n.name; c.crest = n.color;
    c.category = t.classLabel ? `Kapitän · ${t.classLabel}${t.role ? ` (${t.role})` : ''}` : 'Kapitän';
    c.prio = t.relation === 'hostile' ? 1.4 : 0.5; c.radius = 0.5; c.height = 1.8;
    c.ref = t;
    this.refreshPlayer(c);
  }

  private refreshPlayer(c: TargetCandidate) {
    const pl = this.host.players?.();
    let t: RemoteTarget | null = null;
    if (pl) for (const o of pl) if (o.id === c.id) { t = o; break; }
    if (!t) { c.alive = false; return; }
    c.alive = t.alive; c.x = t.x; c.y = t.y; c.z = t.z; c.hp = t.hp; c.maxHp = t.mhp; c.posture = -1; c.broken = false; c.relation = t.relation;
  }

  private fillShip(c: TargetCandidate | null, e: EnemyShip, nav: NavalSystem) {
    if (!c) return;
    const s = e.ship;
    const tier = Math.max(0, SHIP_CLASSES.indexOf(s.cls));
    const own = !!(e.companion || e.fleetId || e.captured);
    const n = own ? OWN : e.power ? nationOf(e.power) : this.host.playerFaction() === 'pirat' ? nationOf('marine') : FREE;
    c.id = s.entityId; c.kind = 'ship'; c.domain = 'sea'; c.npc = false;
    c.relation = nav.shipRelation(e);
    c.name = e.name ?? s.cls.n; c.level = e.level; c.power = e.power ?? ''; c.nation = n.name; c.crest = n.color;
    c.category = `${s.cls.n} · Klasse ${tier + 1} · ${own ? 'Begleitschiff' : e.helper ? 'Marine-Geleit' : SHIP_ROLE[e.role] ?? 'Schiff'}`;
    c.prio = e.role === 'legende' || e.legendId ? 3 : e.role === 'jaeger' ? 1.5 : 1;
    c.radius = s.cls.L * 0.5; c.height = s.model.deckY + s.cls.mh * 0.5;
    c.ref = e;
    // 4.8A: Schiff eines Mitspielers – Name des Kapitäns, sein Team und seine Klasse
    const pi = e.peer?.mmo ? this.host.peerInfo?.(e) : null;
    if (pi) { c.name = pi.name; c.category = pi.category; c.nation = pi.nation; c.crest = pi.crest; c.level = pi.level; c.prio = c.relation === 'hostile' ? 1.4 : 0.6; }
    this.refreshShip(c, e, nav);
  }

  private refreshShip(c: TargetCandidate, e: EnemyShip, nav: NavalSystem) {
    const s = e.ship;
    c.alive = s.alive && s.sinking <= 0 && !!s.model.group.parent; c.x = s.x; c.z = s.z; c.y = this.host.waterY(s.x, s.z);
    c.hp = s.hull; c.maxHp = s.maxHull; c.posture = -1; c.broken = false;
    c.relation = nav.shipRelation(e);
  }

  /** Ein Kandidat aus seinem lebenden Objekt neu lesen */
  private refresh(c: TargetCandidate) {
    const r = c.ref;
    if (r instanceof Enemy) this.refreshEnemy(c, r);
    else if (r instanceof TroopSquad) this.refreshSquad(c, r);
    else if (r instanceof Ally) this.refreshOfficer(c, r);
    else if (r instanceof Npc) this.refreshNpc(c, r);
    else if (c.kind === 'player') this.refreshPlayer(c);
    else if (c.kind === 'ship' && r) { const nav = this.host.naval(); if (nav && nav.enemies.includes(r as EnemyShip)) this.refreshShip(c, r as EnemyShip, nav); else c.alive = false; }
    else if (c.kind === 'npc' && r && this.host.combat()?.trainingDummies.includes(r as never)) c.alive = true;
    else c.alive = false;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Auswahl
  // ---------------------------------------------------------------------------------------------------------------

  /** Ziel übernehmen (Kopie aus dem Pool) oder lösen */
  select(c: TargetCandidate | null, via: TargetLockState['via']) {
    setTarget(this.state, c, via, this.host.time());
    if (!c) { this.sel.ref = null; this.sel.alive = false; this.sel.id = ''; this.view.visible = false; this.view.id = ''; return; }
    Object.assign(this.sel, c);
  }

  clear() { if (this.state.id) this.stats.cleared++; this.select(null, ''); }

  /** Tab / Umschalt+Tab / rechter Stick / Ziel-Knopf */
  cycle(dir: 1 | -1): TargetCandidate | null {
    this.gather();
    this.host.viewer(_me);
    _view.x = _me.x; _view.z = _me.z; _view.yaw = _me.yaw;
    const foot = this.host.mode() === 'foot';
    _view.range = foot ? TARGET.cycleLand : TARGET.cycleSea;
    _view.half = foot ? TARGET.viewHalf : TARGET.viewHalfSea;
    const i = cycleTarget(this.pool, this.state.id, dir, _view);
    this.stats.cycles++;
    if (i < 0) { this.clear(); return null; }
    this.select(this.pool.items[i], 'tab');
    return this.sel;
  }

  /** Mausklick / Antippen bei Bildschirm-Pixel (x, y): Ziel unter dem Zeiger wählen; null = nichts getroffen (die Auswahl bleibt) */
  pickAt(px: number, py: number, w: number, h: number): TargetCandidate | null {
    const i = this.pickIndex(px, py, w, h);
    if (i < 0) return null;
    this.stats.picks++;
    this.select(this.pool.items[i], 'click');
    return this.sel;
  }

  /**
   * 4.8A: Ziel unter dem Zeiger nur nachsehen, ohne es zu wählen (Rechtsklick-Menü); der Kandidat gilt bis zum nächsten Sammeln. Mit `prefer`
   * gewinnt ein passender Kandidat unter dem Zeiger, auch wenn ein anderer davor steht (Kapitän hinter einem Stadtbewohner).
   */
  peekAt(px: number, py: number, w: number, h: number, prefer?: (c: TargetCandidate) => boolean): TargetCandidate | null {
    const i = this.pickIndex(px, py, w, h);
    const first = i < 0 ? null : this.pool.items[i];
    if (!prefer || (first && prefer(first))) return first;
    let best: TargetCandidate | null = null, bd = Infinity;
    for (let k = 0; k < this.pool.n; k++) {
      const c = this.pool.items[k];
      if (!c.alive || !(this.sd[k] > 0) || !prefer(c)) continue;
      const r = Math.max(TARGET.pickMinPx, this.sr[k]) + TARGET.pickSlopPx;
      const d = Math.hypot(this.sx[k] - px, this.sy[k] - py);
      if (d <= r && d / r < bd) { bd = d / r; best = c; }
    }
    return best ?? first;
  }

  private pickIndex(px: number, py: number, w: number, h: number): number {
    const n = this.gather();
    const cam = this.host.camera();
    const tanH = Math.tan(((cam.fov * Math.PI) / 180) * 0.5);
    for (let i = 0; i < n; i++) {
      const c = this.pool.items[i];
      _v.set(c.x, c.y + c.height * 0.5, c.z).applyMatrix4(cam.matrixWorldInverse);
      const depth = -_v.z;
      if (depth <= 0.2) { this.sd[i] = -1; continue; }
      _v.set(c.x, c.y + c.height * 0.5, c.z).project(cam);
      this.sx[i] = (_v.x * 0.5 + 0.5) * w;
      this.sy[i] = (-_v.y * 0.5 + 0.5) * h;
      // Bildschirm-Radius: größere Ausdehnung (Höhe bzw. Breite) über den Abstand
      const ext = Math.max(c.radius, c.height * 0.5);
      this.sr[i] = (ext / (depth * tanH)) * (h * 0.5);
      this.sd[i] = depth;
    }
    return pickTarget(this.pool, this.sx, this.sy, this.sr, this.sd, px, py);
  }

  /** Ziel nach Kennung wählen (Lock-on, Rückeroberung des Ziels nach dem Tod) */
  selectId(id: string, via: TargetLockState['via']): boolean {
    if (!id) { this.clear(); return false; }
    if (id === this.state.id && this.sel.alive) { this.state.via = via; return true; }
    this.gather();
    const c = this.pool.find(id);
    this.select(c, c ? via : '');
    return !!c;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Je Bild
  // ---------------------------------------------------------------------------------------------------------------

  /** Angewähltes Ziel auffrischen und prüfen (lebt, in Reichweite); Ziel-Fenster füllen. Liefert, ob noch ein Ziel aktiv ist */
  update(): boolean {
    if (!this.state.id) { this.view.visible = false; return false; }
    const c = this.sel;
    this.refresh(c);
    this.host.viewer(_me);
    const keep = c.domain === 'sea' ? TARGET.keepSea : c.kind === 'player' ? MMO.rigShow : TARGET.keepLand;
    if (!c.alive || Math.hypot(c.x - _me.x, c.z - _me.z) > keep + c.radius) { this.clear(); return false; }
    this.state.relation = c.relation;
    frameView(c, this.view);
    // Beziehung kann sich ändern (provoziert): Ton im Fenster nachziehen
    const tone = ringTone(c);
    if (tone !== this.view.tone) { this.view.tone = tone; this.view.relation = c.relation; this.view.relationText = c.npc ? 'Bewohner' : c.relation === 'hostile' ? 'Feind' : c.relation === 'friendly' ? 'Verbündet' : 'Neutral'; }
    return true;
  }

  /** Zielring je gezeichnetem Bild (Echtzeit): Lage, Größe, Farbe, leichtes Pulsieren */
  render(frameDt: number, hidden: boolean) {
    const r = this.ring;
    if (hidden || !this.state.id || !this.sel.alive) { r.visible = false; return; }
    const c = this.sel;
    this.ringT += frameDt;
    const sea = c.domain === 'sea';
    const y = sea ? this.host.waterY(c.x, c.z) + TARGET.ringSeaLift : this.host.groundY(c.x, c.z, c.y) + TARGET.ringLift;
    const rad = sea ? c.radius * 2 * TARGET.ringShip : Math.max(0.55, c.radius * 1.6 * TARGET.ringLand + 0.25);
    const pulse = 1 + Math.sin(this.ringT * 3.2) * 0.035;
    r.position.set(c.x, y, c.z);
    r.scale.setScalar(rad * pulse);
    r.rotation.y = this.ringT * 0.35;
    this.ringMat.color.copy(RING_COL[ringTone(c)]);
    this.ringMat.opacity = 0.5 + Math.sin(this.ringT * 3.2) * 0.08;
    r.visible = true;
  }

  dispose() { this.ring.removeFromParent(); }
}
