// Die dreiphasige Kaiser-Schlacht (Phase 4.5D) als reine Regeln ohne three.js (JSON-tauglich, testbar). world/kaiserLive.ts setzt sie in der offenen
// Welt um (Wachflotte, Ketten-Bastionen, Hafenkette, Verbände, Kaiser), core/game.ts vergibt den Lohn.
//
//   Phase 1 · Kaiserliche Seesperre: eine Wachflotte aus Stufe-5-Kriegsschiffen (Rammsporn, Drehbassen) kreuzt vor der Bucht, zwei Ketten-Bastionen
//             im Wasser halten die Hafenkette. Erst wenn beide Bastionen gefallen sind, sinkt die Kette – die Bucht ist offen, man darf anlanden.
//   Phase 2 · Doppelter Festungsring: große Wachverbände (TroopSquad-Horden) und je zwei Elite-Offiziere halten die Tore beider Ringe.
//   Phase 3 · Der Kaiser im Hof der Thron-Zitadelle (erst, wenn beide Ringe geräumt sind): zwei Phasen; bei 50 % ruft er eine Verstärkungswelle und
//             greift mit Auren an. Kein Treffer nimmt ihm mehr als `KAISER.bossHitCap` seiner Lebenspunkte (Anti-One-Shot, data/balanceConfig.ts).
//             Nach dem Sieg ruht die Zitadelle 45 Minuten Spielzeit (im Spielstand gesichert), dann stehen Flotte, Bastionen und Garde wieder.
import { KAISER_BOSS_HIT_CAP } from './balanceConfig';
import { KAISER_IDS, KAISER_LEVEL, KAISER_SPEC_BY_ID, isKaiserId, type KaiserId } from './kaiserIslands';
import type { GoodId } from './economy';
import type { PowerId } from './factions';
import { EA, type EnemyDef } from './combat';
import { RAID_BOSSES, captainDef } from '../raid/raidBosses';

export const KAISER = {
  /** Ruhezeit nach dem Sieg über den Kaiser (Spielzeit, s): 45 Minuten */
  cooldown: 2700,
  /** Lebenspunkte je Ketten-Bastion (Kanonenkugeln des Spielers und seiner Flotte) */
  bastionHp: 5200,
  /** Wachschiffe der Seesperre */
  guards: 6,
  /** Ab diesem Abstand zur Inselmitte zieht die Seesperre auf, ab diesem verschwindet sie wieder (m) */
  wakeDist: 2600,
  sleepDist: 3400,
  /** Bastionen: Reichweite, Nachladezeit (s) und Schaden je Kugel */
  battery: { range: 560, reload: 4.2, dmg: 70 },
  /** Ein Treffer nimmt dem Kaiser höchstens diesen Anteil seiner Lebenspunkte */
  bossHitCap: KAISER_BOSS_HIT_CAP,
  /** Stufen über `KAISER_LEVEL`: Ring 1, Ring 2, Offiziere, Kaiser */
  lvl: { ring1: 0, ring2: 1, officer: 2, boss: 4 },
} as const;

export type KaiserPhase = 'seesperre' | 'festungsringe' | 'thron' | 'besiegt';
export type RingState = 'ruhig' | 'aktiv' | 'geraeumt';

export interface KaiserBattleState {
  id: KaiserId;
  phase: KaiserPhase;
  /** Gefallene Wachschiffe (von `KAISER.guards`) */
  guardsDown: number;
  /** Lebenspunkte der beiden Ketten-Bastionen */
  bastions: [number, number];
  /** Die Hafenkette sperrt die Bucht, solange eine Bastion steht */
  chainUp: boolean;
  rings: [RingState, RingState];
  boss: { state: 'fern' | 'kampf' | 'besiegt'; phase: 1 | 2; reinforced: boolean };
  /** Spielzeit, ab der die Zitadelle wieder verteidigt wird (nach dem Sieg; 0 = bereit) */
  until: number;
  /** Siege über diesen Kaiser (erster Sieg: mythischer Bauplan) */
  wins: number;
}

export function newKaiserBattle(id: KaiserId, wins = 0): KaiserBattleState {
  return { id, phase: 'seesperre', guardsDown: 0, bastions: [KAISER.bastionHp, KAISER.bastionHp], chainUp: true, rings: ['ruhig', 'ruhig'], boss: { state: 'fern', phase: 1, reinforced: false }, until: 0, wins };
}

