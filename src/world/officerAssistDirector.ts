// Phase 4.6H – Ausführung der Offiziers-Kombo-Assists im Landkampf (Regeln und Zahlen: `combat/officerAssists.ts`).
//
// Der Regisseur wählt den Offizier, lässt ihn handeln (Clip, Blick, Sturmlauf über `Ally.performAssist`), zeichnet die Effekte über die
// AnimeVfxForge (3-Schicht-Regel: dunkler Mantel, Energiekern, Partikel plus Oberflächen-Reaktion) und wendet die Treffer über das Kampfsystem
// an (`CombatSystem.assistHit`: Rüstung, Haltung, Endboss-Grenzen). Alles läuft in Spielzeit über eine feste Zeitachse aus vorab angelegten
// Plätzen (keine Speicheranforderung je Bild); Abklingzeiten zählen nur im Spiel.
import { Color, Vector3 } from 'three';
import type { Ally } from '../entities/ally';
import type { Enemy } from '../entities/enemy';
import type { TroopSquad } from '../entities/troops/squad';
import type { CataclysmFx } from '../combat/cataclysmFx';
import type { AnimeVfxForge } from '../graphics/animeVfxForge';
import type { CombatFx } from '../combat/fx';
import type { CombatOverlay } from '../ui/combatOverlay';
import type { Sfx } from '../audio/audio';
import type { AssistView } from '../ui/fighterHud';
import {
  OFFICER_ASSISTS, assistBlock, assistCdFrac, assistCenter, assistDamage, newAssistState, pickOfficer, salvoPoint, stepAssists,
  type AssistDef, type AssistOfficer, type AssistState,
} from '../combat/officerAssists';

/** Treffer-Werte eines Assists für das Kampfsystem */
export interface AssistHitOpts { dmg: number; poise: number; knock: number; launch: number; juggle: number; airHold: number; fling: number; dirX: number; dirZ: number; color: string; element: string; srcId?: string }

/** Was der Regisseur von der Welt braucht (setzt `SeaWorld`) */
export interface AssistHost {
  /** Offiziere des Landtrupps (an Land, im Einsatz) */
  officers(): readonly Ally[];
  /** eigene Trupps (Sturmhorn) */
  squads(): readonly TroopSquad[];
  /** Gegner und feindliche Verbände */
  foes(): readonly Enemy[];
  foeSquads(): readonly TroopSquad[];
  /** Spielfigur zu Fuß (null = nicht an Land) */
  player(): { x: number; y: number; z: number; yaw: number } | null;
  /** erfasstes Ziel der Spielfigur */
  lock(): { x: number; z: number } | null;
  /** Angriffswert der Spielfigur */
  atk(): number;
  hit(t: Enemy | TroopSquad, o: AssistHitOpts): number;
  /** Heilung der Spielfigur (Anteil der Höchstpunkte); Rückgabe: geheilte Punkte */
  heal(frac: number): number;
  addWill(n: number): void;
  openChase(): void;
  /** 4.8A: Sturmhorn – Mitspieler (Gruppe, Verbündete) im Umkreis bekommen Heilung und Willenskraft */
  rallyPlayers?(x: number, z: number, heal: number, will: number): void;
  groundY(x: number, z: number): number;
  isLand(x: number, z: number): boolean;
  /** darf jetzt ein Assist starten (keine Zwischensequenz, kein Menü)? */
  busy(): boolean;
  readonly fx: CataclysmFx;
  readonly vfx: AnimeVfxForge;
  readonly combatFx: CombatFx | null;
  readonly overlay: CombatOverlay | null;
  sound(name: Sfx, vol: number, x: number, y: number, z: number): void;
  shake(k: number): void;
}

/** Ereignis der Zeitachse: Einschlag der Salve (0), Schildstoß (1), Sturmhorn (2) */
interface Pending { on: boolean; t: number; kind: 0 | 1 | 2; x: number; z: number; ally: Ally | null; dirX: number; dirZ: number }