/** Uhr weiterdrehen: nach Ablauf der Ruhezeit steht die Zitadelle wieder in voller Stärke (Seesperre, Ringe, Kaiser) */
export function tickKaiser(st: KaiserBattleState, now: number): boolean {
  if (st.phase !== 'besiegt' || now < st.until) return false;
  Object.assign(st, newKaiserBattle(st.id, st.wins));
  return true;
}

/** Ein Wachschiff ist gesunken oder erobert */
export function guardDown(st: KaiserBattleState): void {
  if (st.phase === 'besiegt') return;
  st.guardsDown = Math.min(KAISER.guards, st.guardsDown + 1);
}

export interface BastionHit { destroyed: boolean; opened: boolean }

/**
 * Treffer auf eine Ketten-Bastion (Kugel des Spielers oder seiner Flotte). Fällt die zweite Bastion, sinkt die Hafenkette: Phase 2 beginnt, die Bucht
 * ist offen (`opened`).
 */
export function damageBastion(st: KaiserBattleState, i: 0 | 1, dmg: number): BastionHit {
  const res = { destroyed: false, opened: false };
  if (st.phase !== 'seesperre' || st.bastions[i] <= 0 || !(dmg > 0)) return res;
  st.bastions[i] = Math.max(0, st.bastions[i] - dmg);
  if (st.bastions[i] > 0) return res;
  res.destroyed = true;
  if (st.bastions[0] <= 0 && st.bastions[1] <= 0) {
    st.chainUp = false;
    st.phase = 'festungsringe';
    res.opened = true;
  }
  return res;
}

/** Darf man anlanden? Nicht, solange die Hafenkette die Bucht sperrt */
export function canLand(st: KaiserBattleState | null | undefined): boolean {
  return !st || !st.chainUp;
}

/** Ein Festungsring wird betreten: seine Verbände ziehen auf (einmal; ein geräumter Ring bleibt bis zur Rückkehr der Zitadelle leer) */
export function enterRing(st: KaiserBattleState, ring: 0 | 1): boolean {
  if (st.phase !== 'festungsringe' && st.phase !== 'thron') return false;
  if (st.rings[ring] !== 'ruhig') return false;
  st.rings[ring] = 'aktiv';
  return true;
}

/** Alle Verbände und Offiziere eines Rings sind gefallen. Sind beide Ringe geräumt, wartet der Kaiser im Thronsaal (Phase 3) */
export function clearRing(st: KaiserBattleState, ring: 0 | 1): boolean {
  if (st.rings[ring] !== 'aktiv') return false;
  st.rings[ring] = 'geraeumt';
  if (st.rings[0] === 'geraeumt' && st.rings[1] === 'geraeumt' && st.phase === 'festungsringe') st.phase = 'thron';
  return true;
}

/** Zurück an Bord, ohne den Ring zu räumen: seine Verbände ziehen sich zurück und stehen beim nächsten Landgang wieder */
export function retreatRings(st: KaiserBattleState): void {
  for (let i = 0; i < 2; i++) if (st.rings[i] === 'aktiv') st.rings[i] = 'ruhig';
  if (st.boss.state === 'kampf') st.boss = { state: 'fern', phase: 1, reinforced: false };
}

/** Erscheint der Kaiser? Nur in Phase 3 (beide Ringe geräumt) und nur einmal je Kampf */
export function bossShouldAppear(st: KaiserBattleState): boolean {
  return st.phase === 'thron' && st.boss.state === 'fern';
}

export function bossAppeared(st: KaiserBattleState): void {
  st.boss = { state: 'kampf', phase: 1, reinforced: false };
}

/** Phasenwechsel des Kaisers (bei 50 %): liefert true genau beim ersten Mal – dann rufen Verstärkungswelle und Auren */
export function bossPhase(st: KaiserBattleState, phase: number): boolean {
  if (st.boss.state !== 'kampf' || phase < 2) return false;
  st.boss.phase = 2;
  if (st.boss.reinforced) return false;
  st.boss.reinforced = true;
  return true;
}