const MAX_PENDING = 24;
const COL = OFFICER_ASSISTS.map((a) => new Color(a.color));
const ACC = OFFICER_ASSISTS.map((a) => new Color(a.accent));
const WHITE = new Color(1, 1, 1);
const SMOKE = new Color(0.07, 0.05, 0.04);
const HEAL = new Color('#9BFFB0');
const TMP = new Color();
const V = new Vector3();
const PT = { x: 0, z: 0 };
const FOE_X = new Float32Array(96), FOE_Z = new Float32Array(96);

export class OfficerAssistDirector {
  readonly state: AssistState = newAssistState();
  private readonly pend: Pending[] = Array.from({ length: MAX_PENDING }, () => ({ on: false, t: 0, kind: 0 as 0 | 1 | 2, x: 0, z: 0, ally: null, dirX: 0, dirZ: 1 }));
  /** Zähler für Prüfungen (Treffer, Einschläge, Hochgeschleuderte, Heilung) */
  readonly stats = { casts: [0, 0, 0], impacts: 0, hits: 0, launched: 0, healed: 0, rallied: 0 };
  private readonly offs: AssistOfficer[] = [];
  private readonly views: AssistView[] = OFFICER_ASSISTS.map((a) => ({ id: a.id, icon: a.icon, short: a.short, label: a.label, who: a.who, color: a.color, cd: 0, ready: false, blocked: null, officer: '' }));

  constructor(private host: AssistHost) {}

  /** Offiziere als Regel-Daten (Kennung, Rolle, einsatzbereit) */
  private officerList(): readonly AssistOfficer[] {
    const list = this.host.officers();
    this.offs.length = 0;
    for (const a of list) this.offs.push({ id: a.def.id, role: a.def.role, alive: a.alive && !a.route && !a.assisting });
    return this.offs;
  }

  /** Warum (noch) nicht? null = bereit */
  block(i: number): string | null {
    return assistBlock(this.state, i, this.officerList(), { onFoot: !!this.host.player(), busy: this.host.busy() });
  }

  /** Anzeige für HUD und Touch-Knöpfe (je Bild, ohne neue Objekte) */
  viewList(): readonly AssistView[] {
    const offs = this.officerList();
    const onFoot = !!this.host.player();
    for (let i = 0; i < OFFICER_ASSISTS.length; i++) {
      const v = this.views[i];
      v.cd = assistCdFrac(this.state, i);
      v.blocked = assistBlock(this.state, i, offs, { onFoot, busy: this.host.busy() });
      v.ready = v.blocked === null;
      const k = pickOfficer(OFFICER_ASSISTS[i], offs);
      const a = k >= 0 ? this.host.officers()[k] : null;
      v.officer = a ? a.def.name : '';
    }
    return this.views;
  }

  /** Assist auslösen (Taste, Knopf); Rückgabe: Meldung, warum nicht (null = ausgelöst) */
  trigger(i: number): string | null {
    const why = this.block(i);
    if (why) return why;
    const def = OFFICER_ASSISTS[i];
    const p = this.host.player()!;
    const k = pickOfficer(def, this.offs);
    const ally = this.host.officers()[k];
    this.state.cd[i] = def.cd;
    this.stats.casts[i]++;
    // Ziel: erfasstes Ziel, sonst die dichteste Gruppe vor der Figur, sonst ein Punkt voraus
    let n = 0;
    for (const e of this.host.foes()) { if (!e.alive || n >= FOE_X.length) continue; FOE_X[n] = e.x; FOE_Z[n] = e.z; n++; }
    for (const q of this.host.foeSquads()) { if (!q.alive || n >= FOE_X.length) continue; FOE_X[n] = q.x; FOE_Z[n] = q.z; n++; }
    assistCenter(def, p.x, p.z, p.yaw, this.host.lock(), FOE_X, FOE_Z, n, PT);
    const cx = PT.x, cz = PT.z;
    const ov = this.host.overlay;
    ov?.number(V.set(ally.x, ally.y + 2.6 * (ally.def.big ?? 1), ally.z), `${ally.def.name}: ${def.label}!`, 'crit');
    if (def.id === 'sperrfeuer') this.castSalvo(def, i, ally, cx, cz);
    else if (def.id === 'orkan') this.castOrkan(def, i, ally, cx, cz);
    else this.castHorn(def, i, ally, p.x, p.z);
    return null;
  }

  private schedule(t: number, kind: 0 | 1 | 2, x: number, z: number, ally: Ally | null, dirX = 0, dirZ = 1) {
    const p = this.pend.find((q) => !q.on) ?? this.pend[0];
    p.on = true; p.t = t; p.kind = kind; p.x = x; p.z = z; p.ally = ally; p.dirX = dirX; p.dirZ = dirZ;
  }

  // ---------- 1. Sperrfeuer-Salve ----------

  /** Wurf, dann je Granate eine Leuchtspur auf ballistischer Bahn (Kern additiv, Glut-Schweif dahinter); Einschläge in der Zeitachse */
  private castSalvo(def: AssistDef, i: number, ally: Ally, cx: number, cz: number) {
    ally.performAssist('Throw', def.windup + def.hits * def.every + 0.5, cx, cz, null, 1.25);
    const fx = this.host.fx, b = fx.brush, vfx = this.host.vfx;
    const hx = ally.x, hy = ally.y + 1.6 * (ally.def.big ?? 1), hz = ally.z;
    const g = 16;
    for (let k = 0; k < def.hits; k++) {
      salvoPoint(def, cx, cz, k, PT);
      const tx = PT.x, tz = PT.z, ty = this.host.groundY(tx, tz);
      const launch = def.windup + k * def.every;
      // kurze, flache Bahn: der erste Einschlag 0,7 s nach dem Befehl – noch im Flug von Gegnern, die der Orkan-Schildstoß hochgeschleudert hat
      const T = 0.42 + 0.03 * k;
      const vx = (tx - hx) / T, vz = (tz - hz) / T, vy = (ty - hy + 0.5 * g * T * T) / T;
      // Granate: weißer Kern, farbiger Lichthof, Glut-Schweif (gleiche Bahn, verzögert) – Leuchtspur über den Himmel
      b.reset().at(hx, hy, hz).vel(vx, vy, vz).size(0.32, 0.32, 0.32).span(T, launch).col(WHITE, 2.8).fade(0.01, 0.05);
      b.grav = g; fx.emit('orb');
      b.reset().at(hx, hy, hz).vel(vx, vy, vz).size(0.75, 0.75, 0.75, 0.6, 0.6, 0.6).span(T, launch).col(COL[i], 2.2).fade(0.02, 0.1);
      b.grav = g; fx.emit('orb');
      for (let q = 1; q <= 4; q++) {
        b.reset().at(hx, hy, hz).vel(vx, vy, vz).size(0.42 - q * 0.06, 0.42 - q * 0.06, 0.42 - q * 0.06).span(T - q * 0.03, launch + q * 0.03).col(ACC[i], 2).fade(0.01, 0.4);
        b.grav = g; b.flicker = 0.2; fx.emit('ember');
      }
      this.schedule(launch + T, 0, tx, tz, ally);
    }
    // Mündungsblitz an der Hand
    vfx.burst('spark', hx, hy, hz, 8, 6, COL[i], { up: 2, size: 0.35, delay: def.windup });
    this.host.sound('whoosh', 0.7, hx, hy, hz);
  }