/** Der Kaiser ist gefallen: Sieg, die Zitadelle ruht `KAISER.cooldown` Sekunden. Liefert true beim ersten Sieg über diesen Kaiser */
export function bossDefeated(st: KaiserBattleState, now: number): boolean {
  if (st.boss.state !== 'kampf') return false;
  st.boss = { state: 'besiegt', phase: 2, reinforced: true };
  st.phase = 'besiegt';
  st.until = now + KAISER.cooldown;
  st.wins++;
  return st.wins === 1;
}

/** Sekunden bis zur Rückkehr der Zitadelle (0 = bereit) */
export const kaiserCooldownLeft = (st: KaiserBattleState | null | undefined, now: number): number => (st && st.phase === 'besiegt' ? Math.max(0, Math.round(st.until - now)) : 0);

// ---------- Spielstand ----------

/**
 * Kaiser-Zitadellen im Spielstand (`world.kaiser`, Version 21 bleibt): je Kaiser die verbleibende Ruhezeit (s, relativ, weil die Weltuhr beim Laden neu
 * beginnt) und die Zahl der Siege. Fehlt das Feld (ältere Stände), stehen alle fünf unentdeckt und in voller Stärke.
 */
export type KaiserSaveState = Partial<Record<KaiserId, { cd: number; wins: number }>>;

export function kaiserToSave(states: Iterable<KaiserBattleState>, now: number): KaiserSaveState {
  const out: KaiserSaveState = {};
  for (const st of states) {
    const cd = kaiserCooldownLeft(st, now);
    if (cd > 0 || st.wins > 0) out[st.id] = { cd, wins: st.wins };
  }
  return out;
}

export function cleanKaiserSave(x: unknown): KaiserSaveState {
  const out: KaiserSaveState = {};
  if (!x || typeof x !== 'object') return out;
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (!isKaiserId(k) || !v || typeof v !== 'object') continue;
    const r = v as { cd?: unknown; wins?: unknown };
    const num = (q: unknown, max: number) => (typeof q === 'number' && Number.isFinite(q) ? Math.max(0, Math.min(max, Math.round(q))) : 0);
    const cd = num(r.cd, KAISER.cooldown), wins = num(r.wins, 9999);
    if (cd > 0 || wins > 0) out[k] = { cd, wins };
  }
  return out;
}

/** Laufzeit-Zustände aus dem Spielstand: besiegte Kaiser ruhen weiter, die Siege bleiben gezählt */
export function kaiserFromSave(saved: KaiserSaveState | null | undefined, now: number): KaiserBattleState[] {
  const out: KaiserBattleState[] = [];
  for (const [k, v] of Object.entries(cleanKaiserSave(saved))) {
    const st = newKaiserBattle(k as KaiserId, v!.wins);
    if (v!.cd > 0) { st.phase = 'besiegt'; st.until = now + v!.cd; st.chainUp = false; st.bastions = [0, 0]; st.rings = ['geraeumt', 'geraeumt']; st.boss = { state: 'besiegt', phase: 2, reinforced: true }; }
    out.push(st);
  }
  return out;
}

// ---------- Kaiser und Garde-Offiziere ----------

/** Farbe und Name der Aura je Kaiser */
const KAISER_AURA: Record<KaiserId, { label: string; color: string }> = {
  britannia: { label: 'Kronen-Aura', color: '#9EC8FF' },
  batavia: { label: 'Gold-Aura', color: '#FFC94A' },
  kaiserdom: { label: 'Eisen-Aura', color: '#C8CCD4' },
  solis: { label: 'Sonnen-Aura', color: '#FFE38A' },
  tenkoku: { label: 'Glut-Aura', color: '#FF6A3C' },
};

/**
 * Werte des Kaisers: der Endboss seiner Macht (raid/raidBosses.ts) als Vorlage, deutlich zäher und härter, zwei Phasen (Wechsel bei 50 %), in Phase 2
 * dazu Aura-Angriffe (Schockringe um ihn); die Aura stärkt die Garde im Umkreis. Anti-One-Shot: `KAISER.bossHitCap` je Treffer.
 */