  /** Einschlag einer Granate: Lichtblitz, Druckring, Krater bzw. Gischt, dunkler Rauchmantel, Glut; Treffer im Umkreis */
  private impactSalvo(def: AssistDef, i: number, p: Pending) {
    const gy = this.host.groundY(p.x, p.z);
    const fx = this.host.fx, b = fx.brush, vfx = this.host.vfx;
    b.reset().at(p.x, gy + 0.8, p.z).size(0.6, 0.6, 0.6, 3.4, 3.4, 3.4).span(0.22).col(WHITE, 2.6).fade(0.01, 0.7);
    fx.emit('orb');
    b.reset().at(p.x, gy + 0.9, p.z).size(1, 1, 1, 4.2, 4.2, 4.2).span(0.38).col(COL[i], 2.2).fade(0.02, 0.6);
    fx.emit('orb');
    vfx.surfaceHit(p.x, gy, p.z, 2.4, COL[i], 1.1);
    vfx.pressureRing(p.x, gy + 0.5, p.z, 0, false, 4.5, ACC[i], 0.35);
    vfx.burst('smoke', p.x, gy + 1, p.z, 4, 2.4, SMOKE, { up: 2.4, size: 2.2, life: 1.1, spread: 1 });
    vfx.burst('ember', p.x, gy + 0.8, p.z, 6, 7, COL[i], { up: 5, size: 0.35 });
    if (this.host.isLand(p.x, p.z)) this.host.combatFx?.crack(V.set(p.x, gy + 0.05, p.z), 2.2);
    this.host.sound('boom', 0.55, p.x, gy, p.z);
    this.host.shake(0.25);
    this.stats.impacts++;
    const r = 2.6;
    const atk = this.host.atk();
    for (const e of this.host.foes()) {
      if (!e.alive) continue;
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
      if (d > r + e.radius) continue;
      const l = d || 1;
      if (this.host.hit(e, { dmg: assistDamage(def, atk), poise: def.poise, knock: def.knock, launch: 0, juggle: def.juggle, airHold: def.airHold, fling: 0, dirX: dx / l, dirZ: dz / l, color: def.color, element: 'feuer', srcId: p.ally?.entityId })) this.stats.hits++;
    }
    for (const q of this.host.foeSquads()) {
      if (!q.alive || Math.hypot(q.x - p.x, q.z - p.z) > r + 1.5) continue;
      const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
      if (this.host.hit(q, { dmg: assistDamage(def, atk), poise: 0, knock: 0, launch: 0, juggle: 0, airHold: 0, fling: def.fling, dirX: dx / l, dirZ: dz / l, color: def.color, element: 'feuer', srcId: p.ally?.entityId })) this.stats.hits++;
    }
  }

  // ---------- 2. Orkan-Schildstoß ----------

  /** Sturmlauf zum Ziel (aus weiter Entfernung mit Nachbild-Sprung), Windspur, dann der Stoß */
  private castOrkan(def: AssistDef, i: number, ally: Ally, cx: number, cz: number) {
    let dx = cx - ally.x, dz = cz - ally.z;
    let d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = 0; dz = 1; d = 1; }
    const ux = dx / d, uz = dz / d;
    // höchstens 14 m Sturmlauf: weiter weg „springt“ der Offizier mit einem Nachbild an den Anfang
    const run = Math.min(14, Math.max(0, d - 1.4));
    const ax = cx - ux * (run + 1.4), az = cz - uz * (run + 1.4);
    const bx = cx - ux * 1.4, bz = cz - uz * 1.4;
    const vfx = this.host.vfx, fx = this.host.fx, b = fx.brush;
    if (d - 1.4 > 14) vfx.silhouette(ally.x, ally.y, ally.z, Math.atan2(ux, uz), COL[i], 0.4);
    const d0 = def.windup, d1 = def.windup + 0.3;
    ally.performAssist('Melee_Block_Attack', 0.95, cx, cz, { ax, az, bx, bz, d0, d1 }, 1.15);
    // Windspur entlang des Wegs: aufgerichtete Druckringe und ein Band aus hellem Wind
    const yaw = Math.atan2(ux, uz);
    for (let k = 0; k < 4; k++) {
      const t = (k + 0.5) / 4;
      const px = ax + (bx - ax) * t, pz = az + (bz - az) * t, py = this.host.groundY(px, pz) + 1;
      vfx.pressureRing(px, py, pz, yaw, true, 1.6 + k * 0.4, ACC[i], 0.3);
    }
    const my = this.host.groundY((ax + bx) / 2, (az + bz) / 2) + 1;
    b.reset().at((ax + bx) / 2, my, (az + bz) / 2).rot(yaw, -1).size(1, 1, run * 0.3 + 1, 2.2, 1, run * 0.55 + 2).span(0.45, d0).col(COL[i], 1.8).fade(0.02, 0.6);
    fx.emit('sickle');
    vfx.burst('dust', ax, this.host.groundY(ax, az) + 0.2, az, 6, 3, TMP.setRGB(0.55, 0.5, 0.42), { up: 1, size: 1.2, life: 0.7, delay: d0 });
    this.host.sound('windHowl', 0.6, ally.x, ally.y, ally.z);
    this.schedule(d1 + 0.02, 1, cx, cz, ally, ux, uz);
  }

  /** Schildstoß: Druckwelle nach vorn, aufsteigende Spirale, alles in der Fläche fliegt hoch; die Sturm-Verfolgung öffnet sich */
  private impactOrkan(def: AssistDef, i: number, p: Pending) {
    const gy = this.host.groundY(p.x, p.z);
    const vfx = this.host.vfx, fx = this.host.fx, b = fx.brush;
    const yaw = Math.atan2(p.dirX, p.dirZ);
    vfx.pressureRing(p.x, gy + 1.1, p.z, yaw, true, 5.5, COL[i], 0.45);
    vfx.pressureRing(p.x, gy + 0.3, p.z, 0, false, def.radius * 1.4, ACC[i], 0.5);
    vfx.spiral(p.x, gy, p.z, 2.4, 7.5, COL[i], 0.8, 3, 9);
    vfx.surfaceHit(p.x, gy, p.z, 3.2, COL[i], 1.3);
    vfx.burst('spark', p.x, gy + 1, p.z, 14, 12, ACC[i], { up: 8, size: 0.45 });
    b.reset().at(p.x, gy + 1.2, p.z).size(0.8, 0.8, 0.8, 4.4, 4.4, 4.4).span(0.28).col(WHITE, 2.4).fade(0.01, 0.7);
    fx.emit('orb');
    this.host.sound('clash', 0.8, p.x, gy, p.z);
    this.host.sound('heavy', 0.7, p.x, gy, p.z);
    this.host.shake(0.55);
    const atk = this.host.atk();
    let launched = 0;
    for (const e of this.host.foes()) {
      if (!e.alive) continue;
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
      if (d > def.radius + e.radius) continue;
      const l = d || 1;
      const r = this.host.hit(e, { dmg: assistDamage(def, atk), poise: def.poise, knock: def.knock, launch: def.launch, juggle: 0, airHold: def.airHold, fling: 0, dirX: d > 0.3 ? dx / l : p.dirX, dirZ: d > 0.3 ? dz / l : p.dirZ, color: def.color, element: 'wind', srcId: p.ally?.entityId });
      if (r) { this.stats.hits++; if (e.state === 'air') launched++; }
    }
    for (const q of this.host.foeSquads()) {
      if (!q.alive || Math.hypot(q.x - p.x, q.z - p.z) > def.radius + 2) continue;
      if (this.host.hit(q, { dmg: assistDamage(def, atk), poise: 0, knock: 0, launch: def.launch, juggle: 0, airHold: 0, fling: def.fling, dirX: p.dirX, dirZ: p.dirZ, color: def.color, element: 'wind', srcId: p.ally?.entityId })) { this.stats.hits++; launched++; }
    }
    this.stats.launched += launched;
    if (def.chase) {
      this.host.openChase();
      if (launched > 0) this.host.overlay?.number(V.set(p.x, gy + 3.2, p.z), 'Sturm-Verfolgung bereit!', 'info');
    }
  }

  // ---------- 3. Sturmhorn-Sammeln ----------

  private castHorn(def: AssistDef, i: number, ally: Ally, px: number, pz: number) {
    ally.performAssist('Ranged_Magic_Raise', 1.25, px, pz, null, 1);
    const vfx = this.host.vfx, fx = this.host.fx, b = fx.brush;
    const ay = ally.y;
    // Horn ruft: drei goldene Schallringe laufen über das Schlachtfeld, ein Lichtkranz am Offizier, Noten-Glut steigt auf
    for (let k = 0; k < 3; k++) {
      b.reset().at(ally.x, ay + 0.4 + k * 0.3, ally.z).size(1, 1, 1, def.radius * (0.8 + k * 0.25), 1, def.radius * (0.8 + k * 0.25)).span(0.9, def.windup + k * 0.16).col(k === 1 ? ACC[i] : COL[i], 2).fade(0.02, 0.6).spin(0.6);
      fx.emit('ring');
    }
    vfx.pressureRing(ally.x, ay + 1.6, ally.z, 0, false, 6, COL[i], 0.5);
    vfx.corona(ally.x, ay + 1.7, ally.z, 0, 1.6, COL[i], ACC[i], 0.9);
    vfx.burst('ember', ally.x, ay + 1.8, ally.z, 18, 5, COL[i], { up: 5, size: 0.4, spread: 1.5, delay: def.windup });
    this.host.combatFx?.sigil(V.set(ally.x, ay + 0.05, ally.z), 4.6, def.color, 1.4);
    this.host.sound('horn', 0.9, ally.x, ay, ally.z);
    this.schedule(def.windup, 2, ally.x, ally.z, ally);
  }

  private impactHorn(def: AssistDef, i: number, p: Pending) {
    const pl = this.host.player();
    const vfx = this.host.vfx, fx = this.host.fx, b = fx.brush;
    const ov = this.host.overlay;
    if (pl && Math.hypot(pl.x - p.x, pl.z - p.z) <= 40) {
      const hp = this.host.heal(def.heal);
      this.stats.healed += hp;
      this.host.addWill(def.will);
      // goldene Lichtsäule auf dir, Heil-Spirale, Funken
      b.reset().at(pl.x, pl.y, pl.z).size(0.3, 9, 0.3, 1.2, 9, 1.2).span(0.7).col(COL[i], 1.6).fade(0.05, 0.6);
      fx.emit('column');
      vfx.spiral(pl.x, pl.y, pl.z, 1.1, 2.6, HEAL, 0.8, 2, 6);
      vfx.burst('ember', pl.x, pl.y + 1, pl.z, 12, 3, HEAL, { up: 3, size: 0.3, spread: 0.8 });
      if (hp > 0) ov?.number(V.set(pl.x, pl.y + 2.2, pl.z), `+${Math.round(hp)}`, 'heal');
      ov?.number(V.set(pl.x, pl.y + 2.9, pl.z), `Willenskraft +${def.will}`, 'info');
    }
    // eigene Trupps: Stärkung und etwas Heilung; Offiziere: Heilung (K.O. stehen wieder auf) und Schadensbonus
    let n = 0;
    const R = def.rally;
    if (R) for (const q of this.host.squads()) {
      if (!q.present || Math.hypot(q.x - p.x, q.z - p.z) > 45) continue;
      q.rally(R.dur, R.dmg, R.taken, R.speed, R.heal);
      vfx.burst('ember', q.x, q.y + 1.4, q.z, 6, 3, COL[i], { up: 3, size: 0.3, spread: 2 });
      n++;
    }
    for (const a of this.host.officers()) {
      if (Math.hypot(a.x - p.x, a.z - p.z) > 45) continue;
      a.revive(def.allyHeal);
      a.hp = Math.min(a.maxHp, a.hp + a.maxHp * def.allyHeal);
      a.buff = Math.max(a.buff, def.allyBuff);
    }
    this.host.rallyPlayers?.(p.x, p.z, def.heal, def.will);
    this.stats.rallied += n;
    if (n > 0) ov?.number(V.set(p.x, this.host.groundY(p.x, p.z) + 3, p.z), `${n} Trupp${n > 1 ? 's' : ''} gestärkt!`, 'info');
  }

  /** Je Logikschritt (Spielzeit): Abklingzeiten, Zeitachse der Einschläge */
  update(dt: number) {
    stepAssists(this.state, dt);
    for (const p of this.pend) {
      if (!p.on) continue;
      p.t -= dt;
      if (p.t > 0) continue;
      p.on = false;
      const i = p.kind;
      const def = OFFICER_ASSISTS[i];
      if (p.kind === 0) this.impactSalvo(def, i, p);
      else if (p.kind === 1) this.impactOrkan(def, i, p);
      else this.impactHorn(def, i, p);
      p.ally = null;
    }
  }

  /** Landgang endet, Raid wechselt: laufende Einschläge verwerfen (Abklingzeiten bleiben) */
  clear() { for (const p of this.pend) { p.on = false; p.ally = null; } }
}