export function kaiserBossDef(id: KaiserId): EnemyDef {
  const k = KAISER_SPEC_BY_ID[id], base = RAID_BOSSES[k.power].def, au = KAISER_AURA[id];
  const auraBurst = EA({
    label: `${au.label}!`, clip: 'Ranged_Magic_Raise', speed: 1.05, windup: 1.05, range: 22, arc: 6.3, dmg: 1.2, knock: 11, fx: 'magic',
    zones: [{ shape: 'circle', size: 5, prop: 'rune' }, { shape: 'ring', size: 10.5, inner: 5, extra: 0.55 }, { shape: 'ring', size: 16, inner: 10.5, extra: 1.1 }],
  });
  const auraField = EA({
    label: `${au.label}: Kaiserlicher Bann`, clip: 'Ranged_Magic_Raise', speed: 1.0, windup: 1.15, range: 26, arc: 6.3, dmg: 1.05, knock: 8, fx: 'magic',
    zones: [{ shape: 'circle', size: 3.6, at: 'allies', extra: 1.4, prop: 'rune' }, { shape: 'circle', size: 3.4, at: 'scatter', count: 6, scatter: 12, stagger: 0.22, extra: 1.6, prop: 'rune' }],
  });
  return {
    ...base, label: k.boss.name, title: k.boss.title, hp: Math.round(base.hp * 1.75), dmg: base.dmg * 1.12, poise: base.poise + 90, scale: base.scale * 1.1, radius: base.radius * 1.05,
    xp: 2400, gold: [1600, 2400], raid: 'boss', hitCap: KAISER.bossHitCap, phaseAt: [0.5, -1], phases: 2, armor: Math.min(0.4, (base.armor ?? 0.2) + 0.06),
    aura: { id: `kaiser_${id}`, label: au.label, radius: 18, color: au.color, dmg: 1.15, taken: 0.85 },
    phaseAttacks: { 2: [...(base.phaseAttacks?.[2] ?? base.attacks), auraBurst, auraField] },
  };
}

/** Elite-Offizier der Kaisergarde: Hauptmann der Macht (Aura, schwere Rüstung), noch einmal zäher */
export function kaiserOfficerDef(id: KaiserId, index: number): EnemyDef {
  const base = captainDef(KAISER_SPEC_BY_ID[id].power, index);
  return { ...base, label: `${base.label} der Kaisergarde`, hp: Math.round(base.hp * 1.35), dmg: base.dmg * 1.08, xp: 260 };
}

// ---------- Lohn ----------

export interface KaiserLoot {
  gold: number; xp: number; fame: number;
  goods: { good: GoodId; units: number }[];
  /** Kaiser-Siegel (neue Währung der Kaiser-Stufe) und Boss-Siegel der Macht */
  kaiserSeals: number;
  seals: { power: PowerId; n: number };
  shards: number;
  /** Mythischer Bauplan (erster Sieg) oder ein Kaiser-Relikt (jeder weitere) */
  relic: { id: string; name: string; info: string; first: boolean };
  warlord: boolean;
}

/** Lohn des Siegs über einen Kaiser: weit über dem eines Insel-Kommandanten; `rnd` = Zufall 0 … 1 */
export function rollKaiserLoot(id: KaiserId, first: boolean, rnd: () => number): KaiserLoot {
  const k = KAISER_SPEC_BY_ID[id];
  const lv = KAISER_LEVEL + KAISER.lvl.boss;
  return {
    gold: Math.round(6000 + lv * 160 + rnd() * 1500) + (first ? 4000 : 0),
    xp: 2400 + lv * 60,
    fame: 300 + (first ? 200 : 0),
    goods: k.goods.map((g) => ({ good: g, units: 6 + Math.floor(rnd() * 4) })),
    kaiserSeals: first ? 3 : 1,
    seals: { power: k.power, n: first ? 3 : 2 },
    shards: 4 + Math.floor(rnd() * 4),
    relic: first ? { ...k.relic, first: true } : { id: `relikt_${id}`, name: `Kaiser-Relikt von ${k.name.replace(/^.*?(Britannia|Batavia|Kaiserdom|Solis|Tenkoku)$/, '$1')}`, info: 'Ein Bruchstück der Kaiserkrone – Sammlerstück und Währung der Kaiser-Schmiede.', first: false },
    warlord: true,
  };
}

/** Alle Kaiser in fester Reihenfolge (Karte, Tests) */
export const KAISER_ORDER = KAISER_IDS;
